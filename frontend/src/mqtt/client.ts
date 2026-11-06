import mqtt, { type MqttClient } from 'mqtt';
import { BRIDGE_CODE, MQTT_WS_URL } from '../config';
import type { Alarm, BridgeMetrics, RealtimePoint, TrafficStat, VehicleState } from '../types';

export interface MqttHooks {
  onConnected: () => void;
  onSnapshot: (metrics: BridgeMetrics, points: RealtimePoint[]) => void;
  onTraffic: (stat: TrafficStat, vehicles: VehicleState[]) => void;
  onAlarm: (alarm: Alarm) => void;
  onRecover: (alarm: Alarm) => void;
  onFallback: (reason: string) => void;
}

/** 文档 7.9 主题：整桥快照 / 车流稀疏状态 / 告警 / 恢复 / 控制指令 */
export const TOPICS = {
  snapshot: `realtime/bridge/${BRIDGE_CODE}`,
  traffic: `traffic/vehicle/${BRIDGE_CODE}`,
  alarm: 'alarm/bridge/event',
  recover: 'alarm/bridge/recover',
  simCommand: 'sim/bridge/command',
  animCommand: 'anim/bridge/command',
  heartbeat: 'system/heartbeat/web',
} as const;

export class MqttDataSource {
  private client: MqttClient | null = null;
  private hooks: MqttHooks | null = null;
  private fallbackSent = false;
  private heartbeat: number | null = null;

  connect(hooks: MqttHooks): void {
    this.hooks = hooks;
    const client = mqtt.connect(MQTT_WS_URL, {
      clientId: `bdt-web-${Math.random().toString(16).slice(2, 10)}`,
      clean: true,
      reconnectPeriod: 3000,
      connectTimeout: 6000,
      keepalive: 30,
    });
    this.client = client;

    client.on('connect', () => {
      client.subscribe([TOPICS.snapshot, TOPICS.traffic, TOPICS.alarm, TOPICS.recover], { qos: 1 });
      hooks.onConnected();
      this.heartbeat = window.setInterval(() => this.publish(TOPICS.heartbeat, { ts: Date.now() }), 15000);
    });
    client.on('message', (topic, payload) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(payload.toString()) as Record<string, unknown>; } catch { return; }
      if (topic.startsWith('realtime/bridge/')) {
        hooks.onSnapshot(msg.metrics as BridgeMetrics, (msg.points ?? []) as RealtimePoint[]);
      } else if (topic.startsWith('traffic/vehicle/')) {
        hooks.onTraffic(msg.stat as TrafficStat, (msg.vehicles ?? []) as VehicleState[]);
      } else if (topic === TOPICS.alarm) {
        hooks.onAlarm(msg as unknown as Alarm);
      } else if (topic === TOPICS.recover) {
        hooks.onRecover(msg as unknown as Alarm);
      }
    });
    client.on('error', err => this.fallback(err.message));
    window.setTimeout(() => { if (!client.connected) this.fallback('MQTT 连接超时'); }, 8000);
  }

  private fallback(reason: string): void {
    if (this.fallbackSent) return;
    this.fallbackSent = true;
    this.hooks?.onFallback(reason);
  }

  publish(topic: string, payload: unknown): void {
    this.client?.publish(topic, JSON.stringify(payload), { qos: topic.includes('command') ? 1 : 0 });
  }

  /** 底部车流滑块 → 仿真控制指令（TRA-003） */
  setDensity(pct: number): void {
    this.publish(TOPICS.simCommand, {
      bridgeCode: BRIDGE_CODE, action: 'SET_DENSITY', densityPct: pct, ts: Date.now(),
    });
  }

  /** 动画重播指令（BRG-009 / VIS-001） */
  replay(): void {
    this.publish(TOPICS.animCommand, { bridgeCode: BRIDGE_CODE, action: 'REPLAY', ts: Date.now() });
  }

  disconnect(): void {
    if (this.heartbeat !== null) clearInterval(this.heartbeat);
    this.client?.end(true);
    this.client = null;
    this.hooks = null;
  }
}

export const mqttSource = new MqttDataSource();
