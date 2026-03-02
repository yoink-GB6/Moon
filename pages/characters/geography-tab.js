// pages/characters/geography-tab.js
// 地理标签页的主控制器

import { renderGeoTree, bindGeoTree } from './geo-tree.js';
import { renderGeoDetail } from './geo-detail.js';
import { renderSearchResults, bindSearch } from './geo-search.js';
import * as State from './state.js';

export function initGeographyTab(container) {
  // 渲染所有组件
  renderGeoTree(container);
  renderGeoDetail(container);
  renderSearchResults(container);
  
  // 绑定事件
  bindGeoTree(container);
  bindSearch(container);
  bindSearchCollapse(container);
  
  // 默认选中第一个国家
  if (!State.selectedCountry && !State.selectedCity && State.allCountries.length > 0) {
    State.setSelectedCountry(State.allCountries[0]);
    State.toggleCountryExpanded(State.allCountries[0].id);
    renderGeoTree(container);
    renderGeoDetail(container);
  }
}

function bindSearchCollapse(container) {
  function toggleSearch() {
    const sidebar = container.querySelector('.geo-search');
    const expandBtn = container.querySelector('#geo-search-expand');
    const chevron = container.querySelector('#geo-search-chevron');
    const collapsed = sidebar.classList.toggle('collapsed');
    chevron.textContent = collapsed ? '▶' : '◀';
    expandBtn.classList.toggle('show', collapsed);
  }
  
  container.querySelector('#geo-search-toggle')?.addEventListener('click', toggleSearch);
  container.querySelector('#geo-search-expand')?.addEventListener('click', toggleSearch);
}
