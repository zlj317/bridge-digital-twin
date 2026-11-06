import * as THREE from 'three';
import { COLORS } from '../config';
import type { PointLevel, RealtimePoint } from '../types';

const NORMAL = new THREE.Color(0xffffff);
const WARN = new THREE.Color(COLORS.warnYellow);
const ALARM = new THREE.Color(COLORS.red);
const CYAN = new THREE.Color(COLORS.cyan);

/** 文档 VIS-008：测点值映射构件颜色，正常→预警黄→告警红，2s 刷新 */
export class HeatMapper {
  private levels: PointLevel[] = [];
  private alarmIndexes: number[] = [];
  private cableAlarm: PointLevel = 'NORMAL' as PointLevel;

  constructor(
    private readonly shell: THREE.InstancedMesh,
    private readonly cableMat: THREE.MeshStandardMaterial,
    private readonly segmentCodes: string[],
  ) {
    for (let i = 0; i < segmentCodes.length; i++) this.shell.setColorAt(i, NORMAL);
    if (this.shell.instanceColor) this.shell.instanceColor.needsUpdate = true;
  }

  apply(points: RealtimePoint[]): void {
    const index = new Map(this.segmentCodes.map((c, i) => [c, i]));
    this.levels = this.segmentCodes.map(() => 'NORMAL');
    this.cableAlarm = 'NORMAL';
    points.forEach(p => {
      if (p.pointCode.startsWith('PTS-C-')) {
        if (p.level === 'ALARM' || (p.level === 'WARN' && this.cableAlarm === 'NORMAL')) this.cableAlarm = p.level;
        return;
      }
      const i = index.get(p.compCode);
      if (i === undefined) return;
      const cur = this.levels[i];
      if (p.level === 'ALARM' || (p.level === 'WARN' && cur === 'NORMAL')) this.levels[i] = p.level;
    });
    this.alarmIndexes = [];
    this.levels.forEach((lv, i) => {
      if (lv === 'ALARM') this.alarmIndexes.push(i);
      this.shell.setColorAt(i, lv === 'ALARM' ? ALARM : lv === 'WARN' ? WARN : NORMAL);
    });
    if (this.shell.instanceColor) this.shell.instanceColor.needsUpdate = true;
    const cableLevel = this.cableAlarm as PointLevel;
    this.cableMat.emissive.copy(cableLevel === 'ALARM' ? ALARM : cableLevel === 'WARN' ? WARN : CYAN);
  }

  /** 告警态红色脉冲 */
  update(elapsed: number): void {
    if (!this.alarmIndexes.length) return;
    const k = 0.55 + 0.45 * Math.abs(Math.sin(elapsed * 3));
    this.alarmIndexes.forEach(i => this.shell.setColorAt(i, ALARM.clone().lerp(NORMAL, 1 - k)));
    if (this.shell.instanceColor) this.shell.instanceColor.needsUpdate = true;
  }
}
