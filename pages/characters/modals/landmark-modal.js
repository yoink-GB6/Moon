// pages/characters/modals/landmark-modal.js
// 地标编辑：一个城市的所有地标当成「地标建筑」这一块的小节来编辑。
// 每行 = 一个地标（标题是地标名，正文是介绍），行的增删排序就是地标的增删排序。

import { supaClient } from '../../../core/supabase-client.js';
import { showToast, confirmDialog } from '../../../core/ui.js';
import * as State from '../state.js';
import { closeModal, openModal } from '../utils.js';
import { loadAllData } from '../data-loader.js';
import { renderGeoTree } from '../geo-tree.js';
import { renderGeoDetail } from '../geo-detail.js';
import { createSectionEditor } from './section-editor.js';

// 地标千差万别，预设标题反而碍事，名字一律自己填
const editor = createSectionEditor({
  prefix: 'cm-lm',
  presets: [],
  heading: '地标建筑',
  hint: '点 ▾ 写介绍；拖 ⠿ 可排序',
});

export function setupLandmarkModal() {
  const modal = State.pageContainer.querySelector('#landmark-modal');
  let _mdOnModal = false;
  modal.addEventListener('mousedown', (e) => { _mdOnModal = (e.target === modal); });
  modal.addEventListener('mouseup', (e) => { if (_mdOnModal && e.target === modal) closeModal(modal); _mdOnModal = false; });
}

export function openLandmarksModal(cityId) {
  const city = State.allCities.find(function(c) { return c.id === cityId; });
  if (!city) return showToast('请先选择一个城市');

  const modal = State.pageContainer.querySelector('#landmark-modal');
  modal.dataset.cityId = cityId;
  const rows = State.allLandmarks
    .filter(function(l) { return l.city_id === cityId; })
    .map(function(l) { return { id: l.id, title: l.name, content: l.description || '' }; });

  modal.querySelector('.tl-modal').innerHTML =
    '<h2>' + '编辑地标建筑' + '</h2>' +
    editor.html(rows) +
    '<div class="modal-actions">' +
      editor.addButtonHTML() +
      '<div class="modal-actions-right">' +
        '<button class="btn bn modal-btn" id="cm-lm-cancel">取消</button>' +
        '<button class="btn bp modal-btn" id="cm-lm-save">保存</button>' +
      '</div>' +
    '</div>';

  modal.querySelector('#cm-lm-cancel')?.addEventListener('click', () => closeModal(modal));
  modal.querySelector('#cm-lm-save')?.addEventListener('click', _save);
  editor.bind(modal);

  openModal(modal);
  setTimeout(() => modal.querySelector('.cm-row-title')?.focus(), 100);
}

async function _save() {
  const modal  = State.pageContainer.querySelector('#landmark-modal');
  const cityId = parseInt(modal.dataset.cityId);
  if (!cityId) return showToast('城市ID缺失');

  const rows     = editor.collect(modal);
  const existing = State.allLandmarks.filter(function(l) { return l.city_id === cityId; });
  const keptIds  = new Set(rows.filter(function(r) { return r.id; }).map(function(r) { return parseInt(r.id); }));
  const removed  = existing.filter(function(l) { return !keptIds.has(l.id); });

  if (removed.length &&
      !await confirmDialog('将删除 ' + removed.length + ' 个地标：' + removed.map(function(l) { return l.name; }).join('、') + '，确定吗？')) return;

  try {
    if (removed.length) {
      const result = await supaClient.from('landmarks').delete().in('id', removed.map(function(l) { return l.id; }));
      if (result.error) throw result.error;
    }
    for (let i = 0; i < rows.length; i++) {
      const payload = {
        city_id: cityId,
        name: rows[i].title || '未命名',
        description: rows[i].content || null,
        sort_order: i,
      };
      const result = rows[i].id
        ? await supaClient.from('landmarks').update(payload).eq('id', parseInt(rows[i].id))
        : await supaClient.from('landmarks').insert(payload);
      if (result.error) throw result.error;
    }
    showToast('已保存');
    closeModal(modal);
    await loadAllData();
    renderGeoTree();
    renderGeoDetail();
  } catch (e) { showToast('保存失败: ' + e.message); }
}
