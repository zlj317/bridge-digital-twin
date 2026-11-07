import * as THREE from 'three';
import { CABLES, GEO } from '../config';
import { radialAlphaTexture, saggedCablePoint } from './BridgeGeometry';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

function setBox(mesh: THREE.InstancedMesh, i: number,
                x: number, y: number, z: number, sx: number, sy: number, sz: number): void {
  _q.identity();
  mesh.setMatrixAt(i, _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)));
}

/** 用单位圆柱几何按两点构造定向杆件（索套管 / 锚筒 / 斜撑） */
function setRod(mesh: THREE.InstancedMesh, i: number, a: THREE.Vector3, b: THREE.Vector3): void {
  const dir = b.clone().sub(a);
  const len = dir.length();
  _q.setFromUnitVectors(Y_AXIS, dir.clone().normalize());
  mesh.setMatrixAt(i, _m.compose(_p.copy(a).addScaledVector(dir, 0.5), _q, _s.set(1, len, 1)));
}

/** 结构附属构件：塔冠/避雷针、索鞍与梁端锚具、锚垫板、检修轨道、排水管、墩帽、路面灯光斑。
 *  全部实例化，独立于五幕动画，由 Viewport 按施工进度 / 昼夜 / 剖切状态驱动。 */
export class StructuralDetails {
  readonly root = new THREE.Group();

  readonly deckMaterials: THREE.Material[] = [];
  private glowMat: THREE.MeshBasicMaterial;
  private spots: THREE.InstancedMesh;
  private revealed = false;
  private readonly deckRoot = new THREE.Group();

  constructor() {
    const steel = new THREE.MeshStandardMaterial({ color: 0x94a1ae, metalness: 0.74, roughness: 0.36 });
    const steelDark = new THREE.MeshStandardMaterial({ color: 0x4e5b69, metalness: 0.62, roughness: 0.52 });
    const concrete = new THREE.MeshStandardMaterial({ color: 0xa6b0bb, metalness: 0.04, roughness: 0.88 });

    // 塔冠帽梁 + 塔顶避雷针
    const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), concrete, 2);
    [-GEO.towerX, GEO.towerX].forEach((tx, i) => setBox(caps, i, tx, GEO.towerH + 1.5, 0, 11, 3, 50));
    caps.instanceMatrix.needsUpdate = true;
    caps.frustumCulled = false;
    this.root.add(caps);

    const spires = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.32, 1, 8), steel, 4);
    let si = 0;
    [-GEO.towerX, GEO.towerX].forEach(tx => {
      [-GEO.towerLegZ, GEO.towerLegZ].forEach(dz => {
        setBox(spires, si++, tx, GEO.towerH + 3 + 4.5, dz, 1, 9, 1);
      });
    });
    spires.instanceMatrix.needsUpdate = true;
    spires.frustumCulled = false;
    this.root.add(spires);

    // 索鞍导管（塔端）+ 锥形护筒（梁端）+ 梁面锚垫板 + 索夹 / 减振器 / 六角锚头
    const n = CABLES.length;
    const saddles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.44, 0.44, 1, 10), steelDark, n);
    const anchorSleeves = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.30, 0.54, 1, 10), steel, n);
    const collars = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.34, 0.34, 1, 10), steelDark, n * 2);
    const plateMat = steelDark.clone();
    const plates = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), plateMat, n);
    // 桥面上的锚头与减振器单独用一套材质，便于与桥面同步剖切
    const deckSteel = new THREE.MeshStandardMaterial({ color: 0x6d7a88, metalness: 0.78, roughness: 0.34 });
    const heads = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.62, 0.62, 1, 6), deckSteel, n);
    const dampers = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.11, 1, 8), deckSteel, n);
    CABLES.forEach((c, i) => {
      const a = new THREE.Vector3(c.anchorTop.x, c.anchorTop.y, c.anchorTop.z);
      const b = new THREE.Vector3(c.anchorBottom.x, c.anchorBottom.y, c.anchorBottom.z);
      // 两端切线分别取垂度曲线上的差分，索鞍 / 护筒 / 锚头才与弯曲索体同向
      const upTower = a.clone().sub(saggedCablePoint(a, b, 0.012)).normalize();
      const upBeam = saggedCablePoint(a, b, 0.988).sub(b).normalize();
      setRod(saddles, i, a.clone().addScaledVector(upTower, -2.6), a.clone().addScaledVector(upTower, -0.2));
      setRod(anchorSleeves, i, b.clone().addScaledVector(upBeam, 0.15), b.clone().addScaledVector(upBeam, 3.0));
      setBox(plates, i, b.x, GEO.deckY + 0.3, b.z, 3.4, 0.22, 2.6);
      // 六角锚头沿梁端切线伸出护筒
      setRod(heads, i, b.clone().addScaledVector(upBeam, 3.05), b.clone().addScaledVector(upBeam, 4.0));
      // 外置黏滞减振器：从索体斜拉到锚垫板附近，长索不再像一根细直钢丝
      const top = saggedCablePoint(a, b, 0.90);
      const foot = new THREE.Vector3(b.x + (a.x - b.x) * 0.04, GEO.deckY + 0.5, b.z);
      setRod(dampers, i, foot, top);
      // 索夹：距两端各一处短套环，打断索体的完全光滑感
      [0.18, 0.82].forEach((t, j) => {
        setRod(collars, i * 2 + j,
          saggedCablePoint(a, b, t - 0.002), saggedCablePoint(a, b, t + 0.002));
      });
    });
    [saddles, anchorSleeves, collars].forEach(m => {
      m.instanceMatrix.needsUpdate = true;
      m.frustumCulled = false;
      this.root.add(m);
    });
    [plates, heads, dampers].forEach(m => {
      m.instanceMatrix.needsUpdate = true;
      m.frustumCulled = false;
      // 锚垫板 / 锚头 / 减振器坐在桥面上，剖切时与灯光斑一起被裁剪
      this.deckRoot.add(m);
    });
    this.deckMaterials.push(plateMat, deckSteel);

    // 箱梁底检修车轨道 + 两侧纵向排水管
    const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), steelDark, 2);
    [-8, 8].forEach((z, i) => setBox(rails, i, 0, GEO.girderBottomY - 0.5, z, GEO.length, 0.3, 0.42));
    rails.instanceMatrix.needsUpdate = true;
    rails.frustumCulled = false;
    this.root.add(rails);

    const drainGeo = new THREE.CylinderGeometry(0.32, 0.32, GEO.length, 8);
    drainGeo.rotateZ(Math.PI / 2);
    [-20, 20].forEach(z => {
      const pipe = new THREE.Mesh(drainGeo, steelDark);
      pipe.position.set(0, GEO.girderBottomY - 0.9, z);
      this.root.add(pipe);
    });

    // 桥头端墩墩帽
    const pierCaps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), concrete, 2);
    [-GEO.halfLength, GEO.halfLength].forEach((x, i) => setBox(pierCaps, i, x, 52.9, 0, 18, 1.8, GEO.deckW + 4));
    pierCaps.instanceMatrix.needsUpdate = true;
    pierCaps.frustumCulled = false;
    this.root.add(pierCaps);

    // 横梁下斜撑：每塔两侧各一根，让塔-梁连接不再是生硬的直角
    const braces = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), steelDark, 4);
    let bi = 0;
    [-GEO.towerX, GEO.towerX].forEach(tx => {
      [-GEO.towerLegZ, GEO.towerLegZ].forEach(dz => {
        setRod(braces, bi,
          new THREE.Vector3(tx, 50, dz),
          new THREE.Vector3(tx, 32, dz * 0.72),
        );
        bi++;
      });
    });
    braces.instanceMatrix.needsUpdate = true;
    braces.frustumCulled = false;
    this.root.add(braces);

    // 路灯照地光斑：与 StreetLights 灯头位置一一对应，夜间在沥青上形成暖色椭圆
    const xs: number[] = [];
    for (let x = -GEO.halfLength + 20; x <= GEO.halfLength - 20; x += 40) xs.push(x);
    const spotCount = xs.length * 2;
    const spotGeo = new THREE.PlaneGeometry(1, 1);
    spotGeo.rotateX(-Math.PI / 2);
    this.glowMat = new THREE.MeshBasicMaterial({
      color: 0xffbc72, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, alphaMap: radialAlphaTexture(), side: THREE.DoubleSide,
    });
    this.spots = new THREE.InstancedMesh(spotGeo, this.glowMat, spotCount);
    let k = 0;
    xs.forEach(x => [-1, 1].forEach(side => {
      setBox(this.spots, k++, x, GEO.deckY + 0.26, side * (GEO.halfDeck - 3.8), 22, 1, 26);
    }));
    this.spots.instanceMatrix.needsUpdate = true;
    this.spots.frustumCulled = false;
    this.spots.renderOrder = 2;
    this.deckRoot.add(this.spots);
    this.root.add(this.deckRoot);
    // 锚垫板 / 锚头 / 减振器 / 灯光斑交给 ClippingController 与桥面同步裁剪
    this.deckMaterials.push(this.glowMat);
    this.root.visible = false;
  }

  /** 幕三之后与护栏 / 路灯同期出现，避免骨架阶段附属构件悬空 */
  setReveal(p: number): void {
    this.revealed = p > 0.35;
    this.root.visible = this.revealed;
  }

  setDayFactor(f: number): void {
    const night = 1 - Math.max(0, Math.min(1, f));
    this.glowMat.opacity = 0.46 * night;
    this.spots.visible = night > 0.04;
  }
}
