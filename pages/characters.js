// pages/characters.js
// 主入口文件 - 协调所有模块

import { isEditor, onAuthChange } from '../core/auth.js';
import { escHtml } from '../core/ui.js';
import * as State from './characters/state.js';
import { loadAllData, subscribeRealtime, unsubscribeRealtime } from './characters/data-loader.js';
import { renderCharactersTab, bindCharactersTab } from './characters/characters-tab.js';
import { initGeographyTab } from './characters/geography-tab.js';
import { renderGeoTree } from './characters/geo-tree.js';
import { renderGeoDetail } from './characters/geo-detail.js';
import { openCharModal } from './characters/modals/character-modal.js';
import { setupCharModal } from './characters/modals/character-modal.js';
import { setupCountryModal } from './characters/modals/country-modal.js';
import { setupCityModal } from './characters/modals/city-modal.js';
import { setupLandmarkModal } from './characters/modals/landmark-modal.js';

export async function mount(container) {
  State.setPageContainer(container);
  container.innerHTML = buildHTML();

  setupCharModal();
  setupCountryModal();
  setupCityModal();
  setupLandmarkModal();

  bindControls();

  onAuthChange(() => {
    updateUI();
    renderCurrentTab();
  });

  await loadAllData();
  renderCurrentTab();
  subscribeRealtime(() => renderCurrentTab());
  updateUI();
}

export function unmount() {
  unsubscribeRealtime();
}

function buildHTML() {
  return `
<div class="intro-page">
  <div class="intro-tabs">
    <button class="intro-tab active" data-tab="characters">
      <span class="tab-icon">👥</span>
      <span class="tab-label">人物介绍</span>
    </button>
    <button class="intro-tab" data-tab="geography">
      <span class="tab-icon">🏛️</span>
      <span class="tab-label">国家及势力</span>
    </button>
  </div>

  <div class="intro-body">
    <!-- 主内容区 -->
    <div class="intro-main">
      <div class="intro-content" id="tab-characters">
        <div class="intro-header">
          <button class="btn bp" id="chars-add-btn" style="display:none">＋ 新建</button>
        </div>
        <div class="intro-grid" id="chars-grid"></div>
      </div>

      <div class="intro-content geo-layout" id="tab-geography" style="display:none">
        <div class="geo-sidebar geo-tree">
          <div class="geo-tree-header">
            <h3>地理结构</h3>
            <button class="btn bn" id="add-country-btn" style="display:none">＋</button>
          </div>
          <div id="geo-tree-list" class="geo-tree-list"></div>
        </div>
        <div class="geo-main">
          <div id="geo-detail-view" class="geo-detail"></div>
        </div>
      </div>
    </div>

    <!-- 右侧面板：人物页=搜索人物，地理页=搜索地名 -->
    <div id="chars-panel" class="tl-panel">
      <button id="chars-panel-expand" class="expand-btn-float" title="展开面板">◀</button>
      <div class="map-panel-hdr" id="chars-panel-toggle">
        <span id="chars-panel-title">🔍 搜索人物</span>
        <span id="chars-panel-chevron">◀</span>
      </div>
      <div class="panel-search-box">
        <input type="text" id="chars-panel-search" placeholder="输入名字搜索..." autocomplete="off"/>
      </div>
      <div id="chars-panel-list" class="tl-clist"></div>
    </div>
  </div>
</div>

<!-- 人物模态框 -->
<div id="char-modal" class="tl-modal-overlay">
  <div class="tl-modal" style="max-width:500px" onmousedown="event.stopPropagation()">
    <h2 id="char-modal-title">编辑人物</h2>
    <label>名字</label>
    <input id="char-name" type="text"/>
    <label>年龄</label>
    <input id="char-age" type="number" min="0" max="999" placeholder="年龄"/>
    <label>所属城市</label>
    <div class="modal-select-wrap">
      <select id="char-city"><option value="">无</option></select>
      <span class="modal-select-arrow">▼</span>
    </div>
    <label>描述</label>
    <textarea id="char-desc" rows="3"></textarea>
    <label>头像</label>
    <div class="avatar-row">
      <div id="char-avatar-preview" class="avatar-preview">
        <span id="char-avatar-letter">?</span>
      </div>
      <div class="avatar-btns">
        <button class="btn bn" id="char-upload-btn">📁 上传</button>
        <button class="btn bn" id="char-url-btn">🔗 URL</button>
      </div>
      <input type="file" id="char-file-input" accept="image/*" style="display:none"/>
    </div>
    <div id="char-url-row" class="url-input-row" style="display:none">
      <span class="url-input-icon">🔗</span>
      <input id="char-url-input" type="url" placeholder="粘贴图片链接 https://..."/>
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

<!-- 国家模态框 -->
<div id="country-modal" class="tl-modal-overlay">
  <div class="tl-modal" style="max-width:500px" onmousedown="event.stopPropagation()">
    <h2 id="country-modal-title">编辑国家</h2>
    <label>名称</label>
    <input id="country-name" type="text"/>
    <label>描述</label>
    <textarea id="country-desc" rows="3"></textarea>
    <div class="modal-actions">
      <button class="btn br modal-btn-delete" id="country-delete-btn" style="display:none">删除</button>
      <div class="modal-actions-right">
        <button class="btn bp modal-btn" id="country-save-btn">保存</button>
        <button class="btn bn modal-btn" id="country-cancel-btn">取消</button>
      </div>
    </div>
  </div>
</div>

<!-- 城市模态框 -->
<div id="city-modal" class="tl-modal-overlay">
  <div class="tl-modal" style="max-width:500px" onmousedown="event.stopPropagation()">
    <h2 id="city-modal-title">编辑城市</h2>
    <label>名称</label>
    <input id="city-name" type="text"/>
    <label>所属国家</label>
    <div class="modal-select-wrap">
      <select id="city-country"><option value="">无</option></select>
      <span class="modal-select-arrow">▼</span>
    </div>
    <label>概述</label>
    <textarea id="city-overview" rows="2" placeholder="城市总体介绍..."></textarea>
    <label>地理位置</label>
    <textarea id="city-geography" rows="2" placeholder="地理坐标、地形特征..."></textarea>
    <label>气候</label>
    <textarea id="city-climate" rows="2" placeholder="气候类型、季节特点..."></textarea>
    <label>城市结构</label>
    <textarea id="city-structure" rows="2" placeholder="城区划分、建筑风格..."></textarea>
    <div class="modal-actions">
      <button class="btn br modal-btn-delete" id="city-delete-btn" style="display:none">删除</button>
      <div class="modal-actions-right">
        <button class="btn bp modal-btn" id="city-save-btn">保存</button>
        <button class="btn bn modal-btn" id="city-cancel-btn">取消</button>
      </div>
    </div>
  </div>
</div>

<!-- 地标模态框 -->
<div id="landmark-modal" class="tl-modal-overlay">
  <div class="tl-modal" style="max-width:500px" onmousedown="event.stopPropagation()">
    <h2 id="landmark-modal-title">编辑地标</h2>
    <label>名称</label>
    <input id="landmark-name" type="text"/>
    <label>描述</label>
    <textarea id="landmark-desc" rows="3" placeholder="地标详细介绍..."></textarea>
    <div class="modal-actions">
      <button class="btn br modal-btn-delete" id="landmark-delete-btn" style="display:none">删除</button>
      <div class="modal-actions-right">
        <button class="btn bp modal-btn" id="landmark-save-btn">保存</button>
        <button class="btn bn modal-btn" id="landmark-cancel-btn">取消</button>
      </div>
    </div>
  </div>
</div>

<style>
/* ===== 页面结构 ===== */
.intro-page{height:100%;display:flex;flex-direction:column;overflow:hidden}
.intro-tabs{display:flex;gap:4px;padding:16px 20px 0 20px;border-bottom:2px solid var(--border);flex-shrink:0}
.intro-tab{display:flex;align-items:center;gap:8px;padding:12px 24px;border:none;background:transparent;color:var(--muted);cursor:pointer;position:relative;transition:all 0.2s}
.intro-tab:hover{color:var(--text);background:rgba(124,131,247,0.05)}
.intro-tab.active{color:var(--accent)}
.intro-tab.active::after{content:'';position:absolute;bottom:-2px;left:0;right:0;height:2px;background:var(--accent)}
.intro-body{flex:1;display:flex;overflow:hidden}
.intro-main{flex:1;overflow:hidden;display:flex;flex-direction:column;min-width:0}
.intro-content{flex:1;overflow-y:auto;padding:20px}
.intro-header{display:flex;justify-content:space-between;margin-bottom:20px;align-items:center}
.intro-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
.intro-card{background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:16px;cursor:pointer;transition:all 0.2s}
.intro-card:hover{box-shadow:0 4px 12px rgba(0,0,0,0.08);border-color:var(--accent)}
.intro-avatar{width:60px;height:60px;border-radius:50%;background:var(--accent);color:white;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:600;overflow:hidden;flex-shrink:0}
.intro-avatar img{width:100%;height:100%;object-fit:cover}

/* ===== 地理布局 ===== */
.geo-layout{display:flex;gap:0;padding:0;overflow:hidden;flex:1}
.geo-sidebar{width:280px;background:var(--bg);display:flex;flex-direction:column;overflow:hidden;border-right:1px solid var(--border);flex-shrink:0}
.geo-main{flex:1;overflow-y:auto;padding:24px}
.geo-tree-header{padding:16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center}
.geo-tree-header h3{margin:0;font-size:14px;font-weight:600}
.geo-tree-list{flex:1;overflow-y:auto;padding:8px}
.geo-tree-item{padding:8px 12px;margin:2px 0;cursor:pointer;border-radius:6px;user-select:none;display:flex;justify-content:space-between;align-items:center}
.geo-tree-item:hover{background:rgba(124,131,247,0.08)}
.geo-tree-item.active{background:rgba(124,131,247,0.12);color:var(--accent)}
.geo-tree-city{margin-left:20px;font-size:13px}
.geo-tree-landmark{margin-left:40px;font-size:12px;color:var(--muted)}
.geo-tree-landmark:hover{color:var(--text)}
.geo-tree-landmark-empty{margin-left:48px;font-size:12px;color:var(--muted);padding:4px 0;opacity:0.6}
.geo-tree-toggle{display:inline-block;width:16px;text-align:center;margin-right:4px;cursor:pointer;font-size:10px;opacity:0.7}
.geo-tree-actions{opacity:0;display:flex;gap:4px}
.geo-tree-item:hover .geo-tree-actions{opacity:1}
.geo-tree-btn{padding:2px 6px;font-size:11px;background:var(--accent);color:white;border:none;border-radius:4px;cursor:pointer}
.geo-detail h2{margin:0 0 24px 0;display:flex;justify-content:space-between;align-items:center}
.geo-detail-section{margin-bottom:24px}
.geo-detail-section h3{font-size:16px;margin:0 0 12px 0;color:var(--accent);display:flex;justify-content:space-between;align-items:center}
.geo-detail-value{font-size:14px;line-height:1.6}
.geo-landmark-item,.geo-person-item{padding:12px;margin:8px 0;background:var(--bg);border:1px solid var(--border);border-radius:8px;display:flex;justify-content:space-between;align-items:flex-start;cursor:pointer}
.geo-landmark-item:hover,.geo-person-item:hover{border-color:var(--accent)}
.geo-landmark-name{font-weight:600;margin-bottom:4px}
.geo-item-actions{opacity:0;display:flex;gap:4px}
.geo-landmark-item:hover .geo-item-actions,.geo-person-item:hover .geo-item-actions{opacity:1}
.geo-empty{text-align:center;padding:40px;color:var(--muted)}
@media (max-width:1024px){.geo-layout{flex-direction:column}.geo-sidebar{width:100%;max-height:300px}}

/* ===== 右侧面板（timeline 风格）===== */
.tl-panel{
  width:260px;flex-shrink:0;
  background:var(--bg);
  border-left:1px solid var(--border);
  display:flex;flex-direction:column;
  overflow:hidden;
  transition:width 0.28s ease;
  position:relative;
}
.tl-panel.collapsed{width:0;border-left:none}
.expand-btn-float{
  position:absolute;left:-28px;top:50%;transform:translateY(-50%);
  background:var(--accent);color:white;border:none;
  padding:10px 7px;border-radius:6px 0 0 6px;
  cursor:pointer;opacity:0;pointer-events:none;
  transition:opacity 0.25s;z-index:20;font-size:12px;
}
.tl-panel.collapsed .expand-btn-float{opacity:1;pointer-events:auto}
.map-panel-hdr{
  padding:14px 16px;
  border-bottom:1px solid var(--border);
  display:flex;justify-content:space-between;align-items:center;
  cursor:pointer;user-select:none;
  font-size:13px;font-weight:600;flex-shrink:0;
  white-space:nowrap;overflow:hidden;
}
.map-panel-hdr:hover{background:rgba(124,131,247,0.05)}
.panel-search-box{padding:12px 14px;border-bottom:1px solid var(--border);flex-shrink:0}
.panel-search-box input{
  width:100%;padding:8px 12px;
  border:1px solid var(--border);border-radius:6px;
  font-size:13px;background:var(--bg);color:var(--text);
  outline:none;transition:border-color 0.2s;box-sizing:border-box;
}
.panel-search-box input:focus{border-color:var(--accent)}
.tl-clist{flex:1;overflow-y:auto;padding:8px}
.tl-ci{
  display:flex;align-items:center;gap:10px;
  padding:9px 10px;margin:3px 0;border-radius:8px;
  cursor:pointer;border:1px solid transparent;
  transition:background 0.15s,border-color 0.15s;
}
.tl-ci:hover{background:rgba(124,131,247,0.08);border-color:rgba(124,131,247,0.2)}
.tl-ci-av{
  width:34px;height:34px;border-radius:50%;flex-shrink:0;
  background:var(--accent);color:white;
  display:flex;align-items:center;justify-content:center;
  font-size:14px;font-weight:600;overflow:hidden;
}
.tl-ci-info{flex:1;min-width:0}
.tl-cname{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tl-cmeta{font-size:11px;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.geo-search-item{padding:9px 10px;margin:3px 0;border-radius:8px;cursor:pointer;font-size:13px;border:1px solid transparent;transition:background 0.15s,border-color 0.15s}
.geo-search-item:hover{background:rgba(124,131,247,0.08);border-color:rgba(124,131,247,0.2)}
.geo-search-path{font-size:11px;color:var(--muted);margin-top:2px}
.tl-empty{text-align:center;padding:32px 16px;color:var(--muted);font-size:13px;line-height:1.6}

/* ===== 模态框：自定义 Select ===== */
.modal-select-wrap{position:relative;margin-bottom:16px}
.modal-select-wrap select{
  width:100%;padding:9px 36px 9px 12px;
  border:1px solid var(--border);border-radius:8px;
  background:var(--bg2, var(--bg));color:var(--text);
  font-size:14px;appearance:none;-webkit-appearance:none;
  cursor:pointer;transition:border-color 0.2s,box-shadow 0.2s;outline:none;
}
.modal-select-wrap select:hover{border-color:var(--accent)}
.modal-select-wrap select:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(124,131,247,0.15)}
.modal-select-arrow{position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:10px;color:var(--muted);pointer-events:none}

/* ===== 模态框：头像区域 ===== */
.avatar-row{display:flex;gap:12px;align-items:center;margin-bottom:12px}
.avatar-preview{
  width:80px;height:80px;border-radius:50%;
  background:var(--accent);color:white;
  display:flex;align-items:center;justify-content:center;
  font-size:32px;font-weight:600;overflow:hidden;flex-shrink:0;
  background-size:cover;background-position:center;
}
.avatar-btns{display:flex;flex-direction:column;gap:8px}

/* ===== 模态框：URL 输入框 ===== */
.url-input-row{
  display:flex;align-items:center;gap:10px;
  padding:10px 14px;border:1px solid var(--border);border-radius:8px;
  background:var(--bg2, var(--bg));margin-bottom:16px;
  transition:border-color 0.2s,box-shadow 0.2s;
}
.url-input-row:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px rgba(124,131,247,0.15)}
.url-input-icon{font-size:15px;flex-shrink:0;opacity:0.6}
.url-input-row input{flex:1;border:none;background:transparent;color:var(--text);font-size:13px;outline:none}
.url-input-row input::placeholder{color:var(--muted)}

/* ===== 模态框：按钮区域（删除左 / 保存+取消右）===== */
.modal-actions{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:20px}
.modal-actions-right{display:flex;gap:8px;margin-left:auto}
.modal-btn{min-width:88px}
.modal-btn-delete{min-width:88px}
</style>
  `;
}

function bindControls() {
  const container = State.pageContainer;

  container.querySelectorAll('.intro-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  bindCharactersTab();
  bindSidePanel();
}

function switchTab(tabName) {
  const container = State.pageContainer;
  State.setCurrentTab(tabName);

  container.querySelectorAll('.intro-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  const charsContent = container.querySelector('#tab-characters');
  const geoContent = container.querySelector('#tab-geography');
  if (charsContent) charsContent.style.display = tabName === 'characters' ? 'block' : 'none';
  if (geoContent) geoContent.style.display = tabName === 'geography' ? 'flex' : 'none';

  syncPanelHeader(tabName);
  renderCurrentTab();
}

function syncPanelHeader(tabName) {
  const container = State.pageContainer;
  const title = container.querySelector('#chars-panel-title');
  const input = container.querySelector('#chars-panel-search');

  if (tabName === 'characters') {
    if (title) title.textContent = '🔍 搜索人物';
    if (input) input.placeholder = '输入名字搜索...';
  } else {
    if (title) title.textContent = '🔍 搜索地名';
    if (input) input.placeholder = '搜索国家、城市、地标...';
  }
  if (input) input.value = '';
  renderPanelList('');
}

function bindSidePanel() {
  const container = State.pageContainer;
  const panel = container.querySelector('#chars-panel');
  const toggle = container.querySelector('#chars-panel-toggle');
  const expandBtn = container.querySelector('#chars-panel-expand');
  const chevron = container.querySelector('#chars-panel-chevron');

  function togglePanel() {
    const collapsed = panel.classList.toggle('collapsed');
    if (chevron) chevron.textContent = collapsed ? '▶' : '◀';
  }

  if (toggle) toggle.addEventListener('click', togglePanel);
  if (expandBtn) expandBtn.addEventListener('click', togglePanel);

  const searchInput = container.querySelector('#chars-panel-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      renderPanelList(e.target.value.trim().toLowerCase());
    });
  }
}

export function renderPanelList(query) {
  const container = State.pageContainer;
  const list = container.querySelector('#chars-panel-list');
  if (!list) return;

  if (State.currentTab === 'characters') {
    _renderCharPanel(list, query);
  } else {
    _renderGeoPanel(list, query);
  }
}

function _renderCharPanel(list, query) {
  const chars = query
    ? State.allChars.filter(c => c.name.toLowerCase().includes(query))
    : [...State.allChars];

  if (!chars.length) {
    list.innerHTML = `<div class="tl-empty">${query ? '无匹配人物' : '暂无人物'}</div>`;
    return;
  }

  list.innerHTML = chars.map(c => {
    const city = State.allCities.find(ci => ci.id === c.city_id);
    const country = city ? State.allCountries.find(co => co.id === city.country_id) : null;
    const location = [country?.name, city?.name].filter(Boolean).join(' › ');
    // 修复年龄显示：age 可能是字符串"0"或数字，用 != null 而非 truthy 判断
    const ageStr = (c.age != null && c.age !== '') ? String(c.age) : '';
    const meta = [ageStr ? ageStr + '岁' : '', location].filter(Boolean).join(' · ');

    const av = c.avatar_url
      ? `<div class="tl-ci-av"><img src="${escHtml(c.avatar_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/></div>`
      : `<div class="tl-ci-av">${escHtml(c.name.charAt(0).toUpperCase())}</div>`;

    return `<div class="tl-ci" data-char-id="${c.id}">
      ${av}
      <div class="tl-ci-info">
        <div class="tl-cname">${escHtml(c.name)}</div>
        ${meta ? `<div class="tl-cmeta">${escHtml(meta)}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.tl-ci[data-char-id]').forEach(item => {
    item.addEventListener('click', () => {
      const id = parseInt(item.dataset.charId);
      const char = State.allChars.find(c => c.id === id);
      if (char && isEditor()) openCharModal(char);
    });
  });
}

function _renderGeoPanel(list, query) {
  let html = '';

  if (!query) {
    // 无搜索词：显示所有国家列表
    if (!State.allCountries.length) {
      list.innerHTML = '<div class="tl-empty">暂无地理数据</div>';
      return;
    }
    html = State.allCountries.map(c => {
      const cityCount = State.allCities.filter(ci => ci.country_id === c.id).length;
      return `<div class="geo-search-item" data-select-country="${c.id}">
        <div>🏛️ ${escHtml(c.name)}</div>
        <div class="geo-search-path">${cityCount} 座城市</div>
      </div>`;
    }).join('');
  } else {
    // 搜索国家
    State.allCountries.filter(c => c.name.toLowerCase().includes(query)).forEach(c => {
      html += `<div class="geo-search-item" data-select-country="${c.id}">
        <div>🏛️ ${escHtml(c.name)}</div>
        <div class="geo-search-path">国家</div>
      </div>`;
    });
    // 搜索城市
    State.allCities.filter(c => c.name.toLowerCase().includes(query)).forEach(city => {
      const country = State.allCountries.find(co => co.id === city.country_id);
      const path = country ? `${escHtml(country.name)} › ${escHtml(city.name)}` : escHtml(city.name);
      html += `<div class="geo-search-item" data-select-city="${city.id}" data-country-id="${city.country_id || ''}">
        <div>🏙️ ${escHtml(city.name)}</div>
        <div class="geo-search-path">${path}</div>
      </div>`;
    });
    // 搜索地标
    State.allLandmarks.filter(l => l.name.toLowerCase().includes(query)).forEach(lm => {
      const city = State.allCities.find(c => c.id === lm.city_id);
      const country = city ? State.allCountries.find(co => co.id === city.country_id) : null;
      const path = [country?.name, city?.name].filter(Boolean).map(s => escHtml(s)).join(' › ');
      html += `<div class="geo-search-item" data-select-city="${lm.city_id || ''}" data-country-id="${city?.country_id || ''}">
        <div>🏛 ${escHtml(lm.name)}</div>
        <div class="geo-search-path">${path || '未知位置'}</div>
      </div>`;
    });
    // 搜索人物
    State.allChars.filter(c => c.name.toLowerCase().includes(query)).forEach(p => {
      const city = State.allCities.find(c => c.id === p.city_id);
      const country = city ? State.allCountries.find(co => co.id === city.country_id) : null;
      const path = [country?.name, city?.name].filter(Boolean).map(s => escHtml(s)).join(' › ');
      html += `<div class="geo-search-item" data-select-city="${p.city_id || ''}" data-country-id="${city?.country_id || ''}">
        <div>👤 ${escHtml(p.name)}</div>
        <div class="geo-search-path">${path || '未知位置'}</div>
      </div>`;
    });
    if (!html) html = '<div class="tl-empty">无搜索结果</div>';
  }

  list.innerHTML = html;

  list.querySelectorAll('[data-select-country]').forEach(item => {
    item.addEventListener('click', () => {
      const id = parseInt(item.dataset.selectCountry);
      const country = State.allCountries.find(c => c.id === id);
      if (!country) return;
      State.setSelectedCountry(country);
      State.setSelectedCity(null);
      if (!State.expandedCountries.has(id)) State.toggleCountryExpanded(id);
      renderGeoTree();
      renderGeoDetail();
    });
  });

  list.querySelectorAll('[data-select-city]').forEach(item => {
    item.addEventListener('click', () => {
      const cityId = parseInt(item.dataset.selectCity);
      const countryId = item.dataset.countryId ? parseInt(item.dataset.countryId) : null;
      if (!cityId) return;
      const city = State.allCities.find(c => c.id === cityId);
      if (!city) return;
      State.setSelectedCity(city);
      if (countryId) {
        State.setSelectedCountry(State.allCountries.find(c => c.id === countryId));
        if (!State.expandedCountries.has(countryId)) State.toggleCountryExpanded(countryId);
      }
      renderGeoTree();
      renderGeoDetail();
    });
  });
}

function renderCurrentTab() {
  const container = State.pageContainer;
  if (State.currentTab === 'characters') {
    renderCharactersTab();
  } else if (State.currentTab === 'geography') {
    initGeographyTab();
  }
  // 刷新侧边栏
  const searchInput = container.querySelector('#chars-panel-search');
  renderPanelList(searchInput?.value?.trim().toLowerCase() || '');
}

function updateUI() {
  const container = State.pageContainer;
  const editor = isEditor();
  container.querySelector('#chars-add-btn').style.display = editor ? 'block' : 'none';
  const addCountryBtn = container.querySelector('#add-country-btn');
  if (addCountryBtn) addCountryBtn.style.display = editor ? 'block' : 'none';
  syncPanelHeader(State.currentTab);
}
