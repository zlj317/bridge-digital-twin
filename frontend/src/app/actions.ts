import type { ViewKey } from '../types';

/** 面板 → 应用层契约（面板之间不互相调用，统一经 Store + Actions） */
export interface AppActions {
  setView: (view: ViewKey) => void;
  setPlay: (playing: boolean) => void;
  replay: () => void;
  setSpeed: (v: number) => void;
  seek: (actIndex: number) => void;
  setDensity: (pct: number) => void;
  setClipping: (enabled: boolean) => void;
  setClipProgress: (p: number) => void;
  setClipDirection: (dir: 'AXIAL' | 'CROSS') => void;
  setWireframe: (v: boolean) => void;
  setDayFactor: (v: number) => void;
  setImmersive: (v: boolean) => void;
  setInnerOnly: (v: boolean) => void;
  setComponentVisible: (code: string, visible: boolean) => void;
  focusViewpoint: (vpCode: string) => void;
  focusComponent: (code: string) => void;
  selectComponent: (code: string) => void;
  screenshot: () => void;
  fullscreen: () => void;
  simulateAlarm: () => void;
  showPointTrend: (pointCode: string) => void;
  confirmAlarm: (alarmCode: string) => void;
  ignoreAlarm: (alarmCode: string) => void;
}
