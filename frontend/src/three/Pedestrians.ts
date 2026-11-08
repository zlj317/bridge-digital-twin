import * as THREE from 'three';

/** 合并若干（已 toNonIndexed 的）几何，仅拼接 position / normal，避免引入 examples 依赖。 */
function mergeNonIndexed(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let total = 0;
  geos.forEach(g => { total += g.getAttribute('position').count; });
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  let o = 0;
  geos.forEach(g => {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    (pos as Float32Array).set(p.array as ArrayLike<number>, o * 3);
    (nor as Float32Array).set(n.array as ArrayLike<number>, o * 3);
    o += p.count;
  });
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return merged;
}

const part = (g: THREE.BufferGeometry, x: number, y: number, z: number): THREE.BufferGeometry => {
  g.translate(x, y, z);
  return g.toNonIndexed();
};

/**
 * 站立人体：皮肤（头 + 手）与衣物（躯干 + 双臂 + 双腿）分成两组几何，
 * 便于用两个 InstancedMesh 各自上色。腿部取迈步姿态，配合逐帧上下起伏即像在行走。
 * 脚底位于 y=0，总高约 1.72m，比例按真实成人。
 */
export function buildHumanoid(): { skin: THREE.BufferGeometry; cloth: THREE.BufferGeometry } {
  const skin = mergeNonIndexed([
    part(new THREE.SphereGeometry(0.135, 10, 8), 0, 1.58, 0),     // 头
    part(new THREE.SphereGeometry(0.06, 6, 5), 0.30, 0.92, 0.04), // 右手
    part(new THREE.SphereGeometry(0.06, 6, 5), -0.30, 0.92, 0.04),// 左手
  ]);
  const cloth = mergeNonIndexed([
    part(new THREE.BoxGeometry(0.44, 0.56, 0.26), 0, 1.16, 0),    // 躯干
    part(new THREE.BoxGeometry(0.12, 0.46, 0.14), 0.30, 1.16, 0.04), // 右臂
    part(new THREE.BoxGeometry(0.12, 0.46, 0.14), -0.30, 1.16, 0.04),// 左臂
    part(new THREE.BoxGeometry(0.20, 0.90, 0.24), 0.13, 0.45, 0.12), // 右腿（迈步前）
    part(new THREE.BoxGeometry(0.20, 0.90, 0.24), -0.13, 0.45, -0.12),// 左腿（迈步后）
  ]);
  return { skin, cloth };
}

/**
 * 坐姿人体（划船用）：大腿水平、小腿下垂、躯干直立、双臂前伸握桨。
 * 脚底位于 y=0，坐高约 1.35m。
 */
export function buildSeatedPerson(): { skin: THREE.BufferGeometry; cloth: THREE.BufferGeometry } {
  const skin = mergeNonIndexed([
    part(new THREE.SphereGeometry(0.13, 10, 8), 0, 1.22, -0.05),   // 头
    part(new THREE.SphereGeometry(0.055, 6, 5), 0.22, 0.98, 0.55),// 右手（握桨）
    part(new THREE.SphereGeometry(0.055, 6, 5), -0.22, 0.98, 0.55),// 左手
  ]);
  const cloth = mergeNonIndexed([
    part(new THREE.BoxGeometry(0.42, 0.62, 0.24), 0, 0.80, -0.05), // 躯干
    part(new THREE.BoxGeometry(0.16, 0.16, 0.44), 0.12, 0.50, 0.22), // 右大腿（水平前伸）
    part(new THREE.BoxGeometry(0.16, 0.16, 0.44), -0.12, 0.50, 0.22),// 左大腿
    part(new THREE.BoxGeometry(0.17, 0.50, 0.18), 0.12, 0.25, 0.44), // 右小腿（下垂）
    part(new THREE.BoxGeometry(0.17, 0.50, 0.18), -0.12, 0.25, 0.44),// 左小腿
    part(new THREE.BoxGeometry(0.10, 0.10, 0.52), 0.22, 0.98, 0.30), // 右臂（前伸握桨）
    part(new THREE.BoxGeometry(0.10, 0.10, 0.52), -0.22, 0.98, 0.30),// 左臂
  ]);
  return { skin, cloth };
}

export interface PedestrianArea {
  x0: number; x1: number; z0: number; z1: number; y: number;
}

export interface PedestrianOptions {
  area: PedestrianArea;
  count: number;
  /** 避开某点的谓词（如楼栋占地），返回 true 表示该处不可站 */
  avoid?: (x: number, z: number) => boolean;
  /** 主要行走轴；'x' 沿桥轴，'z' 沿横向；缺省随机 */
  axis?: 'x' | 'z';
  speed?: [number, number];
  scale?: [number, number];
}

interface Ped {
  x: number; z: number; dir: number; speed: number; phase: number;
  axis: 'x' | 'z'; y: number; sc: number; face: number;
}

/**
 * 实例化行人系统：皮肤 / 衣物两个 InstancedMesh 共享同一组变换，逐帧沿街道行走并上下起伏。
 * 衣物用随机服装色、皮肤用随机肤色（instanceColor），避免「复制人」的塑料感。
 */
export class PedestrianSystem {
  readonly group = new THREE.Group();
  private skinMesh: THREE.InstancedMesh;
  private clothMesh: THREE.InstancedMesh;
  private peds: Ped[] = [];
  private readonly area: PedestrianArea;
  private readonly skinMat: THREE.MeshStandardMaterial;
  private readonly clothMat: THREE.MeshStandardMaterial;
  private readonly Y = new THREE.Vector3(0, 1, 0);

  constructor(human: { skin: THREE.BufferGeometry; cloth: THREE.BufferGeometry }, opts: PedestrianOptions) {
    this.area = opts.area;
    this.skinMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
    this.clothMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
    this.skinMesh = new THREE.InstancedMesh(human.skin, this.skinMat, opts.count);
    this.clothMesh = new THREE.InstancedMesh(human.cloth, this.clothMat, opts.count);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const skinCol = new THREE.Color();
    const clothCol = new THREE.Color();
    const speed = opts.speed ?? [0.6, 1.6];
    const scale = opts.scale ?? [0.95, 1.12];
    const tmp = new THREE.Color();

    for (let i = 0; i < opts.count; i++) {
      const axis = opts.axis ?? (Math.random() < 0.5 ? 'x' : 'z');
      let x = 0, z = 0, tries = 0;
      do {
        x = opts.area.x0 + Math.random() * (opts.area.x1 - opts.area.x0);
        z = opts.area.z0 + Math.random() * (opts.area.z1 - opts.area.z0);
        tries++;
      } while (opts.avoid && opts.avoid(x, z) && tries < 12);
      const dir = Math.random() < 0.5 ? 1 : -1;
      const sc = scale[0] + Math.random() * (scale[1] - scale[0]);
      const face = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
      const ped: Ped = {
        x, z, dir, speed: speed[0] + Math.random() * (speed[1] - speed[0]),
        phase: Math.random() * Math.PI * 2, axis, y: this.area.y, sc, face,
      };
      this.peds.push(ped);
      p.set(x, ped.y, z);
      q.setFromAxisAngle(this.Y, face);
      s.set(sc, sc, sc);
      m.compose(p, q, s);
      this.skinMesh.setMatrixAt(i, m);
      this.clothMesh.setMatrixAt(i, m);
      // 随机服装色（低饱和）与肤色
      clothCol.setHSL(0.02 + Math.random() * 0.95, 0.25 + Math.random() * 0.35, 0.32 + Math.random() * 0.28);
      skinCol.setHSL(0.07 + Math.random() * 0.04, 0.35 + Math.random() * 0.2, 0.45 + Math.random() * 0.2);
      this.clothMesh.setColorAt(i, tmp.copy(clothCol));
      this.skinMesh.setColorAt(i, tmp.copy(skinCol));
    }
    this.skinMesh.instanceMatrix.needsUpdate = true;
    this.clothMesh.instanceMatrix.needsUpdate = true;
    if (this.skinMesh.instanceColor) this.skinMesh.instanceColor.needsUpdate = true;
    if (this.clothMesh.instanceColor) this.clothMesh.instanceColor.needsUpdate = true;
    this.skinMesh.frustumCulled = false;
    this.clothMesh.frustumCulled = false;
    this.skinMesh.castShadow = false;
    this.clothMesh.castShadow = false;
    this.skinMesh.receiveShadow = false;
    this.clothMesh.receiveShadow = false;
    this.group.add(this.skinMesh, this.clothMesh);
  }

  setDayFactor(_d: number): void {
    // 行人由场景全局光照明，无需单独昼夜插值；保留接口以备需要
  }

  update(dt: number): void {
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    for (let i = 0; i < this.peds.length; i++) {
      const ped = this.peds[i];
      ped.phase += dt * ped.speed * 3;
      if (ped.axis === 'x') {
        ped.x += ped.dir * ped.speed * dt;
        if (ped.x > this.area.x1) { ped.x = this.area.x1; ped.dir *= -1; ped.face = -Math.PI / 2; }
        if (ped.x < this.area.x0) { ped.x = this.area.x0; ped.dir *= -1; ped.face = Math.PI / 2; }
      } else {
        ped.z += ped.dir * ped.speed * dt;
        if (ped.z > this.area.z1) { ped.z = this.area.z1; ped.dir *= -1; ped.face = Math.PI; }
        if (ped.z < this.area.z0) { ped.z = this.area.z0; ped.dir *= -1; ped.face = 0; }
      }
      const bob = Math.abs(Math.sin(ped.phase)) * 0.04 * ped.sc;
      p.set(ped.x, ped.y + bob, ped.z);
      q.setFromAxisAngle(this.Y, ped.face);
      s.set(ped.sc, ped.sc, ped.sc);
      m.compose(p, q, s);
      this.skinMesh.setMatrixAt(i, m);
      this.clothMesh.setMatrixAt(i, m);
    }
    this.skinMesh.instanceMatrix.needsUpdate = true;
    this.clothMesh.instanceMatrix.needsUpdate = true;
  }
}
