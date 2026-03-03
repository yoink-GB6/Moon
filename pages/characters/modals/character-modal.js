// pages/characters/modals/character-modal.js
// 人物编辑模态框

import { supaClient } from '../../../core/supabase-client.js';
import { showToast, escHtml, confirmDialog } from '../../../core/ui.js';
import * as State from '../state.js';
import { closeModal } from '../utils.js';
import { loadAllData } from '../data-loader.js';
import { renderCharactersTab } from '../characters-tab.js';
import { renderGeoDetail } from '../geo-detail.js';

export function setupCharModal() {
  const container = State.pageContainer;
  const modal = container.querySelector('#char-modal');

  container.querySelector('#char-upload-btn')?.addEventListener('click', () => {
    container.querySelector('#char-file-input').click();
  });

  container.querySelector('#char-file-input')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      State.setPendingAvatar(file, true);
      previewAvatar(file, container);
    }
  });

  container.querySelector('#char-url-btn')?.addEventListener('click', () => {
    const row = container.querySelector('#char-url-row');
    const isHidden = row.style.display === 'none' || row.style.display === '';
    row.style.display = isHidden ? 'flex' : 'none';
    if (isHidden) container.querySelector('#char-url-input').focus();
  });

  container.querySelector('#char-url-input')?.addEventListener('input', (e) => {
    const url = e.target.value.trim();
    if (url) {
      State.setPendingAvatar(url, false);
      updateAvatarPreview(url, container);
    }
  });

  container.querySelector('#char-cancel-btn')?.addEventListener('click', () => closeModal(modal));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal(modal);
  });
}

export function openCharModal(char) {
  const container = State.pageContainer;
  State.setEditingCharId(char?.id || null);
  State.setPendingAvatar(undefined, false);

  const modal = container.querySelector('#char-modal');
  container.querySelector('#char-modal-title').textContent = char ? '编辑人物' : '新建人物';
  container.querySelector('#char-name').value = char?.name || '';
  container.querySelector('#char-age').value = (char?.base_age != null) ? String(char.base_age) : '';
  container.querySelector('#char-desc').value = char?.description || '';

  const citySelect = container.querySelector('#char-city');
  citySelect.innerHTML = '<option value="">无</option>' +
    State.allCities.map(c => {
      const country = State.allCountries.find(co => co.id === c.country_id);
      const label = country ? `${country.name} - ${c.name}` : c.name;
      return `<option value="${c.id}" ${char?.city_id === c.id ? 'selected' : ''}>${escHtml(label)}</option>`;
    }).join('');

  const urlRow = container.querySelector('#char-url-row');
  urlRow.style.display = 'none';
  container.querySelector('#char-url-input').value = '';

  updateAvatarPreview(char?.avatar_url, container, char?.name);

  const deleteBtn = container.querySelector('#char-delete-btn');
  deleteBtn.style.display = char ? 'block' : 'none';

  const saveBtn = container.querySelector('#char-save-btn');
  const newSaveBtn = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
  newSaveBtn.addEventListener('click', saveCharacter);

  const newDeleteBtn = deleteBtn.cloneNode(true);
  deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
  newDeleteBtn.style.display = char ? 'block' : 'none';
  newDeleteBtn.addEventListener('click', deleteCharacter);

  modal.classList.add('show');
  setTimeout(() => container.querySelector('#char-name').focus(), 100);
}

function previewAvatar(file, container) {
  const reader = new FileReader();
  reader.onload = (e) => updateAvatarPreview(e.target.result, container);
  reader.readAsDataURL(file);
}

function updateAvatarPreview(url, container, name) {
  const preview = container.querySelector('#char-avatar-preview');
  const letter = container.querySelector('#char-avatar-letter');
  if (url) {
    preview.style.backgroundImage = `url(${url})`;
    letter.style.display = 'none';
  } else {
    preview.style.backgroundImage = 'none';
    letter.style.display = 'block';
    letter.textContent = name?.charAt(0) || '?';
  }
}

async function saveCharacter() {
  const container = State.pageContainer;
  const name = container.querySelector('#char-name').value.trim();
  if (!name) return showToast('请输入名字');

  const ageRaw = container.querySelector('#char-age').value.trim();
  const baseAge = ageRaw !== '' ? parseInt(ageRaw) : null;
  if (ageRaw !== '' && (isNaN(baseAge) || baseAge < 0)) {
    return showToast('年龄请输入有效数字');
  }

  const cityId = container.querySelector('#char-city').value;
  const description = container.querySelector('#char-desc').value.trim();

  try {
    let avatarUrl = null;

    if (State.pendingAvatar) {
      if (State.pendingAvatarIsFile) {
        const file = State.pendingAvatar;
        const ext = file.name.split('.').pop();
        const filename = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;
        const { data, error } = await supaClient.storage.from('avatars').upload(filename, file, { upsert: true });
        if (error) throw error;
        const { data: urlData } = supaClient.storage.from('avatars').getPublicUrl(data.path);
        avatarUrl = urlData.publicUrl;
      } else {
        avatarUrl = State.pendingAvatar;
      }
    } else if (State.pendingAvatar === null && State.editingCharId) {
      avatarUrl = null;
    }

    const payload = {
      name,
      base_age: baseAge,
      city_id: cityId ? parseInt(cityId) : null,
      description: description || null,
      ...(State.pendingAvatar !== undefined && { avatar_url: avatarUrl })
    };

    if (State.editingCharId) {
      const { error } = await supaClient.from('characters').update(payload).eq('id', State.editingCharId);
      if (error) throw error;
      showToast('已更新');
    } else {
      const { error } = await supaClient.from('characters').insert(payload);
      if (error) throw error;
      showToast('已创建');
    }

    closeModal(container.querySelector('#char-modal'));
    await loadAllData();
    renderCharactersTab();
    if (State.selectedCity) renderGeoDetail();
  } catch (e) {
    console.error('Save character failed:', e);
    showToast('保存失败: ' + e.message);
  }
}

async function deleteCharacter() {
  if (!await confirmDialog('确定要删除这个人物吗？')) return;
  try {
    const { error } = await supaClient.from('characters').delete().eq('id', State.editingCharId);
    if (error) throw error;
    showToast('已删除');
    closeModal(State.pageContainer.querySelector('#char-modal'));
    await loadAllData();
    renderCharactersTab();
    if (State.selectedCity) renderGeoDetail();
  } catch (e) {
    console.error('Delete character failed:', e);
    showToast('删除失败: ' + e.message);
  }
}
