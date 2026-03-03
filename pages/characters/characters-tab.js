// pages/characters/characters-tab.js
// 人物标签页渲染和交互

import { isEditor } from '../../core/auth.js';
import { escHtml } from '../../core/ui.js';
import * as State from './state.js';
import { openCharModal } from './modals/character-modal.js';
import { getLocationPath } from './utils.js';

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
    
    return `
      <div class="intro-card" data-id="${char.id}">
        <div style="display:flex;gap:12px;margin-bottom:12px">
          <div class="intro-avatar">
            ${char.avatar_url ? `<img src="${char.avatar_url}"/>` : escHtml(char.name.charAt(0))}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;margin-bottom:4px">${escHtml(char.name)}</div>
            <div style="font-size:12px;color:var(--muted)">${location}</div>
            ${char.age ? `<div style="font-size:12px;color:var(--muted)">年龄: ${escHtml(char.age)}</div>` : ''}
          </div>
        </div>
        ${char.description ? `<div style="font-size:13px;line-height:1.5">${escHtml(char.description)}</div>` : ''}
      </div>
    `;
  }).join('');
  
  // 绑定点击事件
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
    // 移除旧监听器（如果有）
    const newBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newBtn, addBtn);
    
    // 添加新监听器
    newBtn.addEventListener('click', () => openCharModal(null));
  }
}
