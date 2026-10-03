/** Small DOM helpers shared by the UI modules. */

export function esc(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export function fmt(n: number, digits = 1): string {
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return Number.isInteger(r) ? String(r) : r.toFixed(digits);
}

export function fmtSigned(n: number, digits = 1): string {
  const s = fmt(n, digits);
  return n > 0 ? `+${s}` : s;
}

/** One delegated click listener; elements declare `data-action="name"`. */
export function bindActions(root: HTMLElement, handler: (action: string, el: HTMLElement, ev: MouseEvent) => void): void {
  root.addEventListener('click', (ev) => {
    const target = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target || !root.contains(target)) return;
    handler(target.dataset.action!, target, ev);
  });
}

export function download(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}
