import * as THREE from 'three';
import { COLORS, GEO } from '../config';

const easeInOutCubic = (p: number) => p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/** 文档 2.7.7 / VIS-006：ClippingPlane 只作用于箱梁外壳，剖切边缘青色描边 */
export class ClippingController {
  readonly plane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 430);
  private group = new THREE.Group();
  private edge: THREE.LineSegments;
  private edgeMat: THREE.LineBasicMaterial;
  private section = new THREE.Group();
  private faceMat: THREE.MeshBasicMaterial;
  private gridMat: THREE.LineBasicMaterial;
  private enabled = false;
  private lastEnabled = false;
  private progress = 0;
  private direction: 'AXIAL' | 'CROSS' = 'AXIAL';
  private anim: { from: number; to: number; elapsed: number; duration: number } | null = null;

  constructor(private readonly materials: THREE.Material[]) {
    this.edgeMat = new THREE.LineBasicMaterial({
      color: COLORS.cyan, transparent: true, opacity: 0, depthWrite: false,
    });
    // 20 段折线 × 2 端点 × 3 分量：箱梁外轮廓 + 3 个箱室轮廓，按 drawRange 复用同一缓冲
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(120), 3));
    geo.setDrawRange(0, 0);
    this.edge = new THREE.LineSegments(geo, this.edgeMat);
    this.edge.frustumCulled = false;
    this.edge.renderOrder = 5;

    // 剖切断面反馈：淡青色切面 + 刻度网格，让「切开了」这件事在 3D 里可见
    this.faceMat = new THREE.MeshBasicMaterial({
      color: COLORS.cyan, transparent: true, opacity: 0, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.faceMat);
    face.renderOrder = 4;
    this.gridMat = new THREE.LineBasicMaterial({
      color: COLORS.cyan, transparent: true, opacity: 0, depthWrite: false,
    });
    const lines: number[] = [];
    for (let i = 1; i < 8; i++) {
      const u = -0.5 + i / 8;
      lines.push(u, -0.5, 0, u, 0.5, 0);
    }
    for (let i = 1; i < 4; i++) {
      const v = -0.5 + i / 4;
      lines.push(-0.5, v, 0, 0.5, v, 0);
    }
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    const grid = new THREE.LineSegments(gridGeo, this.gridMat);
    grid.renderOrder = 5;
    this.section.add(face, grid);
    this.group.add(this.section, this.edge);
  }

  get object(): THREE.Object3D { return this.group; }

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
        // 阴影 pass 同步按同一平面裁剪，否则被掀开的半边桥面仍会投下完整阴影
        m.clipShadows = true;
        m.needsUpdate = true;
      });
      this.lastEnabled = this.enabled;
    }
    this.updateEdge(c);
  }

  private updateEdge(c: number): void {
    const axial = this.direction === 'AXIAL';
    const k = this.progress * (this.enabled ? 1 : 0);
    // 切面按方向摆放：沿桥轴时是箱梁横断面，横向时是纵断面；与裁剪平面严格共面
    this.section.position.set(
      axial ? c : 0,
      (GEO.girderBottomY + GEO.girderTopY) / 2,
      axial ? 0 : c,
    );
    this.section.rotation.y = axial ? Math.PI / 2 : 0;
    this.section.scale.set(axial ? GEO.deckW : GEO.length, GEO.girderH, 1);
    this.section.visible = k > 0.01;
    this.faceMat.opacity = 0.075 * k;
    this.gridMat.opacity = 0.17 * k;

    const y0 = GEO.girderBottomY, y1 = GEO.girderTopY;
    const toY = (v: number) => 56 + v * GEO.girderH;
    const toZ = (u: number) => u * GEO.deckW;
    const pts: number[] = [];
    const seg = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
      pts.push(ax, ay, az, bx, by, bz);
    };
    if (axial) {
      // 与 boxGirderGeometry 相同的外轮廓 + 三室箱口，断面不再是空心矩形
      const profile: [number, number][] = [
        [-0.5, 0.48], [0.5, 0.48], [0.5, 0.40], [0.34, 0.30],
        [0.26, -0.5], [-0.26, -0.5], [-0.34, 0.30], [-0.5, 0.40],
      ];
      for (let i = 0; i < profile.length; i++) {
        const a = profile[i], b = profile[(i + 1) % profile.length];
        seg(c, toY(a[1]), toZ(a[0]), c, toY(b[1]), toZ(b[0]));
      }
      ([[-0.27, -0.10], [-0.085, 0.085], [0.10, 0.27]] as [number, number][]).forEach(([ha, hb]) => {
        const box: [number, number][] = [[ha, -0.38], [hb, -0.38], [hb, 0.38], [ha, 0.38]];
        for (let i = 0; i < 4; i++) {
          const a = box[i], b = box[(i + 1) % 4];
          seg(c, toY(a[1]), toZ(a[0]), c, toY(b[1]), toZ(b[0]));
        }
      });
    } else {
      const x0 = -GEO.halfLength, x1 = GEO.halfLength;
      seg(x0, y0, c, x1, y0, c);
      seg(x1, y0, c, x1, y1, c);
      seg(x1, y1, c, x0, y1, c);
      seg(x0, y1, c, x0, y0, c);
      // 顶板 / 底板的纵向分界线
      seg(x0, 54.3, c, x1, 54.3, c);
      seg(x0, 57.7, c, x1, 57.7, c);
    }
    const pos = this.edge.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < pts.length; i++) arr[i] = pts[i];
    pos.needsUpdate = true;
    this.edge.geometry.setDrawRange(0, pts.length / 3);
    this.edgeMat.opacity = 0.9 * k;
    this.edge.visible = k > 0.01;
  }

  update(dt: number): void {
    if (!this.anim) return;
    const a = this.anim;
    // duration 以毫秒传入（与 CameraDirector.flyTo 一致），而 dt 是秒：此处必须换算，
    // 否则 2200ms 的动画会被当成 2200s，剖切进度长期停在 ~0、断面永远看不见。
    a.elapsed += dt * 1000;
    const p = Math.min(1, a.elapsed / a.duration);
    this.progress = lerp(a.from, a.to, easeInOutCubic(p));
    this.apply();
    if (p >= 1) this.anim = null;
  }
}
