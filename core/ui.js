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

// ── Combobox（可输入搜索的下拉）────────────────────────────
// 结构约定：input 的父元素里放一个 <div class="cb-sugg"></div>。
// 候选框用 fixed 定位（祖先常有 overflow 裁切），位置按 input 的 rect 现算。
// 选中后在 input 上派发 'pick' 事件，detail 是选项 id；同时写 input.dataset.id。
// getItems() 每次现取，返回 [{id, name}]，这样选项变了不用重新绑定。
export function bindCombobox(input, getItems, opts = {}) {
  const box  = input.parentElement.querySelector('.cb-sugg');
  const on   = opts.bind || ((el, t, fn) => el.addEventListener(t, fn));
  const max  = opts.max || 8;
  const close = () => { box.style.display = 'none'; };
  const find = id => getItems().find(x => String(x.id) === String(id));

  on(input, 'input', () => {
    input.dataset.id = '';
    const q = input.value.trim().toLowerCase();
    const hit = q ? getItems().filter(x => x.name.toLowerCase().includes(q)).slice(0, max) : [];
    if (!hit.length) return close();
    box.innerHTML = hit.map(x =>
      '<div class="cb-item" data-id="' + escHtml(String(x.id)) + '">' + escHtml(x.name) + '</div>').join('');
    const r = input.getBoundingClientRect();
    box.style.left  = r.left + 'px';
    box.style.top   = r.bottom + 'px';
    box.style.width = r.width + 'px';
    box.style.display = 'block';
  });

  on(box, 'click', e => {
    const it = e.target.closest('.cb-item');
    if (!it) return;
    const rec = find(it.dataset.id);
    input.value = rec ? rec.name : '';
    input.dataset.id = it.dataset.id;
    close();
    input.dispatchEvent(new CustomEvent('pick', { detail: it.dataset.id }));
  });

  // 可以随便输入用来搜索，但失焦时必须落回一个真实选项，
  // 否则把文字退回当前选中的那个（没选过就清空）
  on(input, 'blur', () => setTimeout(() => {
    close();
    const rec = input.dataset.id ? find(input.dataset.id) : null;
    if (!rec) { input.value = ''; return; }
    if (input.value !== rec.name) input.value = rec.name;
  }, 160));
}

// ── 抽屉（左侧导航栏 / 右侧页面面板）────────────────────────
// 两侧共用同一套状态：.collapsed 表示收起，展开时手机端压一层 #scrim。
// 右侧面板由各 page 自己渲染，统一带 .side-panel 类，这里按类找。

const isMobile = () => window.matchMedia('(max-width:768px)').matches;

const $sidebar = () => document.getElementById('sidebar');
const $scrim   = () => document.getElementById('scrim');

export function findRightPanel() {
  return document.querySelector('#page-root .side-panel');
}

const isOpen = el => !!el && !el.classList.contains('collapsed');

// 状态变了就广播一次，让顶栏按钮等 UI 自己去同步
function commit() {
  const sbOpen = isOpen($sidebar());
  const pOpen  = isOpen(findRightPanel());
  $scrim()?.classList.toggle('show', isMobile() && (sbOpen || pOpen));
  document.dispatchEvent(new CustomEvent('drawer-change'));
}

export function syncDrawers() { commit(); }

export function initSidebar() {
  if (isMobile()) $sidebar()?.classList.add('collapsed');
  $scrim()?.addEventListener('pointerdown', e => e.stopPropagation());
  // 点遮罩两侧都收起。必须等到 click 再关，不能在 pointerdown 就把遮罩藏掉——
  // 否则 click 落地时它已消失，事件会穿透到底下的内容。
  $scrim()?.addEventListener('click', e => {
    e.stopPropagation();
    closeSidebar(); closeRightPanel();
  });
  window.addEventListener('resize', commit);
  commit();
}

export function toggleSidebar() {
  const sb = $sidebar();
  if (!sb) return;
  const willOpen = sb.classList.contains('collapsed');
  sb.classList.toggle('collapsed');
  // 手机端一次只容得下一个抽屉
  if (willOpen && isMobile()) findRightPanel()?.classList.add('collapsed');
  commit();
}

// 导航后调用：只在手机端收起，电脑端保持展开
export function closeSidebar() {
  if (!isMobile()) return;
  $sidebar()?.classList.add('collapsed');
  commit();
}

export function toggleRightPanel() {
  const p = findRightPanel();
  if (!p) return;
  const willOpen = p.classList.contains('collapsed');
  p.classList.toggle('collapsed');
  if (willOpen && isMobile()) $sidebar()?.classList.add('collapsed');
  commit();
}

export function closeRightPanel() {
  findRightPanel()?.classList.add('collapsed');
  commit();
}

// 页面挂载后调用：手机端宽度不够，右侧面板默认收起
export function initRightPanel() {
  if (isMobile()) findRightPanel()?.classList.add('collapsed');
  commit();
}
