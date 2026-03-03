// pages/characters/modals/landmark-modal.js
// 地标编辑模态框

import { supaClient } from '../../../core/supabase-client.js';
import { showToast, confirmDialog } from '../../../core/ui.js';
import * as State from '../state.js';
import { closeModal } from '../utils.js';
import { loadAllData } from '../data-loader.js';
import { renderGeoDetail } from '../geo-detail.js';

export function setupLandmarkModal() {
  const container = State.pageContainer;
  const modal = container.querySelector('#landmark-modal');
  
  container.querySelector('#landmark-save-btn')?.addEventListener('click', saveLandmark);
  container.querySelector('#landmark-delete-btn')?.addEventListener('click', deleteLandmark);
  container.querySelector('#landmark-cancel-btn')?.addEventListener('click', () => closeModal(modal));
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal(modal);
  });
}

export function openLandmarkModal(landmark, preselectedCityId = null) {
  const container = State.pageContainer;
  State.setEditingLandmarkId(landmark?.id || null);
  
  if (!preselectedCityId && !landmark) {
    if (!State.selectedCity) {
      showToast('请先选择一个城市');
      return;
    }
    preselectedCityId = State.selectedCity.id;
  }
  
  const modal = container.querySelector('#landmark-modal');
  container.querySelector('#landmark-modal-title').textContent = landmark ? '编辑地标' : '新建地标';
  container.querySelector('#landmark-name').value = landmark?.name || '';
  container.querySelector('#landmark-desc').value = landmark?.description || '';
  
  modal.dataset.cityId = landmark?.city_id || preselectedCityId;
  
  container.querySelector('#landmark-delete-btn').style.display = landmark ? 'block' : 'none';
  
  modal.classList.add('show');
  setTimeout(() => container.querySelector('#landmark-name').focus(), 100);
}

async function saveLandmark() {
  const container = State.pageContainer;
  const name = container.querySelector('#landmark-name').value.trim();
  if (!name) return showToast('请输入名称');
  
  const description = container.querySelector('#landmark-desc').value.trim();
  const modal = container.querySelector('#landmark-modal');
  const cityId = parseInt(modal.dataset.cityId);
  
  if (!cityId) return showToast('城市ID缺失');
  
  try {
    const payload = {
      city_id: cityId,
      name,
      description: description || null
    };
    
    if (State.editingLandmarkId) {
      const { error } = await supaClient.from('landmarks').update(payload).eq('id', State.editingLandmarkId);
      if (error) throw error;
      showToast('已更新');
    } else {
      const { error } = await supaClient.from('landmarks').insert(payload);
      if (error) throw error;
      showToast('已创建');
    }
    
    closeModal(modal);
    await loadAllData();
    if (State.selectedCity) renderGeoDetail();
  } catch (e) {
    console.error('Save landmark failed:', e);
    showToast('保存失败: ' + e.message);
  }
}

async function deleteLandmark() {
  if (!await confirmDialog('确定要删除这个地标吗？')) return;
  
  try {
    const { error } = await supaClient.from('landmarks').delete().eq('id', State.editingLandmarkId);
    if (error) throw error;
    
    showToast('已删除');
    closeModal(State.pageContainer.querySelector('#landmark-modal'));
    await loadAllData();
    if (State.selectedCity) renderGeoDetail();
  } catch (e) {
    console.error('Delete landmark failed:', e);
    showToast('删除失败: ' + e.message);
  }
}
