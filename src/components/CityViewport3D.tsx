import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { getAllAvailableBuildings } from '../game/catalog';
import {
  ensureCustomModModelsLoaded,
  subscribeCustomModelsUpdated,
} from '../game/customModels';
import {
  buildCompositeStructureGroup,
  createProceduralBirdMesh,
  createProceduralDeerMesh,
  createProceduralPedestrianMesh,
  createProceduralTerrainBumpTexture,
  createProceduralTerrainDetailTexture,
  createProceduralVehicleMesh,
  createProceduralWaterNormalTexture,
  createRoadWarningMesh,
  createVehicleAgentMesh,
  updateTrafficSignalMaterials,
} from '../game/models3d';
import { computeRoadDragPath, computeZoneDragArea, getBuildingFootprintSize } from '../game/rules';
import {
  BuildingDefinition,
  CitySimulationState,
  DataOverlayMode,
  TileData,
  TimeOfDayPreset,
} from '../game/types';

export interface CameraActionCommand {
  type:
    | 'rotate_left'
    | 'rotate_right'
    | 'reset'
    | 'top_down'
    | 'isometric'
    | 'zoom_in'
    | 'zoom_out'
    | 'tilt_up'
    | 'tilt_down';
  timestamp: number;
  delta?: number;
}

export interface RoadDragPreviewInfo {
  count: number;
  cost: number;
  roadName: string;
  dimensionsLabel?: string;
  isZoneDrag?: boolean;
  streetCount?: number;
}

export interface PendingTouchPlacement {
  mode: 'road' | 'zone' | 'building';
  toolId: string;
  toolName: string;
  tiles: Array<{ x: number; z: number; isAutoStreet?: boolean }>;
  totalCost: number;
  dimensionsLabel?: string;
}

interface CityViewport3DProps {
  simState: CitySimulationState;
  activeToolId: string;
  brushRadius: number;
  buildingRotation: number;
  dataOverlay: DataOverlayMode;
  timeOfDay?: TimeOfDayPreset;
  cameraCommand: CameraActionCommand | null;
  selectedInspectTile?: TileData | null;
  onSelectInspectTile?: (tile: TileData | null) => void;
  onTileInteract: (x: number, z: number, isDrag: boolean) => void;
  onCommitRoadPath?: (roadId: string, pathTiles: Array<{ x: number; z: number }>) => void;
  onCommitZoneArea?: (
    zoneId: string,
    areaTiles: Array<{ x: number; z: number; isAutoStreet?: boolean }>
  ) => void;
  onRoadDragPreviewChange?: (info: RoadDragPreviewInfo | null) => void;
  onCancelRoadDrag?: () => void;
  pendingTouchPlacement?: PendingTouchPlacement | null;
  onPendingTouchPlacementChange?: (pending: PendingTouchPlacement | null) => void;
  onCanvasDragStateChange?: (isDragging: boolean) => void;
  onHoverTileChange: (tile: TileData | null) => void;
  onCameraHeadingChange: (headingDeg: number) => void;
}

// Pre-allocated module-scope scratch objects (Zero GC in render loop)
const _dummyObj = new THREE.Object3D();
const _colorScratch = new THREE.Color();
const _vec3Scratch = new THREE.Vector3();
const _camDirScratch = new THREE.Vector3();
const _camRightScratch = new THREE.Vector3();
const _upVec = new THREE.Vector3(0, 1, 0);

// Pooled particle burst ring buffer
const MAX_PARTICLES = 64;
interface ParticleItem {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
  colorHex: number;
}

interface TrafficAgent {
  mesh: THREE.Group;
  tileX: number;
  tileZ: number;
  targetX: number;
  targetZ: number;
  prevX: number;
  prevZ: number;
  destX: number;
  destZ: number;
  routePath: Array<{ x: number; z: number }>;
  routeIdx: number;
  tilesDriven: number;
  respawnCooldown: number;
  activeTrip: boolean;
  progress: number;
  speed: number;
  laneX: number;
  laneZ: number;
  yaw: number;
}

interface DeerAgent {
  mesh: THREE.Group;
  tileX: number;
  tileZ: number;
  targetX: number;
  targetZ: number;
  progress: number;
  speed: number;
  phaseOffset: number;
}

interface BirdAgent {
  mesh: THREE.Group;
  centerX: number;
  centerZ: number;
  radius: number;
  altitude: number;
  angle: number;
  speed: number;
  flapPhase: number;
}

interface PedestrianAgent {
  mesh: THREE.Group;
  gender: 'male' | 'female';
  tileX: number;
  tileZ: number;
  targetX: number;
  targetZ: number;
  destX: number;
  destZ: number;
  routePath: Array<{ x: number; z: number }>;
  routeIdx: number;
  progress: number;
  speed: number;
  active: boolean;
  respawnCooldown: number;
  legPhase: number;
  sidewalkSide: number;
}

interface RoadWarningItem {
  mesh: THREE.Group;
  baseY: number;
  phase: number;
}

export const CityViewport3D: React.FC<CityViewport3DProps> = ({
  simState,
  activeToolId,
  brushRadius,
  buildingRotation,
  dataOverlay,
  timeOfDay = 'noon',
  cameraCommand,
  selectedInspectTile = null,
  onSelectInspectTile,
  onTileInteract,
  onCommitRoadPath,
  onCommitZoneArea,
  onRoadDragPreviewChange,
  onCancelRoadDrag,
  pendingTouchPlacement = null,
  onPendingTouchPlacementChange,
  onCanvasDragStateChange,
  onHoverTileChange,
  onCameraHeadingChange,
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);

  // Store latest props in refs so React HUD updates never recreate the WebGL scene
  const simStateRef = useRef(simState);
  simStateRef.current = simState;

  const activeToolRef = useRef(activeToolId);
  activeToolRef.current = activeToolId;

  const brushRadiusRef = useRef(brushRadius);
  brushRadiusRef.current = brushRadius;

  const buildingRotationRef = useRef(buildingRotation);
  buildingRotationRef.current = buildingRotation;

  const dataOverlayRef = useRef(dataOverlay);
  dataOverlayRef.current = dataOverlay;

  const timeOfDayRef = useRef<TimeOfDayPreset>(timeOfDay);
  timeOfDayRef.current = timeOfDay;

  const selectedInspectTileRef = useRef(selectedInspectTile);
  selectedInspectTileRef.current = selectedInspectTile;

  const onSelectInspectTileRef = useRef(onSelectInspectTile);
  onSelectInspectTileRef.current = onSelectInspectTile;

  const onTileInteractRef = useRef(onTileInteract);
  onTileInteractRef.current = onTileInteract;

  const onCommitRoadPathRef = useRef(onCommitRoadPath);
  onCommitRoadPathRef.current = onCommitRoadPath;

  const onCommitZoneAreaRef = useRef(onCommitZoneArea);
  onCommitZoneAreaRef.current = onCommitZoneArea;

  const onRoadDragPreviewChangeRef = useRef(onRoadDragPreviewChange);
  onRoadDragPreviewChangeRef.current = onRoadDragPreviewChange;

  const onCancelRoadDragRef = useRef(onCancelRoadDrag);
  onCancelRoadDragRef.current = onCancelRoadDrag;

  const pendingTouchPlacementRef = useRef(pendingTouchPlacement);
  pendingTouchPlacementRef.current = pendingTouchPlacement;

  const onPendingTouchPlacementChangeRef = useRef(onPendingTouchPlacementChange);
  onPendingTouchPlacementChangeRef.current = onPendingTouchPlacementChange;

  const onCanvasDragStateChangeRef = useRef(onCanvasDragStateChange);
  onCanvasDragStateChangeRef.current = onCanvasDragStateChange;

  const onHoverTileChangeRef = useRef(onHoverTileChange);
  onHoverTileChangeRef.current = onHoverTileChange;

  const onCameraHeadingChangeRef = useRef(onCameraHeadingChange);
  onCameraHeadingChangeRef.current = onCameraHeadingChange;

  const controlsRef = useRef<OrbitControls | null>(null);
  const syncCameraControlsTriggerRef = useRef<((toolId: string) => void) | null>(null);
  const syncPendingTouchPreviewTriggerRef = useRef<((pending: PendingTouchPlacement | null) => void) | null>(null);
  const sceneRebuildTriggerRef = useRef<(() => void) | null>(null);
  const applyLightingTriggerRef = useRef<((preset: TimeOfDayPreset) => void) | null>(null);
  const cameraCommandHandlerRef = useRef<((cmd: CameraActionCommand) => void) | null>(null);
  const spawnParticlesRef = useRef<((wx: number, wy: number, wz: number, hex: number, count: number, traumaAmt: number) => void) | null>(null);

  // Sync camera mouse/touch bindings whenever activeToolId changes (works in both God Mode and Mayor Mode)
  useEffect(() => {
    syncCameraControlsTriggerRef.current?.(activeToolId);
  }, [activeToolId]);

  // Sync 3D preview meshes when pendingTouchPlacement or buildingRotation changes
  useEffect(() => {
    syncPendingTouchPreviewTriggerRef.current?.(pendingTouchPlacement);
  }, [pendingTouchPlacement, buildingRotation]);

  // Trigger 3D terrain & building sync whenever tiles, region size, mods, or overlay change
  useEffect(() => {
    void ensureCustomModModelsLoaded(simState.mods);
    sceneRebuildTriggerRef.current?.();
  }, [simState.tiles, simState.config.size, simState.mods, dataOverlay]);

  // Trigger sun/night lighting & time-of-day traffic commute respawn when timeOfDay changes
  useEffect(() => {
    applyLightingTriggerRef.current?.(timeOfDay);
  }, [timeOfDay]);

  useEffect(() => {
    if (cameraCommand) {
      cameraCommandHandlerRef.current?.(cameraCommand);
    }
  }, [cameraCommand]);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    // 1. Software-WebGL detection (from GPU renderer string, never user agent)
    const isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const initialRect = mount.getBoundingClientRect();
    const initW = initialRect.width || window.innerWidth;
    const initH = initialRect.height || window.innerHeight;
    renderer.setSize(initW, initH);
    renderer.domElement.setAttribute('data-testid', 'city-webgl-canvas');
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';
    mount.appendChild(renderer.domElement);

    // 2. Scene, Fog & Studio RoomEnvironment
    const scene = new THREE.Scene();
    const skyHorizonColor = new THREE.Color(0x0b1626);
    scene.background = skyHorizonColor;
    scene.fog = new THREE.FogExp2(0x0b1626, 0.011);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // 3. Camera & 360-degree OrbitControls
    const camera = new THREE.PerspectiveCamera(45, initW / initH, 0.5, 260);
    camera.position.set(22, 24, 26);

    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.enableRotate = true; // Full 360° horizontal rotation
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.screenSpacePanning = false;
    controls.minDistance = 5;
    controls.maxDistance = 110;
    controls.minPolarAngle = 0.08;
    controls.maxPolarAngle = Math.PI * 0.46;
    controls.target.set(0, 0.5, 0);

    const syncCameraControls = (toolId: string) => {
      const isOrbitMode = toolId === 'inspect';
      const isPanMode = toolId === 'camera_pan';
      controls.enabled = true;
      controls.enableRotate = true;
      controls.enableZoom = true;
      controls.enablePan = true;
      controls.touches.ONE = isPanMode
        ? THREE.TOUCH.PAN
        : isOrbitMode
        ? THREE.TOUCH.ROTATE
        : (-1 as any);
      controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
      controls.mouseButtons.LEFT = isPanMode
        ? THREE.MOUSE.PAN
        : isOrbitMode
        ? THREE.MOUSE.ROTATE
        : (-1 as any);
      controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
      controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    };
    syncCameraControlsTriggerRef.current = syncCameraControls;
    syncCameraControls(activeToolRef.current);

    // 4. Realistic Dynamic Sun, Soft Shadows (2048x2048 PCFSoftShadowMap), Hemisphere Fill & Rim Light
    const hemiLight = new THREE.HemisphereLight(0x88d4ff, 0x263547, 0.92);
    hemiLight.position.set(0, 55, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfffbeb, 2.35);
    sunLight.position.set(26, 48, 22);
    sunLight.castShadow = !isSoftwareGl;
    const shadowBound = 38;
    sunLight.shadow.camera.left = -shadowBound;
    sunLight.shadow.camera.right = shadowBound;
    sunLight.shadow.camera.top = shadowBound;
    sunLight.shadow.camera.bottom = -shadowBound;
    sunLight.shadow.camera.near = 2;
    sunLight.shadow.camera.far = 130;
    const shadowMapRes = isSoftwareGl ? 1024 : 2048;
    sunLight.shadow.mapSize.set(shadowMapRes, shadowMapRes);
    sunLight.shadow.radius = 2.5;
    sunLight.shadow.bias = -0.0004;
    sunLight.shadow.normalBias = 0.018;
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.58);
    rimLight.position.set(-30, 24, -26);
    scene.add(rimLight);

    let respawnTrafficByTime: ((preset: TimeOfDayPreset) => void) | null = null;
    let eveningTransitionStartTime = performance.now();

    const applyLightingPreset = (preset: TimeOfDayPreset) => {
      if (preset === 'evening' || preset === 'night') {
        eveningTransitionStartTime = performance.now();
      }

      if (preset === 'morning') {
        // Warm rose-gold morning sunrise from the East with long dramatic shadows
        sunLight.position.set(44, 21, 28);
        sunLight.color.setHex(0xffe4bc);
        sunLight.intensity = 2.2;
        hemiLight.color.setHex(0x93c5fd);
        hemiLight.groundColor.setHex(0x334155);
        hemiLight.intensity = 0.9;
        rimLight.color.setHex(0xfde68a);
        skyHorizonColor.setHex(0x162b46);
        if (scene.fog instanceof THREE.FogExp2) {
          scene.fog.color.setHex(0x162b46);
          scene.fog.density = 0.0095;
        }
      } else if (preset === 'evening') {
        // Golden Hour sunset from the West with warm amber light & long shadows
        sunLight.position.set(-46, 18, 28);
        sunLight.color.setHex(0xfdba74);
        sunLight.intensity = 2.3;
        hemiLight.color.setHex(0xfda4af);
        hemiLight.groundColor.setHex(0x271c35);
        hemiLight.intensity = 0.85;
        rimLight.color.setHex(0x38bdf8);
        skyHorizonColor.setHex(0x1f1630);
        if (scene.fog instanceof THREE.FogExp2) {
          scene.fog.color.setHex(0x1f1630);
          scene.fog.density = 0.0105;
        }
      } else if (preset === 'night') {
        // Deep atmospheric Nighttime with cool moonlight, glowing windows, streetlights, and quieter roads
        sunLight.position.set(-28, 38, -22);
        sunLight.color.setHex(0x60a5fa);
        sunLight.intensity = 0.65;
        hemiLight.color.setHex(0x1e3a8a);
        hemiLight.groundColor.setHex(0x090f1d);
        hemiLight.intensity = 0.42;
        rimLight.color.setHex(0x38bdf8);
        skyHorizonColor.setHex(0x040914);
        if (scene.fog instanceof THREE.FogExp2) {
          scene.fog.color.setHex(0x040914);
          scene.fog.density = 0.0115;
        }
      } else {
        // Crisp natural midday sunlight with clear zenith shadows
        sunLight.position.set(24, 52, 22);
        sunLight.color.setHex(0xfffbeb);
        sunLight.intensity = 2.4;
        hemiLight.color.setHex(0x88d4ff);
        hemiLight.groundColor.setHex(0x243447);
        hemiLight.intensity = 0.95;
        rimLight.color.setHex(0x7dd3fc);
        skyHorizonColor.setHex(0x0c1a2e);
        if (scene.fog instanceof THREE.FogExp2) {
          scene.fog.color.setHex(0x0c1a2e);
          scene.fog.density = 0.009;
        }
      }
      // Instant night illumination for streetlamps & traffic signals
      const isNightOrEve = preset === 'night' || preset === 'evening';
      structuresGroup.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          const mat = child.material;
          const isBuildingMesh = child.parent?.userData?.isBuilding || child.userData?.isBuilding;
          if (!isBuildingMesh && (mat.metalness > 0.4 || mat.roughness < 0.3 || mat.emissive.r > 0 || mat.emissive.g > 0 || mat.emissive.b > 0)) {
            mat.emissiveIntensity = isNightOrEve ? 2.8 : 0.05;
            if (isNightOrEve && mat.emissive.r === 0 && mat.emissive.g === 0 && mat.emissive.b === 0) {
              mat.emissive.setHex(0xfef08a);
            }
          }
        }
      });
      respawnTrafficByTime?.(preset);
    };
    applyLightingTriggerRef.current = applyLightingPreset;

    // 5. Mirror-Clear Reflective Water Surface, Sandy Riverbed & Smooth Horizon Mountains
    const outerSkirtGroup = new THREE.Group();
    scene.add(outerSkirtGroup);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const waterNormalTex = createProceduralWaterNormalTexture(maxAniso);

    const oceanPlaneGeo = new THREE.PlaneGeometry(360, 360, 1, 1);
    oceanPlaneGeo.rotateX(-Math.PI / 2);
    const oceanMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.05,
      metalness: 0.78,
      envMapIntensity: 2.25,
      bumpMap: waterNormalTex,
      bumpScale: 0.022,
      transparent: true,
      opacity: 0.81,
    });
    const waterMesh = new THREE.Mesh(oceanPlaneGeo, oceanMat);
    waterMesh.position.y = 0.02;
    waterMesh.receiveShadow = !isSoftwareGl;
    outerSkirtGroup.add(waterMesh);

    const deepBedGeo = new THREE.PlaneGeometry(360, 360, 1, 1);
    deepBedGeo.rotateX(-Math.PI / 2);
    const deepBedMat = new THREE.MeshStandardMaterial({
      color: 0x0c4a6e,
      roughness: 0.88,
      metalness: 0.05,
    });
    const deepBedMesh = new THREE.Mesh(deepBedGeo, deepBedMat);
    deepBedMesh.position.y = -0.75;
    deepBedMesh.receiveShadow = !isSoftwareGl;
    outerSkirtGroup.add(deepBedMesh);

    // Smooth curved distant scenic mountain ridges around the perimeter horizon
    const mountainGeo = new THREE.ConeGeometry(10, 14, 24);
    const mountainMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.85,
      metalness: 0.06,
      flatShading: false,
    });
    const mountainCount = 24;
    const mountainInstanced = new THREE.InstancedMesh(mountainGeo, mountainMat, mountainCount);
    for (let i = 0; i < mountainCount; i++) {
      const angle = (i / mountainCount) * Math.PI * 2;
      const dist = 68 + (i % 3) * 11;
      _dummyObj.position.set(Math.cos(angle) * dist, 5.5, Math.sin(angle) * dist);
      _dummyObj.rotation.set(0, angle, 0);
      const s = 0.85 + (i % 4) * 0.35;
      _dummyObj.scale.set(s * 1.4, s, s * 1.2);
      _dummyObj.updateMatrix();
      mountainInstanced.setMatrixAt(i, _dummyObj.matrix);
    }
    mountainInstanced.instanceMatrix.needsUpdate = true;
    mountainInstanced.computeBoundingSphere();
    outerSkirtGroup.add(mountainInstanced);

    // 6. Smooth Continuous Terrain Material (with organic grass/rock/sand detail & bump maps)
    const terrainBumpTex = createProceduralTerrainBumpTexture(maxAniso);
    const terrainDetailTex = createProceduralTerrainDetailTexture(maxAniso);

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: terrainDetailTex,
      roughness: 0.76,
      metalness: 0.04,
      bumpMap: terrainBumpTex,
      bumpScale: 0.045,
      flatShading: false,
    });

    let terrainMesh: THREE.Mesh | null = null;
    let gridLinesMesh: THREE.LineSegments | null = null;

    const structuresGroup = new THREE.Group();
    scene.add(structuresGroup);

    const animatedRotors: THREE.Object3D[] = [];
    const animatedCraneJibs: THREE.Object3D[] = [];
    const animatedMixerDrums: THREE.Object3D[] = [];
    const animatedWorkerGroups: THREE.Object3D[] = [];
    const animatedRoadWarnings: RoadWarningItem[] = [];

    // InstancedMesh for 4 distinct Low-Poly Tree Species (Pine, Oak, Palm, Sakura)
    const MAX_TREE_INSTANCES = 3500;
    const trunkGeo = new THREE.CylinderGeometry(0.024, 0.042, 0.22, 6);
    trunkGeo.translate(0, 0.11, 0);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0.05,
      flatShading: true,
    });
    const trunkInstanced = new THREE.InstancedMesh(trunkGeo, trunkMat, MAX_TREE_INSTANCES);
    trunkInstanced.castShadow = !isSoftwareGl;
    trunkInstanced.receiveShadow = !isSoftwareGl;
    scene.add(trunkInstanced);

    // 1) Alpine Pine Canopy (Low-poly faceted hexagonal cone)
    const pineCanopyGeo = new THREE.ConeGeometry(0.15, 0.42, 6);
    pineCanopyGeo.translate(0, 0.31, 0);
    const pineCanopyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.78,
      metalness: 0.05,
      flatShading: true,
    });
    const pineInstanced = new THREE.InstancedMesh(pineCanopyGeo, pineCanopyMat, MAX_TREE_INSTANCES);
    pineInstanced.castShadow = !isSoftwareGl;
    pineInstanced.receiveShadow = !isSoftwareGl;
    scene.add(pineInstanced);

    // 2) Broadleaf Oak Canopy (Low-poly faceted icosahedron crown)
    const oakCanopyGeo = new THREE.IcosahedronGeometry(0.16, 0);
    oakCanopyGeo.translate(0, 0.28, 0);
    const oakCanopyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.75,
      metalness: 0.04,
      flatShading: true,
    });
    const oakInstanced = new THREE.InstancedMesh(oakCanopyGeo, oakCanopyMat, MAX_TREE_INSTANCES);
    oakInstanced.castShadow = !isSoftwareGl;
    oakInstanced.receiveShadow = !isSoftwareGl;
    scene.add(oakInstanced);

    // 3) Tropical Palm Canopy (Flattened low-poly star crown)
    const palmCanopyGeo = new THREE.ConeGeometry(0.21, 0.13, 5);
    palmCanopyGeo.translate(0, 0.27, 0);
    const palmCanopyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.68,
      metalness: 0.06,
      flatShading: true,
    });
    const palmInstanced = new THREE.InstancedMesh(palmCanopyGeo, palmCanopyMat, MAX_TREE_INSTANCES);
    palmInstanced.castShadow = !isSoftwareGl;
    palmInstanced.receiveShadow = !isSoftwareGl;
    scene.add(palmInstanced);

    // 4) Cherry Blossom Sakura Canopy (Low-poly dodecahedron blossom crown)
    const sakuraCanopyGeo = new THREE.DodecahedronGeometry(0.165, 0);
    sakuraCanopyGeo.translate(0, 0.28, 0);
    const sakuraCanopyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.65,
      metalness: 0.05,
      flatShading: true,
    });
    const sakuraInstanced = new THREE.InstancedMesh(sakuraCanopyGeo, sakuraCanopyMat, MAX_TREE_INSTANCES);
    sakuraInstanced.castShadow = !isSoftwareGl;
    sakuraInstanced.receiveShadow = !isSoftwareGl;
    scene.add(sakuraInstanced);

    // 7. Interactive Hover Cursor & Brush Footprint Indicator
    const cursorGeo = new THREE.RingGeometry(0.42, 0.5, 4);
    cursorGeo.rotateX(-Math.PI / 2);
    cursorGeo.rotateY(Math.PI / 4);
    const cursorMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const cursorMesh = new THREE.Mesh(cursorGeo, cursorMat);
    cursorMesh.visible = false;
    scene.add(cursorMesh);

    // 7.1 Interactive Selection Ring for Inspected Building / Tile
    const selectionGeo = new THREE.RingGeometry(0.46, 0.53, 32);
    selectionGeo.rotateX(-Math.PI / 2);
    const selectionMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    const selectionMesh = new THREE.Mesh(selectionGeo, selectionMat);
    selectionMesh.visible = false;
    scene.add(selectionMesh);

    // 7.2 Interactive Road Line Drag Preview Group (shows planned road path before releasing mouse)
    const roadPreviewGroup = new THREE.Group();
    scene.add(roadPreviewGroup);
    const roadPreviewBaseGeo = new THREE.PlaneGeometry(0.92, 0.92, 4, 4);
    roadPreviewBaseGeo.rotateX(-Math.PI / 2);
    const roadPreviewMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.62,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    const roadPreviewBridgeMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.68,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    // SimCity 4 RCI Drag Preview Materials: R = Green (#22c55e), C = Blue (#3b82f6), I = Yellow (#eab308)
    const zonePreviewResMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.66,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    const zonePreviewComMat = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.66,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    const zonePreviewIndMat = new THREE.MeshBasicMaterial({
      color: 0xeab308,
      transparent: true,
      opacity: 0.66,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });

    // 8. Pooled Particle Burst InstancedMesh
    const particleGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const particleMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.4,
      metalness: 0.2,
    });
    const particleInstanced = new THREE.InstancedMesh(particleGeo, particleMat, MAX_PARTICLES);
    particleInstanced.frustumCulled = false;
    scene.add(particleInstanced);

    const particlePool: ParticleItem[] = Array.from({ length: MAX_PARTICLES }, () => ({
      active: false,
      x: 0,
      y: -100,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      maxLife: 0.5,
      scale: 1,
      colorHex: 0x38bdf8,
    }));
    let particleWriteIdx = 0;
    let cameraTrauma = 0;
    let hitstopTimer = 0;

    spawnParticlesRef.current = (wx, wy, wz, hex, count, traumaAmt) => {
      cameraTrauma = Math.min(1, cameraTrauma + traumaAmt);
      if (traumaAmt >= 0.25) {
        hitstopTimer = 0.035;
      }
      for (let i = 0; i < count; i++) {
        const p = particlePool[particleWriteIdx];
        particleWriteIdx = (particleWriteIdx + 1) % MAX_PARTICLES;
        p.active = true;
        p.x = wx + (Math.random() - 0.5) * 0.4;
        p.y = wy + 0.1;
        p.z = wz + (Math.random() - 0.5) * 0.4;
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.8 + Math.random() * 2.2;
        p.vx = Math.cos(angle) * speed;
        p.vy = 1.6 + Math.random() * 2.6;
        p.vz = Math.sin(angle) * speed;
        p.life = 0;
        p.maxLife = 0.35 + Math.random() * 0.3;
        p.scale = 0.7 + Math.random() * 0.8;
        p.colorHex = hex;
      }
    };

    // 9. Traffic Vehicles Pool along road tiles (Right-hand dual-lane intelligent AI)
    const trafficGroup = new THREE.Group();
    scene.add(trafficGroup);
    const MAX_TRAFFIC_CARS = 28;
    const carColors = [0x38bdf8, 0xfacc15, 0xf87171, 0x34d399, 0xf8fafc, 0xa855f7, 0xfb923c];
    const trafficAgents: TrafficAgent[] = [];
    for (let i = 0; i < MAX_TRAFFIC_CARS; i++) {
      const mesh = createProceduralVehicleMesh(carColors[i % carColors.length]);
      mesh.visible = false;
      trafficGroup.add(mesh);
      trafficAgents.push({
        mesh,
        tileX: 0,
        tileZ: 0,
        targetX: 0,
        targetZ: 0,
        prevX: 0,
        prevZ: 0,
        destX: 0,
        destZ: 0,
        routePath: [],
        routeIdx: 0,
        tilesDriven: 0,
        respawnCooldown: (i % 6) * 0.35,
        activeTrip: false,
        progress: 0,
        speed: 1.35 + (i % 4) * 0.22,
        laneX: 0,
        laneZ: 0,
        yaw: 0,
      });
    }

    let cachedRoadCoords: Array<{ x: number; z: number; wy: number }> = [];
    let cachedResFrontRoads: Array<{ x: number; z: number; wy: number }> = [];
    let cachedWorkFrontRoads: Array<{ x: number; z: number; wy: number }> = [];
    let cachedResidentialCount = 0;
    let desiredActiveCarCount = 0;

    const isValidRoadTileAt = (tx: number, tz: number, st: CitySimulationState) => {
      const sz = st.config.size;
      if (tx < 0 || tx >= sz || tz < 0 || tz >= sz) return false;
      const bid = st.tiles[tz * sz + tx]?.buildingId;
      return bid === 'road_avenue' || bid === 'road_highway';
    };

    // BFS shortest path along connected road tiles from (sx, sz) to (dx, dz).
    // If (dx, dz) is unreachable, returns the path to the farthest connected road tile so the car drives a full long route.
    const findRoadPathBFS = (
      sx: number,
      sz: number,
      dx: number,
      dz: number,
      st: CitySimulationState
    ): Array<{ x: number; z: number }> => {
      const size = st.config.size;
      const startKey = sz * size + sx;
      const destKey = dz * size + dx;

      const visited = new Int32Array(size * size);
      visited.fill(-1);
      const distMap = new Int16Array(size * size);
      distMap.fill(-1);

      const queue: number[] = [startKey];
      visited[startKey] = startKey;
      distMap[startKey] = 0;

      let farthestKey = startKey;
      let maxDist = 0;
      let head = 0;

      const dirs: Array<[number, number]> = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];

      while (head < queue.length) {
        const currKey = queue[head++];
        const currDist = distMap[currKey];
        if (currDist > maxDist) {
          maxDist = currDist;
          farthestKey = currKey;
        }
        if (currKey === destKey && currDist >= 1) {
          farthestKey = destKey;
          break;
        }

        const cx = currKey % size;
        const cz = Math.floor(currKey / size);

        for (let d = 0; d < 4; d++) {
          const nx = cx + dirs[d][0];
          const nz = cz + dirs[d][1];
          if (nx < 0 || nx >= size || nz < 0 || nz >= size) continue;
          const nKey = nz * size + nx;
          if (visited[nKey] !== -1) continue;
          const bid = st.tiles[nKey]?.buildingId;
          if (bid !== 'road_avenue' && bid !== 'road_highway') continue;

          visited[nKey] = currKey;
          distMap[nKey] = currDist + 1;
          queue.push(nKey);
        }
      }

      const targetKey = visited[destKey] !== -1 && destKey !== startKey ? destKey : farthestKey;
      if (targetKey === startKey) {
        return [{ x: sx, z: sz }];
      }

      const revPath: Array<{ x: number; z: number }> = [];
      let trace = targetKey;
      let guard = size * size + 2;
      while (trace !== startKey && guard-- > 0) {
        revPath.push({ x: trace % size, z: Math.floor(trace / size) });
        trace = visited[trace];
      }
      revPath.push({ x: sx, z: sz });
      revPath.reverse();
      return revPath;
    };

    // Dispatches a single commuter vehicle on a continuous trip from Origin (Home) to Destination (Workplace)
    const dispatchSingleVehicleTrip = (
      agent: TrafficAgent,
      index: number,
      preset: TimeOfDayPreset,
      st: CitySimulationState
    ) => {
      if (cachedRoadCoords.length < 2) {
        agent.activeTrip = false;
        agent.mesh.visible = false;
        return;
      }

      const size = st.config.size;
      const half = size / 2;

      // Choose Origin Pool (Morning/Day: Residential homes -> Workplace; Evening: Workplace -> Residential homes)
      let originPool = cachedRoadCoords;
      let destPool = cachedRoadCoords;

      if (preset === 'evening') {
        if (cachedWorkFrontRoads.length > 0) originPool = cachedWorkFrontRoads;
        else if (cachedResFrontRoads.length > 0) originPool = cachedResFrontRoads;

        if (cachedResFrontRoads.length > 0) destPool = cachedResFrontRoads;
        else if (cachedWorkFrontRoads.length > 0) destPool = cachedWorkFrontRoads;
      } else {
        if (cachedResFrontRoads.length > 0) originPool = cachedResFrontRoads;
        else if (cachedWorkFrontRoads.length > 0) originPool = cachedWorkFrontRoads;

        if (cachedWorkFrontRoads.length > 0) destPool = cachedWorkFrontRoads;
        else if (cachedResFrontRoads.length > 0) destPool = cachedResFrontRoads;
      }

      const startIdx = (index * 5 + Math.floor(Math.random() * originPool.length)) % originPool.length;
      const startNode = originPool[startIdx];

      // Sequential spawn check: verify start tile is not currently occupied by another active car
      for (let c = 0; c < trafficAgents.length; c++) {
        if (c === index) continue;
        const other = trafficAgents[c];
        if (other.activeTrip && other.mesh.visible) {
          if (other.tileX === startNode.x && other.tileZ === startNode.z && other.progress < 0.48) {
            agent.activeTrip = false;
            agent.mesh.visible = false;
            agent.respawnCooldown = 0.4 + Math.random() * 0.4;
            return;
          }
        }
      }

      // Pick a destination node far enough from startNode so the car drives a long continuous route
      let bestDest = destPool[(index * 7 + 3) % destPool.length];
      let bestDist = -1;
      const sampleCount = Math.min(destPool.length, 10);
      for (let s = 0; s < sampleCount; s++) {
        const candidate = destPool[(index * 7 + s * 3 + Math.floor(Math.random() * destPool.length)) % destPool.length];
        const dist = Math.abs(candidate.x - startNode.x) + Math.abs(candidate.z - startNode.z);
        if (dist > bestDist) {
          bestDist = dist;
          bestDest = candidate;
        }
      }

      // If destination is too close to origin and there are other roads, check cachedRoadCoords for a farther endpoint
      if (bestDist < 3 && cachedRoadCoords.length > 2) {
        for (let s = 0; s < Math.min(cachedRoadCoords.length, 12); s++) {
          const candidate = cachedRoadCoords[(index * 11 + s * 5) % cachedRoadCoords.length];
          const dist = Math.abs(candidate.x - startNode.x) + Math.abs(candidate.z - startNode.z);
          if (dist > bestDist) {
            bestDist = dist;
            bestDest = candidate;
          }
        }
      }

      const path = findRoadPathBFS(startNode.x, startNode.z, bestDest.x, bestDest.z, st);
      if (path.length < 2) {
        agent.activeTrip = false;
        agent.mesh.visible = false;
        agent.respawnCooldown = 1.5;
        return;
      }

      const firstStep = path[0];
      const secondStep = path[1];
      const finalStep = path[path.length - 1];

      agent.tileX = firstStep.x;
      agent.tileZ = firstStep.z;
      agent.prevX = firstStep.x;
      agent.prevZ = firstStep.z;
      agent.targetX = secondStep.x;
      agent.targetZ = secondStep.z;
      agent.destX = finalStep.x;
      agent.destZ = finalStep.z;
      agent.routePath = path;
      agent.routeIdx = 1;
      agent.tilesDriven = 0;
      agent.progress = 0;
      agent.activeTrip = true;
      agent.respawnCooldown = 0;

      const dx = Math.sign(secondStep.x - firstStep.x);
      const dz = Math.sign(secondStep.z - firstStep.z);
      const startTile = st.tiles[firstStep.z * size + firstStep.x];
      const isHwyStart = startTile?.buildingId === 'road_highway';
      const initLaneOff = isHwyStart ? 0.2 : 0.135;
      agent.laneX = -dz * initLaneOff;
      agent.laneZ = dx * initLaneOff;
      agent.yaw = Math.atan2(dx, dz);

      if (startTile) {
        const p0 = getTileWorldPos(firstStep.x, firstStep.z, startTile.elevation, size);
        const cx = p0.wx + agent.laneX;
        const cz = p0.wz + agent.laneZ;
        const sampledHere = sampleSmoothTerrain(cx + half, cz + half, st);
        const roadSurfaceY = startTile.isBridge
          ? Math.max(0.02, sampledHere.wy) + 0.245
          : Math.max(0.02, sampledHere.wy) + 0.018;
        agent.mesh.position.set(cx, roadSurfaceY, cz);
        agent.mesh.rotation.set(0, agent.yaw, 0);
      }

      agent.mesh.visible = true;
    };

    // 9.5 Wildlife Ecosystem Pool (Forest Deer & Circling Flocking Birds)
    const wildlifeGroup = new THREE.Group();
    scene.add(wildlifeGroup);
    const MAX_DEER_AGENTS = 22;
    const deerAgents: DeerAgent[] = [];
    for (let i = 0; i < MAX_DEER_AGENTS; i++) {
      const mesh = createProceduralDeerMesh(i);
      mesh.visible = false;
      wildlifeGroup.add(mesh);
      deerAgents.push({
        mesh,
        tileX: 0,
        tileZ: 0,
        targetX: 0,
        targetZ: 0,
        progress: 0,
        speed: 0.45 + (i % 3) * 0.14,
        phaseOffset: i * 1.3,
      });
    }

    const MAX_BIRD_AGENTS = 18;
    const birdColors = [0xf8fafc, 0xe0f2fe, 0xfef08a, 0x7dd3fc];
    const birdAgents: BirdAgent[] = [];
    for (let i = 0; i < MAX_BIRD_AGENTS; i++) {
      const mesh = createProceduralBirdMesh(birdColors[i % birdColors.length]);
      mesh.visible = false;
      wildlifeGroup.add(mesh);
      birdAgents.push({
        mesh,
        centerX: 0,
        centerZ: 0,
        radius: 2.2 + (i % 4) * 0.8,
        altitude: 2.8 + (i % 3) * 0.7,
        angle: (i / MAX_BIRD_AGENTS) * Math.PI * 2,
        speed: 0.85 + (i % 3) * 0.22,
        flapPhase: i * 0.9,
      });
    }

    // 9.6 Pedestrian Citizens Pool (Male & Female walking on sidewalks & crossing zebra crosswalks)
    const pedestriansGroup = new THREE.Group();
    scene.add(pedestriansGroup);
    const MAX_PEDESTRIANS = 20;
    const pedestrianAgents: PedestrianAgent[] = [];
    for (let i = 0; i < MAX_PEDESTRIANS; i++) {
      const gender: 'male' | 'female' = i % 2 === 0 ? 'male' : 'female';
      const mesh = createProceduralPedestrianMesh(gender, i);
      mesh.visible = false;
      pedestriansGroup.add(mesh);
      pedestrianAgents.push({
        mesh,
        gender,
        tileX: 0,
        tileZ: 0,
        targetX: 0,
        targetZ: 0,
        destX: 0,
        destZ: 0,
        routePath: [],
        routeIdx: 0,
        progress: 0,
        speed: 0.58 + (i % 3) * 0.12,
        active: false,
        respawnCooldown: i * 0.25,
        legPhase: i * 1.2,
        sidewalkSide: i % 2 === 0 ? 1 : -1,
      });
    }

    const dispatchSinglePedestrianTrip = (
      agent: PedestrianAgent,
      index: number,
      st: CitySimulationState
    ) => {
      if (cachedRoadCoords.length < 2) {
        agent.active = false;
        agent.mesh.visible = false;
        return;
      }
      let originPool = cachedResFrontRoads.length > 0 ? cachedResFrontRoads : cachedRoadCoords;
      let destPool = cachedWorkFrontRoads.length > 0 ? cachedWorkFrontRoads : cachedRoadCoords;

      const startNode = originPool[(index * 3 + Math.floor(Math.random() * originPool.length)) % originPool.length];
      const destNode = destPool[(index * 5 + Math.floor(Math.random() * destPool.length)) % destPool.length];

      const path = findRoadPathBFS(startNode.x, startNode.z, destNode.x, destNode.z, st);
      if (path.length < 2) {
        agent.active = false;
        agent.mesh.visible = false;
        agent.respawnCooldown = 1.2;
        return;
      }

      agent.tileX = path[0].x;
      agent.tileZ = path[0].z;
      agent.targetX = path[1].x;
      agent.targetZ = path[1].z;
      agent.destX = path[path.length - 1].x;
      agent.destZ = path[path.length - 1].z;
      agent.routePath = path;
      agent.routeIdx = 1;
      agent.progress = 0;
      agent.active = true;
      agent.mesh.visible = true;
    };

    // Helper: Smooth continuous heightmap interpolation at continuous tile coords (fx, fz) in [0, size]
    const sampleSmoothTerrain = (fx: number, fz: number, st: CitySimulationState) => {
      const size = st.config.size;
      const cx = fx - 0.5;
      const cz = fz - 0.5;
      const baseX = Math.floor(cx);
      const baseZ = Math.floor(cz);

      let sumElev = 0;
      let sumWater = 0;
      let sumCliff = 0;
      let totalWeight = 0;

      for (let dz = -1; dz <= 2; dz++) {
        const tz = Math.max(0, Math.min(size - 1, baseZ + dz));
        const distZ = cz - (baseZ + dz);
        for (let dx = -1; dx <= 2; dx++) {
          const tx = Math.max(0, Math.min(size - 1, baseX + dx));
          const distX = cx - (baseX + dx);
          const distSq = distX * distX + distZ * distZ;
          // Smooth Gaussian kernel for continuous curved hills, valleys, and riverbanks
          const w = Math.exp(-distSq * 1.45);
          const t = st.tiles[tz * size + tx];
          sumElev += t.elevation * w;
          if (t.isWater) sumWater += w;
          if (t.isCliff) sumCliff += w;
          totalWeight += w;
        }
      }

      const smoothElev = totalWeight > 0 ? sumElev / totalWeight : 2.0;
      const waterWeight = totalWeight > 0 ? sumWater / totalWeight : 0;
      const cliffWeight = totalWeight > 0 ? sumCliff / totalWeight : 0;

      // Convert smoothed elevation (meters) into 3D world Y with gentle shoreline curve
      const wy =
        smoothElev < 0
          ? smoothElev * 0.052
          : smoothElev * 0.085;

      return { wy, smoothElev, waterWeight, cliffWeight };
    };

    // Helper: Convert tile (x, z) and elevation (meters) to 3D world coords on the smooth curved surface
    const getTileWorldPos = (x: number, z: number, elevMeters: number, size: number) => {
      const half = size / 2;
      const wx = x - half + 0.5;
      const wz = z - half + 0.5;
      const sampled = sampleSmoothTerrain(x + 0.5, z + 0.5, simStateRef.current);
      const wy = Math.max(0, sampled ? sampled.wy : elevMeters * 0.085);
      return { wx, wy, wz };
    };

    //Scratch colors for smooth multi-biome blending
    const _cRiverbed = new THREE.Color(0x576574);
    const _cBeachSand = new THREE.Color(0xe6d5b8);
    const _cWarmSand = new THREE.Color(0xd4be94);
    const _cLushGrass = new THREE.Color(0x28723e);
    const _cDeepGrass = new THREE.Color(0x1e5e32);
    const _cHighlandGrass = new THREE.Color(0x3f6a24);
    const _cMountainRock = new THREE.Color(0x6e6a66);
    const _cAlpineSlate = new THREE.Color(0x7c8694);
    const _cSnowPeak = new THREE.Color(0xeef2f6);

    // Rebuild 3D Smooth Curved Terrain, Trees & Structures from current simulation state
    const rebuildSceneGeometry = () => {
      const st = simStateRef.current;
      const size = st.config.size;
      const half = size / 2;
      const overlay = dataOverlayRef.current;

      // Dispose previous terrain mesh
      if (terrainMesh) {
        scene.remove(terrainMesh);
        terrainMesh.geometry.dispose();
        terrainMesh = null;
      }
      if (gridLinesMesh) {
        scene.remove(gridLinesMesh);
        gridLinesMesh.geometry.dispose();
        gridLinesMesh = null;
      }

      // Build continuous subdivided smooth heightmap mesh (2x resolution per tile = zero blocky steps)
      const tileCount = size * size;
      const subdiv = 2;
      const segs = size * subdiv;
      const stride = segs + 1;

      const geo = new THREE.BufferGeometry();
      const positions: number[] = [];
      const colors: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];
      const gridLinePoints: number[] = [];

      // Pre-sample smooth heightmap grid (stride x stride)
      const heightGrid = new Float32Array(stride * stride);
      const elevGrid = new Float32Array(stride * stride);
      const waterGrid = new Float32Array(stride * stride);
      const cliffGrid = new Float32Array(stride * stride);

      for (let gz = 0; gz <= segs; gz++) {
        const fz = gz / subdiv;
        for (let gx = 0; gx <= segs; gx++) {
          const fx = gx / subdiv;
          const idx = gz * stride + gx;
          const s = sampleSmoothTerrain(fx, fz, st);
          heightGrid[idx] = s.wy;
          elevGrid[idx] = s.smoothElev;
          waterGrid[idx] = s.waterWeight;
          cliffGrid[idx] = s.cliffWeight;
        }
      }

      // Emit shared surface vertices with smooth slope & elevation biome coloring
      for (let gz = 0; gz <= segs; gz++) {
        const fz = gz / subdiv;
        const wz = fz - half;
        const tz = Math.min(size - 1, Math.max(0, Math.floor(fz)));
        for (let gx = 0; gx <= segs; gx++) {
          const fx = gx / subdiv;
          const wx = fx - half;
          const tx = Math.min(size - 1, Math.max(0, Math.floor(fx)));
          const idx = gz * stride + gx;

          const wy = heightGrid[idx];
          const smoothElev = elevGrid[idx];
          const waterProx = waterGrid[idx];
          const cliffProx = cliffGrid[idx];

          // Compute local slope from adjacent grid vertices for automatic rock cliff shading
          const hL = heightGrid[gz * stride + Math.max(0, gx - 1)];
          const hR = heightGrid[gz * stride + Math.min(segs, gx + 1)];
          const hU = heightGrid[Math.max(0, gz - 1) * stride + gx];
          const hD = heightGrid[Math.min(segs, gz + 1) * stride + gx];
          const localSlope = Math.hypot(hR - hL, hD - hU);

          const tile = st.tiles[tz * size + tx];

          if (overlay === 'power') {
            _colorScratch.setHex(tile.powered ? 0xfacc15 : tile.isWater ? 0x0c4a6e : 0x334155);
          } else if (overlay === 'water') {
            _colorScratch.setHex(tile.watered ? 0x38bdf8 : tile.isWater ? 0x0284c7 : 0x334155);
          } else if (overlay === 'pollution') {
            const pNorm = Math.min(1, tile.pollution / 60);
            _colorScratch.setHex(0x10b981).lerp(new THREE.Color(0xef4444), pNorm);
          } else if (overlay === 'land_value') {
            const lvNorm = Math.min(1, tile.landValue / 90);
            _colorScratch.setHex(0x475569).lerp(new THREE.Color(0x2dd4bf), lvNorm);
          } else {
            // Natural continuous biome gradient: Riverbed -> Golden Sandy Beach -> Meadow Grass -> Rock Cliff -> Snow Peak
            const organicWave = Math.sin(wx * 0.45 + Math.cos(wz * 0.45)) * 0.5 + 0.5;

            if (smoothElev < -0.25) {
              // Underwater riverbed / seabed (visible through crystal translucent water)
              const depthT = Math.min(1, Math.max(0, (smoothElev + 5.5) / 5.25));
              _colorScratch.copy(_cRiverbed).lerp(_cWarmSand, depthT * 0.85);
            } else if (smoothElev < 1.55 || (waterProx > 0.14 && smoothElev < 3.1)) {
              // Golden sandy beach shoreline along rivers and lakes
              const grassBlend = Math.min(
                1,
                Math.max(0, (smoothElev - 0.9) / 1.8) * (1 - Math.min(1, waterProx * 1.4))
              );
              _colorScratch.copy(_cBeachSand).lerp(_cWarmSand, organicWave * 0.45);
              _colorScratch.lerp(_cLushGrass, grassBlend);
            } else if (smoothElev < 14.0) {
              // Lush lowland & rolling hill meadow grass
              const altT = Math.min(1, Math.max(0, (smoothElev - 1.55) / 12.45));
              _colorScratch.copy(_cLushGrass).lerp(_cDeepGrass, organicWave * 0.52);
              _colorScratch.lerp(_cHighlandGrass, altT * 0.72);
            } else if (smoothElev < 26.5) {
              // Mountain highland transitioning to granite rock
              const mountT = Math.min(1, Math.max(0, (smoothElev - 14.0) / 12.5));
              _colorScratch.copy(_cHighlandGrass).lerp(_cMountainRock, Math.min(1, mountT * 1.15));
            } else {
              // High alpine rock and snow-dusted summit
              const snowT = Math.min(1, Math.max(0, (smoothElev - 26.5) / 14.0));
              _colorScratch.copy(_cAlpineSlate).lerp(_cSnowPeak, snowT);
            }

            // Steep slopes and cliffs naturally expose striated granite rock
            const rockBlend = Math.min(
              1,
              Math.max(0, (localSlope - 0.095) * 4.2) + cliffProx * 0.55
            );
            if (rockBlend > 0.01 && smoothElev >= 0.8) {
              const targetRock = smoothElev > 22 ? _cAlpineSlate : _cMountainRock;
              _colorScratch.lerp(targetRock, Math.min(0.92, rockBlend));
            }
          }

          positions.push(wx, wy, wz);
          colors.push(_colorScratch.r, _colorScratch.g, _colorScratch.b);
          uvs.push(fx * 0.5, fz * 0.5);
        }
      }

      // Connect continuous shared-vertex surface triangles
      for (let gz = 0; gz < segs; gz++) {
        for (let gx = 0; gx < segs; gx++) {
          const i00 = gz * stride + gx;
          const i10 = i00 + 1;
          const i01 = (gz + 1) * stride + gx;
          const i11 = i01 + 1;
          indices.push(i00, i01, i10);
          indices.push(i10, i01, i11);
        }
      }

      // Add smooth outer geological earth skirt around the 4 boundaries of the region
      let skirtVertOffset = stride * stride;
      const pushSkirtQuad = (
        x0: number, y0: number, z0: number,
        x1: number, y1: number, z1: number,
        r: number, g: number, b: number
      ) => {
        const yBot = -0.78;
        positions.push(x0, y0, z0, x0, yBot, z0, x1, yBot, z1, x1, y0, z1);
        colors.push(r, g, b, r * 0.7, g * 0.7, b * 0.7, r * 0.7, g * 0.7, b * 0.7, r, g, b);
        uvs.push(0, 0, 0, 1, 1, 1, 1, 0);
        indices.push(
          skirtVertOffset, skirtVertOffset + 1, skirtVertOffset + 2,
          skirtVertOffset, skirtVertOffset + 2, skirtVertOffset + 3
        );
        skirtVertOffset += 4;
      };

      const sr = 0.34, sg = 0.32, sb = 0.30;
      for (let gx = 0; gx < segs; gx++) {
        const x0 = gx / subdiv - half;
        const x1 = (gx + 1) / subdiv - half;
        // North edge (gz = 0)
        pushSkirtQuad(x1, heightGrid[gx + 1], -half, x0, heightGrid[gx], -half, sr, sg, sb);
        // South edge (gz = segs)
        pushSkirtQuad(
          x0, heightGrid[segs * stride + gx], half,
          x1, heightGrid[segs * stride + gx + 1], half,
          sr, sg, sb
        );
      }
      for (let gz = 0; gz < segs; gz++) {
        const z0 = gz / subdiv - half;
        const z1 = (gz + 1) / subdiv - half;
        // West edge (gx = 0)
        pushSkirtQuad(-half, heightGrid[gz * stride], z0, -half, heightGrid[(gz + 1) * stride], z1, sr * 0.9, sg * 0.9, sb * 0.9);
        // East edge (gx = segs)
        pushSkirtQuad(half, heightGrid[(gz + 1) * stride + segs], z1, half, heightGrid[gz * stride + segs], z0, sr * 0.9, sg * 0.9, sb * 0.9);
      }

      // Subtle curved surface grid lines that hug the smooth terrain (skip road tiles so asphalt is 100% seamless)
      for (let z = 0; z < size; z++) {
        for (let x = 0; x < size; x++) {
          const tile = st.tiles[z * size + x];
          if (tile.isWater || tile.buildingId === 'road_avenue' || tile.buildingId === 'road_highway') continue;
          const gz = z * subdiv;
          const gx = x * subdiv;
          const y00 = heightGrid[gz * stride + gx] + 0.012;
          const y10 = heightGrid[gz * stride + (gx + subdiv)] + 0.012;
          const y11 = heightGrid[(gz + subdiv) * stride + (gx + subdiv)] + 0.012;
          const xMin = x - half;
          const xMax = xMin + 1;
          const zMin = z - half;
          const zMax = zMin + 1;
          gridLinePoints.push(
            xMin, y00, zMin, xMax, y10, zMin,
            xMax, y10, zMin, xMax, y11, zMax
          );
        }
      }

      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      geo.computeBoundingSphere();

      terrainMesh = new THREE.Mesh(geo, terrainMat);
      terrainMesh.castShadow = !isSoftwareGl;
      terrainMesh.receiveShadow = !isSoftwareGl;
      terrainMesh.name = 'playable_terrain';
      scene.add(terrainMesh);

      // Subtle architectural grid lines
      const gridGeo = new THREE.BufferGeometry();
      gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridLinePoints, 3));
      const gridMat = new THREE.LineBasicMaterial({
        color: 0xcbd5e1,
        transparent: true,
        opacity: 0.075,
      });
      gridLinesMesh = new THREE.LineSegments(gridGeo, gridMat);
      scene.add(gridLinesMesh);

      // Update InstancedMesh for 4 Low-Poly Tree Species (Pine, Oak, Palm, Sakura)
      let trunkIdx = 0;
      let pineIdx = 0;
      let oakIdx = 0;
      let palmIdx = 0;
      let sakuraIdx = 0;

      const forestTileCoords: Array<{ x: number; z: number; wy: number }> = [];
      const waterAndForestCoords: Array<{ x: number; z: number; wy: number }> = [];

      for (let i = 0; i < tileCount; i++) {
        const tile = st.tiles[i];
        const { wx, wy, wz } = getTileWorldPos(tile.x, tile.z, tile.elevation, size);

        if (tile.isWater) {
          waterAndForestCoords.push({ x: tile.x, z: tile.z, wy: 0.05 });
        }

        if (tile.trees > 0 && !tile.buildingId && !tile.isWater) {
          forestTileCoords.push({ x: tile.x, z: tile.z, wy });
          waterAndForestCoords.push({ x: tile.x, z: tile.z, wy });

          const species =
            tile.treeType ||
            (tile.elevation < 2.3
              ? 'palm'
              : tile.elevation > 9.5
              ? 'pine'
              : (tile.x + tile.z) % 4 === 0
              ? 'sakura'
              : 'oak');

          for (let t = 0; t < tile.trees && trunkIdx < MAX_TREE_INSTANCES; t++) {
            const angle = (t / tile.trees) * Math.PI * 2 + (tile.x * 0.7 + tile.z * 1.3);
            const rad = tile.trees === 1 ? 0 : 0.24;
            const tx = wx + Math.cos(angle) * rad;
            const tz = wz + Math.sin(angle) * rad;
            // Sample exact curved terrain height at each individual tree's world position (tx, tz)
            const treeWy = Math.max(0.02, sampleSmoothTerrain(tx + half, tz + half, st).wy);
            const scale = 0.85 + ((tile.x * 13 + tile.z * 7 + t * 5) % 30) * 0.01;

            _dummyObj.position.set(tx, treeWy, tz);
            _dummyObj.rotation.set(species === 'palm' ? 0.08 : 0, angle, 0);
            _dummyObj.scale.set(scale, scale, scale);
            _dummyObj.updateMatrix();

            trunkInstanced.setMatrixAt(trunkIdx, _dummyObj.matrix);
            _colorScratch.setHex(species === 'sakura' ? 0x4a2c2a : species === 'palm' ? 0x92400e : 0x78350f);
            trunkInstanced.setColorAt(trunkIdx, _colorScratch);
            trunkIdx++;

            const tint = (tile.x + tile.z + t) % 3;
            if (species === 'pine' && pineIdx < MAX_TREE_INSTANCES) {
              pineInstanced.setMatrixAt(pineIdx, _dummyObj.matrix);
              _colorScratch.setHex(tint === 0 ? 0x065f46 : tint === 1 ? 0x047857 : 0x115e59);
              pineInstanced.setColorAt(pineIdx, _colorScratch);
              pineIdx++;
            } else if (species === 'palm' && palmIdx < MAX_TREE_INSTANCES) {
              palmInstanced.setMatrixAt(palmIdx, _dummyObj.matrix);
              _colorScratch.setHex(tint === 0 ? 0x65a30d : tint === 1 ? 0x4d7c0f : 0x16a34a);
              palmInstanced.setColorAt(palmIdx, _colorScratch);
              palmIdx++;
            } else if (species === 'sakura' && sakuraIdx < MAX_TREE_INSTANCES) {
              sakuraInstanced.setMatrixAt(sakuraIdx, _dummyObj.matrix);
              _colorScratch.setHex(tint === 0 ? 0xf472b6 : tint === 1 ? 0xf9a8d4 : 0xec4899);
              sakuraInstanced.setColorAt(sakuraIdx, _colorScratch);
              sakuraIdx++;
            } else if (oakIdx < MAX_TREE_INSTANCES) {
              oakInstanced.setMatrixAt(oakIdx, _dummyObj.matrix);
              _colorScratch.setHex(tint === 0 ? 0x15803d : tint === 1 ? 0x166534 : 0x22c55e);
              oakInstanced.setColorAt(oakIdx, _colorScratch);
              oakIdx++;
            }
          }
        }
      }

      trunkInstanced.count = trunkIdx;
      pineInstanced.count = pineIdx;
      oakInstanced.count = oakIdx;
      palmInstanced.count = palmIdx;
      sakuraInstanced.count = sakuraIdx;

      for (const inst of [trunkInstanced, pineInstanced, oakInstanced, palmInstanced, sakuraInstanced]) {
        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
        inst.computeBoundingSphere();
      }

      // Update Composite 3D Buildings, SimCity 4 Empty Lots, Construction Sites & Roads
      while (structuresGroup.children.length > 0) {
        structuresGroup.remove(structuresGroup.children[0]);
      }
      animatedRotors.length = 0;
      animatedCraneJibs.length = 0;
      animatedMixerDrums.length = 0;
      animatedWorkerGroups.length = 0;
      animatedRoadWarnings.length = 0;

      const catalog = getAllAvailableBuildings(st.mods);
      const bMap = new Map<string, BuildingDefinition>();
      for (const b of catalog) bMap.set(b.id, b);

      const roadCoords: Array<{ x: number; z: number; wy: number }> = [];
      const resFrontRoads: Array<{ x: number; z: number; wy: number }> = [];
      const workFrontRoads: Array<{ x: number; z: number; wy: number }> = [];
      let residentialBuildingCount = 0;
      let workBuildingCount = 0;

      // Helper to check if a building is Residential vs Office/Factory
      const isResidentialBuilding = (bDef: BuildingDefinition) =>
        bDef.archetype === 'residential_low' ||
        bDef.archetype === 'residential_high' ||
        bDef.archetype === 'arcology_tower' ||
        bDef.populationCapacity > 0;

      const isWorkplaceBuilding = (bDef: BuildingDefinition) =>
        bDef.archetype === 'commercial_low' ||
        bDef.archetype === 'commercial_high' ||
        bDef.archetype === 'industrial' ||
        bDef.jobsCapacity > 0;

      for (let z = 0; z < size; z++) {
        for (let x = 0; x < size; x++) {
          const tile = st.tiles[z * size + x];
          if (!tile.buildingId) continue;
          const b = bMap.get(tile.buildingId);
          if (!b) continue;
          // Avoid rendering duplicate building meshes on covered secondary tiles of multi-tile lots
          const isMultiTileSecondary =
            tile.isBuildingOrigin === false ||
            (tile.buildingOriginX !== undefined &&
              (tile.buildingOriginX !== x || tile.buildingOriginZ !== z));

          if (isMultiTileSecondary) {
            continue;
          }

          const isConstructedOrSite = (tile.constructionProgress ?? 100) > 0;
          if (isConstructedOrSite) {
            if (isResidentialBuilding(b)) {
              residentialBuildingCount++;
            } else if (isWorkplaceBuilding(b)) {
              workBuildingCount++;
            }
          }

          const isRoadTile = (tx: number, tz: number) => {
            if (tx < 0 || tx >= size || tz < 0 || tz >= size) return false;
            const id = st.tiles[tz * size + tx].buildingId;
            return id === 'road_avenue' || id === 'road_highway';
          };

          const neighbors = {
            n: isRoadTile(x, z - 1),
            s: isRoadTile(x, z + 1),
            e: isRoadTile(x + 1, z),
            w: isRoadTile(x - 1, z),
          };

          const { effWidth, effDepth } = getBuildingFootprintSize(b, tile.buildingRotation);
          const { wx, wy, wz } = getTileWorldPos(x, z, tile.elevation, size);
          const baseWy = tile.isWater ? 0.02 : wy;
          const sampleLocalHeight = (lx: number, lz: number) =>
            Math.max(0, sampleSmoothTerrain(x + 0.5 + lx, z + 0.5 + lz, st).wy) - baseWy;

          const group = buildCompositeStructureGroup(b, tile, neighbors, sampleLocalHeight);
          // Center single lot or building group over its effWidth x effDepth tile footprint
          const posX = wx + (effWidth - 1) * 0.5;
          const posZ = wz + (effDepth - 1) * 0.5;
          group.position.set(posX, baseWy, posZ);
          const isEmptyLot = b.isZone && !b.customModel && (tile.constructionProgress ?? 100) <= 0;
          if (b.archetype !== 'road' && b.archetype !== 'highway' && !isEmptyLot) {
            group.rotation.y = (tile.buildingRotation || 0) * (Math.PI / 2);
          }

          // 3D Floating Warning Billboard for RCI structures disconnected from road network
          if (b.archetype !== 'road' && b.archetype !== 'highway' && !tile.roadConnected) {
            const warningMesh = createRoadWarningMesh();
            const warningY = (b.stories ? b.stories * 0.12 : 0.35) + 0.55;
            warningMesh.position.set(0, warningY, 0);
            group.add(warningMesh);
            animatedRoadWarnings.push({
              mesh: warningMesh,
              baseY: baseWy + warningY,
              phase: (x * 1.7 + z * 2.3) % (Math.PI * 2),
            });
          }

          structuresGroup.add(group);

          const rotor = group.getObjectByName('wind_rotor');
          if (rotor) animatedRotors.push(rotor);

          const craneJib = group.getObjectByName('construction_crane_jib');
          if (craneJib) animatedCraneJibs.push(craneJib);

          const mixerDrum = group.getObjectByName('cement_mixer_drum');
          if (mixerDrum) animatedMixerDrums.push(mixerDrum);

          const workersGrp = group.getObjectByName('construction_workers');
          if (workersGrp) animatedWorkerGroups.push(workersGrp);

          if (b.archetype === 'road' || b.archetype === 'highway') {
            const roadNode = { x, z, wy: baseWy + (tile.isBridge ? 0.26 : 0.02) };
            roadCoords.push(roadNode);

            // Classify if this road is in front of a Residential home or an Office/Factory (within 2 tiles)
            let nearRes = false;
            let nearWork = false;
            for (let dz = -2; dz <= 2; dz++) {
              for (let dx = -2; dx <= 2; dx++) {
                if (Math.abs(dx) + Math.abs(dz) > 2) continue;
                const nx = x + dx;
                const nz = z + dz;
                if (nx >= 0 && nx < size && nz >= 0 && nz < size) {
                  const nbId = st.tiles[nz * size + nx].buildingId;
                  if (nbId) {
                    const nbDef = bMap.get(nbId);
                    if (nbDef) {
                      if (isResidentialBuilding(nbDef)) nearRes = true;
                      if (isWorkplaceBuilding(nbDef)) nearWork = true;
                    }
                  }
                }
              }
            }
            if (nearRes) resFrontRoads.push(roadNode);
            if (nearWork) workFrontRoads.push(roadNode);
          }
        }
      }

      // Function to scale & manage traffic fleet based on Residential presence and Time-of-Day
      // IMPORTANT: Preserves active vehicles on their continuous commute so they NEVER reset mid-trip!
      cachedRoadCoords = roadCoords;
      cachedResFrontRoads = resFrontRoads;
      cachedWorkFrontRoads = workFrontRoads;
      cachedResidentialCount = residentialBuildingCount;

      respawnTrafficByTime = (preset: TimeOfDayPreset) => {
        // Requirement: Cars ONLY run on roads if at least 1 Residential building has been constructed!
        if (residentialBuildingCount === 0 || cachedRoadCoords.length < 2) {
          desiredActiveCarCount = 0;
          for (let i = 0; i < trafficAgents.length; i++) {
            trafficAgents[i].mesh.visible = false;
            trafficAgents[i].activeTrip = false;
          }
          return;
        }

        // Base daytime fleet scales with Residential homes + Offices/Factories + Road network
        const baseDayCars = Math.min(
          trafficAgents.length,
          Math.max(
            4,
            residentialBuildingCount * 3 +
              workBuildingCount * 2 +
              Math.floor(cachedRoadCoords.length * 0.35)
          )
        );

        // Nighttime has significantly fewer cars (~25% of daytime); Morning & Evening rush hours have 100%
        const timeMultiplier =
          preset === 'night'
            ? 0.25
            : preset === 'noon'
            ? 0.85
            : 1.0;

        const activeCarCount = Math.min(
          trafficAgents.length,
          Math.max(preset === 'night' ? 1 : 3, Math.ceil(baseDayCars * timeMultiplier))
        );
        desiredActiveCarCount = activeCarCount;

        // Collect enabled custom 3D vehicle mods so imported 3D cars drive in road traffic
        const enabledCustomVehicleMods = st.mods.filter(
          (m) =>
            m.enabled &&
            (m.customModel?.assetCategory === 'vehicle' ||
              m.building.customModel?.assetCategory === 'vehicle')
        );

        for (let i = 0; i < trafficAgents.length; i++) {
          const agent = trafficAgents[i];
          if (i < activeCarCount) {
            // Update vehicle mesh if custom 3D vehicle mods are active (mix custom cars into traffic fleet)
            const useCustomVehMod =
              enabledCustomVehicleMods.length > 0
                ? enabledCustomVehicleMods[i % enabledCustomVehicleMods.length]
                : undefined;
            const customVehCfg =
              useCustomVehMod?.customModel || useCustomVehMod?.building.customModel;
            const desiredModelKey = customVehCfg
              ? `custom_${customVehCfg.storageKey}_${customVehCfg.scaleMultiplier}_${customVehCfg.yOffset}_${customVehCfg.rotationY}_${useCustomVehMod?.building.primaryColor}`
              : `proc_${i}`;

            if (agent.mesh.userData?.modelKey !== desiredModelKey) {
              while (agent.mesh.children.length > 0) {
                agent.mesh.remove(agent.mesh.children[0]);
              }
              const newCarVisual = createVehicleAgentMesh(
                carColors[i % carColors.length],
                customVehCfg,
                useCustomVehMod?.building.primaryColor,
                useCustomVehMod?.building.accentColor
              );
              agent.mesh.add(newCarVisual);
              agent.mesh.userData = { modelKey: desiredModelKey };
            }

            // If this vehicle is ALREADY driving on valid road tiles, keep its ongoing trip untouched!
            const stillOnValidRoad =
              agent.activeTrip &&
              agent.mesh.visible &&
              isValidRoadTileAt(agent.tileX, agent.tileZ, st) &&
              isValidRoadTileAt(agent.targetX, agent.targetZ, st);

            if (!stillOnValidRoad && agent.respawnCooldown <= 0) {
              dispatchSingleVehicleTrip(agent, i, preset, st);
            }
          } else {
            agent.mesh.visible = false;
            agent.activeTrip = false;
          }
        }
      };

      respawnTrafficByTime(timeOfDayRef.current);

      // Spawn Wildlife (Forest Deer & Flocking Birds) automatically proportional to forest & water abundance
      const activeDeerCount = Math.min(
        MAX_DEER_AGENTS,
        forestTileCoords.length > 0 ? Math.max(2, Math.floor(forestTileCoords.length / 3)) : 0
      );
      for (let i = 0; i < deerAgents.length; i++) {
        const deer = deerAgents[i];
        if (i < activeDeerCount && forestTileCoords.length > 0) {
          const curDeerTile = st.tiles[deer.tileZ * size + deer.tileX];
          const deerStillValid =
            deer.mesh.visible &&
            curDeerTile &&
            !curDeerTile.isWater &&
            !curDeerTile.isCliff &&
            !curDeerTile.buildingId;

          if (!deerStillValid) {
            const spot = forestTileCoords[(i * 7) % forestTileCoords.length];
            deer.tileX = spot.x;
            deer.tileZ = spot.z;
            deer.targetX = spot.x;
            deer.targetZ = spot.z;
            deer.progress = 1;
            deer.mesh.visible = true;
          }
        } else {
          deer.mesh.visible = false;
        }
      }

      const activeBirdCount = Math.min(
        MAX_BIRD_AGENTS,
        waterAndForestCoords.length > 0 ? Math.max(3, Math.floor(waterAndForestCoords.length / 5)) : 0
      );
      for (let i = 0; i < birdAgents.length; i++) {
        const bird = birdAgents[i];
        if (i < activeBirdCount && waterAndForestCoords.length > 0) {
          const anchor = waterAndForestCoords[(i * 11) % waterAndForestCoords.length];
          const worldAnchor = getTileWorldPos(anchor.x, anchor.z, 2, size);
          bird.centerX = worldAnchor.wx;
          bird.centerZ = worldAnchor.wz;
          bird.mesh.visible = true;
        } else {
          bird.mesh.visible = false;
        }
      }
    };

    sceneRebuildTriggerRef.current = rebuildSceneGeometry;
    rebuildSceneGeometry();
    applyLightingPreset(timeOfDayRef.current);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Camera command handler (360° orbit rotation buttons, zoom & pitch tilt presets)
    let targetAzimuthOffset = 0;
    cameraCommandHandlerRef.current = (cmd: CameraActionCommand) => {
      if (cmd.type === 'rotate_left') {
        targetAzimuthOffset += Math.PI / 2;
      } else if (cmd.type === 'rotate_right') {
        targetAzimuthOffset -= Math.PI / 2;
      } else if (cmd.type === 'reset' || cmd.type === 'isometric') {
        controls.target.set(0, 0.5, 0);
        camera.position.set(22, 24, 26);
        controls.update();
      } else if (cmd.type === 'top_down') {
        controls.target.set(0, 0, 0);
        camera.position.set(0, 46, 4);
        controls.update();
      } else if (cmd.type === 'zoom_in' || cmd.type === 'zoom_out') {
        const delta = (cmd.type === 'zoom_in' ? -1 : 1) * (cmd.delta ?? 4);
        _vec3Scratch.copy(camera.position).sub(controls.target);
        const curDist = _vec3Scratch.length();
        const nextDist = Math.max(controls.minDistance, Math.min(controls.maxDistance, curDist + delta));
        _vec3Scratch.setLength(nextDist);
        camera.position.copy(controls.target).add(_vec3Scratch);
        controls.update();
      } else if (cmd.type === 'tilt_up' || cmd.type === 'tilt_down') {
        const pitchStep = cmd.type === 'tilt_up' ? -0.22 : 0.22;
        _vec3Scratch.copy(camera.position).sub(controls.target);
        const radius = _vec3Scratch.length();
        const theta = Math.atan2(_vec3Scratch.x, _vec3Scratch.z);
        let phi = Math.acos(Math.max(-1, Math.min(1, _vec3Scratch.y / radius)));
        phi = Math.max(controls.minPolarAngle, Math.min(controls.maxPolarAngle, phi + pitchStep));
        _vec3Scratch.x = radius * Math.sin(phi) * Math.sin(theta);
        _vec3Scratch.y = radius * Math.cos(phi);
        _vec3Scratch.z = radius * Math.sin(phi) * Math.cos(theta);
        camera.position.copy(controls.target).add(_vec3Scratch);
        controls.update();
      }
    };

    // 10. Unified Input Hub (WASD / Arrow Pan, Q/E 360° Rotate, Road Line Drag Preview & Android Touch Ergonomics)
    const keysHeld = new Set<string>();
    let isLeftMouseDragging = false;
    let lastInteractedTileKey = '';

    // Road & Touch Placement Preview State
    let isDraggingRoad = false;
    let isTouchBuildingPreviewDrag = false;
    let touchBuildingPreviewTile: { x: number; z: number } | null = null;
    let roadDragStartTile: { x: number; z: number } | null = null;
    let roadDragEndTile: { x: number; z: number } | null = null;
    let currentRoadPreviewPath: Array<{ x: number; z: number; isAutoStreet?: boolean }> = [];
    let currentZoneDimensionsLabel = '';
    let touchGraceTimer: number | null = null;

    const clearTouchGraceTimer = () => {
      if (touchGraceTimer !== null) {
        window.clearTimeout(touchGraceTimer);
        touchGraceTimer = null;
      }
    };

    const clearPreviewMeshesOnly = () => {
      while (roadPreviewGroup.children.length > 0) {
        const child = roadPreviewGroup.children[0] as THREE.Mesh;
        roadPreviewGroup.remove(child);
        if (child.geometry && child.geometry !== roadPreviewBaseGeo) {
          child.geometry.dispose();
        }
      }
    };

    const clearRoadDragPreview = () => {
      clearPreviewMeshesOnly();
      onRoadDragPreviewChangeRef.current?.(null);
    };

    const renderTilePreviewOverlay = (
      pathTiles: Array<{ x: number; z: number; isAutoStreet?: boolean }>,
      toolId: string,
      reportLiveRoadBanner: boolean,
      dimensionsLabel?: string
    ) => {
      clearPreviewMeshesOnly();
      if (pathTiles.length === 0) {
        if (reportLiveRoadBanner) onRoadDragPreviewChangeRef.current?.(null);
        return { totalCost: 0, buildableCount: 0, streetCount: 0, toolName: '' };
      }

      const st = simStateRef.current;
      const size = st.config.size;
      const isRoad = toolId === 'road_avenue' || toolId === 'road_highway';
      const allBuildings = getAllAvailableBuildings(st.mods);
      const foundBuilding = allBuildings.find((b) => b.id === toolId);
      const isZone = Boolean(foundBuilding && foundBuilding.isZone && !foundBuilding.customModel);

      const baseCost = isRoad
        ? toolId === 'road_highway'
          ? 45
          : 20
        : isZone
        ? Math.max(25, Math.round((foundBuilding?.cost ?? 120) * 0.45))
        : foundBuilding?.cost ?? 50;
      const toolName = isRoad
        ? toolId === 'road_highway'
          ? 'ทางด่วนยกระดับ 4 เลน'
          : 'ถนนสายหลัก 2 เลน (กว้าง 5.6 ม.)'
        : foundBuilding?.name ?? 'สิ่งปลูกสร้าง';

      let totalCost = 0;
      let buildableCount = 0;
      let streetCount = 0;

      for (const pt of pathTiles) {
        const tile = st.tiles[pt.z * size + pt.x];
        if (!tile) continue;
        if (isZone && (tile.isWater || tile.isCliff)) continue;

        const { wx, wy, wz } = getTileWorldPos(pt.x, pt.z, tile.elevation, size);
        const baseWy = tile.isWater ? 0.02 : wy;

        if (isZone && pt.isAutoStreet) {
          if (tile.buildingId !== 'road_avenue' && tile.buildingId !== 'road_highway') {
            streetCount++;
            totalCost += 40;
          }
        } else if (tile.buildingId !== toolId) {
          buildableCount++;
          totalCost += baseCost * (isRoad && tile.isWater ? 2 : 1);
        }

        const geo = roadPreviewBaseGeo.clone();
        if (!tile.isWater) {
          const posAttr = geo.attributes.position as THREE.BufferAttribute;
          for (let i = 0; i < posAttr.count; i++) {
            const lx = posAttr.getX(i);
            const lz = posAttr.getZ(i);
            const h = Math.max(0, sampleSmoothTerrain(pt.x + 0.5 + lx, pt.z + 0.5 + lz, st).wy) - baseWy;
            posAttr.setY(i, h + 0.04);
          }
          posAttr.needsUpdate = true;
        } else {
          geo.translate(0, 0.26, 0);
        }

        let previewMat = tile.isWater ? roadPreviewBridgeMat : roadPreviewMat;
        if (isZone && !pt.isAutoStreet && foundBuilding) {
          if (
            foundBuilding.archetype === 'residential_low' ||
            foundBuilding.archetype === 'residential_high'
          ) {
            previewMat = zonePreviewResMat;
          } else if (
            foundBuilding.archetype === 'commercial_low' ||
            foundBuilding.archetype === 'commercial_high'
          ) {
            previewMat = zonePreviewComMat;
          } else {
            previewMat = zonePreviewIndMat;
          }
        }

        const mesh = new THREE.Mesh(geo, previewMat);
        mesh.position.set(wx, baseWy, wz);
        roadPreviewGroup.add(mesh);

        // If previewing a non-zone building / custom 3D model, also show its 3D preview silhouette on the tile
        if (foundBuilding && !isRoad && !isZone) {
          const ghostGroup = buildCompositeStructureGroup(
            foundBuilding,
            { ...tile, buildingLevel: 1, constructionProgress: 100, powered: true },
            { n: false, s: false, e: false, w: false }
          );
          ghostGroup.position.set(wx, baseWy, wz);
          ghostGroup.rotation.y = (buildingRotationRef.current || 0) * (Math.PI / 2);
          roadPreviewGroup.add(ghostGroup);
        }
      }

      if (reportLiveRoadBanner && (isRoad || isZone)) {
        onRoadDragPreviewChangeRef.current?.({
          count: buildableCount > 0 ? buildableCount : pathTiles.length,
          cost: totalCost,
          roadName: toolName,
          dimensionsLabel,
          isZoneDrag: isZone,
          streetCount,
        });
      }

      return { totalCost, buildableCount, streetCount, toolName };
    };

    syncPendingTouchPreviewTriggerRef.current = (pending: PendingTouchPlacement | null) => {
      if (!pending || pending.tiles.length === 0) {
        if (!isDraggingRoad && !isTouchBuildingPreviewDrag) {
          clearPreviewMeshesOnly();
        }
        return;
      }
      renderTilePreviewOverlay(pending.tiles, pending.toolId, false, pending.dimensionsLabel);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // If user presses Escape while actively dragging a road line / RCI zone box or with a pending touch placement, cancel immediately!
      if (e.code === 'Escape' && (isDraggingRoad || pendingTouchPlacementRef.current)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        isDraggingRoad = false;
        isTouchBuildingPreviewDrag = false;
        isLeftMouseDragging = false;
        roadDragStartTile = null;
        roadDragEndTile = null;
        currentRoadPreviewPath = [];
        currentZoneDimensionsLabel = '';
        clearRoadDragPreview();
        onPendingTouchPlacementChangeRef.current?.(null);
        onCancelRoadDragRef.current?.();
        return;
      }
      keysHeld.add(e.code);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysHeld.delete(e.code);
    };
    const handleBlur = () => {
      keysHeld.clear();
      clearTouchGraceTimer();
      isLeftMouseDragging = false;
      isTouchBuildingPreviewDrag = false;
      onCanvasDragStateChangeRef.current?.(false);
      if (isDraggingRoad) {
        isDraggingRoad = false;
        roadDragStartTile = null;
        roadDragEndTile = null;
        currentRoadPreviewPath = [];
        currentZoneDimensionsLabel = '';
        clearRoadDragPreview();
      }
    };

    // Use capture phase for handleKeyDown so Escape cancels road/zone dragging before App.tsx pauses or switches tools
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    const raycaster = new THREE.Raycaster();
    const pointerNDC = new THREE.Vector2();
    const groundFallbackPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    const screenToTileCoords = (clientX: number, clientY: number): { x: number; z: number; wy: number } | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointerNDC, camera);
      const size = simStateRef.current.config.size;
      const half = size / 2;

      if (terrainMesh) {
        const hits = raycaster.intersectObject(terrainMesh, false);
        if (hits.length > 0) {
          const pt = hits[0].point;
          const tx = Math.floor(pt.x + half);
          const tz = Math.floor(pt.z + half);
          if (tx >= 0 && tx < size && tz >= 0 && tz < size) {
            return { x: tx, z: tz, wy: pt.y };
          }
        }
      }

      if (raycaster.ray.intersectPlane(groundFallbackPlane, _vec3Scratch)) {
        const tx = Math.floor(_vec3Scratch.x + half);
        const tz = Math.floor(_vec3Scratch.z + half);
        if (tx >= 0 && tx < size && tz >= 0 && tz < size) {
          return { x: tx, z: tz, wy: 0 };
        }
      }
      return null;
    };

    const isRoadBuildTool = () => {
      const tid = activeToolRef.current;
      return (
        simStateRef.current.executionMode !== 'god_mode' &&
        (tid === 'road_avenue' || tid === 'road_highway')
      );
    };

    const isZoneBuildTool = () => {
      const tid = activeToolRef.current;
      return (
        simStateRef.current.executionMode !== 'god_mode' &&
        (tid === 'zone_res_low' ||
          tid === 'zone_res_high' ||
          tid === 'zone_com_low' ||
          tid === 'zone_com_high' ||
          tid === 'zone_ind')
      );
    };

    const isTerrainOrBulldozeTool = () => {
      const tid = activeToolRef.current;
      return (
        simStateRef.current.executionMode === 'god_mode' ||
        tid === 'bulldoze' ||
        tid.startsWith('terrain_') ||
        tid.startsWith('tree_')
      );
    };

    let lastHoverTime = 0;
    const handlePointerMove = (e: PointerEvent) => {
      if (simStateRef.current.status !== 'playing') return;
      if (activeTouchCount >= 2) return;
      const now = performance.now();
      if (now - lastHoverTime < 24) return;
      lastHoverTime = now;

      const hit = screenToTileCoords(e.clientX, e.clientY);
      const st = simStateRef.current;
      const size = st.config.size;

      if (!hit) {
        cursorMesh.visible = false;
        onHoverTileChangeRef.current(null);
        return;
      }

      const tile = st.tiles[hit.z * size + hit.x];
      const { wx, wy, wz } = getTileWorldPos(hit.x, hit.z, tile.elevation, size);
      cursorMesh.visible = true;
      const catalog = getAllAvailableBuildings(st.mods);
      const activeBuilding = catalog.find((b) => b.id === activeToolRef.current);
      if (activeBuilding && !activeBuilding.isZone && activeBuilding.customLotData) {
        const { effWidth, effDepth } = getBuildingFootprintSize(activeBuilding, buildingRotationRef.current);
        cursorMesh.scale.set(effWidth, 1, effDepth);
        cursorMesh.position.set(
          wx + (effWidth - 1) * 0.5,
          (tile.isWater ? 0.04 : wy) + 0.04,
          wz + (effDepth - 1) * 0.5
        );
      } else {
        cursorMesh.position.set(wx, (tile.isWater ? 0.04 : wy) + 0.04, wz);
        const bScale = 1 + brushRadiusRef.current * 2;
        cursorMesh.scale.set(bScale, 1, bScale);
      }
      onHoverTileChangeRef.current(tile);

      if (isDraggingRoad && roadDragStartTile) {
        if (!roadDragEndTile || hit.x !== roadDragEndTile.x || hit.z !== roadDragEndTile.z) {
          roadDragEndTile = { x: hit.x, z: hit.z };
          if (isZoneBuildTool()) {
            const area = computeZoneDragArea(
              roadDragStartTile.x,
              roadDragStartTile.z,
              hit.x,
              hit.z,
              size,
              10
            );
            currentRoadPreviewPath = area.tiles;
            currentZoneDimensionsLabel = `${area.width}×${area.depth} ช่อง (${area.width * 10}×${area.depth * 10} ม.)`;
            renderTilePreviewOverlay(
              currentRoadPreviewPath,
              activeToolRef.current,
              true,
              currentZoneDimensionsLabel
            );
          } else {
            currentRoadPreviewPath = computeRoadDragPath(
              roadDragStartTile.x,
              roadDragStartTile.z,
              hit.x,
              hit.z,
              size
            );
            currentZoneDimensionsLabel = '';
            renderTilePreviewOverlay(currentRoadPreviewPath, activeToolRef.current, true);
          }
        }
        return;
      }

      if (isTouchBuildingPreviewDrag) {
        if (
          !touchBuildingPreviewTile ||
          hit.x !== touchBuildingPreviewTile.x ||
          hit.z !== touchBuildingPreviewTile.z
        ) {
          touchBuildingPreviewTile = { x: hit.x, z: hit.z };
          renderTilePreviewOverlay([touchBuildingPreviewTile], activeToolRef.current, false);
        }
        return;
      }

      if (isLeftMouseDragging) {
        const key = `${hit.x}_${hit.z}`;
        if (key !== lastInteractedTileKey) {
          lastInteractedTileKey = key;
          onTileInteractRef.current(hit.x, hit.z, true);
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try { navigator.vibrate(10); } catch {}
          }
          spawnParticlesRef.current?.(wx, wy, wz, 0x38bdf8, 5, 0.06);
        }
      }
    };

    let pointerDownPos = { x: 0, y: 0 };
    let pointerDownTime = 0;
    let activeTouchCount = 0;

    const handlePointerDown = (e: PointerEvent) => {
      if (simStateRef.current.status !== 'playing') return;
      pointerDownPos = { x: e.clientX, y: e.clientY };
      pointerDownTime = performance.now();

      const isInspect =
        activeToolRef.current === 'inspect' ||
        activeToolRef.current === 'camera_pan' ||
        keysHeld.has('Space');
      const isTouch = e.pointerType === 'touch';

      // If multi-touch is active (2+ fingers), suppress construction to avoid accidental placement while gesturing
      if (activeTouchCount >= 2) {
        clearTouchGraceTimer();
        isLeftMouseDragging = false;
        isTouchBuildingPreviewDrag = false;
        if (isDraggingRoad) {
          isDraggingRoad = false;
          roadDragStartTile = null;
          roadDragEndTile = null;
          currentRoadPreviewPath = [];
          currentZoneDimensionsLabel = '';
          clearRoadDragPreview();
        }
        return;
      }

      if (isTouch) {
        onCanvasDragStateChangeRef.current?.(true);
      }

      const isAllowedToBuild = isTouch
        ? !isInspect
        : e.button === 0 && !e.altKey && !e.shiftKey && !isInspect;

      if (isAllowedToBuild) {
        const hit = screenToTileCoords(e.clientX, e.clientY);
        if (hit) {
          const size = simStateRef.current.config.size;
          // 1) If Road tool OR SimCity 4 RCI Zone tool is active in Mayor Mode, start interactive Drag Preview!
          if (isRoadBuildTool() || isZoneBuildTool()) {
            isDraggingRoad = true;
            isLeftMouseDragging = false;
            isTouchBuildingPreviewDrag = false;
            roadDragStartTile = { x: hit.x, z: hit.z };
            roadDragEndTile = { x: hit.x, z: hit.z };
            if (isZoneBuildTool()) {
              const area = computeZoneDragArea(hit.x, hit.z, hit.x, hit.z, size, 10);
              currentRoadPreviewPath = area.tiles;
              currentZoneDimensionsLabel = `${area.width}×${area.depth} ช่อง (${area.width * 10}×${area.depth * 10} ม.)`;
              renderTilePreviewOverlay(
                currentRoadPreviewPath,
                activeToolRef.current,
                true,
                currentZoneDimensionsLabel
              );
            } else {
              currentRoadPreviewPath = computeRoadDragPath(hit.x, hit.z, hit.x, hit.z, size);
              currentZoneDimensionsLabel = '';
              renderTilePreviewOverlay(currentRoadPreviewPath, activeToolRef.current, true);
            }
            return;
          }

          // 2) On Touchscreens in Mayor Mode for non-zone Buildings: preview tile under finger first, confirm on release!
          if (isTouch && !isTerrainOrBulldozeTool()) {
            isTouchBuildingPreviewDrag = true;
            isLeftMouseDragging = false;
            touchBuildingPreviewTile = { x: hit.x, z: hit.z };
            renderTilePreviewOverlay([touchBuildingPreviewTile], activeToolRef.current, false);
            return;
          }

          // 3) On Touchscreens for God Mode / Terrain Sculpting / Bulldoze:
          // Use an 80ms Multi-Touch Grace Timer so placing a 2nd finger to pinch-zoom or rotate never accidentally digs terrain!
          if (isTouch) {
            clearTouchGraceTimer();
            const startHit = { x: hit.x, z: hit.z };
            touchGraceTimer = window.setTimeout(() => {
              touchGraceTimer = null;
              if (activeTouchCount >= 2 || simStateRef.current.status !== 'playing') return;
              isLeftMouseDragging = true;
              lastInteractedTileKey = `${startHit.x}_${startHit.z}`;
              onTileInteractRef.current(startHit.x, startHit.z, false);
              if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                try { navigator.vibrate(15); } catch {}
              }
              const sNow = simStateRef.current.config.size;
              const tile = simStateRef.current.tiles[startHit.z * sNow + startHit.x];
              if (tile) {
                const { wx, wy, wz } = getTileWorldPos(startHit.x, startHit.z, tile.elevation, sNow);
                const isHeavy = activeToolRef.current === 'bulldoze' || activeToolRef.current === 'terrain_cliff';
                spawnParticlesRef.current?.(
                  wx,
                  wy,
                  wz,
                  isHeavy ? 0xf59e0b : 0x38bdf8,
                  isHeavy ? 16 : 8,
                  isHeavy ? 0.28 : 0.1
                );
              }
            }, 80);
            return;
          }

          // 4) Desktop Mouse Click: immediate responsive build/sculpt
          isLeftMouseDragging = true;
          lastInteractedTileKey = `${hit.x}_${hit.z}`;
          onTileInteractRef.current(hit.x, hit.z, false);
          const tile = simStateRef.current.tiles[hit.z * size + hit.x];
          const { wx, wy, wz } = getTileWorldPos(hit.x, hit.z, tile.elevation, size);
          const isHeavy = activeToolRef.current === 'bulldoze' || activeToolRef.current === 'terrain_cliff';
          spawnParticlesRef.current?.(
            wx,
            wy,
            wz,
            isHeavy ? 0xf59e0b : 0x38bdf8,
            isHeavy ? 16 : 8,
            isHeavy ? 0.28 : 0.1
          );
        }
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      clearTouchGraceTimer();
      onCanvasDragStateChangeRef.current?.(false);
      const isTouch = e.pointerType === 'touch';

      if (isDraggingRoad) {
        const committed = [...currentRoadPreviewPath];
        const roadToolId = activeToolRef.current;
        const wasZoneDrag = isZoneBuildTool();
        const dimLabel = currentZoneDimensionsLabel;
        isDraggingRoad = false;
        isLeftMouseDragging = false;
        roadDragStartTile = null;
        roadDragEndTile = null;
        currentRoadPreviewPath = [];
        currentZoneDimensionsLabel = '';

        if (committed.length > 0) {
          if (isTouch && onPendingTouchPlacementChangeRef.current) {
            // On Android Touchscreen: lock the 3D road/zone preview and show floating Confirm / Cancel bar!
            onRoadDragPreviewChangeRef.current?.(null);
            const info = renderTilePreviewOverlay(committed, roadToolId, false, dimLabel);
            onPendingTouchPlacementChangeRef.current({
              mode: wasZoneDrag ? 'zone' : 'road',
              toolId: roadToolId,
              toolName: info.toolName,
              tiles: committed,
              totalCost: info.totalCost,
              dimensionsLabel: dimLabel,
            });
            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
              try { navigator.vibrate(12); } catch {}
            }
          } else {
            // On Desktop Mouse: commit road path or SimCity 4 RCI zone block immediately on mouse release
            clearRoadDragPreview();
            if (wasZoneDrag) {
              onCommitZoneAreaRef.current?.(roadToolId, committed);
            } else {
              onCommitRoadPathRef.current?.(roadToolId, committed);
            }
            const size = simStateRef.current.config.size;
            const lastPt = committed[committed.length - 1];
            const tile = simStateRef.current.tiles[lastPt.z * size + lastPt.x];
            if (tile) {
              const { wx, wy, wz } = getTileWorldPos(lastPt.x, lastPt.z, tile.elevation, size);
              spawnParticlesRef.current?.(
                wx,
                wy,
                wz,
                wasZoneDrag ? 0x22c55e : 0x38bdf8,
                Math.min(20, committed.length * 3),
                0.1
              );
            }
          }
        } else {
          clearRoadDragPreview();
        }
        return;
      }

      if (isTouchBuildingPreviewDrag) {
        const targetTile = touchBuildingPreviewTile;
        const bToolId = activeToolRef.current;
        isTouchBuildingPreviewDrag = false;
        touchBuildingPreviewTile = null;
        if (targetTile && onPendingTouchPlacementChangeRef.current) {
          const info = renderTilePreviewOverlay([targetTile], bToolId, false);
          onPendingTouchPlacementChangeRef.current({
            mode: 'building',
            toolId: bToolId,
            toolName: info.toolName,
            tiles: [targetTile],
            totalCost: info.totalCost,
          });
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try { navigator.vibrate(12); } catch {}
          }
        }
        return;
      }

      isLeftMouseDragging = false;
      lastInteractedTileKey = '';

      const isInspect = activeToolRef.current === 'inspect' || activeToolRef.current === 'camera_pan';
      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      const duration = performance.now() - pointerDownTime;

      // In Inspect mode: a tap or click without dragging selects the building/tile!
      if (isInspect && dist < 10 && duration < 550) {
        const hit = screenToTileCoords(e.clientX, e.clientY);
        if (hit) {
          const size = simStateRef.current.config.size;
          const clickedTile = simStateRef.current.tiles[hit.z * size + hit.x];
          onSelectInspectTileRef.current?.(clickedTile);
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try { navigator.vibrate(15); } catch {}
          }
        } else {
          onSelectInspectTileRef.current?.(null);
        }
      }
    };

    // Android & Touchscreen 2-Finger Gestures (1 finger builds/sculpts; 2 fingers ALWAYS pinch-zoom, 360° twist rotate, and pan)
    let lastTwoTouchAngle: number | null = null;
    const handleTouchStart = (e: TouchEvent) => {
      activeTouchCount = e.touches.length;
      if (activeTouchCount >= 2) {
        clearTouchGraceTimer();
        isLeftMouseDragging = false;
        isTouchBuildingPreviewDrag = false;
        touchBuildingPreviewTile = null;
        lastInteractedTileKey = '';
        if (isDraggingRoad) {
          isDraggingRoad = false;
          roadDragStartTile = null;
          roadDragEndTile = null;
          currentRoadPreviewPath = [];
          clearRoadDragPreview();
        }
        if (pendingTouchPlacementRef.current) {
          renderTilePreviewOverlay(
            pendingTouchPlacementRef.current.tiles,
            pendingTouchPlacementRef.current.toolId,
            false
          );
        } else {
          clearPreviewMeshesOnly();
        }
      }
    };
    const handleTouchEnd = (e: TouchEvent) => {
      activeTouchCount = e.touches.length;
      if (activeTouchCount === 0) {
        clearTouchGraceTimer();
        onCanvasDragStateChangeRef.current?.(false);
      }
      if (activeTouchCount < 2) {
        lastTwoTouchAngle = null;
      }
    };
    const handleTouchMove = (e: TouchEvent) => {
      activeTouchCount = e.touches.length;
      if (e.touches.length >= 2 && controlsRef.current) {
        clearTouchGraceTimer();
        isLeftMouseDragging = false;
        isTouchBuildingPreviewDrag = false;
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const currentAngle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX);
        if (lastTwoTouchAngle !== null) {
          let deltaAngle = currentAngle - lastTwoTouchAngle;
          while (deltaAngle > Math.PI) deltaAngle -= Math.PI * 2;
          while (deltaAngle < -Math.PI) deltaAngle += Math.PI * 2;
          if (Math.abs(deltaAngle) > 0.008) {
            _vec3Scratch.copy(camera.position).sub(controlsRef.current.target);
            _vec3Scratch.applyAxisAngle(_upVec, -deltaAngle * 1.25);
            camera.position.copy(controlsRef.current.target).add(_vec3Scratch);
            controlsRef.current.update();
          }
        }
        lastTwoTouchAngle = currentAngle;
      } else {
        lastTwoTouchAngle = null;
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('contextmenu', handleContextMenu);
    renderer.domElement.addEventListener('touchstart', handleTouchStart, { passive: true });
    renderer.domElement.addEventListener('touchend', handleTouchEnd, { passive: true });
    renderer.domElement.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    renderer.domElement.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('pointerup', handlePointerUp);

    // ResizeObserver for lossless responsive viewport sizing
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
          renderer.render(scene, camera);
        }
      }
    });
    resizeObserver.observe(mount);

    // 11. Animation Loop (with software-WebGL afterDraw fence sync pacing)
    let frameId = 0;
    let lastTime = performance.now();
    let titleFlyoverAngle = 0.55;
    let wasTitleScreen = simStateRef.current.status === 'title';
    let lastReportedHeading = -1;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    }

    function tick() {
      const now = performance.now();
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      // Clamp frame delta time <= 0.05s per game craft rule
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

      const st = simStateRef.current;
      const size = st.config.size;
      const half = size / 2;

      // Title screen live world camera tour vs Playing interactive camera
      if (st.status === 'title') {
        wasTitleScreen = true;
        titleFlyoverAngle += dt * 0.22;
        const radius = 21;
        camera.position.set(
          Math.cos(titleFlyoverAngle) * radius,
          15.5 + Math.sin(titleFlyoverAngle * 1.5) * 2,
          Math.sin(titleFlyoverAngle) * radius
        );
        camera.lookAt(-3.5, 0.8, 0);
      } else {
        if (wasTitleScreen) {
          wasTitleScreen = false;
          controls.target.set(0, 0.5, 0);
          camera.position.set(20, 22, 24);
          controls.update();
        }

        // Cities: Skylines Camera Keyboard Controls: WASD Pan, Q/E 360° Orbit, R/F Pitch Tilt
        const panSpeed = 16 * dt;
        camera.getWorldDirection(_camDirScratch);
        _camDirScratch.y = 0;
        _camDirScratch.normalize();
        _camRightScratch.crossVectors(_camDirScratch, _upVec).normalize();

        if (keysHeld.has('KeyW') || keysHeld.has('ArrowUp')) {
          camera.position.addScaledVector(_camDirScratch, panSpeed);
          controls.target.addScaledVector(_camDirScratch, panSpeed);
        }
        if (keysHeld.has('KeyS') || keysHeld.has('ArrowDown')) {
          camera.position.addScaledVector(_camDirScratch, -panSpeed);
          controls.target.addScaledVector(_camDirScratch, -panSpeed);
        }
        if (keysHeld.has('KeyD') || keysHeld.has('ArrowRight')) {
          camera.position.addScaledVector(_camRightScratch, panSpeed);
          controls.target.addScaledVector(_camRightScratch, panSpeed);
        }
        if (keysHeld.has('KeyA') || keysHeld.has('ArrowLeft')) {
          camera.position.addScaledVector(_camRightScratch, -panSpeed);
          controls.target.addScaledVector(_camRightScratch, -panSpeed);
        }

        // Q/E or compass button 360° horizontal rotation around target
        let rotDelta = 0;
        if (keysHeld.has('KeyQ')) rotDelta += 1.6 * dt;
        if (keysHeld.has('KeyE')) rotDelta -= 1.6 * dt;
        if (Math.abs(targetAzimuthOffset) > 0.005) {
          const step = THREE.MathUtils.damp(0, targetAzimuthOffset, 8, dt);
          rotDelta += step;
          targetAzimuthOffset -= step;
        }
        if (Math.abs(rotDelta) > 0.0001) {
          _vec3Scratch.copy(camera.position).sub(controls.target);
          _vec3Scratch.applyAxisAngle(_upVec, rotDelta);
          camera.position.copy(controls.target).add(_vec3Scratch);
        }

        // Cities: Skylines R / F Pitch / Tilt Camera Angle (look down to street or up to sky)
        let pitchDelta = 0;
        if (keysHeld.has('KeyR') || keysHeld.has('PageUp')) pitchDelta -= 1.4 * dt;
        if (keysHeld.has('KeyF') || keysHeld.has('PageDown')) pitchDelta += 1.4 * dt;
        if (Math.abs(pitchDelta) > 0.0001) {
          _vec3Scratch.copy(camera.position).sub(controls.target);
          const radius = _vec3Scratch.length();
          const theta = Math.atan2(_vec3Scratch.x, _vec3Scratch.z);
          let phi = Math.acos(Math.max(-1, Math.min(1, _vec3Scratch.y / radius)));
          phi = Math.max(controls.minPolarAngle, Math.min(controls.maxPolarAngle, phi + pitchDelta));
          _vec3Scratch.x = radius * Math.sin(phi) * Math.sin(theta);
          _vec3Scratch.y = radius * Math.cos(phi);
          _vec3Scratch.z = radius * Math.sin(phi) * Math.cos(theta);
          camera.position.copy(controls.target).add(_vec3Scratch);
        }

        // Update Inspected Building Selection Ring highlight
        const selTile = selectedInspectTileRef.current;
        if (selTile) {
          const size = st.config.size;
          const { wx, wy, wz } = getTileWorldPos(selTile.x, selTile.z, selTile.elevation, size);
          selectionMesh.visible = true;
          selectionMesh.position.set(wx, (selTile.isWater ? 0.04 : wy) + 0.045, wz);
          const pulse = 1 + Math.sin(now * 0.006) * 0.06;
          selectionMesh.scale.set(pulse, 1, pulse);
        } else {
          selectionMesh.visible = false;
        }

        controls.update();
      }

      // Report compass heading (throttled to integer degree changes >= 3 deg)
      const dx = camera.position.x - controls.target.x;
      const dz = camera.position.z - controls.target.z;
      const deg = Math.round(((Math.atan2(dx, dz) * 180) / Math.PI + 360) % 360);
      if (Math.abs(deg - lastReportedHeading) >= 3) {
        lastReportedHeading = deg;
        onCameraHeadingChangeRef.current(deg);
      }

      // Hitstop timer & Camera trauma shake
      if (hitstopTimer > 0) {
        hitstopTimer = Math.max(0, hitstopTimer - dt);
      }
      const simDt = hitstopTimer > 0 ? 0 : dt * (st.status === 'paused' ? 0 : Math.max(1, st.simSpeed));

      if (cameraTrauma > 0) {
        cameraTrauma = Math.max(0, cameraTrauma - dt * 2.4);
      }

      // Mirror-reflective water level shimmer & animated sun-glinting wave ripples
      waterMesh.position.y = 0.02 + Math.sin(now * 0.0022) * 0.012;
      waterNormalTex.offset.x = (waterNormalTex.offset.x + dt * 0.032) % 1;
      waterNormalTex.offset.y = (waterNormalTex.offset.y + dt * 0.021) % 1;

      // Spin wind turbine rotors
      for (let i = 0; i < animatedRotors.length; i++) {
        animatedRotors[i].rotation.z += simDt * 2.6;
      }

      // Animate Construction Site Tower Cranes (เครนทาวเวอร์หมุนแขนบูม), Cement Mixer Drums (รถโม่ปูน), and Construction Workers (คนก่อสร้าง)
      for (let i = 0; i < animatedCraneJibs.length; i++) {
        const jib = animatedCraneJibs[i];
        const phase = jib.userData?.phase || 0;
        jib.rotation.y = Math.sin(now * 0.0012 + phase) * 1.15;
      }
      for (let i = 0; i < animatedMixerDrums.length; i++) {
        animatedMixerDrums[i].rotation.y += simDt * 3.4;
      }
      for (let i = 0; i < animatedWorkerGroups.length; i++) {
        const wg = animatedWorkerGroups[i];
        const phase = wg.userData?.phase || 0;
        const baseX = wg.userData?.baseX ?? 0.06;
        const baseZ = wg.userData?.baseZ ?? 0.26;
        wg.position.x = baseX + Math.sin(now * 0.0028 + phase) * 0.055;
        wg.position.z = baseZ + Math.cos(now * 0.0022 + phase) * 0.04;
        wg.rotation.y = Math.sin(now * 0.002 + phase) * 0.45;
      }

      // Animate 3D Floating Road Connection Warnings (🚫🛣️ gentle bobbing & rotation)
      for (let i = 0; i < animatedRoadWarnings.length; i++) {
        const item = animatedRoadWarnings[i];
        item.mesh.position.y = item.baseY + Math.sin(now * 0.0035 + item.phase) * 0.08;
        item.mesh.rotation.y += simDt * 0.85;
      }

      // Progressive Staggered Night Illumination for all city buildings in Evening/Night (randomized 0-3.8s rollout)
      const curPreset = timeOfDayRef.current;
      const isNightOrEvening = curPreset === 'evening' || curPreset === 'night';
      const elapsedSec = isNightOrEvening ? (now - eveningTransitionStartTime) / 1000 : 0;
      const targetEmissive = curPreset === 'night' ? 2.8 : curPreset === 'evening' ? 2.2 : 0.05;

      for (let sIdx = 0; sIdx < structuresGroup.children.length; sIdx++) {
        const structGroup = structuresGroup.children[sIdx];
        if (structGroup.userData?.isBuilding) {
          const tx = structGroup.userData.tileX ?? 0;
          const tz = structGroup.userData.tileZ ?? 0;
          // Fixed deterministic delay per building between 0.0s and 3.8s
          const seed = Math.abs(Math.sin((tx + 1) * 12.9898 + (tz + 1) * 78.233)) % 1;
          const startDelay = seed * 3.8;

          const isBuildingLit = isNightOrEvening && elapsedSec >= startDelay;
          const fadeRatio = isBuildingLit ? Math.min(1.0, (elapsedSec - startDelay) / 0.6) : 0;
          const curIntensity = isNightOrEvening
            ? THREE.MathUtils.lerp(0.05, targetEmissive, fadeRatio)
            : 0.05;

          structGroup.traverse((mesh) => {
            if (mesh instanceof THREE.Mesh && mesh.material instanceof THREE.MeshStandardMaterial) {
              const mat = mesh.material;
              if (
                mat.metalness > 0.4 ||
                mat.roughness < 0.3 ||
                mat.emissive.r > 0 ||
                mat.emissive.g > 0 ||
                mat.emissive.b > 0
              ) {
                mat.emissiveIntensity = curIntensity;
                if (isBuildingLit && mat.emissive.r === 0 && mat.emissive.g === 0 && mat.emissive.b === 0) {
                  mat.emissive.setHex(0xfef08a);
                }
              }
            }
          });
        }
      }

      // Animate 3D Pedestrian Citizens walking along sidewalks between home and workplace
      for (let i = 0; i < pedestrianAgents.length; i++) {
        const ped = pedestrianAgents[i];
        if (!ped.active) {
          ped.respawnCooldown -= simDt;
          if (ped.respawnCooldown <= 0 && cachedResidentialCount > 0) {
            dispatchSinglePedestrianTrip(ped, i, st);
          }
        }
        if (!ped.active || !ped.mesh.visible) continue;

        ped.progress += simDt * ped.speed;
        ped.legPhase += simDt * 10 * ped.speed;

        // Animate pedestrian gait cycle (arm & leg swinging)
        const swing = Math.sin(ped.legPhase) * 0.55;
        const armL = ped.mesh.getObjectByName('arm_left');
        const armR = ped.mesh.getObjectByName('arm_right');
        const legL = ped.mesh.getObjectByName('leg_left');
        const legR = ped.mesh.getObjectByName('leg_right');
        if (armL) armL.rotation.x = swing;
        if (armR) armR.rotation.x = -swing;
        if (legL) legL.rotation.x = -swing;
        if (legR) legR.rotation.x = swing;

        if (ped.progress >= 1) {
          ped.tileX = ped.targetX;
          ped.tileZ = ped.targetZ;
          ped.progress = 0;

          if ((ped.tileX === ped.destX && ped.tileZ === ped.destZ) || ped.routeIdx >= ped.routePath.length - 1) {
            ped.mesh.visible = false;
            ped.active = false;
            ped.respawnCooldown = 1.2 + (i % 4) * 0.5;
            continue;
          }

          ped.routeIdx += 1;
          const nextStep = ped.routePath[ped.routeIdx];
          if (nextStep) {
            ped.targetX = nextStep.x;
            ped.targetZ = nextStep.z;
          } else {
            ped.mesh.visible = false;
            ped.active = false;
            ped.respawnCooldown = 1.5;
            continue;
          }
        }

        const curTile = st.tiles[ped.tileZ * size + ped.tileX];
        const tgtTile = st.tiles[ped.targetZ * size + ped.targetX];
        if (curTile && tgtTile) {
          const p0 = getTileWorldPos(ped.tileX, ped.tileZ, curTile.elevation, size);
          const p1 = getTileWorldPos(ped.targetX, ped.targetZ, tgtTile.elevation, size);

          const curDirX = Math.sign(ped.targetX - ped.tileX);
          const curDirZ = Math.sign(ped.targetZ - ped.tileZ);

          // Pedestrians walk on sidewalks (0.38m offset perpendicular to roadway center)
          const swOffX = -curDirZ * 0.38 * ped.sidewalkSide;
          const swOffZ = curDirX * 0.38 * ped.sidewalkSide;

          const cx = THREE.MathUtils.lerp(p0.wx, p1.wx, ped.progress) + swOffX;
          const cz = THREE.MathUtils.lerp(p0.wz, p1.wz, ped.progress) + swOffZ;

          const sampledHere = sampleSmoothTerrain(cx + half, cz + half, st);
          const pedY = Math.max(0.02, sampledHere.wy) + 0.02;

          ped.mesh.position.set(cx, pedY, cz);
          if (curDirX !== 0 || curDirZ !== 0) {
            ped.mesh.rotation.y = Math.atan2(curDirX, curDirZ);
          }
        }
      }

      // 4-Way & Major 3-Way Intersection Traffic Signal Cycle (6s Green -> 2s Yellow -> Alternating Red = 16s total cycle)
      const signalTime = (now * 0.001) % 16.0;
      const nsSignal: 'green' | 'yellow' | 'red' =
        signalTime < 6.0 ? 'green' : signalTime < 8.0 ? 'yellow' : 'red';
      const ewSignal: 'green' | 'yellow' | 'red' =
        signalTime < 8.0 ? 'red' : signalTime < 14.0 ? 'green' : 'yellow';
      updateTrafficSignalMaterials(nsSignal, ewSignal);

      // Update intelligent right-hand dual-lane traffic vehicles along connected roads
      const isRoadAt = (tx: number, tz: number) => {
        if (tx < 0 || tx >= size || tz < 0 || tz >= size) return false;
        const bId = st.tiles[tz * size + tx].buildingId;
        return bId === 'road_avenue' || bId === 'road_highway';
      };
      const isSignalizedIntersectionAt = (tx: number, tz: number) => {
        if (!isRoadAt(tx, tz)) return false;
        const n = isRoadAt(tx, tz - 1);
        const s = isRoadAt(tx, tz + 1);
        const e = isRoadAt(tx + 1, tz);
        const w = isRoadAt(tx - 1, tz);
        const conn = (n ? 1 : 0) + (s ? 1 : 0) + (e ? 1 : 0) + (w ? 1 : 0);
        if (conn === 4) return true;
        if (conn === 3) {
          const t = st.tiles[tz * size + tx];
          return t.buildingId === 'road_highway' || (t.landValue ?? 40) >= 50 || (tx + tz) % 3 === 0;
        }
        return false;
      };

      for (let i = 0; i < trafficAgents.length; i++) {
        const agent = trafficAgents[i];

        // If vehicle finished its previous trip to work and is waiting in cooldown before next commute
        if (i < desiredActiveCarCount && !agent.activeTrip) {
          agent.respawnCooldown = Math.max(0, agent.respawnCooldown - simDt);
          if (agent.respawnCooldown <= 0) {
            dispatchSingleVehicleTrip(agent, i, timeOfDayRef.current, st);
          }
        }

        if (!agent.mesh.visible || !agent.activeTrip) continue;

        const dirX = Math.sign(agent.targetX - agent.tileX);
        const dirZ = Math.sign(agent.targetZ - agent.tileZ);

        // Determine maximum allowed progress on current segment due to Traffic Light or Vehicle Queueing
        let maxAllowedProgress = 1.05;

        // 1) Check Signalized 4-Way or Major 3-Way Intersection Traffic Signal (Red or Yellow stops vehicles behind stop line & zebra crosswalk)
        if ((dirX !== 0 || dirZ !== 0) && isSignalizedIntersectionAt(agent.targetX, agent.targetZ)) {
          const activeSignal = dirZ !== 0 ? nsSignal : ewSignal;
          if (activeSignal !== 'green' && agent.progress <= 0.43) {
            maxAllowedProgress = Math.min(maxAllowedProgress, 0.36);
          }
        }

        // 2) Check spacing behind any vehicle ahead in the same right-hand lane
        for (let j = 0; j < trafficAgents.length; j++) {
          if (i === j) continue;
          const other = trafficAgents[j];
          if (!other.mesh.visible || !other.activeTrip) continue;

          // Same road segment & direction
          if (
            other.tileX === agent.tileX &&
            other.tileZ === agent.tileZ &&
            other.targetX === agent.targetX &&
            other.targetZ === agent.targetZ &&
            other.progress > agent.progress
          ) {
            const gap = other.progress - agent.progress;
            if (gap < 0.34) {
              maxAllowedProgress = Math.min(maxAllowedProgress, Math.max(0, other.progress - 0.34));
            }
          } else if (
            // Immediately ahead on the target tile moving in the same lane direction
            other.tileX === agent.targetX &&
            other.tileZ === agent.targetZ &&
            Math.sign(other.targetX - other.tileX) === dirX &&
            Math.sign(other.targetZ - other.tileZ) === dirZ
          ) {
            const gapAhead = other.progress + 1.0 - agent.progress;
            if (gapAhead < 0.34) {
              maxAllowedProgress = Math.min(maxAllowedProgress, Math.max(0, other.progress + 1.0 - 0.34));
            }
          }
        }

        const nextProgress = Math.min(maxAllowedProgress, agent.progress + simDt * agent.speed);
        const isWaiting = nextProgress <= agent.progress + 0.0005 && simDt > 0;
        agent.progress = nextProgress;

        // Brighten brake lights when stopped at Red/Yellow signal or in traffic queue
        const tailMesh = agent.mesh.getObjectByName('taillights') as THREE.Mesh | undefined;
        if (tailMesh && tailMesh.material instanceof THREE.MeshStandardMaterial) {
          tailMesh.material.emissiveIntensity = isWaiting ? 3.4 : 1.1;
        }

        if (agent.progress >= 1) {
          const prevTileX = agent.tileX;
          const prevTileZ = agent.tileZ;
          agent.prevX = prevTileX;
          agent.prevZ = prevTileZ;
          agent.tileX = agent.targetX;
          agent.tileZ = agent.targetZ;
          agent.progress = 0;
          agent.tilesDriven += 1;

          // Check if vehicle has arrived at its destination workplace (or completed its full planned route)
          const arrivedAtDest =
            (agent.tileX === agent.destX && agent.tileZ === agent.destZ) ||
            agent.routeIdx >= agent.routePath.length - 1;

          if (arrivedAtDest) {
            // Vehicle enters workplace / destination and disappears cleanly
            agent.mesh.visible = false;
            agent.activeTrip = false;
            agent.respawnCooldown = 1.4 + (i % 5) * 0.65;
            continue;
          }

          // Advance to next planned tile along the route to the workplace
          agent.routeIdx += 1;
          const nextPlanned = agent.routePath[agent.routeIdx];
          if (
            nextPlanned &&
            isRoadAt(nextPlanned.x, nextPlanned.z) &&
            Math.abs(nextPlanned.x - agent.tileX) + Math.abs(nextPlanned.z - agent.tileZ) === 1
          ) {
            agent.targetX = nextPlanned.x;
            agent.targetZ = nextPlanned.z;
          } else {
            // Road network changed mid-trip: recalculate shortest path from current tile to destination workplace
            const recalcPath = findRoadPathBFS(agent.tileX, agent.tileZ, agent.destX, agent.destZ, st);
            if (recalcPath.length >= 2) {
              agent.routePath = recalcPath;
              agent.routeIdx = 1;
              agent.targetX = recalcPath[1].x;
              agent.targetZ = recalcPath[1].z;
              agent.destX = recalcPath[recalcPath.length - 1].x;
              agent.destZ = recalcPath[recalcPath.length - 1].z;
            } else {
              // No remaining road forward -> arrive & despawn cleanly
              agent.mesh.visible = false;
              agent.activeTrip = false;
              agent.respawnCooldown = 1.5;
              continue;
            }
          }
        }

        const curTile = st.tiles[agent.tileZ * size + agent.tileX];
        const tgtTile = st.tiles[agent.targetZ * size + agent.targetX];
        if (curTile && tgtTile) {
          const p0 = getTileWorldPos(agent.tileX, agent.tileZ, curTile.elevation, size);
          const p1 = getTileWorldPos(agent.targetX, agent.targetZ, tgtTile.elevation, size);

          const curDirX = Math.sign(agent.targetX - agent.tileX);
          const curDirZ = Math.sign(agent.targetZ - agent.tileZ);

          // Right-hand traffic rule: 2-lane avenue (5.6m wide) uses 0.135 lane offset; 4-lane highway uses 0.20
          const isHwySeg = curTile.buildingId === 'road_highway' && tgtTile.buildingId === 'road_highway';
          const rightLaneOffset = isHwySeg ? 0.2 : 0.135;
          const targetLaneX = -curDirZ * rightLaneOffset;
          const targetLaneZ = curDirX * rightLaneOffset;
          agent.laneX = THREE.MathUtils.damp(agent.laneX, targetLaneX, 12, dt);
          agent.laneZ = THREE.MathUtils.damp(agent.laneZ, targetLaneZ, 12, dt);

          const cx = THREE.MathUtils.lerp(p0.wx, p1.wx, agent.progress) + agent.laneX;
          const cz = THREE.MathUtils.lerp(p0.wz, p1.wz, agent.progress) + agent.laneZ;

          // Sample exact curved terrain height beneath the car so it hugs hills seamlessly
          const onBridge = curTile.isBridge || tgtTile.isBridge;
          const sampledHere = sampleSmoothTerrain(cx + half, cz + half, st);
          const roadSurfaceY = onBridge
            ? Math.max(0.02, sampledHere.wy) + 0.245
            : Math.max(0.02, sampledHere.wy) + 0.018;

          agent.mesh.position.set(cx, roadSurfaceY, cz);

          if (curDirX !== 0 || curDirZ !== 0) {
            const targetYaw = Math.atan2(curDirX, curDirZ);
            // Shortest-angle yaw damping for smooth turns at corners & intersections
            let diff = targetYaw - agent.yaw;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            agent.yaw += diff * Math.min(1, dt * 14);
            agent.mesh.rotation.y = agent.yaw;

            // Pitch car slightly to match road slope ahead
            if (!onBridge) {
              const aheadSample = sampleSmoothTerrain(
                cx + half + curDirX * 0.18,
                cz + half + curDirZ * 0.18,
                st
              );
              const dy = Math.max(0.02, aheadSample.wy) - Math.max(0.02, sampledHere.wy);
              agent.mesh.rotation.x = THREE.MathUtils.clamp(-Math.atan2(dy, 0.18), -0.35, 0.35);
            } else {
              agent.mesh.rotation.x = 0;
            }
          }
        }
      }

      // Animate Wildlife Ecosystem: Forest Deer roaming & grazing, Flocking Birds circling above forests/rivers
      const wildlifeDt = dt * (st.status === 'paused' ? 0 : 1);
      for (let i = 0; i < deerAgents.length; i++) {
        const deer = deerAgents[i];
        if (!deer.mesh.visible) continue;
        deer.progress += wildlifeDt * deer.speed;
        if (deer.progress >= 1) {
          deer.tileX = deer.targetX;
          deer.tileZ = deer.targetZ;
          deer.progress = 0;

          // Pick an adjacent forest or grass tile
          const dirs = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
            [1, 1],
            [-1, -1],
          ];
          const validNext: Array<[number, number]> = [];
          for (const [ox, oz] of dirs) {
            const nx = deer.tileX + ox;
            const nz = deer.tileZ + oz;
            if (nx >= 0 && nx < size && nz >= 0 && nz < size) {
              const t = st.tiles[nz * size + nx];
              if (!t.isWater && !t.isCliff && !t.buildingId && t.trees > 0) {
                validNext.push([nx, nz]);
              }
            }
          }
          if (validNext.length > 0) {
            const [nx, nz] = validNext[Math.floor(Math.random() * validNext.length)];
            deer.targetX = nx;
            deer.targetZ = nz;
          }
        }

        const curTile = st.tiles[deer.tileZ * size + deer.tileX];
        const tgtTile = st.tiles[deer.targetZ * size + deer.targetX];
        if (curTile && tgtTile) {
          const p0 = getTileWorldPos(deer.tileX, deer.tileZ, curTile.elevation, size);
          const p1 = getTileWorldPos(deer.targetX, deer.targetZ, tgtTile.elevation, size);
          const cx = THREE.MathUtils.lerp(p0.wx, p1.wx, deer.progress);
          const cz = THREE.MathUtils.lerp(p0.wz, p1.wz, deer.progress);
          const bounce = Math.abs(Math.sin(now * 0.008 + deer.phaseOffset)) * 0.025;
          const cy = Math.max(0.05, THREE.MathUtils.lerp(p0.wy, p1.wy, deer.progress)) + bounce;
          deer.mesh.position.set(cx, cy, cz);
          if (deer.targetX !== deer.tileX || deer.targetZ !== deer.tileZ) {
            deer.mesh.rotation.y = Math.atan2(p1.wx - p0.wx, p1.wz - p0.wz);
          }
          const headObj = deer.mesh.getObjectByName('deer_head');
          if (headObj) {
            headObj.rotation.x = Math.sin(now * 0.004 + deer.phaseOffset) * 0.25;
          }
        }
      }

      for (let i = 0; i < birdAgents.length; i++) {
        const bird = birdAgents[i];
        if (!bird.mesh.visible) continue;
        bird.angle += wildlifeDt * bird.speed * 0.45;
        const bx = bird.centerX + Math.cos(bird.angle) * bird.radius;
        const bz = bird.centerZ + Math.sin(bird.angle) * bird.radius;
        const by = bird.altitude + Math.sin(now * 0.003 + bird.flapPhase) * 0.22;
        bird.mesh.position.set(bx, by, bz);
        // Face tangent direction of circular flight
        bird.mesh.rotation.y = -bird.angle;

        const flap = Math.sin(now * 0.018 + bird.flapPhase) * 0.55;
        const leftWing = bird.mesh.getObjectByName('left_wing');
        const rightWing = bird.mesh.getObjectByName('right_wing');
        if (leftWing) leftWing.rotation.z = flap;
        if (rightWing) rightWing.rotation.z = -flap;
      }

      // Update pooled particles in-place
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = particlePool[i];
        if (p.active) {
          p.life += dt;
          if (p.life >= p.maxLife) {
            p.active = false;
            _dummyObj.position.set(0, -100, 0);
            _dummyObj.scale.setScalar(0.001);
            _dummyObj.updateMatrix();
            particleInstanced.setMatrixAt(i, _dummyObj.matrix);
          } else {
            p.vy -= 9.8 * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.z += p.vz * dt;
            const s = p.scale * (1 - p.life / p.maxLife);
            _dummyObj.position.set(p.x, Math.max(0.02, p.y), p.z);
            _dummyObj.rotation.set(p.life * 6, p.life * 4, 0);
            _dummyObj.scale.setScalar(s);
            _dummyObj.updateMatrix();
            particleInstanced.setMatrixAt(i, _dummyObj.matrix);
            _colorScratch.setHex(p.colorHex);
            particleInstanced.setColorAt(i, _colorScratch);
          }
        } else {
          _dummyObj.position.set(0, -100, 0);
          _dummyObj.scale.setScalar(0.001);
          _dummyObj.updateMatrix();
          particleInstanced.setMatrixAt(i, _dummyObj.matrix);
        }
      }
      particleInstanced.instanceMatrix.needsUpdate = true;
      if (particleInstanced.instanceColor) particleInstanced.instanceColor.needsUpdate = true;

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    void ensureCustomModModelsLoaded(simStateRef.current.mods);
    const unsubscribeCustomModels = subscribeCustomModelsUpdated(() => {
      rebuildSceneGeometry();
      if (pendingTouchPlacementRef.current) {
        syncPendingTouchPreviewTriggerRef.current?.(pendingTouchPlacementRef.current);
      }
    });

    tick();

    return () => {
      unsubscribeCustomModels();
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('pointerup', handlePointerUp);
      clearTouchGraceTimer();
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('contextmenu', handleContextMenu);
      renderer.domElement.removeEventListener('touchstart', handleTouchStart);
      renderer.domElement.removeEventListener('touchend', handleTouchEnd);
      renderer.domElement.removeEventListener('touchcancel', handleTouchEnd);
      renderer.domElement.removeEventListener('touchmove', handleTouchMove);
      controls.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={canvasMountRef}
      className="fixed inset-0 w-screen h-screen overflow-hidden z-0"
      aria-label="3D City Region Viewport"
    />
  );
};
