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
  { title: '文化习俧',   ph: '语言、宗教、节庆、民俗传统...' },
  { title: '军事力量',   ph: '军队组成、战斗力、武器装备...' },
  { title: '历史背景',   ph: '建国由来、重大事件、历史变迁...' },
  { title: '地标建筑',   ph: '著名建筑、重要场所...' },
  { title: '与他国关系', ph: '外交关系、盟友、敌对势力...' },
];

export function setupCountryModal() {
  const modal = State.pageContainer.querySelector('#country-modal');
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal); });
}

export function openCountryModal(country) {
  State.setEditingCountryId(country?.id || null);
  const modal = State.pageContainer.querySelector('#country-modal');
  let sections = [];
  if (country?.description) {
    try {
      const parsed = JSON.parse(country.description);
      sections = Array.isArray(parsed) ? parsed : [{ title: '概述', content: country.description }];
    } catch (_) { sections = [{ title: '概述', content: country.description }]; }
  }
  modal.querySelector('.tl-modal').innerHTML = _buildHTML(country, sections);
  _bindEvents(modal);
  modal.classList.add('show');
  setTimeout(() => modal.querySelector('#cm-name')?.focus(), 100);
}

function _buildHTML(country, sections) {
  const usedTitles = new Set(sections.map(s => s.title));
  const presetBtns = PRESETS
    .filter(p => !usedTitles.has(p.title))
    .map(p => `<button class="cm-tag" data-title="${escHtml(p.title)}" data-ph="${escHtml(p.ph)}">${escHtml(p.title)}</button>`)
    .join('');
  const del = country ? 'inline-flex' : 'none';
  return `<h2>${country ? '编辑国家 / 势力' : '新建国家 / 势力'}</h2>
<label>名称</label>
<input id="cm-name" type="text" value="${escHtml(country?.name || '')}"/>
<div class="cm-sec-hdr"><span>内容小节</span><span class="cm-hint">查看时默认折叠，点击展开；可自由增删</span></div>
<div class="cm-tags" id="cm-tags">
  ${presetBtns || '<span class="cm-tags-empty">所有预设已添加</span>'}
</div>
<div class="cm-custom-row">
  <input type="text" id="cm-custom" placeholder="自定义小节标题..." maxlength="30" autocomplete="off"/>
  <button class="btn bn" id="cm-custom-add">＋ 添加</button>
</div>
<div id="cm-list" class="cm-list">
  ${sections.map(_rowHTML).join('')}
</div>
<div class="modal-actions">
  <button class="btn br modal-btn-delete" id="cm-delete" style="display:${del}">删除</button>
  <div class="modal-actions-right">
    <button class="btn bp modal-btn" id="cm-save">保存</button>
    <button class="btn bn modal-btn" id="cm-cancel">取消</button>
  </div>
</div>`;
}

function _rowHTML(sec) {
  const ph = PRESETS.find(p => p.title === sec.title)?.ph || '在此填写内容...';
  return `<div class="cm-row">
  <div class="cm-row-hdr">
    <span class="cm-row-grip">⠣</span>
    <input class="cm-row-title" type="text" value="${escHtml(sec.title || '')}" placeholder="小节标题" maxlength="30"/>
    <button class="cm-row-del" title="删除此小节">✕</button>
  </div>
  <textarea class="cm-row-body" rows="3" placeholder="${escHtml(ph)}">${escHtml(sec.content || '')}</textarea>
</div>`;
}

function _bindEvents(modal) {
  modal.querySelector('#cm-cancel')?.addEventListener('click', () => closeModal(modal));
  modal.querySelector('#cm-delete')?.addEventListener('click', _deleteCountry);
  modal.querySelector('#cm-save')?.addEventListener('click', _saveCountry);
  modal.querySelector('#cm-tags')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.cm-tag');
    if (!btn) return;
    _appendRow(modal, btn.dataset.title, '', btn.dataset.ph);
    btn.remove();
    const tags = modal.querySelector('#cm-tags');
    if (!tags.querySelector('.cm-tag')) tags.innerHTML = '<span class="cm-tags-empty">所有预设已添加</span>';
  });
  const ci = modal.querySelector('#cm-custom');
  function doAdd() {
    const t = ci.value.trim();
    if (!t) { ci.focus(); return; }
    _appendRow(modal, t, '');
    ci.value = ''; ci.focus();
  }
  modal.querySelector('#cm-custom-add')?.addEventListener('click', doAdd);
  ci?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
  modal.querySelector('#cm-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.cm-row-del');
    if (!btn) return;
    const row = btn.closest('.cm-row');
    const title = row?.querySelector('.cm-row-title')?.value.trim();
    row?.remove();
    const preset = PRESETS.find(p => p.title === title);
    if (preset) {
      const tags = modal.querySelector('#cm-tags');
      tags.querySelector('.cm-tags-empty')?.remove();
      if (!tags.querySelector(`[data-title="${title}"]`)) {
        const tag = document.createElement('button');
        tag.className = 'cm-tag'; tag.dataset.title = preset.title;
        tag.dataset.ph = preset.ph; tag.textContent = preset.title;
        tags.appendChild(tag);
      }
    }
  });
}

function _appendRow(modal, title, content, ph) {
  const list = modal.querySelector('#cm-list');
  const tmp = document.createElement('div');
  tmp.innerHTML = _rowHTML({ title, content });
  const row = tmp.firstElementChild;
  if (ph) row.querySelector('.cm-row-body').placeholder = ph;
  list.appendChild(row);
  row.querySelector('.cm-row-body')?.focus();
}

function _collectSections(modal) {
  const out = [];
  modal.querySelectorAll('#cm-list .cm-row').forEach(row => {
    const title   = row.querySelector('.cm-row-title')?.value.trim() || '';
    const content = row.querySelector('.cm-row-body')?.value.trim()  || '';
    if (title || content) out.push({ title, content });
  });
  return out;
}

async function _saveCountry() {
  const modal = State.pageContainer.querySelector('#country-modal');
  const name = modal.querySelector('#cm-name')?.value.trim();
  if (!name) return showToast('请输入名称');
  const sections = _collectSections(modal);
  const description = sections.length ? JSON.stringify(sections) : null;
  const payload = { name, description };
  try {
    if (State.editingCountryId) {
      const { data, error } = await supaClient.from('countries').update(payload).eq('id', State.editingCountryId).select().single();
      if (error) throw error;
      if (data) {
        const idx = State.allCountries.findIndex(c => c.id === State.editingCountryId);
        if (idx >= 0) State.allCountries[idx] = data;
        if (State.selectedCountry?.id === State.editingCountryId) State.setSelectedCountry(data);
      }
      showToast('已更新');
    } else {
      const { error } = await supaClient.from('countries').insert(payload);
      if (error) throw error;
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
    const { error } = await supaClient.from('countries').delete().eq('id', State.editingCountryId);
    if (error) throw error;
    showToast('已删除');
    closeModal(State.pageContainer.querySelector('#country-modal'));
    State.setSelectedCountry(null);
    await loadAllData();
    renderGeoTree();
    renderGeoDetail();
  } catch (e) { showToast('删除失败: ' + e.message); }
}