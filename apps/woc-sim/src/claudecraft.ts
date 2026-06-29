// ClaudeCraft — procedural prop library for production scene composition.
//
// Each builder returns a {group, light?} pair. The group is positioned at
// (def.x, terrainY, def.z) with rotation.y = def.facing by the caller.
//
// Art style: warm earth tones, simple geometry, matches the existing world.
// Palette: wood 0x7a5a30, dark wood 0x4a2c14, stone 0x706050,
//          red tarp 0xcc4422, blue tarp 0x226688, gold 0xcc8822, green 0x3a7a28

import * as THREE from 'three';

export type AssetKind =
  | 'stall'      // vendor market stall — table + awning + posts
  | 'stall_min'  // smaller food cart style stall
  | 'barrel'     // single barrel
  | 'barrel_stack' // 3 barrels stacked
  | 'crate'      // wooden crate
  | 'crate_stack' // two crates
  | 'bench'      // simple wooden bench
  | 'campfire'   // stone ring + fire glow
  | 'column'     // stone pillar
  | 'archway'    // two columns + beam — frames a passage
  | 'table'      // flat table with legs
  | 'cart'       // two-wheeled vendor cart
  | 'sign';      // sign post with board

export type StageAssetDef = {
  kind: AssetKind;
  x: number;
  z: number;
  facing?: number; // radians, applied as rotation.y
  scale?: number;
  color?: number;  // optional tarp/accent color override
};

export type BuiltAsset = {
  group: THREE.Group;
  light?: THREE.PointLight;
};

// ─── MATERIAL HELPERS ────────────────────────────────────────────────────────

const WOOD   = new THREE.MeshStandardMaterial({color: 0x7a5a30, roughness: 0.9});
const DWOOD  = new THREE.MeshStandardMaterial({color: 0x4a2c14, roughness: 1.0});
const STONE  = new THREE.MeshStandardMaterial({color: 0x706050, roughness: 0.95});
const ROPE   = new THREE.MeshStandardMaterial({color: 0xc8a860, roughness: 1.0});
const TARPS  = [0xcc4422, 0x226688, 0xcc8822, 0x3a7a28, 0x882288] as const;

function tarp(colorOverride?: number, idx = 0): THREE.MeshStandardMaterial {
  const c = colorOverride ?? TARPS[idx % TARPS.length]!;
  return new THREE.MeshStandardMaterial({color: c, roughness: 0.85});
}

function m(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ─── BUILDERS ────────────────────────────────────────────────────────────────

function buildStall(def: StageAssetDef): BuiltAsset {
  const g = new THREE.Group();
  const awningColor = def.color;

  // Table top
  g.add(Object.assign(m(new THREE.BoxGeometry(5, 0.9, 2.8), WOOD), {position: new THREE.Vector3(0, 1.0, 0)}));
  // Leg posts
  const legGeo = new THREE.CylinderGeometry(0.15, 0.15, 3.2, 5);
  for (const [lx, lz] of [[-2.1, -1.2], [2.1, -1.2], [-2.1, 1.2], [2.1, 1.2]] as const) {
    const leg = m(legGeo, DWOOD); leg.position.set(lx, 1.6, lz); g.add(leg);
  }
  // Cross-beam at top
  g.add(Object.assign(m(new THREE.CylinderGeometry(0.1, 0.1, 5.2, 5), DWOOD),
    {position: new THREE.Vector3(0, 3.1, -1.2), rotation: new THREE.Euler(0, 0, Math.PI / 2)}));
  // Awning tarp
  const awning = m(new THREE.PlaneGeometry(5.6, 3.2), tarp(awningColor, 0));
  awning.rotation.set(-0.28, 0, 0);
  awning.position.set(0, 3.4, -0.6);
  g.add(awning);
  // Goods on table (3 small crates)
  const goodGeo = new THREE.BoxGeometry(0.8, 0.6, 0.6);
  for (const [gx, gz] of [[-1.5, 0], [0, 0.3], [1.4, -0.2]] as const) {
    const good = m(goodGeo, WOOD); good.position.set(gx, 1.8, gz); g.add(good);
  }
  return {group: g};
}

function buildStallMin(def: StageAssetDef): BuiltAsset {
  // Smaller cart-style stall for Min (produce)
  const g = new THREE.Group();
  // Table
  g.add(Object.assign(m(new THREE.BoxGeometry(3.5, 0.8, 2), WOOD), {position: new THREE.Vector3(0, 0.9, 0)}));
  const legGeo = new THREE.CylinderGeometry(0.12, 0.12, 2.8, 5);
  for (const [lx, lz] of [[-1.5, -0.9], [1.5, -0.9], [-1.5, 0.9], [1.5, 0.9]] as const) {
    const leg = m(legGeo, DWOOD); leg.position.set(lx, 1.4, lz); g.add(leg);
  }
  // Colorful tarp
  const awning = m(new THREE.PlaneGeometry(4, 2.5), tarp(def.color, 2));
  awning.rotation.set(-0.22, 0, 0); awning.position.set(0, 3.0, -0.4);
  g.add(awning);
  // Produce: small spheres suggesting vegetables/fruit
  const pGeo = new THREE.SphereGeometry(0.25, 5, 4);
  const pMat = new THREE.MeshStandardMaterial({color: 0xdd7722, roughness: 0.9});
  for (const [px, pz] of [[-0.8, 0.2], [0, -0.1], [0.7, 0.3], [-0.3, 0.4]] as const) {
    const p = m(pGeo, pMat); p.position.set(px, 1.55, pz); g.add(p);
  }
  return {group: g};
}

function buildBarrel(_def: StageAssetDef): BuiltAsset {
  const g = new THREE.Group();
  const body = m(new THREE.CylinderGeometry(0.7, 0.65, 1.6, 10), WOOD);
  body.position.y = 0.8;
  g.add(body);
  // Two metal rings
  const ringGeo = new THREE.TorusGeometry(0.72, 0.06, 5, 14);
  const ringMat = new THREE.MeshStandardMaterial({color: 0x484030, roughness: 0.6, metalness: 0.4});
  for (const ry of [0.55, 1.05]) {
    const ring = m(ringGeo, ringMat); ring.rotation.x = Math.PI / 2; ring.position.y = ry; g.add(ring);
  }
  return {group: g};
}

function buildBarrelStack(def: StageAssetDef): BuiltAsset {
  const g = new THREE.Group();
  // Bottom two side by side
  for (const [bx, bz, by] of [[-0.75, 0, 0], [0.75, 0, 0], [0, 0.05, 1.5]] as const) {
    const {group: b} = buildBarrel(def);
    b.position.set(bx, by, bz);
    g.add(b);
  }
  return {group: g};
}

function buildCrate(_def: StageAssetDef): BuiltAsset {
  const g = new THREE.Group();
  const body = m(new THREE.BoxGeometry(1.4, 1.2, 1.1), WOOD);
  body.position.y = 0.6;
  g.add(body);
  // Cross-slat details (thin boxes)
  const slatMat = new THREE.MeshStandardMaterial({color: 0x5a3e1a, roughness: 1.0});
  for (const [sx, sy, sz, sw, sh, sd] of [
    [0, 0.6, 0, 1.42, 0.12, 0.08],
    [0, 0.6, 0, 0.08, 0.12, 1.12],
  ] as const) {
    const slat = m(new THREE.BoxGeometry(sw, sh, sd), slatMat);
    slat.position.set(sx, sy, sz); g.add(slat);
  }
  return {group: g};
}

function buildCrateStack(def: StageAssetDef): BuiltAsset {
  const g = new THREE.Group();
  const {group: bot} = buildCrate(def);
  const {group: top} = buildCrate(def);
  top.position.y = 1.3;
  top.rotation.y = 0.4;
  g.add(bot, top);
  return {group: g};
}

function buildBench(_def: StageAssetDef): BuiltAsset {
  const g = new THREE.Group();
  // Seat
  g.add(Object.assign(m(new THREE.BoxGeometry(3.5, 0.25, 0.9), WOOD), {position: new THREE.Vector3(0, 1.0, 0)}));
  // Legs
  const legG = new THREE.BoxGeometry(0.22, 1.0, 0.8);
  for (const lx of [-1.35, 1.35] as const) {
    const leg = m(legG, DWOOD); leg.position.set(lx, 0.5, 0); g.add(leg);
  }
  // Back rest
  g.add(Object.assign(m(new THREE.BoxGeometry(3.5, 0.8, 0.2), WOOD), {position: new THREE.Vector3(0, 1.5, -0.35)}));
  return {group: g};
}

function buildCampfire(_def: StageAssetDef): BuiltAsset {
  const g = new THREE.Group();
  // Stone ring
  const stoneGeo = new THREE.CylinderGeometry(1.0, 1.1, 0.35, 10);
  g.add(Object.assign(m(stoneGeo, STONE), {position: new THREE.Vector3(0, 0.18, 0)}));
  // Logs
  const logGeo = new THREE.CylinderGeometry(0.18, 0.22, 1.8, 6);
  const logMat = new THREE.MeshStandardMaterial({color: 0x3a1e0a, roughness: 1.0});
  for (let i = 0; i < 4; i++) {
    const log = m(logGeo, logMat);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (i * Math.PI) / 2 + 0.3;
    log.position.set(Math.cos(i * Math.PI / 2) * 0.3, 0.25, Math.sin(i * Math.PI / 2) * 0.3);
    g.add(log);
  }
  // Fire cone (emissive)
  const fireMat = new THREE.MeshStandardMaterial({
    color: 0xff6630, emissive: 0xff4400, emissiveIntensity: 2.0,
    roughness: 0, transparent: true, opacity: 0.85,
  });
  g.add(Object.assign(m(new THREE.ConeGeometry(0.55, 1.6, 6), fireMat), {position: new THREE.Vector3(0, 1.0, 0)}));
  // Inner flame (brighter, smaller)
  const innerFlame = m(new THREE.ConeGeometry(0.28, 1.1, 5),
    new THREE.MeshStandardMaterial({color: 0xffdd00, emissive: 0xffaa00, emissiveIntensity: 3.0, roughness: 0, transparent: true, opacity: 0.7}));
  innerFlame.position.y = 1.1;
  g.add(innerFlame);
  // Warm glow light
  const light = new THREE.PointLight(0xff8830, 14, 20);
  light.position.set(0, 2, 0);
  g.add(light);
  return {group: g, light};
}

function buildColumn(_def: StageAssetDef): BuiltAsset {
  const g = new THREE.Group();
  // Base
  g.add(Object.assign(m(new THREE.BoxGeometry(1.4, 0.5, 1.4), STONE), {position: new THREE.Vector3(0, 0.25, 0)}));
  // Shaft
  g.add(Object.assign(m(new THREE.CylinderGeometry(0.55, 0.6, 5.5, 8), STONE), {position: new THREE.Vector3(0, 3.25, 0)}));
  // Capital (top)
  g.add(Object.assign(m(new THREE.BoxGeometry(1.5, 0.55, 1.5), STONE), {position: new THREE.Vector3(0, 6.28, 0)}));
  return {group: g};
}

function buildArchway(_def: StageAssetDef): BuiltAsset {
  const g = new THREE.Group();
  // Left column
  const {group: lc} = buildColumn(_def); lc.position.set(-2.5, 0, 0); g.add(lc);
  // Right column
  const {group: rc} = buildColumn(_def); rc.position.set(2.5, 0, 0); g.add(rc);
  // Horizontal beam
  g.add(Object.assign(m(new THREE.BoxGeometry(5.0, 0.8, 1.0), STONE), {position: new THREE.Vector3(0, 6.6, 0)}));
  return {group: g};
}

function buildTable(_def: StageAssetDef): BuiltAsset {
  const g = new THREE.Group();
  g.add(Object.assign(m(new THREE.BoxGeometry(3.0, 0.22, 1.8), WOOD), {position: new THREE.Vector3(0, 1.0, 0)}));
  const lGeo = new THREE.CylinderGeometry(0.12, 0.14, 1.0, 5);
  for (const [lx, lz] of [[-1.3, -0.7], [1.3, -0.7], [-1.3, 0.7], [1.3, 0.7]] as const) {
    const leg = m(lGeo, DWOOD); leg.position.set(lx, 0.5, lz); g.add(leg);
  }
  return {group: g};
}

function buildCart(_def: StageAssetDef): BuiltAsset {
  const g = new THREE.Group();
  // Body
  g.add(Object.assign(m(new THREE.BoxGeometry(2.8, 1.0, 1.8), WOOD), {position: new THREE.Vector3(0, 1.5, 0)}));
  // Wheels
  const wheelGeo = new THREE.TorusGeometry(0.75, 0.18, 6, 14);
  const wheelMat = new THREE.MeshStandardMaterial({color: 0x3a2208, roughness: 1.0});
  for (const [wx, wz] of [[-1.4, 0.85], [-1.4, -0.85]] as const) {
    const wheel = m(wheelGeo, wheelMat); wheel.rotation.y = Math.PI / 2; wheel.position.set(wx, 0.75, wz); g.add(wheel);
  }
  // Handle / shaft
  const shaftGeo = new THREE.CylinderGeometry(0.1, 0.1, 3.2, 5);
  const shaft = m(shaftGeo, DWOOD);
  shaft.rotation.z = Math.PI / 2; shaft.position.set(2.0, 1.1, 0); g.add(shaft);
  // Tarp over goods
  const awning = m(new THREE.PlaneGeometry(3.0, 2.0), tarp(_def.color, 1));
  awning.rotation.set(-0.15, 0, 0); awning.position.set(0, 2.2, -0.2); g.add(awning);
  return {group: g};
}

function buildSign(_def: StageAssetDef): BuiltAsset {
  const g = new THREE.Group();
  // Post
  g.add(Object.assign(m(new THREE.CylinderGeometry(0.15, 0.18, 3.5, 6), DWOOD), {position: new THREE.Vector3(0, 1.75, 0)}));
  // Board
  const board = m(new THREE.BoxGeometry(2.0, 1.0, 0.18),
    new THREE.MeshStandardMaterial({color: 0x9a7a40, roughness: 0.8}));
  board.position.set(0, 3.2, 0); g.add(board);
  // Rope detail
  const rGeo = new THREE.TorusGeometry(0.06, 0.04, 4, 8);
  for (const rx of [-0.85, 0.85] as const) {
    const rope = m(rGeo, ROPE); rope.position.set(rx, 3.7, 0); g.add(rope);
  }
  return {group: g};
}

// ─── ENTRY POINT ─────────────────────────────────────────────────────────────

export function buildAsset(def: StageAssetDef, floorY: number): BuiltAsset {
  let result: BuiltAsset;
  switch (def.kind) {
    case 'stall':         result = buildStall(def);       break;
    case 'stall_min':     result = buildStallMin(def);    break;
    case 'barrel':        result = buildBarrel(def);      break;
    case 'barrel_stack':  result = buildBarrelStack(def); break;
    case 'crate':         result = buildCrate(def);       break;
    case 'crate_stack':   result = buildCrateStack(def);  break;
    case 'bench':         result = buildBench(def);       break;
    case 'campfire':      result = buildCampfire(def);    break;
    case 'column':        result = buildColumn(def);      break;
    case 'archway':       result = buildArchway(def);     break;
    case 'table':         result = buildTable(def);       break;
    case 'cart':          result = buildCart(def);        break;
    case 'sign':          result = buildSign(def);        break;
    default:              result = {group: new THREE.Group()}; break;
  }
  result.group.position.set(def.x, floorY, def.z);
  if (def.facing !== undefined) result.group.rotation.y = def.facing;
  if (def.scale  !== undefined) result.group.scale.setScalar(def.scale);
  return result;
}
