import { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';

// Collection rates used to be estimated here from inventory changes; the server now reports
// them per depot (the 'rates' event), so the numbers on screen are the numbers it measured.
export function useGameEngine() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [isOffline, setIsOffline] = useState(!window.navigator.onLine);

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

  return { socket, setSocket, connected, setConnected, isOffline };
}
