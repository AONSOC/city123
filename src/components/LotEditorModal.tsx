import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { X, Layers, Building2, Trees, Car, Lamp, Compass, Save, Trash2, Plus, RotateCw, ZoomIn, Eye, Sparkles } from 'lucide-react';
import { CustomLotDefinition, CustomLotProp, LotBaseTexture, BuildingDefinition, ToolCategory, BuildingArchetype } from '../game/types';
import { buildCustomLot3DGroup } from '../game/lotBuilder3D';

interface LotEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveLot: (newBuildingDef: BuildingDefinition) => void;
  availableMods?: Array<{ id: string; name: string; building: BuildingDefinition }>;
}

const PROP_PRESETS = [
  { id: 'tree_oak', name: 'ต้นโอ๊ค (Oak)', category: 'flora', icon: Trees },
  { id: 'tree_pine', name: 'ต้นสน (Pine)', category: 'flora', icon: Trees },
  { id: 'tree_palm', name: 'ต้นปาล์ม (Palm)', category: 'flora', icon: Trees },
  { id: 'tree_sakura', name: 'ต้นซากุระ (Sakura)', category: 'flora', icon: Trees },
  { id: 'bench', name: 'ม้านั่ง (Bench)', category: 'furniture', icon: Lamp },
  { id: 'street_lamp', name: 'โคมไฟถนน (Lamp)', category: 'furniture', icon: Lamp },
  { id: 'fence', name: 'รั้วกั้น (Fence)', category: 'furniture', icon: Layers },
  { id: 'trash_bin', name: 'ถังขยะ (Bin)', category: 'furniture', icon: Layers },
  { id: 'planter_box', name: 'กระถางต้นไม้ (Planter)', category: 'flora', icon: Trees },
  { id: 'fountain', name: 'น้ำพุตกแต่ง (Fountain)', category: 'furniture', icon: Sparkles },
  { id: 'billboard', name: 'ป้ายโฆษณา (Billboard)', category: 'furniture', icon: Building2 },
  { id: 'car_sedan', name: 'รถยนต์เก๋ง (Sedan)', category: 'vehicle', icon: Car },
  { id: 'car_suv', name: 'รถยนต์ SUV', category: 'vehicle', icon: Car },
];

export const LotEditorModal: React.FC<LotEditorModalProps> = ({
  isOpen,
  onClose,
  onSaveLot,
  availableMods = [],
}) => {
  // Lot Configuration State
  const [lotName, setLotName] = useState('แปลงที่ดิน SimCity 4 Custom Lot');
  const [sizeX, setSizeX] = useState<number>(3); // 1..10
  const [sizeZ, setSizeZ] = useState<number>(3); // 1..10
  const [baseTexture, setBaseTexture] = useState<LotBaseTexture>('grass');
  const [activePaintTexture, setActivePaintTexture] = useState<LotBaseTexture>('grass');
  const [tileTextures, setTileTextures] = useState<Record<string, LotBaseTexture>>({});
  const [isPaintingGrid, setIsPaintingGrid] = useState(false);
  const [zoneCategory, setZoneCategory] = useState<'res' | 'com' | 'ind' | 'park' | 'civic'>('res');
  const [showFrontArrow, setShowFrontArrow] = useState(true);

  // Stats State
  const [cost, setCost] = useState(4500);
  const [upkeepPerMonth, setUpkeepPerMonth] = useState(60);
  const [popCapacity, setPopCapacity] = useState(45);
  const [jobsCapacity, setJobsCapacity] = useState(0);
  const [powerMW, setPowerMW] = useState<number>(-12);
  const [waterM3, setWaterM3] = useState<number>(-25);
  const [pollutionDelta, setPollutionDelta] = useState<number>(-5);
  const [landValueBoost, setLandValueBoost] = useState<number>(25);

  // Props List State
  const [propsList, setPropsList] = useState<CustomLotProp[]>([
    {
      id: 'prop_init_1',
      propType: 'tree_oak',
      subX: 1,
      subZ: 1,
      offsetY: 0,
      rotationY: 45,
      scale: 1,
    },
    {
      id: 'prop_init_2',
      propType: 'bench',
      subX: -0.8,
      subZ: 0.8,
      offsetY: 0,
      rotationY: 0,
      scale: 1,
    },
  ]);

  const [selectedPropId, setSelectedPropId] = useState<string | null>('prop_init_1');
  const [studioTimeOfDay, setStudioTimeOfDay] = useState<'day' | 'night'>('day');
  const [isOrbitingView, setIsOrbitingView] = useState(false);

  // Canvas & Three.js Refs
  const canvasRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const lotGroupRef = useRef<THREE.Group | null>(null);

  // Initialize Three.js Studio Canvas
  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;

    const width = canvasRef.current.clientWidth;
    const height = canvasRef.current.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(studioTimeOfDay === 'day' ? 0x0f172a : 0x020617);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(sizeX * 1.8, Math.max(sizeX, sizeZ) * 1.6, sizeZ * 2.2);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Clean previous children
    while (canvasRef.current.firstChild) {
      canvasRef.current.removeChild(canvasRef.current.firstChild);
    }
    canvasRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.48;
    controlsRef.current = controls;

    // Lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x334155, studioTimeOfDay === 'day' ? 1.2 : 0.3);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(
      studioTimeOfDay === 'day' ? 0xfffbeb : 0x38bdf8,
      studioTimeOfDay === 'day' ? 2.0 : 0.6
    );
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    // Initial 3D Lot Group
    const lotDef: CustomLotDefinition = {
      sizeX,
      sizeZ,
      baseTexture,
      showFrontArrow,
      props: propsList,
    };
    const lotGroup = buildCustomLot3DGroup(lotDef, undefined, { isStudioPreview: true });
    lotGroupRef.current = lotGroup;
    scene.add(lotGroup);

    let animationFrameId: number;
    let angle = 0;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      if (isOrbitingView && cameraRef.current && controlsRef.current) {
        angle += 0.005;
        const rad = Math.max(sizeX, sizeZ) * 2.2;
        cameraRef.current.position.x = Math.sin(angle) * rad;
        cameraRef.current.position.z = Math.cos(angle) * rad;
        controlsRef.current.update();
      } else {
        controls.update();
      }

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!canvasRef.current || !cameraRef.current) return;
      const w = canvasRef.current.clientWidth;
      const h = canvasRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
    };
  }, [isOpen]);

  // Rebuild 3D Lot mesh when definition or props change
  useEffect(() => {
    if (!sceneRef.current) return;

    if (lotGroupRef.current) {
      sceneRef.current.remove(lotGroupRef.current);
    }

    const lotDef: CustomLotDefinition = {
      sizeX,
      sizeZ,
      baseTexture,
      tileTextures,
      showFrontArrow,
      props: propsList,
    };

    const lotGroup = buildCustomLot3DGroup(lotDef, undefined, { isStudioPreview: true });
    lotGroupRef.current = lotGroup;
    sceneRef.current.add(lotGroup);
  }, [sizeX, sizeZ, baseTexture, tileTextures, showFrontArrow, propsList, studioTimeOfDay]);

  // Update Studio Background & Lights when studio time toggles
  useEffect(() => {
    if (!sceneRef.current) return;
    sceneRef.current.background = new THREE.Color(studioTimeOfDay === 'day' ? 0x0f172a : 0x020617);
  }, [studioTimeOfDay]);

  if (!isOpen) return null;

  // Prop manipulation handlers
  const handleAddProp = (propPresetId: string, customModKey?: string) => {
    const newProp: CustomLotProp = {
      id: `prop_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      propType: propPresetId,
      subX: 0,
      subZ: 0,
      offsetY: 0,
      rotationY: 0,
      scale: 1.0,
      customModelStorageKey: customModKey,
    };
    setPropsList((prev) => [...prev, newProp]);
    setSelectedPropId(newProp.id);
  };

  const handleUpdateSelectedProp = (key: keyof CustomLotProp, val: any) => {
    if (!selectedPropId) return;
    setPropsList((prev) =>
      prev.map((p) => (p.id === selectedPropId ? { ...p, [key]: val } : p))
    );
  };

  const handleDeleteSelectedProp = () => {
    if (!selectedPropId) return;
    setPropsList((prev) => prev.filter((p) => p.id !== selectedPropId));
    setSelectedPropId(null);
  };

  const handleSave = () => {
    const lotId = `lot_custom_${Date.now()}`;
    const category: ToolCategory =
      zoneCategory === 'park' || zoneCategory === 'civic' ? 'services' : 'zones';
    let archetype: BuildingArchetype = 'residential_low';
    let primaryColor = '#22c55e';

    if (zoneCategory === 'com') {
      archetype = popCapacity > 100 ? 'commercial_high' : 'commercial_low';
      primaryColor = '#3b82f6';
    } else if (zoneCategory === 'ind') {
      archetype = 'industrial';
      primaryColor = '#eab308';
    } else if (zoneCategory === 'park') {
      archetype = 'park_plaza';
      primaryColor = '#10b981';
    } else if (zoneCategory === 'civic') {
      archetype = 'civic_service';
      primaryColor = '#8b5cf6';
    } else {
      archetype = popCapacity > 100 ? 'residential_high' : 'residential_low';
    }

    const lotDef: CustomLotDefinition = {
      sizeX,
      sizeZ,
      baseTexture,
      tileTextures,
      showFrontArrow: false, // Clean save without directional arrow on city map
      props: propsList,
    };

    const newBuildingDef: BuildingDefinition = {
      id: lotId,
      name: lotName || `Custom Lot ${sizeX}x${sizeZ}`,
      nameEn: `Custom Lot ${sizeX}x${sizeZ}`,
      category,
      archetype,
      cost,
      upkeepPerMonth,
      powerMW,
      waterM3,
      populationCapacity: zoneCategory === 'res' ? popCapacity : 0,
      jobsCapacity: (zoneCategory === 'com' || zoneCategory === 'ind' || zoneCategory === 'civic') ? jobsCapacity : 0,
      pollutionDelta,
      landValueBoost,
      serviceRadius: Math.max(sizeX, sizeZ) * 3,
      isZone: zoneCategory === 'res' || zoneCategory === 'com' || zoneCategory === 'ind',
      primaryColor,
      secondaryColor: '#475569',
      accentColor: '#38bdf8',
      stories: Math.max(1, Math.floor(sizeX * 1.5)),
      description: `SimCity 4 Custom Lot (${sizeX}x${sizeZ} ช่อง | ที่อยู่: ${popCapacity} | งาน: ${jobsCapacity} | ไฟ: ${powerMW}MW | น้ำ: ${waterM3}m³)`,
      isMod: true,
      modAuthor: '3D Lot Studio Player',
      modVersion: '1.0.0',
      customLotData: lotDef,
    };

    onSaveLot(newBuildingDef);
    onClose();
  };

  const selectedProp = propsList.find((p) => p.id === selectedPropId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 select-none">
      <div className="flex flex-col w-full max-w-7xl h-[92vh] bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900/90 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-sky-500/10 border border-sky-500/30 rounded-xl text-sky-400">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                SimCity 4 Lot Editor Studio
                <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-md">
                  1x1 - 10x10 Custom Lot Builder
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                สร้างและตกแต่งแปลงที่ดินพร้อมสิ่งปลูกสร้าง Props และพื้นผิวเพื่อใช้สุ่มเกิดในโซน RCI หรือวางในเมือง
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setStudioTimeOfDay((prev) => (prev === 'day' ? 'night' : 'day'))}
              className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              {studioTimeOfDay === 'day' ? 'แสงกลางวัน (Day)' : 'แสงกลางคืน (Night)'}
            </button>
            <button
              onClick={() => setIsOrbitingView((prev) => !prev)}
              className={`px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors flex items-center gap-1.5 ${
                isOrbitingView
                  ? 'bg-sky-600 text-white border-sky-400'
                  : 'text-slate-300 bg-slate-800 hover:bg-slate-700 border-slate-700'
              }`}
            >
              <RotateCw className="w-3.5 h-3.5" />
              {isOrbitingView ? 'หยุดหมุนพรีวิว' : 'หมุนพรีวิว 360°'}
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Main Content: Left Panel, 3D Studio Canvas, Right Panel */}
        <div className="flex-1 flex overflow-hidden">
          {/* LEFT SIDEBAR: Lot Config & Base Pavement */}
          <div className="w-80 bg-slate-900/90 border-r border-slate-800 p-5 overflow-y-auto space-y-5 shrink-0 text-sm">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">ชื่อแปลงที่ดิน (Lot Name)</label>
              <input
                type="text"
                value={lotName}
                onChange={(e) => setLotName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-medium focus:outline-none focus:border-sky-500 text-sm"
              />
            </div>

            {/* Grid Size Selectors (1x1 to 10x10) */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-400">
                ขนาดตารางแปลงที่ดิน (Lot Dimension: {sizeX}x{sizeZ} ช่อง)
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-xs text-slate-400 mb-1 block">ความกว้าง X (1-10)</span>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={sizeX}
                    onChange={(e) => setSizeX(parseInt(e.target.value))}
                    className="w-full accent-sky-500"
                  />
                  <div className="text-center font-mono text-xs text-sky-400 font-bold">{sizeX} ช่อง</div>
                </div>
                <div>
                  <span className="text-xs text-slate-400 mb-1 block">ความลึก Z (1-10)</span>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={sizeZ}
                    onChange={(e) => setSizeZ(parseInt(e.target.value))}
                    className="w-full accent-sky-500"
                  />
                  <div className="text-center font-mono text-xs text-sky-400 font-bold">{sizeZ} ช่อง</div>
                </div>
              </div>
            </div>

            {/* Zone Category */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2">ประเภทโซน (Zone Type)</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setZoneCategory('res');
                    setPopCapacity(45 * sizeX);
                    setJobsCapacity(0);
                  }}
                  className={`p-2.5 border rounded-xl text-left transition-all ${
                    zoneCategory === 'res'
                      ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="font-semibold text-xs flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                    Residential (R)
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">ที่อยู่อาศัย (สีเขียว)</div>
                </button>

                <button
                  onClick={() => {
                    setZoneCategory('com');
                    setPopCapacity(0);
                    setJobsCapacity(35 * sizeX);
                  }}
                  className={`p-2.5 border rounded-xl text-left transition-all ${
                    zoneCategory === 'com'
                      ? 'bg-blue-950/60 border-blue-500 text-blue-300'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="font-semibold text-xs flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                    Commercial (C)
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">พาณิชยกรรม (สีน้ำเงิน)</div>
                </button>

                <button
                  onClick={() => {
                    setZoneCategory('ind');
                    setPopCapacity(0);
                    setJobsCapacity(50 * sizeX);
                  }}
                  className={`p-2.5 border rounded-xl text-left transition-all ${
                    zoneCategory === 'ind'
                      ? 'bg-amber-950/60 border-amber-500 text-amber-300'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="font-semibold text-xs flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                    Industrial (I)
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">อุตสาหกรรม (สีเหลือง)</div>
                </button>

                <button
                  onClick={() => {
                    setZoneCategory('park');
                    setPopCapacity(0);
                    setJobsCapacity(5);
                  }}
                  className={`p-2.5 border rounded-xl text-left transition-all ${
                    zoneCategory === 'park'
                      ? 'bg-teal-950/60 border-teal-500 text-teal-300'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="font-semibold text-xs flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-teal-400 inline-block" />
                    Public Park
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">สวนสาธารณะ / พลาซ่า</div>
                </button>

                <button
                  onClick={() => {
                    setZoneCategory('civic');
                    setPopCapacity(0);
                    setJobsCapacity(25);
                  }}
                  className={`p-2.5 border rounded-xl text-left transition-all ${
                    zoneCategory === 'civic'
                      ? 'bg-purple-950/60 border-purple-500 text-purple-300'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="font-semibold text-xs flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-400 inline-block" />
                    Civic Service
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">อาคารบริการสาธารณะ</div>
                </button>
              </div>
            </div>

            {/* SimCity 4 Stats & Utilities Customization Panel */}
            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2.5">
              <h4 className="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                <span>⚙️</span>
                <span>คุณสมบัติเมืองสไตล์ SimCity 4</span>
              </h4>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-0.5">🏠 ที่อยู่อาศัย (คน)</label>
                  <input
                    type="number"
                    min="0"
                    max="5000"
                    value={popCapacity}
                    onChange={(e) => setPopCapacity(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full h-8 px-2 rounded bg-slate-900 border border-slate-700 text-emerald-300 font-mono text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-0.5">💼 ตำแหน่งงาน (คน)</label>
                  <input
                    type="number"
                    min="0"
                    max="5000"
                    value={jobsCapacity}
                    onChange={(e) => setJobsCapacity(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full h-8 px-2 rounded bg-slate-900 border border-slate-700 text-blue-300 font-mono text-xs font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-0.5">⚡ ไฟฟ้า (MW)</label>
                  <input
                    type="number"
                    value={powerMW}
                    onChange={(e) => setPowerMW(parseInt(e.target.value) || 0)}
                    className="w-full h-8 px-2 rounded bg-slate-900 border border-slate-700 text-yellow-300 font-mono text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-0.5">💧 ประปา (m³)</label>
                  <input
                    type="number"
                    value={waterM3}
                    onChange={(e) => setWaterM3(parseInt(e.target.value) || 0)}
                    className="w-full h-8 px-2 rounded bg-slate-900 border border-slate-700 text-sky-300 font-mono text-xs font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-0.5">🏭 มลพิษ (+/-)</label>
                  <input
                    type="number"
                    value={pollutionDelta}
                    onChange={(e) => setPollutionDelta(parseInt(e.target.value) || 0)}
                    className="w-full h-8 px-2 rounded bg-slate-900 border border-slate-700 text-rose-300 font-mono text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-0.5">🌳 มูลค่าที่ดิน (+)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={landValueBoost}
                    onChange={(e) => setLandValueBoost(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full h-8 px-2 rounded bg-slate-900 border border-slate-700 text-teal-300 font-mono text-xs font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-0.5">🪙 ค่าสร้าง (฿)</label>
                  <input
                    type="number"
                    min="0"
                    value={cost}
                    onChange={(e) => setCost(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full h-8 px-2 rounded bg-slate-900 border border-slate-700 text-amber-300 font-mono text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-0.5">🪙 ค่าบำรุง/ด. (฿)</label>
                  <input
                    type="number"
                    min="0"
                    value={upkeepPerMonth}
                    onChange={(e) => setUpkeepPerMonth(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full h-8 px-2 rounded bg-slate-900 border border-slate-700 text-amber-300 font-mono text-xs font-bold"
                  />
                </div>
              </div>
            </div>

            {/* Base Texture */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2">พื้นผิวปูแปลงหลัก (Default Base Texture)</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { type: 'grass', name: 'พื้นหญ้า (Grass)', col: 'bg-emerald-900 border-emerald-600' },
                  { type: 'concrete', name: 'คอนกรีต (Concrete)', col: 'bg-slate-700 border-slate-500' },
                  { type: 'asphalt', name: 'ลานจอดรถ (Asphalt)', col: 'bg-slate-900 border-slate-700' },
                  { type: 'brick', name: 'อิฐบล็อก (Brick)', col: 'bg-amber-900 border-amber-700' },
                  { type: 'dirt', name: 'ดินลูกรัง (Dirt)', col: 'bg-amber-950 border-amber-800' },
                ].map((t) => (
                  <button
                    key={t.type}
                    onClick={() => setBaseTexture(t.type as LotBaseTexture)}
                    className={`p-2 text-xs font-medium rounded-lg border text-left transition-colors flex items-center gap-2 ${
                      baseTexture === t.type
                        ? 'border-sky-400 text-white bg-sky-950/40'
                        : 'border-slate-800 text-slate-400 bg-slate-950/40 hover:text-slate-200'
                    }`}
                  >
                    <span className={`w-3 h-3 rounded-full border ${t.col}`} />
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Per-Tile Texture Painting Grid */}
            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2.5">
              <h4 className="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center justify-between">
                <span>🎨 ระบายพื้นผิวทีละช่อง (Per-Tile Paint)</span>
                <button
                  onClick={() => setTileTextures({})}
                  className="text-[10px] text-slate-400 hover:text-white underline"
                >
                  รีเซ็ตทั้งหมด
                </button>
              </h4>
              <p className="text-[11px] text-slate-400">เลือกพู่กัน texture แล้วคลิกหรือลากระบายบนช่องตารางเพื่อเปลี่ยนพื้นผิวเฉพาะช่องทันที</p>
              
              <div className="grid grid-cols-5 gap-1.5 pt-1">
                {[
                  { type: 'grass', name: 'หญ้า', col: 'bg-emerald-700' },
                  { type: 'concrete', name: 'คอนกรีต', col: 'bg-slate-500' },
                  { type: 'asphalt', name: 'ยางมะตอย', col: 'bg-slate-800' },
                  { type: 'brick', name: 'อิฐบล็อก', col: 'bg-amber-800' },
                  { type: 'dirt', name: 'ดิน', col: 'bg-yellow-900' },
                ].map((t) => (
                  <button
                    key={t.type}
                    onClick={() => setActivePaintTexture(t.type as LotBaseTexture)}
                    className={`p-1.5 text-[10px] font-medium rounded border text-center transition-all ${
                      activePaintTexture === t.type
                        ? 'border-sky-400 text-white bg-sky-950 ring-1 ring-sky-400'
                        : 'border-slate-800 text-slate-400 bg-slate-900 hover:text-slate-200'
                    }`}
                  >
                    <div className={`w-full h-3 rounded mb-0.5 ${t.col}`} />
                    {t.name}
                  </button>
                ))}
              </div>

              {/* 2D Interactive Painting Grid */}
              <div
                className="p-2 bg-slate-900 border border-slate-800 rounded-lg flex flex-col items-center justify-center overflow-x-auto"
                onMouseUp={() => setIsPaintingGrid(false)}
                onMouseLeave={() => setIsPaintingGrid(false)}
              >
                <div
                  className="grid gap-1"
                  style={{
                    gridTemplateColumns: `repeat(${sizeX}, minmax(0, 1fr))`,
                  }}
                >
                  {Array.from({ length: sizeZ }).map((_, z) =>
                    Array.from({ length: sizeX }).map((_, x) => {
                      const key = `${x},${z}`;
                      const currentTex = tileTextures[key] || baseTexture;
                      const bgCol =
                        currentTex === 'grass'
                          ? 'bg-emerald-800'
                          : currentTex === 'concrete'
                          ? 'bg-slate-600'
                          : currentTex === 'asphalt'
                          ? 'bg-slate-900'
                          : currentTex === 'brick'
                          ? 'bg-amber-800'
                          : 'bg-yellow-950';

                      return (
                        <div
                          key={key}
                          onMouseDown={() => {
                            setIsPaintingGrid(true);
                            setTileTextures((prev) => ({ ...prev, [key]: activePaintTexture }));
                          }}
                          onMouseEnter={() => {
                            if (isPaintingGrid) {
                              setTileTextures((prev) => ({ ...prev, [key]: activePaintTexture }));
                            }
                          }}
                          className={`w-9 h-9 rounded border border-slate-700/60 cursor-pointer flex items-center justify-center text-[10px] font-mono text-white transition-transform hover:scale-105 ${bgCol}`}
                          title={`ช่อง (${x}, ${z}): ${currentTex}`}
                        >
                          {x},{z}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Show Front Road Arrow Toggle */}
            <div className="flex items-center justify-between p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-slate-300 font-medium">แสดงลูกศรทิศทางติดถนนหน้าแปลง</span>
              </div>
              <input
                type="checkbox"
                checked={showFrontArrow}
                onChange={(e) => setShowFrontArrow(e.target.checked)}
                className="w-4 h-4 accent-emerald-500 rounded"
              />
            </div>
          </div>

          {/* MIDDLE: 3D STUDIO CANVAS VIEWPORT */}
          <div className="flex-1 relative bg-slate-950">
            <div ref={canvasRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

            {/* Viewport Overlay Controls Guide */}
            <div className="absolute top-4 left-4 p-3 bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-xl text-xs text-slate-300 space-y-1">
              <div className="font-semibold text-white flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-sky-400" />
                3D Studio Controls
              </div>
              <div>• คลิกซ้าย + ลาก: หมุนมุมกล้องอิสระ</div>
              <div>• คลิกขวา / 2 นิ้ว: เลื่อนตำแหน่ง Viewport</div>
              <div>• หมุนล้อเมาส์ / ถ่างนิ้ว: ซูมเข้า-ออก</div>
            </div>

            {/* Front Road Edge Marker */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-emerald-950/90 border border-emerald-500/40 rounded-full text-xs font-semibold text-emerald-300 flex items-center gap-2 shadow-lg">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              ทิศทางด้านหน้าติดถนนหลัก (Front Road Edge)
            </div>
          </div>

          {/* RIGHT SIDEBAR: Props Palette & Object Inspector */}
          <div className="w-80 bg-slate-900/90 border-l border-slate-800 p-5 overflow-y-auto space-y-5 shrink-0 text-sm">
            {/* Add Props Catalog */}
            <div>
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5 text-sky-400" />
                เพิ่มสิ่งของ & Props บนแปลง
              </h3>
              <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto p-1 bg-slate-950/60 border border-slate-800 rounded-xl">
                {PROP_PRESETS.map((item) => {
                  const IconComp = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleAddProp(item.id)}
                      className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-sky-500/50 rounded-lg text-left transition-colors flex items-center gap-1.5"
                    >
                      <IconComp className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span className="text-[11px] font-medium text-slate-300 truncate">{item.name}</span>
                    </button>
                  );
                })}

                {/* Available Custom 3D Mods */}
                {availableMods.map((mod) => (
                  <button
                    key={mod.id}
                    onClick={() =>
                      handleAddProp(
                        mod.building.customModel?.assetCategory === 'vehicle' ? 'car_sedan' : 'custom_mod',
                        mod.building.customModel?.storageKey
                      )
                    }
                    className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-purple-500/50 rounded-lg text-left transition-colors flex items-center gap-1.5 col-span-2"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span className="text-[11px] font-medium text-purple-300 truncate">
                      3D Mod: {mod.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Placed Props List */}
            <div>
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>รายการสิ่งของบนแปลง ({propsList.length})</span>
              </h3>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {propsList.length === 0 ? (
                  <div className="text-xs text-slate-500 p-3 text-center border border-dashed border-slate-800 rounded-xl">
                    ยังไม่มีสิ่งของบนแปลง กดเพิ่มจากรายการด้านบนได้เลย
                  </div>
                ) : (
                  propsList.map((p) => {
                    const preset = PROP_PRESETS.find((pr) => pr.id === p.propType);
                    const isSelected = p.id === selectedPropId;
                    return (
                      <div
                        key={p.id}
                        onClick={() => setSelectedPropId(p.id)}
                        className={`p-2 rounded-lg border text-xs cursor-pointer flex items-center justify-between transition-all ${
                          isSelected
                            ? 'bg-sky-950/60 border-sky-500 text-sky-200'
                            : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span className="font-medium truncate">{preset ? preset.name : p.propType}</span>
                        <span className="font-mono text-[10px] text-slate-500">
                          ({p.subX.toFixed(1)}, {p.subZ.toFixed(1)})
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Selected Prop Inspector Controls */}
            {selectedProp && (
              <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-sky-400">ปรับแต่งตำแหน่ง & องศาวัตถุ</span>
                  <button
                    onClick={handleDeleteSelectedProp}
                    className="p-1 text-red-400 hover:text-red-300 hover:bg-red-950/40 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* SubX Slider */}
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>ตำแหน่งแกน X</span>
                    <span className="font-mono text-white">{selectedProp.subX.toFixed(2)}m</span>
                  </div>
                  <input
                    type="range"
                    min={-sizeX / 2}
                    max={sizeX / 2}
                    step={0.1}
                    value={selectedProp.subX}
                    onChange={(e) => handleUpdateSelectedProp('subX', parseFloat(e.target.value))}
                    className="w-full accent-sky-500"
                  />
                </div>

                {/* SubZ Slider */}
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>ตำแหน่งแกน Z</span>
                    <span className="font-mono text-white">{selectedProp.subZ.toFixed(2)}m</span>
                  </div>
                  <input
                    type="range"
                    min={-sizeZ / 2}
                    max={sizeZ / 2}
                    step={0.1}
                    value={selectedProp.subZ}
                    onChange={(e) => handleUpdateSelectedProp('subZ', parseFloat(e.target.value))}
                    className="w-full accent-sky-500"
                  />
                </div>

                {/* Rotation Y Slider */}
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>หมุนองศา (Rotation Y)</span>
                    <span className="font-mono text-white">{selectedProp.rotationY}°</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    step={15}
                    value={selectedProp.rotationY}
                    onChange={(e) => handleUpdateSelectedProp('rotationY', parseInt(e.target.value))}
                    className="w-full accent-sky-500"
                  />
                </div>

                {/* Scale Slider */}
                <div>
                  <div className="flex justify-between items-center text-[11px] text-slate-400 mb-1">
                    <span>ขนาดสเกล (Scale 0.1x - 100x)</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0.1"
                        max="100.0"
                        step="0.1"
                        value={selectedProp.scale}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) {
                            handleUpdateSelectedProp('scale', Math.max(0.1, Math.min(100.0, val)));
                          }
                        }}
                        className="w-16 h-6 px-1 rounded bg-slate-900 border border-sky-500/50 font-mono text-white text-[11px] font-bold text-right"
                      />
                      <span className="font-mono text-white text-[11px]">x</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={100.0}
                    step={0.1}
                    value={selectedProp.scale}
                    onChange={(e) => handleUpdateSelectedProp('scale', parseFloat(e.target.value))}
                    className="w-full accent-sky-500 cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer / Action Bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 border-t border-slate-800">
          <div className="flex items-center gap-6 text-xs font-mono text-slate-400">
            <div>
              <span className="text-slate-500">ขนาดแปลง:</span>{' '}
              <span className="text-white font-bold">{sizeX}x{sizeZ} ช่อง</span>
            </div>
            <div>
              <span className="text-slate-500">ความจุคน/งาน:</span>{' '}
              <span className="text-emerald-400 font-bold">{popCapacity || jobsCapacity} หน่วย</span>
            </div>
            <div>
              <span className="text-slate-500">ราคาค่าสร้าง:</span>{' '}
              <span className="text-amber-400 font-bold">§{cost.toLocaleString()}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
            >
              ยกเลิก (Cancel)
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 border border-emerald-400/40 rounded-xl shadow-lg shadow-emerald-950/40 transition-colors flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              บันทึก Custom Lot เข้าเมือง (Save Lot)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
