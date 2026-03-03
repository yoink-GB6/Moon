// pages/characters/geo-search.js
// 搜索功能

import { escHtml } from '../../core/ui.js';
import * as State from './state.js';
import { selectCountryAndExpand, selectCityAndExpand } from './utils.js';
import { renderGeoTree } from './geo-tree.js';
import { renderGeoDetail } from './geo-detail.js';

export function renderSearchResults() {
  const container = State.pageContainer;
  const results = container.querySelector('#geo-search-results');
  
  if (!results) return;
  
  if (!State.searchQuery) {
    results.innerHTML = '<div class="geo-empty">输入关键词搜索</div>';
    return;
  }
  
  const query = State.searchQuery.toLowerCase();
  let html = '';
  
  // 搜索国家
  State.allCountries.filter(c => c.name.toLowerCase().includes(query)).forEach(country => {
    html += `
      <div class="geo-search-item" data-select-country="${country.id}">
        <div>🏛️ ${escHtml(country.name)}</div>
        <div class="geo-search-path">国家</div>
      </div>
    `;
  });
  
  // 搜索城市
  State.allCities.filter(c => c.name.toLowerCase().includes(query)).forEach(city => {
    const country = State.allCountries.find(co => co.id === city.country_id);
    const path = country ? `${country.name} → ${city.name}` : city.name;
    
    html += `
      <div class="geo-search-item" data-select-city="${city.id}" data-country-id="${city.country_id || ''}">
        <div>🏙️ ${escHtml(city.name)}</div>
        <div class="geo-search-path">${escHtml(path)}</div>
      </div>
    `;
  });
  
  // 搜索人物
  State.allChars.filter(c => c.name.toLowerCase().includes(query)).forEach(person => {
    const city = State.allCities.find(c => c.id === person.city_id);
    const country = city ? State.allCountries.find(co => co.id === city.country_id) : null;
    const path = [country?.name, city?.name, person.name].filter(Boolean).join(' → ');
    
    html += `
      <div class="geo-search-item" data-select-city="${person.city_id || ''}" data-country-id="${city?.country_id || ''}">
        <div>👤 ${escHtml(person.name)}</div>
        <div class="geo-search-path">${escHtml(path)}</div>
      </div>
    `;
  });
  
  // 搜索地标
  State.allLandmarks.filter(l => l.name.toLowerCase().includes(query)).forEach(landmark => {
    const city = State.allCities.find(c => c.id === landmark.city_id);
    const country = city ? State.allCountries.find(co => co.id === city.country_id) : null;
    const path = [country?.name, city?.name, landmark.name].filter(Boolean).join(' → ');
    
    html += `
      <div class="geo-search-item" data-select-city="${landmark.city_id}" data-country-id="${city?.country_id || ''}">
        <div>🏛️ ${escHtml(landmark.name)}</div>
        <div class="geo-search-path">${escHtml(path)}</div>
      </div>
    `;
  });
  
  results.innerHTML = html || '<div class="geo-empty">无搜索结果</div>';
}

export function bindSearch() {
  const container = State.pageContainer;
  
  // 搜索输入
  const searchInput = container.querySelector('#geo-search-input');
  if (searchInput) {
    const newInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newInput, searchInput);
    
    newInput.addEventListener('input', (e) => {
      State.setSearchQuery(e.target.value.toLowerCase());
      renderSearchResults();
      bindSearchResults();
    });
  }
  
  bindSearchResults();
}

function bindSearchResults() {
  const container = State.pageContainer;
  const results = container.querySelector('#geo-search-results');
  
  if (!results) return;
  
  // 选择国家
  results.querySelectorAll('[data-select-country]').forEach(item => {
    item.addEventListener('click', () => {
      const countryId = parseInt(item.dataset.selectCountry);
      selectCountryAndExpand(
        countryId,
        State.allCountries,
        State,
        [renderGeoTree, renderGeoDetail]
      );
    });
  });
  
  // 选择城市
  results.querySelectorAll('[data-select-city]').forEach(item => {
    item.addEventListener('click', () => {
      const cityId = parseInt(item.dataset.selectCity);
      const countryId = item.dataset.countryId ? parseInt(item.dataset.countryId) : null;
      selectCityAndExpand(
        cityId,
        countryId,
        State.allCities,
        State.allCountries,
        State,
        [renderGeoTree, renderGeoDetail]
      );
    });
  });
}
