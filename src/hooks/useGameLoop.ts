import { useEffect } from 'react';
import { GameState, Player } from '../types';
import { drawResource, drawBuilding, drawUnit } from '../utils/rendering';

export const useGameLoop = (
    canvasRef: React.RefObject<HTMLCanvasElement | null>,
    gameState: GameState | null,
    player: Player | null
) => {
    useEffect(() => {
        if (!canvasRef.current || !gameState) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d')!;

        let animFrame: number;
        const loop = () => {
            ctx.fillStyle = '#08101a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            if (gameState.resources) Object.values(gameState.resources).forEach(r => drawResource(ctx, r));
            if (gameState.buildings) Object.values(gameState.buildings).forEach(b => drawBuilding(ctx, b, gameState.players));
            if (gameState.units) Object.values(gameState.units).forEach(u => drawUnit(ctx, u, gameState.players));

            animFrame = requestAnimationFrame(loop);
        };
        animFrame = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(animFrame);
    }, [gameState, canvasRef, player]);
};
