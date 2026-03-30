// pages/characters/modals/char-readonly-modal.js
// 只读人物弹窗 —— 供 geo-detail 和 characters-tab 共用

import { escHtml } from '../../../core/ui.js';
import * as State from '../state.js';
import { parseAvatarUrls, pickRandomUrl, openImageViewer } from '../utils.js';

function _parseCharSections(raw) {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) return p;
    return [{ title: '个人简介', content: raw }];
  } catch (_) {
    return [{ title: '个人简介', content: raw }];
  }
}

function _childHTML(node, depth) {
  if (depth > 1) {
    const label = node.title ? '<strong>' + escHtml(node.title) + '</strong>' : '';
    const text  = node.content ? escHtml(node.content) : '';
    return '<div class="static-text-l3">' + (label && text ? label + '&ensp;' + text : label + text) + '</div>';
  }
  const kids = (node.children && node.children.length)
    ? node.children.map(function(gc) { return _childHTML(gc, depth + 1); }).join('')
    : '';
  return '<div class="collapse-item">' +
    '<div class="collapse-header">' + escHtml(node.title || '') + '</div>' +
    '<div class="collapse-content">' +
      '<div class="collapse-inner">' +
        (node.content ? escHtml(node.content) : '') +
        kids +
      '</div>' +
    '</div>' +
  '</div>';
}

function _sectionsHTML(sections) {
  return sections.map(function(s) {
    const childrenHTML = (s.children && s.children.length)
      ? s.children.map(function(c) { return _childHTML(c, 1); }).join('')
      : '';
    return '<div class="h2-section">' +
      '<div class="collapse-h2"><span>' + escHtml(s.title || '未命名') + '</span></div>' +
      '<div class="h2-content">' +
        (s.content ? '<div class="collapse-inner">' + escHtml(s.content) + '</div>' : '') +
        childrenHTML +
      '</div>' +
    '</div>';
  }).join('');
}

export function openCharReadonly(char, expandPath) {
  const container = State.pageContainer;
  let overlay = container.querySelector('#char-readonly-modal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'char-readonly-modal';
    overlay.className = 'tl-modal-overlay modal-center';
    container.appendChild(overlay);
  }

  const city    = State.allCities.find(function(c) { return c.id === char.city_id; });
  const country = city ? State.allCountries.find(function(co) { return co.id === city.country_id; }) : null;
  const location = [country && country.name, city && city.name].filter(Boolean).join(' › ');
  const age = (char.base_age != null && char.base_age !== '') ? String(char.base_age) + ' 岁' : '';

  const avatarUrls = parseAvatarUrls(char.avatar_url);
  const avatarUrl  = pickRandomUrl(avatarUrls);

  overlay.innerHTML =
    '<div class="tl-modal char-modal-box" onmousedown="event.stopPropagation()">' +
      '<div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:16px">' +
        '<div class="geo-person-av" style="width:56px;height:56px;font-size:22px;flex-shrink:0' + (avatarUrl ? ';cursor:pointer' : '') + '"' + (avatarUrl ? ' data-viewimg="' + escHtml(avatarUrl) + '"' : '') + '>' +
          (avatarUrl
            ? '<img src="' + escHtml(avatarUrl) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>'
            : escHtml(char.name.charAt(0))) +
        '</div>' +
        '<div style="flex:1">' +
          '<h2 style="margin:0 0 4px">' + escHtml(char.name) + '</h2>' +
          (age      ? '<div style="font-size:14px;color:var(--muted)">' + age + '</div>' : '') +
          (location ? '<div style="font-size:14px;color:var(--muted)">' + escHtml(location) + '</div>' : '') +
        '</div>' +
      '</div>' +
      (function() {
        const secs = _parseCharSections(char.description);
        if (!secs.length) return '<div style="font-size:14px;color:var(--muted);font-style:italic">暂无介绍</div>';
        return '<div id="char-ro-sections">' + _sectionsHTML(secs) + '</div>';
      })() +
    '</div>';

  overlay.classList.add('show');

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

  // 关闭弹窗需要完整的一次点击（mousedown + mouseup 均在遮罩上）
  // 用 AbortController 避免每次打开重复累积监听器
  if (overlay._closeCtrl) overlay._closeCtrl.abort();
  overlay._closeCtrl = new AbortController();
  const signal = overlay._closeCtrl.signal;
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', function(e) {
    _mdOnOverlay = (e.target === overlay);
  }, { signal });
  overlay.addEventListener('mouseup', function(e) {
    if (_mdOnOverlay && e.target === overlay) overlay.classList.remove('show');
    _mdOnOverlay = false;
  }, { signal });
}
