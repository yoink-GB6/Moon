// core/ui.js
// 公共 UI 工具：Toast、通用 Modal

import { createPanZoom } from './pan-zoom.js';

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

// ── 全屏图片查看器 ──────────────────────────────────
// 图片按自然尺寸渲染 + transform-origin:0 0，于是 k 就是真实缩放倍率，
// 边界夹紧的数学才写得简单。手势力学在 core/pan-zoom.js。
//
// 关闭有两条路，互补对方的盲区：
//   点图外 —— fit 状态下长图是一条竖签，周围全是空白，好点
//   捏合缩小 —— 放大后图铺满屏幕、没有「图外」可点时靠它
// 单击图片本身不关闭，那一下留给双击跳挡（否则双击的第一下会先把它关掉）。

let _iv = null;

// 触屏上手指抬起走的是 pointerup，查看器当场 display:none，
// 之后浏览器才把这次触摸补发成一个 click —— 那时重新命中，就落到下面的卡片上
// 又开了一张图。桌面的 click 紧跟 mouseup 同帧派发，目标早已定好，所以没这个问题。
// 因此由指针手势触发的关闭，要把紧随其后的那一个 click 吞掉。
function _swallowNextClick() {
  const kill = e => { e.stopPropagation(); e.preventDefault(); };
  document.addEventListener('click', kill, true);
  setTimeout(() => document.removeEventListener('click', kill, true), 400);
}

export function closeImageViewer(byPointer) {
  if (!_iv) return;
  const s = _iv;
  _iv = null;
  s.pz.destroy();
  document.removeEventListener('keydown', s.onKey);
  s.el.classList.remove('show');
  s.el.style.opacity = '';
  if (byPointer) _swallowNextClick();
}

export function openImageViewer(url) {
  closeImageViewer();

  let el = document.getElementById('img-viewer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'img-viewer';
    el.className = 'img-viewer';
    el.innerHTML = '<img class="img-viewer-img" draggable="false" alt=""/>';
    document.body.appendChild(el);
  }
  const img = el.querySelector('.img-viewer-img');

  const s = { el, img, iw: 0, ih: 0, cw: 0, ch: 0, kFit: 1, kZoom: 1, downOnImg: false };
  s.onKey = e => { if (e.key === 'Escape') closeImageViewer(); };
  document.addEventListener('keydown', s.onKey);

  const pz = createPanZoom(el, {
    apply(v) {
      img.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.k})`;
      // 缩到 fit 以下时整层跟着淡出，预告「再松手就退出」
      const t = s.kFit ? Math.min(1, v.k / s.kFit) : 1;
      el.style.opacity = t < 1 ? String(0.3 + 0.7 * t) : '';
    },
    clamp(v) {
      if (!s.iw) return;
      const w = s.iw * v.k, h = s.ih * v.k;
      // 比容器小就居中锁死，比容器大就夹住别让边缘缩进画面
      v.x = w <= s.cw ? (s.cw - w) / 2 : Math.min(0, Math.max(s.cw - w, v.x));
      v.y = h <= s.ch ? (s.ch - h) / 2 : Math.min(0, Math.max(s.ch - h, v.y));
    },
    // 只借这个钩子记住按下时命中的是不是图片本身：
    // setPointerCapture 之后 pointerup 的 target 全变成容器，那时再判断就晚了
    onDragStart(e) { s.downOnImg = (e.target === img); return null; },
    onTap() { if (!s.downOnImg) closeImageViewer(true); },
    onDoubleTap(e, x, y) {
      pz.zoomAt(pz.view.k > s.kFit * 1.05 ? s.kFit : s.kZoom, x, y);
    },
    onGestureEnd() {
      if (pz.view.k < s.kFit * 0.72) return closeImageViewer(true);
      if (pz.view.k < s.kFit) _fitViewer(s, pz);   // 缩得不够多，弹回去
      el.style.opacity = '';
    },
  });
  s.pz = pz;
  _iv = s;

  img.removeAttribute('style');
  img.src = url;
  el.classList.add('show');

  // 要等解码完才有 naturalWidth；tv.js 拉图时也是这个套路
  const ready = img.decode ? img.decode().catch(() => {}) : Promise.resolve();
  ready.then(() => {
    if (_iv !== s || !img.naturalWidth) return;
    s.iw = img.naturalWidth;  s.ih = img.naturalHeight;
    s.cw = el.clientWidth;    s.ch = el.clientHeight;
    img.style.width  = s.iw + 'px';
    img.style.height = s.ih + 'px';

    s.kFit  = Math.min(s.cw / s.iw, s.ch / s.ih);
    // 双击去的那一挡是「宽度铺满」——长截图唯一有用的挡位。
    // 但绝不超过原始像素：桌面窗口比截图还宽时，铺满等于把图放大到糊，
    // 那种情况停在 1:1 反而最清楚。
    s.kZoom = Math.min(1, s.cw / s.iw);
    // 宽图本来 fit 就已经是满宽了，上面算出来会等于 kFit，双击就成了没反应，
    // 这时只能兜一个 2×（宽图想看细节，横向溢出是绕不开的）
    if (s.kZoom < s.kFit * 1.05) s.kZoom = s.kFit * 2;
    pz.min  = s.kFit * 0.4;   // 留出缩过头的空间给退出手势
    pz.max  = Math.max(s.kZoom * 3, s.kFit * 8);   // 双击那一挡之上还要能继续放大
    _fitViewer(s, pz);
  });
}

function _fitViewer(s, pz) {
  pz.view.k = s.kFit;
  pz.view.x = (s.cw - s.iw * s.kFit) / 2;
  pz.view.y = (s.ch - s.ih * s.kFit) / 2;
  pz.apply();
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
