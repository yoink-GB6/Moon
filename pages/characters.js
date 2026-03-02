// pages/characters.js
// Introduction 页面：人物介绍 + 国家势力

import { supaClient, setSyncStatus } from '../core/supabase-client.js';
import { isEditor, onAuthChange } from '../core/auth.js';
import { showToast, escHtml, confirmDialog } from '../core/ui.js';

// 数据
let allChars = [];
let allFactions = [];
let editCharId = null;
let editFactionId = null;
let pendingAvatar = undefined;
let pendingAvatarIsFile = false;
let charsRealtimeCh = null;
let factionsRealtimeCh = null;
let currentTab = 'characters';
let pageContainer = null;

export async function mount(container) {
  pageContainer = container;
  container.innerHTML = buildHTML();
  bindControls(container);
  onAuthChange(() => updateUI(container));
  updateUI(container);
  
  await Promise.all([
    fetchCharacters(container),
    fetchFactions(container)
  ]);
  
  subscribeRealtime();
  switchTab('characters', container);
}

export function unmount() {
  charsRealtimeCh && supaClient.removeChannel(charsRealtimeCh);
  factionsRealtimeCh && supaClient.removeChannel(factionsRealtimeCh);
}

function buildHTML() {
  return `
<div class="intro-page">
  <!-- Tab Navigation -->
  <div class="intro-tabs">
    <button class="intro-tab active" data-tab="characters">
      <span class="tab-icon">👥</span>
      <span class="tab-label">人物介绍</span>
    </button>
    <button class="intro-tab" data-tab="factions">
      <span class="tab-icon">🏛️</span>
      <span class="tab-label">国家及势力</span>
    </button>
  </div>
  
  <!-- Characters Tab -->
  <div class="intro-content" id="tab-characters">
    <div class="intro-header">
      <h2>👥 人物介绍</h2>
      <button class="btn bp" id="chars-add-btn" style="display:none">＋ 新建人物</button>
    </div>
    <div class="intro-grid" id="chars-grid"></div>
  </div>
  
  <!-- Factions Tab -->
  <div class="intro-content" id="tab-factions" style="display:none">
    <div class="intro-header">
      <h2>🏛️ 国家及势力</h2>
      <button class="btn bp" id="factions-add-btn" style="display:none">＋ 新建势力</button>
    </div>
    <div class="intro-grid" id="factions-grid"></div>
  </div>
</div>

<!-- Character Modal -->
<div id="char-modal" class="tl-modal-overlay">
  <div class="tl-modal" style="max-width:480px" onmousedown="event.stopPropagation()">
    <h2 id="char-modal-title">新建人物</h2>
    
    <label>名字</label>
    <input id="char-name" type="text" autocomplete="off"/>
    
    <label>年龄（可选）</label>
    <input id="char-age" type="text" placeholder="25 或 25-30"/>
    
    <label>描述（可选）</label>
    <textarea id="char-desc" rows="3" placeholder="人物介绍..."></textarea>
    
    <label>头像</label>
    <div class="avatar-section">
      <div id="char-avatar-preview" class="avatar-preview">
        <span id="char-avatar-letter">?</span>
        <div id="char-avatar-clear" class="avatar-clear">✕</div>
      </div>
      <div class="avatar-buttons">
        <button class="btn bn" id="char-upload-btn">📁 上传</button>
        <button class="btn bn" id="char-url-btn">🔗 链接</button>
      </div>
      <input type="file" id="char-file-input" accept="image/*" style="display:none"/>
      <div id="char-url-input-row" style="display:none;margin-top:8px">
        <input id="char-url-input" type="url" placeholder="https://..."/>
        <button class="btn bp" id="char-url-confirm">确定</button>
      </div>
    </div>
    
    <div class="modal-buttons">
      <button class="btn bp" id="char-save-btn">保存</button>
      <button class="btn bn" id="char-cancel-btn">取消</button>
    </div>
  </div>
</div>

<!-- Faction Modal -->
<div id="faction-modal" class="tl-modal-overlay">
  <div class="tl-modal" style="max-width:480px" onmousedown="event.stopPropagation()">
    <h2 id="faction-modal-title">新建势力</h2>
    
    <label>名称</label>
    <input id="faction-name" type="text" autocomplete="off"/>
    
    <label>类型</label>
    <select id="faction-type">
      <option value="country">国家</option>
      <option value="organization">组织</option>
      <option value="faction">势力</option>
      <option value="other">其他</option>
    </select>
    
    <label>描述（可选）</label>
    <textarea id="faction-desc" rows="3" placeholder="势力介绍..."></textarea>
    
    <label>旗帜/徽章</label>
    <div class="avatar-section">
      <div id="faction-flag-preview" class="avatar-preview">
        <span id="faction-flag-letter">?</span>
        <div id="faction-flag-clear" class="avatar-clear">✕</div>
      </div>
      <div class="avatar-buttons">
        <button class="btn bn" id="faction-upload-btn">📁 上传</button>
        <button class="btn bn" id="faction-url-btn">🔗 链接</button>
      </div>
      <input type="file" id="faction-file-input" accept="image/*" style="display:none"/>
      <div id="faction-url-input-row" style="display:none;margin-top:8px">
        <input id="faction-url-input" type="url" placeholder="https://..."/>
        <button class="btn bp" id="faction-url-confirm">确定</button>
      </div>
    </div>
    
    <div class="modal-buttons">
      <button class="btn bp" id="faction-save-btn">保存</button>
      <button class="btn bn" id="faction-cancel-btn">取消</button>
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
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border-radius: 8px 8px 0 0;
  transition: all 0.2s;
  position: relative;
}

.intro-tab:hover {
  background: rgba(124, 131, 247, 0.08);
  color: var(--text);
}

.intro-tab.active {
  background: transparent;
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

.tab-icon {
  font-size: 18px;
}

.intro-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.intro-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.intro-header h2 {
  margin: 0;
  font-size: 20px;
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
  transition: all 0.2s;
  cursor: pointer;
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
  flex-shrink: 0;
  overflow: hidden;
}

.intro-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.intro-card-info {
  flex: 1;
  min-width: 0;
}

.intro-card-name {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
}

.intro-card-meta {
  font-size: 12px;
  color: var(--muted);
}

.intro-card-desc {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text);
  max-height: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.avatar-section {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 16px;
}

.avatar-preview {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: var(--accent);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  font-weight: 600;
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
}

.avatar-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-clear {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 24px;
  height: 24px;
  background: rgba(0,0,0,0.6);
  color: white;
  border-radius: 50%;
  display: none;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  cursor: pointer;
}

.avatar-preview:hover .avatar-clear {
  display: flex;
}

.avatar-buttons {
  display: flex;
  gap: 8px;
  flex-direction: column;
}

.modal-buttons {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.modal-buttons button {
  flex: 1;
}

@media (max-width: 768px) {
  .intro-grid {
    grid-template-columns: 1fr;
  }
  
  .intro-tabs {
    padding: 12px 16px 0 16px;
  }
  
  .intro-tab {
    padding: 10px 16px;
  }
  
  .intro-content {
    padding: 16px;
  }
}
</style>
  `;
}

function bindControls(container) {
  // Tab switching
  container.querySelectorAll('.intro-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      switchTab(tabName, container);
    });
  });
  
  // Characters
  container.querySelector('#chars-add-btn')?.addEventListener('click', () => openCharModal(container, null));
  
  // Factions
  container.querySelector('#factions-add-btn')?.addEventListener('click', () => openFactionModal(container, null));
  
  // Character modal
  setupCharModal(container);
  
  // Faction modal
  setupFactionModal(container);
}

function switchTab(tabName, container) {
  currentTab = tabName;
  
  // Update tab buttons
  container.querySelectorAll('.intro-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  
  // Update content
  container.querySelectorAll('.intro-content').forEach(content => {
    content.style.display = content.id === `tab-${tabName}` ? 'block' : 'none';
  });
}

function updateUI(container) {
  const editor = isEditor();
  container.querySelector('#chars-add-btn').style.display = editor ? 'block' : 'none';
  container.querySelector('#factions-add-btn').style.display = editor ? 'block' : 'none';
}

// ========== Characters ==========

async function fetchCharacters(container) {
  try {
    setSyncStatus('syncing');
    const { data, error } = await supaClient.from('characters').select('*').order('created_at');
    if (error) throw error;
    
    allChars = data || [];
    renderCharacters(container);
    setSyncStatus('ok');
  } catch (e) {
    console.error('Failed to fetch characters:', e);
    showToast('加载人物失败');
    setSyncStatus('error');
  }
}

function renderCharacters(container) {
  const grid = container.querySelector('#chars-grid');
  if (!allChars.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted)">暂无人物</div>';
    return;
  }
  
  grid.innerHTML = allChars.map(char => `
    <div class="intro-card" data-id="${char.id}">
      <div class="intro-card-header">
        <div class="intro-avatar" style="background:${char.color || '#7c83f7'}">
          ${char.avatar_url ? `<img src="${char.avatar_url}" alt="${escHtml(char.name)}"/>` : escHtml(char.name.charAt(0))}
        </div>
        <div class="intro-card-info">
          <div class="intro-card-name">${escHtml(char.name)}</div>
          ${char.age ? `<div class="intro-card-meta">年龄: ${escHtml(char.age)}</div>` : ''}
        </div>
      </div>
      ${char.description ? `<div class="intro-card-desc">${escHtml(char.description)}</div>` : ''}
    </div>
  `).join('');
  
  // Bind click events
  if (isEditor()) {
    grid.querySelectorAll('.intro-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = parseInt(card.dataset.id);
        const char = allChars.find(c => c.id === id);
        if (char) openCharModal(container, char);
      });
    });
  }
}

function setupCharModal(container) {
  const modal = container.querySelector('#char-modal');
  const overlay = modal;
  
  // File upload
  container.querySelector('#char-upload-btn')?.addEventListener('click', () => {
    container.querySelector('#char-file-input').click();
  });
  
  container.querySelector('#char-file-input')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      pendingAvatar = file;
      pendingAvatarIsFile = true;
      previewAvatar(file, container, 'char');
    }
  });
  
  // URL input
  container.querySelector('#char-url-btn')?.addEventListener('click', () => {
    const row = container.querySelector('#char-url-input-row');
    row.style.display = row.style.display === 'none' ? 'flex' : 'none';
  });
  
  container.querySelector('#char-url-confirm')?.addEventListener('click', () => {
    const url = container.querySelector('#char-url-input').value.trim();
    if (url) {
      pendingAvatar = url;
      pendingAvatarIsFile = false;
      updateAvatarPreview(url, container, 'char');
      container.querySelector('#char-url-input-row').style.display = 'none';
    }
  });
  
  // Clear avatar
  container.querySelector('#char-avatar-clear')?.addEventListener('click', () => {
    pendingAvatar = null;
    pendingAvatarIsFile = false;
    updateAvatarPreview(null, container, 'char');
  });
  
  // Save & Cancel
  container.querySelector('#char-save-btn')?.addEventListener('click', () => saveCharacter(container));
  container.querySelector('#char-cancel-btn')?.addEventListener('click', () => closeModal(modal));
  
  // Click outside to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal(modal);
  });
}

function openCharModal(container, char) {
  editCharId = char?.id || null;
  pendingAvatar = undefined;
  pendingAvatarIsFile = false;
  
  const modal = container.querySelector('#char-modal');
  container.querySelector('#char-modal-title').textContent = char ? '编辑人物' : '新建人物';
  container.querySelector('#char-name').value = char?.name || '';
  container.querySelector('#char-age').value = char?.age || '';
  container.querySelector('#char-desc').value = char?.description || '';
  container.querySelector('#char-url-input-row').style.display = 'none';
  container.querySelector('#char-url-input').value = '';
  
  updateAvatarPreview(char?.avatar_url, container, 'char', char?.name);
  
  modal.classList.add('show');
  setTimeout(() => container.querySelector('#char-name').focus(), 100);
}

function closeModal(modal) {
  modal.classList.remove('show');
}

async function saveCharacter(container) {
  const name = container.querySelector('#char-name').value.trim();
  if (!name) {
    showToast('请输入名字');
    return;
  }
  
  const age = container.querySelector('#char-age').value.trim();
  const description = container.querySelector('#char-desc').value.trim();
  
  try {
    let avatarUrl = null;
    
    // Upload avatar if needed
    if (pendingAvatar) {
      if (pendingAvatarIsFile) {
        const file = pendingAvatar;
        const ext = file.name.split('.').pop();
        const filename = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;
        
        const { data, error } = await supaClient.storage
          .from('avatars')
          .upload(filename, file, { upsert: true });
        
        if (error) throw error;
        
        const { data: urlData } = supaClient.storage.from('avatars').getPublicUrl(data.path);
        avatarUrl = urlData.publicUrl;
      } else {
        avatarUrl = pendingAvatar;
      }
    } else if (pendingAvatar === null && editCharId) {
      avatarUrl = null;
    }
    
    const payload = {
      name,
      age: age || null,
      description: description || null,
      ...(pendingAvatar !== undefined && { avatar_url: avatarUrl })
    };
    
    if (editCharId) {
      const { error } = await supaClient.from('characters').update(payload).eq('id', editCharId);
      if (error) throw error;
      showToast('人物已更新');
    } else {
      const { error } = await supaClient.from('characters').insert(payload);
      if (error) throw error;
      showToast('人物已创建');
    }
    
    closeModal(container.querySelector('#char-modal'));
    await fetchCharacters(container);
  } catch (e) {
    console.error('Failed to save character:', e);
    showToast('保存失败: ' + e.message);
  }
}

// ========== Factions ==========

async function fetchFactions(container) {
  try {
    setSyncStatus('syncing');
    const { data, error } = await supaClient.from('factions').select('*').order('created_at');
    if (error) throw error;
    
    allFactions = data || [];
    renderFactions(container);
    setSyncStatus('ok');
  } catch (e) {
    console.error('Failed to fetch factions:', e);
    showToast('加载势力失败');
    setSyncStatus('error');
  }
}

function renderFactions(container) {
  const grid = container.querySelector('#factions-grid');
  if (!allFactions.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted)">暂无势力</div>';
    return;
  }
  
  const typeLabels = {
    country: '国家',
    organization: '组织',
    faction: '势力',
    other: '其他'
  };
  
  grid.innerHTML = allFactions.map(faction => `
    <div class="intro-card" data-id="${faction.id}">
      <div class="intro-card-header">
        <div class="intro-avatar" style="background:${faction.color || '#7c83f7'}">
          ${faction.flag_url ? `<img src="${faction.flag_url}" alt="${escHtml(faction.name)}"/>` : escHtml(faction.name.charAt(0))}
        </div>
        <div class="intro-card-info">
          <div class="intro-card-name">${escHtml(faction.name)}</div>
          <div class="intro-card-meta">${typeLabels[faction.type] || faction.type}</div>
        </div>
      </div>
      ${faction.description ? `<div class="intro-card-desc">${escHtml(faction.description)}</div>` : ''}
    </div>
  `).join('');
  
  // Bind click events
  if (isEditor()) {
    grid.querySelectorAll('.intro-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = parseInt(card.dataset.id);
        const faction = allFactions.find(f => f.id === id);
        if (faction) openFactionModal(container, faction);
      });
    });
  }
}

function setupFactionModal(container) {
  const modal = container.querySelector('#faction-modal');
  const overlay = modal;
  
  // File upload
  container.querySelector('#faction-upload-btn')?.addEventListener('click', () => {
    container.querySelector('#faction-file-input').click();
  });
  
  container.querySelector('#faction-file-input')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      pendingAvatar = file;
      pendingAvatarIsFile = true;
      previewAvatar(file, container, 'faction');
    }
  });
  
  // URL input
  container.querySelector('#faction-url-btn')?.addEventListener('click', () => {
    const row = container.querySelector('#faction-url-input-row');
    row.style.display = row.style.display === 'none' ? 'flex' : 'none';
  });
  
  container.querySelector('#faction-url-confirm')?.addEventListener('click', () => {
    const url = container.querySelector('#faction-url-input').value.trim();
    if (url) {
      pendingAvatar = url;
      pendingAvatarIsFile = false;
      updateAvatarPreview(url, container, 'faction');
      container.querySelector('#faction-url-input-row').style.display = 'none';
    }
  });
  
  // Clear
  container.querySelector('#faction-flag-clear')?.addEventListener('click', () => {
    pendingAvatar = null;
    pendingAvatarIsFile = false;
    updateAvatarPreview(null, container, 'faction');
  });
  
  // Save & Cancel
  container.querySelector('#faction-save-btn')?.addEventListener('click', () => saveFaction(container));
  container.querySelector('#faction-cancel-btn')?.addEventListener('click', () => closeModal(modal));
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal(modal);
  });
}

function openFactionModal(container, faction) {
  editFactionId = faction?.id || null;
  pendingAvatar = undefined;
  pendingAvatarIsFile = false;
  
  const modal = container.querySelector('#faction-modal');
  container.querySelector('#faction-modal-title').textContent = faction ? '编辑势力' : '新建势力';
  container.querySelector('#faction-name').value = faction?.name || '';
  container.querySelector('#faction-type').value = faction?.type || 'country';
  container.querySelector('#faction-desc').value = faction?.description || '';
  container.querySelector('#faction-url-input-row').style.display = 'none';
  container.querySelector('#faction-url-input').value = '';
  
  updateAvatarPreview(faction?.flag_url, container, 'faction', faction?.name);
  
  modal.classList.add('show');
  setTimeout(() => container.querySelector('#faction-name').focus(), 100);
}

async function saveFaction(container) {
  const name = container.querySelector('#faction-name').value.trim();
  if (!name) {
    showToast('请输入名称');
    return;
  }
  
  const type = container.querySelector('#faction-type').value;
  const description = container.querySelector('#faction-desc').value.trim();
  
  try {
    let flagUrl = null;
    
    // Upload flag if needed
    if (pendingAvatar) {
      if (pendingAvatarIsFile) {
        const file = pendingAvatar;
        const ext = file.name.split('.').pop();
        const filename = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;
        
        const { data, error } = await supaClient.storage
          .from('avatars')
          .upload(filename, file, { upsert: true });
        
        if (error) throw error;
        
        const { data: urlData } = supaClient.storage.from('avatars').getPublicUrl(data.path);
        flagUrl = urlData.publicUrl;
      } else {
        flagUrl = pendingAvatar;
      }
    } else if (pendingAvatar === null && editFactionId) {
      flagUrl = null;
    }
    
    const payload = {
      name,
      type,
      description: description || null,
      ...(pendingAvatar !== undefined && { flag_url: flagUrl })
    };
    
    if (editFactionId) {
      const { error } = await supaClient.from('factions').update(payload).eq('id', editFactionId);
      if (error) throw error;
      showToast('势力已更新');
    } else {
      const { error } = await supaClient.from('factions').insert(payload);
      if (error) throw error;
      showToast('势力已创建');
    }
    
    closeModal(container.querySelector('#faction-modal'));
    await fetchFactions(container);
  } catch (e) {
    console.error('Failed to save faction:', e);
    showToast('保存失败: ' + e.message);
  }
}

// ========== Avatar Helpers ==========

function previewAvatar(file, container, type) {
  const reader = new FileReader();
  reader.onload = (e) => {
    updateAvatarPreview(e.target.result, container, type);
  };
  reader.readAsDataURL(file);
}

function updateAvatarPreview(url, container, type, name = '?') {
  const previewId = type === 'char' ? '#char-avatar-preview' : '#faction-flag-preview';
  const letterId = type === 'char' ? '#char-avatar-letter' : '#faction-flag-letter';
  
  const preview = container.querySelector(previewId);
  const letter = container.querySelector(letterId);
  
  if (url) {
    preview.style.backgroundImage = `url(${url})`;
    preview.style.backgroundSize = 'cover';
    preview.style.backgroundPosition = 'center';
    letter.style.display = 'none';
  } else {
    preview.style.backgroundImage = 'none';
    letter.style.display = 'block';
    letter.textContent = name?.charAt(0) || '?';
  }
}

// ========== Realtime ==========

function subscribeRealtime() {
  charsRealtimeCh = supaClient.channel('characters-intro')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'characters' }, 
      () => fetchCharacters(pageContainer)
    )
    .subscribe();
  
  factionsRealtimeCh = supaClient.channel('factions-intro')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'factions' }, 
      () => fetchFactions(pageContainer)
    )
    .subscribe();
}
