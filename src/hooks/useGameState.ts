import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { GameState, Player } from '../types';

export const useGameState = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [inventory, setInventory] = useState({ wood: 0, stone: 0, gold: 0 });

  useEffect(() => {
    let userId = localStorage.getItem('render_game_user_id');
    if (!userId) {
      userId = crypto.randomUUID();
      localStorage.setItem('render_game_user_id', userId);
    }

    const s = io('/', {
      path: '/socket.io',
      auth: { userId }
    });
    setSocket(s);

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));

    s.on('init', (initialState: GameState) => {
      setGameState(initialState);
      const me = initialState.players[userId as string];
      if (me) {
        setPlayer(me);
        setInventory(me.inventory);
      }
    });

    s.on('game_state_update', (update: Partial<GameState>) => {
      setGameState(prev => prev ? { ...prev, ...update } : null);
    });

    s.on('inventory_updated', (inv: any) => {
      setInventory(inv);
    });

    return () => {
      s.disconnect();
    };
  }, []);

  return { socket, connected, gameState, player, inventory };
};
