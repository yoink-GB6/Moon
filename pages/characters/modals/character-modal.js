// pages/characters/modals/character-modal.js
import { supaClient, dbError } from '../../../core/supabase-client.js';
import { showToast, escHtml, confirmDialog, bindCombobox } from '../../../core/ui.js';
import * as State from '../state.js';
import { closeModal, parseAvatarUrls, parseCharSections } from '../utils.js';
import { loadAllData } from '../data-loader.js';
import { stripCodeFence } from '../html-render.js';

let _editImages = [];
let _originalStorageUrls = [];
let _storageToDelete = [];

function _isStorageUrl(url) {
  return url && url.includes('/storage/v1/object/public/avatars/');
}

function _storageFilename(url) {
  return url.split('/avatars/').pop();
}

const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif' };

// 外链图片一律转存到 storage：下载 → 上传 → 返回 storage 公开地址。
// 图库管理的 URL 导入和人物弹窗的「🔗 URL」原本各写了一份，行为容易走偏，这里合成一份。
async function _importUrlToStorage(url) {
  if (_isStorageUrl(url)) return url;          // 已经在 storage 里，不重复上传
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const blob = await resp.blob();
  if (!blob.type.startsWith('image/')) throw new Error('不是图片：' + (blob.type || '未知类型'));
  const ext      = MIME_EXT[blob.type] || 'jpg';
  const filename = Date.now() + '_' + Math.random().toString(36).slice(2, 11) + '.' + ext;
  const { data, error } = await supaClient.storage.from('avatars')
    .upload(filename, blob, { upsert: true, contentType: blob.type });
  if (error) throw error;
  return supaClient.storage.from('avatars').getPublicUrl(data.path).data.publicUrl;
}

async function _deleteStorageUrls(urls) {
  const filenames = urls.filter(_isStorageUrl).map(_storageFilename).filter(Boolean);
  if (!filenames.length) return;
  await supaClient.storage.from('avatars').remove(filenames);
}
import { refreshCharactersView } from '../../characters.js';
import { renderGeoDetail } from '../geo-detail.js';
import { createSectionEditor } from './section-editor.js';

// ── 人物小节编辑器（和国家/城市/地标共用同一份实现）──────────
const charEditor = createSectionEditor({
  prefix: 'char-sec',
  md: true,
  heading: '人物介绍',
  mdGuide: '# 一级折叠 &nbsp;&nbsp; ## 带菱形框的文本段',
  presets: [
    { title: '个人简介', ph: '出身背景、成长经历...' },
    { title: '性格特点', ph: '性格、习惯、行为模式...' },
    { title: '能力技能', ph: '战斗技能、特殊能力、专长...' },
    { title: '人际关系', ph: '家人、盟友、对手、情感...' },
    { title: '历史经历', ph: '重大事件、转折点、过去...' },
    { title: '目标动机', ph: '追求的目标、内心动机...' },
    { title: '外貌特征', ph: '外貌描述、着装风格...' },
  ],
});

// ── 自定义下拉通用工具 ────────────────────────────────────────
// options: [{ value, label }]，selectedValue: 当前选中值
// onChange(value) 回调
export function initTlSelect(wrapEl, options, selectedValue, onChange) {
  // 清理上一次绑定的 outside 监听器，防止累积
  if (wrapEl._cleanupTlSelect) { wrapEl._cleanupTlSelect(); wrapEl._cleanupTlSelect = null; }

  const trigger  = wrapEl.querySelector('.tl-select-trigger');
  const dropdown = wrapEl.querySelector('.tl-select-dropdown');
  const hidden   = wrapEl.nextElementSibling; // <input type="hidden">

  // clone 替换 trigger，清除历次积累的旧监听器；之后从新节点取 valEl
  const freshTrigger = trigger.cloneNode(true);
  trigger.parentNode.replaceChild(freshTrigger, trigger);
  const valEl = freshTrigger.querySelector('.tl-select-val');

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

  freshTrigger.addEventListener('click', function(e) {
    e.stopPropagation();
    const wasOpen = wrapEl.classList.contains('open');
    // 关掉其他所有下拉
    document.querySelectorAll('.tl-select.open').forEach(function(el) { el.classList.remove('open'); });
    if (!wasOpen) wrapEl.classList.add('open');
  });

  // 点外部关闭
  function onOutside(e) {
    const path = e.composedPath ? e.composedPath() : [];
    if (!path.includes(wrapEl) && !wrapEl.contains(e.target)) wrapEl.classList.remove('open');
  }
  document.addEventListener('click', onOutside);
  // modal 关闭时自动清理监听
  wrapEl._cleanupTlSelect = function() { document.removeEventListener('click', onOutside); };
}

// ── 图片删除三选对话框 ────────────────────────────────────────
function _imgDeleteDialog() {
  return new Promise(function(resolve) {
    let overlay = document.getElementById('img-delete-dialog');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'img-delete-dialog';
      overlay.className = 'img-delete-dialog';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML =
      '<div class="img-delete-box">' +
        '<button class="btn br img-delete-opt" data-v="storage">从图库中删除该图片</button>' +
        '<button class="btn bn img-delete-opt" data-v="unlink">保留图片仅取消关联</button>' +
        '<button class="btn bn img-delete-opt" data-v="cancel">取消该操作</button>' +
      '</div>';
    overlay.classList.add('show');

    overlay.querySelectorAll('.img-delete-opt').forEach(function(btn) {
      btn.addEventListener('click', function() {
        overlay.classList.remove('show');
        resolve(btn.dataset.v);
      });
    });
    overlay.addEventListener('mousedown', function(e) {
      if (e.target === overlay) { overlay.classList.remove('show'); resolve('cancel'); }
    }, { once: true });
  });
}

// ── 图片列表渲染 ──────────────────────────────────────────────

function _renderImagesGrid(container) {
  const grid = container.querySelector('#char-images-grid');
  if (!grid) return;
  if (!_editImages.length) {
    grid.innerHTML = '<span class="char-images-empty">恭喜你，哥伦布</span>';
    return;
  }
  grid.innerHTML = _editImages.map(function(img, i) {
    return '<div class="char-img-thumb" data-index="' + i + '">' +
      '<img src="' + escHtml(img.preview) + '" />' +
      '<button class="char-img-del" title="移除">✕</button>' +
    '</div>';
  }).join('');
  grid.querySelectorAll('.char-img-del').forEach(function(btn) {
    btn.addEventListener('click', async function(e) {
      e.stopPropagation();
      const idx = parseInt(btn.closest('.char-img-thumb').dataset.index);
      const img = _editImages[idx];
      const isStorage = _isStorageUrl(img.url || img.preview);

      if (isStorage) {
        const choice = await _imgDeleteDialog();
        if (choice === 'cancel') return;
        if (choice === 'storage') _storageToDelete.push(img.url || img.preview);
        // choice === 'unlink': 仅取消关联，不删 storage
      }

      _editImages.splice(idx, 1);
      _renderImagesGrid(container);
    });
  });
}

// ── setupCharModal ────────────────────────────────────────────

export function setupCharModal() {
  const container = State.pageContainer;
  const modal     = container.querySelector('#char-modal');

  container.querySelector('#char-upload-btn')?.addEventListener('click', function() {
    container.querySelector('#char-file-input').click();
  });
  container.querySelector('#char-file-input')?.addEventListener('change', function(e) {
    Array.from(e.target.files).forEach(function(file) {
      const reader = new FileReader();
      reader.onload = function(ev) {
        _editImages.push({ type: 'file', file: file, preview: ev.target.result, url: null });
        _renderImagesGrid(container);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  });
  container.querySelector('#char-url-btn')?.addEventListener('click', function() {
    const row = container.querySelector('#char-url-row');
    row.style.display = row.style.display === 'none' ? 'block' : 'none';
    if (row.style.display !== 'none') container.querySelector('#char-url-input')?.focus();
  });
  function _addUrlImage() {
    const input = container.querySelector('#char-url-input');
    const url = input ? input.value.trim() : '';
    if (!url) return;
    _editImages.push({ type: 'url', url: url, preview: url, file: null });
    _renderImagesGrid(container);
    input.value = '';
    container.querySelector('#char-url-row').style.display = 'none';
  }
  container.querySelector('#char-url-confirm')?.addEventListener('click', _addUrlImage);
  container.querySelector('#char-url-input')?.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); _addUrlImage(); }
  });
  container.querySelector('#char-library-btn')?.addEventListener('click', function() {
    _openLibraryPicker(container);
  });
  container.querySelector('#char-rel-add-btn')?.addEventListener('click', function() {
    addRelationRow(container, State.editingCharId
      ? State.allChars.find(function(c) { return String(c.id) === String(State.editingCharId); })
      : null);
  });
  container.querySelector('#char-save-btn')?.addEventListener('click', saveCharacter);
  container.querySelector('#char-delete-btn')?.addEventListener('click', deleteCharacter);
  container.querySelector('#char-cancel-btn')?.addEventListener('click', function() { closeModal(modal); });
  let _mdOnModal = false;
  modal.addEventListener('mousedown', function(e) { _mdOnModal = (e.target === modal); });
  modal.addEventListener('mouseup', function(e) { if (_mdOnModal && e.target === modal) closeModal(modal); _mdOnModal = false; });
}

// ── 图库管理器（批量上传/删除）────────────────────────────────
export async function openImageManager(charId = null) {
  let mgr = document.getElementById('char-img-mgr');
  if (!mgr) {
    mgr = document.createElement('div');
    mgr.id = 'char-img-mgr';
    mgr.className = 'char-img-mgr';
    document.body.appendChild(mgr);
  }

  mgr.innerHTML =
    '<div class="char-img-mgr-box" onmousedown="event.stopPropagation()">' +
      '<div class="char-img-mgr-hdr">' +
        '<span>图库管理</span>' +
        '<div style="display:flex;gap:8px;align-items:center">' +
          '<button class="btn bp" id="img-mgr-upload-btn">📁 上传文件</button>' +
          '<input type="file" id="img-mgr-file-input" accept="image/*" multiple style="display:none"/>' +
          '<button class="btn bn" id="img-mgr-url-btn">🔗 URL导入</button>' +
          '<button class="btn bn" id="img-mgr-sel-btn">☑ 多选</button>' +
          '<button class="char-library-close" id="img-mgr-close">✕</button>' +
        '</div>' +
      '</div>' +
      '<div id="img-mgr-url-row" style="display:none">' +
        '<textarea id="img-mgr-url-input" rows="3" placeholder="每行一个图片 URL..." style="width:100%;box-sizing:border-box;resize:vertical;font-size:12px;padding:7px 9px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:4px;outline:none"></textarea>' +
        '<div style="display:flex;justify-content:flex-end;margin-top:6px">' +
          '<button class="btn bp" id="img-mgr-url-confirm">导入</button>' +
        '</div>' +
      '</div>' +
      '<div class="char-img-mgr-grid" id="img-mgr-grid"><div class="char-images-empty">加载中…</div></div>' +
      '<div id="img-mgr-sel-bar" style="display:none;padding:10px 14px;border-top:1px solid var(--border);flex-shrink:0;display:none;gap:8px">' +
        '<span id="img-mgr-sel-count" style="flex:1;color:var(--muted);font-size:13px;line-height:32px">已选 0 张</span>' +
        '<button class="btn bn" id="img-mgr-cancel-sel">取消</button>' +
        '<button class="btn br" id="img-mgr-del-sel-btn">删除选中</button>' +
      '</div>' +
    '</div>';

  mgr.classList.add('show');

  let _selecting = false;
  let _checked = new Set();

  function _updateSelBar() {
    const bar   = mgr.querySelector('#img-mgr-sel-bar');
    const count = mgr.querySelector('#img-mgr-sel-count');
    if (bar)   { bar.style.display = _selecting ? 'flex' : 'none'; }
    if (count) count.textContent = '已选 ' + _checked.size + ' 张';
  }

  // 上传后自动关联到角色（仅 charId 有值时生效）
  async function _linkUrl(url) {
    if (!charId) return;
    const char = State.allChars.find(function(c) { return c.id === charId; });
    if (!char) return;
    const existing = parseAvatarUrls(char.avatar_url);
    if (existing.includes(url)) return;
    const newUrls = [...existing, url];
    const newVal  = JSON.stringify(newUrls);
    const { error } = await supaClient.from('characters').update({ avatar_url: newVal }).eq('id', charId);
    if (!error) {
      char.avatar_url = newVal;
      _editImages.push({ type: 'existing', url: url, preview: url, file: null });
      _renderImagesGrid(State.pageContainer);
    }
  }

  async function _renderMgr() {
    const grid = mgr.querySelector('#img-mgr-grid');
    grid.innerHTML = '<div class="char-images-empty">加载中…</div>';

    let files = [];
    try {
      const { data, error } = await supaClient.storage.from('avatars').list('', { limit: 300 });
      if (!error && data) {
        const re = /\.(jpe?g|png|gif|webp|avif)$/i;
        files = data.filter(f => re.test(f.name));
      }
    } catch (e) { grid.innerHTML = '<div class="char-images-empty">加载失败</div>'; return; }

    if (!files.length) { grid.innerHTML = '<div class="char-images-empty">恭喜你，哥伦布</div>'; return; }

    // 建立 filename → 关联角色名 的映射
    const filenameToChar = new Map();
    State.allChars.forEach(function(char) {
      parseAvatarUrls(char.avatar_url).forEach(function(url) {
        if (_isStorageUrl(url)) filenameToChar.set(_storageFilename(url), char.name);
      });
    });

    grid.innerHTML = files.map(function(f) {
      const url  = supaClient.storage.from('avatars').getPublicUrl(f.name).data.publicUrl;
      const who  = filenameToChar.get(f.name);
      return '<div class="char-img-mgr-item" data-filename="' + escHtml(f.name) + '">' +
        '<img src="' + escHtml(url) + '" loading="lazy"/>' +
        (who ? '<div class="char-img-mgr-tag">' + escHtml(who) + '</div>' : '') +
        '<button class="char-img-mgr-del" title="删除">✕</button>' +
      '</div>';
    }).join('');

    grid.querySelectorAll('.char-img-mgr-del').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        const item     = btn.closest('.char-img-mgr-item');
        const filename = item.dataset.filename;
        const who      = filenameToChar.get(filename);
        const msg      = who
          ? '确定从图库删除该图片？它当前关联了角色「' + who + '」。'
          : '确定从图库删除该图片？';
        if (!confirmDialog(msg)) return;
        const { error } = await supaClient.storage.from('avatars').remove([filename]);
        if (error) { showToast('删除失败'); return; }
        // 同步解除关联：把这张图从角色的 avatar_url 里移除
        if (who) {
          const char    = State.allChars.find(c => c.name === who);
          const pubUrl  = supaClient.storage.from('avatars').getPublicUrl(filename).data.publicUrl;
          const newUrls = parseAvatarUrls(char?.avatar_url)
            .filter(u => u !== pubUrl && !u.endsWith('/' + filename));
          const newVal  = newUrls.length ? JSON.stringify(newUrls) : null;
          await supaClient.from('characters').update({ avatar_url: newVal }).eq('id', char.id);
          if (char) char.avatar_url = newVal;
        }
        showToast('已删除');
        _renderMgr();
      });
    });

    if (_selecting) grid.classList.add('selecting');
    grid.querySelectorAll('.char-img-mgr-item').forEach(function(item) {
      if (_checked.has(item.dataset.filename)) item.classList.add('checked');
    });
  }

  _renderMgr();

  // grid 级点击委托：多选模式下切换勾选
  mgr.querySelector('#img-mgr-grid').addEventListener('click', function(e) {
    if (!_selecting) return;
    const item = e.target.closest('.char-img-mgr-item');
    if (!item) return;
    const filename = item.dataset.filename;
    if (_checked.has(filename)) {
      _checked.delete(filename);
      item.classList.remove('checked');
    } else {
      _checked.add(filename);
      item.classList.add('checked');
    }
    _updateSelBar();
  });

  mgr.querySelector('#img-mgr-sel-btn').addEventListener('click', function() {
    _selecting = !_selecting;
    _checked.clear();
    _updateSelBar();
    const grid = mgr.querySelector('#img-mgr-grid');
    if (grid) {
      grid.classList.toggle('selecting', _selecting);
      grid.querySelectorAll('.char-img-mgr-item').forEach(function(el) { el.classList.remove('checked'); });
    }
  });

  mgr.querySelector('#img-mgr-cancel-sel').addEventListener('click', function() {
    _selecting = false;
    _checked.clear();
    _updateSelBar();
    const grid = mgr.querySelector('#img-mgr-grid');
    if (grid) {
      grid.classList.remove('selecting');
      grid.querySelectorAll('.char-img-mgr-item').forEach(function(el) { el.classList.remove('checked'); });
    }
  });

  mgr.querySelector('#img-mgr-del-sel-btn').addEventListener('click', async function() {
    if (!_checked.size) return;
    if (!await confirmDialog('确定删除选中的 ' + _checked.size + ' 张图片？')) return;
    const filenames = [..._checked];
    const { error } = await supaClient.storage.from('avatars').remove(filenames);
    if (error) { showToast('删除失败'); return; }
    for (const filename of filenames) {
      const pubUrl = supaClient.storage.from('avatars').getPublicUrl(filename).data.publicUrl;
      State.allChars.forEach(function(char) {
        const urls    = parseAvatarUrls(char.avatar_url);
        const filtered = urls.filter(function(u) { return u !== pubUrl && !u.endsWith('/' + filename); });
        if (filtered.length !== urls.length) {
          const newVal = filtered.length ? JSON.stringify(filtered) : null;
          supaClient.from('characters').update({ avatar_url: newVal }).eq('id', char.id);
          char.avatar_url = newVal;
        }
      });
    }
    _selecting = false;
    _checked.clear();
    _updateSelBar();
    showToast('已删除 ' + filenames.length + ' 张');
    _renderMgr();
  });

  mgr.querySelector('#img-mgr-upload-btn').addEventListener('click', function() {
    mgr.querySelector('#img-mgr-file-input').click();
  });

  mgr.querySelector('#img-mgr-file-input').addEventListener('change', async function(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    showToast('上传中…');
    for (const file of files) {
      const ext      = file.name.split('.').pop();
      const filename = Date.now() + '_' + Math.random().toString(36).substr(2, 9) + '.' + ext;
      const { error } = await supaClient.storage.from('avatars').upload(filename, file, { upsert: false });
      if (error) { showToast('上传失败：' + file.name); }
      else {
        const url = supaClient.storage.from('avatars').getPublicUrl(filename).data.publicUrl;
        await _linkUrl(url);
      }
    }
    e.target.value = '';
    showToast('上传完成');
    _renderMgr();
  });

  mgr.querySelector('#img-mgr-url-btn').addEventListener('click', function() {
    const row = mgr.querySelector('#img-mgr-url-row');
    row.style.display = row.style.display === 'none' ? 'block' : 'none';
    if (row.style.display !== 'none') mgr.querySelector('#img-mgr-url-input')?.focus();
  });

  mgr.querySelector('#img-mgr-url-confirm').addEventListener('click', async function() {
    const textarea = mgr.querySelector('#img-mgr-url-input');
    const urls = (textarea.value || '').split('\n').map(s => s.trim()).filter(Boolean);
    if (!urls.length) return;
    showToast('导入中…');
    let ok = 0, fail = 0;
    for (const url of urls) {
      try {
        await _linkUrl(await _importUrlToStorage(url));
        ok++;
      } catch (_) { fail++; }
    }
    textarea.value = '';
    mgr.querySelector('#img-mgr-url-row').style.display = 'none';
    showToast('导入完成：' + ok + ' 成功' + (fail ? '，' + fail + ' 失败' : ''));
    _renderMgr();
  });

  mgr.querySelector('#img-mgr-close').addEventListener('click', function() {
    mgr.classList.remove('show');
  });
  mgr.addEventListener('mousedown', function(e) {
    if (e.target === mgr) mgr.classList.remove('show');
  });
}

// ── 图库选择器 ────────────────────────────────────────────────
async function _openLibraryPicker(container) {
  // 获取所有 storage 图片
  let allFiles = [];
  try {
    const { data, error } = await supaClient.storage.from('avatars').list('', { limit: 300 });
    if (!error && data) {
      const re = /\.(jpe?g|png|gif|webp|avif)$/i;
      allFiles = data.filter(f => re.test(f.name));
    }
  } catch (e) { showToast('图库加载失败'); return; }

  if (!allFiles.length) { showToast('恭喜你，哥伦布'); return; }

  // 已被其他角色关联的 URL 集合（不含当前编辑角色自己的图片）
  const usedFilenames = new Set();
  const editingId = State.editingCharId;
  State.allChars.forEach(function(char) {
    if (char.id === editingId) return;
    parseAvatarUrls(char.avatar_url).forEach(function(url) {
      if (_isStorageUrl(url)) usedFilenames.add(_storageFilename(url));
    });
  });

  const available = allFiles.filter(f => !usedFilenames.has(f.name));
  if (!available.length) { showToast('所有图库图片均已关联角色'); return; }

  // 构建 picker overlay
  let picker = document.getElementById('char-library-picker');
  if (!picker) {
    picker = document.createElement('div');
    picker.id = 'char-library-picker';
    picker.className = 'char-library-picker';
    document.body.appendChild(picker);
  }

  // 当前编辑列表中已有的 URL（含自身角色的图片）
  const alreadyAdded = new Set(_editImages.map(function(img) { return img.url || img.preview; }));

  picker.innerHTML =
    '<div class="char-library-box" onmousedown="event.stopPropagation()">' +
      '<div class="char-library-hdr">' +
        '<span>从图库选择</span>' +
        '<button class="char-library-close">✕</button>' +
      '</div>' +
      '<div class="char-library-grid" id="char-library-grid">' +
        available.map(function(f) {
          const url = supaClient.storage.from('avatars').getPublicUrl(f.name).data.publicUrl;
          const selected = alreadyAdded.has(url);
          return '<div class="char-library-item' + (selected ? ' selected' : '') + '" data-url="' + escHtml(url) + '" data-selected="' + selected + '">' +
            '<img src="' + escHtml(url) + '" loading="lazy"/>' +
            (selected ? '<div class="char-library-check">✓</div>' : '') +
          '</div>';
        }).join('') +
      '</div>' +
    '</div>';

  picker.classList.add('show');

  picker.querySelector('.char-library-close').addEventListener('click', function() {
    picker.classList.remove('show');
  });
  picker.addEventListener('mousedown', function(e) {
    if (e.target === picker) picker.classList.remove('show');
  });

  picker.querySelectorAll('.char-library-item').forEach(function(item) {
    item.addEventListener('click', function() {
      const url = item.dataset.url;
      if (item.dataset.selected === 'true') {
        // 取消选中：从编辑列表移除
        const idx = _editImages.findIndex(function(img) { return (img.url || img.preview) === url; });
        if (idx !== -1) _editImages.splice(idx, 1);
        item.dataset.selected = 'false';
        item.classList.remove('selected');
        const check = item.querySelector('.char-library-check');
        if (check) check.remove();
        _renderImagesGrid(container);
      } else {
        // 选中：加入编辑列表
        _editImages.push({ type: 'existing', url: url, preview: url, file: null });
        item.dataset.selected = 'true';
        item.classList.add('selected');
        item.insertAdjacentHTML('beforeend', '<div class="char-library-check">✓</div>');
        _renderImagesGrid(container);
      }
    });
  });
}

// ── openCharModal ─────────────────────────────────────────────

export function openCharModal(char) {
  const container = State.pageContainer;
  State.setEditingCharId(char ? char.id : null);

  const modal = container.querySelector('#char-modal');
  container.querySelector('#char-modal-title').textContent = char ? '编辑人物' : '新建人物';
  container.querySelector('#char-name').value = char ? char.name || '' : '';
  container.querySelector('#char-age').value  = (char && char.base_age != null) ? char.base_age : '';
  container.querySelector('#char-link').value = char ? char.link_url || '' : '';
  container.querySelector('#char-html').value = char ? char.description_html || '' : '';
  // ── 初始化小节编辑器 ──
  const secContainer = modal.querySelector('#char-sec-container');
  if (secContainer) {
    secContainer.innerHTML = charEditor.html(parseCharSections(char ? char.description : null));
    charEditor.bind(modal);
  }

  // 推算当前人物所属国家
  const initCity    = char && char.city_id    ? State.allCities.find(function(c) { return c.id === char.city_id; }) : null;
  const initCountry = char ? char.country_id : null;

  // 国家下拉
  const countryOptions = [{ value: '', label: '无' }].concat(
    State.allCountries.map(function(co) { return { value: String(co.id), label: co.name }; })
  );
  const countryWrap = container.querySelector('#char-country-select');
  if (countryWrap._cleanupTlSelect) countryWrap._cleanupTlSelect();

  // 直接更新国家下拉的显示值和 hidden input，不重新初始化（避免触发城市刷新循环）
  function _setCountryValue(val) {
    const hidden = countryWrap.nextElementSibling;
    hidden.value = val || '';
    const trig = countryWrap.querySelector('.tl-select-trigger');
    const valEl = trig ? trig.querySelector('.tl-select-val') : null;
    const found = countryOptions.find(function(o) { return String(o.value) === String(val); });
    if (valEl) valEl.textContent = found ? found.label : '无';
    countryWrap.querySelectorAll('.tl-select-opt').forEach(function(opt) {
      opt.classList.toggle('selected', String(opt.dataset.val) === String(val));
    });
  }

  // 城市下拉（根据国家过滤）
  // fixedCityId: 初始化时强制设定的城市（不从 DOM 读，避免读到上一个人物的残留值）
  function refreshCitySelect(countryId, fixedCityId) {
    const filtered = countryId
      ? State.allCities.filter(function(c) { return String(c.country_id) === String(countryId); })
      : State.allCities;
    const cityOptions = [{ value: '', label: '无' }].concat(
      filtered.map(function(c) { return { value: String(c.id), label: c.name }; })
    );
    const cityWrap = container.querySelector('#char-city-select');
    if (cityWrap._cleanupTlSelect) cityWrap._cleanupTlSelect();
    // 用户手动切换国家时（fixedCityId 为 undefined），尝试保留当前城市；初始化时用传入值
    const curCityId = fixedCityId !== undefined ? fixedCityId : container.querySelector('#char-city').value;
    const keep = cityOptions.find(function(o) { return o.value === String(curCityId); });
    initTlSelect(cityWrap, cityOptions, keep ? String(curCityId) : '', function(cityVal) {
      if (!cityVal) return;
      const city = State.allCities.find(function(c) { return String(c.id) === String(cityVal); });
      if (!city || !city.country_id) return;
      const curCountry = container.querySelector('#char-country').value;
      if (String(curCountry) !== String(city.country_id)) {
        _setCountryValue(String(city.country_id));
        refreshCitySelect(String(city.country_id), cityVal);
      }
    });
  }

  initTlSelect(countryWrap, countryOptions, initCountry ? String(initCountry) : '', function(val) {
    refreshCitySelect(val);
  });
  refreshCitySelect(initCountry ? String(initCountry) : '', initCity ? String(initCity.id) : '');

  _renderRelations(container, char);

  const existingUrls = parseAvatarUrls(char ? char.avatar_url : null);
  _originalStorageUrls = existingUrls.filter(_isStorageUrl);
  _storageToDelete = [];
  _editImages = existingUrls.map(function(u) { return { type: 'existing', url: u, preview: u, file: null }; });
  _renderImagesGrid(container);
  container.querySelector('#char-url-row').style.display = 'none';
  container.querySelector('#char-delete-btn').style.display = char ? 'block' : 'none';

  modal.classList.add('show');
  setTimeout(function() { container.querySelector('#char-name').focus(); }, 100);
}

// ── 保存/删除 ─────────────────────────────────────────────────

async function saveCharacter() {
  const container = State.pageContainer;
  const saveBtn = container.querySelector('#char-save-btn');
  if (saveBtn && saveBtn.disabled) return;
  if (saveBtn) saveBtn.disabled = true;
  try {
    await _doSave(container);
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function _doSave(container) {
  const name = container.querySelector('#char-name').value.trim();
  if (!name) return showToast('请输入名字');

  const ageVal      = container.querySelector('#char-age').value.trim();
  const linkVal     = container.querySelector('#char-link').value.trim();
  const htmlVal     = stripCodeFence(container.querySelector('#char-html').value);
  const cityIdVal   = container.querySelector('#char-city').value;
  const countryIdVal = container.querySelector('#char-country').value;
  const modal     = container.querySelector('#char-modal');
  const sections  = charEditor.collect(modal);
  const desc      = sections.length ? JSON.stringify(sections) : null;

  try {
    const uploadedUrls = [];
    for (const img of _editImages) {
      if (img.type === 'file') {
        const ext      = img.file.name.split('.').pop();
        const filename = Date.now() + '_' + Math.random().toString(36).substr(2, 9) + '.' + ext;
        const { data, error } = await supaClient.storage.from('avatars').upload(filename, img.file, { upsert: true });
        if (error) throw error;
        uploadedUrls.push(supaClient.storage.from('avatars').getPublicUrl(data.path).data.publicUrl);
      } else if (img.type === 'url') {
        try {
          uploadedUrls.push(await _importUrlToStorage(img.url));
        } catch (err) {
          // 只存 storage 地址，不留外链，所以拉不下来就整次中止
          throw new Error('拉取图片失败 ' + img.url + '：' + err.message);
        }
      } else {
        // existing：已在 storage 中的 URL，直接保留
        uploadedUrls.push(img.url);
      }
    }
    const avatarUrlValue = uploadedUrls.length ? JSON.stringify(uploadedUrls) : null;

    const payload = {
      name,
      base_age:    ageVal !== '' ? parseInt(ageVal) : null,
      link_url:    linkVal || null,
      city_id:     cityIdVal   ? parseInt(cityIdVal)    : null,
      country_id:  countryIdVal ? parseInt(countryIdVal) : null,
      description: desc,
      description_html: htmlVal || null,
      avatar_url:  avatarUrlValue,
    };

    if (State.editingCharId) {
      const { error } = await supaClient.from('characters').update(payload).eq('id', State.editingCharId);
      if (error) throw error;
      await _saveRelations(container, State.editingCharId);   // 关系跟着人物一起保存
      showToast('已更新');
    } else {
      const { error } = await supaClient.from('characters').insert(payload);
      if (error) throw error;
      showToast('已创建');
    }

    if (_storageToDelete.length) _deleteStorageUrls(_storageToDelete);

    closeModal(container.querySelector('#char-modal'));
    await loadAllData();
    refreshCharactersView();
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
    // 删除该人物在 storage 中的所有图片
    if (_originalStorageUrls.length) _deleteStorageUrls(_originalStorageUrls);
    showToast('已删除');
    closeModal(State.pageContainer.querySelector('#char-modal'));
    await loadAllData();
    refreshCharactersView();
    if (State.selectedCity) renderGeoDetail();
  } catch (e) {
    showToast('删除失败: ' + e.message);
  }
}


// ── 人物关系 ─────────────────────────────────────────────────
// 无向边，数据库里强制 a_id < b_id + unique(a_id,b_id)，
// 所以前端写入前先把两个 id 排序，重复添加会走 upsert 改标签而不是报错。

function _relPair(x, y) {
  const a = Math.min(Number(x), Number(y));
  const b = Math.max(Number(x), Number(y));
  return { a_id: a, b_id: b };
}

function _relRowHTML(rel, char) {
  const otherId = rel ? (String(rel.a_id) === String(char.id) ? rel.b_id : rel.a_id) : '';
  const other   = otherId ? State.allChars.find(function(c) { return String(c.id) === String(otherId); }) : null;
  return '<div class="rel-edit-row"' + (rel ? ' data-rid="' + rel.id + '"' : '') + '>' +
    '<div class="rel-pick rel-edit-cell">' +
      '<input class="rel-edit-who" value="' + escHtml(other ? other.name : '') + '" ' +
        'data-id="' + escHtml(String(otherId || '')) + '" placeholder="输入名字搜索…" autocomplete="off"/>' +
      '<div class="cb-sugg"></div>' +
    '</div>' +
    '<input class="rel-edit-label rel-edit-cell" value="' + escHtml(rel ? rel.label || '' : '') + '" placeholder="关系（如：师徒）" autocomplete="off"/>' +
    '<button class="rel-edit-del" title="删除">✕</button>' +
  '</div>';
}

// 行内改动只留在 DOM 里，点人物的「保存」时才一起落库
function _bindRelRow(container, char, row) {
  const who = row.querySelector('.rel-edit-who');
  bindCombobox(who, function() {
    // 候选：排除自己，以及别的行已经选了的人（同一对人物只能有一条关系）
    const taken = new Set(Array.from(container.querySelectorAll('.rel-edit-who'))
      .filter(function(el) { return el !== who && el.dataset.id; })
      .map(function(el) { return String(el.dataset.id); }));
    return State.allChars.filter(function(c) {
      return String(c.id) !== String(char.id) && !taken.has(String(c.id));
    });
  });
  row.querySelector('.rel-edit-del').addEventListener('click', function() { row.remove(); });
}

function _renderRelations(container, char) {
  const sec = container.querySelector('#char-rel-section');
  if (!sec) return;
  // 新建人物时还没有 id，没法挂关系
  sec.style.display = char ? '' : 'none';
  const addBtn = container.querySelector('#char-rel-add-btn');
  if (addBtn) addBtn.style.display = char ? '' : 'none';
  if (!char) return;

  const list = container.querySelector('#char-rel-list');
  const mine = (State.allRelations || []).filter(function(r) {
    return String(r.a_id) === String(char.id) || String(r.b_id) === String(char.id);
  });

  list.innerHTML = mine.map(function(r) { return _relRowHTML(r, char); }).join('');
  list.querySelectorAll('.rel-edit-row').forEach(function(row) { _bindRelRow(container, char, row); });
  _syncRelEmpty(container);
}

function _syncRelEmpty(container) {
  const list = container.querySelector('#char-rel-list');
  const tip  = container.querySelector('#char-rel-empty');
  if (tip) tip.style.display = list.querySelector('.rel-edit-row') ? 'none' : '';
}

function addRelationRow(container, char) {
  if (!char) return showToast('先保存人物，再加关系');
  const list = container.querySelector('#char-rel-list');
  const tmp  = document.createElement('div');
  tmp.innerHTML = _relRowHTML(null, char);
  const row = tmp.firstElementChild;
  list.appendChild(row);
  _bindRelRow(container, char, row);
  _syncRelEmpty(container);
  row.querySelector('.rel-edit-who').focus();
}

// 把 DOM 里的行和库里现有的关系对比，落库
async function _saveRelations(container, charId) {
  const rows = Array.from(container.querySelectorAll('#char-rel-list .rel-edit-row'))
    .map(function(row) {
      return {
        id:      row.dataset.rid || null,
        otherId: row.querySelector('.rel-edit-who').dataset.id || '',
        label:   row.querySelector('.rel-edit-label').value.trim(),
      };
    })
    .filter(function(r) { return r.otherId; });      // 没选人的空行直接丢掉

  const mine = (State.allRelations || []).filter(function(r) {
    return String(r.a_id) === String(charId) || String(r.b_id) === String(charId);
  });
  const keptIds = new Set(rows.filter(function(r) { return r.id; }).map(function(r) { return String(r.id); }));
  const removed = mine.filter(function(r) { return !keptIds.has(String(r.id)); });

  if (removed.length) {
    const { error } = await supaClient.from('character_relations')
      .delete().in('id', removed.map(function(r) { return r.id; }));
    if (error) throw error;
  }
  for (const r of rows) {
    const payload = Object.assign(_relPair(charId, r.otherId), { label: r.label || null });
    const { error } = r.id
      ? await supaClient.from('character_relations').update(payload).eq('id', r.id)
      : await supaClient.from('character_relations').upsert(payload, { onConflict: 'a_id,b_id' });
    if (error) throw error;
  }
}
