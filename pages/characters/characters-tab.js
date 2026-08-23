// pages/characters/characters-tab.js
// 人物标签页渲染和交互

import { escHtml } from '../../core/ui.js';
import * as State from './state.js';
import { openCharModal } from './modals/character-modal.js';
import { bindCharOpen } from './char-open.js';
import { openBirthdayForCharacter } from './birthday-popup.js';
import { formatBirthdayShort, getLocationPath, parseAvatarUrls, pickRandomUrl } from './utils.js';

const SECRET_BIRTHDAY_LABELS = [
  'Motus', 'Pssssst', 'shh', 'Chitón', 'Zitto', 'Naisho', '쉿', '嘘',
  'Tace', 'Arcanum', 'Sgr', 'चुप!', 'Σιώπα', 'Hljóð',
];

function randomSecretBirthdayLabel() {
  return SECRET_BIRTHDAY_LABELS[Math.floor(Math.random() * SECRET_BIRTHDAY_LABELS.length)];
}


// 计算 toggle 在卡片内的层级索引路径，供只读弹窗定位对应小节
export function getTogglePath(toggle, cardEl) {
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
 * 生成单张人物卡片的 HTML 字符串
 */
export function buildCharCardHTML(char, avatarUrl) {
  const location = getLocationPath(char.city_id, State.allCities, State.allCountries, char.country_id);
  const hasAge   = char.base_age != null && char.base_age !== '';
  const birthday = formatBirthdayShort(char.birthday);
  const birthdayLabel = birthday || randomSecretBirthdayLabel();
  const birthdayAria = birthday ? `查看${char.name}的生日` : `${char.name}的生日是秘密`;
  return `
    <div class="intro-card" data-id="${char.id}"${avatarUrl ? ` data-avatar="${escHtml(avatarUrl)}"` : ''}>
      <div class="intro-card-header">
        <div class="intro-avatar">
          ${avatarUrl ? `<img src="${escHtml(avatarUrl)}"/>` : escHtml(char.name.charAt(0))}
        </div>
        <div class="intro-card-info">
          <div class="intro-card-name">${escHtml(char.name)}</div>
          ${location !== '未知' ? `<div class="intro-card-meta">${escHtml(location)}</div>` : ''}
          ${hasAge ? `<div class="intro-card-meta">年龄：${escHtml(String(char.base_age))}</div>` : ''}
        </div>
        <button type="button" class="btn bn intro-card-birthday" aria-label="${escHtml(birthdayAria)}"${birthday ? '' : ' data-birthday-secret="true"'}>${escHtml(birthdayLabel)}</button>
      </div>
    </div>
  `;
}

/**
 * 为单张人物卡片绑定点击事件
 */
export function bindCharCard(card, char) {
  const birthdayButton = card.querySelector('.intro-card-birthday');
  if (birthdayButton) {
    ['mousedown', 'touchstart', 'contextmenu'].forEach(type => {
      birthdayButton.addEventListener(type, event => event.stopPropagation());
    });
    birthdayButton.addEventListener('click', event => {
      event.stopPropagation();
      openBirthdayForCharacter(char, State.allChars);
    });
  }

  bindCharOpen(card, (e) => {
    const toggle = e.target.closest && e.target.closest('.collapse-h2, .collapse-header');
    return {
      char,
      expandPath: (toggle && card.contains(toggle)) ? getTogglePath(toggle, card) : undefined,
      avatar: card.dataset.avatar || undefined,
    };
  });
}

/**
 * 渲染人物标签页
 */
export function renderCharactersTab(avatarCache) {
  const container = State.pageContainer;
  const grid = container.querySelector('#chars-grid');

  if (!State.allChars.length) {
    grid.innerHTML = '<div class="intro-empty">wandering……</div>';
    return;
  }

  grid.innerHTML = State.allChars.map(char => {
    const avatarUrl = (avatarCache && avatarCache.has(char.id)) ? avatarCache.get(char.id) : pickRandomUrl(parseAvatarUrls(char.avatar_url));
    return buildCharCardHTML(char, avatarUrl);
  }).join('');

  grid.querySelectorAll('.intro-card').forEach(card => {
    const id   = parseInt(card.dataset.id);
    const char = State.allChars.find(c => c.id === id);
    if (char) bindCharCard(card, char);
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
