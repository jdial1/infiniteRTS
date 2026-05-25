import React from 'react';
import { Player } from '../types';
import { icons } from '../../data';
import { DynamicIcon } from '../utils/icons';

interface HUDProps {
  player: Player | undefined;
  isOffline: boolean;
}

export const HUD: React.FC<HUDProps> = ({ player, isOffline }) => {
  if (!player) return null;

  return (
    <div className="absolute top-1 sm:top-2 left-1 sm:left-2 right-1 sm:right-2 metallic-panel p-0.5 sm:p-1 flex flex-nowrap items-center justify-between gap-1 sm:gap-2 pointer-events-auto z-10 text-white select-none overflow-x-auto no-scrollbar">
      {isOffline && (
        <div className="absolute inset-0 bg-red-900/20 backdrop-blur-[1px] flex items-center justify-center z-50 pointer-events-none">
          <span className="text-[10px] font-bold text-red-400 animate-pulse uppercase tracking-[0.2em]">Connection Lost - Attempting Reconnect</span>
        </div>
      )}

      <div className="flex-1 flex flex-col items-center px-1 sm:px-2 bg-gradient-to-b from-[#1c252f] to-[#151c24] border border-[#2a3746] rounded-sm py-0.5">
        <div className="flex items-center gap-1.5">
          <DynamicIcon name={icons.resources.wood.name} library={icons.resources.wood.library} className="text-emerald-400" size={14} />
          <span className="text-xs sm:text-sm font-mono font-bold text-emerald-400">{Math.floor(player.resources.wood)}</span>
        </div>
        <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-tighter">Carbon</span>
      </div>

      <div className="flex-1 flex flex-col items-center px-1 sm:px-2 bg-gradient-to-b from-[#1c252f] to-[#151c24] border border-[#2a3746] rounded-sm py-0.5">
        <div className="flex items-center gap-1.5">
          <DynamicIcon name={icons.resources.stone.name} library={icons.resources.stone.library} className="text-slate-400" size={14} />
          <span className="text-xs sm:text-sm font-mono font-bold text-slate-200">{Math.floor(player.resources.stone)}</span>
        </div>
        <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-tighter">Silicate</span>
      </div>

      <div className="flex-1 flex flex-col items-center px-1 sm:px-2 bg-gradient-to-b from-[#1c252f] to-[#151c24] border border-[#2a3746] rounded-sm py-0.5">
        <div className="flex items-center gap-1.5">
          <DynamicIcon name={icons.resources.gold.name} library={icons.resources.gold.library} className="text-amber-400" size={14} />
          <span className="text-xs sm:text-sm font-mono font-bold text-amber-400">{Math.floor(player.resources.gold)}</span>
        </div>
        <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-tighter">Aurum</span>
      </div>
    </div>
  );
};
