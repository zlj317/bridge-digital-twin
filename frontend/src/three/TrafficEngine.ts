import * as THREE from 'three';
import { COLORS, GEO } from '../config';
import type { Lane, VehicleState } from '../types';
import type { VehicleModel } from './AssetLoader';

interface VehicleRuntime extends VehicleState {
  /** 稀疏状态到达后的一次性柔性纠偏目标与剩余时间（秒） */
  correctT?: number;
  correctLeft?: number;
}

const MAX = 128;
const X_AXIS = new THREE.Vector3(1, 0, 0);
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const WHITE = new THREE.Color(0xffffff);
const HIGHLIGHT = new THREE.Color(COLORS.cyan);
const SHADES = [0xffffff, 0xe9eef6, 0xd6dfeb, 0xf1eee6, 0xcbd6e4].map(v => new THREE.Color(v));
const TAIL_NORMAL = new THREE.Color(0xff3a24);
const TAIL_BRAKE = new THREE.Color(0xffa257);

function hashVid(vid: string): number {
  let h = 0;
  for (let i = 0; i < vid.length; i++) h = (h * 31 + vid.charCodeAt(i)) >>> 0;
  return h;
}

/** 贴地水平面：长边沿桥轴 X，短边沿横向 Z */
function flatPlane(w: number, h: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** 灰度径向渐变 alphaMap：让贴地阴影 / 灯光边缘柔和消失，避免出现硬边矩形色块 */
function falloffTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.42, '#d0d0d0');
  g.addColorStop(0.72, '#585858');
  g.addColorStop(1, '#000000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** 文档 2.7.5 / TRA-002：InstancedMesh + CatmullRomCurve3。
 *  每种车型一个 InstancedMesh（一个 draw call），按 vid 稳定分配车型；几何均由 AssetLoader 整车合并。 */
export class TrafficEngine {
  readonly root = new THREE.Group();
  private curves = new Map<string, THREE.CatmullRomCurve3>();
  private readonly upLanes = new Set<string>();
  private vehicleMeshes: THREE.InstancedMesh[] = [];
  private trailMesh: THREE.InstancedMesh;
  private shadowMesh: THREE.InstancedMesh;
  private lampMesh: THREE.InstancedMesh;
  private tailMesh: THREE.InstancedMesh;
  private ids: string[][] = [];
  private trailIds: string[] = [];
  private vehicles: VehicleRuntime[] = [];
  private loadProgress = 1;
  private density = 62;
  private highlightVid: string | null = null;
  private fallbackMode = false;
  private lifts: number[] = [];
  private dayFactor = 0;
  private clipped = false;
  private prevSpeed = new Map<string, number>();

  constructor(lanes: Lane[], parts?: { vehicleModels?: VehicleModel[] }) {
    lanes.forEach(lane => {
      if (lane.direction === 'UP') this.upLanes.add(lane.laneCode);
      const pts = lane.curvePoints.map(p => new THREE.Vector3(p[0], p[1], p[2]));
      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1);
      curve.arcLengthDivisions = 2000;
      this.curves.set(lane.laneCode, curve);
    });

    const models = parts?.vehicleModels ?? [];
    if (models.length) {
      this.vehicleMeshes = models.map(({ geometry, material }) => new THREE.InstancedMesh(geometry, material, MAX));
      this.lifts = models.map(() => 0.22);
    } else {
      this.fallbackMode = true;
      const carMat = new THREE.MeshStandardMaterial({
        color: 0x7f9dc4, metalness: 0.55, roughness: 0.35, emissive: 0x123354, emissiveIntensity: 0.5,
      });
      const truckMat = new THREE.MeshStandardMaterial({
        color: 0x9aa8bb, metalness: 0.4, roughness: 0.5, emissive: 0x2a2410, emissiveIntensity: 0.45,
      });
      this.vehicleMeshes = [
        new THREE.InstancedMesh(new THREE.BoxGeometry(4.6, 1.5, 1.9), carMat, MAX),
        new THREE.InstancedMesh(new THREE.BoxGeometry(9.5, 3.4, 2.5), truckMat, MAX),
      ];
      this.lifts = [1.5 / 2 + 0.2, 3.4 / 2 + 0.2];
    }

    const trailMat = new THREE.MeshBasicMaterial({
      color: COLORS.orange, transparent: true, opacity: 0.1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.trailMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(3.2, 0.08, 1.2), trailMat, MAX);

    // 贴地材质共用软边 alphaMap，且用 polygonOffset 避免与桥面 / 箱梁内部 z-fighting
    const ground = {
      alphaMap: falloffTexture(), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    };
    // 车下接触阴影：软椭圆，白天略深、夜间更淡
    this.shadowMesh = new THREE.InstancedMesh(
      flatPlane(6.4, 3.0),
      new THREE.MeshBasicMaterial({ ...ground, color: 0x05080e, opacity: 0.24 }),
      MAX,
    );
    // 前灯照在路面上的暖色光斑：普通半透明混合，避免 Additive 在浅色剖切面上过曝成白块
    this.lampMesh = new THREE.InstancedMesh(
      flatPlane(8.5, 3.2),
      new THREE.MeshBasicMaterial({ ...ground, color: 0xffca82, opacity: 0.13 }),
      MAX,
    );
    // 尾灯：始终位于行驶方向的反侧，不依赖 GLB 车头朝向
    this.tailMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.24, 0.16, 1.5),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
      MAX,
    );
    const extras = [this.shadowMesh, this.lampMesh, this.tailMesh];
    extras.forEach((m, i) => { m.renderOrder = i + 1; });

    const pickables = [...this.vehicleMeshes, this.trailMesh];
    [...pickables, ...extras].forEach(m => {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      this.root.add(m);
    });
    // 只有车身 / 拖尾参与射线拾取，灯光与阴影贴片不拦截点击
    pickables.forEach(m => { m.userData.pickKind = 'vehicle'; });

    this.ids = this.vehicleMeshes.map(() => []);
    for (let i = 0; i < MAX; i++) {
      this.vehicleMeshes.forEach(m => m.setColorAt(i, WHITE));
      this.tailMesh.setColorAt(i, TAIL_NORMAL);
    }
    this.setDayFactor(0);
  }

  get pickables(): THREE.Object3D[] { return [...this.vehicleMeshes, this.trailMesh]; }

  /** 车身既投影也接收桥塔 / 拉索的阴影；贴地阴影与灯光贴片不进阴影 pass */
  get shadowCasters(): THREE.Object3D[] { return this.vehicleMeshes; }

  /** MQTT 稀疏状态（每秒一次）：位置由前端本地匀速外推，只在到达后短时柔性纠偏 */
  setSnapshot(list: VehicleState[]): void {
    const prev = new Map(this.vehicles.map(v => [v.vid, v]));
    // 按行驶方向交错排列：加载动画按数组前缀渐入时，双向车流也会同时出现
    const up: VehicleState[] = [];
    const down: VehicleState[] = [];
    list.forEach(v => (this.upLanes.has(v.lane) ? up : down).push(v));
    const interleaved: VehicleState[] = [];
    for (let i = 0; i < Math.max(up.length, down.length); i++) {
      if (up[i]) interleaved.push(up[i]);
      if (down[i]) interleaved.push(down[i]);
    }
    this.vehicles = interleaved.map(v => {
      const old = prev.get(v.vid);
      if (!old) return { ...v };
      return { ...v, t: old.t, correctT: v.t, correctLeft: 0.45 };
    });
    // 车辆离场后同步清理速度历史，避免 vid 递增导致 Map 无限增长
    const alive = new Set(this.vehicles.map(v => v.vid));
    this.prevSpeed.forEach((_s, vid) => { if (!alive.has(vid)) this.prevSpeed.delete(vid); });
  }

  setDensity(pct: number): void { this.density = pct; }

  /** 剖切（结构透视）时桥面被裁开，隐藏车下贴地阴影/灯光，避免出现悬空的浅色块 */
  setClipped(v: boolean): void { this.clipped = v; }

  /** 幕三 0→车辆渐入 */
  setLoadProgress(p: number): void { this.loadProgress = Math.max(0, Math.min(1, p)); }

  setHighlight(vid: string | null): void { this.highlightVid = vid; }

  /** 昼夜联动：白天关闭发光拖尾与灯光，夜间恢复车灯 / 尾灯 / 桥侧辉光 */
  setDayFactor(f: number): void {
    this.dayFactor = Math.max(0, Math.min(1, f));
    const night = 1 - this.dayFactor;
    (this.shadowMesh.material as THREE.MeshBasicMaterial).opacity = 0.10 + 0.16 * this.dayFactor;
    (this.lampMesh.material as THREE.MeshBasicMaterial).opacity = 0.13 * night;
    (this.tailMesh.material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.72 * night;
    (this.trailMesh.material as THREE.MeshBasicMaterial).opacity = 0.012 + 0.09 * night;
    this.vehicleMeshes.forEach(m => {
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat.emissiveIntensity !== undefined) {
        mat.emissiveIntensity = this.fallbackMode ? 0.1 + 0.4 * night : 0.02 + 0.18 * night;
      }
    });
  }

  getVehicle(vid: string): VehicleState | undefined { return this.vehicles.find(v => v.vid === vid); }

  pickVehicle(mesh: THREE.Object3D, instanceId: number): string | null {
    const i = this.vehicleMeshes.indexOf(mesh as THREE.InstancedMesh);
    if (i >= 0) return this.ids[i][instanceId] ?? null;
    if (mesh === this.trailMesh) return this.trailIds[instanceId] ?? null;
    return null;
  }

  update(dt: number): void {
    const base = Math.max(0, Math.min(MAX, this.vehicles.length));
    const count = Math.round(base * this.loadProgress);
    const counts = this.vehicleMeshes.map(() => 0);
    this.ids = this.vehicleMeshes.map(() => []);
    this.trailIds = [];
    let trailIndex = 0;

    for (let i = 0; i < count; i++) {
      const v = this.vehicles[i];
      const curve = this.curves.get(v.lane);
      if (!curve) continue;
      v.t += (v.speed / 3.6 / GEO.length) * dt;
      // 纠偏仅在稀疏报文到达后的 0.45s 内生效；此前 targetT 从不清空，
      // 会把车持续往一秒前的旧位置回拉，造成顿挫、聚集和前后重叠。
      if (v.correctT !== undefined && (v.correctLeft ?? 0) > 0) {
        let d = v.correctT - v.t;
        if (d > 0.5) d -= 1;
        if (d < -0.5) d += 1;
        v.t += d * Math.min(1, dt / Math.max(0.001, v.correctLeft!));
        v.correctLeft = Math.max(0, v.correctLeft! - dt);
        if (v.correctLeft === 0) delete v.correctT;
      }
      if (v.t > 1) v.t -= 1;
      if (v.t < 0) v.t += 1;

      const point = curve.getPointAt(Math.min(0.9999, Math.max(0.0001, v.t)));
      const tangent = curve.getTangentAt(Math.min(0.9999, Math.max(0.0001, v.t))).normalize();
      _q.setFromUnitVectors(X_AXIS, tangent);
      const k = this.fallbackMode
        ? (v.type === 'TRUCK' ? 1 : 0)
        : hashVid(v.vid) % this.vehicleMeshes.length;
      _p.set(point.x, point.y + this.lifts[k], point.z);
      _m.compose(_p, _q, _s);
      const mesh = this.vehicleMeshes[k];
      const idx = counts[k]++;
      mesh.setMatrixAt(idx, _m);
      mesh.setColorAt(idx, v.vid === this.highlightVid ? HIGHLIGHT : SHADES[hashVid(v.vid) % SHADES.length]);
      this.ids[k].push(v.vid);

      // 车后短拖尾（贴近桥面，弱发光）
      _p.copy(point).addScaledVector(tangent, -2.6);
      _p.y += 0.06;
      _m.compose(_p, _q, _s);
      this.trailMesh.setMatrixAt(trailIndex, _m);
      this.trailIds.push(v.vid);

      // 接触阴影贴地
      _p.set(point.x, point.y + 0.05, point.z);
      _m.compose(_p, _q, _s);
      this.shadowMesh.setMatrixAt(trailIndex, _m);
      // 前灯照地光斑
      _p.copy(point).addScaledVector(tangent, 3.2);
      _p.y += 0.07;
      _m.compose(_p, _q, _s);
      this.lampMesh.setMatrixAt(trailIndex, _m);
      // 尾灯条
      _p.copy(point).addScaledVector(tangent, -2.35);
      _p.y += 0.78;
      _m.compose(_p, _q, _s);
      this.tailMesh.setMatrixAt(trailIndex, _m);
      // 跟驰降速时尾灯转为高亮刹车色，让车流状态可直接被看见
      const prev = this.prevSpeed.get(v.vid);
      const braking = prev !== undefined && v.speed < prev - 0.4;
      this.prevSpeed.set(v.vid, v.speed);
      this.tailMesh.setColorAt(trailIndex, braking ? TAIL_BRAKE : TAIL_NORMAL);
      trailIndex++;
    }

    this.vehicleMeshes.forEach((m, k) => { m.count = counts[k]; });
    // 极低车流密度下关闭发光拖尾，避免稀疏场景里出现无意义的橙色残影
    this.trailMesh.count = this.density > 5 ? trailIndex : 0;
    [this.shadowMesh, this.lampMesh, this.tailMesh].forEach(m => { m.count = trailIndex; });
    this.shadowMesh.visible = !this.clipped;
    this.lampMesh.visible = !this.clipped;
    [...this.vehicleMeshes, this.trailMesh, this.shadowMesh, this.lampMesh, this.tailMesh]
      .forEach(m => { m.instanceMatrix.needsUpdate = true; });
    this.vehicleMeshes.forEach(m => { if (m.instanceColor) m.instanceColor.needsUpdate = true; });
    if (this.tailMesh.instanceColor) this.tailMesh.instanceColor.needsUpdate = true;
  }
}
