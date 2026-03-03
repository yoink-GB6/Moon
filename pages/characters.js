// pages/characters.js
// 主入口文件 - 协调所有模块

import { isEditor, onAuthChange } from '../core/auth.js';
import * as State from './characters/state.js';
import { loadAllData, subscribeRealtime, unsubscribeRealtime } from './characters/data-loader.js';
import { renderCharactersTab, bindCharactersTab } from './characters/characters-tab.js';
import { initGeographyTab } from './characters/geography-tab.js';
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

  <div class="intro-content" id="tab-characters">
    <div class="intro-header">
      <h2>👥 人物介绍</h2>
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

    <button id="geo-search-expand" class="geo-expand-btn" title="展开搜索">◀</button>
    <div class="geo-sidebar geo-search">
      <div class="geo-search-header" id="geo-search-toggle">
        <span>🔍 搜索</span>
        <span id="geo-search-chevron">◀</span>
      </div>
      <div class="geo-search-body">
        <div class="geo-search-box">
          <input type="text" id="geo-search-input" placeholder="搜索..."/>
        </div>
        <div id="geo-search-results" class="geo-search-results"></div>
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
    <input id="char-age" type="text" placeholder="25 或 25-30"/>
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
.intro-tabs{display:flex;gap:4px;padding:16px 20px 0 20px;border-bottom:2px solid var(--border)}
.intro-tab{display:flex;align-items:center;gap:8px;padding:12px 24px;border:none;background:transparent;color:var(--muted);cursor:pointer;position:relative;transition:all 0.2s}
.intro-tab:hover{color:var(--text);background:rgba(124,131,247,0.05)}
.intro-tab.active{color:var(--accent)}
.intro-tab.active::after{content:'';position:absolute;bottom:-2px;left:0;right:0;height:2px;background:var(--accent)}
.intro-content{flex:1;overflow-y:auto;padding:20px}
.intro-header{display:flex;justify-content:space-between;margin-bottom:20px}
.intro-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
.intro-card{background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:16px;cursor:pointer;transition:all 0.2s}
.intro-card:hover{box-shadow:0 4px 12px rgba(0,0,0,0.08);border-color:var(--accent)}
.intro-avatar{width:60px;height:60px;border-radius:50%;background:var(--accent);color:white;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:600;overflow:hidden;flex-shrink:0}
.intro-avatar img{width:100%;height:100%;object-fit:cover}

/* ===== 地理布局 ===== */
.geo-layout{display:flex;gap:0;padding:0;overflow:hidden;position:relative}
.geo-sidebar{width:280px;background:var(--bg);display:flex;flex-direction:column;overflow:hidden;transition:width 0.3s ease;border-right:1px solid var(--border)}
.geo-search{border-left:1px solid var(--border);border-right:none}
.geo-search.collapsed{width:0;border-left:none}
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
.geo-expand-btn{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:var(--accent);color:white;border:none;padding:12px 8px;border-radius:6px 0 0 6px;cursor:pointer;opacity:0;pointer-events:none;transition:opacity 0.3s;z-index:10}
.geo-expand-btn.show{opacity:1;pointer-events:auto}
.geo-search-header{padding:16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;cursor:pointer;user-select:none}
.geo-search-header:hover{background:rgba(124,131,247,0.05)}
.geo-search-body{flex:1;display:flex;flex-direction:column;overflow:hidden}
.geo-search-box{padding:16px;border-bottom:1px solid var(--border)}
#geo-search-input{width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px}
.geo-search-results{flex:1;overflow-y:auto;padding:8px}
.geo-search-item{padding:8px 12px;margin:4px 0;border-radius:6px;cursor:pointer;font-size:13px;border:1px solid transparent}
.geo-search-item:hover{background:rgba(124,131,247,0.08);border-color:var(--accent)}
.geo-search-path{font-size:11px;color:var(--muted);margin-top:2px}
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

/* ===== 模态框：自定义 Select ===== */
.modal-select-wrap{position:relative;margin-bottom:16px}
.modal-select-wrap select{
  width:100%;
  padding:9px 36px 9px 12px;
  border:1px solid var(--border);
  border-radius:8px;
  background:var(--bg2, var(--bg));
  color:var(--text);
  font-size:14px;
  appearance:none;
  -webkit-appearance:none;
  cursor:pointer;
  transition:border-color 0.2s, box-shadow 0.2s;
  outline:none;
}
.modal-select-wrap select:hover{border-color:var(--accent)}
.modal-select-wrap select:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(124,131,247,0.15)}
.modal-select-arrow{
  position:absolute;right:12px;top:50%;transform:translateY(-50%);
  font-size:10px;color:var(--muted);pointer-events:none;
}

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
  padding:10px 14px;
  border:1px solid var(--border);
  border-radius:8px;
  background:var(--bg2, var(--bg));
  margin-bottom:16px;
  transition:border-color 0.2s, box-shadow 0.2s;
}
.url-input-row:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px rgba(124,131,247,0.15)}
.url-input-icon{font-size:15px;flex-shrink:0;opacity:0.6}
.url-input-row input{
  flex:1;border:none;background:transparent;
  color:var(--text);font-size:13px;outline:none;
}
.url-input-row input::placeholder{color:var(--muted)}

/* ===== 模态框：按钮区域（删除左 / 保存+取消右）===== */
.modal-actions{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:8px;
  margin-top:20px;
}
.modal-actions-right{display:flex;gap:8px;margin-left:auto}
.modal-btn{min-width:88px}
.modal-btn-delete{min-width:88px}
/* 无删除按钮时右侧组自动顶到最右 */
.modal-actions:not(:has(.modal-btn-delete[style*="block"])) .modal-actions-right{margin-left:auto}
</style>
  `;
}

function bindControls() {
  const container = State.pageContainer;

  container.querySelectorAll('.intro-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  bindCharactersTab();
}

function switchTab(tabName) {
  const container = State.pageContainer;
  State.setCurrentTab(tabName);

  container.querySelectorAll('.intro-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  container.querySelectorAll('.intro-content').forEach(content => {
    const targetId = 'tab-' + tabName;
    content.style.display = content.id === targetId ?
      (tabName === 'geography' ? 'flex' : 'block') : 'none';
  });

  renderCurrentTab();
}

function renderCurrentTab() {
  if (State.currentTab === 'characters') {
    renderCharactersTab();
  } else if (State.currentTab === 'geography') {
    initGeographyTab();
  }
}

function updateUI() {
  const container = State.pageContainer;
  const editor = isEditor();
  container.querySelector('#chars-add-btn').style.display = editor ? 'block' : 'none';
  const addCountryBtn = container.querySelector('#add-country-btn');
  if (addCountryBtn) addCountryBtn.style.display = editor ? 'block' : 'none';
}
