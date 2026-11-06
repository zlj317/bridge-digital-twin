import type { AppActions } from '../app/actions';
import { CABLE_TABLE, COPY, HEAT_SCALE } from '../config';
import type { AppState } from '../store/Store';
import type { Bootstrap } from '../types';
import { createPanel, type MetricRow } from './Panel';
import type { PanelView } from './types';

/** 2.5.4 内部透视：热力色带 + 6 行测点表 */
function createInnerPerspective(actions: AppActions): { el: HTMLElement; update: (s: AppState) => void } {
  const el = document.createElement('section');
  el.className = 'panel';
  el.innerHTML = `<div class="panel__head"><span class="panel__icon"></span><span class="panel__title">${COPY.innerViewTitle}</span></div>
    <div class="panel__body">
      <div class="heatmap">
        <div class="heatmap__bar"></div>
        <div class="heatmap__ticks">
          ${[1.4, 1.36, 1.32, 1.28, 1.24].map(v => `<span>${v.toFixed(2)} MN</span>`).join('')}
        </div>
        <div style="font-size:12px;color:var(--text-label);line-height:1.6;align-self:center">
          <div>索力热力</div><div>色阶</div>
          <div style="margin-top:8px;color:var(--cyan)">${HEAT_SCALE.length} 级</div>
        </div>
      </div>
      <table class="point-table">
        <thead><tr><th>测点</th><th>数值</th><th>阈值</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>`;
  const tbody = el.querySelector('tbody')!;
  const render = (s: AppState) => {
    tbody.innerHTML = CABLE_TABLE.map(c => {
      const rt = s.points[c.pointCode];
      const value = rt?.value ?? c.value;
      const level = rt?.level ?? 'NORMAL';
      const selected = s.selected.pointCodes.includes(c.pointCode);
      return `<tr data-point="${c.pointCode}" data-comp="${c.compCode}" class="${selected ? 'is-selected' : ''}">
        <td><span class="status-dot status-dot--${level.toLowerCase()}"></span>${c.compCode}</td>
        <td>${value.toFixed(3)}</td><td>${c.threshold.toFixed(3)}</td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll<HTMLTableRowElement>('tr[data-point]').forEach(row => {
      row.addEventListener('click', () => {
        actions.showPointTrend(row.dataset.point!);
        actions.selectComponent(row.dataset.comp!);
      });
    });
  };
  return { el, update: render };
}

/** ALM-002 告警列表 */
function createAlarmList(actions: AppActions): { el: HTMLElement; update: (s: AppState) => void } {
  const el = document.createElement('section');
  el.className = 'panel';
  el.innerHTML = `<div class="panel__head"><span class="panel__icon"></span><span class="panel__title">实时告警</span></div>
    <div class="panel__body" style="padding-top:6px"><div class="alarm-list"></div></div>`;
  const list = el.querySelector('.alarm-list')!;
  return {
    el,
    update(s: AppState) {
      const alarms = s.alarms.slice(0, 5);
      list.innerHTML = alarms.length
        ? alarms.map(a => `<div class="alarm-row" data-code="${a.compCode}">
            <span class="alarm-row__level alarm-row__level--${a.alarmLevel}">${a.alarmLevel === 'WARN' ? '预警' : '告警'}</span>
            <span class="alarm-row__title">${a.title}</span>
            <span style="color:${a.status === 'RECOVERED' ? 'var(--text-label)' : 'var(--red)'}">${a.alarmValue}${a.unit}</span>
          </div>`).join('')
        : '<div class="label" style="padding:8px 0">当前无活动告警</div>';
      list.querySelectorAll<HTMLElement>('.alarm-row').forEach(row => {
        row.addEventListener('click', () => actions.focusComponent(row.dataset.code!));
      });
    },
  };
}

/** 右栏：图1 车流运维 / 图2 实时状态 / 图3 检测预警 + 内部透视 + 告警 */
export function createRightPanel(actions: AppActions, _bootstrap: Bootstrap): PanelView {
  const v1 = createPanel({ title: COPY.rightV1Title, variant: 'dot', icon: 'traffic', rows: [], blueprint: true });
  const v2 = createPanel({ title: COPY.rightV2Title, variant: 'dot', icon: 'vibration', rows: [] });
  const v3 = createPanel({ title: COPY.rightV3Title, variant: 'check', icon: 'scan', rows: [] });
  const inner = createInnerPerspective(actions);
  const alarms = createAlarmList(actions);

  const rowsV1 = (s: AppState): MetricRow[] => [
    { label: '在途车辆', value: s.traffic.vehicleCount, unit: '辆', icon: 'traffic' },
    { label: '平均车速', value: s.traffic.avgSpeed, unit: 'km/h', icon: 'speed' },
    { label: '车道占用', value: Math.round(s.traffic.occupancy * 100), unit: '%', icon: 'lane' },
    { label: '异常事件', value: s.traffic.eventCount, unit: '起', icon: 'event' },
    { label: '维护建议', value: COPY.maintenanceAdvice, color: 'var(--green)', icon: 'tool' },
  ];
  const rowsV2 = (s: AppState): MetricRow[] => [
    { label: '振动频率', value: s.metrics.frequency, unit: 'Hz', decimals: 2, icon: 'vibration' },
    { label: '阻尼比', value: s.metrics.damping, unit: '%', decimals: 1, icon: 'damping' },
    { label: '车流量', value: s.metrics.trafficPerHour, unit: '辆/小时', icon: 'traffic' },
    { label: '疲劳指数', value: s.metrics.fatigueIndex, icon: 'fatigue' },
    { label: '健康等级', value: s.metrics.healthGrade, color: 'var(--green)', icon: 'grade' },
  ];
  const rowsV3 = (s: AppState): MetricRow[] => [
    { label: '扫描完成', value: s.metrics.scanProgress, unit: '%', color: 'var(--green)', icon: 'scan' },
    { label: '缺陷数量', value: s.metrics.defectCount, unit: '处', color: 'var(--green)', icon: 'defect' },
    { label: '重点区域', value: s.metrics.keyArea, icon: 'area' },
    { label: '预警等级', value: s.metrics.riskLevel, color: 'var(--purple)', icon: 'warn' },
    { label: '下次巡检', value: s.metrics.nextInspectDate, color: 'var(--blue-light)', icon: 'date' },
  ];

  return {
    elements: [v1.el, v2.el, v3.el, inner.el, alarms.el],
    update(s: AppState) {
      const showInner = s.view === 'V3' || s.actIndex >= 3;
      v1.el.style.display = s.view === 'V1' ? '' : 'none';
      v2.el.style.display = s.view === 'V2' ? '' : 'none';
      v3.el.style.display = s.view === 'V3' ? '' : 'none';
      inner.el.style.display = showInner ? '' : 'none';
      if (s.view === 'V1') v1.update(rowsV1(s));
      else if (s.view === 'V2') v2.update(rowsV2(s));
      else v3.update(rowsV3(s));
      if (showInner) inner.update(s);
      alarms.update(s);
    },
  };
}
