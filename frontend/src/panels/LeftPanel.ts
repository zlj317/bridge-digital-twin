import type { AppActions } from '../app/actions';
import { COPY } from '../config';
import type { AppState } from '../store/Store';
import type { Bootstrap } from '../types';
import { createComponentTree } from './ComponentTree';
import { createGrowthThumb } from './GrowthThumb';
import { createPanel, createSectionTitle, type MetricRow } from './Panel';
import type { PanelView } from './types';

/** 左栏：图1 健康监测（样式A）/ 图2 结构信息（样式B）/ 图3 桥梁档案（样式C） */
export function createLeftPanel(actions: AppActions, bootstrap: Bootstrap): PanelView {
  const b = bootstrap.bridge;
  const sectionTitle = createSectionTitle('1', COPY.leftV3Title);

  const tabbar = document.createElement('div');
  tabbar.className = 'tabbar panel';
  tabbar.innerHTML = '<div class="tabbar__item is-active">结构信息</div><div class="tabbar__item" data-view="V3">构件台账</div>';
  tabbar.querySelector('[data-view]')!.addEventListener('click', () => actions.setView('V3'));

  const v1 = createPanel({
    title: COPY.leftV1Title, variant: 'icon', icon: 'health', rows: [],
  });
  const v2 = createPanel({
    title: COPY.leftV2Title, variant: 'list', icon: 'archive', rows: [],
  });
  const v3 = createPanel({
    title: '桥梁档案', variant: 'file', icon: 'archive', rows: [],
  });
  const growth = createGrowthThumb(actions);
  const tree = createComponentTree(actions, bootstrap);

  const rowsV1 = (s: AppState): MetricRow[] => [
    { label: '结构应力', value: s.metrics.stress, unit: 'MPa', decimals: 1, icon: 'stress' },
    { label: '索力', value: s.metrics.cableForce, unit: 'kN', icon: 'cable' },
    { label: '挠度', value: s.metrics.deflection, unit: 'm', decimals: 2, icon: 'deflection' },
    { label: '温度', value: s.metrics.temperature, unit: '℃', decimals: 1, icon: 'temp' },
    { label: '风速', value: s.metrics.windSpeed, unit: 'm/s', decimals: 1, icon: 'wind' },
  ];
  const rowsV2 = (): MetricRow[] => [
    { label: '桥塔高度', value: b.towerHeight, unit: 'm' },
    { label: '主跨', value: b.mainSpan, unit: 'm' },
    { label: '拉索数量', value: b.cableCount, unit: '根' },
    { label: '箱梁宽度', value: b.deckWidth, unit: 'm' },
    { label: '设计荷载', value: b.designLoadT, unit: 't' },
  ];
  const rowsV3 = (): MetricRow[] => [
    { label: '项目编号', value: b.projectNo, icon: 'code' },
    { label: '桥梁类型', value: '斜拉桥', icon: 'type' },
    { label: '建成年份', value: b.buildYear, icon: 'calendar' },
    { label: '设计寿命', value: b.designLife, unit: '年', icon: 'life' },
    { label: '养护等级', value: b.maintainLevel, icon: 'level' },
  ];

  return {
    elements: [sectionTitle, tabbar, v1.el, v2.el, v3.el, growth.el, tree.el],
    update(state: AppState) {
      const view = state.view;
      sectionTitle.style.display = view === 'V3' ? '' : 'none';
      tabbar.style.display = view === 'V2' ? '' : 'none';
      v1.el.style.display = view === 'V1' ? '' : 'none';
      v2.el.style.display = view === 'V2' ? '' : 'none';
      v3.el.style.display = view === 'V3' ? '' : 'none';
      growth.el.style.display = view === 'V3' ? '' : 'none';
      if (view === 'V1') v1.update(rowsV1(state));
      else if (view === 'V2') v2.update(rowsV2());
      else v3.update(rowsV3());
      tree.update(state);
      growth.update(state);
    },
  };
}
