import type { AppActions } from '../app/actions';
import { CABLE_TABLE, COMPONENTS, POINTS } from '../config';
import { mockSource } from '../data/mockSource';
import { store, type AppState } from '../store/Store';
import type { HistorySeries, HistoryStatistics, VehicleState } from '../types';
import type { PanelView } from './types';

function sparkline(canvas: HTMLCanvasElement, series: HistorySeries): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const vals = series.points.map(p => p[1]);
  if (!vals.length) return;
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  ctx.strokeStyle = 'rgba(0,229,255,0.15)';
  ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
  ctx.beginPath();
  vals.forEach((v, i) => {
    const x = (i / (vals.length - 1)) * w;
    const y = h - 6 - ((v - min) / range) * (h - 12);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#00E5FF';
  ctx.lineWidth = 1.5;
  ctx.shadowColor = '#00E5FF';
  ctx.shadowBlur = 6;
  ctx.stroke();
}

/** WEB-004 加载遮罩 / ALM-002 告警弹窗 / TRA-005 车辆卡 / 构件与测点详情 */
export function createOverlays(actions: AppActions): PanelView & {
  showTrend: (pointCode: string, series?: HistorySeries | null, stat?: HistoryStatistics | null) => void;
} {
  const el = document.createElement('div');
  el.className = 'overlays';
  el.innerHTML = `
    <div class="loader">
      <div class="loader__title">智慧桥梁数字孪生平台</div>
      <div class="loader__bar"><div class="loader__fill"></div></div>
      <div class="loader__step">初始化…</div>
    </div>
    <div class="overlay-card" data-role="card" style="display:none"></div>
    <div data-role="toast" style="position:absolute;left:50%;top:82px;transform:translateX(-50%);display:none;
      background:rgba(8,22,46,.92);border:1px solid var(--panel-border);padding:8px 16px;font-size:13px"></div>`;

  const loader = el.querySelector('.loader') as HTMLElement;
  const fill = el.querySelector('.loader__fill') as HTMLElement;
  const step = el.querySelector('.loader__step') as HTMLElement;
  const card = el.querySelector('[data-role="card"]') as HTMLElement;
  const toast = el.querySelector('[data-role="toast"]') as HTMLElement;
  let toastTimer = 0;

  const hideCard = () => { card.style.display = 'none'; };
  const showCard = (html: string, cls: string) => {
    card.className = `overlay-card ${cls}`;
    card.innerHTML = html;
    card.style.display = 'block';
    card.querySelector('.overlay-card__close')?.addEventListener('click', hideCard);
  };

  const showToast = (text: string, color = 'var(--cyan)') => {
    toast.textContent = text;
    toast.style.color = color;
    toast.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toast.style.display = 'none'; }, 3500);
  };

  store.on('toast', t => showToast(t.text, t.level === 'error' ? 'var(--red)' : t.level === 'warn' ? 'var(--warn-yellow)' : 'var(--cyan)'));

  store.on('alarm', a => {
    showCard(`<div class="overlay-card__head"><span>${a.title}</span><button class="overlay-card__close">×</button></div>
      <div style="color:var(--text-dim);line-height:1.6">${a.content}</div>
      <div class="overlay-card__row"><span>测点</span><b>${a.pointCode}</b></div>
      <div class="overlay-card__row"><span>当前值 / 阈值</span><b style="color:var(--red)">${a.alarmValue} / ${a.thresholdValue} ${a.unit}</b></div>
      <div class="overlay-card__row"><span>等级</span><b>${a.alarmLevel}</b></div>
      <div class="overlay-card__actions">
        <button class="tool-btn" data-act="confirm">确认</button>
        <button class="tool-btn" data-act="ignore">忽略</button>
      </div>`, 'alarm-toast');
    card.querySelector('[data-act="confirm"]')?.addEventListener('click', () => { actions.confirmAlarm(a.alarmCode); hideCard(); });
    card.querySelector('[data-act="ignore"]')?.addEventListener('click', () => { actions.ignoreAlarm(a.alarmCode); hideCard(); });
  });

  store.on('recover', a => {
    showToast(`${a.pointCode} 已恢复正常，告警自动关闭`, 'var(--green)');
  });

  store.on('pick', p => {
    if (p.kind === 'vehicle') {
      const v = p.payload as VehicleState | undefined;
      if (!v) return;
      showCard(`<div class="overlay-card__head"><span>车辆信息 · ${v.vid}</span><button class="overlay-card__close">×</button></div>
        <div class="overlay-card__row"><span>车牌</span><b>${v.plate}</b></div>
        <div class="overlay-card__row"><span>车型</span><b>${v.type === 'TRUCK' ? '货车' : '小车'}</b></div>
        <div class="overlay-card__row"><span>载重</span><b>${v.weightT.toFixed(1)} t</b></div>
        <div class="overlay-card__row"><span>车速</span><b>${v.speed.toFixed(0)} km/h</b></div>
        <div class="overlay-card__row"><span>车道</span><b>${v.lane}</b></div>
        <div class="overlay-card__row"><span>驶入时间</span><b>${new Date(v.enterAt).toLocaleTimeString('zh-CN')}</b></div>`, 'vehicle-card');
      return;
    }
    if (p.kind === 'sensor') {
      const pt = POINTS.find(x => x.pointCode === p.code);
      const cable = CABLE_TABLE.find(c => c.pointCode === p.code);
      showCard(`<div class="overlay-card__head"><span>测点 · ${p.code}</span><button class="overlay-card__close">×</button></div>
        <div class="overlay-card__row"><span>名称</span><b>${pt?.pointName ?? p.code}</b></div>
        <div class="overlay-card__row"><span>所属构件</span><b>${pt?.compCode ?? cable?.compCode ?? '-'}</b></div>
        <div class="overlay-card__row"><span>预警 / 告警阈值</span><b>${pt?.warnMax ?? cable?.threshold} / ${pt?.alarmMax ?? '-'} ${pt?.unit ?? 'MN'}</b></div>
        <canvas class="mini-chart" width="240" height="64"></canvas>
        <div class="overlay-card__actions"><button class="tool-btn" data-act="trend">查看 24h 趋势</button></div>`, 'pick-card');
      const series = mockSource.getHistorySeries([p.code], 24, 120)[0];
      sparkline(card.querySelector('canvas')!, series);
      card.querySelector('[data-act="trend"]')?.addEventListener('click', () => actions.showPointTrend(p.code));
      return;
    }
    const comp = COMPONENTS.find(c => c.compCode === p.code);
    const pts = POINTS.filter(x => x.compCode === p.code);
    showCard(`<div class="overlay-card__head"><span>构件档案 · ${p.code}</span><button class="overlay-card__close">×</button></div>
      <div class="overlay-card__row"><span>名称</span><b>${comp?.compName ?? p.code}</b></div>
      <div class="overlay-card__row"><span>类型</span><b>${comp?.compType ?? '-'}</b></div>
      <div class="overlay-card__row"><span>材质</span><b>${comp?.material ?? '-'}</b></div>
      <div class="overlay-card__row"><span>绑定测点</span><b>${pts.length} 个</b></div>
      <div class="overlay-card__row"><span>父构件</span><b>${comp?.parentCode ?? '顶层'}</b></div>
      ${pts.length ? '<div class="overlay-card__actions"><button class="tool-btn" data-act="trend">查看测点趋势</button></div>' : ''}`, 'pick-card');
    card.querySelector('[data-act="trend"]')?.addEventListener('click', () => actions.showPointTrend(pts[0].pointCode));
  });

  const showTrend = (pointCode: string, series?: HistorySeries | null, stat?: HistoryStatistics | null) => {
    const s = series ?? mockSource.getHistorySeries([pointCode], 24, 120)[0];
    const st = stat ?? mockSource.getHistoryStatistics(pointCode);
    showCard(`<div class="overlay-card__head"><span>24h 趋势 · ${pointCode}</span><button class="overlay-card__close">×</button></div>
      <canvas class="mini-chart" width="240" height="64"></canvas>
      <div class="overlay-card__row"><span>最大 / 最小</span><b>${st.max.toFixed(3)} / ${st.min.toFixed(3)}</b></div>
      <div class="overlay-card__row"><span>均值 / P95</span><b>${st.avg.toFixed(3)} / ${st.p95.toFixed(3)}</b></div>
      <div class="overlay-card__row"><span>样本 / 超限</span><b>${st.count} / ${st.exceedCount}</b></div>`, 'pick-card');
    sparkline(card.querySelector('canvas')!, s);
  };

  return {
    elements: [el],
    showTrend,
    update(s: AppState) {
      fill.style.width = `${s.loading.progress}%`;
      step.textContent = `${s.loading.step} · ${s.loading.progress}%`;
      if (s.loading.progress >= 100) loader.classList.add('is-hidden');
    },
  };
}
