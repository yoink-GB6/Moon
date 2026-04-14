// pages/library.js
// 指令集页面：支持标签筛选和权限管理

import { supaClient, setSyncStatus, dbError, safeUnsubscribe } from '../core/supabase-client.js';
import { isEditor, onAuthChange } from '../core/auth.js';
import { showToast, escHtml, confirmDialog, bindPanelToggle } from '../core/ui.js';

function _copyText(text) {
  return navigator.clipboard.writeText(text).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (!ok) throw new Error('copy failed');
  });
}

let items = [];           // All library items
let tags = [];            // All available tags
let selectedTags = [];    // Currently selected tags for filtering
let searchKeyword = '';   // Search keyword for content filtering
let selectedAuthor = '';  // Selected author for exact match filtering
let sortBy = 'created';         // Sorting method: 'likes' or 'created'
let editItemId = null;
let realtimeCh = null;
let pageContainer = null; // Store container reference for use in event handlers
let likedItems = new Set(); // Track liked items in current session (resets on page refresh)

let _pressState = null;        // 模块级，供 unmount 清理长按定时器
let _unsubAuth = null;         // 模块级，供 unmount 取消 auth 订阅
let _libMounted = false;

export async function mount(container) {
  _libMounted = true;
  pageContainer = container;  // Save container reference
  container.innerHTML = buildHTML();
  bindControls(container);

  // Listen to global auth changes
  if (_unsubAuth) _unsubAuth();
  _unsubAuth = onAuthChange(() => updateLibraryUI(container));

  updateSortButton(container);      // Initialize sort button
  updateLibraryUI(container);
  await fetchAll();
  subscribeRealtime();
}

export function unmount() {
  // 清理长按定时器，防止导航走后定时器仍触发
  _libMounted = false;
  if (_pressState?.timer) { clearTimeout(_pressState.timer); _pressState.timer = null; }
  if (_unsubAuth) { _unsubAuth(); _unsubAuth = null; }
  safeUnsubscribe(realtimeCh); realtimeCh = null;
}

function buildHTML() {
  return `
<div class="lib-layout">
  <!-- Main content area -->
  <div class="lib-main">
    <div class="lib-header">
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn bn" id="lib-sort-btn" title="切换排序方式">点赞排序</button>
        <button class="btn bp" id="lib-add-btn">＋ 新建</button>
      </div>
    </div>
    <div class="lib-grid" id="lib-grid"></div>
  </div>

  <!-- Floating expand button (shows when panel collapsed) -->
  <button id="lib-expand" class="expand-btn-float" title="展开筛选">‹</button>

  <!-- Right sidebar filter panel -->
  <div class="lib-panel">
    <div class="lib-panel-hdr" id="lib-panel-toggle">
      <span>搜索 & 筛选</span>
      <span id="lib-panel-chevron">‹</span>
    </div>
    <div class="lib-panel-body">
      <!-- Privacy unlock -->
      <div style="margin-bottom:16px">
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
      
      <!-- Author filter -->
      <div style="margin-bottom:16px;position:relative">
        <input 
          id="lib-author-input"
          type="text"
          placeholder="输入作者名筛选..."
          autocomplete="off"
          style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px"
        />
        <div id="lib-author-suggestions" class="lib-author-suggestions"></div>
        <button 
          id="lib-author-clear" 
          style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:#889;cursor:pointer;font-size:16px;padding:4px;display:none"
          title="清除作者筛选"
        >✕</button>
      </div>
      
      <!-- Tag filter hint -->
      <div style="font-size:12px;color:#889;margin-bottom:12px;line-height:1.6">
        点击tag筛选。点按番外块复制。长按展开全文，双击全文内容定制修改（不记录入库），附快捷交换UC
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

<!-- Duplicate check modal -->
<div id="lib-dup-modal" class="tl-modal-overlay">
  <div class="tl-modal" style="max-width:420px;text-align:center" onmousedown="event.stopPropagation()">
    <h2 style="justify-content:center">这个指令有点眼熟</h2>
    <p style="color:var(--muted);font-size:13px;margin-bottom:20px">已有一条内容相同的指令，要怎么处理？</p>
    <div style="display:flex;gap:10px;justify-content:center">
      <button class="btn bp" id="lib-dup-update">更新</button>
      <button class="btn bn" id="lib-dup-view">查看</button>
      <button class="btn bn" id="lib-dup-cancel">放弃</button>
    </div>
  </div>
</div>

<!-- Read-only preview modal -->
<div id="lib-preview-modal" class="tl-modal-overlay">
  <div class="tl-modal" style="max-width:600px" onmousedown="event.stopPropagation()">
    <h2>查看完整指令</h2>
    
    <div style="background:var(--bg);border-radius:8px;padding:14px;margin-bottom:12px;max-height:400px;overflow-y:auto">
      <div id="lib-preview-content" style="white-space:pre-wrap;word-break:break-word;line-height:1.7;font-size:14px"></div>
    </div>
    
    <div id="lib-preview-meta" style="margin-bottom:12px;font-size:13px;color:#889"></div>
    
    <div class="mbtns" style="justify-content:space-between">
      <button class="btn bn" id="lib-preview-edit">编辑</button>
      <div style="display:flex;gap:8px">
        <button class="btn bn" id="lib-preview-swap">user⇌char</button>
        <button class="btn bp" id="lib-preview-copy">复制文本</button>
      </div>
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
  const _libModal = container.querySelector('#lib-modal');
  let _mdOnLibModal = false;
  _libModal.addEventListener('mousedown', e => { _mdOnLibModal = (e.target === _libModal); });
  _libModal.addEventListener('mouseup', e => { if (_mdOnLibModal && e.target === _libModal) closeModal(container); _mdOnLibModal = false; });

  // Duplicate modal buttons
  container.querySelector('#lib-dup-update').addEventListener('click', () => _dupAction(container, 'update'));
  container.querySelector('#lib-dup-view').addEventListener('click',   () => _dupAction(container, 'view'));
  container.querySelector('#lib-dup-cancel').addEventListener('click', () => _dupAction(container, 'cancel'));
  const _libDupModal = container.querySelector('#lib-dup-modal');
  let _mdOnDupModal = false;
  _libDupModal.addEventListener('mousedown', e => { _mdOnDupModal = (e.target === _libDupModal); });
  _libDupModal.addEventListener('mouseup', e => { if (_mdOnDupModal && e.target === _libDupModal) _dupAction(container, 'cancel'); _mdOnDupModal = false; });

  // Preview modal — 双击/双击文字临时编辑（同时支持鼠标和触屏）
  const _contentEl = container.querySelector('#lib-preview-content');
  const _enableEdit = function () {
    if (_contentEl.contentEditable === 'true') return;
    _contentEl.contentEditable = 'true';
    _contentEl.style.outline = '1px dashed var(--border-hover)';
    _contentEl.focus();
  };
  _contentEl.addEventListener('dblclick', _enableEdit);
  let _lastTap = 0;
  _contentEl.addEventListener('touchend', function (e) {
    const now = Date.now();
    if (now - _lastTap < 300) { e.preventDefault(); _enableEdit(); }
    _lastTap = now;
  });

  // Preview modal buttons
  container.querySelector('#lib-preview-edit').addEventListener('click', () => {
    const item = previewItem;
    closePreviewModal(container);
    if (item) openModal(item, container);
  });
  container.querySelector('#lib-preview-swap').addEventListener('click', () => swapAndCopy(container));
  container.querySelector('#lib-preview-copy').addEventListener('click', () => copyFromPreview(container));
  const _libPreviewModal = container.querySelector('#lib-preview-modal');
  let _mdOnPreviewModal = false;
  _libPreviewModal.addEventListener('mousedown', e => { _mdOnPreviewModal = (e.target === _libPreviewModal); });
  _libPreviewModal.addEventListener('mouseup', e => { if (_mdOnPreviewModal && e.target === _libPreviewModal) closePreviewModal(container); _mdOnPreviewModal = false; });
  
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

  // Author input with autocomplete
  const authorInput = container.querySelector('#lib-author-input');
  const authorSuggestions = container.querySelector('#lib-author-suggestions');
  const authorClearBtn = container.querySelector('#lib-author-clear');
  
  let allAuthors = [];  // Store all authors for filtering
  
  authorInput.addEventListener('input', e => {
    const inputValue = e.target.value.trim();
    
    if (!inputValue) {
      // Clear filter if input is empty
      selectedAuthor = '';
      authorSuggestions.innerHTML = '';
      authorSuggestions.style.display = 'none';
      authorClearBtn.style.display = 'none';
      renderGrid(container.querySelector('.lib-layout'));
      return;
    }
    
    // Filter authors by input (case-insensitive substring match)
    const matches = allAuthors.filter(author => 
      author.toLowerCase().includes(inputValue.toLowerCase())
    );
    
    if (matches.length > 0) {
      // Show suggestions
      authorSuggestions.innerHTML = matches.map(author => {
        const count = items.filter(item => item.author === author).length;
        return `<div class="lib-author-suggestion" data-author="${escHtml(author)}">
          ${escHtml(author)} <span style="color:#889">(${count})</span>
        </div>`;
      }).join('');
      authorSuggestions.style.display = 'block';
    } else {
      authorSuggestions.innerHTML = '<div style="padding:8px;color:#889;font-size:12px">无匹配作者</div>';
      authorSuggestions.style.display = 'block';
    }
  });
  
  // Click on suggestion
  container.addEventListener('click', e => {
    const suggestion = e.target.closest('.lib-author-suggestion');
    if (suggestion) {
      const author = suggestion.dataset.author;
      selectedAuthor = author;
      authorInput.value = author;
      authorSuggestions.innerHTML = '';
      authorSuggestions.style.display = 'none';
      authorClearBtn.style.display = '';
      renderGrid(container.querySelector('.lib-layout'));
    }
  });
  
  // Clear button
  authorClearBtn.addEventListener('click', () => {
    selectedAuthor = '';
    authorInput.value = '';
    authorSuggestions.innerHTML = '';
    authorSuggestions.style.display = 'none';
    authorClearBtn.style.display = 'none';
    authorInput.focus();
    renderGrid(container.querySelector('.lib-layout'));
  });
  
  // Hide suggestions when clicking outside
  document.addEventListener('click', e => {
    if (!container.contains(e.target)) {
      authorSuggestions.style.display = 'none';
    }
  });
  
  // Store allAuthors reference for use in input handler
  container._setAuthors = (authors) => {
    allAuthors = authors;
  };

  // Sort button
  container.querySelector('#lib-sort-btn').addEventListener('click', () => {
    sortBy = sortBy === 'likes' ? 'created' : 'likes';
    updateSortButton(container);
    renderGrid(container.querySelector('.lib-layout'));
  });

  // Sort buttons
  // Panel toggle
  bindPanelToggle(container, '.lib-panel', '#lib-panel-toggle', '#lib-expand', '#lib-panel-chevron');
}

async function fetchAll() {
  setSyncStatus('syncing');
  try {
    const { data, error } = await supaClient.from('library_items').select('*');
    if (error) {
      console.error('Database query error:', error);
      throw error;
    }
    
    console.log('Fetched items:', data?.length || 0);
    
    items = (data || []).map(r => ({
      id: r.id,
      content: r.content || '',
      author: r.author || '',
      tags: r.tags_json ? JSON.parse(r.tags_json) : [],
      likes: r.likes || 0,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
    
    // Sort items based on current sortBy method
    sortItems();
    
    // Extract all unique tags
    const tagSet = new Set();
    items.forEach(item => item.tags.forEach(tag => tagSet.add(tag)));
    tags = Array.from(tagSet).sort();
    
    // Extract all unique authors (non-empty only)
    const authorSet = new Set();
    items.forEach(item => {
      if (item.author && item.author.trim()) {
        authorSet.add(item.author.trim());
      }
    });
    const authors = Array.from(authorSet).sort();
    
    updateAuthorList(authors);
    renderTagList(document.querySelector('#lib-tag-list'));
    renderGrid(document.querySelector('.lib-layout'));
    setSyncStatus('ok');
  } catch(e) {
    if (!_libMounted) return;
    setSyncStatus('err');
    showToast('⚠️ 加载指令集失败，请刷新页面');
    console.error('[DB] 加载指令集失败', e);
  }
}

function sortItems() {
  if (sortBy === 'likes') {
    // Sort by likes descending, then by created_at descending
    items.sort((a, b) => {
      if (b.likes !== a.likes) {
        return b.likes - a.likes;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  } else if (sortBy === 'created') {
    // Sort by created_at descending (newest first)
    items.sort((a, b) => {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }
}

function updateAuthorList(authors) {
  // Store authors list for autocomplete filtering
  if (pageContainer && pageContainer._setAuthors) {
    pageContainer._setAuthors(authors);
  }
}

function renderTagList(tagListEl) {
  // Clean up selected tags that no longer exist
  selectedTags = selectedTags.filter(tag => tags.includes(tag));
  
  if (!tags.length) {
    tagListEl.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:8px 0">暂无标签</div>';
    return;
  }
  
  const editable = isEditor();
  
  tagListEl.innerHTML = tags.map(tag => {
    const selected = selectedTags.includes(tag);
    const count = items.filter(item => item.tags.includes(tag)).length;
    
    // Edit/delete buttons (only visible in edit mode)
    const actionBtns = editable 
      ? `<div class="lib-tag-actions">
          <button class="lib-tag-action-btn lib-tag-edit" data-tag="${escHtml(tag)}" title="重命名">✎</button>
          <button class="lib-tag-action-btn lib-tag-delete" data-tag="${escHtml(tag)}" title="删除">🗑</button>
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
        renameTag(oldTag);
      });
    }
    
    // Delete button
    const deleteBtn = el.querySelector('.lib-tag-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tag = el.dataset.tag;
        deleteTag(tag);
      });
    }
  });
}

  

function renderGrid(container) {
  const grid = container.querySelector('#lib-grid');
  
  let filtered = [...items];

  // Filter by search keyword (content only, case-insensitive)
  if (searchKeyword) {
    const keyword = searchKeyword.toLowerCase();
    filtered = filtered.filter(item => {
      return item.content.toLowerCase().includes(keyword);
    });
  }
  
  // Step 2: Filter by author (exact match)
  if (selectedAuthor) {
    filtered = filtered.filter(item => {
      return item.author === selectedAuthor;
    });
  }
  
  // Step 3: Filter by selected tags (intersection)
  if (selectedTags.length > 0) {
    filtered = filtered.filter(item => {
      return selectedTags.every(tag => item.tags.includes(tag));
    });
  }
  
  if (!filtered.length) {
    let msg = '暂无内容';
    
    // Build filter description
    const filters = [];
    if (searchKeyword) filters.push(`包含「${escHtml(searchKeyword)}」`);
    if (selectedAuthor) filters.push(`作者为「${escHtml(selectedAuthor)}」`);
    if (selectedTags.length > 0) filters.push(`同时有所选标签`);
    
    if (filters.length > 0) {
      msg = `没有${filters.join('且')}的指令`;
    }
    
    grid.innerHTML = `<div class="lib-empty">${msg}</div>`;
    return;
  }
  
  // Step 4: Sort filtered items
  if (sortBy === 'likes') {
    filtered.sort((a, b) => {
      if (b.likes !== a.likes) {
        return b.likes - a.likes;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  } else if (sortBy === 'created') {
    filtered.sort((a, b) => {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }
  
  grid.innerHTML = filtered.map(item => {
    const displayContent = item.content;
    const preview = displayContent.length > 150 ? displayContent.slice(0, 150) + '...' : displayContent;
    const tagsHtml = item.tags.map(tag => `<span class="lib-item-tag">${escHtml(tag)}</span>`).join('');
    const authorHtml = item.author ? `<div class="lib-item-author">by ${escHtml(item.author)}</div>` : '';
    const likes = item.likes || 0;
    const isLiked = likedItems.has(item.id);
    const likedClass = isLiked ? 'liked' : '';
    const likeIcon = isLiked ? '♥' : '★';
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
  
  // 使用事件委托绑定事件（解决页面切换后事件丢失问题）
  bindGridItemEvents(grid);
}

// 使用事件委托处理卡片事件
function bindGridItemEvents(grid) {
  // 防止重复绑定
  if (grid._itemEventsBound) return;
  grid._itemEventsBound = true;
  
  // 长按状态管理（指向模块级变量，供 unmount 清理定时器）
  _pressState = {
    timer: null,
    start: 0,
    startX: 0,
    startY: 0,
    moved: false,
    triggered: false,
    targetCard: null
  };
  const pressState = _pressState;
  
  const resetPressState = () => {
    if (pressState.timer) {
      clearTimeout(pressState.timer);
      pressState.timer = null;
    }
    pressState.moved = false;
    pressState.triggered = false;
    pressState.targetCard = null;
  };
  
  const findCard = (element) => {
    return element.closest('.lib-item');
  };
  
  const startPress = (e) => {
    // 右键交给 contextmenu 处理，这里跳过
    if (!e.touches && e.button !== 0) return;

    const card = findCard(e.target);
    if (!card) return;

    const isLike = !!e.target.closest('.lib-item-like');

    // 鼠标点赞区交给 click 事件处理，这里跳过
    if (!e.touches && isLike) return;

    pressState.start = Date.now();
    pressState.moved = false;
    pressState.triggered = false;
    pressState.targetCard = card;
    pressState.isLike = isLike;

    if (e.touches) {
      pressState.startX = e.touches[0].clientX;
      pressState.startY = e.touches[0].clientY;
      // 长按只在非点赞区触发
      if (!isLike) {
        pressState.timer = setTimeout(() => {
          if (!pressState.moved && pressState.targetCard) {
            const id = parseInt(pressState.targetCard.dataset.id);
            const item = items.find(x => x.id === id);
            if (item) { openPreviewModal(item); pressState.triggered = true; }
          }
        }, 500);
      }
    } else {
      pressState.startX = e.clientX;
      pressState.startY = e.clientY;
    }
  };
  
  const checkMovement = (e) => {
    if (pressState.moved || !pressState.targetCard) return;
    
    let currentY;
    if (e.touches) {
      currentY = e.touches[0].clientY;
    } else {
      currentY = e.clientY;
    }
    
    const deltaY = Math.abs(currentY - pressState.startY);
    
    // 检测到滚动
    if (deltaY > 20) {
      pressState.moved = true;
      resetPressState();
    }
  };
  
  const handleInteraction = (e) => {
    const card = findCard(e.target);
    if (!card || card !== pressState.targetCard) {
      resetPressState();
      return;
    }
    
    // 忽略点赞区域
    if (e.target.closest('.lib-item-like')) {
      resetPressState();
      return;
    }
    
    // 已经触发过长按
    if (pressState.triggered) {
      resetPressState();
      return;
    }
    
    const pressDuration = Date.now() - pressState.start;
    const wasMoved = pressState.moved;
    resetPressState();
    
    // 移动过或长按，不触发点击
    if (wasMoved || pressDuration >= 500) {
      if (pressDuration >= 500) e.preventDefault();
      return;
    }
    
    // 短按：复制或编辑
    const id = parseInt(card.dataset.id);
    const item = items.find(x => x.id === id);
    if (!item) return;
    
    _copyText(item.content).then(() => {
      showToast('已复制到剪贴板');
    }).catch(() => {
      showToast('复制失败，请手动复制');
    });
  };
  
  const handleLike = async (e) => {
    const likeArea = e.target.closest('.lib-item-like');
    if (!likeArea) return;
    
    e.stopPropagation();
    e.preventDefault();
    
    const id = parseInt(likeArea.dataset.id);
    await likeItem(id);
  };
  
  // 事件监听器绑定到父容器（事件委托）
  grid.addEventListener('mousedown', startPress);
  grid.addEventListener('mousemove', checkMovement);
  grid.addEventListener('mouseup', handleInteraction);
  grid.addEventListener('mouseleave', resetPressState);
  
  grid.addEventListener('touchstart', startPress);
  grid.addEventListener('touchmove', checkMovement, { passive: true });
  grid.addEventListener('touchend', (e) => {
    if (e.target.closest('.lib-item-like')) {
      if (!pressState.moved && pressState.targetCard) { handleLike(e); e.preventDefault(); }
      resetPressState();
    } else {
      e.preventDefault();
      handleInteraction(e);
    }
  });
  grid.addEventListener('touchcancel', resetPressState);
  
  grid.addEventListener('click', (e) => {
    if (e.target.closest('.lib-item-like')) {
      handleLike(e);
    }
  });

  // 桌面端右键展开全文
  grid.addEventListener('contextmenu', (e) => {
    const card = findCard(e.target);
    if (!card || e.target.closest('.lib-item-like')) return;
    e.preventDefault();
    const id = parseInt(card.dataset.id);
    const item = items.find(x => x.id === id);
    if (item) openPreviewModal(item);
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
  contentEl.contentEditable = 'false';
  contentEl.style.outline = '';
  contentEl.title = '双击可临时编辑';

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

function _previewText(container) {
  return container.querySelector('#lib-preview-content').textContent;
}

function swapAndCopy(container) {
  if (!previewItem) return;
  const contentEl = container.querySelector('#lib-preview-content');
  const swapped = contentEl.textContent.replace(/user|char/g, m => m === 'user' ? 'char' : 'user');
  contentEl.textContent = swapped;
  showToast('已互换');
}

function copyFromPreview(container) {
  if (!previewItem) return;
  _copyText(_previewText(container)).then(() => {
    showToast('已复制到剪贴板');
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
  const allTags = Array.from(new Set([...tags, ...selectedItemTags])).sort();
  picker.innerHTML = allTags.map(tag =>
    `<div class="lib-tag-filter${selectedItemTags.includes(tag) ? ' selected' : ''}" data-tag="${escHtml(tag)}">
      <span class="lib-tag-name">${escHtml(tag)}</span>
    </div>`
  ).join('');
  picker.querySelectorAll('.lib-tag-filter').forEach(el => {
    el.addEventListener('click', () => el.classList.toggle('selected'));
  });
}

function addNewTag(container) {
  const input = container.querySelector('#lib-new-tag');
  const tag = input.value.trim();

  if (!tag) return;
  if (tags.includes(tag)) { showToast('标签已存在'); return; }

  tags.push(tag);
  tags.sort();

  const currentTags = Array.from(container.querySelectorAll('#lib-tag-picker .lib-tag-filter.selected'))
    .map(el => el.dataset.tag);
  currentTags.push(tag);

  renderTagPicker(container, currentTags);
  input.value = '';
  showToast(`已添加标签：${tag}`);
}

// 查重用的临时状态
let _dupFoundItem = null;
let _dupPendingSave = null; // 保存当前编辑框内容的函数引用

function _dupAction(container, action) {
  container.querySelector('#lib-dup-modal').classList.remove('show');
  if (action === 'update') {
    // 用当前编辑框信息覆盖已有条目
    if (_dupPendingSave) _dupPendingSave();
  } else if (action === 'view') {
    // 把已有条目的信息填回编辑框
    if (_dupFoundItem) openModal(_dupFoundItem, container);
  }
  // 'cancel' 什么都不做

  _dupFoundItem = null;
  _dupPendingSave = null;
}

async function saveItem(container) {
  const content = container.querySelector('#lib-content').value.trim();
  if (!content) { showToast('内容不能为空'); return; }

  const author = container.querySelector('#lib-author').value.trim();
  const selectedItemTags = Array.from(container.querySelectorAll('#lib-tag-picker .lib-tag-filter.selected'))
    .map(el => el.dataset.tag);
  const savingId = editItemId;

  // 查重
  const dupItem = items.find(function(x) {
    if (savingId && x.id === savingId) return false;
    return x.content.trim() === content;
  });
  if (dupItem) {
    _dupFoundItem = dupItem;
    _dupPendingSave = async function() {
      closeModal(container);
      setSyncStatus('syncing');
      try {
        const { error } = await supaClient.from('library_items')
          .update({ content, author: author || 'unknown', tags_json: JSON.stringify(selectedItemTags) })
          .eq('id', dupItem.id);
        if (error) throw error;
        showToast('已更新');
        await fetchAll();
        setSyncStatus('ok');
      } catch(e) { dbError('保存指令', e); }
    };
    closeModal(container);
    container.querySelector('#lib-dup-modal').classList.add('show');
    return;
  }

  closeModal(container);
  setSyncStatus('syncing');
  try {
    const row = { content, author: author || 'unknown', tags_json: JSON.stringify(selectedItemTags) };
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
  if (!confirmDialog(`确定要删除这条指令吗？\n\n预览：${preview}`)) return;
  
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
  safeUnsubscribe(realtimeCh); realtimeCh = null;
  realtimeCh = supaClient.channel('library-page')
    .on('postgres_changes', {event:'*', schema:'public', table:'library_items'}, () => fetchAll())
    .subscribe();
}

// ── Tag management ─────────────────────────────────
async function renameTag(oldTag) {
  
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

async function deleteTag(tag) {
  
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
    if (iconEl) iconEl.textContent = isLiking ? '♥' : '★';
    
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
  showToast(isLiking ? '已 ♥' : '不 ♥');
  
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
      if (iconEl) iconEl.textContent = likedItems.has(itemId) ? '♥' : '★';
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



function updateSortButton(container) {
  const sortBtn = container.querySelector('#lib-sort-btn');
  if (!sortBtn) return;
  
  if (sortBy === 'likes') {
    sortBtn.textContent = '❤ 点赞排序';
    sortBtn.title = '当前：按点赞数排序，点击切换为时间排序';
  } else {
    sortBtn.textContent = '⏱ 时间排序';
    sortBtn.title = '当前：按创建时间排序，点击切换为点赞排序';
  }
}

function updateLibraryUI(container) {
  renderTagList(container.querySelector('#lib-tag-list'));
}

