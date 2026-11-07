import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ANIM_STAGES } from '../config';
import type { CamKeyframe, Viewpoint } from '../types';

const smooth = (p: number) => p * p * (3 - 2 * p);
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

interface Flight {
  fromPos: THREE.Vector3; toPos: THREE.Vector3;
  fromTarget: THREE.Vector3; toTarget: THREE.Vector3;
  fromFov: number; toFov: number;
  start: number; duration: number; hold: number;
}

/** 文档 VIS-011：五幕关键帧插值 + 用户接管 8s 后恢复自动运镜 */
export class CameraDirector {
  private takeoverUntil = 0;
  private flight: Flight | null = null;
  private readonly steadyTarget = new THREE.Vector3(0, 52, 0);
  private readonly steadyOffset = new THREE.Vector3(240, 130, 380);
  private readonly axisY = new THREE.Vector3(0, 1, 0);

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly controls: OrbitControls,
  ) {}

  /** 用户任何操作立即接管相机 */
  takeover(): void {
    this.takeoverUntil = performance.now() + 8000;
    this.flight = null;
  }

  /** holdMs 控制飞行结束后暂停自动运镜的时长；双击聚焦需要更长的观察窗口 */
  flyTo(vp: Viewpoint, duration = 1200, holdMs = 1500): void {
    this.takeoverUntil = 0;
    this.flight = {
      fromPos: this.camera.position.clone(),
      toPos: new THREE.Vector3(vp.camPos.x, vp.camPos.y, vp.camPos.z),
      fromTarget: this.controls.target.clone(),
      toTarget: new THREE.Vector3(vp.camTarget.x, vp.camTarget.y, vp.camTarget.z),
      fromFov: this.camera.fov, toFov: vp.fov,
      start: performance.now(), duration, hold: holdMs,
    };
  }

  private interpolate(a: CamKeyframe, b: CamKeyframe, p: number): void {
    const e = smooth(Math.max(0, Math.min(1, p)));
    this.camera.position.set(
      lerp(a.pos[0], b.pos[0], e), lerp(a.pos[1], b.pos[1], e), lerp(a.pos[2], b.pos[2], e),
    );
    this.controls.target.set(
      lerp(a.target[0], b.target[0], e), lerp(a.target[1], b.target[1], e), lerp(a.target[2], b.target[2], e),
    );
    const fov = lerp(a.fov, b.fov, e);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  private applyKeyframes(t: number): void {
    const stage = ANIM_STAGES.find(s => s.endMs > 0 && t >= s.startMs && t < s.endMs) ?? ANIM_STAGES[3];
    const local = t - stage.startMs;
    const keys = stage.camKeyframes;
    if (!keys.length) return;
    let i = 0;
    while (i < keys.length - 2 && local > keys[i + 1].t) i++;
    const a = keys[i];
    const b = keys[Math.min(i + 1, keys.length - 1)];
    this.interpolate(a, b, b.t === a.t ? 1 : (local - a.t) / (b.t - a.t));
  }

  /** 稳态巡检运镜：保持开阔斜俯视，沿桥轴缓慢往返 + 方位轻摆 + 高度起伏 */
  private steady(elapsed: number): void {
    const cruise = Math.sin((elapsed * Math.PI * 2) / 56) * 120;
    const angle = 0.12 + Math.sin((elapsed * Math.PI * 2) / 40) * 0.16;
    const pos = this.steadyOffset.clone().applyQuaternion(
      new THREE.Quaternion().setFromAxisAngle(this.axisY, angle),
    );
    pos.y += Math.sin(elapsed * 0.35) * 6;
    this.steadyTarget.set(cruise, 54, 0);
    this.camera.position.copy(this.steadyTarget).add(pos);
    this.controls.target.copy(this.steadyTarget);
  }

  update(t: number, elapsed: number): void {
    const now = performance.now();
    if (this.flight) {
      const f = this.flight;
      const p = smooth(Math.min(1, (now - f.start) / f.duration));
      this.camera.position.lerpVectors(f.fromPos, f.toPos, p);
      this.controls.target.lerpVectors(f.fromTarget, f.toTarget, p);
      this.camera.fov = lerp(f.fromFov, f.toFov, p);
      this.camera.updateProjectionMatrix();
      if (p >= 1) { this.flight = null; this.takeoverUntil = now + f.hold; }
      return;
    }
    if (now < this.takeoverUntil) return;
    if (t >= 12500) this.steady(elapsed);
    else this.applyKeyframes(t);
  }
}
