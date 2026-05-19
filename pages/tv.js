// pages/tv.js
// 上电视：平铺相片墙（仅 character id=45 的 avatar_url）

import { supaClient, setSyncStatus, dbError } from '../core/supabase-client.js';
import { parseAvatarUrls, openImageViewer } from './characters/utils.js';

const CHAR_ID = 45;
const PERSPECTIVE = 6000;       // 需与 tv.css 中的 perspective 保持一致
const GAP_X = 350;              // 图片的左右间距（略宽于 320）
const GAP_Y = 480;              // 图片的上下间距（略宽于 440）

let _container = null;
let _urls = [];
let _panX = 0;                  // 记录整体画廊的左右平移
let _panY = 0;                  // 记录整体画廊的上下平移
let viewDistance = 1500;        // 初始观看距离（相当于 Z 轴缩放）

let _lastGamma = null;
let _lastBeta = null;
let _lastInteract = 0;
let _cleanupFns = [];           // 用于统一清理事件监听

export async function mount(container) {
  _container = container;
  _panX = 0;
  _panY = 0;
  viewDistance = 1500;
  _lastGamma = null;
  _lastBeta = null;

  container.innerHTML = _skeleton();
  _bindInteractions(container);
  
  await _fetch();
  
  // 核心优化：静默预加载所有图片，拿到了真实尺寸再画网格，彻底告别模糊和拉伸
  if (_urls.length > 0) {
    await Promise.all(
      _urls.map(url => {
        return new Promise((resolve) => {
          const img = new Image();
          img.src = url;
          img.onload = () => {
            if (img.decode) {
              img.decode().then(resolve).catch(resolve);
            } else {
              resolve();
            }
          };
          img.onerror = resolve; // 即使个别图片失败也继续，防止页面卡死
        });
      })
    );
  }

  _renderRing(); // 图片全加载完，开始铺墙
}

export function unmount() {
  // 卸载时清理所有事件，防止内存泄漏
  _cleanupFns.forEach(fn => { try { fn(); } catch(_){} });
  _cleanupFns = [];
  _container = null;
  _urls = [];
  _lastGamma = null;
  _lastBeta = null;
}

function _skeleton() {
  // 删掉了下方的文字提示 (tv-hint)，只保留基础骨架
  return `
    <div class="tv-page">
      <div class="tv-stage" id="tv-stage">
        <div class="tv-tilt" id="tv-tilt">
          <div class="tv-ring" id="tv-ring"></div>
        </div>
      </div>
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

function _renderRing() {
  if (!_container) return;
  const ring = _container.querySelector('#tv-ring');
  if (!ring) return;
  ring.innerHTML = '';
  
  const count = _urls.length;
  if (count === 0) return;

  // 自动计算几行几列 (尽量排成正方形网格)
  const cols = Math.ceil(Math.sqrt(count)); 
  const rows = Math.ceil(count / cols);
  
  // 算出网格的整体偏移，让整面墙默认在屏幕中央
  const startX = -(cols - 1) * GAP_X / 2;
  const startY = -(rows - 1) * GAP_Y / 2;

  _urls.forEach((url, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    
    // 计算每张卡的平铺坐标
    const x = startX + col * GAP_X;
    const y = startY + row * GAP_Y;

    const card = document.createElement('div');
    card.className = 'tv-card';
    card.dataset.i = i;
    // 取消了所有 Rotate，纯净的 3D 平移铺设
    card.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    card.style.pointerEvents = 'auto'; // 确保能被点击

    const img = document.createElement('img');
    img.src = url;
    img.alt = "";
    img.draggable = false;
    
    card.appendChild(img);
    ring.appendChild(card);
  });

  _updateTransform(); // 铺完后立即更新摄像机视角
}

function _updateTransform() {
  if (!_container) return;
  const tilt = _container.querySelector('#tv-tilt');
  if (tilt) {
    // 核心：Z轴推远实现缩放，X/Y轴实现手势平移
    tilt.style.transform = `translate(-50%, -50%) translateZ(${-viewDistance}px) translate(${_panX}px, ${_panY}px)`;
  }
}

// 事件绑定助手，方便在 unmount 时统一销毁
function _addListener(target, type, fn, options) {
  target.addEventListener(type, fn, options);
  _cleanupFns.push(() => target.removeEventListener(type, fn, options));
}

function _bindInteractions(container) {
  const stage = container.querySelector('#tv-stage');
  if (!stage) return;

  const pointer = { dragging: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0, moved: false };

  const getX = (e) => e.touches ? e.touches[0].clientX : e.clientX;
  const getY = (e) => e.touches ? e.touches[0].clientY : e.clientY;

  const onDown = (e) => {
    if (e.touches && e.touches.length > 1) return; // 如果是双指缩放，不触发拖拽
    if (!e.touches && e.button !== 0) return;      // 忽略鼠标右键等
    pointer.dragging = true;
    pointer.moved = false;
    pointer.startX = getX(e);
    pointer.startY = getY(e);
    pointer.startPanX = _panX;
    pointer.startPanY = _panY;
    _lastGamma = null;
    _lastBeta = null;
    _lastInteract = performance.now();
  };

  const onMove = (e) => {
    if (!_container || !pointer.dragging) return;
    const dx = getX(e) - pointer.startX;
    const dy = getY(e) - pointer.startY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) pointer.moved = true;
    
    // 【平移逻辑】顺着手的方向移动画面
    _panX = pointer.startPanX + dx;
    _panY = pointer.startPanY + dy;
    
    _updateTransform();
    _lastInteract = performance.now();
  };

  const onUp = () => {
    pointer.dragging = false;
  };

  // 绑定鼠标/单指拖拽
  _addListener(stage, 'mousedown', onDown);
  _addListener(window, 'mousemove', onMove);
  _addListener(window, 'mouseup', onUp);
  _addListener(stage, 'touchstart', onDown, { passive: false });
  _addListener(window, 'touchmove', onMove, { passive: false });
  _addListener(window, 'touchend', onUp);
  _addListener(window, 'touchcancel', onUp);

  // 点击图片：打开大图查看器
  _addListener(stage, 'click', (e) => {
    if (pointer.moved) return;
    const card = e.target.closest('.tv-card');
    if (!card) return;
    const img = card.querySelector('img');
    if (img && img.src) openImageViewer(img.src);
  });

  // ── 缩放功能 (PC滚轮) ──
  _addListener(stage, 'wheel', (e) => {
    e.preventDefault();
    viewDistance += e.deltaY * 0.8;
    viewDistance = Math.max(400, Math.min(6000, viewDistance)); 
    _updateTransform();
  }, { passive: false });

  // ── 缩放功能 (移动端双指) ──
  let initialPinchDist = 0;
  let initialViewDist = 0;

  _addListener(stage, 'touchstart', (e) => {
    if (e.touches.length === 2) {
      pointer.dragging = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      initialPinchDist = Math.hypot(dx, dy);
      initialViewDist = viewDistance;
    }
  }, { passive: false });

  _addListener(stage, 'touchmove', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const currentPinchDist = Math.hypot(dx, dy);
      const scale = initialPinchDist / currentPinchDist;
      
      viewDistance = initialViewDist * scale;
      viewDistance = Math.max(400, Math.min(6000, viewDistance));
      _updateTransform();
    }
  }, { passive: false });

  // ── 陀螺仪平移 (手机晃动时微微移动相片墙) ──
  if (typeof window.DeviceOrientationEvent !== 'undefined') {
    const onOrient = (e) => {
      if (!_container || pointer.dragging) { _lastGamma = null; _lastBeta = null; return; }
      const gamma = e.gamma;
      const beta = e.beta;
      if (gamma === null || gamma === undefined) return;
      if (_lastGamma === null) { _lastGamma = gamma; _lastBeta = beta; return; }
      
      const dGamma = gamma - _lastGamma;
      const dBeta = (beta || 0) - (_lastBeta || 0);
      _lastGamma = gamma;
      _lastBeta = beta;
      
      if (Math.abs(dGamma) > 0.5 || Math.abs(dBeta) > 0.5) {
        _panX -= dGamma * 2;
        _panY -= dBeta * 2;
        _updateTransform();
        _lastInteract = performance.now();
      }
    };
    _addListener(window, 'deviceorientation', onOrient);
  }
}
