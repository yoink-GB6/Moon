// core/router.js
// hash 路由。静态托管做不了路径路由（/a/b 需要服务端 rewrite），
// 但 #/a/b 在任何静态主机上都能直接深链，GitHub Pages 也行。
//
// 约定：#/<pageId>/<...parts>
//   #/library            指令集
//   #/library/123        指令集 + 打开 123 号的预览弹窗
//   #/characters/45      人物页 + 打开 45 号的详情弹窗
//   #/geo/country/3      地理页 + 选中 3 号国家
//
// 两种改 URL 的方式，用途不同：
//   go()      真正切页，写进历史，浏览器前进/后退可用
//   reflect() 弹窗开关等页面内状态，只改地址栏不写历史、且不触发 hashchange，
//             因此不会回头再驱动一次页面逻辑（避免自激循环）

export function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean).map(decodeURIComponent);
  return { page: parts[0] || '', parts: parts.slice(1) };
}

function build(page, parts) {
  return '#/' + [page, ...parts]
    .filter(v => v != null && v !== '')
    .map(encodeURIComponent).join('/');
}

// 切页：写历史，会触发 hashchange
export function go(page, ...parts) {
  const next = build(page, parts);
  if (location.hash !== next) location.hash = next;
}

// 反映页面内状态：不写历史，不触发 hashchange
export function reflect(page, ...parts) {
  const next = build(page, parts);
  if (location.hash === next) return;
  history.replaceState(null, '', location.pathname + location.search + next);
}

// 同 reflect，但写一条历史：手机端靠系统返回键关弹窗。
// 用 pushState 而不是改 location.hash —— 打开时不触发 hashchange（否则会回头再驱动一次
// 弹窗逻辑，重新渲染、重抽随机图），但之后按返回键退回上一条时 hash 变了，
// hashchange 照常触发，走既有的 applyRoute 把弹窗关掉。
// 返回值表示这次是否真的压了一条历史（深链进来时地址已经对了，不压）。
export function reflectPush(page, ...parts) {
  const next = build(page, parts);
  if (location.hash === next) return false;
  history.pushState(null, '', location.pathname + location.search + next);
  return true;
}

export function onRouteChange(fn) {
  window.addEventListener('hashchange', () => fn(parseHash()));
}

// 当前完整链接，供“复制分享链接”用
export function currentUrl() {
  return location.href;
}
