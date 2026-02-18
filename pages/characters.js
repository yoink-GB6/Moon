// pages/characters.js
// Character 总表页面：所有人物的统一管理中心

import { supaClient, setSyncStatus, dbError } from '../core/supabase-client.js';
import { isEditor, onAuthChange } from '../core/auth.js';
import { showToast, escHtml, confirmDialog } from '../core/ui.js';

let allChars = [];
let editCharId = null;
let pendingAvatar = undefined, pendingAvatarIsFile = false;
let realtimeCh = null;

export async function mount(container) {
  container.innerHTML = buildHTML();
  bindControls(container);
  onAuthChange(() => updateUI(container));
  updateUI(container);  // Initial UI update based on current auth state
  await fetchAll(container);
  subscribeRealtime(container);
}

export function unmount() {
  realtimeCh && supaClient.removeChannel(realtimeCh);
}

function buildHTML() {
  return `
<div class="chars-layout">
  <div class="chars-header">
    <h2>👥 Character 总表</h2>
    <button class="btn bp" id="chars-add-btn" style="display:none">＋ 新建人物</button>
  </div>
  <div class="chars-grid" id="chars-grid"></div>
</div>

<!-- Edit modal -->
<div id="char-edit-modal" class="tl-modal-overlay">
  <div class="tl-modal" style="max-width:460px" onmousedown="event.stopPropagation()">
    <h2 id="char-modal-title">新建人物</h2>
    <label>名字</label>
    <input id="char-name" type="text" autocomplete="off"/>
    <label>初始年龄（可选，仅用于时间轴）</label>
    <input id="char-age" type="number" min="0" max="200" placeholder="留空则不设定"/>
    <label>描述（可选）</label>
    <textarea id="char-desc" rows="3" placeholder="人物介绍..." style="margin-bottom:12px"></textarea>
    <label>头像</label>
    <div class="tl-avatar-wrap" style="margin-bottom:12px">
      <div id="char-avatar-preview" class="tl-avatar-preview">
        <span id="char-avatar-letter">?</span>
        <div id="char-avatar-clear-x" title="移除头像">✕</div>
      </div>
      <div class="tl-avatar-btns-col">
        <div class="tl-avatar-btns">
          <button class="btn bn" id="char-upload-btn">📁 上传</button>
          <button class="btn bn" id="char-url-btn">🔗 链接</button>
        </div>
        <div id="char-url-row" style="display:none" class="tl-url-row">
          <input id="char-url-input" type="text" placeholder="https://..."/>
          <button class="btn bp" id="char-url-confirm">确认</button>
        </div>
        <div id="char-avatar-error" style="display:none;color:#e74c3c;font-size:11px">图片加载失败</div>
      </div>
    </div>
    <input type="file" id="char-file-input" accept="image/*"/>
    <div class="mbtns" style="justify-content:flex-end;margin-top:12px">
      <button class="btn bn" id="char-modal-cancel">取消</button>
      <button class="btn bp" id="char-modal-save">保存</button>
    </div>
    <div class="mbtns" style="justify-content:center;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
      <button class="btn br" id="char-modal-delete" style="min-width:120px;display:none">🗑 删除此人物</button>
    </div>
  </div>
</div>`;
}

function bindControls(container) {
  container.querySelector('#chars-add-btn').addEventListener('click', () => openModal(null, container));
  container.querySelector('#char-modal-cancel').addEventListener('click', () => closeModal(container));
  container.querySelector('#char-modal-save').addEventListener('click', () => saveChar(container));
  container.querySelector('#char-modal-delete').addEventListener('click', () => deleteChar(container));
  container.querySelector('#char-upload-btn').addEventListener('click', () => container.querySelector('#char-file-input').click());
  container.querySelector('#char-url-btn').addEventListener('click', () => {
    const row = container.querySelector('#char-url-row');
    row.style.display = row.style.display==='none' ? '' : 'none';
    if (row.style.display!=='none') container.querySelector('#char-url-input').focus();
  });
  container.querySelector('#char-url-confirm').addEventListener('click', () => applyUrl(container));
  container.querySelector('#char-avatar-clear-x').addEventListener('click', () => clearAvatar(container));
  container.querySelector('#char-file-input').addEventListener('change', e => handleFile(e, container));
  container.querySelector('#char-edit-modal').addEventListener('mousedown', e => {
    if (e.target === container.querySelector('#char-edit-modal')) closeModal(container);
  });
}

async function fetchAll(container) {
  setSyncStatus('syncing');
  try {
    const { data, error } = await supaClient.from('characters').select('*').order('id');
    if (error) throw error;
    allChars = (data||[]).map(c => ({
      id:c.id, name:c.name, baseAge:c.base_age, ageLimit:c.age_limit,
      color:c.color||'#7c83f7', avatar:c.avatar_url||undefined, description:c.description||'',
    }));
    renderGrid(container);
    setSyncStatus('ok');
  } catch(e) { dbError('加载 Character 表', e); }
}

function renderGrid(container) {
  const grid = container.querySelector('#chars-grid');
  if (!allChars.length) {
    grid.innerHTML = '<div class="chars-empty">暂无人物，点击右上角「新建人物」添加</div>';
    return;
  }
  grid.innerHTML = allChars.map(c => {
    const av = c.avatar
      ? `<div class="char-card-av"><img src="${escHtml(c.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"></div>`
      : `<div class="char-card-av" style="background:${c.color}">${escHtml(c.name.charAt(0).toUpperCase())}</div>`;
    const desc = c.description ? `<div class="char-card-desc">${escHtml(c.description)}</div>` : '';
    const age = c.baseAge != null ? `<span class="char-card-age">${c.baseAge}岁</span>` : '';
    return `<div class="char-card" data-id="${c.id}">
      ${av}
      <div class="char-card-name">${escHtml(c.name)}</div>
      ${age}
      ${desc}
    </div>`;
  }).join('');

  grid.querySelectorAll('.char-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = parseInt(card.dataset.id);
      const c = allChars.find(x => x.id === id);
      if (c) openModal(c, container);
    });
  });
}

function openModal(c, container) {
  editCharId = c ? c.id : null;  // Set ID first, before any early returns
  if (!isEditor()) { showToast('🔒 请先解锁编辑'); return; }
  pendingAvatar = undefined; pendingAvatarIsFile = false;
  container.querySelector('#char-modal-title').textContent = c ? '编辑人物' : '新建人物';
  container.querySelector('#char-name').value = c ? c.name : '';
  container.querySelector('#char-age').value = c?.baseAge != null ? c.baseAge : '';
  container.querySelector('#char-desc').value = c ? c.description : '';
  container.querySelector('#char-url-input').value = '';
  container.querySelector('#char-url-row').style.display = 'none';
  container.querySelector('#char-avatar-error').style.display = 'none';
  refreshAvatarPreview(container, c?.avatar, c?.name, c?.color);
  container.querySelector('#char-modal-delete').style.display = c ? '' : 'none';
  container.querySelector('#char-edit-modal').classList.add('show');
  setTimeout(() => container.querySelector('#char-name').focus(), 60);
}

function closeModal(container) {
  container.querySelector('#char-edit-modal').classList.remove('show');
  editCharId = null; pendingAvatar = undefined; pendingAvatarIsFile = false;
}

function refreshAvatarPreview(container, src, name, color) {
  const p = container.querySelector('#char-avatar-preview');
  const xBtn = container.querySelector('#char-avatar-clear-x');
  p.style.background = color || '#252840';
  if (src) {
    p.innerHTML = `<img src="${src}" onerror="this.parentElement.innerHTML='<span style=color:#e74c3c>✕</span>'" style="width:100%;height:100%;object-fit:cover"/>`;
  } else {
    p.innerHTML = `<span style="color:#fff;font-size:20px;font-weight:700">${(name||'?').charAt(0).toUpperCase()}</span>`;
  }
  p.appendChild(xBtn);
  xBtn.style.display = src ? '' : 'none';
}

function handleFile(e, container) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img2 = new Image();
    img2.onload = () => {
      const MAX = 256, cv = document.createElement('canvas');
      cv.width = MAX; cv.height = MAX;
      const c2 = cv.getContext('2d');
      const sc = Math.max(MAX/img2.width, MAX/img2.height);
      const sw = Math.round(MAX/sc), sh = Math.round(MAX/sc);
      const sx = Math.round((img2.width-sw)/2), sy = Math.round((img2.height-sh)/2);
      c2.drawImage(img2, sx, sy, sw, sh, 0, 0, MAX, MAX);
      const result = cv.toDataURL('image/jpeg', .82);
      pendingAvatar = result; pendingAvatarIsFile = true;
      container.querySelector('#char-avatar-error').style.display = 'none';
      refreshAvatarPreview(container, result);
    };
    img2.src = ev.target.result;
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

function applyUrl(container) {
  const url = container.querySelector('#char-url-input').value.trim();
  if (!url) return;
  pendingAvatar = url; pendingAvatarIsFile = false;
  container.querySelector('#char-avatar-error').style.display = 'none';
  refreshAvatarPreview(container, url);
  container.querySelector('#char-url-row').style.display = 'none';
}

function clearAvatar(container) {
  pendingAvatar = null; pendingAvatarIsFile = false;
  refreshAvatarPreview(container, null);
  container.querySelector('#char-avatar-error').style.display = 'none';
  showToast('头像已清除');
}

async function uploadImage(base64) {
  const arr = base64.split(','), mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]); let n = bstr.length; const u8 = new Uint8Array(n);
  while (n--) u8[n] = bstr.charCodeAt(n);
  const blob = new Blob([u8], {type: mime});
  const filename = `avatar_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
  try {
    const { data: upData, error: upErr } = await supaClient.storage.from('avatars').upload(filename, blob, {contentType: 'image/jpeg', upsert: false});
    if (upErr) throw upErr;
    const { data: urlData } = supaClient.storage.from('avatars').getPublicUrl(filename);
    const publicUrl = urlData?.publicUrl;
    if (!publicUrl) throw new Error('getPublicUrl 返回为空');
    console.log('[upload] 头像上传成功:', publicUrl);
    return publicUrl;
  } catch (e) {
    console.error('[upload] 头像上传失败:', e);
    dbError('上传头像', e);
    return null;
  }
}

async function saveChar(container) {
  if (!isEditor()) return;
  const name = container.querySelector('#char-name').value.trim();
  if (!name) { showToast('名字不能为空'); return; }
  const ageStr = container.querySelector('#char-age').value.trim();
  const baseAge = ageStr ? parseInt(ageStr) : null;
  const desc = container.querySelector('#char-desc').value.trim();

  let avatarUrl = undefined;
  if (pendingAvatar !== undefined) {
    if (pendingAvatar === null) {
      avatarUrl = null;
    } else if (pendingAvatarIsFile) {
      showToast('⏳ 上传头像中…');
      avatarUrl = await uploadImage(pendingAvatar) || pendingAvatar;
    } else {
      avatarUrl = pendingAvatar;
    }
  }

  const row = {
    name, base_age: baseAge, description: desc,
    avatar_url: avatarUrl !== undefined ? avatarUrl : (editCharId ? allChars.find(c=>c.id===editCharId)?.avatar : null),
  };

  const savingId = editCharId;  // Save ID before closeModal clears it
  console.log('[saveChar] editCharId:', editCharId, '→ savingId:', savingId, 'name:', name);
  closeModal(container);

  setSyncStatus('syncing');
  try {
    if (savingId != null) {  // Strict check: allow 0 but reject null/undefined
      console.log('[saveChar] UPDATE mode for id:', savingId);
      const { error } = await supaClient.from('characters').update(row).eq('id', savingId);
      if (error) throw error;
      showToast('人物已更新');
    } else {
      console.log('[saveChar] INSERT mode for new character:', name);
      const { error } = await supaClient.from('characters').insert(row);
      if (error) throw error;
      showToast('人物已创建');
    }
    await fetchAll(container);
    setSyncStatus('ok');
  } catch(e) { dbError('保存人物', e); }
}

async function deleteChar(container) {
  if (!isEditor() || !editCharId) return;
  const c = allChars.find(x => x.id === editCharId);
  if (!c) return;
  if (!confirmDialog(`确定要删除「${c.name}」？此人物在时间轴和地图中的关联也会被移除。`)) return;

  // Delete avatar from storage if it's a storage URL
  if (c.avatar && c.avatar.includes('/storage/v1/object/public/avatars/')) {
    const filename = c.avatar.split('/avatars/').pop();
    if (filename) {
      const { error: se } = await supaClient.storage.from('avatars').remove([filename]);
      if (se) console.warn('[delete] Storage 删除失败:', se.message);
      else console.log('[delete] 头像已从 Storage 删除:', filename);
    }
  }

  closeModal(container);

  setSyncStatus('syncing');
  try {
    const { error } = await supaClient.from('characters').delete().eq('id', editCharId);
    if (error) throw error;
    await fetchAll(container);
    setSyncStatus('ok');
    showToast(`已删除人物：${c.name}`);
  } catch(e) { dbError('删除人物', e); }
}

function updateUI(container) {
  const btn = container.querySelector('#chars-add-btn');
  if (btn) btn.style.display = isEditor() ? '' : 'none';
}

function subscribeRealtime(container) {
  realtimeCh = supaClient.channel('characters-page')
    .on('postgres_changes', {event:'*', schema:'public', table:'characters'}, () => fetchAll(container))
    .subscribe();
}
