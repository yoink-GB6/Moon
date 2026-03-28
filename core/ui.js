// core/ui.js
// 公共 UI 工具：Toast、通用 Modal

// ── Toast ──────────────────────────────────────────
let _toastTimer;
let toastCounter = 0;

export function showToast(msg, duration = 2000) {
  // Create a new toast element for each message (allows stacking)
  const toast = document.createElement('div');
  toast.className = 'toast-item show';
  toast.textContent = msg;
  toast.style.bottom = `${20 + (toastCounter * 60)}px`;  // Stack vertically
  
  document.body.appendChild(toast);
  toastCounter++;
  
  // Remove after duration
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      document.body.removeChild(toast);
      toastCounter--;
      // Reposition remaining toasts
      const toasts = document.querySelectorAll('.toast-item');
      toasts.forEach((t, i) => {
        t.style.bottom = `${20 + (i * 60)}px`;
      });
    }, 300);  // Wait for fade-out animation
  }, duration);
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

// ── 通用面板折叠/展开 ──────────────────────────────────
/**
 * 为任意可折叠面板绑定折叠/展开事件，并初始化 chevron 初始状态。
 * @param {Element|Document} scope  - querySelector 的查询范围
 * @param {string} panelSel         - 面板选择器（添加/移除 .collapsed）
 * @param {string} toggleBtnSel     - 折叠按钮选择器（标题栏点击区域）
 * @param {string} [expandBtnSel]   - 浮动展开按钮选择器
 * @param {string} [chevronSel]     - 箭头文字元素选择器
 */
export function bindPanelToggle(scope, panelSel, toggleBtnSel, expandBtnSel, chevronSel) {
  function setChevron(collapsed) {
    if (!chevronSel) return;
    const chevron = scope.querySelector(chevronSel);
    if (chevron) chevron.textContent = collapsed ? '›' : '‹';
  }

  function toggle() {
    const panel = scope.querySelector(panelSel);
    if (!panel) return;
    const collapsed = panel.classList.toggle('collapsed');
    setChevron(collapsed);
    if (expandBtnSel) {
      const expandBtn = scope.querySelector(expandBtnSel);
      if (expandBtn) expandBtn.classList.toggle('show', collapsed);
    }
  }

  // 初始化 chevron，使其与当前面板状态一致（无需在 HTML 里写死字符）
  const panel = scope.querySelector(panelSel);
  if (panel) setChevron(panel.classList.contains('collapsed'));

  scope.querySelector(toggleBtnSel)?.addEventListener('click', toggle);
  if (expandBtnSel) scope.querySelector(expandBtnSel)?.addEventListener('click', toggle);
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
