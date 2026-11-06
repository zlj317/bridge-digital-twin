/** WEB-003 数值滚动：0.6s 平滑过渡，而非瞬间跳变 */
const running = new WeakMap<HTMLElement, number>();

export function rollNumber(el: HTMLElement, to: number, decimals = 0, duration = 600): void {
  const prev = running.get(el);
  if (prev !== undefined) cancelAnimationFrame(prev);
  const from = Number(el.dataset.raw ?? String(to));
  if (!Number.isFinite(from) || Math.abs(from - to) < 1e-9) {
    el.dataset.raw = String(to);
    el.textContent = format(to, decimals);
    return;
  }
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const v = from + (to - from) * eased;
    el.textContent = format(v, decimals);
    el.dataset.raw = String(v);
    if (t < 1) {
      running.set(el, requestAnimationFrame(tick));
    } else {
      el.dataset.raw = String(to);
      running.delete(el);
    }
  };
  el.dataset.raw = String(from);
  running.set(el, requestAnimationFrame(tick));
}

export function format(v: number, decimals = 0): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
