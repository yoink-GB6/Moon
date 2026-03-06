// pages/characters/modals/country-modal.js
import { supaClient } from '../../../core/supabase-client.js';
import { showToast, confirmDialog } from '../../../core/ui.js';
import { escHtml } from '../../../core/ui.js';
import * as State from '../state.js';
import { closeModal } from '../utils.js';
import { loadAllData } from '../data-loader.js';
import { renderGeoTree } from '../geo-tree.js';
import { renderGeoDetail } from '../geo-detail.js';

const PRESETS = [
  { title: '概述',       ph: '简要介绍这个国家/势力...' },
  { title: '地理位置',   ph: '地形、地貌、所处区域...' },
  { title: '政治体系',   ph: '政府形式、权力结构、统治阶层...' },
  { title: '经济状况',   ph: '主要产业、贸易往来、货币制度...' },
  { title: '文化习俗',   ph: '语言、宗教、节庆、民俗传统...' },
  { title: '军事力量',   ph: '军队组成、战斗力、武器装备...' },
  { title: '历史背景',   ph: '建国由来、重大事件、历史变迁...' },
  { title: '地标建筑',   ph: '著名建筑、重要场所...' },
  { title: '与他国关系', ph: '外交关系、盟友、敌对势力...' },
];

// ── Markdown 解析：sections JSON → markdown 文本 ─────────────
// 格式：顶级内容直接写，# 子小节，## 子子小节
function sectionsToMarkdown(sections) {
  if (!sections || !sections.length) return '';
  return sections.map(function(sec) {
    let out = '=== ' + (sec.title || '') + ' ===\n';
    if (sec.content) out += sec.content + '\n';
    if (sec.children && sec.children.length) {
      sec.children.forEach(function(child) {
        out += '\n# ' + (child.title || '') + '\n';
        if (child.content) out += child.content + '\n';
        if (child.children && child.children.length) {
          child.children.forEach(function(gc) {
            out += '\n## ' + (gc.title || '') + '\n';
            if (gc.content) out += gc.content + '\n';
          });
        }
      });
    }
    return out;
  }).join('\n---\n\n');
}

// ── Markdown → sections JSON ──────────────────────────────────
function markdownToSections(text) {
  const sections = [];
  // 用 === 标题 === 分割顶级小节
  const secBlocks = text.split(/^===[ \t]*(.+?)[ \t]*===$/m);
  // secBlocks: [前缀, title1, body1, title2, body2, ...]
  for (let i = 1; i < secBlocks.length; i += 2) {
    const title = secBlocks[i].trim();
    const body  = (secBlocks[i + 1] || '').trimStart();
    if (!title) continue;
    const sec = { title: title, content: '', children: [] };
    // 在 body 里用 # 分割子小节
    const childBlocks = body.split(/^#[ \t]+(.+)$/m);
    // childBlocks[0] 是顶级内容
    sec.content = childBlocks[0].trimEnd();
    for (let j = 1; j < childBlocks.length; j += 2) {
      const childTitle = childBlocks[j].trim();
      const childBody  = (childBlocks[j + 1] || '').trimStart();
      if (!childTitle) continue;
      const child = { title: childTitle, content: '', children: [] };
      // ## 分割子子小节
      const gcBlocks = childBody.split(/^##[ \t]+(.+)$/m);
      child.content = gcBlocks[0].trimEnd();
      for (let k = 1; k < gcBlocks.length; k += 2) {
        const gcTitle = gcBlocks[k].trim();
        const gcBody  = (gcBlocks[k + 1] || '').trimEnd();
        if (gcTitle) child.children.push({ title: gcTitle, content: gcBody });
      }
      if (!child.children.length) delete child.children;
      sec.children.push(child);
    }
    if (!sec.children.length) delete sec.children;
    sections.push(sec);
  }
  return sections;
}

// ── setupCountryModal ─────────────────────────────────────────

export function setupCountryModal() {
  const modal = State.pageContainer.querySelector('#country-modal');
  modal.addEventListener('click', function(e) { if (e.target === modal) closeModal(modal); });
}

export function openCountryModal(country) {
  State.setEditingCountryId(country ? country.id : null);
  const modal = State.pageContainer.querySelector('#country-modal');
  let sections = [];
  if (country && country.description) {
    try {
      const parsed = JSON.parse(country.description);
      sections = Array.isArray(parsed) ? parsed : [{ title: '概述', content: country.description }];
    } catch (_) { sections = [{ title: '概述', content: country.description }]; }
  }
  modal.querySelector('.tl-modal').innerHTML = _buildHTML(country, sections);
  _bindEvents(modal);
  modal.classList.add('show');
  setTimeout(function() { const n = modal.querySelector('#cm-name'); if (n) n.focus(); }, 100);
}

// ── 构建 HTML ─────────────────────────────────────────────────

function _buildHTML(country, sections) {
  const usedTitles = new Set(sections.map(function(s) { return s.title; }));
  const presetBtns = PRESETS
    .filter(function(p) { return !usedTitles.has(p.title); })
    .map(function(p) {
      return '<button class="cm-tag" data-title="' + escHtml(p.title) + '">' + escHtml(p.title) + '</button>';
    }).join('');
  const del     = country ? 'inline-flex' : 'none';
  const heading = country ? '编辑国家 / 势力' : '新建国家 / 势力';
  const nameV   = escHtml(country ? country.name || '' : '');
  const presets = presetBtns || '<span class="cm-tags-empty">所有预设已添加</span>';
  // 每个小节渲染为一个独立的 markdown 编辑块
  const secCards = sections.map(function(sec, idx) { return _secCardHTML(sec, idx); }).join('');

  return '<h2>' + heading + '</h2>' +
    '<label>名称</label>' +
    '<input id="cm-name" type="text" value="' + nameV + '"/>' +
    '<div class="cm-sec-hdr"><span>内容小节</span>' +
      '<span class="cm-hint"># 子小节 &nbsp;## 子子小节</span>' +
    '</div>' +
    '<div class="cm-tags" id="cm-tags">' + presets + '</div>' +
    '<div class="cm-custom-row">' +
      '<input type="text" id="cm-custom" placeholder="自定义小节标题..." maxlength="30" autocomplete="off"/>' +
      '<button class="btn bn" id="cm-custom-add">＋ 添加</button>' +
    '</div>' +
    '<div id="cm-list" class="cm-list cm-md-list">' + secCards + '</div>' +
    '<div class="modal-actions">' +
      '<button class="btn br modal-btn-delete" id="cm-delete" style="display:' + del + '">删除</button>' +
      '<div class="modal-actions-right">' +
        '<button class="btn bp modal-btn" id="cm-save">保存</button>' +
        '<button class="btn bn modal-btn" id="cm-cancel">取消</button>' +
      '</div>' +
    '</div>';
}

// 单个小节卡片：标题行 + markdown textarea（默认折叠）
function _secCardHTML(sec, idx) {
  const mdContent = _secToMd(sec);
  const preview = mdContent.trim().slice(0, 50) || '暂无内容';
  return '<div class="cm-md-card" data-idx="' + idx + '">' +
    '<div class="cm-md-hdr">' +
      '<span class="cm-row-grip">⠿</span>' +
      '<span class="cm-md-title">' + escHtml(sec.title || '未命名') + '</span>' +
      '<span class="cm-md-preview">' + escHtml(preview.replace(/\n/g,' ')) + '</span>' +
      '<button class="cm-md-edit">✏️</button>' +
      '<button class="cm-md-del">✕</button>' +
    '</div>' +
    '<div class="cm-md-body" style="display:none">' +
      '<div class="cm-md-guide">用 <code>#</code> 开头写子小节标题，<code>##</code> 写子子小节标题</div>' +
      '<textarea class="cm-md-ta" rows="8" placeholder="在此输入内容...\n\n# 子小节标题\n子小节内容\n\n## 子子小节标题\n内容">' + escHtml(mdContent) + '</textarea>' +
    '</div>' +
  '</div>';
}

// section → markdown 文本（不含顶级 === 标题行，只含内容和子小节）
function _secToMd(sec) {
  let out = sec.content || '';
  if (sec.children && sec.children.length) {
    sec.children.forEach(function(child) {
      out += (out ? '\n\n' : '') + '# ' + (child.title || '');
      if (child.content) out += '\n' + child.content;
      if (child.children && child.children.length) {
        child.children.forEach(function(gc) {
          out += '\n\n## ' + (gc.title || '');
          if (gc.content) out += '\n' + gc.content;
        });
      }
    });
  }
  return out;
}

// ── 事件绑定 ─────────────────────────────────────────────────

function _bindEvents(modal) {
  modal.querySelector('#cm-cancel')?.addEventListener('click', function() { closeModal(modal); });
  modal.querySelector('#cm-delete')?.addEventListener('click', _deleteCountry);
  modal.querySelector('#cm-save')?.addEventListener('click', _saveCountry);

  // 预设标签
  modal.querySelector('#cm-tags')?.addEventListener('click', function(e) {
    const btn = e.target.closest('.cm-tag');
    if (!btn) return;
    _appendCard(modal, btn.dataset.title, '');
    btn.remove();
    const tags = modal.querySelector('#cm-tags');
    if (!tags.querySelector('.cm-tag')) tags.innerHTML = '<span class="cm-tags-empty">所有预设已添加</span>';
  });

  // 自定义添加
  const ci = modal.querySelector('#cm-custom');
  function doAdd() {
    const t = ci.value.trim();
    if (!t) { ci.focus(); return; }
    _appendCard(modal, t, '');
    ci.value = ''; ci.focus();
  }
  modal.querySelector('#cm-custom-add')?.addEventListener('click', doAdd);
  ci?.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });

  // 列表事件委托
  const list = modal.querySelector('#cm-list');
  list?.addEventListener('click', function(e) {
    const card = e.target.closest('.cm-md-card');
    if (!card) return;
    if (e.target.closest('.cm-md-edit')) {
      _toggleCard(card);
      return;
    }
    if (e.target.closest('.cm-md-del')) {
      const title = card.querySelector('.cm-md-title')?.textContent.trim() || '';
      card.remove();
      _restorePresetTag(modal, title);
      return;
    }
    // 点标题行也展开
    if (e.target.closest('.cm-md-hdr') && !e.target.closest('button')) {
      _toggleCard(card);
    }
  });

  // textarea 更新标题预览
  list?.addEventListener('input', function(e) {
    if (!e.target.classList.contains('cm-md-ta')) return;
    const card = e.target.closest('.cm-md-card');
    const preview = card.querySelector('.cm-md-preview');
    if (preview) {
      const txt = e.target.value.replace(/\n/g, ' ').trim().slice(0, 50);
      preview.textContent = txt || '暂无内容';
    }
  });

  _bindDragSort(list);
}

function _toggleCard(card) {
  const body = card.querySelector('.cm-md-body');
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  card.classList.toggle('cm-md-open', !isOpen);
  if (!isOpen) {
    const ta = card.querySelector('.cm-md-ta');
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }
}

function _restorePresetTag(modal, title) {
  const preset = PRESETS.find(function(p) { return p.title === title; });
  if (!preset) return;
  const tags = modal.querySelector('#cm-tags');
  if (!tags) return;
  const empty = tags.querySelector('.cm-tags-empty');
  if (empty) empty.remove();
  if (!tags.querySelector('[data-title="' + title + '"]')) {
    const tag = document.createElement('button');
    tag.className = 'cm-tag';
    tag.dataset.title = preset.title;
    tag.textContent = preset.title;
    tags.appendChild(tag);
  }
}

function _appendCard(modal, title, mdContent) {
  const list = modal.querySelector('#cm-list');
  if (!list) return;
  const idx = list.querySelectorAll('.cm-md-card').length;
  const tmp = document.createElement('div');
  tmp.innerHTML = _secCardHTML({ title: title, content: mdContent }, idx);
  const card = tmp.firstElementChild;
  list.appendChild(card);
  _bindDragSort(list);
  _toggleCard(card); // 新建默认展开
}

// ── 拖拽排序 ─────────────────────────────────────────────────

function _bindDragSort(list) {
  if (!list) return;
  let dragging = null;
  Array.from(list.children).forEach(function(card) {
    if (!card.classList.contains('cm-md-card')) return;
    const grip = card.querySelector('.cm-row-grip');
    if (!grip) return;
    grip.addEventListener('mousedown', function() { card.draggable = true; });
    grip.addEventListener('mouseup',   function() { card.draggable = false; });
    card.addEventListener('dragstart', function(e) {
      dragging = card; card.classList.add('cm-row-dragging');
      e.dataTransfer.effectAllowed = 'move'; e.stopPropagation();
    });
    card.addEventListener('dragend', function() {
      dragging = null; card.classList.remove('cm-row-dragging'); card.draggable = false;
      Array.from(list.children).forEach(function(c) { c.classList.remove('cm-row-drag-over'); });
    });
    card.addEventListener('dragover', function(e) {
      e.preventDefault(); e.stopPropagation();
      if (!dragging || dragging === card) return;
      Array.from(list.children).forEach(function(c) { c.classList.remove('cm-row-drag-over'); });
      card.classList.add('cm-row-drag-over');
      const rect = card.getBoundingClientRect();
      list.insertBefore(dragging, e.clientY < rect.top + rect.height / 2 ? card : card.nextSibling);
    });
    card.addEventListener('dragleave', function() { card.classList.remove('cm-row-drag-over'); });
    card.addEventListener('drop', function(e) { e.preventDefault(); e.stopPropagation(); card.classList.remove('cm-row-drag-over'); });
  });
}

// ── 收集数据 ─────────────────────────────────────────────────

// markdown 块 → section 对象
function _mdBlockToSection(title, mdText) {
  const sec = { title: title, content: '' };
  const childBlocks = mdText.split(/^#[ \t]+(.+)$/m);
  sec.content = childBlocks[0].trimEnd();
  const children = [];
  for (let j = 1; j < childBlocks.length; j += 2) {
    const childTitle = childBlocks[j].trim();
    const childBody  = childBlocks[j + 1] || '';
    if (!childTitle) continue;
    const child = { title: childTitle, content: '' };
    const gcBlocks = childBody.split(/^##[ \t]+(.+)$/m);
    child.content = gcBlocks[0].trimEnd();
    const grandchildren = [];
    for (let k = 1; k < gcBlocks.length; k += 2) {
      const gcTitle = gcBlocks[k].trim();
      const gcBody  = (gcBlocks[k + 1] || '').trimEnd();
      if (gcTitle) grandchildren.push({ title: gcTitle, content: gcBody });
    }
    if (grandchildren.length) child.children = grandchildren;
    children.push(child);
  }
  if (children.length) sec.children = children;
  return sec;
}

function _collectSections(modal) {
  const out = [];
  modal.querySelectorAll('.cm-md-card').forEach(function(card) {
    const title = card.querySelector('.cm-md-title')?.textContent.trim() || '';
    const mdText = card.querySelector('.cm-md-ta')?.value || '';
    if (title) out.push(_mdBlockToSection(title, mdText));
  });
  return out;
}

// ── 保存 / 删除 ───────────────────────────────────────────────

async function _saveCountry() {
  const modal = State.pageContainer.querySelector('#country-modal');
  const name  = modal.querySelector('#cm-name')?.value.trim() || '';
  if (!name) return showToast('请输入名称');
  const sections    = _collectSections(modal);
  const description = sections.length ? JSON.stringify(sections) : null;
  const payload     = { name, description };
  try {
    if (State.editingCountryId) {
      const result = await supaClient.from('countries').update(payload).eq('id', State.editingCountryId).select().single();
      if (result.error) throw result.error;
      if (result.data) {
        const idx = State.allCountries.findIndex(function(c) { return c.id === State.editingCountryId; });
        if (idx >= 0) State.allCountries[idx] = result.data;
        if (State.selectedCountry?.id === State.editingCountryId) State.setSelectedCountry(result.data);
      }
      showToast('已更新');
    } else {
      const result = await supaClient.from('countries').insert(payload);
      if (result.error) throw result.error;
      showToast('已创建');
    }
    closeModal(modal);
    await loadAllData();
    renderGeoTree();
    renderGeoDetail();
  } catch (e) { showToast('保存失败: ' + e.message); }
}

async function _deleteCountry() {
  if (!await confirmDialog('确定要删除这个国家吗？')) return;
  try {
    const result = await supaClient.from('countries').delete().eq('id', State.editingCountryId);
    if (result.error) throw result.error;
    showToast('已删除');
    closeModal(State.pageContainer.querySelector('#country-modal'));
    State.setSelectedCountry(null);
    await loadAllData();
    renderGeoTree();
    renderGeoDetail();
  } catch (e) { showToast('删除失败: ' + e.message); }
}
