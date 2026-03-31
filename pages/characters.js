// pages/characters.js
import { isEditor, onAuthChange } from '../core/auth.js';
import { escHtml, bindPanelToggle } from '../core/ui.js';
import { parseAvatarUrls, pickRandomUrl } from './characters/utils.js';

import * as State from './characters/state.js';
import { loadAllData, subscribeRealtime, unsubscribeRealtime } from './characters/data-loader.js';
import { renderCharactersTab, bindCharactersTab, buildCharCardHTML, bindCharCard } from './characters/characters-tab.js';
import { initGeographyTab } from './characters/geography-tab.js';
import { renderGeoTree } from './characters/geo-tree.js';
import { renderGeoDetail } from './characters/geo-detail.js';
import { setupCharModal } from './characters/modals/character-modal.js';
import { setupCountryModal } from './characters/modals/country-modal.js';
import { setupCityModal } from './characters/modals/city-modal.js';
import { setupLandmarkModal } from './characters/modals/landmark-modal.js';


let _unsubAuth = null;
let _dataLoaded = false;

export async function mount(container) {
  State.setCurrentTab('characters'); // 每次挂载重置为默认 tab，防止上次状态污染
  State.setPageContainer(container);
  container.innerHTML = buildHTML();
  setupCharModal();
  setupCountryModal();
  setupCityModal();
  setupLandmarkModal();
  bindControls();
  if (_unsubAuth) _unsubAuth(); // 防止重复注册
  _unsubAuth = onAuthChange(() => { updateUI(); renderCurrentTab(); });
  await loadAllData();
  _dataLoaded = true;
  renderCurrentTab();
  subscribeRealtime(() => renderCurrentTab());
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
  <div class="intro-tabs">
    <button class="intro-tab active" data-tab="characters"><span class="tab-label">人物介绍</span></button>
    <button class="intro-tab" data-tab="geography"><span class="tab-label">国家介绍</span></button>
  </div>
  <div class="intro-row">
  <div class="intro-main">

    <div class="intro-content" id="tab-characters">
      <div class="intro-header">
        <button class="btn bp" id="chars-add-btn" style="display:none">＋ 新建</button>
      </div>
      <div class="intro-grid" id="chars-grid"></div>
    </div>

    <div class="intro-content geo-layout" id="tab-geography" style="display:none">
      <div class="geo-main">
        <div id="geo-detail-view" class="geo-detail"></div>
      </div>
      <button id="add-country-btn" style="display:none">＋ 新建国家</button>
    </div>
  </div><!-- /intro-main -->

  <!-- 右侧面板展开按钮（panel外，不受overflow:hidden影响）-->
  <button id="chars-panel-expand" class="panel-expand-trigger" title="展开面板">‹</button>

  <!-- 右侧面板 -->
  <div id="chars-panel" class="tl-panel">
    <div class="map-panel-hdr" id="chars-panel-toggle">
      <span id="chars-panel-title">人物列表</span>
      <span id="chars-panel-chevron">‹</span>
    </div>

    <!-- 人物标签页 -->
    <div id="panel-chars-body" class="panel-body-section">
      <div class="panel-search-box">
        <div class="panel-search-wrap">
          <input type="text" id="chars-panel-search" placeholder="输入国家/城市/名字搜索..." autocomplete="off"/>
          <button id="chars-search-clear" class="panel-search-clear" title="清除">✕</button>
        </div>
      </div>
      <div id="chars-panel-list" class="tl-clist"></div>
    </div>

    <!-- 地理标签页：搜索框+下拉结果+三级树 -->
    <div id="panel-geo-body" class="panel-body-section" style="display:none">
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
  </div><!-- /tl-panel -->
  </div><!-- /intro-row -->
</div><!-- /intro-body -->

<!-- 人物模态框 -->
<div id="char-modal" class="tl-modal-overlay modal-center">
  <div class="tl-modal char-modal-box" onmousedown="event.stopPropagation()">
    <h2 id="char-modal-title">编辑人物</h2>
    <label>名字</label><input id="char-name" type="text"/>
    <label>年龄</label><input id="char-age" type="number" min="0" placeholder="0"/>
    <label>所属国家 / 势力</label><div class="tl-select" id="char-country-select"><div class="tl-select-trigger"><span class="tl-select-val">无</span><span class="tl-select-arrow">▾</span></div><div class="tl-select-dropdown"></div></div><input type="hidden" id="char-country"/><label>所属城市</label><div class="tl-select" id="char-city-select"><div class="tl-select-trigger"><span class="tl-select-val">无</span><span class="tl-select-arrow">▾</span></div><div class="tl-select-dropdown"></div></div><input type="hidden" id="char-city"/>
    <div id="char-sec-container"></div>
    <label>图片</label>
    <div id="char-images-section" style="margin-bottom:16px">
      <div id="char-images-grid" class="char-images-grid"></div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn bn" id="char-upload-btn">📁 上传</button>
        <button class="btn bn" id="char-url-btn">🔗 URL</button>
      </div>
      <input type="file" id="char-file-input" accept="image/*" multiple style="display:none"/>
      <div id="char-url-row" style="display:none;margin-top:8px">
        <div style="display:flex;gap:6px">
          <input id="char-url-input" type="url" placeholder="https://..." style="flex:1"/>
          <button class="btn bn" id="char-url-confirm">添加</button>
        </div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn br modal-btn-delete" id="char-delete-btn" style="display:none">删除</button>
      <div class="modal-actions-right">
        <button class="btn bp modal-btn" id="char-save-btn">保存</button>
        <button class="btn bn modal-btn" id="char-cancel-btn">取消</button>
      </div>
    </div>
  </div>
</div>

<!-- 国家模态框（内容由 country-modal.js 动态填充）-->
<div id="country-modal" class="tl-modal-overlay modal-center">
  <div class="tl-modal country-modal-inner" style="max-width:560px" onmousedown="event.stopPropagation()"></div>
</div>

<!-- 城市模态框 -->
<div id="city-modal" class="tl-modal-overlay modal-center">
  <div class="tl-modal city-modal-inner" style="max-width:560px" onmousedown="event.stopPropagation()">
    <!-- 内容由 city-modal.js 动态填充 -->
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

// ── 컨트롤 바인딩 ──────────────────────────────────────────────

function bindControls() {
  const container = State.pageContainer;

  container.querySelectorAll('.intro-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  const clearBtn = container.querySelector('#chars-search-clear');
  if (clearBtn) clearBtn.addEventListener('click', () => _filterCharGrid(null));

  bindCharactersTab();
  bindSidePanel();
}

function bindSidePanel() {
  const container = State.pageContainer;
  bindPanelToggle(container, '#chars-panel', '#chars-panel-toggle', '#chars-panel-expand', '#chars-panel-chevron');

  // 人物搜索
  const searchInput = container.querySelector('#chars-panel-search');
  const searchClear  = container.querySelector('#chars-search-clear');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (searchClear) searchClear.style.display = q ? 'block' : 'none';
      // 清空筛选（如果有）
      _filterCharGrid(null);
      renderPanelList(q);
    });
  }
  if (searchClear) {
    searchClear.addEventListener('click', () => {
      if (searchInput) { searchInput.value = ''; searchInput.focus(); }
      searchClear.style.display = 'none';
      _filterCharGrid(null);
      renderPanelList('');
    });
  }
}

// ── 탭 전환 ────────────────────────────────────────────────────

function switchTab(tabName) {
  const container = State.pageContainer;
  State.setCurrentTab(tabName);

  // 人物筛选 reset
  const clearBtn = container.querySelector('#chars-search-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  container.querySelectorAll('#chars-panel-list .tl-ci').forEach(el => el.classList.remove('active-item'));

  container.querySelectorAll('.intro-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  const charsContent = container.querySelector('#tab-characters');
  const geoContent   = container.querySelector('#tab-geography');
  if (charsContent) charsContent.style.display = tabName === 'characters' ? 'block'  : 'none';
  if (geoContent)   geoContent.style.display   = tabName === 'geography'  ? 'flex'   : 'none';

  syncPanelHeader(tabName);
  renderCurrentTab();
}

function syncPanelHeader(tabName) {
  const container  = State.pageContainer;
  const title      = container.querySelector('#chars-panel-title');
  const charsBody  = container.querySelector('#panel-chars-body');
  const geoBody    = container.querySelector('#panel-geo-body');
  const searchInput = container.querySelector('#chars-panel-search');

  if (tabName === 'characters') {
    if (title)      title.textContent = '人物列表';
    if (charsBody)  charsBody.style.display = 'flex';
    if (geoBody)    geoBody.style.display   = 'none';
    if (searchInput) searchInput.value = '';
    renderPanelList('');
  } else {
    if (title)     title.textContent = '地理结构';
    if (charsBody) charsBody.style.display = 'none';
    if (geoBody)   geoBody.style.display   = 'flex';
  }
}

// 模块级头像缓存，同一次渲染内卡片和侧边栏共用同一张图
let _avatarCache = new Map();

function _buildAvatarCache() {
  _avatarCache = new Map();
  State.allChars.forEach(function(c) {
    _avatarCache.set(c.id, pickRandomUrl(parseAvatarUrls(c.avatar_url)));
  });
}

function renderCurrentTab() {
  if (!_dataLoaded) return;
  const container = State.pageContainer;
  if (State.currentTab === 'characters') {
    _buildAvatarCache();
    renderCharactersTab(_avatarCache);
    const searchInput = container.querySelector('#chars-panel-search');
    renderPanelList(searchInput?.value?.trim().toLowerCase() || '');
  } else if (State.currentTab === 'geography') {
    initGeographyTab();
    renderGeoTree();
    _bindGeoSearch();
    _bindPanelAddCountry();
  }
}

// ── 인물 패널 ──────────────────────────────────────────────────

export function renderPanelList(query) {
  const container = State.pageContainer;
  const list = container.querySelector('#chars-panel-list');
  if (!list) return;
  _renderCharPanel(list, query, _avatarCache);
}

// 供 character-modal 在保存/删除后调用，重建缓存后刷新卡片和侧边栏
export function refreshCharactersView() {
  if (State.currentTab !== 'characters') return;
  _buildAvatarCache();
  renderCharactersTab(_avatarCache);
  const container = State.pageContainer;
  const searchInput = container.querySelector('#chars-panel-search');
  renderPanelList(searchInput?.value?.trim().toLowerCase() || '');
}

function _renderCharPanel(list, query, avatarCache) {
  const chars = query
    ? State.allChars.filter(function(c) {
        if (c.name.toLowerCase().includes(query)) return true;
        const city    = State.allCities.find(function(ci) { return ci.id === c.city_id; });
        const country = city ? State.allCountries.find(function(co) { return co.id === city.country_id; }) : null;
        if (city    && city.name.toLowerCase().includes(query))    return true;
        if (country && country.name.toLowerCase().includes(query)) return true;
        return false;
      })
    : [...State.allChars];

  if (!chars.length) {
    list.innerHTML = '<div class="tl-empty">' + (query ? '无匹配人物' : '暂无人物') + '</div>';
    return;
  }

  list.innerHTML = chars.map(function(c) {
    const city    = State.allCities.find(function(ci) { return ci.id === c.city_id; });
    const country = city ? State.allCountries.find(function(co) { return co.id === city.country_id; }) : null;
    const location = [country && country.name, city && city.name].filter(Boolean).join(' › ');
    const ageStr   = (c.base_age != null && c.base_age !== '') ? String(c.base_age) : '';
    const meta     = [ageStr ? ageStr + '岁' : '', location].filter(Boolean).join(' · ');
    const avatarUrl = (avatarCache && avatarCache.has(c.id)) ? avatarCache.get(c.id) : pickRandomUrl(parseAvatarUrls(c.avatar_url));
    const av = avatarUrl
      ? '<div class="tl-ci-av"><img src="' + escHtml(avatarUrl) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/></div>'
      : '<div class="tl-ci-av">' + escHtml(c.name.charAt(0).toUpperCase()) + '</div>';
    return '<div class="tl-ci" data-char-id="' + c.id + '">' +
      av + '<div class="tl-ci-info">' +
        '<div class="tl-cname">' + escHtml(c.name) + '</div>' +
        (meta ? '<div class="tl-cmeta">' + escHtml(meta) + '</div>' : '') +
      '</div></div>';
  }).join('');

  list.querySelectorAll('.tl-ci[data-char-id]').forEach(function(item) {
    item.addEventListener('click', function() {
      const id = parseInt(item.dataset.charId);
      list.querySelectorAll('.tl-ci').forEach(function(el) { el.classList.remove('active-item'); });
      item.classList.add('active-item');
      _filterCharGrid(id);
    });
  });
}

function _filterCharGrid(charId) {
  const container = State.pageContainer;
  const clearBtn  = container.querySelector('#chars-search-clear');

  if (charId == null) {
    if (clearBtn) clearBtn.style.display = 'none';
    container.querySelectorAll('#chars-panel-list .tl-ci').forEach(function(el) { el.classList.remove('active-item'); });
    renderCharactersTab(_avatarCache);
    return;
  }

  if (clearBtn) clearBtn.style.display = 'block';
  const char = State.allChars.find(function(c) { return c.id === charId; });
  if (!char) return;
  const grid = container.querySelector('#chars-grid');
  if (!grid) return;

  const avatarUrl = (_avatarCache && _avatarCache.has(char.id))
    ? _avatarCache.get(char.id)
    : pickRandomUrl(parseAvatarUrls(char.avatar_url));

  grid.innerHTML = buildCharCardHTML(char, avatarUrl);
  const card = grid.querySelector('.intro-card');
  if (card) bindCharCard(card, char);
}

// ── 지리 검색 ──────────────────────────────────────────────────

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
    State.allCountries.filter(co => co.name.toLowerCase().includes(q))
      .forEach(co => hits.push({ type: 'country', icon: '🏛️', label: co.name, path: '', obj: co }));
    State.allCities.filter(ci => ci.name.toLowerCase().includes(q))
      .forEach(ci => {
        const country = State.allCountries.find(co => co.id === ci.country_id);
        hits.push({ type: 'city', icon: '🏙️', label: ci.name, path: country ? country.name : '', obj: ci, parentCountry: country });
      });
    State.allLandmarks.filter(lm => lm.name.toLowerCase().includes(q))
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

// ── UI 업데이트 ────────────────────────────────────────────────

function updateUI() {
  const container = State.pageContainer;
  const editor = isEditor();
  const addBtn = container.querySelector('#chars-add-btn');
  if (addBtn) addBtn.style.display = editor ? 'block' : 'none';
  const addCountryBtn = container.querySelector('#add-country-btn');
  if (addCountryBtn) addCountryBtn.style.display = 'none';
  const panelAddBtn = container.querySelector('#panel-add-country-btn');
  if (panelAddBtn) panelAddBtn.style.display = (editor && State.currentTab === 'geography') ? 'block' : 'none';
  syncPanelHeader(State.currentTab);
}
