import { useRef, useState } from 'react';

export const useCamera = () => {
  const camera = useRef({ x: 0, y: 0, zoom: 1 });
  const targetZoom = useRef(1);
  const [zoomIndicator, setZoomIndicator] = useState({ value: 1.0, visible: false });
  const autoFollow = useRef<string | false>('hero');

  return { camera, targetZoom, zoomIndicator, setZoomIndicator, autoFollow };
};
