import React from 'react';
import { icons } from '../../data';
import { DynamicIcon } from '../utils/icons';

interface MenuProps {
  onStart: () => void;
  isConnecting: boolean;
  error: string | null;
  version: string;
}

export const Menu: React.FC<MenuProps> = ({ onStart, isConnecting, error, version }) => {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between p-4 sm:p-8 bg-zinc-950/80 backdrop-blur-sm pointer-events-auto overflow-y-auto no-scrollbar">
      <div className="w-full max-w-lg mt-4 sm:mt-16 text-center">
        <h1 className="text-5xl sm:text-7xl font-black tracking-tighter italic text-transparent bg-clip-text bg-gradient-to-br from-cyan-400 via-white to-blue-600 drop-shadow-[0_0_15px_rgba(34,211,238,0.5)] uppercase">
          Render Strike
        </h1>
        <div className="flex items-center justify-center gap-2 mt-4 opacity-50">
          <div className="w-4 h-4 bg-zinc-400 clip-triangle" />
          <p className="text-[10px] font-mono tracking-[0.3em] uppercase text-zinc-400">Tactical Resource Command</p>
          <div className="w-4 h-4 bg-zinc-400 rotate-180 clip-triangle" />
        </div>
      </div>

      <div className="w-full max-w-sm metallic-panel-inset bg-[#0b1016] border-2 border-black p-3 rounded-md shadow-[0_4px_16px_rgba(0,0,0,0.8)] flex items-center justify-between mt-auto mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-cyan-500/20 flex items-center justify-center border border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.3)]">
            <DynamicIcon name={icons.buildings.base.name} library={icons.buildings.base.library} className="text-cyan-400" size={24} />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Mission Status</span>
            <span className="text-xs font-mono text-cyan-400">READY_TO_DEPLOY</span>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Net Link</span>
          <span className="text-xs font-mono text-emerald-500">ESTABLISHED</span>
        </div>
      </div>

      <div className="w-full max-w-sm grid grid-cols-2 gap-2 sm:gap-3 mb-8 sm:mb-24">
        <button
          onClick={onStart}
          disabled={isConnecting}
          className="col-span-2 metallic-button py-4 text-lg font-black uppercase tracking-widest bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50"
        >
          {isConnecting ? 'Initializing...' : 'Deploy to Zone'}
        </button>
      </div>

      <div className="w-full max-w-lg mt-auto pt-8 border-t border-zinc-800/50 flex justify-between items-center opacity-40 hover:opacity-100 transition-opacity">
        <div className="flex gap-4">
          <span className="text-[10px] font-mono">OS_VER: 4.2.0-STABLE</span>
          <span className="text-[10px] font-mono tracking-tighter uppercase">Build: {version}</span>
        </div>
        <div className="text-[10px] font-mono uppercase tracking-widest">© 2024 RENDER_SYS</div>
      </div>
    </div>
  );
};
