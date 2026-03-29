// pages/characters/modals/character-modal.js
import { supaClient } from '../../../core/supabase-client.js';
import { showToast, escHtml, confirmDialog } from '../../../core/ui.js';
import * as State from '../state.js';
import { closeModal } from '../utils.js';
import { loadAllData } from '../data-loader.js';
import { renderCharactersTab } from '../characters-tab.js';
import { renderGeoDetail } from '../geo-detail.js';
import { mdToChildren, childrenToMd } from './md-utils.js';

// ── 人物小节预设 ───────────────────────────────────────────────
const CHAR_PRESETS = [
  { title: '个人简介', ph: '出身背景、成长经历...' },
  { title: '性格特点', ph: '性格、习惯、行为模式...' },
  { title: '能力技能', ph: '战斗技能、特殊能力、专长...' },
  { title: '人际关系', ph: '家人、盟友、对手、情感...' },
  { title: '历史经历', ph: '重大事件、转折点、过去...' },
  { title: '目标动机', ph: '追求的目标、内心动机...' },
  { title: '外貌特征', ph: '外貌描述、着装风格...' },
];

// ── 解析 description 字段（JSON 数组 or 旧纯文本）────────────
function _parseCharSections(raw) {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) return p;
    return [{ title: '个人简介', content: raw }];
  } catch (_) {
    return [{ title: '个人简介', content: raw }];
  }
}

// ── 小节行 HTML（复用 cm-row 体系）──────────────────────────
function _charRowHTML(sec) {
  const preset  = CHAR_PRESETS.find(function(p) { return p.title === sec.title; });
  const ph      = (preset ? preset.ph : '在此填写内容...') + '\n\n# 子小节标题\n内容\n\n## 更深一层';
  const mdText  = childrenToMd(sec);   // 把 children 还原成 # ## 文本
  const preview = mdText.trim().replace(/\n/g, ' ').slice(0, 60) || '';
  const previewHTML = preview
    ? escHtml(preview) + (mdText.trim().length > 60 ? '…' : '')
    : '<span style="color:var(--muted);font-style:italic">暂无内容</span>';
  return '<div class="cm-row" draggable="false">' +
    '<div class="cm-row-collapsed">' +
      '<span class="cm-row-grip" title="拖拽排序">⠿</span>' +
      '<div class="cm-row-summary">' +
        '<span class="cm-row-label">' + escHtml(sec.title || '未命名') + '</span>' +
        '<span class="cm-row-preview">' + previewHTML + '</span>' +
      '</div>' +
      '<button class="cm-row-edit" title="编辑此小节">✎</button>' +
      '<button class="cm-row-del"  title="删除此小节">✕</button>' +
    '</div>' +
    '<div class="cm-row-expanded" style="display:none">' +
      '<div class="cm-row-expanded-hdr">' +
        '<input class="cm-row-title" type="text" value="' + escHtml(sec.title || '') + '" placeholder="小节标题" maxlength="30"/>' +
        '<button class="cm-row-collapse">▲ 收起</button>' +
      '</div>' +
      '<div class="cm-md-guide"># 一级折叠 &nbsp;&nbsp; ## 带菱形框的文本段</div>' +
      '<textarea class="cm-row-body" rows="6" placeholder="' + escHtml(ph) + '">' + escHtml(mdText) + '</textarea>' +
    '</div>' +
  '</div>';
}

function _expandCharRow(row) {
  row.querySelector('.cm-row-collapsed').style.display = 'none';
  row.querySelector('.cm-row-expanded').style.display  = 'flex';
  const ta = row.querySelector('.cm-row-body');
  if (ta) ta.focus();
}

function _collapseCharRow(row) {
  const titleInput = row.querySelector('.cm-row-title');
  const bodyInput  = row.querySelector('.cm-row-body');
  const title   = titleInput ? titleInput.value.trim() : '';
  const mdText  = bodyInput  ? bodyInput.value.trim()  : '';
  const label   = row.querySelector('.cm-row-label');
  const preview = row.querySelector('.cm-row-preview');
  if (label)   label.textContent = title || '未命名';
  if (preview) {
    const flat = mdText.replace(/\n/g, ' ').slice(0, 60);
    preview.innerHTML = mdText
      ? escHtml(flat) + (mdText.length > 60 ? '…' : '')
      : '<span style="color:var(--muted);font-style:italic">暂无内容</span>';
  }
  row.querySelector('.cm-row-collapsed').style.display = '';
  row.querySelector('.cm-row-expanded').style.display  = 'none';
}

function _restoreCharPresetTag(modal, title) {
  const preset = CHAR_PRESETS.find(function(p) { return p.title === title; });
  if (!preset) return;
  const tags = modal.querySelector('#char-sec-tags');
  if (!tags) return;
  if (tags.querySelector('.cm-tags-empty')) tags.querySelector('.cm-tags-empty').remove();
  if (!tags.querySelector('[data-title="' + title + '"]')) {
    const tag = document.createElement('button');
    tag.className    = 'cm-tag';
    tag.dataset.title = preset.title;
    tag.dataset.ph    = preset.ph;
    tag.textContent   = preset.title;
    tags.appendChild(tag);
  }
}

function _appendCharRow(modal, title, content, ph) {
  const list = modal.querySelector('#char-sec-list');
  if (!list) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = _charRowHTML({ title, content: content || '' });
  const row = tmp.firstElementChild;
  if (ph) row.querySelector('.cm-row-body').placeholder = ph;
  list.appendChild(row);
  _bindCharDragSort(list);
  _expandCharRow(row);
}

function _bindCharDragSort(list) {
  if (!list) return;
  let dragging = null;
  list.querySelectorAll('.cm-row').forEach(function(row) {
    const grip = row.querySelector('.cm-row-grip');
    if (!grip) return;
    grip.addEventListener('mousedown', function() { row.draggable = true; });
    grip.addEventListener('mouseup',   function() { row.draggable = false; });
    row.addEventListener('dragstart', function(e) {
      dragging = row; row.classList.add('cm-row-dragging'); e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', function() {
      dragging = null; row.classList.remove('cm-row-dragging'); row.draggable = false;
      list.querySelectorAll('.cm-row').forEach(function(r) { r.classList.remove('cm-row-drag-over'); });
    });
    row.addEventListener('dragover', function(e) {
      e.preventDefault();
      if (!dragging || dragging === row) return;
      list.querySelectorAll('.cm-row').forEach(function(r) { r.classList.remove('cm-row-drag-over'); });
      row.classList.add('cm-row-drag-over');
      const rect = row.getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) list.insertBefore(dragging, row);
      else list.insertBefore(dragging, row.nextSibling);
    });
    row.addEventListener('dragleave', function() { row.classList.remove('cm-row-drag-over'); });
    row.addEventListener('drop',      function(e) { e.preventDefault(); row.classList.remove('cm-row-drag-over'); });
  });
}

function _collectCharSections(modal) {
  const out = [];
  modal.querySelectorAll('#char-sec-list .cm-row').forEach(function(row) {
    const titleInput = row.querySelector('.cm-row-title');
    const labelEl    = row.querySelector('.cm-row-label');
    const bodyInput  = row.querySelector('.cm-row-body');
    const title  = (titleInput ? titleInput.value.trim() : '') || (labelEl ? labelEl.textContent.trim() : '') || '';
    const mdText = bodyInput ? bodyInput.value : '';
    if (!title) return;
    const parsed = mdToChildren(mdText);
    const sec = { title, content: parsed.content };
    if (parsed.children && parsed.children.length) sec.children = parsed.children;
    out.push(sec);
  });
  return out;
}

function _bindCharSectionEvents(modal) {
  // 预设标签点击
  modal.querySelector('#char-sec-tags')?.addEventListener('click', function(e) {
    const btn = e.target.closest('.cm-tag');
    if (!btn) return;
    _appendCharRow(modal, btn.dataset.title, '', btn.dataset.ph);
    btn.remove();
    const tags = modal.querySelector('#char-sec-tags');
    if (!tags.querySelector('.cm-tag')) tags.innerHTML = '<span class="cm-tags-empty">所有预设已添加</span>';
  });

  // 自定义小节
  const ci = modal.querySelector('#char-sec-custom');
  function doAdd() {
    const t = ci ? ci.value.trim() : '';
    if (!t) { if (ci) ci.focus(); return; }
    _appendCharRow(modal, t, '');
    if (ci) { ci.value = ''; ci.focus(); }
  }
  modal.querySelector('#char-sec-custom-add')?.addEventListener('click', doAdd);
  ci?.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });

  // 列表内操作（展开/折叠/删除）
  modal.querySelector('#char-sec-list')?.addEventListener('click', function(e) {
    const row = e.target.closest('.cm-row');
    if (!row) return;
    if (e.target.closest('.cm-row-edit'))     { _expandCharRow(row); return; }
    if (e.target.closest('.cm-row-collapse')) { _collapseCharRow(row); return; }
    if (e.target.closest('.cm-row-del')) {
      const titleInput = row.querySelector('.cm-row-title');
      const labelEl    = row.querySelector('.cm-row-label');
      const title = (titleInput ? titleInput.value.trim() : '') || (labelEl ? labelEl.textContent.trim() : '');
      row.remove();
      _restoreCharPresetTag(modal, title);
    }
  });

  _bindCharDragSort(modal.querySelector('#char-sec-list'));
}

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
  let _mdOnModal = false;
  modal.addEventListener('mousedown', function(e) { _mdOnModal = (e.target === modal); });
  modal.addEventListener('mouseup', function(e) { if (_mdOnModal && e.target === modal) closeModal(modal); _mdOnModal = false; });
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
  // ── 初始化小节编辑器 ──
  const sections = _parseCharSections(char ? char.description : null);
  const usedTitles = new Set(sections.map(function(s) { return s.title; }));
  const presetBtns = CHAR_PRESETS
    .filter(function(p) { return !usedTitles.has(p.title); })
    .map(function(p) {
      return '<button class="cm-tag" data-title="' + escHtml(p.title) + '" data-ph="' + escHtml(p.ph) + '">' + escHtml(p.title) + '</button>';
    }).join('');

  const secContainer = modal.querySelector('#char-sec-container');
  if (secContainer) {
    secContainer.innerHTML =
      '<div class="cm-sec-hdr"><span>人物介绍</span><span class="cm-hint">点 ✎ 展开编辑；拖 ⠿ 可排序</span></div>' +
      '<div class="cm-tags" id="char-sec-tags">' + (presetBtns || '<span class="cm-tags-empty">所有预设已添加</span>') + '</div>' +
      '<div class="cm-custom-row">' +
        '<input type="text" id="char-sec-custom" placeholder="自定义小节标题..." maxlength="30" autocomplete="off"/>' +
        '<button class="btn bn" id="char-sec-custom-add">＋ 添加</button>' +
      '</div>' +
      '<div id="char-sec-list" class="cm-list">' + sections.map(_charRowHTML).join('') + '</div>';
    _bindCharSectionEvents(modal);
  }

  // 推算当前人物所属国家
  const initCity    = char && char.city_id ? State.allCities.find(function(c) { return c.id === char.city_id; }) : null;
  const initCountry = initCity ? initCity.country_id : (char && char.country_id ? char.country_id : null);

  // 国家下拉
  const countryOptions = [{ value: '', label: '无' }].concat(
    State.allCountries.map(function(co) { return { value: String(co.id), label: co.name }; })
  );
  const countryWrap = container.querySelector('#char-country-select');
  if (countryWrap._cleanupTlSelect) countryWrap._cleanupTlSelect();

  // 城市下拉（根据国家过滤）
  function refreshCitySelect(countryId) {
    const filtered = countryId
      ? State.allCities.filter(function(c) { return String(c.country_id) === String(countryId); })
      : State.allCities;
    const cityOptions = [{ value: '', label: '无' }].concat(
      filtered.map(function(c) { return { value: String(c.id), label: c.name }; })
    );
    const cityWrap = container.querySelector('#char-city-select');
    if (cityWrap._cleanupTlSelect) cityWrap._cleanupTlSelect();
    // 如果当前选中城市不在新列表里就清空
    const curCityId = container.querySelector('#char-city').value;
    const keep = cityOptions.find(function(o) { return o.value === curCityId; });
    initTlSelect(cityWrap, cityOptions, keep ? curCityId : '', null);
  }

  initTlSelect(countryWrap, countryOptions, initCountry ? String(initCountry) : '', function(val) {
    refreshCitySelect(val);
  });
  refreshCitySelect(initCountry ? String(initCountry) : '');

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
  const modal     = container.querySelector('#char-modal');
  const sections  = _collectCharSections(modal);
  const desc      = sections.length ? JSON.stringify(sections) : null;

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
      description: desc,
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
