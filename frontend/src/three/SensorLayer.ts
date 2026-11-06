import * as THREE from 'three';
import { COLORS } from '../config';
import type { PointLevel, RealtimePoint, ShmPoint } from '../types';

const LEVEL_COLOR: Record<PointLevel, number> = {
  NORMAL: COLORS.orange, WARN: COLORS.warnYellow, ALARM: COLORS.red,
};
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

/** 文档 2.7.4 / VIS-010：橙球 + 光晕 + 垂直虚线，三态颜色与闪烁频率不同 */
export class SensorLayer {
  readonly root = new THREE.Group();
  private dots: THREE.InstancedMesh;
  private halos: THREE.Points;
  private lines: THREE.LineSegments;
  private ripples: THREE.InstancedMesh;
  private dotMat: THREE.MeshBasicMaterial;
  private haloMat: THREE.PointsMaterial;
  private lineMat: THREE.LineBasicMaterial;
  private rippleMat: THREE.MeshBasicMaterial;
  private positions: THREE.Vector3[] = [];
  private indexByCode = new Map<string, number>();
  private codeByIndex: string[] = [];
  private levels: PointLevel[] = [];
  private flashUntil = new Map<string, number>();
  private reveal = 0;

  constructor(points: ShmPoint[]) {
    const n = points.length;
    this.positions = points.map(p => new THREE.Vector3(p.pos.x, p.pos.y, p.pos.z));
    this.codeByIndex = points.map(p => p.pointCode);
    points.forEach((p, i) => this.indexByCode.set(p.pointCode, i));
    this.levels = points.map(() => 'NORMAL');

    this.dotMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
    });
    this.dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.35, 8, 6), this.dotMat, n);
    this.dots.frustumCulled = false;
    this.dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dots.userData.pickKind = 'sensor';
    this.dots.userData.pickCodes = this.codeByIndex;

    const haloPos = new Float32Array(n * 3);
    const haloColor = new Float32Array(n * 3);
    points.forEach((p, i) => {
      haloPos.set([p.pos.x, p.pos.y, p.pos.z], i * 3);
      const c = new THREE.Color(LEVEL_COLOR.NORMAL);
      haloColor.set([c.r, c.g, c.b], i * 3);
      this.dots.setColorAt(i, c);
      _m.compose(_p.set(p.pos.x, p.pos.y, p.pos.z), _q.identity(), _s.set(1, 1, 1));
      this.dots.setMatrixAt(i, _m);
    });
    this.dots.instanceMatrix.needsUpdate = true;
    if (this.dots.instanceColor) this.dots.instanceColor.needsUpdate = true;
    const haloGeo = new THREE.BufferGeometry();
    haloGeo.setAttribute('position', new THREE.BufferAttribute(haloPos, 3));
    haloGeo.setAttribute('color', new THREE.BufferAttribute(haloColor, 3));
    this.haloMat = new THREE.PointsMaterial({
      size: 9, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.halos = new THREE.Points(haloGeo, this.haloMat);
    this.halos.frustumCulled = false;
    this.halos.userData.pickKind = 'sensor';
    this.halos.userData.pickCodes = this.codeByIndex;

    // 每点 4 段垂直虚线，长 4m
    const lineData: number[] = [];
    this.positions.forEach(p => {
      for (let k = 0; k < 4; k++) {
        const y1 = p.y - 0.6 - k;
        lineData.push(p.x, y1, p.z, p.x, y1 - 0.5, p.z);
      }
    });
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lineData, 3));
    this.lineMat = new THREE.LineBasicMaterial({
      color: COLORS.orange, transparent: true, opacity: 0, depthWrite: false,
    });
    this.lines = new THREE.LineSegments(lineGeo, this.lineMat);
    this.lines.frustumCulled = false;

    this.rippleMat = new THREE.MeshBasicMaterial({
      color: COLORS.red, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.ripples = new THREE.InstancedMesh(new THREE.RingGeometry(0.42, 0.6, 20), this.rippleMat, n);
    this.ripples.frustumCulled = false;
    this.ripples.count = 0;
    this.ripples.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this.root.add(this.dots, this.halos, this.lines, this.ripples);
  }

  apply(points: RealtimePoint[]): void {
    const colors = this.halos.geometry.getAttribute('color') as THREE.BufferAttribute;
    points.forEach(rt => {
      const i = this.indexByCode.get(rt.pointCode);
      if (i === undefined) return;
      this.levels[i] = rt.level;
      const c = new THREE.Color(LEVEL_COLOR[rt.level]);
      colors.setXYZ(i, c.r, c.g, c.b);
      this.dots.setColorAt(i, c);
    });
    colors.needsUpdate = true;
    if (this.dots.instanceColor) this.dots.instanceColor.needsUpdate = true;
  }

  setReveal(p: number): void { this.reveal = Math.max(0, Math.min(1, p)); }

  flash(pointCode: string): void { this.flashUntil.set(pointCode, performance.now() + 1600); }

  pick(instanceId: number): string | null { return this.codeByIndex[instanceId] ?? null; }

  update(_dt: number, elapsed: number): void {
    const now = performance.now();
    this.dotMat.opacity = this.reveal;
    this.haloMat.opacity = 0.65 * this.reveal;
    this.lineMat.opacity = 0.4 * this.reveal;
    this.rippleMat.opacity = 0.7 * this.reveal;
    this.root.visible = this.reveal > 0.01;
    if (!this.root.visible) return;

    let ripples = 0;
    for (let i = 0; i < this.levels.length; i++) {
      const level = this.levels[i];
      const period = level === 'ALARM' ? 0.5 : level === 'WARN' ? 1.2 : 2.4;
      const wave = 0.6 + 0.4 * Math.sin((elapsed * Math.PI * 2) / period);
      const flashing = (this.flashUntil.get(this.codeByIndex[i]) ?? 0) > now;
      const scale = (flashing ? 1.5 : 1) * (0.85 + 0.15 * wave);
      _m.compose(this.positions[i], _q.identity(), _s.set(scale, scale, scale));
      this.dots.setMatrixAt(i, _m);
      if (level === 'ALARM') {
        const r = 1 + ((elapsed * 2) % 1) * 3;
        _m.compose(this.positions[i], FLAT, _s.set(r, r, r));
        this.ripples.setMatrixAt(ripples++, _m);
      }
    }
    this.dots.instanceMatrix.needsUpdate = true;
    this.ripples.count = ripples;
    if (ripples > 0) this.ripples.instanceMatrix.needsUpdate = true;
  }
}
