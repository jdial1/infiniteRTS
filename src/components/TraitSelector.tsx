import React from 'react';
import { DynamicIcon, getMascot } from '../utils/icons';

interface TraitSelectorProps {
  selectedTraits: string[];
  setSelectedTraits: React.Dispatch<React.SetStateAction<string[]>>;
  onConfirm: () => void;
}

export const TraitSelector: React.FC<TraitSelectorProps> = ({ selectedTraits, setSelectedTraits, onConfirm }) => {
  const mascot = getMascot(selectedTraits);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="metallic-panel p-6 sm:p-8 max-w-md w-full border-t-4 border-cyan-500 shadow-[0_0_50px_rgba(34,211,238,0.2)]">
        <h2 className="text-3xl font-display tracking-tighter uppercase font-black text-white mb-1">Authorization</h2>
        <p className="text-zinc-500 font-sans font-bold uppercase text-[10px] tracking-widest mb-6">Select two operational specializations</p>

        {mascot && (
          <div className="mb-6 p-4 rounded bg-zinc-900/50 border border-zinc-800 flex items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="p-3 rounded-full bg-black border-2 shadow-[0_0_15px_rgba(0,0,0,0.5)]" style={{ borderColor: mascot.color }}>
              <DynamicIcon name={mascot.name} library={mascot.library} size={32} style={{ color: mascot.color }} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] font-black text-zinc-500 mb-0.5">Your Identity</div>
              <div className="text-xl font-display uppercase tracking-widest font-black text-white">{mascot.label}</div>
            </div>
          </div>
        )}

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
            onClick={onConfirm}
            className={`w-full font-display uppercase tracking-widest text-sm py-3 px-4 transition-colors cursor-pointer ${
              selectedTraits.length === 2 ? 'metallic-button-selected text-white active:scale-[0.98]' : 'metallic-button opacity-50 text-zinc-500'
            }`}>
            Confirm Authorization
          </button>
        </div>
      </div>
    </div>
  );
};
