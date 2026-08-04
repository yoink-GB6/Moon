// core/auth.js
// 编辑权限 = Supabase Auth 会话。
// 真正的拦截在数据库的 RLS 策略里，这里只负责登录/登出和同步 UI 状态；
// 即使有人绕过前端直接调 REST API，没有有效 JWT 也写不进去。

import { supaClient } from './supabase-client.js';

let _isEditor = false;
const _listeners = [];

export function isEditor() { return _isEditor; }

// 注册监听器，权限变化时通知各页面更新 UI；返回取消订阅函数
export function onAuthChange(fn) {
  _listeners.push(fn);
  return () => {
    const i = _listeners.indexOf(fn);
    if (i >= 0) _listeners.splice(i, 1);
  };
}

function _notify() {
  _listeners.forEach(fn => {
    try { fn(_isEditor); }
    catch (e) { console.error('[auth] onAuthChange 回调出错（已忽略）:', e); }
  });
}

function _applySession(session) {
  // 可选：把编辑权限钉死在某个账号上，多账号时更保险
  const pinned = window.EDIT_USER_ID;
  const next = !!session && (!pinned || session.user?.id === pinned);
  if (next === _isEditor) return;
  _isEditor = next;
  _notify();
}

// 页面启动时调用：恢复已有会话（supabase-js 默认把会话存在 localStorage，刷新不掉线）
export async function initAuth() {
  supaClient.auth.onAuthStateChange((_event, session) => _applySession(session));
  const { data } = await supaClient.auth.getSession();
  _applySession(data?.session ?? null);
}

// 返回 { ok } 或 { ok:false, message }
export async function tryUnlock(password) {
  const email = window.EDIT_EMAIL;
  if (!email) return { ok: false, message: '未配置 EDIT_EMAIL' };
  const { error } = await supaClient.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function lock() {
  await supaClient.auth.signOut();
}

// 便捷：检查权限，不足时弹 toast
export function requireEditor() {
  if (!_isEditor) {
    import('./ui.js').then(ui => ui.showToast('🔒 请先解锁编辑'));
    return false;
  }
  return true;
}
