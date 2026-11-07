import * as THREE from 'three';

/** 单位化桥梁截面几何与程序化 PBR 贴图。
 *  所有几何按 X 长 1 / Y 高 1 / Z 宽 1 归一化，可直接复用 setBox 的 scale 语义。 */

const DOWN = new THREE.Vector3(0, -1, 0);

/** 斜拉索自重垂度：按索长的 0.6% 取抛物线矢高，两端切线与原直线一致。
 *  实体索、幕一骨架线和索上流光点共用此函数，保证三者几何严格重合。 */
export function saggedCablePoint(
  a: THREE.Vector3, b: THREE.Vector3, t: number, out = new THREE.Vector3(),
): THREE.Vector3 {
  const sag = a.distanceTo(b) * 0.006;
  return out.copy(a).lerp(b, t).addScaledVector(DOWN, 4 * t * (1 - t) * sag);
}

function extrudeSection(shape: THREE.Shape): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 1, bevelEnabled: false, curveSegments: 1, steps: 1,
  });
  // Shape 平面 (u,v) → (z,y)，挤出方向 z → x，随后居中到 [-0.5, 0.5]
  geo.rotateY(Math.PI / 2);
  geo.translate(-0.5, 0, 0);
  return geo;
}

/** 单箱三室钢箱梁：流线型悬臂 + 斜腹板 + 顶板/底板 + 3 个贯通箱室。
 *  替换原先整块实心 Box，剖切后能看到真实空腔与腹板。 */
export function boxGirderGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0.48);
  s.lineTo(0.5, 0.48);
  s.lineTo(0.5, 0.40);
  s.lineTo(0.34, 0.30);
  s.lineTo(0.26, -0.5);
  s.lineTo(-0.26, -0.5);
  s.lineTo(-0.34, 0.30);
  s.lineTo(-0.5, 0.40);
  s.closePath();
  ([[-0.27, -0.10], [-0.085, 0.085], [0.10, 0.27]] as [number, number][]).forEach(([a, b]) => {
    const hole = new THREE.Path();
    hole.moveTo(a, -0.38);
    hole.lineTo(a, 0.38);
    hole.lineTo(b, 0.38);
    hole.lineTo(b, -0.38);
    hole.closePath();
    s.holes.push(hole);
  });
  return extrudeSection(s);
}

/** 新泽西式混凝土护栏截面：下部斜坡导轮 + 上部直立，分段拼接替代整块方条 */
export function jerseyBarrierGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.5, -0.5);
  s.lineTo(0.5, -0.5);
  s.lineTo(0.5, -0.02);
  s.lineTo(0.28, 0.32);
  s.lineTo(0.28, 0.5);
  s.lineTo(-0.28, 0.5);
  s.lineTo(-0.28, 0.32);
  s.lineTo(-0.5, -0.02);
  s.closePath();
  return extrudeSection(s);
}

/** 四棱台塔柱：下宽上窄的收分截面，边与桥轴平行 */
export function taperedColumnGeometry(): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(0.50, 0.72, 1, 4, 1, false);
  geo.rotateY(Math.PI / 4);
  return geo;
}

/** 共享贴图按不同构件尺度设置平铺次数，避免 200m 塔柱只显示一条纹理 */
export function cloneRepeat(tex: THREE.Texture, x: number, y: number): THREE.Texture {
  const t = tex.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(x, y);
  t.needsUpdate = true;
  return t;
}

function canvas(size: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return { c, ctx: c.getContext('2d')! };
}

/** 由高度场求差分得到切线空间法线贴图（R/G 存 xy 斜率，B 恒为 +Z） */
function normalTexture(h: Float32Array, size: number, strength: number): THREE.CanvasTexture {
  const { c, ctx } = canvas(size);
  const img = ctx.createImageData(size, size);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const i = (y * size + x) * 4;
      img.data[i] = 128 - dx * 127;
      img.data[i + 1] = 128 - dy * 127;
      img.data[i + 2] = 248;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function toTexture(c: HTMLCanvasElement, srgb: boolean, repeatY = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, repeatY);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export interface SurfaceTextures {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

/** 沥青：骨料颗粒 + 节段伸缩缝 + 车辙带；三张贴图共用同一高度场 */
export function asphaltTextures(): SurfaceTextures {
  const size = 256;
  const { c, ctx } = canvas(size);
  const img = ctx.createImageData(size, size);
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const n = 0.82 + Math.random() * 0.18;
      const aggregate = Math.random() < 0.018 ? 0.52 : 1;
      h[i] = n * aggregate;
      const v = 238 * h[i];
      const p = i * 4;
      img.data[p] = v;
      img.data[p + 1] = v + 2;
      img.data[p + 2] = v + 5;
      img.data[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = 'rgba(22, 28, 36, 0.62)';
  ctx.fillRect(0, 0, 5, size);
  ctx.fillRect(size - 5, 0, 5, size);
  const rut = ctx.createLinearGradient(0, 0, 0, size);
  rut.addColorStop(0, 'rgba(18,24,32,0)');
  rut.addColorStop(0.3, 'rgba(18,24,32,0.10)');
  rut.addColorStop(0.7, 'rgba(18,24,32,0.10)');
  rut.addColorStop(1, 'rgba(18,24,32,0)');
  ctx.fillStyle = rut;
  ctx.fillRect(0, 0, size, size);

  const rough = canvas(size);
  const rimg = rough.ctx.createImageData(size, size);
  for (let i = 0; i < h.length; i++) {
    const v = 205 + Math.round((1 - h[i]) * 48);
    rimg.data[i * 4] = rimg.data[i * 4 + 1] = rimg.data[i * 4 + 2] = v;
    rimg.data[i * 4 + 3] = 255;
  }
  rough.ctx.putImageData(rimg, 0, 0);

  const map = toTexture(c, true, 3);
  const normalMap = normalTexture(h, size, 1.8);
  normalMap.repeat.set(1, 3);
  const roughnessMap = toTexture(rough.c, false, 3);
  return { map, normalMap, roughnessMap };
}

/** 混凝土：细骨料 + 模板分节缝 + 底部渐暗（廉价 AO）+ 法线/粗糙度 */
export function concreteTextures(): SurfaceTextures {
  const size = 256;
  const { c, ctx } = canvas(size);
  const img = ctx.createImageData(size, size);
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      h[i] = 0.86 + Math.random() * 0.14;
      const seam = y % 64 < 2 ? 0.68 : 1;
      const ao = 0.82 + 0.18 * (1 - y / size);
      const v = 224 * h[i] * seam * ao;
      const p = i * 4;
      img.data[p] = v;
      img.data[p + 1] = v + 3;
      img.data[p + 2] = v + 8;
      img.data[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const rough = canvas(size);
  const rimg = rough.ctx.createImageData(size, size);
  for (let i = 0; i < h.length; i++) {
    const v = 214 + Math.round((1 - h[i]) * 60);
    rimg.data[i * 4] = rimg.data[i * 4 + 1] = rimg.data[i * 4 + 2] = v;
    rimg.data[i * 4 + 3] = 255;
  }
  rough.ctx.putImageData(rimg, 0, 0);
  return {
    map: toTexture(c, true),
    normalMap: normalTexture(h, size, 1.1),
    roughnessMap: toTexture(rough.c, false),
  };
}

/** 路灯照地光斑的径向衰减 alpha 贴图 */
export function radialAlphaTexture(): THREE.CanvasTexture {
  const { c, ctx } = canvas(128);
  const g = ctx.createRadialGradient(64, 64, 3, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.32, 'rgba(255,255,255,0.62)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
