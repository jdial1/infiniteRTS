import React, { useState, useRef, useEffect } from 'react';
import { useGameState } from './hooks/useGameState';
import { useInputs } from './hooks/useInputs';
import { useCamera } from './hooks/useCamera';
import { useGameLoop } from './hooks/useGameLoop';
import { Menu } from './components/Menu';
import { HUD } from './components/HUD';
import { ActionPanel } from './components/ActionPanel';
import { Minimap } from './components/Minimap';
import { TraitSelector } from './components/TraitSelector';
import { CombatLogs } from './components/CombatLogs';
import { Building } from './types';

export default function App() {
  const { socket, connected, gameState, player, inventory } = useGameState();
  const { keys, mouse } = useInputs();
  const { camera, targetZoom, zoomIndicator, setZoomIndicator, autoFollow } = useCamera();
  const [showMenu, setShowMenu] = useState(true);
  const [selectedTraits, setSelectedTraits] = useState<string[]>([]);
  const [autoAssign, setAutoAssign] = useState(true);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [combatLogs, setCombatLogs] = useState<any[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const version = "__APP_VERSION__";

  // Initialize game loop hook
  useGameLoop(canvasRef, gameState, player);

  useEffect(() => {
    if (!socket) return;
    socket.on('combat_event', (event: any) => {
        setCombatLogs(prev => [...prev, { ...event, id: Math.random().toString(), time: Date.now() }]);
    });
    return () => { socket.off('combat_event'); };
  }, [socket]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCombatLogs(logs => logs.filter(l => Date.now() - l.time < 5000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = () => setShowMenu(false);

  return (
    <div className="fixed inset-0 w-screen h-dvh overflow-hidden bg-gray-900 select-none text-slate-100">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      
      {showMenu && (
        <Menu
          onStart={handleStart}
          isConnecting={!connected}
          error={null}
          version={version}
        />
      )}

      {!showMenu && player && (
        <>
          <HUD player={player} isOffline={!connected} />
          <CombatLogs logs={combatLogs} />
          <ActionPanel
            selectedBuilding={selectedBuilding}
            player={player}
            autoAssign={autoAssign}
            setAutoAssign={setAutoAssign}
            onTrainMiner={(id) => socket?.emit('train_unit', { type: 'miner', buildingId: id })}
            onUpgrade={(id) => socket?.emit('purchase_upgrade', { upgradeId: id })}
            hasBase={true}
          />
          {gameState && <Minimap gameState={gameState} player={player} mapSettings={{x:0, y:0, zoom:1}} />}
          
          {player.traits.length === 0 && (
            <TraitSelector
              selectedTraits={selectedTraits}
              setSelectedTraits={setSelectedTraits}
              onConfirm={() => socket?.emit('select_traits', selectedTraits)}
            />
          )}
        </>
      )}
    </div>
  );
}
