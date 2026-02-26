// core/auth.js
// 全局编辑权限管理 - 每小时密码

let _isEditor = false;
const _listeners = [];

export function isEditor() { return _isEditor; }

// 注册监听器，权限变化时通知各页面更新 UI
export function onAuthChange(fn) { _listeners.push(fn); }

function _notify() {
  _listeners.forEach(fn => {
    try { fn(_isEditor); }
    catch (e) { console.error('[auth] onAuthChange 回调出错（已忽略）:', e); }
  });
}

// 生成当前小时的密码（基于时间戳 + 密钥）
function generateHourlyPassword() {
  const SECRET_KEY = 'Moon-Timeline-Secret-2026';  // 修改这个密钥来改变密码规则
  const now = new Date();
  const hourKey = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}-${now.getHours()}`;
  
  // 简单哈希：结合密钥和时间戳生成 6 位数字密码
  const combined = SECRET_KEY + hourKey;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    hash = ((hash << 5) - hash) + combined.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // 生成 6 位数字密码
  const password = Math.abs(hash % 1000000).toString().padStart(6, '0');
  return password;
}

// 获取当前小时的密码（供管理员查看）
export function getCurrentPassword() {
  return generateHourlyPassword();
}

// 显示当前密码（开发用）
export function tryUnlock(password) {
  const currentPassword = generateHourlyPassword();
  
  // 检查是否匹配当前小时的密码
  if (password === currentPassword) {
    _isEditor = true;
    _notify();
    return true;
  }
  
  // 向后兼容：仍然支持固定密码（如果设置了）
  if (window.EDIT_PASSWORD && password === window.EDIT_PASSWORD) {
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
    import('./ui.js').then(ui => ui.showToast('🔒 请先解锁编辑'));
    return false;
  }
  return true;
}
