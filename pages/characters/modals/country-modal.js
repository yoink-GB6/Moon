// pages/characters/modals/country-modal.js
// 国家编辑模态框

import { supaClient } from '../../../core/supabase-client.js';
import { showToast, confirmDialog } from '../../../core/ui.js';
import * as State from '../state.js';
import { closeModal } from '../utils.js';
import { loadAllData } from '../data-loader.js';
import { renderGeoTree } from '../geo-tree.js';
import { renderGeoDetail } from '../geo-detail.js';

export function setupCountryModal() {
  const container = State.pageContainer;
  const modal = container.querySelector('#country-modal');
  
  container.querySelector('#country-save-btn')?.addEventListener('click', saveCountry);
  container.querySelector('#country-delete-btn')?.addEventListener('click', deleteCountry);
  container.querySelector('#country-cancel-btn')?.addEventListener('click', () => closeModal(modal));
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal(modal);
  });
}

export function openCountryModal(country) {
  const container = State.pageContainer;
  State.setEditingCountryId(country?.id || null);
  
  const modal = container.querySelector('#country-modal');
  container.querySelector('#country-modal-title').textContent = country ? '编辑国家' : '新建国家';
  container.querySelector('#country-name').value = country?.name || '';
  container.querySelector('#country-desc').value = country?.description || '';
  
  container.querySelector('#country-delete-btn').style.display = country ? 'block' : 'none';
  
  modal.classList.add('show');
  setTimeout(() => container.querySelector('#country-name').focus(), 100);
}

async function saveCountry() {
  const container = State.pageContainer;
  const name = container.querySelector('#country-name').value.trim();
  if (!name) return showToast('请输入名称');
  
  const description = container.querySelector('#country-desc').value.trim();
  
  try {
    const payload = { name, description: description || null };
    
    if (State.editingCountryId) {
      const { error } = await supaClient.from('countries').update(payload).eq('id', State.editingCountryId);
      if (error) throw error;
      showToast('已更新');
    } else {
      const { error } = await supaClient.from('countries').insert(payload);
      if (error) throw error;
      showToast('已创建');
    }
    
    closeModal(container.querySelector('#country-modal'));
    await loadAllData();
    renderGeoTree();
    if (State.selectedCountry) renderGeoDetail();
  } catch (e) {
    console.error('Save country failed:', e);
    showToast('保存失败: ' + e.message);
  }
}

async function deleteCountry() {
  if (!await confirmDialog('确定要删除这个国家吗？关联的城市将变为无国家状态。')) return;
  
  try {
    const { error } = await supaClient.from('countries').delete().eq('id', State.editingCountryId);
    if (error) throw error;
    
    showToast('已删除');
    closeModal(State.pageContainer.querySelector('#country-modal'));
    State.setSelectedCountry(null);
    await loadAllData();
    renderGeoTree();
    renderGeoDetail();
  } catch (e) {
    console.error('Delete country failed:', e);
    showToast('删除失败: ' + e.message);
  }
}
