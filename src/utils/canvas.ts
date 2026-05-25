export let cachedRedHatchCanvas: HTMLCanvasElement | null = null;
export const hatchCanvasCache: Record<string, HTMLCanvasElement> = {};

export function getHatchCanvas(color: string): HTMLCanvasElement {
  if (!hatchCanvasCache[color]) {
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 16; pCanvas.height = 16;
    const pCtx = pCanvas.getContext('2d')!;
    pCtx.strokeStyle = color; pCtx.lineWidth = 2;
    pCtx.beginPath(); pCtx.moveTo(0, 16); pCtx.lineTo(16, 0); pCtx.stroke();
    hatchCanvasCache[color] = pCanvas;
  }
  return hatchCanvasCache[color];
}

export function getRedHatchCanvas(): HTMLCanvasElement {
  if (!cachedRedHatchCanvas) {
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 12; pCanvas.height = 12;
    const pCtx = pCanvas.getContext('2d');
    if (pCtx) {
      pCtx.strokeStyle = '#ef4444'; pCtx.lineWidth = 1;
      pCtx.beginPath(); pCtx.moveTo(0, 0); pCtx.lineTo(12, 12); pCtx.moveTo(12, 0); pCtx.lineTo(0, 12); pCtx.stroke();
    }
    cachedRedHatchCanvas = pCanvas;
  }
  return cachedRedHatchCanvas;
}

export function drawTextAlongArc(ctx: CanvasRenderingContext2D, str: string, centerX: number, centerY: number, radius: number, angle: number) {
  ctx.save(); ctx.translate(centerX, centerY); ctx.rotate(angle);
  const metric = ctx.measureText(str), totalAngle = metric.width / radius;
  ctx.rotate(-totalAngle / 2);
  for (let i = 0; i < str.length; i++) {
    const char = str[i], charMetric = ctx.measureText(char), charAngle = charMetric.width / radius;
    ctx.rotate(charAngle / 2); ctx.fillText(char, 0, -radius); ctx.rotate(charAngle / 2);
  }
  ctx.restore();
}
