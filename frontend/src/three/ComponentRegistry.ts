import * as THREE from 'three';

export type LayerName =
  | 'PILE' | 'FOOTING' | 'PIER' | 'TOWER' | 'GIRDER' | 'INNER' | 'CABLE'
  | 'BEARING' | 'RAILING' | 'PAVEMENT' | 'SENSOR' | 'VEHICLE';

interface InstanceRef {
  mesh: THREE.InstancedMesh;
  index: number;
  base: THREE.Matrix4;
}

interface Entry {
  code: string;
  layer: LayerName;
  objects: THREE.Object3D[];
  instances: InstanceRef[];
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/** 文档 6.3 ComponentRegistry：compCode → Object3D/实例，驱动显隐与构件树联动 */
export class ComponentRegistry {
  private map = new Map<string, Entry>();
  private virtual = new Map<string, boolean>();

  private entry(code: string, layer: LayerName): Entry {
    let e = this.map.get(code);
    if (!e) {
      e = { code, layer, objects: [], instances: [] };
      this.map.set(code, e);
    }
    return e;
  }

  registerObject(code: string, layer: LayerName, object: THREE.Object3D, pickCode = code): void {
    object.userData.pickCode = pickCode;
    this.entry(code, layer).objects.push(object);
  }

  registerInstance(code: string, layer: LayerName, mesh: THREE.InstancedMesh, index: number): void {
    const base = new THREE.Matrix4();
    mesh.getMatrixAt(index, base);
    this.entry(code, layer).instances.push({ mesh, index, base });
  }

  /** 为 InstancedMesh 建立按实例索引的拾取映射 */
  setPickCodes(mesh: THREE.InstancedMesh, codes: string[]): void {
    mesh.userData.pickCodes = codes;
  }

  /** 虚拟构件：显隐由外部每帧矩阵计算读取，避免 base 矩阵过期 */
  registerVirtual(code: string, layer: LayerName): void {
    this.entry(code, layer);
    this.virtual.set(code, true);
  }

  setVisible(code: string, visible: boolean): void {
    if (this.virtual.has(code)) this.virtual.set(code, visible);
    const e = this.map.get(code);
    if (!e) return;
    e.objects.forEach(o => { o.visible = visible; });
    e.instances.forEach(({ mesh, index, base }) => {
      mesh.setMatrixAt(index, visible ? base : ZERO);
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  setLayerVisible(layer: LayerName, visible: boolean): void {
    this.map.forEach(e => { if (e.layer === layer) this.setVisible(e.code, visible); });
  }

  isVisible(code: string): boolean {
    if (this.virtual.has(code)) return this.virtual.get(code)!;
    const e = this.map.get(code);
    if (!e) return true;
    if (e.objects.length) return e.objects.every(o => o.visible);
    return true;
  }

  /** 构件树悬停联动：取该编码关联的所有可渲染对象（实例按 mesh 去重） */
  getObjects(code: string): THREE.Object3D[] {
    const e = this.map.get(code);
    if (!e) return [];
    const out = new Set<THREE.Object3D>(e.objects);
    e.instances.forEach(i => out.add(i.mesh));
    return [...out];
  }

  get codes(): string[] { return [...this.map.keys()]; }
  getLayer(code: string): LayerName | undefined { return this.map.get(code)?.layer; }
}
