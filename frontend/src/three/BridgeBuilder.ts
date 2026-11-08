import * as THREE from 'three';
import { CABLES, COLORS, GEO, SEGMENTS } from '../config';
import { ComponentRegistry } from './ComponentRegistry';
import type { AssetBundle } from './AssetLoader';
import { toStaticProp } from './AssetLoader';
import {
  asphaltTextures, boxGirderGeometry, cloneRepeat, concreteTextures, saggedCablePoint, taperedColumnGeometry,
} from './BridgeGeometry';

/** 程序化分层建模：文档 6.1「结构分层，不整桥一 mesh」。
 *  无 Blender 资产时按 1.2 参数生成全部构件；AssetLoader 接入 GLB 后可逐层替换。 */

const UNIT = new THREE.BoxGeometry(1, 1, 1);
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
/** 每根拉索拆成 6 段直圆柱拟合悬链线；段间微重叠消除折点缝隙 */
const CABLE_SEGMENTS = 6;
const CABLE_OVERLAP = 0.4;

export interface SkeletonPart {
  mesh: THREE.LineSegments;
  total: number;
  startMs: number;
  endMs: number;
}

export interface BridgeModel {
  root: THREE.Group;
  registry: ComponentRegistry;
  pickables: THREE.Object3D[];
  skeleton: { group: THREE.Group; parts: SkeletonPart[]; scanBand: THREE.Mesh; material: THREE.LineBasicMaterial };
  solidMaterials: THREE.Material[];
  decorMaterials: { material: THREE.LineBasicMaterial; target: number }[];
  centerLineMat: THREE.MeshBasicMaterial;
  segments: {
    shell: THREE.InstancedMesh; deck: THREE.InstancedMesh; glow: THREE.InstancedMesh; laneLines: THREE.InstancedMesh;
    shellMat: THREE.MeshStandardMaterial; deckMat: THREE.MeshStandardMaterial;
    glowMat: THREE.MeshBasicMaterial; laneMat: THREE.MeshBasicMaterial;
    baseX: number[];
  };
  inner: {
    group: THREE.Group;
    slabs: THREE.InstancedMesh; webs: THREE.InstancedMesh; diaphragms: THREE.InstancedMesh;
    stiffeners: THREE.InstancedMesh; tendons: THREE.InstancedMesh;
    materials: THREE.Material[];
  };
  cables: {
    mesh: THREE.InstancedMesh; mat: THREE.MeshStandardMaterial;
    flow: THREE.Points; flowMat: THREE.PointsMaterial;
    anchors: [THREE.Vector3, THREE.Vector3][];
  };
  bearings: THREE.InstancedMesh;
  towers: { group: THREE.Group; legs: THREE.InstancedMesh; beams: THREE.InstancedMesh; edges: THREE.LineSegments };
  substructure: { group: THREE.Group; meshes: THREE.InstancedMesh[] };
  rails: { group: THREE.Group; posts: THREE.InstancedMesh };
  closureFlash: THREE.Mesh;
  clippableMaterials: THREE.Material[];
  updateSegmentMatrices: (offsets: number[], visibility: number[]) => void;
}

function setBox(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number,
                sx: number, sy: number, sz: number, visible = 1): void {
  if (visible <= 0.002) { mesh.setMatrixAt(i, ZERO); return; }
  _m.compose(_p.set(x, y, z), _q.identity(), _s.set(sx, sy * visible, sz));
  mesh.setMatrixAt(i, _m);
}

function setRod(mesh: THREE.InstancedMesh, i: number, a: THREE.Vector3, b: THREE.Vector3, visible = 1): void {
  if (visible <= 0.002) { mesh.setMatrixAt(i, ZERO); return; }
  const dir = b.clone().sub(a);
  const len = dir.length();
  _q.setFromUnitVectors(Y_AXIS, dir.clone().normalize());
  _m.compose(_p.copy(a).addScaledVector(dir, 0.5), _q, _s.set(1, len * visible, 1));
  mesh.setMatrixAt(i, _m);
}

function standard(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color, metalness: 0.25, roughness: 0.7, transparent: true, opacity: 0, ...opts,
  });
}

function makeInstanced(mat: THREE.Material, count: number, layer: string,
                        geo: THREE.BufferGeometry = UNIT): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.userData.layer = layer;
  return mesh;
}

/** 把若干 box 的边线收集成一条 LineSegments（setDrawRange 逐段生长） */
function edgesFromBoxes(boxes: [number, number, number, number, number, number][]): Float32Array {
  const out: number[] = [];
  boxes.forEach(([x, y, z, sx, sy, sz]) => {
    const e = new THREE.EdgesGeometry(new THREE.BoxGeometry(sx, sy, sz));
    const arr = e.getAttribute('position').array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) out.push(arr[i] + x, arr[i + 1] + y, arr[i + 2] + z);
    e.dispose();
  });
  return new Float32Array(out);
}

function lineSegments(data: Float32Array, color: number, opacity: number,
                      shared?: THREE.LineBasicMaterial): THREE.LineSegments {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(data, 3));
  geo.setDrawRange(0, 0);
  const mat = shared ?? new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const ls = new THREE.LineSegments(geo, mat);
  ls.renderOrder = 3;
  ls.frustumCulled = false;
  return ls;
}

export function buildBridge(assets?: AssetBundle): BridgeModel {
  const root = new THREE.Group();
  const registry = new ComponentRegistry();
  const pickables: THREE.Object3D[] = [];
  const solidMaterials: THREE.Material[] = [];
  const clippableMaterials: THREE.Material[] = [];
  const decorMaterials: { material: THREE.LineBasicMaterial; target: number }[] = [];

  const pushSolid = <T extends THREE.Material>(m: T): T => { solidMaterials.push(m); return m; };
  const addPick = (o: THREE.Object3D): void => { pickables.push(o); };

  // ================= 幕一：骨架（6 组，按施工顺序） =================
  const skeleton = new THREE.Group();
  root.add(skeleton);
  const skelMat = new THREE.LineBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.9, depthWrite: false });

  const pileBoxes: [number, number, number, number, number, number][] = [];
  const footingBoxes: [number, number, number, number, number, number][] = [];
  const pierBoxes: [number, number, number, number, number, number][] = [];
  const towerBoxes: [number, number, number, number, number, number][] = [];
  const girderBoxes: [number, number, number, number, number, number][] = [];

  const subWidth = GEO.deckW + 12;   // 承台 / 塔横梁：桥面两侧各外挑 6m
  const pierWidth = GEO.deckW;
  [-GEO.towerX, GEO.towerX].forEach(tx => {
    [-14, 14].forEach(dx => [-GEO.towerLegZ, GEO.towerLegZ].forEach(dz => {
      pileBoxes.push([tx + dx, -12, dz, 4, 24, 4]);
    }));
    footingBoxes.push([tx, 3, 0, 40, 6, subWidth]);
    pierBoxes.push([tx, 30, 0, 20, 48, pierWidth]);
    [-GEO.towerLegZ, GEO.towerLegZ].forEach(dz => towerBoxes.push([tx, 108, dz, 8, GEO.towerH, 8]));
    [50, 200].forEach(y => towerBoxes.push([tx, y, 0, 8, 6, subWidth]));
  });
  SEGMENTS.forEach(s => girderBoxes.push([s.chainage, 56, 0, GEO.segmentLen, GEO.girderH, GEO.deckW]));

  // 拉索骨架：每根 8 段
  const cableLines: number[] = [];
  CABLES.forEach(c => {
    const a = new THREE.Vector3(c.anchorTop.x, c.anchorTop.y, c.anchorTop.z);
    const b = new THREE.Vector3(c.anchorBottom.x, c.anchorBottom.y, c.anchorBottom.z);
    for (let k = 0; k < 8; k++) {
      const p1 = saggedCablePoint(a, b, k / 8);
      const p2 = saggedCablePoint(a, b, (k + 1) / 8);
      cableLines.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    }
  });

  const partDefs: { data: Float32Array; start: number; end: number }[] = [
    { data: edgesFromBoxes(pileBoxes), start: 0, end: 600 },
    { data: edgesFromBoxes(footingBoxes), start: 600, end: 1200 },
    { data: edgesFromBoxes(pierBoxes), start: 1200, end: 1800 },
    { data: edgesFromBoxes(towerBoxes), start: 1800, end: 3200 },
    { data: edgesFromBoxes(girderBoxes), start: 3200, end: 4000 },
    { data: new Float32Array(cableLines), start: 4000, end: 4500 },
  ];
  const skeletonParts: SkeletonPart[] = partDefs.map(({ data, start, end }) => {
    const ls = lineSegments(data, COLORS.cyan, 0.9, skelMat);
    skeleton.add(ls);
    return { mesh: ls, total: data.length / 3, startMs: start, endMs: end };
  });

  const scanMat = new THREE.MeshBasicMaterial({
    color: COLORS.cyan, transparent: true, opacity: 0.45,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const scanBand = new THREE.Mesh(new THREE.PlaneGeometry(1000, 5), scanMat);
  scanBand.rotation.x = -Math.PI / 2;
  scanBand.position.set(0, 0, 0);
  skeleton.add(scanBand);

  // ================= 实体：下部结构 =================
  const substructure = new THREE.Group();
  root.add(substructure);
  // 混凝土 PBR：细骨料 + 模板分节缝 + 底部 AO，桥墩竖向平铺 3 次
  const concrete = concreteTextures();
  const subPBR = {
    map: cloneRepeat(concrete.map, 1, 3),
    normalMap: cloneRepeat(concrete.normalMap, 1, 3),
    roughnessMap: cloneRepeat(concrete.roughnessMap, 1, 3),
    roughness: 0.92, metalness: 0.02,
  };
  const pileMat = pushSolid(standard(COLORS.pile, subPBR));
  const footingMat = pushSolid(standard(COLORS.pier, { color: 0x77828f, ...subPBR }));
  const pierMat = pushSolid(standard(COLORS.pier, subPBR));
  const piles = makeInstanced(pileMat, 8, 'PILE');
  const footings = makeInstanced(footingMat, 2, 'FOOTING');
  const piers = makeInstanced(pierMat, 4, 'PIER');
  let pi = 0;
  [-GEO.towerX, GEO.towerX].forEach((tx, ti) => {
    [-14, 14].forEach(dx => [-GEO.towerLegZ, GEO.towerLegZ].forEach(dz => setBox(piles, pi++, tx + dx, -12, dz, 4, 24, 4)));
    setBox(footings, ti, tx, 3, 0, 40, 6, subWidth);
    setBox(piers, ti, tx, 30, 0, 20, 48, pierWidth);
  });
  setBox(piers, 2, -GEO.halfLength, 26, 0, 16, 52, pierWidth);
  setBox(piers, 3, GEO.halfLength, 26, 0, 16, 52, pierWidth);
  [piles, footings, piers].forEach(m => { m.instanceMatrix.needsUpdate = true; substructure.add(m); });
  piles.userData.pickCode = 'FOOTING-L';
  footings.userData.pickCodes = ['FOOTING-L', 'FOOTING-R'];
  piers.userData.pickCodes = ['PIER-L', 'PIER-R', 'PIER-L', 'PIER-R'];
  [piles, footings, piers].forEach(m => { addPick(m); });
  registry.setPickCodes(footings, footings.userData.pickCodes as string[]);
  registry.setPickCodes(piers, piers.userData.pickCodes as string[]);
  (['FOOTING-L', 'FOOTING-R'] as const).forEach((code, i) => registry.registerInstance(code, 'FOOTING', footings, i));
  registry.registerInstance('PIER-L', 'PIER', piers, 0);
  registry.registerInstance('PIER-L', 'PIER', piers, 2);
  registry.registerInstance('PIER-R', 'PIER', piers, 1);
  registry.registerInstance('PIER-R', 'PIER', piers, 3);

  // ================= 实体：桥塔 =================
  const towerGroup = new THREE.Group();
  root.add(towerGroup);
  // 塔柱按 216m 高度贴 18 次模板纹理；四棱台把等截面方柱改成下宽上窄的收分塔
  const towerPBR = {
    map: cloneRepeat(concrete.map, 1, 18),
    normalMap: cloneRepeat(concrete.normalMap, 1, 18),
    roughnessMap: cloneRepeat(concrete.roughnessMap, 1, 18),
    roughness: 0.9, metalness: 0.03,
  };
  const towerMat = pushSolid(standard(COLORS.concrete, towerPBR));
  const towerBeamMat = pushSolid(standard(COLORS.concrete, {
    roughness: 0.88, metalness: 0.04,
    map: cloneRepeat(concrete.map, 1, 2), normalMap: cloneRepeat(concrete.normalMap, 1, 2),
  }));
  const legs = makeInstanced(towerMat, 4, 'TOWER', taperedColumnGeometry());
  const beams = makeInstanced(towerBeamMat, 4, 'TOWER');
  let li = 0, bi = 0;
  [-GEO.towerX, GEO.towerX].forEach(tx => {
    [-GEO.towerLegZ, GEO.towerLegZ].forEach(dz => setBox(legs, li++, tx, 108, dz, 8, GEO.towerH, 8));
    [50, 200].forEach(y => setBox(beams, bi++, tx, y, 0, 8, 6, subWidth));
  });
  legs.instanceMatrix.needsUpdate = true;
  beams.instanceMatrix.needsUpdate = true;
  legs.userData.pickCodes = ['TOWER-L', 'TOWER-L', 'TOWER-R', 'TOWER-R'];
  beams.userData.pickCodes = ['TOWER-L', 'TOWER-L', 'TOWER-R', 'TOWER-R'];
  towerGroup.add(legs, beams);
  [legs, beams].forEach(m => { addPick(m); registry.setPickCodes(m, m.userData.pickCodes as string[]); });
  ['TOWER-L', 'TOWER-R'].forEach((code, ti) => {
    [0, 1].forEach(k => {
      registry.registerInstance(code, 'TOWER', legs, ti * 2 + k);
      registry.registerInstance(code, 'TOWER', beams, ti * 2 + k);
    });
  });

  // 塔身分节线随收分截面同步收窄，避免装饰线悬浮在塔柱之外
  const towerLineData: number[] = [];
  for (let y = 12; y < GEO.towerH; y += 12) {
    const r = 0.72 + (0.50 - 0.72) * (y / GEO.towerH);
    const half = (8 * r) / Math.SQRT2 + 0.12;
    [-GEO.towerX, GEO.towerX].forEach(tx => {
      [-GEO.towerLegZ, GEO.towerLegZ].forEach(dz => {
        towerLineData.push(tx - half, y, dz - half, tx + half, y, dz - half);
        towerLineData.push(tx - half, y, dz + half, tx + half, y, dz + half);
      });
    });
  }
  const towerLines = lineSegments(new Float32Array(towerLineData), COLORS.cyan, 0);
  towerLines.geometry.setDrawRange(0, towerLines.geometry.getAttribute('position').count);
  towerGroup.add(towerLines);
  const towerEdges = lineSegments(edgesFromBoxes(towerBoxes), COLORS.cyan, 0);
  towerEdges.geometry.setDrawRange(0, towerEdges.geometry.getAttribute('position').count);
  towerGroup.add(towerEdges);
  decorMaterials.push(
    { material: towerLines.material as THREE.LineBasicMaterial, target: 0.18 },
    { material: towerEdges.material as THREE.LineBasicMaterial, target: 0.35 },
  );
  const towers = { group: towerGroup, legs, beams, edges: towerEdges };

  // ================= 实体：主梁 / 桥面 / 发光带 / 车道线 =================
  // 钢箱梁：哑光金属（低金属度 + 高粗糙度），白天不再像光滑塑料块；
  // 节段间靠 instanceColor 施工色差拉开明暗，呈现真实分节段悬臂梁
  const shellMat = pushSolid(standard(COLORS.girder, { metalness: 0.2, roughness: 0.85, side: THREE.DoubleSide }));
  // 桥面沥青：骨料颗粒 + 伸缩缝 + 车辙带（PBR 三张贴图），不再是一整块纯色平板
  const deckPBR = asphaltTextures();
  const deckMat = pushSolid(standard(COLORS.asphalt, {
    map: deckPBR.map, normalMap: deckPBR.normalMap, roughnessMap: deckPBR.roughnessMap,
    metalness: 0.04, roughness: 0.96,
  }));
  const glowMat = new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0, depthWrite: false });
  const laneMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });

  const laneCount = GEO.laneOffsets.length;                        // 12 条车道（上下行各 6）
  const webCount = Math.round(GEO.deckW / 6) + 1;                  // 每 6m 一道腹板
  const stiffenerCols = Math.max(4, Math.round(GEO.deckW / 6.5));  // 加劲肋列数
  const tendonCount = Math.max(4, Math.round(GEO.deckW / 6));      // 预应力束根数
  const shell = makeInstanced(shellMat, GEO.segmentCount, 'GIRDER', boxGirderGeometry());
  // 节段施工色差：相邻节段轻微明暗起伏，打破「一片纯色」的连续塑料感
  const segTint = new THREE.Color();
  for (let i = 0; i < GEO.segmentCount; i++) {
    shell.setColorAt(i, segTint.setScalar(0.9 + ((i * 37) % 11) / 55));
  }
  if (shell.instanceColor) shell.instanceColor.needsUpdate = true;
  const deck = makeInstanced(deckMat, GEO.segmentCount, 'GIRDER');
  const glow = makeInstanced(glowMat, GEO.segmentCount * 2, 'GIRDER');
  const laneLines = makeInstanced(laneMat, GEO.segmentCount * laneCount, 'PAVEMENT');
  shell.userData.pickCodes = SEGMENTS.map(s => s.segmentCode);
  deck.userData.pickCodes = SEGMENTS.map(s => s.segmentCode);
  [shell, deck, glow, laneLines].forEach(m => { addPick(m); root.add(m); });
  registry.setPickCodes(shell, shell.userData.pickCodes as string[]);
  registry.setPickCodes(deck, deck.userData.pickCodes as string[]);
  SEGMENTS.forEach(s => registry.registerVirtual(s.segmentCode, 'GIRDER'));

  // 中央黄实线（2 条）
  const centerLineMat = new THREE.MeshBasicMaterial({ color: COLORS.supportYellow, transparent: true, opacity: 0, depthWrite: false });
  const centerLines = makeInstanced(centerLineMat, 2, 'PAVEMENT');
  // 中央分隔带两侧的边缘线，避开中央护栏实体
  setBox(centerLines, 0, 0, 58.22, -1.15, GEO.length, 0.06, 0.18);
  setBox(centerLines, 1, 0, 58.22, 1.15, GEO.length, 0.06, 0.18);
  centerLines.instanceMatrix.needsUpdate = true;
  centerLines.userData.pickCode = 'PAVEMENT';
  root.add(centerLines);

  // ================= 实体：箱梁内部（剖切后可见） =================
  const innerGroup = new THREE.Group();
  root.add(innerGroup);
  // 剖切后显露的箱室是混凝土而非白板：统一贴模板纹理并压低明度
  const innerPBR = {
    map: cloneRepeat(concrete.map, 2, 2),
    normalMap: cloneRepeat(concrete.normalMap, 2, 2),
    roughnessMap: cloneRepeat(concrete.roughnessMap, 2, 2),
    roughness: 0.9, metalness: 0.04,
  };
  const slabMat = pushSolid(standard(0x98a4b2, { ...innerPBR, side: THREE.DoubleSide }));
  const webMat = pushSolid(standard(0x8895a5, { ...innerPBR, side: THREE.DoubleSide }));
  const diaphragmMat = pushSolid(standard(0x7d8a99, { ...innerPBR, side: THREE.DoubleSide }));
  const stiffenerMat = pushSolid(standard(0x71808f, innerPBR));
  const tendonMat = pushSolid(standard(COLORS.cyan, { emissive: COLORS.cyan, emissiveIntensity: 1.1, metalness: 0.6 }));
  const slabs = makeInstanced(slabMat, GEO.segmentCount * 2, 'INNER');
  const webs = makeInstanced(webMat, GEO.segmentCount * webCount, 'INNER');
  const diaphragms = makeInstanced(diaphragmMat, GEO.segmentCount, 'INNER');
  const stiffeners = makeInstanced(stiffenerMat, GEO.segmentCount * stiffenerCols * 2, 'INNER');
  const tendons = makeInstanced(tendonMat, GEO.segmentCount * tendonCount, 'INNER');
  [slabs, webs, diaphragms, stiffeners, tendons].forEach(m => {
    m.userData.pickCode = 'INNER';
    addPick(m);
    innerGroup.add(m);
  });
  registry.registerObject('INNER', 'INNER', innerGroup, 'INNER');

  // ================= 实体：72 根拉索（实例化，逐根可拾取/显隐） =================
  // PE 护套索体：真实 HDPE 护套是哑光近白色，不是金属管。低金属度 + 高粗糙度，
  // 白天呈哑光护套而非「塑料/金属」高光，夜间再由 emissive 亮化成青色轮廓
  const cableMat = pushSolid(standard(0xe3eaf0, {
    emissive: COLORS.cyan, emissiveIntensity: 0, metalness: 0.04, roughness: 0.82,
  }));
  const cableGeo = new THREE.CylinderGeometry(0.21, 0.21, 1, 10, 1);
  const cableMesh = new THREE.InstancedMesh(cableGeo, cableMat, CABLES.length * CABLE_SEGMENTS);
  cableMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cableMesh.frustumCulled = false;
  // 拾取码按段展开：一段命中仍解析为整根索的 cableCode
  cableMesh.userData.pickCodes = CABLES.flatMap(c => Array<string>(CABLE_SEGMENTS).fill(c.cableCode));
  const anchors: [THREE.Vector3, THREE.Vector3][] = CABLES.map((c, i) => {
    const a = new THREE.Vector3(c.anchorTop.x, c.anchorTop.y, c.anchorTop.z);
    const b = new THREE.Vector3(c.anchorBottom.x, c.anchorBottom.y, c.anchorBottom.z);
    for (let k = 0; k < CABLE_SEGMENTS; k++) {
      const p = saggedCablePoint(a, b, k / CABLE_SEGMENTS);
      const q = saggedCablePoint(a, b, (k + 1) / CABLE_SEGMENTS);
      const dir = q.clone().sub(p).normalize();
      setRod(cableMesh, i * CABLE_SEGMENTS + k,
        p.addScaledVector(dir, -CABLE_OVERLAP), q.addScaledVector(dir, CABLE_OVERLAP));
      registry.registerInstance(c.cableCode, 'CABLE', cableMesh, i * CABLE_SEGMENTS + k);
    }
    return [a, b];
  });
  cableMesh.instanceMatrix.needsUpdate = true;
  addPick(cableMesh);
  registry.setPickCodes(cableMesh, cableMesh.userData.pickCodes as string[]);

  // 索上流动光点
  const flowPositions = new Float32Array(CABLES.length * 3);
  const flowGeo = new THREE.BufferGeometry();
  flowGeo.setAttribute('position', new THREE.BufferAttribute(flowPositions, 3));
  const flowMat = new THREE.PointsMaterial({
    color: 0xffffff, size: 3.4, sizeAttenuation: false, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const flow = new THREE.Points(flowGeo, flowMat);
  flow.frustumCulled = false;
  root.add(cableMesh, flow);

  // ================= 实体：支座（黄色方块） =================
  const bearingMat = pushSolid(standard(COLORS.supportYellow, { metalness: 0.6, roughness: 0.4, emissive: 0x3a2c00 }));
  const bearings = makeInstanced(bearingMat, 8, 'BEARING', new THREE.CylinderGeometry(0.5, 0.5, 1, 14));
  let ib = 0;
  [-GEO.towerX, GEO.towerX, -GEO.halfLength, GEO.halfLength].forEach(x => {
    [-GEO.halfDeck * 2 / 3, GEO.halfDeck * 2 / 3].forEach(z => setBox(bearings, ib++, x, 53.4, z, 2.4, 1.2, 1.6));
  });
  bearings.instanceMatrix.needsUpdate = true;
  bearings.userData.pickCode = 'BEARINGS';
  root.add(bearings);
  addPick(bearings);
  registry.registerObject('BEARINGS', 'BEARING', bearings, 'BEARINGS');

  // ================= 实体：护栏（程序化兜底 + GLB 接管） =================
  const railGroup = new THREE.Group();       // 注册到 RAILING 层，受「只看内部」控制
  root.add(railGroup);
  const railFallback = new THREE.Group();    // 程序化占位
  const railGltf = new THREE.Group();        // GLB 接管后放置
  railGroup.add(railFallback, railGltf);
  const railMat = pushSolid(standard(COLORS.railing, { metalness: 0.6 }));
  const posts = makeInstanced(railMat, 2 * 421, 'RAILING');
  let ip = 0;
  for (let x = -GEO.halfLength; x <= GEO.halfLength; x += 2) {
    [-GEO.halfDeck, GEO.halfDeck].forEach(z => setBox(posts, ip++, x, 58.7, z, 0.2, 1.4, 0.2));
  }
  posts.instanceMatrix.needsUpdate = true;
  posts.userData.pickCode = 'RAILING';
  railFallback.add(posts);
  [-GEO.halfDeck, GEO.halfDeck].forEach(z => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(GEO.length, 0.14, 0.14), railMat);
    bar.position.set(0, 59.3, z);
    bar.userData.pickCode = 'RAILING';
    railFallback.add(bar);
    addPick(bar);
  });
  addPick(posts);
  registry.registerObject('RAILING', 'RAILING', railGroup, 'RAILING');

  // 资产绑定：GLB 护栏（G01）存在时按 21m 一段阵列到两侧，隐藏程序化兜底
  if (assets?.railing) {
    const used = addRailingsGLB(railGltf, assets.railing);
    if (used) railFallback.visible = false;
  }
  // 资产绑定：桥头限流道闸（G03）存在时显示
  if (assets?.gate) addGateGLB(railGltf, assets.gate);

  // ================= 跨中合龙光带 =================
  // 早期用 2×220×60 的竖直白盒做「白闪」，加载动画期间会显示成一块巨大白色竖板。
  // 改为贴桥面的横向薄光带：横跨桥宽、沿桥轴扩散淡出，任何视角都不再出现白色竖板。
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xbfefff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const closureFlash = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.25, GEO.deckW * 1.08), flashMat);
  closureFlash.position.set(0, GEO.deckY + 0.35, 0);
  closureFlash.renderOrder = 4;
  root.add(closureFlash);

  // ================= 每帧节段矩阵（推入动画 / 显隐统一出口） =================
  const baseX = SEGMENTS.map(s => s.chainage);
  const updateSegmentMatrices = (offsets: number[], visibility: number[]): void => {
    for (let i = 0; i < GEO.segmentCount; i++) {
      const x = baseX[i] + (offsets[i] ?? 0);
      const v = registry.isVisible(SEGMENTS[i].segmentCode) ? (visibility[i] ?? 0) : 0;
      setBox(shell, i, x, 56, 0, GEO.segmentLen, GEO.girderH, GEO.deckW, v);
      setBox(deck, i, x, 58.1, 0, GEO.segmentLen, 0.2, GEO.deckW - 0.4, v);
      setBox(glow, i * 2, x, 56, -(GEO.halfDeck + 0.05), GEO.segmentLen, 0.3, 0.3, v);
      setBox(glow, i * 2 + 1, x, 56, GEO.halfDeck + 0.05, GEO.segmentLen, 0.3, 0.3, v);
      for (let k = 0; k < laneCount; k++) {
        const z = GEO.laneOffsets[k] + GEO.laneWidth / 2;
        setBox(laneLines, i * laneCount + k, x, 58.22, z, 8, 0.05, 0.16, v);
      }
      // 内部：多室箱梁（顶板/底板/腹板/横隔板/加劲肋/预应力束，均按桥宽推导）
      setBox(slabs, i * 2, x, 57.7, 0, GEO.segmentLen, 0.3, GEO.deckW, v);
      setBox(slabs, i * 2 + 1, x, 54.3, 0, GEO.segmentLen, 0.3, GEO.deckW, v);
      for (let k = 0; k < webCount; k++) {
        setBox(webs, i * webCount + k, x, 56, -GEO.halfDeck + k * 6, GEO.segmentLen, 3.4, 0.25, v);
      }
      setBox(diaphragms, i, x, 56, 0, 0.3, 3.4, GEO.deckW - 0.5, v);
      for (let k = 0; k < stiffenerCols * 2; k++) {
        setBox(stiffeners, i * stiffenerCols * 2 + k, x, 54.7 + (k % 2) * 2.6,
          -GEO.halfDeck + 2 + Math.floor(k / 2) * 6.5, GEO.segmentLen - 1, 0.2, 0.2, v);
      }
      for (let k = 0; k < tendonCount; k++) {
        setBox(tendons, i * tendonCount + k, x, 54.6, -GEO.halfDeck + 3 + k * 6,
          GEO.segmentLen, 0.12, 0.12, v);
      }
    }
    [shell, deck, glow, laneLines, slabs, webs, diaphragms, stiffeners, tendons]
      .forEach(m => { m.instanceMatrix.needsUpdate = true; });
  };

  function addRailingsGLB(group: THREE.Group, obj: THREE.Object3D): boolean {
    const prop = toStaticProp(obj, 21);
    if (!prop) return false;
    for (const z of [-GEO.halfDeck, GEO.halfDeck]) {
      for (let x = -GEO.halfLength; x <= GEO.halfLength; x += 21) {
        const c = prop.clone(true);
        c.position.set(x, 58.2, z);
        group.add(c);
        c.traverse(o => {
          if ((o as THREE.Mesh).isMesh) { o.userData.pickCode = 'RAILING'; addPick(o); }
        });
      }
    }
    return true;
  }

  function addGateGLB(group: THREE.Group, obj: THREE.Object3D): void {
    const prop = toStaticProp(obj, 8);
    if (!prop) return;
    for (const x of [-GEO.halfLength - 12, GEO.halfLength + 12]) {
      const c = prop.clone(true);
      c.position.set(x, 0, 0);
      group.add(c);
      c.traverse(o => {
        if ((o as THREE.Mesh).isMesh) { o.userData.pickCode = 'RAILING'; addPick(o); }
      });
    }
  }

  // 剖切语义是「掀开桥面看箱梁内部」：只裁桥面层，塔/墩/索/支座/内部结构保持完整，
  // 否则稳态默认剖切会把半座桥连同上部结构一起裁掉。
  clippableMaterials.push(shellMat, deckMat, glowMat, laneMat, centerLineMat, railMat);

  return {
    root, registry, pickables,
    skeleton: { group: skeleton, parts: skeletonParts, scanBand, material: skelMat },
    solidMaterials, decorMaterials, centerLineMat,
    segments: { shell, deck, glow, laneLines, shellMat, deckMat, glowMat, laneMat, baseX },
    inner: {
      group: innerGroup, slabs, webs, diaphragms, stiffeners, tendons,
      materials: [slabMat, webMat, diaphragmMat, stiffenerMat, tendonMat],
    },
    cables: { mesh: cableMesh, mat: cableMat, flow, flowMat, anchors },
    bearings, towers, substructure: { group: substructure, meshes: [piles, footings, piers] },
    rails: { group: railGroup, posts }, closureFlash, clippableMaterials,
    updateSegmentMatrices,
  };
}
