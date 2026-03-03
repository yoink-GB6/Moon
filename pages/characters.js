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
          <h2>👥 人物介绍</h2>
          <button class="btn bp" id="chars-add-btn" style="display:none">＋ 新建</button>
        </div>
        <div class="intro-grid" id="chars-grid"></div>
      </div>

      <div class="intro-content geo-layout" id="tab-geography" style="display:none">
        <div class="geo-main">
          <div id="geo-detail-view" class="geo-detail"></div>
        </div>
        <!-- 隐藏的代理按钮，由面板内按钮触发 -->
        <button id="add-country-btn" style="display:none">＋ 新建国家</button>
      </div>
    </div>

    <!-- 右侧面板展开按钮（在panel外，不受overflow:hidden影响）-->
    <button id="chars-panel-expand" class="panel-expand-trigger" title="展开面板">▶</button>
    <!-- 右侧面板：人物页=搜索人物，地理页=搜索地名 -->
    <div id="chars-panel" class="tl-panel">
      <div class="map-panel-hdr" id="chars-panel-toggle">
        <span id="chars-panel-title">👥 人物列表</span>
        <span id="chars-panel-chevron">◀</span>
      </div>
      <div id="panel-chars-body" class="panel-body-section">
        <div class="panel-search-box">
          <input type="text" id="chars-panel-search" placeholder="输入名字搜索..." autocomplete="off"/>
        </div>
        <div id="chars-panel-list" class="tl-clist"></div>
      </div>
      <!-- 地理页：搜索框+下拉结果+三级树 -->
      <div id="panel-geo-body" class="panel-body-section" style="display:none">
        <!-- 搜索区 -->
        <div class="geo-panel-search-box">
          <div class="geo-panel-search-wrap">
            <span class="geo-panel-search-icon">🔍</span>
            <input type="text" id="geo-panel-search" placeholder="搜索国家、城市、地标..." autocomplete="off"/>
          </div>
          <!-- 搜索结果下拉 -->
          <div id="geo-panel-results" class="geo-panel-results"></div>
        </div>
        <!-- 新建按钮 -->
        <div class="geo-panel-add">
          <button class="btn bn" id="panel-add-country-btn" style="display:none">＋ 新建国家</button>
        </div>
        <!-- 树形结构 -->
        <div id="geo-tree-list" class="geo-tree-list"></div>
      </div>
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
.geo-layout{display:flex;flex-direction:column;gap:0;padding:0;overflow:hidden;flex:1}
/* 面板内地理搜索 */
.geo-panel-search-box{padding:10px 12px 6px;flex-shrink:0}
.geo-panel-search-wrap{position:relative}
.geo-panel-search-icon{position:absolute;left:9px;top:50%;transform:translateY(-50%);font-size:12px;opacity:0.45;pointer-events:none}
.geo-panel-search-wrap input{width:100%;padding:7px 10px 7px 28px;box-sizing:border-box;border:1px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text);font-size:12px;outline:none;transition:border-color 0.2s,box-shadow 0.2s}
.geo-panel-search-wrap input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(124,131,247,0.15)}
.geo-panel-results{display:none;margin-top:4px;background:var(--bg);border:1px solid var(--border);border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,0.25);overflow-y:auto;max-height:220px}
.geo-panel-results.open{display:block}
.geo-panel-result-item{display:flex;align-items:center;gap:8px;padding:8px 11px;cursor:pointer;font-size:12px;border-bottom:1px solid rgba(255,255,255,0.04);transition:background 0.12s}
.geo-panel-result-item:last-child{border-bottom:none}
.geo-panel-result-item:hover,.geo-panel-result-item.focused{background:rgba(124,131,247,0.1)}
.geo-panel-result-icon{width:18px;text-align:center;flex-shrink:0;font-size:13px}
.geo-panel-result-name{flex:1;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.geo-panel-result-path{font-size:10px;color:var(--muted);flex-shrink:0}
.geo-panel-results-empty{padding:16px;text-align:center;color:var(--muted);font-size:12px}
.geo-panel-add{padding:2px 12px 6px;flex-shrink:0}
.geo-panel-add .btn{width:100%;font-size:12px;padding:5px}
.panel-body-section{display:flex;flex-direction:column;flex:1;overflow:hidden}
.geo-main{flex:1;overflow-y:auto;padding:24px}
.panel-body-section{display:flex;flex-direction:column;flex:1;overflow:hidden}
.geo-tree-list{flex:1;overflow-y:auto;padding:6px}
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
}
.tl-panel.collapsed{width:0;border-left:none}
/* 展开按钮位于panel外部，不受overflow:hidden裁剪 */
.panel-expand-trigger{
  display:none;
  flex-shrink:0;
  align-self:center;
  width:32px;height:32px;border-radius:50%;
  background:rgba(20,21,40,0.85);
  border:1.5px solid rgba(124,131,247,0.5);
  color:var(--accent);font-size:12px;
  cursor:pointer;
  align-items:center;justify-content:center;
  margin-left:6px;
  transition:background 0.2s,border-color 0.2s,box-shadow 0.2s;
  z-index:10;
}
.panel-expand-trigger:hover{
  background:rgba(124,131,247,0.18);
  border-color:var(--accent);
  box-shadow:0 0 8px rgba(124,131,247,0.3);
}
.panel-expand-trigger.visible{display:flex}
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
  const charsBody = container.querySelector('#panel-chars-body');
  const geoBody = container.querySelector('#panel-geo-body');
  const input = container.querySelector('#chars-panel-search');

  if (tabName === 'characters') {
    if (title) title.textContent = '👥 人物列表';
    if (charsBody) charsBody.style.display = 'flex';
    if (geoBody) geoBody.style.display = 'none';
    if (input) input.value = '';
    renderPanelList('');
  } else {
    if (title) title.textContent = '🗺️ 地理结构';
    if (charsBody) charsBody.style.display = 'none';
    if (geoBody) geoBody.style.display = 'flex';
  }
}

function bindSidePanel() {
  const container = State.pageContainer;
  const panel = container.querySelector('#chars-panel');
  const toggle = container.querySelector('#chars-panel-toggle');
  const expandBtn = container.querySelector('#chars-panel-expand'); // outside panel
  const chevron = container.querySelector('#chars-panel-chevron');

  function collapsePanel() {
    panel.classList.add('collapsed');
    if (chevron) chevron.textContent = '▶';
    if (expandBtn) expandBtn.classList.add('visible');
  }
  function expandPanel() {
    panel.classList.remove('collapsed');
    if (chevron) chevron.textContent = '◀';
    if (expandBtn) expandBtn.classList.remove('visible');
  }
  function togglePanel() {
    if (panel.classList.contains('collapsed')) expandPanel();
    else collapsePanel();
  }

  if (toggle) toggle.addEventListener('click', togglePanel);
  if (expandBtn) expandBtn.addEventListener('click', expandPanel);

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
  _renderCharPanel(list, query);
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

function renderCurrentTab() {
  const container = State.pageContainer;
  if (State.currentTab === 'characters') {
    renderCharactersTab();
    const searchInput = container.querySelector('#chars-panel-search');
    renderPanelList(searchInput?.value?.trim().toLowerCase() || '');
  } else if (State.currentTab === 'geography') {
    initGeographyTab();
    renderGeoTree();
    _bindGeoSearch();
    _bindPanelAddCountry();
  }
}

/**
 * 绑定右侧面板地理搜索框
 * 输入时实时搜索，结果以下拉列表展示；选中后主区域跳转对应详情
 */
function _bindGeoSearch() {
  const container = State.pageContainer;
  const input = container.querySelector('#geo-panel-search');
  const results = container.querySelector('#geo-panel-results');
  if (!input || !results) return;

  // 防重复绑定
  const freshInput = input.cloneNode(true);
  input.parentNode.replaceChild(freshInput, input);

  let focusedIdx = -1;
  let currentHits = [];

  function buildResults(query) {
    const q = query.trim().toLowerCase();
    if (!q) {
      results.classList.remove('open');
      results.innerHTML = '';
      currentHits = [];
      return;
    }

    const hits = [];

    // 搜索国家/势力
    State.allCountries
      .filter(co => co.name.toLowerCase().includes(q))
      .forEach(co => hits.push({
        type: 'country', icon: '🏛️',
        label: co.name, path: '',
        obj: co
      }));

    // 搜索城市
    State.allCities
      .filter(ci => ci.name.toLowerCase().includes(q))
      .forEach(ci => {
        const country = State.allCountries.find(co => co.id === ci.country_id);
        hits.push({
          type: 'city', icon: '🏙️',
          label: ci.name, path: country ? country.name : '',
          obj: ci, parentCountry: country
        });
      });

    // 搜索地标
    State.allLandmarks
      .filter(lm => lm.name.toLowerCase().includes(q))
      .forEach(lm => {
        const city = State.allCities.find(ci => ci.id === lm.city_id);
        const country = city ? State.allCountries.find(co => co.id === city.country_id) : null;
        const path = [country && country.name, city && city.name].filter(Boolean).join(' › ');
        hits.push({
          type: 'landmark', icon: '🏛',
          label: lm.name, path,
          obj: lm, parentCity: city, parentCountry: country
        });
      });

    currentHits = hits;
    focusedIdx = -1;

    if (!hits.length) {
      results.innerHTML = '<div class="geo-panel-results-empty">无匹配结果</div>';
      results.classList.add('open');
      return;
    }

    results.innerHTML = hits.map((h, i) =>
      '<div class="geo-panel-result-item" data-idx="' + i + '">' +
        '<span class="geo-panel-result-icon">' + h.icon + '</span>' +
        '<span class="geo-panel-result-name">' + escHtml(h.label) + '</span>' +
        (h.path ? '<span class="geo-panel-result-path">' + escHtml(h.path) + '</span>' : '') +
      '</div>'
    ).join('');
    results.classList.add('open');

    // 绑定点击选中
    results.querySelectorAll('.geo-panel-result-item').forEach(function(el, i) {
      el.addEventListener('mousedown', function(e) {
        e.preventDefault(); // 防止 input blur 先触发，导致下拉关闭
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
      State.setSelectedCountry(hit.obj);
      State.setSelectedCity(null);
      if (!State.expandedCountries.has(hit.obj.id)) State.toggleCountryExpanded(hit.obj.id);

    } else if (hit.type === 'city') {
      State.setSelectedCity(hit.obj);
      if (hit.parentCountry) {
        State.setSelectedCountry(hit.parentCountry);
        if (!State.expandedCountries.has(hit.parentCountry.id))
          State.toggleCountryExpanded(hit.parentCountry.id);
      }
      if (State.expandedCities && !State.expandedCities.has(hit.obj.id))
        State.toggleCityExpanded && State.toggleCityExpanded(hit.obj.id);

    } else if (hit.type === 'landmark') {
      // 地标：跳到所在城市详情
      if (hit.parentCity) {
        State.setSelectedCity(hit.parentCity);
        if (hit.parentCountry) {
          State.setSelectedCountry(hit.parentCountry);
          if (!State.expandedCountries.has(hit.parentCountry.id))
            State.toggleCountryExpanded(hit.parentCountry.id);
        }
        if (State.expandedCities && !State.expandedCities.has(hit.parentCity.id))
          State.toggleCityExpanded && State.toggleCityExpanded(hit.parentCity.id);
      }
    }
    renderGeoDetail();
    renderGeoTree();
  }

  // 输入事件
  freshInput.addEventListener('input', function(e) {
    buildResults(e.target.value);
  });

  // 键盘导航：上/下/回车/Esc
  freshInput.addEventListener('keydown', function(e) {
    const items = results.querySelectorAll('.geo-panel-result-item');
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusedIdx = Math.min(focusedIdx + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusedIdx = Math.max(focusedIdx - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (focusedIdx >= 0 && currentHits[focusedIdx]) {
        selectHit(currentHits[focusedIdx]);
        freshInput.value = '';
        results.classList.remove('open');
        results.innerHTML = '';
        currentHits = [];
      }
      return;
    } else if (e.key === 'Escape') {
      results.classList.remove('open');
      return;
    }
    items.forEach(function(el, i) { el.classList.toggle('focused', i === focusedIdx); });
    if (focusedIdx >= 0) items[focusedIdx].scrollIntoView({ block: 'nearest' });
  });

  // 失焦时关闭（setTimeout 确保 mousedown 先执行完）
  freshInput.addEventListener('blur', function() {
    setTimeout(function() { results.classList.remove('open'); }, 160);
  });
}

/** 面板内「新建国家」按钮代理 */
function _bindPanelAddCountry() {
  const container = State.pageContainer;
  const btn = container.querySelector('#panel-add-country-btn');
  if (!btn) return;
  const fresh = btn.cloneNode(true);
  btn.parentNode.replaceChild(fresh, btn);
  fresh.style.display = isEditor() ? 'block' : 'none';
  fresh.addEventListener('click', function() {
    container.querySelector('#add-country-btn') && container.querySelector('#add-country-btn').click();
  });
}
function updateUI() {
  const container = State.pageContainer;
  const editor = isEditor();
  container.querySelector('#chars-add-btn').style.display = editor ? 'block' : 'none';
  // add-country-btn 保持隐藏，由 panel-add-country-btn 代理触发
  const addCountryBtn = container.querySelector('#add-country-btn');
  if (addCountryBtn) addCountryBtn.style.display = 'none';
  const panelAddBtn = container.querySelector('#panel-add-country-btn');
  if (panelAddBtn) panelAddBtn.style.display = (editor && State.currentTab === 'geography') ? 'block' : 'none';
  syncPanelHeader(State.currentTab);
}
