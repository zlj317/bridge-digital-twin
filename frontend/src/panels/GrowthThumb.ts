import type { AppActions } from '../app/actions';
import { COPY } from '../config';
import type { AppState } from '../store/Store';

const PALETTE = ['#00E5FF', '#7BFFCF', '#FFD166', '#FF6B6B'];

/** VIS-013 / 2.4.4 结构生长缩略图：2D 彩色点云，点击重播骨架生长 */
export function createGrowthThumb(actions: AppActions): { el: HTMLElement; update: (state: AppState) => void } {
  const el = document.createElement('section');
  el.className = 'panel';
  el.innerHTML = `<div class="panel__head"><span class="panel__icon"></span><span class="panel__title">${COPY.growthTitle}</span></div>
    <div class="panel__body">
      <canvas class="growth-canvas" width="280" height="130"></canvas>
      <div class="growth-tip">点击缩略图重播骨架生长</div>
    </div>`;
  const canvas = el.querySelector('canvas')!;
  const ctx = canvas.getContext('2d')!;
  el.querySelector('.growth-canvas')!.addEventListener('click', () => actions.replay());

  const dots = Array.from({ length: 240 }, () => ({
    x: Math.random(), y: Math.random(), phase: Math.random(),
  }));
  let progress = 0;

  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(6, 18, 40, 0.65)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // 桥梁轮廓（塔 + 梁 + 索）
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, 92); ctx.lineTo(260, 92);
    ctx.moveTo(80, 92); ctx.lineTo(80, 18);
    ctx.moveTo(200, 92); ctx.lineTo(200, 18);
    ctx.moveTo(80, 18); ctx.lineTo(200, 18);
    for (let i = 1; i <= 8; i++) {
      ctx.moveTo(80, 18 + i * 3); ctx.lineTo(80 + i * 9, 92);
      ctx.moveTo(200, 18 + i * 3); ctx.lineTo(200 - i * 9, 92);
    }
    ctx.stroke();
    dots.forEach(d => {
      if (d.phase > progress) return;
      const c = PALETTE[Math.min(3, Math.floor(d.phase * 4))];
      ctx.fillStyle = c;
      ctx.globalAlpha = 0.35 + 0.65 * (1 - d.phase);
      ctx.fillRect(20 + d.x * 240, 18 + d.y * 74, 2, 2);
    });
    ctx.globalAlpha = 1;
  };

  const loop = () => {
    progress += (1 - progress) * 0.012;
    if (progress > 0.999) progress = 0.12;
    draw();
    requestAnimationFrame(loop);
  };
  loop();

  return {
    el,
    update: (state: AppState) => {
      // 幕一重播时与主视口同步重新开始生长
      if (state.actIndex === 0 && state.playing) progress = Math.min(progress, 0.15);
    },
  };
}
