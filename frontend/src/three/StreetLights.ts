import * as THREE from 'three';
import { GEO } from '../config';

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);

/** 桥面路灯：两侧每 40m 一根，灯杆/灯臂/灯头全部实例化。
 *  灯泡用屏幕像素尺寸的暖色光点，夜间交给 Bloom 形成光晕，白天自动熄灭。 */
export class StreetLights {
  readonly root = new THREE.Group();
  readonly materials: THREE.Material[] = [];
  private bulbMat: THREE.MeshBasicMaterial;
  private glowMat: THREE.PointsMaterial;
  private glow: THREE.Points;
  private bulbs: THREE.InstancedMesh;
  private revealed = false;

  constructor() {
    const xs: number[] = [];
    for (let x = -GEO.halfLength + 20; x <= GEO.halfLength - 20; x += 40) xs.push(x);
    const sides = [-1, 1];
    const n = xs.length * sides.length;

    const steel = new THREE.MeshStandardMaterial({ color: 0x7c8794, metalness: 0.6, roughness: 0.5 });
    this.bulbMat = new THREE.MeshBasicMaterial({
      color: 0xffd9a0, transparent: true, opacity: 0.92,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.2, 9, 6), steel, n);
    const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.14, 2.6), steel, n);
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.95, 0.22, 0.6), steel, n);
    this.bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.34, 8, 6), this.bulbMat, n);

    const glowPos = new Float32Array(n * 3);
    const deckTop = GEO.deckY + 0.2;
    const poleTop = deckTop + 9;
    let i = 0;
    xs.forEach(x => sides.forEach(side => {
      const zPole = side * (GEO.halfDeck - 1.2);
      const zHead = zPole - side * 2.6;
      _q.identity();
      _m.compose(_p.set(x, deckTop + 4.5, zPole), _q, _s);
      poles.setMatrixAt(i, _m);
      _m.compose(_p.set(x, poleTop, zPole - side * 1.3), _q, _s);
      arms.setMatrixAt(i, _m);
      _m.compose(_p.set(x, poleTop - 0.12, zHead), _q, _s);
      heads.setMatrixAt(i, _m);
      _m.compose(_p.set(x, poleTop - 0.38, zHead), _q, _s);
      this.bulbs.setMatrixAt(i, _m);
      glowPos[i * 3] = x;
      glowPos[i * 3 + 1] = poleTop - 0.38;
      glowPos[i * 3 + 2] = zHead;
      i++;
    }));
    [poles, arms, heads, this.bulbs].forEach(m => {
      m.instanceMatrix.needsUpdate = true;
      m.frustumCulled = false;
    });

    const glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPos, 3));
    this.glowMat = new THREE.PointsMaterial({
      color: 0xffd7a0, size: 6.5, sizeAttenuation: false, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.glow = new THREE.Points(glowGeo, this.glowMat);
    this.glow.frustumCulled = false;
    this.root.add(poles, arms, heads, this.bulbs, this.glow);
    // 灯杆/灯泡/光晕随主桥面一起被剖切平面裁剪，保留未掀开那一侧的照明
    this.materials.push(steel, this.bulbMat, this.glowMat);
  }

  /** 幕三之后才出现（先合龙桥面、再装附属设施），也避免骨架阶段路灯悬空 */
  setReveal(p: number): void {
    this.revealed = p > 0.35;
    this.root.visible = this.revealed;
  }

  setDayFactor(f: number): void {
    const night = 1 - Math.max(0, Math.min(1, f));
    this.glowMat.opacity = 0.85 * night;
    this.bulbMat.opacity = 0.92 * night;
    this.glow.visible = night > 0.03;
    this.bulbs.visible = night > 0.03;
  }
}
