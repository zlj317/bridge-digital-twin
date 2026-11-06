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
