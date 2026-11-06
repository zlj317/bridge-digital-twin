import * as THREE from 'three';
import { COLORS, GEO } from '../config';

const easeInOutCubic = (p: number) => p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/** 文档 2.7.7 / VIS-006：ClippingPlane 只作用于箱梁外壳，剖切边缘青色描边 */
export class ClippingController {
  readonly plane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 430);
  private edge: THREE.LineSegments;
  private edgeMat: THREE.LineBasicMaterial;
  private enabled = false;
  private lastEnabled = false;
  private progress = 0;
  private direction: 'AXIAL' | 'CROSS' = 'AXIAL';
  private anim: { from: number; to: number; elapsed: number; duration: number } | null = null;

  constructor(private readonly materials: THREE.Material[]) {
    this.edgeMat = new THREE.LineBasicMaterial({
      color: COLORS.cyan, transparent: true, opacity: 0, depthWrite: false,
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(24), 3));
    this.edge = new THREE.LineSegments(geo, this.edgeMat);
    this.edge.frustumCulled = false;
    this.edge.renderOrder = 5;
  }

  get object(): THREE.Object3D { return this.edge; }

  setDirection(dir: 'AXIAL' | 'CROSS'): void {
    this.direction = dir;
    this.apply();
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    this.apply();
  }

  /** 滑块实时控制 */
  setProgress(p: number): void {
    this.anim = null;
    this.progress = Math.max(0, Math.min(1, p));
    this.apply();
  }

  /** 开关剖切：2.2s easeInOutCubic 推进 */
  animateTo(p: number, duration = 2200): void {
    this.anim = { from: this.progress, to: Math.max(0, Math.min(1, p)), elapsed: 0, duration };
    this.enabled = p > 0;
    this.apply();
  }

  private apply(): void {
    const c = this.direction === 'AXIAL'
      ? lerp(GEO.halfLength + 10, 20, this.progress)
      : lerp(GEO.halfDeck + 8, 0, this.progress);
    this.plane.normal.set(this.direction === 'AXIAL' ? -1 : 0, 0, this.direction === 'AXIAL' ? 0 : -1);
    this.plane.constant = c;
    if (this.enabled !== this.lastEnabled) {
      this.materials.forEach(m => {
        m.clippingPlanes = this.enabled ? [this.plane] : null;
        m.clipIntersection = false;
        m.needsUpdate = true;
      });
      this.lastEnabled = this.enabled;
    }
    this.updateEdge(c);
  }

  private updateEdge(c: number): void {
    const pos = this.edge.geometry.getAttribute('position') as THREE.BufferAttribute;
    const y0 = GEO.girderBottomY, y1 = GEO.girderTopY;
    const axial = this.direction === 'AXIAL';
    const x0 = axial ? c : -120, x1 = axial ? c : 120;
    const z0 = axial ? -GEO.halfDeck : c, z1 = axial ? GEO.halfDeck : c;
    const corners: [number, number, number][] = [
      [x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0],
    ];
    let k = 0;
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      pos.setXYZ(k++, a[0], a[1], a[2]);
      pos.setXYZ(k++, b[0], b[1], b[2]);
    }
    pos.needsUpdate = true;
    this.edgeMat.opacity = 0.9 * this.progress * (this.enabled ? 1 : 0);
    this.edge.visible = this.edgeMat.opacity > 0.01;
  }

  update(dt: number): void {
    if (!this.anim) return;
    const a = this.anim;
    a.elapsed += dt;
    const p = Math.min(1, a.elapsed / a.duration);
    this.progress = lerp(a.from, a.to, easeInOutCubic(p));
    this.apply();
    if (p >= 1) this.anim = null;
  }
}
