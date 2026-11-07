import * as THREE from 'three';
import { GEO } from '../config';

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
};

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
  private readonly tmpColor = new THREE.Color();

  constructor() {
    this.buildingMat = new THREE.MeshStandardMaterial({ color: NIGHT.building.clone(), roughness: 0.78, metalness: 0.14 });
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

    this.buildApproaches();
    this.buildFarBank();
    const blocks = this.buildBlocks();
    this.buildBuildings(blocks);
    this.buildWindows(blocks);
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
      for (let ix = 0; ix < 4; ix++) {
        // 首排退到桥头外 CITY_SETBACK，留出滨江缓冲带；列距与街区路网对齐
        const x = side * (GEO.halfLength + CITY_SETBACK + ix * 105 + rand(-20, 20));
        for (const zSide of [-1, 1]) {
          for (let iz = 0; iz < 4; iz++) {
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
    const bodies = new THREE.InstancedMesh(box, this.buildingMat, blocks.length);
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
