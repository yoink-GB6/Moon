// pages/tv.js
// 上电视：多行横幅滚动（仅 character id=45 的 avatar_url）

import { supaClient, setSyncStatus, dbError } from '../core/supabase-client.js';
import { parseAvatarUrls, openImageViewer } from './characters/utils.js';

const CHAR_ID = 45;
const ROW_SPEEDS = [36, 48, 43];   // 各行速度(px/s)，略有差异形成错位
const DRAG_THRESHOLD = 5;          // 超过此位移判定为拖动，不触发点击放大

let _container = null;
let _urls = [];
let _rows = [];                    // 每行状态 { track, offset, speed, dir, contentWidth, paused, dragging }
let _cleanupFns = [];
let _raf = null;
let _lastT = 0;

export async function mount(container) {
  _container = container;
  container.innerHTML = _skeleton();
  await _fetch();

  if (_urls.length > 0) {
    const hint = container.querySelector('#tv-hint');
    await Promise.all(
      _urls.map(url => new Promise((resolve) => {
        const img = new Image();
        img.src = url;
        img.onload = () => {
          if (img.decode) img.decode().then(resolve).catch(resolve);
          else resolve();
        };
        img.onerror = resolve;
      }))
    );
  }

  _renderRows();
  _bindInteractions(container);
  _startAutoScroll();
}

export function unmount() {
  _stopAutoScroll();
  _cleanupFns.forEach(fn => { try { fn(); } catch(_){} });
  _cleanupFns = [];
  _container = null;
  _urls = [];
  _rows = [];
}

function _skeleton() {
  return `
    <div class="tv-page">
      <div class="tv-rows" id="tv-rows"></div>
      <div class="tv-hint" id="tv-hint"></div>
    </div>
  `;
}

async function _fetch() {
  setSyncStatus('syncing');
  try {
    const { data, error } = await supaClient
      .from('characters')
      .select('avatar_url')
      .eq('id', CHAR_ID)
      .single();
    if (error) throw error;
    _urls = parseAvatarUrls(data?.avatar_url);
    setSyncStatus('ok');
  } catch(e) {
    dbError('加载电视画廊', e);
    _urls = [];
  }
}

function _cardHTML(url) {
  const safeUrl = String(url).replace(/"/g, '&quot;');
  return `<div class="tv-card"><img src="${safeUrl}" alt="" draggable="false"/></div>`;
}

function _renderRows() {
  if (!_container) return;
  const rowsEl = _container.querySelector('#tv-rows');
  const hint = _container.querySelector('#tv-hint');
  if (!rowsEl || !hint) return;

  if (!_urls.length) {
    hint.textContent = '暂无图片';
    return;
  }

  const rowCount = window.innerWidth < 600 ? 2 : 3;
  const display = _urls.slice().sort(() => Math.random() - 0.5);

  // 轮流分配到各行
  const buckets = Array.from({ length: rowCount }, () => []);
  display.forEach((url, i) => buckets[i % rowCount].push(url));

  rowsEl.innerHTML = buckets.map(() => `
    <div class="tv-row"><div class="tv-row-track"></div></div>
  `).join('');

  const rowEls = rowsEl.querySelectorAll('.tv-row');
  _rows = [];
  buckets.forEach((urls, idx) => {
    const track = rowEls[idx].querySelector('.tv-row-track');
    // 两份相同副本拼接，实现无缝循环
    const copy = urls.map(_cardHTML).join('');
    track.innerHTML = copy + copy;
    _rows.push({
      track,
      offset: 0,
      speed: ROW_SPEEDS[idx % ROW_SPEEDS.length],
      dir: idx % 2 === 0 ? 1 : -1,
      contentWidth: 0,
      paused: false,
      dragging: false,
    });
  });

  // 等布局完成后测量一份副本宽度
  requestAnimationFrame(() => {
    _rows.forEach(r => { r.contentWidth = r.track.scrollWidth / 2; });
  });

}

function _applyRow(r) {
  r.track.style.transform = `translateX(${(-r.offset).toFixed(1)}px)`;
}

function _wrap(offset, w) {
  if (w <= 0) return offset;
  return ((offset % w) + w) % w;
}

function _bindInteractions(container) {
  const rowsEl = container.querySelector('#tv-rows');
  if (!rowsEl) return;

  const drag = { active: false, startX: 0, moved: false, rowIndex: -1, startOffset: 0 };

  const getX = (e) => e.touches ? e.touches[0].clientX : e.clientX;

  const onDown = (e) => {
    if (!e.touches && e.button !== 0) return;
    const rowEl = e.target.closest('.tv-row');
    if (!rowEl) return;
    const idx = Array.prototype.indexOf.call(rowsEl.children, rowEl);
    if (idx < 0 || !_rows[idx]) return;
    drag.active = true;
    drag.moved = false;
    drag.startX = getX(e);
    drag.rowIndex = idx;
    drag.startOffset = _rows[idx].offset;
    _rows[idx].dragging = true;
  };

  const onMove = (e) => {
    if (!drag.active) return;
    const r = _rows[drag.rowIndex];
    if (!r) return;
    const dx = getX(e) - drag.startX;
    if (Math.abs(dx) > DRAG_THRESHOLD) drag.moved = true;
    // 只拖被按住的那一行：右滑(dx>0)内容右移 → offset 减小
    r.offset = _wrap(drag.startOffset - dx, r.contentWidth);
    _applyRow(r);
  };

  const onUp = () => {
    if (!drag.active) return;
    drag.active = false;
    const r = _rows[drag.rowIndex];
    if (r) r.dragging = false;
    drag.rowIndex = -1;
  };

  _addListener(rowsEl, 'mousedown', onDown);
  _addListener(window, 'mousemove', onMove);
  _addListener(window, 'mouseup', onUp);
  _addListener(rowsEl, 'touchstart', onDown, { passive: true });
  _addListener(window, 'touchmove', onMove, { passive: true });
  _addListener(window, 'touchend', onUp);
  _addListener(window, 'touchcancel', onUp);

  // 点击放大（拖动过的不触发）
  _addListener(rowsEl, 'click', (e) => {
    if (drag.moved) return;
    const card = e.target.closest('.tv-card');
    if (!card) return;
    const img = card.querySelector('img');
    if (img && img.src) openImageViewer(img.src);
  });

  // 悬停暂停（逐行，桌面有效）
  const rowEls = rowsEl.querySelectorAll('.tv-row');
  rowEls.forEach((el, i) => {
    const enter = () => { if (_rows[i]) _rows[i].paused = true; };
    const leave = () => { if (_rows[i]) _rows[i].paused = false; };
    _addListener(el, 'mouseenter', enter);
    _addListener(el, 'mouseleave', leave);
  });
}

function _addListener(target, type, fn, options) {
  target.addEventListener(type, fn, options);
  _cleanupFns.push(() => target.removeEventListener(type, fn, options));
}

function _startAutoScroll() {
  if (_raf) return;
  _lastT = performance.now();
  const tick = (now) => {
    if (!_container) { _raf = null; return; }
    const dt = Math.min(0.05, (now - _lastT) / 1000);
    _lastT = now;
    _rows.forEach(r => {
      if (r.paused || r.dragging || r.contentWidth <= 0) return;
      r.offset = _wrap(r.offset + r.dir * r.speed * dt, r.contentWidth);
      _applyRow(r);
    });
    _raf = requestAnimationFrame(tick);
  };
  _raf = requestAnimationFrame(tick);
}

function _stopAutoScroll() {
  if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
}
