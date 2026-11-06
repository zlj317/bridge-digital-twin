import type { AppActions } from '../app/actions';
import { COPY, HUD_ACTS, LEGEND } from '../config';
import type { AppState } from '../store/Store';
import type { PanelView } from './types';

const legendShape: Record<string, string> = {
  line: 'legend__line', rect: 'legend__rect', block: 'legend__block',
  dot: 'legend__dot', dash: 'legend__dash',
};

/** 文档 2.6：四幕时间轴 + 图例 5 项 + 车流模拟控件 + 左右进度条 */
export function createBottomHud(actions: AppActions): PanelView {
  const el = document.createElement('footer');
  el.className = 'hud';
  el.innerHTML = `
    <div class="hud__box">
      <div class="hud__label">五幕序列 · 12.5s</div>
      <div class="hud__ctrl">
        <button class="play-btn" data-act="play" title="播放/暂停">❚❚</button>
        <button class="tool-btn" data-act="replay" title="重播">重播</button>
        <button class="tool-btn" data-act="speed" title="倍速">1.0x</button>
      </div>
    </div>

    <div class="hud__center">
      <div class="timeline">
        <div class="timeline__line"></div>
        ${HUD_ACTS.map((a, i) => `<button class="timeline__node" data-seek="${i}">
          <span class="timeline__dot"></span><span>${a.name}</span>
        </button>`).join('')}
      </div>
      <div class="traffic-ctrl">
        <button class="round-btn" data-act="density-minus" title="降低密度">−</button>
        <div class="progress-slot"><div class="progress-slot__fill" data-fill="left" style="width:62%"></div></div>
        <span class="traffic-ctrl__label">${COPY.trafficSim}</span>
        <input type="range" min="0" max="100" value="62" data-role="density" title="车流密度" />
        <span class="traffic-ctrl__value" data-role="density-value">62%</span>
        <div class="progress-slot"><div class="progress-slot__fill" data-fill="right" style="width:62%"></div></div>
        <button class="round-btn" data-act="density-plus" title="提高密度">+</button>
      </div>
    </div>

    <div class="hud__box hud__box--legend">
      <div class="hud__label">图例</div>
      <div class="legend">
        ${LEGEND.map(l => `<span class="legend__item"><span class="${legendShape[l.shape]}"></span>${l.label}</span>`).join('')}
      </div>
    </div>`;

  el.querySelectorAll<HTMLElement>('[data-seek]').forEach(btn => {
    btn.addEventListener('click', () => actions.seek(Number(btn.dataset.seek)));
  });
  const playBtn = el.querySelector('[data-act="play"]') as HTMLButtonElement;
  const speedBtn = el.querySelector('[data-act="speed"]') as HTMLButtonElement;
  const density = el.querySelector('[data-role="density"]') as HTMLInputElement;
  const densityValue = el.querySelector('[data-role="density-value"]') as HTMLElement;
  const fills = el.querySelectorAll<HTMLElement>('[data-fill]');

  let playing = true;
  playBtn.addEventListener('click', () => actions.setPlay(!playing));
  el.querySelector('[data-act="replay"]')!.addEventListener('click', () => actions.replay());
  speedBtn.addEventListener('click', () => {
    const speeds = [0.5, 1, 1.5, 2];
    const next = speeds[(speeds.indexOf(Number(speedBtn.dataset.value ?? 1)) + 1) % speeds.length];
    speedBtn.dataset.value = String(next);
    actions.setSpeed(next);
  });
  density.addEventListener('input', () => actions.setDensity(Number(density.value)));
  el.querySelector('[data-act="density-minus"]')!.addEventListener('click', () => actions.setDensity(Math.max(0, Number(density.value) - 5)));
  el.querySelector('[data-act="density-plus"]')!.addEventListener('click', () => actions.setDensity(Math.min(100, Number(density.value) + 5)));

  return {
    elements: [el],
    update(s: AppState) {
      el.querySelectorAll<HTMLElement>('[data-seek]').forEach((btn, i) => {
        btn.classList.toggle('is-active', i === Math.min(3, s.actIndex));
      });
      playing = s.playing;
      playBtn.textContent = s.playing ? '❚❚' : '▶';
      speedBtn.textContent = `${s.speed.toFixed(1)}x`;
      speedBtn.dataset.value = String(s.speed);
      density.value = String(s.density);
      densityValue.textContent = `${s.density}%`;
      fills.forEach(f => { f.style.width = `${s.density}%`; });
    },
  };
}
