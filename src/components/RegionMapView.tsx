import React from 'react';
import { RegionPlot, RegionWorldState } from '../game/types';

interface RegionMapViewProps {
  regionWorld: RegionWorldState;
  onSelectPlot: (plotId: string, targetMode: 'god_mode' | 'mayor_mode') => void;
  onClose: () => void;
}

export const RegionMapView: React.FC<RegionMapViewProps> = ({
  regionWorld,
  onSelectPlot,
  onClose,
}) => {
  const plotsList = Object.values(regionWorld.plots);
  const totalPopulation = plotsList.reduce((acc, p) => acc + p.metrics.population, 0);
  const totalTreasury = plotsList.reduce((acc, p) => acc + p.metrics.treasury, 0);
  const incorporatedCount = plotsList.filter((p) => p.incorporated).length;

  return (
    <div className="fixed inset-0 z-30 bg-[#070d15]/95 backdrop-blur-md flex flex-col justify-between p-3 sm:p-6 md:p-8 overflow-y-auto">
      {/* Top Header Row */}
      <div className="max-w-6xl w-full mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🗺️</span>
            <h1 className="text-xl sm:text-2xl font-bold font-display text-white tracking-wide">
              {regionWorld.regionName}
            </h1>
            <span className="text-xs bg-sky-950/80 border border-sky-500/40 text-sky-300 font-mono px-2 py-0.5 rounded-full">
              ตารางภูมิภาค {regionWorld.gridCols}×{regionWorld.gridRows} ผืนเมือง
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            เลือกผืนเมืองเพื่อเข้าสู่โหมดสร้างภูมิประเทศ (God Mode) หรือโหมดบริหารเมือง (Mayor Mode)
          </p>
        </div>

        {/* Region Aggregate Statistics */}
        <div className="flex items-center gap-3 bg-[#0f1b2b] border border-slate-700/80 rounded-xl px-4 py-2 shadow-lg">
          <div className="text-right">
            <div className="text-[10px] text-slate-400">ประชากรรวมทั้งภูมิภาค</div>
            <div className="text-sm font-bold font-mono tabular-nums text-emerald-400">
              {totalPopulation.toLocaleString()} คน
            </div>
          </div>
          <div className="w-px h-7 bg-slate-700" />
          <div className="text-right">
            <div className="text-[10px] text-slate-400">เมืองที่สถาปนาแล้ว</div>
            <div className="text-sm font-bold font-mono tabular-nums text-amber-300">
              {incorporatedCount} / {plotsList.length} แห่ง
            </div>
          </div>
          <div className="w-px h-7 bg-slate-700" />
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs text-white font-medium transition-colors cursor-pointer active:scale-95 ml-1"
          >
            ✕ กลับสู่เมือง
          </button>
        </div>
      </div>

      {/* 3x3 Region Grid Matrix */}
      <div className="max-w-6xl w-full mx-auto my-6 flex-1 flex flex-col justify-center">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: regionWorld.gridRows }).map((_, gz) =>
            Array.from({ length: regionWorld.gridCols }).map((__, gx) => {
              const plotId = `plot_${gx}_${gz}`;
              const plot = regionWorld.plots[plotId];
              if (!plot) return null;

              const isCurrent = plotId === regionWorld.activePlotId;

              // Sample terrain attributes from plot tiles for visual thumbnail
              const waterCount = plot.tiles.filter((t) => t.isWater).length;
              const waterPercent = Math.round((waterCount / plot.tiles.length) * 100);
              const hasBuildings = plot.tiles.some((t) => t.buildingId !== null);

              return (
                <div
                  key={plotId}
                  className={`rounded-2xl border p-4 transition-all flex flex-col justify-between ${
                    isCurrent
                      ? 'bg-[#102237] border-sky-400 shadow-xl shadow-sky-500/10 ring-1 ring-sky-400'
                      : 'bg-[#0d1624] border-slate-800 hover:border-slate-600 hover:bg-[#121e30]'
                  }`}
                >
                  {/* Card Header */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-mono text-slate-400">
                        ผืนเมือง [{gx + 1},{gz + 1}]
                      </span>
                      {plot.incorporated ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">
                          🏛️ สถาปนาแล้ว
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                          ⛰️ ดินบริสุทธิ์ (God Mode)
                        </span>
                      )}
                    </div>

                    <h2 className="text-base font-bold text-white mb-1 truncate">
                      {plot.name}
                    </h2>

                    {/* Small Terrain & City Stats */}
                    <div className="grid grid-cols-3 gap-2 my-3 p-2 rounded-xl bg-[#09101b] border border-slate-800/80 text-center">
                      <div>
                        <div className="text-[10px] text-slate-400">ประชากร</div>
                        <div className="text-xs font-mono font-bold text-white tabular-nums">
                          {plot.metrics.population.toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400">แหล่งน้ำ</div>
                        <div className="text-xs font-mono font-bold text-sky-400 tabular-nums">
                          {waterPercent}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400">ขนาดผัง</div>
                        <div className="text-xs font-mono font-bold text-emerald-400 tabular-nums">
                          {plot.size}×{plot.size}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Dual Action CTA Buttons: God Mode vs Mayor Mode */}
                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => onSelectPlot(plotId, 'god_mode')}
                      className="min-h-[44px] px-3 py-2 rounded-xl bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-600/70 text-emerald-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
                    >
                      <span>⛰️ ปั้นภูมิประเทศ</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onSelectPlot(plotId, 'mayor_mode')}
                      className="min-h-[44px] px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-md shadow-amber-500/20"
                    >
                      <span>🏛️ บริหารเมือง</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Footer Hint */}
      <div className="max-w-6xl w-full mx-auto text-center text-xs text-slate-400 py-2 border-t border-slate-800">
        💡 ระบบภูมิภาคแบบ SimCity 4: แต่ละผืนเมืองสามารถพัฒนาอย่างอิสระและเชื่อมโยงเครือข่ายความเจริญถึงกันทั้งภูมิภาค
      </div>
    </div>
  );
};
