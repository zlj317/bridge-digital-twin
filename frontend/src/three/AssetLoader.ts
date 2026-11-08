import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ASSETS } from '../config';

/** 资产键：与 config.ASSETS 一一对应（车辆、护栏、道闸等可下载 CC0 件） */
export type AssetKey = keyof typeof ASSETS;
export type AssetBundle = Partial<Record<AssetKey, THREE.Object3D | null>>;

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Object3D | null>>();

/** 加载单个 GLB，失败（404 / 网络 / Draco 未配置）时返回 null，由调用方走程序化兜底 */
export function preloadAsset(url: string): Promise<THREE.Object3D | null> {
  let p = cache.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      loader.load(
        url,
        (gltf) => resolve(gltf.scene),
        undefined,
        () => {
          console.warn(`[assets] GLB 加载失败，使用程序化兜底：${url}`);
          resolve(null);
        },
      );
    });
    cache.set(url, p);
  }
  return p;
}

/** 并发预载全部启用的资产，返回 资产键 → 场景（或 null） */
export async function preloadAssets(): Promise<AssetBundle> {
  const entries = (Object.entries(ASSETS) as [AssetKey, string][]).filter(([, url]) => !!url);
  const results = await Promise.all(entries.map(([, url]) => preloadAsset(url)));
  const bundle: AssetBundle = {};
  entries.forEach(([k], i) => { bundle[k] = results[i]; });
  return bundle;
}

function firstMesh(obj: THREE.Object3D): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  obj.traverse((c) => { if (!found && (c as THREE.Mesh).isMesh) found = c as THREE.Mesh; });
  return found;
}

/** 取 GLB 第一个网格几何：等比缩放到「最长边 = targetLen」，并平移使底面 y=0、水平居中。
 *  用于替换 InstancedMesh 的 BoxGeometry（车辆 / 通用件）。 */
export function toInstancedGeometry(obj: THREE.Object3D | null, targetLen: number): THREE.BufferGeometry | null {
  if (!obj) return null;
  const mesh = firstMesh(obj);
  if (!mesh) return null;
  const geo = (mesh.geometry as THREE.BufferGeometry).clone();
  geo.computeBoundingBox();
  const size = new THREE.Vector3();
  geo.boundingBox!.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const s = targetLen / maxDim;
  geo.scale(s, s, s);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  geo.computeVertexNormals();
  return geo;
}

/** 取 GLB 场景用于静态克隆（护栏 / 道闸）。等比缩放到「最长边 = targetLen」后返回克隆根。 */
export function toStaticProp(obj: THREE.Object3D | null, targetLen: number): THREE.Object3D | null {
  if (!obj) return null;
  const root = obj.clone(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const s = targetLen / maxDim;
  root.scale.multiplyScalar(s);
  return root;
}

/** 与 toStaticProp 类似，但额外把底面落到 y=0 并水平居中，便于按桥面标高直接摆放近景车 / 支架。
 *  alignLongAxisToX=true 时把 GLB 的 Z 长轴旋到 X，使静态车辆沿桥轴停放。 */
export function toGroundedProp(obj: THREE.Object3D | null, targetLen: number,
                               alignLongAxisToX = false): THREE.Object3D | null {
  if (!obj) return null;
  const root = obj.clone(true);
  if (alignLongAxisToX) {
    const before = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
    if (before.z > before.x) root.rotateY(Math.PI / 2);
  }
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(maxDim) || maxDim <= 0) return null;
  root.scale.multiplyScalar(targetLen / maxDim);
  root.updateMatrixWorld(true);
  const grounded = new THREE.Box3().setFromObject(root);
  root.position.x -= (grounded.min.x + grounded.max.x) / 2;
  root.position.y -= grounded.min.y;
  root.position.z -= (grounded.min.z + grounded.max.z) / 2;
  return root;
}

/** 车流模型：把 GLB 的全部网格合并成一个带顶点色的几何，避免只取首个网格导致「只有轮子/车门」。
 *  单一贴图材质时保留 UV + 原贴图；多材质无贴图时按材质基础色生成顶点色。
 *  输出统一为「长轴 X、底面 y=0、水平居中、最长边 targetLen」的落地几何。 */
export interface VehicleModel {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
}

function partColor(mat: THREE.Material | undefined): THREE.Color {
  const m = mat as THREE.MeshStandardMaterial | undefined;
  const c = m?.color ? m.color.clone() : new THREE.Color(0.65, 0.68, 0.74);
  const name = (m?.name || '').toLowerCase();
  const e = m?.emissive;
  if (e && e.r + e.g + e.b > 0.6) {
    if (name.includes('red') || name.includes('tail')) c.setRGB(1.8, 0.15, 0.12);
    else c.setRGB(1.9, 1.75, 1.35);
  } else if (name.includes('glass') || name.includes('window') || name.includes('wind')) {
    c.lerp(new THREE.Color(0.14, 0.24, 0.34), 0.5);
  } else if (name.includes('tire') || name.includes('rubber') || name.includes('wheel')) {
    c.multiplyScalar(0.65);
  }
  return c;
}

function mergeParts(parts: THREE.BufferGeometry[], withColor: boolean, withUV: boolean): THREE.BufferGeometry {
  const total = parts.reduce((n, g) => n + g.getAttribute('position').count, 0);
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const color = withColor ? new Float32Array(total * 3) : null;
  const uv = withUV ? new Float32Array(total * 2) : null;
  let base = 0;
  for (const g of parts) {
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    const c = g.getAttribute('color') as THREE.BufferAttribute | undefined;
    const t = g.getAttribute('uv') as THREE.BufferAttribute | undefined;
    for (let i = 0; i < p.count; i++) {
      const k = (base + i) * 3;
      position[k] = p.getX(i); position[k + 1] = p.getY(i); position[k + 2] = p.getZ(i);
      normal[k] = n ? n.getX(i) : 0; normal[k + 1] = n ? n.getY(i) : 1; normal[k + 2] = n ? n.getZ(i) : 0;
      if (color) {
        color[k] = c ? c.getX(i) : 1; color[k + 1] = c ? c.getY(i) : 1; color[k + 2] = c ? c.getZ(i) : 1;
      }
      if (uv) {
        const u = (base + i) * 2;
        uv[u] = t ? t.getX(i) : 0; uv[u + 1] = t ? t.getY(i) : 0;
      }
    }
    base += p.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  if (color) merged.setAttribute('color', new THREE.BufferAttribute(color, 3));
  if (uv) merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return merged;
}

export function toVehicleModel(obj: THREE.Object3D | null, targetLen: number): VehicleModel | null {
  if (!obj) return null;
  obj.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  const materials = new Set<THREE.Material>();
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.getAttribute('position')) return;
    const src = mesh.geometry as THREE.BufferGeometry;
    const work = src.index ? src.toNonIndexed() : src.clone();
    work.applyMatrix4(mesh.matrixWorld);
    if (!work.getAttribute('normal')) work.computeVertexNormals();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach(m => { if (m) materials.add(m); });
    const count = work.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    const base = partColor(mats[0]);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = base.r; colors[i * 3 + 1] = base.g; colors[i * 3 + 2] = base.b;
    }
    if (mats.length > 1) {
      work.groups.forEach(g => {
        const c = partColor(mats[g.materialIndex ?? 0]);
        const end = Math.min(count, g.start + g.count);
        for (let i = g.start; i < end; i++) {
          colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
        }
      });
    }
    const clean = new THREE.BufferGeometry();
    clean.setAttribute('position', work.getAttribute('position').clone());
    clean.setAttribute('normal', work.getAttribute('normal').clone());
    clean.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const uv = work.getAttribute('uv');
    if (uv) clean.setAttribute('uv', uv.clone());
    parts.push(clean);
    work.dispose();
  });
  if (!parts.length) return null;

  const single = materials.size === 1 ? [...materials][0] as THREE.MeshStandardMaterial : null;
  const keepUV = !!(single?.map);
  const merged = mergeParts(parts, !keepUV, keepUV);
  parts.forEach(p => p.dispose());

  merged.computeBoundingBox();
  const size = merged.boundingBox!.getSize(new THREE.Vector3());
  if (size.z > size.x) merged.rotateY(Math.PI / 2);
  merged.computeBoundingBox();
  merged.boundingBox!.getSize(size);
  const s = targetLen / (Math.max(size.x, size.y, size.z) || 1);
  merged.scale(s, s, s);
  merged.computeBoundingBox();
  const bb = merged.boundingBox!;
  merged.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);

  const material = keepUV
    ? new THREE.MeshStandardMaterial({ map: single!.map, roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide, envMapIntensity: 1.0 })
    : new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.42, metalness: 0.45, envMapIntensity: 1.0,
        emissive: 0x0a1018, emissiveIntensity: 0.2, side: THREE.DoubleSide,
      });
  return { geometry: merged, material };
}
