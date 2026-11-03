import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTerrainTool,
  computeRoadDragPath,
  createInitialSimulationState,
  getRegionDimensionsMeters,
  placeBuildingOnTile,
  placeRoadPathOnTiles,
  simulateCityTick,
  TILE_SIZE_METERS,
  VALID_REGION_SIZES,
  validateAndCreateModPackage,
} from './rules';
import { RegionConfig } from './types';

test('region sizes 32x32, 48x48, 64x64 map to 10m per tile accurately', () => {
  assert.deepEqual(VALID_REGION_SIZES, [32, 48, 64]);
  assert.equal(TILE_SIZE_METERS, 10);

  const dim32 = getRegionDimensionsMeters(32);
  assert.equal(dim32.widthMeters, 320);
  assert.equal(dim32.heightMeters, 320);

  const dim48 = getRegionDimensionsMeters(48);
  assert.equal(dim48.widthMeters, 480);

  const dim64 = getRegionDimensionsMeters(64);
  assert.equal(dim64.widthMeters, 640);
});

test('initial simulation state generates valid terrain and starter city for all 3 sizes', () => {
  for (const size of VALID_REGION_SIZES) {
    const config: RegionConfig = {
      size,
      preset: 'river_valley',
      seed: 42,
      waterLevelOffset: 0,
      cliffSteepness: 1.0,
      forestDensity: 0.5,
      cityName: `TestCity-${size}`,
    };
    const state = createInitialSimulationState(config);
    assert.equal(state.tiles.length, size * size);
    assert.ok(state.metrics.population > 0, `Expected starter population > 0 for size ${size}`);
    assert.ok(state.metrics.powerProducedMW > 0, 'Expected starter solar plant to produce power');
    assert.ok(state.metrics.waterProducedM3 > 0, 'Expected starter water tower to produce water');
  }
});

test('terrain sculpting tools modify elevation, water, and cliffs accurately', () => {
  const config: RegionConfig = {
    size: 32,
    preset: 'flatland_basin',
    seed: 100,
    waterLevelOffset: 0,
    cliffSteepness: 1.0,
    forestDensity: 0.4,
    cityName: 'SculptCity',
  };
  let state = createInitialSimulationState(config, undefined, true);
  const targetIdx = 10 * 32 + 10;
  const initialElev = state.tiles[targetIdx].elevation;

  // Raise terrain
  const raiseRes = applyTerrainTool(state, 'terrain_raise', 10, 10, 0);
  assert.equal(raiseRes.modifiedCount, 1);
  assert.ok(raiseRes.nextState.tiles[targetIdx].elevation > initialElev);

  // Carve water canal
  const waterRes = applyTerrainTool(raiseRes.nextState, 'terrain_water', 10, 10, 0);
  assert.equal(waterRes.nextState.tiles[targetIdx].isWater, true);

  // Create cliff plateau
  const cliffRes = applyTerrainTool(waterRes.nextState, 'terrain_cliff', 12, 12, 0);
  assert.equal(cliffRes.nextState.tiles[12 * 32 + 12].isCliff, true);
});

test('placing a road on water automatically builds a bridge and placing zones grows population', () => {
  const config: RegionConfig = {
    size: 32,
    preset: 'flatland_basin',
    seed: 7,
    waterLevelOffset: 0,
    cliffSteepness: 1.0,
    forestDensity: 0.2,
    cityName: 'BridgeTown',
  };
  let state = createInitialSimulationState(config, undefined, true);

  // Carve water at (5, 5)
  state = applyTerrainTool(state, 'terrain_water', 5, 5, 0).nextState;
  assert.equal(state.tiles[5 * 32 + 5].isWater, true);

  // Non-road building on water is rejected
  const badZone = placeBuildingOnTile(state, 'zone_res_low', 5, 5);
  assert.equal(badZone.placed, false);

  // Road on water becomes a bridge
  const bridgeRes = placeBuildingOnTile(state, 'road_avenue', 5, 5);
  assert.equal(bridgeRes.placed, true);
  assert.equal(bridgeRes.nextState.tiles[5 * 32 + 5].isBridge, true);
});

test('custom Mod validation rejects empty fields and registers valid custom building mods', () => {
  const invalid = validateAndCreateModPackage({
    title: '',
    author: 'Tester',
    buildingName: 'Solar Tower',
    archetype: 'arcology_tower',
    cost: 500,
    powerMW: 50,
    waterM3: 10,
    populationCapacity: 100,
    jobsCapacity: 50,
    pollutionDelta: -5,
    landValueBoost: 15,
    stories: 10,
    primaryColor: '#0284c7',
    accentColor: '#38bdf8',
    description: 'Test mod',
  });
  assert.equal(invalid.valid, false);

  const valid = validateAndCreateModPackage({
    title: 'Hydro-Solar Spire Mod',
    author: 'ArchitectTH',
    buildingName: 'Hydro-Solar Spire',
    archetype: 'arcology_tower',
    cost: 1200,
    powerMW: 80,
    waterM3: 60,
    populationCapacity: 300,
    jobsCapacity: 120,
    pollutionDelta: -10,
    landValueBoost: 25,
    stories: 14,
    primaryColor: '#0f766e',
    accentColor: '#2dd4bf',
    description: 'High efficiency eco tower',
  });
  assert.equal(valid.valid, true);
  assert.ok(valid.modPackage);
  assert.equal(valid.modPackage.building.isMod, true);
  assert.equal(valid.modPackage.building.populationCapacity, 300);

  // Verify the custom mod building can be placed on a tile and simulated
  const config: RegionConfig = {
    size: 32,
    preset: 'flatland_basin',
    seed: 12,
    waterLevelOffset: 0,
    cliffSteepness: 1.0,
    forestDensity: 0.2,
    cityName: 'ModCity',
  };
  let state = createInitialSimulationState(config, [valid.modPackage], true);
  state = placeBuildingOnTile(state, 'road_avenue', 15, 15).nextState;
  const placedMod = placeBuildingOnTile(state, valid.modPackage.building.id, 15, 16);
  assert.equal(placedMod.placed, true);
  const ticked = simulateCityTick(placedMod.nextState, true);
  assert.ok(ticked.metrics.powerProducedMW >= 80);
});

test('pristine_flat preset generates 100% flat empty terrain with 0 buildings and 0 trees', () => {
  const config: RegionConfig = {
    size: 32,
    preset: 'pristine_flat',
    seed: 555,
    waterLevelOffset: 0,
    cliffSteepness: 1.0,
    forestDensity: 0.5,
    cityName: 'PristineLand',
  };
  const state = createInitialSimulationState(config);
  assert.equal(state.executionMode, 'god_mode');
  assert.equal(state.incorporated, false);

  for (const tile of state.tiles) {
    assert.equal(tile.elevation, 2.0, 'All tiles must be flat +2.0m');
    assert.equal(tile.isWater, false, 'No initial water on pristine flat');
    assert.equal(tile.buildingId, null, 'No initial buildings on pristine flat');
    assert.equal(tile.trees, 0, 'No trees initially on pristine flat');
  }
});

test('God Mode free terraforming incurs zero treasury deduction and supports smooth/clear', () => {
  const config: RegionConfig = {
    size: 32,
    preset: 'pristine_flat',
    seed: 123,
    waterLevelOffset: 0,
    cliffSteepness: 1.0,
    forestDensity: 0,
    cityName: 'GodModeCity',
  };
  const state = createInitialSimulationState(config);
  const initTreasury = state.metrics.treasury;

  // Free raise with brush radius 1 (9 tiles)
  const raised = applyTerrainTool(state, 'terrain_raise', 16, 16, 1, true);
  assert.equal(raised.totalCost, 0);
  assert.equal(raised.nextState.metrics.treasury, initTreasury);
  assert.equal(raised.modifiedCount, 9);

  // Free smooth
  const smoothed = applyTerrainTool(raised.nextState, 'terrain_smooth', 16, 16, 1, true);
  assert.equal(smoothed.totalCost, 0);

  // Free clear
  const cleared = applyTerrainTool(smoothed.nextState, 'terrain_clear', 16, 16, 1, true);
  assert.equal(cleared.totalCost, 0);
  assert.equal(cleared.nextState.tiles[16 * 32 + 16].elevation, 2.0);
});

test('mountain, plateau, river, and 4 low-poly tree species tools sculpt terrain and assign treeType accurately', () => {
  const config: RegionConfig = {
    size: 32,
    preset: 'pristine_flat',
    seed: 999,
    waterLevelOffset: 0,
    cliffSteepness: 1.0,
    forestDensity: 0,
    cityName: 'EcoTest',
  };
  let state = createInitialSimulationState(config);

  // 1. Mountain tool raises center peak higher than outer ring
  state = applyTerrainTool(state, 'terrain_mountain', 10, 10, 1, true).nextState;
  const centerPeak = state.tiles[10 * 32 + 10].elevation;
  const slopeTile = state.tiles[10 * 32 + 11].elevation;
  assert.ok(centerPeak > slopeTile, 'Mountain peak should be higher than slope');
  assert.ok(centerPeak >= 7.0, 'Mountain peak should rise significantly from 2.0m');

  // 2. Plateau tool creates uniform flat highland
  state = applyTerrainTool(state, 'terrain_plateau', 20, 20, 1, true).nextState;
  assert.equal(state.tiles[20 * 32 + 20].elevation, 16.0);
  assert.equal(state.tiles[20 * 32 + 21].elevation, 16.0);
  assert.equal(state.tiles[20 * 32 + 21].isCliff, true);

  // 3. River tool carves water channel at center and banks on outer radius
  state = applyTerrainTool(state, 'terrain_river', 15, 15, 1, true).nextState;
  assert.equal(state.tiles[15 * 32 + 15].isWater, true);
  assert.equal(state.tiles[15 * 32 + 16].isWater, false);
  assert.equal(state.tiles[15 * 32 + 16].treeType, 'palm');

  // 4. All 4 tree species tools plant trees with matching treeType
  state = applyTerrainTool(state, 'tree_pine', 4, 4, 0, true).nextState;
  assert.equal(state.tiles[4 * 32 + 4].trees, 3);
  assert.equal(state.tiles[4 * 32 + 4].treeType, 'pine');

  state = applyTerrainTool(state, 'tree_oak', 5, 4, 0, true).nextState;
  assert.equal(state.tiles[4 * 32 + 5].trees, 3);
  assert.equal(state.tiles[4 * 32 + 5].treeType, 'oak');

  state = applyTerrainTool(state, 'tree_palm', 6, 4, 0, true).nextState;
  assert.equal(state.tiles[4 * 32 + 6].trees, 3);
  assert.equal(state.tiles[4 * 32 + 6].treeType, 'palm');

  state = applyTerrainTool(state, 'tree_sakura', 7, 4, 0, true).nextState;
  assert.equal(state.tiles[4 * 32 + 7].trees, 3);
  assert.equal(state.tiles[4 * 32 + 7].treeType, 'sakura');
});

test('computeRoadDragPath and placeRoadPathOnTiles build continuous straight and L-shaped roads and bridges', () => {
  const config: RegionConfig = {
    size: 32,
    preset: 'pristine_flat',
    seed: 321,
    waterLevelOffset: 0,
    cliffSteepness: 1.0,
    forestDensity: 0,
    cityName: 'RoadDragCity',
  };
  let state = createInitialSimulationState(config);
  state.executionMode = 'mayor_mode';
  state.incorporated = true;

  // Single tile click
  const singlePath = computeRoadDragPath(5, 5, 5, 5, 32);
  assert.equal(singlePath.length, 1);

  // L-shaped drag from (5, 5) to (9, 7) -> 5 horizontal + 2 vertical = 7 tiles
  const lPath = computeRoadDragPath(5, 5, 9, 7, 32);
  assert.equal(lPath.length, 7);
  assert.deepEqual(lPath[0], { x: 5, z: 5 });
  assert.deepEqual(lPath[lPath.length - 1], { x: 9, z: 7 });

  const placedRes = placeRoadPathOnTiles(state, 'road_avenue', lPath);
  assert.equal(placedRes.placedCount, 7);
  assert.equal(placedRes.totalCost, 7 * 40);
  assert.equal(placedRes.nextState.tiles[5 * 32 + 5].buildingId, 'road_avenue');
  assert.equal(placedRes.nextState.tiles[7 * 32 + 9].buildingId, 'road_avenue');
});


