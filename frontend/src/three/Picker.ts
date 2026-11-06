import * as THREE from 'three';
import type { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';

export interface PickHit {
  kind: 'component' | 'vehicle' | 'sensor';
  code: string;
  object: THREE.Object3D;
  instanceId?: number;
  point: THREE.Vector3;
}

/** 文档 VIS-009：射线拾取实体构件/传感器/车辆，返回 compCode 并 OutlinePass 高亮 */
export class Picker {
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private downX = 0;
  private downY = 0;

  constructor(
    private readonly camera: THREE.Camera,
    private readonly dom: HTMLElement,
    private readonly pickables: THREE.Object3D[],
    private readonly outline: OutlinePass,
    private readonly onPick: (hit: PickHit) => void,
  ) {
    this.raycaster.params.Points.threshold = 1.2;
    dom.addEventListener('pointerdown', this.handleDown);
    dom.addEventListener('pointerup', this.handleUp);
  }

  private handleDown = (e: PointerEvent): void => {
    this.downX = e.clientX;
    this.downY = e.clientY;
  };

  private handleUp = (e: PointerEvent): void => {
    if (Math.hypot(e.clientX - this.downX, e.clientY - this.downY) > 6) return;
    const rect = this.dom.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const visible = this.pickables.filter(o => o.visible && o.parent?.visible !== false);
    const hits = this.raycaster.intersectObjects(visible, false);
    const hit = hits.find(h => h.object.userData.pickCode || h.object.userData.pickCodes || h.object.userData.pickKind);
    if (!hit) return;
    const obj = hit.object;
    const kind: PickHit['kind'] = obj.userData.pickKind === 'vehicle' ? 'vehicle'
      : obj.userData.pickKind === 'sensor' ? 'sensor' : 'component';
    const codes = obj.userData.pickCodes as string[] | undefined;
    const code = codes && hit.instanceId !== undefined
      ? (codes[hit.instanceId] ?? '')
      : (obj.userData.pickCode as string | undefined) ?? '';
    this.outline.selectedObjects = [obj];
    this.onPick({ kind, code, object: obj, instanceId: hit.instanceId, point: hit.point.clone() });
  };

  clearHighlight(): void { this.outline.selectedObjects = []; }

  dispose(): void {
    this.dom.removeEventListener('pointerdown', this.handleDown);
    this.dom.removeEventListener('pointerup', this.handleUp);
  }
}
