// pages/characters/geography-tab.js
// 地理标签页主控制器

import * as State from './state.js';
import { renderGeoTree, bindGeoTree } from './geo-tree.js';
import { renderGeoDetail } from './geo-detail.js';
import { renderSearchResults, bindSearch } from './geo-search.js';
import { openCountryModal } from './modals/country-modal.js';

/**
 * 初始化地理标签页
 */
export function initGeographyTab() {
  const container = State.pageContainer;
  
  // 渲染所有组件
  renderGeoTree();
  renderGeoDetail();
  renderSearchResults();
  
  // 绑定事件
  bindGeoTree();
  bindSearch();
  bindSearchCollapse();
  bindAddCountry();
  
  // 默认选中第一个国家
  if (!State.selectedCountry && !State.selectedCity && State.allCountries.length > 0) {
    State.setSelectedCountry(State.allCountries[0]);
    State.toggleCountryExpanded(State.allCountries[0].id);
    renderGeoTree();
    renderGeoDetail();
  }
}

/**
 * 绑定搜索栏折叠功能
 */
function bindSearchCollapse() {
  const container = State.pageContainer;
  
  function toggleSearch() {
    const sidebar = container.querySelector('.geo-search');
    const expandBtn = container.querySelector('#geo-search-expand');
    const chevron = container.querySelector('#geo-search-chevron');
    
    if (!sidebar || !expandBtn || !chevron) return;
    
    const collapsed = sidebar.classList.toggle('collapsed');
    chevron.textContent = collapsed ? '▶' : '◀';
    expandBtn.classList.toggle('show', collapsed);
  }
  
  // 移除旧监听器
  const toggleBtn = container.querySelector('#geo-search-toggle');
  const expandBtn = container.querySelector('#geo-search-expand');
  
  if (toggleBtn) {
    const newToggleBtn = toggleBtn.cloneNode(true);
    toggleBtn.parentNode.replaceChild(newToggleBtn, toggleBtn);
    newToggleBtn.addEventListener('click', toggleSearch);
  }
  
  if (expandBtn) {
    const newExpandBtn = expandBtn.cloneNode(true);
    expandBtn.parentNode.replaceChild(newExpandBtn, expandBtn);
    newExpandBtn.addEventListener('click', toggleSearch);
  }
}

/**
 * 绑定添加国家按钮
 */
function bindAddCountry() {
  const container = State.pageContainer;
  const addBtn = container.querySelector('#add-country-btn');
  
  if (addBtn) {
    const newBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newBtn, addBtn);
    newBtn.addEventListener('click', () => openCountryModal(null));
  }
}
