// pages/tv.js
// 上电视：多列竖向瀑布流（仅 character id=45 的 avatar_url）
// 等宽不等高 —— 聊天截图多为长图，锁宽才能保住可读性

import { supaClient, setSyncStatus, dbError } from '../core/supabase-client.js';
import { parseAvatarUrls, openImageViewer } from './characters/utils.js';

const CHAR_ID = 45;
const COL_SPEEDS = [22, 38, 30, 44, 26];  // 各列速度(px/s)，拉开差距避免同向列看起来同速
const COL_MIN_W  = 250;                   // 单列理想宽度，决定列数
const DRAG_THRESHOLD = 5;                 // 超过此位移判定为拖动，不触发点击放大

let _container = null;
let _urls = [];
let _cols = [];                  // { track, offset, speed, dir, period, paused, dragging }
let _cleanupFns = [];
let _raf = null;
let _lastT = 0;
let _resizeTimer = null;
let _colCount = 0;

export async function mount(container) {
  _container = container;
  container.innerHTML = _skeleton();
  await _fetch();

  if (_urls.length > 0) {
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

  _renderCols();
  _bindInteractions(container);
  _bindResize();
  _startAutoScroll();
}

export function unmount() {
  _stopAutoScroll();
  clearTimeout(_resizeTimer); _resizeTimer = null;
  _cleanupFns.forEach(fn => { try { fn(); } catch(_){} });
  _cleanupFns = [];
  _container = null;
  _urls = [];
  _cols = [];
  _colCount = 0;
}

function _skeleton() {
  return `
    <div class="tv-page">
      <div class="tv-cols" id="tv-cols"></div>
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
  return `<div class="tv-card"><img src="${safeUrl}" alt="" draggable="false" loading="eager"/></div>`;
}

function _calcColCount() {
  const w = _container?.clientWidth || window.innerWidth;
  return Math.max(2, Math.min(5, Math.floor(w / COL_MIN_W)));
}

function _renderCols() {
  if (!_container) return;
  const colsEl = _container.querySelector('#tv-cols');
  const hint   = _container.querySelector('#tv-hint');
  if (!colsEl || !hint) return;

  if (!_urls.length) {
    hint.textContent = 'Snow';
    return;
  }

  _colCount = _calcColCount();
  const display = _urls.slice().sort(() => Math.random() - 0.5);

  // 轮流分配到各列
  const buckets = Array.from({ length: _colCount }, () => []);
  display.forEach((url, i) => buckets[i % _colCount].push(url));

  // 两份相同副本上下拼接，实现无缝循环。
  // 用 .tv-half 包住每一份，是为了能精确量出一个循环周期
  // （直接用 scrollHeight/2 会漏掉两份之间那道 gap 的一半，日积月累会看到接缝跳动）
  colsEl.innerHTML = buckets.map(urls => {
    const half = `<div class="tv-half">${urls.map(_cardHTML).join('')}</div>`;
    return `<div class="tv-col"><div class="tv-col-track">${half + half}</div></div>`;
  }).join('');

  const colEls = colsEl.querySelectorAll('.tv-col');
  _cols = [];
  colEls.forEach((el, idx) => {
    _cols.push({
      track: el.querySelector('.tv-col-track'),
      offset: 0,
      speed: COL_SPEEDS[idx % COL_SPEEDS.length],
      dir: idx % 2 === 0 ? 1 : -1,
      period: 0,
      paused: false,
      dragging: false,
    });
  });

  _measure();

  // 每张图在窗口内随机时刻点亮
  const FADE_MAX = 1600;
  requestAnimationFrame(() => {
    colsEl.querySelectorAll('.tv-card').forEach(card => {
      card.style.transitionDelay = (Math.random() * FADE_MAX).toFixed(0) + 'ms';
      card.classList.add('show');
    });
  });
}

// 循环周期 = 一份副本的高度 + 一道 gap
function _measure() {
  requestAnimationFrame(() => {
    _cols.forEach(c => {
      const half = c.track.querySelector('.tv-half');
      if (!half) return;
      const gap = parseFloat(getComputedStyle(c.track).rowGap) || 0;
      c.period = half.offsetHeight + gap;
    });
  });
}

function _applyCol(c) {
  c.track.style.transform = `translateY(${(-c.offset).toFixed(1)}px)`;
}

function _wrap(offset, p) {
  if (p <= 0) return offset;
  return ((offset % p) + p) % p;
}

function _bindResize() {
  const onResize = () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
      if (!_container) return;
      // 列数变了才整体重排，否则只重新量一次周期（图片宽度变了高度也会变）
      if (_calcColCount() !== _colCount) { _renderCols(); _bindColHover(); }
      else _measure();
    }, 200);
  };
  _addListener(window, 'resize', onResize);
}

function _bindInteractions(container) {
  const colsEl = container.querySelector('#tv-cols');
  if (!colsEl) return;

  const drag = { active: false, startY: 0, moved: false, colIndex: -1, startOffset: 0 };
  const getY = (e) => e.touches ? e.touches[0].clientY : e.clientY;

  const onDown = (e) => {
    if (!e.touches && e.button !== 0) return;
    const colEl = e.target.closest('.tv-col');
    if (!colEl) return;
    const idx = Array.prototype.indexOf.call(colsEl.children, colEl);
    if (idx < 0 || !_cols[idx]) return;
    drag.active = true;
    drag.moved = false;
    drag.startY = getY(e);
    drag.colIndex = idx;
    drag.startOffset = _cols[idx].offset;
    _cols[idx].dragging = true;
  };

  const onMove = (e) => {
    if (!drag.active) return;
    const c = _cols[drag.colIndex];
    if (!c) return;
    const dy = getY(e) - drag.startY;
    if (Math.abs(dy) > DRAG_THRESHOLD) drag.moved = true;
    // 只拖被按住的那一列：下滑(dy>0)内容下移 → offset 减小
    c.offset = _wrap(drag.startOffset - dy, c.period);
    _applyCol(c);
  };

  const onUp = () => {
    if (!drag.active) return;
    drag.active = false;
    const c = _cols[drag.colIndex];
    if (c) c.dragging = false;
    drag.colIndex = -1;
  };

  _addListener(colsEl, 'mousedown', onDown);
  _addListener(window, 'mousemove', onMove);
  _addListener(window, 'mouseup', onUp);
  _addListener(colsEl, 'touchstart', onDown, { passive: true });
  _addListener(window, 'touchmove', onMove, { passive: true });
  _addListener(window, 'touchend', onUp);
  _addListener(window, 'touchcancel', onUp);

  // 滚轮：滚哪一列动哪一列
  _addListener(colsEl, 'wheel', (e) => {
    const colEl = e.target.closest('.tv-col');
    if (!colEl) return;
    const idx = Array.prototype.indexOf.call(colsEl.children, colEl);
    const c = _cols[idx];
    if (!c || c.period <= 0) return;
    e.preventDefault();
    c.offset = _wrap(c.offset + e.deltaY, c.period);
    _applyCol(c);
  }, { passive: false });

  // 点击放大（拖动过的不触发）
  _addListener(colsEl, 'click', (e) => {
    if (drag.moved) return;
    const card = e.target.closest('.tv-card');
    if (!card) return;
    const img = card.querySelector('img');
    if (img && img.src) openImageViewer(img.src);
  });

  _bindColHover();
}

// 悬停暂停（逐列，桌面有效）。重排后需要重新绑，所以单独抽出来。
function _bindColHover() {
  if (!_container) return;
  _container.querySelectorAll('.tv-col').forEach((el, i) => {
    _addListener(el, 'mouseenter', () => { if (_cols[i]) _cols[i].paused = true; });
    _addListener(el, 'mouseleave', () => { if (_cols[i]) _cols[i].paused = false; });
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
    _cols.forEach(c => {
      if (c.paused || c.dragging || c.period <= 0) return;
      c.offset = _wrap(c.offset + c.dir * c.speed * dt, c.period);
      _applyCol(c);
    });
    _raf = requestAnimationFrame(tick);
  };
  _raf = requestAnimationFrame(tick);
}

function _stopAutoScroll() {
  if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
}
