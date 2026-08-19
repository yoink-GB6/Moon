// pages/characters/geography-tab.js
// 地理标签页主控制器

import * as State from './state.js';
import { renderGeoTree } from './geo-tree.js';
import { renderGeoDetail } from './geo-detail.js';
import { openCountryModal } from './modals/country-modal.js';

export function initGeographyTab() {
  renderGeoTree();   // 内部结尾已 bindGeoTree()，此处不要再绑一次
  renderGeoDetail();
  bindAddCountry();

  // 兜底：什么都没选中时（比如刚删掉当前国家）落到第一个，随机进入由 geo.js 负责
  if (!State.selectedCountry && !State.selectedCity && State.allCountries.length > 0) {
    const first = State.allCountries[0];
    State.setSelectedCountry(first);
    if (!State.expandedCountries.has(first.id)) State.toggleCountryExpanded(first.id);
    renderGeoTree();
    renderGeoDetail();
  }
}


function bindAddCountry() {
  const container = State.pageContainer;
  const addBtn = container.querySelector('#add-country-btn');
  
  if (addBtn) {
    const newBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newBtn, addBtn);
    newBtn.addEventListener('click', () => openCountryModal(null));
  }
}
