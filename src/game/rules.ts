import { BUILTIN_BUILDINGS, DEFAULT_MOD_PACKAGES, getAllAvailableBuildings, TERRAIN_TOOLS } from './catalog';
import {
  BuildingArchetype,
  BuildingDefinition,
  CityMetrics,
  CitySimulationState,
  Custom3DModelConfig,
  ModPackage,
  RegionConfig,
  RegionPlot,
  RegionSize,
  RegionWorldState,
  TerrainPreset,
  TerrainToolId,
  TileData,
  TreeSpecies,
} from './types';

export const TILE_SIZE_METERS = 10; // 1 ช่อง = 10 เมตร
export const VALID_REGION_SIZES: RegionSize[] = [32, 48, 64];

// Deterministic pseudo-random and 2D value noise
export function hash2D(x: number, z: number, seed: number): number {
  let n = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function valueNoise2D(x: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = smoothstep(x - xi);
  const zf = smoothstep(z - zi);

  const v00 = hash2D(xi, zi, seed);
  const v10 = hash2D(xi + 1, zi, seed);
  const v01 = hash2D(xi, zi + 1, seed);
  const v11 = hash2D(xi + 1, zi + 1, seed);

  return lerp(lerp(v00, v10, xf), lerp(v01, v11, xf), zf);
}

export function fbm2D(x: number, z: number, seed: number, octaves = 4): number {
  let total = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let maxVal = 0;
  for (let i = 0; i < octaves; i++) {
    total += valueNoise2D(x * frequency, z * frequency, seed + i * 101) * amplitude;
    maxVal += amplitude;
    amplitude *= 0.5;
    frequency *= 2.05;
  }
  return total / maxVal;
}

export function getRegionDimensionsMeters(size: RegionSize): { widthMeters: number; heightMeters: number; areaSqKm: number } {
  const widthMeters = size * TILE_SIZE_METERS;
  const heightMeters = size * TILE_SIZE_METERS;
  const areaSqKm = Number(((widthMeters * heightMeters) / 1_000_000).toFixed(4));
  return { widthMeters, heightMeters, areaSqKm };
}

export function getTileIndex(x: number, z: number, size: RegionSize): number {
  return z * size + x;
}

export function isInsideRegion(x: number, z: number, size: RegionSize): boolean {
  return x >= 0 && x < size && z >= 0 && z < size;
}

export function recomputeSlopesAndWater(tiles: TileData[], size: RegionSize): void {
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const idx = z * size + x;
      const tile = tiles[idx];
      tile.isWater = tile.elevation < 0;

      // Compute max elevation difference with 4-neighbors
      let maxDiff = 0;
      const neighbors = [
        [x - 1, z],
        [x + 1, z],
        [x, z - 1],
        [x, z + 1],
      ];
      for (const [nx, nz] of neighbors) {
        if (isInsideRegion(nx, nz, size)) {
          const nTile = tiles[nz * size + nx];
          const diff = Math.abs(tile.elevation - nTile.elevation);
          if (diff > maxDiff) maxDiff = diff;
        }
      }
      tile.slope = Number(maxDiff.toFixed(2));
      tile.isCliff = !tile.isWater && (tile.slope >= 6.5 || tile.elevation >= 18);
      if (tile.isWater || tile.isCliff) {
        tile.trees = 0;
      }
    }
  }
}

export function generateRegionTiles(config: RegionConfig): TileData[] {
  const { size, preset, seed, waterLevelOffset, cliffSteepness, forestDensity } = config;
  const tiles: TileData[] = new Array(size * size);

  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const nz = z / size;
      const n1 = fbm2D(nx * 3.5, nz * 3.5, seed, 4);
      const n2 = fbm2D(nx * 8.0, nz * 8.0, seed + 77, 3);

      let elevation = 4;

      if (preset === 'pristine_flat') {
        // 100% flat pristine empty land (+2.0m above sea level 0m) ready for free sculpting
        elevation = 2.0;
      } else if (preset === 'river_valley') {
        // Winding river through the region with fertile banks and dramatic stepped cliffs
        const riverCurve = 0.45 + Math.sin(nz * Math.PI * 2 + seed * 0.1) * 0.11;
        const distToRiver = Math.abs(nx - riverCurve);
        if (distToRiver < 0.085) {
          elevation = -6.5 + (distToRiver / 0.085) * 5.0;
        } else {
          const valleyRise = Math.pow(Math.max(0, distToRiver - 0.085), 1.25) * 38 * cliffSteepness;
          elevation = 2.5 + n1 * 7.5 + valleyRise;
          // Terrace plateau on edges for realistic stepped cliffs
          if (elevation > 11) {
            elevation = Math.round(elevation / 7.5) * 7.5 + 3;
          }
        }
      } else if (preset === 'coastal_bay') {
        // Southern/Western ocean bay with a peninsula and cliff headlands
        const coastDist = (nx * 0.65 + nz * 0.65) + (n1 - 0.5) * 0.28;
        if (coastDist < 0.44) {
          elevation = -8 + coastDist * 16;
        } else {
          elevation = 2.0 + (coastDist - 0.44) * 32 * cliffSteepness + n2 * 5;
          if (elevation > 16) {
            elevation = Math.round(elevation / 8) * 8;
          }
        }
      } else if (preset === 'highland_cliffs') {
        // Dramatic stepped mesas, canyons, and mountain lake
        const raw = (n1 - 0.36) * 42 * cliffSteepness;
        if (raw < 0) {
          elevation = raw * 1.2 - 2;
        } else {
          // Quantize into dramatic cliff terraces
          elevation = Math.floor(raw / 7.5) * 7.5 + 2.5 + n2 * 1.5;
        }
      } else {
        // flatland_basin: Mostly flat buildable plains with a small scenic canal/lake
        const lakeDist = Math.hypot(nx - 0.24, nz - 0.74);
        if (lakeDist < 0.16) {
          elevation = -5.5 + (lakeDist / 0.16) * 5.0;
        } else {
          elevation = 3.0 + (n1 - 0.5) * 3.5 * cliffSteepness;
        }
      }

      elevation = Number((elevation - waterLevelOffset).toFixed(1));
      const isWater = elevation < 0;

      // Trees based on forest noise (pristine_flat starts 100% clean with 0 trees)
      const treeNoise = hash2D(x, z, seed + 999);
      let trees = 0;
      let treeType: TreeSpecies = 'oak';
      if (preset !== 'pristine_flat' && !isWater && elevation > 1.2 && elevation < 17 && treeNoise < forestDensity * 0.45) {
        trees = 1 + Math.floor(hash2D(x, z, seed + 333) * 4);
        if (elevation < 2.3) {
          treeType = 'palm';
        } else if (elevation > 9.5) {
          treeType = 'pine';
        } else {
          treeType = hash2D(x, z, seed + 555) > 0.72 ? 'sakura' : 'oak';
        }
      }

      tiles[z * size + x] = {
        x,
        z,
        elevation,
        isWater,
        isCliff: false,
        slope: 0,
        trees,
        treeType,
        buildingId: null,
        buildingLevel: 1,
        buildingRotation: 0,
        isBridge: false,
        powered: false,
        watered: false,
        roadConnected: false,
        pollution: 0,
        landValue: 35,
      };
    }
  }

  recomputeSlopesAndWater(tiles, size);
  return tiles;
}

export function createInitialMetrics(): CityMetrics {
  return {
    treasury: 35000,
    netIncome: 0,
    population: 0,
    jobsTotal: 0,
    jobsAvailable: 0,
    powerProducedMW: 0,
    powerConsumedMW: 0,
    waterProducedM3: 0,
    waterConsumedM3: 0,
    happiness: 86,
    averageLandValue: 45,
    averagePollution: 2,
    trafficCongestion: 8,
    demandR: 75,
    demandC: 55,
    demandI: 60,
    taxRateR: 9,
    taxRateC: 9,
    taxRateI: 9,
    dayCount: 1,
    monthCount: 1,
    yearCount: 2026,
  };
}

export function seedStarterTown(tiles: TileData[], size: RegionSize): void {
  // Position the starter town center slightly offset from the central river so buildings have a dry terrace,
  // while the main avenue extends across the river as a bridge.
  const centerX = Math.min(size - 7, Math.floor(size * 0.65));
  const centerZ = Math.floor(size * 0.5);

  const baseElev = 4.0;
  for (let dz = -5; dz <= 5; dz++) {
    for (let dx = -5; dx <= 5; dx++) {
      const tx = centerX + dx;
      const tz = centerZ + dz;
      if (isInsideRegion(tx, tz, size)) {
        const t = tiles[tz * size + tx];
        t.elevation = baseElev;
        t.isWater = false;
        t.isCliff = false;
        t.trees = 0;
      }
    }
  }
  recomputeSlopesAndWater(tiles, size);

  // Lay starter main avenue along X (reaching across the river as a bridge) and Z through centerX, centerZ
  for (let d = -Math.floor(size * 0.36); d <= 4; d++) {
    const rx = centerX + d;
    if (isInsideRegion(rx, centerZ, size)) {
      const tile = tiles[centerZ * size + rx];
      tile.buildingId = 'road_avenue';
      tile.isBridge = tile.isWater;
      tile.trees = 0;
    }
  }
  for (let d = -4; d <= 4; d++) {
    const rz = centerZ + d;
    if (isInsideRegion(centerX, rz, size)) {
      const tile = tiles[rz * size + centerX];
      tile.buildingId = 'road_avenue';
      tile.isBridge = tile.isWater;
      tile.trees = 0;
    }
  }

  // Place starter utilities & initial zones around the crossroad (with 2 water towers + solar + wind for clean surplus)
  const starterPlacements: Array<{ dx: number; dz: number; id: string; level?: number }> = [
    { dx: -2, dz: -1, id: 'power_solar', level: 1 },
    { dx: -2, dz: -2, id: 'power_wind', level: 1 },
    { dx: -3, dz: -1, id: 'water_tower', level: 1 },
    { dx: -3, dz: 1, id: 'water_tower', level: 1 },
    { dx: 1, dz: -1, id: 'zone_res_low', level: 2 },
    { dx: 2, dz: -1, id: 'zone_res_low', level: 1 },
    { dx: 3, dz: -1, id: 'zone_res_high', level: 1 },
    { dx: 1, dz: 1, id: 'zone_com_low', level: 2 },
    { dx: 2, dz: 1, id: 'zone_com_high', level: 1 },
    { dx: -1, dz: 2, id: 'service_park', level: 1 },
    { dx: -2, dz: 1, id: 'zone_ind', level: 1 },
  ];

  for (const item of starterPlacements) {
    const tx = centerX + item.dx;
    const tz = centerZ + item.dz;
    if (isInsideRegion(tx, tz, size)) {
      const t = tiles[tz * size + tx];
      if (!t.isWater && !t.isCliff && !t.buildingId) {
        t.buildingId = item.id;
        t.buildingLevel = item.level ?? 1;
        t.constructionProgress = 100;
        t.trees = 0;
      }
    }
  }
}

export function createInitialSimulationState(
  config: RegionConfig,
  customMods?: ModPackage[],
  skipStarterTown = false
): CitySimulationState {
  const shouldSkipTown = skipStarterTown || config.preset === 'pristine_flat';
  const tiles = generateRegionTiles(config);
  if (!shouldSkipTown) {
    seedStarterTown(tiles, config.size);
  }
  const state: CitySimulationState = {
    config,
    tiles,
    metrics: createInitialMetrics(),
    status: 'title',
    outcomeReason: null,
    mods: customMods ? [...customMods] : DEFAULT_MOD_PACKAGES.map((m) => ({ ...m })),
    simSpeed: 1,
    executionMode: config.preset === 'pristine_flat' ? 'god_mode' : 'mayor_mode',
    incorporated: config.preset !== 'pristine_flat',
  };
  return simulateCityTick(state, false);
}

export function applyTerrainTool(
  state: CitySimulationState,
  toolId: TerrainToolId,
  centerX: number,
  centerZ: number,
  brushRadius = 0,
  isFreeCost = false
): { nextState: CitySimulationState; modifiedCount: number; totalCost: number; error?: string } {
  const { size } = state.config;
  if (!isInsideRegion(centerX, centerZ, size)) {
    return { nextState: state, modifiedCount: 0, totalCost: 0, error: 'อยู่นอกขอบเขตภูมิภาค' };
  }

  const toolDef = TERRAIN_TOOLS.find((t) => t.id === toolId);
  if (!toolDef) {
    return { nextState: state, modifiedCount: 0, totalCost: 0, error: 'ไม่พบเครื่องมือปรับแต่งภูมิประเทศ' };
  }

  const nextTiles = state.tiles.map((t) => ({ ...t }));
  const centerTile = nextTiles[getTileIndex(centerX, centerZ, size)];
  const targetFlattenElevation = centerTile.elevation;

  // Mountain, plateau, and river tools automatically use at least radius 1 if brushRadius is 0 so they sculpt realistic shapes
  const effectiveRadius =
    brushRadius === 0 && (toolId === 'terrain_mountain' || toolId === 'terrain_plateau' || toolId === 'terrain_river')
      ? 1
      : brushRadius;

  let modifiedCount = 0;
  let totalCost = 0;
  const costPerTile = isFreeCost ? 0 : toolDef.costPerTile;

  for (let dz = -effectiveRadius; dz <= effectiveRadius; dz++) {
    for (let dx = -effectiveRadius; dx <= effectiveRadius; dx++) {
      const tx = centerX + dx;
      const tz = centerZ + dz;
      if (!isInsideRegion(tx, tz, size)) continue;

      if (!isFreeCost && state.metrics.treasury - (totalCost + costPerTile) < -2000) {
        break;
      }

      const tile = nextTiles[getTileIndex(tx, tz, size)];
      const dist = Math.hypot(dx, dz);

      if (toolId === 'bulldoze') {
        if (tile.buildingId || tile.trees > 0) {
          const origX = tile.buildingOriginX ?? tile.x;
          const origZ = tile.buildingOriginZ ?? tile.z;
          // Clear all tiles belonging to the same multi-tile lot or building instance
          for (let bz = 0; bz < size; bz++) {
            for (let bx = 0; bx < size; bx++) {
              const t = nextTiles[getTileIndex(bx, bz, size)];
              if (
                t.buildingId === tile.buildingId &&
                ((t.buildingOriginX === origX && t.buildingOriginZ === origZ) || (bx === tx && bz === tz))
              ) {
                t.buildingId = null;
                t.buildingLevel = 1;
                t.buildingOriginX = undefined;
                t.buildingOriginZ = undefined;
                t.isBuildingOrigin = undefined;
                t.constructionProgress = undefined;
                t.lotOrientation = undefined;
                t.isBridge = false;
                t.trees = 0;
              }
            }
          }
          modifiedCount++;
          totalCost += costPerTile;
        }
        continue;
      }

      // Tree & Forest Planting Tools (Mixed Biome or Specific Species)
      if (
        toolId === 'terrain_forest' ||
        toolId === 'tree_pine' ||
        toolId === 'tree_oak' ||
        toolId === 'tree_palm' ||
        toolId === 'tree_sakura'
      ) {
        if (!tile.isWater && !tile.isCliff && !tile.buildingId) {
          tile.trees = Math.min(5, Math.max(3, tile.trees + 2));
          if (toolId === 'tree_pine') {
            tile.treeType = 'pine';
          } else if (toolId === 'tree_oak') {
            tile.treeType = 'oak';
          } else if (toolId === 'tree_palm') {
            tile.treeType = 'palm';
          } else if (toolId === 'tree_sakura') {
            tile.treeType = 'sakura';
          } else {
            // Automatic biome selection based on elevation
            if (tile.elevation < 2.4) {
              tile.treeType = 'palm';
            } else if (tile.elevation >= 10) {
              tile.treeType = 'pine';
            } else {
              tile.treeType = (tx + tz) % 3 === 0 ? 'sakura' : 'oak';
            }
          }
          modifiedCount++;
          totalCost += costPerTile;
        }
        continue;
      }

      // Terrain elevation tools clear non-bridge buildings if flooded
      if (toolId === 'terrain_raise') {
        tile.elevation = Number(Math.min(48, tile.elevation + 3.5).toFixed(1));
        modifiedCount++;
        totalCost += costPerTile;
      } else if (toolId === 'terrain_lower') {
        tile.elevation = Number(Math.max(-18, tile.elevation - 3.5).toFixed(1));
        if (tile.elevation < 0 && tile.buildingId && tile.buildingId !== 'road_avenue' && tile.buildingId !== 'road_highway') {
          tile.buildingId = null;
        }
        modifiedCount++;
        totalCost += costPerTile;
      } else if (toolId === 'terrain_mountain') {
        // Conical mountain peak with smooth slope falloff and alpine pines on lower slopes
        const falloff = Math.max(0.2, 1 - dist / (effectiveRadius + 1.2));
        const delta = Number((11.5 * falloff).toFixed(1));
        tile.elevation = Number(Math.min(54, Math.max(2, tile.elevation + delta)).toFixed(1));
        if (tile.elevation >= 10 && tile.elevation < 22 && !tile.buildingId && dist > 0) {
          tile.trees = Math.max(tile.trees, 2);
          tile.treeType = 'pine';
        }
        modifiedCount++;
        totalCost += costPerTile;
      } else if (toolId === 'terrain_plateau') {
        // Flat-topped Highland Mesa / Plateau (+16m stepped terrace)
        const targetMesa = Math.min(48, Math.max(16, Math.round((targetFlattenElevation + 14) / 8) * 8));
        tile.elevation = targetMesa;
        modifiedCount++;
        totalCost += costPerTile;
      } else if (toolId === 'terrain_cliff') {
        tile.elevation = Number(Math.min(52, Math.max(18, tile.elevation + 14)).toFixed(1));
        tile.trees = 0;
        modifiedCount++;
        totalCost += costPerTile;
      } else if (toolId === 'terrain_river') {
        // Carve natural river channel: deep water in center, gentle sandy/palm banks on outer ring
        if (dist <= Math.max(0.5, effectiveRadius - 0.5)) {
          tile.elevation = -6.5;
          tile.trees = 0;
          if (tile.buildingId === 'road_avenue' || tile.buildingId === 'road_highway') {
            tile.isBridge = true;
          } else {
            tile.buildingId = null;
          }
        } else {
          tile.elevation = 1.2;
          tile.treeType = 'palm';
          if (!tile.buildingId && tile.trees === 0 && (tx + tz) % 2 === 0) {
            tile.trees = 2;
          }
        }
        modifiedCount++;
        totalCost += costPerTile;
      } else if (toolId === 'terrain_water') {
        tile.elevation = -6.0;
        tile.trees = 0;
        if (tile.buildingId === 'road_avenue' || tile.buildingId === 'road_highway') {
          tile.isBridge = true;
        } else {
          tile.buildingId = null;
        }
        modifiedCount++;
        totalCost += costPerTile;
      } else if (toolId === 'terrain_flatten') {
        if (tile.elevation !== targetFlattenElevation) {
          tile.elevation = targetFlattenElevation;
          modifiedCount++;
          totalCost += costPerTile;
        }
      } else if (toolId === 'terrain_smooth') {
        // Average with 4-way neighbors
        const neighbors = [
          [tx - 1, tz],
          [tx + 1, tz],
          [tx, tz - 1],
          [tx, tz + 1],
        ];
        let sum = tile.elevation;
        let count = 1;
        for (const [nx, nz] of neighbors) {
          if (isInsideRegion(nx, nz, size)) {
            sum += state.tiles[getTileIndex(nx, nz, size)].elevation;
            count++;
          }
        }
        const avg = sum / count;
        const smoothed = Number((tile.elevation * 0.4 + avg * 0.6).toFixed(1));
        if (smoothed !== tile.elevation) {
          tile.elevation = smoothed;
          modifiedCount++;
          totalCost += costPerTile;
        }
      } else if (toolId === 'terrain_clear') {
        // Reset to pristine flat +2.0m, clear buildings and trees
        if (tile.elevation !== 2.0 || tile.trees > 0 || tile.buildingId) {
          tile.elevation = 2.0;
          tile.trees = 0;
          tile.buildingId = null;
          tile.isBridge = false;
          modifiedCount++;
          totalCost += costPerTile;
        }
      }
    }
  }

  if (modifiedCount === 0) {
    return { nextState: state, modifiedCount: 0, totalCost: 0 };
  }

  recomputeSlopesAndWater(nextTiles, size);

  const nextState: CitySimulationState = {
    ...state,
    tiles: nextTiles,
    metrics: {
      ...state.metrics,
      treasury: state.metrics.treasury - totalCost,
    },
  };

  return {
    nextState: simulateCityTick(nextState, false),
    modifiedCount,
    totalCost,
  };
}

export function hasAdjacentWater(tiles: TileData[], x: number, z: number, size: RegionSize): boolean {
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx;
      const nz = z + dz;
      if (isInsideRegion(nx, nz, size) && tiles[nz * size + nx].isWater) {
        return true;
      }
    }
  }
  return false;
}

export function getBuildingFootprintSize(
  building: BuildingDefinition,
  rotation = 0
): { sizeX: number; sizeZ: number; effWidth: number; effDepth: number } {
  let sizeX = 1;
  let sizeZ = 1;

  if (building.customLotData) {
    sizeX = Math.max(1, Math.min(10, building.customLotData.sizeX));
    sizeZ = Math.max(1, Math.min(10, building.customLotData.sizeZ));
  }

  const rot = ((rotation % 4) + 4) % 4;
  const effWidth = rot % 2 === 0 ? sizeX : sizeZ;
  const effDepth = rot % 2 === 0 ? sizeZ : sizeX;

  return { sizeX, sizeZ, effWidth, effDepth };
}

export function canPlaceBuilding(
  state: CitySimulationState,
  building: BuildingDefinition,
  x: number,
  z: number,
  rotation = 0
): { allowed: boolean; reason?: string; isBridge?: boolean } {
  const { size } = state.config;
  const { effWidth, effDepth } = getBuildingFootprintSize(building, rotation);

  if (x < 0 || z < 0 || x + effWidth > size || z + effDepth > size) {
    return {
      allowed: false,
      reason: `แปลง ${building.name} (${effWidth}×${effDepth} ช่อง) บางส่วนอยู่นอกขอบเขตแผนที่`,
    };
  }

  const isRoadType = building.archetype === 'road' || building.archetype === 'highway';

  // Helper: Is a building ID considered an RCI zone or RCI structure (which CAN be overwritten)?
  const allBuildings = getAllAvailableBuildings(state.mods);
  const isOverwritableRci = (bId: string | null) => {
    if (!bId) return true; // Empty tile
    if (
      bId.startsWith('zone_res') ||
      bId.startsWith('zone_com') ||
      bId.startsWith('zone_ind')
    ) {
      return true;
    }
    const bDef = allBuildings.find((b) => b.id === bId);
    if (!bDef) return false;
    return (
      bDef.isZone ||
      bDef.archetype === 'residential_low' ||
      bDef.archetype === 'residential_high' ||
      bDef.archetype === 'commercial_low' ||
      bDef.archetype === 'commercial_high' ||
      bDef.archetype === 'industrial'
    );
  };

  let totalBridgeCostMult = 1;

  // Validate every tile in the rectangle [x .. x+effWidth-1, z .. z+effDepth-1]
  for (let tz = z; tz < z + effDepth; tz++) {
    for (let tx = x; tx < x + effWidth; tx++) {
      const tile = state.tiles[getTileIndex(tx, tz, size)];

      if (tile.isWater) {
        if (isRoadType) {
          totalBridgeCostMult = 2;
        } else {
          return { allowed: false, reason: 'ไม่สามารถสร้าง Lot บนผิวน้ำได้ (เฉพาะถนน/สะพาน)' };
        }
      }

      if (tile.isCliff && building.archetype !== 'power_wind' && !isRoadType) {
        return { allowed: false, reason: 'พื้นที่หน้าผาชันเกินไป กรุณาปรับพื้นราบก่อนก่อสร้าง' };
      }

      // Check collision with roads or non-RCI buildings/services
      if (tile.buildingId === 'road_avenue' || tile.buildingId === 'road_highway') {
        if (!isRoadType) {
          return { allowed: false, reason: 'ไม่สามารถสร้าง Lot หรืออาคารวางทับถนนได้' };
        }
      } else if (tile.buildingId && !isOverwritableRci(tile.buildingId)) {
        return {
          allowed: false,
          reason:
            'ไม่สามารถวางทับอาคารสาธารณูปโภคหรือบริการเมืองได้ (วางทับได้เฉพาะโซน RCI หรือพื้นที่ว่าง)',
        };
      }
    }
  }

  const effectiveCost = building.cost * totalBridgeCostMult;
  if (state.metrics.treasury - effectiveCost < -2000) {
    return { allowed: false, reason: 'งบประมาณเมืองไม่เพียงพอ' };
  }

  if (building.requiresWaterEdge && !hasAdjacentWater(state.tiles, x, z, size)) {
    return { allowed: false, reason: 'สถานีสูบน้ำต้องสร้างใกล้แม่น้ำหรือคลอง (ภายในระยะ 20 เมตร)' };
  }

  return { allowed: true, isBridge: totalBridgeCostMult > 1 };
}

export function placeBuildingOnTile(
  state: CitySimulationState,
  buildingId: string,
  x: number,
  z: number,
  rotation = 0
): { nextState: CitySimulationState; placed: boolean; cost: number; message?: string } {
  const catalog = getAllAvailableBuildings(state.mods);
  const building = catalog.find((b) => b.id === buildingId);
  if (!building) {
    return { nextState: state, placed: false, cost: 0, message: 'ไม่พบข้อมูลสิ่งปลูกสร้าง' };
  }

  const check = canPlaceBuilding(state, building, x, z, rotation);
  if (!check.allowed) {
    return { nextState: state, placed: false, cost: 0, message: check.reason };
  }

  const { size } = state.config;
  const { effWidth, effDepth } = getBuildingFootprintSize(building, rotation);
  const nextTiles = state.tiles.map((t) => ({ ...t }));

  const cost = building.cost * (check.isBridge ? 2 : 1);

  // Assign all tiles in the multi-tile footprint
  for (let tz = z; tz < z + effDepth; tz++) {
    for (let tx = x; tx < x + effWidth; tx++) {
      const tile = nextTiles[getTileIndex(tx, tz, size)];
      tile.buildingId = building.id;
      tile.buildingLevel = 1;
      tile.buildingRotation = rotation % 4;
      tile.buildingOriginX = x;
      tile.buildingOriginZ = z;
      tile.isBuildingOrigin = tx === x && tz === z;
      tile.constructionProgress =
        building.isZone && !building.customModel && !building.customLotData ? 0 : 100;
      tile.isBridge = Boolean(check.isBridge);
      tile.trees = 0;
    }
  }

  const updatedState: CitySimulationState = {
    ...state,
    tiles: nextTiles,
    metrics: {
      ...state.metrics,
      treasury: state.metrics.treasury - cost,
    },
  };

  return {
    nextState: simulateCityTick(updatedState, false),
    placed: true,
    cost,
    message: check.isBridge
      ? `สร้างสะพาน ${building.name} สำเร็จ`
      : building.isZone && !building.customModel && !building.customLotData
      ? `จัดสรรแปลงที่ดิน ${building.name} สำเร็จ (จะเริ่มก่อสร้างเมื่อติดถนน)`
      : `สร้าง ${building.name} (${effWidth}×${effDepth} ช่อง) สำเร็จ`,
  };
}

/**
 * Computes a SimCity 4-style rectangular RCI zone area up to 10x10 tiles
 * from start tile (x0, z0) to end tile (x1, z1), including automatic internal
 * access streets when the dragged block is >= 5 tiles wide/deep so every interior lot connects to a road.
 */
export function computeZoneDragArea(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  size: RegionSize,
  maxSpan = 10
): {
  tiles: Array<{ x: number; z: number; isAutoStreet?: boolean }>;
  width: number;
  depth: number;
} {
  const clamp = (v: number) => Math.max(0, Math.min(size - 1, v));
  const sx = clamp(x0);
  const sz = clamp(z0);
  let ex = clamp(x1);
  let ez = clamp(z1);

  const dx = ex - sx;
  const dz = ez - sz;
  if (Math.abs(dx) >= maxSpan) {
    ex = sx + Math.sign(dx) * (maxSpan - 1);
  }
  if (Math.abs(dz) >= maxSpan) {
    ez = sz + Math.sign(dz) * (maxSpan - 1);
  }

  const minX = Math.min(sx, ex);
  const maxX = Math.max(sx, ex);
  const minZ = Math.min(sz, ez);
  const maxZ = Math.max(sz, ez);
  const width = maxX - minX + 1;
  const depth = maxZ - minZ + 1;

  const tiles: Array<{ x: number; z: number; isAutoStreet?: boolean }> = [];

  for (let z = minZ; z <= maxZ; z++) {
    for (let x = minX; x <= maxX; x++) {
      const localX = x - minX;
      const localZ = z - minZ;
      // SimCity 4 automatic internal access street subdivision for large dragged blocks (5..10 tiles):
      // Places an internal street every 4th row/column inside the block so all 1x1/2x2 lots have road access
      let isAutoStreet = false;
      if (width >= 5 && depth >= 3 && (localX === 3 || (width >= 8 && localX === 7))) {
        isAutoStreet = true;
      } else if (depth >= 5 && width >= 3 && (localZ === 3 || (depth >= 8 && localZ === 7))) {
        isAutoStreet = true;
      }
      tiles.push({ x, z, isAutoStreet });
    }
  }

  return { tiles, width, depth };
}

/**
 * Places a SimCity 4-style dragged RCI zone block (up to 10x10) with optional automatic internal streets.
 */
export function placeZoneAreaOnTiles(
  state: CitySimulationState,
  zoneId: string,
  areaTiles: Array<{ x: number; z: number; isAutoStreet?: boolean }>
): {
  nextState: CitySimulationState;
  zonedCount: number;
  streetCount: number;
  totalCost: number;
  message?: string;
} {
  const catalog = getAllAvailableBuildings(state.mods);
  const building = catalog.find((b) => b.id === zoneId);
  const roadDef = catalog.find((b) => b.id === 'road_avenue');
  if (!building || !building.isZone) {
    return { nextState: state, zonedCount: 0, streetCount: 0, totalCost: 0, message: 'ไม่ใช่เครื่องมือจัดสรรโซน RCI' };
  }

  const { size } = state.config;
  const nextTiles = state.tiles.map((t) => ({ ...t }));
  let zonedCount = 0;
  let streetCount = 0;
  let totalCost = 0;
  const roadCost = roadDef?.cost ?? 40;
  // Bulk zoning per-tile cost is discounted slightly for large SimCity 4-style lots so 10x10 is affordable
  const zoneTileCost = Math.max(25, Math.round(building.cost * 0.45));

  for (const pt of areaTiles) {
    if (!isInsideRegion(pt.x, pt.z, size)) continue;
    const tile = nextTiles[getTileIndex(pt.x, pt.z, size)];

    // Never overwrite water or steep cliffs when zoning
    if (tile.isWater || tile.isCliff) continue;

    // Preserve existing roads/highways so dragging a zone across an existing road keeps the road intact
    if (tile.buildingId === 'road_avenue' || tile.buildingId === 'road_highway') continue;

    if (pt.isAutoStreet) {
      if (state.metrics.treasury - (totalCost + roadCost) < -2000) break;
      tile.buildingId = 'road_avenue';
      tile.buildingLevel = 1;
      tile.buildingRotation = 0;
      tile.constructionProgress = 100;
      tile.isBridge = false;
      tile.trees = 0;
      streetCount++;
      totalCost += roadCost;
    } else {
      if (tile.buildingId === building.id && (tile.constructionProgress ?? 0) === 0) continue;
      if (state.metrics.treasury - (totalCost + zoneTileCost) < -2000) break;
      tile.buildingId = building.id;
      tile.buildingLevel = 1;
      tile.buildingRotation = (pt.x + pt.z) % 4;
      tile.constructionProgress = 0; // Starts as empty colored SimCity 4 lot (Green/Blue/Yellow)
      tile.isBridge = false;
      tile.trees = 0;
      zonedCount++;
      totalCost += zoneTileCost;
    }
  }

  if (zonedCount === 0 && streetCount === 0) {
    return {
      nextState: state,
      zonedCount: 0,
      streetCount: 0,
      totalCost: 0,
      message: 'ไม่มีพื้นที่ว่างที่สามารถจัดสรรโซนได้ในบริเวณนี้',
    };
  }

  const updatedState: CitySimulationState = {
    ...state,
    tiles: nextTiles,
    metrics: {
      ...state.metrics,
      treasury: state.metrics.treasury - totalCost,
    },
  };

  const streetSuffix = streetCount > 0 ? ` พร้อมตัดถนนซอยเชื่อม ${streetCount} ช่อง` : '';
  return {
    nextState: simulateCityTick(updatedState, false),
    zonedCount,
    streetCount,
    totalCost,
    message: `วางผัง ${building.name} จำนวน ${zonedCount} แปลง${streetSuffix} สำเร็จ`,
  };
}

/**
 * Computes a continuous 4-connected road path (straight line or L-shaped corner)
 * from start tile (x0, z0) to end tile (x1, z1).
 */
export function computeRoadDragPath(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  size: RegionSize
): Array<{ x: number; z: number }> {
  const path: Array<{ x: number; z: number }> = [];
  const clamp = (v: number) => Math.max(0, Math.min(size - 1, v));
  const sx = clamp(x0);
  const sz = clamp(z0);
  const ex = clamp(x1);
  const ez = clamp(z1);

  const dx = ex - sx;
  const dz = ez - sz;
  const stepX = dx >= 0 ? 1 : -1;
  const stepZ = dz >= 0 ? 1 : -1;

  if (Math.abs(dx) >= Math.abs(dz)) {
    // Primary segment along X, secondary turn along Z
    for (let x = sx; x !== ex + stepX; x += stepX) {
      path.push({ x, z: sz });
    }
    for (let z = sz + stepZ; dz !== 0 && z !== ez + stepZ; z += stepZ) {
      path.push({ x: ex, z });
    }
  } else {
    // Primary segment along Z, secondary turn along X
    for (let z = sz; z !== ez + stepZ; z += stepZ) {
      path.push({ x: sx, z });
    }
    for (let x = sx + stepX; dx !== 0 && x !== ex + stepX; x += stepX) {
      path.push({ x, z: ez });
    }
  }

  return path;
}

/**
 * Places a continuous line of roads/bridges along a dragged path in a single atomic transaction.
 */
export function placeRoadPathOnTiles(
  state: CitySimulationState,
  roadId: string,
  pathTiles: Array<{ x: number; z: number }>
): {
  nextState: CitySimulationState;
  placedCount: number;
  bridgeCount: number;
  totalCost: number;
  message?: string;
} {
  const catalog = getAllAvailableBuildings(state.mods);
  const building = catalog.find((b) => b.id === roadId);
  if (!building || (building.archetype !== 'road' && building.archetype !== 'highway')) {
    return { nextState: state, placedCount: 0, bridgeCount: 0, totalCost: 0, message: 'ไม่ใช่เครื่องมือสร้างถนน' };
  }

  const { size } = state.config;
  const nextTiles = state.tiles.map((t) => ({ ...t }));
  let placedCount = 0;
  let bridgeCount = 0;
  let totalCost = 0;

  for (const pt of pathTiles) {
    if (!isInsideRegion(pt.x, pt.z, size)) continue;
    const tile = nextTiles[getTileIndex(pt.x, pt.z, size)];

    // Skip if already the exact same road type
    if (tile.buildingId === building.id) continue;

    const isBridge = tile.isWater;
    const tileCost = building.cost * (isBridge ? 2 : 1);

    if (state.metrics.treasury - (totalCost + tileCost) < -2000) {
      if (placedCount === 0) {
        return {
          nextState: state,
          placedCount: 0,
          bridgeCount: 0,
          totalCost: 0,
          message: 'งบประมาณเมืองไม่เพียงพอสำหรับสร้างถนน',
        };
      }
      break;
    }

    tile.buildingId = building.id;
    tile.buildingLevel = 1;
    tile.buildingRotation = 0;
    tile.isBridge = isBridge;
    tile.trees = 0;

    placedCount++;
    if (isBridge) bridgeCount++;
    totalCost += tileCost;
  }

  if (placedCount === 0) {
    return {
      nextState: state,
      placedCount: 0,
      bridgeCount: 0,
      totalCost: 0,
      message: 'มีถนนชนิดนี้อยู่แล้วในตำแหน่งที่เลือก',
    };
  }

  const updatedState: CitySimulationState = {
    ...state,
    tiles: nextTiles,
    metrics: {
      ...state.metrics,
      treasury: state.metrics.treasury - totalCost,
    },
  };

  return {
    nextState: simulateCityTick(updatedState, false),
    placedCount,
    bridgeCount,
    totalCost,
    message:
      placedCount === 1
        ? bridgeCount > 0
          ? `สร้างสะพาน ${building.name} 1 ช่อง สำเร็จ`
          : `สร้าง ${building.name} 1 ช่อง สำเร็จ`
        : `ลากสร้าง ${building.name} ยาว ${placedCount} ช่อง (${placedCount * TILE_SIZE_METERS} ม.) สำเร็จ`,
  };
}

export function simulateCityTick(state: CitySimulationState, advanceTime = true): CitySimulationState {
  const { size } = state.config;
  const catalog = getAllAvailableBuildings(state.mods);
  const buildingMap = new Map<string, BuildingDefinition>();
  for (const b of catalog) {
    buildingMap.set(b.id, b);
  }

  const nextTiles = state.tiles.map((t) => ({
    ...t,
    powered: false,
    watered: false,
    roadConnected: false,
    pollution: Math.max(0, t.trees * -3),
    landValue: t.isWater ? 50 : 35 + (t.elevation > 6 ? 8 : 0) + t.trees * 2,
  }));

  // Boost land value near water (waterfront property bonus)
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const tile = nextTiles[z * size + x];
      if (!tile.isWater && hasAdjacentWater(nextTiles, x, z, size)) {
        tile.landValue += 14;
      }
    }
  }

  let powerProducedMW = 0;
  let powerConsumedMW = 0;
  let waterProducedM3 = 0;
  let waterConsumedM3 = 0;
  let totalUpkeep = 0;
  let roadCount = 0;

  const powerSources: Array<{ x: number; z: number; radius: number }> = [];
  const waterSources: Array<{ x: number; z: number; radius: number }> = [];

  // Pass 1: Collect utilities, roads, pollution, and land value impacts
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const tile = nextTiles[z * size + x];
      if (!tile.buildingId) continue;
      const b = buildingMap.get(tile.buildingId);
      if (!b) continue;

      totalUpkeep += b.upkeepPerMonth;

      if (b.archetype === 'road' || b.archetype === 'highway') {
        roadCount++;
        tile.roadConnected = true;
      }

      const levelMult = b.isZone ? 1 + (tile.buildingLevel - 1) * 0.65 : 1;

      if (b.powerMW > 0) {
        // Wind turbines on high ground get +25% bonus
        const elevBonus = b.archetype === 'power_wind' && tile.elevation >= 10 ? 1.25 : 1;
        powerProducedMW += Math.round(b.powerMW * elevBonus);
        powerSources.push({ x, z, radius: b.serviceRadius });
      } else if (b.powerMW < 0) {
        powerConsumedMW += Math.round(Math.abs(b.powerMW) * levelMult);
      }

      if (b.waterM3 > 0) {
        waterProducedM3 += b.waterM3;
        waterSources.push({ x, z, radius: b.serviceRadius });
      } else if (b.waterM3 < 0) {
        waterConsumedM3 += Math.round(Math.abs(b.waterM3) * levelMult);
      }

      // Radiate pollution and land value
      const rad = Math.max(3, b.serviceRadius || 4);
      if (b.pollutionDelta !== 0 || b.landValueBoost !== 0) {
        for (let dz = -rad; dz <= rad; dz++) {
          for (let dx = -rad; dx <= rad; dx++) {
            const nx = x + dx;
            const nz = z + dz;
            if (!isInsideRegion(nx, nz, size)) continue;
            const dist = Math.hypot(dx, dz);
            if (dist <= rad) {
              const falloff = 1 - dist / (rad + 1);
              const target = nextTiles[nz * size + nx];
              target.pollution += b.pollutionDelta * falloff;
              target.landValue += b.landValueBoost * falloff;
            }
          }
        }
      }
    }
  }

  // Pass 2: Road connectivity (within 3 tiles of a road or civic hub) & Power/Water grid coverage
  const hasGlobalPower = powerProducedMW >= powerConsumedMW && powerProducedMW > 0;
  const hasGlobalWater = waterProducedM3 >= waterConsumedM3 && waterProducedM3 > 0;

  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const tile = nextTiles[z * size + x];
      tile.pollution = Math.round(Math.max(0, Math.min(100, tile.pollution)));
      tile.landValue = Math.round(Math.max(5, Math.min(100, tile.landValue - tile.pollution * 0.35)));

      // Check road within distance 3 and determine nearest road orientation for SimCity 4 lot arrow
      let nearRoad = false;
      let bestRoadDist = 99;
      let orient = tile.lotOrientation ?? 0;
      for (let dz = -3; dz <= 3; dz++) {
        for (let dx = -3; dx <= 3; dx++) {
          const nx = x + dx;
          const nz = z + dz;
          if (isInsideRegion(nx, nz, size)) {
            const nbId = nextTiles[nz * size + nx].buildingId;
            if (nbId === 'road_avenue' || nbId === 'road_highway' || nbId === 'mod_bldg_skytrain') {
              nearRoad = true;
              const d = Math.abs(dx) + Math.abs(dz);
              if (d < bestRoadDist && d > 0) {
                bestRoadDist = d;
                if (Math.abs(dz) >= Math.abs(dx)) {
                  orient = dz > 0 ? 0 : 2; // 0 = South (+Z), 2 = North (-Z)
                } else {
                  orient = dx > 0 ? 1 : 3; // 1 = East (+X), 3 = West (-X)
                }
              }
            }
          }
        }
      }
      tile.roadConnected = nearRoad;
      tile.lotOrientation = orient;

      // Power coverage: within power source radius OR connected to powered road network when powerProduced > 0
      if (powerProducedMW > 0) {
        for (const ps of powerSources) {
          if (Math.hypot(x - ps.x, z - ps.z) <= ps.radius) {
            tile.powered = true;
            break;
          }
        }
        if (!tile.powered && nearRoad && hasGlobalPower) {
          tile.powered = true;
        }
      }

      // Water coverage
      if (waterProducedM3 > 0) {
        for (const ws of waterSources) {
          if (Math.hypot(x - ws.x, z - ws.z) <= ws.radius) {
            tile.watered = true;
            break;
          }
        }
        if (!tile.watered && nearRoad && hasGlobalWater) {
          tile.watered = true;
        }
      }
    }
  }

  // Pass 3: Calculate Autonomous Construction Progress (0% -> 100%), Population, Jobs, Zone Growth (1 -> 2 -> 3), and Tax Income
  let population = 0;
  let jobsTotal = 0;
  let resZones = 0;
  let comZones = 0;
  let indZones = 0;
  let sumLandValue = 0;
  let sumPollution = 0;

  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const tile = nextTiles[z * size + x];
      sumLandValue += tile.landValue;
      sumPollution += tile.pollution;

      if (!tile.buildingId) continue;
      const b = buildingMap.get(tile.buildingId);
      if (!b) continue;

      if (b.isZone && !b.customModel) {
        const curProg = tile.constructionProgress ?? 100;
        if (advanceTime && tile.roadConnected) {
          if (curProg === 0) {
            // Start self-developing construction site as soon as connected to a road!
            tile.constructionProgress = 14 + ((x * 7 + z * 13) % 14);
          } else if (curProg < 100) {
            // Gradually advance construction with cranes, cement trucks, and workers
            const speedStep = (tile.powered ? 10 : 6) + (tile.watered ? 8 : 4) + ((x + z) % 5);
            tile.constructionProgress = Math.min(100, curProg + speedStep);
          }
        }

        const updatedProg = tile.constructionProgress ?? 100;
        if (updatedProg < 100) {
          // While empty lot (0%) or active construction site (1..99%), provide temporary construction jobs
          if (updatedProg > 0) {
            jobsTotal += 6;
          }
          continue;
        }
      }

      // Organic custom lot spawning when zone construction completes
      if (advanceTime && tile.constructionProgress === 100 && b.isZone && !b.customLotData) {
        const matchingCustomLots = state.mods
          .filter((m) => m.enabled && m.building.customLotData && m.building.isZone)
          .map((m) => m.building);
        if (matchingCustomLots.length > 0 && (tile.x * 7 + tile.z * 11) % 5 === 0) {
          const compatible = matchingCustomLots.filter((lot) => {
            if (b.archetype.includes('res') && lot.archetype.includes('res')) return true;
            if (b.archetype.includes('com') && lot.archetype.includes('com')) return true;
            if (b.archetype.includes('ind') && lot.archetype.includes('ind')) return true;
            return false;
          });
          if (compatible.length > 0) {
            const picked = compatible[(tile.x + tile.z) % compatible.length];
            tile.buildingId = picked.id;
          }
        }
      }

      // Zone level progression (1 -> 9 split by density: Low 1-3, Medium 4-6, High 7-9) once construction is 100% completed, powered, watered, and road-connected
      if (advanceTime && b.isZone && tile.powered && tile.watered && tile.roadConnected) {
        const isHigh = b.archetype.includes('high');
        const isInd = b.archetype === 'industrial';
        const maxLevel = isHigh ? 9 : isInd ? 6 : 3;
        const minLevel = isHigh ? 7 : isInd ? 4 : 1;
        if (tile.buildingLevel < minLevel) {
          tile.buildingLevel = minLevel;
        }
        if (tile.buildingLevel < maxLevel) {
          const reqVal = 35 + (tile.buildingLevel - minLevel + 1) * 7;
          if (tile.landValue >= reqVal) {
            tile.buildingLevel = Math.min(maxLevel, tile.buildingLevel + 1);
          }
        }
      }

      const efficiency =
        (tile.powered ? 0.45 : 0.1) +
        (tile.watered ? 0.35 : 0.05) +
        (tile.roadConnected ? 0.2 : 0.05);

      const levelScale = b.isZone ? 1 + (tile.buildingLevel - 1) * 0.75 : 1;

      if (b.populationCapacity > 0) {
        population += Math.round(b.populationCapacity * levelScale * efficiency);
        resZones++;
      }
      if (b.jobsCapacity > 0) {
        jobsTotal += Math.round(b.jobsCapacity * levelScale * efficiency);
        if (b.archetype === 'commercial_low' || b.archetype === 'commercial_high') comZones++;
        if (b.archetype === 'industrial') indZones++;
      }
    }
  }

  const totalTiles = size * size;
  const averageLandValue = Math.round(sumLandValue / totalTiles);
  const averagePollution = Math.round(sumPollution / totalTiles);

  const jobsAvailable = Math.max(0, jobsTotal - Math.round(population * 0.6));
  const taxR = Math.round((population * state.metrics.taxRateR) * 0.28);
  const taxC = Math.round((comZones * 55 * state.metrics.taxRateC) * 0.32);
  const taxI = Math.round((indZones * 65 * state.metrics.taxRateI) * 0.35);
  const netIncome = taxR + taxC + taxI - totalUpkeep;

  // Calculate RCI Demand (-100 to +100)
  const taxPenaltyR = (state.metrics.taxRateR - 9) * 6;
  const taxPenaltyC = (state.metrics.taxRateC - 9) * 6;
  const taxPenaltyI = (state.metrics.taxRateI - 9) * 6;

  const demandR = Math.round(
    Math.max(-100, Math.min(100, 65 + (jobsTotal - population * 0.65) * 0.25 - taxPenaltyR))
  );
  const demandC = Math.round(
    Math.max(-100, Math.min(100, 50 + (population * 0.35 - comZones * 45) * 0.35 - taxPenaltyC))
  );
  const demandI = Math.round(
    Math.max(-100, Math.min(100, 55 + (population * 0.3 - indZones * 55) * 0.3 - taxPenaltyI))
  );

  // Happiness calculation
  const powerSatisfaction = powerConsumedMW === 0 || powerProducedMW >= powerConsumedMW ? 15 : -20;
  const waterSatisfaction = waterConsumedM3 === 0 || waterProducedM3 >= waterConsumedM3 ? 15 : -20;
  const happiness = Math.round(
    Math.max(
      10,
      Math.min(
        100,
        55 +
          powerSatisfaction +
          waterSatisfaction +
          (averageLandValue - 35) * 0.45 -
          averagePollution * 0.6 -
          (state.metrics.taxRateR - 9) * 2.5
      )
    )
  );

  const highwayCount = nextTiles.filter(
    (t) => t.buildingId === 'road_highway' || t.buildingId === 'mod_bldg_skytrain'
  ).length;
  const trafficCongestion = Math.round(
    Math.max(5, Math.min(100, (population / Math.max(10, roadCount * 18 + highwayCount * 45)) * 28))
  );

  let dayCount = state.metrics.dayCount;
  let monthCount = state.metrics.monthCount;
  let yearCount = state.metrics.yearCount;
  let treasury = state.metrics.treasury;

  if (advanceTime) {
    dayCount += 1;
    // Apply fractional budget every tick so player sees responsive treasury flow
    treasury = Math.round(treasury + netIncome * 0.25);
    if (dayCount > 30) {
      dayCount = 1;
      monthCount += 1;
      if (monthCount > 12) {
        monthCount = 1;
        yearCount += 1;
      }
    }
  }

  let status = state.status;
  let outcomeReason = state.outcomeReason ?? null;

  if (status === 'playing' && advanceTime) {
    if (treasury <= -5000) {
      status = 'gameover';
      outcomeReason = 'defeat_bankruptcy';
    } else if (population >= 2500 && happiness >= 75 && outcomeReason === null) {
      status = 'gameover';
      outcomeReason = 'victory_metropolis';
    }
  }

  return {
    ...state,
    tiles: nextTiles,
    status,
    outcomeReason,
    metrics: {
      ...state.metrics,
      treasury,
      netIncome,
      population,
      jobsTotal,
      jobsAvailable,
      powerProducedMW,
      powerConsumedMW,
      waterProducedM3,
      waterConsumedM3,
      happiness,
      averageLandValue,
      averagePollution,
      trafficCongestion,
      demandR,
      demandC,
      demandI,
      dayCount,
      monthCount,
      yearCount,
    },
  };
}

export interface CustomModInput {
  title: string;
  author: string;
  buildingName: string;
  archetype: BuildingArchetype;
  cost: number;
  powerMW: number;
  waterM3: number;
  populationCapacity: number;
  jobsCapacity: number;
  pollutionDelta: number;
  landValueBoost: number;
  stories: number;
  primaryColor: string;
  accentColor: string;
  description: string;
  customModel?: Custom3DModelConfig;
}

export function validateAndCreateModPackage(
  input: CustomModInput
): { valid: boolean; modPackage?: ModPackage; error?: string } {
  const title = input.title.trim();
  const buildingName = input.buildingName.trim();
  const author = input.author.trim();

  if (!title || title.length < 3) {
    return { valid: false, error: 'กรุณาระบุชื่อแพ็กเกจ Mod (อย่างน้อย 3 ตัวอักษร)' };
  }
  if (!buildingName || buildingName.length < 2) {
    return { valid: false, error: 'กรุณาระบุชื่ออาคาร รถยนต์ หรือของตกแต่ง' };
  }
  if (!author) {
    return { valid: false, error: 'กรุณาระบุชื่อผู้พัฒนา Mod (Author)' };
  }
  if (!Number.isFinite(input.cost) || input.cost < 0 || input.cost > 50000) {
    return { valid: false, error: 'ค่าก่อสร้างต้องอยู่ระหว่าง 0 ถึง 50,000 ฿' };
  }
  if (!Number.isFinite(input.stories) || input.stories < 1 || input.stories > 30) {
    return { valid: false, error: 'จำนวนชั้นอาคารต้องอยู่ระหว่าง 1 ถึง 30 ชั้น' };
  }

  const slug = buildingName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || `custom_${Date.now()}`;

  const modId = `mod_custom_${slug}_${Math.floor(Math.random() * 1000)}`;
  const buildingId = `bldg_${slug}_${Math.floor(Math.random() * 1000)}`;

  const categoryTag =
    input.customModel?.assetCategory === 'vehicle'
      ? '[3D รถยนต์]'
      : input.customModel?.assetCategory === 'prop'
      ? '[3D ของตกแต่ง]'
      : input.customModel
      ? '[3D อาคาร]'
      : '[Mod]';

  const modPackage: ModPackage = {
    id: modId,
    title,
    author,
    version: '1.0.0',
    description: input.description.trim() || `โมเดลเสริมพิเศษพัฒนาโดย ${author}`,
    enabled: true,
    customModel: input.customModel,
    building: {
      id: buildingId,
      name: `${categoryTag} ${buildingName}`,
      nameEn: buildingName,
      category: 'mods',
      archetype: input.archetype,
      cost: Math.round(input.cost),
      upkeepPerMonth: Math.max(2, Math.round(input.cost * 0.03)),
      powerMW: Math.round(input.powerMW),
      waterM3: Math.round(input.waterM3),
      populationCapacity: Math.max(0, Math.round(input.populationCapacity)),
      jobsCapacity: Math.max(0, Math.round(input.jobsCapacity)),
      pollutionDelta: Math.round(input.pollutionDelta),
      landValueBoost: Math.round(input.landValueBoost),
      serviceRadius: 12,
      isZone: false,
      primaryColor: input.primaryColor || '#0284c7',
      secondaryColor: '#e2e8f0',
      accentColor: input.accentColor || '#38bdf8',
      stories: Math.round(input.stories),
      isMod: true,
      modAuthor: author,
      modVersion: '1.0.0',
      description: input.description.trim() || `โมเดลเสริมพิเศษพัฒนาโดย ${author}`,
      customModel: input.customModel,
    },
  };

  return { valid: true, modPackage };
}

export function createInitialRegionWorld(
  regionName = 'มหานครสุวรรณภูมิ',
  preset: TerrainPreset = 'pristine_flat'
): RegionWorldState {
  const gridCols = 3;
  const gridRows = 3;
  const plots: Record<string, RegionPlot> = {};

  const sectorNames: string[][] = [
    ['ชายฝั่งทิศตะวันตกเฉียงเหนือ', 'เขตอุตสาหกรรมเหนือ', 'หุบเขาตะวันออกเฉียงเหนือ'],
    ['อ่าวท่าเรือตะวันตก', 'ศูนย์กลางมหานครหลวง', 'ที่ราบเกษตรกรรมตะวันออก'],
    ['อุทยานธรรมชาติใต้', 'เขตนวัตกรรมใต้', 'คาบสมุทรแหลมทอง'],
  ];

  for (let gz = 0; gz < gridRows; gz++) {
    for (let gx = 0; gx < gridCols; gx++) {
      const id = `plot_${gx}_${gz}`;
      const name = sectorNames[gz][gx];
      const isCenter = gx === 1 && gz === 1;

      // Center plot or specified preset
      const plotConfig: RegionConfig = {
        size: 32,
        preset: preset,
        seed: 4280 + gx * 107 + gz * 313,
        waterLevelOffset: 0,
        cliffSteepness: 1.0,
        forestDensity: 0.35,
        cityName: name,
      };

      const tiles = generateRegionTiles(plotConfig);

      plots[id] = {
        id,
        gridX: gx,
        gridZ: gz,
        name,
        size: 32,
        tiles,
        metrics: createInitialMetrics(),
        config: plotConfig,
        incorporated: false,
        lastPlayedDate: isCenter ? 'กำลังเลือก' : 'ยังไม่สำรวจ',
      };
    }
  }

  return {
    regionName,
    gridCols,
    gridRows,
    plots,
    activePlotId: 'plot_1_1',
    activeMode: 'god_mode',
  };
}

export function incorporateCityPlot(plot: RegionPlot): RegionPlot {
  return {
    ...plot,
    incorporated: true,
    metrics: {
      ...plot.metrics,
      treasury: Math.max(plot.metrics.treasury, 50000),
    },
    lastPlayedDate: 'วันนี้',
  };
}
