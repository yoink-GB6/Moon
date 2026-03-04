// pages/characters.js
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
  onAuthChange(() => { updateUI(); renderCurrentTab(); });
  await loadAllData();
  renderCurrentTab();
  subscribeRealtime(() => renderCurrentTab());
  updateUI();
}

export function unmount() {
  unsubscribeRealtime();
}

// ── HTML ──────────────────────────────────────────────────────

function buildHTML() {
  return `
<div class="intro-body">
  <div class="intro-main">
    <div class="intro-tabs">
      <button class="intro-tab active" data-tab="characters"><span class="tab-icon">👥</span><span class="tab-label">人物介绍</span></button>
      <button class="intro-tab" data-tab="geography"><span class="tab-icon">🏛️</span><span class="tab-label">国家及势力</span></button>
    </div>

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
  </div>

  <!-- 右侧面板展开按钮（panel外，不受overflow:hidden影响）-->
  <button id="chars-panel-expand" class="panel-expand-trigger" title="展开面板">▶</button>

  <!-- 右侧面板 -->
  <div id="chars-panel" class="tl-panel">
    <div class="map-panel-hdr" id="chars-panel-toggle">
      <span id="chars-panel-title">👥 人物列表</span>
      <span id="chars-panel-chevron">◀</span>
    </div>

    <!-- 人物标签页 -->
    <div id="panel-chars-body" class="panel-body-section">
      <div class="panel-search-box">
        <div class="panel-search-wrap">
          <input type="text" id="chars-panel-search" placeholder="输入名字搜索..." autocomplete="off"/>
          <button id="chars-search-clear" class="panel-search-clear" title="清除">✕</button>
        </div>
      </div>
      <div id="chars-panel-list" class="tl-clist"></div>
    </div>

    <!-- 地理标签页：搜索框+下拉结果+三级树 -->
    <div id="panel-geo-body" class="panel-body-section" style="display:none">
      <div class="geo-panel-search-box">
        <div class="geo-panel-search-wrap">
          <span class="geo-panel-search-icon">🔍</span>
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

<!-- 人物模态框 -->
<div id="char-modal" class="tl-modal-overlay">
  <div class="tl-modal" style="max-width:500px" onmousedown="event.stopPropagation()">
    <h2 id="char-modal-title">编辑人物</h2>
    <label>名字</label><input id="char-name" type="text"/>
    <label>年龄</label><input id="char-age" type="number" min="0" placeholder="0"/>
    <label>所属城市</label><select id="char-city"><option value="">无</option></select>
    <label>描述</label><textarea id="char-desc" rows="3"></textarea>
    <label>头像</label>
    <div style="display:flex;gap:12px;margin-bottom:16px">
      <div id="char-avatar-preview" style="width:80px;height:80px;border-radius:50%;background:var(--accent);color:white;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:600;overflow:hidden">
        <span id="char-avatar-letter">?</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="btn bn" id="char-upload-btn">📁 上传</button>
        <button class="btn bn" id="char-url-btn">🔗 URL</button>
      </div>
      <input type="file" id="char-file-input" accept="image/*" style="display:none"/>
      <div id="char-url-row" style="display:none;margin-top:8px;flex:1">
        <input id="char-url-input" type="url" placeholder="https://..." style="width:100%"/>
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
<div id="country-modal" class="tl-modal-overlay">
  <div class="tl-modal country-modal-inner" style="max-width:560px" onmousedown="event.stopPropagation()"></div>
</div>

<!-- 城市模态框 -->
<div id="city-modal" class="tl-modal-overlay">
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

<style>
/* ── 整体布局 ── */
.intro-body{height:100%;display:flex;overflow:hidden}
.intro-main{flex:1;display:flex;flex-direction:column;overflow:hidden}
.intro-tabs{display:flex;gap:4px;padding:16px 20px 0;border-bottom:2px solid var(--border);flex-shrink:0}
.intro-tab{display:flex;align-items:center;gap:8px;padding:12px 24px;border:none;background:transparent;color:var(--muted);cursor:pointer;position:relative;transition:all 0.2s}
.intro-tab:hover{color:var(--text);background:rgba(124,131,247,0.05)}
.intro-tab.active{color:var(--accent)}
.intro-tab.active::after{content:'';position:absolute;bottom:-2px;left:0;right:0;height:2px;background:var(--accent)}
.intro-content{flex:1;overflow-y:auto;padding:20px}
.intro-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
/* ── 人物卡片 ── */
.intro-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
.intro-card{background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:16px;cursor:pointer;transition:all 0.2s}
.intro-card:hover{box-shadow:0 4px 12px rgba(0,0,0,0.08);border-color:var(--accent)}
.intro-avatar{width:60px;height:60px;border-radius:50%;background:var(--accent);color:white;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:600;overflow:hidden;flex-shrink:0}
.intro-avatar img{width:100%;height:100%;object-fit:cover}
/* ── 地理布局 ── */
.geo-layout{display:flex;flex-direction:column;gap:0;padding:0;overflow:hidden;flex:1}
.geo-main{flex:1;overflow-y:auto;padding:24px;scrollbar-width:thin;scrollbar-color:rgba(124,131,247,0.2) transparent}.geo-main::-webkit-scrollbar{width:4px}.geo-main::-webkit-scrollbar-track{background:transparent}.geo-main::-webkit-scrollbar-thumb{background:rgba(124,131,247,0.2);border-radius:2px}
/* ── 右侧面板 ── */
.tl-panel{width:260px;flex-shrink:0;background:var(--bg);border-left:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;transition:width 0.28s ease}
.tl-panel.collapsed{width:0}
.map-panel-hdr{padding:14px 16px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;border-bottom:1px solid var(--border);flex-shrink:0;user-select:none;font-weight:600;font-size:13px}
.map-panel-hdr:hover{background:rgba(124,131,247,0.06)}
.panel-body-section{display:flex;flex-direction:column;flex:1;overflow:hidden}
.panel-search-box{padding:10px 12px;flex-shrink:0;border-bottom:1px solid var(--border)}
.panel-search-wrap{position:relative;display:flex;align-items:center}
.panel-search-wrap input{width:100%;padding:7px 28px 7px 10px;box-sizing:border-box;border:1px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text);font-size:12px;outline:none;transition:border-color 0.2s}
.panel-search-wrap input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(124,131,247,0.12)}
.panel-search-clear{position:absolute;right:7px;background:none;border:none;color:var(--muted);cursor:pointer;font-size:13px;padding:0;line-height:1;display:none;transition:color 0.15s}
.panel-search-clear:hover{color:var(--text)}
/* 面板展开按钮 */
.panel-expand-trigger{display:none;flex-shrink:0;align-self:center;width:32px;height:32px;border-radius:50%;background:rgba(20,21,40,0.85);border:1.5px solid rgba(124,131,247,0.5);color:var(--accent);font-size:12px;cursor:pointer;margin-left:6px;z-index:10;align-items:center;justify-content:center}
.panel-expand-trigger.visible{display:flex}
.panel-expand-trigger:hover{background:rgba(124,131,247,0.18);border-color:var(--accent)}
/* ── 人物列表 ── */
.tl-clist{flex:1;overflow-y:auto;padding:6px}
.tl-ci{display:flex;align-items:center;gap:10px;padding:9px 10px;margin:2px 0;border-radius:8px;cursor:pointer;border:1px solid transparent;transition:all 0.15s}
.tl-ci:hover{background:rgba(124,131,247,0.08);border-color:rgba(124,131,247,0.2)}
.tl-ci.active-item{background:rgba(124,131,247,0.12);border-color:var(--accent)}
.tl-ci-av{width:32px;height:32px;border-radius:50%;background:var(--accent);color:white;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;flex-shrink:0;overflow:hidden}
.tl-ci-info{flex:1;min-width:0}
.tl-cname{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tl-cmeta{font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tl-empty{padding:20px;text-align:center;color:var(--muted);font-size:13px}
/* ── 地理搜索面板 ── */
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
/* ── 地理树 ── */
.geo-tree-list{flex:1;overflow-y:auto;padding:6px 4px}
/* 树节点公共 */
.gt-row{display:flex;align-items:center;padding:6px 8px;border-radius:6px;cursor:pointer;user-select:none;transition:background 0.13s}
.gt-row:hover{background:rgba(124,131,247,0.08)}
.gt-toggle{width:18px;flex-shrink:0;text-align:center;font-size:10px;color:var(--muted);transition:color 0.15s}
.gt-row:hover .gt-toggle{color:var(--accent)}
.gt-label{flex:1;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gt-actions{display:flex;gap:3px;opacity:0;transition:opacity 0.15s;flex-shrink:0}
.gt-row:hover .gt-actions{opacity:1}
.gt-btn{padding:1px 5px;font-size:11px;background:transparent;color:var(--muted);border:1px solid var(--border);border-radius:4px;cursor:pointer;transition:all 0.12s}
.gt-btn:hover{background:rgba(124,131,247,0.12);border-color:var(--accent);color:var(--accent)}
/* 国家 0级 */
.gt-country .gt-row{padding-left:6px}
.gt-country.active .gt-row{background:rgba(124,131,247,0.12)}
.gt-country.active .gt-label{color:var(--accent);font-weight:600}
/* 城市 1级 */
.gt-city .gt-row{padding-left:22px}
.gt-city.active .gt-row{background:rgba(124,131,247,0.1)}
.gt-city.active .gt-label{color:var(--accent)}
/* 地标 2级 */
.gt-landmark .gt-row{padding-left:40px}
.gt-landmark .gt-label{font-size:12px;color:var(--muted)}
.gt-landmark:hover .gt-label{color:var(--text)}
/* 空提示 */
.gt-empty-city{font-size:11px;color:var(--muted);padding:3px 8px 3px 24px;font-style:italic}
.gt-empty-lm{font-size:11px;color:var(--muted);padding:3px 8px 3px 40px;font-style:italic}
.gt-group-label{font-size:11px;color:var(--muted);padding:8px 8px 2px;letter-spacing:0.05em}
/* ── 地理详情 ── */
.geo-detail h2{margin:0 0 24px 0;display:flex;justify-content:space-between;align-items:center}
.geo-detail-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}
.geo-detail-header h2{margin:0}
.geo-detail-section{margin-bottom:24px}
.geo-detail-section h3{font-size:16px;margin:0 0 12px 0;color:var(--accent);display:flex;justify-content:space-between;align-items:center}
.geo-detail-value{font-size:14px;line-height:1.6}
.geo-city-list{display:flex;flex-direction:column;gap:6px;margin-top:4px}
.geo-city-card{display:flex;align-items:center;padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:8px;cursor:pointer;transition:border-color 0.15s,background 0.15s}
.geo-city-card:hover{border-color:var(--accent);background:rgba(124,131,247,0.06)}
.geo-city-card-name{flex:1;font-size:13px;font-weight:500}
.geo-city-card-arrow{color:var(--muted);font-size:16px;transition:color 0.15s}
.geo-city-card:hover .geo-city-card-arrow{color:var(--accent)}
.geo-landmark-item{padding:12px;margin:6px 0;background:var(--bg);border:1px solid var(--border);border-radius:8px;display:flex;justify-content:space-between;align-items:flex-start}
.geo-landmark-item:hover{border-color:rgba(124,131,247,0.3)}
.geo-person-item{display:flex;align-items:center;gap:10px;padding:10px 12px;margin:6px 0;background:var(--bg);border:1px solid var(--border);border-radius:8px;cursor:pointer;transition:border-color 0.15s,background 0.15s}
.geo-person-item:hover{border-color:var(--accent);background:rgba(124,131,247,0.06)}
.geo-person-av{width:36px;height:36px;border-radius:50%;background:var(--accent);color:white;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;overflow:hidden;flex-shrink:0}
.geo-landmark-name{font-weight:600;margin-bottom:4px}
.geo-item-actions{opacity:0;display:flex;gap:4px}
.geo-landmark-item:hover .geo-item-actions,.geo-person-item:hover .geo-item-actions{opacity:1}
.geo-empty{text-align:center;padding:40px;color:var(--muted)}
/* ── 折叠小节卡片 ── */
.geo-section-card{border:1px solid var(--border);border-radius:10px;margin-bottom:10px;overflow:hidden;transition:border-color 0.2s}
.geo-section-card:hover{border-color:rgba(124,131,247,0.35)}
.geo-section-toggle{display:flex;align-items:center;justify-content:space-between;padding:11px 16px;cursor:pointer;user-select:none;background:rgba(124,131,247,0.04);transition:background 0.15s}
.geo-section-toggle:hover{background:rgba(124,131,247,0.09)}
.geo-section-title{font-size:14px;font-weight:600}
.geo-section-arrow{font-size:10px;color:var(--muted);transition:transform 0.22s;transform:rotate(-90deg)}
.geo-section-card.open .geo-section-arrow{transform:rotate(0deg)}
.geo-section-body{display:none;padding:12px 16px;border-top:1px solid var(--border)}
.geo-section-card.open .geo-section-body{display:block}
.geo-section-content{font-size:13px;line-height:1.7;white-space:pre-wrap;color:var(--text)}
/* ── 国家编辑模态框 ── */
.cm-sec-hdr{display:flex;align-items:baseline;gap:10px;margin:16px 0 6px}
.cm-sec-hdr span:first-child{font-size:13px;font-weight:600}
.cm-hint{font-size:11px;color:var(--muted)}
.cm-tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;min-height:28px}
.cm-tag{padding:4px 10px;border:1px solid var(--border);border-radius:20px;background:transparent;color:var(--text);font-size:12px;cursor:pointer;transition:border-color 0.15s,background 0.15s}
.cm-tag:hover{border-color:var(--accent);background:rgba(124,131,247,0.1);color:var(--accent)}
.cm-tags-empty{font-size:11px;color:var(--muted);padding:4px 0}
.cm-custom-row{display:flex;gap:8px;margin-bottom:12px}
.cm-custom-row input{flex:1;padding:6px 10px;border:1px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text);font-size:12px;outline:none}
.cm-custom-row input:focus{border-color:var(--accent)}
.cm-list{display:flex;flex-direction:column;gap:6px;max-height:400px;overflow-y:auto;padding-right:2px}
/* 折叠态（默认） */
.cm-row{border:1px solid var(--border);border-radius:8px;overflow:hidden;transition:border-color 0.15s,box-shadow 0.15s}
.cm-row:hover{border-color:rgba(124,131,247,0.3)}
.cm-row-collapsed{display:flex;align-items:center;gap:8px;padding:9px 10px;min-height:42px}
.cm-row-grip{color:var(--muted);font-size:15px;flex-shrink:0;cursor:grab;padding:2px 4px;border-radius:4px;transition:color 0.15s,background 0.15s;user-select:none}
.cm-row-grip:hover{color:var(--accent);background:rgba(124,131,247,0.1)}
.cm-row-grip:active{cursor:grabbing}
.cm-row-summary{flex:1;min-width:0;overflow:hidden}
.cm-row-label{display:block;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cm-row-preview{display:block;font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
.cm-row-edit{flex-shrink:0;padding:3px 7px;border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer;font-size:12px;border-radius:5px;transition:all 0.15s}
.cm-row-edit:hover{border-color:var(--accent);color:var(--accent);background:rgba(124,131,247,0.08)}
.cm-row-del{flex-shrink:0;padding:3px 7px;border:none;background:transparent;color:var(--muted);cursor:pointer;font-size:12px;border-radius:5px;transition:color 0.15s,background 0.15s}
.cm-row-del:hover{color:#e05c5c;background:rgba(224,92,92,0.1)}
/* 展开态 */
.cm-row-expanded{display:flex;flex-direction:column;border-top:1px solid var(--border)}
.cm-row-expanded-hdr{display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(124,131,247,0.04);border-bottom:1px solid var(--border)}
.cm-row-title{flex:1;border:none;background:transparent;color:var(--text);font-size:13px;font-weight:500;outline:none;padding:0}
.cm-row-collapse{flex-shrink:0;padding:3px 8px;border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer;font-size:11px;border-radius:5px;transition:all 0.15s;white-space:nowrap}
.cm-row-collapse:hover{border-color:var(--accent);color:var(--accent)}
.cm-row-expanded textarea{width:100%;box-sizing:border-box;padding:10px 12px;border:none;background:transparent;color:var(--text);font-size:13px;line-height:1.6;resize:vertical;min-height:80px;outline:none;font-family:inherit}
/* 拖拽中 */
.cm-row-dragging{opacity:0.4;border:2px dashed var(--accent)}
.cm-row-drag-over{border-color:var(--accent);box-shadow:0 0 0 2px rgba(124,131,247,0.25)}
/* ── 모달 공통 ── */
.modal-actions{display:flex;justify-content:space-between;align-items:center;margin-top:20px;gap:8px}
.modal-actions-right{display:flex;gap:8px}
.modal-btn{flex:1;min-width:80px}
.modal-btn-delete{min-width:60px}
@media (max-width:1024px){.geo-layout{flex-direction:column}}
</style>
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
  const panel     = container.querySelector('#chars-panel');
  const toggle    = container.querySelector('#chars-panel-toggle');
  const chevron   = container.querySelector('#chars-panel-chevron');
  const expandBtn = container.querySelector('#chars-panel-expand');

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

  if (toggle) toggle.addEventListener('click', () => panel.classList.contains('collapsed') ? expandPanel() : collapsePanel());
  if (expandBtn) expandBtn.addEventListener('click', expandPanel);

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
    if (title)      title.textContent = '👥 人物列表';
    if (charsBody)  charsBody.style.display = 'flex';
    if (geoBody)    geoBody.style.display   = 'none';
    if (searchInput) searchInput.value = '';
    renderPanelList('');
  } else {
    if (title)     title.textContent = '🗺️ 地理结构';
    if (charsBody) charsBody.style.display = 'none';
    if (geoBody)   geoBody.style.display   = 'flex';
  }
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

// ── 인물 패널 ──────────────────────────────────────────────────

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
    list.innerHTML = '<div class="tl-empty">' + (query ? '无匹配人物' : '暂无人物') + '</div>';
    return;
  }

  list.innerHTML = chars.map(function(c) {
    const city    = State.allCities.find(function(ci) { return ci.id === c.city_id; });
    const country = city ? State.allCountries.find(function(co) { return co.id === city.country_id; }) : null;
    const location = [country && country.name, city && city.name].filter(Boolean).join(' › ');
    const ageStr   = (c.base_age != null && c.base_age !== '') ? String(c.base_age) : '';
    const meta     = [ageStr ? ageStr + '岁' : '', location].filter(Boolean).join(' · ');
    const av = c.avatar_url
      ? '<div class="tl-ci-av"><img src="' + escHtml(c.avatar_url) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/></div>'
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
    renderCharactersTab();
    return;
  }

  if (clearBtn) clearBtn.style.display = 'block';
  const char = State.allChars.find(function(c) { return c.id === charId; });
  if (!char) return;
  const grid = container.querySelector('#chars-grid');
  if (!grid) return;

  const city    = State.allCities.find(function(ci) { return ci.id === char.city_id; });
  const country = city ? State.allCountries.find(function(co) { return co.id === city.country_id; }) : null;
  const location = [country && country.name, city && city.name].filter(Boolean).join(' › ');
  const hasAge = char.base_age != null && char.base_age !== '';

  grid.innerHTML =
    '<div class="intro-card" data-id="' + char.id + '">' +
      '<div style="display:flex;gap:12px;margin-bottom:12px">' +
        '<div class="intro-avatar">' +
          (char.avatar_url ? '<img src="' + escHtml(char.avatar_url) + '"/>' : escHtml(char.name.charAt(0))) +
        '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-weight:600;margin-bottom:4px;font-size:15px">' + escHtml(char.name) + '</div>' +
          (location ? '<div style="font-size:12px;color:var(--muted)">' + escHtml(location) + '</div>' : '') +
          (hasAge ? '<div style="font-size:12px;color:var(--muted)">年龄：' + escHtml(String(char.base_age)) + '</div>' : '') +
        '</div>' +
      '</div>' +
      (char.description ? '<div style="font-size:13px;line-height:1.6">' + escHtml(char.description) + '</div>' : '') +
    '</div>';

  if (isEditor()) {
    const card = grid.querySelector('.intro-card');
    if (card) card.addEventListener('click', function() { openCharModal(char); });
  }
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
