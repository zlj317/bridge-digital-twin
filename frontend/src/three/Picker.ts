import * as THREE from 'three';
import type { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';

export interface PickHit {
  kind: 'component' | 'vehicle' | 'sensor';
  code: string;
  object: THREE.Object3D;
  instanceId?: number;
  point: THREE.Vector3;
}

/** 文档 VIS-009：射线拾取实体构件/传感器/车辆，返回 compCode 并 OutlinePass 高亮。
 *  同时提供节流悬停探测：鼠标指针反馈 + 悬浮信息卡，不额外增加每帧开销。 */
export class Picker {
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private downX = 0;
  private downY = 0;
  private lastHover = 0;

  constructor(
    private readonly camera: THREE.Camera,
    private readonly dom: HTMLElement,
    private readonly pickables: THREE.Object3D[],
    private readonly outline: OutlinePass,
    private readonly onPick: (hit: PickHit) => void,
    private readonly onHover?: (hit: PickHit | null, x: number, y: number) => void,
    private readonly onDoublePick?: (hit: PickHit) => void,
  ) {
    this.raycaster.params.Points.threshold = 1.2;
    dom.addEventListener('pointerdown', this.handleDown);
    dom.addEventListener('pointerup', this.handleUp);
    if (this.onDoublePick) dom.addEventListener('dblclick', this.handleDouble);
    if (onHover) {
      dom.addEventListener('pointermove', this.handleMove);
      dom.addEventListener('pointerleave', this.handleLeave);
      dom.style.cursor = 'grab';
    }
  }

  private cast(clientX: number, clientY: number): PickHit | null {
    const rect = this.dom.getBoundingClientRect();
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const visible = this.pickables.filter(o => o.visible && o.parent?.visible !== false);
    const hits = this.raycaster.intersectObjects(visible, false);
    const hit = hits.find(h => h.object.userData.pickCode || h.object.userData.pickCodes || h.object.userData.pickKind);
    if (!hit) return null;
    const obj = hit.object;
    const kind: PickHit['kind'] = obj.userData.pickKind === 'vehicle' ? 'vehicle'
      : obj.userData.pickKind === 'sensor' ? 'sensor' : 'component';
    const codes = obj.userData.pickCodes as string[] | undefined;
    const code = codes && hit.instanceId !== undefined
      ? (codes[hit.instanceId] ?? '')
      : (obj.userData.pickCode as string | undefined) ?? '';
    return { kind, code, object: obj, instanceId: hit.instanceId, point: hit.point.clone() };
  }

  private handleDown = (e: PointerEvent): void => {
    this.downX = e.clientX;
    this.downY = e.clientY;
    if (this.onHover) this.dom.style.cursor = 'grabbing';
  };

  private handleUp = (e: PointerEvent): void => {
    if (this.onHover) this.dom.style.cursor = 'grab';
    if (Math.hypot(e.clientX - this.downX, e.clientY - this.downY) > 6) return;
    const hit = this.cast(e.clientX, e.clientY);
    if (!hit) return;
    this.outline.selectedObjects = [hit.object];
    this.onPick(hit);
  };

  /** 双击沿当前视线聚焦到命中点，不改动单击选中档案的行为 */
  private handleDouble = (e: MouseEvent): void => {
    // 拖拽结束时浏览器仍可能派发 dblclick，这里复用单击的位移阈值避免误聚焦
    if (Math.hypot(e.clientX - this.downX, e.clientY - this.downY) > 6) return;
    const hit = this.cast(e.clientX, e.clientY);
    if (!hit) return;
    this.outline.selectedObjects = [hit.object];
    this.onDoublePick?.(hit);
  };

  /** 90ms 节流：悬停时才做一次射线检测，避免每帧 raycast */
  private handleMove = (e: PointerEvent): void => {
    const now = performance.now();
    if (now - this.lastHover < 90) return;
    this.lastHover = now;
    const hit = this.cast(e.clientX, e.clientY);
    this.dom.style.cursor = hit ? 'pointer' : 'grab';
    this.onHover?.(hit, e.clientX, e.clientY);
  };

  private handleLeave = (): void => {
    if (this.onHover) this.dom.style.cursor = 'grab';
    this.onHover?.(null, 0, 0);
  };

  clearHighlight(): void { this.outline.selectedObjects = []; }

  dispose(): void {
    this.dom.removeEventListener('pointerdown', this.handleDown);
    this.dom.removeEventListener('pointerup', this.handleUp);
    this.dom.removeEventListener('pointermove', this.handleMove);
    this.dom.removeEventListener('pointerleave', this.handleLeave);
    this.dom.removeEventListener('dblclick', this.handleDouble);
  }
}
