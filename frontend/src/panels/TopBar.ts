import type { AppActions } from '../app/actions';
import { COPY } from '../config';
import type { AppState } from '../store/Store';
import type { Bootstrap } from '../types';
import type { PanelView } from './types';

/** 文档 2.3 顶栏：居中标题、斜切装饰线、在线状态、视图与工具 */
export function createTopBar(actions: AppActions, bootstrap: Bootstrap): PanelView {
  const el = document.createElement('header');
  el.className = 'topbar';
  el.innerHTML = `
    <div class="topbar__side">
      <div class="topbar__status"><span class="breath-dot"></span>${COPY.online}</div>
    </div>
    <div class="topbar__center">
      <div class="topbar__title">${COPY.title}</div>
      <div class="topbar__deco topbar__deco--l"></div>
      <div class="topbar__deco topbar__deco--r"></div>
    </div>
    <div class="topbar__side">
      <div class="topbar__tools">
        <button class="tool-btn" data-view="V1">全景</button>
        <button class="tool-btn" data-view="V2">结构</button>
        <button class="tool-btn" data-view="V3">档案</button>
        <select class="tool-btn" data-role="viewpoint" title="视点切换">
          ${bootstrap.viewpoints.map(v => `<option value="${v.vpCode}">${v.vpName}</option>`).join('')}
        </select>
        <button class="tool-btn" data-act="alarm">模拟告警</button>
        <button class="tool-btn" data-act="shot">截图</button>
        <button class="tool-btn" data-act="full">全屏</button>
      </div>
    </div>`;

  el.querySelectorAll<HTMLElement>('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => actions.setView(btn.dataset.view as 'V1' | 'V2' | 'V3'));
  });
  (el.querySelector('[data-role="viewpoint"]') as HTMLSelectElement).addEventListener('change', e => {
    actions.focusViewpoint((e.target as HTMLSelectElement).value);
  });
  el.querySelector('[data-act="alarm"]')!.addEventListener('click', () => actions.simulateAlarm());
  el.querySelector('[data-act="shot"]')!.addEventListener('click', () => actions.screenshot());
  el.querySelector('[data-act="full"]')!.addEventListener('click', () => actions.fullscreen());

  return {
    elements: [el],
    update(s: AppState) {
      el.querySelectorAll<HTMLElement>('[data-view]').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.view === s.view);
      });
      const status = el.querySelector('.topbar__status') as HTMLElement;
      status.innerHTML = `<span class="breath-dot"></span>${COPY.online} ｜ ${s.dataMode === 'mock' ? '本地仿真' : '实时链路'} ｜ ${s.fps} FPS`;
    },
  };
}
