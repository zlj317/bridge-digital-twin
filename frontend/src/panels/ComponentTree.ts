import type { AppActions } from '../app/actions';
import { COMPONENTS } from '../config';
import { store, type AppState } from '../store/Store';
import type { Bootstrap } from '../types';
import { createPanel } from './Panel';

const ROOTS = ['TOWER-L', 'TOWER-R', 'GIRDER', 'INNER', 'PAVEMENT', 'RAILING', 'BEARINGS', 'SENSORS'];

/** BRG-002 / VIS-007：三级构件树，复选框显隐 + 点击选中定位 */
export function createComponentTree(actions: AppActions, bootstrap: Bootstrap): {
  el: HTMLElement;
  update: (state: AppState) => void;
} {
  const panel = createPanel({
    title: '构件树', variant: 'list', rows: [], icon: 'archive',
    extraBody: '<div class="tree"></div>',
  });
  const tree = panel.el.querySelector('.tree') as HTMLElement;
  const panelBody = panel.el.querySelector('.panel__body') as HTMLElement;
  panelBody.style.padding = '10px 14px 14px';
  const expanded = new Set<string>(['GIRDER']);

  // 事件委托：render() 每次重建 innerHTML 也不会丢失悬停监听
  let lastHover: string | null = null;
  tree.addEventListener('mouseover', e => {
    const node = (e.target as HTMLElement).closest<HTMLElement>('.tree__node[data-code]');
    const code = node?.dataset.code ?? null;
    if (code === lastHover) return;
    lastHover = code;
    store.emit('hoverComponent', code);
  });
  tree.addEventListener('mouseleave', () => {
    lastHover = null;
    store.emit('hoverComponent', null);
  });

  const render = (state: AppState) => {
    const childrenOf = (code: string) => bootstrap.components.filter(c => c.parentCode === code);
    const alarmComps = new Set(state.alarms.filter(a => a.status === 'ACTIVE').map(a => a.compCode));
    let html = '';
    const node = (code: string, depth: number, hasChildren: boolean) => {
      const comp = COMPONENTS.find(c => c.compCode === code);
      const name = comp?.compName ?? code;
      const isSelected = state.selected.compCode === code;
      const caret = hasChildren ? (expanded.has(code) ? '▾' : '▸') : '·';
      html += `<div class="tree__node ${isSelected ? 'is-selected' : ''}" data-code="${code}" style="padding-left:${depth * 14}px">
        <span class="tree__caret" data-caret="${code}">${caret}</span>
        <input class="tree__checkbox" type="checkbox" checked data-check="${code}" title="显隐" />
        <span class="tree__name">${name}</span>
        ${alarmComps.has(code) ? '<span class="tree__red"></span>' : ''}
      </div>`;
    };
    ROOTS.forEach(root => {
      const kids = childrenOf(root);
      node(root, 0, kids.length > 0);
      if (expanded.has(root)) {
        const shown = kids.slice(0, 12);
        shown.forEach(k => node(k.compCode, 1, false));
        if (kids.length > shown.length) {
          html += `<div class="tree__node" style="padding-left:28px;color:var(--text-label)">… 其余 ${kids.length - shown.length} 个构件</div>`;
        }
      }
    });
    tree.innerHTML = html;

    tree.querySelectorAll<HTMLElement>('.tree__node[data-code]').forEach(el => {
      const code = el.dataset.code!;
      el.addEventListener('click', e => {
        const target = e.target as HTMLElement;
        if (target.dataset.check !== undefined) return;
        if (target.dataset.caret !== undefined) {
          expanded.has(code) ? expanded.delete(code) : expanded.add(code);
          render(state);
          return;
        }
        actions.selectComponent(code);
        actions.focusComponent(code);
      });
    });
    tree.querySelectorAll<HTMLInputElement>('input[data-check]').forEach(input => {
      input.addEventListener('click', e => e.stopPropagation());
      input.addEventListener('change', () => actions.setComponentVisible(input.dataset.check!, input.checked));
    });
  };

  return {
    el: panel.el,
    update: render,
  };
}
