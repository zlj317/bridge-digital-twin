import type { AppState } from '../store/Store';

export interface PanelView {
  elements: HTMLElement[];
  update: (state: AppState) => void;
}
