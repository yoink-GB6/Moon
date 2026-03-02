// pages/characters.js  
// Introduction 页面：人物介绍 + 地理信息系统

import { supaClient, setSyncStatus } from '../core/supabase-client.js';
import { isEditor, onAuthChange } from '../core/auth.js';
import { showToast, escHtml } from '../core/ui.js';

// 数据
let allChars = [];
let allCountries = [];
let allCities = [];
let allLandmarks = [];
let currentTab = 'characters';
let selectedCountry = null;
let selectedCity = null;
let searchQuery = '';
let pageContainer = null;

// Realtime channels
let charsChannel = null;
let geoChannel = null;

export async function mount(container) {
  pageContainer = container;
  container.innerHTML = buildHTML();
  bindControls(container);
  onAuthChange(() => updateUI(container));
  
  await loadAllData(container);
  subscribeRealtime();
  switchTab('characters', container);
  updateUI(container);
}

export function unmount() {
  charsChannel && supaClient.removeChannel(charsChannel);
  geoChannel && supaClient.removeChannel(geoChannel);
}

function buildHTML() {
  return `
<div class="intro-page">
  <!-- Tabs -->
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
  
  <!-- Geography Tab -->
  <div class="intro-content geo-layout" id="tab-geography" style="display:none">
    <!-- Left: Country Tree -->
    <div class="geo-sidebar geo-tree">
      <div class="geo-tree-header">
        <h3>地理结构</h3>
        <button class="btn bn" id="add-country-btn" style="display:none">＋ 国家</button>
      </div>
      <div id="geo-tree-list" class="geo-tree-list"></div>
    </div>
    
    <!-- Center: Detail View -->
    <div class="geo-main">
      <div id="geo-detail-view" class="geo-detail"></div>
    </div>
    
    <!-- Right: Search Sidebar -->
    <div class="geo-sidebar geo-search">
      <div class="geo-search-box">
        <input type="text" id="geo-search-input" placeholder="搜索国家、城市、人物、地标..."/>
      </div>
      <div id="geo-search-results" class="geo-search-results"></div>
    </div>
  </div>
</div>

<style>
.intro-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.intro-tabs {
  display: flex;
  gap: 4px;
  padding: 16px 20px 0 20px;
  border-bottom: 2px solid var(--border);
  background: var(--bg);
}

.intro-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  position: relative;
}

.intro-tab:hover {
  color: var(--text);
  background: rgba(124,131,247,0.05);
}

.intro-tab.active {
  color: var(--accent);
}

.intro-tab.active::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--accent);
}

.intro-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.intro-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 20px;
}

.intro-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.intro-card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.intro-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  border-color: var(--accent);
}

.intro-card-header {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}

.intro-avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: var(--accent);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 600;
  overflow: hidden;
  flex-shrink: 0;
}

.intro-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Geography Layout */
.geo-layout {
  display: flex;
  gap: 0;
  padding: 0;
  overflow: hidden;
}

.geo-sidebar {
  width: 280px;
  border-right: 1px solid var(--border);
  background: var(--bg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.geo-tree {
  border-right: 1px solid var(--border);
}

.geo-search {
  border-left: 1px solid var(--border);
  border-right: none;
}

.geo-main {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.geo-tree-header, .geo-search-box {
  padding: 16px;
  border-bottom: 1px solid var(--border);
}

.geo-tree-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.geo-tree-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.geo-tree-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.geo-tree-item {
  padding: 8px 12px;
  margin: 2px 0;
  cursor: pointer;
  border-radius: 6px;
  user-select: none;
}

.geo-tree-item:hover {
  background: rgba(124,131,247,0.08);
}

.geo-tree-item.active {
  background: rgba(124,131,247,0.12);
  color: var(--accent);
}

.geo-tree-country {
  font-weight: 600;
}

.geo-tree-city {
  margin-left: 20px;
  font-size: 13px;
}

.geo-tree-toggle {
  display: inline-block;
  width: 16px;
  text-align: center;
  margin-right: 4px;
}

.geo-detail {
  max-width: 800px;
}

.geo-detail h2 {
  margin: 0 0 24px 0;
  font-size: 28px;
}

.geo-detail-section {
  margin-bottom: 32px;
}

.geo-detail-section h3 {
  font-size: 18px;
  margin: 0 0 12px 0;
  color: var(--accent);
}

.geo-detail-field {
  margin-bottom: 16px;
}

.geo-detail-label {
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 4px;
}

.geo-detail-value {
  font-size: 14px;
  line-height: 1.6;
}

.geo-landmark-item {
  padding: 12px;
  margin: 8px 0;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.geo-landmark-name {
  font-weight: 600;
  margin-bottom: 4px;
}

.geo-person-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  margin: 4px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 16px;
  font-size: 13px;
}

.geo-person-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--accent);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  overflow: hidden;
}

.geo-person-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

#geo-search-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 13px;
}

.geo-search-results {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.geo-search-group {
  margin-bottom: 16px;
}

.geo-search-group-title {
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 8px;
  padding: 0 8px;
}

.geo-search-item {
  padding: 8px 12px;
  margin: 2px 0;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}

.geo-search-item:hover {
  background: rgba(124,131,247,0.08);
}

.geo-empty {
  text-align: center;
  padding: 40px;
  color: var(--muted);
}

@media (max-width: 1024px) {
  .geo-layout {
    flex-direction: column;
  }
  .geo-sidebar {
    width: 100%;
    max-height: 300px;
  }
}
</style>
  `;
}

function bindControls(container) {
  // Tab switching
  container.querySelectorAll('.intro-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.tab, container);
    });
  });
  
  // Characters add button
  container.querySelector('#chars-add-btn')?.addEventListener('click', () => {
    showToast('人物编辑功能（使用原有模态框）');
  });
  
  // Geography add buttons
  container.querySelector('#add-country-btn')?.addEventListener('click', () => {
    showToast('添加国家功能');
  });
  
  // Search input
  container.querySelector('#geo-search-input')?.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
    renderSearchResults(container);
  });
}

function switchTab(tabName, container) {
  currentTab = tabName;
  
  container.querySelectorAll('.intro-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  
  container.querySelectorAll('.intro-content').forEach(content => {
    content.style.display = content.id === `tab-${tabName}` ? (tabName === 'geography' ? 'flex' : 'block') : 'none';
  });
  
  if (tabName === 'geography') {
    renderGeoTree(container);
    renderSearchResults(container);
  }
}

function updateUI(container) {
  const editor = isEditor();
  container.querySelector('#chars-add-btn').style.display = editor ? 'block' : 'none';
  container.querySelector('#add-country-btn').style.display = editor ? 'block' : 'none';
}

// ========== Data Loading ==========

async function loadAllData(container) {
  setSyncStatus('syncing');
  try {
    const [chars, countries, cities, landmarks] = await Promise.all([
      supaClient.from('characters').select('*').order('name'),
      supaClient.from('countries').select('*').order('name'),
      supaClient.from('cities').select('*').order('name'),
      supaClient.from('landmarks').select('*').order('created_at')
    ]);
    
    allChars = chars.data || [];
    allCountries = countries.data || [];
    allCities = cities.data || [];
    allLandmarks = landmarks.data || [];
    
    renderCharacters(container);
    setSyncStatus('ok');
  } catch (e) {
    console.error('Failed to load data:', e);
    showToast('加载数据失败');
    setSyncStatus('error');
  }
}

// ========== Characters Tab ==========

function renderCharacters(container) {
  const grid = container.querySelector('#chars-grid');
  if (!allChars.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted)">暂无人物</div>';
    return;
  }
  
  grid.innerHTML = allChars.map(char => {
    const city = allCities.find(c => c.id === char.city_id);
    const country = city ? allCountries.find(co => co.id === city.country_id) : null;
    const location = [country?.name, city?.name].filter(Boolean).join(' · ') || '未知';
    
    return `
      <div class="intro-card" data-id="${char.id}">
        <div class="intro-card-header">
          <div class="intro-avatar">
            ${char.avatar_url ? `<img src="${char.avatar_url}"/>` : escHtml(char.name.charAt(0))}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;margin-bottom:4px">${escHtml(char.name)}</div>
            <div style="font-size:12px;color:var(--muted)">${location}</div>
            ${char.age ? `<div style="font-size:12px;color:var(--muted)">年龄: ${escHtml(char.age)}</div>` : ''}
          </div>
        </div>
        ${char.description ? `<div style="font-size:13px;line-height:1.5">${escHtml(char.description)}</div>` : ''}
      </div>
    `;
  }).join('');
}

// ========== Geography Tab ==========

function renderGeoTree(container) {
  const list = container.querySelector('#geo-tree-list');
  if (!allCountries.length && !allCities.some(c => !c.country_id)) {
    list.innerHTML = '<div class="geo-empty">暂无数据</div>';
    return;
  }
  
  let html = '';
  
  // Countries with cities
  allCountries.forEach(country => {
    const cities = allCities.filter(c => c.country_id === country.id);
    const isExpanded = true; // Always expanded for now
    
    html += `
      <div class="geo-tree-item geo-tree-country ${selectedCountry?.id === country.id && !selectedCity ? 'active' : ''}"
           data-type="country" data-id="${country.id}">
        <span class="geo-tree-toggle">${isExpanded ? '▼' : '▶'}</span>
        🏛️ ${escHtml(country.name)}
      </div>
    `;
    
    if (isExpanded) {
      cities.forEach(city => {
        html += `
          <div class="geo-tree-item geo-tree-city ${selectedCity?.id === city.id ? 'active' : ''}"
               data-type="city" data-id="${city.id}">
            🏙️ ${escHtml(city.name)}
          </div>
        `;
      });
    }
  });
  
  // Cities without country
  const noCities = allCities.filter(c => !c.country_id);
  if (noCities.length) {
    html += `
      <div class="geo-tree-item geo-tree-country">
        <span class="geo-tree-toggle">▼</span>
        🌍 无国家
      </div>
    `;
    noCities.forEach(city => {
      html += `
        <div class="geo-tree-item geo-tree-city ${selectedCity?.id === city.id ? 'active' : ''}"
             data-type="city" data-id="${city.id}">
          🏙️ ${escHtml(city.name)}
        </div>
      `;
    });
  }
  
  list.innerHTML = html;
  
  // Bind click events
  list.querySelectorAll('.geo-tree-item').forEach(item => {
    item.addEventListener('click', () => {
      const type = item.dataset.type;
      const id = parseInt(item.dataset.id);
      
      if (type === 'country') {
        selectedCountry = allCountries.find(c => c.id === id);
        selectedCity = null;
      } else if (type === 'city') {
        selectedCity = allCities.find(c => c.id === id);
        selectedCountry = allCountries.find(co => co.id === selectedCity.country_id);
      }
      
      renderGeoDetail(container);
      renderGeoTree(container);
    });
  });
}

function renderGeoDetail(container) {
  const detail = container.querySelector('#geo-detail-view');
  
  if (!selectedCity && !selectedCountry) {
    detail.innerHTML = '<div class="geo-empty">选择一个国家或城市查看详情</div>';
    return;
  }
  
  if (selectedCity) {
    renderCityDetail(detail);
  } else if (selectedCountry) {
    renderCountryDetail(detail);
  }
}

function renderCountryDetail(detail) {
  const cities = allCities.filter(c => c.country_id === selectedCountry.id);
  
  detail.innerHTML = `
    <h2>🏛️ ${escHtml(selectedCountry.name)}</h2>
    
    ${selectedCountry.description ? `
      <div class="geo-detail-section">
        <h3>概述</h3>
        <div class="geo-detail-value">${escHtml(selectedCountry.description)}</div>
      </div>
    ` : ''}
    
    <div class="geo-detail-section">
      <h3>城市 (${cities.length})</h3>
      ${cities.length ? cities.map(city => `
        <div class="geo-tree-item geo-tree-city" style="margin:4px 0">
          🏙️ ${escHtml(city.name)}
        </div>
      `).join('') : '<div class="geo-empty" style="padding:20px">暂无城市</div>'}
    </div>
  `;
}

function renderCityDetail(detail) {
  const landmarks = allLandmarks.filter(l => l.city_id === selectedCity.id);
  const people = allChars.filter(c => c.city_id === selectedCity.id);
  const country = allCountries.find(c => c.id === selectedCity.country_id);
  
  detail.innerHTML = `
    <h2>🏙️ ${escHtml(selectedCity.name)}</h2>
    ${country ? `<div style="color:var(--muted);margin-bottom:24px">所属: ${escHtml(country.name)}</div>` : ''}
    
    ${selectedCity.overview ? `
      <div class="geo-detail-section">
        <h3>概述</h3>
        <div class="geo-detail-value">${escHtml(selectedCity.overview)}</div>
      </div>
    ` : ''}
    
    ${selectedCity.geography ? `
      <div class="geo-detail-section">
        <h3>地理位置</h3>
        <div class="geo-detail-value">${escHtml(selectedCity.geography)}</div>
      </div>
    ` : ''}
    
    ${selectedCity.climate ? `
      <div class="geo-detail-section">
        <h3>气候</h3>
        <div class="geo-detail-value">${escHtml(selectedCity.climate)}</div>
      </div>
    ` : ''}
    
    ${selectedCity.structure ? `
      <div class="geo-detail-section">
        <h3>城市结构</h3>
        <div class="geo-detail-value">${escHtml(selectedCity.structure)}</div>
      </div>
    ` : ''}
    
    <div class="geo-detail-section">
      <h3>地标建筑 (${landmarks.length})</h3>
      ${landmarks.length ? landmarks.map(lm => `
        <div class="geo-landmark-item">
          <div class="geo-landmark-name">${escHtml(lm.name)}</div>
          ${lm.description ? `<div style="font-size:13px;color:var(--muted)">${escHtml(lm.description)}</div>` : ''}
        </div>
      `).join('') : '<div class="geo-empty" style="padding:20px">暂无地标</div>'}
    </div>
    
    <div class="geo-detail-section">
      <h3>关联人物 (${people.length})</h3>
      <div>
        ${people.length ? people.map(p => `
          <div class="geo-person-item">
            <div class="geo-person-avatar">
              ${p.avatar_url ? `<img src="${p.avatar_url}"/>` : escHtml(p.name.charAt(0))}
            </div>
            <span>${escHtml(p.name)}</span>
            ${p.age ? `<span style="color:var(--muted);font-size:12px">${escHtml(p.age)}岁</span>` : ''}
          </div>
        `).join('') : '<div class="geo-empty" style="padding:20px">暂无关联人物</div>'}
      </div>
    </div>
  `;
}

function renderSearchResults(container) {
  const results = container.querySelector('#geo-search-results');
  
  if (!searchQuery) {
    // Show statistics
    results.innerHTML = `
      <div class="geo-search-group">
        <div class="geo-search-group-title">📊 统计</div>
        <div style="padding:8px 12px;font-size:13px">
          <div>📍 国家: ${allCountries.length}</div>
          <div>🏙️ 城市: ${allCities.length}</div>
          <div>👥 人物: ${allChars.length}</div>
          <div>🏛️ 地标: ${allLandmarks.length}</div>
        </div>
      </div>
    `;
    return;
  }
  
  // Search
  const foundCountries = allCountries.filter(c => c.name.toLowerCase().includes(searchQuery));
  const foundCities = allCities.filter(c => c.name.toLowerCase().includes(searchQuery));
  const foundPeople = allChars.filter(c => c.name.toLowerCase().includes(searchQuery));
  const foundLandmarks = allLandmarks.filter(l => l.name.toLowerCase().includes(searchQuery));
  
  let html = '';
  
  if (foundCountries.length) {
    html += `
      <div class="geo-search-group">
        <div class="geo-search-group-title">📍 国家 (${foundCountries.length})</div>
        ${foundCountries.map(c => `
          <div class="geo-search-item">🏛️ ${escHtml(c.name)}</div>
        `).join('')}
      </div>
    `;
  }
  
  if (foundCities.length) {
    html += `
      <div class="geo-search-group">
        <div class="geo-search-group-title">🏙️ 城市 (${foundCities.length})</div>
        ${foundCities.map(c => `
          <div class="geo-search-item">🏙️ ${escHtml(c.name)}</div>
        `).join('')}
      </div>
    `;
  }
  
  if (foundPeople.length) {
    html += `
      <div class="geo-search-group">
        <div class="geo-search-group-title">👥 人物 (${foundPeople.length})</div>
        ${foundPeople.map(p => `
          <div class="geo-search-item">👤 ${escHtml(p.name)}</div>
        `).join('')}
      </div>
    `;
  }
  
  if (foundLandmarks.length) {
    html += `
      <div class="geo-search-group">
        <div class="geo-search-group-title">🏛️ 地标 (${foundLandmarks.length})</div>
        ${foundLandmarks.map(l => `
          <div class="geo-search-item">🏛️ ${escHtml(l.name)}</div>
        `).join('')}
      </div>
    `;
  }
  
  if (!html) {
    html = '<div class="geo-empty">无搜索结果</div>';
  }
  
  results.innerHTML = html;
}

// ========== Realtime ==========

function subscribeRealtime() {
  charsChannel = supaClient.channel('chars-geo')
    .on('postgres_changes', { event: '*', table: 'characters' }, () => loadAllData(pageContainer))
    .subscribe();
  
  geoChannel = supaClient.channel('geo-data')
    .on('postgres_changes', { event: '*', table: 'countries' }, () => loadAllData(pageContainer))
    .on('postgres_changes', { event: '*', table: 'cities' }, () => loadAllData(pageContainer))
    .on('postgres_changes', { event: '*', table: 'landmarks' }, () => loadAllData(pageContainer))
    .subscribe();
}
