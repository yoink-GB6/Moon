// pages/geo.js
import { isEditor, onAuthChange } from '../core/auth.js';
import { escHtml, bindPanelToggle } from '../core/ui.js';

import * as State from './characters/state.js';
import { loadAllData, subscribeRealtime, unsubscribeRealtime } from './characters/data-loader.js';
import { initGeographyTab } from './characters/geography-tab.js';
import { renderGeoTree } from './characters/geo-tree.js';
import { renderGeoDetail } from './characters/geo-detail.js';
import { setupCountryModal } from './characters/modals/country-modal.js';
import { setupCityModal } from './characters/modals/city-modal.js';
import { setupLandmarkModal } from './characters/modals/landmark-modal.js';

let _unsubAuth = null;
let _dataLoaded = false;

export async function mount(container) {
  State.setPageContainer(container);
  container.innerHTML = buildHTML();
  setupCountryModal();
  setupCityModal();
  setupLandmarkModal();
  bindControls();
  if (_unsubAuth) _unsubAuth();
  _unsubAuth = onAuthChange(() => { updateUI(); render(); });
  await loadAllData();
  _dataLoaded = true;
  render();
  subscribeRealtime(() => render());
  updateUI();
}

export function unmount() {
  _dataLoaded = false;
  unsubscribeRealtime();
  if (_unsubAuth) { _unsubAuth(); _unsubAuth = null; }
}

// ── HTML ──────────────────────────────────────────────────────

function buildHTML() {
  return `
<div class="intro-body">
  <div class="intro-row">
  <div class="intro-main">
    <div class="intro-content geo-layout" id="tab-geography" style="display:flex">
      <div class="geo-main">
        <div id="geo-detail-view" class="geo-detail"></div>
      </div>
      <button id="add-country-btn" style="display:none">＋ 新建国家</button>
    </div>
  </div>

  <button id="chars-panel-expand" class="panel-expand-trigger" title="展开面板">‹</button>

  <div id="chars-panel" class="tl-panel">
    <div class="map-panel-hdr" id="chars-panel-toggle">
      <span id="chars-panel-title">地理结构</span>
      <span id="chars-panel-chevron">‹</span>
    </div>
    <div id="panel-geo-body" class="panel-body-section">
      <div class="geo-panel-search-box">
        <div class="geo-panel-search-wrap">
          <span class="geo-panel-search-icon">⚲</span>
          <input type="text" id="geo-panel-search" placeholder="搜索国家、城市、地标..." autocomplete="off"/>
        </div>
        <div id="geo-panel-results" class="geo-panel-results"></div>
      </div>
      <div class="geo-panel-add">
        <button class="btn bn" id="panel-add-country-btn" style="display:none">＋ 新建国家</button>
      </div>
      <div id="geo-tree-list" class="geo-tree-list"></div>
    </div>
  </div>
  </div>
</div>

<!-- 国家模态框 -->
<div id="country-modal" class="tl-modal-overlay modal-center">
  <div class="tl-modal country-modal-inner" style="max-width:560px" onmousedown="event.stopPropagation()"></div>
</div>

<!-- 城市模态框 -->
<div id="city-modal" class="tl-modal-overlay modal-center">
  <div class="tl-modal city-modal-inner" style="max-width:560px" onmousedown="event.stopPropagation()">
  </div>
</div>

<!-- 地标模态框 -->
<div id="landmark-modal" class="tl-modal-overlay">
  <div class="tl-modal" style="max-width:500px" onmousedown="event.stopPropagation()">
    <h2 id="landmark-modal-title">编辑地标</h2>
    <label>名称</label><input id="landmark-name" type="text"/>
    <label>描述</label><textarea id="landmark-desc" rows="3" placeholder="地标详细介绍..."></textarea>
    <div class="modal-actions">
      <button class="btn br modal-btn-delete" id="landmark-delete-btn" style="display:none">删除</button>
      <div class="modal-actions-right">
        <button class="btn bp modal-btn" id="landmark-save-btn">保存</button>
        <button class="btn bn modal-btn" id="landmark-cancel-btn">取消</button>
      </div>
    </div>
  </div>
</div>
`;
}

// ── 绑定 ──────────────────────────────────────────────────────

function bindControls() {
  const container = State.pageContainer;
  bindPanelToggle(container, '#chars-panel', '#chars-panel-toggle', '#chars-panel-expand', '#chars-panel-chevron');
}

function render() {
  if (!_dataLoaded) return;
  initGeographyTab();
  renderGeoTree();
  _bindGeoSearch();
  _bindPanelAddCountry();
}

function updateUI() {
  const container = State.pageContainer;
  const editor = isEditor();
  const addCountryBtn = container.querySelector('#add-country-btn');
  if (addCountryBtn) addCountryBtn.style.display = 'none';
  const panelAddBtn = container.querySelector('#panel-add-country-btn');
  if (panelAddBtn) panelAddBtn.style.display = editor ? 'block' : 'none';
}

// ── 地理搜索 ──────────────────────────────────────────────────

function _descText(description) {
  if (!description) return '';
  try {
    const obj = typeof description === 'string' ? JSON.parse(description) : description;
    return JSON.stringify(obj).toLowerCase();
  } catch (_) {
    return typeof description === 'string' ? description.toLowerCase() : '';
  }
}

function _bindGeoSearch() {
  const container = State.pageContainer;
  const input   = container.querySelector('#geo-panel-search');
  const results = container.querySelector('#geo-panel-results');
  if (!input || !results) return;

  const freshInput = input.cloneNode(true);
  input.parentNode.replaceChild(freshInput, input);

  let focusedIdx = -1;
  let currentHits = [];

  function buildResults(query) {
    const q = query.trim().toLowerCase();
    if (!q) { results.classList.remove('open'); results.innerHTML = ''; currentHits = []; return; }

    const hits = [];
    State.allCountries.filter(co => co.name.toLowerCase().includes(q) || _descText(co.description).includes(q))
      .forEach(co => hits.push({ type: 'country', icon: '🏛️', label: co.name, path: '', obj: co }));
    State.allCities.filter(ci => ci.name.toLowerCase().includes(q))
      .forEach(ci => {
        const country = State.allCountries.find(co => co.id === ci.country_id);
        hits.push({ type: 'city', icon: '🏙️', label: ci.name, path: country ? country.name : '', obj: ci, parentCountry: country });
      });
    State.allLandmarks.filter(lm => lm.name.toLowerCase().includes(q) || _descText(lm.description).includes(q))
      .forEach(lm => {
        const city    = State.allCities.find(ci => ci.id === lm.city_id);
        const country = city ? State.allCountries.find(co => co.id === city.country_id) : null;
        hits.push({ type: 'landmark', icon: '🏛', label: lm.name,
          path: [country && country.name, city && city.name].filter(Boolean).join(' › '),
          obj: lm, parentCity: city, parentCountry: country });
      });

    currentHits = hits;
    focusedIdx  = -1;

    if (!hits.length) {
      results.innerHTML = '<div class="geo-panel-results-empty">无匹配结果</div>';
      results.classList.add('open');
      return;
    }

    results.innerHTML = hits.map(function(h, i) {
      return '<div class="geo-panel-result-item" data-idx="' + i + '">' +
        '<span class="geo-panel-result-icon">' + h.icon + '</span>' +
        '<span class="geo-panel-result-name">' + escHtml(h.label) + '</span>' +
        (h.path ? '<span class="geo-panel-result-path">' + escHtml(h.path) + '</span>' : '') +
      '</div>';
    }).join('');
    results.classList.add('open');

    results.querySelectorAll('.geo-panel-result-item').forEach(function(el, i) {
      el.addEventListener('mousedown', function(e) {
        e.preventDefault();
        selectHit(currentHits[i]);
        freshInput.value = '';
        results.classList.remove('open');
        results.innerHTML = '';
        currentHits = [];
      });
    });
  }

  function selectHit(hit) {
    if (!hit) return;
    if (hit.type === 'country') {
      State.setSelectedCountry(hit.obj); State.setSelectedCity(null);
      if (!State.expandedCountries.has(hit.obj.id)) State.toggleCountryExpanded(hit.obj.id);
    } else if (hit.type === 'city') {
      State.setSelectedCity(hit.obj);
      if (hit.parentCountry) { State.setSelectedCountry(hit.parentCountry); if (!State.expandedCountries.has(hit.parentCountry.id)) State.toggleCountryExpanded(hit.parentCountry.id); }
      if (State.expandedCities && !State.expandedCities.has(hit.obj.id)) State.toggleCityExpanded && State.toggleCityExpanded(hit.obj.id);
    } else if (hit.type === 'landmark') {
      if (hit.parentCity) {
        State.setSelectedCity(hit.parentCity);
        if (hit.parentCountry) { State.setSelectedCountry(hit.parentCountry); if (!State.expandedCountries.has(hit.parentCountry.id)) State.toggleCountryExpanded(hit.parentCountry.id); }
        if (State.expandedCities && !State.expandedCities.has(hit.parentCity.id)) State.toggleCityExpanded && State.toggleCityExpanded(hit.parentCity.id);
      }
    }
    renderGeoDetail();
    renderGeoTree();
  }

  freshInput.addEventListener('input', function(e) { buildResults(e.target.value); });
  freshInput.addEventListener('keydown', function(e) {
    const items = results.querySelectorAll('.geo-panel-result-item');
    if (!items.length) return;
    if      (e.key === 'ArrowDown')  { e.preventDefault(); focusedIdx = Math.min(focusedIdx + 1, items.length - 1); }
    else if (e.key === 'ArrowUp')    { e.preventDefault(); focusedIdx = Math.max(focusedIdx - 1, 0); }
    else if (e.key === 'Enter' && focusedIdx >= 0) { e.preventDefault(); items[focusedIdx].dispatchEvent(new MouseEvent('mousedown')); return; }
    else if (e.key === 'Escape')     { results.classList.remove('open'); return; }
    items.forEach(function(el, i) { el.classList.toggle('focused', i === focusedIdx); });
    if (focusedIdx >= 0) items[focusedIdx].scrollIntoView({ block: 'nearest' });
  });
  freshInput.addEventListener('blur', function() { setTimeout(function() { results.classList.remove('open'); }, 160); });
}

function _bindPanelAddCountry() {
  const container = State.pageContainer;
  const btn = container.querySelector('#panel-add-country-btn');
  if (!btn) return;
  const fresh = btn.cloneNode(true);
  btn.parentNode.replaceChild(fresh, btn);
  fresh.style.display = isEditor() ? 'block' : 'none';
  fresh.addEventListener('click', function() {
    const proxy = container.querySelector('#add-country-btn');
    if (proxy) proxy.click();
  });
}
