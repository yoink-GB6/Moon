// pages/characters.js
import { isEditor, onAuthChange } from '../core/auth.js';
import { escHtml } from '../core/ui.js';
import { parseAvatarUrls, pickRandomUrl } from './characters/utils.js';

import * as State from './characters/state.js';
import { loadAllData, subscribeRealtime, unsubscribeRealtime } from './characters/data-loader.js';
import { renderCharactersTab, bindCharactersTab, buildCharCardHTML, bindCharCard } from './characters/characters-tab.js';
import { setupCharModal, openImageManager } from './characters/modals/character-modal.js';
import { openCharReadonly } from './characters/modals/char-readonly-modal.js';
import { reflect } from '../core/router.js';

let _unsubAuth = null;
let _dataLoaded = false;

export async function mount(container) {
  State.setPageContainer(container);
  container.innerHTML = buildHTML();
  setupCharModal();
  bindControls();
  if (_unsubAuth) _unsubAuth();
  _unsubAuth = onAuthChange(() => { updateUI(); render(); });
  await loadAllData();
  _dataLoaded = true;
  render();
  if (_pendingRoute) { const fn = _pendingRoute; _pendingRoute = null; fn(); }
  subscribeRealtime(() => render());
  updateUI();
}

// 由路由调用：#/characters/45 → 打开 45 号的详情弹窗
export function applyRoute(parts) {
  const id = parts && parts[0];
  if (!id) {
    document.querySelector('#char-readonly-modal')?.classList.remove('show');
    return;
  }
  const open = () => {
    const char = State.allChars.find(c => String(c.id) === String(id));
    if (char) openCharReadonly(char);
  };
  if (_dataLoaded) open(); else _pendingRoute = open;
}

let _pendingRoute = null;   // 数据未到时挂起的深链动作

export function unmount() {
  _dataLoaded = false;
  _pendingRoute = null;
  unsubscribeRealtime();
  if (_unsubAuth) { _unsubAuth(); _unsubAuth = null; }
}

// ── HTML ──────────────────────────────────────────────────────

function buildHTML() {
  return `
<div class="intro-body">
  <div class="intro-row">
  <div class="intro-main panel-inset">
    <div class="intro-content" id="tab-characters">
      <div class="intro-grid" id="chars-grid"></div>
    </div>
  </div>


  <div id="chars-panel" class="side-panel">
    <div class="lib-actions" id="chars-actions" style="display:none">
      <button id="chars-add-btn">＋ 新建</button>
      <button id="chars-img-mgr-btn">图库管理</button>
    </div>
    <div id="panel-chars-body" class="panel-body-section">
      <div class="panel-search-box">
        <div class="panel-search-wrap">
          <input type="text" id="chars-panel-search" placeholder="输入国家/城市/名字搜索..." autocomplete="off"/>
          <button id="chars-search-clear" class="panel-search-clear" title="清除">✕</button>
        </div>
      </div>
      <div id="chars-panel-list" class="tl-clist"></div>
    </div>
  </div>
  </div>
</div>

<!-- 人物模态框 -->
<div id="char-modal" class="tl-modal-overlay modal-center">
  <div class="tl-modal char-modal-box" onmousedown="event.stopPropagation()">
    <h2 id="char-modal-title">编辑人物</h2>
    <label>名字</label><input id="char-name" type="text"/>
    <label>年龄</label><input id="char-age" type="number" min="0" placeholder="0"/>
    <label>链接</label><input id="char-link" type="text" placeholder="[名称](https://...) [名称2](https://...)"/>
    <label>所属国家 / 势力</label><div class="tl-select" id="char-country-select"><div class="tl-select-trigger"><span class="tl-select-val">无</span><span class="tl-select-arrow">▾</span></div><div class="tl-select-dropdown"></div></div><input type="hidden" id="char-country"/><label>所属城市</label><div class="tl-select" id="char-city-select"><div class="tl-select-trigger"><span class="tl-select-val">无</span><span class="tl-select-arrow">▾</span></div><div class="tl-select-dropdown"></div></div><input type="hidden" id="char-city"/>
    <label>自定义 HTML（填写后弹窗整体由它渲染，留空则用下面的小节）</label>
    <textarea id="char-html" rows="8" placeholder="&lt;div&gt;…&lt;/div&gt;"></textarea>
    <div id="char-sec-container"></div>
    <label>人物关系</label>
    <div id="char-rel-section" style="margin-bottom:16px">
      <div id="char-rel-list" class="cm-list"></div>
      <div class="char-rel-add">
        <div class="rel-pick"><input id="char-rel-target" type="text" placeholder="输入名字搜索…" autocomplete="off"/><div class="cb-sugg"></div></div>
        <input id="char-rel-label" type="text" placeholder="关系（如：师徒）" autocomplete="off"/>
        <button class="btn bn" id="char-rel-add-btn">添加</button>
      </div>
    </div>
    <label>图片</label>
    <div id="char-images-section" style="margin-bottom:16px">
      <div id="char-images-grid" class="char-images-grid"></div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn bn" id="char-library-btn">🖼 图库</button>
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
`;
}

// ── 绑定 ──────────────────────────────────────────────────────

function bindControls() {
  const container = State.pageContainer;
  bindCharactersTab();
  bindSidePanel();
  container.querySelector('#chars-img-mgr-btn')?.addEventListener('click', () => openImageManager());
}

function bindSidePanel() {
  const container = State.pageContainer;
  const searchInput = container.querySelector('#chars-panel-search');
  const searchClear  = container.querySelector('#chars-search-clear');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (searchClear) searchClear.style.display = q ? 'block' : 'none';
      _geoFilter = null;
      _picked.clear(); _filterCharGrid();
      renderPanelList(q);
    });
  }
  if (searchClear) {
    searchClear.addEventListener('click', () => {
      if (searchInput) { searchInput.value = ''; searchInput.focus(); }
      searchClear.style.display = 'none';
      _geoFilter = null;
      _picked.clear(); _filterCharGrid();
      renderPanelList('');
    });
  }
}

let _geoFilter = null;          // { type: 'country'|'city', id }
const _picked = new Set();      // 右侧栏累加选中的人物 id，空集合=显示全部


function _filterCharGridByGeo() {
  const container = State.pageContainer;
  const grid = container.querySelector('#chars-grid');
  if (!grid) return;

  if (!_geoFilter) { renderCharactersTab(_avatarCache); return; }

  let chars;
  if (_geoFilter.type === 'city') {
    chars = State.allChars.filter(c => c.city_id === _geoFilter.id);
  } else {
    const cityIds = new Set(State.allCities.filter(c => c.country_id === _geoFilter.id).map(c => c.id));
    chars = State.allChars.filter(c => c.country_id === _geoFilter.id || cityIds.has(c.city_id));
  }

  if (!chars.length) { grid.innerHTML = '<div class="intro-empty">wandering……</div>'; return; }
  grid.innerHTML = chars.map(char => {
    const avatarUrl = _avatarCache.get(char.id) || pickRandomUrl(parseAvatarUrls(char.avatar_url));
    return buildCharCardHTML(char, avatarUrl);
  }).join('');
  grid.querySelectorAll('.intro-card').forEach(card => {
    const char = State.allChars.find(c => c.id === parseInt(card.dataset.id));
    if (char) bindCharCard(card, char);
  });
}

// 模块级头像缓存
let _avatarCache = new Map();

function _buildAvatarCache() {
  _avatarCache = new Map();
  State.allChars.forEach(function(c) {
    _avatarCache.set(c.id, pickRandomUrl(parseAvatarUrls(c.avatar_url)));
  });
}

function render() {
  if (!_dataLoaded) return;
  const container = State.pageContainer;
  _buildAvatarCache();
  renderCharactersTab(_avatarCache);
  const searchInput = container.querySelector('#chars-panel-search');
  renderPanelList(searchInput?.value?.trim().toLowerCase() || '');
}

// ── 人物面板 ──────────────────────────────────────────────────

export function renderPanelList(query) {
  const container = State.pageContainer;
  const list = container.querySelector('#chars-panel-list');
  if (!list) return;
  _renderCharPanel(list, query, _avatarCache);
}

export function refreshCharactersView() {
  _buildAvatarCache();
  renderCharactersTab(_avatarCache);
  const container = State.pageContainer;
  const searchInput = container.querySelector('#chars-panel-search');
  renderPanelList(searchInput?.value?.trim().toLowerCase() || '');
}

function _descText(description) {
  if (!description) return '';
  try {
    const obj = typeof description === 'string' ? JSON.parse(description) : description;
    return JSON.stringify(obj).toLowerCase();
  } catch (_) {
    return typeof description === 'string' ? description.toLowerCase() : '';
  }
}

function _renderCharPanel(list, query, avatarCache) {
  // 搜索匹配的国家/城市，置顶作为可点击的地理条目
  const geoItems = [];
  if (query) {
    State.allCountries.forEach(function(co) {
      if (co.name.toLowerCase().includes(query))
        geoItems.push({ type: 'country', id: co.id, name: co.name, sub: '国家' });
    });
    State.allCities.forEach(function(ci) {
      if (ci.name.toLowerCase().includes(query)) {
        const co = State.allCountries.find(function(c) { return c.id === ci.country_id; });
        geoItems.push({ type: 'city', id: ci.id, name: ci.name, sub: co ? co.name : '城市' });
      }
    });
  }

  const chars = query
    ? State.allChars.filter(function(c) {
        if (c.name.toLowerCase().includes(query)) return true;
        const city    = c.city_id    ? State.allCities.find(function(ci) { return ci.id === c.city_id; })    : null;
        const country = c.country_id ? State.allCountries.find(function(co) { return co.id === c.country_id; })
                      : (city        ? State.allCountries.find(function(co) { return co.id === city.country_id; }) : null);
        if (city    && city.name.toLowerCase().includes(query))    return true;
        if (country && country.name.toLowerCase().includes(query)) return true;
        if (_descText(c.description).includes(query))              return true;
        return false;
      })
    : [...State.allChars];

  if (!geoItems.length && !chars.length) {
    list.innerHTML = '<div class="tl-empty">' + (query ? '恭喜你，哥伦布' : 'wandering……') + '</div>';
    return;
  }

  const geoHTML = geoItems.map(function(g) {
    return '<div class="tl-ci tl-ci-geo" data-geo-type="' + g.type + '" data-geo-id="' + g.id + '">' +
      '<div class="tl-ci-av tl-ci-geo-av">◎</div>' +
      '<div class="tl-ci-info">' +
        '<div class="tl-cname">' + escHtml(g.name) + '</div>' +
        '<div class="tl-cmeta">' + escHtml(g.sub) + ' · 点击筛选</div>' +
      '</div></div>';
  }).join('');

  list.innerHTML = geoHTML + chars.map(function(c) {
    const city    = c.city_id    ? State.allCities.find(function(ci) { return ci.id  === c.city_id;    }) : null;
    // country_id 为空时回退到城市所属国家，和上面搜索过滤器保持一致
    const country = c.country_id ? State.allCountries.find(function(co) { return co.id === c.country_id; })
                  : (city        ? State.allCountries.find(function(co) { return co.id === city.country_id; }) : null);
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

  // 人物条目是累加多选：点一个加一个，再点同一个取消
  list.querySelectorAll('.tl-ci[data-char-id]').forEach(function(item) {
    item.addEventListener('click', function() {
      const id = parseInt(item.dataset.charId);
      _geoFilter = null;
      if (_picked.has(id)) _picked.delete(id); else _picked.add(id);
      _syncPickedMarks();
      _filterCharGrid();
    });
  });

  // 地理条目仍是单选（换一个地方就是换一批人）
  list.querySelectorAll('.tl-ci-geo').forEach(function(item) {
    item.addEventListener('click', function() {
      _picked.clear();
      list.querySelectorAll('.tl-ci').forEach(function(el) { el.classList.remove('active-item'); });
      item.classList.add('active-item');
      _geoFilter = { type: item.dataset.geoType, id: parseInt(item.dataset.geoId) };
      _filterCharGridByGeo();
    });
  });

  _syncPickedMarks();
}

function _syncPickedMarks() {
  const container = State.pageContainer;
  container.querySelectorAll('#chars-panel-list .tl-ci[data-char-id]').forEach(function(el) {
    el.classList.toggle('active-item', _picked.has(parseInt(el.dataset.charId)));
  });
}

// 按 _picked 里选中的人渲染主区；空集合 = 显示全部
function _filterCharGrid() {
  const container = State.pageContainer;
  const grid = container.querySelector('#chars-grid');
  if (!grid) return;

  if (!_picked.size) { renderCharactersTab(_avatarCache); return; }

  const chars = State.allChars.filter(function(c) { return _picked.has(c.id); });
  grid.innerHTML = chars.map(function(char) {
    const avatarUrl = (_avatarCache && _avatarCache.has(char.id))
      ? _avatarCache.get(char.id)
      : pickRandomUrl(parseAvatarUrls(char.avatar_url));
    return buildCharCardHTML(char, avatarUrl);
  }).join('');
  grid.querySelectorAll('.intro-card').forEach(function(card) {
    const char = State.allChars.find(function(c) { return c.id === parseInt(card.dataset.id); });
    if (char) bindCharCard(card, char);
  });
}

// ── UI ────────────────────────────────────────────────────────

function updateUI() {
  const container = State.pageContainer;
  const editor = isEditor();
  // 两个按钮整条一起显隐（在右侧栏顶部，和 library 的排序/新建同款）
  const actions = container.querySelector('#chars-actions');
  if (actions) actions.style.display = editor ? '' : 'none';
}
