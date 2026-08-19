// pages/characters/modals/country-modal.js
import { supaClient } from '../../../core/supabase-client.js';
import { showToast, confirmDialog } from '../../../core/ui.js';
import { escHtml } from '../../../core/ui.js';
import * as State from '../state.js';
import { closeModal, openModal } from '../utils.js';
import { loadAllData } from '../data-loader.js';
import { renderGeoTree } from '../geo-tree.js';
import { renderGeoDetail } from '../geo-detail.js';
import { navReflect } from '../geo-nav.js';
import { createSectionEditor, parseSections } from './section-editor.js';

// ── markdown 工具（从独立模块导入，避免循环依赖）─────────────────
import { mdToChildren, childrenToMd } from './md-utils.js';
export { mdToChildren, childrenToMd };

// 国家内容层级深，正文里用 # ## ### 写子小节
const editor = createSectionEditor({
  prefix: 'cm',
  md: true,
  presets: [
    { title: '概述',       ph: '简要介绍这个国家/势力...' },
    { title: '地理位置',   ph: '地形、地貌、所处区域...' },
    { title: '政治体系',   ph: '政府形式、权力结构、统治阶层...' },
    { title: '经济状况',   ph: '主要产业、贸易往来、货币制度...' },
    { title: '文化习俗',   ph: '语言、宗教、节庆、民俗传统...' },
    { title: '军事力量',   ph: '军队组成、战斗力、武器装备...' },
    { title: '历史背景',   ph: '建国由来、重大事件、历史变迁...' },
    { title: '地标建筑',   ph: '著名建筑、重要场所...' },
    { title: '与他国关系', ph: '外交关系、盟友、敌对势力...' },
  ],
});

// ── setup / open ──────────────────────────────────────────────

export function setupCountryModal() {
  const modal = State.pageContainer.querySelector('#country-modal');
  let _mdOnModal = false;
  modal.addEventListener('mousedown', function(e) { _mdOnModal = (e.target === modal); });
  modal.addEventListener('mouseup', function(e) { if (_mdOnModal && e.target === modal) closeModal(modal); _mdOnModal = false; });
}

export function openCountryModal(country) {
  State.setEditingCountryId(country ? country.id : null);
  const modal = State.pageContainer.querySelector('#country-modal');
  modal.querySelector('.tl-modal').innerHTML =
    _buildHTML(country, parseSections(country && country.description));
  _bindEvents(modal);
  openModal(modal);
  setTimeout(function() { const n = modal.querySelector('#cm-name'); if (n) n.focus(); }, 100);
}

// ── HTML ──────────────────────────────────────────────────────

function _buildHTML(country, sections) {
  const del = country ? 'inline-flex' : 'none';

  return '<h2>' + (country ? '编辑国家 / 势力' : '新建国家 / 势力') + '</h2>' +
    '<label>名称</label>' +
    '<input id="cm-name" type="text" value="' + escHtml(country ? country.name || '' : '') + '"/>' +
    editor.html(sections) +
    '<div class="modal-actions">' +
      '<button class="btn br modal-btn-delete" id="cm-delete" style="display:' + del + '">删除</button>' +
      editor.addButtonHTML() +
      '<div class="modal-actions-right">' +
        '<button class="btn bn modal-btn" id="cm-cancel">取消</button>' +
        '<button class="btn bp modal-btn" id="cm-save">保存</button>' +
      '</div>' +
    '</div>';
}

// ── 事件绑定 ─────────────────────────────────────────────────

function _bindEvents(modal) {
  modal.querySelector('#cm-cancel')?.addEventListener('click', function() { closeModal(modal); });
  modal.querySelector('#cm-delete')?.addEventListener('click', _deleteCountry);
  modal.querySelector('#cm-save')?.addEventListener('click', _saveCountry);

  editor.bind(modal);
}

// ── 保存 / 删除 ───────────────────────────────────────────────

async function _saveCountry() {
  const modal = State.pageContainer.querySelector('#country-modal');
  const name  = modal.querySelector('#cm-name')?.value.trim() || '';
  if (!name) return showToast('请输入名称');
  const sections    = editor.collect(modal);
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
    State.setSelectedCity(null);
    navReflect();
    await loadAllData();
    renderGeoTree();
    renderGeoDetail();
  } catch (e) { showToast('删除失败: ' + e.message); }
}
