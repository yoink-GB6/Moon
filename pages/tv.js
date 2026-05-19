// pages/tv.js
// 上电视：3D 环形画廊（仅 character id=45 的 avatar_url）

import { supaClient, setSyncStatus, dbError } from '../core/supabase-client.js';
import { parseAvatarUrls, openImageViewer } from './characters/utils.js';

const CHAR_ID = 45;
const PERSPECTIVE = 3200;       // 与 tv.css 中保持一致
let currentRingPush = 1500;     // 改为动态 let，根据球大小自动调整球心位置
const DENSITY_FACTOR = 2.0;     // 控制卡片疏密程度（值越大卡片间距越宽松，推荐 1.5 - 2.5）
const AUTO_SPIN_DPS = 4;        // 自动旋转每秒度数
const RETURN_DURATION_MS = 1000;// 回正动画时长

const TILT_MAX = 60;       // X 轴（上下）旋转最大角度，避免上下完全翻转
const RETURN_DELAY_MS = 1500;   // 操作停止多久后开始自动回正

let _container = null;
let _urls = [];
let _angleY = 0;                   // 绕 Y 轴旋转（左右）
let _angleX = 0;                   // 绕 X 轴旋转（上下）— 应用到每张卡片自身
let _cardParams = [];              // 每张卡片的球面参数
let _lastGamma = null;             // 陀螺仪 gamma 上次值（增量模式）
let _lastBeta = null;              // 陀螺仪 beta 上次值
let _lastInteract = 0;             // 最后一次用户交互时间戳
let _returning = false;            // 是否在回正动画中
let _returnTimer = null;
let _cleanupFns = [];
let _autoRAF = null;
let _autoLastT = 0;
let viewDistance = 1200; // 把之前的写死的 1200 抽出来做成变量
let _currentRadius = 0;  // 用来记录当前球体的真实半径
/*
export async function mount(container) {
  _container = container;
  _angleY = 0;
  _angleX = 0;
  _lastGamma = null;
  _lastBeta = null;
  container.innerHTML = _skeleton();
  _bindInteractions(container);
  await _fetch();
  _renderRing();
  _startAutoSpin();
}*/
// 【修改后的 mount 函数】
export async function mount(container) {
  _container = container;
  _angleY = 0;
  _angleX = 0;
  _lastGamma = null;
  _lastBeta = null;
  container.innerHTML = _skeleton();
  _bindInteractions(container);
  
  await _fetch();
  
  // 【核心修改】在渲染前，先静默预加载所有图片，拿到了真实尺寸再画 3D 球
  if (_urls.length > 0) {
    const hint = container.querySelector('#tv-hint');
    if (hint) hint.textContent = '正在优化 3D 资源…';
    
    // 等待所有图片下载并解码完成
    await Promise.all(
      _urls.map(url => {
        return new Promise((resolve) => {
          const img = new Image();
          img.src = url;
          // load 表示下载完，decode 表示浏览器解压像素完成（彻底解决模糊和拉伸）
          img.onload = () => {
            if (img.decode) {
              img.decode().then(resolve).catch(resolve);
            } else {
              resolve();
            }
          };
          img.onerror = resolve; // 就算个别失败也继续，防止卡死
        });
      })
    );
  }

  _renderRing();
  _startAutoSpin();
}

export function unmount() {
  _stopAutoSpin();
  if (_returnTimer) { clearTimeout(_returnTimer); _returnTimer = null; }
  _cleanupFns.forEach(fn => { try { fn(); } catch(_){} });
  _cleanupFns = [];
  _container = null;
  _urls = [];
  _cardParams = [];
  _lastGamma = null;
  _lastBeta = null;
  _returning = false;
}

function _skeleton() {
  return `
    <div class="tv-page">
      <div class="tv-stage" id="tv-stage">
        <div class="tv-tilt" id="tv-tilt">
          <div class="tv-ring" id="tv-ring"></div>
        </div>
      </div>
      <div class="tv-hint" id="tv-hint">加载中…</div>
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
  const hint = _container.querySelector('#tv-hint');
  if (!ring || !hint) return;

  if (!_urls.length) {
    hint.textContent = '暂无图片';
    return;
  }

  // 全部 url 随机打乱顺序
  const display = _urls.slice().sort(() => Math.random() - 0.5);

  const n = display.length;
  const isMobile = window.innerWidth < 600;
  const cardWidth = isMobile ? 220 : 320;
  // 1. 根据数量和密度系数计算需要的总表面积，反推出理想半径
  const cardArea = cardWidth * cardWidth * DENSITY_FACTOR;
  let radius = Math.sqrt((n * cardArea) / (4 * Math.PI));

  // 2. 设定最小半径，防止图太少（比如只有1-3张）时球体比单张卡片还小
  radius = Math.max(cardWidth * 0.8, Math.round(radius));

  // 3. 动态调整球心 Z 轴位置
  // 公式：摄像机位置(PERSPECTIVE) - 球半径(radius) - 安全观看距离(400)
  // 这样无论球多大，离屏幕前壁的距离始终保持适中，不会穿模，也不会太远
/*currentRingPush = PERSPECTIVE - radius - 1200;*/
// 把半径存下来，给缩放功能用
_currentRadius = radius; 

// 使用动态的 viewDistance，而不是写死的 1200
currentRingPush = PERSPECTIVE - _currentRadius - viewDistance;
  // Fibonacci 球面均匀分布
  const points = _fibSpherePoints(n);

  _cardParams = display.map((url, i) => {
    const p = points[i];
    return {
      url,
      x: radius * p.x,
      y: radius * p.y,
      z: radius * p.z,
      phi: Math.atan2(p.x, p.z) * 180 / Math.PI,
      theta: Math.asin(Math.max(-1, Math.min(1, p.y))) * 180 / Math.PI,
    };
  });

  ring.innerHTML = _cardParams.map((d, i) => {
    const safeUrl = String(d.url).replace(/"/g, '&quot;');
    return `<div class="tv-card" data-i="${i}">
      <img src="${safeUrl}" alt="" draggable="false"/>
    </div>`;
  }).join('');

  // 强制初始化 transform
  _angleY = 0;
  _angleX = 0;
  const tilt = _container.querySelector('#tv-tilt');
  if (tilt) tilt.style.transform = `translate(-50%, -50%) translateZ(${currentRingPush}px) rotateX(0deg)`;
  ring.style.transform = `rotateY(0deg)`;
  _updateAllCards();
  hint.textContent = '上下左右拖动 · 倾斜手机 · 点击放大';
}

// Fibonacci 球面分布：N 个点均匀分布在单位球面上
function _fibSpherePoints(N) {
  const pts = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * i + 1) / N;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    pts.push({ x: Math.cos(theta) * r, y, z: Math.sin(theta) * r });
  }
  return pts;
}

function _setAngles(degY, degX) {
  const newY = degY;
  const newX = Math.max(-TILT_MAX, Math.min(TILT_MAX, degX));
  if (!_container) return;
  if (newY !== _angleY) {
    _angleY = newY;
    const ring = _container.querySelector('#tv-ring');
    if (ring) ring.style.transform = `rotateY(${_angleY}deg)`;/*`rotateY(${-_angleY}deg)`*/ 
  }
  if (newX !== _angleX) {
    _angleX = newX;
    const tilt = _container.querySelector('#tv-tilt');
    if (tilt) tilt.style.transform = `translate(-50%, -50%) translateZ(${currentRingPush}px) rotateX(${_angleX}deg)`;
  }
}

function _updateAllCards() {
  if (!_container) return;
  const cards = _container.querySelectorAll('.tv-card');
  cards.forEach((c, i) => {
    const d = _cardParams[i];
    if (!d) return;
    c.style.transform = `translate3d(${d.x.toFixed(1)}px, ${d.y.toFixed(1)}px, ${d.z.toFixed(1)}px) rotateY(${(d.phi + 180).toFixed(2)}deg) rotateX(${d.theta.toFixed(2)}deg)`;
  });
}

function _startReturn() {
  if (_returning || !_container) return;
  if (Math.abs(_angleX) < 0.5) return;
  _returning = true;
  const tilt = _container.querySelector('#tv-tilt');
  if (!tilt) { _returning = false; return; }
  // 用 CSS transition 在 tilt 上做软回正；ring 的 Y 自转不受影响
  tilt.style.transition = `transform ${RETURN_DURATION_MS}ms cubic-bezier(0.25, 0.8, 0.3, 1)`;
  _angleX = 0;
  tilt.style.transform = `translate(-50%, -50%) translateZ(${currentRingPush}px) rotateX(0deg)`;
  if (_returnTimer) clearTimeout(_returnTimer);
  _returnTimer = setTimeout(() => {
    _returnTimer = null;
    _returning = false;
    if (!_container) return;
    const t = _container.querySelector('#tv-tilt');
    if (t) t.style.transition = '';
  }, RETURN_DURATION_MS + 60);
}

function _addListener(target, type, fn, options) {
  target.addEventListener(type, fn, options);
  _cleanupFns.push(() => target.removeEventListener(type, fn, options));
}

function _bindInteractions(container) {
  const stage = container.querySelector('#tv-stage');
  if (!stage) return;

  const pointer = { dragging: false, startX: 0, startY: 0, startAngleY: 0, startAngleX: 0, moved: false };

  const getX = (e) => e.touches ? e.touches[0].clientX : e.clientX;
  const getY = (e) => e.touches ? e.touches[0].clientY : e.clientY;

  const onDown = (e) => {
    if (!e.touches && e.button !== 0) return;
    // 打断回正动画
    if (_returning) {
      _returning = false;
      if (_returnTimer) { clearTimeout(_returnTimer); _returnTimer = null; }
      const t = _container.querySelector('#tv-tilt');
      if (t) t.style.transition = '';
    }
    pointer.dragging = true;
    pointer.moved = false;
    pointer.startX = getX(e);
    pointer.startY = getY(e);
    pointer.startAngleY = _angleY;
    pointer.startAngleX = _angleX;
    _lastGamma = null;
    _lastBeta = null;
    _lastInteract = performance.now();
  };

  const onMove = (e) => {
    if (!_container || !pointer.dragging) return;
    const dx = getX(e) - pointer.startX;
    const dy = getY(e) - pointer.startY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) pointer.moved = true;
    _setAngles(pointer.startAngleY - dx * 0.5, pointer.startAngleX + dy * 0.5);
    _lastInteract = performance.now();
  };

  const onUp = () => {
    pointer.dragging = false;
  };

  _addListener(stage, 'mousedown', onDown);
  _addListener(window, 'mousemove', onMove);
  _addListener(window, 'mouseup', onUp);
  _addListener(stage, 'touchstart', onDown, { passive: true });
  _addListener(window, 'touchmove', onMove, { passive: true });
  _addListener(window, 'touchend', onUp);
  _addListener(window, 'touchcancel', onUp);

  // 点击图片：打开大图查看器（拖动过的不触发）
  _addListener(stage, 'click', (e) => {
    if (pointer.moved) return;
    const card = e.target.closest('.tv-card');
    if (!card) return;
    const img = card.querySelector('img');
    if (img && img.src) openImageViewer(img.src);
  });

  // 陀螺仪：gamma 控制左右、beta 控制上下（增量模式，与自动转动叠加）
  if (typeof window.DeviceOrientationEvent !== 'undefined') {
    const onOrient = (e) => {
      if (!_container) return;
      if (pointer.dragging) { _lastGamma = null; _lastBeta = null; return; }
      const gamma = e.gamma;
      const beta = e.beta;
      if (gamma === null || gamma === undefined) return;
      if (_lastGamma === null) { _lastGamma = gamma; _lastBeta = beta; return; }
      const dGamma = gamma - _lastGamma;
      const dBeta = (beta || 0) - (_lastBeta || 0);
      _lastGamma = gamma;
      _lastBeta = beta;
      if (Math.abs(dGamma) > 0.5 || Math.abs(dBeta) > 0.5) {
        _setAngles(_angleY + dGamma * 1.5, _angleX + dBeta * 0.8);
        _lastInteract = performance.now();
      }
      /*if (Math.abs(dGamma) > 0.1 || Math.abs(dBeta) > 0.1) {
        _setAngles(_angleY + dGamma * 4, _angleX + dBeta * 2);
        _lastInteract = performance.now();
      }*/
    };
    _addListener(window, 'deviceorientation', onOrient);
  }
  // ── 附加功能：视图缩放 (实时更新 Z 轴位置) ──
  const _updateZoom = () => {
    currentRingPush = PERSPECTIVE - _currentRadius - viewDistance;
    const tilt = container.querySelector('.tv-tilt');
    if (tilt) {
      // 保持当前的 X 轴旋转角度，仅更新 Z 轴距离
      tilt.style.transform = `translate(-50%, -50%) translateZ(${currentRingPush}px) rotateX(${_angleX}deg)`;
    }
  };

  // 1. PC端：鼠标滚轮缩放
  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    viewDistance += e.deltaY * 0.5; // 滚轮调整幅度
    // 限制缩放范围：最近 400（防穿模贴脸），最远 4000
    viewDistance = Math.max(400, Math.min(4000, viewDistance)); 
    _updateZoom();
  }, { passive: false });

  // 2. 移动端：双指捏合缩放
  let initialPinchDist = 0;
  let initialViewDist = 0;

  container.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      pointer.dragging = false; // 如果是双指，强制取消单指拖拽的旋转逻辑
      // 计算两指之间的初始距离 (勾股定理)
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      initialPinchDist = Math.hypot(dx, dy);
      initialViewDist = viewDistance;
    }
  }, { passive: false });

  container.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault(); // 防止触发浏览器其他手势
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const currentPinchDist = Math.hypot(dx, dy);
      
      // 计算缩放比例：两指张开距离变大（scale < 1）拉近距离；两指捏合距离变小（scale > 1）拉远距离
      const scale = initialPinchDist / currentPinchDist;
      
      viewDistance = initialViewDist * scale;
      viewDistance = Math.max(400, Math.min(4000, viewDistance)); // 同样限制距离
      
      _updateZoom();
    }
  }, { passive: false });
}

// ── 自动旋转 ──────────────────────────────
function _startAutoSpin() {
  if (_autoRAF) return;
  _autoLastT = performance.now();
  const tick = (now) => {
    if (!_container) { _autoRAF = null; return; }
    const dt = (now - _autoLastT) / 1000;
    _autoLastT = now;
    // 触发回正（一次性）
    /*if (!_returning && now - _lastInteract > RETURN_DELAY_MS && Math.abs(_angleX) > 0.5) {
      _startReturn();
    }*/
    // auto spin 始终转 Y 轴；transition 只挂卡片身上，不影响 ring 的 Y 旋转
    _setAngles(_angleY + AUTO_SPIN_DPS * dt, _angleX);
    _autoRAF = requestAnimationFrame(tick);
  };
  _autoRAF = requestAnimationFrame(tick);
}

function _stopAutoSpin() {
  if (_autoRAF) { cancelAnimationFrame(_autoRAF); _autoRAF = null; }
}
