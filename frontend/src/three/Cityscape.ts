import * as THREE from 'three';
import { GEO } from '../config';

const rand = (a: number, b: number) => a + Math.random() * (b - a);

interface Building {
  x: number; z: number;
  w: number; d: number; h: number;
  /** 窗光所在立面的轴向与朝向：桥头沿 X 面，远端沿 Z 面 */
  axis: 'x' | 'z';
  face: number;
}

const NIGHT = {
  building: new THREE.Color(0x334760),
  roof: new THREE.Color(0x3c516b),
  road: new THREE.Color(0x1b232e),
  land: new THREE.Color(0x16202c),
  pier: new THREE.Color(0x32435a),
};
const DAY = {
  building: new THREE.Color(0x6f8091),
  roof: new THREE.Color(0x607080),
  road: new THREE.Color(0x3b4149),
  // 岸地取水面 shader 的浅滩色，避免一整块绿板浮在水上
  land: new THREE.Color(0x72786a),
  pier: new THREE.Color(0x88939f),
};

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
  private landMat: THREE.MeshStandardMaterial;
  private pierMat: THREE.MeshStandardMaterial;
  private windowMat: THREE.PointsMaterial;

  constructor() {
    this.buildingMat = new THREE.MeshStandardMaterial({ color: NIGHT.building.clone(), roughness: 0.78, metalness: 0.14 });
    this.roofMat = new THREE.MeshStandardMaterial({ color: NIGHT.roof.clone(), roughness: 0.7, metalness: 0.3 });
    this.roadMat = new THREE.MeshStandardMaterial({ color: NIGHT.road.clone(), roughness: 0.94, metalness: 0.02 });
    this.landMat = new THREE.MeshStandardMaterial({ color: NIGHT.land.clone(), roughness: 1, metalness: 0 });
    this.pierMat = new THREE.MeshStandardMaterial({ color: NIGHT.pier.clone(), roughness: 0.9, metalness: 0.03 });
    this.windowMat = new THREE.PointsMaterial({
      color: 0xffd39a, size: 1.8, sizeAttenuation: false,
      transparent: true, opacity: 0.62, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.buildApproaches();
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

      // 岸地分三段错落拼接，形成不规则岸线而不是一整块笔直平板
      const landParts = [
        { dx: 0, len: 270, depth: 900 },
        { dx: 270, len: 250, depth: 820 },
        { dx: 520, len: 200, depth: 730 },
      ];
      landParts.forEach(part => {
        const land = new THREE.Mesh(new THREE.BoxGeometry(part.len, 3, part.depth), this.landMat);
        // 顶面与水面齐平，波纹起伏自然穿过岸线，不再形成抬起的平板
        land.position.set(side * (GEO.halfLength + part.dx + part.len / 2), GEO.waterY - 1.5, 0);
        this.root.add(land);
        this.shadowReceivers.push(land);
      });

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

    // 引桥墩：每 65m 一对，从水面托到引道底部
    const pierXs: number[] = [];
    for (let d = 60; d < approachLen; d += 65) {
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

  /** 三片街区：西岸、东岸（引道两侧）+ 保留远处 -Z 背景天际线 */
  private buildBlocks(): Building[] {
    const blocks: Building[] = [];
    [-1, 1].forEach(side => {
      for (let ix = 0; ix < 4; ix++) {
        const x = side * (490 + ix * 115 + rand(-22, 22));
        for (const zSide of [-1, 1]) {
          for (let iz = 0; iz < 4; iz++) {
            const z = zSide * (95 + iz * 82 + rand(-16, 16));
            const near = ix < 2;
            blocks.push({
              x, z,
              w: rand(18, 30), d: rand(26, 48),
              h: near ? rand(28, 78) : rand(60, 145),
              axis: 'x', face: -side,
            });
          }
        }
      }
    });
    // 远景：横向铺满桥轴，主立面朝 +Z
    for (let i = 0; i < 26; i++) {
      blocks.push({
        x: -900 + (i / 25) * 1800 + rand(-18, 18),
        z: -810 - rand(0, 190),
        w: rand(24, 52), d: rand(24, 46), h: rand(40, 150),
        axis: 'z', face: 1,
      });
    }
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
      p.set(b.x, -2 + b.h / 2, b.z);
      bodies.setMatrixAt(i, m.compose(p, q, s.set(b.w, b.h, b.d)));
      bodies.setColorAt(i, tint.setScalar(rand(0.78, 1.18)));

      p.set(b.x, -2 + 3.5, b.z);
      podiums.setMatrixAt(i, m.compose(p, q, s.set(b.w * 1.28, 7, b.d * 1.14)));

      const crownH = b.h * 0.12;
      p.set(b.x, -2 + b.h + crownH / 2, b.z);
      crowns.setMatrixAt(i, m.compose(p, q, s.set(b.w * 0.62, crownH, b.d * 0.62)));

      const rh = rand(4, 12);
      p.set(b.x + rand(-b.w * 0.2, b.w * 0.2), -2 + b.h + crownH + rh / 2, b.z);
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
          const y = -2 + 8 + f * ((b.h - 14) / floors);
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
    this.buildingMat.color.copy(NIGHT.building).lerp(DAY.building, d);
    this.roofMat.color.copy(NIGHT.roof).lerp(DAY.roof, d);
    this.roadMat.color.copy(NIGHT.road).lerp(DAY.road, d);
    this.landMat.color.copy(NIGHT.land).lerp(DAY.land, d);
    this.pierMat.color.copy(NIGHT.pier).lerp(DAY.pier, d);
    this.windowMat.opacity = 0.62 * (1 - d) + 0.03 * d;
  }
}
