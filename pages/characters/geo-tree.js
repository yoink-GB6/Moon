// pages/characters/geo-tree.js
// 地理树渲染和交互

import { isEditor } from '../../core/auth.js';
import { escHtml } from '../../core/ui.js';
import * as State from './state.js';
import { renderGeoDetail } from './geo-detail.js';
import { openCountryModal } from './modals/country-modal.js';
import { openCityModal } from './modals/city-modal.js';
import { openLandmarkModal } from './modals/landmark-modal.js';

/**
 * 渲染地理树（国家 → 城市 → 地标），渲染后自动重新绑定事件
 */
export function renderGeoTree() {
  const container = State.pageContainer;
  const list = container.querySelector('#geo-tree-list');

  if (!list) return;

  if (!State.allCountries.length && !State.allCities.some(c => !c.country_id)) {
    list.innerHTML = '<div class="geo-empty">暂无数据</div>';
    return;
  }

  let html = '';

  function renderCityNode(city) {
    const cityActive = State.selectedCity?.id === city.id;
    const cityExpanded = State.expandedCities.has(city.id);
    const landmarks = State.allLandmarks.filter(l => l.city_id === city.id);

    let cityHtml = `
      <div class="geo-tree-item geo-tree-city ${cityActive ? 'active' : ''}" data-type="city" data-id="${city.id}">
        <div>
          <span class="geo-tree-toggle" data-toggle-city="${city.id}">${cityExpanded ? '▼' : '▶'}</span>
          🏙️ ${escHtml(city.name)}
        </div>
        ${isEditor() ? `
          <div class="geo-tree-actions">
            <button class="geo-tree-btn" data-add-landmark="${city.id}">＋标</button>
            <button class="geo-tree-btn" data-edit-city="${city.id}">✏️</button>
          </div>
        ` : ''}
      </div>
    `;

    if (cityExpanded) {
      if (landmarks.length) {
        landmarks.forEach(lm => {
          cityHtml += `
            <div class="geo-tree-item geo-tree-landmark" data-type="landmark" data-id="${lm.id}" data-city-id="${city.id}">
              <div>🏛 ${escHtml(lm.name)}</div>
              ${isEditor() ? `
                <div class="geo-tree-actions">
                  <button class="geo-tree-btn" data-edit-landmark="${lm.id}">✏️</button>
                </div>
              ` : ''}
            </div>
          `;
        });
      } else {
        cityHtml += `<div class="geo-tree-landmark-empty">暂无地标</div>`;
      }
    }

    return cityHtml;
  }

  // 国家 → 城市 → 地标
  State.allCountries.forEach(country => {
    const cities = State.allCities.filter(c => c.country_id === country.id);
    const isExpanded = State.expandedCountries.has(country.id);
    const isActive = State.selectedCountry?.id === country.id && !State.selectedCity;

    html += `
      <div class="geo-tree-item ${isActive ? 'active' : ''}" data-type="country" data-id="${country.id}">
        <div>
          <span class="geo-tree-toggle" data-toggle="${country.id}">${isExpanded ? '▼' : '▶'}</span>
          🏛️ ${escHtml(country.name)}
        </div>
        ${isEditor() ? `
          <div class="geo-tree-actions">
            <button class="geo-tree-btn" data-add-city="${country.id}">＋城</button>
            <button class="geo-tree-btn" data-edit="${country.id}">✏️</button>
          </div>
        ` : ''}
      </div>
    `;

    if (isExpanded) {
      cities.forEach(city => { html += renderCityNode(city); });
    }
  });

  // 无国家的城市
  const noCities = State.allCities.filter(c => !c.country_id);
  if (noCities.length) {
    html += `<div class="geo-tree-item"><div><span class="geo-tree-toggle">▼</span>🌍 无国家</div></div>`;
    noCities.forEach(city => { html += renderCityNode(city); });
  }

  list.innerHTML = html;

  // 渲染后立即重绑事件
  bindGeoTree();
}

/**
 * 绑定地理树事件（由 renderGeoTree 自动调用，外部也可单独调用）
 */
export function bindGeoTree() {
  const container = State.pageContainer;
  const list = container.querySelector('#geo-tree-list');

  if (!list) return;

  // 国家展开/收起
  list.querySelectorAll('[data-toggle]').forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(toggle.dataset.toggle);
      State.toggleCountryExpanded(id);
      renderGeoTree();
    });
  });

  // 城市展开/收起（只展开地标列表，不触发城市选中）
  list.querySelectorAll('[data-toggle-city]').forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(toggle.dataset.toggleCity);
      State.toggleCityExpanded(id);
      renderGeoTree();
    });
  });

  // 选择节点
  list.querySelectorAll('.geo-tree-item[data-type]').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.geo-tree-actions')) return;
      if (e.target.closest('[data-toggle-city]')) return;
      if (e.target.closest('[data-toggle]')) return;

      const type = item.dataset.type;
      const id = parseInt(item.dataset.id);

      if (type === 'country') {
        State.setSelectedCountry(State.allCountries.find(c => c.id === id));
        State.setSelectedCity(null);
        State.toggleCountryExpanded(id);
      } else if (type === 'city') {
        const city = State.allCities.find(c => c.id === id);
        State.setSelectedCity(city);
        State.setSelectedCountry(State.allCountries.find(co => co.id === city?.country_id));
      } else if (type === 'landmark') {
        // 点击地标：跳转到所属城市详情
        const cityId = parseInt(item.dataset.cityId);
        const city = State.allCities.find(c => c.id === cityId);
        if (city) {
          State.setSelectedCity(city);
          State.setSelectedCountry(State.allCountries.find(co => co.id === city.country_id));
        }
      }

      renderGeoDetail();
      renderGeoTree();
    });
  });

  // 编辑按钮（仅编辑模式）
  if (isEditor()) {
    list.querySelectorAll('[data-add-city]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openCityModal(null, parseInt(btn.dataset.addCity));
      });
    });

    list.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openCountryModal(State.allCountries.find(c => c.id === parseInt(btn.dataset.edit)));
      });
    });

    list.querySelectorAll('[data-edit-city]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openCityModal(State.allCities.find(c => c.id === parseInt(btn.dataset.editCity)));
      });
    });

    list.querySelectorAll('[data-add-landmark]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cityId = parseInt(btn.dataset.addLandmark);
        if (!State.expandedCities.has(cityId)) State.toggleCityExpanded(cityId);
        openLandmarkModal(null, cityId);
      });
    });

    list.querySelectorAll('[data-edit-landmark]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openLandmarkModal(State.allLandmarks.find(l => l.id === parseInt(btn.dataset.editLandmark)));
      });
    });
  }
}
