// pages/characters.js
// 主入口文件 - 协调所有模块

import { supaClient } from '../core/supabase-client.js';
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
  
  // 设置所有模态框
  setupCharModal(container);
  setupCountryModal(container);
  setupCityModal(container);
  setupLandmarkModal(container);
  
  // 绑定控制
  bindControls(container);
  onAuthChange(() => updateUI(container));
  
  // 加载数据
  await loadAllData();
  
  // 渲染当前标签
  renderCurrentTab(container);
  
  // 订阅实时更新
  subscribeRealtime(() => renderCurrentTab(container));
  
  updateUI(container);
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
  
  <!-- Characters Tab -->
  <div class="intro-content" id="tab-characters">
    <div class="intro-header">
      <h2>👥 人物介绍</h2>
      <button class="btn bp" id="chars-add-btn" style="display:none">＋ 新建</button>
    </div>
    <div class="intro-grid" id="chars-grid"></div>
  </div>
  
  <!-- Geography Tab (详细HTML略) -->
  <div class="intro-content geo-layout" id="tab-geography" style="display:none">
    <!-- 地理树、详情、搜索 -->
  </div>
</div>

<!-- 所有模态框 (略) -->

<style>
  /* 所有样式 (略) */
</style>
  `;
}

function bindControls(container) {
  // 标签切换
  container.querySelectorAll('.intro-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      switchTab(tabName, container);
    });
  });
  
  // 绑定人物标签
  bindCharactersTab(container);
}

function switchTab(tabName, container) {
  State.setCurrentTab(tabName);
  
  container.querySelectorAll('.intro-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  
  container.querySelectorAll('.intro-content').forEach(content => {
    content.style.display = content.id === `tab-${tabName}` ? 
      (tabName === 'geography' ? 'flex' : 'block') : 'none';
  });
  
  renderCurrentTab(container);
}

function renderCurrentTab(container) {
  if (State.currentTab === 'characters') {
    renderCharactersTab(container);
  } else if (State.currentTab === 'geography') {
    initGeographyTab(container);
  }
}

function updateUI(container) {
  const editor = isEditor();
  container.querySelector('#chars-add-btn').style.display = editor ? 'block' : 'none';
  container.querySelector('#add-country-btn')?.style.display = editor ? 'block' : 'none';
}
