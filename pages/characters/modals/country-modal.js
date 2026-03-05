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

// ── 构建 HTML ────────────────────────────────────────────────

function _buildHTML(country, sections) {
  const usedTitles = new Set(sections.map(function(s) { return s.title; }));
  const presetBtns = PRESETS
    .filter(function(p) { return !usedTitles.has(p.title); })
    .map(function(p) {
      return '<button class="cm-tag" data-title="' + escHtml(p.title) + '" data-ph="' + escHtml(p.ph) + '">' + escHtml(p.title) + '</button>';
    }).join('');
  const del     = country ? 'inline-flex' : 'none';
  const heading = country ? '编辑国家 / 势力' : '新建国家 / 势力';
  const nameV   = escHtml(country ? country.name || '' : '');
  const presets = presetBtns || '<span class="cm-tags-empty">所有预设已添加</span>';
  const secRows = sections.map(function(s) { return _rowHTML(s, false); }).join('');

  return '<h2>' + heading + '</h2>' +
    '<label>名称</label>' +
    '<input id="cm-name" type="text" value="' + nameV + '"/>' +
    '<div class="cm-sec-hdr"><span>内容小节</span><span class="cm-hint">✏️ 展开编辑 · ＋子小节 · ⠿ 拖拽排序</span></div>' +
    '<div class="cm-tags" id="cm-tags">' + presets + '</div>' +
    '<div class="cm-custom-row">' +
      '<input type="text" id="cm-custom" placeholder="自定义小节标题..." maxlength="30" autocomplete="off"/>' +
      '<button class="btn bn" id="cm-custom-add">＋ 添加</button>' +
    '</div>' +
    '<div id="cm-list" class="cm-list">' + secRows + '</div>' +
    '<div class="modal-actions">' +
      '<button class="btn br modal-btn-delete" id="cm-delete" style="display:' + del + '">删除</button>' +
      '<div class="modal-actions-right">' +
        '<button class="btn bp modal-btn" id="cm-save">保存</button>' +
        '<button class="btn bn modal-btn" id="cm-cancel">取消</button>' +
      '</div>' +
    '</div>';
}

// isChild: 子小节（缩进样式，无子级嵌套，无拖拽）
function _rowHTML(sec, isChild) {
  const found    = PRESETS.find(function(p) { return p.title === sec.title; });
  const ph       = found ? found.ph : '在此填写内容...';
  const content  = sec.content || '';
  const children = (!isChild && sec.children) ? sec.children : [];
  const hasContent = content.trim().length > 0;
  const preview  = hasContent
    ? escHtml(content.trim().slice(0, 60)) + (content.trim().length > 60 ? '…' : '')
    : '<span style="color:var(--muted);font-style:italic">暂无内容</span>';
  const childClass = isChild ? ' cm-row-child' : '';
  const childRows  = children.map(function(c) { return _rowHTML(c, true); }).join('');

  return '<div class="cm-row' + childClass + '" draggable="false">' +
    '<div class="cm-row-collapsed">' +
      (!isChild ? '<span class="cm-row-grip" title="拖拽排序">⠿</span>' : '<span class="cm-row-grip cm-row-grip-child"></span>') +
      '<div class="cm-row-summary">' +
        '<span class="cm-row-label">' + escHtml(sec.title || '未命名') + '</span>' +
        '<span class="cm-row-preview">' + preview + '</span>' +
      '</div>' +
      '<button class="cm-row-edit" title="编辑">✏️</button>' +
      '<button class="cm-row-del"  title="删除">✕</button>' +
    '</div>' +
    '<div class="cm-row-expanded" style="display:none">' +
      '<div class="cm-row-expanded-hdr">' +
        '<input class="cm-row-title" type="text" value="' + escHtml(sec.title || '') + '" placeholder="小节标题" maxlength="30"/>' +
        (!isChild ? '<button class="cm-row-collapse cm-row-add-child">＋ 子小节</button>' : '') +
        '<button class="cm-row-collapse">▲ 收起</button>' +
      '</div>' +
      '<textarea class="cm-row-body" rows="4" placeholder="' + escHtml(ph) + '">' + escHtml(content) + '</textarea>' +
      (!isChild ? '<div class="cm-row-children">' + childRows + '</div>' : '') +
    '</div>' +
  '</div>';
}

// ── 事件绑定 ─────────────────────────────────────────────────

function _bindEvents(modal) {
  modal.querySelector('#cm-cancel')?.addEventListener('click', function() { closeModal(modal); });
  modal.querySelector('#cm-delete')?.addEventListener('click', _deleteCountry);
  modal.querySelector('#cm-save')?.addEventListener('click', _saveCountry);

  modal.querySelector('#cm-tags')?.addEventListener('click', function(e) {
    const btn = e.target.closest('.cm-tag');
    if (!btn) return;
    _appendRow(modal.querySelector('#cm-list'), btn.dataset.title, '', btn.dataset.ph, false);
    btn.remove();
    const tags = modal.querySelector('#cm-tags');
    if (!tags.querySelector('.cm-tag')) tags.innerHTML = '<span class="cm-tags-empty">所有预设已添加</span>';
  });

  const ci = modal.querySelector('#cm-custom');
  function doAdd() {
    const t = ci.value.trim();
    if (!t) { ci.focus(); return; }
    _appendRow(modal.querySelector('#cm-list'), t, '', '', false);
    ci.value = ''; ci.focus();
  }
  modal.querySelector('#cm-custom-add')?.addEventListener('click', doAdd);
  ci?.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });

  const list = modal.querySelector('#cm-list');
  list?.addEventListener('click', function(e) {
    const row = e.target.closest('.cm-row');
    if (!row) return;
    if (e.target.closest('.cm-row-edit'))      { _expandRow(row); return; }
    if (e.target.closest('.cm-row-collapse'))  { _collapseRow(row); return; }
    if (e.target.closest('.cm-row-add-child')) {
      e.stopPropagation();
      // 确保是顶级行
      if (row.classList.contains('cm-row-child')) return;
      // 展开父行以便看到子小节
      if (row.querySelector('.cm-row-expanded').style.display === 'none') _expandRow(row);
      const childrenEl = row.querySelector('.cm-row-children');
      if (childrenEl) _appendRow(childrenEl, '', '', '', true);
      return;
    }
    if (e.target.closest('.cm-row-del')) {
      const isChild = row.classList.contains('cm-row-child');
      const titleEl = row.querySelector('.cm-row-title');
      const labelEl = row.querySelector('.cm-row-label');
      const t = (titleEl ? titleEl.value.trim() : '') || (labelEl ? labelEl.textContent.trim() : '');
      row.remove();
      if (!isChild) _restorePresetTag(modal, t);
    }
  });

  _bindDragSort(list);
}

function _expandRow(row) {
  row.querySelector('.cm-row-collapsed').style.display = 'none';
  row.querySelector('.cm-row-expanded').style.display  = 'flex';
  const body = row.querySelector('.cm-row-body');
  if (body) body.focus();
}

function _collapseRow(row) {
  const titleInput = row.querySelector('.cm-row-title');
  const bodyInput  = row.querySelector('.cm-row-body');
  const title   = titleInput ? titleInput.value.trim() : '';
  const content = bodyInput  ? bodyInput.value.trim()  : '';
  const label   = row.querySelector('.cm-row-collapsed .cm-row-label');
  const preview = row.querySelector('.cm-row-collapsed .cm-row-preview');
  if (label) label.textContent = title || '未命名';
  if (preview) {
    preview.innerHTML = content
      ? escHtml(content.slice(0, 60)) + (content.length > 60 ? '…' : '')
      : '<span style="color:var(--muted);font-style:italic">暂无内容</span>';
  }
  row.querySelector('.cm-row-collapsed').style.display = '';
  row.querySelector('.cm-row-expanded').style.display  = 'none';
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
    tag.dataset.ph    = preset.ph;
    tag.textContent   = preset.title;
    tags.appendChild(tag);
  }
}

function _appendRow(container, title, content, ph, isChild) {
  if (!container) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = _rowHTML({ title: title, content: content || '', children: [] }, isChild);
  const row = tmp.firstElementChild;
  if (ph) { const body = row.querySelector('textarea'); if (body) body.placeholder = ph; }
  container.appendChild(row);
  if (!isChild) _bindDragSort(container);
  _expandRow(row);
}

// ── 拖拽排序（仅顶级） ─────────────────────────────────────

function _bindDragSort(list) {
  if (!list) return;
  let dragging = null;
  Array.from(list.children).forEach(function(row) {
    if (!row.classList.contains('cm-row') || row.classList.contains('cm-row-child')) return;
    const grip = row.querySelector('.cm-row-collapsed .cm-row-grip');
    if (!grip) return;
    grip.addEventListener('mousedown', function() { row.draggable = true; });
    grip.addEventListener('mouseup',   function() { row.draggable = false; });
    row.addEventListener('dragstart', function(e) {
      dragging = row; row.classList.add('cm-row-dragging');
      e.dataTransfer.effectAllowed = 'move'; e.stopPropagation();
    });
    row.addEventListener('dragend', function() {
      dragging = null; row.classList.remove('cm-row-dragging'); row.draggable = false;
      Array.from(list.children).forEach(function(r) { r.classList.remove('cm-row-drag-over'); });
    });
    row.addEventListener('dragover', function(e) {
      e.preventDefault(); e.stopPropagation();
      if (!dragging || dragging === row) return;
      Array.from(list.children).forEach(function(r) { r.classList.remove('cm-row-drag-over'); });
      row.classList.add('cm-row-drag-over');
      const rect = row.getBoundingClientRect();
      list.insertBefore(dragging, e.clientY < rect.top + rect.height / 2 ? row : row.nextSibling);
    });
    row.addEventListener('dragleave', function() { row.classList.remove('cm-row-drag-over'); });
    row.addEventListener('drop', function(e) { e.preventDefault(); e.stopPropagation(); row.classList.remove('cm-row-drag-over'); });
  });
}

// ── 收集数据（递归） ──────────────────────────────────────────

function _collectFromContainer(container, isChild) {
  const out = [];
  Array.from(container.children).forEach(function(row) {
    if (!row.classList.contains('cm-row')) return;
    const titleInput = row.querySelector('.cm-row-title');
    const labelEl    = row.querySelector('.cm-row-collapsed .cm-row-label');
    const bodyInput  = row.querySelector('.cm-row-body');
    const title   = (titleInput ? titleInput.value.trim() : '') || (labelEl ? labelEl.textContent.trim() : '') || '';
    const content = bodyInput ? bodyInput.value.trim() : '';
    const sec = { title: title, content: content };
    if (!isChild) {
      const childrenEl = row.querySelector('.cm-row-children');
      if (childrenEl) {
        const ch = _collectFromContainer(childrenEl, true);
        if (ch.length) sec.children = ch;
      }
    }
    if (title || content) out.push(sec);
  });
  return out;
}

function _collectSections(modal) {
  const list = modal.querySelector('#cm-list');
  return list ? _collectFromContainer(list, false) : [];
}

// ── 保存 / 删除 ───────────────────────────────────────────────

async function _saveCountry() {
  const modal = State.pageContainer.querySelector('#country-modal');
  const name  = modal.querySelector('#cm-name') ? modal.querySelector('#cm-name').value.trim() : '';
  if (!name) return showToast('请输入名称');
  const sections    = _collectSections(modal);
  const description = sections.length ? JSON.stringify(sections) : null;
  const payload     = { name: name, description: description };
  try {
    if (State.editingCountryId) {
      const result = await supaClient.from('countries').update(payload).eq('id', State.editingCountryId).select().single();
      if (result.error) throw result.error;
      if (result.data) {
        const idx = State.allCountries.findIndex(function(c) { return c.id === State.editingCountryId; });
        if (idx >= 0) State.allCountries[idx] = result.data;
        if (State.selectedCountry && State.selectedCountry.id === State.editingCountryId) State.setSelectedCountry(result.data);
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
