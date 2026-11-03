import React, { useState } from 'react';
import { getAllAvailableBuildings, TERRAIN_TOOLS } from '../game/catalog';
import { TILE_SIZE_METERS } from '../game/rules';
import {
  CitySimulationState,
  DataOverlayMode,
  GameExecutionMode,
  RegionSize,
  TerrainToolId,
  TileData,
  TimeOfDayPreset,
  ToolCategory,
} from '../game/types';
import { CameraActionCommand, PendingTouchPlacement, RoadDragPreviewInfo } from './CityViewport3D';
import { GodModeToolbar } from './GodModeToolbar';
import { PWAInstallButton } from './PWAInstallButton';

interface CityHUDProps {
  simState: CitySimulationState;
  activeCategory: ToolCategory;
  activeToolId: string;
  brushRadius: number;
  buildingRotation: number;
  dataOverlay: DataOverlayMode;
  hoveredTile: TileData | null;
  selectedInspectTile?: TileData | null;
  cameraHeading: number;
  isMuted: boolean;
  statusBanner: string | null;
  onSelectCategory: (cat: ToolCategory) => void;
  onSelectTool: (toolId: string) => void;
  onChangeBrushRadius: (r: number) => void;
  onRotateBuilding: () => void;
  onChangeOverlay: (mode: DataOverlayMode) => void;
  onChangeSimSpeed: (speed: 0 | 1 | 2 | 4) => void;
  onUpdateTaxRate: (zone: 'R' | 'C' | 'I', rate: number) => void;
  onChangeRegionSizeLive: (size: RegionSize) => void;
  onCameraAction: (type: CameraActionCommand['type']) => void;
  onCloseInspectTile?: () => void;
  onDemolishSelectedTile?: () => void;
  onToggleMute: () => void;
  onOpenPause: () => void;
  onOpenModWorkshop: () => void;
  onOpenLotEditor?: () => void;
  onOpenUserGuide?: () => void;
  isDockCollapsed?: boolean;
  onToggleCollapseDock?: () => void;

  // SimCity 4 Style Mode & Region Props
  executionMode?: GameExecutionMode;
  onSwitchExecutionMode?: (mode: 'god_mode' | 'mayor_mode') => void;
  onOpenRegionMap?: () => void;
  onIncorporateCity?: () => void;
  onResetEntireMapFlat?: () => void;
  onGenerateWildLand?: () => void;
  timeOfDay?: TimeOfDayPreset;
  onChangeTimeOfDay?: (preset: TimeOfDayPreset) => void;
  autoTimeCycle?: boolean;
  onToggleAutoTimeCycle?: () => void;
  roadDragPreview?: RoadDragPreviewInfo | null;
  pendingTouchPlacement?: PendingTouchPlacement | null;
  onConfirmTouchPlacement?: () => void;
  onCancelTouchPlacement?: () => void;
  isCanvasDragging?: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

const CATEGORY_TABS: Array<{ id: ToolCategory; label: string; icon: string }> = [
  { id: 'inspect', label: 'สำรวจ / กล้อง 3D', icon: '🔍' },
  { id: 'roads', label: 'ถนน/สะพาน', icon: '🛣️' },
  { id: 'zones', label: 'ผังเมือง RCI', icon: '🏙️' },
  { id: 'utilities', label: 'ไฟฟ้า/ประปา', icon: '⚡' },
  { id: 'services', label: 'บริการเมือง', icon: '🏥' },
  { id: 'terrain', label: 'ปรับภูมิประเทศ', icon: '⛰️' },
  { id: 'demolish', label: 'รื้อถอน', icon: '🚜' },
  { id: 'mods', label: 'Mod เสริม', icon: '🧩' },
];

const OVERLAY_OPTIONS: Array<{ id: DataOverlayMode; label: string }> = [
  { id: 'none', label: 'มุมมองปกติ' },
  { id: 'power', label: 'ไฟฟ้า' },
  { id: 'water', label: 'ประปา' },
  { id: 'pollution', label: 'มลพิษ' },
  { id: 'land_value', label: 'มูลค่าที่ดิน' },
];

export const CityHUD: React.FC<CityHUDProps> = ({
  simState,
  activeCategory,
  activeToolId,
  brushRadius,
  buildingRotation,
  dataOverlay,
  hoveredTile,
  selectedInspectTile,
  cameraHeading,
  isMuted,
  statusBanner,
  onSelectCategory,
  onSelectTool,
  onChangeBrushRadius,
  onRotateBuilding,
  onChangeOverlay,
  onChangeSimSpeed,
  onUpdateTaxRate,
  onChangeRegionSizeLive,
  onCameraAction,
  onCloseInspectTile,
  onDemolishSelectedTile,
  onToggleMute,
  onOpenPause,
  onOpenModWorkshop,
  onOpenLotEditor,
  onOpenUserGuide,
  isDockCollapsed,
  onToggleCollapseDock,
  executionMode = 'mayor_mode',
  onSwitchExecutionMode,
  onOpenRegionMap,
  onIncorporateCity,
  onResetEntireMapFlat,
  onGenerateWildLand,
  timeOfDay = 'noon',
  onChangeTimeOfDay,
  autoTimeCycle = false,
  onToggleAutoTimeCycle,
  roadDragPreview = null,
  pendingTouchPlacement = null,
  onConfirmTouchPlacement,
  onCancelTouchPlacement,
  isCanvasDragging = false,
  isFullscreen = false,
  onToggleFullscreen,
}) => {
  const [internalDockCollapsed, setInternalDockCollapsed] = useState(false);
  const dockCollapsed = isDockCollapsed !== undefined ? isDockCollapsed : internalDockCollapsed;
  const effectiveDockCollapsed = dockCollapsed || isCanvasDragging;
  const toggleDock = onToggleCollapseDock || (() => setInternalDockCollapsed((prev) => !prev));
  const [showTaxPanel, setShowTaxPanel] = useState(false);
  const [showMobileTopDetails, setShowMobileTopDetails] = useState(false);
  const [showThumbCamPad, setShowThumbCamPad] = useState(true);

  const { metrics, config } = simState;
  const allBuildings = getAllAvailableBuildings(simState.mods);
  const categoryBuildings = allBuildings.filter((b) => b.category === activeCategory);
  const selectedBuilding = allBuildings.find((b) => b.id === activeToolId);
  const selectedTerrainTool = TERRAIN_TOOLS.find((t) => t.id === activeToolId);

  const inspectedBuilding = selectedInspectTile?.buildingId
    ? allBuildings.find((b) => b.id === selectedInspectTile.buildingId)
    : null;

  const powerOk = metrics.powerProducedMW >= metrics.powerConsumedMW;
  const waterOk = metrics.waterProducedM3 >= metrics.waterConsumedM3;

  // Calculate active wildlife count proportional to forest and water tiles
  let forestTiles = 0;
  let waterTiles = 0;
  for (let i = 0; i < simState.tiles.length; i++) {
    const t = simState.tiles[i];
    if (t.isWater) waterTiles++;
    else if (t.trees > 0 && !t.buildingId) forestTiles++;
  }
  const activeDeer = Math.min(22, Math.floor(forestTiles / 3));
  const activeBirds = Math.min(18, Math.floor((forestTiles + waterTiles) / 8));
  const wildlifeCount = activeDeer + activeBirds;

  const isFreeCameraMode = activeToolId === 'inspect' || activeToolId === 'camera_pan';

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-2 sm:p-3 md:p-4">
      {/* TOP PERIMETER ROW: Compact on Android Mobile (<15% height) + Expandable Drawer, Full on Desktop */}
      <div
        className={`flex flex-col md:flex-row items-stretch md:items-start justify-between gap-1.5 sm:gap-2 max-w-full transition-opacity duration-200 ${
          isCanvasDragging ? 'opacity-40' : 'opacity-100'
        }`}
      >
        {/* Left Telemetry Cluster & Mode Switcher */}
        <div className="flex flex-col gap-2 max-w-full">
          {/* Mode Switcher Header Bar + Mobile Quick Controls */}
          <div className="flex items-center justify-between md:justify-start gap-1.5 pointer-events-auto overflow-x-auto touch-pan-x scrollbar-none">
            <div className="flex items-center gap-1.5 shrink-0">
              {onOpenRegionMap && (
                <button
                  type="button"
                  onClick={onOpenRegionMap}
                  className="min-h-[48px] px-3 rounded-xl bg-sky-950/90 hover:bg-sky-900 border border-sky-500/50 text-xs font-bold text-sky-200 transition-all cursor-pointer active:scale-95 shadow-lg flex items-center gap-1.5 shrink-0"
                  title="เปิดภาพรวมแผนที่ภูมิภาคและเลือกผืนเมืองอื่น"
                >
                  <span>🗺️</span>
                  <span className="hidden sm:inline">แผนที่ภูมิภาค</span>
                </button>
              )}

              <div className="bg-[#0b131e]/95 border border-slate-700/80 rounded-xl p-1 flex items-center gap-1 shadow-lg shrink-0">
                <button
                  type="button"
                  onClick={() => onSwitchExecutionMode?.('god_mode')}
                  className={`min-h-[40px] px-2.5 sm:px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer active:scale-95 ${
                    executionMode === 'god_mode'
                      ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                      : 'text-emerald-300 hover:bg-emerald-950/60'
                  }`}
                >
                  <span>⛰️ ปั้นดิน</span>
                  <span className="hidden sm:inline text-[10px] font-mono opacity-80">(God)</span>
                </button>

                <button
                  type="button"
                  onClick={() => onSwitchExecutionMode?.('mayor_mode')}
                  className={`min-h-[40px] px-2.5 sm:px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer active:scale-95 ${
                    executionMode === 'mayor_mode'
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                      : 'text-amber-300 hover:bg-amber-950/60'
                  }`}
                >
                  <span>🏛️ บริหารเมือง</span>
                  <span className="hidden sm:inline text-[10px] font-mono opacity-80">(Mayor)</span>
                </button>
              </div>
            </div>

            {/* Mobile-only Compact Treasury + Fullscreen + Details Toggle */}
            <div className="flex md:hidden items-center gap-1 shrink-0">
              {executionMode === 'mayor_mode' && (
                <div className="min-h-[44px] px-2.5 rounded-xl bg-[#0b131e]/95 border border-slate-700/80 flex items-center gap-1.5 font-mono text-xs font-bold tabular-nums text-emerald-300 shadow-lg">
                  <span>฿{metrics.treasury.toLocaleString()}</span>
                  <span className="text-slate-400">·</span>
                  <span className="text-white">{metrics.population}คน</span>
                </div>
              )}
              {onToggleFullscreen && (
                <button
                  type="button"
                  onClick={onToggleFullscreen}
                  className="min-h-[48px] min-w-[48px] px-2.5 rounded-xl bg-[#0b131e]/95 border border-sky-500/50 text-sky-300 text-xs font-bold flex items-center justify-center shadow-lg cursor-pointer active:scale-95"
                  title="เปิด/ปิดโหมดเต็มจอ Android"
                >
                  {isFullscreen ? '🗗' : '⛶'}
                </button>
              )}
              <button
                type="button"
                onClick={onOpenModWorkshop}
                className="min-h-[48px] px-2.5 rounded-xl bg-[#0b131e]/95 border border-teal-500/50 text-teal-300 text-xs font-bold flex items-center justify-center shadow-lg cursor-pointer active:scale-95"
                title="นำเข้าโมเดล 3D และจัดการ Mod เสริม"
              >
                📦 3D
              </button>
              {onOpenUserGuide && (
                <button
                  type="button"
                  onClick={onOpenUserGuide}
                  className="min-h-[48px] px-2.5 rounded-xl bg-[#0b131e]/95 border border-sky-500/50 text-sky-300 text-xs font-bold flex items-center justify-center shadow-lg cursor-pointer active:scale-95"
                  title="เปิดคู่มือการใช้งานเกมและคำแนะนำ (User Manual)"
                >
                  📖 คู่มือ
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowMobileTopDetails((v) => !v)}
                className="min-h-[48px] px-2.5 rounded-xl bg-[#0b131e]/95 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 shadow-lg cursor-pointer active:scale-95"
              >
                <span>{showMobileTopDetails ? '▴ ซ่อน' : '▾ เวลา/สถิติ'}</span>
              </button>
            </div>
          </div>

          {/* Telemetry Cluster (Always visible on md+, toggleable on mobile to keep HUD <15% height) */}
          <div
            className={`${
              showMobileTopDetails ? 'flex' : 'hidden md:flex'
            } bg-[#0b131e]/95 border border-slate-700/80 rounded-xl px-3 py-2 shadow-xl pointer-events-auto flex-wrap items-center gap-2.5 max-w-full`}
          >
            {/* City Identity & Region Size Quick Switcher */}
            <div className="pr-2.5 border-r border-slate-700/80">
              <div className="flex items-center gap-1.5">
                <span className="font-display font-bold text-xs text-white tracking-wide">
                  {config.cityName || 'มหานครสุวรรณภูมิ'}
                </span>
                <span className="text-[11px] text-sky-300 font-mono tabular-nums">
                  {config.size}×{config.size} ({config.size * TILE_SIZE_METERS}m)
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono tabular-nums mt-0.5">
                <span>ปี {metrics.yearCount} · ด.{metrics.monthCount} · ว.{metrics.dayCount}</span>
                <span>·</span>
                <span className="text-emerald-400 font-semibold">ความสุข {metrics.happiness}%</span>
              </div>
            </div>

            {executionMode === 'god_mode' ? (
              /* God Mode telemetry: free sculpting notice, wildlife ecosystem & incorporate CTA */
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>ปั้นดินฟรี 100%</span>
                </div>
                <div
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-950/60 border border-amber-500/40 text-amber-200 text-xs font-semibold"
                  title="กวางป่าและฝูงนกจะปรากฏตัวอัตโนมัติตามจำนวนป่าไม้และแหล่งน้ำ"
                >
                  <span>🦌</span>
                  <span>สัตว์ป่า {wildlifeCount} ตัว</span>
                </div>
                {onIncorporateCity && (
                  <button
                    type="button"
                    onClick={onIncorporateCity}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 text-slate-950 font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                  >
                    <span>🏛️ สถาปนาเมือง (เริ่มบริหาร)</span>
                  </button>
                )}
              </div>
            ) : (
              /* Mayor Mode telemetry: Treasury, Population, Utilities, Taxes */
              <>
                {/* Treasury & Net Cash Flow */}
                <div className="pr-2.5 border-r border-slate-700/80">
                  <div className="text-[10px] text-slate-400 font-mono">งบประมาณคลัง</div>
                  <div className="flex items-center gap-1 font-mono text-xs font-bold tabular-nums">
                    <span className={metrics.treasury >= 0 ? 'text-emerald-300' : 'text-rose-400'}>
                      ฿{metrics.treasury.toLocaleString()}
                    </span>
                    <span
                      className={`text-[10px] ${
                        metrics.netIncome >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      ({metrics.netIncome >= 0 ? '+' : ''}฿{metrics.netIncome}/ด.)
                    </span>
                  </div>
                </div>

                {/* Population & Demand Bars (SimCity 4 RCI Style) */}
                <div className="pr-2.5 border-r border-slate-700/80 flex items-center gap-2">
                  <div>
                    <div className="text-[10px] text-slate-400 font-mono">ประชากร</div>
                    <div className="font-mono text-xs font-bold text-white tabular-nums">
                      {metrics.population.toLocaleString()} คน
                    </div>
                  </div>
                  {/* RCI Demand Indicators */}
                  <div className="flex items-end gap-1 h-5 pl-1" title="ความต้องการโซน RCI (ที่อยู่อาศัย / การค้า / อุตสาหกรรม)">
                    <div
                      className="w-1.5 bg-emerald-500 rounded-t"
                      style={{ height: `${Math.max(4, Math.min(20, (metrics.demandR + 20) / 2))}px` }}
                      title={`ความต้องการที่พักอาศัย (R): ${metrics.demandR}`}
                    />
                    <div
                      className="w-1.5 bg-blue-500 rounded-t"
                      style={{ height: `${Math.max(4, Math.min(20, (metrics.demandC + 20) / 2))}px` }}
                      title={`ความต้องการพาณิชยกรรม (C): ${metrics.demandC}`}
                    />
                    <div
                      className="w-1.5 bg-amber-500 rounded-t"
                      style={{ height: `${Math.max(4, Math.min(20, (metrics.demandI + 20) / 2))}px` }}
                      title={`ความต้องการอุตสาหกรรม (I): ${metrics.demandI}`}
                    />
                  </div>
                </div>

                {/* Utilities: Power & Water */}
                <div className="flex items-center gap-2 pr-1">
                  <div
                    className={`flex items-center gap-1 text-[11px] font-mono tabular-nums ${
                      powerOk ? 'text-emerald-300' : 'text-rose-400 font-bold animate-pulse'
                    }`}
                    title={`กำลังไฟฟ้า: ผลิต ${metrics.powerProducedMW}MW / ใช้ ${metrics.powerConsumedMW}MW`}
                  >
                    <span>⚡</span>
                    <span>{metrics.powerConsumedMW}/{metrics.powerProducedMW}MW</span>
                  </div>
                  <div
                    className={`flex items-center gap-1 text-[11px] font-mono tabular-nums ${
                      waterOk ? 'text-sky-300' : 'text-rose-400 font-bold animate-pulse'
                    }`}
                    title={`น้ำประปา: ผลิต ${metrics.waterProducedM3}m³ / ใช้ ${metrics.waterConsumedM3}m³`}
                  >
                    <span>💧</span>
                    <span>{metrics.waterConsumedM3}/{metrics.waterProducedM3}m³</span>
                  </div>
                </div>

                {/* Tax Panel Button */}
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    setShowTaxPanel((prev) => !prev);
                  }}
                  aria-label="เปิดหน้าต่างปรับอัตราภาษีและงบประมาณ"
                  className="min-h-[44px] px-3 rounded-lg bg-[#142337] hover:bg-[#1f3554] text-sky-200 text-xs font-semibold cursor-pointer border border-sky-500/30 transition-colors active:scale-95"
                >
                  <span>ภาษี/คลัง</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Top-Right Cities: Skylines 360° Compass, View Presets, Time of Day & Fullscreen */}
        <div
          className={`${
            showMobileTopDetails ? 'flex' : 'hidden md:flex'
          } flex-wrap items-center justify-end gap-1.5 pointer-events-auto`}
        >
          {/* Cities: Skylines 360° Compass Widget with Rotating Needle */}
          <div className="bg-[#0b131e]/95 border border-slate-700/80 rounded-xl p-1 flex items-center gap-1 shadow-xl">
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onCameraAction('rotate_left');
              }}
              aria-label="หมุนมุมกล้องซ้าย 90 องศา [Q]"
              title="หมุนซ้าย 90° [Q]"
              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg bg-[#132032] hover:bg-[#1c2e47] text-slate-200 flex items-center justify-center text-sm font-bold cursor-pointer transition-colors active:scale-95"
            >
              ↺
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onCameraAction('reset');
              }}
              aria-label={`เข็มทิศทิศเหนือ ${cameraHeading} องศา คลิกเพื่อรีเซ็ต`}
              title="รีเซ็ตทิศเหนือ [C]"
              className="h-11 min-h-[44px] px-2.5 rounded-lg bg-[#132032] hover:bg-[#1c2e47] text-sky-300 font-mono tabular-nums text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors active:scale-95"
            >
              {/* Rotating Compass Needle SVG */}
              <svg
                className="w-4 h-4 transition-transform duration-100 ease-out text-rose-500"
                viewBox="0 0 24 24"
                fill="currentColor"
                style={{ transform: `rotate(${-cameraHeading}deg)` }}
              >
                <polygon points="12,2 16,12 12,9 8,12" fill="#ef4444" />
                <polygon points="12,22 16,12 12,15 8,12" fill="#94a3b8" />
              </svg>
              <span>{cameraHeading}° N</span>
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onCameraAction('rotate_right');
              }}
              aria-label="หมุนมุมกล้องขวา 90 องศา [E]"
              title="หมุนขวา 90° [E]"
              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg bg-[#132032] hover:bg-[#1c2e47] text-slate-200 flex items-center justify-center text-sm font-bold cursor-pointer transition-colors active:scale-95"
            >
              ↻
            </button>
          </div>

          {/* Quick Perspective Views & Free 3D Orbit Camera Toggle */}
          <div className="bg-[#0b131e]/95 border border-slate-700/80 rounded-xl p-1 flex items-center gap-1 shadow-xl">
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                if (executionMode === 'god_mode') {
                  onSelectTool(isFreeCameraMode ? 'terrain_raise' : 'inspect');
                } else {
                  onSelectCategory(isFreeCameraMode ? 'roads' : 'inspect');
                }
              }}
              title="สลับโหมดหมุนกล้อง 3D อิสระ (1 นิ้วลากหมุน / คลิกซ้ายหมุน) [Esc]"
              className={`min-h-[44px] px-3 rounded-lg text-xs font-bold cursor-pointer active:scale-95 transition-all flex items-center gap-1.5 ${
                isFreeCameraMode
                  ? 'bg-sky-500 text-slate-950 shadow-md'
                  : 'bg-[#132032] hover:bg-[#1c2e47] text-sky-300 border border-sky-500/30'
              }`}
            >
              <span>🎥</span>
              <span>หมุนกล้อง 3D</span>
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onCameraAction('isometric');
              }}
              title="มุมมองจำลองสามมิติ 45° (Isometric 3D)"
              className="min-h-[44px] px-3 rounded-lg bg-[#132032] hover:bg-[#1c2e47] text-xs font-semibold text-slate-200 cursor-pointer active:scale-95 transition-all"
            >
              45°
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onCameraAction('top_down');
              }}
              title="มุมมองผังเมืองจากด้านบน 90° (Top-Down Satellite)"
              className="min-h-[44px] px-3 rounded-lg bg-[#132032] hover:bg-[#1c2e47] text-xs font-semibold text-slate-200 cursor-pointer active:scale-95 transition-all"
            >
              มุมบน
            </button>
          </div>

          {/* Time-of-Day Sunlight, Night Mode & Auto Commute Cycle Selector (Morning / Noon / Evening / Night + Auto) */}
          {onChangeTimeOfDay && (
            <div
              className="bg-[#0b131e]/95 border border-slate-700/80 rounded-xl p-1 flex items-center gap-1 shadow-xl overflow-x-auto touch-pan-x scrollbar-none"
              role="group"
              aria-label="ปรับแสงอาทิตย์และช่วงเวลาจราจร"
            >
              {(
                [
                  { id: 'morning', label: '🌅 เช้า', title: 'ยามเช้า: รถเริ่มออกจากบ้านพักอาศัยไปทำงาน' },
                  { id: 'noon', label: '☀️ กลางวัน', title: 'ตอนกลางวัน: แสงแดดคมชัด รถวิ่งระหว่างโซน' },
                  { id: 'evening', label: '🌇 เย็น', title: 'ยามเย็น: รถออกจากออฟฟิศและโรงงานกลับบ้าน' },
                  { id: 'night', label: '🌙 กลางคืน', title: 'ยามค่ำคืน: เปิดไฟเมืองและปริมาณรถวิ่งน้อยลง' },
                ] as const
              ).map((item) => {
                const active = timeOfDay === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onChangeTimeOfDay(item.id);
                    }}
                    title={item.title}
                    className={`min-h-[44px] px-2.5 rounded-lg text-xs font-semibold cursor-pointer active:scale-95 transition-all whitespace-nowrap ${
                      active
                        ? item.id === 'night'
                          ? 'bg-indigo-500 text-white font-bold shadow-sm'
                          : 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                        : 'bg-[#132032] hover:bg-[#1c2e47] text-slate-300'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
              {onToggleAutoTimeCycle && (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onToggleAutoTimeCycle();
                  }}
                  title="เปิด/ปิดระบบเวลาเดินอัตโนมัติ (เช้า → กลางวัน → เย็น → กลางคืน)"
                  className={`min-h-[44px] px-2.5 rounded-lg text-xs font-semibold cursor-pointer active:scale-95 transition-all whitespace-nowrap border ${
                    autoTimeCycle
                      ? 'bg-emerald-500 text-slate-950 border-emerald-300 font-bold shadow-sm'
                      : 'bg-[#132032] hover:bg-[#1c2e47] text-emerald-300 border-emerald-500/30'
                  }`}
                >
                  {autoTimeCycle ? '🔄 เวลาออโต้: เปิด' : '🔄 เวลาออโต้'}
                </button>
              )}
            </div>
          )}

          {/* Fullscreen Toggle Button for Android & Desktop */}
          {onToggleFullscreen && (
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleFullscreen();
              }}
              title="สลับโหมดเต็มจอ Android (Fullscreen)"
              className="min-h-[44px] px-3 rounded-xl bg-[#0b131e]/95 hover:bg-[#16253b] border border-sky-500/50 text-sky-300 text-xs font-bold flex items-center gap-1.5 shadow-xl cursor-pointer transition-colors active:scale-95"
            >
              <span>{isFullscreen ? '🗗 ออกเต็มจอ' : '⛶ เต็มจอ'}</span>
            </button>
          )}

          {/* Mod Workshop & 3D Importer Button */}
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenModWorkshop();
            }}
            aria-label="เปิดสตูดิโอนำเข้าโมเดล 3D และระบบ Mod เสริม [K]"
            className="min-h-[44px] px-3.5 rounded-xl bg-[#0b131e]/95 hover:bg-[#16253b] border border-teal-500/40 text-teal-300 text-xs font-semibold flex items-center gap-1.5 shadow-xl cursor-pointer whitespace-nowrap shrink-0 transition-colors active:scale-95"
          >
            <span>📦 นำเข้า 3D / Mod ({simState.mods.filter((m) => m.enabled).length})</span>
          </button>

          <PWAInstallButton compact />

          {/* Mute Toggle [M] */}
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            aria-label={isMuted ? 'เปิดเสียง [M]' : 'ปิดเสียง [M]'}
            title="เปิด/ปิดเสียง [M]"
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-[#0b131e]/95 hover:bg-[#16253b] border border-slate-700/80 text-slate-200 flex items-center justify-center shadow-xl cursor-pointer transition-colors active:scale-95"
          >
            {isMuted ? (
              <svg className="w-4 h-4 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            )}
          </button>

          {/* Pause Button [P / Esc] */}
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenPause();
            }}
            aria-label="พักเกมและเมนูตั้งค่า [P]"
            title="พักเกม [P / Esc]"
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-[#0b131e]/95 hover:bg-[#16253b] border border-slate-700/80 text-slate-200 flex items-center justify-center shadow-xl cursor-pointer transition-colors active:scale-95"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Optional Tax Rate & Live Region Size Popover */}
      {showTaxPanel && (
        <div className="self-start bg-[#0b131e]/95 border border-slate-700 rounded-xl p-4 w-80 shadow-2xl pointer-events-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-sky-300">นโยบายอัตราภาษี & ขนาดภูมิภาค</h3>
            <button
              type="button"
              onClick={() => setShowTaxPanel(false)}
              className="text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              ปิด
            </button>
          </div>
          <div className="space-y-2.5 text-xs">
            {(['R', 'C', 'I'] as const).map((z) => {
              const val = z === 'R' ? metrics.taxRateR : z === 'C' ? metrics.taxRateC : metrics.taxRateI;
              const label =
                z === 'R' ? 'ภาษีที่อยู่อาศัย (R)' : z === 'C' ? 'ภาษีพาณิชยกรรม (C)' : 'ภาษีอุตสาหกรรม (I)';
              return (
                <div key={z} className="flex items-center justify-between gap-2">
                  <label htmlFor={`tax-${z}`} className="text-slate-300">
                    {label}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id={`tax-${z}`}
                      type="range"
                      min="5"
                      max="16"
                      value={val}
                      onChange={(e) => onUpdateTaxRate(z, parseInt(e.target.value, 10))}
                      className="w-24 accent-sky-400 cursor-pointer"
                    />
                    <span className="font-mono tabular-nums w-8 text-right text-white">{val}%</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800">
            <span className="block text-[11px] text-slate-400 mb-1.5">
              เปลี่ยนขนาดภูมิภาค (1 ช่อง = 10 เมตร):
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {([32, 48, 64] as const).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => onChangeRegionSizeLive(sz)}
                  className={`py-1.5 rounded text-xs font-mono tabular-nums cursor-pointer ${
                    config.size === sz
                      ? 'bg-sky-500 text-slate-950 font-bold'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {sz}×{sz}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* FLOATING BUILDING INSPECTOR CARD (When player taps/clicks an inspected building) */}
      {selectedInspectTile && (
        <div className="fixed bottom-24 sm:bottom-28 left-2 sm:left-4 z-20 pointer-events-auto bg-[#0b131e]/95 border border-sky-500/50 rounded-2xl p-3.5 shadow-2xl backdrop-blur-md max-w-xs sm:max-w-sm w-[calc(100vw-1rem)] animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-start justify-between gap-2 mb-2 pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-300 flex items-center justify-center font-bold text-sm shrink-0">
                {inspectedBuilding?.isZone ? '🏙️' : inspectedBuilding?.archetype === 'road' ? '🛣️' : '🏢'}
              </div>
              <div>
                <h4 className="text-xs font-bold text-white leading-tight">
                  {inspectedBuilding ? inspectedBuilding.name : selectedInspectTile.isWater ? 'ผืนน้ำธรรมชาติ' : selectedInspectTile.isCliff ? 'หน้าผาหินธรรมชาติ' : 'ทุ่งหญ้าว่างเปล่า'}
                </h4>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                  พิกัด ({selectedInspectTile.x}, {selectedInspectTile.z}) · สูง {selectedInspectTile.elevation}m
                  {selectedInspectTile.buildingLevel ? ` · Lv.${selectedInspectTile.buildingLevel}` : ''}
                </div>
              </div>
            </div>
            {onCloseInspectTile && (
              <button
                type="button"
                onClick={onCloseInspectTile}
                aria-label="ปิดหน้าต่างตรวจสอบ"
                className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {inspectedBuilding?.isZone && !inspectedBuilding.customModel && (
            <div className="mb-2.5 bg-[#111d2e] rounded-xl p-2.5 border border-slate-800">
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-slate-300 font-semibold">สถานะการพัฒนาแปลงที่ดิน</span>
                <span className="font-mono font-bold text-amber-300">
                  {(selectedInspectTile.constructionProgress ?? 100) <= 0
                    ? 'ที่ดินโซนว่าง (0%)'
                    : (selectedInspectTile.constructionProgress ?? 100) < 100
                    ? `🏗️ กำลังก่อสร้าง ${selectedInspectTile.constructionProgress}%`
                    : `✅ สร้างเสร็จสมบูรณ์ (Lv.${selectedInspectTile.buildingLevel})`}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden border border-slate-800">
                <div
                  className={`h-full transition-all duration-300 ${
                    (selectedInspectTile.constructionProgress ?? 100) >= 100
                      ? 'bg-emerald-500'
                      : 'bg-amber-400'
                  }`}
                  style={{
                    width: `${Math.max(4, Math.min(100, selectedInspectTile.constructionProgress ?? 100))}%`,
                  }}
                />
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                {(selectedInspectTile.constructionProgress ?? 100) <= 0
                  ? selectedInspectTile.roadConnected
                    ? 'เชื่อมต่อถนนแล้ว — เครนและทีมช่างกำลังเข้าพื้นที่ก่อสร้าง'
                    : 'รอการตัดถนนเข้าถึงแปลงที่ดินเพื่อเริ่มก่อสร้างอัตโนมัติ'
                  : (selectedInspectTile.constructionProgress ?? 100) < 100
                  ? 'เครนทาวเวอร์ รถโม่ปูน และคนงานก่อสร้างกำลังเร่งพัฒนาอาคาร'
                  : 'อาคารเปิดใช้งานเต็มรูปแบบและสร้างรายได้ภาษีให้เมือง'}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-1.5 text-[11px] mb-2.5">
            <div className="bg-[#111d2e] rounded-lg p-2 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">ระบบไฟฟ้า</span>
              <span className={selectedInspectTile.powered ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                {selectedInspectTile.powered ? '⚡ เชื่อมต่อแล้ว' : '⚠️ ไม่มีไฟฟ้า'}
              </span>
            </div>
            <div className="bg-[#111d2e] rounded-lg p-2 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">ระบบประปา</span>
              <span className={selectedInspectTile.watered ? 'text-sky-400 font-semibold' : 'text-rose-400 font-semibold'}>
                {selectedInspectTile.watered ? '💧 เชื่อมต่อแล้ว' : '⚠️ ไม่มีประปา'}
              </span>
            </div>
            <div className="bg-[#111d2e] rounded-lg p-2 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">ประชากร / ผู้ใช้งาน</span>
              <span className="text-white font-mono font-semibold">
                {(selectedInspectTile.constructionProgress ?? 100) < 100
                  ? (selectedInspectTile.constructionProgress ?? 100) > 0
                    ? 'ทีมช่าง 6 คน'
                    : '0 คน (ที่ดินว่าง)'
                  : inspectedBuilding?.populationCapacity
                  ? `${Math.round(inspectedBuilding.populationCapacity * (selectedInspectTile.buildingLevel / 3))} คน`
                  : inspectedBuilding?.jobsCapacity
                  ? `${Math.round(inspectedBuilding.jobsCapacity * (selectedInspectTile.buildingLevel / 3))} งาน`
                  : '0 คน'}
              </span>
            </div>
            <div className="bg-[#111d2e] rounded-lg p-2 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">มูลค่าที่ดิน</span>
              <span className="text-amber-300 font-mono font-semibold">
                {selectedInspectTile.landValue || 10}/100
              </span>
            </div>
          </div>

          {selectedInspectTile.buildingId && onDemolishSelectedTile && (
            <button
              type="button"
              onClick={onDemolishSelectedTile}
              className="w-full h-9 rounded-xl bg-rose-600/30 hover:bg-rose-600/50 border border-rose-500/50 text-rose-200 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
            >
              <span>🚜 รื้อถอนอาคารนี้ (-฿15)</span>
            </button>
          )}
        </div>
      )}

      {/* FLOATING ANDROID QUICK THUMB CAMERA PAD (Right Edge One-Handed Ergonomics) */}
      <div
        className={`fixed right-2 sm:right-3 top-1/2 -translate-y-1/2 z-20 pointer-events-auto flex flex-col items-end gap-1.5 transition-opacity duration-200 ${
          isCanvasDragging ? 'opacity-35 pointer-events-none' : 'opacity-100'
        }`}
      >
        <button
          type="button"
          onClick={() => setShowThumbCamPad((v) => !v)}
          className="min-h-[40px] px-2.5 rounded-xl bg-[#0b131e]/90 border border-slate-700 text-[11px] font-semibold text-sky-300 shadow-lg cursor-pointer active:scale-95"
          title="ซ่อน/แสดงปุ่มควบคุมกล้องมือเดียว"
        >
          {showThumbCamPad ? '🎥 ย่อปุ่มกล้อง' : '🎥 กล้อง'}
        </button>

        {showThumbCamPad && (
          <div className="bg-[#0b131e]/95 border border-slate-700/85 rounded-2xl p-1.5 flex flex-col gap-1.5 shadow-2xl backdrop-blur-md">
            <button
              type="button"
              onClick={() => {
                if (executionMode === 'god_mode') {
                  onSelectTool(isFreeCameraMode ? 'terrain_raise' : 'inspect');
                } else {
                  onSelectCategory(isFreeCameraMode ? 'roads' : 'inspect');
                }
              }}
              className={`min-w-[48px] min-h-[48px] px-2 rounded-xl text-xs font-bold flex flex-col items-center justify-center cursor-pointer active:scale-95 transition-all ${
                isFreeCameraMode
                  ? 'bg-sky-500 text-slate-950 shadow-md ring-2 ring-sky-300'
                  : 'bg-[#132032] text-sky-300 border border-sky-500/40'
              }`}
              title="สลับโหมด 1 นิ้วหมุนกล้อง หรือ 1 นิ้ววางของ"
            >
              <span className="text-base leading-none">{isFreeCameraMode ? '🎥' : '🛠️'}</span>
              <span className="text-[10px] mt-0.5">{isFreeCameraMode ? 'หมุนอยู่' : 'วางของ'}</span>
            </button>

            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => onCameraAction('zoom_in')}
                className="min-w-[44px] min-h-[44px] rounded-xl bg-[#132032] hover:bg-[#1c2e47] text-sky-300 font-bold text-sm flex items-center justify-center cursor-pointer active:scale-95"
                title="ซูมเข้า"
              >
                ➕
              </button>
              <button
                type="button"
                onClick={() => onCameraAction('zoom_out')}
                className="min-w-[44px] min-h-[44px] rounded-xl bg-[#132032] hover:bg-[#1c2e47] text-sky-300 font-bold text-sm flex items-center justify-center cursor-pointer active:scale-95"
                title="ซูมออก"
              >
                ➖
              </button>
              <button
                type="button"
                onClick={() => onCameraAction('rotate_left')}
                className="min-w-[44px] min-h-[44px] rounded-xl bg-[#132032] hover:bg-[#1c2e47] text-slate-200 font-bold text-sm flex items-center justify-center cursor-pointer active:scale-95"
                title="หมุนซ้าย 90°"
              >
                ↺
              </button>
              <button
                type="button"
                onClick={() => onCameraAction('rotate_right')}
                className="min-w-[44px] min-h-[44px] rounded-xl bg-[#132032] hover:bg-[#1c2e47] text-slate-200 font-bold text-sm flex items-center justify-center cursor-pointer active:scale-95"
                title="หมุนขวา 90°"
              >
                ↻
              </button>
              <button
                type="button"
                onClick={() => onCameraAction('tilt_up')}
                className="min-w-[44px] min-h-[44px] rounded-xl bg-[#132032] hover:bg-[#1c2e47] text-amber-300 font-bold text-[11px] flex items-center justify-center cursor-pointer active:scale-95"
                title="ปรับมุมกล้องสูงขึ้น"
              >
                ▲มุมสูง
              </button>
              <button
                type="button"
                onClick={() => onCameraAction('tilt_down')}
                className="min-w-[44px] min-h-[44px] rounded-xl bg-[#132032] hover:bg-[#1c2e47] text-amber-300 font-bold text-[11px] flex items-center justify-center cursor-pointer active:scale-95"
                title="ปรับมุมกล้องต่ำลงระดับถนน"
              >
                ▼ระดับดิน
              </button>
            </div>
          </div>
        )}
      </div>

      {/* FLOATING ANDROID TOUCH PREVIEW CONFIRM / CANCEL BAR */}
      {pendingTouchPlacement && (
        <div className="fixed bottom-28 sm:bottom-32 left-1/2 -translate-x-1/2 z-30 pointer-events-auto w-[calc(100vw-1rem)] max-w-lg bg-[#0b131e]/98 border-2 border-emerald-400 rounded-2xl p-3 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
              <span>
                {pendingTouchPlacement.mode === 'road'
                  ? '🛣️'
                  : pendingTouchPlacement.mode === 'zone'
                  ? '📐'
                  : '🏗️'}
              </span>
              <span className="truncate">
                ตัวอย่าง: {pendingTouchPlacement.toolName}{' '}
                {pendingTouchPlacement.dimensionsLabel
                  ? `(${pendingTouchPlacement.dimensionsLabel})`
                  : `(${pendingTouchPlacement.tiles.length} ช่อง)`}
              </span>
            </div>
            <span className="font-mono text-xs font-bold text-amber-300 shrink-0">
              งบประมาณ ฿{pendingTouchPlacement.totalCost.toLocaleString()}
            </span>
          </div>
          <div className="text-[11px] text-slate-300 mb-2.5">
            💡 ลาก 1 นิ้วใหม่เพื่อขยับตำแหน่ง หรือใช้ 2 นิ้วหมุนดูมุมกล้องก่อนกดยืนยัน
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onConfirmTouchPlacement}
              className="flex-1 min-h-[48px] px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
            >
              <span>✅ ยืนยันสร้าง (฿{pendingTouchPlacement.totalCost.toLocaleString()})</span>
            </button>

            {pendingTouchPlacement.mode === 'building' && (
              <button
                type="button"
                onClick={onRotateBuilding}
                className="min-h-[48px] px-3.5 py-2.5 rounded-xl bg-[#132032] hover:bg-[#1c2e47] border border-sky-400/50 text-sky-200 font-mono text-xs font-bold flex items-center justify-center gap-1 cursor-pointer active:scale-95 transition-all"
              >
                <span>⟳ {buildingRotation * 90}°</span>
              </button>
            )}

            <button
              type="button"
              onClick={onCancelTouchPlacement}
              className="min-h-[48px] px-4 py-2.5 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white font-bold text-xs sm:text-sm shadow-lg flex items-center justify-center gap-1 cursor-pointer active:scale-95 transition-all"
            >
              <span>❌ ยกเลิก</span>
            </button>
          </div>
        </div>
      )}

      {/* UNIFIED STREAMLINED BOTTOM DOCK: God Mode vs Mayor Mode */}
      {executionMode === 'god_mode' ? (
        <div className="w-full flex flex-col items-center gap-1.5 pointer-events-none">
          {statusBanner && (
            <div className="px-3.5 py-1.5 rounded-xl bg-emerald-950/95 border border-emerald-400/50 text-xs text-emerald-200 font-medium shadow-xl pointer-events-auto">
              {statusBanner}
            </div>
          )}
          <GodModeToolbar
            activeToolId={activeToolId}
            brushRadius={brushRadius}
            wildlifeCount={wildlifeCount}
            isCanvasDragging={isCanvasDragging}
            onSelectTool={(tid) => onSelectTool(tid)}
            onChangeBrushRadius={onChangeBrushRadius}
            onCameraAction={onCameraAction}
            onResetEntireMapFlat={onResetEntireMapFlat || (() => {})}
            onGenerateWildLand={onGenerateWildLand || (() => {})}
            onIncorporateCity={onIncorporateCity || (() => {})}
            onOpenRegionMap={onOpenRegionMap || (() => {})}
            isDockCollapsed={dockCollapsed}
            onToggleCollapse={toggleDock}
          />
        </div>
      ) : (
        <div
          className={`w-full max-w-[960px] mx-auto flex flex-col items-center pointer-events-auto transition-all duration-200 ${
            isCanvasDragging ? 'opacity-45 translate-y-2 pointer-events-none' : 'opacity-100 translate-y-0'
          }`}
        >
        {/* Floating Context Action Bar & Collapse Toggle */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-2 max-w-full">
          {/* Active Tool Exit / Return to Free Camera */}
          {activeCategory !== 'inspect' && (
            <button
              type="button"
              onClick={() => onSelectCategory('inspect')}
              className="min-h-[48px] px-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-xl cursor-pointer active:scale-95 transition-all"
            >
              <span>✕ ออกโหมดสร้าง / หมุนกล้อง 3D</span>
            </button>
          )}

          {/* Building Rotation Toggle (0°, 90°, 180°, 270°) */}
          {activeCategory !== 'inspect' && activeCategory !== 'terrain' && activeCategory !== 'demolish' && (
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onRotateBuilding();
              }}
              title="หมุนทิศทางสิ่งปลูกสร้าง 90 องศา [Tab]"
              className="min-h-[48px] px-3.5 rounded-xl bg-[#0b131e]/95 hover:bg-[#16253b] border border-sky-400/50 text-sky-200 font-mono text-xs font-semibold flex items-center gap-1.5 shadow-xl cursor-pointer active:scale-95 transition-all"
            >
              <span>⟳ หมุน {buildingRotation * 90}°</span>
            </button>
          )}

          {/* Terrain Brush Size Controls */}
          {activeCategory === 'terrain' && (
            <div className="flex items-center gap-1 bg-[#0b131e]/95 border border-slate-700/80 p-1 rounded-xl shadow-xl">
              <span className="text-[11px] text-slate-400 px-2 font-medium">ขนาดแปรง:</span>
              {[0, 1, 2].map((r) => {
                const dim = (1 + r * 2) * 10;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => onChangeBrushRadius(r)}
                    className={`min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-mono tabular-nums cursor-pointer transition-colors active:scale-95 ${
                      brushRadius === r
                        ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {1 + r * 2}×{1 + r * 2} ({dim}m)
                  </button>
                );
              })}
            </div>
          )}

          {/* Live Road & SimCity 4 10x10 RCI Zone Dragging Preview Indicator */}
          {roadDragPreview && (
            <div className="px-3.5 py-2 rounded-xl bg-sky-950/95 border border-sky-400 text-xs text-sky-100 font-semibold shadow-2xl flex items-center gap-2">
              {roadDragPreview.isZoneDrag ? (
                <span>
                  📐 จัดสรรโซน {roadDragPreview.roadName}: ขนาด {roadDragPreview.dimensionsLabel} (
                  {roadDragPreview.count} แปลง
                  {roadDragPreview.streetCount ? ` + ซอยอัตโนมัติ ${roadDragPreview.streetCount} ช่อง` : ''}) · ฿
                  {roadDragPreview.cost.toLocaleString()}
                </span>
              ) : (
                <span>
                  🛣️ แนว {roadDragPreview.roadName}: {roadDragPreview.count} ช่อง (
                  {roadDragPreview.count * TILE_SIZE_METERS} ม.) · ฿{roadDragPreview.cost.toLocaleString()}
                </span>
              )}
              <span className="text-amber-300 font-mono text-[11px]">
                [ปล่อยเมาส์เพื่อสร้าง / กด Esc ยกเลิก]
              </span>
            </div>
          )}

          {/* Status Banner Toast */}
          {statusBanner && !roadDragPreview && !pendingTouchPlacement && (
            <div className="px-3 py-1.5 rounded-xl bg-sky-950/95 border border-sky-500/50 text-xs text-sky-200 font-medium shadow-xl">
              {statusBanner}
            </div>
          )}

          {/* Collapse / Expand Dock Button */}
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              toggleDock();
            }}
            className="min-h-[48px] px-4 py-2 rounded-xl bg-[#0b131e]/95 hover:bg-[#152438] border border-slate-700/80 text-xs font-medium text-slate-200 transition-all cursor-pointer shadow-lg active:scale-95"
          >
            {dockCollapsed ? '▴ แสดงเมนูเครื่องมือ' : '▾ ย่อแถบเครื่องมือ'}
          </button>
        </div>

        {/* Main Dock Container */}
        {!effectiveDockCollapsed && (
          <div className="w-full bg-[#0b131e]/95 border border-slate-700/85 rounded-2xl p-2.5 sm:p-3 shadow-2xl backdrop-blur-md">
            {/* Row 1: Category Tabs + Data Overlays */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-800">
              {/* Category Segmented Tabs (Horizontally scrollable on mobile) */}
              <div
                className="flex items-center gap-1.5 bg-[#111d2e] p-1.5 rounded-xl max-w-full overflow-x-auto touch-pan-x scrollbar-none flex-nowrap"
                role="tablist"
                aria-label="หมวดหมู่เครื่องมือสร้างเมือง"
              >
                {CATEGORY_TABS.map((tab) => {
                  const active = activeCategory === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onSelectCategory(tab.id);
                      }}
                      className={`min-h-[48px] px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer active:scale-95 flex items-center gap-1.5 ${
                        active
                          ? 'bg-sky-500 text-slate-950 shadow-md font-bold'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                      }`}
                    >
                      <span className="text-sm">{tab.icon}</span>
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Data Overlay Filter */}
              <div className="flex items-center gap-1 bg-[#111d2e] p-1 rounded-xl overflow-x-auto touch-pan-x scrollbar-none" role="group" aria-label="มุมมองข้อมูลเมือง">
                {OVERLAY_OPTIONS.map((ov) => (
                  <button
                    key={ov.id}
                    type="button"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onChangeOverlay(ov.id);
                    }}
                    className={`min-h-[40px] px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors active:scale-95 ${
                      dataOverlay === ov.id
                        ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {ov.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Row 2: Tool Selection / Inspection Guide */}
            {activeCategory === 'inspect' ? (
              <div className="bg-[#121f31]/80 border border-sky-500/30 rounded-xl p-3 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-300 flex items-center justify-center text-xl shrink-0">
                    🔍
                  </div>
                  <div>
                    <div className="font-bold text-white text-sm">
                      โหมดสำรวจเมือง & หมุนกล้อง 3D (Cities: Skylines Camera Mode)
                    </div>
                    <div className="text-slate-300 text-[11px] mt-0.5 leading-relaxed">
                      <span className="text-sky-300 font-semibold">📱 Android:</span> ลาก 1 นิ้วหมุนกล้อง 360° · กาง 2 นิ้วซูมเข้า/ออก · ลาก 2 นิ้วเลื่อนผังเมือง · แตะอาคารเพื่อดูข้อมูล
                      <span className="mx-1 text-slate-500">|</span>
                      <span className="text-sky-300 font-semibold">💻 PC:</span> คลิกขวาค้างหมุน 360° & ก้มเงย · กดล้อเมาส์ค้างเลื่อนผัง · กลิ้งล้อเมาส์ซูม · WASD เลื่อนกล้อง · R/F ปรับมุมก้มเงย
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onCameraAction('isometric')}
                    className="min-h-[44px] px-3.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-400/40 text-xs font-semibold cursor-pointer active:scale-95 transition-all"
                  >
                    มุมมอง 3D (45°)
                  </button>
                  <button
                    type="button"
                    onClick={() => onCameraAction('top_down')}
                    className="min-h-[44px] px-3.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 text-xs font-semibold cursor-pointer active:scale-95 transition-all"
                  >
                    มุมบน (90°)
                  </button>
                  <button
                    type="button"
                    onClick={() => onCameraAction('reset')}
                    className="min-h-[44px] px-3.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 text-xs font-semibold cursor-pointer active:scale-95 transition-all"
                  >
                    รีเซ็ตศูนย์กลาง
                  </button>
                </div>
              </div>
            ) : activeCategory === 'demolish' ? (
              <div className="bg-rose-950/40 border border-rose-500/40 rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-300 flex items-center justify-center text-xl shrink-0">
                    🚜
                  </div>
                  <div>
                    <div className="font-bold text-white text-sm">เครื่องมือรื้อถอนสิ่งปลูกสร้าง (Bulldozer) - ฿15/ช่อง</div>
                    <div className="text-rose-200 text-[11px] mt-0.5">
                      คลิกซ้าย (บน PC) หรือแตะลากนิ้ว (บน Android) ผ่านอาคาร ถนน หรือสะพานที่ต้องการรื้อถอน
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectCategory('inspect')}
                  className="min-h-[44px] px-4 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 font-bold text-xs cursor-pointer active:scale-95 transition-all"
                >
                  ✕ ออกโหมดรื้อถอน (กลับสู่โหมดกล้อง 3D)
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 max-h-[40vh] md:max-h-[30vh] overflow-y-auto pr-0.5">
                {activeCategory === 'terrain'
                  ? TERRAIN_TOOLS.filter((t) => t.id !== 'bulldoze').map((tool) => {
                      const active = activeToolId === tool.id;
                      return (
                        <button
                          key={tool.id}
                          type="button"
                          onClick={(e) => {
                            e.currentTarget.blur();
                            onSelectTool(tool.id);
                          }}
                          aria-pressed={active}
                          className={`min-h-[58px] p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer active:scale-[0.98] ${
                            active
                              ? 'bg-emerald-500/25 border-emerald-400 text-white shadow-md'
                              : 'bg-[#121f31] border-slate-800 text-slate-300 hover:border-slate-600'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-semibold truncate">{tool.name}</span>
                            <span className="text-[10px] font-mono text-slate-400">[{tool.keyBinding}]</span>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[11px] font-mono tabular-nums text-emerald-300">
                            <span>฿{tool.costPerTile}/ช่อง</span>
                            <span>10m</span>
                          </div>
                        </button>
                      );
                    })
                  : categoryBuildings.map((b) => {
                      const active = activeToolId === b.id;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={(e) => {
                            e.currentTarget.blur();
                            onSelectTool(b.id);
                          }}
                          aria-pressed={active}
                          className={`min-h-[58px] p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer active:scale-[0.98] ${
                            active
                              ? 'bg-sky-500/25 border-sky-400 text-white shadow-md'
                              : 'bg-[#121f31] border-slate-800 text-slate-300 hover:border-slate-600'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-semibold truncate">{b.name}</span>
                            {b.keyBinding && (
                              <span className="text-[10px] font-mono text-slate-400">[{b.keyBinding}]</span>
                            )}
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[11px] font-mono tabular-nums">
                            <span className="text-amber-300 font-semibold">฿{b.cost}</span>
                            <span className="text-slate-400 truncate">
                              {b.powerMW > 0
                                ? `+${b.powerMW}MW`
                                : b.waterM3 > 0
                                ? `+${b.waterM3}m³`
                                : b.populationCapacity > 0
                                ? `บ้าน ${b.populationCapacity}`
                                : b.jobsCapacity > 0
                                ? `งาน ${b.jobsCapacity}`
                                : `${b.stories} ชั้น`}
                            </span>
                          </div>
                        </button>
                      );
                    })}

                {activeCategory === 'mods' && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onOpenModWorkshop();
                    }}
                    className="min-h-[58px] p-2.5 rounded-xl border border-dashed border-teal-500/60 bg-teal-950/30 hover:bg-teal-900/40 text-teal-300 text-left flex flex-col justify-between cursor-pointer active:scale-[0.98]"
                  >
                    <span className="text-xs font-semibold">+ สร้าง / ติดตั้ง Mod</span>
                    <span className="text-[10px] text-teal-400">เพิ่มอาคารใหม่</span>
                  </button>
                )}
              </div>
            )}

            {/* Row 3: Active Tool Summary / Description */}
            <div className="mt-2 pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
              {activeCategory === 'inspect' ? (
                <span>โหมดสำรวจ: คลิก/แตะสิ่งปลูกสร้างเพื่อตรวจสอบรายละเอียด หรือหมุนมุมกล้อง 3D ได้อย่างอิสระ</span>
              ) : activeCategory === 'demolish' ? (
                <span className="text-rose-300 font-medium">โหมดรื้อถอน: คลิกหรือลากผ่านสิ่งปลูกสร้างเพื่อลบและคืนพื้นที่</span>
              ) : selectedTerrainTool ? (
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-emerald-300">{selectedTerrainTool.name}</span>
                  <span>·</span>
                  <span>{selectedTerrainTool.description}</span>
                </div>
              ) : selectedBuilding ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-sky-300">{selectedBuilding.name}</span>
                  <span>·</span>
                  <span>{selectedBuilding.description}</span>
                  <span>·</span>
                  <span className="font-mono tabular-nums text-slate-400">
                    ค่าบำรุง ฿{selectedBuilding.upkeepPerMonth}/ด. | ไฟ {selectedBuilding.powerMW >= 0 ? `+${selectedBuilding.powerMW}` : selectedBuilding.powerMW}MW | น้ำ {selectedBuilding.waterM3 >= 0 ? `+${selectedBuilding.waterM3}` : selectedBuilding.waterM3}m³
                  </span>
                </div>
              ) : (
                <span>เลือกเครื่องมือด้านบนแล้วคลิกซ้ายหรือแตะบนแผนที่ 3 มิติเพื่อสร้างเมือง</span>
              )}
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
};
