// core/pan-zoom.js
// 指针手势 → {x, y, k}。只做力学，不做策略。
//
// 「缩放到多小算退出」「能不能拖出边界」「点一下意味着什么」全部由调用方决定，
// 所以关系图（无边界、点节点选中）和图片查看器（夹边界、捏合缩小退出）
// 能共用同一份手势代码，各自只是传不同的回调。
//
// 站点 viewport 是 user-scalable=no，浏览器原生缩放全站被禁，
// 所以这里必须自己按 pointer 事件实现，容器还要有 touch-action:none。

const TAP_SLOP     = 4;    // 超过这个位移就算拖拽，不算点击
const DTAP_MS      = 300;  // 双击的时间窗
const DTAP_SLOP    = 30;   // 双击两下之间允许的位移
const WHEEL_SETTLE = 180;  // 滚轮停这么久才算一次手势结束

/**
 * @param {HTMLElement} el 手势容器
 * @param {object} opts
 *   apply(view)                     必需，把 {x,y,k} 落到 DOM
 *   clamp(view)                     可选，每次变更后夹紧平移范围
 *   onDragStart(e)   → handle|null  返回 truthy 表示这次拖拽由调用方接管
 *   onDrag(handle, dx, dy, k)       接管时每帧回调，dx/dy 是屏幕像素
 *   onDragCancel(handle)            第二根手指落下、拖拽被捏合接管时调用
 *   onTap(e)                        单指、没移动过的点击
 *   onDoubleTap(e, x, y)            容器局部坐标；不传则 onTap 无延迟立即触发
 *   onGestureEnd(src)               'pointer' = 最后一根手指抬起；'wheel' = 滚轮停下
 *   min, max                        k 的上下限
 */
export function createPanZoom(el, opts = {}) {
  const view = { x: 0, y: 0, k: 1 };
  const pts  = new Map();          // 同时按下的所有指针
  const drag = { on: false, sx: 0, sy: 0, ox: 0, oy: 0, moved: false, handle: null };
  let pinch = null;
  // pinch 在第一根手指抬起时就被置空了，可最后一根抬起时才该做判定，
  // 所以要另记一个「这次手势捏合过」的标志，跨越整个手势
  let hadPinch = false;
  let lastTap = null;
  // 松手速度：判「快速一甩」用。只看位移的话手感很粘，甩不掉
  const vel = { t: 0, x: 0, y: 0 };
  let wheelTimer = null;

  const api = { view, min: opts.min ?? 0.15, max: opts.max ?? 3, vx: 0, vy: 0, apply, destroy };

  const rect  = () => el.getBoundingClientRect();
  const clampK = k => Math.max(api.min, Math.min(api.max, k));

  function apply() {
    opts.clamp?.(view);
    opts.apply(view);
  }

  // 缩放的通用做法：先记住锚点下方对应的内容坐标，缩放后把它挪回锚点。
  // 滚轮的锚点是光标，捏合的锚点是两指中点，数学是同一条。
  function zoomAt(k, ax, ay) {
    const next = clampK(k);
    view.x = ax - (ax - view.x) * (next / view.k);
    view.y = ay - (ay - view.y) * (next / view.k);
    view.k = next;
    apply();
  }
  api.zoomAt = zoomAt;

  function startPinch() {
    const [a, b] = [...pts.values()];
    const box = rect();
    const mx = (a.x + b.x) / 2 - box.left;
    const my = (a.y + b.y) / 2 - box.top;
    pinch = {
      d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      k0: view.k,
      // 钉住捏合起点下方的那个内容坐标
      cx: (mx - view.x) / view.k,
      cy: (my - view.y) / view.k,
    };
    // 拖拽被捏合接管了，得通知调用方它拿到的那个 handle 已经作废，
    // 否则它会以为自己那套逻辑还在生效（查看器就因此漏掉了捏合关闭）
    if (drag.handle) opts.onDragCancel?.(drag.handle);
    drag.on = false; drag.handle = null;
    hadPinch = true;
  }

  function onDown(e) {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    el.setPointerCapture(e.pointerId);
    if (pts.size === 1) hadPinch = false;   // 新手势起头

    if (pts.size === 2) { startPinch(); return; }
    if (pts.size > 2) return;

    clearTimeout(wheelTimer); wheelTimer = null;   // 别让滚轮的判定插进手势里
    api.vx = api.vy = 0;
    vel.t = performance.now(); vel.x = e.clientX; vel.y = e.clientY;

    drag.on = true; drag.moved = false;
    drag.sx = e.clientX; drag.sy = e.clientY;
    // 必须在这里就把命中目标记下来：setPointerCapture 之后，
    // 后续 pointermove/up 的 target 全变成容器，再 closest() 就找不到了
    drag.handle = opts.onDragStart?.(e) || null;
    if (!drag.handle) { drag.ox = view.x; drag.oy = view.y; }
  }

  function onMove(e) {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinch && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const box = rect();
      const d  = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2 - box.left;
      const my = (a.y + b.y) / 2 - box.top;
      view.k = clampK(pinch.k0 * (d / pinch.d0));
      // 手指中点始终对着同一个内容坐标，于是缩放和平移一次完成
      view.x = mx - pinch.cx * view.k;
      view.y = my - pinch.cy * view.k;
      apply();
      return;
    }

    if (!drag.on) return;

    const now = performance.now();
    const dtms = now - vel.t;
    if (dtms > 0) {
      // 平滑一下，否则松手前最后一帧的抖动会主导整个判定
      api.vx = api.vx * 0.4 + ((e.clientX - vel.x) / dtms * 1000) * 0.6;
      api.vy = api.vy * 0.4 + ((e.clientY - vel.y) / dtms * 1000) * 0.6;
      vel.t = now; vel.x = e.clientX; vel.y = e.clientY;
    }

    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP) drag.moved = true;
    if (drag.handle) {
      opts.onDrag?.(drag.handle, dx, dy, view.k);
    } else {
      view.x = drag.ox + dx; view.y = drag.oy + dy;
      apply();
    }
  }

  function onUp(e) {
    pts.delete(e.pointerId);
    try { el.releasePointerCapture(e.pointerId); } catch (_) {}
    // 手指停住一会儿再松开，不该还算「甩」
    if (performance.now() - vel.t > 80) api.vx = api.vy = 0;
    if (pts.size < 2) pinch = null;

    // 捏合抬手后剩下的那根手指既不算点击也不算拖拽
    if (pts.size > 0) { drag.on = false; drag.handle = null; return; }

    // 以下是最后一根手指抬起
    if (hadPinch) {
      hadPinch = false;
      drag.on = false; drag.handle = null;
      opts.onGestureEnd?.('pointer');
      return;
    }
    if (!drag.on) return;

    drag.on = false;
    const moved = drag.moved;
    drag.handle = null;
    opts.onGestureEnd?.('pointer');
    if (moved) return;

    if (opts.onDoubleTap) {
      const box = rect();
      const now = performance.now();
      if (lastTap && now - lastTap.t < DTAP_MS &&
          Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < DTAP_SLOP) {
        lastTap = null;
        opts.onDoubleTap(e, e.clientX - box.left, e.clientY - box.top);
        return;
      }
      lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
    opts.onTap?.(e);
  }

  function onWheel(e) {
    e.preventDefault();
    const box = rect();
    zoomAt(view.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX - box.left, e.clientY - box.top);
    // 滚轮没有「抬起」这个动作，所以用停顿来断句。
    // 防抖也顺便给了后悔的机会：滚过头了往回滚一下就不算数。
    if (opts.onGestureEnd) {
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => { wheelTimer = null; opts.onGestureEnd('wheel'); }, WHEEL_SETTLE);
    }
  }

  el.addEventListener('pointerdown',   onDown);
  el.addEventListener('pointermove',   onMove);
  el.addEventListener('pointerup',     onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('wheel',         onWheel, { passive: false });

  function destroy() {
    el.removeEventListener('pointerdown',   onDown);
    el.removeEventListener('pointermove',   onMove);
    el.removeEventListener('pointerup',     onUp);
    el.removeEventListener('pointercancel', onUp);
    el.removeEventListener('wheel',         onWheel, { passive: false });
    clearTimeout(wheelTimer); wheelTimer = null;
    pts.clear();
  }

  return api;
}
