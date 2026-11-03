import { useCallback, useEffect, useRef, useState } from 'react';
import { CityHUD } from './components/CityHUD';
import {
  CameraActionCommand,
  CityViewport3D,
  PendingTouchPlacement,
  RoadDragPreviewInfo,
} from './components/CityViewport3D';
import { ModWorkshopModal } from './components/ModWorkshopModal';
import { LotEditorModal } from './components/LotEditorModal';
import { UserGuideModal } from './components/UserGuideModal';
import { RegionMapView } from './components/RegionMapView';
import { StatusModal } from './components/StatusModal';
import { TitleScreenModal } from './components/TitleScreenModal';
import { gameAudio } from './game/audio';
import { getAllAvailableBuildings, TERRAIN_TOOLS } from './game/catalog';
import {
  applyTerrainTool,
  createInitialRegionWorld,
  createInitialSimulationState,
  placeBuildingOnTile,
  placeRoadPathOnTiles,
  placeZoneAreaOnTiles,
  simulateCityTick,
} from './game/rules';
import {
  BuildingDefinition,
  CitySimulationState,
  DataOverlayMode,
  GameExecutionMode,
  GameStateStatus,
  ModPackage,
  RegionConfig,
  RegionSize,
  RegionWorldState,
  TerrainToolId,
  TileData,
  TimeOfDayPreset,
  ToolCategory,
} from './game/types';

const STORAGE_SAVE_KEY = 'metroterra_3d_saved_city_v1';
const STORAGE_MODS_KEY = 'metroterra_3d_custom_mods_v1';

const INITIAL_REGION_CONFIG: RegionConfig = {
  size: 32,
  preset: 'pristine_flat', // As requested: starts with 100% pristine flat empty land!
  seed: 4280,
  waterLevelOffset: 0,
  cliffSteepness: 1.0,
  forestDensity: 0.35,
  cityName: 'ศูนย์กลางมหานครหลวง',
};

export default function App() {
  const isAutostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === 1 as any ||
    (typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('autostart') === '1');

  const [simState, setSimState] = useState<CitySimulationState>(() => {
    let savedMods: ModPackage[] | undefined = undefined;
    try {
      const rawMods = localStorage.getItem(STORAGE_MODS_KEY);
      if (rawMods) {
        const parsedMods = JSON.parse(rawMods);
        if (Array.isArray(parsedMods) && parsedMods.length > 0) {
          savedMods = parsedMods;
        }
      }
    } catch {}
    const initial = createInitialSimulationState(INITIAL_REGION_CONFIG, savedMods);
    if (isAutostart) {
      initial.status = 'playing';
    }
    return initial;
  });

  const [regionWorld, setRegionWorld] = useState<RegionWorldState>(() =>
    createInitialRegionWorld('มหานครสุวรรณภูมิ', 'pristine_flat')
  );
  const [showRegionMap, setShowRegionMap] = useState<boolean>(false);
  const [executionMode, setExecutionMode] = useState<GameExecutionMode>('god_mode');

  const [activeCategory, setActiveCategory] = useState<ToolCategory>('terrain');
  const [activeToolId, setActiveToolId] = useState<string>('terrain_raise');
  const [brushRadius, setBrushRadius] = useState<number>(0);
  const [buildingRotation, setBuildingRotation] = useState<number>(0);
  const [dataOverlay, setDataOverlay] = useState<DataOverlayMode>('none');
  const [hoveredTile, setHoveredTile] = useState<TileData | null>(null);
  const [selectedInspectTile, setSelectedInspectTile] = useState<TileData | null>(null);
  const [cameraHeading, setCameraHeading] = useState<number>(45);
  const [cameraCommand, setCameraCommand] = useState<CameraActionCommand | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showModWorkshop, setShowModWorkshop] = useState<boolean>(false);
  const [modWorkshopTab, setModWorkshopTab] = useState<'installed' | 'import3d' | 'create' | 'json' | 'lotstudio'>('import3d');
  const [showLotEditor, setShowLotEditor] = useState<boolean>(false);
  const [showUserGuide, setShowUserGuide] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [saveStatusMessage, setSaveStatusMessage] = useState<string | null>(null);
  const [isDockCollapsed, setIsDockCollapsed] = useState<boolean>(false);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDayPreset>('noon');
  const [autoTimeCycle, setAutoTimeCycle] = useState<boolean>(false);
  const [roadDragPreview, setRoadDragPreview] = useState<RoadDragPreviewInfo | null>(null);
  const [pendingTouchPlacement, setPendingTouchPlacement] = useState<PendingTouchPlacement | null>(null);
  const [isCanvasDragging, setIsCanvasDragging] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const bannerTimeoutRef = useRef<number>(0);

  const showToast = useCallback((msg: string) => {
    setStatusBanner(msg);
    window.clearTimeout(bannerTimeoutRef.current);
    bannerTimeoutRef.current = window.setTimeout(() => {
      setStatusBanner(null);
    }, 2800);
  }, []);

  // Mirror game state machine to document.body.dataset.state
  useEffect(() => {
    document.body.dataset.state = simState.status;
  }, [simState.status]);

  const setStatusSynchronously = useCallback((nextStatus: GameStateStatus) => {
    document.body.dataset.state = nextStatus;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setSimState((prev) => ({ ...prev, status: nextStatus }));
  }, []);

  const handleStartGame = useCallback(() => {
    document.body.dataset.state = 'playing';
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setExecutionMode('mayor_mode');
    setActiveCategory('roads');
    setActiveToolId('road_avenue');
    gameAudio.playStartFanfare();
    setSimState((prev) => ({
      ...prev,
      status: 'playing',
      executionMode: 'mayor_mode',
      incorporated: true,
      outcomeReason: null,
    }));
  }, []);

  const handleStartGodMode = useCallback(() => {
    document.body.dataset.state = 'playing';
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setExecutionMode('god_mode');
    setActiveCategory('terrain');
    setActiveToolId('terrain_raise');
    gameAudio.playStartFanfare();
    setSimState((prev) => ({
      ...prev,
      status: 'playing',
      executionMode: 'god_mode',
      outcomeReason: null,
    }));
    showToast('เข้าสู่โหมดสร้างภูมิประเทศ (God Mode): ปั้นดินฟรี 100% ก่อนสถาปนาเมือง');
  }, [showToast]);

  const handleIncorporateCity = useCallback(() => {
    gameAudio.playStartFanfare();
    setExecutionMode('mayor_mode');
    setActiveCategory('roads');
    setActiveToolId('road_avenue');
    showToast(`สถาปนา ${simState.config.cityName || 'เมือง'} สำเร็จ! ได้รับงบประมาณ ฿50,000 เข้าสู่โหมดบริหารเมือง`);
    setSimState((prev) => ({
      ...prev,
      incorporated: true,
      executionMode: 'mayor_mode',
      metrics: {
        ...prev.metrics,
        treasury: Math.max(prev.metrics.treasury, 50000),
      },
    }));
  }, [simState.config.cityName, showToast]);

  // Sync browser Fullscreen state for Android & Desktop
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    try {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    } catch {
      showToast('เบราว์เซอร์นี้ไม่รองรับการสลับเต็มจออัตโนมัติ');
    }
  }, [showToast]);

  const handleSwitchExecutionMode = useCallback((mode: GameExecutionMode) => {
    setExecutionMode(mode);
    setPendingTouchPlacement(null);
    setRoadDragPreview(null);
    setSimState((prev) => ({ ...prev, executionMode: mode }));
    if (mode === 'god_mode') {
      setActiveCategory('terrain');
      setActiveToolId('terrain_raise');
      showToast('เข้าสู่โหมดสร้างภูมิประเทศ: ปั้นดินฟรี 100% ไม่จำกัดงบประมาณ');
    } else {
      setActiveCategory('roads');
      setActiveToolId('road_avenue');
      showToast('เข้าสู่โหมดบริหารเมือง: เริ่มวางผังและจำลองเมือง');
    }
  }, [showToast]);

  const handleResetEntireMapFlat = useCallback(() => {
    setSimState((prev) => {
      const nextTiles = prev.tiles.map((t) => ({
        ...t,
        elevation: 2.0,
        slope: 0,
        isWater: false,
        isCliff: false,
        trees: 0,
        buildingId: null,
        isBridge: false,
      }));
      gameAudio.playTerrainSound('lower');
      showToast('รีเซ็ตพื้นที่ทั้งหมดกลับเป็นที่ราบ 100% (+2 เมตร) เรียบร้อย');
      return {
        ...prev,
        tiles: nextTiles,
      };
    });
  }, [showToast]);

  const handleGenerateWildLand = useCallback(() => {
    setSimState((prev) => {
      const nextSeed = Math.floor(1000 + Math.random() * 9000);
      const newConfig: RegionConfig = {
        ...prev.config,
        preset: 'river_valley',
        seed: nextSeed,
      };
      const rebuilt = createInitialSimulationState(newConfig, prev.mods, true);
      rebuilt.status = prev.status;
      rebuilt.executionMode = executionMode;
      rebuilt.incorporated = prev.incorporated;
      gameAudio.playTerrainSound('water');
      showToast('สุ่มสร้างเทือกเขาและแม่น้ำธรรมชาติใหม่เรียบร้อย');
      return rebuilt;
    });
  }, [executionMode, showToast]);

  const handleSelectRegionPlot = useCallback(
    (plotId: string, targetMode: 'god_mode' | 'mayor_mode') => {
      setRegionWorld((rw) => {
        const updatedPlots = { ...rw.plots };
        if (rw.plots[rw.activePlotId]) {
          updatedPlots[rw.activePlotId] = {
            ...rw.plots[rw.activePlotId],
            tiles: simState.tiles,
            metrics: simState.metrics,
            incorporated: simState.incorporated ?? false,
          };
        }
        const targetPlot = updatedPlots[plotId];
        if (targetPlot) {
          setSimState((prev) => ({
            ...prev,
            config: targetPlot.config,
            tiles: targetPlot.tiles,
            metrics: targetPlot.metrics,
            incorporated: targetPlot.incorporated,
            executionMode: targetMode,
          }));
          setExecutionMode(targetMode);
          if (targetMode === 'god_mode') {
            setActiveCategory('terrain');
            setActiveToolId('terrain_raise');
          } else {
            setActiveCategory('roads');
            setActiveToolId('road_avenue');
          }
          showToast(`เข้าสู่ผืนเมือง [${targetPlot.name}] (${targetMode === 'god_mode' ? 'โหมดสร้างภูมิประเทศ' : 'โหมดบริหารเมือง'})`);
        }
        return {
          ...rw,
          plots: updatedPlots,
          activePlotId: plotId,
          activeMode: targetMode,
        };
      });
      setShowRegionMap(false);
    },
    [simState.tiles, simState.metrics, simState.incorporated, showToast]
  );

  // Update region config on Title Screen and regenerate live 3D world preview
  const handleUpdateConfig = useCallback((partial: Partial<RegionConfig>) => {
    setSimState((prev) => {
      const nextConfig: RegionConfig = { ...prev.config, ...partial };
      const rebuilt = createInitialSimulationState(nextConfig, prev.mods);
      rebuilt.status = prev.status;
      return rebuilt;
    });
  }, []);

  const handleRandomizeSeed = useCallback(() => {
    const nextSeed = Math.floor(1000 + Math.random() * 9000);
    handleUpdateConfig({ seed: nextSeed });
  }, [handleUpdateConfig]);

  // Switch region size live from inside the game
  const handleChangeRegionSizeLive = useCallback(
    (newSize: RegionSize) => {
      setSimState((prev) => {
        if (prev.config.size === newSize) return prev;
        const nextConfig: RegionConfig = { ...prev.config, size: newSize };
        const rebuilt = createInitialSimulationState(nextConfig, prev.mods);
        rebuilt.status = 'playing';
        return rebuilt;
      });
      showToast(`เปลี่ยนขนาดภูมิภาคเป็น ${newSize}×${newSize} ช่อง (${newSize * 10}×${newSize * 10} ม.) เรียบร้อย`);
    },
    [showToast]
  );

  // Periodic City Simulation Tick
  useEffect(() => {
    if (simState.status !== 'playing' || simState.simSpeed === 0 || showModWorkshop) {
      return;
    }
    const intervalMs = Math.round(1600 / simState.simSpeed);
    const timer = window.setInterval(() => {
      setSimState((prev) => {
        if (prev.status !== 'playing') return prev;
        return simulateCityTick(prev, true);
      });
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [simState.status, simState.simSpeed, showModWorkshop]);

  // Automatic Day-Night Commute Cycle (Morning -> Noon -> Evening -> Night)
  useEffect(() => {
    if (!autoTimeCycle || simState.status !== 'playing' || simState.simSpeed === 0 || showModWorkshop) {
      return;
    }
    const order: TimeOfDayPreset[] = ['morning', 'noon', 'evening', 'night'];
    const cycleMs = Math.max(4500, Math.round(12000 / Math.max(1, simState.simSpeed)));
    const timer = window.setInterval(() => {
      setTimeOfDay((prev) => {
        const idx = order.indexOf(prev);
        return order[(idx + 1) % order.length];
      });
    }, cycleMs);
    return () => window.clearInterval(timer);
  }, [autoTimeCycle, simState.status, simState.simSpeed, showModWorkshop]);

  const handleCommitRoadPath = useCallback(
    (roadId: string, pathTiles: Array<{ x: number; z: number }>) => {
      setRoadDragPreview(null);
      setSimState((prev) => {
        if (prev.status !== 'playing') return prev;
        if (executionMode === 'god_mode') {
          gameAudio.playErrorSound();
          showToast('กรุณากด "สถาปนาเมือง (Incorporate)" ก่อนเริ่มวางผังเมืองและถนน');
          return prev;
        }
        const res = placeRoadPathOnTiles(prev, roadId, pathTiles);
        if (res.placedCount === 0) {
          if (res.message) {
            gameAudio.playErrorSound();
            showToast(res.message);
          }
          return prev;
        }
        gameAudio.playBuildSound(res.totalCost >= 300);
        showToast(`${res.message} (-฿${res.totalCost.toLocaleString()})`);
        return res.nextState;
      });
    },
    [executionMode, showToast]
  );

  const handleCommitZoneArea = useCallback(
    (zoneId: string, areaTiles: Array<{ x: number; z: number; isAutoStreet?: boolean }>) => {
      setRoadDragPreview(null);
      setSimState((prev) => {
        if (prev.status !== 'playing') return prev;
        if (executionMode === 'god_mode') {
          gameAudio.playErrorSound();
          showToast('กรุณากด "สถาปนาเมือง (Incorporate)" ก่อนเริ่มจัดสรรโซน RCI');
          return prev;
        }
        const res = placeZoneAreaOnTiles(prev, zoneId, areaTiles);
        if (res.zonedCount === 0 && res.streetCount === 0) {
          if (res.message) {
            gameAudio.playErrorSound();
            showToast(res.message);
          }
          return prev;
        }
        gameAudio.playBuildSound(res.totalCost >= 300);
        showToast(`${res.message} (-฿${res.totalCost.toLocaleString()})`);
        return res.nextState;
      });
    },
    [executionMode, showToast]
  );

  const handleCancelRoadDrag = useCallback(() => {
    setRoadDragPreview(null);
    setPendingTouchPlacement(null);
    showToast('ยกเลิกการวางแล้ว (ลากนิ้วใหม่หรือกดปุ่มกล้องเพื่อหมุนมุมมอง 3D)');
  }, [showToast]);

  // Tile click / drag handler for terrain sculpting & building placement
  const handleTileInteract = useCallback(
    (x: number, z: number, isDrag: boolean) => {
      setSimState((prev) => {
        if (prev.status !== 'playing') return prev;
        if (activeToolId === 'inspect' || activeToolId === 'camera_pan') return prev;

        const isGod = executionMode === 'god_mode';
        const isTerrainTool = TERRAIN_TOOLS.some((t) => t.id === activeToolId);
        if (isTerrainTool) {
          const res = applyTerrainTool(
            prev,
            activeToolId as TerrainToolId,
            x,
            z,
            brushRadius,
            isGod /* Free in God Mode! */
          );
          if (res.error) {
            if (!isDrag) {
              gameAudio.playErrorSound();
              showToast(res.error);
            }
            return prev;
          }
          if (res.modifiedCount > 0) {
            const soundType =
              activeToolId === 'bulldoze'
                ? 'bulldoze'
                : activeToolId === 'terrain_water' || activeToolId === 'terrain_river'
                ? 'water'
                : activeToolId === 'terrain_lower'
                ? 'lower'
                : 'raise';
            gameAudio.playTerrainSound(soundType);
          }
          return res.nextState;
        }

        // In God Mode, guide the player to incorporate before building
        if (isGod) {
          if (!isDrag) {
            gameAudio.playErrorSound();
            showToast('กรุณากด "สถาปนาเมือง (Incorporate)" ก่อนเริ่มวางผังเมืองและสิ่งปลูกสร้าง');
          }
          return prev;
        }

        // Building / Zone / Road / Mod placement in Mayor Mode
        const placeRes = placeBuildingOnTile(prev, activeToolId, x, z, buildingRotation);
        if (!placeRes.placed) {
          if (!isDrag && placeRes.message) {
            gameAudio.playErrorSound();
            showToast(placeRes.message);
          }
          return prev;
        }

        gameAudio.playBuildSound(placeRes.cost >= 450);
        if (!isDrag && placeRes.message) {
          showToast(`${placeRes.message} (-฿${placeRes.cost})`);
        }
        return placeRes.nextState;
      });
    },
    [activeToolId, brushRadius, buildingRotation, executionMode, showToast]
  );

  const handleConfirmTouchPlacement = useCallback(() => {
    if (!pendingTouchPlacement) return;
    const current = pendingTouchPlacement;
    setPendingTouchPlacement(null);
    if (current.mode === 'road') {
      handleCommitRoadPath(current.toolId, current.tiles);
    } else if (current.mode === 'zone') {
      handleCommitZoneArea(current.toolId, current.tiles);
    } else if (current.tiles.length > 0) {
      const pt = current.tiles[0];
      handleTileInteract(pt.x, pt.z, false);
    }
  }, [pendingTouchPlacement, handleCommitRoadPath, handleCommitZoneArea, handleTileInteract]);

  // Keep selectedInspectTile synchronized with latest tile simulation state (live construction progress)
  useEffect(() => {
    if (!selectedInspectTile) return;
    const size = simState.config.size;
    const latest = simState.tiles[selectedInspectTile.z * size + selectedInspectTile.x];
    if (latest && latest !== selectedInspectTile) {
      setSelectedInspectTile(latest);
    }
  }, [simState.tiles, simState.config.size, selectedInspectTile]);

  const handleCancelTouchPlacement = useCallback(() => {
    setPendingTouchPlacement(null);
    showToast('ยกเลิกตัวอย่างสิ่งปลูกสร้างแล้ว');
  }, [showToast]);

  const handleSelectCategory = useCallback(
    (cat: ToolCategory) => {
      setActiveCategory(cat);
      setSelectedInspectTile(null);
      setRoadDragPreview(null);
      setPendingTouchPlacement(null);
      if (cat === 'inspect') {
        setActiveToolId('inspect');
      } else if (cat === 'demolish') {
        setActiveToolId('bulldoze');
      } else if (cat === 'terrain') {
        setActiveToolId('terrain_raise');
      } else {
        const all = getAllAvailableBuildings(simState.mods);
        const firstInCat = all.find((b) => b.category === cat);
        if (firstInCat) {
          setActiveToolId(firstInCat.id);
        }
      }
    },
    [simState.mods]
  );

  const handleDemolishSelectedTile = useCallback(() => {
    if (!selectedInspectTile) return;
    const { x, z } = selectedInspectTile;
    setSimState((prev) => {
      const res = applyTerrainTool(prev, 'bulldoze', x, z, 0);
      if (res.modifiedCount > 0) {
        gameAudio.playTerrainSound('bulldoze');
        showToast(`รื้อถอนอาคารที่พิกัด (${x}, ${z}) เรียบร้อย (-฿15)`);
        return res.nextState;
      }
      return prev;
    });
    setSelectedInspectTile(null);
  }, [selectedInspectTile, showToast]);

  // Global Keyboard Shortcuts (Title Enter/Space, Pause Esc/P, Tool hotkeys)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }

      if (simState.status === 'title') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          handleStartGame();
        }
        return;
      }

      if (e.code === 'Escape') {
        e.preventDefault();
        if (showModWorkshop) {
          setShowModWorkshop(false);
          return;
        }
        if (selectedInspectTile) {
          setSelectedInspectTile(null);
          return;
        }
        if (activeToolId !== 'inspect') {
          setRoadDragPreview(null);
          if (executionMode === 'god_mode') {
            setActiveToolId('inspect');
            showToast('สลับเป็นโหมดหมุนกล้อง 3D อิสระ (คลิกซ้าย/คลิกขวาลากเพื่อหมุน 360°)');
          } else {
            handleSelectCategory('inspect');
            showToast('ยกเลิกเครื่องมือ — เข้าสู่โหมดสำรวจและหมุนกล้อง 3D');
          }
          return;
        }
        if (simState.status === 'playing') {
          setStatusSynchronously('paused');
        } else if (simState.status === 'paused') {
          setStatusSynchronously('playing');
        }
        return;
      }

      if (e.code === 'KeyP') {
        e.preventDefault();
        if (simState.status === 'playing') {
          setStatusSynchronously('paused');
        } else if (simState.status === 'paused') {
          setStatusSynchronously('playing');
        }
        return;
      }

      if (simState.status !== 'playing' || showModWorkshop) return;

      if (e.code === 'Tab') {
        e.preventDefault();
        setBuildingRotation((r) => (r + 1) % 4);
      } else if (e.code === 'KeyM') {
        const muted = gameAudio.toggleMute();
        setIsMuted(muted);
      } else if (e.code === 'KeyK') {
        setShowModWorkshop((v) => !v);
      } else if (e.code === 'KeyC') {
        setCameraCommand({ type: 'reset', timestamp: Date.now() });
      } else if (executionMode === 'mayor_mode' && e.code === 'KeyB') {
        handleSelectCategory('demolish');
      } else if (executionMode === 'mayor_mode' && e.code === 'KeyZ') {
        handleSelectCategory('zones');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [simState.status, showModWorkshop, handleStartGame, setStatusSynchronously, selectedInspectTile, activeCategory, activeToolId, executionMode, handleSelectCategory, showToast]);

  const handleToggleMod = useCallback((modId: string) => {
    setSimState((prev) => {
      const nextMods = prev.mods.map((m) => (m.id === modId ? { ...m, enabled: !m.enabled } : m));
      try {
        localStorage.setItem(STORAGE_MODS_KEY, JSON.stringify(nextMods));
      } catch {}
      return simulateCityTick({ ...prev, mods: nextMods }, false);
    });
  }, []);

  const handleAddCustomMod = useCallback(
    (newMod: ModPackage) => {
      setSimState((prev) => {
        const nextMods = [...prev.mods, newMod];
        try {
          localStorage.setItem(STORAGE_MODS_KEY, JSON.stringify(nextMods));
        } catch {}
        return simulateCityTick(
          { ...prev, mods: nextMods, executionMode: 'mayor_mode', incorporated: true },
          false
        );
      });
      setExecutionMode('mayor_mode');
      setActiveCategory('mods');
      setActiveToolId(newMod.building.id);
      showToast(`ติดตั้ง "${newMod.building.name}" สำเร็จ! พร้อมวางในเมืองได้ทันที`);
    },
    [showToast]
  );

  const handleSaveCustomLot = useCallback(
    (newBuildingDef: BuildingDefinition) => {
      const newMod: ModPackage = {
        id: newBuildingDef.id,
        title: newBuildingDef.name,
        description: newBuildingDef.description,
        author: newBuildingDef.modAuthor || 'Player',
        version: newBuildingDef.modVersion || '1.0.0',
        enabled: true,
        building: newBuildingDef,
      };

      setSimState((prev) => {
        const nextMods = [...prev.mods, newMod];
        try {
          localStorage.setItem(STORAGE_MODS_KEY, JSON.stringify(nextMods));
        } catch {}
        return simulateCityTick(
          { ...prev, mods: nextMods, executionMode: 'mayor_mode', incorporated: true },
          false
        );
      });

      setExecutionMode('mayor_mode');
      setActiveCategory(newBuildingDef.category);
      setActiveToolId(newBuildingDef.id);
      showToast(`✨ บันทึก Custom Lot "${newBuildingDef.name}" เรียบร้อยแล้ว! พร้อมใช้งานในเมนูและโซน RCI`);
    },
    [showToast]
  );

  const handleSaveCity = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_SAVE_KEY, JSON.stringify(simState));
      setSaveStatusMessage('บันทึกข้อมูลผังเมืองและทรัพยากรลงในเครื่องเรียบร้อยแล้ว');
    } catch {
      setSaveStatusMessage('ไม่สามารถบันทึกข้อมูลได้');
    }
  }, [simState]);

  const handleLoadCity = useCallback(() => {
    try {
      const raw = localStorage.getItem(STORAGE_SAVE_KEY);
      if (!raw) {
        setSaveStatusMessage('ไม่พบข้อมูลเมืองที่บันทึกไว้ในเครื่อง');
        return;
      }
      const parsed = JSON.parse(raw) as CitySimulationState;
      parsed.status = 'playing';
      document.body.dataset.state = 'playing';
      setSimState(parsed);
      setSaveStatusMessage(null);
      showToast(`โหลดเมือง "${parsed.config.cityName}" สำเร็จ`);
    } catch {
      setSaveStatusMessage('ข้อมูลบันทึกเสียหาย ไม่สามารถโหลดได้');
    }
  }, [showToast]);

  const handleRestartRegion = useCallback(() => {
    document.body.dataset.state = 'playing';
    setSaveStatusMessage(null);
    setSimState((prev) => {
      const fresh = createInitialSimulationState(prev.config, prev.mods);
      fresh.status = 'playing';
      return fresh;
    });
  }, []);

  const handleReturnToTitle = useCallback(() => {
    setSaveStatusMessage(null);
    setStatusSynchronously('title');
  }, [setStatusSynchronously]);

  return (
    <main className="relative w-screen h-[100dvh] overflow-hidden bg-[#0b131e] select-none">
      {/* Isolated Full-Viewport Three.js WebGL City & Region Canvas */}
      <CityViewport3D
        simState={simState}
        activeToolId={activeToolId}
        brushRadius={(executionMode === 'god_mode' || activeCategory === 'terrain') && activeToolId !== 'inspect' && activeToolId !== 'camera_pan' ? brushRadius : 0}
        buildingRotation={buildingRotation}
        dataOverlay={dataOverlay}
        timeOfDay={timeOfDay}
        cameraCommand={cameraCommand}
        selectedInspectTile={selectedInspectTile}
        onSelectInspectTile={setSelectedInspectTile}
        onTileInteract={handleTileInteract}
        onCommitRoadPath={handleCommitRoadPath}
        onCommitZoneArea={handleCommitZoneArea}
        onRoadDragPreviewChange={setRoadDragPreview}
        onCancelRoadDrag={handleCancelRoadDrag}
        pendingTouchPlacement={pendingTouchPlacement}
        onPendingTouchPlacementChange={setPendingTouchPlacement}
        onCanvasDragStateChange={setIsCanvasDragging}
        onHoverTileChange={setHoveredTile}
        onCameraHeadingChange={setCameraHeading}
      />

      {/* Title Screen Stage */}
      {simState.status === 'title' && (
        <TitleScreenModal
          config={simState.config}
          modCount={simState.mods.length}
          onUpdateConfig={handleUpdateConfig}
          onRandomizeSeed={handleRandomizeSeed}
          onStartGame={handleStartGame}
          onStartGodMode={handleStartGodMode}
          onOpenRegionMap={() => setShowRegionMap(true)}
          onOpenModWorkshop={() => setShowModWorkshop(true)}
        />
      )}

      {/* Playing HUD & Collapsible Bottom Dock */}
      {simState.status !== 'title' && (
        <CityHUD
          simState={simState}
          activeCategory={activeCategory}
          activeToolId={activeToolId}
          brushRadius={brushRadius}
          buildingRotation={buildingRotation}
          dataOverlay={dataOverlay}
          hoveredTile={hoveredTile}
          selectedInspectTile={selectedInspectTile}
          cameraHeading={cameraHeading}
          isMuted={isMuted}
          statusBanner={statusBanner}
          isDockCollapsed={isDockCollapsed}
          onToggleCollapseDock={() => setIsDockCollapsed((v) => !v)}
          onSelectCategory={handleSelectCategory}
          onSelectTool={(tid) => {
            setActiveToolId(tid);
            setPendingTouchPlacement(null);
          }}
          onChangeBrushRadius={setBrushRadius}
          onRotateBuilding={() => setBuildingRotation((r) => (r + 1) % 4)}
          onChangeOverlay={setDataOverlay}
          onChangeSimSpeed={(spd) => setSimState((prev) => ({ ...prev, simSpeed: spd }))}
          onCloseInspectTile={() => setSelectedInspectTile(null)}
          onDemolishSelectedTile={handleDemolishSelectedTile}
          onUpdateTaxRate={(zone, rate) =>
            setSimState((prev) =>
              simulateCityTick(
                {
                  ...prev,
                  metrics: {
                    ...prev.metrics,
                    taxRateR: zone === 'R' ? rate : prev.metrics.taxRateR,
                    taxRateC: zone === 'C' ? rate : prev.metrics.taxRateC,
                    taxRateI: zone === 'I' ? rate : prev.metrics.taxRateI,
                  },
                },
                false
              )
            )
          }
          onChangeRegionSizeLive={handleChangeRegionSizeLive}
          onCameraAction={(type) => setCameraCommand({ type, timestamp: Date.now() })}
          onToggleMute={() => setIsMuted(gameAudio.toggleMute())}
          onOpenPause={() => setStatusSynchronously('paused')}
          onOpenUserGuide={() => setShowUserGuide(true)}
          onOpenModWorkshop={() => {
            setModWorkshopTab('import3d');
            setShowModWorkshop(true);
          }}
          onOpenLotEditor={() => {
            setModWorkshopTab('lotstudio');
            setShowModWorkshop(true);
          }}
          executionMode={executionMode}
          onSwitchExecutionMode={handleSwitchExecutionMode}
          onOpenRegionMap={() => setShowRegionMap(true)}
          onIncorporateCity={handleIncorporateCity}
          onResetEntireMapFlat={handleResetEntireMapFlat}
          onGenerateWildLand={handleGenerateWildLand}
          timeOfDay={timeOfDay}
          onChangeTimeOfDay={(preset) => {
            setTimeOfDay(preset);
            showToast(
              preset === 'morning'
                ? '🌅 ยามเช้า: รถยนต์เริ่มออกจากโซนที่อยู่อาศัยมุ่งหน้าสู่เมือง'
                : preset === 'evening'
                ? '🌇 ยามเย็น: รถยนต์เริ่มออกจากออฟฟิศและโรงงานเดินทางกลับบ้าน'
                : preset === 'night'
                ? '🌙 กลางคืน: เปิดไฟเมืองยามค่ำคืน ปริมาณรถยนต์ลดลงเหลือ 25% ของกลางวัน'
                : '☀️ กลางวัน: แสงแดดสว่างคมชัด การจราจรวิ่งตามปกติ'
            );
          }}
          autoTimeCycle={autoTimeCycle}
          onToggleAutoTimeCycle={() => {
            setAutoTimeCycle((v) => {
              const next = !v;
              showToast(
                next
                  ? '🔄 เปิดระบบหมุนเวียนเวลาอัตโนมัติ (เช้า → กลางวัน → เย็น → กลางคืน)'
                  : '⏸️ ปิดระบบหมุนเวียนเวลาอัตโนมัติ (เลือกช่วงเวลาด้วยตนเอง)'
              );
              return next;
            });
          }}
          roadDragPreview={roadDragPreview}
          pendingTouchPlacement={pendingTouchPlacement}
          onConfirmTouchPlacement={handleConfirmTouchPlacement}
          onCancelTouchPlacement={handleCancelTouchPlacement}
          isCanvasDragging={isCanvasDragging}
          isFullscreen={isFullscreen}
          onToggleFullscreen={handleToggleFullscreen}
        />
      )}

      {/* Region Map View Modal (SimCity 4 Interconnected 3x3 Grid) */}
      {showRegionMap && (
        <RegionMapView
          regionWorld={regionWorld}
          onSelectPlot={handleSelectRegionPlot}
          onClose={() => setShowRegionMap(false)}
        />
      )}

      {/* Pause / Victory / Bankruptcy Status Modal */}
      <StatusModal
        simState={simState}
        saveStatusMessage={saveStatusMessage}
        onResume={() => {
          setSaveStatusMessage(null);
          setStatusSynchronously('playing');
        }}
        onSaveCity={handleSaveCity}
        onLoadCity={handleLoadCity}
        onRestartRegion={handleRestartRegion}
        onReturnToTitle={handleReturnToTitle}
      />

      {/* Mod Workshop & 3D Lot Studio Modal */}
      {showModWorkshop && (
        <ModWorkshopModal
          mods={simState.mods}
          initialTab={modWorkshopTab}
          onToggleMod={handleToggleMod}
          onAddCustomMod={handleAddCustomMod}
          onClose={() => setShowModWorkshop(false)}
        />
      )}

      {/* Built-in User Guide & Manual Modal */}
      {showUserGuide && (
        <UserGuideModal onClose={() => setShowUserGuide(false)} />
      )}
    </main>
  );
}
