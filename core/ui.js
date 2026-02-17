// core/ui.js
// 公共 UI 工具：Toast、通用 Modal

// ── Toast ──────────────────────────────────────────
let _toastTimer;
export function showToast(msg, duration = 2600) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

// Make globally accessible (legacy calls from inline onclick)
window.showToast = showToast;

// ── Simple confirm dialog (uses native, upgradeable later) ──
export function confirmDialog(msg) {
  return window.confirm(msg);
}

// ── Escape HTML ──
export function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Sidebar toggle ──
export function initSidebar() {
  const btn = document.getElementById('menu-btn');
  const overlay = document.getElementById('sidebar-overlay');
  const closeBtn = document.getElementById('sidebar-close');

  btn?.addEventListener('click', toggleSidebar);
  overlay?.addEventListener('click', closeSidebar);
  closeBtn?.addEventListener('click', closeSidebar);
}

export function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  const open = sb.classList.toggle('open');
  ov.classList.toggle('show', open);
}

export function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('show');
}
