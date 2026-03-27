// pages/characters/characters-tab.js
// 人物标签页渲染和交互

import { isEditor } from '../../core/auth.js';
import { escHtml } from '../../core/ui.js';
import * as State from './state.js';
import { openCharModal } from './modals/character-modal.js';
import { getLocationPath } from './utils.js';

// ── 解析人物 description（JSON 数组 or 旧纯文本）────────────
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

// ── 渲染折叠小节 HTML（默认折叠）───────────────────────────
// 递归渲染子节点
function _childHTML(node, depth) {
  const indent = depth > 1 ? 'margin-left:' + ((depth - 1) * 12) + 'px;' : '';
  const childrenHTML = (node.children && node.children.length && depth < 3)
    ? '<div style="margin-top:6px">' + node.children.map(function(gc) { return _childHTML(gc, depth + 1); }).join('') + '</div>'
    : '';
  return '<div class="geo-section-card geo-child-card char-section-card" style="' + indent + 'margin-bottom:6px">' +
    '<div class="geo-section-toggle">' +
      '<span class="geo-section-title" style="font-size:' + (13 - depth) + 'px">' + escHtml(node.title || '') + '</span>' +
      '<span class="geo-section-arrow">▼</span>' +
    '</div>' +
    '<div class="geo-section-body">' +
      (node.content ? '<div class="geo-section-content" style="white-space:pre-wrap">' + escHtml(node.content) + '</div>' : '') +
      childrenHTML +
    '</div>' +
  '</div>';
}

function _sectionsHTML(sections) {
  if (!sections.length) return '';
  return sections.map(function(s) {
    const childrenHTML = (s.children && s.children.length)
      ? '<div class="geo-section-children">' +
          s.children.map(function(c) { return _childHTML(c, 1); }).join('') +
        '</div>'
      : '';
    return '<div class="geo-section-card char-section-card">' +
      '<div class="geo-section-toggle">' +
        '<span class="geo-section-title" style="font-size:13px">' + escHtml(s.title || '未命名') + '</span>' +
        '<span class="geo-section-arrow">▼</span>' +
      '</div>' +
      '<div class="geo-section-body">' +
        (s.content ? '<div class="geo-section-content" style="white-space:pre-wrap">' + escHtml(s.content) + '</div>' : '') +
        childrenHTML +
      '</div>' +
    '</div>';
  }).join('');
}

function _bindSectionToggles(container) {
  container.querySelectorAll('.geo-section-toggle').forEach(function(t) {
    t.addEventListener('click', function(e) {
      e.stopPropagation();
      // 只响应直接点到自己的 toggle，防止子 toggle 冒泡触发父级
      if (e.target.closest('.geo-section-toggle') !== t) return;
      t.parentElement.classList.toggle('open');
    });
  });
}

/**
 * 渲染人物标签页
 */
export function renderCharactersTab() {
  const container = State.pageContainer;
  const grid = container.querySelector('#chars-grid');

  if (!State.allChars.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted)">暂无人物</div>';
    return;
  }

  grid.innerHTML = State.allChars.map(char => {
    const location = getLocationPath(char.city_id, State.allCities, State.allCountries);
    // 修复：age 可能是字符串 "0" 或数字 0，不能用 truthy 判断，要用 != null && !== ''
    const hasAge = char.base_age != null && char.base_age !== '';

    return `
      <div class="intro-card" data-id="${char.id}">
        <div style="display:flex;gap:12px;margin-bottom:12px">
          <div class="intro-avatar">
            ${char.avatar_url ? `<img src="${escHtml(char.avatar_url)}"/>` : escHtml(char.name.charAt(0))}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;margin-bottom:4px">${escHtml(char.name)}</div>
            ${location !== '未知' ? `<div style="font-size:12px;color:var(--muted)">${escHtml(location)}</div>` : ''}
            ${hasAge ? `<div style="font-size:12px;color:var(--muted)">年龄：${escHtml(String(char.base_age))}</div>` : ''}
          </div>
        </div>
        ${_sectionsHTML(_parseCharSections(char.description))}
      </div>
    `;
  }).join('');

  // 绑定折叠事件
  _bindSectionToggles(grid);

  // 绑定点击事件（编辑模式）
  if (isEditor()) {
    grid.querySelectorAll('.intro-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = parseInt(card.dataset.id);
        const char = State.allChars.find(c => c.id === id);
        if (char) openCharModal(char);
      });
    });
  }
}

/**
 * 绑定人物标签页按钮
 */
export function bindCharactersTab() {
  const container = State.pageContainer;
  const addBtn = container.querySelector('#chars-add-btn');
  if (addBtn) {
    const newBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newBtn, addBtn);
    newBtn.addEventListener('click', () => openCharModal(null));
  }
}
