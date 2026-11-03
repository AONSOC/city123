export type RegionSize = 32 | 48 | 64; // 1 tile = 10 meters (320m, 480m, 640m)

export type TerrainPreset =
  | 'river_valley'
  | 'coastal_bay'
  | 'highland_cliffs'
  | 'flatland_basin'
  | 'pristine_flat';

export type GameExecutionMode = 'region_view' | 'god_mode' | 'mayor_mode';

export type GameStateStatus = 'title' | 'playing' | 'paused' | 'gameover';

export type ToolCategory =
  | 'inspect'
  | 'roads'
  | 'zones'
  | 'utilities'
  | 'services'
  | 'terrain'
  | 'demolish'
  | 'mods';

export type TreeSpecies = 'pine' | 'oak' | 'palm' | 'sakura';

export type TimeOfDayPreset = 'morning' | 'noon' | 'evening' | 'night';

export type TerrainToolId =
  | 'terrain_raise'
  | 'terrain_lower'
  | 'terrain_mountain'
  | 'terrain_plateau'
  | 'terrain_cliff'
  | 'terrain_water'
  | 'terrain_river'
  | 'terrain_flatten'
  | 'terrain_smooth'
  | 'terrain_forest'
  | 'tree_pine'
  | 'tree_oak'
  | 'tree_palm'
  | 'tree_sakura'
  | 'terrain_clear'
  | 'bulldoze';

export type BuiltinBuildingId =
  | 'road_avenue'
  | 'road_highway'
  | 'zone_res_low'
  | 'zone_res_high'
  | 'zone_com_low'
  | 'zone_com_high'
  | 'zone_ind'
  | 'power_coal'
  | 'power_wind'
  | 'power_solar'
  | 'water_pump'
  | 'water_tower'
  | 'service_police'
  | 'service_fire'
  | 'service_hospital'
  | 'service_school'
  | 'service_park';

export type ActiveToolId = TerrainToolId | BuiltinBuildingId | string; // string allows mod building IDs

export type DataOverlayMode = 'none' | 'power' | 'water' | 'pollution' | 'land_value';

export type BuildingArchetype =
  | 'road'
  | 'highway'
  | 'residential_low'
  | 'residential_high'
  | 'commercial_low'
  | 'commercial_high'
  | 'industrial'
  | 'power_coal'
  | 'power_wind'
  | 'power_solar'
  | 'water_pump'
  | 'water_tower'
  | 'civic_service'
  | 'park_plaza'
  | 'arcology_tower'
  | 'skytrain_hub'
  | 'fusion_dome';

export type Custom3DAssetCategory = 'building' | 'vehicle' | 'prop';

export type Custom3DModelFormat = 'glb' | 'gltf' | 'obj';

export interface Custom3DModelConfig {
  assetCategory: Custom3DAssetCategory;
  modelFormat: Custom3DModelFormat;
  storageKey: string; // Key in IndexedDB or external/sample identifier
  sourceUrl?: string; // Optional external URL if loaded via URL
  fileName?: string;
  scaleMultiplier: number; // 0.2 to 3.0 (default 1.0)
  yOffset: number; // -0.5 to 1.0 (default 0)
  rotationY: number; // 0, 90, 180, 270 degrees
}

export type LotBaseTexture = 'grass' | 'concrete' | 'asphalt' | 'brick' | 'dirt';

export interface CustomLotProp {
  id: string; // Unique instance id
  propType: string; // 'tree_oak' | 'tree_pine' | 'tree_palm' | 'tree_sakura' | 'bench' | 'street_lamp' | 'fence' | 'car_sedan' | 'car_suv' | 'trash_bin' | 'planter_box' | 'fountain' | 'billboard' | 'custom_mod'
  subX: number; // Offset relative to Lot center in tiles (-sizeX/2 to +sizeX/2)
  subZ: number; // Offset relative to Lot center in tiles (-sizeZ/2 to +sizeZ/2)
  offsetY: number; // Y height elevation (-0.5 to 3.0)
  rotationY: number; // Degrees 0 to 360
  scale: number; // 0.2 to 3.0
  colorHex?: string;
  customModelStorageKey?: string;
}

export interface CustomLotDefinition {
  sizeX: number; // 1 to 10 tiles
  sizeZ: number; // 1 to 10 tiles
  baseTexture: LotBaseTexture;
  tileTextures?: Record<string, LotBaseTexture>; // Per-tile texture map "x,z" -> texture
  showFrontArrow?: boolean;
  mainBuildingId?: string;
  props: CustomLotProp[];
}

export interface BuildingDefinition {
  id: string;
  name: string;
  nameEn: string;
  category: ToolCategory;
  archetype: BuildingArchetype;
  cost: number;
  upkeepPerMonth: number;
  powerMW: number; // Positive = produces, Negative = consumes
  waterM3: number; // Positive = produces, Negative = consumes
  populationCapacity: number;
  jobsCapacity: number;
  pollutionDelta: number; // Positive = pollutes, Negative = cleans
  landValueBoost: number;
  serviceRadius: number; // In tiles (1 tile = 10m)
  isZone: boolean;
  requiresWaterEdge?: boolean;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  stories: number;
  keyBinding?: string;
  description: string;
  isMod?: boolean;
  modAuthor?: string;
  modVersion?: string;
  customModel?: Custom3DModelConfig;
  customLotData?: CustomLotDefinition;
}

export interface TileData {
  x: number;
  z: number;
  elevation: number; // Height in meters (-20m to +60m), water level is 0m
  isWater: boolean;
  isCliff: boolean;
  slope: number;
  trees: number; // 0 to 5 trees on tile
  treeType?: TreeSpecies;
  buildingId: string | null;
  buildingLevel: number; // 1 to 3 for zones
  buildingRotation: number; // 0, 1, 2, 3 (90 deg steps)
  buildingOriginX?: number; // Multi-tile origin X coordinate
  buildingOriginZ?: number; // Multi-tile origin Z coordinate
  isBuildingOrigin?: boolean; // True if this tile is the primary origin of a multi-tile lot
  constructionProgress?: number; // 0 = empty zoned lot, 1..99 = active construction site, 100 = completed building
  lotOrientation?: number; // 0=South, 1=East, 2=North, 3=West facing nearest road
  isBridge: boolean;
  powered: boolean;
  watered: boolean;
  roadConnected: boolean;
  pollution: number; // 0 to 100
  landValue: number; // 0 to 100
}

export interface RegionConfig {
  size: RegionSize;
  preset: TerrainPreset;
  seed: number;
  waterLevelOffset: number; // -5 to +5
  cliffSteepness: number; // 0.5 to 2.0
  forestDensity: number; // 0 to 1.0
  cityName: string;
}

export interface CityMetrics {
  treasury: number;
  netIncome: number;
  population: number;
  jobsTotal: number;
  jobsAvailable: number;
  powerProducedMW: number;
  powerConsumedMW: number;
  waterProducedM3: number;
  waterConsumedM3: number;
  happiness: number; // 0 to 100
  averageLandValue: number;
  averagePollution: number;
  trafficCongestion: number; // 0 to 100
  demandR: number; // -100 to +100
  demandC: number; // -100 to +100
  demandI: number; // -100 to +100
  taxRateR: number; // 5 to 18%
  taxRateC: number;
  taxRateI: number;
  dayCount: number;
  monthCount: number;
  yearCount: number;
}

export interface ModPackage {
  id: string;
  title: string;
  author: string;
  version: string;
  description: string;
  enabled: boolean;
  building: BuildingDefinition;
  customModel?: Custom3DModelConfig;
}

export interface CitySimulationState {
  config: RegionConfig;
  tiles: TileData[]; // size * size flat array: index = z * size + x
  metrics: CityMetrics;
  status: GameStateStatus;
  outcomeReason?: 'victory_metropolis' | 'defeat_bankruptcy' | null;
  mods: ModPackage[];
  simSpeed: 0 | 1 | 2 | 4;
  executionMode?: GameExecutionMode;
  incorporated?: boolean;
}

export interface RegionPlot {
  id: string; // e.g. 'plot_0_0'
  gridX: number; // 0..cols-1
  gridZ: number; // 0..rows-1
  name: string;
  size: RegionSize;
  tiles: TileData[];
  metrics: CityMetrics;
  config: RegionConfig;
  incorporated: boolean; // false = God Mode pristine canvas, true = Mayor incorporated
  lastPlayedDate?: string;
}

export interface RegionWorldState {
  regionName: string;
  gridCols: number;
  gridRows: number;
  plots: Record<string, RegionPlot>;
  activePlotId: string;
  activeMode: GameExecutionMode;
}
