// pages/library.js
// 指令集页面：支持标签筛选和权限管理

import { supaClient, setSyncStatus, dbError } from '../core/supabase-client.js';
import { isEditor, onAuthChange } from '../core/auth.js';
import { showToast, escHtml, confirmDialog } from '../core/ui.js';

let items = [];           // All library items
let tags = [];            // All available tags
let selectedTags = [];    // Currently selected tags for filtering
let searchKeyword = '';   // Search keyword for content filtering
let editItemId = null;
let realtimeCh = null;
let pageContainer = null; // Store container reference for use in event handlers
let likedItems = new Set(); // Track liked items in current session (resets on page refresh)

// Library-specific edit mode (independent from global edit mode)
let isLibraryEditable = false;
const LIBRARY_PASSWORD = 'edit123';  // Simple password for library editing

export async function mount(container) {
  pageContainer = container;  // Save container reference
  container.innerHTML = buildHTML();
  bindControls(container);
  updateLibraryUI(container);  // Initialize library-specific edit UI
  await fetchAll();
  subscribeRealtime();
}

export function unmount() {
  realtimeCh && supaClient.removeChannel(realtimeCh);
}

function buildHTML() {
  return `
<div class="lib-layout">
  <!-- Main content area -->
  <div class="lib-main">
    <div class="lib-header">
      <h2>📋 指令集</h2>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn bn" id="lib-unlock-btn">🔒 解锁指令编辑</button>
        <button class="btn bp" id="lib-add-btn" style="display:none">＋ 新建</button>
      </div>
    </div>
    <div class="lib-grid" id="lib-grid"></div>
  </div>

  <!-- Floating expand button (shows when panel collapsed) -->
  <button id="lib-expand" class="expand-btn-float" title="展开筛选">◀</button>

  <!-- Right sidebar filter panel -->
  <div class="lib-panel">
    <div class="lib-panel-hdr" id="lib-panel-toggle">
      <span>🔍 搜索 & 筛选</span>
      <span id="lib-panel-chevron">◀</span>
    </div>
    <div class="lib-panel-body">
      <!-- Search box -->
      <div style="margin-bottom:16px">
        <input 
          id="lib-search-input" 
          type="text" 
          placeholder="搜索指令内容..." 
          autocomplete="off"
          style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px"
        />
      </div>
      
      <!-- Tag filter hint -->
      <div style="font-size:12px;color:#889;margin-bottom:12px;line-height:1.6">
        点击标签进行筛选。选中多个标签时，显示<b>同时包含</b>所有选中标签的指令。
      </div>
      <div id="lib-tag-list" class="lib-tag-list"></div>
    </div>
  </div>
</div>

<!-- Edit modal -->
<div id="lib-modal" class="tl-modal-overlay">
  <div class="tl-modal" style="max-width:600px" onmousedown="event.stopPropagation()">
    <h2 id="lib-modal-title">新建指令</h2>
    
    <label>内容</label>
    <textarea id="lib-content" rows="8" placeholder="输入指令内容..." style="margin-bottom:12px;font-family:inherit"></textarea>
    
    <label>作者</label>
    <input id="lib-author" type="text" placeholder="作者名字（可选）" autocomplete="off" style="margin-bottom:12px"/>
    
    <label>标签</label>
    <div id="lib-tag-picker" class="lib-tag-picker"></div>
    <div style="display:flex;gap:8px;margin-top:8px;margin-bottom:12px">
      <input id="lib-new-tag" type="text" placeholder="新增标签" autocomplete="off" style="flex:1"/>
      <button class="btn bn" id="lib-add-tag-btn">添加</button>
    </div>

    <div class="mbtns" style="justify-content:flex-end;margin-top:12px">
      <button class="btn bn" id="lib-modal-cancel">取消</button>
      <button class="btn bp" id="lib-modal-save">保存</button>
    </div>
    <div class="mbtns" style="justify-content:center;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
      <button class="btn br" id="lib-modal-delete" style="min-width:120px;display:none">🗑 删除</button>
    </div>
  </div>
</div>

<!-- Read-only preview modal -->
<div id="lib-preview-modal" class="tl-modal-overlay">
  <div class="tl-modal" style="max-width:600px" onmousedown="event.stopPropagation()">
    <h2>📋 查看指令</h2>
    
    <div style="background:var(--bg);border-radius:8px;padding:14px;margin-bottom:12px;max-height:400px;overflow-y:auto">
      <div id="lib-preview-content" style="white-space:pre-wrap;word-break:break-word;line-height:1.7;font-size:14px"></div>
    </div>
    
    <div id="lib-preview-meta" style="margin-bottom:12px;font-size:13px;color:#889"></div>
    
    <div class="mbtns" style="justify-content:space-between">
      <button class="btn bn" id="lib-preview-close">关闭</button>
      <button class="btn bp" id="lib-preview-copy">📋 复制内容</button>
    </div>
  </div>
</div>

<!-- Password unlock modal (library-specific) -->
<div id="lib-password-modal" class="tl-modal-overlay">
  <div class="tl-modal" style="max-width:400px" onmousedown="event.stopPropagation()">
    <h2>🔓 解锁指令编辑</h2>
    <p style="color:#889;font-size:13px;margin-bottom:16px">输入密码以解锁指令编辑功能</p>
    
    <input 
      id="lib-password-input" 
      type="password" 
      placeholder="输入密码" 
      autocomplete="off"
      style="width:100%;padding:10px 12px;margin-bottom:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:14px"
    />
    <div id="lib-password-error" style="color:#ef4444;font-size:12px;margin-bottom:12px;display:none">
      密码错误，请重试
    </div>
    
    <div class="mbtns" style="justify-content:flex-end">
      <button class="btn bn" id="lib-password-cancel">取消</button>
      <button class="btn bp" id="lib-password-submit">确定</button>
    </div>
  </div>
</div>`;
}

function bindControls(container) {
  // Add button
  container.querySelector('#lib-add-btn').addEventListener('click', () => openModal(null, container));
  
  // Modal buttons
  container.querySelector('#lib-modal-cancel').addEventListener('click', () => closeModal(container));
  container.querySelector('#lib-modal-save').addEventListener('click', () => saveItem(container));
  container.querySelector('#lib-modal-delete').addEventListener('click', () => deleteItem(container));
  container.querySelector('#lib-modal').addEventListener('mousedown', e => {
    if (e.target === container.querySelector('#lib-modal')) closeModal(container);
  });
  
  // Preview modal buttons
  container.querySelector('#lib-preview-close').addEventListener('click', () => closePreviewModal(container));
  container.querySelector('#lib-preview-copy').addEventListener('click', () => copyFromPreview(container));
  container.querySelector('#lib-preview-modal').addEventListener('mousedown', e => {
    if (e.target === container.querySelector('#lib-preview-modal')) closePreviewModal(container);
  });
  
  // Add tag button
  container.querySelector('#lib-add-tag-btn').addEventListener('click', () => addNewTag(container));
  container.querySelector('#lib-new-tag').addEventListener('keydown', e => {
    if (e.key === 'Enter') addNewTag(container);
  });

  // Search input
  container.querySelector('#lib-search-input').addEventListener('input', e => {
    searchKeyword = e.target.value.trim();
    renderGrid(container.querySelector('.lib-layout'));
  });

  // Unlock button
  container.querySelector('#lib-unlock-btn').addEventListener('click', () => {
    if (isLibraryEditable) {
      // Lock
      isLibraryEditable = false;
      updateLibraryUI(container);
      showToast('🔒 已锁定指令编辑');
    } else {
      // Show password modal
      openPasswordModal(container);
    }
  });

  // Password modal
  container.querySelector('#lib-password-cancel').addEventListener('click', () => closePasswordModal(container));
  container.querySelector('#lib-password-submit').addEventListener('click', () => submitPassword(container));
  container.querySelector('#lib-password-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitPassword(container);
    if (e.key === 'Escape') closePasswordModal(container);
  });
  container.querySelector('#lib-password-modal').addEventListener('mousedown', e => {
    if (e.target === container.querySelector('#lib-password-modal')) closePasswordModal(container);
  });

  // Panel toggle
  function toggleLibPanel() {
    const panel = container.querySelector('.lib-panel');
    const chevron = container.querySelector('#lib-panel-chevron');
    const expandBtn = container.querySelector('#lib-expand');
    const collapsed = panel.classList.toggle('collapsed');
    chevron.textContent = collapsed ? '▶' : '◀';
    if (expandBtn) expandBtn.classList.toggle('show', collapsed);
  }
  container.querySelector('#lib-panel-toggle')?.addEventListener('click', toggleLibPanel);
  container.querySelector('#lib-expand')?.addEventListener('click', toggleLibPanel);
}

async function fetchAll() {
  setSyncStatus('syncing');
  try {
    const { data, error } = await supaClient.from('library_items').select('*').order('likes', {ascending: false}).order('created_at', {ascending: false});
    if (error) throw error;
    
    items = (data || []).map(r => ({
      id: r.id,
      content: r.content || '',
      author: r.author || '',
      tags: r.tags_json ? JSON.parse(r.tags_json) : [],
      likes: r.likes || 0,
      createdAt: r.created_at
    }));
    
    // Extract all unique tags
    const tagSet = new Set();
    items.forEach(item => item.tags.forEach(tag => tagSet.add(tag)));
    tags = Array.from(tagSet).sort();
    
    renderTagList(document.querySelector('#lib-tag-list'));
    renderGrid(document.querySelector('.lib-layout'));
    setSyncStatus('ok');
  } catch(e) { dbError('加载指令集', e); }
}

function renderTagList(tagListEl) {
  if (!tags.length) {
    tagListEl.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:8px 0">暂无标签</div>';
    return;
  }
  
  const editable = isLibraryEditor();
  
  tagListEl.innerHTML = tags.map(tag => {
    const selected = selectedTags.includes(tag);
    const count = items.filter(item => item.tags.includes(tag)).length;
    
    // Edit/delete buttons (only visible in edit mode)
    const actionBtns = editable 
      ? `<div class="lib-tag-actions">
          <button class="lib-tag-action-btn lib-tag-edit" data-tag="${escHtml(tag)}" title="重命名">✏️</button>
          <button class="lib-tag-action-btn lib-tag-delete" data-tag="${escHtml(tag)}" title="删除">🗑️</button>
         </div>`
      : '';
    
    return `<div class="lib-tag-filter ${selected ? 'selected' : ''}" data-tag="${escHtml(tag)}">
      <div class="lib-tag-main">
        <span class="lib-tag-name">${escHtml(tag)}</span>
        <span class="lib-tag-count">(${count})</span>
      </div>
      ${actionBtns}
    </div>`;
  }).join('');
  
  // Bind click events for tag selection
  tagListEl.querySelectorAll('.lib-tag-filter').forEach(el => {
    // Tag selection (click on main area, not buttons)
    const mainArea = el.querySelector('.lib-tag-main');
    mainArea.addEventListener('click', (e) => {
      e.stopPropagation();
      const tag = el.dataset.tag;
      if (selectedTags.includes(tag)) {
        selectedTags = selectedTags.filter(t => t !== tag);
      } else {
        selectedTags.push(tag);
      }
      renderTagList(tagListEl);
      renderGrid(document.querySelector('.lib-layout'));
    });
    
    // Edit button
    const editBtn = el.querySelector('.lib-tag-edit');
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const oldTag = el.dataset.tag;
        renameTag(oldTag, tagListEl);
      });
    }
    
    // Delete button
    const deleteBtn = el.querySelector('.lib-tag-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tag = el.dataset.tag;
        deleteTag(tag, tagListEl);
      });
    }
  });
}

  

function renderGrid(container) {
  const grid = container.querySelector('#lib-grid');
  
  // Step 1: Filter by search keyword (content only, case-insensitive)
  let filtered = items;
  if (searchKeyword) {
    const keyword = searchKeyword.toLowerCase();
    filtered = filtered.filter(item => {
      return item.content.toLowerCase().includes(keyword);
    });
  }
  
  // Step 2: Filter by selected tags (intersection)
  if (selectedTags.length > 0) {
    filtered = filtered.filter(item => {
      return selectedTags.every(tag => item.tags.includes(tag));
    });
  }
  
  if (!filtered.length) {
    let msg = '暂无内容';
    if (searchKeyword && selectedTags.length > 0) {
      msg = `没有包含「${escHtml(searchKeyword)}」且同时有所选标签的指令`;
    } else if (searchKeyword) {
      msg = `没有包含「${escHtml(searchKeyword)}」的指令`;
    } else if (selectedTags.length > 0) {
      msg = '没有同时包含所选标签的指令';
    }
    grid.innerHTML = `<div class="lib-empty">${msg}</div>`;
    return;
  }
  
  grid.innerHTML = filtered.map(item => {
    const preview = item.content.length > 150 ? item.content.slice(0, 150) + '...' : item.content;
    const tagsHtml = item.tags.map(tag => `<span class="lib-item-tag">${escHtml(tag)}</span>`).join('');
    const authorHtml = item.author ? `<div class="lib-item-author">by ${escHtml(item.author)}</div>` : '';
    const likes = item.likes || 0;
    const isLiked = likedItems.has(item.id);
    const likedClass = isLiked ? 'liked' : '';
    const likeIcon = isLiked ? '❤️' : '👍';
    const likeTitle = isLiked ? '取消点赞' : '点赞';
    
    return `<div class="lib-item" data-id="${item.id}">
      <div class="lib-item-content">${escHtml(preview)}</div>
      ${tagsHtml ? `<div class="lib-item-tags">${tagsHtml}</div>` : ''}
      <div class="lib-item-footer">
        ${authorHtml}
        <div class="lib-item-like ${likedClass}" data-id="${item.id}" title="${likeTitle}">
          <span class="lib-like-btn">${likeIcon}</span>
          <span class="lib-like-count">${likes}</span>
        </div>
      </div>
    </div>`;
  }).join('');
  
  grid.querySelectorAll('.lib-item').forEach(card => {
    let pressTimer = null;
    let pressStart = 0;
    let startX = 0;
    let startY = 0;
    let hasMoved = false;
    let hasTriggered = false;  // Prevent double-trigger on mobile
    
    const startPress = (e) => {
      pressStart = Date.now();
      hasMoved = false;
      hasTriggered = false;  // Reset flag
      
      // Record initial position
      if (e.touches) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      } else {
        startX = e.clientX;
        startY = e.clientY;
      }
      
      pressTimer = setTimeout(() => {
        // Long press triggered (only if not moved)
        if (!hasMoved) {
          const id = parseInt(card.dataset.id);
          const item = items.find(x => x.id === id);
          if (item && !isLibraryEditor()) {
            openPreviewModal(item);
            hasTriggered = true;  // Mark as triggered
          }
        }
      }, 500);
    };
    
    const checkMovement = (e) => {
      if (hasMoved) return;
      
      let currentX, currentY;
      if (e.touches) {
        currentX = e.touches[0].clientX;
        currentY = e.touches[0].clientY;
      } else {
        currentX = e.clientX;
        currentY = e.clientY;
      }
      
      const deltaX = Math.abs(currentX - startX);
      const deltaY = Math.abs(currentY - startY);
      
      // Only consider vertical scrolling (deltaY) to detect page scroll
      // Increased threshold to 20px to allow small finger movement
      if (deltaY > 20) {
        hasMoved = true;
        cancelPress();
      }
    };
    
    const cancelPress = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };
    
    const handleInteraction = (e) => {
      // Set flag FIRST to prevent any race condition
      if (hasTriggered) {
        console.log('[lib-item] BLOCKED double-trigger, eventType:', e.type);
        return;
      }
      hasTriggered = true;  // Set immediately
      
      cancelPress();
      
      // If moved, don't trigger any action
      if (hasMoved) {
        return;
      }
      
      const pressDuration = Date.now() - pressStart;
      if (pressDuration >= 500) {
        // Was a long press, don't trigger click action
        e.preventDefault();
        return;
      }
      
      // Short click (and didn't move)
      const id = parseInt(card.dataset.id);
      const item = items.find(x => x.id === id);
      if (!item) return;
      
      console.log('[lib-item] eventType:', e.type, 'hasTriggered:', hasTriggered, 'pressDuration:', pressDuration);
      
      if (isLibraryEditor()) {
        openModal(item, pageContainer);
      } else {
        // Quick click: copy to clipboard
        navigator.clipboard.writeText(item.content).then(() => {
          showToast('已复制到剪贴板');
        }).catch(() => {
          showToast('复制失败，请手动复制');
        });
      }
    };
    
    // Mouse events (desktop)
    card.addEventListener('mousedown', startPress);
    card.addEventListener('mousemove', checkMovement);
    card.addEventListener('mouseup', handleInteraction);
    card.addEventListener('mouseleave', cancelPress);
    
    // Touch events (mobile)
    // Don't use passive:true on touchstart/touchend so we can preventDefault
    card.addEventListener('touchstart', (e) => {
      startPress(e);
    });
    card.addEventListener('touchmove', checkMovement, { passive: true });  // Can be passive
    card.addEventListener('touchend', (e) => {
      e.preventDefault();  // Prevent synthetic click event
      handleInteraction(e);
    });
    card.addEventListener('touchcancel', cancelPress);
  });
  
  // Bind like areas (prevent event bubbling to card)
  grid.querySelectorAll('.lib-item-like').forEach(likeArea => {
    const handleLike = async (e) => {
      e.stopPropagation();
      e.preventDefault();
      const id = parseInt(likeArea.dataset.id);
      await likeItem(id);
    };
    
    // Desktop
    likeArea.addEventListener('mousedown', (e) => e.stopPropagation());
    likeArea.addEventListener('mousemove', (e) => e.stopPropagation());
    likeArea.addEventListener('click', handleLike);
    
    // Mobile - use touchend instead of click for better response
    likeArea.addEventListener('touchstart', (e) => {
      e.stopPropagation();
    });
    likeArea.addEventListener('touchmove', (e) => e.stopPropagation());
    likeArea.addEventListener('touchend', handleLike);
  });
}

function openModal(item, container) {
  editItemId = item ? item.id : null;
  
  container.querySelector('#lib-modal-title').textContent = item ? '编辑指令' : '新建指令';
  container.querySelector('#lib-content').value = item ? item.content : '';
  container.querySelector('#lib-author').value = item ? item.author : '';
  container.querySelector('#lib-new-tag').value = '';
  
  renderTagPicker(container, item ? item.tags : []);
  
  container.querySelector('#lib-modal-delete').style.display = item ? '' : 'none';
  container.querySelector('#lib-modal').classList.add('show');
  setTimeout(() => container.querySelector('#lib-content').focus(), 60);
}

function closeModal(container) {
  container.querySelector('#lib-modal').classList.remove('show');
  editItemId = null;
}

// ── Preview modal (read-only) ──────────────────────
let previewItem = null;

function openPreviewModal(item) {
  if (!item) return;
  previewItem = item;
  
  const modal = pageContainer.querySelector('#lib-preview-modal');
  const contentEl = pageContainer.querySelector('#lib-preview-content');
  const metaEl = pageContainer.querySelector('#lib-preview-meta');
  
  contentEl.textContent = item.content;
  
  // Show metadata
  const parts = [];
  if (item.author) parts.push(`作者：${item.author}`);
  if (item.tags.length > 0) parts.push(`标签：${item.tags.join(', ')}`);
  metaEl.textContent = parts.join(' | ') || '';
  
  modal.classList.add('show');
}

function closePreviewModal(container) {
  container.querySelector('#lib-preview-modal').classList.remove('show');
  previewItem = null;
}

function copyFromPreview(container) {
  if (!previewItem) return;
  
  navigator.clipboard.writeText(previewItem.content).then(() => {
    showToast('已复制到剪贴板');
    closePreviewModal(container);
  }).catch(() => {
    showToast('复制失败，请手动复制');
  });
}

function renderTagPicker(container, selectedItemTags) {
  const picker = container.querySelector('#lib-tag-picker');
  
  if (!tags.length && !selectedItemTags.length) {
    picker.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:4px 0">暂无标签，请先添加</div>';
    return;
  }
  
  // Merge all tags and item's tags
  const allTags = Array.from(new Set([...tags, ...selectedItemTags])).sort();
  
  picker.innerHTML = allTags.map(tag => {
    const checked = selectedItemTags.includes(tag);
    return `<label class="lib-tag-checkbox">
      <input type="checkbox" value="${escHtml(tag)}" ${checked ? 'checked' : ''}>
      <span>${escHtml(tag)}</span>
    </label>`;
  }).join('');
}

function addNewTag(container) {
  const input = container.querySelector('#lib-new-tag');
  const tag = input.value.trim();
  
  if (!tag) return;
  if (tags.includes(tag)) {
    showToast('标签已存在');
    return;
  }
  
  tags.push(tag);
  tags.sort();
  
  const currentTags = Array.from(container.querySelectorAll('#lib-tag-picker input[type="checkbox"]:checked'))
    .map(cb => cb.value);
  currentTags.push(tag);
  
  renderTagPicker(container, currentTags);
  input.value = '';
  showToast(`已添加标签：${tag}`);
}

async function saveItem(container) {
  const content = container.querySelector('#lib-content').value.trim();
  if (!content) { showToast('内容不能为空'); return; }
  
  const author = container.querySelector('#lib-author').value.trim();
  const selectedItemTags = Array.from(container.querySelectorAll('#lib-tag-picker input[type="checkbox"]:checked'))
    .map(cb => cb.value);
  
  const row = {
    content,
    author: author || null,
    tags_json: JSON.stringify(selectedItemTags)
  };
  
  const savingId = editItemId;  // Save ID before closeModal clears it
  closeModal(container);
  
  setSyncStatus('syncing');
  try {
    if (savingId) {
      const { error } = await supaClient.from('library_items').update(row).eq('id', savingId);
      if (error) throw error;
      showToast('已更新');
    } else {
      const { error } = await supaClient.from('library_items').insert(row);
      if (error) throw error;
      showToast('已创建');
    }
    await fetchAll();
    setSyncStatus('ok');
  } catch(e) { dbError('保存指令', e); }
}

async function deleteItem(container) {
  if (!editItemId) return;
  
  const item = items.find(x => x.id === editItemId);
  if (!item) return;
  
  const preview = item.content.slice(0, 30) + (item.content.length > 30 ? '...' : '');
  if (!confirmDialog(`确定要删除「${preview}」？`)) return;
  
  const deletingId = editItemId;  // Save ID before closeModal clears it
  closeModal(container);
  
  setSyncStatus('syncing');
  try {
    const { error } = await supaClient.from('library_items').delete().eq('id', deletingId);
    if (error) throw error;
    await fetchAll();
    setSyncStatus('ok');
    showToast('已删除');
  } catch(e) { dbError('删除指令', e); }
}


function subscribeRealtime() {
  realtimeCh = supaClient.channel('library-page')
    .on('postgres_changes', {event:'*', schema:'public', table:'library_items'}, () => fetchAll())
    .subscribe();
}

// ── Tag management ─────────────────────────────────
async function renameTag(oldTag, tagListEl) {
  
  const newTag = prompt(`重命名标签「${oldTag}」:`, oldTag);
  if (!newTag || newTag.trim() === '') return;
  const trimmedTag = newTag.trim();
  
  if (trimmedTag === oldTag) return;
  
  if (tags.includes(trimmedTag)) {
    showToast('标签名已存在');
    return;
  }
  
  setSyncStatus('syncing');
  try {
    // Update all items that have this tag
    const itemsToUpdate = items.filter(item => item.tags.includes(oldTag));
    
    for (const item of itemsToUpdate) {
      const updatedTags = item.tags.map(t => t === oldTag ? trimmedTag : t);
      const { error } = await supaClient
        .from('library_items')
        .update({ tags_json: JSON.stringify(updatedTags) })
        .eq('id', item.id);
      if (error) throw error;
    }
    
    // Update selected tags if the renamed tag was selected
    if (selectedTags.includes(oldTag)) {
      selectedTags = selectedTags.map(t => t === oldTag ? trimmedTag : t);
    }
    
    await fetchAll();
    setSyncStatus('ok');
    showToast(`已重命名：${oldTag} → ${trimmedTag}`);
  } catch(e) { 
    dbError('重命名标签', e); 
  }
}

async function deleteTag(tag, tagListEl) {
  
  const count = items.filter(item => item.tags.includes(tag)).length;
  if (!confirmDialog(`确定要删除标签「${tag}」？\n\n将从 ${count} 个指令中移除此标签，但不会删除指令本身。`)) return;
  
  setSyncStatus('syncing');
  try {
    // Remove tag from all items that have it
    const itemsToUpdate = items.filter(item => item.tags.includes(tag));
    
    for (const item of itemsToUpdate) {
      const updatedTags = item.tags.filter(t => t !== tag);
      const { error } = await supaClient
        .from('library_items')
        .update({ tags_json: JSON.stringify(updatedTags) })
        .eq('id', item.id);
      if (error) throw error;
    }
    
    // Remove from selected tags if it was selected
    selectedTags = selectedTags.filter(t => t !== tag);
    
    await fetchAll();
    setSyncStatus('ok');
    showToast(`已删除标签：${tag}`);
  } catch(e) { 
    dbError('删除标签', e); 
  }
}

// ── Like functionality (session-based, toggle support) ─────
async function likeItem(itemId) {
  if (!itemId) return;
  
  const item = items.find(x => x.id === itemId);
  if (!item) return;
  
  const isCurrentlyLiked = likedItems.has(itemId);
  const isLiking = !isCurrentlyLiked;  // Toggle
  
  let newLikes;
  if (isLiking) {
    // Like: +1
    newLikes = (item.likes || 0) + 1;
    likedItems.add(itemId);
  } else {
    // Unlike: -1
    newLikes = Math.max((item.likes || 0) - 1, 0);  // Don't go below 0
    likedItems.delete(itemId);
  }
  
  // Update local state immediately
  item.likes = newLikes;
  
  // Update UI immediately
  const likeArea = document.querySelector(`.lib-item-like[data-id="${itemId}"]`);
  if (likeArea) {
    const countEl = likeArea.querySelector('.lib-like-count');
    const iconEl = likeArea.querySelector('.lib-like-btn');
    
    if (countEl) countEl.textContent = newLikes;
    if (iconEl) iconEl.textContent = isLiking ? '❤️' : '👍';
    
    // Update class and title
    if (isLiking) {
      likeArea.classList.add('liked');
      likeArea.title = '取消点赞';
    } else {
      likeArea.classList.remove('liked');
      likeArea.title = '点赞';
    }
  }
  
  // Show toast immediately
  showToast(isLiking ? '👍 已点赞' : '💔 已取消点赞');
  
  // Save to database in background
  setSyncStatus('syncing');
  try {
    const { error } = await supaClient
      .from('library_items')
      .update({ likes: newLikes })
      .eq('id', itemId);
    
    if (error) throw error;
    
    setSyncStatus('ok');
  } catch(e) { 
    // Rollback on error
    if (isLiking) {
      item.likes = newLikes - 1;
      likedItems.delete(itemId);
    } else {
      item.likes = newLikes + 1;
      likedItems.add(itemId);
    }
    
    // Revert UI
    if (likeArea) {
      const countEl = likeArea.querySelector('.lib-like-count');
      const iconEl = likeArea.querySelector('.lib-like-btn');
      if (countEl) countEl.textContent = item.likes;
      if (iconEl) iconEl.textContent = likedItems.has(itemId) ? '❤️' : '👍';
      if (likedItems.has(itemId)) {
        likeArea.classList.add('liked');
        likeArea.title = '取消点赞';
      } else {
        likeArea.classList.remove('liked');
        likeArea.title = '点赞';
      }
    }
    
    dbError('点赞操作', e);
  }
}

// ── Library-specific edit mode (password-protected) ───
function openPasswordModal(container) {
  container.querySelector('#lib-password-input').value = '';
  container.querySelector('#lib-password-error').style.display = 'none';
  container.querySelector('#lib-password-modal').classList.add('show');
  setTimeout(() => container.querySelector('#lib-password-input').focus(), 60);
}

function closePasswordModal(container) {
  container.querySelector('#lib-password-modal').classList.remove('show');
}

function submitPassword(container) {
  const input = container.querySelector('#lib-password-input').value;
  if (input === LIBRARY_PASSWORD) {
    isLibraryEditable = true;
    updateLibraryUI(container);
    closePasswordModal(container);
    showToast('✅ 已解锁指令编辑');
  } else {
    container.querySelector('#lib-password-error').style.display = 'block';
    container.querySelector('#lib-password-input').value = '';
    container.querySelector('#lib-password-input').focus();
  }
}

function updateLibraryUI(container) {
  const unlockBtn = container.querySelector('#lib-unlock-btn');
  const addBtn = container.querySelector('#lib-add-btn');
  
  if (isLibraryEditable) {
    unlockBtn.textContent = '🔓 锁定指令编辑';
    unlockBtn.className = 'btn bp';
    addBtn.style.display = '';
  } else {
    unlockBtn.textContent = '🔒 解锁指令编辑';
    unlockBtn.className = 'btn bn';
    addBtn.style.display = 'none';
  }
  
  // Re-render grid to update edit buttons on tags
  renderTagList(container.querySelector('#lib-tag-list'));
}

// Check library edit permission (used throughout the page)
function isLibraryEditor() {
  return isLibraryEditable;
}
