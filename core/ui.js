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

// ── Sidebar toggle ──
// 手机端和电脑端共用同一个状态类 .collapsed，只是手机端默认收起、
// 且展开时压一层遮罩；不再有 .open / .collapsed 两套并行的状态。
const isMobile = () => window.matchMedia('(max-width:768px)').matches;

function syncOverlay() {
  const collapsed = document.getElementById('sidebar')?.classList.contains('collapsed');
  document.getElementById('sidebar-overlay')?.classList.toggle('show', !collapsed && isMobile());
}

export function initSidebar() {
  if (isMobile()) document.getElementById('sidebar')?.classList.add('collapsed');
  document.getElementById('sidebar-overlay')?.addEventListener('click', closeSidebar);
  window.addEventListener('resize', syncOverlay);
  syncOverlay();
}

export function toggleSidebar() {
  document.getElementById('sidebar')?.classList.toggle('collapsed');
  syncOverlay();
}

// 导航后调用：只在手机端收起，电脑端保持展开
export function closeSidebar() {
  if (!isMobile()) return;
  document.getElementById('sidebar')?.classList.add('collapsed');
  syncOverlay();
}
