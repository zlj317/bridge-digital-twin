import { BRIDGE_CODE, CABLE_TABLE, GEO, INITIAL_METRICS, POINTS } from '../config';
import type {
  Alarm, BridgeMetrics, HistorySeries, HistoryStatistics, PointLevel,
  RealtimePoint, TrafficStat, VehicleState, VehicleType,
} from '../types';

export interface DataSourceHooks {
  onMetrics: (metrics: BridgeMetrics) => void;
  onPoints: (points: RealtimePoint[]) => void;
  onTraffic: (stat: TrafficStat, vehicles: VehicleState[]) => void;
  onAlarm: (alarm: Alarm) => void;
  onRecover: (alarm: Alarm) => void;
}

const LANES = ['LN-UP-1', 'LN-UP-2', 'LN-UP-3', 'LN-DN-1', 'LN-DN-2', 'LN-DN-3'];
const smooth = (base: number, amp: number, period: number, phase: number, t: number) =>
  base + amp * Math.sin((2 * Math.PI * t) / period + phase)
      + amp * 0.14 * Math.sin((2 * Math.PI * t) / (period * 0.37) + phase * 1.7);

const levelOf = (v: number, warnMax: number, alarmMax: number): PointLevel =>
  v >= alarmMax ? 'ALARM' : v >= warnMax ? 'WARN' : 'NORMAL';

/**
 * 本地数据源（SHM-009 / TRA-001 的前端同构实现）。
 * 无中间件时完整驱动面板、热力着色、传感器三态、告警生命周期，
 * 数据格式与文档 7.9 MQTT 报文一致，切 live 时可无缝替换为真实链路。
 */
export class MockDataSource {
  private hooks: DataSourceHooks | null = null;
  private timers: number[] = [];
  private t0 = Date.now();
  private seq = 0;
  private density = 62;
  private vehicles = new Map<string, VehicleState>();
  private overlimitLeft = 0;
  private overlimitStreak = 0;
  private normalStreak = 0;
  private activeAlarm: Alarm | null = null;
  private metricSeed = { ...INITIAL_METRICS };

  start(hooks: DataSourceHooks): void {
    this.hooks = hooks;
    this.seedVehicles();
    this.pushTraffic();
    this.pushShm();
    this.timers.push(window.setInterval(() => this.pushShm(), 2000));
    this.timers.push(window.setInterval(() => this.pushTraffic(), 1000));
    this.timers.push(window.setInterval(() => this.autoAlarm(), 60000));
  }

  stop(): void {
    this.timers.forEach(t => clearInterval(t));
    this.timers = [];
    this.hooks = null;
  }

  setDensity(pct: number): void {
    this.density = Math.max(0, Math.min(100, pct));
    this.reconcileVehicles();
    this.pushTraffic();
  }

  /** 造超限数据：连续 3 次触发告警，随后连续 3 次正常自动恢复（ALM-001/004） */
  triggerOverlimit(): void {
    this.overlimitLeft = 3;
  }

  private get elapsed(): number { return (Date.now() - this.t0) / 1000; }

  private seedVehicles(): void {
    for (let i = 0; i < 36; i++) this.spawnVehicle(i);
  }

  private spawnVehicle(i: number): void {
    const lane = LANES[i % LANES.length];
    const type: VehicleType = Math.random() < 0.15 ? 'TRUCK' : 'CAR';
    const speed = 40 + Math.random() * 40;
    const vid = `V-${String(this.seq++).padStart(4, '0')}`;
    this.vehicles.set(vid, {
      vid,
      lane,
      t: (i * 0.137 + Math.random() * 0.05) % 1,
      speed,
      type,
      plate: `桥A·${String(10000 + this.seq * 37).slice(-5)}`,
      weightT: type === 'TRUCK' ? 25 + Math.random() * 20 : 1.5 + Math.random() * 0.8,
      enterAt: Date.now(),
    });
  }

  private reconcileVehicles(): void {
    const target = Math.round((this.density / 62) * 36);
    while (this.vehicles.size < target) this.spawnVehicle(this.vehicles.size);
    while (this.vehicles.size > target) {
      const first = this.vehicles.keys().next().value as string | undefined;
      if (!first) break;
      this.vehicles.delete(first);
    }
  }

  private pushTraffic(): void {
    if (!this.hooks) return;
    const t = this.elapsed;
    const dt = 1;
    const removed: string[] = [];
    this.vehicles.forEach(v => {
      v.t += (v.speed / 3.6 / GEO.length) * dt;
      if (v.t > 1) removed.push(v.vid);
    });
    removed.forEach(id => {
      this.vehicles.delete(id);
      this.spawnVehicle(this.vehicles.size);
    });
    // 稳态自然波动 30~40 台
    const wave = Math.round(Math.sin(t / 9) * 2);
    const want = Math.round((this.density / 62) * 36) + wave;
    while (this.vehicles.size < want) this.spawnVehicle(this.vehicles.size);
    while (this.vehicles.size > want) {
      const first = this.vehicles.keys().next().value as string | undefined;
      if (!first) break;
      this.vehicles.delete(first);
    }
    const list = [...this.vehicles.values()];
    const avgSpeed = list.reduce((s, v) => s + v.speed, 0) / Math.max(1, list.length);
    const stat: TrafficStat = {
      vehicleCount: list.length,
      avgSpeed: Number((avgSpeed + smooth(0, 2.5, 24, 0.6, t)).toFixed(1)),
      occupancy: Number(Math.min(0.98, (this.density / 100) * 0.95).toFixed(2)),
      eventCount: INITIAL_METRICS.eventCount + (this.activeAlarm ? 1 : 0),
    };
    this.hooks.onTraffic(stat, list.map(v => ({ ...v })));
  }

  private pushShm(): void {
    if (!this.hooks) return;
    const t = this.elapsed;
    const ts = Date.now();
    const cableBase = CABLE_TABLE.map(c => c.value);

    const points: RealtimePoint[] = POINTS.map((p, i) => {
      let value: number;
      switch (p.ptypeCode) {
        case 'CABLE_FORCE': {
          const idx = Number(p.pointCode.slice(-2)) - 1;
          value = (cableBase[idx] ?? 1.29) + smooth(0, 0.008, 60, i * 0.31, t)
            + (this.overlimitLeft > 0 && idx === 2 ? 0.075 : 0);
          break;
        }
        case 'STRESS':
          value = 42 + smooth(0, 3.2, 40, i * 0.17, t);
          break;
        case 'DEFLECTION': value = 0.86 + smooth(0, 0.04, 55, i, t); break;
        case 'TEMPERATURE': value = 21.4 + smooth(0, 1.6, 300, i, t); break;
        case 'WIND_SPEED': value = 3.2 + smooth(0, 1.1, 38, i, t); break;
        case 'FREQUENCY': value = 0.48 + smooth(0, 0.02, 26, i, t); break;
        case 'DAMPING': value = 2.1 + smooth(0, 0.12, 70, i, t); break;
        case 'BEARING_DISP': value = 12 + smooth(0, 2.4, 90, i, t); break;
        case 'CRACK': value = 0.08 + smooth(0, 0.015, 120, i, t); break;
        default: value = 0;
      }
      return {
        pointCode: p.pointCode, compCode: p.compCode, value: Number(value.toFixed(4)),
        unit: p.unit, ts, level: levelOf(value, p.warnMax, p.alarmMax),
      };
    });

    const maxCable = points.filter(p => p.pointCode.startsWith('PTS-C-'))
      .reduce((mx, p) => Math.max(mx, p.value), 0);
    const maxStress = points.filter(p => p.pointCode.startsWith('PTS-STR-'))
      .reduce((mx, p) => Math.max(mx, p.value), 0);

    const metrics: BridgeMetrics = {
      ...this.metricSeed,
      stress: Number(maxStress.toFixed(1)),
      cableForce: Math.round(maxCable * 1000),
      deflection: Number((0.86 + smooth(0, 0.03, 55, 0, t)).toFixed(2)),
      temperature: Number((21.4 + smooth(0, 1.6, 300, 0.2, t)).toFixed(1)),
      windSpeed: Number((3.2 + smooth(0, 1.1, 38, 1, t)).toFixed(1)),
      frequency: Number((0.48 + smooth(0, 0.02, 26, 0.8, t)).toFixed(2)),
      damping: Number((2.1 + smooth(0, 0.12, 70, 1.4, t)).toFixed(1)),
      trafficPerHour: Math.round(1286 + smooth(0, 90, 120, 0.3, t)),
      fatigueIndex: Math.round(Math.min(99, 38 + (this.density - 62) * 0.22)),
      healthScore: Math.max(60, 96 - (this.activeAlarm ? 6 : 0)),
      healthGrade: this.activeAlarm ? 'B' : 'A',
      avgSpeed: 58,
      occupancy: Number((this.density / 100).toFixed(2)),
      eventCount: 1 + (this.activeAlarm ? 1 : 0),
      ts,
    };
    this.evaluateAlarm(points, ts);
    this.hooks.onMetrics(metrics);
    this.hooks.onPoints(points);
  }

  private evaluateAlarm(points: RealtimePoint[], ts: number): void {
    if (!this.hooks) return;
    const target = points.find(p => p.pointCode === 'PTS-STR-03');
    if (!target) return;
    // 演示态：造数阶段把该测点抬高到告警区
    const forced = this.overlimitLeft > 0;
    const value = forced ? 58.6 : target.value;
    if (forced) {
      target.value = value;
      target.level = levelOf(value, 55, 70);
      this.overlimitLeft--;
      this.overlimitStreak++;
      this.normalStreak = 0;
    } else {
      this.normalStreak++;
      this.overlimitStreak = 0;
    }

    if (this.overlimitStreak >= 3 && !this.activeAlarm) {
      this.activeAlarm = {
        alarmCode: `ALM-${ts}`, bridgeCode: BRIDGE_CODE, compCode: 'B-03', pointCode: 'PTS-STR-03',
        alarmLevel: 'WARN', title: '箱梁 B-03 应变预警',
        content: '测点 PTS-STR-03 连续 3 次超过预警阈值 55 MPa，建议复核涂层缺陷',
        alarmValue: value, thresholdValue: 55, unit: 'MPa', status: 'ACTIVE',
        triggerTime: new Date(ts).toISOString(),
      };
      this.hooks.onAlarm(this.activeAlarm);
    }
    if (this.activeAlarm && this.normalStreak >= 3) {
      const recovered: Alarm = { ...this.activeAlarm, status: 'RECOVERED' };
      this.hooks.onRecover(recovered);
      this.activeAlarm = null;
      this.normalStreak = 0;
    }
  }

  private autoAlarm(): void {
    if (!this.activeAlarm && this.overlimitLeft === 0) this.triggerOverlimit();
  }

  /** RPT-001：迷你图 / 历史回放用，24h 平滑序列 */
  getHistorySeries(pointCodes: string[], hours = 24, samples = 240): HistorySeries[] {
    const now = Date.now();
    return pointCodes.map(code => {
      const p = POINTS.find(x => x.pointCode === code);
      const base = p?.ptypeCode === 'CABLE_FORCE'
        ? (CABLE_TABLE.find(c => c.pointCode === code)?.value ?? 1.29)
        : p?.ptypeCode === 'STRESS' ? 42 : 1;
      const amp = base * 0.012;
      const pts: [number, number][] = Array.from({ length: samples }, (_, i) => {
        const ts = now - hours * 3600_000 + (i / (samples - 1)) * hours * 3600_000;
        const v = base + amp * Math.sin((i / samples) * Math.PI * 6 + code.length)
          + amp * 0.25 * Math.sin((i / samples) * Math.PI * 41);
        return [ts, Number(v.toFixed(4))];
      });
      return { pointCode: code, unit: p?.unit ?? '', points: pts };
    });
  }

  /** RPT-003 区间统计 */
  getHistoryStatistics(pointCode: string): HistoryStatistics {
    const series = this.getHistorySeries([pointCode])[0];
    const vals = series.points.map(p => p[1]).sort((a, b) => a - b);
    const sum = vals.reduce((s, v) => s + v, 0);
    return {
      pointCode,
      count: vals.length,
      max: vals[vals.length - 1],
      min: vals[0],
      avg: sum / vals.length,
      p95: vals[Math.floor(vals.length * 0.95)],
      exceedCount: 0,
    };
  }
}

export const mockSource = new MockDataSource();
