import { API_BASE } from '../config';
import type {
  ApiResponse, Bootstrap, BridgeMetrics, Alarm, HistorySeries, HistoryStatistics,
  RealtimePoint, SimPlan, Inspection,
} from '../types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
  const body = (await res.json()) as ApiResponse<T>;
  if (body.code !== 0) throw new Error(`${body.msg} (${path})`);
  return body.data;
}

const q = (params: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined) s.set(k, String(v)); });
  return s.toString();
};

/** 文档第 8 章接口清单（live 模式） */
export const api = {
  getBootstrap: (code: string) => request<Bootstrap>(`/bridges/${code}/bootstrap`),
  getBridge: (code: string) => request<Bootstrap['bridge']>(`/bridges/${code}`),
  getComponents: (code: string, type?: string) =>
    request<Bootstrap['components']>(`/bridges/${code}/components?${q({ type })}`),
  getCables: (code: string) => request<Bootstrap['cables']>(`/bridges/${code}/cables`),
  getSegments: (code: string) => request<Bootstrap['segments']>(`/bridges/${code}/segments`),
  getLanes: (code: string) => request<Bootstrap['lanes']>(`/bridges/${code}/lanes`),
  getViewpoints: (code: string) => request<Bootstrap['viewpoints']>(`/bridges/${code}/viewpoints`),
  getClipPlans: (code: string) => request<Bootstrap['clipPlans']>(`/bridges/${code}/clip-plans`),
  getAnimStages: (code: string) => request<Bootstrap['animStages']>(`/bridges/${code}/anim-stages`),
  getMetrics: (code: string) => request<BridgeMetrics>(`/bridges/${code}/metrics`),
  getPoints: (code: string, group?: string) =>
    request<Bootstrap['points']>(`/points?${q({ bridgeCode: code, groupCode: group })}`),
  getRealtime: (pointCode: string) => request<RealtimePoint>(`/points/${pointCode}/realtime`),
  getAlarms: (code: string) => request<{ list: Alarm[]; total: number }>(`/alarms?${q({ bridgeCode: code })}`),
  confirmAlarm: (alarmCode: string) => request<Alarm>(`/alarms/${alarmCode}/confirm`, { method: 'POST' }),
  ignoreAlarm: (alarmCode: string) => request<Alarm>(`/alarms/${alarmCode}/ignore`, { method: 'POST' }),
  getInspections: (code: string) => request<Inspection[]>(`/bridges/${code}/inspections`),
  getSimPlans: () => request<SimPlan[]>('/sim/plans'),
  startSim: (planCode: string) => request<SimPlan>(`/sim/plans/${planCode}/start`, { method: 'POST' }),
  stopSim: (planCode: string) => request<SimPlan>(`/sim/plans/${planCode}/stop`, { method: 'POST' }),
  setDensity: (planCode: string, density: number) =>
    request<SimPlan>(`/sim/plans/${planCode}/density?density=${density}`, { method: 'PUT' }),
  replay: (code: string) => request<{ ok: boolean }>(`/anim/${code}/replay`, { method: 'POST' }),
  getHistorySeries: (params: { points: string; start: number; end: number; interval: string; aggr?: string }) =>
    request<HistorySeries[]>(`/history/series?${q(params)}`),
  getHistoryStatistics: (params: { point: string; start: number; end: number }) =>
    request<HistoryStatistics>(`/history/statistics?${q(params)}`),
  getHealth: () => fetch('/q/health').then(async res => {
    if (!res.ok) throw new Error(`HTTP ${res.status} /q/health`);
    return (await res.json()) as { status: string; components: Record<string, string> };
  }),
};
