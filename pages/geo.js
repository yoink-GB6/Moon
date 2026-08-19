// pages/geo.js
import { isEditor, onAuthChange } from '../core/auth.js';
import { escHtml } from '../core/ui.js';
import { parseHash } from '../core/router.js';

import * as State from './characters/state.js';
import { setGeoRouteApplier, navSelect, navReflect } from './characters/geo-nav.js';
import { loadAllData, subscribeRealtime, unsubscribeRealtime } from './characters/data-loader.js';
import { initGeographyTab } from './characters/geography-tab.js';
import { renderGeoTree } from './characters/geo-tree.js';
import { setupCountryModal } from './characters/modals/country-modal.js';
import { setupCityModal } from './characters/modals/city-modal.js';
import { setupLandmarkModal } from './characters/modals/landmark-modal.js';

let _unsubAuth = null;
let _dataLoaded = false;

export async function mount(container) {
  State.setPageContainer(container);
  setGeoRouteApplier(applyRoute);
  container.innerHTML = buildHTML();
  setupCountryModal();
  setupCityModal();
  setupLandmarkModal();
  bindControls();
  if (_unsubAuth) _unsubAuth();
  _unsubAuth = onAuthChange(() => { updateUI(); render(); });
  await loadAllData();
  _dataLoaded = true;
  _pickRandomCountry();
  render();
  if (_pendingRoute) { const fn = _pendingRoute; _pendingRoute = null; fn(); }
  subscribeRealtime(() => render());
  updateUI();
}

export function unmount() {
  _dataLoaded = false;
  unsubscribeRealtime();
  // 选中项存在模块级 State 里，不清掉的话下次进来还停在老地方，随机就不会发生
  State.setSelectedCountry(null);
  State.setSelectedCity(null);
  if (_unsubAuth) { _unsubAuth(); _unsubAuth = null; }
}

// 裸 #/geo 进来随机挑一个国家，免得每次都盯着同一个看腻。
// 带了 #/geo/country/3 这种深链就不动，交给 applyRoute。
function _pickRandomCountry() {
  if (parseHash().parts.length) return;
  if (State.selectedCountry || State.selectedCity) return;
  if (!State.allCountries.length) return;
  const pick = State.allCountries[Math.floor(Math.random() * State.allCountries.length)];
  State.setSelectedCountry(pick);
  if (!State.expandedCountries.has(pick.id)) State.toggleCountryExpanded(pick.id);
  navReflect();            // 地址栏跟上，但用 replace，不往历史里塞
}

// ── HTML ──────────────────────────────────────────────────────

function buildHTML() {
  return `
<div class="intro-body">
  <div class="intro-row">
  <div class="intro-main panel-inset">
    <div class="intro-content geo-layout" id="tab-geography" style="display:flex">
      <div class="geo-main">
        <div id="geo-detail-view" class="geo-detail"></div>
      </div>
      <button id="add-country-btn" style="display:none">＋ 新建国家</button>
    </div>
  </div>


  <div id="chars-panel" class="side-panel">
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
<div id="landmark-modal" class="tl-modal-overlay modal-center">
  <div class="tl-modal landmark-modal-inner" style="max-width:560px" onmousedown="event.stopPropagation()">
  </div>
</div>
`;
}

// ── 绑定 ──────────────────────────────────────────────────────

function bindControls() {
  const container = State.pageContainer;
}

// 由路由调用：#/geo/country/3 或 #/geo/city/7 → 选中并展开
export function applyRoute(parts) {
  if (!parts || !parts.length) {
    // 从 #/geo/city/7 退回裸 #/geo：回到国家视图，否则返回键看着像没反应
    if (_dataLoaded && State.selectedCity) { State.setSelectedCity(null); render(); }
    return;
  }
  const [kind, id] = parts;
  const open = () => {
    if (kind === 'country') {
      const co = State.allCountries.find(c => String(c.id) === String(id));
      if (!co) return;
      State.setSelectedCountry(co); State.setSelectedCity(null);
      if (!State.expandedCountries.has(co.id)) State.toggleCountryExpanded(co.id);
    } else if (kind === 'city') {
      const ci = State.allCities.find(c => String(c.id) === String(id));
      if (!ci) return;
      const co = State.allCountries.find(c => c.id === ci.country_id);
      State.setSelectedCity(ci);
      if (co) {
        State.setSelectedCountry(co);
        if (!State.expandedCountries.has(co.id)) State.toggleCountryExpanded(co.id);
      }
    }
    render();
  };
  if (_dataLoaded) open(); else _pendingRoute = open;
}

let _pendingRoute = null;   // 数据未到时挂起的深链动作

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
      results.innerHTML = '<div class="geo-panel-results-empty">恭喜你，哥伦布</div>';
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
      navSelect('country', hit.obj.id);
    } else if (hit.type === 'city') {
      if (!State.expandedCities.has(hit.obj.id)) State.toggleCityExpanded(hit.obj.id);
      navSelect('city', hit.obj.id);
    } else if (hit.type === 'landmark' && hit.parentCity) {
      if (!State.expandedCities.has(hit.parentCity.id)) State.toggleCityExpanded(hit.parentCity.id);
      navSelect('city', hit.parentCity.id);
    }
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
