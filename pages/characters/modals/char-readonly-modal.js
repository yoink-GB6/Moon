// pages/characters/modals/char-readonly-modal.js
// 只读人物弹窗 —— 供 geo-detail 和 characters-tab 共用

import { escHtml, openImageViewer } from '../../../core/ui.js';
import * as State from '../state.js';
import { parseAvatarUrls, pickRandomUrl, parseCharSections, sectionsHTML } from '../utils.js';
import { hasCustomHtml, mountCharHtml, pickCharHtml } from '../html-render.js';
import { reflect, go } from '../../../core/router.js';
import { dominantColor } from '../dominant-color.js';

// 开着就关掉并返回 true，供外部“先退出弹窗再说”的判断
export function closeCharReadonly() {
  const c = State.pageContainer;
  const overlay = c && c.querySelector('#char-readonly-modal.show');
  if (!overlay) return false;
  closeOverlay(overlay);
  return true;
}

function closeOverlay(overlay) {
  overlay.classList.remove('show');
  reflect('characters');
}

// 关闭弹窗需要完整的一次点击（mousedown + mouseup 均在遮罩上）
// 用 AbortController 避免每次打开重复累积监听器
function bindOverlayClose(overlay) {
  if (overlay._closeCtrl) overlay._closeCtrl.abort();
  overlay._closeCtrl = new AbortController();
  const signal = overlay._closeCtrl.signal;
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', function(e) {
    _mdOnOverlay = (e.target === overlay);
  }, { signal });
  overlay.addEventListener('mouseup', function(e) {
    if (_mdOnOverlay && e.target === overlay) closeOverlay(overlay);
    _mdOnOverlay = false;
  }, { signal });
  // 右键遮罩也是退出，别弹原生菜单
  overlay.addEventListener('contextmenu', function(e) {
    if (e.target !== overlay) return;
    e.preventDefault();
    closeOverlay(overlay);
  }, { signal });
  // 挂在 document 上，所以要确认 overlay 没被换页拆掉，否则会在别的页面改地址栏
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && overlay.isConnected && overlay.classList.contains('show')) closeOverlay(overlay);
  }, { signal });
}

// 让自定义 HTML 也能用站点能力：写 data-geo-kind / data-viewimg 即可
function bindHtmlHooks(root, overlay) {
  root.addEventListener('click', function(e) {
    const geo = e.target.closest('[data-geo-kind]');
    if (geo) {
      e.stopPropagation();
      overlay.classList.remove('show');
      go('geo', geo.dataset.geoKind, geo.dataset.geoId);
      return;
    }
    const img = e.target.closest('[data-viewimg]');
    if (img) {
      e.stopPropagation();
      openImageViewer(img.dataset.viewimg);
    }
  });
}

// 弹窗默认底：本次抽中的立绘。放大 + 模糊由 CSS 做，这里只喂图。
const BG_LAYER = '<div class="char-bg-layer"></div>';

function applyBgLayer(overlay, avatarUrl) {
  const layer = overlay.querySelector('.char-bg-layer');
  if (!layer || !avatarUrl) return;
  // 先铺模糊图，主色取到了再换成色块；取不到（图床没开 CORS）就一直是模糊图
  layer.style.backgroundImage = 'url("' + avatarUrl.replace(/["\\]/g, '\\$&') + '")';
  dominantColor(avatarUrl).then(function(rgb) {
    if (!rgb || !layer.isConnected) return;
    const c = rgb.join(',');
    // 渐变必须也写成行内的：上面那句 backgroundImage 是行内样式，样式表里的规则盖不掉它
    layer.style.backgroundImage =
      'linear-gradient(155deg,rgba(' + c + ',.9),rgba(' + c + ',.28))';
    layer.classList.add('char-bg-solid');
  });
}

export function openCharReadonly(char, expandPath, fixedAvatarUrl) {
  const container = State.pageContainer;
  let overlay = container.querySelector('#char-readonly-modal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'char-readonly-modal';
    overlay.className = 'tl-modal-overlay modal-center';
    container.appendChild(overlay);
  }

  // 有自定义 HTML 时整个弹窗内容由它接管，expandPath 对应旧折叠结构，忽略
  if (hasCustomHtml(char)) {
    const avatar = fixedAvatarUrl || pickRandomUrl(parseAvatarUrls(char.avatar_url));
    overlay.innerHTML =
      '<div class="tl-modal char-modal-box char-html-modal" onmousedown="event.stopPropagation()">' +
        BG_LAYER +
        '<div id="char-ro-html"></div>' +
      '</div>';
    applyBgLayer(overlay, avatar);
    const root = mountCharHtml(overlay.querySelector('#char-ro-html'), pickCharHtml(char), avatar);
    overlay.classList.add('show');
    reflect('characters', char.id);
    bindHtmlHooks(root, overlay);
    bindOverlayClose(overlay);
    return;
  }

  const city    = char.city_id    ? State.allCities.find(function(c)  { return c.id  === char.city_id;    }) : null;
  // country_id 为空时回退到城市所属国家，和列表/搜索保持一致
  const country = char.country_id
    ? State.allCountries.find(function(co) { return co.id === char.country_id; })
    : (city ? State.allCountries.find(function(co) { return co.id === city.country_id; }) : null);
  // 交叉引用：点国家/城市直接跳到地理页对应节点
  const geoLink = function(kind, obj) {
    return '<span class="geo-xref" data-geo-kind="' + kind + '" data-geo-id="' + obj.id + '">'
      + escHtml(obj.name) + '</span>';
  };
  const location = [country && geoLink('country', country), city && geoLink('city', city)]
    .filter(Boolean).join(' › ');
  const age = (char.base_age != null && char.base_age !== '') ? String(char.base_age) + ' 岁' : '';

  const avatarUrl = fixedAvatarUrl !== undefined ? fixedAvatarUrl : pickRandomUrl(parseAvatarUrls(char.avatar_url));

  overlay.innerHTML =
    '<div class="tl-modal char-modal-box" onmousedown="event.stopPropagation()">' +
      BG_LAYER +
      '<div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:16px">' +
        '<div class="geo-person-av" style="width:56px;height:56px;font-size:22px;flex-shrink:0' + (avatarUrl ? ';cursor:pointer' : '') + '"' + (avatarUrl ? ' data-viewimg="' + escHtml(avatarUrl) + '"' : '') + '>' +
          (avatarUrl
            ? '<img src="' + escHtml(avatarUrl) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>'
            : escHtml(char.name.charAt(0))) +
        '</div>' +
        '<div style="flex:1">' +
          '<h2 style="margin:0 0 4px;color:var(--border-hover)">' + escHtml(char.name) + '</h2>' +
          (age      ? '<div style="font-size:14px;color:var(--muted)">' + age + '</div>' : '') +
          (location ? '<div style="font-size:14px;color:var(--muted)">' + location + '</div>' : '') +
          (char.link_url ? (function() {
            var re = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, m, links = [], raw = char.link_url;
            while ((m = re.exec(raw)) !== null) links.push({ label: m[1], url: m[2] });
            if (!links.length && /^https?:\/\//.test(raw.trim())) links.push({ label: raw.trim(), url: raw.trim() });
            if (!links.length) return '';
            return '<div style="font-size:14px;margin-top:4px;display:flex;flex-wrap:wrap;gap:6px">' +
              links.map(function(l) {
                return '<a href="' + escHtml(l.url) + '" target="_blank" rel="noopener noreferrer" style="color:var(--accent);text-decoration:none">' + escHtml(l.label) + '</a>';
              }).join('') +
            '</div>';
          })() : '') +
        '</div>' +
      '</div>' +
      (function() {
        const secs = parseCharSections(char.description);
        if (!secs.length) return '<div style="font-size:14px;color:var(--muted);font-style:italic">你不会想知道的 †</div>';
        return '<div id="char-ro-sections">' + sectionsHTML(secs) + '</div>';
      })() +
    '</div>';

  applyBgLayer(overlay, avatarUrl);
  overlay.classList.add('show');
  reflect('characters', char.id);   // 地址栏带上这个人，可直接分享

  // 交叉引用跳转。这些节点每次打开都随 innerHTML 重建，
  // 所以不用 signal 也不会累积监听器（用了反而会被下面的 abort 清掉）
  overlay.querySelectorAll('.geo-xref').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.stopPropagation();
      overlay.classList.remove('show');
      go('geo', el.dataset.geoKind, el.dataset.geoId);
    });
  });

  // 点击头像查看原图
  const viewTarget = overlay.querySelector('[data-viewimg]');
  if (viewTarget) {
    viewTarget.addEventListener('click', function(e) {
      e.stopPropagation();
      openImageViewer(viewTarget.dataset.viewimg);
    });
  }

  overlay.querySelectorAll('.collapse-h2').forEach(function(h) {
    h.addEventListener('click', function(e) {
      e.stopPropagation();
      h.closest('.h2-section').classList.toggle('active');
    });
  });
  overlay.querySelectorAll('.collapse-header').forEach(function(h) {
    h.addEventListener('click', function(e) {
      e.stopPropagation();
      h.closest('.collapse-item').classList.toggle('active');
    });
  });

  // 按路径自动展开对应小节
  if (expandPath && expandPath.length > 0) {
    let cur = overlay.querySelector('#char-ro-sections');
    for (let i = 0; i < expandPath.length; i++) {
      if (!cur) break;
      const items = Array.from(cur.children).filter(function(el) {
        return el.classList.contains('h2-section') || el.classList.contains('collapse-item');
      });
      const target = items[expandPath[i]];
      if (!target) break;
      target.classList.add('active');
      cur = target.querySelector('.h2-content') || target.querySelector('.collapse-inner') || null;
    }
  }

  bindOverlayClose(overlay);
}
