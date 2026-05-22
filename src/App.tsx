import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { GameState, Player, ResourceNode, Building, MapZone } from './types';
import * as GiIcons from 'react-icons/gi';
import * as LucideIcons from 'lucide-react';

import { renderToString } from 'react-dom/server';

import { constants, buildings, upgrades, icons } from '../data';

// Helper to get icon component by name and library
const getIconComponent = (name: string, library: string) => {
  if (library === 'gi') return (GiIcons as any)[name];
  if (library === 'lucide') return (LucideIcons as any)[name];
  return null;
};

const getMascot = (traits: string[]) => {
  if (!traits || traits.length < 2) return null;
  const sorted = [...traits].sort();
  if (sorted.includes('speed') && sorted.includes('strength')) return icons.mascots.speed_strength;
  if (sorted.includes('speed') && sorted.includes('cost')) return icons.mascots.speed_cost;
  if (sorted.includes('strength') && sorted.includes('cost')) return icons.mascots.strength_cost;
  return null;
};

const DynamicIcon = ({ name, library, ...props }: { name: string; library: string; [key: string]: any }) => {
  const Icon = getIconComponent(name, library);
  return Icon ? <Icon {...props} /> : null;
};

function createIconImage(Icon: any, color: string): HTMLImageElement {
  const svgString = renderToString(<Icon color={color} size={32} />);
  const withXmlns = svgString.includes('xmlns') ? svgString : svgString.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  const encoded = encodeURIComponent(withXmlns);
  const dataUri = `data:image/svg+xml;charset=utf-8,${encoded}`;
  const img = new Image();
  img.src = dataUri;
  return img;
}

const woodIconImg = createIconImage(getIconComponent(icons.resources.wood.name, icons.resources.wood.library), icons.resources.wood.color);
const stoneIconImg = createIconImage(getIconComponent(icons.resources.stone.name, icons.resources.stone.library), icons.resources.stone.color);
const goldIconImg = createIconImage(getIconComponent(icons.resources.gold.name, icons.resources.gold.library), icons.resources.gold.color);

const baseIconWhite = createIconImage(getIconComponent(icons.buildings.base.name, icons.buildings.base.library), icons.buildings.base.color);
const wallIconWhite = createIconImage(getIconComponent(icons.buildings.wall.name, icons.buildings.wall.library), icons.buildings.wall.color);
const turretIconWhite = createIconImage(getIconComponent(icons.buildings.turret.name, icons.buildings.turret.library), icons.buildings.turret.color);
const minerIconWhite = createIconImage(getIconComponent(icons.buildings.miner.name, icons.buildings.miner.library), icons.buildings.miner.color);

let cachedRedHatchCanvas: HTMLCanvasElement | null = null;
function getRedHatchCanvas(): HTMLCanvasElement {
  if (!cachedRedHatchCanvas) {
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 12;
    pCanvas.height = 12;
    const pCtx = pCanvas.getContext('2d');
    if (pCtx) {
      pCtx.strokeStyle = '#ef4444'; // Red lines for range hatch
      pCtx.lineWidth = 1;
      pCtx.beginPath();
      pCtx.moveTo(0, 0);
      pCtx.lineTo(12, 12);
      pCtx.moveTo(12, 0);
      pCtx.lineTo(0, 12);
      pCtx.stroke();
    }
    cachedRedHatchCanvas = pCanvas;
  }
  return cachedRedHatchCanvas;
}

function drawTextAlongArc(ctx: CanvasRenderingContext2D, str: string, centerX: number, centerY: number, radius: number, angle: number) {
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(angle);
  
  const metric = ctx.measureText(str);
  // Estimate angle based on width to center text
  const totalAngle = metric.width / radius;
  ctx.rotate(-totalAngle / 2);
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const charMetric = ctx.measureText(char);
    const charAngle = charMetric.width / radius;
    
    ctx.rotate(charAngle / 2);
    ctx.fillText(char, 0, -radius);
    ctx.rotate(charAngle / 2);
  }
  ctx.restore();
}

// A mutable store for fast canvas rendering without React re-renders
class GameStore {
  state: GameState | null = null;
  me: Player | null = null;
  inventory = { wood: 0, stone: 0, gold: 0 };
  combatEffects: {
    lines: { from: {x:number, y:number}, to: {x:number, y:number}, time: number, maxLifetime: number }[];
    damageTexts: { x: number, y: number, value: number, time: number, maxLifetime: number }[];
  } = { lines: [], damageTexts: [] };
}
export const store = new GameStore();

export default function App() {
  const [scene, setScene] = useState<'menu' | 'playing'>('menu');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [inventory, setInventory] = useState({ wood: 0, stone: 0, gold: 0 });
  
  // Camera state
  const camera = useRef({ x: 0, y: 0, zoom: 1 });
  const mouse = useRef({ x: 0, y: 0, screenX: 0, screenY: 0, isDown: false });
  const coordsRef = useRef<HTMLDivElement>(null);

  // Map & Move state
  const autoFollow = useRef<string | false>('hero');
  const moveTarget = useRef<{x: number, y: number} | null>(null);
  const pointerPinchStartDist = useRef<number | null>(null);
  const dragStart = useRef<{x: number, y: number} | null>(null);
  const dragLast = useRef<{x: number, y: number} | null>(null);
  const activePointers = useRef<Map<number, PointerEvent>>(new Map());

  // UI state
  const [buildMode, setBuildMode] = useState<Building['type'] | null>(null);
  const [combatLogs, setCombatLogs] = useState<{ id: string; time: number; message: string; targetX: number; targetY: number }[]>([]);

  useEffect(() => {
    // Clear old combat logs periodically
    const interval = setInterval(() => {
      setCombatLogs(logs => logs.filter(l => Date.now() - l.time < 10000));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const [mapSettings, setMapSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('rts_map_settings');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      showBuildAreaBorder: true,
      showTowerBorder: true,
      showZoneBorder: true,
      showGrid: true,
    };
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const saveMapSettings = (newSettings: any) => {
    setMapSettings(newSettings);
    try {
      localStorage.setItem('rts_map_settings', JSON.stringify(newSettings));
    } catch (e) {}
  };

  const targetZoom = useRef(1);
  const [zoomIndicator, setZoomIndicator] = useState<{ value: number; visible: boolean }>({ value: 1.0, visible: false });
  const zoomIndicatorTimer = useRef<any>(null);
  const lastTapTime = useRef(0);

  const [showMinimap, setShowMinimap] = useState(false);
  const [isBuildOpen, setIsBuildOpen] = useState(false);
  const [isWorkersOpen, setIsWorkersOpen] = useState(false);
  const [isUpgradesOpen, setIsUpgradesOpen] = useState(false);
  const [autoAssign, setAutoAssign] = useState(true);
  const lastAutoAssignTime = useRef(0);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isPlayersListOpen, setIsPlayersListOpen] = useState(false);
  const [selectedTraits, setSelectedTraits] = useState<string[]>([]);
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
  const minimapFogCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fogCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const requestedChunks = useRef(new Set<string>());
  const lastChunkUpdate = useRef(0);
  const avatarCache = useRef<Record<string, HTMLImageElement>>({});
  const resourceMaxAmounts = useRef<Record<string, number>>({});

  // Rate tracking state and refs
  const prevInventory = useRef({ wood: 0, stone: 0, gold: 0 });
  const collectionHistory = useRef<{ time: number; type: 'wood' | 'stone' | 'gold'; amount: number }[]>([]);
  const gameStartTime = useRef(Date.now());
  const hasLoadedInitialInventory = useRef(false);
  const lastMeId = useRef<string | null>(null);

  // Reset load flag if player ID changes (e.g. reconnect with new socket ID)
  if (store.me?.id !== lastMeId.current) {
    hasLoadedInitialInventory.current = false;
    lastMeId.current = store.me?.id || null;
  }

  const triggerZoomIndicator = (zoomVal: number) => {
    setZoomIndicator({ value: zoomVal, visible: true });
    if (zoomIndicatorTimer.current) {
      clearTimeout(zoomIndicatorTimer.current);
    }
    zoomIndicatorTimer.current = setTimeout(() => {
      setZoomIndicator(prev => ({ ...prev, visible: false }));
    }, 1500);
  };

  useEffect(() => {
    return () => {
      if (zoomIndicatorTimer.current) {
        clearTimeout(zoomIndicatorTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!store.me) {
      prevInventory.current = { ...inventory };
      return;
    }
    
    // Smooth transition from initial state load
    if (!hasLoadedInitialInventory.current) {
      const meInv = store.me.inventory;
      if (inventory.wood === meInv.wood && inventory.stone === meInv.stone && inventory.gold === meInv.gold) {
        prevInventory.current = { ...inventory };
        hasLoadedInitialInventory.current = true;
        gameStartTime.current = Date.now();
      }
      return;
    }

    const now = Date.now();
    const diffWood = inventory.wood - prevInventory.current.wood;
    const diffStone = inventory.stone - prevInventory.current.stone;
    const diffGold = inventory.gold - prevInventory.current.gold;

    if (diffWood > 0) {
      collectionHistory.current.push({ time: now, type: 'wood', amount: diffWood });
    }
    if (diffStone > 0) {
      collectionHistory.current.push({ time: now, type: 'stone', amount: diffStone });
    }
    if (diffGold > 0) {
      collectionHistory.current.push({ time: now, type: 'gold', amount: diffGold });
    }

    prevInventory.current = { ...inventory };
  }, [inventory]);

  // Compute rates on every render (and thus every 500ms HUD tick or inventory change)
  const calculateRates = () => {
    const now = Date.now();
    const windowMs = 45000; // 45 second sliding window
    const windowStart = now - windowMs;

    collectionHistory.current = collectionHistory.current.filter(item => item.time >= windowStart);

    let totalWood = 0;
    let totalStone = 0;
    let totalGold = 0;

    for (const item of collectionHistory.current) {
      if (item.type === 'wood') totalWood += item.amount;
      else if (item.type === 'stone') totalStone += item.amount;
      else if (item.type === 'gold') totalGold += item.amount;
    }

    const timeElapsedMs = Math.min(windowMs, now - gameStartTime.current);
    const timeElapsedSeconds = Math.max(10, timeElapsedMs / 1000);
    const scaleFactor = 60 / timeElapsedSeconds;

    return {
      wood: Math.round(totalWood * scaleFactor),
      stone: Math.round(totalStone * scaleFactor),
      gold: Math.round(totalGold * scaleFactor),
    };
  };

  const rates = calculateRates();

  // HUD Tick for updating non-react driven UI elements periodically
  const [hudTick, setHudTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setHudTick(h => h + 1), 500);
    return () => clearInterval(id);
  }, []);

  const myMiners = Object.values(store.state?.units || {}).filter(u => u.ownerId === store.me?.id && u.type === 'miner');
  const totalMiners = myMiners.length;
  const woodMiners = myMiners.filter(u => u.assignedResource === 'wood').length;
  const stoneMiners = myMiners.filter(u => u.assignedResource === 'stone').length;
  const goldMiners = myMiners.filter(u => u.assignedResource === 'gold').length;
  const unassignedMiners = myMiners.filter(u => !u.assignedResource).length;
  const hasBase = Object.values(store.state?.buildings || {}).some(b => b.ownerId === store.me?.id && b.type === 'base');
  const myBase = Object.values(store.state?.buildings || {}).find(b => b.ownerId === store.me?.id && b.type === 'base');
  const playersMap = store.state?.players || {};
  const playersList = Object.values(playersMap);
  const playersCount = playersList.length;

  // Automatic Miner Allocation logic based on current collection rates
  useEffect(() => {
    if (!autoAssign || !socket || !store.state || !store.me) return;

    if (unassignedMiners > 0) {
      const now = Date.now();
      if (now - lastAutoAssignTime.current < 200) return; // limit frequency to avoid server socket spam
      lastAutoAssignTime.current = now;

      // Determine which resource has the lowest current collections rate,
      // breaking ties by selecting whichever category has fewer assigned miners
      const categories: ('wood' | 'stone' | 'gold')[] = ['wood', 'stone', 'gold'];
      categories.sort((a, b) => {
        const rateA = rates[a] || 0;
        const rateB = rates[b] || 0;
        if (rateA !== rateB) {
          return rateA - rateB;
        }
        
        const minersA = a === 'wood' ? woodMiners : a === 'stone' ? stoneMiners : goldMiners;
        const minersB = b === 'wood' ? woodMiners : b === 'stone' ? stoneMiners : goldMiners;
        return minersA - minersB;
      });

      const targetResource = categories[0];
      socket.emit('assign_miner', { resource: targetResource, delta: 1 });
      setHudTick(h => h + 1); // trigger state refresh
    }
  }, [autoAssign, unassignedMiners, rates, socket, woodMiners, stoneMiners, goldMiners]);

  useEffect(() => {
    // Only connect once
    const s = io('/', { path: '/socket.io' });
    setSocket(s);

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));

    s.on('init', (initialState: GameState) => {
      store.state = initialState;
      const me = initialState.players[s.id as string];
      if (me) {
        store.me = me;
        setInventory(me.inventory);
        store.inventory = me.inventory;
        camera.current.x = me.x;
        camera.current.y = me.y;
      }
      if (initialState.resources) {
        for (const rId in initialState.resources) {
          const r = initialState.resources[rId];
          if (r && r.id && !resourceMaxAmounts.current[r.id]) {
            resourceMaxAmounts.current[r.id] = r.amount;
          }
        }
      }
    });

    s.on('chunk_data', (data: { resources: Record<string, ResourceNode>, zones: Record<string, MapZone> }) => {
      if (store.state) {
        Object.assign(store.state.resources, data.resources);
        Object.assign(store.state.zones, data.zones);
        if (data.resources) {
          for (const rId in data.resources) {
            const r = data.resources[rId];
            if (r && r.id && !resourceMaxAmounts.current[r.id]) {
              resourceMaxAmounts.current[r.id] = r.amount;
            }
          }
        }
      }
    });

    s.on('player_joined', (p: Player) => {
      if (store.state) {
        store.state.players[p.id] = p;
        setHudTick(h => h + 1);
      }
    });
    
    s.on('player_updated', (p: Player) => {
      if (store.state) store.state.players[p.id] = p;
      if (p.id === s.id) {
        store.me = p;
      }
      setHudTick(h => h + 1); // trigger re-render
    });

    s.on('player_left', (id: string) => {
      if (store.state) {
        delete store.state.players[id];
        setHudTick(h => h + 1);
      }
    });

    s.on('state_tick', (data: { players: {id: string, x: number, y: number}[], units: {id: string, x: number, y: number, state: string, inventory?: any, capacity?: number}[] }) => {
      if (!store.state) return;
      for (const p of data.players) {
        if (store.state.players[p.id]) {
          if (p.id !== s.id) {
            store.state.players[p.id].x = p.x;
            store.state.players[p.id].y = p.y;
          }
        }
      }
      for (const u of (data.units || [])) {
        if (store.state.units[u.id]) {
          store.state.units[u.id].x = u.x;
          store.state.units[u.id].y = u.y;
          store.state.units[u.id].state = u.state as any;
          if (u.inventory) {
            store.state.units[u.id].inventory = u.inventory;
          }
          if (u.capacity !== undefined) {
            store.state.units[u.id].capacity = u.capacity;
          }
        }
      }
    });

    s.on('building_created', (b: Building) => {
      if (store.state) store.state.buildings[b.id] = b;
    });

    s.on('building_updated', (b: Building) => {
      if (store.state) store.state.buildings[b.id] = b;
    });

    s.on('building_destroyed', (bId: string) => {
      if (store.state) delete store.state.buildings[bId];
    });

    s.on('combat_events', (events: { from: {x:number, y:number, id:string}, to: {x:number, y:number, id:string}, damage: number }[]) => {
      const now = Date.now();
      const newLogs: { id: string; time: number; message: string; targetX: number; targetY: number }[] = [];
      
      events.forEach(ev => {
        store.combatEffects.lines.push({
          from: { x: ev.from.x, y: ev.from.y },
          to: { x: ev.to.x, y: ev.to.y },
          time: now,
          maxLifetime: 300
        });
        store.combatEffects.damageTexts.push({
          x: ev.to.x,
          y: ev.to.y,
          value: ev.damage,
          time: now,
          maxLifetime: 800
        });
        newLogs.push({
          id: Math.random().toString(),
          time: now,
          message: `Turret attack hit for ${ev.damage} damage!`,
          targetX: ev.to.x,
          targetY: ev.to.y
        });
      });

      setCombatLogs(logs => [...logs, ...newLogs].slice(-10)); // keep last 10
    });

    s.on('unit_created', (u: any) => {
      if (store.state) store.state.units[u.id] = u;
      setHudTick(h => h + 1);
    });

    s.on('unit_updated', (u: any) => {
      if (store.state) store.state.units[u.id] = u;
      setHudTick(h => h + 1);
    });

    s.on('resource_updated', (r: ResourceNode) => {
      if (store.state) {
        store.state.resources[r.id] = r;
        if (r && r.id && !resourceMaxAmounts.current[r.id]) {
          resourceMaxAmounts.current[r.id] = r.amount;
        }
      }
    });

    s.on('resource_depleted', (rId: string) => {
      if (store.state) delete store.state.resources[rId];
      delete resourceMaxAmounts.current[rId];
    });

    s.on('inventory_updated', (inv: any) => {
      store.inventory = inv;
      setInventory(inv);
    });

    return () => {
      s.disconnect();
    };
  }, []);

  // Keyboard controls
  const keys = useRef<{ [key: string]: boolean }>({});
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

  // Controls & Interaction
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getPinchDist = () => {
      if (activePointers.current.size < 2) return null;
      const pts = Array.from(activePointers.current.values()) as PointerEvent[];
      const dx = pts[0].clientX - pts[1].clientX;
      const dy = pts[0].clientY - pts[1].clientY;
      return Math.sqrt(dx*dx + dy*dy);
    };

    const handlePointerDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      activePointers.current.set(e.pointerId, e);
      mouse.current.isDown = true;
      if (activePointers.current.size === 1) {
         dragStart.current = { x: e.clientX, y: e.clientY };
         dragLast.current = { x: e.clientX, y: e.clientY };
      } else if (activePointers.current.size === 2) {
         pointerPinchStartDist.current = getPinchDist();
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (activePointers.current.has(e.pointerId)) {
        activePointers.current.set(e.pointerId, e);
      }
      mouse.current.screenX = e.clientX;
      mouse.current.screenY = e.clientY;
      
      const rect = canvas.getBoundingClientRect();
      const cw = canvas.width / 2;
      const ch = canvas.height / 2;
      mouse.current.x = (e.clientX - rect.left - cw) / camera.current.zoom + camera.current.x;
      mouse.current.y = (e.clientY - rect.top - ch) / camera.current.zoom + camera.current.y;

      if (activePointers.current.size === 2) {
         // Pinch Zoom
         const dist = getPinchDist();
         if (dist !== null && pointerPinchStartDist.current !== null) {
            const delta = dist - pointerPinchStartDist.current;
            targetZoom.current += delta * 0.005;
            targetZoom.current = Math.max(0.2, Math.min(targetZoom.current, 3));
            triggerZoomIndicator(targetZoom.current);
            pointerPinchStartDist.current = dist;
         }
      } else if (activePointers.current.size === 1 && dragLast.current && dragStart.current) {
         // Drag Pan
         const dx = e.clientX - dragLast.current.x;
         const dy = e.clientY - dragLast.current.y;
         if (Math.abs(e.clientX - dragStart.current.x) > 5 || Math.abs(e.clientY - dragStart.current.y) > 5) {
            autoFollow.current = false;
         }
         // Only move camera if dragged
         if (!autoFollow.current || Math.abs(dx) > 0 || Math.abs(dy) > 0) {
            camera.current.x -= dx / camera.current.zoom;
            camera.current.y -= dy / camera.current.zoom;
         }
         dragLast.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      activePointers.current.delete(e.pointerId);
      if (activePointers.current.size === 0) {
         mouse.current.isDown = false;
         if (dragStart.current) {
            const ds = dragStart.current;
            const dist = Math.sqrt(Math.pow(e.clientX - ds.x, 2) + Math.pow(e.clientY - ds.y, 2));
            if (dist < 10) {
               // Double tap focus check
               const now = Date.now();
               if (now - lastTapTime.current < 260) {
                  if (store.me && store.state) {
                     const myBase = Object.values(store.state.buildings).find(b => b.ownerId === store.me?.id && b.type === 'base');
                     if (autoFollow.current === 'hero' && myBase) {
                        autoFollow.current = 'base';
                        camera.current.x = myBase.x;
                        camera.current.y = myBase.y;
                     } else {
                        autoFollow.current = 'hero';
                        camera.current.x = store.me.x;
                        camera.current.y = store.me.y;
                      }
                     targetZoom.current = 1.0;
                     triggerZoomIndicator(1.0);
                  }
                  lastTapTime.current = 0;
                  dragStart.current = null;
                  dragLast.current = null;
                  return;
               }
               lastTapTime.current = now;
               // Tap / Click Interaction
               if (buildMode && socket) {
                 let canPlace = true;
                 if (buildMode !== 'base') {
                    const myBase = Object.values(store.state?.buildings || {}).find(b => b.ownerId === store.me?.id && b.type === 'base');
                    if (!myBase) {
                       alert('You must construct a Base first before building other structures!');
                       canPlace = false;
                    } else {
                       const dx = mouse.current.x - myBase.x;
                       const dy = mouse.current.y - myBase.y;
                       const distToBas = Math.sqrt(dx * dx + dy * dy);
                       if (distToBas > 450) {
                          alert("Cannot place here! This structure is outside your Base's building range (450m).");
                          canPlace = false;
                       }
                    }
                 }
                 if (canPlace) {
                    socket.emit('build', { type: buildMode, x: mouse.current.x, y: mouse.current.y });
                 }
               } else if (socket) {
                 // Check if clicking a resource
                 if (store.state && store.me) {
                   let clickedResource = null;
                   for (const rId in store.state.resources) {
                     const r = store.state.resources[rId];
                     const rx = r.x - mouse.current.x;
                     const ry = r.y - mouse.current.y;
                     if (Math.sqrt(rx*rx + ry*ry) < 30) {
                       clickedResource = rId;
                       break;
                     }
                   }
                   if (clickedResource) {
                      socket.emit('gather', clickedResource);
                      moveTarget.current = { x: store.state.resources[clickedResource].x, y: store.state.resources[clickedResource].y };
                   } else {
                      // Tap to move
                      moveTarget.current = { x: mouse.current.x, y: mouse.current.y };
                   }
                 }
               }
            }
         }
         dragStart.current = null;
         dragLast.current = null;
      } else if (activePointers.current.size === 1) {
         // Re-init drag for remaining finger
         const ptr = (Array.from(activePointers.current.values()) as PointerEvent[])[0];
         dragLast.current = { x: ptr.clientX, y: ptr.clientY };
         dragStart.current = { x: ptr.clientX, y: ptr.clientY };
      }
    };

    const handleWheel = (e: WheelEvent) => {
      targetZoom.current -= e.deltaY * 0.001;
      targetZoom.current = Math.max(0.2, Math.min(targetZoom.current, 3));
      triggerZoomIndicator(targetZoom.current);
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);
    canvas.addEventListener('wheel', handleWheel);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerUp);
      canvas.removeEventListener('wheel', handleWheel);
    }
  }, [buildMode, socket]);

  // Main Game Loop (Canvas Render & Local Movement)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animFrame: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.1); // cap dt to avoid crazy jumps
      lastTime = time;

      // Smooth zoom interpolation
      if (Math.abs(camera.current.zoom - targetZoom.current) > 0.001) {
        camera.current.zoom += (targetZoom.current - camera.current.zoom) * 9 * dt;
      } else {
        camera.current.zoom = targetZoom.current;
      }

      if (coordsRef.current) {
        coordsRef.current.innerText = `[${Math.round(camera.current.x)}, ${Math.round(camera.current.y)}]`;
      }

      // Ensure canvas sizing
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      // Handle local player movement
      if (store.me && store.state) {
        const hasSpeedTrait = store.me.traits?.includes('speed');
        const wallMagneticLvl = store.me.upgrades?.wall_magnetic || 0;
        let speedMultiplier = 1.0;
        if (wallMagneticLvl > 0) {
          let isNearWall = false;
          const myWalls = Object.values(store.state.buildings).filter(b => b.ownerId === store.me?.id && b.type === 'wall');
          for (const w of myWalls) {
            const dx = w.x - store.me.x;
            const dy = w.y - store.me.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 150) {
              isNearWall = true;
              break;
            }
          }
          if (isNearWall) {
            speedMultiplier += wallMagneticLvl * 0.25;
          }
        }
        const speed = (hasSpeedTrait ? constants.HERO_SPEED_BOOST : constants.HERO_SPEED) * speedMultiplier * dt;
        let moved = false;


        if (keys.current['w'] || keys.current['W'] || keys.current['ArrowUp']) { store.me.y -= speed; moved = true; moveTarget.current = null; }
        if (keys.current['s'] || keys.current['S'] || keys.current['ArrowDown']) { store.me.y += speed; moved = true; moveTarget.current = null; }
        if (keys.current['a'] || keys.current['A'] || keys.current['ArrowLeft']) { store.me.x -= speed; moved = true; moveTarget.current = null; }
        if (keys.current['d'] || keys.current['D'] || keys.current['ArrowRight']) { store.me.x += speed; moved = true; moveTarget.current = null; }

        if (!moved && moveTarget.current) {
          const dx = moveTarget.current.x - store.me.x;
          const dy = moveTarget.current.y - store.me.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist > speed) {
             store.me.x += (dx/dist) * speed;
             store.me.y += (dy/dist) * speed;
             moved = true;
          } else {
             store.me.x = moveTarget.current.x;
             store.me.y = moveTarget.current.y;
             moveTarget.current = null;
             moved = true;
          }
        }

        // Camera follow
        if (autoFollow.current === 'hero' && store.me) {
           camera.current.x += (store.me.x - camera.current.x) * 5 * dt;
           camera.current.y += (store.me.y - camera.current.y) * 5 * dt;
        } else if (autoFollow.current === 'base' && store.me) {
           const myBase = Object.values(store.state.buildings).find(b => b.ownerId === store.me?.id && b.type === 'base');
           if (myBase) {
             camera.current.x += (myBase.x - camera.current.x) * 5 * dt;
             camera.current.y += (myBase.y - camera.current.y) * 5 * dt;
           } else {
             autoFollow.current = 'hero';
           }
        }

        if (moved && socket) {
          // Sync local position to network (we could throttle this)
          // For a simple demo, emitting up to 60hz (if moving) is okay but usually we'd rate limit.
          // Since it's local only, let's rate limit it slightly manually or rely on socket.io's buffer.
          socket.emit('move', { x: store.me.x, y: store.me.y });
        }
      }

      // Draw
      ctx.fillStyle = '#08101a'; // Dark navy background
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (store.state) {
        // --- CHUNK LOGIC ---
        if (time - lastChunkUpdate.current > 500) { // every 0.5s
          lastChunkUpdate.current = time;
          const CHUNK_SIZE = constants.CHUNK_SIZE;
          
          const activeChunks = new Set<string>();
          
          // Add camera chunks
          const viewDistChunk = 1500 / camera.current.zoom;
          const minCx = Math.floor((camera.current.x - viewDistChunk) / CHUNK_SIZE);
          const maxCx = Math.floor((camera.current.x + viewDistChunk) / CHUNK_SIZE);
          const minCy = Math.floor((camera.current.y - viewDistChunk) / CHUNK_SIZE);
          const maxCy = Math.floor((camera.current.y + viewDistChunk) / CHUNK_SIZE);
          for(let cx = minCx; cx <= maxCx; cx++) {
             for(let cy = minCy; cy <= maxCy; cy++) {
                activeChunks.add(`${cx},${cy}`);
             }
          }
          
          // Add hero chunks
          if (store.me) {
            const heroCx = Math.floor(store.me.x / CHUNK_SIZE);
            const heroCy = Math.floor(store.me.y / CHUNK_SIZE);
            for(let cx = heroCx-1; cx <= heroCx+1; cx++) {
               for(let cy = heroCy-1; cy <= heroCy+1; cy++) {
                  activeChunks.add(`${cx},${cy}`);
               }
            }
            
            // Add base chunks (owned by me)
            Object.values(store.state.buildings).filter(b => b.ownerId === store.me?.id).forEach(b => {
               const bcx = Math.floor(b.x / CHUNK_SIZE);
               const bcy = Math.floor(b.y / CHUNK_SIZE);
               for(let cx = bcx-1; cx <= bcx+1; cx++) {
                 for(let cy = bcy-1; cy <= bcy+1; cy++) {
                    activeChunks.add(`${cx},${cy}`);
                 }
               }
            });
          }
          
          // Request missing chunks
          const missingChunks: string[] = [];
          if (socket) {
            activeChunks.forEach(c => {
               if (!requestedChunks.current.has(c)) {
                  requestedChunks.current.add(c);
                  missingChunks.push(c);
               }
            });
            
            if (missingChunks.length > 0) {
               socket.emit('request_chunks', missingChunks);
            }
          }
          
          // Garbage collection: remove stuff not in active chunks
          for (const rId in store.state.resources) {
             const r = store.state.resources[rId];
             const cx = Math.floor(r.x / CHUNK_SIZE);
             const cy = Math.floor(r.y / CHUNK_SIZE);
             if (!activeChunks.has(`${cx},${cy}`)) {
                delete store.state.resources[rId];
             }
          }
          for (const zId in store.state.zones) {
             const z = store.state.zones[zId];
             const cx = Math.floor(z.x / CHUNK_SIZE);
             const cy = Math.floor(z.y / CHUNK_SIZE);
             if (!activeChunks.has(`${cx},${cy}`)) {
                delete store.state.zones[zId];
             }
          }
          
          // purge requestedChunks that are inactive
          requestedChunks.current.forEach(c => {
             if (!activeChunks.has(c)) {
                requestedChunks.current.delete(c);
             }
          });
        }
        // --- END CHUNK LOGIC ---

        ctx.save();
        // Camera transform
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(camera.current.zoom, camera.current.zoom);
        ctx.translate(-camera.current.x, -camera.current.y);

        // Draw Map Grid / Background Zones
        if (mapSettings.showGrid) {
          ctx.strokeStyle = 'rgba(42, 60, 80, 0.5)';
          ctx.lineWidth = 1;
          const GRID_SIZE = constants.GRID_SIZE;
          const viewDist = 1500 / camera.current.zoom;
          const startX = Math.floor((camera.current.x - viewDist) / GRID_SIZE) * GRID_SIZE;
          const endX = Math.ceil((camera.current.x + viewDist) / GRID_SIZE) * GRID_SIZE;
          const startY = Math.floor((camera.current.y - viewDist) / GRID_SIZE) * GRID_SIZE;
          const endY = Math.ceil((camera.current.y + viewDist) / GRID_SIZE) * GRID_SIZE;

          for (let x = startX; x <= endX; x += GRID_SIZE) {
            ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, endY); ctx.stroke();
          }
          for (let y = startY; y <= endY; y += GRID_SIZE) {
            ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(endX, y); ctx.stroke();
          }
        }

        // Draw Zones
        if (mapSettings.showZoneBorder) {
          for (const zId in store.state.zones) {
            const z = store.state.zones[zId];
            ctx.beginPath();
            ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
            if (z.type === 'forest') ctx.fillStyle = 'rgba(16, 185, 129, 0.1)';
            if (z.type === 'desert') ctx.fillStyle = 'rgba(245, 158, 11, 0.1)';
            if (z.type === 'mountain') ctx.fillStyle = 'rgba(156, 163, 175, 0.1)';
            ctx.fill();

            let zoneImg = null;
            if (z.type === 'forest') zoneImg = woodIconImg;
            if (z.type === 'desert') zoneImg = goldIconImg;
            if (z.type === 'mountain') zoneImg = stoneIconImg;
            
            if (zoneImg && zoneImg.complete && zoneImg.naturalWidth > 0) {
              ctx.save();
              ctx.globalAlpha = 0.08;
              const imgSize = z.radius * 1.2;
              ctx.drawImage(zoneImg, z.x - imgSize / 2, z.y - imgSize / 2, imgSize, imgSize);
              ctx.restore();
            }

            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.font = 'bold 24px Inter, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            
            let text = '';
            if (z.type === 'forest') text = 'FOREST (+50% WOOD BONUS) • ';
            if (z.type === 'desert') text = 'DESERT (+50% GOLD BONUS) • ';
            if (z.type === 'mountain') text = 'MOUNTAIN (+50% STONE BONUS) • ';
            
            const label = text.repeat(3); // repeat a few times
            
            // Compute slow rotating angle over time (0.05 rad/sec), alternate direction based on ID
            const rotationDirection = (parseInt(z.id.replace(/-/g, '').substring(0, 3), 16) % 2 === 0 ? 1 : -1);
            const currentRotation = rotationDirection * (time / 1000) * 0.08;
            
            // Draw on top edge with rotation
            drawTextAlongArc(ctx, label, z.x, z.y, z.radius - 15, currentRotation);
            // Draw on bottom edge with rotation
            drawTextAlongArc(ctx, label, z.x, z.y, z.radius - 15, currentRotation + Math.PI);
          }
        }

        // Draw Resources
        for (const rId in store.state.resources) {
          const r = store.state.resources[rId];
          const size = 10 + r.amount / 50;
          let img = null;
          if (r.type === 'wood') img = woodIconImg;
          if (r.type === 'stone') img = stoneIconImg;
          if (r.type === 'gold') img = goldIconImg;

          // Check if in matching bonus zone
          let hasBonus = false;
          let highlightColor = '#ffffff';
          for (const zId in store.state.zones) {
            const z = store.state.zones[zId];
            if ((z.type === 'forest' && r.type === 'wood') ||
                (z.type === 'desert' && r.type === 'gold') ||
                (z.type === 'mountain' && r.type === 'stone')) {
              const zdx = r.x - z.x;
              const zdy = r.y - z.y;
              const zdist = Math.sqrt(zdx * zdx + zdy * zdy);
              if (zdist <= z.radius) {
                hasBonus = true;
                if (z.type === 'forest') highlightColor = '#22c55e'; // Emerald
                if (z.type === 'desert') highlightColor = '#f59e0b'; // Amber
                if (z.type === 'mountain') highlightColor = '#60a5fa'; // Silver/Sky blue
                break;
              }
            }
          }

          if (hasBonus) {
            ctx.save();
            ctx.shadowBlur = 12;
            ctx.shadowColor = highlightColor;
            ctx.strokeStyle = highlightColor;
            ctx.lineWidth = 2.5 + Math.sin(time / 200) * 0.75;
            ctx.beginPath();
            ctx.arc(r.x, r.y, size + 3, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }

          if (img && img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, r.x - size, r.y - size, size * 2, size * 2);
          } else {
            ctx.beginPath();
            ctx.arc(r.x, r.y, size, 0, Math.PI * 2);
            if (r.type === 'wood') ctx.fillStyle = '#8B4513';
            if (r.type === 'stone') ctx.fillStyle = '#A9A9A9';
            if (r.type === 'gold') ctx.fillStyle = '#FFD700';
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.stroke();
          }

          // Progress bar around the outside of the icon ring
          const maxVal = resourceMaxAmounts.current[r.id] || r.amount;
          const pct = maxVal > 0 ? r.amount / maxVal : 1.0;
          const clampedPct = Math.max(0, Math.min(1, pct));
          
          if (clampedPct < 0.999) {
            ctx.save();
            const bgRadius = size + 4;
            const barWidth = 3;
            
            // Dark background track ring
            ctx.beginPath();
            ctx.arc(r.x, r.y, bgRadius, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(15, 23, 42, 0.7)';
            ctx.lineWidth = barWidth;
            ctx.stroke();
            
            // Pick color: red < 20%, yellow < 66%, green otherwise
            let barColor = '#10b981'; // Green
            if (clampedPct < 0.20) {
              barColor = '#ef4444'; // Red
            } else if (clampedPct < 0.66) {
              barColor = '#f59e0b'; // Yellow
            }
            
            // Draw active progress ring chunk
            ctx.beginPath();
            const startAngle = -Math.PI / 2;
            const endAngle = startAngle + clampedPct * (Math.PI * 2);
            ctx.arc(r.x, r.y, bgRadius, startAngle, endAngle);
            ctx.strokeStyle = barColor;
            ctx.lineWidth = barWidth;
            ctx.lineCap = 'round';
            ctx.stroke();
            ctx.restore();
          }
        }

        // Draw Buildings
        for (const bId in store.state.buildings) {
          const b = store.state.buildings[bId];
          const bData = (buildings as any)[b.type];
          const playerColor = store.state.players[b.ownerId]?.color || '#ffffff';
          const size = bData.size;
          
          if (b.type === 'turret' && mapSettings.showTowerBorder) {
            ctx.save();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = '#ef4444'; // Red range indicator
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.35;
            ctx.beginPath();
            ctx.arc(b.x, b.y, constants.TURRET_RANGE, 0, Math.PI * 2);
            ctx.stroke();

            const pattern = ctx.createPattern(getRedHatchCanvas(), 'repeat');
            if (pattern) {
              ctx.fillStyle = pattern;
              ctx.globalAlpha = 0.12; // High transparency cross hatch
              ctx.fill();
            }
            ctx.restore();
          }

          ctx.save();
          ctx.fillStyle = playerColor;
          ctx.beginPath();
          if (b.type === 'base') {
            ctx.roundRect ? ctx.roundRect(b.x - size, b.y - size, size * 2, size * 2, 6) : ctx.rect(b.x - size, b.y - size, size * 2, size * 2);
          } else if (b.type === 'wall') {
            ctx.roundRect ? ctx.roundRect(b.x - size, b.y - size, size * 2, size * 2, 3) : ctx.rect(b.x - size, b.y - size, size * 2, size * 2);
          } else if (b.type === 'turret') {
            ctx.arc(b.x, b.y, size, 0, Math.PI * 2);
          }
          ctx.fill();
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();

          let img = null;
          if (b.type === 'base') img = baseIconWhite;
          if (b.type === 'wall') img = wallIconWhite;
          if (b.type === 'turret') img = turretIconWhite;

          if (img && img.complete && img.naturalWidth > 0) {
            const iconSize = b.type === 'base' ? 15 : (b.type === 'wall' ? 8 : 11);
            ctx.drawImage(img, b.x - iconSize, b.y - iconSize, iconSize * 2, iconSize * 2);
          }
        }

        // Draw Units
        for (const uId in store.state.units) {
          const u = store.state.units[uId];
          
          if (u.type === 'miner') {
            const playerColor = store.state.players[u.ownerId]?.color || '#ffffff';
            const size = (buildings as any).miner.size;
            
            ctx.save();
            ctx.fillStyle = playerColor;
            ctx.beginPath();
            ctx.arc(u.x, u.y, size, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();

            const img = minerIconWhite;
            if (img && img.complete && img.naturalWidth > 0) {
              const iconSize = 8;
              ctx.drawImage(img, u.x - iconSize, u.y - iconSize, iconSize * 2, iconSize * 2);
            }

            // Status indicator
            if (u.state === 'mining') {
              ctx.save();
              ctx.fillStyle = '#FFD700';
              ctx.beginPath(); 
              ctx.arc(u.x, u.y - 15, 3.5, 0, Math.PI*2); 
              ctx.fill();
              ctx.strokeStyle = '#000000';
              ctx.lineWidth = 1;
              ctx.stroke();
              ctx.restore();
            }

            // Resource Carrying Overhead
            if (u.ownerId === store.me?.id && u.inventory && u.inventory.amount > 0 && u.inventory.type) {
              const rType = u.inventory.type;
              const amount = u.inventory.amount;
              
              let resColor = '#fbbf24'; // default gold color
              let resImg = goldIconImg;
              if (rType === 'wood') {
                resColor = '#e2a050';
                resImg = woodIconImg;
              } else if (rType === 'stone') {
                resColor = '#9ca3af';
                resImg = stoneIconImg;
              }

              const amountStr = amount.toString();
              
              ctx.save();
              ctx.font = 'bold 9px monospace';
              const textWidth = ctx.measureText(amountStr).width;
              
              const iconSize = 9;
              const gap = 3;
              const paddingX = 4;
              const innerW = iconSize + gap + textWidth;
              const pillW = innerW + paddingX * 2;
              const pillH = 13;
              const pillX = u.x - pillW / 2;
              const pillY = u.y - 25;
              
              // Draw background pill
              ctx.fillStyle = 'rgba(17, 24, 39, 0.9)';
              ctx.beginPath();
              if (ctx.roundRect) {
                ctx.roundRect(pillX, pillY, pillW, pillH, 3);
              } else {
                ctx.rect(pillX, pillY, pillW, pillH);
              }
              ctx.fill();
              
              // Draw small border
              ctx.strokeStyle = resColor;
              ctx.lineWidth = 1;
              ctx.beginPath();
              if (ctx.roundRect) {
                ctx.roundRect(pillX, pillY, pillW, pillH, 3);
              } else {
                ctx.rect(pillX, pillY, pillW, pillH);
              }
              ctx.stroke();
              
              // Draw icon
              const iconX = pillX + paddingX;
              const iconY = pillY + (pillH - iconSize) / 2;
              try {
                ctx.drawImage(resImg, iconX, iconY, iconSize, iconSize);
              } catch (e) {
                // fallback
              }

              // Draw text
              ctx.fillStyle = '#ffffff';
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              ctx.fillText(amountStr, iconX + iconSize + gap, pillY + pillH / 2 + 0.5);
              
              ctx.restore();
            }
          }
        }

        // Draw Players
        for (const pId in store.state.players) {
          const p = store.state.players[pId];
          
          let img = avatarCache.current[p.id];
          if (!img) {
            img = new Image();
            img.src = `https://api.dicebear.com/7.x/croodles/svg?seed=${encodeURIComponent(p.name || p.id)}`;
            avatarCache.current[p.id] = img;
          }

          if (img && img.complete && img.naturalWidth > 0) {
            ctx.save();
            // Solid backer
            ctx.beginPath();
            ctx.arc(p.x, p.y, 26, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
            ctx.strokeStyle = pId === store.me?.id ? '#ffffff' : '#000000';
            ctx.lineWidth = 3;
            ctx.stroke();

            // Clip for inner image
            ctx.beginPath();
            ctx.arc(p.x, p.y, 24, 0, Math.PI * 2);
            ctx.clip();

            // Draw avatar centered inside
            ctx.drawImage(img, p.x - 24, p.y - 24, 48, 48);
            ctx.restore();
          } else {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 22, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
            ctx.strokeStyle = pId === store.me?.id ? '#fff' : '#000';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
          
          // Name tag
          ctx.fillStyle = '#fff';
          ctx.font = '12px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(p.name, p.x, p.y - 32);
        }

        // Draw Placement Preview if Build Mode active
        if (buildMode && store.me) {
          ctx.globalAlpha = 0.5;
          const playerColor = store.me.color;
          const size = (buildings as any)[buildMode].size;
          
          // Find player's base to show its building range
          const myBase = Object.values(store.state?.buildings || {}).find(b => b.ownerId === store.me?.id && b.type === 'base');

          // Highlight building range around the base
          if (myBase && mapSettings.showBuildAreaBorder) {
            ctx.save();
            ctx.strokeStyle = store.me.color;
            ctx.setLineDash([6, 4]);
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.45;
            ctx.beginPath();
            ctx.arc(myBase.x, myBase.y, constants.BUILD_RANGE, 0, Math.PI * 2); // Build range is 450 units
            ctx.stroke();

            ctx.fillStyle = store.me.color;
            ctx.globalAlpha = 0.04;
            ctx.fill();

            // Label along building range border
            ctx.fillStyle = store.me.color;
            ctx.globalAlpha = 0.7;
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`BASE BUILD RANGE (${constants.BUILD_RANGE}m)`, myBase.x, myBase.y - (constants.BUILD_RANGE + 5));
            ctx.restore();
          } else if (buildMode === 'base' && mapSettings.showBuildAreaBorder) {
            // If they are placing their first base, show the future base range as preview around construction mouse pointer
            ctx.save();
            ctx.strokeStyle = store.me.color;
            ctx.setLineDash([5, 5]);
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.35;
            ctx.beginPath();
            ctx.arc(mouse.current.x, mouse.current.y, constants.BUILD_RANGE, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = store.me.color;
            ctx.globalAlpha = 0.03;
            ctx.fill();

            ctx.fillStyle = store.me.color;
            ctx.globalAlpha = 0.6;
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('FUTURE BASE RANGE PREVIEW', mouse.current.x, mouse.current.y - (constants.BUILD_RANGE + 5));
            ctx.restore();
          }

          // If buildMode is a turret, show its targeting range around the placement cursor as well
          if (buildMode === 'turret' as any && mapSettings.showTowerBorder) {
            ctx.save();
            ctx.strokeStyle = '#ef4444'; // Red preview range
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.arc(mouse.current.x, mouse.current.y, constants.TURRET_RANGE, 0, Math.PI * 2);
            ctx.stroke();

            const pattern = ctx.createPattern(getRedHatchCanvas(), 'repeat');
            if (pattern) {
              ctx.fillStyle = pattern;
              ctx.globalAlpha = 0.16; // Highly transparent red cross hatch
              ctx.fill();
            }
            ctx.restore();
          }

          // Determine if placement location is valid
          let canPlace = true;
          let warningText = '';
          if (buildMode !== 'base') {
            if (!myBase) {
              canPlace = false;
              warningText = 'REQUIRES BASE';
            } else {
              const dx = mouse.current.x - myBase.x;
              const dy = mouse.current.y - myBase.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist > constants.BUILD_RANGE) {
                canPlace = false;
                warningText = 'OUT OF RANGE';
              }
            }
          }

          const previewColor = canPlace ? playerColor : '#ef4444';

          ctx.save();
          ctx.fillStyle = previewColor;
          ctx.beginPath();
          if (buildMode === 'base') {
            ctx.roundRect ? ctx.roundRect(mouse.current.x - size, mouse.current.y - size, size * 2, size * 2, 6) : ctx.rect(mouse.current.x - size, mouse.current.y - size, size * 2, size * 2);
          } else if (buildMode === 'wall' as any) {
            ctx.roundRect ? ctx.roundRect(mouse.current.x - size, mouse.current.y - size, size * 2, size * 2, 3) : ctx.rect(mouse.current.x - size, mouse.current.y - size, size * 2, size * 2);
          } else if (buildMode === 'turret' as any) {
            ctx.arc(mouse.current.x, mouse.current.y, size, 0, Math.PI * 2);
          }
          ctx.fill();
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Render invalid text label
          if (!canPlace && warningText) {
            ctx.fillStyle = '#ef4444';
            ctx.font = 'bold 9px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(warningText, mouse.current.x, mouse.current.y - size - 8);
          }
          ctx.restore();

          let img = null;
          if (buildMode === 'base') img = baseIconWhite;
          if (buildMode === 'wall' as any) img = wallIconWhite;
          if (buildMode === 'turret' as any) img = turretIconWhite;

          if (img && img.complete && img.naturalWidth > 0) {
            const iconSize = buildMode === 'base' ? 15 : (buildMode === 'wall' as any ? 8 : 11);
            ctx.drawImage(img, mouse.current.x - iconSize, mouse.current.y - iconSize, iconSize * 2, iconSize * 2);
          }
          ctx.globalAlpha = 1.0;
        }

        // Render Combat Effects
        const now = Date.now();
        // 1. Lines
        store.combatEffects.lines = store.combatEffects.lines.filter(l => now - l.time < l.maxLifetime);
        store.combatEffects.lines.forEach(l => {
          const age = now - l.time;
          const alpha = 1.0 - (age / l.maxLifetime);
          ctx.save();
          ctx.strokeStyle = `rgba(239, 68, 68, ${alpha})`; // Tailwind red-500
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(l.from.x, l.from.y);
          ctx.lineTo(l.to.x, l.to.y);
          ctx.stroke();
          
          // Core beam
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
        });

        // 2. Damage Texts
        store.combatEffects.damageTexts = store.combatEffects.damageTexts.filter(dt => now - dt.time < dt.maxLifetime);
        store.combatEffects.damageTexts.forEach(dt => {
          const age = now - dt.time;
          const alpha = 1.0 - (age / dt.maxLifetime);
          const rise = (age / dt.maxLifetime) * 30; // floats up 30px
          
          ctx.save();
          ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
          ctx.strokeStyle = `rgba(0, 0, 0, ${alpha * 0.8})`;
          ctx.lineWidth = 2;
          ctx.font = 'bold 16px Inter, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.strokeText(`-${dt.value}`, dt.x, dt.y - rise);
          ctx.fillText(`-${dt.value}`, dt.x, dt.y - rise);
          ctx.restore();
        });

        ctx.restore();

        // --- Render Fog of War ---
        if (!fogCanvasRef.current) {
          fogCanvasRef.current = document.createElement('canvas');
        }
        const fCanvas = fogCanvasRef.current;
        fCanvas.width = canvas.width;
        fCanvas.height = canvas.height;
        const fctx = fCanvas.getContext('2d');
        if (fctx) {
          fctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
          fctx.fillRect(0, 0, fCanvas.width, fCanvas.height);
          
          fctx.globalCompositeOperation = 'destination-out';
          fctx.save();
          fctx.translate(fCanvas.width / 2, fCanvas.height / 2);
          fctx.scale(camera.current.zoom, camera.current.zoom);
          fctx.translate(-camera.current.x, -camera.current.y);
          
          const drawVision = (x: number, y: number, r: number) => {
            const grad = fctx.createRadialGradient(x, y, 0, x, y, r);
            grad.addColorStop(0, 'rgba(0,0,0,1)');
            grad.addColorStop(0.5, 'rgba(0,0,0,1)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            fctx.fillStyle = grad;
            fctx.beginPath();
            fctx.arc(x, y, r, 0, Math.PI * 2);
            fctx.fill();
          };
          
          if (store.me) drawVision(store.me.x, store.me.y, constants.FOG_VISION_HERO);
          
          Object.values(store.state.buildings).forEach(b => {
             if (b.ownerId === store.me?.id) {
                let r = 200;
                if (b.type === 'base') r = constants.FOG_VISION_BASE;
                if (b.type === 'turret') r = constants.FOG_VISION_TURRET;
                drawVision(b.x, b.y, r);
             }
          });
          
          Object.values(store.state.units).forEach(u => {
             if (u.ownerId === store.me?.id) {
                drawVision(u.x, u.y, constants.FOG_VISION_MINER);
             }
          });
          
          fctx.restore();
          fctx.globalCompositeOperation = 'source-over';
          
          ctx.drawImage(fCanvas, 0, 0);
        }
           // Draw Minimap
      const mCanvas = minimapCanvasRef.current;
      if (mCanvas && store.state && showMinimap) {
        const mctx = mCanvas.getContext('2d');
        if (mctx) {
          mctx.fillStyle = '#08101a';
          mctx.fillRect(0, 0, mCanvas.width, mCanvas.height);
          mctx.save();

          // Determine minimap center
          let centerX = 0;
          let centerY = 0;
          if (autoFollow.current === 'base') {
            const myBase = Object.values(store.state.buildings).find(b => b.ownerId === store.me?.id && b.type === 'base');
            if (myBase) {
              centerX = myBase.x;
              centerY = myBase.y;
            } else if (store.me) {
              centerX = store.me.x;
              centerY = store.me.y;
            }
          } else if (autoFollow.current === 'hero') {
            if (store.me) {
              centerX = store.me.x;
              centerY = store.me.y;
            }
          } else {
            // Manual camera movement - focus around current camera center
            centerX = camera.current.x;
            centerY = camera.current.y;
          }

          const minimapRange = 5000;
          const scale = mCanvas.width / minimapRange;
          
          mctx.translate(mCanvas.width / 2, mCanvas.height / 2);
          mctx.scale(scale, scale);
          mctx.translate(-centerX, -centerY);

          // 1. Draw zones
          for (const zId in store.state.zones) {
            const z = store.state.zones[zId];
            mctx.beginPath();
            mctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
            if (z.type === 'forest') mctx.fillStyle = 'rgba(16, 185, 129, 0.4)';
            if (z.type === 'desert') mctx.fillStyle = 'rgba(245, 158, 11, 0.4)';
            if (z.type === 'mountain') mctx.fillStyle = 'rgba(156, 163, 175, 0.4)';
            mctx.fill();
          }

          // 2. Draw resources
          for (const rId in store.state.resources) {
            const r = store.state.resources[rId];
            mctx.save();
            if (r.type === 'wood') mctx.fillStyle = '#10b981';
            else if (r.type === 'stone') mctx.fillStyle = '#9ca3af';
            else if (r.type === 'gold') mctx.fillStyle = '#f59e0b';
            
            mctx.beginPath();
            mctx.arc(r.x, r.y, 35, 0, Math.PI * 2);
            mctx.fill();
            
            mctx.strokeStyle = '#1f2937';
            mctx.lineWidth = 10;
            mctx.stroke();

            mctx.restore();
          }

          // 3. Draw Buildings
          for (const bId in store.state.buildings) {
            const b = store.state.buildings[bId];
            const bData = (buildings as any)[b.type];
            const playerColor = store.state.players[b.ownerId]?.color || '#ffffff';
            mctx.save();
            mctx.fillStyle = playerColor;
            mctx.strokeStyle = '#ffffff';
            mctx.lineWidth = 12;
            mctx.beginPath();
            const bSize = bData.minimapSize;
            if (b.type === 'base') {
              mctx.roundRect ? mctx.roundRect(b.x - bSize, b.y - bSize, bSize * 2, bSize * 2, bData.minimapCornerRadius) : mctx.rect(b.x - bSize, b.y - bSize, bSize * 2, bSize * 2);
              mctx.fill();
              mctx.stroke();
            } else if (b.type === 'turret') {
              mctx.arc(b.x, b.y, bSize, 0, Math.PI * 2);
              mctx.fill();
              mctx.stroke();
            } else if (b.type === 'wall') {
              mctx.roundRect ? mctx.roundRect(b.x - bSize, b.y - bSize, bSize * 2, bSize * 2, bData.minimapCornerRadius) : mctx.rect(b.x - bSize, b.y - bSize, bSize * 2, bSize * 2);
              mctx.fill();
              mctx.stroke();
            }
            mctx.restore();
          }

          // 4. Draw players (with avatar icons)
          for (const pId in store.state.players) {
            const p = store.state.players[pId];
            const pSize = pId === store.me?.id ? 140 : 100;
            let img = avatarCache.current[p.id];
            if (!img) {
              img = new Image();
              img.src = `https://api.dicebear.com/7.x/croodles/svg?seed=${encodeURIComponent(p.name || p.id)}`;
              avatarCache.current[p.id] = img;
            }

            mctx.save();
            mctx.fillStyle = p.color;
            mctx.beginPath();
            mctx.arc(p.x, p.y, pSize, 0, Math.PI * 2);
            mctx.fill();
            
            mctx.strokeStyle = '#ffffff';
            mctx.lineWidth = pSize * 0.15;
            mctx.stroke();

            if (img && img.complete && img.naturalWidth > 0) {
              mctx.beginPath();
              mctx.arc(p.x, p.y, pSize * 0.85, 0, Math.PI * 2);
              mctx.clip();
              mctx.drawImage(img, p.x - pSize * 0.85, p.y - pSize * 0.85, pSize * 1.7, pSize * 1.7);
            }
            mctx.restore();
          }

           // Render Fog of War on Minimap
           if (!minimapFogCanvasRef.current) minimapFogCanvasRef.current = document.createElement('canvas');
           const mfCanvas = minimapFogCanvasRef.current;
           mfCanvas.width = mCanvas.width;
           mfCanvas.height = mCanvas.height;
           const mfctx = mfCanvas.getContext('2d');
           if (mfctx) {
              mfctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
              mfctx.fillRect(0, 0, mfCanvas.width, mfCanvas.height);
              
              mfctx.globalCompositeOperation = 'destination-out';
              mfctx.save();
              mfctx.translate(mfCanvas.width / 2, mfCanvas.height / 2);
              mfctx.scale(scale, scale);
              mfctx.translate(-centerX, -centerY);
              
              const drawMinimapVision = (x: number, y: number, r: number) => {
                 const grad = mfctx.createRadialGradient(x, y, 0, x, y, r);
                 grad.addColorStop(0, 'rgba(0,0,0,1)');
                 grad.addColorStop(0.5, 'rgba(0,0,0,1)');
                 grad.addColorStop(1, 'rgba(0,0,0,0)');
                 mfctx.fillStyle = grad;
                 mfctx.beginPath();
                 mfctx.arc(x, y, r, 0, Math.PI * 2);
                 mfctx.fill();
              };
              if (store.me) drawMinimapVision(store.me.x, store.me.y, constants.FOG_VISION_HERO);
              Object.values(store.state.buildings).forEach(b => {
                 if (b.ownerId === store.me?.id) {
                    let r = 200;
                    if (b.type === 'base') r = constants.FOG_VISION_BASE;
                    if (b.type === 'turret') r = constants.FOG_VISION_TURRET;
                    drawMinimapVision(b.x, b.y, r);
                 }
              });
              Object.values(store.state.units).forEach(u => {
                 if (u.ownerId === store.me?.id) drawMinimapVision(u.x, u.y, constants.FOG_VISION_MINER);
              });
              mfctx.restore();
              mfctx.globalCompositeOperation = 'source-over';
              
              mctx.save();
              mctx.setTransform(1, 0, 0, 1, 0, 0);
              mctx.drawImage(mfCanvas, 0, 0);
              mctx.restore();
           }

          // Draw camera rect
          const viewWidth = (canvas.width / camera.current.zoom);
          const viewHeight = (canvas.height / camera.current.zoom);
          mctx.strokeStyle = '#fff';
          mctx.lineWidth = 1.5 / scale;
          mctx.strokeRect(camera.current.x - viewWidth/2, camera.current.y - viewHeight/2, viewWidth, viewHeight);

          mctx.restore();
        }
      }     }

      animFrame = requestAnimationFrame(loop);
    };

    animFrame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrame);
  }, [buildMode, showMinimap, socket, mapSettings]);

  const shouldFlashBuild = !isBuildOpen && (!hasBase || totalMiners === 0);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-gray-900 select-none text-slate-100">
      <canvas ref={canvasRef} className="absolute inset-0 z-0 cursor-crosshair touch-none" />
      
      {/* --- Main Menu Overlay --- */}
      {scene === 'menu' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-between p-4 sm:p-8 bg-zinc-950/80 backdrop-blur-sm pointer-events-auto overflow-y-auto">
          {/* Logo & Header */}
          <div className="w-full max-w-lg mt-8 sm:mt-16 text-center">
            <h1 className="font-display tracking-[0.2em] text-3xl sm:text-5xl text-[#f86565] drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] uppercase leading-none mb-2">
              <span className="text-4xl sm:text-6xl leading-none mr-2">★</span>RED OCTOBER:
            </h1>
            <h2 className="text-gray-300 tracking-[0.3em] text-base sm:text-xl font-display uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              Overlord Command
            </h2>
            <div className="flex items-center justify-center gap-2 mt-4 opacity-50">
              <div className="w-4 h-4 bg-zinc-400 clip-triangle" />
              <div className="w-4 h-4 bg-zinc-400 rotate-180 clip-triangle" />
              <span className="text-xs tracking-widest uppercase font-display text-zinc-400">Volkov Industries</span>
            </div>
          </div>

          {/* Commander Status Panel */}
          {store.me && (
            <div className="w-full max-w-sm metallic-panel-inset bg-[#0b1016] border-2 border-black p-3 rounded-md shadow-[0_4px_16px_rgba(0,0,0,0.8)] flex items-center justify-between mt-auto mb-8">
              <div className="flex items-center gap-3">
                <img 
                  src={`https://api.dicebear.com/7.x/croodles/svg?seed=${encodeURIComponent(store.me.name || store.me.id)}`} 
                  className="w-12 h-12 border-2 border-zinc-900 bg-zinc-800 shadow-sm rounded-sm" 
                  alt="Avatar"
                  referrerPolicy="no-referrer"
                />
                <div className="flex flex-col">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-display">Commander ID</span>
                  <strong className="text-sm font-display tracking-widest uppercase text-gray-200">{store.me.name || store.me.id.substring(0,6)}</strong>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-display">Credits</span>
                <span className="text-yellow-400 font-black text-sm drop-shadow-[0_0_4px_rgba(250,204,21,0.4)]">${Math.floor(inventory.gold || 0)}</span>
              </div>
            </div>
          )}

          {/* Action Grid */}
          <div className="w-full max-w-sm grid grid-cols-2 gap-3 mb-16 sm:mb-24">
            <button className="col-span-1 py-4 flex flex-col items-center justify-center gap-2 metallic-button opacity-50 cursor-not-allowed">
              <span className="text-xl">🗺️</span>
              <span className="text-[10px] sm:text-xs">Campaign</span>
            </button>
            <button onClick={() => setScene('playing')} className="col-span-1 py-4 flex flex-col items-center justify-center gap-2 metallic-button-selected text-white shadow-[0_0_15px_rgba(34,211,238,0.3)]">
              <span className="text-xl">⚔️</span>
              <span className="text-[10px] sm:text-xs font-bold">START MATCH</span>
            </button>
            <button className="col-span-1 py-4 flex flex-col items-center justify-center gap-2 metallic-button opacity-50 cursor-not-allowed">
              <span className="text-xl">🛡️</span>
              <span className="text-[10px] sm:text-xs">Arsenal & Units</span>
            </button>
            <button className="col-span-1 py-4 flex flex-col items-center justify-center gap-2 metallic-button opacity-50 cursor-not-allowed">
              <span className="text-xl">🏭</span>
              <span className="text-[10px] sm:text-xs">Base Command</span>
            </button>
            <button className="col-span-2 py-4 flex flex-col items-center justify-center gap-2 metallic-button opacity-50 cursor-not-allowed">
              <span className="text-xl">🌐</span>
              <span className="text-[10px] sm:text-xs">Global Logistics</span>
            </button>
          </div>
        </div>
      )}

      {/* Combat Event Logs */}
      <div className="absolute left-2 sm:left-4 top-[70px] sm:top-16 z-20 flex flex-col gap-1 pointer-events-auto max-w-[200px] sm:max-w-xs">
        {combatLogs.map(log => {
          const age = Date.now() - log.time;
          const isNew = age < 500;
          return (
            <div 
              key={log.id} 
              onClick={() => {
                camera.current.x = log.targetX;
                camera.current.y = log.targetY;
                autoFollow.current = false;
              }}
              className={`flex items-center justify-between gap-2 px-2 py-1 metallic-panel-inset text-[10px] sm:text-[11px] font-sans font-bold cursor-pointer transition-all ${
                isNew 
                  ? 'border-red-500 text-red-400 shadow-[0_0_8px_rgba(239,68,68,0.5)] animate-pulse' 
                  : 'text-zinc-400 hover:border-zinc-500'
              }`}
            >
              <span className="line-clamp-1">{log.message}</span>
              <span className={`shrink-0 font-display text-[9px] ${isNew ? 'text-white' : 'text-zinc-600'}`}>[{Math.round(log.targetX)}, {Math.round(log.targetY)}]</span>
            </div>
          );
        })}
      </div>

       {/* Upper Solid Nav Bar */}
      <div className="absolute top-2 left-2 right-2 metallic-panel p-2 flex flex-nowrap items-center justify-between gap-1 sm:gap-2 pointer-events-auto z-10 text-white select-none overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 border-2 border-[#1c252f] rounded-sm ${connected ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-red-500 shadow-[0_0_8px_#ef4444]'} animate-pulse shrink-0`} />
          </div>
          
          <button 
            onClick={() => setIsPlayersListOpen(true)}
            title="View Connected Players"
            className="metallic-button flex items-center gap-1.5 px-2 py-1 rounded-sm cursor-pointer text-xs font-display shrink-0"
          >
            <DynamicIcon name={icons.ui.users.name} library={icons.ui.users.library} className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-yellow-400">{playersCount}</span>
          </button>
          
          <button 
            onClick={() => setIsHelpOpen(true)}
            title="Systems Manual"
            className="metallic-button flex items-center justify-center w-7 h-7 sm:w-auto sm:h-auto sm:px-2 sm:py-1 rounded-sm cursor-pointer text-xs font-display shrink-0"
          >
            <DynamicIcon name={icons.ui.help.name} library={icons.ui.help.library} className="w-4 h-4 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
          </button>
        </div>

        {/* Center Part: Compact Resource Counter with rates */}
        <div className="flex items-center gap-1.5 sm:gap-2 metallic-panel-inset px-2 py-1.5 rounded-sm shrink bg-[#0b1016] border-2 border-black">
          {/* Wood */}
          <div className="flex flex-col items-start px-2 bg-gradient-to-b from-[#1c252f] to-[#151c24] border border-[#2a3746] rounded-sm py-0.5">
             <span className="text-[8px] text-[#67809a] font-display uppercase tracking-wider leading-none mb-1">Wood (MAT)</span>
             <span className="text-[#facc15] font-display font-medium text-xs sm:text-sm drop-shadow-[0_0_4px_rgba(250,204,21,0.5)] leading-none">
               ${Math.floor(inventory.wood)} <span className="text-[8px] text-[#22d3ee] font-sans font-bold">+{rates.wood}/S</span>
             </span>
          </div>

          <div className="h-5 w-[2px] bg-black shadow-[1px_0_0_#354353] shrink-0" />

          {/* Stone */}
          <div className="flex flex-col items-start px-2 bg-gradient-to-b from-[#1c252f] to-[#151c24] border border-[#2a3746] rounded-sm py-0.5">
             <span className="text-[8px] text-[#67809a] font-display uppercase tracking-wider leading-none mb-1">Stone (ORE)</span>
             <span className="text-gray-300 font-display font-medium text-xs sm:text-sm drop-shadow-[0_0_4px_rgba(209,213,219,0.5)] leading-none">
               ${Math.floor(inventory.stone)} <span className="text-[8px] text-[#22d3ee] font-sans font-bold">+{rates.stone}/S</span>
             </span>
          </div>

          <div className="h-5 w-[2px] bg-black shadow-[1px_0_0_#354353] shrink-0" />

          {/* Gold */}
          <div className="flex flex-col items-start px-2 bg-gradient-to-b from-[#1c252f] to-[#151c24] border border-[#2a3746] rounded-sm py-0.5">
             <span className="text-[8px] text-[#67809a] font-display uppercase tracking-wider leading-none mb-1">Gold (CR)</span>
             <span className="text-[#facc15] font-display font-medium text-xs sm:text-sm drop-shadow-[0_0_4px_rgba(250,204,21,0.5)] leading-none">
               ${Math.floor(inventory.gold)} <span className="text-[8px] text-[#22d3ee] font-sans font-bold">+{rates.gold}/S</span>
             </span>
          </div>
        </div>

        {/* Right Part: Center camera buttons and minimap button */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <button
            onClick={() => { 
              autoFollow.current = 'hero'; 
              moveTarget.current = null; 
              if (store.me) {
                camera.current.x = store.me.x;
                camera.current.y = store.me.y;
              }
            }}
            title="Center on Hero"
            className={`h-8 sm:h-9 px-2 sm:px-3 rounded-sm flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer text-xs font-display uppercase shrink-0 ${
              autoFollow.current === 'hero' 
                ? 'metallic-button-selected text-white' 
                : 'metallic-button text-gray-300'
            }`}
          >
            {store.me ? (
              <img 
                src={`https://api.dicebear.com/7.x/croodles/svg?seed=${encodeURIComponent(store.me.name || store.me.id)}`} 
                className="w-4 h-4 border border-zinc-900 bg-zinc-800 shadow-sm rounded-sm" 
                alt="Avatar"
                referrerPolicy="no-referrer"
              />
            ) : (
              <DynamicIcon name={icons.ui.user.name} library={icons.ui.user.library} className="w-4 h-4 text-cyan-400" />
            )}
            <span className="hidden sm:inline">Cmdr</span>
          </button>

          <button
            onClick={() => { 
              autoFollow.current = 'base'; 
              moveTarget.current = null; 
              if (myBase) {
                camera.current.x = myBase.x;
                camera.current.y = myBase.y;
              }
            }}
            title="Center on Base"
            className={`h-8 sm:h-9 px-2 sm:px-3 rounded-sm flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer text-xs font-display uppercase shrink-0 ${
              autoFollow.current === 'base' 
                ? 'metallic-button-selected text-white' 
                : 'metallic-button text-gray-300'
            }`}
          >
            <DynamicIcon name={icons.buildings.base.name} library={icons.buildings.base.library} className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">Base</span>
          </button>

          <button 
            onClick={() => setShowMinimap(s => !s)}
            title="Toggle Minimap"
            className={`h-8 sm:h-9 px-2 sm:px-3 rounded-sm flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer text-xs font-display uppercase shrink-0 ${
              showMinimap 
                ? 'metallic-button-selected text-white' 
                : 'metallic-button text-gray-300'
            }`}
          >
            <DynamicIcon name={icons.ui.map.name} library={icons.ui.map.library} className="w-4 h-4 text-red-500" />
            <span className="hidden sm:inline">Map</span>
          </button>

          <button 
            onClick={() => setIsSettingsOpen(true)}
            title="Map Settings"
            className="metallic-button h-8 sm:h-9 px-2 sm:px-3 rounded-sm flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer text-xs font-display uppercase shrink-0 text-gray-300"
          >
            <DynamicIcon name={icons.ui.settings.name} library={icons.ui.settings.library} className="w-4 h-4 text-zinc-300" />
            <span className="hidden sm:inline">Opt</span>
          </button>
        </div>
      </div>

      {/* Bottom Right HUD — Shifted up on mobile displays to allow bento dock clearance */}
      <div className="absolute bottom-[100px] md:bottom-28 right-4 flex flex-col items-end gap-2 pointer-events-none z-10 text-white">
        {showMinimap && (
          <div className="metallic-panel p-2 pointer-events-auto shadow-[0_4px_16px_rgba(0,0,0,0.9)]">
            <div className="relative border-2 border-black rounded-sm overflow-hidden flex shadow-[inset_0_0_12px_rgba(0,0,0,0.8)] bg-[#0d131a]">
               <canvas ref={minimapCanvasRef} width={200} height={200} className="block w-full h-full object-contain image-pixelated" />
               {/* Decorative corners */}
               <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-cyan-400 pointer-events-none opacity-50 shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
               <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-cyan-400 pointer-events-none opacity-50 shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
               <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-cyan-400 pointer-events-none opacity-50 shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
               <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-cyan-400 pointer-events-none opacity-50 shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
            </div>
          </div>
        )}
        <div 
          ref={coordsRef} 
          className="px-2 py-1 metallic-panel-inset text-[10px] font-display text-cyan-500 select-none shadow-[0_4px_4px_rgba(0,0,0,0.5)]"
        >
          [0, 0]
        </div>
      </div>

      {/* Persistent Floating Bento Dock — Comfort zones (lower half) */}
      <div className="absolute bottom-2 sm:bottom-4 left-1/2 -translate-x-1/2 w-[96vw] sm:w-[92vw] sm:max-w-md z-25 flex flex-col gap-2 pointer-events-none select-none">
        
        {/* Bento Drawer Panel (Rises upwards when a submenu is open) */}
        {(isWorkersOpen || isBuildOpen || isUpgradesOpen) && (
          <div className="w-full metallic-panel p-3 pointer-events-auto flex flex-col max-h-[46vh] overflow-y-auto">
            
            {/* 1. MINERS SUBPANEL */}
            {isWorkersOpen && (
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center border-b-2 border-zinc-700 pb-1.5">
                  <span className="font-display tracking-widest text-sm uppercase flex items-center gap-2 text-cyan-400">
                    <DynamicIcon name={icons.buildings.miner.name} library={icons.buildings.miner.library} className="w-4 h-4" /> Operations
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="metallic-panel-inset text-[10px] text-gray-400 px-2 py-0.5 rounded-sm font-sans font-bold shrink-0">
                      IDLE: <span className={unassignedMiners > 0 ? "text-yellow-400 animate-pulse drop-shadow-md" : "text-gray-300"}>{unassignedMiners}</span> / {totalMiners}
                    </span>
                    <button 
                      onClick={() => setIsWorkersOpen(false)} 
                      className="metallic-button p-1 text-zinc-400 hover:text-white rounded-sm"
                    >
                      <DynamicIcon name={icons.ui.close.name} library={icons.ui.close.library} className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {totalMiners === 0 ? (
                  <div className="text-center py-4 px-3 metallic-panel-inset w-full">
                    <p className="text-xs text-zinc-400 mb-2.5 font-sans font-bold uppercase">Deploy Command Center (Base) to authorize personnel.</p>
                    <button 
                      onClick={() => {
                        setIsBuildOpen(true);
                        setIsWorkersOpen(false);
                      }}
                      className="w-full metallic-button flex items-center justify-center gap-1.5 h-9 rounded-sm font-display text-xs text-yellow-400 uppercase tracking-widest"
                    >
                      <DynamicIcon name={icons.ui.hammer.name} library={icons.ui.hammer.library} className="w-4 h-4" />
                      <span>Open Structures</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {!hasBase && (
                      <div className="bg-amber-950/40 border border-amber-900/30 text-amber-500 rounded p-1.5 text-[10px] text-center font-bold">
                        🔒 Construct Faction Base to assign labor
                      </div>
                    )}
                    {/* Auto Assign switch */}
                    <button
                      onClick={() => {
                        if (!hasBase) return;
                        setAutoAssign(!autoAssign);
                      }}
                      disabled={!hasBase}
                      className={`flex justify-between items-center metallic-panel-inset hover:bg-zinc-800 px-2.5 py-1.5 h-10 w-full transition-colors font-sans text-left ${
                        !hasBase ? 'opacity-35 grayscale contrast-75 pointer-events-none' : ''
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="text-xs font-display tracking-wider text-zinc-200 leading-none uppercase">Auto-Assign Operations</span>
                        <span className="text-[8.5px] text-cyan-400 font-bold mt-0.5 uppercase">Optimize resource logistics</span>
                      </div>
                      <div className={`relative inline-flex h-5.5 w-10 shrink-0 border-2 border-transparent transition-colors duration-200 ease-in-out ${autoAssign ? 'bg-cyan-600' : 'bg-zinc-800'}`}>
                        <span className={`pointer-events-none inline-block h-4.5 w-4.5 transform bg-white shadow transition duration-200 ease-in-out ${autoAssign ? 'translate-x-4.5' : 'translate-x-0'}`} />
                      </div>
                    </button>

                    {/* Quick Train button */}
                    {(() => {
                      const isCostTrait = store.me?.traits?.includes('cost');
                      const modifier = isCostTrait ? 0.75 : 1.0;
                      const buildingData = (buildings as any).miner;
                      const baseConstructionLvl = store.me?.upgrades?.base_construction || 0;
                      const discountFactor = Math.max(0.4, 1.0 - (baseConstructionLvl * 0.10));

                      const minerCost = {
                        w: Math.floor(buildingData.cost.wood * modifier * discountFactor),
                        s: Math.floor(buildingData.cost.stone * modifier * discountFactor)
                      };
                      const canAffordMiner = inventory.wood >= minerCost.w && inventory.stone >= minerCost.s;
                      const isBtnDisabled = !hasBase || !canAffordMiner;
                      return (
                        <button
                          onClick={() => {
                            if (!hasBase) {
                              alert('You must construct a Base first to train miners!');
                              return;
                            }
                            if (socket) socket.emit('train_unit', { type: 'miner' });
                          }}
                          disabled={isBtnDisabled}
                          className={`flex items-center justify-center gap-1.5 h-10 w-full font-display uppercase tracking-widest text-xs transition-all active:scale-[0.98] ${
                            !hasBase
                              ? 'metallic-button opacity-35 grayscale contrast-75 pointer-events-none text-slate-500'
                              : canAffordMiner
                                ? 'metallic-button-selected text-white'
                                : 'metallic-button text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          <DynamicIcon name={icons.ui.userPlus.name} library={icons.ui.userPlus.library} className="w-4 h-4" />
                          <span>Buy Worker ({minerCost.w}w {minerCost.s}s)</span>
                        </button>
                      );
                    })()}

                    {/* Rows */}
                    <div className={`space-y-1 ${!hasBase ? 'opacity-35 grayscale contrast-75 pointer-events-none select-none' : ''}`}>
                      {[
                        { id: 'wood', label: 'Wood', color: 'text-amber-500', val: woodMiners, icon: getIconComponent(icons.resources.wood.name, icons.resources.wood.library), iconCol: icons.resources.wood.color },
                        { id: 'stone', label: 'Stone', color: 'text-slate-300', val: stoneMiners, icon: getIconComponent(icons.resources.stone.name, icons.resources.stone.library), iconCol: icons.resources.stone.color },
                        { id: 'gold', label: 'Gold', color: 'text-yellow-400', val: goldMiners, icon: getIconComponent(icons.resources.gold.name, icons.resources.gold.library), iconCol: icons.resources.gold.color }
                      ].map(r => (
                        <div key={r.id} className="flex items-center justify-between metallic-panel-inset p-1.5 bg-zinc-900/50 hover:bg-zinc-900 border-x-0 border-b-0 border-t-zinc-800">
                          <div className="flex items-center gap-2 px-1 font-bold">
                            <r.icon className="w-4 h-4 dynamic-icon-color" style={{ '--icon-color': r.iconCol } as React.CSSProperties} />
                            <span className={`${r.color} text-[11px] font-display tracking-widest uppercase`}>{r.label}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => socket?.emit('assign_miner', { resource: r.id, delta: -1 })}
                              disabled={r.val === 0 || !hasBase}
                              className="w-8 h-8 flex items-center justify-center metallic-button disabled:opacity-25 text-white font-black text-sm active:scale-[0.98] cursor-pointer"
                            >
                              -
                            </button>
                            <span className="w-8 text-center font-display font-extrabold text-cyan-400 text-sm py-1 bg-zinc-950 border border-black shadow-[inset_0_2px_4px_rgba(0,0,0,1)]">
                              {r.val}
                            </span>
                            <button
                              onClick={() => socket?.emit('assign_miner', { resource: r.id, delta: 1 })}
                              disabled={autoAssign || unassignedMiners === 0 || !hasBase}
                              className="w-8 h-8 flex items-center justify-center metallic-button disabled:opacity-25 text-white font-black text-sm active:scale-[0.98] cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 2. BUILD SUBPANEL */}
            {isBuildOpen && (() => {
              const isCostTrait = store.me?.traits?.includes('cost');
              const modifier = isCostTrait ? 0.75 : 1.0;
              
              const getFinalCost = (type: string) => {
                const bData = (buildings as any)[type];
                const cost = bData.cost;
                const baseConstructionLvl = store.me?.upgrades?.base_construction || 0;
                const discountFactor = Math.max(0.4, 1.0 - (baseConstructionLvl * 0.10));

                return {
                  wood: Math.floor((cost.wood || 0) * modifier * discountFactor),
                  stone: Math.floor((cost.stone || 0) * modifier * discountFactor),
                  gold: Math.floor((cost.gold || 0) * modifier * discountFactor)
                };
              };

              const baseCost = getFinalCost('base');
              const minerCost = getFinalCost('miner');
              const wallCost = getFinalCost('wall');
              const turretCost = getFinalCost('turret');

              const canAffordMiner = inventory.wood >= minerCost.wood && inventory.stone >= minerCost.stone;

              const isWorkerLocked = !hasBase;
              const isWallTurretLocked = !hasBase || (hasBase && totalMiners < 3);

              return (
                <div className="flex flex-col gap-2.5">
                  <div className="flex justify-between items-center border-b-2 border-zinc-700 pb-1.5">
                    <span className="font-display tracking-widest text-sm uppercase flex items-center gap-2 text-cyan-400">
                      <DynamicIcon name={icons.ui.hammer.name} library={icons.ui.hammer.library} className="w-4 h-4" /> Structures & Units
                    </span>
                    <button 
                      onClick={() => { setIsBuildOpen(false); setBuildMode(null); }} 
                      className="metallic-button p-1 text-zinc-400 hover:text-white rounded-sm"
                    >
                      <DynamicIcon name={icons.ui.close.name} library={icons.ui.close.library} className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex flex-col gap-1.5 max-h-[30vh] overflow-y-auto pr-0.5">
                    {/* Faction Base */}
                    {!hasBase && (
                      <button
                        onClick={() => setBuildMode(buildMode === 'base' ? null : 'base')}
                        disabled={hasBase}
                        className={`flex items-center justify-between px-3 h-10 transition-all cursor-pointer ${
                          buildMode === 'base'
                            ? 'metallic-button-selected text-white active:scale-[0.98]' 
                            : 'metallic-button text-gray-200 active:scale-[0.98]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <DynamicIcon name={icons.buildings.base.name} library={icons.buildings.base.library} className="w-4 h-4 text-yellow-400" />
                          <span className="text-[11px] uppercase font-display tracking-widest">Deploy Base</span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] font-sans font-bold">
                          <div className="flex items-center gap-1">
                            <span className={inventory.wood < baseCost.wood ? "text-red-400" : "text-zinc-400"}>{baseCost.wood}w</span>
                            <span className={inventory.stone < baseCost.stone ? "text-red-400" : "text-zinc-400"}>{baseCost.stone}s</span>
                            <span className={inventory.gold < baseCost.gold ? "text-red-400" : "text-zinc-400"}>{baseCost.gold}g</span>
                          </div>
                        </div>
                      </button>
                    )}

                    {/* Buy Worker */}
                    <button
                      onClick={() => {
                        if (!hasBase) {
                          alert('You must construct a Base first to train miners!');
                          return;
                        }
                        if (socket) socket.emit('train_unit', { type: 'miner' });
                      }}
                      disabled={isWorkerLocked || !canAffordMiner}
                      className={`flex items-center justify-between px-3 h-10 transition-all cursor-pointer ${
                        isWorkerLocked || !canAffordMiner
                          ? 'metallic-button opacity-40 grayscale pointer-events-none text-zinc-500'
                          : 'metallic-button text-white active:scale-[0.98]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <DynamicIcon name={icons.ui.userPlus.name} library={icons.ui.userPlus.library} className={`w-4 h-4 ${isWorkerLocked ? 'text-zinc-600' : 'text-cyan-400'}`} />
                        <span className="text-[11px] uppercase font-display tracking-widest">Requisition Worker</span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-mono font-bold">
                        {isWorkerLocked ? (
                          <span className="text-[9px] uppercase font-sans text-slate-500 tracking-wide">Locked</span>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className={inventory.wood < minerCost.wood ? "text-red-400" : "text-slate-300"}>{minerCost.wood}w</span>
                            <span className={inventory.stone < minerCost.stone ? "text-red-400" : "text-slate-300"}>{minerCost.stone}s</span>
                          </div>
                        )}
                      </div>
                    </button>

                    {/* Defensive Wall */}
                    <button
                      onClick={() => setBuildMode(buildMode === 'wall' ? null : 'wall')}
                      disabled={isWallTurretLocked}
                      className={`flex items-center justify-between px-3 h-10 transition-all cursor-pointer ${
                        isWallTurretLocked
                          ? 'metallic-button opacity-40 grayscale pointer-events-none text-zinc-500'
                          : buildMode === 'wall'
                            ? 'metallic-button-selected text-white active:scale-[0.98]' 
                            : 'metallic-button text-white active:scale-[0.98]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <DynamicIcon name={icons.buildings.wall.name} library={icons.buildings.wall.library} className={`w-4 h-4 ${isWallTurretLocked ? 'text-zinc-600' : 'text-gray-400'}`} />
                        <span className="text-[11px] uppercase font-display tracking-widest">Fortification Wall</span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-sans font-bold">
                        {isWallTurretLocked ? (
                          <span className="text-[9px] uppercase font-sans text-zinc-600 tracking-wide">Locked</span>
                        ) : (
                          <span className={inventory.stone < wallCost.stone ? "text-red-400" : "text-zinc-400"}>{wallCost.stone}s</span>
                        )}
                      </div>
                    </button>

                    {/* Defense Turret */}
                    <button
                      onClick={() => setBuildMode(buildMode === 'turret' ? null : 'turret')}
                      disabled={isWallTurretLocked}
                      className={`flex items-center justify-between px-3 h-10 transition-all cursor-pointer ${
                        isWallTurretLocked
                          ? 'metallic-button opacity-40 grayscale pointer-events-none text-zinc-500'
                          : buildMode === 'turret'
                            ? 'metallic-button-selected text-white active:scale-[0.98]' 
                            : 'metallic-button text-white active:scale-[0.98]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <DynamicIcon name={icons.buildings.turret.name} library={icons.buildings.turret.library} className={`w-4 h-4 ${isWallTurretLocked ? 'text-zinc-600' : 'text-red-500'}`} />
                        <span className="text-[11px] uppercase font-display tracking-widest">Defense Turret</span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-sans font-bold">
                        {isWallTurretLocked ? (
                          <span className="text-[9px] uppercase font-sans text-zinc-600 tracking-wide">Locked</span>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className={inventory.wood < turretCost.wood ? "text-red-400" : "text-zinc-400"}>{turretCost.wood}w</span>
                            <span className={inventory.stone < turretCost.stone ? "text-red-400" : "text-zinc-400"}>{turretCost.stone}s</span>
                            <span className={inventory.gold < turretCost.gold ? "text-red-400" : "text-zinc-400"}>{turretCost.gold}g</span>
                          </div>
                        )}
                      </div>
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* 3. UPGRADES SUBPANEL */}
            {isUpgradesOpen && (() => {
              const getUpgradeCost = (upg: any, level: number) => {
                const factor = Math.pow(1.5, level);
                return {
                  wood: Math.round(upg.baseCost.wood * factor),
                  stone: Math.round(upg.baseCost.stone * factor),
                  gold: Math.round(upg.baseCost.gold * factor)
                };
              };

              const getLevel = (id: string) => store.me?.upgrades?.[id] || 0;

              return (
                <div className="flex flex-col gap-2.5">
                  <div className="flex justify-between items-center border-b-2 border-zinc-700 pb-1.5 font-bold">
                    <span className="font-display tracking-widest text-sm uppercase flex items-center gap-2 text-cyan-400">
                      <DynamicIcon name={icons.ui.upgrade.name} library={icons.ui.upgrade.library} className="w-4 h-4 text-cyan-400" /> Tech Upgrades
                    </span>
                    <button 
                      onClick={() => setIsUpgradesOpen(false)} 
                      className="metallic-button p-1 text-zinc-400 hover:text-white rounded-sm transition-colors"
                    >
                      <DynamicIcon name={icons.ui.close.name} library={icons.ui.close.library} className="w-4 h-4" />
                    </button>
                  </div>

                  {!hasBase && (
                    <div className="metallic-panel-inset text-zinc-400 rounded-sm p-2 flex items-center justify-center gap-1.5 text-[10px] font-sans font-bold uppercase">
                      <span>🔒 Deploy Base to authorize research</span>
                    </div>
                  )}

                  <div className="flex flex-col gap-1 pr-0.5 max-h-[30vh] overflow-y-auto">
                    {upgrades.map(upg => {
                      const lvl = getLevel(upg.id);
                      const cost = getUpgradeCost(upg, lvl);
                      const canAfford = (inventory.wood >= cost.wood) && (inventory.stone >= cost.stone) && (inventory.gold >= cost.gold);

                      let bonusStr = '';
                      if (upg.id === 'miner_speed') {
                        bonusStr = `${lvl * 25}% → ${(lvl + 1) * 25}%`;
                      } else if (upg.id === 'miner_capacity') {
                        const baseCap = (buildings as any).miner.baseCapacity;
                        bonusStr = `${baseCap + lvl * 10} → ${baseCap + (lvl + 1) * 10}`;
                      } else if (upg.id === 'base_tax') {
                        bonusStr = `+${lvl * 5} → +${(lvl + 1) * 5}`;
                      } else if (upg.id === 'base_construction') {
                        bonusStr = `${Math.min(60, lvl * 10)}% → ${Math.min(60, (lvl + 1) * 10)}%`;
                      } else if (upg.id === 'wall_solar') {
                        bonusStr = `+${lvl} → +${lvl + 1}`;
                      } else if (upg.id === 'wall_magnetic') {
                        bonusStr = `${lvl * 15}% → ${(lvl + 1) * 15}%`;
                      } else if (upg.id === 'turret_collector') {
                        bonusStr = `+${lvl * 2} → +${(lvl + 1) * 2}`;
                      } else if (upg.id === 'turret_beam') {
                        bonusStr = `+${lvl * 5} → +${(lvl + 1) * 5}`;
                      }

                      return (
                        <div 
                          key={upg.id} 
                          className={`metallic-panel p-2 rounded-sm flex items-center justify-between gap-1.5 transition-all ${
                            !hasBase ? 'opacity-35 grayscale contrast-75 cursor-not-allowed select-none pointer-events-none' : 'hover:border-zinc-500'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className="p-1.5 metallic-panel-inset rounded-sm shrink-0">
                              <DynamicIcon name={upg.icon} library={upg.iconLibrary} className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-display tracking-widest text-zinc-100 uppercase truncate leading-tight">{upg.name}</span>
                                <span className="text-[9px] font-display font-bold text-cyan-400 bg-cyan-950/40 px-1 border border-cyan-900 rounded-sm shrink-0">L{lvl}</span>
                              </div>
                              <div className="text-[8.5px] flex items-center gap-1.5 leading-none font-sans mt-0.5">
                                <span className="text-zinc-400 uppercase tracking-wider">{upg.target}</span>
                                <span className="text-zinc-600">•</span>
                                <span className="text-yellow-400 font-semibold">{upg.effect}</span>
                              </div>
                              <span className="text-[8.5px] text-zinc-500 leading-tight font-sans mt-0.5">
                                {upg.description} {bonusStr && <span className="text-cyan-400 font-display font-bold tracking-wider">({bonusStr})</span>}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex flex-col items-end text-[9px] font-sans leading-none font-bold gap-0.5">
                              {cost.wood > 0 && <span className={inventory.wood < cost.wood ? "text-red-400" : "text-zinc-400"}>{cost.wood}w</span>}
                              {cost.stone > 0 && <span className={inventory.stone < cost.stone ? "text-red-400" : "text-zinc-400"}>{cost.stone}s</span>}
                              {cost.gold > 0 && <span className={inventory.gold < cost.gold ? "text-red-400" : "text-zinc-400"}>{cost.gold}g</span>}
                            </div>
                            <button
                              onClick={() => {
                                if (socket) socket.emit('purchase_upgrade', { upgradeId: upg.id });
                              }}
                              disabled={!canAfford}
                              className={`h-8 px-2.5 rounded-sm font-display font-bold text-[10px] uppercase tracking-widest transition-all active:scale-[0.98] ${
                                canAfford
                                  ? 'metallic-button text-cyan-400 hover:text-cyan-300 shadow-sm'
                                  : 'metallic-button opacity-50 text-zinc-500 cursor-not-allowed'
                              }`}
                            >
                              Up
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Floating Command Tab Bar (Highly tactile 48px height minimums with glowing active states) */}
        <div className="w-full flex pointer-events-auto border-[3px] border-[#0b1016] shadow-2xl rounded-xl overflow-hidden bg-[#151c24]">
          {/* Miners button */}
          <button
            onClick={() => {
              setIsWorkersOpen(w => !w);
              setIsBuildOpen(false);
              setIsUpgradesOpen(false);
              setBuildMode(null);
            }}
            className={`flex-1 h-14 flex flex-col justify-center items-center transition-all relative active:scale-[0.98] cursor-pointer border-r-[2px] border-[#0a0e12] ${
              isWorkersOpen
                ? 'metallic-button-selected z-10 rounded-none border-none'
                : 'bg-gradient-to-b from-[#2a3746] to-[#1c252f] text-[#67809a] opacity-90 hover:from-[#344558] hover:to-[#1d2732] hover:text-white rounded-none shadow-[inset_0_4px_6px_rgba(0,0,0,0.4)]'
            }`}
          >
            <DynamicIcon name={icons.buildings.miner.name} library={icons.buildings.miner.library} className={`w-5 h-5 sm:w-6 sm:h-6 mb-0.5 ${isWorkersOpen ? 'text-cyan-100' : 'text-cyan-500'}`} />
            <span className="text-[11px] sm:text-xs font-display tracking-widest uppercase leading-none mt-0.5">Miners</span>
            {unassignedMiners > 0 && (
              <span className="absolute top-1 right-2.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-sm bg-yellow-400 opacity-75"></span>
                <span className="relative inline-flex rounded-sm h-2 w-2 bg-yellow-500"></span>
              </span>
            )}
          </button>

          {/* Build button */}
          <button
            onClick={() => {
              setIsBuildOpen(b => !b);
              setIsWorkersOpen(false);
              setIsUpgradesOpen(false);
              setBuildMode(null);
            }}
            className={`flex-1 h-14 flex flex-col justify-center items-center transition-all relative active:scale-[0.98] cursor-pointer border-r-[2px] border-[#0a0e12] ${
              isBuildOpen
                ? 'metallic-button-selected z-10 rounded-none border-none'
                : shouldFlashBuild
                  ? 'bg-gradient-to-b from-[#991b1b] to-[#5a1010] border-t-2 border-t-[#f87171] text-red-100 opacity-100 animate-pulse rounded-none shadow-[inset_0_4px_8px_rgba(0,0,0,0.6)]'
                  : 'bg-gradient-to-b from-[#2a3746] to-[#1c252f] text-[#67809a] opacity-90 hover:from-[#344558] hover:to-[#1d2732] hover:text-white rounded-none shadow-[inset_0_4px_6px_rgba(0,0,0,0.4)]'
            }`}
          >
            <DynamicIcon name={icons.ui.hammer.name} library={icons.ui.hammer.library} className={`w-5 h-5 sm:w-6 sm:h-6 mb-0.5 ${isBuildOpen ? 'text-cyan-100' : shouldFlashBuild ? 'text-red-200' : 'text-cyan-500'}`} />
            <span className="text-[11px] sm:text-xs font-display tracking-widest uppercase leading-none mt-0.5">Structures</span>
          </button>

          {/* Upgrades button */}
          <button
            onClick={() => {
              setIsUpgradesOpen(u => !u);
              setIsBuildOpen(false);
              setIsWorkersOpen(false);
              setBuildMode(null);
            }}
            className={`flex-1 h-14 flex flex-col justify-center items-center transition-all relative active:scale-[0.98] cursor-pointer ${
              isUpgradesOpen
                ? 'metallic-button-selected z-10 rounded-none border-none'
                : 'bg-gradient-to-b from-[#2a3746] to-[#1c252f] text-[#67809a] opacity-90 hover:from-[#344558] hover:to-[#1d2732] hover:text-white rounded-none shadow-[inset_0_4px_6px_rgba(0,0,0,0.4)]'
            }`}
          >
            <DynamicIcon name={icons.ui.upgrade.name} library={icons.ui.upgrade.library} className={`w-5 h-5 sm:w-6 sm:h-6 mb-0.5 ${isUpgradesOpen ? 'text-cyan-100' : 'text-cyan-500'}`} />
            <span className="text-[11px] sm:text-xs font-display tracking-widest uppercase leading-none mt-0.5">Upgrades</span>
          </button>
        </div>
      </div>

      {isHelpOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm pointer-events-auto">
          <div className="metallic-panel p-6 max-w-md w-full shadow-[0_0_50px_rgba(0,0,0,0.8)] text-white">
            <div className="flex justify-between items-center mb-4 border-b-2 border-zinc-700 pb-2">
              <h2 className="text-xl font-display uppercase tracking-widest text-cyan-400 font-bold flex items-center gap-2">
                <DynamicIcon name={icons.ui.help.name} library={icons.ui.help.library} className="w-6 h-6 border" /> Systems Manual
              </h2>
              <button onClick={() => setIsHelpOpen(false)} className="metallic-button p-1 text-zinc-400 hover:text-white rounded-sm">
                <DynamicIcon name={icons.ui.close.name} library={icons.ui.close.library} className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-sm font-sans text-zinc-300">
              <p><strong className="text-white font-display tracking-widest uppercase">Objective:</strong> Deploy command center, conscript workers, and expand influence.</p>
              <p><strong className="text-white font-display tracking-widest uppercase">Navigation:</strong> Engage <kbd className="metallic-panel border-none px-1 rounded-sm mx-0.5 font-bold shadow-none text-cyan-400">W/A/S/D</kbd> engines or optical drag. Tap map to initiate unit relocation. Pinch to zoom optics.</p>
              <p><strong className="text-white font-display tracking-widest uppercase">Extraction:</strong> Direct command agent to raw elements for manual yield.</p>
              <p><strong className="text-white font-display tracking-widest uppercase">Construction:</strong> Utilize Operations interface to deploy <strong className="text-cyan-400 drop-shadow-md">Command Base</strong>. Base authorization unlocks worker logistics and defensive arrays.</p>
              <p><strong className="text-white font-display tracking-widest uppercase">Logistics:</strong> Approve workers and distribute labor assignments optimally.</p>
            </div>
            <div className="mt-6">
              <button 
                onClick={() => setIsHelpOpen(false)}
                className="w-full metallic-button-selected text-white font-display uppercase tracking-widest py-2 px-4 rounded-sm transition-colors cursor-pointer text-sm active:scale-[0.98]">
                Acknowledge Command
              </button>
            </div>
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm pointer-events-auto">
          <div className="metallic-panel p-6 max-w-sm w-full shadow-[0_0_50px_rgba(0,0,0,0.8)] text-white">
            <div className="flex justify-between items-center mb-4 border-b-2 border-zinc-700 pb-2">
              <h2 className="text-xl font-display uppercase tracking-widest font-bold flex items-center gap-2 text-cyan-400">
                <DynamicIcon name={icons.ui.settings.name} library={icons.ui.settings.library} className="w-5 h-5" /> Optical Overlay Parameters
              </h2>
              <button onClick={() => setIsSettingsOpen(false)} className="metallic-button p-1 text-zinc-400 hover:text-white rounded-sm transition-colors">
                <DynamicIcon name={icons.ui.close.name} library={icons.ui.close.library} className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4 font-sans font-bold">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={mapSettings.showBuildAreaBorder} 
                  onChange={(e) => saveMapSettings({ ...mapSettings, showBuildAreaBorder: e.target.checked })}
                  className="w-4 h-4 rounded-sm border-zinc-500 bg-zinc-800 text-cyan-500 focus:ring-0 cursor-pointer accent-cyan-500"
                />
                <span className="text-sm font-display tracking-wider text-zinc-300 group-hover:text-white uppercase transition-colors">Construction Zones</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={mapSettings.showTowerBorder} 
                  onChange={(e) => saveMapSettings({ ...mapSettings, showTowerBorder: e.target.checked })}
                  className="w-4 h-4 rounded-sm border-zinc-500 bg-zinc-800 text-cyan-500 focus:ring-0 cursor-pointer accent-cyan-500"
                />
                <span className="text-sm font-display tracking-wider text-zinc-300 group-hover:text-white uppercase transition-colors">Turret Ranges</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={mapSettings.showZoneBorder} 
                  onChange={(e) => saveMapSettings({ ...mapSettings, showZoneBorder: e.target.checked })}
                  className="w-4 h-4 rounded-sm border-zinc-500 bg-zinc-800 text-cyan-500 focus:ring-0 cursor-pointer accent-cyan-500"
                />
                <span className="text-sm font-display tracking-wider text-zinc-300 group-hover:text-white uppercase transition-colors">Sector Grids</span>
              </label>
              
              <label className="flex items-center gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={mapSettings.showGrid} 
                  onChange={(e) => saveMapSettings({ ...mapSettings, showGrid: e.target.checked })}
                  className="w-4 h-4 rounded-sm border-zinc-500 bg-zinc-800 text-cyan-500 focus:ring-0 cursor-pointer accent-cyan-500"
                />
                <span className="text-sm font-display tracking-wider text-zinc-300 group-hover:text-white uppercase transition-colors">Tactical Overlay Grid</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {isPlayersListOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm pointer-events-auto">
          <div className="metallic-panel p-6 max-w-sm w-full shadow-[0_0_50px_rgba(0,0,0,0.8)] text-white">
            <div className="flex justify-between items-center mb-4 border-b-2 border-zinc-700 pb-2">
              <h2 className="text-xl font-display font-bold uppercase tracking-widest flex items-center gap-2 text-cyan-400">
                <DynamicIcon name={icons.ui.users.name} library={icons.ui.users.library} className="w-5 h-5 animate-pulse" /> Active Agents ({playersCount})
              </h2>
              <button onClick={() => setIsPlayersListOpen(false)} className="metallic-button p-1 text-zinc-400 hover:text-white rounded-sm transition-colors">
                <DynamicIcon name={icons.ui.close.name} library={icons.ui.close.library} className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              {(() => {
                const playersWithScores = playersList.map(player => {
                  const upgradeScore = Object.values(player.upgrades || {}).reduce((a, b) => a + b, 0) * 150;
                  const playerBuildings = Object.values(store.state?.buildings || {}).filter(b => b.ownerId === player.id);
                  const buildingScore = playerBuildings.reduce((sum, b) => {
                    if (b.type === 'base') return sum + 500;
                    if (b.type === 'turret') return sum + 200;
                    if (b.type === 'wall') return sum + 50;
                    return sum;
                  }, 0);
                  const playerUnits = Object.values(store.state?.units || {}).filter(u => u.ownerId === player.id);
                  const unitScore = playerUnits.length * 100;
                  const activityScore = upgradeScore + buildingScore + unitScore + 10;
                  
                  const wVal = player.inventory?.wood || 0;
                  const sVal = player.inventory?.stone || 0;
                  const gVal = player.inventory?.gold || 0;
                  const rawResourcePoints = (wVal + sVal + gVal * 3) * 0.1;

                  // Limit resources contribution to 10% maximum of the total score
                  const resourceScore = Math.min(rawResourcePoints, activityScore / 9);
                  const totalScore = Math.floor(activityScore + resourceScore);

                  return {
                    player,
                    upgradeScore,
                    buildingScore,
                    unitScore,
                    resourceScore,
                    totalScore,
                    buildingsCount: playerBuildings.length,
                    unitsCount: playerUnits.length
                  };
                });

                // Sort players descending by their total calculated score
                playersWithScores.sort((a, b) => b.totalScore - a.totalScore);

                return playersWithScores.map(({ player, totalScore, upgradeScore, buildingScore, unitScore, resourceScore, buildingsCount, unitsCount }, rank) => {
                  const isMe = player.id === store.me?.id;
                  return (
                    <div 
                      key={player.id} 
                      className={`flex flex-col p-2.5 rounded-sm transition-all gap-1.5 ${
                        isMe ? 'metallic-button-selected' : 'metallic-panel-inset text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2.5">
                          {/* Rank indicator badge */}
                          <span className={`text-[9px] font-mono font-bold w-4.5 h-4.5 rounded flex items-center justify-center ${
                            rank === 0 ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                            rank === 1 ? 'bg-slate-300/20 text-slate-300 border border-slate-300/30' :
                            rank === 2 ? 'bg-amber-600/20 text-amber-500 border border-amber-600/30' :
                            'bg-gray-800 text-gray-400'
                          }`}>
                            #{rank + 1}
                          </span>

                          {/* Mascot Icon */}
                          {(() => {
                            const mascot = getMascot(player.traits);
                            if (!mascot) return null;
                            return (
                              <div
                                className="w-8 h-8 rounded bg-black/40 border flex items-center justify-center shadow-inner shrink-0"
                                style={{ borderColor: mascot.color + '40' }}
                                title={mascot.label}
                              >
                                <DynamicIcon name={mascot.name} library={mascot.library} size={20} style={{ color: mascot.color }} />
                              </div>
                            );
                          })()}
                          
                          <div className="relative">
                            <img 
                              src={`https://api.dicebear.com/7.x/croodles/svg?seed=${encodeURIComponent(player.name || player.id)}`} 
                              className="w-8 h-8 rounded-full border bg-gray-950 p-0.5 shadow dynamic-player-border"
                              style={{ '--player-color': player.color } as React.CSSProperties}
                              alt={player.name}
                              referrerPolicy="no-referrer"
                            />
                            <span 
                              className="absolute bottom-0 right-0 w-2 h-2 rounded-full border border-gray-800 dynamic-player-bg"
                              style={{ '--player-color': player.color } as React.CSSProperties}
                            />
                          </div>
                          
                          <div className="flex flex-col">
                            <span className="font-bold text-xs flex items-center gap-1 text-white">
                              {(() => {
                                const mascot = getMascot(player.traits);
                                return mascot ? `${mascot.label} - ${player.name}` : player.name;
                              })()}
                              {isMe && <span className="text-[8px] bg-indigo-500/30 text-indigo-300 font-extrabold px-1 rounded">YOU</span>}
                            </span>
                            <span className="text-[9px] text-gray-450 font-mono">
                              X: {Math.round(player.x)}, Y: {Math.round(player.y)}
                            </span>
                          </div>
                        </div>

                        {/* Beautiful Score Badge */}
                        <div className="flex flex-col items-end shrink-0">
                          <span className="text-sm font-display tracking-widest font-black text-cyan-400">
                            ★ {totalScore}
                          </span>
                          <span className="text-[8px] text-zinc-500 uppercase tracking-widest font-bold">
                            Score
                          </span>
                        </div>
                      </div>

                      {/* Score breakdown bar & indicators */}
                      <div className="flex items-center justify-between pt-1 border-t-2 border-zinc-700/50 text-[9px] text-zinc-400 font-sans font-bold">
                        <div className="flex gap-2">
                          <span title="Buildings score">🏰 <strong className="text-zinc-200">{buildingsCount}</strong></span>
                          <span title="Miners score">👷 <strong className="text-zinc-200">{unitsCount}</strong></span>
                          <span title="Upgrades score">⚙️ <strong className="text-cyan-400">L{(upgradeScore / 150)}</strong></span>
                          <span title="Inventory score representing 10% max of score">🎒 <strong className="text-zinc-200">+{Math.floor(resourceScore)}</strong></span>
                        </div>

                        <button
                          onClick={() => {
                            autoFollow.current = false;
                            moveTarget.current = null;
                            camera.current.x = player.x;
                            camera.current.y = player.y;
                            setIsPlayersListOpen(false);
                          }}
                          className="metallic-button px-2 py-0.5 text-[9px] font-display uppercase tracking-widest text-cyan-400 rounded-sm active:scale-[0.98]"
                        >
                          Locate
                        </button>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            <div className="mt-4">
              <button 
                onClick={() => setIsPlayersListOpen(false)}
                className="w-full metallic-button-selected text-white font-display uppercase tracking-widest py-2 px-4 rounded-sm transition-colors text-sm active:scale-[0.98]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {store.me && store.me.traits && store.me.traits.length === 0 && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md pointer-events-auto">
          <div className="metallic-panel p-6 max-w-md w-full shadow-[0_0_50px_rgba(0,0,0,0.8)] text-white">
            <div className="mb-4 text-center">
              <h2 className="text-2xl font-display tracking-widest uppercase font-bold mb-2 text-cyan-400">Select Doctrine</h2>
              <p className="text-sm font-sans font-bold text-zinc-400 uppercase">Authorize <strong className="text-white">2 protocols</strong> for your command.</p>
            </div>

            {selectedTraits.length === 2 && (() => {
              const mascot = getMascot(selectedTraits);
              if (!mascot) return null;
              return (
                <div className="mb-6 p-4 rounded bg-zinc-900/50 border border-zinc-800 flex items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="p-3 rounded-full bg-black border-2 shadow-[0_0_15px_rgba(0,0,0,0.5)]" style={{ borderColor: mascot.color }}>
                    <DynamicIcon name={mascot.name} library={mascot.library} size={32} style={{ color: mascot.color }} />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] font-black text-zinc-500 mb-0.5">Your Identity</div>
                    <div className="text-xl font-display uppercase tracking-widest font-black text-white">{mascot.label}</div>
                  </div>
                </div>
              );
            })()}
            
            <div className="flex flex-col gap-2">
               <button 
                  onClick={() => setSelectedTraits(prev => prev.includes('speed') ? prev.filter(t => t !== 'speed') : (prev.length < 2 ? [...prev, 'speed'] : prev))}
                  className={`flex flex-col p-3 transition-colors cursor-pointer disabled:opacity-50 ${selectedTraits.includes('speed') ? 'metallic-button-selected' : 'metallic-button text-zinc-300'}`}>
                  <strong className="font-display tracking-widest uppercase text-lg">Velocity</strong>
                  <span className="text-[11px] font-sans font-bold text-zinc-400">Increases the movement speed of all your units.</span>
               </button>
               <button 
                  onClick={() => setSelectedTraits(prev => prev.includes('strength') ? prev.filter(t => t !== 'strength') : (prev.length < 2 ? [...prev, 'strength'] : prev))}
                  className={`flex flex-col p-3 transition-colors cursor-pointer disabled:opacity-50 ${selectedTraits.includes('strength') ? 'metallic-button-selected' : 'metallic-button text-zinc-300'}`}>
                  <strong className="font-display tracking-widest uppercase text-lg">Fortitude</strong>
                  <span className="text-[11px] font-sans font-bold text-zinc-400">Adds 50% more health to your buildings and units.</span>
               </button>
               <button 
                  onClick={() => setSelectedTraits(prev => prev.includes('cost') ? prev.filter(t => t !== 'cost') : (prev.length < 2 ? [...prev, 'cost'] : prev))}
                  className={`flex flex-col p-3 transition-colors cursor-pointer disabled:opacity-50 ${selectedTraits.includes('cost') ? 'metallic-button-selected' : 'metallic-button text-zinc-300'}`}>
                  <strong className="font-display tracking-widest uppercase text-lg">Logistics</strong>
                  <span className="text-[11px] font-sans font-bold text-zinc-400">Reduces the cost of all units and buildings by 25%.</span>
               </button>
            </div>

            <div className="mt-6">
              <button 
                disabled={selectedTraits.length !== 2}
                onClick={() => {
                   if (socket && selectedTraits.length === 2) {
                      socket.emit('select_traits', selectedTraits);
                   }
                }}
                className={`w-full font-display uppercase tracking-widest text-sm py-3 px-4 transition-colors cursor-pointer ${
                  selectedTraits.length === 2 ? 'metallic-button-selected text-white active:scale-[0.98]' : 'metallic-button opacity-50 text-zinc-500'
                }`}>
                Confirm Authorization
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edge Zoom Scale Indicator */}
      <div 
        id="edge-zoom-scale"
        className={`absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-center metallic-panel-inset px-2 py-5 shadow-[0_0_15px_rgba(0,0,0,1)] transition-all duration-300 z-30 pointer-events-none select-none ${
          zoomIndicator.visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-6 pointer-events-none'
        }`}
      >
        <span className="text-[10px] font-display font-black text-cyan-400 mb-2.5 whitespace-nowrap drop-shadow-md">
          {Math.round(zoomIndicator.value * 100)}%
        </span>
        {/* Visual vertical slider track */}
        <div className="w-2 h-24 bg-black border border-zinc-700/50 rounded-sm relative overflow-visible flex items-center justify-center">
          <div 
            className="absolute h-full w-full bg-cyan-900 border-x border-cyan-800 rounded-sm bottom-0 left-0 transition-all origin-bottom zoom-indicator-bar"
            style={{ '--zoom-scale-y': (zoomIndicator.value - 0.2) / 2.8 } as React.CSSProperties}
          />
          {/* Knob indicator */}
          <div 
            className="absolute w-4 h-2 rounded-sm bg-cyan-400 border border-white shadow-[0_0_8px_rgba(34,211,238,0.8)] transition-all zoom-indicator-knob"
            style={{ '--zoom-bottom-percent': `${((zoomIndicator.value - 0.2) / 2.8) * 100}%` } as React.CSSProperties}
          />
        </div>
      </div>
    </div>
  );
}
