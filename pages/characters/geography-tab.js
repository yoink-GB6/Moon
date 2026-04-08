// pages/characters/geography-tab.js
// 地理标签页主控制器

import * as State from './state.js';
import { renderGeoTree, bindGeoTree } from './geo-tree.js';
import { renderGeoDetail } from './geo-detail.js';
import { openCountryModal } from './modals/country-modal.js';

export function initGeographyTab() {
  renderGeoTree();
  renderGeoDetail();
  bindGeoTree();
  bindAddCountry();

  if (!State.selectedCountry && !State.selectedCity && State.allCountries.length > 0) {
    State.setSelectedCountry(State.allCountries[0]);
    State.toggleCountryExpanded(State.allCountries[0].id);
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
