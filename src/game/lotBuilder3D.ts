import * as THREE from 'three';
import { CustomLotDefinition, CustomLotProp, LotBaseTexture, BuildingDefinition, Custom3DModelConfig } from './types';
import { getCachedCustomModelClone } from './customModels';

// Cache for Lot Base Textures
const _lotTexCache = new Map<LotBaseTexture, THREE.CanvasTexture>();

export function getLotBaseTexture(textureType: LotBaseTexture): THREE.CanvasTexture {
  if (_lotTexCache.has(textureType)) {
    return _lotTexCache.get(textureType)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  if (textureType === 'grass') {
    ctx.fillStyle = '#22602e';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#1c5226';
    for (let i = 0; i < 400; i++) {
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
    }
  } else if (textureType === 'concrete') {
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, 248, 248);
    ctx.strokeRect(128, 4, 1, 248);
    ctx.strokeRect(4, 128, 248, 1);
  } else if (textureType === 'asphalt') {
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#f8fafc';
    // Parking line markings
    ctx.fillRect(20, 10, 6, 80);
    ctx.fillRect(80, 10, 6, 80);
    ctx.fillRect(140, 10, 6, 80);
    ctx.fillRect(200, 10, 6, 80);
  } else if (textureType === 'brick') {
    ctx.fillStyle = '#7c2d12';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#9a3412';
    ctx.lineWidth = 2;
    for (let y = 0; y < 256; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
    for (let x = 0; x < 256; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
      ctx.stroke();
    }
  } else if (textureType === 'dirt') {
    ctx.fillStyle = '#78350f';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#92400e';
    for (let i = 0; i < 350; i++) {
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 4, 4);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  _lotTexCache.set(textureType, tex);
  return tex;
}

// Create a single prop mesh based on propType
export function createPropMesh(prop: CustomLotProp): THREE.Object3D {
  const container = new THREE.Group();

  if (prop.customModelStorageKey) {
    const config: Custom3DModelConfig = {
      assetCategory: 'prop',
      modelFormat: 'glb',
      storageKey: prop.customModelStorageKey,
      scaleMultiplier: prop.scale,
      yOffset: prop.offsetY,
      rotationY: prop.rotationY,
    };
    const clone = getCachedCustomModelClone(config);
    if (clone) {
      container.add(clone);
      container.position.set(prop.subX, 0, prop.subZ);
      return container;
    }
  }

  let mesh: THREE.Object3D;
  const colHex = prop.colorHex ? parseInt(prop.colorHex.replace('#', ''), 16) : 0xffffff;

  switch (prop.propType) {
    case 'tree_oak': {
      const grp = new THREE.Group();
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.09, 0.5, 6),
        new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 })
      );
      trunk.position.y = 0.25;
      const canopy = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.42, 0),
        new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.75, flatShading: true })
      );
      canopy.position.y = 0.75;
      grp.add(trunk, canopy);
      mesh = grp;
      break;
    }

    case 'tree_pine': {
      const grp = new THREE.Group();
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.08, 0.5, 6),
        new THREE.MeshStandardMaterial({ color: 0x582c0e, roughness: 0.9 })
      );
      trunk.position.y = 0.25;
      const canopy = new THREE.Mesh(
        new THREE.ConeGeometry(0.38, 0.9, 6),
        new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8, flatShading: true })
      );
      canopy.position.y = 0.9;
      grp.add(trunk, canopy);
      mesh = grp;
      break;
    }

    case 'tree_palm': {
      const grp = new THREE.Group();
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.08, 0.7, 6),
        new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.9 })
      );
      trunk.position.y = 0.35;
      trunk.rotation.z = 0.08;
      const crown = new THREE.Mesh(
        new THREE.ConeGeometry(0.5, 0.2, 5),
        new THREE.MeshStandardMaterial({ color: 0x65a30d, roughness: 0.7, flatShading: true })
      );
      crown.position.y = 0.72;
      grp.add(trunk, crown);
      mesh = grp;
      break;
    }

    case 'tree_sakura': {
      const grp = new THREE.Group();
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.08, 0.5, 6),
        new THREE.MeshStandardMaterial({ color: 0x4a2c2a, roughness: 0.9 })
      );
      trunk.position.y = 0.25;
      const canopy = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.42, 0),
        new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.75, flatShading: true })
      );
      canopy.position.y = 0.75;
      grp.add(trunk, canopy);
      mesh = grp;
      break;
    }

    case 'bench': {
      const grp = new THREE.Group();
      const seat = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.04, 0.16),
        new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 })
      );
      seat.position.y = 0.14;
      const leg1 = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.14, 0.14),
        new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6 })
      );
      leg1.position.set(-0.18, 0.07, 0);
      const leg2 = leg1.clone();
      leg2.position.set(0.18, 0.07, 0);
      grp.add(seat, leg1, leg2);
      mesh = grp;
      break;
    }

    case 'street_lamp': {
      const grp = new THREE.Group();
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.03, 0.8, 8),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.2 })
      );
      pole.position.y = 0.4;
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 8, 8),
        new THREE.MeshStandardMaterial({
          color: 0xfef08a,
          emissive: 0xfef08a,
          emissiveIntensity: 1.5,
        })
      );
      bulb.position.set(0, 0.82, 0.08);
      grp.add(pole, bulb);
      mesh = grp;
      break;
    }

    case 'fence': {
      const grp = new THREE.Group();
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.95, 0.05, 0.03),
        new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 })
      );
      rail.position.y = 0.28;
      const post1 = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.35, 0.06),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.6 })
      );
      post1.position.set(-0.45, 0.175, 0);
      const post2 = post1.clone();
      post2.position.set(0.45, 0.175, 0);
      grp.add(rail, post1, post2);
      mesh = grp;
      break;
    }

    case 'car_sedan':
    case 'car_suv': {
      const grp = new THREE.Group();
      const bodyColor = prop.colorHex ? colHex : 0x38bdf8;
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.16, 0.85),
        new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.3, metalness: 0.6 })
      );
      body.position.y = 0.12;
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(0.36, 0.14, 0.45),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, metalness: 0.9 })
      );
      cabin.position.set(0, 0.25, -0.05);
      grp.add(body, cabin);
      mesh = grp;
      break;
    }

    case 'trash_bin': {
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.07, 0.22, 10),
        new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.7 })
      );
      mesh.position.y = 0.11;
      break;
    }

    case 'planter_box': {
      const grp = new THREE.Group();
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.18, 0.6),
        new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 })
      );
      box.position.y = 0.09;
      const bush = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 })
      );
      bush.position.y = 0.24;
      grp.add(box, bush);
      mesh = grp;
      break;
    }

    case 'fountain': {
      const grp = new THREE.Group();
      const basin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.7, 0.6, 0.2, 14),
        new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.4 })
      );
      basin.position.y = 0.1;
      const water = new THREE.Mesh(
        new THREE.CylinderGeometry(0.62, 0.62, 0.05, 14),
        new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, transparent: true, opacity: 0.85 })
      );
      water.position.y = 0.18;
      const jet = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.12, 0.45, 8),
        new THREE.MeshStandardMaterial({ color: 0x93c5fd, roughness: 0.2 })
      );
      jet.position.y = 0.35;
      grp.add(basin, water, jet);
      mesh = grp;
      break;
    }

    case 'billboard': {
      const grp = new THREE.Group();
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.04, 0.9, 8),
        new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7 })
      );
      post.position.y = 0.45;
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.45, 0.04),
        new THREE.MeshStandardMaterial({ color: colHex || 0x3b82f6, roughness: 0.4 })
      );
      board.position.set(0, 0.85, 0);
      grp.add(post, board);
      mesh = grp;
      break;
    }

    default: {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.3, 0.3),
        new THREE.MeshStandardMaterial({ color: colHex || 0x94a3b8, roughness: 0.5 })
      );
      mesh.position.y = 0.15;
      break;
    }
  }

  container.add(mesh);
  container.scale.setScalar(prop.scale);
  container.rotation.y = (prop.rotationY * Math.PI) / 180;
  container.position.set(prop.subX, prop.offsetY, prop.subZ);

  return container;
}

// Build the full 3D group for a Lot (Ground tile, Front Arrow, Props & Main Building)
export function buildCustomLot3DGroup(
  lotDef: CustomLotDefinition,
  allBuildingsMap?: Map<string, BuildingDefinition>,
  options?: { isStudioPreview?: boolean }
): THREE.Group {
  const root = new THREE.Group();

  const widthMeters = lotDef.sizeX;
  const depthMeters = lotDef.sizeZ;

  // 1. Base Ground Surface (Per-tile textures without overlap)
  const tileGroup = new THREE.Group();
  const halfX = lotDef.sizeX / 2;
  const halfZ = lotDef.sizeZ / 2;

  for (let z = 0; z < lotDef.sizeZ; z++) {
    for (let x = 0; x < lotDef.sizeX; x++) {
      const worldX = -halfX + x + 0.5;
      const worldZ = -halfZ + z + 0.5;
      const key = `${x},${z}`;
      const texType = lotDef.tileTextures?.[key] || lotDef.baseTexture;
      const tileTex = getLotBaseTexture(texType);
      tileTex.repeat.set(1, 1);

      const tileGeo = new THREE.PlaneGeometry(1.0, 1.0);
      tileGeo.rotateX(-Math.PI / 2);
      const tileMat = new THREE.MeshStandardMaterial({
        map: tileTex,
        roughness: 0.8,
        metalness: 0.1,
        side: THREE.DoubleSide,
      });
      const tileMesh = new THREE.Mesh(tileGeo, tileMat);
      tileMesh.position.set(worldX, 0.005, worldZ);
      tileMesh.receiveShadow = true;
      tileGroup.add(tileMesh);
    }
  }
  root.add(tileGroup);

  // 2. SC4 Style Front Road Facing Arrow (Indicator on positive Z edge - ONLY rendered in Studio Preview)
  if (options?.isStudioPreview && lotDef.showFrontArrow !== false) {
    const arrowGrp = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.01, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x22c55e })
    );
    shaft.position.set(0, 0.01, depthMeters / 2 - 0.35);

    const headGeo = new THREE.ConeGeometry(0.2, 0.3, 3);
    headGeo.rotateX(Math.PI / 2);
    const head = new THREE.Mesh(headGeo, new THREE.MeshBasicMaterial({ color: 0x22c55e }));
    head.position.set(0, 0.01, depthMeters / 2 - 0.08);

    arrowGrp.add(shaft, head);
    root.add(arrowGrp);
  }

  // 3. Grid Lines (for studio preview)
  if (options?.isStudioPreview) {
    const gridHelper = new THREE.GridHelper(
      Math.max(widthMeters, depthMeters),
      Math.max(lotDef.sizeX, lotDef.sizeZ),
      0x3b82f6,
      0x475569
    );
    gridHelper.position.y = 0.005;
    root.add(gridHelper);
  }

  // 4. Props
  if (lotDef.props && lotDef.props.length > 0) {
    for (const prop of lotDef.props) {
      const propObj = createPropMesh(prop);
      root.add(propObj);
    }
  }

  return root;
}
