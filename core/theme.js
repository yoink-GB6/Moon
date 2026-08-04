// core/theme.js
// 深色/浅色主题：无 localStorage 记录时跟随系统并实时响应；用户手动切换后固定。

const KEY = 'moon-theme';
const mq = window.matchMedia('(prefers-color-scheme: light)');

export function getTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function apply(t) {
  const root = document.documentElement;
  root.classList.add('theme-switching');
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));
  root.dataset.theme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.dispatchEvent(new CustomEvent('theme-change', { detail: t }));
}

export function setTheme(t) {
  localStorage.setItem(KEY, t);
  apply(t);
}

export function toggleTheme() {
  setTheme(getTheme() === 'light' ? 'dark' : 'light');
}

export function initTheme() {
  const saved = localStorage.getItem(KEY);
  apply(saved === 'light' || saved === 'dark' ? saved : (mq.matches ? 'light' : 'dark'));
  mq.addEventListener('change', e => {
    if (!localStorage.getItem(KEY)) apply(e.matches ? 'light' : 'dark');
  });
}

// '--star-rgb' → [168,137,58]
export function themeRGB(name) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name).split(',').map(n => Number(n.trim()));
}
