// core/auth.js
// 全局编辑权限管理，密码一次解锁所有页面

let _isEditor = false;
const _listeners = [];

export function isEditor() { return _isEditor; }

// 注册监听器，权限变化时通知各页面更新 UI
export function onAuthChange(fn) { _listeners.push(fn); }

function _notify() { _listeners.forEach(fn => fn(_isEditor)); }

export function tryUnlock(password) {
  if (password === window.EDIT_PASSWORD) {
    _isEditor = true;
    _notify();
    return true;
  }
  return false;
}

export function lock() {
  _isEditor = false;
  _notify();
}

// 便捷：检查权限，不足时弹 toast
export function requireEditor() {
  if (!_isEditor) {
    window.showToast('🔒 请先点击右上角 🔒 输入密码以编辑');
    return false;
  }
  return true;
}
