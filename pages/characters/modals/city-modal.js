// pages/characters/modals/city-modal.js
import { supaClient } from '../../../core/supabase-client.js';
import { showToast, escHtml, confirmDialog } from '../../../core/ui.js';
import * as State from '../state.js';
import { closeModal } from '../utils.js';
import { loadAllData } from '../data-loader.js';
import { renderGeoTree } from '../geo-tree.js';
import { renderGeoDetail } from '../geo-detail.js';
import { navReflect } from '../geo-nav.js';
import { initTlSelect } from './character-modal.js';
import { createSectionEditor, parseSections } from './section-editor.js';

const editor = createSectionEditor({
  prefix: 'cm-city',
  presets: [
    { title: '概述',     ph: '城市总体介绍...'           },
    { title: '地理位置', ph: '地理坐标、地形特征...'     },
    { title: '气候',     ph: '气候类型、季节特点...'     },
    { title: '城市结构', ph: '城区划分、建筑风格...'     },
    { title: '经济',     ph: '主要产业、贸易往来...'     },
    { title: '文化习俗', ph: '节庆、民俗、宗教信仰...'   },
    { title: '历史背景', ph: '建城由来、重大事件...'     },
    { title: '著名人物', ph: '出生于此或长居于此的人物...' },
  ],
});

export function setupCityModal() {
  const modal = State.pageContainer.querySelector('#city-modal');
  let _mdOnModal = false;
  modal.addEventListener('mousedown', (e) => { _mdOnModal = (e.target === modal); });
  modal.addEventListener('mouseup', (e) => { if (_mdOnModal && e.target === modal) closeModal(modal); _mdOnModal = false; });
}

export function openCityModal(city, preselectedCountryId = null) {
  State.setEditingCityId(city?.id || null);
  const modal = State.pageContainer.querySelector('#city-modal');
  modal.querySelector('.tl-modal').innerHTML =
    _buildHTML(city, parseSections(city?.overview), preselectedCountryId);
  _bindEvents(modal);
  modal.classList.add('show');
  setTimeout(() => modal.querySelector('#cm-city-name')?.focus(), 100);
}

function _buildHTML(city, sections, preselectedCountryId) {
  const selCountryId = city ? String(city.country_id || '') : (preselectedCountryId ? String(preselectedCountryId) : '');
  const del = city ? 'inline-flex' : 'none';

  return '<h2>' + (city ? '编辑城市' : '新建城市') + '</h2>' +
    '<label>名称</label>' +
    '<input id="cm-city-name" type="text" value="' + escHtml(city ? city.name || '' : '') + '"/>' +
    '<label>所属国家</label>' +
    '<div class="tl-select" id="cm-city-country-select"><div class="tl-select-trigger"><span class="tl-select-val">无</span><span class="tl-select-arrow">▾</span></div><div class="tl-select-dropdown"></div></div>' +
    '<input type="hidden" id="cm-city-country" data-init="' + escHtml(selCountryId) + '" value="' + escHtml(selCountryId) + '"/>' +
    editor.html(sections) +
    '<div class="modal-actions">' +
      '<button class="btn br modal-btn-delete" id="cm-city-delete" style="display:' + del + '">删除</button>' +
      '<div class="modal-actions-right">' +
        '<button class="btn bp modal-btn" id="cm-city-save">保存</button>' +
        '<button class="btn bn modal-btn" id="cm-city-cancel">取消</button>' +
      '</div>' +
    '</div>';
}

function _bindEvents(modal) {
  // 初始化国家自定义下拉
  const countryWrap = modal.querySelector('#cm-city-country-select');
  if (countryWrap) {
    if (countryWrap._cleanupTlSelect) countryWrap._cleanupTlSelect();
    const countryOpts = [{ value: '', label: '无' }].concat(
      State.allCountries.map(function(c) { return { value: String(c.id), label: c.name }; })
    );
    const hiddenCountry = modal.querySelector('#cm-city-country');
    const initCountryVal = hiddenCountry ? hiddenCountry.getAttribute('data-init') || '' : '';
    initTlSelect(countryWrap, countryOpts, initCountryVal, null);
  }

  modal.querySelector('#cm-city-cancel')?.addEventListener('click', () => closeModal(modal));
  modal.querySelector('#cm-city-delete')?.addEventListener('click', _deleteCity);
  modal.querySelector('#cm-city-save')?.addEventListener('click', _saveCity);

  editor.bind(modal);
}

async function _saveCity() {
  const modal = State.pageContainer.querySelector('#city-modal');
  const name  = modal.querySelector('#cm-city-name') ? modal.querySelector('#cm-city-name').value.trim() : '';
  if (!name) return showToast('请输入名称');
  const countryIdVal = modal.querySelector('#cm-city-country') ? modal.querySelector('#cm-city-country').value : '';
  const sections = editor.collect(modal);
  const payload = {
    name: name,
    country_id: countryIdVal ? parseInt(countryIdVal) : null,
    overview:   sections.length ? JSON.stringify(sections) : null,
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
    navReflect();
    await loadAllData();
    renderGeoTree();
    renderGeoDetail();
  } catch (e) { showToast('删除失败: ' + e.message); }
}
