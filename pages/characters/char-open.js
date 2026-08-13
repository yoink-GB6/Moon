// pages/characters/char-open.js
// 人物打开方式：左键/点击看只读介绍，右键/长按（仅编辑模式）进编辑框

import { isEditor } from '../../core/auth.js';
import { openCharModal } from './modals/character-modal.js';
import { openCharReadonly, closeCharReadonly } from './modals/char-readonly-modal.js';

const LONG_PRESS_MS = 500;

// resolve(e) 返回 { char, expandPath, avatar }，返回空则忽略这次交互
export function bindCharOpen(el, resolve) {
  let lpTimer = null;
  let suppressClick = false;
  let lastEdit = 0;

  const edit = function(e) {
    // 安卓长按会同时触发我们的定时器和 contextmenu，去重。
    // 必须在关弹窗之前判，否则第一下关掉、第二下就越过去开编辑框了
    if (Date.now() - lastEdit < 700) return;
    lastEdit = Date.now();
    // 遮罩给右侧面板让位，介绍弹窗开着时右键仍能打到底下的条目。
    // 这种情况下这一下算“退出弹窗”，不越过它直接开编辑框
    if (closeCharReadonly()) return;
    const info = resolve(e);
    if (!info || !info.char) return;
    openCharModal(info.char);
  };

  el.addEventListener('click', function(e) {
    if (suppressClick) { suppressClick = false; return; }
    const info = resolve(e);
    if (!info || !info.char) return;
    openCharReadonly(info.char, info.expandPath, info.avatar);
  });

  // 右键没有后续 click，标记会留到下一次左键；每次新按下先清掉
  el.addEventListener('mousedown', function(e) {
    if (e.button === 0) suppressClick = false;
  });

  el.addEventListener('contextmenu', function(e) {
    if (!isEditor()) return;
    e.preventDefault();
    suppressClick = true;
    edit(e);
  });

  el.addEventListener('touchstart', function(e) {
    suppressClick = false;
    if (!isEditor()) return;
    clearTimeout(lpTimer);
    lpTimer = setTimeout(function() {
      lpTimer = null;
      suppressClick = true;
      edit(e);
    }, LONG_PRESS_MS);
  }, { passive: true });

  ['touchmove', 'touchend', 'touchcancel'].forEach(function(type) {
    el.addEventListener(type, function() { clearTimeout(lpTimer); lpTimer = null; }, { passive: true });
  });
}
