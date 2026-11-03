import React from 'react';
import { TerrainToolId } from '../game/types';
import { CameraActionCommand } from './CityViewport3D';

interface GodModeToolbarProps {
  activeToolId: string;
  brushRadius: number;
  wildlifeCount?: number;
  isCanvasDragging?: boolean;
  onSelectTool: (id: TerrainToolId | 'inspect' | 'camera_pan') => void;
  onChangeBrushRadius: (radius: number) => void;
  onCameraAction?: (type: CameraActionCommand['type']) => void;
  onResetEntireMapFlat: () => void;
  onGenerateWildLand: () => void;
  onIncorporateCity: () => void;
  onOpenRegionMap: () => void;
  isDockCollapsed: boolean;
  onToggleCollapse: () => void;
}

const GOD_SCULPT_TOOLS: Array<{
  id: TerrainToolId | 'inspect' | 'camera_pan';
  label: string;
  icon: string;
  shortDesc: string;
  hotkey: string;
  badgeColor?: string;
}> = [
  {
    id: 'inspect',
    label: 'หมุนกล้อง 3D',
    icon: '🎥',
    shortDesc: '1 นิ้วหมุน 360° & ซูมอิสระ',
    hotkey: 'Esc',
    badgeColor: 'sky',
  },
  {
    id: 'camera_pan',
    label: 'เลื่อนแผนที่',
    icon: '✋',
    shortDesc: '1 นิ้วลากเลื่อนผังเมือง',
    hotkey: 'Space',
    badgeColor: 'sky',
  },
  { id: 'terrain_mountain', label: 'ภูเขาสูง', icon: '🏔️', shortDesc: 'ปั้นยอดเขาทรงกรวยสมจริง', hotkey: '3' },
  { id: 'terrain_plateau', label: 'ที่ราบสูง', icon: '🏜️', shortDesc: 'ยกที่ราบสูงขั้นบันได +16ม.', hotkey: '4' },
  { id: 'terrain_river', label: 'แม่น้ำสายหลัก', icon: '🌊', shortDesc: 'ขุดแม่น้ำพร้อมตลิ่งปาล์ม', hotkey: '6' },
  { id: 'terrain_raise', label: 'ยกเนินดิน', icon: '⛰️', shortDesc: '+3.5 ม. เพิ่มความสูง', hotkey: '1' },
  { id: 'terrain_lower', label: 'ขุดร่องดิน', icon: '⛏️', shortDesc: '-3.5 ม. แอ่งดิน/ร่องน้ำ', hotkey: '2' },
  { id: 'terrain_cliff', label: 'หน้าผาหินชัน', icon: '🧗', shortDesc: 'หน้าผาสูงชัน +14 ม.', hotkey: '5' },
  { id: 'terrain_water', label: 'คลอง/ทะเลสาบ', icon: '💧', shortDesc: 'แหล่งน้ำลึก -6 ม.', hotkey: '7' },
  { id: 'terrain_flatten', label: 'ปรับพื้นราบ', icon: '📐', shortDesc: 'ปรับเสมอตามจุดกึ่งกลาง', hotkey: '8' },
  { id: 'terrain_smooth', label: 'เกลี่ยลาดเอียง', icon: '✨', shortDesc: 'เกลี่ยเนินให้นุ่มนวล', hotkey: '9' },
  { id: 'terrain_forest', label: 'ป่านิเวศผสม', icon: '🦌', shortDesc: 'ป่าผสมอัตโนมัติ+สัตว์ป่า', hotkey: 'F' },
  { id: 'tree_pine', label: 'ต้นสนภูเขา', icon: '🌲', shortDesc: 'สนฉัตร Low-poly ยอดดอย', hotkey: 'P' },
  { id: 'tree_oak', label: 'ต้นโอ๊คใหญ่', icon: '🌳', shortDesc: 'พุ่มไม้โอ๊คเขียวชอุ่ม', hotkey: 'O' },
  { id: 'tree_palm', label: 'ต้นปาล์ม', icon: '🌴', shortDesc: 'ปาล์มชายหาดและริมน้ำ', hotkey: 'L' },
  { id: 'tree_sakura', label: 'ต้นซากุระ', icon: '🌸', shortDesc: 'ซากุระสีชมพูบานสะพรั่ง', hotkey: 'K' },
  { id: 'terrain_clear', label: 'ล้างที่ราบ', icon: '🟩', shortDesc: 'รีเซ็ตราบเรียบ +2 ม.', hotkey: '0' },
  { id: 'bulldoze', label: 'รื้อถอน/ถางป่า', icon: '🚜', shortDesc: 'เคลียร์ต้นไม้และสิ่งปลูกสร้าง', hotkey: 'B' },
];

export const GodModeToolbar: React.FC<GodModeToolbarProps> = ({
  activeToolId,
  brushRadius,
  wildlifeCount = 0,
  isCanvasDragging = false,
  onSelectTool,
  onChangeBrushRadius,
  onCameraAction,
  onResetEntireMapFlat,
  onGenerateWildLand,
  onIncorporateCity,
  onOpenRegionMap,
  isDockCollapsed,
  onToggleCollapse,
}) => {
  const isOrbitMode = activeToolId === 'inspect';
  const isPanMode = activeToolId === 'camera_pan';
  const effectiveCollapsed = isDockCollapsed || isCanvasDragging;

  return (
    <div
      className={`w-full max-w-5xl mx-auto pointer-events-auto transition-all duration-200 ${
        isCanvasDragging ? 'opacity-45 translate-y-2 pointer-events-none' : 'opacity-100 translate-y-0'
      }`}
    >
      {/* Top Action Bar above Dock: Quick Camera Mode Toggle + Zoom/Rotate + Wildlife Indicator + Incorporate CTA */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5 px-1">
        <div className="flex items-center gap-1.5 overflow-x-auto touch-pan-x scrollbar-none max-w-full pb-0.5">
          {/* Quick Camera Orbit Toggle Button */}
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onSelectTool(isOrbitMode ? 'terrain_mountain' : 'inspect');
            }}
            className={`min-h-[48px] px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-lg shrink-0 ${
              isOrbitMode
                ? 'bg-sky-500 text-slate-950 ring-2 ring-sky-300 shadow-sky-500/30'
                : 'bg-[#0b131e]/95 hover:bg-[#16253b] text-sky-300 border border-sky-500/50'
            }`}
            title="สลับโหมด 1 นิ้วลากหมุนกล้อง 3D อิสระ [Esc] (หรือใช้ 2 นิ้วหมุนได้ตลอดเวลา)"
          >
            <span>🎥 {isOrbitMode ? 'กำลังหมุนกล้อง 3D (แตะเพื่อปั้นดิน)' : 'หมุนกล้อง 3D'}</span>
          </button>

          {/* Quick Camera Pan Toggle Button */}
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onSelectTool(isPanMode ? 'terrain_mountain' : 'camera_pan');
            }}
            className={`min-h-[48px] px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-lg shrink-0 ${
              isPanMode
                ? 'bg-sky-500 text-slate-950 ring-2 ring-sky-300 shadow-sky-500/30'
                : 'bg-[#0b131e]/95 hover:bg-[#16253b] text-sky-300 border border-sky-500/50'
            }`}
            title="สลับโหมด 1 นิ้วลากเลื่อนแผนที่"
          >
            <span>✋ {isPanMode ? 'กำลังเลื่อนแผนที่' : 'เลื่อนแผนที่'}</span>
          </button>

          {onCameraAction && (
            <div className="bg-[#0b131e]/95 border border-slate-700/80 rounded-xl p-1 flex items-center gap-1 shadow-lg shrink-0">
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onCameraAction('zoom_in');
                }}
                title="ซูมเข้าใกล้พื้นดิน"
                className="min-h-[40px] min-w-[44px] px-2.5 rounded-lg bg-[#132032] hover:bg-[#1c2e47] text-sky-300 text-xs font-bold cursor-pointer active:scale-95"
              >
                ➕ ซูม
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onCameraAction('zoom_out');
                }}
                title="ซูมออกมุมสูง"
                className="min-h-[40px] min-w-[44px] px-2.5 rounded-lg bg-[#132032] hover:bg-[#1c2e47] text-sky-300 text-xs font-bold cursor-pointer active:scale-95"
              >
                ➖ ถอย
              </button>
            </div>
          )}

          <span className="hidden sm:inline-flex items-center gap-1.5 min-h-[44px] px-3 py-1.5 rounded-xl bg-emerald-950/85 border border-emerald-500/40 text-emerald-300 text-xs font-semibold shrink-0">
            <span>🦌 สัตว์ป่า: {wildlifeCount} ตัว</span>
          </span>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenRegionMap();
            }}
            className="min-h-[48px] px-3.5 py-2 rounded-xl bg-sky-900/60 hover:bg-sky-800 border border-sky-600/70 text-xs font-semibold text-sky-200 flex items-center gap-1.5 transition-colors active:scale-95 cursor-pointer shadow-md shrink-0"
            title="ดูแผนที่ภูมิภาคและเมืองอื่น"
          >
            <span>🗺️ แผนที่ภูมิภาค</span>
          </button>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onIncorporateCity();
            }}
            className="min-h-[48px] px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-amber-500/30 flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
          >
            <span>🏛️ สถาปนาเมือง (เริ่มบริหาร)</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleCollapse();
            }}
            aria-label={isDockCollapsed ? 'เปิดแถบเครื่องมือปั้นดิน' : 'ย่อแถบเครื่องมือ'}
            className="min-h-[48px] min-w-[48px] px-3 py-2 rounded-xl bg-[#0b131e]/95 hover:bg-[#162235] border border-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer active:scale-95"
          >
            <span>{isDockCollapsed ? '▲ ขยาย' : '▼ ย่อ'}</span>
          </button>
        </div>
      </div>

      {!effectiveCollapsed && (
        <div className="bg-[#0b131e]/95 border border-emerald-500/40 rounded-2xl p-2.5 sm:p-3 shadow-2xl backdrop-blur-md">
          {/* Top Control Bar: Brush Radius & Quick Map Modifiers */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-800">
            {/* Brush Radius Selector */}
            <div className="flex items-center gap-1.5 overflow-x-auto touch-pan-x scrollbar-none">
              <span className="text-xs font-medium text-slate-300 mr-1 shrink-0">ขนาดแปรง:</span>
              {[
                { radius: 0, label: '1×1 ช่อง', sizeMeters: '10 ม.' },
                { radius: 1, label: '3×3 ช่อง', sizeMeters: '30 ม.' },
                { radius: 2, label: '5×5 ช่อง', sizeMeters: '50 ม.' },
              ].map((b) => {
                const active = brushRadius === b.radius;
                return (
                  <button
                    key={b.radius}
                    type="button"
                    onClick={() => onChangeBrushRadius(b.radius)}
                    aria-pressed={active}
                    className={`min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer active:scale-95 shrink-0 ${
                      active
                        ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                        : 'bg-[#132032] border border-slate-700/80 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    <span>{b.label}</span>
                    <span className="text-[10px] opacity-75 ml-1 font-mono">({b.sizeMeters})</span>
                  </button>
                );
              })}
            </div>

            {/* Global Terrain Generators */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onResetEntireMapFlat}
                className="min-h-[44px] px-3 py-1.5 rounded-xl bg-[#152336] hover:bg-[#1e324c] border border-slate-700 text-xs text-amber-300 font-semibold transition-colors cursor-pointer active:scale-95 flex items-center gap-1"
                title="รีเซ็ตพื้นที่ทั้งหมดกลับเป็นที่ราบว่างเปล่า 100%"
              >
                <span>🟩 รีเซ็ตที่ราบ 100%</span>
              </button>
              <button
                type="button"
                onClick={onGenerateWildLand}
                className="min-h-[44px] px-3 py-1.5 rounded-xl bg-[#152336] hover:bg-[#1e324c] border border-slate-700 text-xs text-emerald-300 font-semibold transition-colors cursor-pointer active:scale-95 flex items-center gap-1"
                title="สุ่มสร้างเทือกเขาและแม่น้ำธรรมชาติใหม่"
              >
                <span>🎲 สุ่มธรรมชาติ</span>
              </button>
            </div>
          </div>

          {/* Sculpting & Low-Poly Tree Species Carousel */}
          <div className="overflow-x-auto touch-pan-x scrollbar-none pb-1 flex items-center gap-2">
            {GOD_SCULPT_TOOLS.map((tool) => {
              const active = activeToolId === tool.id;
              const isCam = tool.id === 'inspect' || tool.id === 'camera_pan';
              return (
                <button
                  key={tool.id}
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onSelectTool(tool.id);
                  }}
                  aria-pressed={active}
                  className={`min-h-[68px] min-w-[110px] sm:min-w-[116px] p-2.5 rounded-xl border text-left transition-all shrink-0 cursor-pointer active:scale-95 ${
                    active
                      ? isCam
                        ? 'bg-sky-500/30 border-sky-400 text-white shadow-lg shadow-sky-500/20 ring-1 ring-sky-400'
                        : 'bg-emerald-600/30 border-emerald-400 text-white shadow-lg shadow-emerald-500/20 ring-1 ring-emerald-400'
                      : 'bg-[#132032] border-slate-800 text-slate-300 hover:border-slate-600 hover:bg-[#18283e]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-lg">{tool.icon}</span>
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                        isCam
                          ? 'text-sky-300 bg-sky-950/70'
                          : 'text-emerald-400 bg-emerald-950/60'
                      }`}
                    >
                      {isCam ? 'กล้อง' : 'ฟรี ฿0'}
                    </span>
                  </div>
                  <div className="text-xs font-bold truncate">{tool.label}</div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                    {tool.shortDesc}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Tool Help & Android Multi-Touch Gestures */}
          <div className="mt-2 text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-1 px-1">
            <span>
              📱 <strong className="text-emerald-300">Android:</strong> ลาก 1 นิ้วปั้นดิน/ปลูกป่า · ใช้ 2 นิ้วถ่างซูม-หมุนกล้อง 360° ได้ตลอดเวลา
            </span>
            <span className="hidden sm:inline font-mono text-emerald-300">
              💻 PC: คลิกซ้ายปั้นดิน · คลิกขวาหมุนกล้อง 360°
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
