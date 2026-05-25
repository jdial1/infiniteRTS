import React from 'react';
import { Player, Building, ResourceNode } from '../types';
import { icons, buildings } from '../../data';
import { DynamicIcon } from '../utils/icons';

interface ActionPanelProps {
  selectedBuilding: Building | null;
  player: Player;
  autoAssign: boolean;
  setAutoAssign: (val: boolean) => void;
  onTrainMiner: (buildingId: string) => void;
  onUpgrade: (upgradeId: string) => void;
  hasBase: boolean;
}

export const ActionPanel: React.FC<ActionPanelProps> = ({
  selectedBuilding,
  player,
  autoAssign,
  setAutoAssign,
  onTrainMiner,
  onUpgrade,
  hasBase
}) => {
  if (!selectedBuilding) return null;

  return (
    <div className="absolute bottom-2 sm:bottom-4 left-1/2 -translate-x-1/2 w-[96vw] sm:w-[92vw] sm:max-w-md z-25 flex flex-col gap-2 pointer-events-none select-none">
      <div className="w-full metallic-panel p-3 pointer-events-auto flex flex-col max-h-[46vh] overflow-y-auto">
        {selectedBuilding.type === 'base' && (
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center border-b-2 border-zinc-700 pb-1.5">
              <div className="flex items-center gap-1.5">
                <DynamicIcon name={icons.buildings.base.name} library={icons.buildings.base.library} className="text-cyan-400" size={18} />
                <h3 className="text-sm font-black uppercase tracking-tighter text-cyan-50">Command Center</h3>
              </div>
            </div>
            <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold uppercase text-zinc-400">Auto-Assign Miners</span>
                    <button
                        onClick={() => setAutoAssign(!autoAssign)}
                        className={`relative inline-flex h-5.5 w-10 shrink-0 border-2 border-transparent transition-colors duration-200 ease-in-out ${autoAssign ? 'bg-cyan-600' : 'bg-zinc-800'}`}
                    >
                        <span className={`pointer-events-none inline-block h-4 w-4 transform bg-white shadow ring-0 transition duration-200 ease-in-out ${autoAssign ? 'translate-x-4.5' : 'translate-x-0'}`} />
                    </button>
                </div>
                <button
                    onClick={() => onTrainMiner(selectedBuilding.id)}
                    className="metallic-button py-2 text-xs font-bold uppercase tracking-wider"
                >
                    Train Miner (100 Carbon)
                </button>
            </div>
          </div>
        )}
        {/* Add other building types here if needed */}
      </div>
    </div>
  );
};
