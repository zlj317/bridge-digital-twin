import './styles/tokens.css';
import './styles/layout.css';

import type { AppActions } from './app/actions';
import { api } from './api/client';
import { BRIDGE_CODE, buildMockBootstrap, DATA_MODE } from './config';
import { mockSource, type DataSourceHooks } from './data/mockSource';
import { mqttSource } from './mqtt/client';
import { createBottomHud } from './panels/BottomHud';
import { createLeftPanel } from './panels/LeftPanel';
import { createRightPanel } from './panels/RightPanel';
import { createTopBar } from './panels/TopBar';
import { createOverlays } from './panels/Overlays';
import { store } from './store/Store';
import { Viewport } from './three/Viewport';
import { preloadAssets } from './three/AssetLoader';
import type { Bootstrap, RealtimePoint, ViewKey } from './types';

const SHELL = `
<div class="app">
  <div class="bg-grid"></div>
  <div class="viewport" id="viewport">
    <div class="viewport__veil"></div>
    <div class="viewport__scan"></div>
  </div>
  <div class="main">
    <aside class="col col--left" id="left"></aside>
    <section class="stage">
      <div class="stage__hint">左键旋转 · 滚轮缩放 · 点击构件查看档案 · WASD 平移</div>
      <div class="stage__tools">
        <button class="tool-btn" data-tool="clip">剖切开关</button>
        <button class="tool-btn" data-tool="inner">只看内部</button>
        <button class="tool-btn" data-tool="wire">线框/实体</button>
        <button class="tool-btn" data-tool="axial">沿桥轴</button>
        <button class="tool-btn" data-tool="cross">横向剖切</button>
        <span class="stage__clip">剖切进度 <input type="range" min="0" max="100" value="0" data-role="clip" /></span>
      </div>
    </section>
    <aside class="col col--right" id="right"></aside>
  </div>
  <div id="overlays"></div>
</div>`;

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) throw new Error('#app 不存在');
  root.innerHTML = SHELL;
  const app = root.querySelector('.app') as HTMLElement;
  const viewportEl = document.getElementById('viewport') as HTMLElement;
  const leftEl = document.getElementById('left') as HTMLElement;
  const rightEl = document.getElementById('right') as HTMLElement;
  const overlaysEl = document.getElementById('overlays') as HTMLElement;

  store.setLoading(8, '加载桥梁配置');
  let bootstrap: Bootstrap;
  let mode: 'mock' | 'live' = DATA_MODE;
  if (DATA_MODE === 'live') {
    try {
      bootstrap = await api.getBootstrap(BRIDGE_CODE);
      store.emit('toast', { level: 'info', text: '已连接后端档案服务' });
    } catch {
      bootstrap = buildMockBootstrap();
      mode = 'mock';
      store.emit('toast', { level: 'warn', text: '后端不可达，已使用本地数据源' });
    }
  } else {
    bootstrap = buildMockBootstrap();
  }
  store.patch({ bootstrap, dataMode: mode });

  store.setLoading(38, '构建分层桥梁模型（预载三维资产）');
  const assets = await preloadAssets();
  const viewport = new Viewport(viewportEl, bootstrap, assets);

  store.setLoading(62, '装配三栏面板');
  let overlays: ReturnType<typeof createOverlays> | null = null;
  const actions: AppActions = {
    setView: (v: ViewKey) => store.patch({ view: v }),
    setPlay: v => viewport.setPaused(!v),
    replay: () => { viewport.replay(); store.emit('toast', { level: 'info', text: '五幕序列已重播' }); },
    setSpeed: v => viewport.setSpeed(v),
    seek: i => viewport.seekToActEnd(i),
    setDensity: p => {
      viewport.setDensity(p);
      if (mode === 'mock') mockSource.setDensity(p);
      else mqttSource.setDensity(p);
    },
    setClipping: v => viewport.setClipping(v),
    setClipProgress: p => viewport.setClipProgress(p),
    setClipDirection: d => viewport.setClipDirection(d),
    setWireframe: v => viewport.setWireframe(v),
    setInnerOnly: v => viewport.setInnerOnly(v),
    setComponentVisible: (code, visible) => viewport.setComponentVisible(code, visible),
    focusViewpoint: code => viewport.focus(code),
    focusComponent: code => viewport.focusComponent(code),
    selectComponent: code => {
      const points = bootstrap.points.filter(p => p.compCode === code).map(p => p.pointCode);
      store.select(code, points);
    },
    screenshot: () => {
      const a = document.createElement('a');
      a.href = viewport.screenshot();
      a.download = `bridge-twin-${Date.now()}.png`;
      a.click();
      store.emit('toast', { level: 'info', text: '3D 视口截图已保存' });
    },
    fullscreen: () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen().catch(() => undefined);
    },
    simulateAlarm: () => {
      if (mode === 'mock') mockSource.triggerOverlimit();
      else mqttSource.publish('sim/bridge/command', { bridgeCode: BRIDGE_CODE, action: 'INJECT_OVERLIMIT', ts: Date.now() });
      store.emit('toast', { level: 'warn', text: '已注入 3 次超限样本，观察连续 3 次防抖告警' });
    },
    showPointTrend: code => {
      if (mode === 'live') {
        const end = Date.now();
        const start = end - 24 * 3600_000;
        void Promise.all([
          api.getHistorySeries({ points: code, start, end, interval: '6m', aggr: 'AVG' }).catch(() => []),
          api.getHistoryStatistics({ point: code, start, end }).catch(() => null),
        ]).then(([list, stat]) => overlays?.showTrend(code, list[0] ?? null, stat));
      } else {
        overlays?.showTrend(code);
      }
    },
    confirmAlarm: code => {
      store.patch({ alarms: store.state.alarms.map(a => a.alarmCode === code ? { ...a, status: 'CONFIRMED' } : a) });
      if (mode === 'live') void api.confirmAlarm(code).catch(() => undefined);
    },
    ignoreAlarm: code => {
      store.patch({ alarms: store.state.alarms.map(a => a.alarmCode === code ? { ...a, status: 'IGNORED' } : a) });
      if (mode === 'live') void api.ignoreAlarm(code).catch(() => undefined);
    },
  };

  overlays = createOverlays(actions);
  const topbar = createTopBar(actions, bootstrap);
  const left = createLeftPanel(actions, bootstrap);
  const right = createRightPanel(actions, bootstrap);
  const hud = createBottomHud(actions);

  app.append(...topbar.elements);
  leftEl.append(...left.elements);
  rightEl.append(...right.elements);
  app.append(...hud.elements);
  overlaysEl.append(...overlays.elements);

  // 视口浮动工具条
  const stage = root.querySelector('.stage__tools') as HTMLElement;
  const clipSlider = root.querySelector('[data-role="clip"]') as HTMLInputElement;
  stage.querySelector('[data-tool="clip"]')!.addEventListener('click', () => {
    const next = !store.state.clipping;
    actions.setClipping(next);
    clipSlider.value = next ? '100' : '0';
  });
  stage.querySelector('[data-tool="inner"]')!.addEventListener('click', () => actions.setInnerOnly(!store.state.clipping));
  stage.querySelector('[data-tool="wire"]')!.addEventListener('click', () => actions.setWireframe(!store.state.wireframe));
  stage.querySelector('[data-tool="axial"]')!.addEventListener('click', () => actions.setClipDirection('AXIAL'));
  stage.querySelector('[data-tool="cross"]')!.addEventListener('click', () => actions.setClipDirection('CROSS'));
  clipSlider.addEventListener('input', () => actions.setClipProgress(Number(clipSlider.value) / 100));

  // 统一状态订阅：所有面板只读 store，不互相调用
  const views = [topbar, left, right, hud, overlays];
  store.subscribe(state => views.forEach(v => v.update(state)));
  views.forEach(v => v.update(store.state));

  // 键盘：WASD 第一人称平移、空格播放/暂停、R 重播
  window.addEventListener('keydown', e => {
    const step = 14;
    const key = e.key.toLowerCase();
    if (key === 'w') viewport.nudge(step, 0, 0);
    else if (key === 's') viewport.nudge(-step, 0, 0);
    else if (key === 'a') viewport.nudge(0, 0, -step);
    else if (key === 'd') viewport.nudge(0, 0, step);
    else if (key === 'q') viewport.nudge(0, step, 0);
    else if (key === 'e') viewport.nudge(0, -step, 0);
    else if (e.code === 'Space') { e.preventDefault(); actions.setPlay(!store.state.playing); }
    else if (key === 'r') actions.replay();
  });

  store.setLoading(86, '连接数据源');
  const hooks: DataSourceHooks = {
    onMetrics: m => store.patch({ metrics: m }),
    onPoints: p => {
      const rec: Record<string, RealtimePoint> = {};
      p.forEach(x => { rec[x.pointCode] = x; });
      store.patch({ points: rec });
      viewport.applyPoints(p);
    },
    onTraffic: (stat, vehicles) => viewport.applyTraffic(stat, vehicles),
    onAlarm: a => {
      store.patch({ alarms: [a, ...store.state.alarms].slice(0, 20) });
      store.emit('alarm', a);
      viewport.onAlarm(a);
    },
    onRecover: a => {
      store.patch({ alarms: store.state.alarms.map(x => x.alarmCode === a.alarmCode ? a : x) });
      store.emit('recover', a);
    },
  };

  if (mode === 'mock') {
    mockSource.start(hooks);
  } else {
    void api.getMetrics(BRIDGE_CODE).then(m => store.patch({ metrics: m })).catch(() => undefined);
    void api.getAlarms(BRIDGE_CODE).then(r => store.patch({ alarms: r.list })).catch(() => undefined);
    mqttSource.connect({
      onConnected: () => store.emit('toast', { level: 'info', text: 'MQTT 实时链路已连接' }),
      onSnapshot: (m, points) => { store.patch({ metrics: m }); hooks.onPoints(points); },
      onTraffic: hooks.onTraffic,
      onAlarm: hooks.onAlarm,
      onRecover: hooks.onRecover,
      onFallback: reason => {
        mode = 'mock';
        store.patch({ dataMode: 'mock' });
        store.emit('toast', { level: 'warn', text: `${reason}，已切换本地仿真` });
        mockSource.start(hooks);
      },
    });
  }

  store.setLoading(100, '就绪');
  viewport.start();
  store.emit('viewportReady', undefined);
}

void boot().catch(err => {
  console.error(err);
  const root = document.getElementById('app');
  if (root) root.textContent = `初始化失败：${String(err)}`;
});
