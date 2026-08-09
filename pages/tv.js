// pages/tv.js
// 上电视：多列竖向瀑布流（仅 character id=45 的 avatar_url）
// 等宽不等高 —— 聊天截图多为长图，锁宽才能保住可读性
//
// 循环用「传送带」而不是「复制整份内容再取模平移」：
// 一张图只有一个 DOM 节点，滚出上边就把它搬到队尾，同时把它的高度从 offset 里扣掉，
// 视觉上纹丝不动，但队列可以一直走下去，根本不存在「接缝」这个概念。
//
// 之所以放弃复制方案：轨道带 will-change 会被提升成合成层，几张长截图复制三四份
// 就有两三万像素高，超过 GPU 单张纹理上限后浏览器改成按瓦片栅格化，
// 滚到没栅格化过的那段就闪一下 —— 而且复制得越多图层越高，越容易触发。

import { supaClient, setSyncStatus, dbError } from '../core/supabase-client.js';
import { openImageViewer } from '../core/ui.js';
import { parseAvatarUrls } from './characters/utils.js';

const CHAR_ID = 45;
const COL_SPEEDS = [22, 38, 30, 44, 26];  // 各列速度(px/s)，拉开差距避免同向列看起来同速
const COL_MIN_W  = 250;                   // 单列理想宽度，决定列数
const DRAG_THRESHOLD = 5;                 // 超过此位移判定为拖动，不触发点击放大

let _container = null;
let _urls = [];
let _cols = [];                  // { track, urls, offset, speed, dir, gap, ready, paused, dragging }
let _cleanupFns = [];
let _raf = null;
let _lastT = 0;
let _resizeTimer = null;
let _colCount = 0;
let _firstRender = true;
let _mountSeq = 0;   // mount 里有两次 await 网络，期间可能已经切走了

export async function mount(container) {
  const seq = ++_mountSeq;
  _container = container;
  container.innerHTML = _skeleton();
  await _fetch();
  if (seq !== _mountSeq || !_container) return;   // 已经切走或又挂了一次

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

  if (seq !== _mountSeq || !_container) return;

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
  _firstRender = true;
  _mountSeq++;          // 让还在 await 里的那个 mount 作废
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

  hint.textContent = _urls.length ? '' : 'Snow';
  hint.style.display = _urls.length ? 'none' : '';   // 空文本时别留一个空胶囊
  if (!_urls.length) return;

  _colCount = _calcColCount();
  const display = _urls.slice().sort(() => Math.random() - 0.5);

  // 轮流分配到各列
  const buckets = Array.from({ length: _colCount }, () => []);
  display.forEach((url, i) => buckets[i % _colCount].push(url));

  // 卡片直接放进轨道，一张图一个节点。内容不够铺满一屏时 _measure 会补，
  // 但那是补「够用」，不是复制整份做周期。
  colsEl.innerHTML = buckets.map(urls =>
    `<div class="tv-col"><div class="tv-col-track">${urls.map(_cardHTML).join('')}</div></div>`
  ).join('');

  const colEls = colsEl.querySelectorAll('.tv-col');
  _cols = [];
  colEls.forEach((el, idx) => {
    _cols.push({
      track: el.querySelector('.tv-col-track'),
      urls: buckets[idx],
      offset: 0,
      speed: COL_SPEEDS[idx % COL_SPEEDS.length],
      dir: idx % 2 === 0 ? 1 : -1,
      gap: 0,
      ready: false,
      paused: false,
      dragging: false,
    });
  });

  _measure();

  // 每张图在窗口内随机时刻点亮。
  // 只有首次进页面才演这一下——resize 会整体重排，每拖一次窗口边就重放一遍太吵。
  const FADE_MAX = 1600;
  const instant = !_firstRender;
  _firstRender = false;
  requestAnimationFrame(() => {
    colsEl.querySelectorAll('.tv-card').forEach(card => {
      if (instant) card.style.transition = 'none';
      else card.style.transitionDelay = (Math.random() * FADE_MAX).toFixed(0) + 'ms';
      card.classList.add('show');
    });
  });
}

// 量一次高度存进节点，之后每帧只做加减，不再读布局。
// 用 getBoundingClientRect().height 而不是 offsetHeight：后者返回取整值，
// 而图片按比例缩放出来的高度是小数，取整会让传送带每搬一次就错半个像素。
function _measure(attempt = 0) {
  requestAnimationFrame(() => {
    if (!_container) return;
    let bad = false;
    _cols.forEach(c => {
      // attempt>0 是「补量」：已经量好的列别再碰，否则 offset 归零会让它跳回顶部
      if (attempt > 0 && c.ready) return;
      const gap  = parseFloat(getComputedStyle(c.track).rowGap) || 0;
      const colH = c.track.parentElement.clientHeight;
      c.gap = gap;
      c.ready = false;

      let cards = Array.from(c.track.children);
      if (!cards.length) return;

      const hOf   = el => el.getBoundingClientRect().height;
      const total = () => cards.reduce((sum, el) => sum + hOf(el) + gap, 0);
      const maxH  = () => Math.max(...cards.map(hOf));

      // 图片还没排好版时高度会读成 0，这时量出来的一切都是错的。
      // 绝不能带着错数据标 ready —— _h 是一次性存的、之后每帧只做加减，
      // 错了自己永远纠不回来。宁可下一帧重量。
      if (!colH || cards.some(el => hOf(el) <= 0)) { bad = true; return; }

      // 队列里的卡必须够盖住一屏：归一化后 offset 最多是队首那张的高度，
      // 所以总高要 ≥ 列高 + 最高的一张 + 两道 gap，否则传送带中间会露空 ——
      // 表现就是每转一圈闪一下，而且刷新之前不会自愈
      let guard = 0;
      while (total() < colH + maxH() + gap * 2 && guard++ < 8) {
        cards.forEach(el => c.track.appendChild(el.cloneNode(true)));
        cards = Array.from(c.track.children);
      }
      // 克隆 8 轮还盖不住，说明量到的高度本身就不对劲
      if (total() < colH + maxH() + gap * 2) { bad = true; return; }

      cards.forEach(el => { el._h = hOf(el) + gap; });
      c.offset = 0;
      c.ready = true;
      _applyCol(c);
    });

    // 只重试有限次，免得图片真的加载失败时无限刷
    if (bad && attempt < 30) _measure(attempt + 1);
  });
}

function _applyCol(c) {
  c.track.style.transform = `translateY(${(-c.offset).toFixed(2)}px)`;
}

// 把 offset 收进 [0, 队首高度) —— 越界就搬一张卡到另一头，
// 同时把它的高度从 offset 里加减掉，所以画面上什么都不会动。
function _normalize(c) {
  const t = c.track;
  let guard = 0;
  while (guard++ < 500) {
    const first = t.firstElementChild;
    if (!first) return;
    // _h 不是正数就说明这一列的测量作废了。继续走下去 while 会每帧空转到
    // 500 次上限、每帧搬 500 个 DOM 节点，所以直接停掉这一列并要求重量。
    if (!(first._h > 0)) { c.ready = false; _measure(1); return; }
    if (c.offset >= first._h) {
      c.offset -= first._h;
      t.appendChild(first);
      continue;
    }
    if (c.offset < 0) {
      const last = t.lastElementChild;
      t.insertBefore(last, first);
      c.offset += last._h;
      continue;
    }
    return;
  }
}

function _bindResize() {
  const onResize = () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
      if (!_container) return;
      // 列宽一变每张卡的高度就变了，存下来的 _h 全作废，
      // 所以不管列数变没变都整体重排一次
      _renderCols();
      _bindColHover();
    }, 200);
  };
  _addListener(window, 'resize', onResize);
}

function _bindInteractions(container) {
  const colsEl = container.querySelector('#tv-cols');
  if (!colsEl) return;

  // 用增量而不是「起点 offset − 总位移」：_normalize 在拖动途中就会改 offset，
  // 再用绝对量去算就会跳
  const drag = { active: false, lastY: 0, total: 0, moved: false, colIndex: -1 };
  const getY = (e) => e.touches ? e.touches[0].clientY : e.clientY;

  const onDown = (e) => {
    if (!e.touches && e.button !== 0) return;
    // 触屏上不存在悬停，所以也不该有任何列因为 hover 停着。
    // 万一某个浏览器仍然补发出 mouse 型的 enter，这里兜底解开
    if (e.touches) _cols.forEach(col => { col.paused = false; });
    const colEl = e.target.closest('.tv-col');
    if (!colEl) return;
    const idx = Array.prototype.indexOf.call(colsEl.children, colEl);
    if (idx < 0 || !_cols[idx]) return;
    drag.active = true;
    drag.moved = false;
    drag.lastY = getY(e);
    drag.total = 0;
    drag.colIndex = idx;
    _cols[idx].dragging = true;
  };

  const onMove = (e) => {
    if (!drag.active) return;
    const c = _cols[drag.colIndex];
    if (!c || !c.ready) return;
    const y  = getY(e);
    const dy = y - drag.lastY;
    drag.lastY = y;
    drag.total += dy;
    if (Math.abs(drag.total) > DRAG_THRESHOLD) drag.moved = true;
    // 只拖被按住的那一列：下滑(dy>0)内容下移 → offset 减小
    c.offset -= dy;
    _normalize(c);
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
    if (!c || !c.ready) return;
    e.preventDefault();
    c.offset += e.deltaY;
    _normalize(c);
    _applyCol(c);
  }, { passive: false });

  // 点击放大（拖动过的不触发）
  _addListener(colsEl, 'click', (e) => {
    if (drag.moved) return;
    const card = e.target.closest('.tv-card');
    if (!card) return;
    const img = card.querySelector('img');
    if (!img || !img.src) return;
    // 查看器盖住整屏，后面滚了也没人看见 —— 全冻住，关掉之后整面墙还在原位，
    // 才找得到刚才那张图旁边的几张。不靠 hover 判断：触屏根本没有 hover。
    _stopAutoScroll();
    openImageViewer(img.src, () => { if (_container) _startAutoScroll(); });
  });

  _bindColHover();
}

// 悬停暂停（逐列，桌面有效）。重排后需要重新绑，所以单独抽出来。
//
// 必须过滤 pointerType：触屏点一下浏览器会补发一整套鼠标事件（含 enter），
// 但没有「把指针移开」这回事，leave 永远不来 —— 那一列就永久停住了。
// 表现就是关掉图片查看器后，手指落点所在的那列不动了。
function _bindColHover() {
  if (!_container) return;
  _container.querySelectorAll('.tv-col').forEach((el, i) => {
    _addListener(el, 'pointerenter', e => {
      if (e.pointerType === 'mouse' && _cols[i]) _cols[i].paused = true;
    });
    _addListener(el, 'pointerleave', e => {
      if (e.pointerType === 'mouse' && _cols[i]) _cols[i].paused = false;
    });
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
      if (c.paused || c.dragging || !c.ready) return;
      c.offset += c.dir * c.speed * dt;
      _normalize(c);
      _applyCol(c);
    });
    _raf = requestAnimationFrame(tick);
  };
  _raf = requestAnimationFrame(tick);
}

function _stopAutoScroll() {
  if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
}
