// pages/characters/modals/city-modal.js
import { supaClient } from '../../../core/supabase-client.js';
import { showToast, escHtml, confirmDialog } from '../../../core/ui.js';
import * as State from '../state.js';
import { closeModal } from '../utils.js';
import { loadAllData } from '../data-loader.js';
import { renderGeoTree } from '../geo-tree.js';
import { renderGeoDetail } from '../geo-detail.js';

// 城市预设小节（含旧字段对应关系，用于自动迁移旧数据）
const PRESETS = [
  { title: '概述',     ph: '城市总体介绍...',         oldKey: 'overview'  },
  { title: '地理位置', ph: '地理坐标、地形特征...',   oldKey: 'geography' },
  { title: '气候',     ph: '气候类型、季节特点...',   oldKey: 'climate'   },
  { title: '城市结构', ph: '城区划分、建筑风格...',   oldKey: 'structure' },
  { title: '经济',     ph: '主要产业、贸易往来...',   oldKey: null        },
  { title: '文化习俗', ph: '节庆、民俗、宗教信仰...', oldKey: null        },
  { title: '历史背景', ph: '建城由来、重大事件...',   oldKey: null        },
  { title: '著名人物', ph: '出生于此或长居于此的人物...', oldKey: null    },
];

// ── 初始化 ────────────────────────────────────────────────────

export function setupCityModal() {
  const modal = State.pageContainer.querySelector('#city-modal');
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal); });
}

export function openCityModal(city, preselectedCountryId = null) {
  State.setEditingCityId(city?.id || null);
  const modal = State.pageContainer.querySelector('#city-modal');

  // 解析小节：
  // 1. 先尝试从 overview 读 JSON（新格式）
  // 2. 否则从旧的四个字段合并（自动迁移）
  let sections = [];
  if (city?.overview) {
    try {
      const parsed = JSON.parse(city.overview);
      if (Array.isArray(parsed)) {
        sections = parsed;
      } else {
        sections = _migrateOldFields(city);
      }
    } catch (_) {
      sections = _migrateOldFields(city);
    }
  } else if (city) {
    sections = _migrateOldFields(city);
  }

  modal.querySelector('.tl-modal').innerHTML = _buildHTML(city, sections, preselectedCountryId);
  _bindEvents(modal);
  modal.classList.add('show');
  setTimeout(() => modal.querySelector('#cm-city-name')?.focus(), 100);
}

// 把旧的四个字段合并成小节列表
function _migrateOldFields(city) {
  const sections = [];
  PRESETS.filter(p => p.oldKey).forEach(p => {
    const content = city[p.oldKey];
    if (content && content.trim()) sections.push({ title: p.title, content: content.trim() });
  });
  return sections;
}

// ── HTML 构建 ─────────────────────────────────────────────────

function _buildHTML(city, sections, preselectedCountryId) {
  const usedTitles = new Set(sections.map(s => s.title));
  const presetBtns = PRESETS
    .filter(p => !usedTitles.has(p.title))
    .map(p => `<button class="cm-tag" data-title="${escHtml(p.title)}" data-ph="${escHtml(p.ph)}">${escHtml(p.title)}</button>`)
    .join('');

  const countryOptions = '<option value="">无</option>' +
    State.allCountries.map(c =>
      `<option value="${c.id}" ${(city?.country_id === c.id || preselectedCountryId === c.id) ? 'selected' : ''}>${escHtml(c.name)}</option>`
    ).join('');

  const del = city ? 'inline-flex' : 'none';

  return `<h2>${city ? '编辑城市' : '新建城市'}</h2>

<label>名称</label>
<input id="cm-city-name" type="text" value="${escHtml(city?.name || '')}"/>

<label>所属国家</label>
<select id="cm-city-country">${countryOptions}</select>

<div class="cm-sec-hdr">
  <span>内容小节</span>
  <span class="cm-hint">查看时默认折叠，点击展开；可自由增删</span>
</div>

<div class="cm-tags" id="cm-city-tags">
  ${presetBtns || '<span class="cm-tags-empty">所有预设已添加</span>'}
</div>

<div class="cm-custom-row">
  <input type="text" id="cm-city-custom" placeholder="自定义小节标题..." maxlength="30" autocomplete="off"/>
  <button class="btn bn" id="cm-city-custom-add">＋ 添加</button>
</div>

<div id="cm-city-list" class="cm-list">
  ${sections.map(_rowHTML).join('')}
</div>

<div class="modal-actions">
  <button class="btn br modal-btn-delete" id="cm-city-delete" style="display:${del}">删除</button>
  <div class="modal-actions-right">
    <button class="btn bp modal-btn" id="cm-city-save">保存</button>
    <button class="btn bn modal-btn" id="cm-city-cancel">取消</button>
  </div>
</div>`;
}

function _rowHTML(sec) {
  const ph = PRESETS.find(p => p.title === sec.title)?.ph || '在此填写内容...';
  return `<div class="cm-row">
  <div class="cm-row-hdr">
    <span class="cm-row-grip">⠿</span>
    <input class="cm-row-title" type="text" value="${escHtml(sec.title || '')}" placeholder="小节标题" maxlength="30"/>
    <button class="cm-row-del" title="删除此小节">✕</button>
  </div>
  <textarea class="cm-row-body" rows="3" placeholder="${escHtml(ph)}">${escHtml(sec.content || '')}</textarea>
</div>`;
}

// ── 事件绑定 ──────────────────────────────────────────────────

function _bindEvents(modal) {
  modal.querySelector('#cm-city-cancel')?.addEventListener('click', () => closeModal(modal));
  modal.querySelector('#cm-city-delete')?.addEventListener('click', _deleteCity);
  modal.querySelector('#cm-city-save')?.addEventListener('click', _saveCity);

  // 预设标签点击
  modal.querySelector('#cm-city-tags')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.cm-tag');
    if (!btn) return;
    _appendRow(modal, btn.dataset.title, '', btn.dataset.ph);
    btn.remove();
    const tags = modal.querySelector('#cm-city-tags');
    if (!tags.querySelector('.cm-tag'))
      tags.innerHTML = '<span class="cm-tags-empty">所有预设已添加</span>';
  });

  // 自定义添加
  const customInput = modal.querySelector('#cm-city-custom');
  function doAdd() {
    const t = customInput.value.trim();
    if (!t) { customInput.focus(); return; }
    _appendRow(modal, t, '');
    customInput.value = '';
    customInput.focus();
  }
  modal.querySelector('#cm-city-custom-add')?.addEventListener('click', doAdd);
  customInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });

  // 删除小节（事件委托）
  modal.querySelector('#cm-city-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.cm-row-del');
    if (!btn) return;
    const row   = btn.closest('.cm-row');
    const title = row?.querySelector('.cm-row-title')?.value.trim();
    row?.remove();
    // 归还预设标签
    const preset = PRESETS.find(p => p.title === title);
    if (preset) {
      const tags = modal.querySelector('#cm-city-tags');
      tags.querySelector('.cm-tags-empty')?.remove();
      if (!tags.querySelector(`[data-title="${title}"]`)) {
        const tag = document.createElement('button');
        tag.className    = 'cm-tag';
        tag.dataset.title = preset.title;
        tag.dataset.ph    = preset.ph;
        tag.textContent   = preset.title;
        tags.appendChild(tag);
      }
    }
  });
}

function _appendRow(modal, title, content, ph) {
  const list = modal.querySelector('#cm-city-list');
  const tmp  = document.createElement('div');
  tmp.innerHTML = _rowHTML({ title, content });
  const row = tmp.firstElementChild;
  if (ph) row.querySelector('.cm-row-body').placeholder = ph;
  list.appendChild(row);
  row.querySelector('.cm-row-body')?.focus();
}

function _collectSections(modal) {
  const out = [];
  modal.querySelectorAll('#cm-city-list .cm-row').forEach(row => {
    const title   = row.querySelector('.cm-row-title')?.value.trim() || '';
    const content = row.querySelector('.cm-row-body')?.value.trim()  || '';
    if (title || content) out.push({ title, content });
  });
  return out;
}

// ── 数据操作 ──────────────────────────────────────────────────

async function _saveCity() {
  const modal     = State.pageContainer.querySelector('#city-modal');
  const name      = modal.querySelector('#cm-city-name')?.value.trim();
  if (!name) return showToast('请输入名称');

  const countryIdVal = modal.querySelector('#cm-city-country')?.value;
  const sections     = _collectSections(modal);

  // 把所有内容存入 overview（JSON），其余旧字段清空
  const payload = {
    name,
    country_id: countryIdVal ? parseInt(countryIdVal) : null,
    overview:   sections.length ? JSON.stringify(sections) : null,
    geography:  null,
    climate:    null,
    structure:  null,
  };

  try {
    if (State.editingCityId) {
      const { data, error } = await supaClient
        .from('cities').update(payload).eq('id', State.editingCityId).select().single();
      if (error) throw error;
      // 直接更新内存，立即刷新详情页
      if (data) {
        const idx = State.allCities.findIndex(c => c.id === State.editingCityId);
        if (idx >= 0) State.allCities[idx] = data;
        if (State.selectedCity?.id === State.editingCityId) State.setSelectedCity(data);
      }
      showToast('已更新');
    } else {
      const { error } = await supaClient.from('cities').insert(payload);
      if (error) throw error;
      showToast('已创建');
    }
    closeModal(modal);
    await loadAllData();
    renderGeoTree();
    renderGeoDetail();
  } catch (e) {
    showToast('保存失败: ' + e.message);
  }
}

async function _deleteCity() {
  if (!await confirmDialog('确定要删除这个城市吗？关联的地标和人物将失去归属。')) return;
  try {
    const { error } = await supaClient
      .from('cities').delete().eq('id', State.editingCityId);
    if (error) throw error;
    showToast('已删除');
    closeModal(State.pageContainer.querySelector('#city-modal'));
    State.setSelectedCity(null);
    await loadAllData();
    renderGeoTree();
    renderGeoDetail();
  } catch (e) {
    showToast('删除失败: ' + e.message);
  }
}
