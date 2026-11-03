import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import {
  Custom3DAssetCategory,
  Custom3DModelConfig,
  Custom3DModelFormat,
  ModPackage,
} from './types';

const IDB_NAME = 'MetroTerra3DModelsDB';
const IDB_VERSION = 1;
const IDB_STORE = 'models';

interface StoredModelRecord {
  storageKey: string;
  buffer: ArrayBuffer;
  format: Custom3DModelFormat;
  fileName?: string;
  updatedAt: number;
}

// In-memory normalized base templates keyed by storageKey + assetCategory
const _normalizedModelCache = new Map<string, THREE.Group>();
const _loadingPromises = new Map<string, Promise<THREE.Group | null>>();
const _updateListeners = new Set<() => void>();

export function subscribeCustomModelsUpdated(listener: () => void): () => void {
  _updateListeners.add(listener);
  return () => {
    _updateListeners.delete(listener);
  };
}

function notifyCustomModelsUpdated(): void {
  _updateListeners.forEach((cb) => {
    try {
      cb();
    } catch (err) {
      console.error('Error in custom model update listener:', err);
    }
  });
}

function openModelsDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'storageKey' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveModelBufferToIDB(
  storageKey: string,
  buffer: ArrayBuffer,
  format: Custom3DModelFormat,
  fileName?: string
): Promise<void> {
  try {
    const db = await openModelsDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const record: StoredModelRecord = {
        storageKey,
        buffer,
        format,
        fileName,
        updatedAt: Date.now(),
      };
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    db.close();
  } catch (err) {
    console.warn('Could not persist 3D model to IndexedDB:', err);
  }
}

export async function loadModelBufferFromIDB(
  storageKey: string
): Promise<StoredModelRecord | null> {
  try {
    const db = await openModelsDB();
    const result = await new Promise<StoredModelRecord | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(storageKey);
      req.onsuccess = () => resolve((req.result as StoredModelRecord) || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch {
    return null;
  }
}

export function detectModelFormatFromName(nameOrUrl: string): Custom3DModelFormat {
  const lower = nameOrUrl.split('?')[0].toLowerCase().trim();
  if (lower.endsWith('.obj')) return 'obj';
  if (lower.endsWith('.gltf')) return 'gltf';
  return 'glb';
}

/**
 * Generates a real Wavefront .OBJ ASCII buffer for 3 built-in sample models
 * so users can test the 3D Asset Studio immediately on any device without needing external files.
 */
export function createBuiltInSampleObjBuffer(
  sampleId: 'sample_skyscraper' | 'sample_sportscar' | 'sample_landmark'
): { buffer: ArrayBuffer; fileName: string; defaultCategory: Custom3DAssetCategory; defaultTitle: string; defaultBldgName: string } {
  const lines: string[] = ['# MetroTerra 3D Sample Wavefront OBJ'];
  let vertOffset = 1;

  const addBox = (
    cx: number,
    cy: number,
    cz: number,
    sx: number,
    sy: number,
    sz: number,
    groupName: string
  ) => {
    lines.push(`g ${groupName}`);
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const verts = [
      [cx - hx, cy - hy, cz + hz],
      [cx + hx, cy - hy, cz + hz],
      [cx + hx, cy + hy, cz + hz],
      [cx - hx, cy + hy, cz + hz],
      [cx - hx, cy - hy, cz - hz],
      [cx + hx, cy - hy, cz - hz],
      [cx + hx, cy + hy, cz - hz],
      [cx - hx, cy + hy, cz - hz],
    ];
    for (const [vx, vy, vz] of verts) {
      lines.push(`v ${vx.toFixed(4)} ${vy.toFixed(4)} ${vz.toFixed(4)}`);
    }
    const o = vertOffset;
    // 6 quad faces
    lines.push(`f ${o} ${o + 1} ${o + 2} ${o + 3}`);
    lines.push(`f ${o + 5} ${o + 4} ${o + 7} ${o + 6}`);
    lines.push(`f ${o + 4} ${o} ${o + 3} ${o + 7}`);
    lines.push(`f ${o + 1} ${o + 5} ${o + 6} ${o + 2}`);
    lines.push(`f ${o + 3} ${o + 2} ${o + 6} ${o + 7}`);
    lines.push(`f ${o + 4} ${o + 5} ${o + 1} ${o}`);
    vertOffset += 8;
  };

  if (sampleId === 'sample_skyscraper') {
    // Stepped futuristic crystal skyscraper with podium, twin setbacks, skybridge, and spire
    addBox(0, 1.0, 0, 7.2, 2.0, 7.2, 'podium_base');
    addBox(0, 6.0, 0, 5.2, 8.0, 5.2, 'lower_tower');
    addBox(0, 13.0, 0, 3.8, 6.0, 3.8, 'mid_tower');
    addBox(-1.6, 8.5, 0, 1.4, 9.0, 3.2, 'west_wing');
    addBox(1.6, 8.5, 0, 1.4, 9.0, 3.2, 'east_wing');
    addBox(0, 17.5, 0, 2.4, 3.0, 2.4, 'crown_core');
    addBox(0, 20.5, 0, 0.45, 3.5, 0.45, 'spire_antenna');
    const text = lines.join('\n');
    return {
      buffer: new TextEncoder().encode(text).buffer,
      fileName: 'crystal_arcology_tower.obj',
      defaultCategory: 'building',
      defaultTitle: 'Crystal Horizon Tower 3D Mod',
      defaultBldgName: 'ตึกระฟ้าคริสตัลฮอไรซัน',
    };
  }

  if (sampleId === 'sample_sportscar') {
    // Sleek aerodynamic GT sports car (+Z is forward in MetroTerra traffic)
    addBox(0, 0.42, 0, 1.85, 0.42, 4.1, 'chassis_body');
    addBox(0, 0.52, 1.65, 1.75, 0.26, 0.85, 'front_hood_splitter');
    addBox(0, 0.82, -0.15, 1.48, 0.42, 1.75, 'aero_cabin_glass');
    addBox(0, 0.88, -1.78, 1.78, 0.12, 0.42, 'rear_gt_spoiler');
    addBox(-0.72, 0.68, -1.75, 0.12, 0.32, 0.32, 'spoiler_strut_l');
    addBox(0.72, 0.68, -1.75, 0.12, 0.32, 0.32, 'spoiler_strut_r');
    addBox(-0.92, 0.28, 1.25, 0.32, 0.56, 0.68, 'wheel_fl');
    addBox(0.92, 0.28, 1.25, 0.32, 0.56, 0.68, 'wheel_fr');
    addBox(-0.92, 0.28, -1.25, 0.32, 0.56, 0.68, 'wheel_rl');
    addBox(0.92, 0.28, -1.25, 0.32, 0.56, 0.68, 'wheel_rr');
    const text = lines.join('\n');
    return {
      buffer: new TextEncoder().encode(text).buffer,
      fileName: 'cyber_gt_sportscar.obj',
      defaultCategory: 'vehicle',
      defaultTitle: 'Cyber GT Sports Car Traffic Mod',
      defaultBldgName: 'รถสปอร์ต Cyber GT',
    };
  }

  // Landmark / Prop sculpture
  addBox(0, 0.4, 0, 6.5, 0.8, 6.5, 'plaza_pedestal');
  addBox(0, 1.2, 0, 4.2, 0.8, 4.2, 'inner_steps');
  addBox(-1.4, 4.5, -1.4, 0.7, 5.8, 0.7, 'pillar_nw');
  addBox(1.4, 4.5, -1.4, 0.7, 5.8, 0.7, 'pillar_ne');
  addBox(-1.4, 4.5, 1.4, 0.7, 5.8, 0.7, 'pillar_sw');
  addBox(1.4, 4.5, 1.4, 0.7, 5.8, 0.7, 'pillar_se');
  addBox(0, 7.6, 0, 4.4, 0.7, 4.4, 'arch_roof_ring');
  addBox(0, 5.0, 0, 1.5, 4.2, 1.5, 'central_golden_obelisk');
  addBox(0, 9.2, 0, 1.2, 1.8, 1.2, 'apex_beacon');
  const text = lines.join('\n');
  return {
    buffer: new TextEncoder().encode(text).buffer,
    fileName: 'golden_civic_monument.obj',
    defaultCategory: 'prop',
    defaultTitle: 'Golden Metropolis Monument Mod',
    defaultBldgName: 'อนุสาวรีย์มหานครทองคำ',
  };
}

/**
 * Parses an ArrayBuffer into a raw THREE.Group using GLTFLoader or OBJLoader.
 */
export async function parseModelArrayBuffer(
  buffer: ArrayBuffer,
  format: Custom3DModelFormat
): Promise<THREE.Group> {
  if (format === 'obj') {
    const text = new TextDecoder().decode(buffer);
    const objLoader = new OBJLoader();
    const objGroup = objLoader.parse(text);
    return objGroup;
  }

  const gltfLoader = new GLTFLoader();
  return new Promise<THREE.Group>((resolve, reject) => {
    gltfLoader.parse(
      buffer,
      '',
      (gltf) => {
        resolve(gltf.scene || new THREE.Group());
      },
      (err) => {
        reject(err);
      }
    );
  });
}

/**
 * Normalizes an imported 3D model so its X/Z center sits at (0, 0),
 * its lowest point rests flush at Y = 0, and its base scale matches
 * MetroTerra's world grid (1.0 unit = 1 tile for buildings/props, 0.25 unit for vehicles).
 */
export function normalizeParsedModelGroup(
  rawScene: THREE.Group,
  category: Custom3DAssetCategory
): THREE.Group {
  const wrapper = new THREE.Group();
  const cloned = rawScene.clone(true);

  // Ensure matrices are up to date before measuring bounding box
  cloned.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(cloned);

  if (box.isEmpty()) {
    // Fallback safety cube if file had no valid geometry
    const fallback = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.4, metalness: 0.3 })
    );
    fallback.position.y = 0.25;
    wrapper.add(fallback);
    return wrapper;
  }

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // Target dimension in world units (1 tile = 1.0 world unit)
  let targetScale = 1.0;
  if (category === 'vehicle') {
    const maxHoriz = Math.max(size.x, size.z, 0.001);
    targetScale = 0.25 / maxHoriz;
  } else if (category === 'prop') {
    const maxDim = Math.max(size.x, size.z, size.y * 0.65, 0.001);
    targetScale = 0.68 / maxDim;
  } else {
    // Building: fit X/Z footprint comfortably on a 1x1 tile (~0.76 units wide) while keeping reasonable height
    const footprint = Math.max(size.x, size.z, 0.001);
    const heightClamp = size.y > footprint * 3.5 ? (footprint * 3.5) / size.y : 1.0;
    targetScale = (0.74 / footprint) * Math.max(0.45, heightClamp);
  }

  // Shift cloned model so X/Z center is at 0 and bottom min.y is at 0
  cloned.position.set(
    -center.x * targetScale,
    -box.min.y * targetScale,
    -center.z * targetScale
  );
  cloned.scale.setScalar(targetScale);

  // Configure shadows & PBR material defaults
  let meshIndex = 0;
  cloned.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const mat = mesh.material;
      if (mat) {
        const mats = Array.isArray(mat) ? mat : [mat];
        const upgradedMats = mats.map((m) => {
          const std = m as THREE.MeshStandardMaterial;
          if (std.map) {
            std.map.colorSpace = THREE.SRGBColorSpace;
          }
          // If imported from OBJ (MeshPhongMaterial or default white unlit), convert to clean PBR MeshStandardMaterial
          if (!(m instanceof THREE.MeshStandardMaterial) && !(m instanceof THREE.MeshPhysicalMaterial)) {
            const oldColor = (m as any).color instanceof THREE.Color ? (m as any).color.clone() : new THREE.Color(0xe2e8f0);
            const newMat = new THREE.MeshStandardMaterial({
              color: oldColor,
              map: (m as any).map || null,
              roughness: 0.45,
              metalness: 0.25,
            });
            newMat.userData = { isDefaultUntinted: oldColor.getHex() === 0xffffff, partIndex: meshIndex };
            return newMat;
          }
          return m;
        });
        mesh.material = Array.isArray(mat) ? upgradedMats : upgradedMats[0];
      }
      meshIndex++;
    }
  });

  wrapper.add(cloned);

  // If this is a traffic vehicle model, ensure it has headlights & brake taillights for night/red-signal realism
  if (category === 'vehicle' && !wrapper.getObjectByName('taillights')) {
    const tailMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.2,
      metalness: 0.1,
      emissive: new THREE.Color(0xff2a2a),
      emissiveIntensity: 1.1,
    });
    const taillights = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.016, 0.014), tailMat);
    taillights.name = 'taillights';
    taillights.position.set(0, 0.036, -0.122);
    wrapper.add(taillights);

    const headMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      roughness: 0.2,
      metalness: 0.1,
      emissive: new THREE.Color(0xfef08a),
      emissiveIntensity: 1.1,
    });
    const headlights = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.016, 0.014), headMat);
    headlights.position.set(0, 0.036, 0.122);
    wrapper.add(headlights);
  }

  return wrapper;
}

function getCacheKey(storageKey: string, category: Custom3DAssetCategory): string {
  return `${storageKey}::${category}`;
}

/**
 * Registers a pre-parsed raw model into the in-memory normalized cache and notifies the 3D scene.
 */
export function registerNormalizedCustomModel(
  storageKey: string,
  category: Custom3DAssetCategory,
  rawGroup: THREE.Group
): THREE.Group {
  const normalized = normalizeParsedModelGroup(rawGroup, category);
  _normalizedModelCache.set(getCacheKey(storageKey, category), normalized);
  notifyCustomModelsUpdated();
  return normalized;
}

/**
 * Loads a custom 3D model from IndexedDB or sourceUrl if not already cached.
 */
export async function loadAndCacheCustomModel(
  config: Custom3DModelConfig
): Promise<THREE.Group | null> {
  const cacheKey = getCacheKey(config.storageKey, config.assetCategory);
  const existing = _normalizedModelCache.get(cacheKey);
  if (existing) return existing;

  const inflight = _loadingPromises.get(cacheKey);
  if (inflight) return inflight;

  const loadPromise = (async (): Promise<THREE.Group | null> => {
    try {
      // 1. Check built-in sample keys first
      if (
        config.storageKey === 'sample_skyscraper' ||
        config.storageKey === 'sample_sportscar' ||
        config.storageKey === 'sample_landmark'
      ) {
        const sample = createBuiltInSampleObjBuffer(config.storageKey);
        const raw = await parseModelArrayBuffer(sample.buffer, 'obj');
        return registerNormalizedCustomModel(config.storageKey, config.assetCategory, raw);
      }

      // 2. Try loading binary ArrayBuffer from IndexedDB
      const idbRecord = await loadModelBufferFromIDB(config.storageKey);
      if (idbRecord && idbRecord.buffer) {
        const raw = await parseModelArrayBuffer(idbRecord.buffer, idbRecord.format);
        return registerNormalizedCustomModel(config.storageKey, config.assetCategory, raw);
      }

      // 3. Fallback to fetching from external sourceUrl if provided
      if (config.sourceUrl) {
        const resp = await fetch(config.sourceUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const buffer = await resp.arrayBuffer();
        await saveModelBufferToIDB(config.storageKey, buffer, config.modelFormat, config.fileName);
        const raw = await parseModelArrayBuffer(buffer, config.modelFormat);
        return registerNormalizedCustomModel(config.storageKey, config.assetCategory, raw);
      }

      return null;
    } catch (err) {
      console.warn(`Failed to load custom 3D model (${config.storageKey}):`, err);
      return null;
    } finally {
      _loadingPromises.delete(cacheKey);
    }
  })();

  _loadingPromises.set(cacheKey, loadPromise);
  return loadPromise;
}

/**
 * Ensures all enabled custom 3D models in the ModPackage list are loaded into memory.
 */
export async function ensureCustomModModelsLoaded(mods: ModPackage[]): Promise<void> {
  const tasks: Array<Promise<THREE.Group | null>> = [];
  for (const mod of mods) {
    const cm = mod.customModel || mod.building.customModel;
    if (cm && cm.storageKey) {
      tasks.push(loadAndCacheCustomModel(cm));
    }
  }
  if (tasks.length > 0) {
    await Promise.allSettled(tasks);
  }
}

/**
 * Synchronously retrieves a cloned, transformed THREE.Group for a custom 3D model
 * if it is ready in the cache. If not yet in cache, triggers async background loading.
 */
export function getCachedCustomModelClone(
  config: Custom3DModelConfig,
  primaryColor?: string,
  accentColor?: string
): THREE.Group | null {
  const cacheKey = getCacheKey(config.storageKey, config.assetCategory);
  const template = _normalizedModelCache.get(cacheKey);
  if (!template) {
    // Trigger background load so it pops in as soon as IndexedDB/URL resolves
    void loadAndCacheCustomModel(config);
    return null;
  }

  const instance = template.clone(true);
  const scale = Number.isFinite(config.scaleMultiplier)
    ? Math.max(0.15, Math.min(4.0, config.scaleMultiplier))
    : 1.0;
  const yOffset = Number.isFinite(config.yOffset)
    ? Math.max(-1.0, Math.min(2.0, config.yOffset))
    : 0;
  const rotRad = ((config.rotationY || 0) * Math.PI) / 180;

  instance.scale.setScalar(scale);
  instance.position.y += yOffset;
  instance.rotation.y = rotRad;

  // Apply custom primary/accent tint to untinted OBJ parts so user color pickers work naturally
  if (primaryColor || accentColor) {
    const pCol = new THREE.Color(primaryColor || '#0284c7');
    const aCol = new THREE.Color(accentColor || '#38bdf8');
    const glassCol = new THREE.Color('#bae6fd');

    instance.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.name === 'taillights') return;
        const m = mesh.material as THREE.MeshStandardMaterial;
        if (m && m.userData?.isDefaultUntinted) {
          const partIdx = Number(m.userData.partIndex || 0);
          const clonedMat = m.clone();
          if (partIdx % 3 === 0) {
            clonedMat.color.copy(pCol);
            clonedMat.roughness = 0.45;
            clonedMat.metalness = 0.3;
          } else if (partIdx % 3 === 1) {
            clonedMat.color.copy(glassCol);
            clonedMat.roughness = 0.18;
            clonedMat.metalness = 0.82;
          } else {
            clonedMat.color.copy(aCol);
            clonedMat.roughness = 0.3;
            clonedMat.metalness = 0.55;
          }
          mesh.material = clonedMat;
        }
      }
    });
  }

  return instance;
}
