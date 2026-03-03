// pages/characters/modals/city-modal.js
// 城市编辑模态框

import { supaClient } from '../../../core/supabase-client.js';
import { showToast, escHtml, confirmDialog } from '../../../core/ui.js';
import * as State from '../state.js';
import { closeModal } from '../utils.js';
import { loadAllData } from '../data-loader.js';
import { renderGeoTree } from '../geo-tree.js';
import { renderGeoDetail } from '../geo-detail.js';

export function setupCityModal() {
  const container = State.pageContainer;
  const modal = container.querySelector('#city-modal');
  
  // 只绑定关闭行为，保存/删除在 open 时绑定，避免事件丢失
  container.querySelector('#city-cancel-btn')?.addEventListener('click', () => closeModal(modal));
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal(modal);
  });
}

export function openCityModal(city, preselectedCountryId = null) {
  const container = State.pageContainer;
  State.setEditingCityId(city?.id || null);
  
  const modal = container.querySelector('#city-modal');
  container.querySelector('#city-modal-title').textContent = city ? '编辑城市' : '新建城市';
  container.querySelector('#city-name').value = city?.name || '';
  container.querySelector('#city-overview').value = city?.overview || '';
  container.querySelector('#city-geography').value = city?.geography || '';
  container.querySelector('#city-climate').value = city?.climate || '';
  container.querySelector('#city-structure').value = city?.structure || '';
  
  // 国家选择
  const countrySelect = container.querySelector('#city-country');
  countrySelect.innerHTML = '<option value="">无</option>' + 
    State.allCountries.map(c => 
      `<option value="${c.id}" ${(city?.country_id === c.id || preselectedCountryId === c.id) ? 'selected' : ''}>${escHtml(c.name)}</option>`
    ).join('');
  
  const deleteBtn = container.querySelector('#city-delete-btn');
  deleteBtn.style.display = city ? 'block' : 'none';
  
  // 每次打开时重新绑定保存/删除，防止旧监听器残留或未绑上
  const saveBtn = container.querySelector('#city-save-btn');
  const newSaveBtn = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
  newSaveBtn.addEventListener('click', saveCity);
  
  const newDeleteBtn = deleteBtn.cloneNode(true);
  deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
  newDeleteBtn.style.display = city ? 'block' : 'none';
  newDeleteBtn.addEventListener('click', deleteCity);
  
  modal.classList.add('show');
  setTimeout(() => container.querySelector('#city-name').focus(), 100);
}

async function saveCity() {
  const container = State.pageContainer;
  const name = container.querySelector('#city-name').value.trim();
  if (!name) return showToast('请输入名称');
  
  const countryId = container.querySelector('#city-country').value;
  const overview = container.querySelector('#city-overview').value.trim();
  const geography = container.querySelector('#city-geography').value.trim();
  const climate = container.querySelector('#city-climate').value.trim();
  const structure = container.querySelector('#city-structure').value.trim();
  
  try {
    const payload = {
      name,
      country_id: countryId ? parseInt(countryId) : null,
      overview: overview || null,
      geography: geography || null,
      climate: climate || null,
      structure: structure || null
    };
    
    if (State.editingCityId) {
      const { error } = await supaClient.from('cities').update(payload).eq('id', State.editingCityId);
      if (error) throw error;
      showToast('已更新');
    } else {
      const { error } = await supaClient.from('cities').insert(payload);
      if (error) throw error;
      showToast('已创建');
    }
    
    closeModal(container.querySelector('#city-modal'));
    await loadAllData();
    renderGeoTree();
    // 修复：无论是新建还是编辑都刷新详情（原来新建时 selectedCity 为 null 导致不刷新）
    renderGeoDetail();
  } catch (e) {
    console.error('Save city failed:', e);
    showToast('保存失败: ' + e.message);
  }
}

async function deleteCity() {
  if (!await confirmDialog('确定要删除这个城市吗？关联的地标和人物将失去归属。')) return;
  
  try {
    const { error } = await supaClient.from('cities').delete().eq('id', State.editingCityId);
    if (error) throw error;
    
    showToast('已删除');
    closeModal(State.pageContainer.querySelector('#city-modal'));
    State.setSelectedCity(null);
    await loadAllData();
    renderGeoTree();
    renderGeoDetail();
  } catch (e) {
    console.error('Delete city failed:', e);
    showToast('删除失败: ' + e.message);
  }
}
