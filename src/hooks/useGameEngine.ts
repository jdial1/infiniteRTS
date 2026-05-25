import { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { store } from '../store/gameStore';

export function useGameEngine(inventory: { wood: number; stone: number; gold: number }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [isOffline, setIsOffline] = useState(!window.navigator.onLine);
  const prevInventory = useRef({ wood: 0, stone: 0, gold: 0 });
  const collectionHistory = useRef<{ time: number; type: 'wood' | 'stone' | 'gold'; amount: number }[]>([]);
  const gameStartTime = useRef(Date.now());
  const hasLoadedInitialInventory = useRef(false);
  const lastMeId = useRef<string | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (store.me?.id !== lastMeId.current) {
    hasLoadedInitialInventory.current = false;
    lastMeId.current = store.me?.id || null;
  }

  useEffect(() => {
    if (!store.me) { prevInventory.current = { ...inventory }; return; }
    if (!hasLoadedInitialInventory.current) {
      const meInv = store.me.inventory;
      if (inventory.wood === meInv.wood && inventory.stone === meInv.stone && inventory.gold === meInv.gold) {
        prevInventory.current = { ...inventory };
        hasLoadedInitialInventory.current = true;
        gameStartTime.current = Date.now();
      }
      return;
    }
    const now = Date.now(), diffWood = inventory.wood - prevInventory.current.wood, diffStone = inventory.stone - prevInventory.current.stone, diffGold = inventory.gold - prevInventory.current.gold;
    if (diffWood > 0) collectionHistory.current.push({ time: now, type: 'wood', amount: diffWood });
    if (diffStone > 0) collectionHistory.current.push({ time: now, type: 'stone', amount: diffStone });
    if (diffGold > 0) collectionHistory.current.push({ time: now, type: 'gold', amount: diffGold });
    prevInventory.current = { ...inventory };
  }, [inventory]);

  const calculateRates = () => {
    const now = Date.now(), windowMs = 45000, windowStart = now - windowMs;
    collectionHistory.current = collectionHistory.current.filter(item => item.time >= windowStart);
    let totalWood = 0, totalStone = 0, totalGold = 0;
    for (const item of collectionHistory.current) {
      if (item.type === 'wood') totalWood += item.amount;
      else if (item.type === 'stone') totalStone += item.amount;
      else if (item.type === 'gold') totalGold += item.amount;
    }
    const timeElapsedMs = Math.min(windowMs, now - gameStartTime.current), timeElapsedSeconds = Math.max(10, timeElapsedMs / 1000), scaleFactor = 60 / timeElapsedSeconds;
    return { wood: Math.round(totalWood * scaleFactor), stone: Math.round(totalStone * scaleFactor), gold: Math.round(totalGold * scaleFactor) };
  };

  return { socket, setSocket, connected, setConnected, isOffline, calculateRates };
}
