import * as THREE from 'three';
import { getCachedCustomModelClone } from './customModels';
import { buildCustomLot3DGroup } from './lotBuilder3D';
import { BuildingDefinition, Custom3DModelConfig, TileData } from './types';

// Shared geometry & material caches to avoid redundant allocations
const _geoCache = new Map<string, THREE.BufferGeometry>();
const _matCache = new Map<string, THREE.Material>();

function getBoxGeo(w: number, h: number, d: number): THREE.BoxGeometry {
  const key = `box_${w.toFixed(2)}_${h.toFixed(2)}_${d.toFixed(2)}`;
  let g = _geoCache.get(key) as THREE.BoxGeometry | undefined;
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    _geoCache.set(key, g);
  }
  return g;
}

function getCylGeo(rt: number, rb: number, h: number, seg = 12): THREE.CylinderGeometry {
  const key = `cyl_${rt.toFixed(2)}_${rb.toFixed(2)}_${h.toFixed(2)}_${seg}`;
  let g = _geoCache.get(key) as THREE.CylinderGeometry | undefined;
  if (!g) {
    g = new THREE.CylinderGeometry(rt, rb, h, seg);
    _geoCache.set(key, g);
  }
  return g;
}

function getStdMat(
  color: string | number,
  roughness: number,
  metalness: number,
  emissive?: string | number,
  emissiveIntensity = 0
): THREE.MeshStandardMaterial {
  const key = `std_${color}_${roughness.toFixed(2)}_${metalness.toFixed(2)}_${emissive ?? 0}_${emissiveIntensity}`;
  let m = _matCache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      emissive: emissive !== undefined ? new THREE.Color(emissive) : new THREE.Color(0x000000),
      emissiveIntensity,
    });
    _matCache.set(key, m);
  }
  return m;
}

// Procedural CanvasTextures for realistic grass, rock, sandy shoreline, and mirror water ripples
export function createProceduralTerrainBumpTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(512, 512);
  const data = imgData.data;

  // Seamless multi-frequency organic bump relief (grass blades + rock strata + sand ripples)
  const twoPi = Math.PI * 2;
  for (let y = 0; y < 512; y++) {
    const ny = (y / 512) * twoPi;
    for (let x = 0; x < 512; x++) {
      const nx = (x / 512) * twoPi;
      const wave1 = Math.sin(nx * 4 + Math.cos(ny * 3)) * 18;
      const wave2 = Math.cos(nx * 11 - ny * 9) * 12;
      const wave3 = Math.sin(nx * 23 + ny * 19) * 9;
      // Fine deterministic micro-grain
      const hash = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const grain = ((hash - Math.floor(hash)) - 0.5) * 28;
      const val = Math.max(0, Math.min(255, Math.round(128 + wave1 + wave2 + wave3 + grain)));
      const idx = (y * 512 + x) * 4;
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(18, 18);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createProceduralTerrainDetailTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(512, 512);
  const data = imgData.data;

  // Seamless organic detail map that multiplies cleanly with smooth biome vertex colors
  const twoPi = Math.PI * 2;
  for (let y = 0; y < 512; y++) {
    const ny = (y / 512) * twoPi;
    for (let x = 0; x < 512; x++) {
      const nx = (x / 512) * twoPi;
      const patch =
        Math.sin(nx * 3 + Math.sin(ny * 4)) * 0.5 +
        Math.cos(nx * 9 - ny * 7) * 0.3 +
        Math.sin(nx * 21 + ny * 25) * 0.2;
      const hash = Math.sin(x * 93.17 + y * 47.53) * 19531.29;
      const micro = (hash - Math.floor(hash)) - 0.5;

      // Subtle warm/cool organic modulation around bright neutral white (232..255)
      const base = Math.max(198, Math.min(255, Math.round(234 + patch * 16 + micro * 18)));
      const r = Math.min(255, base + Math.round(patch * 4));
      const g = Math.min(255, base + 2);
      const b = Math.max(185, base - Math.round(patch * 5));

      const idx = (y * 512 + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createProceduralWaterNormalTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(256, 256);
  const data = imgData.data;

  const twoPi = Math.PI * 2;
  for (let y = 0; y < 256; y++) {
    const ny = (y / 256) * twoPi;
    for (let x = 0; x < 256; x++) {
      const nx = (x / 256) * twoPi;
      const ripple =
        Math.sin(nx * 6 + Math.cos(ny * 4)) * 38 +
        Math.cos(nx * 14 - ny * 11) * 24 +
        Math.sin(nx * 22 + ny * 18) * 14;
      const val = Math.max(0, Math.min(255, Math.round(128 + ripple)));
      const idx = (y * 256 + x) * 4;
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(22, 22);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createContactShadowDisc(): THREE.Mesh {
  const key = 'contact_shadow_disc';
  let geo = _geoCache.get(key) as THREE.CircleGeometry | undefined;
  if (!geo) {
    geo = new THREE.CircleGeometry(0.46, 20);
    geo.rotateX(-Math.PI / 2);
    _geoCache.set(key, geo);
  }
  let mat = _matCache.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({
      color: 0x020617,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    _matCache.set(key, mat);
  }
  const disc = new THREE.Mesh(geo, mat);
  disc.position.y = 0.015;
  return disc;
}

/**
 * Builds a composite 4-12 part procedural 3D model for any building or infrastructure tile.
 * Unit scale: 1 tile = 1.0 world unit (= 10 meters in simulation).
 * Pivoted at bottom-center (y = 0) flush with the terrain tile surface, with a deep sub-skirt
 * so structures sit seamlessly on curved hills without floating edges.
 */
// Shared dynamic materials for 4-Way Intersection Traffic Signals (Red / Yellow / Green)
export interface TrafficSignalMaterialSet {
  nsRed: THREE.MeshStandardMaterial;
  nsYellow: THREE.MeshStandardMaterial;
  nsGreen: THREE.MeshStandardMaterial;
  ewRed: THREE.MeshStandardMaterial;
  ewYellow: THREE.MeshStandardMaterial;
  ewGreen: THREE.MeshStandardMaterial;
}

let _trafficSignalMats: TrafficSignalMaterialSet | null = null;

export function getTrafficSignalMaterials(): TrafficSignalMaterialSet {
  if (!_trafficSignalMats) {
    const makeLamp = (hex: number) =>
      new THREE.MeshStandardMaterial({
        color: hex,
        roughness: 0.2,
        metalness: 0.1,
        emissive: new THREE.Color(hex),
        emissiveIntensity: 0.05,
      });
    _trafficSignalMats = {
      nsRed: makeLamp(0xff2a2a),
      nsYellow: makeLamp(0xfacc15),
      nsGreen: makeLamp(0x22c55e),
      ewRed: makeLamp(0xff2a2a),
      ewYellow: makeLamp(0xfacc15),
      ewGreen: makeLamp(0x22c55e),
    };
  }
  return _trafficSignalMats;
}

export function updateTrafficSignalMaterials(
  nsState: 'green' | 'yellow' | 'red',
  ewState: 'green' | 'yellow' | 'red'
): void {
  const mats = getTrafficSignalMaterials();

  const applyLamp = (mat: THREE.MeshStandardMaterial, activeHex: number, isOn: boolean) => {
    mat.color.setHex(isOn ? activeHex : 0x1e293b);
    mat.emissive.setHex(isOn ? activeHex : 0x0f172a);
    mat.emissiveIntensity = isOn ? 3.2 : 0.04;
  };

  applyLamp(mats.nsRed, 0xff2a2a, nsState === 'red');
  applyLamp(mats.nsYellow, 0xfacc15, nsState === 'yellow');
  applyLamp(mats.nsGreen, 0x22c55e, nsState === 'green');

  applyLamp(mats.ewRed, 0xff2a2a, ewState === 'red');
  applyLamp(mats.ewYellow, 0xfacc15, ewState === 'yellow');
  applyLamp(mats.ewGreen, 0x22c55e, ewState === 'green');
}

const _roadTexCache = new Map<string, THREE.MeshStandardMaterial>();

/**
 * Generates a seamless 256x256 procedural road asphalt & sidewalk CanvasTexture
 * tailored to the exact 4-neighbor connectivity (N, S, E, W).
 * Specifically draws seamless Zebra Crosswalks (ทางม้าลาย) and Stop Lines ONLY at 4-way intersections.
 */
function getRoadTopologyMaterial(
  isHighway: boolean,
  neighbors: { n: boolean; s: boolean; e: boolean; w: boolean }
): THREE.MeshStandardMaterial {
  let { n, s, e, w } = neighbors;
  if (!n && !s && !e && !w) {
    e = true;
    w = true;
  }
  const key = `road_mat_v2_${isHighway ? 'hwy' : 'ave'}_${n ? 1 : 0}${s ? 1 : 0}${e ? 1 : 0}${w ? 1 : 0}`;
  const cached = _roadTexCache.get(key);
  if (cached) return cached;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // 1 tile = 10m (256px).
  // 2-lane road (road_avenue) is strictly <= 6m wide: 144px / 256px = 5.625m (roadMin=56, roadMax=200).
  // 4-lane highway (road_highway) is 7.8m wide: 200px / 256px (roadMin=28, roadMax=228).
  const roadMin = isHighway ? 28 : 56;
  const roadMax = isHighway ? 228 : 200;
  const roadWidth = roadMax - roadMin;
  const half = 128;
  const connCount = (n ? 1 : 0) + (s ? 1 : 0) + (e ? 1 : 0) + (w ? 1 : 0);
  const isFourWay = connCount === 4;
  const isThreeWay = connCount === 3;

  // 1. Concrete Sidewalk / Shoulder base across full tile
  ctx.fillStyle = isHighway ? '#475569' : '#64748b';
  ctx.fillRect(0, 0, size, size);

  // Subtle sidewalk paving joints
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.18)';
  ctx.lineWidth = 2;
  for (let p = 32; p < size; p += 32) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  // 2. Seamless Asphalt Carriageway
  const asphaltColor = isHighway ? '#161f2e' : '#1e2633';
  ctx.fillStyle = asphaltColor;

  const isCornerOnly =
    (n && e && !s && !w) ||
    (n && w && !s && !e) ||
    (s && e && !n && !w) ||
    (s && w && !n && !e);

  if (isCornerOnly) {
    // Smooth curved corner asphalt & curb
    const pivotX = e ? size : 0;
    const pivotY = s ? size : 0;

    // Draw outer concrete curb border arc first
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, roadMax + 5, 0, Math.PI * 2);
    ctx.fillStyle = '#94a3b8';
    ctx.fill();

    // Draw smooth asphalt road band between inner curb (roadMin) and outer curb (roadMax)
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, roadMax, 0, Math.PI * 2);
    ctx.fillStyle = asphaltColor;
    ctx.fill();

    // Restore inner sidewalk corner with curb trim
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, roadMin, 0, Math.PI * 2);
    ctx.fillStyle = '#94a3b8';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, Math.max(0, roadMin - 5), 0, Math.PI * 2);
    ctx.fillStyle = isHighway ? '#475569' : '#64748b';
    ctx.fill();
  } else {
    // Standard straight, T-junction, dead-end, or 4-way intersection
    ctx.fillStyle = asphaltColor;
    ctx.fillRect(roadMin, roadMin, roadWidth, roadWidth);
    if (n) ctx.fillRect(roadMin, 0, roadWidth, half);
    if (s) ctx.fillRect(roadMin, half, roadWidth, half);
    if (w) ctx.fillRect(0, roadMin, half, roadWidth);
    if (e) ctx.fillRect(half, roadMin, half, roadWidth);
  }

  // 3. Realistic fine asphalt aggregate speckle across dark asphalt pixels
  const imgData = ctx.getImageData(0, 0, size, size);
  const data = imgData.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      if (data[idx] < 48 && data[idx + 1] < 55) {
        const hash = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        const grain = Math.round(((hash - Math.floor(hash)) - 0.5) * 16);
        data[idx] = Math.max(12, Math.min(60, data[idx] + grain));
        data[idx + 1] = Math.max(16, Math.min(68, data[idx + 1] + grain));
        data[idx + 2] = Math.max(22, Math.min(82, data[idx + 2] + grain));
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);

  // 4. Outer Shoulder Edge Lines & Concrete Curb Highlights (non-corner tiles)
  if (!isCornerOnly) {
    const edgeColor = isHighway ? '#f59e0b' : '#cbd5e1';
    ctx.strokeStyle = edgeColor;
    ctx.lineWidth = 3;

    // Closed sides get continuous shoulder line across central box
    if (!n) {
      ctx.beginPath();
      ctx.moveTo(roadMin, roadMin + 4);
      ctx.lineTo(roadMax, roadMin + 4);
      ctx.stroke();
    }
    if (!s) {
      ctx.beginPath();
      ctx.moveTo(roadMin, roadMax - 4);
      ctx.lineTo(roadMax, roadMax - 4);
      ctx.stroke();
    }
    if (!w) {
      ctx.beginPath();
      ctx.moveTo(roadMin + 4, roadMin);
      ctx.lineTo(roadMin + 4, roadMax);
      ctx.stroke();
    }
    if (!e) {
      ctx.beginPath();
      ctx.moveTo(roadMax - 4, roadMin);
      ctx.lineTo(roadMax - 4, roadMax);
      ctx.stroke();
    }

    // Open arms get shoulder lines along their outer edges so they connect seamlessly at tile borders
    if (n) {
      ctx.beginPath();
      ctx.moveTo(roadMin + 4, 0);
      ctx.lineTo(roadMin + 4, w ? roadMin + 4 : half);
      ctx.moveTo(roadMax - 4, 0);
      ctx.lineTo(roadMax - 4, e ? roadMin + 4 : half);
      ctx.stroke();
    }
    if (s) {
      ctx.beginPath();
      ctx.moveTo(roadMin + 4, size);
      ctx.lineTo(roadMin + 4, w ? roadMax - 4 : half);
      ctx.moveTo(roadMax - 4, size);
      ctx.lineTo(roadMax - 4, e ? roadMax - 4 : half);
      ctx.stroke();
    }
    if (w) {
      ctx.beginPath();
      ctx.moveTo(0, roadMin + 4);
      ctx.lineTo(n ? roadMin + 4 : half, roadMin + 4);
      ctx.moveTo(0, roadMax - 4);
      ctx.lineTo(s ? roadMin + 4 : half, roadMax - 4);
      ctx.stroke();
    }
    if (e) {
      ctx.beginPath();
      ctx.moveTo(size, roadMin + 4);
      ctx.lineTo(n ? roadMax - 4 : half, roadMin + 4);
      ctx.moveTo(size, roadMax - 4);
      ctx.lineTo(s ? roadMax - 4 : half, roadMax - 4);
      ctx.stroke();
    }
  } else {
    // Curved shoulder lines for 2-way corner turns
    const pivotX = e ? size : 0;
    const pivotY = s ? size : 0;
    ctx.strokeStyle = isHighway ? '#f59e0b' : '#cbd5e1';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, roadMax - 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, roadMin + 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 5. Center Lane Markings & Zebra Crosswalks at BOTH 4-Way Intersections AND 3-Way T-Junctions
  const centerLineColor = isHighway ? '#facc15' : '#fcd34d';

  if (isFourWay || isThreeWay) {
    // Draw short center divider stubs at each connected edge so center lines join neighboring tiles seamlessly
    ctx.strokeStyle = centerLineColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    if (n) {
      ctx.moveTo(half, 0);
      ctx.lineTo(half, 14);
    }
    if (s) {
      ctx.moveTo(half, size - 14);
      ctx.lineTo(half, size);
    }
    if (w) {
      ctx.moveTo(0, half);
      ctx.lineTo(14, half);
    }
    if (e) {
      ctx.moveTo(size - 14, half);
      ctx.lineTo(size, half);
    }
    ctx.stroke();

    // Stop Lines (เส้นหยุดรถ) + White Zebra Crosswalks (ทางม้าลาย) on all connected arms (3-Way & 4-Way)
    ctx.fillStyle = '#f8fafc';
    const stopDist = 15;
    const stopThick = 5;
    const cwStart = 23;
    const cwLen = 24;
    const stripeWidth = isHighway ? 13 : 11;
    const stripeGap = isHighway ? 11 : 9;

    if (n) {
      ctx.fillRect(roadMin + 7, stopDist, roadWidth - 14, stopThick);
      for (let sx = roadMin + 10; sx <= roadMax - 10 - stripeWidth; sx += stripeWidth + stripeGap) {
        ctx.fillRect(sx, cwStart, stripeWidth, cwLen);
      }
    }
    if (s) {
      ctx.fillRect(roadMin + 7, size - stopDist - stopThick, roadWidth - 14, stopThick);
      for (let sx = roadMin + 10; sx <= roadMax - 10 - stripeWidth; sx += stripeWidth + stripeGap) {
        ctx.fillRect(sx, size - cwStart - cwLen, stripeWidth, cwLen);
      }
    }
    if (w) {
      ctx.fillRect(stopDist, roadMin + 7, stopThick, roadWidth - 14);
      for (let sy = roadMin + 10; sy <= roadMax - 10 - stripeWidth; sy += stripeWidth + stripeGap) {
        ctx.fillRect(cwStart, sy, cwLen, stripeWidth);
      }
    }
    if (e) {
      ctx.fillRect(size - stopDist - stopThick, roadMin + 7, stopThick, roadWidth - 14);
      for (let sy = roadMin + 10; sy <= roadMax - 10 - stripeWidth; sy += stripeWidth + stripeGap) {
        ctx.fillRect(size - cwStart - cwLen, sy, cwLen, stripeWidth);
      }
    }
  } else if (isCornerOnly) {
    // Curved center dashed divider around corner turn
    const pivotX = e ? size : 0;
    const pivotY = s ? size : 0;
    ctx.save();
    ctx.strokeStyle = centerLineColor;
    ctx.lineWidth = 4;
    ctx.setLineDash([18, 14]);
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, half, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } else if (n && s && !e && !w) {
    // Straight North-South road: seamless center divider from 0 to 256
    ctx.save();
    ctx.strokeStyle = centerLineColor;
    if (isHighway) {
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(half - 4, 0);
      ctx.lineTo(half - 4, size);
      ctx.moveTo(half + 4, 0);
      ctx.lineTo(half + 4, size);
      ctx.stroke();
    } else {
      ctx.lineWidth = 4;
      ctx.setLineDash([24, 16]);
      ctx.lineDashOffset = 8;
      ctx.beginPath();
      ctx.moveTo(half, 0);
      ctx.lineTo(half, size);
      ctx.stroke();
    }
    ctx.restore();
  } else if (e && w && !n && !s) {
    // Straight East-West road: seamless center divider from 0 to 256
    ctx.save();
    ctx.strokeStyle = centerLineColor;
    if (isHighway) {
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, half - 4);
      ctx.lineTo(size, half - 4);
      ctx.moveTo(0, half + 4);
      ctx.lineTo(size, half + 4);
      ctx.stroke();
    } else {
      ctx.lineWidth = 4;
      ctx.setLineDash([24, 16]);
      ctx.lineDashOffset = 8;
      ctx.beginPath();
      ctx.moveTo(0, half);
      ctx.lineTo(size, half);
      ctx.stroke();
    }
    ctx.restore();
  } else {
    // Dead-End (1 neighbor): draw dashed center divider along open arm up to center
    ctx.save();
    ctx.strokeStyle = centerLineColor;
    ctx.lineWidth = 4;
    ctx.setLineDash([18, 12]);
    ctx.beginPath();
    if (n) {
      ctx.moveTo(half, 0);
      ctx.lineTo(half, half);
    }
    if (s) {
      ctx.moveTo(half, size);
      ctx.lineTo(half, half);
    }
    if (w) {
      ctx.moveTo(0, half);
      ctx.lineTo(half, half);
    }
    if (e) {
      ctx.moveTo(size, half);
      ctx.lineTo(half, half);
    }
    ctx.stroke();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;

  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.82,
    metalness: 0.08,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  _roadTexCache.set(key, mat);
  return mat;
}

const _zoneLotTexCache = new Map<string, THREE.MeshStandardMaterial>();

function getSimCityZoneLotMaterial(archetype: string): THREE.MeshStandardMaterial {
  const zoneKey =
    archetype === 'residential_low' || archetype === 'residential_high'
      ? archetype === 'residential_high'
        ? 'R_HIGH'
        : 'R_LOW'
      : archetype === 'commercial_low' || archetype === 'commercial_high'
      ? archetype === 'commercial_high'
        ? 'C_HIGH'
        : 'C_LOW'
      : 'IND';

  const cached = _zoneLotTexCache.get(zoneKey);
  if (cached) return cached;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // SimCity 4 Iconic RCI Colors: R = Green, C = Blue, I = Yellow
  let fillHex = '#22c55e';
  let borderHex = '#15803d';
  let stripeHex = 'rgba(22, 163, 74, 0.42)';
  let labelChar = 'R';

  if (zoneKey === 'R_HIGH') {
    fillHex = '#16a34a';
    borderHex = '#14532d';
    stripeHex = 'rgba(20, 83, 45, 0.45)';
    labelChar = 'R+';
  } else if (zoneKey === 'C_LOW') {
    fillHex = '#3b82f6';
    borderHex = '#1d4ed8';
    stripeHex = 'rgba(29, 78, 216, 0.42)';
    labelChar = 'C';
  } else if (zoneKey === 'C_HIGH') {
    fillHex = '#2563eb';
    borderHex = '#1e3a8a';
    stripeHex = 'rgba(30, 58, 138, 0.45)';
    labelChar = 'C+';
  } else if (zoneKey === 'IND') {
    fillHex = '#eab308';
    borderHex = '#a16207';
    stripeHex = 'rgba(161, 98, 7, 0.42)';
    labelChar = 'I';
  }

  ctx.fillStyle = fillHex;
  ctx.fillRect(0, 0, size, size);

  // Subtle diagonal SimCity 4 zoning hatch pattern
  ctx.strokeStyle = stripeHex;
  ctx.lineWidth = 6;
  for (let i = -size; i < size * 2; i += 28) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + size, size);
    ctx.stroke();
  }

  // Crisp outer lot boundary frame & dashed inner subdivision lines
  ctx.strokeStyle = borderHex;
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, size - 12, size - 12);

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.lineWidth = 4;
  ctx.setLineDash([16, 12]);
  ctx.strokeRect(18, 18, size - 36, size - 36);
  ctx.restore();

  // Directional arrow pointing toward local +Z (rotated in 3D toward nearest road)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.moveTo(128, 222);
  ctx.lineTo(94, 176);
  ctx.lineTo(114, 176);
  ctx.lineTo(114, 140);
  ctx.lineTo(142, 140);
  ctx.lineTo(142, 176);
  ctx.lineTo(162, 176);
  ctx.closePath();
  ctx.fill();

  // Subtle zone badge letter in center
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.font = 'bold 52px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(labelChar, 128, 92);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.75,
    metalness: 0.05,
    transparent: true,
    opacity: 0.9,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  _zoneLotTexCache.set(zoneKey, mat);
  return mat;
}

/**
 * Builds a SimCity 4-style Empty Zoned Ground Lot (R = Green, C = Blue, I = Yellow)
 * that conforms to the terrain surface and displays corner boundary stakes.
 */
function buildEmptyZoneLotGroup(
  b: BuildingDefinition,
  tile: TileData,
  sampleLocalHeight?: (localX: number, localZ: number) => number
): THREE.Group {
  const group = new THREE.Group();
  const lotMat = getSimCityZoneLotMaterial(b.archetype);

  const segs = 4;
  const lotGeo = new THREE.PlaneGeometry(0.94, 0.94, segs, segs);
  lotGeo.rotateX(-Math.PI / 2);

  // Rotate lot UV/orientation so arrow faces nearest road
  const orient = tile.lotOrientation ?? 0;
  lotGeo.rotateY(orient * (Math.PI / 2));

  if (sampleLocalHeight) {
    const posAttr = lotGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < posAttr.count; i++) {
      const lx = posAttr.getX(i);
      const lz = posAttr.getZ(i);
      posAttr.setY(i, sampleLocalHeight(lx, lz) + 0.016);
    }
    posAttr.needsUpdate = true;
    lotGeo.computeVertexNormals();
  } else {
    lotGeo.translate(0, 0.016, 0);
  }

  const lotPlane = new THREE.Mesh(lotGeo, lotMat);
  lotPlane.receiveShadow = true;
  group.add(lotPlane);

  // 4 survey boundary stakes at the corners of the empty lot
  const stakeColor =
    b.archetype === 'residential_low' || b.archetype === 'residential_high'
      ? '#22c55e'
      : b.archetype === 'commercial_low' || b.archetype === 'commercial_high'
      ? '#3b82f6'
      : '#eab308';
  const stakeMat = getStdMat(stakeColor, 0.5, 0.2);
  const corners = [
    [-0.43, -0.43],
    [0.43, -0.43],
    [-0.43, 0.43],
    [0.43, 0.43],
  ];
  for (const [cx, cz] of corners) {
    const cy = (sampleLocalHeight ? sampleLocalHeight(cx, cz) : 0) + 0.04;
    const stake = new THREE.Mesh(getBoxGeo(0.035, 0.06, 0.035), stakeMat);
    stake.position.set(cx, cy, cz);
    group.add(stake);
  }

  return group;
}

/**
 * Builds an active, self-developing 3D Construction Site (1% .. 99% progress) featuring:
 * 1) Rotating Tower Crane (`construction_crane_jib`)
 * 2) Cement Mixer Truck (`cement_mixer_drum`)
 * 3) Construction Workers in hardhats & safety vests (`construction_workers`)
 * 4) Rising Steel/Concrete Scaffolding & Floor Slabs proportional to `constructionProgress`
 */
function buildConstructionSiteGroup(
  b: BuildingDefinition,
  tile: TileData
): THREE.Group {
  const site = new THREE.Group();
  const progress = Math.max(5, Math.min(99, tile.constructionProgress ?? 50)) / 100;

  const dirtMat = getStdMat('#78350f', 0.92, 0.04);
  const concreteMat = getStdMat('#94a3b8', 0.85, 0.08);
  const steelMat = getStdMat('#475569', 0.45, 0.65);
  const craneYellowMat = getStdMat('#eab308', 0.38, 0.45);
  const safetyOrangeMat = getStdMat('#f97316', 0.5, 0.2);
  const whiteMat = getStdMat('#f8fafc', 0.4, 0.15);
  const darkMetalMat = getStdMat('#1e293b', 0.6, 0.5);
  const glassWrapMat = getStdMat('#38bdf8', 0.25, 0.6, '#0284c7', 0.12);

  // 1. Foundation Excavation Pad & Safety Barriers
  const pad = new THREE.Mesh(getBoxGeo(0.9, 0.22, 0.9), dirtMat);
  pad.position.y = -0.06;
  pad.receiveShadow = true;
  site.add(pad);

  const slab = new THREE.Mesh(getBoxGeo(0.76, 0.04, 0.76), concreteMat);
  slab.position.y = 0.06;
  slab.receiveShadow = true;
  site.add(slab);

  // Orange & white safety perimeter fences
  const fenceCoords: Array<[number, number, number]> = [
    [-0.42, 0.08, 0],
    [0.42, 0.08, 0],
    [0, 0.08, -0.42],
  ];
  for (let i = 0; i < fenceCoords.length; i++) {
    const [fx, fy, fz] = fenceCoords[i];
    const fence = new THREE.Mesh(
      getBoxGeo(i === 2 ? 0.56 : 0.025, 0.055, i === 2 ? 0.025 : 0.56),
      safetyOrangeMat
    );
    fence.position.set(fx, fy, fz);
    site.add(fence);
  }

  // 2. Rising Structural Steel Columns, Concrete Floor Slabs & Scaffolding
  const maxTargetH = Math.max(0.28, Math.min(1.65, b.stories * 0.11));
  const currentStructureH = Math.max(0.12, maxTargetH * progress);

  // Steel I-beam columns rising up
  const colOffsets = [
    [-0.22, -0.2],
    [0.14, -0.2],
    [-0.22, 0.16],
    [0.14, 0.16],
  ];
  for (const [cx, cz] of colOffsets) {
    const col = new THREE.Mesh(getBoxGeo(0.032, currentStructureH + 0.08, 0.032), steelMat);
    col.position.set(cx, 0.06 + (currentStructureH + 0.08) * 0.5, cz);
    col.castShadow = true;
    site.add(col);
  }

  // Stacked concrete floor slabs completed so far
  const numSlabs = Math.max(1, Math.floor(progress * Math.min(6, Math.max(2, b.stories))));
  for (let s = 1; s <= numSlabs; s++) {
    const sy = 0.06 + (s / numSlabs) * currentStructureH;
    const floorPlate = new THREE.Mesh(getBoxGeo(0.42, 0.028, 0.42), concreteMat);
    floorPlate.position.set(-0.04, sy, -0.02);
    floorPlate.castShadow = true;
    site.add(floorPlate);
  }

  // Partial inner core & safety scaffolding wrap when progress >= 35%
  if (progress >= 0.35) {
    const coreH = currentStructureH * 0.82;
    const coreMesh = new THREE.Mesh(
      getBoxGeo(0.32, coreH, 0.32),
      progress >= 0.72 ? glassWrapMat : concreteMat
    );
    coreMesh.position.set(-0.04, 0.06 + coreH * 0.5, -0.02);
    coreMesh.castShadow = true;
    site.add(coreMesh);
  }

  // 3. Animated 3D Tower Crane (เครนทาวเวอร์ก่อสร้าง)
  const craneHeight = Math.max(0.55, currentStructureH + 0.34);
  const craneX = -0.28;
  const craneZ = -0.26;

  const craneBase = new THREE.Mesh(getBoxGeo(0.11, 0.05, 0.11), concreteMat);
  craneBase.position.set(craneX, 0.075, craneZ);
  site.add(craneBase);

  const craneMast = new THREE.Mesh(getBoxGeo(0.048, craneHeight, 0.048), craneYellowMat);
  craneMast.position.set(craneX, 0.08 + craneHeight * 0.5, craneZ);
  craneMast.castShadow = true;
  site.add(craneMast);

  // Rotating Jib Group (swings smoothly in animation loop)
  const jibGroup = new THREE.Group();
  jibGroup.name = 'construction_crane_jib';
  jibGroup.position.set(craneX, 0.08 + craneHeight, craneZ);
  jibGroup.userData = { phase: (tile.x * 1.7 + tile.z * 2.3) % (Math.PI * 2) };

  // Operator cab
  const cab = new THREE.Mesh(getBoxGeo(0.065, 0.065, 0.065), whiteMat);
  cab.position.set(0.02, 0.02, 0);
  jibGroup.add(cab);

  // Top A-frame apex
  const apex = new THREE.Mesh(getCylGeo(0.008, 0.035, 0.11, 4), craneYellowMat);
  apex.position.set(0, 0.065, 0);
  jibGroup.add(apex);

  // Long horizontal jib boom + rear counter-jib
  const boom = new THREE.Mesh(getBoxGeo(0.58, 0.032, 0.032), craneYellowMat);
  boom.position.set(0.14, 0.015, 0);
  boom.castShadow = true;
  jibGroup.add(boom);

  // Counterweight block at rear of jib
  const counterweight = new THREE.Mesh(getBoxGeo(0.08, 0.055, 0.05), darkMetalMat);
  counterweight.position.set(-0.12, 0.01, 0);
  jibGroup.add(counterweight);

  // Hoist cable + suspended steel beam load
  const cableLen = 0.18;
  const cable = new THREE.Mesh(getCylGeo(0.004, 0.004, cableLen, 6), darkMetalMat);
  cable.position.set(0.32, -cableLen * 0.5, 0);
  jibGroup.add(cable);

  const liftedBeam = new THREE.Mesh(getBoxGeo(0.12, 0.024, 0.03), safetyOrangeMat);
  liftedBeam.position.set(0.32, -cableLen, 0);
  jibGroup.add(liftedBeam);

  site.add(jibGroup);

  // 4. 3D Cement Mixer Truck (รถโม่ปูนซีเมนต์) parked at site entrance
  const truckGroup = new THREE.Group();
  truckGroup.position.set(0.26, 0.065, 0.24);
  truckGroup.rotation.y = -0.55;

  const truckChassis = new THREE.Mesh(getBoxGeo(0.11, 0.035, 0.24), darkMetalMat);
  truckChassis.position.y = 0.025;
  truckGroup.add(truckChassis);

  const truckCab = new THREE.Mesh(getBoxGeo(0.105, 0.065, 0.075), safetyOrangeMat);
  truckCab.position.set(0, 0.06, 0.08);
  truckCab.castShadow = true;
  truckGroup.add(truckCab);

  // Rotating Cement Mixer Drum (หมุนถังโม่ปูน)
  const mixerDrum = new THREE.Mesh(getCylGeo(0.042, 0.054, 0.14, 10), craneYellowMat);
  mixerDrum.name = 'cement_mixer_drum';
  mixerDrum.rotation.x = 1.25; // Tilted drum angle
  mixerDrum.position.set(0, 0.078, -0.025);
  mixerDrum.castShadow = true;
  truckGroup.add(mixerDrum);

  // Concrete pouring chute at rear of truck
  const chute = new THREE.Mesh(getBoxGeo(0.022, 0.015, 0.07), concreteMat);
  chute.position.set(0, 0.045, -0.12);
  chute.rotation.x = -0.4;
  truckGroup.add(chute);

  site.add(truckGroup);

  // 5. 3D Construction Workers (คนงานก่อสร้างสวมหมวกเซฟตี้)
  const workersGroup = new THREE.Group();
  workersGroup.name = 'construction_workers';
  workersGroup.position.set(0.06, 0.065, 0.26);
  workersGroup.userData = {
    baseX: 0.06,
    baseZ: 0.26,
    phase: (tile.x * 3.1 + tile.z * 1.9) % (Math.PI * 2),
  };

  const workerPositions: Array<[number, number, number]> = [
    [0, 0, 0],
    [-0.14, 0, 0.04],
    [-0.06, 0, -0.12],
  ];

  for (let wIdx = 0; wIdx < workerPositions.length; wIdx++) {
    const [wx, wy, wz] = workerPositions[wIdx];
    const worker = new THREE.Group();
    worker.position.set(wx, wy, wz);

    // Legs
    const legs = new THREE.Mesh(getBoxGeo(0.024, 0.032, 0.018), darkMetalMat);
    legs.position.y = 0.016;
    worker.add(legs);

    // High-vis orange safety vest torso
    const torso = new THREE.Mesh(getBoxGeo(0.028, 0.034, 0.02), safetyOrangeMat);
    torso.position.y = 0.048;
    worker.add(torso);

    // Yellow safety hardhat
    const helmet = new THREE.Mesh(getCylGeo(0.015, 0.017, 0.018, 8), craneYellowMat);
    helmet.position.y = 0.074;
    worker.add(helmet);

    workersGroup.add(worker);
  }

  site.add(workersGroup);

  return site;
}

/**
 * Builds a 3-Color Traffic Signal Pole (Red / Yellow / Green) for a corner of a 4-way or major 3-way intersection.
 */
function buildTrafficSignalPole(axis: 'NS' | 'EW'): THREE.Group {
  const poleGroup = new THREE.Group();
  const darkMetal = getStdMat('#1e293b', 0.5, 0.6);
  const housingMat = getStdMat('#0f172a', 0.7, 0.3);
  const sigMats = getTrafficSignalMaterials();

  const redMat = axis === 'NS' ? sigMats.nsRed : sigMats.ewRed;
  const yellowMat = axis === 'NS' ? sigMats.nsYellow : sigMats.ewYellow;
  const greenMat = axis === 'NS' ? sigMats.nsGreen : sigMats.ewGreen;

  // Vertical post
  const mast = new THREE.Mesh(getCylGeo(0.014, 0.018, 0.36, 8), darkMetal);
  mast.position.y = 0.18;
  mast.castShadow = true;
  poleGroup.add(mast);

  // Horizontal cantilever arm reaching over the approaching right-hand lane
  const arm = new THREE.Mesh(getBoxGeo(0.2, 0.014, 0.014), darkMetal);
  arm.position.set(0.09, 0.34, 0);
  poleGroup.add(arm);

  // Vertical 3-lamp signal head housing
  const box = new THREE.Mesh(getBoxGeo(0.044, 0.125, 0.036), housingMat);
  box.position.set(0.17, 0.31, 0);
  poleGroup.add(box);

  // Top Lamp: RED
  const redLamp = new THREE.Mesh(getBoxGeo(0.028, 0.028, 0.042), redMat);
  redLamp.position.set(0.17, 0.348, 0);
  poleGroup.add(redLamp);

  // Middle Lamp: YELLOW
  const yellowLamp = new THREE.Mesh(getBoxGeo(0.028, 0.028, 0.042), yellowMat);
  yellowLamp.position.set(0.17, 0.31, 0);
  poleGroup.add(yellowLamp);

  // Bottom Lamp: GREEN
  const greenLamp = new THREE.Mesh(getBoxGeo(0.028, 0.028, 0.042), greenMat);
  greenLamp.position.set(0.17, 0.272, 0);
  poleGroup.add(greenLamp);

  return poleGroup;
}

/**
 * Builds a composite 4-12 part procedural 3D model for any building or infrastructure tile.
 * Unit scale: 1 tile = 1.0 world unit (= 10 meters in simulation).
 * Pivoted at bottom-center (y = 0) flush with the terrain tile surface, with a deep sub-skirt
 * so structures sit seamlessly on curved hills without floating edges.
 */
export function buildCompositeStructureGroup(
  b: BuildingDefinition,
  tile: TileData,
  neighbors: { n: boolean; s: boolean; e: boolean; w: boolean },
  sampleLocalHeight?: (localX: number, localZ: number) => number
): THREE.Group {
  const group = new THREE.Group();
  group.name = `structure_${tile.x}_${tile.z}`;

  const level = tile.buildingLevel || 1;
  const primaryMat = getStdMat(b.primaryColor, 0.72, 0.15);
  const secondaryMat = getStdMat(b.secondaryColor, 0.42, 0.35);
  const accentMat = getStdMat(b.accentColor, 0.25, 0.65, b.accentColor, tile.powered ? 0.22 : 0.02).clone();
  const glassMat = getStdMat('#38bdf8', 0.14, 0.85, '#bae6fd', tile.powered ? 0.35 : 0.05).clone();
  const darkTrimMat = getStdMat('#1e293b', 0.8, 0.2);
  const concreteMat = getStdMat('#94a3b8', 0.85, 0.08);

  // 1. ROAD & BRIDGE (Terrain-conforming seamless asphalt + 4-Way & 3-Way Zebra Crosswalks + Traffic Signals)
  if (b.archetype === 'road' || b.archetype === 'highway') {
    const isHwy = b.archetype === 'highway';
    const connCount =
      (neighbors.n ? 1 : 0) +
      (neighbors.s ? 1 : 0) +
      (neighbors.e ? 1 : 0) +
      (neighbors.w ? 1 : 0);
    const isFourWay = connCount === 4;
    const isThreeWay = connCount === 3;
    // Major 3-way intersections (highways or high-activity avenues) get traffic lights; minor local 3-ways have zebra crosswalks only
    const hasThreeWaySignals =
      isThreeWay && (isHwy || (tile.landValue ?? 40) >= 50 || (tile.x + tile.z) % 3 === 0);
    const roadMat = getRoadTopologyMaterial(isHwy, neighbors);

    if (!tile.isBridge) {
      // Ground road: Subdivided 6x6 surface mesh that conforms 100% flush and seamless to the curved terrain
      const segs = 6;
      const roadGeo = new THREE.PlaneGeometry(1.0, 1.0, segs, segs);
      roadGeo.rotateX(-Math.PI / 2);

      if (sampleLocalHeight) {
        const posAttr = roadGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < posAttr.count; i++) {
          const lx = posAttr.getX(i);
          const lz = posAttr.getZ(i);
          posAttr.setY(i, sampleLocalHeight(lx, lz) + 0.014);
        }
        posAttr.needsUpdate = true;
        roadGeo.computeVertexNormals();
      } else {
        roadGeo.translate(0, 0.014, 0);
      }

      const roadSurface = new THREE.Mesh(roadGeo, roadMat);
      roadSurface.receiveShadow = true;
      group.add(roadSurface);

      // Mount 3-Color Traffic Signals at all 4-Way Intersections and Major 3-Way T-Junctions
      if (isFourWay || hasThreeWaySignals) {
        const cornerOff = isHwy ? 0.41 : 0.33;
        const getCornerY = (cx: number, cz: number) =>
          (sampleLocalHeight ? sampleLocalHeight(cx, cz) : 0) + 0.014;

        if (neighbors.n) {
          const sigNW = buildTrafficSignalPole('NS');
          sigNW.position.set(-cornerOff, getCornerY(-cornerOff, -cornerOff), -cornerOff);
          sigNW.rotation.y = Math.PI;
          group.add(sigNW);
        }
        if (neighbors.s) {
          const sigSE = buildTrafficSignalPole('NS');
          sigSE.position.set(cornerOff, getCornerY(cornerOff, cornerOff), cornerOff);
          sigSE.rotation.y = 0;
          group.add(sigSE);
        }
        if (neighbors.w) {
          const sigSW = buildTrafficSignalPole('EW');
          sigSW.position.set(-cornerOff, getCornerY(-cornerOff, cornerOff), cornerOff);
          sigSW.rotation.y = -Math.PI / 2;
          group.add(sigSW);
        }
        if (neighbors.e) {
          const sigNE = buildTrafficSignalPole('EW');
          sigNE.position.set(cornerOff, getCornerY(cornerOff, -cornerOff), -cornerOff);
          sigNE.rotation.y = Math.PI / 2;
          group.add(sigNE);
        }
      } else {
        // Standard streetlight pole on straight segments or minor 3-way junctions
        const lampOff = isHwy ? 0.41 : 0.34;
        const lampX = !neighbors.e ? lampOff : !neighbors.w ? -lampOff : lampOff;
        const lampZ = !neighbors.n ? -lampOff : !neighbors.s ? lampOff : -lampOff;
        const baseY = (sampleLocalHeight ? sampleLocalHeight(lampX, lampZ) : 0) + 0.014;

        const pole = new THREE.Mesh(getCylGeo(0.014, 0.018, 0.25, 6), darkTrimMat);
        pole.position.set(lampX, baseY + 0.125, lampZ);
        group.add(pole);

        const lamp = new THREE.Mesh(getBoxGeo(0.055, 0.022, 0.038), accentMat);
        lamp.position.set(lampX * 0.88, baseY + 0.25, lampZ * 0.88);
        group.add(lamp);
      }

      return group;
    }

    // Elevated Bridge over water
    const deckWidth = isHwy ? 1.0 : 0.72;
    const deckY = 0.24;
    const deck = new THREE.Mesh(getBoxGeo(deckWidth, 0.05, 1.0), concreteMat);
    deck.position.y = deckY - 0.026;
    deck.castShadow = true;
    deck.receiveShadow = true;
    group.add(deck);

    const bridgeRoadGeo = new THREE.PlaneGeometry(1.0, 1.0, 1, 1);
    bridgeRoadGeo.rotateX(-Math.PI / 2);
    const bridgeSurface = new THREE.Mesh(bridgeRoadGeo, roadMat);
    bridgeSurface.position.y = deckY + 0.002;
    bridgeSurface.receiveShadow = true;
    group.add(bridgeSurface);

    const pier1 = new THREE.Mesh(getCylGeo(0.07, 0.09, deckY + 0.45, 8), concreteMat);
    pier1.position.set(-0.28, (deckY - 0.22) * 0.5, -0.28);
    pier1.castShadow = true;
    group.add(pier1);

    const pier2 = new THREE.Mesh(getCylGeo(0.07, 0.09, deckY + 0.45, 8), concreteMat);
    pier2.position.set(0.28, (deckY - 0.22) * 0.5, 0.28);
    pier2.castShadow = true;
    group.add(pier2);

    const arch = new THREE.Mesh(getBoxGeo(0.98, 0.04, 0.04), accentMat);
    arch.position.set(0, deckY + 0.2, -0.34);
    arch.castShadow = true;
    if ((neighbors.n || neighbors.s) && !neighbors.e && !neighbors.w) {
      arch.rotation.y = Math.PI / 2;
      arch.position.set(-0.34, deckY + 0.2, 0);
    }
    group.add(arch);

    return group;
  }

  // 1.1 SIMCITY 4 EMPTY RCI ZONED LOT (R=Green, C=Blue, I=Yellow) & SELF-DEVELOPING CONSTRUCTION SITE
  if (b.isZone && !b.customModel) {
    const prog = tile.constructionProgress ?? 100;
    if (prog <= 0) {
      return buildEmptyZoneLotGroup(b, tile, sampleLocalHeight);
    }
    if (prog < 100) {
      return buildConstructionSiteGroup(b, tile);
    }
  }

  // Tag group as a building for staggered night lighting transitions
  group.userData = { isBuilding: true, tileX: tile.x, tileZ: tile.z };

  // Part 1: Flat Standard Grey Concrete Base Plane (flat surface like roads, y = 0.008, no circles)
  const plinthGeo = new THREE.PlaneGeometry(0.92, 0.92);
  plinthGeo.rotateX(-Math.PI / 2);
  const plinthMat = getStdMat(0x94a3b8, 0.8, 0.05);
  const plinth = new THREE.Mesh(plinthGeo, plinthMat);
  plinth.position.y = 0.008;
  plinth.receiveShadow = true;
  group.add(plinth);

  // 1.4 CUSTOM 1x1-10x10 SIMCITY 4 LOT DATA
  if (b.customLotData) {
    const customLotGroup = buildCustomLot3DGroup(b.customLotData);
    customLotGroup.position.y = 0.05;
    group.add(customLotGroup);
    return group;
  }

  // 1.5 CUSTOM EXTERNAL 3D MODEL (.GLB / .GLTF / .OBJ)
  if (b.customModel) {
    const customClone = getCachedCustomModelClone(
      b.customModel,
      b.primaryColor,
      b.accentColor
    );
    if (customClone) {
      if (b.customModel.assetCategory === 'vehicle') {
        // When a custom vehicle mod is also placed on a city tile, display it as a sleek Showroom Pavilion / Parking Plaza
        const pad = new THREE.Mesh(getCylGeo(0.36, 0.38, 0.03, 20), darkTrimMat);
        pad.position.y = 0.065;
        group.add(pad);

        const ring = new THREE.Mesh(getCylGeo(0.38, 0.38, 0.015, 20), accentMat);
        ring.position.y = 0.06;
        group.add(ring);

        customClone.scale.multiplyScalar(1.9);
        customClone.position.y += 0.08;
        group.add(customClone);
        return group;
      }

      if (b.customModel.assetCategory === 'prop') {
        // Decorative park/plaza turf border around custom prop/landmark
        const lawn = new THREE.Mesh(
          getBoxGeo(0.82, 0.025, 0.82),
          getStdMat('#15803d', 0.85, 0.05)
        );
        lawn.position.y = 0.055;
        lawn.receiveShadow = true;
        group.add(lawn);
      }

      customClone.position.y += 0.055;
      group.add(customClone);
      return group;
    }
  }

  // 2. WIND TURBINE (Animated 3-blade rotor)
  if (b.archetype === 'power_wind') {
    const basePedestal = new THREE.Mesh(getCylGeo(0.14, 0.2, 0.18, 12), concreteMat);
    basePedestal.position.y = 0.11;
    group.add(basePedestal);

    const tower = new THREE.Mesh(getCylGeo(0.045, 0.09, 1.35, 12), primaryMat);
    tower.position.y = 0.78;
    tower.castShadow = true;
    group.add(tower);

    const nacelle = new THREE.Mesh(getBoxGeo(0.14, 0.12, 0.28), secondaryMat);
    nacelle.position.set(0, 1.45, 0.03);
    group.add(nacelle);

    const beacon = new THREE.Mesh(getCylGeo(0.02, 0.02, 0.05, 8), accentMat);
    beacon.position.set(0, 1.53, -0.05);
    group.add(beacon);

    const rotorGroup = new THREE.Group();
    rotorGroup.name = 'wind_rotor';
    rotorGroup.position.set(0, 1.45, 0.18);

    const hub = new THREE.Mesh(getCylGeo(0.04, 0.04, 0.08, 10), accentMat);
    hub.rotation.x = Math.PI / 2;
    rotorGroup.add(hub);

    for (let i = 0; i < 3; i++) {
      const bladeWrap = new THREE.Group();
      bladeWrap.rotation.z = (i * Math.PI * 2) / 3;
      const blade = new THREE.Mesh(getBoxGeo(0.045, 0.56, 0.015), primaryMat);
      blade.position.y = 0.28;
      bladeWrap.add(blade);
      rotorGroup.add(bladeWrap);
    }
    group.add(rotorGroup);
    return group;
  }

  // 3. SOLAR THERMAL ARRAY
  if (b.archetype === 'power_solar') {
    // Central solar collector tower + 4 angled photovoltaic wings
    const collectorTower = new THREE.Mesh(getCylGeo(0.06, 0.1, 0.72, 10), secondaryMat);
    collectorTower.position.y = 0.38;
    collectorTower.castShadow = true;
    group.add(collectorTower);

    const sunCore = new THREE.Mesh(getCylGeo(0.09, 0.09, 0.16, 12), accentMat);
    sunCore.position.y = 0.78;
    group.add(sunCore);

    const offsets = [
      [-0.24, -0.24],
      [0.24, -0.24],
      [-0.24, 0.24],
      [0.24, 0.24],
    ];
    for (const [ox, oz] of offsets) {
      const stand = new THREE.Mesh(getCylGeo(0.02, 0.03, 0.16, 6), darkTrimMat);
      stand.position.set(ox, 0.12, oz);
      group.add(stand);

      const panel = new THREE.Mesh(getBoxGeo(0.32, 0.03, 0.26), glassMat);
      panel.position.set(ox, 0.21, oz);
      panel.rotation.x = 0.35;
      group.add(panel);
    }
    return group;
  }

  // 4. COAL / THERMAL POWER PLANT
  if (b.archetype === 'power_coal') {
    const hall = new THREE.Mesh(getBoxGeo(0.54, 0.44, 0.48), primaryMat);
    hall.position.set(-0.1, 0.26, 0.05);
    hall.castShadow = true;
    group.add(hall);

    const turbineBay = new THREE.Mesh(getBoxGeo(0.48, 0.28, 0.32), secondaryMat);
    turbineBay.position.set(-0.08, 0.18, -0.22);
    group.add(turbineBay);

    // Hyperbolic cooling tower (3 stacked tapered cylinders)
    const coolLow = new THREE.Mesh(getCylGeo(0.14, 0.2, 0.38, 14), concreteMat);
    coolLow.position.set(0.22, 0.23, 0.14);
    group.add(coolLow);

    const coolTop = new THREE.Mesh(getCylGeo(0.17, 0.14, 0.28, 14), concreteMat);
    coolTop.position.set(0.22, 0.56, 0.14);
    group.add(coolTop);

    // Tall smokestack with red warning rings
    const stack = new THREE.Mesh(getCylGeo(0.045, 0.065, 0.95, 10), secondaryMat);
    stack.position.set(-0.24, 0.52, 0.18);
    stack.castShadow = true;
    group.add(stack);

    const stackRing = new THREE.Mesh(getCylGeo(0.052, 0.052, 0.1, 10), accentMat);
    stackRing.position.set(-0.24, 0.92, 0.18);
    group.add(stackRing);
    return group;
  }

  // 5. WATER PUMP & WATER TOWER
  if (b.archetype === 'water_pump' || b.archetype === 'water_tower') {
    if (b.archetype === 'water_tower') {
      const legs = [
        [-0.14, -0.14],
        [0.14, -0.14],
        [-0.14, 0.14],
        [0.14, 0.14],
      ];
      for (const [lx, lz] of legs) {
        const leg = new THREE.Mesh(getCylGeo(0.025, 0.035, 0.68, 8), secondaryMat);
        leg.position.set(lx, 0.36, lz);
        group.add(leg);
      }
      const tankBody = new THREE.Mesh(getCylGeo(0.24, 0.22, 0.32, 16), primaryMat);
      tankBody.position.y = 0.78;
      tankBody.castShadow = true;
      group.add(tankBody);

      const tankCap = new THREE.Mesh(getCylGeo(0.04, 0.25, 0.14, 16), accentMat);
      tankCap.position.y = 1.01;
      group.add(tankCap);
      return group;
    } else {
      // Water pumping plant with filtration clarifier basins
      const pumpHouse = new THREE.Mesh(getBoxGeo(0.42, 0.3, 0.36), primaryMat);
      pumpHouse.position.set(-0.14, 0.19, -0.12);
      pumpHouse.castShadow = true;
      group.add(pumpHouse);

      const basin1 = new THREE.Mesh(getCylGeo(0.18, 0.18, 0.12, 14), glassMat);
      basin1.position.set(0.18, 0.1, 0.16);
      group.add(basin1);

      const pipe = new THREE.Mesh(getCylGeo(0.04, 0.04, 0.42, 8), secondaryMat);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(0.05, 0.16, -0.12);
      group.add(pipe);
      return group;
    }
  }

  // 6. PARK & BOTANICAL PLAZA
  if (b.archetype === 'park_plaza') {
    const lawn = new THREE.Mesh(getBoxGeo(0.84, 0.06, 0.84), getStdMat('#15803d', 0.85, 0.05));
    lawn.position.y = 0.04;
    group.add(lawn);

    const fountainRim = new THREE.Mesh(getCylGeo(0.2, 0.22, 0.1, 14), secondaryMat);
    fountainRim.position.y = 0.09;
    group.add(fountainRim);

    const fountainPool = new THREE.Mesh(getCylGeo(0.17, 0.17, 0.12, 14), glassMat);
    fountainPool.position.y = 0.1;
    group.add(fountainPool);

    const spire = new THREE.Mesh(getCylGeo(0.02, 0.05, 0.28, 10), accentMat);
    spire.position.y = 0.22;
    group.add(spire);

    const treePositions = [
      [-0.28, -0.28],
      [0.28, -0.28],
      [-0.28, 0.28],
      [0.28, 0.28],
    ];
    for (const [tx, tz] of treePositions) {
      const trunk = new THREE.Mesh(getCylGeo(0.025, 0.035, 0.16, 6), getStdMat('#78350f', 0.9, 0.05));
      trunk.position.set(tx, 0.12, tz);
      group.add(trunk);

      const crown = new THREE.Mesh(getCylGeo(0.02, 0.12, 0.26, 8), primaryMat);
      crown.position.set(tx, 0.28, tz);
      crown.castShadow = true;
      group.add(crown);
    }
    return group;
  }

  // 7. MOD SPECIAL ARCHETYPES (Arcology Spire, Skytrain Hub, Fusion Dome)
  if (b.archetype === 'arcology_tower' || b.archetype === 'fusion_dome' || b.archetype === 'skytrain_hub') {
    if (b.archetype === 'fusion_dome') {
      const ring = new THREE.Mesh(getCylGeo(0.38, 0.42, 0.22, 18), primaryMat);
      ring.position.y = 0.15;
      ring.castShadow = true;
      group.add(ring);

      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), glassMat);
      dome.position.y = 0.24;
      group.add(dome);

      const spire = new THREE.Mesh(getCylGeo(0.02, 0.06, 0.65, 10), accentMat);
      spire.position.y = 0.56;
      group.add(spire);
      return group;
    }

    if (b.archetype === 'skytrain_hub') {
      const concourse = new THREE.Mesh(getBoxGeo(0.86, 0.22, 0.56), primaryMat);
      concourse.position.y = 0.34;
      concourse.castShadow = true;
      group.add(concourse);

      const canopy = new THREE.Mesh(getCylGeo(0.28, 0.28, 0.9, 12), glassMat);
      canopy.rotation.z = Math.PI / 2;
      canopy.scale.set(0.45, 1, 1);
      canopy.position.y = 0.48;
      group.add(canopy);

      const pillar1 = new THREE.Mesh(getCylGeo(0.06, 0.08, 0.32, 8), concreteMat);
      pillar1.position.set(-0.28, 0.16, 0);
      group.add(pillar1);

      const pillar2 = new THREE.Mesh(getCylGeo(0.06, 0.08, 0.32, 8), concreteMat);
      pillar2.position.set(0.28, 0.16, 0);
      group.add(pillar2);
      return group;
    }

    // Arcology Tower (Tiered eco-pyramid skyscraper)
    const h = Math.min(2.6, 0.8 + b.stories * 0.1);
    const tier1 = new THREE.Mesh(getBoxGeo(0.72, h * 0.4, 0.72), primaryMat);
    tier1.position.y = 0.05 + h * 0.2;
    tier1.castShadow = true;
    group.add(tier1);

    const tier2 = new THREE.Mesh(getBoxGeo(0.52, h * 0.38, 0.52), glassMat);
    tier2.position.y = 0.05 + h * 0.58;
    tier2.castShadow = true;
    group.add(tier2);

    const tier3 = new THREE.Mesh(getCylGeo(0.08, 0.24, h * 0.3, 12), accentMat);
    tier3.position.y = 0.05 + h * 0.9;
    group.add(tier3);

    const mast = new THREE.Mesh(getCylGeo(0.012, 0.02, 0.38, 6), secondaryMat);
    mast.position.y = 0.05 + h + 0.18;
    group.add(mast);
    return group;
  }

  // 8. RCI ZONES & CIVIC BUILDINGS (Multi-part stepped towers, houses, factories)
  const levelFactor = b.isZone ? 0.65 + level * 0.48 : 1.0;
  const totalH = Math.max(0.24, b.stories * 0.11 * levelFactor);

  if (b.archetype === 'residential_low') {
    // Suburban residence with pitched roof, garage wing, and garden tree
    const houseBody = new THREE.Mesh(getBoxGeo(0.46, totalH, 0.42), secondaryMat);
    houseBody.position.set(-0.08, 0.05 + totalH * 0.5, 0.04);
    houseBody.castShadow = true;
    group.add(houseBody);

    const roof = new THREE.Mesh(getCylGeo(0.04, 0.36, 0.2, 4), primaryMat);
    roof.rotation.y = Math.PI / 4;
    roof.position.set(-0.08, 0.05 + totalH + 0.09, 0.04);
    roof.castShadow = true;
    group.add(roof);

    const garage = new THREE.Mesh(getBoxGeo(0.24, totalH * 0.65, 0.3), darkTrimMat);
    garage.position.set(0.22, 0.05 + totalH * 0.32, 0.08);
    group.add(garage);

    const windowStrip = new THREE.Mesh(getBoxGeo(0.48, totalH * 0.28, 0.44), glassMat);
    windowStrip.position.set(-0.08, 0.05 + totalH * 0.55, 0.04);
    group.add(windowStrip);
    return group;
  }

  if (b.archetype === 'industrial') {
    // Sawtooth factory hall + storage tanks + smokestack
    const factoryHall = new THREE.Mesh(getBoxGeo(0.56, totalH, 0.52), primaryMat);
    factoryHall.position.set(-0.08, 0.05 + totalH * 0.5, 0);
    factoryHall.castShadow = true;
    group.add(factoryHall);

    const silo1 = new THREE.Mesh(getCylGeo(0.11, 0.11, totalH * 1.1, 10), secondaryMat);
    silo1.position.set(0.26, 0.05 + totalH * 0.55, -0.18);
    group.add(silo1);

    const chimney = new THREE.Mesh(getCylGeo(0.04, 0.06, totalH * 1.6, 8), darkTrimMat);
    chimney.position.set(0.24, 0.05 + totalH * 0.8, 0.2);
    chimney.castShadow = true;
    group.add(chimney);

    const band = new THREE.Mesh(getBoxGeo(0.58, 0.06, 0.54), accentMat);
    band.position.set(-0.08, 0.05 + totalH * 0.82, 0);
    group.add(band);
    return group;
  }

  // High-rise Residential, Commercial CBD, or Civic Building
  const podiumH = Math.min(0.32, totalH * 0.28);
  const podium = new THREE.Mesh(getBoxGeo(0.72, podiumH, 0.68), secondaryMat);
  podium.position.y = 0.05 + podiumH * 0.5;
  podium.castShadow = true;
  podium.receiveShadow = true;
  group.add(podium);

  const towerH = Math.max(0.18, totalH - podiumH);
  const towerCore = new THREE.Mesh(getBoxGeo(0.52, towerH, 0.48), primaryMat);
  towerCore.position.y = 0.05 + podiumH + towerH * 0.5;
  towerCore.castShadow = true;
  towerCore.receiveShadow = true;
  group.add(towerCore);

  // Glass curtain wall mullions
  const glassBand1 = new THREE.Mesh(getBoxGeo(0.54, towerH * 0.78, 0.36), glassMat);
  glassBand1.position.y = 0.05 + podiumH + towerH * 0.5;
  group.add(glassBand1);

  const glassBand2 = new THREE.Mesh(getBoxGeo(0.36, towerH * 0.78, 0.5), glassMat);
  glassBand2.position.y = 0.05 + podiumH + towerH * 0.5;
  group.add(glassBand2);

  // Rooftop mechanical penthouse & communication spire
  const penthouse = new THREE.Mesh(getBoxGeo(0.26, 0.12, 0.24), darkTrimMat);
  penthouse.position.y = 0.05 + podiumH + towerH + 0.06;
  group.add(penthouse);

  const crownAccent = new THREE.Mesh(getBoxGeo(0.55, 0.04, 0.51), accentMat);
  crownAccent.position.y = 0.05 + podiumH + towerH;
  group.add(crownAccent);

  if (b.stories >= 8 || level >= 2) {
    const antenna = new THREE.Mesh(getCylGeo(0.01, 0.02, 0.28, 6), accentMat);
    antenna.position.y = 0.05 + podiumH + towerH + 0.24;
    group.add(antenna);
  }

  return group;
}

/**
 * Builds a 5-part procedural 3D vehicle (chassis, cabin, roof, wheels, lights)
 * that drives along connected road tiles.
 */
export function createProceduralVehicleMesh(colorHex: number): THREE.Group {
  const car = new THREE.Group();

  const bodyMat = getStdMat(colorHex, 0.3, 0.7);
  const glassMat = getStdMat(0xbae6fd, 0.1, 0.9, 0x38bdf8, 0.2);
  const wheelMat = getStdMat(0x0f172a, 0.9, 0.1);
  const lightMat = getStdMat(0xfef08a, 0.2, 0.1, 0xfef08a, 1.1);
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    roughness: 0.2,
    metalness: 0.1,
    emissive: new THREE.Color(0xff2a2a),
    emissiveIntensity: 1.1,
  });

  const chassis = new THREE.Mesh(getBoxGeo(0.125, 0.044, 0.24), bodyMat);
  chassis.position.y = 0.035;
  chassis.castShadow = true;
  car.add(chassis);

  const cabin = new THREE.Mesh(getBoxGeo(0.108, 0.038, 0.13), glassMat);
  cabin.position.set(0, 0.071, -0.01);
  car.add(cabin);

  const roof = new THREE.Mesh(getBoxGeo(0.1, 0.01, 0.11), bodyMat);
  roof.position.set(0, 0.093, -0.01);
  car.add(roof);

  const headlights = new THREE.Mesh(getBoxGeo(0.108, 0.016, 0.012), lightMat);
  headlights.position.set(0, 0.038, 0.12);
  car.add(headlights);

  const taillights = new THREE.Mesh(getBoxGeo(0.108, 0.016, 0.012), tailMat);
  taillights.name = 'taillights';
  taillights.position.set(0, 0.038, -0.12);
  car.add(taillights);

  const wheelFront = new THREE.Mesh(getBoxGeo(0.135, 0.028, 0.038), wheelMat);
  wheelFront.position.set(0, 0.02, 0.072);
  car.add(wheelFront);

  const wheelRear = new THREE.Mesh(getBoxGeo(0.135, 0.028, 0.038), wheelMat);
  wheelRear.position.set(0, 0.02, -0.072);
  car.add(wheelRear);

  return car;
}

/**
 * Creates a traffic vehicle mesh: uses a custom external 3D vehicle model if provided and cached,
 * or falls back to the 5-part procedural 3D vehicle.
 */
export function createVehicleAgentMesh(
  colorHex: number,
  customVehicleConfig?: Custom3DModelConfig,
  primaryColor?: string,
  accentColor?: string
): THREE.Group {
  if (customVehicleConfig) {
    const customCar = getCachedCustomModelClone(
      customVehicleConfig,
      primaryColor || `#${colorHex.toString(16).padStart(6, '0')}`,
      accentColor || '#38bdf8'
    );
    if (customCar) {
      const wrapper = new THREE.Group();
      wrapper.add(customCar);
      return wrapper;
    }
  }
  return createProceduralVehicleMesh(colorHex);
}

/**
 * Builds a low-poly 3D Forest Deer / Stag (body, neck, head, antlers, 4 legs, white tail)
 * that roams naturally between forest tiles.
 */
export function createProceduralDeerMesh(variant = 0): THREE.Group {
  const deer = new THREE.Group();
  const coatMat = getStdMat(variant % 2 === 0 ? 0xa16207 : 0x92400e, 0.85, 0.05);
  const bellyMat = getStdMat(0xfde68a, 0.9, 0.02);
  const antlerMat = getStdMat(0xfef3c7, 0.7, 0.1);
  const noseMat = getStdMat(0x1e293b, 0.8, 0.1);

  // Torso
  const body = new THREE.Mesh(getBoxGeo(0.08, 0.07, 0.17), coatMat);
  body.position.set(0, 0.095, 0);
  deer.add(body);

  // White tail
  const tail = new THREE.Mesh(getBoxGeo(0.03, 0.035, 0.03), bellyMat);
  tail.position.set(0, 0.115, -0.09);
  deer.add(tail);

  // Neck & Head pivot group (allows grazing nod animation)
  const headPivot = new THREE.Group();
  headPivot.name = 'deer_head';
  headPivot.position.set(0, 0.115, 0.075);

  const neck = new THREE.Mesh(getBoxGeo(0.045, 0.085, 0.045), coatMat);
  neck.position.set(0, 0.03, 0.015);
  neck.rotation.x = 0.28;
  headPivot.add(neck);

  const head = new THREE.Mesh(getBoxGeo(0.048, 0.045, 0.075), coatMat);
  head.position.set(0, 0.072, 0.04);
  headPivot.add(head);

  const snout = new THREE.Mesh(getBoxGeo(0.026, 0.024, 0.02), noseMat);
  snout.position.set(0, 0.068, 0.08);
  headPivot.add(snout);

  // Low-poly branching antlers for stags
  if (variant % 2 === 0) {
    const antlerL = new THREE.Mesh(getBoxGeo(0.014, 0.055, 0.014), antlerMat);
    antlerL.position.set(-0.022, 0.11, 0.03);
    antlerL.rotation.z = 0.35;
    headPivot.add(antlerL);

    const antlerR = new THREE.Mesh(getBoxGeo(0.014, 0.055, 0.014), antlerMat);
    antlerR.position.set(0.022, 0.11, 0.03);
    antlerR.rotation.z = -0.35;
    headPivot.add(antlerR);
  }

  deer.add(headPivot);

  // 4 slender legs
  const legPositions: Array<[number, number]> = [
    [-0.028, 0.06],
    [0.028, 0.06],
    [-0.028, -0.06],
    [0.028, -0.06],
  ];
  legPositions.forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(getBoxGeo(0.02, 0.075, 0.02), coatMat);
    leg.position.set(lx, 0.038, lz);
    deer.add(leg);
  });

  return deer;
}

/**
 * Builds a low-poly 3D Bird with animated flapping wings (`left_wing`, `right_wing`)
 * that circles above forests and rivers.
 */
export function createProceduralBirdMesh(colorHex = 0xf8fafc): THREE.Group {
  const bird = new THREE.Group();
  const bodyMat = getStdMat(colorHex, 0.6, 0.1);
  const beakMat = getStdMat(0xf59e0b, 0.5, 0.1);

  const body = new THREE.Mesh(getBoxGeo(0.045, 0.035, 0.11), bodyMat);
  bird.add(body);

  const beak = new THREE.Mesh(getBoxGeo(0.022, 0.018, 0.035), beakMat);
  beak.position.set(0, 0.004, 0.068);
  bird.add(beak);

  const leftWing = new THREE.Mesh(getBoxGeo(0.11, 0.012, 0.055), bodyMat);
  leftWing.name = 'left_wing';
  leftWing.position.set(-0.065, 0.008, 0);
  bird.add(leftWing);

  const rightWing = new THREE.Mesh(getBoxGeo(0.11, 0.012, 0.055), bodyMat);
  rightWing.name = 'right_wing';
  rightWing.position.set(0.065, 0.008, 0);
  bird.add(rightWing);

  return bird;
}

/**
 * Builds a low-poly 3D Animated Pedestrian (Male / Female citizen)
 * with swinging arms (`arm_left`, `arm_right`) and walking legs (`leg_left`, `leg_right`).
 */
export function createProceduralPedestrianMesh(
  gender: 'male' | 'female' = 'male',
  variant = 0
): THREE.Group {
  const ped = new THREE.Group();

  const skinColors = [0xfddaae, 0xd2a884, 0x8d5b3c, 0xfce8d5];
  const shirtColors = [0x38bdf8, 0xef4444, 0x34d399, 0xfacc15, 0xa855f7, 0xf8fafc];
  const pantsColors = [0x1e293b, 0x334155, 0x475569, 0x1e1b4b];

  const skinMat = getStdMat(skinColors[variant % skinColors.length], 0.8, 0.05);
  const shirtMat = getStdMat(shirtColors[(variant + (gender === 'female' ? 2 : 0)) % shirtColors.length], 0.7, 0.1);
  const pantsMat = getStdMat(pantsColors[variant % pantsColors.length], 0.85, 0.05);
  const hairMat = getStdMat(variant % 2 === 0 ? 0x1e1b4b : 0x78350f, 0.9, 0.05);

  // Head
  const head = new THREE.Mesh(getBoxGeo(0.032, 0.032, 0.032), skinMat);
  head.position.y = 0.098;
  ped.add(head);

  // Hair
  const hair = new THREE.Mesh(
    getBoxGeo(0.034, gender === 'female' ? 0.024 : 0.012, 0.034),
    hairMat
  );
  hair.position.set(0, gender === 'female' ? 0.104 : 0.112, -0.002);
  ped.add(hair);

  // Torso / Upper Clothing
  const torso = new THREE.Mesh(
    getBoxGeo(gender === 'female' ? 0.042 : 0.046, 0.045, 0.026),
    shirtMat
  );
  torso.position.y = 0.062;
  ped.add(torso);

  // Arms (Pivoted at shoulders for walking animation)
  const armL = new THREE.Mesh(getBoxGeo(0.012, 0.042, 0.012), skinMat);
  armL.name = 'arm_left';
  armL.position.set(-0.028, 0.058, 0);
  ped.add(armL);

  const armR = new THREE.Mesh(getBoxGeo(0.012, 0.042, 0.012), skinMat);
  armR.name = 'arm_right';
  armR.position.set(0.028, 0.058, 0);
  ped.add(armR);

  // Legs / Lower Clothing (Pivoted at hips for walking animation)
  const legL = new THREE.Mesh(getBoxGeo(0.014, 0.044, 0.014), pantsMat);
  legL.name = 'leg_left';
  legL.position.set(-0.012, 0.022, 0);
  ped.add(legL);

  const legR = new THREE.Mesh(getBoxGeo(0.014, 0.044, 0.014), pantsMat);
  legR.name = 'leg_right';
  legR.position.set(0.012, 0.022, 0);
  ped.add(legR);

  return ped;
}

/**
 * Builds a 3D Floating Warning Billboard / Icon (🚫🛣️)
 * displayed above RCI buildings/zones that are NOT connected to a road.
 */
export function createRoadWarningMesh(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'no_road_warning';

  // Red Outer Ring
  const ring = new THREE.Mesh(
    getCylGeo(0.18, 0.18, 0.02, 16),
    getStdMat(0xef4444, 0.3, 0.1, 0xef4444, 1.2)
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  // White inner disc
  const inner = new THREE.Mesh(
    getCylGeo(0.14, 0.14, 0.018, 16),
    getStdMat(0xf8fafc, 0.5, 0.1)
  );
  inner.rotation.x = Math.PI / 2;
  group.add(inner);

  // Diagonal Red Slash
  const slash = new THREE.Mesh(
    getBoxGeo(0.03, 0.32, 0.022),
    getStdMat(0xef4444, 0.3, 0.1, 0xef4444, 1.2)
  );
  slash.rotation.z = Math.PI / 4;
  group.add(slash);

  // Black road emblem inside
  const roadMark = new THREE.Mesh(
    getBoxGeo(0.06, 0.18, 0.024),
    getStdMat(0x1e293b, 0.8, 0.1)
  );
  group.add(roadMark);

  // Floating Support Pole
  const pole = new THREE.Mesh(
    getCylGeo(0.012, 0.012, 0.35, 6),
    getStdMat(0xef4444, 0.5, 0.1, 0xef4444, 0.8)
  );
  pole.position.y = -0.22;
  group.add(pole);

  return group;
}

