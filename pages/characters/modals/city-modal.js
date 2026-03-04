// pages/characters/modals/city-modal.js
import { supaClient } from '../../../core/supabase-client.js';
import { showToast, escHtml, confirmDialog } from '../../../core/ui.js';
import * as State from '../state.js';
import { closeModal } from '../utils.js';
import { loadAllData } from '../data-loader.js';
import { renderGeoTree } from '../geo-tree.js';
import { renderGeoDetail } from '../geo-detail.js';

const PRESETS = [
  { title: '概述',     ph: '城市总体介绍...',           oldKey: 'overview'  },
  { title: '地理位置', ph: '地理坐标、地形特征...',     oldKey: 'geography' },
  { title: '气候',     ph: '气候类型、季节特点...',     oldKey: 'climate'   },
  { title: '城市结构', ph: '城区划分、建筑风格...',     oldKey: 'structure' },
  { title: '经济',     ph: '主要产业、贸易往来...',     oldKey: null        },
  { title: '文化习俗', ph: '节庆、民俗、宗教信仰...',   oldKey: null        },
  { title: '历史背景', ph: '建城由来、重大事件...',     oldKey: null        },
  { title: '著名人物', ph: '出生于此或长居于此的人物...', oldKey: null      },
];

export function setupCityModal() {
  const modal = State.pageContainer.querySelector('#city-modal');
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal); });
}

export function openCityModal(city, preselectedCountryId = null) {
  State.setEditingCityId(city?.id || null);
  const modal = State.pageContainer.querySelector('#city-modal');
  let sections = [];
  if (city?.overview) {
    try {
      const parsed = JSON.parse(city.overview);
      sections = Array.isArray(parsed) ? parsed : _migrateOldFields(city);
    } catch (_) { sections = _migrateOldFields(city); }
  } else if (city) {
    sections = _migrateOldFields(city);
  }
  modal.querySelector('.tl-modal').innerHTML = _buildHTML(city, sections, preselectedCountryId);
  _bindEvents(modal);
  modal.classList.add('show');
  setTimeout(() => modal.querySelector('#cm-city-name')?.focus(), 100);
}

function _migrateOldFields(city) {
  const out = [];
  PRESETS.filter(p => p.oldKey).forEach(p => {
    const v = city[p.oldKey];
    if (v && v.trim()) out.push({ title: p.title, content: v.trim() });
  });
  return out;
}

function _buildHTML(city, sections, preselectedCountryId) {
  const usedTitles = new Set(sections.map(s => s.title));
  const presetBtns = PRESETS
    .filter(p => !usedTitles.has(p.title))
    .map(p => '<button class="cm-tag" data-title="' + escHtml(p.title) + '" data-ph="' + escHtml(p.ph) + '">' + escHtml(p.title) + '</button>')
    .join('');
  const countryOptions = '<option value="">无</option>' +
    State.allCountries.map(c =>
      '<option value="' + c.id + '" ' + ((city && city.country_id === c.id) || preselectedCountryId === c.id ? 'selected' : '') + '>' + escHtml(c.name) + '</option>'
    ).join('');
  const del = city ? 'inline-flex' : 'none';
  const secRows = sections.map(_rowHTML).join('');
  const presets = presetBtns || '<span class="cm-tags-empty">所有预设已添加</span>';
  const title = city ? '编辑城市' : '新建城市';

  return '<h2>' + title + '</h2>' +
    '<label>名称</label>' +
    '<input id="cm-city-name" type="text" value="' + escHtml(city ? city.name || '' : '') + '"/>' +
    '<label>所属国家</label>' +
    '<select id="cm-city-country">' + countryOptions + '</select>' +
    '<div class="cm-sec-hdr"><span>内容小节</span><span class="cm-hint">点 ✏️ 展开编辑；拖 ⠿ 可排序</span></div>' +
    '<div class="cm-tags" id="cm-city-tags">' + presets + '</div>' +
    '<div class="cm-custom-row">' +
      '<input type="text" id="cm-city-custom" placeholder="自定义小节标题..." maxlength="30" autocomplete="off"/>' +
      '<button class="btn bn" id="cm-city-custom-add">＋ 添加</button>' +
    '</div>' +
    '<div id="cm-city-list" class="cm-list">' + secRows + '</div>' +
    '<div class="modal-actions">' +
      '<button class="btn br modal-btn-delete" id="cm-city-delete" style="display:' + del + '">删除</button>' +
      '<div class="modal-actions-right">' +
        '<button class="btn bp modal-btn" id="cm-city-save">保存</button>' +
        '<button class="btn bn modal-btn" id="cm-city-cancel">取消</button>' +
      '</div>' +
    '</div>';
}

function _rowHTML(sec) {
  const ph = PRESETS.find(p => p.title === sec.title) ? PRESETS.find(p => p.title === sec.title).ph : '在此填写内容...';
  const content = sec.content || '';
  const hasContent = content.trim().length > 0;
  const preview = hasContent
    ? escHtml(content.trim().slice(0, 60)) + (content.trim().length > 60 ? '…' : '')
    : '<span style="color:var(--muted);font-style:italic">暂无内容</span>';
  const titleVal = escHtml(sec.title || '');
  const titleLabel = escHtml(sec.title || '未命名');
  const phEsc = escHtml(ph);
  const contentEsc = escHtml(content);

  return '<div class="cm-row" draggable="false">' +
    '<div class="cm-row-collapsed">' +
      '<span class="cm-row-grip" title="拖拽排序">⠿</span>' +
      '<div class="cm-row-summary">' +
        '<span class="cm-row-label">' + titleLabel + '</span>' +
        '<span class="cm-row-preview">' + preview + '</span>' +
      '</div>' +
      '<button class="cm-row-edit" title="编辑此小节">✏️</button>' +
      '<button class="cm-row-del"  title="删除此小节">✕</button>' +
    '</div>' +
    '<div class="cm-row-expanded" style="display:none">' +
      '<div class="cm-row-expanded-hdr">' +
        '<input class="cm-row-title" type="text" value="' + titleVal + '" placeholder="小节标题" maxlength="30"/>' +
        '<button class="cm-row-collapse">▲ 收起</button>' +
      '</div>' +
      '<textarea class="cm-row-body" rows="5" placeholder="' + phEsc + '">' + contentEsc + '</textarea>' +
    '</div>' +
  '</div>';
}

function _bindEvents(modal) {
  modal.querySelector('#cm-city-cancel')?.addEventListener('click', () => closeModal(modal));
  modal.querySelector('#cm-city-delete')?.addEventListener('click', _deleteCity);
  modal.querySelector('#cm-city-save')?.addEventListener('click', _saveCity);

  modal.querySelector('#cm-city-tags')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.cm-tag');
    if (!btn) return;
    _appendRow(modal, btn.dataset.title, '', btn.dataset.ph);
    btn.remove();
    const tags = modal.querySelector('#cm-city-tags');
    if (!tags.querySelector('.cm-tag')) tags.innerHTML = '<span class="cm-tags-empty">所有预设已添加</span>';
  });

  const ci = modal.querySelector('#cm-city-custom');
  function doAdd() {
    const t = ci.value.trim();
    if (!t) { ci.focus(); return; }
    _appendRow(modal, t, '');
    ci.value = ''; ci.focus();
  }
  modal.querySelector('#cm-city-custom-add')?.addEventListener('click', doAdd);
  ci?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });

  const list = modal.querySelector('#cm-city-list');
  list?.addEventListener('click', (e) => {
    const row = e.target.closest('.cm-row');
    if (!row) return;
    if (e.target.closest('.cm-row-edit'))     { _expandRow(row); return; }
    if (e.target.closest('.cm-row-collapse')) { _collapseRow(row); return; }
    if (e.target.closest('.cm-row-del')) {
      const title = row.querySelector('.cm-row-title')
        ? row.querySelector('.cm-row-title').value.trim()
        : (row.querySelector('.cm-row-label') ? row.querySelector('.cm-row-label').textContent.trim() : '');
      row.remove();
      _restorePresetTag(modal, title);
    }
  });

  _bindDragSort(list);
}

function _expandRow(row) {
  row.querySelector('.cm-row-collapsed').style.display = 'none';
  row.querySelector('.cm-row-expanded').style.display  = 'flex';
  row.querySelector('.cm-row-body') && row.querySelector('.cm-row-body').focus();
}

function _collapseRow(row) {
  const titleInput = row.querySelector('.cm-row-title');
  const bodyInput  = row.querySelector('.cm-row-body');
  const title   = titleInput ? titleInput.value.trim() : '';
  const content = bodyInput  ? bodyInput.value.trim()  : '';
  const label   = row.querySelector('.cm-row-label');
  const preview = row.querySelector('.cm-row-preview');
  if (label)   label.textContent = title || '未命名';
  if (preview) {
    if (content) {
      preview.innerHTML = escHtml(content.slice(0, 60)) + (content.length > 60 ? '…' : '');
    } else {
      preview.innerHTML = '<span style="color:var(--muted);font-style:italic">暂无内容</span>';
    }
  }
  row.querySelector('.cm-row-collapsed').style.display = '';
  row.querySelector('.cm-row-expanded').style.display  = 'none';
}

function _restorePresetTag(modal, title) {
  const preset = PRESETS.find(p => p.title === title);
  if (!preset) return;
  const tags = modal.querySelector('#cm-city-tags');
  if (tags.querySelector('.cm-tags-empty')) tags.querySelector('.cm-tags-empty').remove();
  if (!tags.querySelector('[data-title="' + title + '"]')) {
    const tag = document.createElement('button');
    tag.className = 'cm-tag';
    tag.dataset.title = preset.title;
    tag.dataset.ph    = preset.ph;
    tag.textContent   = preset.title;
    tags.appendChild(tag);
  }
}

function _appendRow(modal, title, content, ph) {
  const list = modal.querySelector('#cm-city-list');
  const tmp  = document.createElement('div');
  tmp.innerHTML = _rowHTML({ title, content: content || '' });
  const row = tmp.firstElementChild;
  if (ph) row.querySelector('.cm-row-body').placeholder = ph;
  list.appendChild(row);
  _bindDragSort(list);
  _expandRow(row);
}

function _bindDragSort(list) {
  if (!list) return;
  let dragging = null;

  list.querySelectorAll('.cm-row').forEach(function(row) {
    const grip = row.querySelector('.cm-row-grip');
    if (!grip) return;

    grip.addEventListener('mousedown', function() { row.draggable = true; });
    grip.addEventListener('mouseup',   function() { row.draggable = false; });

    row.addEventListener('dragstart', function(e) {
      dragging = row;
      row.classList.add('cm-row-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', function() {
      dragging = null;
      row.classList.remove('cm-row-dragging');
      row.draggable = false;
      list.querySelectorAll('.cm-row').forEach(function(r) { r.classList.remove('cm-row-drag-over'); });
    });
    row.addEventListener('dragover', function(e) {
      e.preventDefault();
      if (!dragging || dragging === row) return;
      list.querySelectorAll('.cm-row').forEach(function(r) { r.classList.remove('cm-row-drag-over'); });
      row.classList.add('cm-row-drag-over');
      const rect = row.getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) {
        list.insertBefore(dragging, row);
      } else {
        list.insertBefore(dragging, row.nextSibling);
      }
    });
    row.addEventListener('dragleave', function() { row.classList.remove('cm-row-drag-over'); });
    row.addEventListener('drop', function(e) { e.preventDefault(); row.classList.remove('cm-row-drag-over'); });
  });
}

function _collectSections(modal) {
  const out = [];
  modal.querySelectorAll('#cm-city-list .cm-row').forEach(function(row) {
    const titleInput = row.querySelector('.cm-row-title');
    const labelEl    = row.querySelector('.cm-row-label');
    const bodyInput  = row.querySelector('.cm-row-body');
    const title   = (titleInput ? titleInput.value.trim() : '') || (labelEl ? labelEl.textContent.trim() : '') || '';
    const content = bodyInput ? bodyInput.value.trim() : '';
    if (title || content) out.push({ title: title, content: content });
  });
  return out;
}

async function _saveCity() {
  const modal = State.pageContainer.querySelector('#city-modal');
  const name  = modal.querySelector('#cm-city-name') ? modal.querySelector('#cm-city-name').value.trim() : '';
  if (!name) return showToast('请输入名称');
  const countryIdVal = modal.querySelector('#cm-city-country') ? modal.querySelector('#cm-city-country').value : '';
  const sections = _collectSections(modal);
  const payload = {
    name: name,
    country_id: countryIdVal ? parseInt(countryIdVal) : null,
    overview:   sections.length ? JSON.stringify(sections) : null,
    geography:  null,
    climate:    null,
    structure:  null,
  };
  try {
    if (State.editingCityId) {
      const result = await supaClient.from('cities').update(payload).eq('id', State.editingCityId).select().single();
      if (result.error) throw result.error;
      if (result.data) {
        const idx = State.allCities.findIndex(function(c) { return c.id === State.editingCityId; });
        if (idx >= 0) State.allCities[idx] = result.data;
        if (State.selectedCity && State.selectedCity.id === State.editingCityId) State.setSelectedCity(result.data);
      }
      showToast('已更新');
    } else {
      const result = await supaClient.from('cities').insert(payload);
      if (result.error) throw result.error;
      showToast('已创建');
    }
    closeModal(modal);
    await loadAllData();
    renderGeoTree();
    renderGeoDetail();
  } catch (e) { showToast('保存失败: ' + e.message); }
}

async function _deleteCity() {
  if (!await confirmDialog('确定要删除这个城市吗？关联的地标和人物将失去归属。')) return;
  try {
    const result = await supaClient.from('cities').delete().eq('id', State.editingCityId);
    if (result.error) throw result.error;
    showToast('已删除');
    closeModal(State.pageContainer.querySelector('#city-modal'));
    State.setSelectedCity(null);
    await loadAllData();
    renderGeoTree();
    renderGeoDetail();
  } catch (e) { showToast('删除失败: ' + e.message); }
}
