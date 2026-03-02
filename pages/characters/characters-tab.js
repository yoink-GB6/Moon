// pages/characters/characters-tab.js
// 人物标签页的渲染和交互

import { isEditor } from '../../core/auth.js';
import { escHtml } from '../../core/ui.js';
import * as State from './state.js';
import { openCharModal } from './modals/character-modal.js';

export function renderCharactersTab(container) {
  const grid = container.querySelector('#chars-grid');
  if (!State.allChars.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted)">暂无人物</div>';
    return;
  }
  
  grid.innerHTML = State.allChars.map(char => {
    const city = State.allCities.find(c => c.id === char.city_id);
    const country = city ? State.allCountries.find(co => co.id === city.country_id) : null;
    const location = [country?.name, city?.name].filter(Boolean).join(' · ') || '未知';
    
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

export function bindCharactersTab(container) {
  const addBtn = container.querySelector('#chars-add-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => openCharModal(null));
  }
}
