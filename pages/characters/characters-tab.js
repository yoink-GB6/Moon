// pages/characters/characters-tab.js
// 人物标签页渲染和交互

import { isEditor } from '../../core/auth.js';
import { escHtml } from '../../core/ui.js';
import * as State from './state.js';
import { openCharModal } from './modals/character-modal.js';
import { openCharReadonly } from './modals/char-readonly-modal.js';
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

// ── 渲染子节点 HTML（递归，depth 1/2/3）──────────────────────
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

// ── 渲染折叠小节 HTML（默认折叠）───────────────────────────
function _sectionsHTML(sections) {
  if (!sections.length) return '';
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

function _bindSectionToggles(_container) {
  // 卡片视图中折叠栏不展开——所有点击一律冒泡到 .intro-card 处理器
  // 编辑模式：打开编辑框；只读模式：打开只读弹窗并展开对应小节
}

// 计算 toggle 在卡片内的层级索引路径，供只读弹窗定位对应小节
function _getTogglePath(toggle, cardEl) {
  const section = toggle.closest('.h2-section, .collapse-item');
  if (!section || !cardEl.contains(section)) return null;
  const path = [];
  let node = section;
  while (node && cardEl.contains(node)) {
    const parent = node.parentElement;
    const siblings = Array.from(parent.children).filter(function(el) {
      return el.classList.contains('h2-section') || el.classList.contains('collapse-item');
    });
    path.unshift(siblings.indexOf(node));
    const parentSection = parent.closest('.h2-section, .collapse-item');
    if (!parentSection || !cardEl.contains(parentSection)) break;
    node = parentSection;
  }
  return path;
}

/**
 * 渲染人物标签页
 */
export function renderCharactersTab() {
  const container = State.pageContainer;
  const grid = container.querySelector('#chars-grid');

  if (!State.allChars.length) {
    grid.innerHTML = '<div class="intro-empty">暂无人物</div>';
    return;
  }

  grid.innerHTML = State.allChars.map(char => {
    const location = getLocationPath(char.city_id, State.allCities, State.allCountries);
    // 修复：age 可能是字符串 "0" 或数字 0，不能用 truthy 判断，要用 != null && !== ''
    const hasAge = char.base_age != null && char.base_age !== '';

    return `
      <div class="intro-card" data-id="${char.id}">
        <div class="intro-card-header">
          <div class="intro-avatar">
            ${char.avatar_url ? `<img src="${escHtml(char.avatar_url)}"/>` : escHtml(char.name.charAt(0))}
          </div>
          <div class="intro-card-info">
            <div class="intro-card-name">${escHtml(char.name)}</div>
            ${location !== '未知' ? `<div class="intro-card-meta">${escHtml(location)}</div>` : ''}
            ${hasAge ? `<div class="intro-card-meta">年龄：${escHtml(String(char.base_age))}</div>` : ''}
          </div>
        </div>
        ${_sectionsHTML(_parseCharSections(char.description))}
      </div>
    `;
  }).join('');

  // 绑定折叠事件
  _bindSectionToggles(grid);

  // 绑定点击事件：编辑模式打开编辑框，只读模式打开介绍弹窗
  grid.querySelectorAll('.intro-card').forEach(card => {
    card.addEventListener('click', (e) => {
      const id = parseInt(card.dataset.id);
      const char = State.allChars.find(c => c.id === id);
      if (!char) return;
      if (isEditor()) {
        openCharModal(char);
      } else {
        // 只读模式：若点击的是折叠栏，则带路径打开（自动展开对应小节）；否则正常打开
        const toggle = e.target.closest('.collapse-h2, .collapse-header');
        if (toggle && card.contains(toggle)) {
          openCharReadonly(char, _getTogglePath(toggle, card));
        } else {
          openCharReadonly(char);
        }
      }
    });
  });
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
