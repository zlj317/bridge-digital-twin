import * as THREE from 'three';
import { store, type HoverInfo } from '../store/Store';
import { COLORS, GEO, VIEWPOINTS } from '../config';
import type {
  Alarm, Bootstrap, BridgeComponent, BridgeMetrics, Cable, GirderSegment, Lane,
  PointType, RealtimePoint, ShmPoint, TrafficStat, VehicleState, Viewpoint,
} from '../types';
import { applyFrame, updateCableFlow } from './acts';
import { buildBridge, type BridgeModel } from './BridgeBuilder';
import { toVehicleModel, type AssetBundle } from './AssetLoader';
import { CameraDirector } from './CameraDirector';
import { ClippingController } from './ClippingController';
import { HeatMapper } from './HeatMapper';
import { Picker, type PickHit } from './Picker';
import { SceneManager } from './SceneManager';
import { SensorLayer } from './SensorLayer';
import { Timeline } from './Timeline';
import { TrafficEngine } from './TrafficEngine';
import { buildAssetProps } from './AssetProps';
import { DeckDetails } from './DeckDetails';
import { StreetLights } from './StreetLights';
import { StructuralDetails } from './StructuralDetails';

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
  private streetLights: StreetLights;
  private deckDetails: DeckDetails;
  private structuralDetails: StructuralDetails;
  private pinnedOutline: THREE.Object3D[] = [];
  private innerOnly = false;
  private readonly componentByCode = new Map<string, BridgeComponent>();
  private readonly pointByCode = new Map<string, ShmPoint>();
  private readonly pointTypeByCode = new Map<string, PointType>();
  private readonly segmentByCode = new Map<string, GirderSegment>();
  private readonly cableByCode = new Map<string, Cable>();
  private readonly laneByCode = new Map<string, Lane>();
  private readonly pointsByComponent = new Map<string, ShmPoint[]>();
  private hoverState: { hit: PickHit; x: number; y: number } | null = null;
  private hoverTimer = 0;
  private markerPoint: THREE.Vector3 | null = null;
  private markerLabel = '';
  private markerActive = false;
  private focusRing: THREE.Group;
  private focusRingMat: THREE.MeshBasicMaterial;
  private focusAge = 0;

  constructor(container: HTMLElement, private readonly bootstrap: Bootstrap, assets: AssetBundle = {}) {
    this.sceneManager = new SceneManager(container);
    const { scene, camera, controls, renderer, outline } = this.sceneManager;

    this.model = buildBridge(assets);
    scene.add(this.model.root);
    this.model.root.add(buildAssetProps(assets));

    // 桥面附属设施：先合龙桥面，再装护栏 / 路灯 / 结构细节，符合施工顺序
    this.deckDetails = new DeckDetails(this.model.segments.deckMat);
    this.streetLights = new StreetLights();
    this.structuralDetails = new StructuralDetails();
    this.model.root.add(this.deckDetails.root, this.streetLights.root, this.structuralDetails.root);

    this.cameraDirector = new CameraDirector(camera, controls);
    const vehicleModels = [
      toVehicleModel(assets.carSkyline ?? null, 4.6),
      toVehicleModel(assets.carSupra ?? null, 4.8),
      toVehicleModel(assets.carSilvia ?? null, 4.5),
    ].filter(Boolean) as NonNullable<ReturnType<typeof toVehicleModel>>[];
    this.traffic = new TrafficEngine(bootstrap.lanes, { vehicleModels });
    scene.add(this.traffic.root);
    this.sensors = new SensorLayer(bootstrap.points);
    scene.add(this.sensors.root);
    const clipMats = [
      ...this.model.clippableMaterials,
      ...this.deckDetails.materials,
      ...this.structuralDetails.deckMaterials,
      ...this.streetLights.materials,
    ];
    this.clipping = new ClippingController(clipMats);
    scene.add(this.clipping.object);
    this.heat = new HeatMapper(this.model.segments.shell, this.model.cables.mat,
      bootstrap.segments.map(s => s.segmentCode));

    // 实时阴影白名单：实体结构投影到桥面 / 引道 / 岸地，发光贴片与内部结构不参与
    this.registerShadows();
    const ring = this.buildFocusRing();
    this.focusRing = ring.group;
    this.focusRingMat = ring.material;
    scene.add(this.focusRing);

    // 档案索引只建一次：高频悬停直接查表，不再遍历 150 个测点 / 130 个构件
    bootstrap.components.forEach(c => this.componentByCode.set(c.compCode, c));
    bootstrap.pointTypes.forEach(p => this.pointTypeByCode.set(p.ptypeCode, p));
    bootstrap.segments.forEach(s => this.segmentByCode.set(s.segmentCode, s));
    bootstrap.cables.forEach(c => this.cableByCode.set(c.cableCode, c));
    bootstrap.lanes.forEach(l => this.laneByCode.set(l.laneCode, l));
    bootstrap.points.forEach(p => {
      this.pointByCode.set(p.pointCode, p);
      const group = this.pointsByComponent.get(p.compCode) ?? [];
      group.push(p);
      this.pointsByComponent.set(p.compCode, group);
    });

    const pickables = [
      ...this.model.pickables,
      ...this.sensors.root.children,
      ...this.traffic.pickables,
    ];
    this.picker = new Picker(camera, renderer.domElement, pickables, outline,
      hit => this.onPick(hit), (hit, x, y) => this.onHover(hit, x, y),
      hit => this.onDoublePick(hit));

    // 构件树悬停 → 3D 同构件描边；移开后恢复点击选中的对象
    store.on('hoverComponent', code => {
      const objs = code ? this.model.registry.getObjects(code) : [];
      const targets = objs.length ? objs
        : code?.startsWith('B-') ? [this.model.segments.shell] : [];
      this.sceneManager.outline.selectedObjects = targets.length ? targets : this.pinnedOutline;
    });

    controls.addEventListener('start', () => this.cameraDirector.takeover());
    renderer.domElement.addEventListener('wheel', () => this.cameraDirector.takeover(), { passive: true });
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

  /** 只挑选 PBR 实体作为阴影对象；MeshBasicMaterial 的辉光/标线/贴片一律排除 */
  private collectSolidMeshes(root: THREE.Object3D): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    root.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (mats.every(m => m instanceof THREE.MeshStandardMaterial)) out.push(mesh);
    });
    return out;
  }

  private registerShadows(): void {
    const m = this.model;
    const details = [
      ...this.collectSolidMeshes(this.deckDetails.root),
      ...this.collectSolidMeshes(this.streetLights.root),
      ...this.collectSolidMeshes(this.structuralDetails.root),
    ];
    const casters: THREE.Object3D[] = [
      m.towers.legs, m.towers.beams, m.segments.shell, m.cables.mesh,
      ...m.substructure.meshes, m.bearings, m.rails.posts,
      ...this.traffic.shadowCasters, ...details,
    ];
    const receivers: THREE.Object3D[] = [
      m.segments.deck, m.segments.shell, m.towers.legs, m.towers.beams,
      ...m.substructure.meshes, ...this.traffic.shadowCasters, ...details,
    ];
    this.sceneManager.registerShadows(casters, receivers);
  }

  /** 选中 / 聚焦的 3D 环形准星：始终面向相机，带一次入场脉冲 */
  private buildFocusRing(): { group: THREE.Group; material: THREE.MeshBasicMaterial } {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({
      color: COLORS.cyan, transparent: true, opacity: 0.8, side: THREE.DoubleSide,
      depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    });
    group.add(
      new THREE.Mesh(new THREE.RingGeometry(2.55, 2.78, 48), material),
      new THREE.Mesh(new THREE.RingGeometry(1.55, 1.64, 48), material),
    );
    const cross: number[] = [];
    [-1, 1].forEach(s => {
      cross.push(s * 3.1, 0, 0, s * 4.0, 0, 0);
      cross.push(0, s * 3.1, 0, 0, s * 4.0, 0);
    });
    const crossGeo = new THREE.BufferGeometry();
    crossGeo.setAttribute('position', new THREE.Float32BufferAttribute(cross, 3));
    group.add(new THREE.LineSegments(crossGeo, new THREE.LineBasicMaterial({
      color: COLORS.cyan, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false,
    })));
    group.renderOrder = 8;
    group.visible = false;
    return { group, material };
  }

  private update(dt: number, elapsed: number): void {
    this.timeline.update(dt);
    const t = this.timeline.elapsed;
    const state = applyFrame(this.model, t, {
      clipping: store.state.clipping,
      clipProgress: store.state.clipProgress,
      wireframe: store.state.wireframe,
      elapsed,
      nightFactor: 1 - this.sceneManager.dayFactor,
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
    this.traffic.setDayFactor(this.sceneManager.dayFactor);
    this.traffic.setClipped(state.clip > 0.01 || store.state.clipping);
    this.traffic.update(dt);
    const reveal = this.innerOnly ? 0 : state.trafficLoad;
    this.deckDetails.setReveal(reveal);
    this.streetLights.setReveal(reveal);
    this.structuralDetails.setReveal(reveal);
    this.deckDetails.setDayFactor(this.sceneManager.dayFactor);
    this.streetLights.setDayFactor(this.sceneManager.dayFactor);
    this.structuralDetails.setDayFactor(this.sceneManager.dayFactor);
    this.sensors.setReveal(store.state.clipping ? 1 : state.sensorReveal);
    this.sensors.update(dt, elapsed);
    this.heat.update(elapsed);
    updateCableFlow(this.model, elapsed);
    this.cameraDirector.update(t, elapsed);
    this.sceneManager.setShadowSolid(state.solid);
    this.sceneManager.setBloomStrength(0.62 + 0.32 * state.flash);
    // 无选中对象时跳过 OutlinePass 全屏后处理，稳态帧率明显提升
    this.sceneManager.outline.enabled = this.sceneManager.outline.selectedObjects.length > 0;
    // 鼠标不动时仍每 0.5s 刷新悬停卡片里的实时测值
    this.hoverTimer += dt;
    if (this.hoverState && this.hoverTimer >= 0.5) {
      this.hoverTimer = 0;
      const { hit, x, y } = this.hoverState;
      this.onHover(hit, x, y);
    }
    // 选中标注：把点击瞬间的世界坐标逐帧投影，相机运镜时始终贴在构件上
    if (this.markerPoint) {
      const v = this.markerPoint.clone().project(this.sceneManager.camera);
      const rect = this.sceneManager.renderer.domElement.getBoundingClientRect();
      store.emit('pickMarker', {
        x: rect.left + (v.x * 0.5 + 0.5) * rect.width,
        y: rect.top + (-v.y * 0.5 + 0.5) * rect.height,
        visible: v.z > -1 && v.z < 1,
        label: this.markerLabel,
        focused: this.focusRing.visible,
      });
      this.markerActive = true;
      // 准星贴合命中点并朝向相机，入场 1.2s 有一次亮度 / 缩放脉冲
      this.focusAge += dt;
      this.focusRing.position.copy(this.markerPoint);
      this.focusRing.quaternion.copy(this.sceneManager.camera.quaternion);
      this.focusRing.scale.setScalar(1 + 0.13 * Math.sin(this.focusAge * 4.2));
      this.focusRingMat.opacity = 0.5 + 0.42 * Math.max(0, 1 - this.focusAge / 1.2);
    } else if (this.markerActive) {
      store.emit('pickMarker', null);
      this.markerActive = false;
      this.focusRing.visible = false;
    }
  }

  /** 悬停信息卡：把命中对象翻译成档案名称 + 结构属性 + 实时测值，不触发相机或档案切换 */
  private onHover(hit: PickHit | null, x: number, y: number): void {
    if (!hit) {
      this.hoverState = null;
      this.hoverTimer = 0;
      store.emit('hover', null);
      return;
    }
    this.hoverState = { hit, x, y };
    const info = hit.kind === 'vehicle' ? this.vehicleHover(hit, x, y)
      : hit.kind === 'sensor' ? this.sensorHover(hit, x, y)
        : this.componentHover(hit, x, y);
    store.emit('hover', info);
  }

  private componentHover(hit: PickHit, x: number, y: number): HoverInfo {
    const comp = this.componentByCode.get(hit.code);
    const seg = this.segmentByCode.get(hit.code);
    const cable = this.cableByCode.get(hit.code);
    const pts = this.pointsByComponent.get(hit.code) ?? [];
    const primary = pts[0];
    const rt = primary ? store.state.points[primary.pointCode] : undefined;
    const alarm = store.state.alarms.some(
      a => a.compCode === hit.code && (a.status === 'ACTIVE' || a.status === 'CONFIRMED'),
    );
    let meta = `${comp?.material ?? '结构构件'} · ${pts.length} 个测点`;
    if (seg) meta = `桩号 ${seg.chainage.toFixed(0)} m · ${seg.lengthM} m / ${seg.weightT} t${seg.isClosure ? ' · 合龙段' : ''} · ${pts.length} 测点`;
    if (cable) meta = `${cable.towerSide === 'L' ? '左塔' : '右塔'}${cable.face === 'LEFT' ? '左索面' : '右索面'} · 设计索力 ${cable.designForceMn.toFixed(3)} MN · ${pts.length} 测点`;
    const value = primary
      ? `${primary.pointName}${rt ? ` ${rt.value.toFixed(primary.decimals)} ${primary.unit}` : ' 等待数据'}${alarm ? ' · 存在活动告警' : ''}`
      : '静力构件 · 无实时监测点';
    return {
      kind: 'component', code: hit.code,
      title: comp?.compName ?? `构件 ${hit.code || '未编码'}`,
      meta, value,
      level: alarm ? 'ALARM' : (rt?.level ?? null),
      hint: '单击查看构件档案 · 双击聚焦',
      x, y,
    };
  }

  private sensorHover(hit: PickHit, x: number, y: number): HoverInfo {
    const code = this.sensors.pick(hit.instanceId ?? -1) ?? hit.code;
    const p = this.pointByCode.get(code);
    const rt = store.state.points[code];
    const ptype = p ? this.pointTypeByCode.get(p.ptypeCode) : undefined;
    const comp = p ? this.componentByCode.get(p.compCode) : undefined;
    const levelText = rt?.level === 'ALARM' ? '报警' : rt?.level === 'WARN' ? '预警' : '正常';
    return {
      kind: 'sensor', code,
      title: p?.pointName ?? `测点 ${code}`,
      meta: `${ptype?.ptypeName ?? '监测点'} · ${comp?.compName ?? p?.compCode ?? ''} · 阈值 ${p?.warnMax ?? '--'} / ${p?.alarmMax ?? '--'} ${p?.unit ?? ''}`,
      value: rt ? `${rt.value.toFixed(p?.decimals ?? 2)} ${p?.unit ?? rt.unit} · ${levelText}` : '等待实时数据',
      level: rt?.level ?? null,
      hint: '单击闪烁定位 · 双击聚焦',
      x, y,
    };
  }

  private vehicleHover(hit: PickHit, x: number, y: number): HoverInfo {
    const vid = this.traffic.pickVehicle(hit.object, hit.instanceId ?? -1);
    const v = vid ? this.traffic.getVehicle(vid) : undefined;
    const lane = v ? this.laneByCode.get(v.lane) : undefined;
    const limit = lane?.speedLimit ?? 80;
    return {
      kind: 'vehicle', code: vid ?? hit.code,
      title: v ? `${v.plate} · ${v.type === 'TRUCK' ? '货车' : '小客车'}` : `车辆 ${vid ?? ''}`,
      meta: v ? `${lane?.laneName ?? v.lane} · 限速 ${limit} km/h · 轴载 ${v.weightT.toFixed(1)} t` : '车辆轨迹实例',
      value: v ? `${v.speed.toFixed(0)} km/h · ${v.speed > limit ? '超速' : '正常'}` : '等待轨迹数据',
      level: v && v.speed > limit ? 'WARN' : null,
      hint: '单击锁定车辆 · 双击跟随聚焦',
      x, y,
    };
  }

  /** 双击沿当前视线推近到命中点，并暂停自动运镜 9s 供观察细节 */
  private onDoublePick(hit: PickHit): void {
    const p = hit.point;
    const dir = this.sceneManager.camera.position.clone().sub(p);
    if (dir.lengthSq() < 1) dir.set(1, 0.6, 1);
    dir.normalize();
    const dist = hit.kind === 'sensor' ? 64 : hit.kind === 'vehicle' ? 82 : 132;
    const camPos = p.clone().addScaledVector(dir, dist);
    camPos.y = Math.max(camPos.y, GEO.waterY + 14);
    this.cameraDirector.flyTo({
      vpCode: 'VP-FOCUS', vpName: '对象聚焦',
      camPos: { x: camPos.x, y: camPos.y, z: camPos.z },
      camTarget: { x: p.x, y: p.y, z: p.z }, fov: 36,
    }, 900, 9000);
    this.pinnedOutline = [hit.object];
    this.sceneManager.outline.selectedObjects = [hit.object];
    this.markerPoint = hit.point.clone();
    this.markerLabel = this.componentByCode.get(hit.code)?.compName || hit.code || '聚焦对象';
    this.focusAge = 0;
    this.focusRing.visible = true;
    store.emit('toast', {
      level: 'info',
      text: `已聚焦 ${hit.kind === 'vehicle' ? '车辆' : hit.code || '构件'}，9 秒后恢复巡检运镜`,
    });
  }

  private onPick(hit: PickHit): void {
    this.pinnedOutline = [hit.object];
    this.markerPoint = hit.point.clone();
    this.focusAge = 0;
    this.focusRing.visible = true;
    this.markerLabel = hit.kind === 'component'
      ? (this.componentByCode.get(hit.code)?.compName || hit.code || '桥面构件')
      : hit.kind === 'sensor'
        ? (this.pointByCode.get(this.sensors.pick(hit.instanceId ?? -1) ?? '')?.pointName ?? hit.code)
        : (this.traffic.getVehicle(this.traffic.pickVehicle(hit.object, hit.instanceId ?? -1) ?? '')?.plate ?? '车辆');
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

  /** 昼夜场景切换：天空/雾/灯光/水面/后处理由 SceneManager 平滑插值，UI 同步主题 */
  setDayFactor(v: number): void {
    const f = Math.max(0, Math.min(1, v));
    store.patch({ dayFactor: f });
    this.sceneManager.setDayFactor(f);
  }

  setComponentVisible(code: string, v: boolean): void { this.model.registry.setVisible(code, v); }

  setInnerOnly(v: boolean): void {
    this.innerOnly = v;
    this.model.registry.setLayerVisible('PAVEMENT', !v);
    this.model.registry.setLayerVisible('RAILING', !v);
    this.setClipping(v);
  }

  setClipping(v: boolean): void {
    store.patch({ clipping: v, clipProgress: v ? 1 : 0 });
    this.clipping.animateTo(v ? 1 : 0, 2200);
    store.emit('toast', {
      level: 'info',
      text: v ? '结构透视已开启 · 拖动滑块可查看箱梁内部断面' : '结构透视已关闭 · 恢复完整桥面',
    });
  }

  setClipProgress(p: number): void {
    store.patch({ clipProgress: p, clipping: true });
    this.clipping.setProgress(p);
  }

  setClipDirection(dir: 'AXIAL' | 'CROSS'): void {
    store.patch({ clipDirection: dir });
    this.clipping.setDirection(dir);
    store.emit('toast', {
      level: 'info', text: dir === 'AXIAL' ? '剖切方向 · 沿桥轴（横断面）' : '剖切方向 · 横向（纵断面）',
    });
  }

  focus(vpCode: string, silent = false): void {
    const vp = this.bootstrap.viewpoints.find(v => v.vpCode === vpCode) ?? VIEWPOINTS.find(v => v.vpCode === vpCode);
    if (!vp) return;
    this.cameraDirector.flyTo(vp);
    if (!silent) store.emit('toast', { level: 'info', text: `已切换视点 · ${vp.vpName}` });
  }

  /** Esc：清除选中/悬停并飞回全景，让双击聚焦有明确的退出路径 */
  clearFocus(): void {
    this.pinnedOutline = [];
    this.hoverState = null;
    this.markerPoint = null;
    this.focusRing.visible = false;
    this.focusAge = 0;
    this.sceneManager.outline.selectedObjects = [];
    store.emit('pickMarker', null);
    store.emit('hover', null);
    store.select(null, []);
    this.focus('VP-OVERVIEW', true);
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
    this.pinnedOutline = [obj];
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
