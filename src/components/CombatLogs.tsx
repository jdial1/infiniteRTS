import React from 'react';

interface CombatLog {
  id: string;
  time: number;
  message: string;
  targetX: number;
  targetY: number;
}

interface CombatLogsProps {
  logs: CombatLog[];
}

export const CombatLogs: React.FC<CombatLogsProps> = ({ logs }) => {
  return (
    <div className="absolute left-1 sm:left-4 top-[88px] sm:top-[104px] z-20 flex flex-col gap-1 pointer-events-auto max-w-[200px] sm:max-w-xs">
      {logs.map(log => (
        <div key={log.id} className="metallic-panel px-2 py-1 text-[10px] font-bold uppercase tracking-tighter text-red-400 bg-red-950/20 border-red-900/30 animate-in slide-in-from-left-2 duration-300">
          {log.message}
        </div>
      ))}
    </div>
  );
};
