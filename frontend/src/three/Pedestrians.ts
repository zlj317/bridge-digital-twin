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
 * 肢体几何：把杆件的上端（肩 / 髋）放在局部原点，向下延伸 len；
 * 这样实例矩阵绕该原点旋转时，肢体就是「以肩 / 髋为轴摆动」，而不是绕脚平移。
 */
function makeLimb(sideX: number, w: number, len: number, d: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, len, d);
  g.translate(sideX, -len / 2, 0); // 顶端落在 y=0（肩 / 髋）
  return g.toNonIndexed();
}

/**
 * 站立人体，分成 6 组几何：皮肤（头 + 手）、躯干、左/右臂、左/右腿。
 * 四肢以肩 / 髋为枢轴，可逐帧绕 X 轴摆动做真实步态。
 * 脚底 y=0，总高约 1.78m，头较小、躯干修长，比例贴近真实成人（解决「太矮/像玩具」）。
 */
export function buildHumanoid(): {
  skin: THREE.BufferGeometry; torso: THREE.BufferGeometry;
  armL: THREE.BufferGeometry; armR: THREE.BufferGeometry;
  legL: THREE.BufferGeometry; legR: THREE.BufferGeometry;
} {
  const skin = mergeNonIndexed([
    part(new THREE.SphereGeometry(0.11, 12, 10), 0, 1.66, 0),        // 头
    part(new THREE.SphereGeometry(0.05, 6, 5), 0.24, 1.06, 0.05),   // 右手
    part(new THREE.SphereGeometry(0.05, 6, 5), -0.24, 1.06, 0.05),  // 左手
  ]);
  const torso = part(new THREE.BoxGeometry(0.38, 0.62, 0.23), 0, 1.18, 0);
  // 肩高 ~1.46，髋高 ~0.92（局部坐标，随实例缩放）
  const armR = makeLimb(0.24, 0.11, 0.50, 0.13);
  const armL = makeLimb(-0.24, 0.11, 0.50, 0.13);
  const legR = makeLimb(0.11, 0.16, 0.92, 0.19);
  const legL = makeLimb(-0.11, 0.16, 0.92, 0.19);
  return { skin, torso, armL, armR, legL, legR };
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

const SHOULDER_Y = 1.46;
const HIP_Y = 0.92;

/**
 * 实例化行人系统：皮肤 / 躯干 / 四肢共 6 个 InstancedMesh。
 * 逐帧沿街道行走，四肢以肩 / 髋为轴反相摆动（对侧手脚同相），并随步频上下起伏与轻微前倾，
 * 解决「动作僵」；衣物用随机服装色、皮肤用随机肤色（instanceColor），避免「复制人」塑料感。
 */
export class PedestrianSystem {
  readonly group = new THREE.Group();
  private skinMesh: THREE.InstancedMesh;
  private torsoMesh: THREE.InstancedMesh;
  private armLMesh: THREE.InstancedMesh;
  private armRMesh: THREE.InstancedMesh;
  private legLMesh: THREE.InstancedMesh;
  private legRMesh: THREE.InstancedMesh;
  private peds: Ped[] = [];
  private readonly area: PedestrianArea;
  private readonly skinMat: THREE.MeshStandardMaterial;
  private readonly clothMat: THREE.MeshStandardMaterial;
  private readonly Y = new THREE.Vector3(0, 1, 0);
  private readonly _lean = new THREE.Matrix4();

  constructor(
    human: {
      skin: THREE.BufferGeometry; torso: THREE.BufferGeometry;
      armL: THREE.BufferGeometry; armR: THREE.BufferGeometry;
      legL: THREE.BufferGeometry; legR: THREE.BufferGeometry;
    },
    opts: PedestrianOptions,
  ) {
    this.area = opts.area;
    this.skinMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0 });
    this.clothMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
    const mk = (geo: THREE.BufferGeometry) => new THREE.InstancedMesh(geo, this.clothMat, opts.count);
    this.skinMesh = new THREE.InstancedMesh(human.skin, this.skinMat, opts.count);
    this.torsoMesh = mk(human.torso);
    this.armLMesh = mk(human.armL);
    this.armRMesh = mk(human.armR);
    this.legLMesh = mk(human.legL);
    this.legRMesh = mk(human.legR);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const skinCol = new THREE.Color();
    const clothCol = new THREE.Color();
    const tmp = new THREE.Color();
    const speed = opts.speed ?? [0.6, 1.6];
    const scale = opts.scale ?? [0.98, 1.12];

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
      this.torsoMesh.setMatrixAt(i, m);
      this.armLMesh.setMatrixAt(i, m);
      this.armRMesh.setMatrixAt(i, m);
      this.legLMesh.setMatrixAt(i, m);
      this.legRMesh.setMatrixAt(i, m);
      // 随机服装色（低饱和）+ 肤色；衣物各部件同色，皮肤单独着色
      clothCol.setHSL(0.02 + Math.random() * 0.95, 0.22 + Math.random() * 0.33, 0.30 + Math.random() * 0.26);
      skinCol.setHSL(0.07 + Math.random() * 0.04, 0.35 + Math.random() * 0.2, 0.42 + Math.random() * 0.2);
      this.torsoMesh.setColorAt(i, tmp.copy(clothCol));
      this.armLMesh.setColorAt(i, tmp.copy(clothCol));
      this.armRMesh.setColorAt(i, tmp.copy(clothCol));
      this.legLMesh.setColorAt(i, tmp.copy(clothCol));
      this.legRMesh.setColorAt(i, tmp.copy(clothCol));
      this.skinMesh.setColorAt(i, tmp.copy(skinCol));
    }
    [this.skinMesh, this.torsoMesh, this.armLMesh, this.armRMesh, this.legLMesh, this.legRMesh]
      .forEach(mesh => {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      });
    this.group.add(this.skinMesh, this.torsoMesh, this.armLMesh, this.armRMesh, this.legLMesh, this.legRMesh);
  }

  setDayFactor(_d: number): void {
    // 行人由场景全局光照明，无需单独昼夜插值；保留接口以备需要
  }

  update(dt: number): void {
    const body = new THREE.Matrix4();
    const limb = new THREE.Matrix4();
    const pivot = new THREE.Matrix4();
    const swing = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();

    for (let i = 0; i < this.peds.length; i++) {
      const ped = this.peds[i];
      // 步频：腿每步摆动一次，phase 推进速度随步速
      ped.phase += dt * ped.speed * 3.4;
      if (ped.axis === 'x') {
        ped.x += ped.dir * ped.speed * dt;
        if (ped.x > this.area.x1) { ped.x = this.area.x1; ped.dir *= -1; ped.face = -Math.PI / 2; }
        if (ped.x < this.area.x0) { ped.x = this.area.x0; ped.dir *= -1; ped.face = Math.PI / 2; }
      } else {
        ped.z += ped.dir * ped.speed * dt;
        if (ped.z > this.area.z1) { ped.z = this.area.z1; ped.dir *= -1; ped.face = Math.PI; }
        if (ped.z < this.area.z0) { ped.z = this.area.z0; ped.dir *= -1; ped.face = 0; }
      }
      const ph = ped.phase;
      const legSwing = Math.sin(ph) * 0.5;          // 左腿前摆时右腿后摆
      const armSwing = Math.sin(ph + Math.PI) * 0.42; // 手臂与同侧腿反相
      const lean = Math.sin(ph) * 0.05;             // 随步轻微前倾
      const bob = Math.abs(Math.sin(ph)) * 0.035 * ped.sc;
      p.set(ped.x, ped.y + bob, ped.z);
      q.setFromAxisAngle(this.Y, ped.face);
      s.set(ped.sc, ped.sc, ped.sc);
      body.compose(p, q, s);

      // 躯干 + 皮肤随身体前倾
      this._lean.makeRotationX(lean);
      limb.copy(body).multiply(this._lean);
      this.torsoMesh.setMatrixAt(i, limb);
      this.skinMesh.setMatrixAt(i, limb);

      // 四肢：绕肩 / 髋枢轴摆动（对侧反相）
      pivot.makeTranslation(0, SHOULDER_Y, 0);
      swing.makeRotationX(armSwing);
      limb.copy(body).multiply(pivot).multiply(swing);
      this.armRMesh.setMatrixAt(i, limb);
      pivot.makeTranslation(0, SHOULDER_Y, 0);
      swing.makeRotationX(-armSwing);
      limb.copy(body).multiply(pivot).multiply(swing);
      this.armLMesh.setMatrixAt(i, limb);

      pivot.makeTranslation(0, HIP_Y, 0);
      swing.makeRotationX(legSwing);
      limb.copy(body).multiply(pivot).multiply(swing);
      this.legRMesh.setMatrixAt(i, limb);
      pivot.makeTranslation(0, HIP_Y, 0);
      swing.makeRotationX(-legSwing);
      limb.copy(body).multiply(pivot).multiply(swing);
      this.legLMesh.setMatrixAt(i, limb);
    }
    [this.skinMesh, this.torsoMesh, this.armLMesh, this.armRMesh, this.legLMesh, this.legRMesh]
      .forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; });
  }
}
