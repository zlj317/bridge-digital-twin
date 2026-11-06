import * as THREE from 'three';
import { COLORS, GEO } from '../config';
import type { Lane, VehicleState } from '../types';

interface VehicleRuntime extends VehicleState { targetT?: number }

const MAX = 64;
const X_AXIS = new THREE.Vector3(1, 0, 0);
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const WHITE = new THREE.Color(0xffffff);
const HIGHLIGHT = new THREE.Color(COLORS.cyan);

/** 文档 2.7.5 / TRA-002：InstancedMesh + CatmullRomCurve3，DrawCall ≤ 4 */
export class TrafficEngine {
  readonly root = new THREE.Group();
  private curves = new Map<string, THREE.CatmullRomCurve3>();
  private carMesh: THREE.InstancedMesh;
  private truckMesh: THREE.InstancedMesh;
  private trailMesh: THREE.InstancedMesh;
  private carIds: string[] = [];
  private truckIds: string[] = [];
  private trailIds: string[] = [];
  private vehicles: VehicleRuntime[] = [];
  private loadProgress = 1;
  private density = 62;
  private highlightVid: string | null = null;

  constructor(lanes: Lane[], parts?: { carGeometry?: THREE.BufferGeometry; truckGeometry?: THREE.BufferGeometry }) {
    lanes.forEach(lane => {
      const pts = lane.curvePoints.map(p => new THREE.Vector3(p[0], p[1], p[2]));
      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1);
      curve.arcLengthDivisions = 2000;
      this.curves.set(lane.laneCode, curve);
    });

    const carMat = new THREE.MeshStandardMaterial({
      color: 0x7f9dc4, metalness: 0.55, roughness: 0.35, emissive: 0x123354, emissiveIntensity: 0.5,
    });
    const truckMat = new THREE.MeshStandardMaterial({
      color: 0x9aa8bb, metalness: 0.4, roughness: 0.5, emissive: 0x2a2410, emissiveIntensity: 0.45,
    });
    const trailMat = new THREE.MeshBasicMaterial({
      color: COLORS.orange, transparent: true, opacity: 0.18,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const carGeo = parts?.carGeometry ?? new THREE.BoxGeometry(4.6, 1.5, 1.9);
    const truckGeo = parts?.truckGeometry ?? new THREE.BoxGeometry(9.5, 3.4, 2.5);
    this.carMesh = new THREE.InstancedMesh(carGeo, carMat, MAX);
    this.truckMesh = new THREE.InstancedMesh(truckGeo, truckMat, MAX);
    this.trailMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(8, 0.15, 1.6), trailMat, MAX);
    [this.carMesh, this.truckMesh, this.trailMesh].forEach(m => {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      this.root.add(m);
    });
    this.carMesh.userData.pickKind = 'vehicle';
    this.truckMesh.userData.pickKind = 'vehicle';
    this.trailMesh.userData.pickKind = 'vehicle';
    for (let i = 0; i < MAX; i++) {
      this.carMesh.setColorAt(i, WHITE);
      this.truckMesh.setColorAt(i, WHITE);
    }
  }

  /** MQTT 稀疏状态（每秒一次），位置由前端本地插补，带宽降低 90% */
  setSnapshot(list: VehicleState[]): void {
    const prev = new Map(this.vehicles.map(v => [v.vid, v]));
    this.vehicles = list.map(v => {
      const old = prev.get(v.vid);
      return old ? { ...v, t: old.t, targetT: v.t } : { ...v, targetT: v.t };
    });
  }

  setDensity(pct: number): void { this.density = pct; }

  /** 幕三 0→36 台渐入 */
  setLoadProgress(p: number): void { this.loadProgress = Math.max(0, Math.min(1, p)); }

  setHighlight(vid: string | null): void { this.highlightVid = vid; }

  getVehicle(vid: string): VehicleState | undefined { return this.vehicles.find(v => v.vid === vid); }

  pickVehicle(mesh: THREE.Object3D, instanceId: number): string | null {
    if (mesh === this.carMesh) return this.carIds[instanceId] ?? null;
    if (mesh === this.truckMesh) return this.truckIds[instanceId] ?? null;
    if (mesh === this.trailMesh) return this.trailIds[instanceId] ?? null;
    return null;
  }

  update(dt: number): void {
    const base = Math.max(0, Math.min(MAX, this.vehicles.length));
    const count = Math.round(base * this.loadProgress * (0.92 + (this.density / 100) * 0.08));
    const cars: VehicleRuntime[] = [];
    const trucks: VehicleRuntime[] = [];
    this.carIds = [];
    this.truckIds = [];
    this.trailIds = [];
    let trailIndex = 0;

    for (let i = 0; i < count; i++) {
      const v = this.vehicles[i];
      const curve = this.curves.get(v.lane);
      if (!curve) continue;
      v.t += (v.speed / 3.6 / GEO.length) * dt;
      if (v.targetT !== undefined) {
        let d = v.targetT - v.t;
        if (d > 0.5) d -= 1;
        if (d < -0.5) d += 1;
        v.t += d * Math.min(1, dt * 3);
      }
      if (v.t > 1) v.t -= 1;
      if (v.t < 0) v.t += 1;

      const point = curve.getPointAt(Math.min(0.9999, Math.max(0.0001, v.t)));
      const tangent = curve.getTangentAt(Math.min(0.9999, Math.max(0.0001, v.t))).normalize();
      _q.setFromUnitVectors(X_AXIS, tangent);
      const isTruck = v.type === 'TRUCK';
      const h = isTruck ? 3.4 : 1.5;
      _p.set(point.x, point.y + h / 2 + 0.2, point.z);
      _m.compose(_p, _q, _s);
      if (isTruck) {
        const idx = trucks.length;
        this.truckMesh.setMatrixAt(idx, _m);
        this.truckMesh.setColorAt(idx, v.vid === this.highlightVid ? HIGHLIGHT : WHITE);
        this.truckIds.push(v.vid);
        trucks.push(v);
      } else {
        const idx = cars.length;
        this.carMesh.setMatrixAt(idx, _m);
        this.carMesh.setColorAt(idx, v.vid === this.highlightVid ? HIGHLIGHT : WHITE);
        this.carIds.push(v.vid);
        cars.push(v);
      }
      // 车后 8m 半透明拖尾
      _p.copy(point).addScaledVector(tangent, -6);
      _p.y += 0.1;
      _m.compose(_p, _q, _s);
      this.trailMesh.setMatrixAt(trailIndex++, _m);
      this.trailIds.push(v.vid);
    }

    this.carMesh.count = cars.length;
    this.truckMesh.count = trucks.length;
    this.trailMesh.count = trailIndex;
    [this.carMesh, this.truckMesh, this.trailMesh].forEach(m => { m.instanceMatrix.needsUpdate = true; });
    if (this.carMesh.instanceColor) this.carMesh.instanceColor.needsUpdate = true;
    if (this.truckMesh.instanceColor) this.truckMesh.instanceColor.needsUpdate = true;
  }
}
