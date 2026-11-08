import * as THREE from 'three';
import { GEO } from '../config';
import { buildHumanoid, buildSeatedPerson, PedestrianSystem } from './Pedestrians';

const rand = (a: number, b: number) => a + Math.random() * (b - a);

interface Building {
  x: number; z: number;
  w: number; d: number; h: number;
  /** 楼栋地基标高：桥头两岸与桥面齐平，远景岸带略低一档 */
  baseY: number;
  /** 窗光所在立面的轴向与朝向：桥头沿 X 面，远端沿 Z 面 */
  axis: 'x' | 'z';
  face: number;
}

const NIGHT = {
  building: new THREE.Color(0x334760),
  roof: new THREE.Color(0x3c516b),
  road: new THREE.Color(0x1b232e),
  land: new THREE.Color(0x1d2b39),
  bank: new THREE.Color(0x1b2a3a),
  ground: new THREE.Color(0x1d2a38),
  street: new THREE.Color(0x121c27),
  curb: new THREE.Color(0x33475c),
  pier: new THREE.Color(0x32435a),
  tree: new THREE.Color(0x16261b),
  trunk: new THREE.Color(0x161009),
  boat: new THREE.Color(0x14181f),
  cabin: new THREE.Color(0x20262e),
};
const DAY = {
  building: new THREE.Color(0x6f8091),
  roof: new THREE.Color(0x607080),
  road: new THREE.Color(0x3b4149),
  // 陆地取中性混凝土灰、江水偏蓝：既不是黄绿平板，也不会和水糊成同一片
  land: new THREE.Color(0x6d706f),
  bank: new THREE.Color(0x52585b),
  ground: new THREE.Color(0x717574),
  street: new THREE.Color(0x3c4146),
  curb: new THREE.Color(0x929a9c),
  pier: new THREE.Color(0x88939f),
  tree: new THREE.Color(0x4e7c39),
  trunk: new THREE.Color(0x5b4733),
  boat: new THREE.Color(0x6b3b2e),
  cabin: new THREE.Color(0xc9d2da),
};

/** 程序化建筑立面：混凝土底 + 竖向污渍 + 窗格网格 + 楼层压顶线 + 窗框中梃。
 *  白天楼群不再是纯色「白积木」，每个侧面都有真实的窗墙节奏；贴图与材质色相乘，
 *  由 instanceColor 制造楼间色差，昼夜共用。 */
function facadeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#aeb6bf';
  ctx.fillRect(0, 0, 256, 512);
  // 竖向水渍 / 雨痕，打破大面积纯色
  for (let i = 0; i < 32; i++) {
    const g = 72 + Math.random() * 42;
    ctx.fillStyle = `rgba(${g},${g + 6},${g + 12},${0.05 + Math.random() * 0.12})`;
    ctx.fillRect(Math.random() * 256, 0, 4 + Math.random() * 26, 512);
  }
  const cols = 6;
  const rows = 14;
  const cw = 256 / cols;
  const rh = 512 / rows;
  for (let r = 0; r < rows; r++) {
    // 楼层压顶线
    ctx.fillStyle = 'rgba(40,46,54,0.55)';
    ctx.fillRect(0, r * rh, 256, 2.5);
    for (let ci = 0; ci < cols; ci++) {
      const pad = cw * 0.22;
      const x = ci * cw + pad;
      const y = r * rh + rh * 0.24;
      const w = cw - pad * 2;
      const h = rh * 0.5;
      // 窗玻璃：中灰，随机明度模拟反射 / 开灯
      const lit = Math.random();
      const b = 58 + lit * 44;
      ctx.fillStyle = `rgb(${b},${b + 8},${b + 18})`;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(30,36,44,0.85)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** 岸上地面标高与桥面齐平：楼栋地基不再落在水面 y=-2，而是与桥头引道同一水平线 */
const GROUND_Y = GEO.deckY;
/** 首排建筑距桥头的净距：台地前缘在桥头外 260m，楼群再往内陆退 140m 形成滨江缓冲带 */
const CITY_SETBACK = 400;
/** 岸线（护坡下端）与陆地末端，均按距跨中的距离给出 */
const SHORE_X = GEO.halfLength + 140;
const LAND_END = GEO.halfLength + 820;
/** 三级退台：从水面逐级升到 GROUND_Y，形成有厚度的江堤而不是一堵直墙 */
const TERRACES = [
  { x0: SHORE_X + 80, halfZ: 470, top: 18 },
  { x0: SHORE_X + 100, halfZ: 440, top: 36 },
  { x0: SHORE_X + 120, halfZ: 400, top: GROUND_Y },
];

/** 桥头两岸城市与接岸结构：引道、桥台、引桥墩、岸地、分层楼体与夜间窗光。
 *  替换原先只有一排纯 Box 的远景剪影，让桥在 ±X 两端真正「接上岸、看得见城市」。 */
export class Cityscape {
  readonly root = new THREE.Group();
  /** 显式阴影白名单：只让实体楼体 / 引桥墩投影，窗光点精灵与路缘发光线不参与 */
  readonly shadowCasters: THREE.Object3D[] = [];
  readonly shadowReceivers: THREE.Object3D[] = [];

  private buildingMat: THREE.MeshStandardMaterial;
  private roofMat: THREE.MeshStandardMaterial;
  private roadMat: THREE.MeshStandardMaterial;
  /** 三级退台各用一档明度，拉开江堤层次 */
  private landMats: THREE.MeshStandardMaterial[] = [];
  private bankMat: THREE.MeshStandardMaterial;
  private groundMat: THREE.MeshStandardMaterial;
  private streetMat: THREE.MeshStandardMaterial;
  private curbMat: THREE.MeshStandardMaterial;
  private pierMat: THREE.MeshStandardMaterial;
  private windowMat: THREE.PointsMaterial;
  private trunkMat: THREE.MeshStandardMaterial;
  private foliageMat: THREE.MeshStandardMaterial;
  private hullMat: THREE.MeshStandardMaterial;
  private cabinMat: THREE.MeshStandardMaterial;
  private boatHull?: THREE.InstancedMesh;
  private boatCabin?: THREE.InstancedMesh;
  private boatData: Array<{ x: number; z: number; dir: number; speed: number; len: number }> = [];
  // 行人系统：城市两岸 + 桥面人行道
  private cityPeds: PedestrianSystem[] = [];
  private deckPeds: PedestrianSystem[] = [];
  // 划船小船：船体 / 坐人（皮肤+衣物）/ 双桨
  private rowHull?: THREE.InstancedMesh;
  private rowRowerSkin?: THREE.InstancedMesh;
  private rowRowerCloth?: THREE.InstancedMesh;
  private rowOarA?: THREE.InstancedMesh;
  private rowOarB?: THREE.InstancedMesh;
  private rowData: Array<{ x: number; z: number; dir: number; speed: number; len: number; rowPhase: number }> = [];
  private readonly tmpColor = new THREE.Color();

  constructor() {
    this.buildingMat = new THREE.MeshStandardMaterial({
      color: NIGHT.building.clone(), roughness: 0.82, metalness: 0.12, map: facadeTexture(),
    });
    this.roofMat = new THREE.MeshStandardMaterial({ color: NIGHT.roof.clone(), roughness: 0.7, metalness: 0.3 });
    this.roadMat = new THREE.MeshStandardMaterial({ color: NIGHT.road.clone(), roughness: 0.94, metalness: 0.02 });
    [0.72, 0.86, 1].forEach(k => {
      this.landMats.push(new THREE.MeshStandardMaterial({
        color: NIGHT.land.clone().multiplyScalar(k), roughness: 1, metalness: 0,
      }));
    });
    this.bankMat = new THREE.MeshStandardMaterial({ color: NIGHT.bank.clone(), roughness: 1, metalness: 0 });
    this.groundMat = new THREE.MeshStandardMaterial({ color: NIGHT.ground.clone(), roughness: 0.98, metalness: 0 });
    this.streetMat = new THREE.MeshStandardMaterial({ color: NIGHT.street.clone(), roughness: 0.95, metalness: 0.02 });
    this.curbMat = new THREE.MeshStandardMaterial({ color: NIGHT.curb.clone(), roughness: 0.85, metalness: 0.1 });
    this.pierMat = new THREE.MeshStandardMaterial({ color: NIGHT.pier.clone(), roughness: 0.9, metalness: 0.03 });
    this.windowMat = new THREE.PointsMaterial({
      color: 0xffd39a, size: 1.8, sizeAttenuation: false,
      transparent: true, opacity: 0.62, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.trunkMat = new THREE.MeshStandardMaterial({ color: NIGHT.trunk.clone(), roughness: 0.9, metalness: 0 });
    this.foliageMat = new THREE.MeshStandardMaterial({ color: NIGHT.tree.clone(), roughness: 0.95, metalness: 0 });
    this.hullMat = new THREE.MeshStandardMaterial({ color: NIGHT.boat.clone(), roughness: 0.7, metalness: 0.15 });
    this.cabinMat = new THREE.MeshStandardMaterial({ color: NIGHT.cabin.clone(), roughness: 0.6, metalness: 0.1 });

    this.buildApproaches();
    this.buildFarBank();
    const blocks = this.buildBlocks();
    this.buildBuildings(blocks);
    this.buildWindows(blocks);
    this.buildVegetation(blocks);
    this.buildWatercraft();
    // 行人：城市两岸（避开楼栋）+ 桥面人行道；真实人体（皮肤/衣物分组 + 服装/肤色随机）
    const human = buildHumanoid();
    const avoid = (x: number, z: number) =>
      blocks.some(b => Math.abs(x - b.x) < b.w / 2 + 2 && Math.abs(z - b.z) < b.d / 2 + 2);
    [-1, 1].forEach(side => {
      const sys = new PedestrianSystem(human, {
        area: { x0: side * (SHORE_X + 150), x1: side * (LAND_END - 30), z0: -385, z1: 385, y: GROUND_Y + 0.25 },
        count: 240, avoid, speed: [0.6, 1.7], scale: [0.92, 1.12],
      });
      this.cityPeds.push(sys);
      this.root.add(sys.group);
    });
    [-1, 1].forEach(zSide => {
      const sys = new PedestrianSystem(human, {
        area: { x0: -400, x1: 400, z0: zSide * 22, z1: zSide * 22, y: GEO.deckY + 0.1 },
        count: 26, axis: 'x', speed: [0.5, 1.4], scale: [0.92, 1.1],
      });
      this.deckPeds.push(sys);
      this.root.add(sys.group);
    });
    this.buildRowingBoats();
    this.setDayFactor(0);
  }

  /** 两端引道 + 桥台 + 引桥墩 + 岸地，消除桥面在 x=±420 处突然断在水上的假感 */
  private buildApproaches(): void {
    const deckTop = GEO.deckY + 0.2;
    const approachLen = 520;
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0xbfcbd6, transparent: true, opacity: 0.5 });

    [-1, 1].forEach(side => {
      const cx = side * (GEO.halfLength + approachLen / 2);

      // 岸上地面抬到与桥面齐平，并用护坡 + 三级退台从水面自然过渡
      this.buildTerraces(side);

      const road = new THREE.Mesh(new THREE.BoxGeometry(approachLen, 0.5, GEO.deckW), this.roadMat);
      road.position.set(cx, deckTop - 0.25, 0);
      this.root.add(road);
      this.shadowReceivers.push(road);

      [-1, 1].forEach(zSide => {
        const edge = new THREE.Mesh(new THREE.BoxGeometry(approachLen, 0.05, 0.22), edgeMat);
        edge.position.set(cx, deckTop + 0.03, zSide * (GEO.halfDeck - 1.0));
        this.root.add(edge);
      });

      const abutment = new THREE.Mesh(new THREE.BoxGeometry(14, GEO.deckY + 4, GEO.deckW + 8), this.pierMat);
      abutment.position.set(side * (GEO.halfLength + 6), (GEO.deckY - 4) / 2, 0);
      this.root.add(abutment);
      this.shadowCasters.push(abutment);
      this.shadowReceivers.push(abutment);
    });

    // 引桥墩托住到护坡前缘为止的跨水段；之后引道落在城市台地上
    const pierXs: number[] = [];
    for (let d = 60; d < 220; d += 65) {
      pierXs.push(GEO.halfLength + d, -(GEO.halfLength + d));
    }
    const piers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.pierMat, pierXs.length * 2);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const pierH = GEO.deckY + 2;
    const s = new THREE.Vector3(4.5, pierH, 4.5);
    let k = 0;
    pierXs.forEach(x => [-14, 14].forEach(z => {
      p.set(x, pierH / 2 - 2, z);
      piers.setMatrixAt(k++, m.compose(p, q, s));
    }));
    piers.instanceMatrix.needsUpdate = true;
    piers.frustumCulled = false;
    this.root.add(piers);
    this.shadowCasters.push(piers);
    this.shadowReceivers.push(piers);
  }

  /** 岸地：护坡 + 三级退台 + 街区路网。城市站在与桥面齐平的地面上，而不是泡在水里 */
  private buildTerraces(side: number): void {
    const run = 80;
    const rise = TERRACES[0].top - GEO.waterY;
    const slopeLen = Math.hypot(run, rise);
    const ramp = new THREE.Mesh(
      new THREE.BoxGeometry(slopeLen, 2.5, TERRACES[0].halfZ * 2), this.bankMat,
    );
    // +X 岸沿 +X 抬升、-X 岸沿 -X 抬升，护坡高端正好接第一级台地顶面
    ramp.rotation.z = side * Math.atan2(rise, run);
    ramp.position.set(side * (SHORE_X + run / 2), (GEO.waterY + TERRACES[0].top) / 2, 0);
    // 大体积岸体不进阴影接收名单：占屏面积大却看不到桥影，省下整片片元的阴影采样
    this.root.add(ramp);

    let bottom = GEO.waterY - 6;
    TERRACES.forEach((t, i) => {
      const len = LAND_END - t.x0;
      const land = new THREE.Mesh(new THREE.BoxGeometry(len, t.top - bottom, t.halfZ * 2), this.landMats[i]);
      land.position.set(side * (t.x0 + len / 2), (t.top + bottom) / 2, 0);
      this.root.add(land);
      // 每级退台前缘一条防汛压顶，明确「岸」的边界；中间断开给引道让路
      const gap = GEO.halfDeck + 6;
      const curbLen = t.halfZ - gap;
      [-1, 1].forEach(zSide => {
        const curb = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, curbLen), this.curbMat);
        curb.position.set(side * t.x0, t.top + 0.8, zSide * (gap + curbLen / 2));
        this.root.add(curb);
      });
      bottom = t.top;
    });

    const top = TERRACES[TERRACES.length - 1];
    const topLen = LAND_END - top.x0;
    const surface = new THREE.Mesh(new THREE.BoxGeometry(topLen, 0.5, top.halfZ * 2), this.groundMat);
    surface.position.set(side * (top.x0 + topLen / 2), GROUND_Y + 0.25, 0);
    this.root.add(surface);
    this.shadowReceivers.push(surface);

    // 纵横街道把地表切成街区，楼群因此有城市肌理而不是散落的方块
    const streets = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.streetMat, 8);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    let k = 0;
    [0, 1, 2, 3].forEach(i => {
      p.set(side * (top.x0 + 80 + i * 105), GROUND_Y + 0.56, 0);
      streets.setMatrixAt(k++, m.compose(p, q, s.set(12, 0.12, top.halfZ * 2)));
    });
    [0, 1].forEach(i => [-1, 1].forEach(zSide => {
      p.set(side * (top.x0 + topLen / 2), GROUND_Y + 0.56, zSide * (80 + i * 150));
      streets.setMatrixAt(k++, m.compose(p, q, s.set(topLen, 0.12, 11)));
    }));
    streets.count = k;
    streets.instanceMatrix.needsUpdate = true;
    streets.frustumCulled = false;
    this.root.add(streets);
    this.shadowReceivers.push(streets);
  }

  /** 桥正后方的远景岸带：让背景天际线也落在陆地上，而不是悬在水面上 */
  private buildFarBank(): void {
    const farY = GROUND_Y - 14;
    const zNear = -700;
    const zFar = -1200;
    const bank = new THREE.Mesh(
      new THREE.BoxGeometry(2800, farY - (GEO.waterY - 6), zNear - zFar), this.bankMat,
    );
    bank.position.set(0, (farY + GEO.waterY - 6) / 2, (zNear + zFar) / 2);
    this.root.add(bank);
    const curb = new THREE.Mesh(new THREE.BoxGeometry(2800, 1.6, 2), this.curbMat);
    curb.position.set(0, farY + 0.8, zNear);
    this.root.add(curb);
  }

  /** 三片街区：西岸、东岸（引道两侧）+ 保留远处 -Z 背景天际线 */
  private buildBlocks(): Building[] {
    const blocks: Building[] = [];
    [-1, 1].forEach(side => {
      for (let ix = 0; ix < 3; ix++) {
        // 首排退到桥头外 CITY_SETBACK，留出滨江缓冲带；列距与街区路网对齐
        const x = side * (GEO.halfLength + CITY_SETBACK + ix * 120 + rand(-20, 20));
        for (const zSide of [-1, 1]) {
          for (let iz = 0; iz < 3; iz++) {
            const z = zSide * (120 + iz * 70 + rand(-12, 12));
            const near = ix < 2;
            blocks.push({
              x, z,
              w: rand(18, 30), d: rand(26, 48),
              // 地基已抬到桥面标高，压缩楼高避免天际线压过 216m 桥塔
              h: near ? rand(26, 58) : rand(46, 104),
              baseY: GROUND_Y,
              axis: 'x', face: -side,
            });
          }
        }
      }
    });
    // 远景岸带上的天际线同样分列两岸：桥正后方留空，楼群不与桥体叠在同一段画面里
    [-1, 1].forEach(side => {
      for (let i = 0; i < 13; i++) {
        blocks.push({
          x: side * (GEO.halfLength + CITY_SETBACK - 60 + i * 48 + rand(-16, 16)),
          z: -810 - rand(0, 190),
          w: rand(24, 52), d: rand(24, 46), h: rand(34, 96),
          baseY: GROUND_Y - 14,
          axis: 'z', face: 1,
        });
      }
    });
    return blocks;
  }

  /** 主体 + 裙房 + 顶部收窄段 + 屋顶设备，用 4 个 InstancedMesh 保持极低 draw call */
  private buildBuildings(blocks: Building[]): void {
    const box = new THREE.BoxGeometry(1, 1, 1);
    // 材质数组：±X/±Z 侧面用带窗立面贴图，±Y 顶/底用纯色屋面，避免顶部也出现窗格
    const facadeMat = this.buildingMat;
    const roofMat = this.roofMat;
    const bodyMats = [facadeMat, facadeMat, roofMat, roofMat, facadeMat, facadeMat];
    const bodies = new THREE.InstancedMesh(box, bodyMats, blocks.length);
    const podiums = new THREE.InstancedMesh(box, this.roofMat, blocks.length);
    const crowns = new THREE.InstancedMesh(box, this.roofMat, blocks.length);
    const rooftops = new THREE.InstancedMesh(box, this.roofMat, blocks.length);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const tint = new THREE.Color();

    blocks.forEach((b, i) => {
      p.set(b.x, b.baseY + b.h / 2, b.z);
      bodies.setMatrixAt(i, m.compose(p, q, s.set(b.w, b.h, b.d)));
      bodies.setColorAt(i, tint.setScalar(rand(0.78, 1.18)));

      p.set(b.x, b.baseY + 3.5, b.z);
      podiums.setMatrixAt(i, m.compose(p, q, s.set(b.w * 1.28, 7, b.d * 1.14)));

      const crownH = b.h * 0.12;
      p.set(b.x, b.baseY + b.h + crownH / 2, b.z);
      crowns.setMatrixAt(i, m.compose(p, q, s.set(b.w * 0.62, crownH, b.d * 0.62)));

      const rh = rand(4, 12);
      p.set(b.x + rand(-b.w * 0.2, b.w * 0.2), b.baseY + b.h + crownH + rh / 2, b.z);
      rooftops.setMatrixAt(i, m.compose(p, q, s.set(2.4, rh, 2.4)));
    });

    [bodies, podiums, crowns, rooftops].forEach(mesh => {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      this.root.add(mesh);
      this.shadowCasters.push(mesh);
    });
    this.shadowReceivers.push(bodies, podiums);
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  }

  /** 朝桥一侧的立面上随机点亮窗格；夜景发光、白天几乎熄灭 */
  private buildWindows(blocks: Building[]): void {
    const pos: number[] = [];
    blocks.forEach(b => {
      const span = b.axis === 'x' ? b.d : b.w;
      const floors = Math.max(3, Math.floor(b.h / 9));
      const cols = Math.max(2, Math.floor(span / 7));
      for (let f = 0; f < floors; f++) {
        for (let c = 0; c < cols; c++) {
          if (Math.random() < 0.55) continue;
          const y = b.baseY + 8 + f * ((b.h - 14) / floors);
          const lateral = -span / 2 + (c + 0.5) * (span / cols);
          if (b.axis === 'x') pos.push(b.x + b.face * (b.w / 2 + 0.6), y, b.z + lateral);
          else pos.push(b.x + lateral, y, b.z + b.face * (b.d / 2 + 0.6));
        }
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const windows = new THREE.Points(geo, this.windowMat);
    windows.frustumCulled = false;
    this.root.add(windows);
  }

  /** 两岸滨水绿地：在台地顶面与街区间的空地撒布低多边形树木。
   *  树干与树冠用两个 InstancedMesh 共享同一组实例变换，各自参与昼夜变色；
   *  自动避开楼栋占地，让光秃秃的混凝土岸线变成有生命的滨江公园 */
  private buildVegetation(blocks: Building[]): void {
    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.85, 7, 6);
    trunkGeo.translate(0, 3.5, 0);
    const canopyGeo = new THREE.IcosahedronGeometry(5.0, 0);
    canopyGeo.scale(1, 1.12, 1);
    canopyGeo.translate(0, 10.2, 0);

    const CAP = 760;
    const trunks = new THREE.InstancedMesh(trunkGeo, this.trunkMat, CAP);
    const foliage = new THREE.InstancedMesh(canopyGeo, this.foliageMat, CAP);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    let placed = 0;
    const target = 700;
    const Y = new THREE.Vector3(0, 1, 0);
    const tint = new THREE.Color();
    for (let t = 0; t < target * 8 && placed < target; t++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = side * rand(SHORE_X + 150, LAND_END - 30);
      const z = rand(-385, 385);
      // 避开楼栋占地（含裙房外扩），树自然落在街区间的绿地与缓冲带
      let hit = false;
      for (const b of blocks) {
        if (Math.abs(x - b.x) < b.w * 0.64 + 6 && Math.abs(z - b.z) < b.d * 0.57 + 6) { hit = true; break; }
      }
      if (hit) continue;
      const sc = rand(0.75, 1.7);
      const sy = sc * rand(0.85, 1.3);   // 树高参差，避免一模一样的复制感
      p.set(x, GROUND_Y, z);
      q.setFromAxisAngle(Y, rand(0, Math.PI * 2));
      s.set(sc, sy, sc);
      m.compose(p, q, s);
      trunks.setMatrixAt(placed, m);
      foliage.setMatrixAt(placed, m);
      // 逐株绿 / 褐微差，打破「同一支队伍」的塑料感
      foliage.setColorAt(placed, tint.setScalar(rand(0.8, 1.18)));
      trunks.setColorAt(placed, tint.setScalar(rand(0.82, 1.12)));
      placed++;
    }
    trunks.count = placed;
    foliage.count = placed;
    [trunks, foliage].forEach(mesh => {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      this.root.add(mesh);
    });
  }

  /** 江面航行的船只：少量货轮 / 拖轮沿桥轴缓慢漂移并循环，给空旷江面注入生命感。
   *  船体 + 舱室用两个 InstancedMesh 共享同一组实例变换；update() 每帧推进位置。 */
  private buildWatercraft(): void {
    const hullGeo = new THREE.BoxGeometry(38, 7, 11);
    const cabinGeo = new THREE.BoxGeometry(13, 6, 9);
    cabinGeo.translate(8, 6, 0);   // 舱室置于船尾上方（局部 +X 为船尾）
    const COUNT = 10;
    const hull = new THREE.InstancedMesh(hullGeo, this.hullMat, COUNT);
    const cabin = new THREE.InstancedMesh(cabinGeo, this.cabinMat, COUNT);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const Y = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < COUNT; i++) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const x = rand(-1100, 1100);
      const z = rand(-300, 300);
      const speed = rand(3, 7);
      this.boatData.push({ x, z, dir, speed, len: 38 });
      p.set(x, GEO.waterY + 2.5, z);
      q.setFromAxisAngle(Y, dir > 0 ? 0 : Math.PI);
      m.compose(p, q, s);
      hull.setMatrixAt(i, m);
      cabin.setMatrixAt(i, m);
    }
    hull.instanceMatrix.needsUpdate = true;
    cabin.instanceMatrix.needsUpdate = true;
    [hull, cabin].forEach(mesh => { mesh.frustumCulled = false; this.root.add(mesh); });
    this.boatHull = hull;
    this.boatCabin = cabin;
  }

  /** 每帧推进船只、划船小船与行人 */
  update(dt: number): void {
    // 货轮沿桥轴漂移，越界后从对侧循环并随机重置航道 / 速度
    if (this.boatHull && this.boatCabin) {
      const m = new THREE.Matrix4();
      const p = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3(1, 1, 1);
      const Y = new THREE.Vector3(0, 1, 0);
      this.boatData.forEach((b, i) => {
        b.x += b.dir * b.speed * dt;
        if (b.dir > 0 && b.x > 1150) { b.x = -1150; b.z = rand(-300, 300); b.speed = rand(3, 7); b.dir = Math.random() < 0.5 ? 1 : -1; }
        else if (b.dir < 0 && b.x < -1150) { b.x = 1150; b.z = rand(-300, 300); b.speed = rand(3, 7); b.dir = Math.random() < 0.5 ? 1 : -1; }
        p.set(b.x, GEO.waterY + 2.5, b.z);
        q.setFromAxisAngle(Y, b.dir > 0 ? 0 : Math.PI);
        m.compose(p, q, s);
        this.boatHull!.setMatrixAt(i, m);
        this.boatCabin!.setMatrixAt(i, m);
      });
      this.boatHull!.instanceMatrix.needsUpdate = true;
      this.boatCabin!.instanceMatrix.needsUpdate = true;
    }
    this.updateRowingBoats(dt);
    this.cityPeds.forEach(p => p.update(dt));
    this.deckPeds.forEach(p => p.update(dt));
  }

  /** 江面划船小船：每艘含船体 + 坐姿划手（皮肤/衣物分组）+ 双桨，逐帧漂移并划桨 */
  private buildRowingBoats(): void {
    const N = 7;
    const seated = buildSeatedPerson();
    const hullGeo = new THREE.BoxGeometry(7, 1.4, 2.6);
    const rowerSkin = new THREE.InstancedMesh(seated.skin, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 }), N);
    const rowerCloth = new THREE.InstancedMesh(seated.cloth, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 }), N);
    const hull = new THREE.InstancedMesh(hullGeo, this.hullMat, N);
    // 双桨：分别向 ±Z 伸出，绕船体 X 轴摆动模拟划水
    const oarA = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.08, 2.8).translate(0, 0, 1.4), new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.8, metalness: 0 }), N);
    const oarB = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.08, 2.8).translate(0, 0, -1.4), new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.8, metalness: 0 }), N);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const Y = new THREE.Vector3(0, 1, 0);
    const skinCol = new THREE.Color();
    const clothCol = new THREE.Color();
    const rowerM = new THREE.Matrix4();
    const tScale = new THREE.Matrix4().makeScale(0.95, 0.95, 0.95);
    const tSeat = new THREE.Matrix4().makeTranslation(0, 0.5, 0);
    for (let i = 0; i < N; i++) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const x = rand(-1000, 1000);
      const z = rand(-260, 260);
      const speed = rand(1.2, 2.6);
      this.rowData.push({ x, z, dir, speed, len: 7, rowPhase: Math.random() * Math.PI * 2 });
      p.set(x, GEO.waterY + 0.5, z);
      q.setFromAxisAngle(Y, dir > 0 ? 0 : Math.PI);
      m.compose(p, q, s);
      hull.setMatrixAt(i, m);
      rowerM.copy(m).multiply(tSeat).multiply(tScale);
      rowerSkin.setMatrixAt(i, rowerM);
      rowerCloth.setMatrixAt(i, rowerM);
      clothCol.setHSL(0.02 + Math.random() * 0.95, 0.25 + Math.random() * 0.35, 0.32 + Math.random() * 0.28);
      skinCol.setHSL(0.07 + Math.random() * 0.04, 0.35 + Math.random() * 0.2, 0.45 + Math.random() * 0.2);
      rowerCloth.setColorAt(i, clothCol);
      rowerSkin.setColorAt(i, skinCol);
      oarA.setMatrixAt(i, m);
      oarB.setMatrixAt(i, m);
    }
    [hull, rowerSkin, rowerCloth, oarA, oarB].forEach(mesh => { mesh.frustumCulled = false; this.root.add(mesh); });
    if (rowerSkin.instanceColor) rowerSkin.instanceColor.needsUpdate = true;
    if (rowerCloth.instanceColor) rowerCloth.instanceColor.needsUpdate = true;
    this.rowHull = hull; this.rowRowerSkin = rowerSkin; this.rowRowerCloth = rowerCloth;
    this.rowOarA = oarA; this.rowOarB = oarB;
  }

  /** 划船小船逐帧：漂移 + 划手随船 + 双桨绕船体 X 轴摆动 */
  private updateRowingBoats(dt: number): void {
    if (!this.rowHull) return;
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const Y = new THREE.Vector3(0, 1, 0);
    const Xr = new THREE.Matrix4();
    const local = new THREE.Matrix4();
    const rowerM = new THREE.Matrix4();
    const tSeat = new THREE.Matrix4().makeTranslation(0, 0.5, 0);
    const tScale = new THREE.Matrix4().makeScale(0.95, 0.95, 0.95);
    this.rowData.forEach((b, i) => {
      b.x += b.dir * b.speed * dt;
      if (b.dir > 0 && b.x > 1100) { b.x = -1100; b.z = rand(-260, 260); b.speed = rand(1.2, 2.6); b.dir = Math.random() < 0.5 ? 1 : -1; }
      else if (b.dir < 0 && b.x < -1100) { b.x = 1100; b.z = rand(-260, 260); b.speed = rand(1.2, 2.6); b.dir = Math.random() < 0.5 ? 1 : -1; }
      b.rowPhase += dt * 2.4;
      p.set(b.x, GEO.waterY + 0.5, b.z);
      q.setFromAxisAngle(Y, b.dir > 0 ? 0 : Math.PI);
      m.compose(p, q, s);
      this.rowHull!.setMatrixAt(i, m);
      rowerM.copy(m).multiply(tSeat).multiply(tScale);
      this.rowRowerSkin!.setMatrixAt(i, rowerM);
      this.rowRowerCloth!.setMatrixAt(i, rowerM);
      const ang = Math.sin(b.rowPhase) * 0.5;
      Xr.makeRotationX(ang);
      local.makeTranslation(0, 0.9, 1.3).multiply(Xr);
      this.rowOarA!.setMatrixAt(i, m.clone().multiply(local));
      local.makeTranslation(0, 0.9, -1.3).multiply(Xr);
      this.rowOarB!.setMatrixAt(i, m.clone().multiply(local));
    });
    this.rowHull!.instanceMatrix.needsUpdate = true;
    this.rowRowerSkin!.instanceMatrix.needsUpdate = true;
    this.rowRowerCloth!.instanceMatrix.needsUpdate = true;
    this.rowOarA!.instanceMatrix.needsUpdate = true;
    this.rowOarB!.instanceMatrix.needsUpdate = true;
  }

  setDayFactor(f: number): void {
    const d = Math.max(0, Math.min(1, f));
    const pairs: Array<[THREE.MeshStandardMaterial, THREE.Color, THREE.Color]> = [
      [this.buildingMat, NIGHT.building, DAY.building],
      [this.roofMat, NIGHT.roof, DAY.roof],
      [this.roadMat, NIGHT.road, DAY.road],
      [this.bankMat, NIGHT.bank, DAY.bank],
      [this.groundMat, NIGHT.ground, DAY.ground],
      [this.streetMat, NIGHT.street, DAY.street],
      [this.curbMat, NIGHT.curb, DAY.curb],
      [this.pierMat, NIGHT.pier, DAY.pier],
      [this.foliageMat, NIGHT.tree, DAY.tree],
      [this.trunkMat, NIGHT.trunk, DAY.trunk],
      [this.hullMat, NIGHT.boat, DAY.boat],
      [this.cabinMat, NIGHT.cabin, DAY.cabin],
    ];
    pairs.forEach(([mat, night, day]) => mat.color.copy(night).lerp(day, d));
    // 三级退台保留各自的明度系数，昼夜插值后才不会糊成同一块色
    const tint = [0.72, 0.86, 1];
    this.landMats.forEach((mat, i) => {
      this.tmpColor.copy(DAY.land).multiplyScalar(tint[i]);
      mat.color.copy(NIGHT.land).multiplyScalar(tint[i]).lerp(this.tmpColor, d);
    });
    this.windowMat.opacity = 0.62 * (1 - d) + 0.03 * d;
  }
}
