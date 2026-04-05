// pages/gacha.js
import { supaClient } from '../core/supabase-client.js';
import { escHtml, showToast } from '../core/ui.js';
import { parseAvatarUrls } from './characters/utils.js';
import { openCharReadonly } from './characters/modals/char-readonly-modal.js';
import * as State from './characters/state.js';
import { loadAllData } from './characters/data-loader.js';

const POOL_RESERVE = 3;  // 永远抽不到的图片数
const MIN_STROKE   = 50; // 最短有效笔迹 px，防止误触

let _container = null;
let _canvas    = null;
let _ctx       = null;
let _mounted   = false;

let _allImages     = [];
let _drawnUrls     = new Set();
let _preloadedUrls = new Set();
let _charMap       = new Map();
let _hand          = [];
let _loadPromise   = null;  // 数据加载 Promise，_doDraw 等它

// 笔迹状态
let _drawing = false;
let _pts     = [];   // {x, y, t}
let _pathLen = 0;
let _strokes = [];   // {pts, alpha, t0} — 正在淡出的笔迹

// 全屏闪光
let _flashT0  = 0;
const FLASH_RISE = 900;  // ms，笔迹从暗慢慢升到最亮
const FLASH_HOLD = 300;  // ms，最亮时停一下再弹卡

// 粒子
let _particles      = [];   // {x0,y0,vx,vy,r,born,life}
let _lastParticleT  = 0;

// 动画循环
let _rafId      = null;
let _animOn     = false;
let _drawRafId  = null;  // 按住期间的持续循环
let _cursorPt   = null;  // 最后已知的指针位置（按住时持续发粒子用）

// 抽卡锁：viewer 打开期间为 true，关闭后解锁
let _locked          = false;
let _drawTimer       = null;  // 待触发的抽卡定时器
let _clearStrokesAt  = 0;     // 笔迹从这一刻开始淡出（0=不淡出）
let _idleTimer       = null;  // 停笔 1.2s 后自动淡出笔迹

// Viewer AbortController（防止重复监听器）
let _viewerAC = null;

const CARD_W = 88, CARD_H = 124;

// ── Mount / Unmount ───────────────────────────────────────────
export function mount(container) {
  _mounted   = true;
  _container = container;
  State.setPageContainer(container);
  container.innerHTML = `
<div class="gacha-page">
  <canvas id="gacha-draw-canvas" class="gacha-draw-canvas"></canvas>
  <div class="gacha-hint" id="gacha-hint">生命、宇宙以及一切</div>
  <div id="gacha-hand" class="gacha-hand"></div>
</div>`;

  _canvas = container.querySelector('#gacha-draw-canvas');
  _ctx    = _canvas.getContext('2d');

  _bindEvents();
  window.addEventListener('resize', _onResize);
  requestAnimationFrame(() => requestAnimationFrame(_resizeCanvas));

  // 后台静默加载，不阻塞画布交互
  _loadPromise = Promise.all([loadAllData(), _loadImages()]).then(() => {
    if (!_mounted) return;
    _buildCharMap();
    _updateHint();
  });
}

export function unmount() {
  _mounted = false;
  if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
  if (_viewerAC) { _viewerAC.abort(); _viewerAC = null; }
  window.removeEventListener('resize', _onResize);

  // 隐藏挂在 body 上的浮层
  const viewer = document.getElementById('gacha-viewer');
  if (viewer)  viewer.classList.remove('show');

  if (_drawRafId) { cancelAnimationFrame(_drawRafId); _drawRafId = null; }
  _allImages = []; _drawnUrls = new Set(); _preloadedUrls = new Set(); _charMap = new Map();
  _hand = []; _strokes = []; _pts = []; _particles = []; _drawing = false;
  _animOn = false; _lastParticleT = 0; _cursorPt = null; _loadPromise = null; _locked = false; _clearStrokesAt = 0;
  if (_drawTimer) { clearTimeout(_drawTimer); _drawTimer = null; }
  if (_idleTimer) { clearTimeout(_idleTimer); _idleTimer = null; }
  _canvas = null; _ctx = null; _container = null;
}

// ── 图片数据 ──────────────────────────────────────────────────
async function _loadImages() {
  try {
    const { data, error } = await supaClient.storage.from('avatars').list('', { limit: 300 });
    if (error || !data) return;
    const re = /\.(jpe?g|png|gif|webp|avif)$/i;
    _allImages = data.filter(f => re.test(f.name)).map(f => ({
      filename: f.name,
      url: supaClient.storage.from('avatars').getPublicUrl(f.name).data.publicUrl,
    }));
  } catch (e) { console.error('gacha: load images', e); }
  // 方案二：图片列表加载完后随机预热 6 张
  _preloadRandom(6);
}

function _preloadRandom(n) {
  if (!_allImages.length) return;
  const unloaded = _allImages.filter(img => !_preloadedUrls.has(img.url));
  const pool = unloaded.sort(() => Math.random() - 0.5).slice(0, n);
  pool.forEach(img => { _preloadedUrls.add(img.url); const i = new Image(); i.src = img.url; });
}

function _preloadNext(n) {
  _preloadRandom(n);
}

function _normUrl(url) {
  if (!url) return '';
  try { return new URL(url).pathname.split('/').filter(Boolean).pop() || ''; }
  catch (_) { return url.split('/').filter(Boolean).pop().split('?')[0] || ''; }
}

function _buildCharMap() {
  _charMap = new Map();
  State.allChars.forEach(char => {
    parseAvatarUrls(char.avatar_url).forEach(url => {
      _charMap.set(url, char);
      _charMap.set(_normUrl(url), char);
    });
  });
}

function _charForUrl(url) {
  return _charMap.get(url) || _charMap.get(_normUrl(url)) || null;
}

// ── 画布尺寸 ──────────────────────────────────────────────────
function _resizeCanvas() {
  if (!_canvas || !_container) return;
  const page = _container.querySelector('.gacha-page');
  if (!page) return;
  const r = page.getBoundingClientRect();
  _canvas.width  = Math.round(r.width);
  _canvas.height = Math.round(r.height);
  _redraw();
}

const _onResize = () => _resizeCanvas();

// ── 指针事件 ──────────────────────────────────────────────────
function _bindEvents() {
  _canvas.addEventListener('pointerdown',   _onDown);
  _canvas.addEventListener('pointermove',   _onMove);
  _canvas.addEventListener('pointerup',     _onUp);
  _canvas.addEventListener('pointercancel', _onUp);
}

function _onDown(e) {
  // 新笔落下：取消抽卡定时器，取消 idle 淡出，保持笔迹
  if (_drawTimer) { clearTimeout(_drawTimer); _drawTimer = null; }
  if (_idleTimer) { clearTimeout(_idleTimer); _idleTimer = null; }
  _clearStrokesAt = 0;
  _drawing    = true;
  _cursorPt   = { x: e.offsetX, y: e.offsetY };
  _pts        = [{ x: e.offsetX, y: e.offsetY, t: performance.now() }];
  _pathLen    = 0;
  _canvas.setPointerCapture(e.pointerId);
  _startDrawLoop();
}

function _onMove(e) {
  if (!_drawing) return;
  const prev = _pts[_pts.length - 1];
  const pt   = { x: e.offsetX, y: e.offsetY, t: performance.now() };
  _pathLen += Math.hypot(pt.x - prev.x, pt.y - prev.y);
  _pts.push(pt);
  _cursorPt = { x: pt.x, y: pt.y };
}

function _onUp() {
  if (!_drawing) return;
  _drawing  = false;
  _cursorPt = null;
  if (_drawRafId) { cancelAnimationFrame(_drawRafId); _drawRafId = null; }
  if (_pathLen < MIN_STROKE) { _pts = []; _redraw(); _startAnim(); }
  else _commitStroke();
  // 停笔 1.2s 后没新笔就淡出所有笔迹
  if (_idleTimer) clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => {
    _idleTimer = null;
    if (!_drawing) { _clearStrokesAt = performance.now(); _startAnim(); }
  }, 1200);
}

// 按住期间持续循环：发粒子 + 重绘
function _startDrawLoop() {
  if (_drawRafId) return;
  const tick = (now) => {
    if (!_drawing) { _drawRafId = null; return; }
    _drawRafId = requestAnimationFrame(tick);
    if (_cursorPt && now - _lastParticleT > 18) {
      _addParticles(_cursorPt.x, _cursorPt.y);
      _lastParticleT = now;
    }
    _redraw();
  };
  _drawRafId = requestAnimationFrame(tick);
}

// ── 笔迹绘制 ──────────────────────────────────────────────────
function _redraw() {
  if (!_ctx || !_canvas) return;
  const now = performance.now();
  _ctx.clearRect(0, 0, _canvas.width, _canvas.height);

  // 粒子
  const alive = [];
  for (const p of _particles) {
    const age = now - p.born;
    if (age >= p.life) continue;
    alive.push(p);
    const t  = age / p.life;
    const a  = (1 - t) * 0.9;
    const px = p.x0 + p.vx * age;
    const py = p.y0 + p.vy * age;
    _ctx.save();
    _ctx.shadowColor = `rgba(255,240,160,${a})`;
    _ctx.shadowBlur  = 8;
    _ctx.fillStyle   = `rgba(255,250,210,${a})`;
    _ctx.beginPath();
    _ctx.arc(px, py, p.r * (1 - t * 0.5), 0, Math.PI * 2);
    _ctx.fill();
    _ctx.restore();
  }
  _particles = alive;

  // 笔迹发光进度：0→1 慢慢升（ease-in），过了峰值保持 1
  const flashAge  = now - _flashT0;
  const flashGlow = _flashT0
    ? Math.min(1, (flashAge / FLASH_RISE) ** 4)  // 指数：前段几乎不动，末段爆发
    : 0;

  // 笔迹（画时 + 淡出中的）
  for (const s of _strokes) _drawStroke(_ctx, s.pts, s.alpha, flashGlow);
  if (_drawing && _pts.length > 1) _drawStroke(_ctx, _pts, 1, 0);
}

// 平滑路径辅助（不含 moveTo）
function _buildCurve(ctx, pts) {
  if (pts.length === 2) {
    ctx.lineTo(pts[1].x, pts[1].y);
    return;
  }
  for (let i = 0; i < pts.length - 2; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  const n = pts.length;
  ctx.quadraticCurveTo(pts[n - 2].x, pts[n - 2].y, pts[n - 1].x, pts[n - 1].y);
}

function _drawStroke(ctx, pts, alpha, glow) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.lineCap  = 'round';
  ctx.lineJoin = 'round';

  // 外晕（两遍叠加，窄而亮）
  for (let pass = 0; pass < (glow > 0.2 ? 2 : 1); pass++) {
    const hg = Math.round(185 + glow * 40);
    ctx.shadowColor = `rgba(255,${hg},80,${Math.min(1, alpha * (1 + glow * 1.2))})`;
    ctx.shadowBlur  = 8 + glow * 16 + pass * 8;
    ctx.strokeStyle = `rgba(255,${Math.round(210 + glow * 20)},80,${alpha * (pass === 0 ? 1 : 0.5)})`;
    ctx.lineWidth   = 1.2;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    _buildCurve(ctx, pts);
    ctx.stroke();
  }

  // 内芯：glow 时稍微偏白（金→浅金），幅度小
  ctx.shadowBlur  = 5 + glow * 14;
  ctx.shadowColor = `rgba(255,${Math.round(210 + glow * 30)},${Math.round(50 + glow * 60)},${alpha})`;
  ctx.strokeStyle = `rgba(255,${Math.round(220 + glow * 25)},${Math.round(100 + glow * 80)},${alpha})`;
  ctx.lineWidth   = 0.5;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  _buildCurve(ctx, pts);
  ctx.stroke();

  ctx.restore();
}

function _addParticles(x, y) {
  const now = performance.now();
  for (let i = 0; i < 3; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2; // 主要向上，±108°散开
    const speed = 0.012 + Math.random() * 0.025; // px/ms，慢飘
    _particles.push({
      x0: x + (Math.random() - 0.5) * 8,
      y0: y + (Math.random() - 0.5) * 4,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r:  0.6 + Math.random() * 1.0,
      born: now,
      life: 700 + Math.random() * 600,
    });
  }
}

function _commitStroke() {
  const frozenPts = [..._pts];
  _pts = [];
  const now = performance.now();
  _clearStrokesAt = 0;  // 重置，笔迹在 viewer 打开前不淡出
  _strokes.push({ pts: frozenPts, alpha: 1.0, t0: now, glowStart: now });
  _flashT0 = now;
  _startAnim();
  // 升到最亮再停一下，然后弹卡（已锁定时跳过）
  _drawTimer = setTimeout(() => { _drawTimer = null; if (!_locked) _doDraw(); }, FLASH_RISE + FLASH_HOLD);
}

// ── 笔迹淡出动画 ─────────────────────────────────────────────
function _startAnim() {
  if (_animOn) return;
  _animOn = true;
  const tick = (now) => {
    let alive = false;
    for (const s of _strokes) {
      // viewer 未打开（_clearStrokesAt=0）：保持 alpha=1
      // viewer 打开后：从 _clearStrokesAt 开始淡出
      if (!_clearStrokesAt) {
        s.alpha = 1.0;
      } else {
        const fadeAge = now - _clearStrokesAt;
        s.alpha = Math.max(0, 1 - fadeAge / 900);
      }
      if (s.alpha > 0) alive = true;
    }
    _strokes = _strokes.filter(s => s.alpha > 0);
    if (_particles.some(p => now - p.born < p.life)) alive = true;
    if (_flashT0 && now - _flashT0 < FLASH_RISE + FLASH_HOLD) alive = true;
    _redraw();
    if (alive) {
      _rafId = requestAnimationFrame(tick);
    } else {
      _animOn = false;
      _rafId  = null;
    }
  };
  _rafId = requestAnimationFrame(tick);
}

// ── 抽卡逻辑 ─────────────────────────────────────────────────
async function _doDraw() {
  if (_loadPromise) await _loadPromise;
  if (!_mounted || _locked) return;
  _locked = true;
  if (!_allImages.length) { _locked = false; showToast('暂无图片'); return; }
  const limit = Math.max(0, _allImages.length - POOL_RESERVE);
  if (_drawnUrls.size >= limit) { _locked = false; showToast('在等谁呢？'); return; }

  const available = _allImages.filter(img => !_drawnUrls.has(img.url));
  const pick      = available[Math.floor(Math.random() * available.length)];
  _drawnUrls.add(pick.url);
  _preloadNext(1);
  _updateHint();

  _openGachaViewer(pick.url, () => {
    _locked = false;
    _clearCanvas();
    _hand.push({ url: pick.url, char: _charForUrl(pick.url) });
    _renderHand();
  });
}

// ── 查看器 ────────────────────────────────────────────────────
function _openGachaViewer(url, onClose) {
  if (_viewerAC) { _viewerAC.abort(); }
  _viewerAC = new AbortController();
  const sig = _viewerAC.signal;

  let viewer = document.getElementById('gacha-viewer');
  if (!viewer) {
    viewer = document.createElement('div');
    viewer.id        = 'gacha-viewer';
    viewer.className = 'gacha-viewer';
    document.body.appendChild(viewer);
  }

  const char = _charForUrl(url);
  viewer.innerHTML = `
    <div class="gacha-vimg-wrap">
      <div class="gacha-img-loading"><div class="gacha-img-ring"></div></div>
      <img src="${escHtml(url)}" class="gacha-viewer-img" draggable="false" style="opacity:0"/>
    </div>`;
  viewer.style.display = '';
  viewer.classList.add('show');

  const wrap = viewer.querySelector('.gacha-vimg-wrap');
  const img  = wrap.querySelector('img');
  const ring = wrap.querySelector('.gacha-img-loading');

  // 图片加载完后淡入，隐藏转圈
  function _onImgReady() {
    ring.style.display = 'none';
    img.style.transition = 'opacity 0.3s';
    img.style.opacity = '1';
  }
  if (img.complete) { _onImgReady(); }
  else { img.addEventListener('load', _onImgReady, { once: true }); }

  // viewer 打开：从现在开始淡出所有笔迹
  _clearStrokesAt = performance.now();
  _startAnim();
  // 先定在 scaleX(0)，等元素真正渲染后再展开
  wrap.style.transition = 'none';
  wrap.style.transform  = 'scaleX(0)';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    wrap.style.transition = 'transform 0.4s cubic-bezier(0.4,0,0.2,1)';
    wrap.style.transform  = 'scaleX(1)';
  }));
  let _closed = false;

  let _flipped = false;  // 无角色图片是否已翻到"敬请期待"面

  function collapseAndReveal() {
    if (_closed) return;
    wrap.style.transition = 'transform 0.25s cubic-bezier(0.4,0,0.2,1)';
    wrap.style.transform  = 'scaleX(0)';
    wrap.addEventListener('transitionend', function handler() {
      wrap.removeEventListener('transitionend', handler);
      if (!_mounted) return;
      if (char) {
        // 有角色：关闭 viewer，打开人物介绍
        _closed = true;
        if (_viewerAC) { _viewerAC.abort(); _viewerAC = null; }
        viewer.classList.remove('show');
        openCharReadonly(char, undefined, url);
        _animateModalEnter();
        onClose();
      } else if (!_flipped) {
        // 无角色第一次点击：换成暗图+敬请期待，再展开
        _flipped = true;
        wrap.innerHTML = `
          <div class="gacha-pending-wrap">
            <img src="${escHtml(url)}" class="gacha-viewer-img gacha-pending-img" draggable="false"/>
            <div class="gacha-pending-label">猜猜我是谁~</div>
          </div>`;
        void wrap.getBoundingClientRect();
        wrap.style.transition = 'transform 0.4s cubic-bezier(0.4,0,0.2,1)';
        wrap.style.transform  = 'scaleX(1)';
      } else {
        // 无角色第二次点击：收入手牌
        _closed = true;
        if (_viewerAC) { _viewerAC.abort(); _viewerAC = null; }
        viewer.classList.remove('show');
        onClose();
      }
    }, { once: true });
  }

  function dismissToHand() {
    if (_closed) return;
    _closed = true;
    if (_viewerAC) { _viewerAC.abort(); _viewerAC = null; }
    viewer.classList.remove('show');
    onClose();
  }

  wrap.addEventListener('click',
    e => { e.stopPropagation(); collapseAndReveal(); },
    { signal: sig });
  viewer.addEventListener('click',
    e => { if (e.target === viewer) dismissToHand(); },
    { signal: sig });
}

// 模态框从细条展开的进场动画
function _animateModalEnter() {
  const overlay = State.pageContainer?.querySelector('#char-readonly-modal');
  if (!overlay) return;
  const box = overlay.querySelector('.tl-modal');
  if (!box) return;
  box.style.transition = 'none';
  box.style.transform  = 'scaleX(0)';
  requestAnimationFrame(() => {
    box.style.transition = 'transform 0.3s cubic-bezier(0.4,0,0.2,1)';
    box.style.transform  = '';
  });
}


// ── 手牌盘 ────────────────────────────────────────────────────
const HAND_SPACING = 52; // 固定间距，卡片始终轻微重叠

function _renderHand() {
  const hand = _container?.querySelector('#gacha-hand');
  if (!hand) return;
  const n = _hand.length;
  if (!n) { hand.innerHTML = ''; _unbindHandDrag(hand); return; }

  const W      = hand.offsetWidth || 360;
  const totalW = CARD_W + HAND_SPACING * (n - 1);
  // 卡少时居中，卡多时从左边开始（可拖动）
  const startX = totalW <= W ? (W - totalW) / 2 : 8;

  hand.innerHTML = `<div class="gacha-hand-inner" style="width:${Math.max(totalW + 8, W)}px">` +
    _hand.map((c, i) => {
      const x   = startX + i * HAND_SPACING;
      const rot = n > 1 ? ((i / (n - 1)) - 0.5) * 14 : 0;
      return `<div class="gacha-hcard" data-i="${i}"
        style="left:${x.toFixed(1)}px;transform:rotate(${rot.toFixed(2)}deg);z-index:${i + 1}">
        <img src="${escHtml(c.url)}" loading="lazy" draggable="false"/>
      </div>`;
    }).join('') + '</div>';

  hand.querySelectorAll('.gacha-hcard').forEach(el => {
    el.addEventListener('click', () => _onHandClick(+el.dataset.i, el));
  });

  _bindHandDrag(hand);
}

// 拖动滚动
let _dragStartX = 0, _dragScrollX = 0, _dragging = false, _dragMoved = false;

function _bindHandDrag(hand) {
  _unbindHandDrag(hand);
  hand._onPD = e => {
    _dragging    = true;
    _dragMoved   = false;
    _dragStartX  = e.clientX;
    _dragScrollX = hand.scrollLeft;
  };
  hand._onPM = e => {
    if (!_dragging) return;
    const dx = e.clientX - _dragStartX;
    if (!_dragMoved && Math.abs(dx) < 5) return;
    if (!_dragMoved) { _dragMoved = true; hand.setPointerCapture(e.pointerId); }
    hand.scrollLeft = _dragScrollX - dx;
  };
  hand._onPU = () => { _dragging = false; };
  hand.addEventListener('pointerdown',   hand._onPD);
  hand.addEventListener('pointermove',   hand._onPM);
  hand.addEventListener('pointerup',     hand._onPU);
  hand.addEventListener('pointercancel', hand._onPU);
}

function _unbindHandDrag(hand) {
  if (hand._onPD) hand.removeEventListener('pointerdown', hand._onPD);
  if (hand._onPM) hand.removeEventListener('pointermove', hand._onPM);
  if (hand._onPU) { hand.removeEventListener('pointerup', hand._onPU); hand.removeEventListener('pointercancel', hand._onPU); }
}

function _onHandClick(i, el) {
  _container.querySelectorAll('.gacha-hcard').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  _openGachaViewer(_hand[i].url, () => { el.classList.remove('active'); _clearCanvas(); });
}

// ── 提示文字 ──────────────────────────────────────────────────
function _updateHint() {
  const hint = _container?.querySelector('#gacha-hint');
  if (!hint) return;
  const total = _allImages.length;
  if (!total) { hint.textContent = '暂无图片'; hint.className = 'gacha-hint'; return; }
  const limit     = Math.max(0, total - POOL_RESERVE);
  const remaining = limit - _drawnUrls.size;
  if (remaining <= 0) {
    hint.textContent = '剩下的不给抽了~';
    hint.className   = 'gacha-hint clickable';
    hint.onclick     = _reset;
    return;
  }
  hint.textContent = '请写出一个数字，画点什么也行';
  hint.className   = 'gacha-hint';
  hint.onclick     = null;
}

function _clearCanvas() {
  _strokes = []; _particles = []; _flashT0 = 0; _clearStrokesAt = 0;
  if (_ctx && _canvas) _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
}

function _reset() {
  _drawnUrls     = new Set();
  _preloadedUrls = new Set();
  _hand          = [];
  _locked    = false;
  _clearCanvas();
  const hand = _container?.querySelector('#gacha-hand');
  if (hand) hand.innerHTML = '';
  _updateHint();
}
