// core/modal-history.js
// 弹窗 × 系统返回键：开弹窗时压一条「同 URL」的历史，按返回键就是关弹窗。
//
// 关键在 URL 不变（pushState 传 location.href）：回退时只有 popstate、没有 hashchange，
// 路由完全不受影响。弹窗因此不必跟某个页面的地址形态绑定 —— 谁开都是这套行为，
// 各页也不用在自己的 applyRoute 里补一句关弹窗。
//
// 之前把弹窗状态编进 hash 的做法在人物页之外都不成立：
// gacha 没有 applyRoute，退回来没人关弹窗；关系页的 #/relations/45 另有含义，
// 撞上了连历史都压不进去。

let _open = null;   // 当前挂在返回键上的关闭函数；同一时刻只可能有一个弹窗

// 开弹窗时调用。hide 只管把弹窗藏起来，历史由本模块收拾。
// 弹窗开着时又换了个内容（比如换个人）会复用已压的那条，不叠第二层。
export function bindModalBack(hide) {
  if (!_open) history.pushState({ modalBack: true }, '', location.href);
  _open = hide;
}

// 弹窗自己关掉时调用（点遮罩、按 Esc）：把压过的那条退掉，别留在历史里
export function releaseModalBack() {
  if (!_open) return;
  _open = null;
  history.back();
}

// 弹窗是被「跳去别的页」带没的：解绑但别动历史，因为马上要 go() 往前走了
export function forgetModalBack() {
  _open = null;
}

window.addEventListener('popstate', function() {
  if (!_open) return;
  const hide = _open;
  _open = null;          // 先清空，hide 里再调 release 也不会退第二次
  hide();
});
