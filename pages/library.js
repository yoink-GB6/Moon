// pages/library.js
// 指令集页面：支持标签筛选和权限管理

import { supaClient, setSyncStatus, dbError } from '../core/supabase-client.js';
import { isEditor, onAuthChange } from '../core/auth.js';
import { showToast, escHtml, confirmDialog } from '../core/ui.js';

let items = [];           // All library items
let tags = [];            // All available tags
let selectedTags = [];    // Currently selected tags for filtering
let editItemId = null;
let realtimeCh = null;

export async function mount(container) {
  container.innerHTML = buildHTML();
  bindControls(container);
  onAuthChange(() => updateUI(container));
  updateUI(container);
  await fetchAll();
  subscribeRealtime();
}

export function unmount() {
  realtimeCh && supaClient.removeChannel(realtimeCh);
}

function buildHTML() {
  return `
<div class="lib-layout">
  <!-- Sidebar filter panel -->
  <div class="lib-sidebar">
    <div class="lib-sidebar-hdr">
      <span>🏷️ 标签筛选</span>
    </div>
    <div class="lib-sidebar-body">
      <div style="font-size:12px;color:#889;margin-bottom:12px;line-height:1.6">
        点击标签进行筛选。选中多个标签时，显示<b>同时包含</b>所有选中标签的文本。
      </div>
      <div id="lib-tag-list" class="lib-tag-list"></div>
    </div>
  </div>

  <!-- Main content area -->
  <div class="lib-main">
    <div class="lib-header">
      <h2>📋 指令集</h2>
      <button class="btn bp" id="lib-add-btn" style="display:none">＋ 新建</button>
    </div>
    <div class="lib-grid" id="lib-grid"></div>
  </div>
</div>

<!-- Edit modal -->
<div id="lib-modal" class="tl-modal-overlay">
  <div class="tl-modal" style="max-width:600px" onmousedown="event.stopPropagation()">
    <h2 id="lib-modal-title">新建指令</h2>
    
    <label>内容</label>
    <textarea id="lib-content" rows="8" placeholder="输入文本内容..." style="margin-bottom:12px;font-family:inherit"></textarea>
    
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
  
  // Add tag button
  container.querySelector('#lib-add-tag-btn').addEventListener('click', () => addNewTag(container));
  container.querySelector('#lib-new-tag').addEventListener('keydown', e => {
    if (e.key === 'Enter') addNewTag(container);
  });
}

async function fetchAll() {
  setSyncStatus('syncing');
  try {
    const { data, error } = await supaClient.from('library_items').select('*').order('created_at', {ascending: false});
    if (error) throw error;
    
    items = (data || []).map(r => ({
      id: r.id,
      content: r.content || '',
      author: r.author || '',
      tags: r.tags_json ? JSON.parse(r.tags_json) : [],
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
  
  tagListEl.innerHTML = tags.map(tag => {
    const selected = selectedTags.includes(tag);
    const count = items.filter(item => item.tags.includes(tag)).length;
    return `<div class="lib-tag-filter ${selected ? 'selected' : ''}" data-tag="${escHtml(tag)}">
      <span>${escHtml(tag)}</span>
      <span style="color:var(--muted);font-size:11px">(${count})</span>
    </div>`;
  }).join('');
  
  tagListEl.querySelectorAll('.lib-tag-filter').forEach(el => {
    el.addEventListener('click', () => {
      const tag = el.dataset.tag;
      if (selectedTags.includes(tag)) {
        selectedTags = selectedTags.filter(t => t !== tag);
      } else {
        selectedTags.push(tag);
      }
      renderTagList(tagListEl);
      renderGrid(document.querySelector('.lib-layout'));
    });
  });
}

function renderGrid(container) {
  const grid = container.querySelector('#lib-grid');
  
  // Filter items: show items that contain ALL selected tags (intersection)
  let filtered = items;
  if (selectedTags.length > 0) {
    filtered = items.filter(item => {
      return selectedTags.every(tag => item.tags.includes(tag));
    });
  }
  
  if (!filtered.length) {
    const msg = selectedTags.length > 0 
      ? '没有同时包含所选标签的文本' 
      : '暂无内容';
    grid.innerHTML = `<div class="lib-empty">${msg}</div>`;
    return;
  }
  
  grid.innerHTML = filtered.map(item => {
    const preview = item.content.length > 150 ? item.content.slice(0, 150) + '...' : item.content;
    const tagsHtml = item.tags.map(tag => `<span class="lib-item-tag">${escHtml(tag)}</span>`).join('');
    const authorHtml = item.author ? `<div class="lib-item-author">by ${escHtml(item.author)}</div>` : '';
    
    return `<div class="lib-item" data-id="${item.id}">
      <div class="lib-item-content">${escHtml(preview)}</div>
      ${tagsHtml ? `<div class="lib-item-tags">${tagsHtml}</div>` : ''}
      ${authorHtml}
    </div>`;
  }).join('');
  
  grid.querySelectorAll('.lib-item').forEach(card => {
    card.addEventListener('click', () => {
      const id = parseInt(card.dataset.id);
      const item = items.find(x => x.id === id);
      if (!item) return;
      
      if (isEditor()) {
        openModal(item, container);
      } else {
        // Copy content to clipboard
        navigator.clipboard.writeText(item.content).then(() => {
          showToast('已复制到剪贴板');
        }).catch(() => {
          showToast('复制失败，请手动复制');
        });
      }
    });
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
  if (!isEditor()) return;
  
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
  
  closeModal(container);
  
  setSyncStatus('syncing');
  try {
    if (editItemId) {
      const { error } = await supaClient.from('library_items').update(row).eq('id', editItemId);
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
  if (!isEditor() || !editItemId) return;
  
  const item = items.find(x => x.id === editItemId);
  if (!item) return;
  
  const preview = item.content.slice(0, 30) + (item.content.length > 30 ? '...' : '');
  if (!confirmDialog(`确定要删除「${preview}」？`)) return;
  
  closeModal(container);
  
  setSyncStatus('syncing');
  try {
    const { error } = await supaClient.from('library_items').delete().eq('id', editItemId);
    if (error) throw error;
    await fetchAll();
    setSyncStatus('ok');
    showToast('已删除');
  } catch(e) { dbError('删除指令', e); }
}

function updateUI(container) {
  const btn = container.querySelector('#lib-add-btn');
  if (btn) btn.style.display = isEditor() ? '' : 'none';
}

function subscribeRealtime() {
  realtimeCh = supaClient.channel('library-page')
    .on('postgres_changes', {event:'*', schema:'public', table:'library_items'}, () => fetchAll())
    .subscribe();
}
