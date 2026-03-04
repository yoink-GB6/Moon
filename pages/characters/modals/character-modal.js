// pages/characters/modals/character-modal.js
import { supaClient } from '../../../core/supabase-client.js';
import { showToast, escHtml, confirmDialog } from '../../../core/ui.js';
import * as State from '../state.js';
import { closeModal } from '../utils.js';
import { loadAllData } from '../data-loader.js';
import { renderCharactersTab } from '../characters-tab.js';
import { renderGeoDetail } from '../geo-detail.js';

// ── 自定义下拉通用工具 ────────────────────────────────────────
// options: [{ value, label }]，selectedValue: 当前选中值
// onChange(value) 回调
export function initTlSelect(wrapEl, options, selectedValue, onChange) {
  const trigger  = wrapEl.querySelector('.tl-select-trigger');
  const valEl    = wrapEl.querySelector('.tl-select-val');
  const dropdown = wrapEl.querySelector('.tl-select-dropdown');
  const hidden   = wrapEl.nextElementSibling; // <input type="hidden">

  function render(sel) {
    const found = options.find(function(o) { return String(o.value) === String(sel); });
    valEl.textContent = found ? found.label : (options[0] ? options[0].label : '');
    hidden.value = sel != null ? sel : '';
    dropdown.innerHTML = options.map(function(o) {
      const isSel = String(o.value) === String(sel);
      return '<div class="tl-select-opt' + (isSel ? ' selected' : '') + '" data-val="' + escHtml(String(o.value)) + '">' + escHtml(o.label) + '</div>';
    }).join('');
    dropdown.querySelectorAll('.tl-select-opt').forEach(function(opt) {
      opt.addEventListener('click', function() {
        const v = opt.dataset.val;
        render(v);
        wrapEl.classList.remove('open');
        if (onChange) onChange(v);
      });
    });
  }

  render(selectedValue != null ? String(selectedValue) : '');

  trigger.addEventListener('click', function(e) {
    e.stopPropagation();
    const wasOpen = wrapEl.classList.contains('open');
    // 关掉其他所有下拉
    document.querySelectorAll('.tl-select.open').forEach(function(el) { el.classList.remove('open'); });
    if (!wasOpen) wrapEl.classList.add('open');
  });

  // 点外部关闭
  function onOutside(e) {
    if (!wrapEl.contains(e.target)) wrapEl.classList.remove('open');
  }
  document.addEventListener('click', onOutside);
  // modal 关闭时自动清理监听
  wrapEl._cleanupTlSelect = function() { document.removeEventListener('click', onOutside); };
}

// ── setupCharModal ────────────────────────────────────────────

export function setupCharModal() {
  const container = State.pageContainer;
  const modal     = container.querySelector('#char-modal');

  container.querySelector('#char-upload-btn')?.addEventListener('click', function() {
    container.querySelector('#char-file-input').click();
  });
  container.querySelector('#char-file-input')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) { State.setPendingAvatar(file, true); previewAvatar(file, container); }
  });
  container.querySelector('#char-url-btn')?.addEventListener('click', function() {
    const row = container.querySelector('#char-url-row');
    row.style.display = row.style.display === 'none' ? 'block' : 'none';
  });
  container.querySelector('#char-url-input')?.addEventListener('change', function(e) {
    const url = e.target.value.trim();
    if (url) { State.setPendingAvatar(url, false); updateAvatarPreview(url, container); }
  });
  container.querySelector('#char-save-btn')?.addEventListener('click', saveCharacter);
  container.querySelector('#char-delete-btn')?.addEventListener('click', deleteCharacter);
  container.querySelector('#char-cancel-btn')?.addEventListener('click', function() { closeModal(modal); });
  modal.addEventListener('click', function(e) { if (e.target === modal) closeModal(modal); });
}

// ── openCharModal ─────────────────────────────────────────────

export function openCharModal(char) {
  const container = State.pageContainer;
  State.setEditingCharId(char ? char.id : null);
  State.setPendingAvatar(undefined, false);

  const modal = container.querySelector('#char-modal');
  container.querySelector('#char-modal-title').textContent = char ? '编辑人物' : '新建人物';
  container.querySelector('#char-name').value = char ? char.name || '' : '';
  // 使用 base_age 字段
  container.querySelector('#char-age').value  = (char && char.base_age != null) ? char.base_age : '';
  container.querySelector('#char-desc').value = char ? char.description || '' : '';

  // 初始化城市自定义下拉
  const cityOptions = [{ value: '', label: '无' }].concat(
    State.allCities.map(function(c) {
      const country = State.allCountries.find(function(co) { return co.id === c.country_id; });
      return { value: String(c.id), label: country ? country.name + ' - ' + c.name : c.name };
    })
  );
  const cityWrap = container.querySelector('#char-city-select');
  if (cityWrap._cleanupTlSelect) cityWrap._cleanupTlSelect();
  initTlSelect(cityWrap, cityOptions, char && char.city_id ? String(char.city_id) : '', null);

  updateAvatarPreview(char ? char.avatar_url : null, container, char ? char.name : '');
  container.querySelector('#char-delete-btn').style.display = char ? 'block' : 'none';

  modal.classList.add('show');
  setTimeout(function() { container.querySelector('#char-name').focus(); }, 100);
}

// ── 头像预览 ──────────────────────────────────────────────────

function previewAvatar(file, container) {
  const reader = new FileReader();
  reader.onload = function(e) { updateAvatarPreview(e.target.result, container); };
  reader.readAsDataURL(file);
}

function updateAvatarPreview(url, container, name) {
  const preview = container.querySelector('#char-avatar-preview');
  const letter  = container.querySelector('#char-avatar-letter');
  if (url) {
    preview.style.backgroundImage = 'url(' + url + ')';
    preview.style.backgroundSize = 'cover';
    preview.style.backgroundPosition = 'center';
    letter.style.display = 'none';
  } else {
    preview.style.backgroundImage = 'none';
    letter.style.display = 'block';
    letter.textContent = (name && name.charAt(0)) || '?';
  }
}

// ── 保存/删除 ─────────────────────────────────────────────────

async function saveCharacter() {
  const container = State.pageContainer;
  const name = container.querySelector('#char-name').value.trim();
  if (!name) return showToast('请输入名字');

  const ageVal    = container.querySelector('#char-age').value.trim();
  const cityIdVal = container.querySelector('#char-city').value; // hidden input
  const desc      = container.querySelector('#char-desc').value.trim();

  try {
    let avatarUrl = null;
    if (State.pendingAvatar) {
      if (State.pendingAvatarIsFile) {
        const file = State.pendingAvatar;
        const ext  = file.name.split('.').pop();
        const filename = Date.now() + '_' + Math.random().toString(36).substr(2,9) + '.' + ext;
        const { data, error } = await supaClient.storage.from('avatars').upload(filename, file, { upsert: true });
        if (error) throw error;
        avatarUrl = supaClient.storage.from('avatars').getPublicUrl(data.path).data.publicUrl;
      } else {
        avatarUrl = State.pendingAvatar;
      }
    }

    const payload = {
      name,
      base_age:    ageVal !== '' ? parseInt(ageVal) : null,
      city_id:     cityIdVal ? parseInt(cityIdVal) : null,
      description: desc || null,
    };
    if (State.pendingAvatar !== undefined) payload.avatar_url = avatarUrl;

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
    showToast('删除失败: ' + e.message);
  }
}
