import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  createBuiltInSampleObjBuffer,
  detectModelFormatFromName,
  normalizeParsedModelGroup,
  parseModelArrayBuffer,
  registerNormalizedCustomModel,
  saveModelBufferToIDB,
} from '../game/customModels';
import { LotEditorModal } from './LotEditorModal';
import { validateAndCreateModPackage } from '../game/rules';
import {
  BuildingArchetype,
  Custom3DAssetCategory,
  Custom3DModelFormat,
  ModPackage,
} from '../game/types';

interface ModWorkshopModalProps {
  mods: ModPackage[];
  initialTab?: 'installed' | 'import3d' | 'create' | 'json' | 'lotstudio';
  onToggleMod: (modId: string) => void;
  onAddCustomMod: (mod: ModPackage) => void;
  onClose: () => void;
}

const ARCHETYPE_OPTIONS: Array<{ id: BuildingArchetype; label: string }> = [
  { id: 'arcology_tower', label: 'ตึกระฟ้าอาร์โคโลจี (Arcology Spire)' },
  { id: 'skytrain_hub', label: 'สถานีขนส่งมวลชนลอยฟ้า (Skytrain Hub)' },
  { id: 'fusion_dome', label: 'โดมพลังงานอนาคต (Fusion Dome)' },
  { id: 'commercial_high', label: 'อาคารสำนักงานกระจกสูง (CBD Tower)' },
  { id: 'civic_service', label: 'อาคารบริการสาธารณะ (Civic Center)' },
  { id: 'park_plaza', label: 'สวนนิเวศและลานน้ำพุ (Eco Plaza)' },
];

export const ModWorkshopModal: React.FC<ModWorkshopModalProps> = ({
  mods,
  initialTab = 'import3d',
  onToggleMod,
  onAddCustomMod,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'installed' | 'import3d' | 'create' | 'json' | 'lotstudio' | 'guide'>(
    initialTab
  );

  // Form state for procedural Mod Builder (Tab: create)
  const [title, setTitle] = useState('');
  const [buildingName, setBuildingName] = useState('');
  const [author, setAuthor] = useState('');
  const [archetype, setArchetype] = useState<BuildingArchetype>('arcology_tower');
  const [cost, setCost] = useState('850');
  const [powerMW, setPowerMW] = useState('45');
  const [waterM3, setWaterM3] = useState('30');
  const [populationCapacity, setPopulationCapacity] = useState('220');
  const [jobsCapacity, setJobsCapacity] = useState('110');
  const [pollutionDelta, setPollutionDelta] = useState('-8');
  const [landValueBoost, setLandValueBoost] = useState('24');
  const [stories, setStories] = useState('12');
  const [primaryColor, setPrimaryColor] = useState('#0284c7');
  const [accentColor, setAccentColor] = useState('#38bdf8');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // State for External 3D Model Studio & Importer (Tab: import3d)
  const [assetCategory, setAssetCategory] = useState<Custom3DAssetCategory>('building');
  const [modelFormat, setModelFormat] = useState<Custom3DModelFormat>('obj');
  const [loadedFileName, setLoadedFileName] = useState<string>('');
  const [modelUrlInput, setModelUrlInput] = useState<string>('');
  const [isLoadingModel, setIsLoadingModel] = useState<boolean>(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [modelSuccess, setModelSuccess] = useState<string | null>(null);

  const [scaleMultiplier, setScaleMultiplier] = useState<number>(1.0);
  const [yOffset, setYOffset] = useState<number>(0.0);
  const [rotationY, setRotationY] = useState<number>(0);
  const [autoRotatePreview, setAutoRotatePreview] = useState<boolean>(true);

  const [modelTitle, setModelTitle] = useState<string>('Crystal Horizon Tower 3D Mod');
  const [modelObjectName, setModelObjectName] = useState<string>('ตึกระฟ้าคริสตัลฮอไรซัน');
  const [modelAuthor, setModelAuthor] = useState<string>('MetroCreator');
  const [modelCost, setModelCost] = useState<string>('650');
  const [modelPowerMW, setModelPowerMW] = useState<string>('-4');
  const [modelWaterM3, setModelWaterM3] = useState<string>('-15');
  const [modelPopCap, setModelPopCap] = useState<string>('180');
  const [modelJobsCap, setModelJobsCap] = useState<string>('95');
  const [modelLandBoost, setModelLandBoost] = useState<string>('28');
  const [modelPrimaryColor, setModelPrimaryColor] = useState<string>('#0284c7');
  const [modelAccentColor, setModelAccentColor] = useState<string>('#38bdf8');
  const [modelDesc, setModelDesc] = useState<string>('');

  // Store the raw parsed THREE.Group and binary ArrayBuffer for the currently previewed 3D model
  const rawModelGroupRef = useRef<THREE.Group | null>(null);
  const rawModelBufferRef = useRef<ArrayBuffer | null>(null);
  const currentSampleKeyRef = useRef<string | null>('sample_skyscraper');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 3D Turntable Preview Canvas refs
  const previewMountRef = useRef<HTMLDivElement | null>(null);
  const previewSubjectGroupRef = useRef<THREE.Group | null>(null);
  const previewBaseRoadLineRef = useRef<THREE.Mesh | null>(null);
  const autoRotateRef = useRef<boolean>(autoRotatePreview);
  autoRotateRef.current = autoRotatePreview;

  // JSON import state
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Helper to update the 3D object inside the turntable preview scene
  const syncPreviewSceneModel = (
    rawGroup: THREE.Group | null,
    category: Custom3DAssetCategory,
    scale: number,
    yOff: number,
    rotDeg: number,
    pColor: string,
    aColor: string
  ) => {
    const holder = previewSubjectGroupRef.current;
    if (!holder) return;

    while (holder.children.length > 0) {
      holder.remove(holder.children[0]);
    }

    if (previewBaseRoadLineRef.current) {
      previewBaseRoadLineRef.current.visible = category === 'vehicle';
    }

    if (!rawGroup) return;

    const normalized = normalizeParsedModelGroup(rawGroup, category);
    const displayScale = category === 'vehicle' ? scale * 2.2 : scale;
    normalized.scale.setScalar(displayScale);
    normalized.position.y = yOff;
    normalized.rotation.y = (rotDeg * Math.PI) / 180;

    // Apply user chosen colors to untinted OBJ parts
    const pCol = new THREE.Color(pColor || '#0284c7');
    const aCol = new THREE.Color(aColor || '#38bdf8');
    const glassCol = new THREE.Color('#bae6fd');

    normalized.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.name === 'taillights') return;
        const m = mesh.material as THREE.MeshStandardMaterial;
        if (m && m.userData?.isDefaultUntinted) {
          const partIdx = Number(m.userData.partIndex || 0);
          const clonedMat = m.clone();
          if (partIdx % 3 === 0) {
            clonedMat.color.copy(pCol);
            clonedMat.roughness = 0.42;
            clonedMat.metalness = 0.32;
          } else if (partIdx % 3 === 1) {
            clonedMat.color.copy(glassCol);
            clonedMat.roughness = 0.16;
            clonedMat.metalness = 0.85;
          } else {
            clonedMat.color.copy(aCol);
            clonedMat.roughness = 0.28;
            clonedMat.metalness = 0.55;
          }
          mesh.material = clonedMat;
        }
      }
    });

    holder.add(normalized);
  };

  // Load a built-in sample 3D model so the preview canvas is immediately alive on first open
  const handleLoadBuiltInSample = async (
    sampleId: 'sample_skyscraper' | 'sample_sportscar' | 'sample_landmark'
  ) => {
    setModelError(null);
    setModelSuccess(null);
    setIsLoadingModel(true);
    try {
      const sample = createBuiltInSampleObjBuffer(sampleId);
      const parsed = await parseModelArrayBuffer(sample.buffer, 'obj');
      rawModelGroupRef.current = parsed;
      rawModelBufferRef.current = sample.buffer;
      currentSampleKeyRef.current = sampleId;
      setModelFormat('obj');
      setLoadedFileName(sample.fileName);
      setAssetCategory(sample.defaultCategory);
      setModelTitle(sample.defaultTitle);
      setModelObjectName(sample.defaultBldgName);
      setScaleMultiplier(1.0);
      setYOffset(0.0);
      setRotationY(0);

      if (sample.defaultCategory === 'vehicle') {
        setModelCost('180');
        setModelPopCap('0');
        setModelJobsCap('15');
        setModelPowerMW('0');
        setModelWaterM3('0');
        setModelLandBoost('12');
        setModelPrimaryColor('#f43f5e');
        setModelAccentColor('#38bdf8');
      } else if (sample.defaultCategory === 'prop') {
        setModelCost('320');
        setModelPopCap('0');
        setModelJobsCap('10');
        setModelPowerMW('-1');
        setModelWaterM3('-5');
        setModelLandBoost('35');
        setModelPrimaryColor('#f59e0b');
        setModelAccentColor('#fde047');
      } else {
        setModelCost('780');
        setModelPopCap('240');
        setModelJobsCap('120');
        setModelPowerMW('-5');
        setModelWaterM3('-20');
        setModelLandBoost('28');
        setModelPrimaryColor('#0284c7');
        setModelAccentColor('#38bdf8');
      }
    } catch (err) {
      setModelError('ไม่สามารถโหลดโมเดลตัวอย่างได้');
    } finally {
      setIsLoadingModel(false);
    }
  };

  // Initialize 3D Turntable Preview WebGL Scene when on 'import3d' tab
  useEffect(() => {
    if (activeTab !== 'import3d') return;
    const mount = previewMountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07101c);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 50);
    camera.position.set(1.35, 1.15, 1.45);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const rect = mount.getBoundingClientRect();
    const initW = Math.max(240, rect.width || 320);
    const initH = Math.max(200, rect.height || 240);
    camera.aspect = initW / initH;
    camera.updateProjectionMatrix();
    renderer.setSize(initW, initH);
    renderer.domElement.style.touchAction = 'none';
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.28, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.45;
    controls.maxDistance = 4.5;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.update();

    // 3-Point Studio Lighting
    const hemi = new THREE.HemisphereLight(0xbae6fd, 0x1e293b, 1.1);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 2.2);
    keyLight.position.set(3, 5, 3);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.9);
    rimLight.position.set(-3, 2, -3);
    scene.add(rimLight);

    // Reference 1x1 City Tile Pedestal (1.0 x 1.0 world unit)
    const pedestalGroup = new THREE.Group();
    scene.add(pedestalGroup);

    const tilePlate = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.06, 1.0),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.75, metalness: 0.15 })
    );
    tilePlate.position.y = -0.03;
    pedestalGroup.add(tilePlate);

    const gridHelper = new THREE.GridHelper(1.0, 4, 0x38bdf8, 0x334155);
    gridHelper.position.y = 0.002;
    pedestalGroup.add(gridHelper);

    // Dashed yellow road center line indicator (shown when category === 'vehicle')
    const roadLine = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.006, 0.92),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 })
    );
    roadLine.position.y = 0.005;
    roadLine.visible = assetCategory === 'vehicle';
    pedestalGroup.add(roadLine);
    previewBaseRoadLineRef.current = roadLine;

    const subjectHolder = new THREE.Group();
    scene.add(subjectHolder);
    previewSubjectGroupRef.current = subjectHolder;

    // Load default sample if nothing loaded yet
    if (!rawModelGroupRef.current) {
      void handleLoadBuiltInSample('sample_skyscraper');
    } else {
      syncPreviewSceneModel(
        rawModelGroupRef.current,
        assetCategory,
        scaleMultiplier,
        yOffset,
        rotationY,
        modelPrimaryColor,
        modelAccentColor
      );
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      }
    });
    resizeObserver.observe(mount);

    let frameId = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      if (autoRotateRef.current) {
        pedestalGroup.rotation.y += 0.006;
        subjectHolder.rotation.y += 0.006;
      } else {
        pedestalGroup.rotation.y = 0;
        subjectHolder.rotation.y = 0;
      }
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [activeTab]);

  // Re-sync preview model whenever sliders, category, or colors change
  useEffect(() => {
    if (activeTab !== 'import3d') return;
    syncPreviewSceneModel(
      rawModelGroupRef.current,
      assetCategory,
      scaleMultiplier,
      yOffset,
      rotationY,
      modelPrimaryColor,
      modelAccentColor
    );
  }, [
    activeTab,
    assetCategory,
    scaleMultiplier,
    yOffset,
    rotationY,
    modelPrimaryColor,
    modelAccentColor,
    loadedFileName,
  ]);

  // Handle uploading a local .glb / .gltf / .obj file from computer or Android device
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setModelError(null);
    setModelSuccess(null);
    setIsLoadingModel(true);

    try {
      const format = detectModelFormatFromName(file.name);
      const buffer = await file.arrayBuffer();
      const parsed = await parseModelArrayBuffer(buffer, format);

      rawModelGroupRef.current = parsed;
      rawModelBufferRef.current = buffer;
      currentSampleKeyRef.current = null;
      setModelFormat(format);
      setLoadedFileName(file.name);

      const cleanBaseName = file.name.replace(/\.(glb|gltf|obj)$/i, '').replace(/[_-]+/g, ' ');
      if (cleanBaseName) {
        setModelTitle(`${cleanBaseName} 3D Mod`);
        setModelObjectName(cleanBaseName);
      }

      syncPreviewSceneModel(
        parsed,
        assetCategory,
        scaleMultiplier,
        yOffset,
        rotationY,
        modelPrimaryColor,
        modelAccentColor
      );
    } catch (err) {
      setModelError(
        'ไม่สามารถอ่านไฟล์ 3D นี้ได้ กรุณาตรวจสอบว่าเป็นไฟล์ .glb, .gltf หรือ .obj ที่สมบูรณ์'
      );
    } finally {
      setIsLoadingModel(false);
    }
  };

  // Handle loading a .glb / .gltf / .obj from an external URL
  const handleLoadFromUrl = async () => {
    const url = modelUrlInput.trim();
    if (!url) {
      setModelError('กรุณาวางลิงก์ URL ของไฟล์ .glb, .gltf หรือ .obj');
      return;
    }

    setModelError(null);
    setModelSuccess(null);
    setIsLoadingModel(true);

    try {
      const format = detectModelFormatFromName(url);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const buffer = await response.arrayBuffer();
      const parsed = await parseModelArrayBuffer(buffer, format);

      const urlFileName = url.split('/').pop()?.split('?')[0] || `remote_model.${format}`;
      rawModelGroupRef.current = parsed;
      rawModelBufferRef.current = buffer;
      currentSampleKeyRef.current = null;
      setModelFormat(format);
      setLoadedFileName(urlFileName);

      syncPreviewSceneModel(
        parsed,
        assetCategory,
        scaleMultiplier,
        yOffset,
        rotationY,
        modelPrimaryColor,
        modelAccentColor
      );
    } catch (err) {
      setModelError(
        'ไม่สามารถดึงไฟล์จาก URL นี้ได้ (เซิร์ฟเวอร์ปลายทางอาจบล็อก CORS หรือลิงก์ไม่ถูกต้อง) แนะนำให้ดาวน์โหลดไฟล์แล้วอัปโหลดจากเครื่องแทน'
      );
    } finally {
      setIsLoadingModel(false);
    }
  };

  // Save and register the imported 3D model into IndexedDB + Mod catalog
  const handleSaveImported3DMod = async (e: React.FormEvent) => {
    e.preventDefault();
    setModelError(null);
    setModelSuccess(null);

    if (!rawModelGroupRef.current || ! rawModelBufferRef.current) {
      setModelError('กรุณาอัปโหลดไฟล์โมเดล 3D หรือเลือกโมเดลตัวอย่างก่อนบันทึก');
      return;
    }

    const storageKey =
      currentSampleKeyRef.current ||
      `idb_model_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    // Persist binary buffer to IndexedDB if user uploaded a custom file or URL
    if (!currentSampleKeyRef.current) {
      await saveModelBufferToIDB(
        storageKey,
        rawModelBufferRef.current,
        modelFormat,
        loadedFileName
      );
    }

    // Register normalized template immediately in memory cache so it renders with zero delay
    registerNormalizedCustomModel(storageKey, assetCategory, rawModelGroupRef.current);

    const chosenArchetype: BuildingArchetype =
      assetCategory === 'prop'
        ? 'park_plaza'
        : assetCategory === 'vehicle'
        ? 'civic_service'
        : 'arcology_tower';

    const defaultDesc =
      assetCategory === 'vehicle'
        ? `โมเดลรถยนต์ 3 มิติ (${loadedFileName}) วิ่งสัญจรบนถนนอัตโนมัติและวางเป็นโชว์รูมได้`
        : assetCategory === 'prop'
        ? `โมเดลของตกแต่งเมืองและแลนด์มาร์ก 3 มิติ (${loadedFileName})`
        : `โมเดลอาคารสิ่งปลูกสร้าง 3 มิติ (${loadedFileName})`;

    const result = validateAndCreateModPackage({
      title: modelTitle,
      author: modelAuthor,
      buildingName: modelObjectName,
      archetype: chosenArchetype,
      cost: Number(modelCost),
      powerMW: Number(modelPowerMW),
      waterM3: Number(modelWaterM3),
      populationCapacity: assetCategory === 'building' ? Number(modelPopCap) : 0,
      jobsCapacity: Number(modelJobsCap),
      pollutionDelta: assetCategory === 'prop' ? -10 : 0,
      landValueBoost: Number(modelLandBoost),
      stories: assetCategory === 'building' ? 10 : 2,
      primaryColor: modelPrimaryColor,
      accentColor: modelAccentColor,
      description: modelDesc.trim() || defaultDesc,
      customModel: {
        assetCategory,
        modelFormat,
        storageKey,
        sourceUrl: modelUrlInput.trim() || undefined,
        fileName: loadedFileName,
        scaleMultiplier,
        yOffset,
        rotationY,
      },
    });

    if (!result.valid || !result.modPackage) {
      setModelError(result.error || 'ข้อมูลไม่ครบถ้วน กรุณาตรวจสอบชื่อและค่าสถานะ');
      return;
    }

    onAddCustomMod(result.modPackage);
    setModelSuccess(
      assetCategory === 'vehicle'
        ? `ติดตั้งรถยนต์ 3D "${result.modPackage.building.name}" สำเร็จ! รถยนต์จะออกวิ่งบนถนนอัตโนมัติและเลือกวางจากหมวด Mod เสริมได้ทันที`
        : `ติดตั้งโมเดล 3D "${result.modPackage.building.name}" สำเร็จ! เลือกวางลงในเมืองจากหมวด Mod เสริมได้ทันที`
    );
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const result = validateAndCreateModPackage({
      title,
      author,
      buildingName,
      archetype,
      cost: Number(cost),
      powerMW: Number(powerMW),
      waterM3: Number(waterM3),
      populationCapacity: Number(populationCapacity),
      jobsCapacity: Number(jobsCapacity),
      pollutionDelta: Number(pollutionDelta),
      landValueBoost: Number(landValueBoost),
      stories: Number(stories),
      primaryColor,
      accentColor,
      description,
    });

    if (!result.valid || !result.modPackage) {
      setFormError(result.error || 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง');
      return;
    }

    onAddCustomMod(result.modPackage);
    setFormSuccess(`สร้างและเปิดใช้งาน Mod "${result.modPackage.title}" เรียบร้อยแล้ว!`);
    setTitle('');
    setBuildingName('');
    setDescription('');
  };

  const handleImportJson = () => {
    setJsonError(null);
    try {
      const parsed = JSON.parse(jsonText);
      const res = validateAndCreateModPackage({
        title: String(parsed.title || ''),
        author: String(parsed.author || ''),
        buildingName: String(parsed.buildingName || ''),
        archetype: (parsed.archetype as BuildingArchetype) || 'arcology_tower',
        cost: Number(parsed.cost),
        powerMW: Number(parsed.powerMW ?? 0),
        waterM3: Number(parsed.waterM3 ?? 0),
        populationCapacity: Number(parsed.populationCapacity ?? 0),
        jobsCapacity: Number(parsed.jobsCapacity ?? 0),
        pollutionDelta: Number(parsed.pollutionDelta ?? 0),
        landValueBoost: Number(parsed.landValueBoost ?? 10),
        stories: Number(parsed.stories ?? 8),
        primaryColor: String(parsed.primaryColor || '#0284c7'),
        accentColor: String(parsed.accentColor || '#38bdf8'),
        description: String(parsed.description || ''),
      });
      if (!res.valid || !res.modPackage) {
        setJsonError(res.error || 'โครงสร้าง JSON Mod ไม่ครบถ้วน');
        return;
      }
      onAddCustomMod(res.modPackage);
      setJsonText('');
      setActiveTab('installed');
    } catch {
      setJsonError('รูปแบบ JSON ไม่ถูกต้อง กรุณาตรวจสอบ Syntax');
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-2 sm:p-4 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mod-workshop-heading"
    >
      <div className="w-full max-w-4xl bg-[#0b131e] border border-slate-700 rounded-2xl p-4 sm:p-6 shadow-2xl max-h-[92dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 gap-2">
          <div>
            <h2
              id="mod-workshop-heading"
              className="text-base sm:text-xl font-bold font-display text-white"
            >
              สตูดิโอนำเข้าโมเดล 3D และศูนย์จัดการ Mod (3D Asset Studio & Mod SDK)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              นำเข้าไฟล์โมเดล 3 มิติภายนอก (.GLB / .GLTF / .OBJ) สำหรับอาคาร รถยนต์สัญจร และของตกแต่งเมือง
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer transition-colors active:scale-95 shrink-0"
          >
            ปิดหน้าต่าง [Esc]
          </button>
        </div>

        {/* Mode Tabs (Scrollable on mobile screens) */}
        <div className="flex items-center gap-2 my-3 max-w-full overflow-x-auto touch-pan-x scrollbar-none flex-nowrap">
          <button
            type="button"
            onClick={() => setActiveTab('import3d')}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 transition-all active:scale-95 ${
              activeTab === 'import3d'
                ? 'bg-sky-400 text-slate-950 font-bold shadow-sm'
                : 'bg-[#132032] text-sky-300 border border-sky-500/30 hover:bg-[#1a2b42]'
            }`}
          >
            📦 นำเข้าโมเดล 3D (.GLB / .OBJ)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('lotstudio')}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 transition-all active:scale-95 ${
              activeTab === 'lotstudio'
                ? 'bg-purple-500 text-slate-950 font-bold shadow-sm'
                : 'bg-[#132032] text-purple-300 border border-purple-500/30 hover:bg-[#1a2b42]'
            }`}
          >
            🎨 3D Lot Studio (สร้าง Custom Lot)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('installed')}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 transition-all active:scale-95 ${
              activeTab === 'installed'
                ? 'bg-sky-500 text-slate-950 font-bold shadow-sm'
                : 'bg-[#132032] text-slate-300 hover:bg-[#1a2b42]'
            }`}
          >
            Mod ที่ติดตั้งแล้ว ({mods.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('create')}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 transition-all active:scale-95 ${
              activeTab === 'create'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                : 'bg-[#132032] text-slate-300 hover:bg-[#1a2b42]'
            }`}
          >
            + สร้าง Mod อาคารทรงมาตรฐาน
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('json')}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 transition-all active:scale-95 ${
              activeTab === 'json'
                ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                : 'bg-[#132032] text-slate-300 hover:bg-[#1a2b42]'
            }`}
          >
            นำเข้า / ส่งออก JSON Mod
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('guide')}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 transition-all active:scale-95 ${
              activeTab === 'guide'
                ? 'bg-purple-500 text-white font-bold shadow-sm'
                : 'bg-[#132032] text-slate-300 hover:bg-[#1a2b42]'
            }`}
          >
            📖 คู่มือแนะนำ 3D & ตัวอย่างโมเดล
          </button>
        </div>

        {/* Tab: External 3D Model Studio & Importer (.GLB / .GLTF / .OBJ) */}
        {activeTab === 'import3d' && (
          <form
            onSubmit={handleSaveImported3DMod}
            className="overflow-y-auto pr-1 space-y-4 text-xs flex-1"
          >
            {modelError && (
              <div
                className="p-3 rounded-xl bg-rose-950/90 border border-rose-500/50 text-rose-200 font-medium"
                role="alert"
              >
                {modelError}
              </div>
            )}
            {modelSuccess && (
              <div
                className="p-3 rounded-xl bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 font-medium flex flex-wrap items-center justify-between gap-2"
                role="status"
              >
                <span>{modelSuccess}</span>
                <button
                  type="button"
                  onClick={() => setActiveTab('installed')}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-bold cursor-pointer"
                >
                  ดูรายการ Mod ที่ติดตั้ง
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              {/* Left Column: Category, File/URL Input, and Metadata */}
              <div className="lg:col-span-7 space-y-3.5">
                {/* 1. Asset Category Selector */}
                <div className="p-3.5 rounded-xl bg-[#111d2e] border border-slate-800 space-y-2">
                  <span className="block text-slate-200 font-semibold">
                    1. เลือกประเภทการนำไปใช้งานในเมือง
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setAssetCategory('building')}
                      className={`min-h-[44px] px-3 py-2 rounded-xl text-left transition-all cursor-pointer border ${
                        assetCategory === 'building'
                          ? 'bg-sky-500/20 border-sky-400 text-white font-bold'
                          : 'bg-[#0b131e] border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-xs">🏢 อาคาร / สิ่งปลูกสร้าง</div>
                      <div className="text-[10px] text-slate-400 font-normal">
                        วางลงบนช่องแผนที่เมือง
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssetCategory('vehicle')}
                      className={`min-h-[44px] px-3 py-2 rounded-xl text-left transition-all cursor-pointer border ${
                        assetCategory === 'vehicle'
                          ? 'bg-amber-500/20 border-amber-400 text-white font-bold'
                          : 'bg-[#0b131e] border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-xs">🚗 รถยนต์วิ่งบนถนน</div>
                      <div className="text-[10px] text-slate-400 font-normal">
                        วิ่งตามเลนถนนและหยุดไฟแดง
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssetCategory('prop')}
                      className={`min-h-[44px] px-3 py-2 rounded-xl text-left transition-all cursor-pointer border ${
                        assetCategory === 'prop'
                          ? 'bg-emerald-500/20 border-emerald-400 text-white font-bold'
                          : 'bg-[#0b131e] border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-xs">🗽 ของตกแต่ง / แลนด์มาร์ก</div>
                      <div className="text-[10px] text-slate-400 font-normal">
                        ประดับสวนและเพิ่มมูลค่าที่ดิน
                      </div>
                    </button>
                  </div>
                </div>

                {/* 2. Upload File or Paste URL */}
                <div className="p-3.5 rounded-xl bg-[#111d2e] border border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-slate-200 font-semibold">
                      2. อัปโหลดไฟล์ 3D (.glb, .gltf, .obj) หรือวางลิงก์ URL
                    </span>
                    {loadedFileName && (
                      <span className="text-[11px] font-mono text-sky-300">
                        ไฟล์ปัจจุบัน: {loadedFileName}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".glb,.gltf,.obj"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold cursor-pointer transition-all active:scale-95"
                    >
                      📂 เลือกไฟล์ .GLB / .GLTF / .OBJ จากเครื่อง
                    </button>

                    <div className="flex-1 min-w-[200px] flex items-center gap-1.5">
                      <input
                        type="url"
                        value={modelUrlInput}
                        onChange={(e) => setModelUrlInput(e.target.value)}
                        placeholder="หรือวาง URL ไฟล์ .glb / .obj..."
                        className="w-full h-11 px-3 rounded-xl bg-[#0b131e] border border-slate-700 text-white"
                      />
                      <button
                        type="button"
                        onClick={handleLoadFromUrl}
                        disabled={isLoadingModel}
                        className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 font-semibold cursor-pointer whitespace-nowrap shrink-0"
                      >
                        ดึงจาก URL
                      </button>
                    </div>
                  </div>

                  {/* Quick Sample Presets */}
                  <div className="pt-1 border-t border-slate-800/80 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-slate-400 mr-1">
                      ทดลองโหลดโมเดล 3D ตัวอย่าง:
                    </span>
                    <button
                      type="button"
                      onClick={() => handleLoadBuiltInSample('sample_skyscraper')}
                      className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[#0b131e] hover:bg-slate-800 border border-slate-700 text-slate-200 cursor-pointer text-[11px]"
                    >
                      🏢 ตึกระฟ้าคริสตัล (.OBJ)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLoadBuiltInSample('sample_sportscar')}
                      className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[#0b131e] hover:bg-slate-800 border border-slate-700 text-slate-200 cursor-pointer text-[11px]"
                    >
                      🏎️ รถสปอร์ต Cyber GT (.OBJ)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLoadBuiltInSample('sample_landmark')}
                      className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[#0b131e] hover:bg-slate-800 border border-slate-700 text-slate-200 cursor-pointer text-[11px]"
                    >
                      🗽 อนุสาวรีย์ทองคำ (.OBJ)
                    </button>
                  </div>
                </div>

                {/* 3. City Stats & Colors */}
                <div className="p-3.5 rounded-xl bg-[#111d2e] border border-slate-800 space-y-3">
                  <span className="block text-slate-200 font-semibold">
                    3. ตั้งชื่อและคุณสมบัติของโมเดลในเมือง
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-slate-400 mb-1">ชื่อแพ็กเกจ Mod *</label>
                      <input
                        type="text"
                        value={modelTitle}
                        onChange={(e) => setModelTitle(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg bg-[#0b131e] border border-slate-700 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">ชื่อแสดงในเกม *</label>
                      <input
                        type="text"
                        value={modelObjectName}
                        onChange={(e) => setModelObjectName(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg bg-[#0b131e] border border-slate-700 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">ผู้สร้าง (Author) *</label>
                      <input
                        type="text"
                        value={modelAuthor}
                        onChange={(e) => setModelAuthor(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg bg-[#0b131e] border border-slate-700 text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div>
                      <label className="block text-slate-400 mb-1">ค่าก่อสร้าง (฿)</label>
                      <input
                        type="number"
                        value={modelCost}
                        onChange={(e) => setModelCost(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg bg-[#0b131e] border border-slate-700 text-white font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">ความจุประชากร</label>
                      <input
                        type="number"
                        value={modelPopCap}
                        onChange={(e) => setModelPopCap(e.target.value)}
                        disabled={assetCategory !== 'building'}
                        className="w-full h-10 px-3 rounded-lg bg-[#0b131e] border border-slate-700 text-white font-mono tabular-nums disabled:opacity-40"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">ตำแหน่งงาน</label>
                      <input
                        type="number"
                        value={modelJobsCap}
                        onChange={(e) => setModelJobsCap(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg bg-[#0b131e] border border-slate-700 text-white font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">บูสต์มูลค่าที่ดิน</label>
                      <input
                        type="number"
                        value={modelLandBoost}
                        onChange={(e) => setModelLandBoost(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg bg-[#0b131e] border border-slate-700 text-white font-mono tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div>
                      <label className="block text-slate-400 mb-1">ไฟฟ้า (MW)</label>
                      <input
                        type="number"
                        value={modelPowerMW}
                        onChange={(e) => setModelPowerMW(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg bg-[#0b131e] border border-slate-700 text-white font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">น้ำประปา (m³)</label>
                      <input
                        type="number"
                        value={modelWaterM3}
                        onChange={(e) => setModelWaterM3(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg bg-[#0b131e] border border-slate-700 text-white font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">สีหลัก (.OBJ)</label>
                      <input
                        type="color"
                        value={modelPrimaryColor}
                        onChange={(e) => setModelPrimaryColor(e.target.value)}
                        className="w-full h-10 rounded-lg bg-[#0b131e] border border-slate-700 cursor-pointer"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">สีรอง (.OBJ)</label>
                      <input
                        type="color"
                        value={modelAccentColor}
                        onChange={(e) => setModelAccentColor(e.target.value)}
                        className="w-full h-10 rounded-lg bg-[#0b131e] border border-slate-700 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Live 3D Turntable Preview + Scale / Y-Offset / Rotation Controls */}
              <div className="lg:col-span-5 flex flex-col justify-between p-3.5 rounded-xl bg-[#111d2e] border border-slate-800 space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-200 font-semibold">
                      พรีวิว 3 มิติ (ลากหมุนดูได้ 360°)
                    </span>
                    <button
                      type="button"
                      onClick={() => setAutoRotatePreview((prev) => !prev)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium cursor-pointer border ${
                        autoRotatePreview
                          ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      {autoRotatePreview ? '⟳ หมุนอัตโนมัติ: เปิด' : '⟳ หมุนอัตโนมัติ: ปิด'}
                    </button>
                  </div>

                  {/* 3D WebGL Turntable Viewport */}
                  <div className="relative w-full h-52 sm:h-56 rounded-xl overflow-hidden border border-slate-700/80 bg-[#07101c]">
                    <div ref={previewMountRef} className="w-full h-full" />
                    {isLoadingModel && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sky-300 font-semibold">
                        กำลังประมวลผลโมเดล 3D...
                      </div>
                    )}
                    <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-[10px] text-slate-400 pointer-events-none">
                      <span>ฐานอ้างอิง: 1 ช่อง (10×10 ม.)</span>
                      <span>1 นิ้วหมุน · 2 นิ้วซูม</span>
                    </div>
                  </div>
                </div>

                {/* Transform Adjustment Sliders */}
                <div className="space-y-2.5 pt-1">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor="scale-slider" className="text-slate-300 font-medium">
                        ปรับขนาดโมเดล (Scale 0.1x - 100x)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0.1"
                          max="100.0"
                          step="0.1"
                          value={scaleMultiplier}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) {
                              setScaleMultiplier(Math.max(0.1, Math.min(100.0, val)));
                            }
                          }}
                          className="w-20 h-7 px-2 rounded bg-[#0b131e] border border-sky-500/50 text-sky-300 font-mono text-xs font-bold text-right"
                        />
                        <span className="font-mono text-sky-300 font-bold text-xs">x</span>
                        <button
                          type="button"
                          onClick={() => setScaleMultiplier(1.0)}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                        >
                          รีเซ็ต
                        </button>
                      </div>
                    </div>
                    <input
                      id="scale-slider"
                      type="range"
                      min="0.1"
                      max="100.0"
                      step="0.1"
                      value={scaleMultiplier}
                      onChange={(e) => setScaleMultiplier( parseFloat(e.target.value) )}
                      className="w-full accent-sky-400 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor="yoffset-slider" className="text-slate-300 font-medium">
                        ปรับความสูงจากพื้น (Y-Offset)
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="font-mono tabular-nums text-sky-300 font-bold">
                          {yOffset >= 0 ? `+${yOffset.toFixed(2)}` : yOffset.toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setYOffset(0.0)}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                        >
                          รีเซ็ต
                        </button>
                      </div>
                    </div>
                    <input
                      id="yoffset-slider"
                      type="range"
                      min="-0.5"
                      max="1.0"
                      step="0.02"
                      value={yOffset}
                      onChange={(e) => setYOffset( parseFloat(e.target.value) )}
                      className="w-full accent-sky-400 cursor-pointer"
                    />
                  </div>

                  <div>
                    <span className="block text-slate-300 font-medium mb-1">
                      มุมหันหน้าเริ่มต้น (Rotation Y)
                    </span>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[0, 90, 180, 270].map((deg) => (
                        <button
                          key={deg}
                          type="button"
                          onClick={() => setRotationY(deg)}
                          className={`min-h-[38px] rounded-lg font-mono text-xs cursor-pointer border transition-colors ${
                            rotationY === deg
                              ? 'bg-sky-500 text-slate-950 font-bold border-sky-400'
                              : 'bg-[#0b131e] text-slate-300 border-slate-800 hover:bg-slate-800'
                          }`}
                        >
                          {deg}°
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm cursor-pointer transition-all active:scale-95 shadow-lg"
                >
                  ✅ บันทึกและติดตั้งโมเดล 3D เข้าสู่เมือง
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Tab 1: Installed Mods */}
        {activeTab === 'installed' && (
          <div className="overflow-y-auto space-y-3 pr-1 flex-1">
            {mods.map((mod) => {
              const b = mod.building;
              const cm = mod.customModel || b.customModel;
              return (
                <div
                  key={mod.id}
                  className="p-4 rounded-xl bg-[#111d2e] border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-white">{mod.title}</span>
                      <span className="text-xs text-slate-400">· v{mod.version}</span>
                      <span className="text-xs text-sky-400">· โดย {mod.author}</span>
                      {cm && (
                        <span className="text-xs text-emerald-300 font-mono">
                          · โมเดล 3D ({cm.modelFormat.toUpperCase()} /{' '}
                          {cm.assetCategory === 'vehicle'
                            ? 'รถยนต์วิ่งบนถนน'
                            : cm.assetCategory === 'prop'
                            ? 'ของตกแต่งเมือง'
                            : 'อาคาร'}
                          )
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-300">{mod.description}</p>
                    <div className="text-[11px] font-mono tabular-nums text-slate-400 flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-amber-300">ราคา ฿{b.cost}</span>
                      <span>·</span>
                      <span>ไฟ {b.powerMW >= 0 ? `+${b.powerMW}` : b.powerMW} MW</span>
                      <span>·</span>
                      <span>น้ำ {b.waterM3 >= 0 ? `+${b.waterM3}` : b.waterM3} m³</span>
                      <span>·</span>
                      <span>ประชากร +{b.populationCapacity}</span>
                      <span>·</span>
                      <span>งาน +{b.jobsCapacity}</span>
                      {cm && (
                        <>
                          <span>·</span>
                          <span className="text-sky-300">
                            Scale {cm.scaleMultiplier.toFixed(2)}x
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    <button
                      type="button"
                      onClick={() => onToggleMod(mod.id)}
                      aria-pressed={mod.enabled}
                      className={`min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-all active:scale-95 ${
                        mod.enabled
                          ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-sm'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {mod.enabled ? 'เปิดใช้งานอยู่ (Enabled)' : 'เปิดใช้งาน (Enable)'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 2: Custom Procedural Mod Creator Form */}
        {activeTab === 'create' && (
          <form onSubmit={handleCreateSubmit} className="overflow-y-auto space-y-4 pr-1 text-xs flex-1">
            {formError && (
              <div className="p-3 rounded-lg bg-rose-950/90 border border-rose-500/50 text-rose-200 font-medium" role="alert">
                {formError}
              </div>
            )}
            {formSuccess && (
              <div className="p-3 rounded-lg bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 font-medium" role="status">
                {formSuccess}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="mod-title-input" className="block text-slate-300 mb-1 font-medium">
                  ชื่อแพ็กเกจ Mod *
                </label>
                <input
                  id="mod-title-input"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="เช่น Green Sky Tower Mod"
                  className="w-full h-9 px-3 rounded-lg bg-[#132032] border border-slate-700 text-white"
                />
              </div>
              <div>
                <label htmlFor="mod-bldg-name-input" className="block text-slate-300 mb-1 font-medium">
                  ชื่ออาคารในเกม *
                </label>
                <input
                  id="mod-bldg-name-input"
                  type="text"
                  value={buildingName}
                  onChange={(e) => setBuildingName(e.target.value)}
                  placeholder="เช่น อาคารพลังงานสีเขียว"
                  className="w-full h-9 px-3 rounded-lg bg-[#132032] border border-slate-700 text-white"
                />
              </div>
              <div>
                <label htmlFor="mod-author-input" className="block text-slate-300 mb-1 font-medium">
                  ชื่อผู้สร้าง (Author) *
                </label>
                <input
                  id="mod-author-input"
                  type="text"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="เช่น StudioBangkok"
                  className="w-full h-9 px-3 rounded-lg bg-[#132032] border border-slate-700 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="mod-archetype-select" className="block text-slate-300 mb-1 font-medium">
                  รูปทรงสถาปัตยกรรม 3 มิติ
                </label>
                <select
                  id="mod-archetype-select"
                  value={archetype}
                  onChange={(e) => setArchetype(e.target.value as BuildingArchetype)}
                  className="w-full h-9 px-2.5 rounded-lg bg-[#132032] border border-slate-700 text-white"
                >
                  {ARCHETYPE_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="mod-cost-input" className="block text-slate-300 mb-1 font-medium">
                  ค่าก่อสร้าง (฿)
                </label>
                <input
                  id="mod-cost-input"
                  type="number"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-[#132032] border border-slate-700 text-white font-mono tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="mod-stories-input" className="block text-slate-300 mb-1 font-medium">
                  ความสูงอาคาร (1–30 ชั้น)
                </label>
                <input
                  id="mod-stories-input"
                  type="number"
                  value={stories}
                  onChange={(e) => setStories(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-[#132032] border border-slate-700 text-white font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label htmlFor="mod-power-input" className="block text-slate-300 mb-1 font-medium">
                  ไฟฟ้าสุทธิ (MW, +ผลิต/-ใช้)
                </label>
                <input
                  id="mod-power-input"
                  type="number"
                  value={powerMW}
                  onChange={(e) => setPowerMW(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-[#132032] border border-slate-700 text-white font-mono tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="mod-water-input" className="block text-slate-300 mb-1 font-medium">
                  น้ำประปาสุทธิ (m³, +ผลิต/-ใช้)
                </label>
                <input
                  id="mod-water-input"
                  type="number"
                  value={waterM3}
                  onChange={(e) => setWaterM3(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-[#132032] border border-slate-700 text-white font-mono tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="mod-pop-input" className="block text-slate-300 mb-1 font-medium">
                  ความจุประชากร (คน)
                </label>
                <input
                  id="mod-pop-input"
                  type="number"
                  value={populationCapacity}
                  onChange={(e) => setPopulationCapacity(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-[#132032] border border-slate-700 text-white font-mono tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="mod-jobs-input" className="block text-slate-300 mb-1 font-medium">
                  ตำแหน่งงาน (อัตรา)
                </label>
                <input
                  id="mod-jobs-input"
                  type="number"
                  value={jobsCapacity}
                  onChange={(e) => setJobsCapacity(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-[#132032] border border-slate-700 text-white font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label htmlFor="mod-pollution-input" className="block text-slate-300 mb-1 font-medium">
                  ผลกระทบมลพิษ (-ลด/+เพิ่ม)
                </label>
                <input
                  id="mod-pollution-input"
                  type="number"
                  value={pollutionDelta}
                  onChange={(e) => setPollutionDelta(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-[#132032] border border-slate-700 text-white font-mono tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="mod-landval-input" className="block text-slate-300 mb-1 font-medium">
                  บูสต์มูลค่าที่ดิน
                </label>
                <input
                  id="mod-landval-input"
                  type="number"
                  value={landValueBoost}
                  onChange={(e) => setLandValueBoost(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-[#132032] border border-slate-700 text-white font-mono tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="mod-primary-color" className="block text-slate-300 mb-1 font-medium">
                  สีหลักอาคาร (Primary)
                </label>
                <input
                  id="mod-primary-color"
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-full h-9 rounded-lg bg-[#132032] border border-slate-700 cursor-pointer"
                />
              </div>
              <div>
                <label htmlFor="mod-accent-color" className="block text-slate-300 mb-1 font-medium">
                  สีไฟประดับ (Accent)
                </label>
                <input
                  id="mod-accent-color"
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-full h-9 rounded-lg bg-[#132032] border border-slate-700 cursor-pointer"
                />
              </div>
            </div>

            <div>
              <label htmlFor="mod-desc-input" className="block text-slate-300 mb-1 font-medium">
                คำอธิบายคุณสมบัติ Mod
              </label>
              <input
                id="mod-desc-input"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="เช่น อาคารสำนักงานพลังงานแสงอาทิตย์พร้อมสวนแนวตั้ง"
                className="w-full h-9 px-3 rounded-lg bg-[#132032] border border-slate-700 text-white"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer transition-all active:scale-95 shadow-md"
              >
                บันทึกและติดตั้ง Mod เข้าสู่เมือง
              </button>
            </div>
          </form>
        )}

        {/* Tab 3: JSON Import / Export */}
        {activeTab === 'json' && (
          <div className="space-y-3 text-xs flex-1">
            <p className="text-slate-300">
              วางโค้ด JSON ของ Mod เพื่อเพิ่มอาคารใหม่เข้าสู่ระบบทันที:
            </p>
            {jsonError && (
              <div className="p-2.5 rounded-lg bg-rose-950/90 border border-rose-500/50 text-rose-200" role="alert">
                {jsonError}
              </div>
            )}
            <textarea
              aria-label="โค้ด JSON ของ Mod"
              rows={7}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder={`{\n  "title": "Floating Hydro Plaza Mod",\n  "author": "UrbanModder",\n  "buildingName": "ศูนย์วิจัยพลังงานน้ำ",\n  "archetype": "fusion_dome",\n  "cost": 900,\n  "powerMW": 110,\n  "waterM3": 180,\n  "stories": 7\n}`}
              className="w-full p-3 rounded-xl bg-[#132032] border border-slate-700 font-mono text-sky-200"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleImportJson}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold cursor-pointer transition-all active:scale-95 shadow-md"
              >
                นำเข้า JSON Mod
              </button>
            </div>
          </div>
        )}

        {/* Tab 4: 3D Lot Studio (1x1 to 10x10 Custom Lot Builder) */}
        {activeTab === 'lotstudio' && (
          <LotEditorModal
            isOpen={true}
            onClose={() => setActiveTab('installed')}
            onSaveLot={(newBuildingDef) => {
              const newMod: ModPackage = {
                id: newBuildingDef.id,
                title: newBuildingDef.name,
                description: newBuildingDef.description,
                author: newBuildingDef.modAuthor || 'Lot Studio Player',
                version: newBuildingDef.modVersion || '1.0.0',
                enabled: true,
                building: newBuildingDef,
              };
              onAddCustomMod(newMod);
              setModelSuccess(`บันทึก Custom Lot "${newBuildingDef.name}" เข้าเป็น Mod แพ็กเกจเรียบร้อยแล้ว! พร้อมวางในเมืองและเกิดในโซน RCI`);
              setActiveTab('installed');
            }}
            availableMods={mods
              .filter((m) => m.enabled)
              .map((m) => ({ id: m.id, name: m.title, building: m.building }))}
          />
        )}

        {/* Tab 5: Interactive 3D Model Guide & Sample Loaders */}
        {activeTab === 'guide' && (
          <div className="overflow-y-auto space-y-4 pr-1 text-xs flex-1">
            <div className="p-4 rounded-xl bg-purple-950/40 border border-purple-500/40 space-y-2">
              <h3 className="text-sm font-bold text-purple-200 flex items-center gap-2">
                <span>🚀</span>
                <span>คู่มือขั้นตอนการเตรียมและนำเข้าโมเดล 3D แบบไม่จำกัด</span>
              </h3>
              <p className="text-slate-300 leading-relaxed">
                ระบบรองรับการนำเข้าไฟล์โมเดล 3D ไม่จำกัดจำนวน คละประเภทได้ทั้งอาคาร (Buildings), รถยนต์ (Vehicles) และของตกแต่ง (Props) เพื่อใช้งานบนผังเมืองและใน 3D Lot Studio
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-[#111d2e] border border-slate-800 space-y-1.5">
                <div className="font-bold text-sky-300 text-xs flex items-center gap-1.5">
                  <span>📁</span> 1. รูปแบบไฟล์ที่รองรับ
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  • <strong>.GLB</strong> (Binary glTF) - แนะนำที่สุด! รวมพื้นผิวและอนิเมชันครบในไฟล์เดียว
                  <br />
                  • <strong>.GLTF</strong> (JSON glTF) - อ่านง่าย โครงสร้างสเกลมาตรฐาน
                  <br />
                  • <strong>.OBJ</strong> (Wavefront ASCII) - รองรับโมเดล Low-poly จาก Blender / SketchUp
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#111d2e] border border-slate-800 space-y-1.5">
                <div className="font-bold text-emerald-300 text-xs flex items-center gap-1.5">
                  <span>📐</span> 2. มาตราส่วน & Pivot Point
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  • <strong>1 ช่อง Tile</strong> = 1.0 หน่วยในระบบ 3D = 10 เมตรในเมือง
                  <br />
                  • ตั้งจุดหมุน (Pivot Origin) ไว้ที่<strong>ด้านล่างกึ่งกลาง</strong>ของอาคาร (Y = 0) เพื่อไม่ให้โมเดลจมดิน
                  <br />
                  • ใช้แถบปรับ <strong>Scale (0.1x - 100x)</strong> ขยายหรือย่อขนาดได้ไม่จำกัด
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#111d2e] border border-slate-800 space-y-1.5">
                <div className="font-bold text-amber-300 text-xs flex items-center gap-1.5">
                  <span>🚘</span> 3. ประเภทหมวดหมู่
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  • <strong>อาคาร / สถาปัตยกรรม</strong>: ปลดล็อกในเมนู RCI และสิ่งปลูกสร้าง
                  <br />
                  • <strong>รถยนต์ / ยานพาหนะ</strong>: จะผสมเข้าสู่วิ่งการจราจรบนถนนตามเวลาอัตโนมัติ
                  <br />
                  • <strong>Props / ของตกแต่ง</strong>: ปรากฏในจานสี 3D Lot Studio เพื่อออกแบบแปลงคัสตอม
                </p>
              </div>
            </div>

            {/* One-click Sample Loaders */}
            <div className="p-4 rounded-xl bg-[#111d2e] border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-200 text-xs">
                  ✨ ทดลองโหลดโมเดล 3D ตัวอย่างพร้อมติดตั้งทันที (Sample Models)
                </h4>
                <span className="text-[11px] text-slate-400">คลิกที่ปุ่มเพื่อโหลดเข้าสตูดิโอ 3D</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    handleLoadBuiltInSample('sample_skyscraper');
                    setActiveTab('import3d');
                  }}
                  className="p-3 rounded-xl bg-[#0b131e] hover:bg-slate-800 border border-slate-700 text-left cursor-pointer transition-all active:scale-95 space-y-1"
                >
                  <div className="font-bold text-sky-300 text-xs flex items-center justify-between">
                    <span>🏢 ตึกระฟ้าคริสตัล</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-950 text-sky-200 font-mono">Building</span>
                  </div>
                  <p className="text-[11px] text-slate-400">โมเดลตึกสำนักงานกระจก 12 ชั้นสไตล์ CBD</p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleLoadBuiltInSample('sample_sportscar');
                    setActiveTab('import3d');
                  }}
                  className="p-3 rounded-xl bg-[#0b131e] hover:bg-slate-800 border border-slate-700 text-left cursor-pointer transition-all active:scale-95 space-y-1"
                >
                  <div className="font-bold text-amber-300 text-xs flex items-center justify-between">
                    <span>🏎️ รถสปอร์ต Cyber GT</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950 text-amber-200 font-mono">Vehicle</span>
                  </div>
                  <p className="text-[11px] text-slate-400">โมเดลรถยนต์สปอร์ตที่จะออกวิ่งบนถนนจริง</p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleLoadBuiltInSample('sample_landmark');
                    setActiveTab('import3d');
                  }}
                  className="p-3 rounded-xl bg-[#0b131e] hover:bg-slate-800 border border-slate-700 text-left cursor-pointer transition-all active:scale-95 space-y-1"
                >
                  <div className="font-bold text-purple-300 text-xs flex items-center justify-between">
                    <span>🗽 อนุสาวรีย์ทองคำ</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-950 text-purple-200 font-mono">Prop / Lot</span>
                  </div>
                  <p className="text-[11px] text-slate-400">โมเดลอนุสาวรีย์แลนด์มาร์กสำหรับวางประดับสวน</p>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
