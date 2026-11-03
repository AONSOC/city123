import React from 'react';
import { getRegionDimensionsMeters, TILE_SIZE_METERS, VALID_REGION_SIZES } from '../game/rules';
import { RegionConfig, RegionSize, TerrainPreset } from '../game/types';
import { PWAInstallButton } from './PWAInstallButton';

interface TitleScreenModalProps {
  config: RegionConfig;
  modCount: number;
  onUpdateConfig: (partial: Partial<RegionConfig>) => void;
  onRandomizeSeed: () => void;
  onStartGame: () => void;
  onStartGodMode?: () => void;
  onOpenRegionMap?: () => void;
  onOpenModWorkshop: () => void;
}

const PRESET_OPTIONS: Array<{ id: TerrainPreset; label: string; desc: string }> = [
  { id: 'pristine_flat', label: 'ที่ดินราบเรียบ 100% (แนะนำ)', desc: 'ผืนดินบริสุทธิ์ว่างเปล่า พร้อมให้ลงมือปั้นภูมิประเทศตั้งแต่ศูนย์' },
  { id: 'river_valley', label: 'ลุ่มแม่น้ำสายหลัก', desc: 'แม่น้ำคดเคี้ยวผ่านที่ราบและหน้าผาหินริมฝั่ง' },
  { id: 'coastal_bay', label: 'อ่าวชายฝั่งทะเล', desc: 'คาบสมุทรติดทะเลพร้อมแหลมหน้าผาสูง' },
  { id: 'highland_cliffs', label: 'หุบเขาและหน้าผาหินชัน', desc: 'ภูมิประเทศขั้นบันได หน้าผาสูง และแอ่งน้ำภูเขา' },
  { id: 'flatland_basin', label: 'ที่ราบลุ่มสร้างเมืองใหญ่', desc: 'พื้นที่ราบกว้างขวางเหมาะแก่การวางผังมหานคร' },
];

export const TitleScreenModal: React.FC<TitleScreenModalProps> = ({
  config,
  modCount,
  onUpdateConfig,
  onRandomizeSeed,
  onStartGame,
  onStartGodMode,
  onOpenRegionMap,
  onOpenModWorkshop,
}) => {
  const dims = getRegionDimensionsMeters(config.size);

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-3 sm:p-6 md:p-10">
      {/* Main Left-Third Interactive Config Lockup (leaves right viewport open for live 3D camera tour) */}
      <div className="w-full max-w-[500px] max-h-[92vh] overflow-y-auto bg-[#0b131e]/95 border border-slate-700/80 rounded-2xl p-4 sm:p-6 shadow-2xl pointer-events-auto">
        {/* Bespoke Inline SVG Title Emblem */}
        <div className="mb-4 sm:mb-5">
          <svg
            viewBox="0 0 500 76"
            className="w-full h-auto max-h-[64px] sm:max-h-[72px]"
            role="img"
            aria-label="MetroTerra 3D Title Emblem"
          >
            {/* Isometric City Crest Icon */}
            <g transform="translate(4, 6)">
              <polygon points="32,4 60,18 60,50 32,64 4,50 4,18" fill="#0f2942" stroke="#38bdf8" strokeWidth="2" />
              <polygon points="32,12 46,20 46,48 32,56 18,48 18,20" fill="#0284c7" />
              <rect x="26" y="18" width="12" height="32" fill="#f8fafc" />
              <rect x="14" y="28" width="9" height="22" fill="#34d399" />
              <rect x="41" y="24" width="9" height="26" fill="#fbbf24" />
              <path d="M8 50 Q32 60 56 50" fill="none" stroke="#38bdf8" strokeWidth="3" />
            </g>
            {/* Display Lockup Text */}
            <text
              x="76"
              y="36"
              fill="#f8fafc"
              fontFamily="'Chakra Petch', sans-serif"
              fontWeight="700"
              fontSize="30"
              letterSpacing="1.5"
            >
              METROTERRA 3D
            </text>
            <text
              x="76"
              y="58"
              fill="#38bdf8"
              fontFamily="'IBM Plex Sans Thai', sans-serif"
              fontWeight="600"
              fontSize="12"
            >
              เกมวางผังมหานครและบริหารทรัพยากร · เล่นได้ทั้ง PC & Android
            </text>
          </svg>
        </div>

        {/* City Name & Seed Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="sm:col-span-2">
            <label htmlFor="city-name-input" className="block text-xs font-medium text-slate-300 mb-1">
              ชื่อมหานคร (City Name)
            </label>
            <input
              id="city-name-input"
              type="text"
              value={config.cityName}
              onChange={(e) => onUpdateConfig({ cityName: e.target.value })}
              className="w-full h-11 min-h-[44px] px-3 rounded-lg bg-[#132032] border border-slate-700 text-sm text-white focus:outline-none focus:border-sky-400"
              placeholder="เช่น นครสุวรรณภูมิ"
            />
          </div>
          <div>
            <label htmlFor="seed-button" className="block text-xs font-medium text-slate-300 mb-1">
              รหัสภูมิภาค (Seed)
            </label>
            <button
              id="seed-button"
              type="button"
              onClick={onRandomizeSeed}
              className="w-full h-11 min-h-[44px] px-3 rounded-lg bg-[#132032] hover:bg-[#1b2d45] border border-slate-700 text-xs font-mono tabular-nums text-sky-300 flex items-center justify-between transition-colors cursor-pointer active:scale-95"
            >
              <span>#{config.seed}</span>
              <span className="text-slate-400">สุ่มใหม่</span>
            </button>
          </div>
        </div>

        {/* Region Size Selector: 32x32, 48x48, 64x64 (1 tile = 10m) */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-slate-300 mb-1.5">
            <span className="font-medium">ขนาดภูมิภาค (1 ช่อง = {TILE_SIZE_METERS} เมตร)</span>
            <span className="font-mono tabular-nums text-emerald-400">
              {dims.widthMeters}×{dims.heightMeters} ม. ({dims.areaSqKm} ตร.กม.)
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="เลือกขนาดภูมิภาค">
            {VALID_REGION_SIZES.map((sz: RegionSize) => {
              const active = config.size === sz;
              const m = sz * TILE_SIZE_METERS;
              return (
                <button
                  key={sz}
                  type="button"
                  onClick={() => onUpdateConfig({ size: sz })}
                  aria-pressed={active}
                  className={`min-h-[50px] py-2 px-3 rounded-xl border text-left transition-all cursor-pointer active:scale-95 ${
                    active
                      ? 'bg-sky-600/30 border-sky-400 text-white shadow-md'
                      : 'bg-[#132032] border-slate-700/80 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <div className="text-sm font-bold font-mono tabular-nums">
                    {sz}×{sz} ช่อง
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                    {m}×{m} เมตร
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Terrain Preset Selector */}
        <div className="mb-4">
          <span className="block text-xs font-medium text-slate-300 mb-1.5">
            รูปแบบภูมิประเทศเริ่มต้น (หญ้า น้ำ หน้าผาสมจริง)
          </span>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="เลือกรูปแบบภูมิประเทศ">
            {PRESET_OPTIONS.map((p) => {
              const active = config.preset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onUpdateConfig({ preset: p.id })}
                  aria-pressed={active}
                  className={`min-h-[52px] p-2.5 rounded-xl border text-left transition-all cursor-pointer active:scale-95 ${
                    active
                      ? 'bg-emerald-600/25 border-emerald-400 text-white shadow-md'
                      : 'bg-[#132032] border-slate-700/80 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <div className="text-xs font-semibold truncate">{p.label}</div>
                  <div className="text-[11px] text-slate-400 truncate mt-0.5">{p.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Terrain Fine-Tuning Sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5 p-3 rounded-xl bg-[#111c2d] border border-slate-800">
          <div>
            <label htmlFor="cliff-slider" className="block text-[11px] text-slate-300 mb-1">
              ความชันหน้าผา: <span className="font-mono tabular-nums text-sky-300">{Math.round(config.cliffSteepness * 100)}%</span>
            </label>
            <input
              id="cliff-slider"
              type="range"
              min="0.5"
              max="1.8"
              step="0.1"
              value={config.cliffSteepness}
              onChange={(e) => onUpdateConfig({ cliffSteepness: parseFloat(e.target.value) })}
              className="w-full accent-sky-400 cursor-pointer h-7"
            />
          </div>
          <div>
            <label htmlFor="water-slider" className="block text-[11px] text-slate-300 mb-1">
              ระดับน้ำ: <span className="font-mono tabular-nums text-sky-300">{config.waterLevelOffset > 0 ? `+${config.waterLevelOffset}` : config.waterLevelOffset} ม.</span>
            </label>
            <input
              id="water-slider"
              type="range"
              min="-3"
              max="3"
              step="0.5"
              value={config.waterLevelOffset}
              onChange={(e) => onUpdateConfig({ waterLevelOffset: parseFloat(e.target.value) })}
              className="w-full accent-sky-400 cursor-pointer h-7"
            />
          </div>
          <div>
            <label htmlFor="forest-slider" className="block text-[11px] text-slate-300 mb-1">
              ความหนาแน่นป่า: <span className="font-mono tabular-nums text-emerald-300">{Math.round(config.forestDensity * 100)}%</span>
            </label>
            <input
              id="forest-slider"
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={config.forestDensity}
              onChange={(e) => onUpdateConfig({ forestDensity: parseFloat(e.target.value) })}
              className="w-full accent-emerald-400 cursor-pointer h-7"
            />
          </div>
        </div>

        {/* Primary CTA & Secondary Mod / Region Map Actions */}
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              data-start="true"
              onClick={(e) => {
                e.currentTarget.blur();
                if (onStartGodMode) onStartGodMode();
                else onStartGame();
              }}
              className="min-h-[48px] py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-300 text-slate-950 font-bold text-xs sm:text-sm tracking-wide transition-all cursor-pointer shadow-lg shadow-emerald-500/20 active:scale-98 flex items-center justify-center gap-1.5"
            >
              <span>⛰️ ปั้นภูมิประเทศ (God Mode)</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onStartGame();
              }}
              className="min-h-[48px] py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-300 text-slate-950 font-bold text-xs sm:text-sm tracking-wide transition-all cursor-pointer shadow-lg shadow-amber-500/20 active:scale-98 flex items-center justify-center gap-1.5"
            >
              <span>🏛️ บริหารเมือง (Mayor Mode)</span>
            </button>
          </div>

          <div className="flex items-center justify-between gap-2">
            {onOpenRegionMap && (
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onOpenRegionMap();
                }}
                className="flex-1 min-h-[44px] py-2 px-3 rounded-lg bg-sky-950/80 hover:bg-sky-900 border border-sky-600/70 text-xs font-medium text-sky-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer active:scale-95 flex items-center justify-center gap-1.5"
              >
                <span>🗺️ แผนที่ภูมิภาคขนาดใหญ่</span>
              </button>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenModWorkshop();
              }}
              className="min-h-[44px] py-2 px-3 rounded-lg bg-[#132032] hover:bg-[#1a2c44] border border-slate-700 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer active:scale-95"
            >
              ระบบ Mod ({modCount})
            </button>
            <PWAInstallButton />
          </div>
        </div>
      </div>

      {/* Single flat borderless inline control hint line in the bottom safe margin */}
      <div className="text-xs text-slate-300 font-medium tracking-wide drop-shadow bg-[#0b131e]/70 px-3 py-1.5 rounded-lg backdrop-blur-sm self-start mt-2">
        PC: คลิกขวาหมุน 360° & ก้มเงย · ล้อเมาส์ซูม & เลื่อนผัง · WASD เลื่อนกล้อง · Tab หมุนอาคาร | Android: 1 นิ้วหมุน 360° · 2 นิ้วซูม-เลื่อนผัง · แตะวางผังและสำรวจอาคาร
      </div>
    </div>
  );
};
