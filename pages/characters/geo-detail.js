// pages/characters/geo-detail.js
// 详情区渲染

import { isEditor } from '../../core/auth.js';
import { escHtml } from '../../core/ui.js';
import * as State from './state.js';
import { openCountryModal } from './modals/country-modal.js';
import { openCityModal } from './modals/city-modal.js';
import { openLandmarkModal } from './modals/landmark-modal.js';
import { openCharModal } from './modals/character-modal.js';
import { renderGeoTree } from './geo-tree.js';

export function renderGeoDetail() {
  const container = State.pageContainer;
  const detail = container.querySelector('#geo-detail-view');
  
  if (!detail) return;
  
  if (!State.selectedCity && !State.selectedCountry) {
    detail.innerHTML = '<div class="geo-empty">选择一个国家或城市查看详情</div>';
    return;
  }
  
  if (State.selectedCity) {
    renderCityDetail(detail);
  } else if (State.selectedCountry) {
    renderCountryDetail(detail);
  }
}

function renderCountryDetail(detail) {
  const country = State.selectedCountry;
  const cities = State.allCities.filter(c => c.country_id === country.id);
  
  detail.innerHTML = `
    <h2>
      <span>🏛️ ${escHtml(country.name)}</span>
      ${isEditor() ? `<button class="btn bn" id="edit-country-${country.id}">编辑</button>` : ''}
    </h2>
    
    ${country.description ? `
      <div class="geo-detail-section">
        <h3>概述</h3>
        <div class="geo-detail-value">${escHtml(country.description)}</div>
      </div>
    ` : ''}
    
    <div class="geo-detail-section">
      <h3>
        <span>城市 (${cities.length})</span>
        ${isEditor() ? `<button class="btn bn" id="add-city-${country.id}">＋ 添加</button>` : ''}
      </h3>
      ${cities.length ? cities.map(city => `
        <div class="geo-tree-item" style="margin:4px 0" data-select-city="${city.id}">
          🏙️ ${escHtml(city.name)}
        </div>
      `).join('') : '<div class="geo-empty" style="padding:20px">暂无城市</div>'}
    </div>
  `;
  
  // 绑定按钮
  if (isEditor()) {
    detail.querySelector(`#edit-country-${country.id}`)?.addEventListener('click', () => {
      openCountryModal(country);
    });
    
    detail.querySelector(`#add-city-${country.id}`)?.addEventListener('click', () => {
      openCityModal(null, country.id);
    });
  }
  
  // 绑定城市选择
  detail.querySelectorAll('[data-select-city]').forEach(item => {
    item.addEventListener('click', () => {
      const cityId = parseInt(item.dataset.selectCity);
      State.setSelectedCity(State.allCities.find(c => c.id === cityId));
      renderGeoDetail();
      renderGeoTree();
    });
  });
}

function renderCityDetail(detail) {
  const city = State.selectedCity;
  const landmarks = State.allLandmarks.filter(l => l.city_id === city.id);
  const people = State.allChars.filter(c => c.city_id === city.id);
  const country = State.allCountries.find(c => c.id === city.country_id);
  
  detail.innerHTML = `
    <h2>
      <span>🏙️ ${escHtml(city.name)}</span>
      ${isEditor() ? `<button class="btn bn" id="edit-city-${city.id}">编辑</button>` : ''}
    </h2>
    ${country ? `<div style="color:var(--muted);margin-bottom:24px">所属: ${escHtml(country.name)}</div>` : ''}
    
    ${city.overview ? `
      <div class="geo-detail-section">
        <h3>概述</h3>
        <div class="geo-detail-value">${escHtml(city.overview)}</div>
      </div>
    ` : ''}
    
    ${city.geography ? `
      <div class="geo-detail-section">
        <h3>地理位置</h3>
        <div class="geo-detail-value">${escHtml(city.geography)}</div>
      </div>
    ` : ''}
    
    ${city.climate ? `
      <div class="geo-detail-section">
        <h3>气候</h3>
        <div class="geo-detail-value">${escHtml(city.climate)}</div>
      </div>
    ` : ''}
    
    ${city.structure ? `
      <div class="geo-detail-section">
        <h3>城市结构</h3>
        <div class="geo-detail-value">${escHtml(city.structure)}</div>
      </div>
    ` : ''}
    
    <div class="geo-detail-section">
      <h3>
        <span>地标建筑 (${landmarks.length})</span>
        ${isEditor() ? `<button class="btn bn" id="add-landmark-${city.id}">＋ 添加</button>` : ''}
      </h3>
      ${landmarks.length ? landmarks.map(lm => `
        <div class="geo-landmark-item">
          <div>
            <div class="geo-landmark-name">${escHtml(lm.name)}</div>
            ${lm.description ? `<div style="font-size:13px;color:var(--muted)">${escHtml(lm.description)}</div>` : ''}
          </div>
          ${isEditor() ? `<div class="geo-item-actions"><button class="btn bn" data-edit-landmark="${lm.id}">✏️</button></div>` : ''}
        </div>
      `).join('') : '<div class="geo-empty" style="padding:20px">暂无地标</div>'}
    </div>
    
    <div class="geo-detail-section">
      <h3>关联人物 (${people.length})</h3>
      ${people.length ? people.map(p => `
        <div class="geo-person-item" ${isEditor() ? `data-edit-char="${p.id}"` : ''}>
          <div style="display:flex;gap:8px;align-items:center">
            <div style="width:32px;height:32px;border-radius:50%;background:var(--accent);color:white;display:flex;align-items:center;justify-content:center;font-size:14px;overflow:hidden">
              ${p.avatar_url ? `<img src="${p.avatar_url}" style="width:100%;height:100%;object-fit:cover"/>` : escHtml(p.name.charAt(0))}
            </div>
            <div>
              <div>${escHtml(p.name)}</div>
              ${p.age ? `<div style="font-size:12px;color:var(--muted)">${escHtml(p.age)}岁</div>` : ''}
            </div>
          </div>
        </div>
      `).join('') : '<div class="geo-empty" style="padding:20px">暂无关联人物</div>'}
    </div>
  `;
  
  // 绑定按钮
  if (isEditor()) {
    detail.querySelector(`#edit-city-${city.id}`)?.addEventListener('click', () => {
      openCityModal(city);
    });
    
    detail.querySelector(`#add-landmark-${city.id}`)?.addEventListener('click', () => {
      openLandmarkModal(null, city.id);
    });
    
    detail.querySelectorAll('[data-edit-landmark]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.editLandmark);
        openLandmarkModal(State.allLandmarks.find(l => l.id === id));
      });
    });
    
    detail.querySelectorAll('[data-edit-char]').forEach(item => {
      item.addEventListener('click', () => {
        const id = parseInt(item.dataset.editChar);
        openCharModal(State.allChars.find(c => c.id === id));
      });
    });
  }
}
