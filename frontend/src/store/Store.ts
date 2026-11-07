import { INITIAL_METRICS } from '../config';
import type {
  ActCode, Alarm, Bootstrap, BridgeMetrics, PointLevel, RealtimePoint, SelectedContext,
  TrafficStat, VehicleState, ViewKey,
} from '../types';

/** 全局唯一状态机：文档 4 章「selectedContext 统一管理，禁止面板互相直接调用」 */
export interface AppState {
  bootstrap: Bootstrap | null;
  metrics: BridgeMetrics;
  points: Record<string, RealtimePoint>;
  alarms: Alarm[];
  vehicles: VehicleState[];
  traffic: TrafficStat;
  selected: SelectedContext;
  view: ViewKey;
  actIndex: number;
  actCode: ActCode;
  playing: boolean;
  speed: number;
  density: number;
  clipping: boolean;
  clipProgress: number;
  clipDirection: 'AXIAL' | 'CROSS';
  wireframe: boolean;
  dayFactor: number;
  immersive: boolean;
  dataMode: 'mock' | 'live';
  loading: { progress: number; step: string };
  fps: number;
  degraded: boolean;
}

/** 3D 悬停卡片的结构化数据：名称、属性、实时值与操作提示分层展示 */
export interface HoverInfo {
  kind: 'component' | 'vehicle' | 'sensor';
  code: string;
  title: string;
  meta: string;
  value: string;
  level: PointLevel | null;
  hint: string;
  x: number;
  y: number;
}

export type AppEvents = {
  alarm: Alarm;
  recover: Alarm;
  pick: { kind: 'component' | 'vehicle' | 'sensor'; code: string; payload?: unknown };
  toast: { level: 'info' | 'warn' | 'error'; text: string };
  hover: HoverInfo | null;
  hoverComponent: string | null;
  pickMarker: { x: number; y: number; label: string; visible: boolean; focused: boolean } | null;
  viewportReady: undefined;
  replay: undefined;
  seek: number;
};

class Emitter<E extends Record<string, unknown>> {
  private handlers: { [K in keyof E]?: Set<(payload: E[K]) => void> } = {};

  on<K extends keyof E>(key: K, cb: (payload: E[K]) => void): () => void {
    const set = this.handlers[key] ?? new Set<(payload: E[K]) => void>();
    set.add(cb);
    this.handlers[key] = set;
    return () => set.delete(cb);
  }

  emit<K extends keyof E>(key: K, payload: E[K]): void {
    this.handlers[key]?.forEach(cb => cb(payload));
  }
}

type Listener = (state: AppState, changed: (keyof AppState)[]) => void;

class AppStore extends Emitter<AppEvents> {
  readonly state: AppState = {
    bootstrap: null,
    metrics: { ...INITIAL_METRICS },
    points: {},
    alarms: [],
    vehicles: [],
    traffic: { vehicleCount: 72, avgSpeed: 58, occupancy: 0.62, eventCount: 1 },
    selected: { bridgeCode: 'BR-DEMO-01', compCode: null, pointCodes: [], act: 'ACT-1', timeCursor: Date.now() },
    view: 'V1',
    actIndex: 0,
    actCode: 'ACT-1',
    playing: true,
    speed: 1,
    density: 62,
    clipping: false,
    clipProgress: 0,
    clipDirection: 'AXIAL',
    wireframe: false,
    dayFactor: 0,
    immersive: false,
    dataMode: 'mock',
    loading: { progress: 0, step: '初始化' },
    fps: 60,
    degraded: false,
  };

  private listeners = new Set<Listener>();

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  patch(partial: Partial<AppState>): void {
    const changed = Object.keys(partial) as (keyof AppState)[];
    Object.assign(this.state, partial);
    this.listeners.forEach(cb => cb(this.state, changed));
  }

  select(compCode: string | null, pointCodes: string[] = []): void {
    this.patch({
      selected: { ...this.state.selected, compCode, pointCodes, timeCursor: Date.now() },
    });
  }

  setLoading(progress: number, step: string): void {
    this.patch({ loading: { progress, step } });
  }
}

export const store = new AppStore();
