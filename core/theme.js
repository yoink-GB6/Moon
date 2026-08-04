// core/theme.js
// 主题不做持久化：每次刷新都重新读系统的深色/浅色偏好。
// 手动切换只在当前这次访问里有效，刷新即回到跟随系统。

const mq = window.matchMedia('(prefers-color-scheme: light)');
let manual = false;   // 本次访问里手动切过没有

export function getTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function apply(t) {
  const root = document.documentElement;
  root.classList.add('theme-switching');
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));
  root.dataset.theme = t;
  root.style.colorScheme = t;   // 让浏览器的滚动条/表单控件/根画布也跟着走
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.dispatchEvent(new CustomEvent('theme-change', { detail: t }));
}

export function setTheme(t) { manual = true; apply(t); }
export function toggleTheme() { setTheme(getTheme() === 'light' ? 'dark' : 'light'); }

export function initTheme() {
  localStorage.removeItem('moon-theme');   // 清掉旧版本残留的固定值
  apply(mq.matches ? 'light' : 'dark');
  // 手动切过之后就不再被系统变化覆盖，直到下次刷新
  mq.addEventListener('change', e => { if (!manual) apply(e.matches ? 'light' : 'dark'); });
}

// '--star-rgb' → [168,137,58]
export function themeRGB(name) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name).split(',').map(n => Number(n.trim()));
}
