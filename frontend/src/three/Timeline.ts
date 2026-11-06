import { ACTS } from '../config';
import type { ActCode } from '../types';

/** 文档 3.7 统一时序：单一 elapsed 驱动所有 progress，暂停/倍速只改 timeScale */
export class Timeline {
  elapsed = 0;
  timeScale = 1;
  paused = false;
  private frameCb?: (t: number, actCode: ActCode, actIndex: number) => void;

  onFrame(cb: (t: number, actCode: ActCode, actIndex: number) => void): void { this.frameCb = cb; }

  get actIndex(): number {
    if (this.elapsed < 4500) return 0;
    if (this.elapsed < 7500) return 1;
    if (this.elapsed < 9500) return 2;
    if (this.elapsed < 12500) return 3;
    return 4;
  }

  get actCode(): ActCode { return ACTS[this.actIndex].code; }

  update(dt: number): void {
    if (!this.paused) this.elapsed += dt * 1000 * this.timeScale;
    this.frameCb?.(this.elapsed, this.actCode, this.actIndex);
  }

  /** 点击时间轴节点：立即跳到该幕结束状态，不重播中间过程 */
  seekToActEnd(index: number): void {
    this.elapsed = ACTS[Math.max(0, Math.min(4, index))].endMs || 12500;
    this.frameCb?.(this.elapsed, this.actCode, this.actIndex);
  }

  replay(): void {
    this.elapsed = 0;
    this.paused = false;
    this.frameCb?.(0, 'ACT-1', 0);
  }

  setSpeed(v: number): void { this.timeScale = Math.max(0.5, Math.min(2, v)); }
  setPaused(v: boolean): void { this.paused = v; }
}
