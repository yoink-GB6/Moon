// core/analytics.js
// 自建访问统计：直接写进 Supabase 的 page_views 表。
//
// 为什么不用第三方：任何统计脚本都来自另一个域名，那个域名一慢一被拦就丢数据，
// 而且丢得有偏（网络差的、开拦截的人系统性地不被统计）。写自己的库，
// 站能打开的地方统计就一定通。换托管也不用改这里，它跟 HTML 放哪无关。
//
// 分工：
//   浏览器只报自己知道的（路径、来源、时区、语言、屏宽、会话 id）
//   IP 和 User-Agent 由数据库在插入时从请求头取，客户端不经手，也就伪造不了
//
// 「国家地区」用时区代替，没做 IP 地理库：朋友挂梯子时 IP 显示的是节点所在国，
// 时区显示的还是人在哪——后者才是想知道的。IP 存着，将来真要 GeoIP 可以回头补算。

import { supaClient } from './supabase-client.js';
import { onRouteChange } from './router.js';
import { isEditor } from './auth.js';

const SID_KEY = 'moon-sid';

// 一次「访问」= 一个标签页会话。sessionStorage 关掉标签页就没了，
// 不是 cookie，也不跨站，所以不需要同意横幅。
function sessionId() {
  let id = sessionStorage.getItem(SID_KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID()
                           : Date.now() + '-' + Math.random().toString(36).slice(2);
    sessionStorage.setItem(SID_KEY, id);
  }
  return id;
}

function externalReferrer() {
  const ref = document.referrer;
  if (!ref) return null;
  try {
    return new URL(ref).hostname === location.hostname ? null : ref;
  } catch (_) { return null; }
}

let _lastPath = null;
let _refDone  = false;

async function _track(path) {
  if (isEditor()) return;          // 自己改内容刷出来的那几十个 PV 不算数
  if (path === _lastPath) return;  // 同一地址连续触发只记一次
  _lastPath = path;

  const row = {
    session_id: sessionId(),
    path,
    // 来源只在本次页面加载的第一条上记；之后都是站内跳转，referrer 不会变
    referrer: _refDone ? null : externalReferrer(),
    tz:       Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    lang:     navigator.language || null,
    screen_w: window.screen ? window.screen.width : null,
  };
  _refDone = true;

  const { error } = await supaClient.from('page_views').insert(row);
  if (error) console.warn('[analytics] 上报失败（忽略）:', error.message);
}

// 注意：地址栏没有 hash 时记成 '#/'，表示「从首页进来、走了默认页」，
// 和显式访问 '#/library' 区分开——想知道有多少人是直接输域名进来的。
export function initAnalytics() {
  const path = () => location.hash || '#/';
  _track(path());
  // reflect() 用的是 replaceState，不触发 hashchange，
  // 所以开关弹窗不会被记成新的 PV，只有真正切页才会
  onRouteChange(() => _track(path()));
}
