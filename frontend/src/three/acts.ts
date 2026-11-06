import * as THREE from 'three';
import { GEO, SEGMENTS } from '../config';
import type { BridgeModel } from './BridgeBuilder';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

export interface FrameOptions {
  clipping: boolean;
  clipProgress: number;
  wireframe: boolean;
  elapsed: number;
}

export interface FrameState {
  clip: number;
  sensorReveal: number;
  trafficLoad: number;
  flash: number;
  actProgress: number[];
}

type SolidMat = THREE.Material & {
  opacity: number; transparent: boolean; depthWrite: boolean; wireframe?: boolean;
  emissiveIntensity?: number;
};

/**
 * 纯状态应用：给定时间 t 一次性把整桥设置到该帧。
 * 跳幕 = applyFrame(幕末时间)，天然无 setTimeout 残留，重播无残留。
 */
export function applyFrame(model: BridgeModel, t: number, opts: FrameOptions): FrameState {
  const solidP = clamp01((t - 4500) / 700);

  // ---- 幕一：骨架按施工顺序逐段生长 ----
  model.skeleton.parts.forEach(part => {
    const p = clamp01((t - part.startMs) / (part.endMs - part.startMs));
    part.mesh.geometry.setDrawRange(0, Math.floor((part.total * p) / 2) * 2);
  });
  model.skeleton.material.opacity = 0.9 * (1 - solidP);
  model.skeleton.group.visible = model.skeleton.material.opacity > 0.01;
  const growth = clamp01(t / 4500);
  model.skeleton.scanBand.visible = t < 4500 && growth > 0;
  model.skeleton.scanBand.position.y = growth * GEO.towerH;
  (model.skeleton.scanBand.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - solidP);

  // ---- 幕二：线框 → 实体蒙皮 ----
  model.solidMaterials.forEach(mat => {
    const m = mat as SolidMat;
    m.opacity = solidP;
    m.transparent = solidP < 0.999;
    m.depthWrite = solidP > 0.9;
    if (m.wireframe !== undefined) m.wireframe = opts.wireframe;
  });
  model.decorMaterials.forEach(d => { d.material.opacity = d.target * solidP; });

  // ---- 42 节段从两侧向跨中推入 ----
  const visibility: number[] = [];
  const offsets: number[] = [];
  for (let i = 0; i < GEO.segmentCount; i++) {
    const order = i < 21 ? i : 41 - i;
    const p = clamp01((t - (5200 + order * 68)) / 700);
    const e = easeOut(p);
    visibility[i] = solidP * e;
    offsets[i] = (1 - e) * 120 * (i < 21 ? 1 : -1);
  }
  model.updateSegmentMatrices(offsets, visibility);

  // ---- 跨中合龙白闪（6.6~7.0s）----
  const flash = clamp01((t - 6600) / 100) * (1 - clamp01((t - 7000) / 300));
  (model.closureFlash.material as THREE.MeshBasicMaterial).opacity = flash * 0.9;
  model.closureFlash.visible = flash > 0.01;

  // ---- 拉索张拉（7.0~7.5s）+ 流动光点 ----
  model.cables.mat.emissiveIntensity = 1.2 * clamp01((t - 7000) / 500);
  model.cables.flowMat.opacity = 0.9 * clamp01((t - 7500) / 600) * solidP;

  // ---- 幕三：车道线扫描亮起 + 桥侧发光带脉冲 ----
  const laneP = clamp01((t - 7500) / 500);
  model.segments.laneMat.opacity = 0.6 * laneP;
  model.centerLineMat.opacity = 0.85 * laneP;
  const trafficLoad = clamp01((t - 7500) / 1500);
  const pulse = 0.78 + 0.22 * Math.sin(opts.elapsed * 2.4);
  model.segments.glowMat.opacity = laneP * (0.25 + 0.65 * clamp01((t - 8500) / 1000)) * pulse;

  // ---- 幕四：剖切 + 内部结构分批显 + 传感器点亮 ----
  const clip = opts.clipping ? opts.clipProgress : clamp01((t - 10200) / 1400);
  const innerReveal = clamp01((t - 11000) / 1000) * clamp01(clip * 2.5);
  const innerP = [
    innerReveal,
    clamp01((t - 11200) / 500) * clamp01(clip * 2.5),
    clamp01((t - 11000) / 300) * clamp01(clip * 2.5),
    clamp01((t - 11400) / 400) * clamp01(clip * 2.5),
    clamp01((t - 11800) / 300) * clamp01(clip * 2.5),
  ];
  model.inner.materials.forEach((mat, i) => {
    const m = mat as SolidMat;
    m.opacity = innerP[i] * 0.95;
    m.transparent = true;
    m.depthWrite = innerP[i] > 0.9;
    if (m.wireframe !== undefined) m.wireframe = opts.wireframe;
  });
  model.inner.group.visible = innerReveal > 0.01;
  const sensorReveal = clamp01((t - 11600) / 900);

  return {
    clip,
    sensorReveal,
    trafficLoad,
    flash,
    actProgress: [
      clamp01(t / 4500), clamp01((t - 4500) / 3000),
      clamp01((t - 7500) / 2000), clamp01((t - 9500) / 3000),
      clamp01((t - 12500) / 1000),
    ],
  };
}

/** 索上流动光点：每 0.3s 前移一次（此处按连续时间插值） */
export function updateCableFlow(model: BridgeModel, elapsed: number): void {
  if (model.cables.flowMat.opacity < 0.01) return;
  const pos = model.cables.flow.geometry.getAttribute('position') as THREE.BufferAttribute;
  const step = Math.floor(elapsed / 0.3) / 12;
  model.cables.anchors.forEach(([a, b], i) => {
    const t = (step + i * 0.137) % 1;
    pos.setXYZ(i, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
  });
  pos.needsUpdate = true;
}

/** 节段编码 → 实例索引（构件树点击定位用） */
export const segmentIndexOf = (compCode: string): number =>
  SEGMENTS.findIndex(s => s.segmentCode === compCode);
