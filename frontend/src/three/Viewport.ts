import * as THREE from 'three';
import { store } from '../store/Store';
import { VIEWPOINTS } from '../config';
import type { Alarm, Bootstrap, BridgeMetrics, RealtimePoint, TrafficStat, VehicleState, Viewpoint } from '../types';
import { applyFrame, updateCableFlow } from './acts';
import { buildBridge, type BridgeModel } from './BridgeBuilder';
import { toInstancedGeometry, type AssetBundle } from './AssetLoader';
import { CameraDirector } from './CameraDirector';
import { ClippingController } from './ClippingController';
import { HeatMapper } from './HeatMapper';
import { Picker, type PickHit } from './Picker';
import { SceneManager } from './SceneManager';
import { SensorLayer } from './SensorLayer';
import { Timeline } from './Timeline';
import { TrafficEngine } from './TrafficEngine';

/** 渲染层门面：把 6.3 架构中的各模块装配成一条主循环，向应用层暴露统一 API */
export class Viewport {
  readonly sceneManager: SceneManager;
  private model: BridgeModel;
  private timeline = new Timeline();
  private cameraDirector: CameraDirector;
  private traffic: TrafficEngine;
  private sensors: SensorLayer;
  private clipping: ClippingController;
  private heat: HeatMapper;
  private picker: Picker;

  constructor(container: HTMLElement, private readonly bootstrap: Bootstrap, assets: AssetBundle = {}) {
    this.sceneManager = new SceneManager(container);
    const { scene, camera, controls, renderer, outline } = this.sceneManager;

    this.model = buildBridge(assets);
    scene.add(this.model.root);

    this.cameraDirector = new CameraDirector(camera, controls);
    const carGeo = toInstancedGeometry(assets.carA ?? null, 4.8);
    const truckGeo = toInstancedGeometry(assets.carB ?? null, 9.5);
    this.traffic = new TrafficEngine(bootstrap.lanes, {
      carGeometry: carGeo ?? undefined,
      truckGeometry: truckGeo ?? undefined,
    });
    scene.add(this.traffic.root);
    this.sensors = new SensorLayer(bootstrap.points);
    scene.add(this.sensors.root);
    this.clipping = new ClippingController(this.model.clippableMaterials);
    scene.add(this.clipping.object);
    this.heat = new HeatMapper(this.model.segments.shell, this.model.cables.mat,
      bootstrap.segments.map(s => s.segmentCode));

    const pickables = [
      ...this.model.pickables,
      ...this.sensors.root.children,
      ...this.traffic.root.children,
    ];
    this.picker = new Picker(camera, renderer.domElement, pickables, outline, hit => this.onPick(hit));

    controls.addEventListener('start', () => this.cameraDirector.takeover());
    this.sceneManager.setCallbacks(
      fps => store.patch({ fps }),
      () => { store.patch({ degraded: true }); store.emit('toast', { level: 'warn', text: '帧率偏低，已自动降级后处理' }); },
    );
    this.timeline.onFrame((_t, code, index) => {
      if (store.state.actIndex !== index) {
        store.patch({
          actIndex: index, actCode: code,
          selected: { ...store.state.selected, act: code },
        });
      }
    });
    this.sceneManager.addUpdate((dt, elapsed) => this.update(dt, elapsed));
  }

  private update(dt: number, elapsed: number): void {
    this.timeline.update(dt);
    const t = this.timeline.elapsed;
    const state = applyFrame(this.model, t, {
      clipping: store.state.clipping,
      clipProgress: store.state.clipProgress,
      wireframe: store.state.wireframe,
      elapsed,
    });

    this.clipping.setDirection(store.state.clipDirection);
    if (store.state.clipping) {
      this.clipping.setEnabled(true);
      this.clipping.update(dt);
    } else {
      this.clipping.setProgress(state.clip);
      this.clipping.setEnabled(state.clip > 0.01);
    }

    this.traffic.setLoadProgress(state.trafficLoad);
    this.traffic.setDensity(store.state.density);
    this.traffic.update(dt);
    this.sensors.setReveal(store.state.clipping ? 1 : state.sensorReveal);
    this.sensors.update(dt, elapsed);
    this.heat.update(elapsed);
    updateCableFlow(this.model, elapsed);
    this.cameraDirector.update(t, elapsed);
    this.sceneManager.setBloomStrength(0.62 + 0.78 * state.flash);
  }

  private onPick(hit: PickHit): void {
    if (hit.kind === 'vehicle') {
      const vid = this.traffic.pickVehicle(hit.object, hit.instanceId ?? -1);
      if (vid) {
        this.traffic.setHighlight(vid);
        store.emit('pick', { kind: 'vehicle', code: vid, payload: this.traffic.getVehicle(vid) });
      }
      return;
    }
    if (hit.kind === 'sensor') {
      const code = this.sensors.pick(hit.instanceId ?? -1);
      if (code) {
        this.sensors.flash(code);
        store.emit('pick', { kind: 'sensor', code });
      }
      return;
    }
    if (!hit.code) return;
    const pointCodes = this.bootstrap.points.filter(p => p.compCode === hit.code).map(p => p.pointCode);
    store.emit('pick', { kind: 'component', code: hit.code });
    store.select(hit.code, pointCodes);
  }

  // ---------- 应用层 API ----------
  start(): void { this.sceneManager.start(); }

  replay(): void { this.timeline.replay(); }

  seekToActEnd(index: number): void { this.timeline.seekToActEnd(index); }

  setPaused(v: boolean): void { this.timeline.setPaused(v); store.patch({ playing: !v }); }

  setSpeed(v: number): void { this.timeline.setSpeed(v); store.patch({ speed: v }); }

  setDensity(pct: number): void { store.patch({ density: pct }); this.traffic.setDensity(pct); }

  setWireframe(v: boolean): void { store.patch({ wireframe: v }); }

  setComponentVisible(code: string, v: boolean): void { this.model.registry.setVisible(code, v); }

  setInnerOnly(v: boolean): void {
    this.model.registry.setLayerVisible('PAVEMENT', !v);
    this.model.registry.setLayerVisible('RAILING', !v);
    this.setClipping(v);
  }

  setClipping(v: boolean): void {
    store.patch({ clipping: v, clipProgress: v ? 1 : 0 });
    this.clipping.animateTo(v ? 1 : 0, 2200);
  }

  setClipProgress(p: number): void {
    store.patch({ clipProgress: p, clipping: true });
    this.clipping.setProgress(p);
  }

  setClipDirection(dir: 'AXIAL' | 'CROSS'): void {
    store.patch({ clipDirection: dir });
    this.clipping.setDirection(dir);
  }

  focus(vpCode: string): void {
    const vp = this.bootstrap.viewpoints.find(v => v.vpCode === vpCode) ?? VIEWPOINTS.find(v => v.vpCode === vpCode);
    if (vp) this.cameraDirector.flyTo(vp);
  }

  /** 构件树 / 测点 / 告警定位：相机 1.2s 飞行 + 高亮描边 */
  focusComponent(code: string): void {
    const seg = this.bootstrap.segments.find(s => s.segmentCode === code);
    if (seg) {
      const vp: Viewpoint = {
        vpCode: 'VP-PICK', vpName: code,
        camPos: { x: seg.chainage + 70, y: 96, z: 110 },
        camTarget: { x: seg.chainage, y: 56, z: 0 }, fov: 40,
      };
      this.cameraDirector.flyTo(vp);
    } else if (code.startsWith('TOWER')) {
      this.focus('VP-TOWER');
    } else if (code.startsWith('C-')) {
      this.focus('VP-OVERVIEW');
    }
    const obj = code.startsWith('TOWER') ? this.model.towers.legs
      : code.startsWith('C-') ? this.model.cables.mesh : this.model.segments.shell;
    this.sceneManager.outline.selectedObjects = [obj];
  }

  flashSensor(pointCode: string): void { this.sensors.flash(pointCode); }

  applyPoints(points: RealtimePoint[]): void { this.sensors.apply(points); this.heat.apply(points); }

  applyMetrics(metrics: BridgeMetrics): void { store.patch({ metrics }); }

  applyTraffic(stat: TrafficStat, vehicles: VehicleState[]): void {
    this.traffic.setSnapshot(vehicles);
    store.patch({ traffic: stat, vehicles, metrics: { ...store.state.metrics, ...stat } });
  }

  onAlarm(alarm: Alarm): void {
    this.sensors.flash(alarm.pointCode);
    if (alarm.compCode) this.focusComponent(alarm.compCode);
  }

  screenshot(): string { return this.sceneManager.screenshot(); }

  /** WEB-005 第一人称 WASD：按桥轴平移相机 */
  nudge(dx: number, dy: number, dz: number): void {
    this.cameraDirector.takeover();
    this.sceneManager.camera.position.add(new THREE.Vector3(dx, dy, dz));
    this.sceneManager.controls.target.add(new THREE.Vector3(dx, dy, dz));
  }

  dispose(): void { this.picker.dispose(); this.sceneManager.dispose(); }
}
