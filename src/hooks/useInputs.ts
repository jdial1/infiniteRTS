import { useEffect, useRef } from 'react';

export const useInputs = () => {
  const keys = useRef<Record<string, boolean>>({});
  const mouse = useRef({ x: 0, y: 0, screenX: 0, screenY: 0, isDown: false });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => keys.current[e.key] = true;
    const handleKeyUp = (e: KeyboardEvent) => keys.current[e.key] = false;
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return { keys, mouse };
};
