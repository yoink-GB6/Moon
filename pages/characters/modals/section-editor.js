// pages/characters/modals/section-editor.js
// 内容小节编辑器：预设标签 + 自定义添加 + 行折叠/展开 + 拖拽排序 + 收集数据。
// 国家 / 城市 / 地标三个弹窗共用，靠 prefix 区分 DOM id。
//
// md 模式（国家用）：正文里的 # ## - 会被解析成 children 子小节；
// 非 md 模式（城市、地标用）：正文就是一整段纯文本。

import { escHtml } from '../../../core/ui.js';
import { mdToChildren, childrenToMd } from './md-utils.js';

const MD_PH_TAIL = '\n\n# 子小节标题\n内容\n\n## 更深一层';

export function createSectionEditor(config) {
  const prefix  = config.prefix;
  const presets = config.presets;
  const md      = !!config.md;
  const hint    = config.hint || (md ? '拖 ⠿ 排序 · 展开后用 # ## ### 写子小节' : '点 ▾ 展开编辑；拖 ⠿ 可排序');
  const heading = config.heading || '内容小节';
  const addLabel = config.addLabel || '添加';
  const mdGuide = config.mdGuide || '# 子小节 &nbsp; ## 子子小节 &nbsp; ### 三级';

  const id = {
    tags:      prefix + '-tags',
    add:       prefix + '-add',
    list:      prefix + '-list',
  };

  function presetOf(title) {
    return presets.find(function(p) { return p.title === title; });
  }

  function bodyText(sec) {
    return md ? childrenToMd(sec) : (sec.content || '');
  }

  function previewHTML(text) {
    const t = (text || '').trim();
    if (!t) return '<span style="color:var(--muted);font-style:italic">恭喜你，哥伦布</span>';
    return escHtml(t.replace(/\n/g, ' ').slice(0, 60)) + (t.length > 60 ? '…' : '');
  }

  function rowHTML(sec) {
    const preset = presetOf(sec.title);
    const ph     = (preset ? preset.ph : '在此填写内容...') + (md ? MD_PH_TAIL : '');
    const text   = bodyText(sec);

    // sec.id：一行对应一条独立记录时（地标）带上，collect 时原样返回，用来区分新增/更新
    return '<div class="cm-row" draggable="false"' +
        (sec.id != null ? ' data-sec-id="' + escHtml(String(sec.id)) + '"' : '') + '>' +
      '<div class="cm-row-collapsed">' +
        '<span class="cm-row-grip" title="拖拽排序">⠿</span>' +
        '<div class="cm-row-summary">' +
          '<span class="cm-row-label">' + escHtml(sec.title || '未命名') + '</span>' +
          '<span class="cm-row-preview">' + previewHTML(text) + '</span>' +
        '</div>' +
        '<button class="cm-row-toggle" title="展开编辑">▾</button>' +
      '</div>' +
      '<div class="cm-row-expanded" style="display:none">' +
        '<div class="cm-row-expanded-hdr">' +
          '<input class="cm-row-title" type="text" value="' + escHtml(sec.title || '') + '" placeholder="小节标题" maxlength="30"/>' +
          '<button class="cm-row-collapse">▲ 收起</button>' +
        '</div>' +
        (md ? '<div class="cm-md-guide">' + mdGuide + '</div>' : '') +
        '<textarea class="cm-row-body" rows="' + (md ? 6 : 5) + '" placeholder="' + escHtml(ph) + '">' + escHtml(text) + '</textarea>' +
        '<div class="cm-row-expanded-ft"><button class="btn br cm-row-del">✕ 删除此小节</button></div>' +
      '</div>' +
    '</div>';
  }

  // 弹窗里「内容小节」那一整块的 HTML
  function html(sections) {
    const used = new Set((sections || []).map(function(s) { return s.title; }));
    const tags = presets.filter(function(p) { return !used.has(p.title); })
      .map(function(p) {
        return '<button class="cm-tag" data-title="' + escHtml(p.title) + '" data-ph="' + escHtml(p.ph) + '">' + escHtml(p.title) + '</button>';
      }).join('') || '<span class="cm-tags-empty">所有预设已添加</span>';

    return '<div class="cm-sec-hdr"><span>' + escHtml(heading) + '</span><span class="cm-hint">' + escHtml(hint) + '</span></div>' +
      // 没配预设就不摆标签行，免得给一堆不合身的标题
      (presets.length ? '<div class="cm-tags" id="' + id.tags + '">' + tags + '</div>' : '') +
      '<div id="' + id.list + '" class="cm-list">' + (sections || []).map(rowHTML).join('') + '</div>';
  }

  function expandRow(row) {
    row.querySelector('.cm-row-collapsed').style.display = 'none';
    row.querySelector('.cm-row-expanded').style.display  = 'flex';
    const ta = row.querySelector('.cm-row-body');
    if (ta) ta.focus();
  }

  function collapseRow(row) {
    const titleInput = row.querySelector('.cm-row-title');
    const bodyInput  = row.querySelector('.cm-row-body');
    const label      = row.querySelector('.cm-row-label');
    const preview    = row.querySelector('.cm-row-preview');
    if (label)   label.textContent = (titleInput ? titleInput.value.trim() : '') || '未命名';
    if (preview) preview.innerHTML = previewHTML(bodyInput ? bodyInput.value : '');
    row.querySelector('.cm-row-collapsed').style.display = '';
    row.querySelector('.cm-row-expanded').style.display  = 'none';
  }

  function appendRow(modal, title, content, ph) {
    const list = modal.querySelector('#' + id.list);
    if (!list) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = rowHTML({ title: title, content: content || '' });
    const row = tmp.firstElementChild;
    if (ph) { const ta = row.querySelector('.cm-row-body'); if (ta) ta.placeholder = ph; }
    list.appendChild(row);
    expandRow(row);
    // 新加的空行先填标题，已有标题的（预设）直接进正文
    if (!title) row.querySelector('.cm-row-title')?.focus();
    row.scrollIntoView({ block: 'nearest' });
  }

  function restorePresetTag(modal, title) {
    const preset = presetOf(title);
    if (!preset) return;
    const tags = modal.querySelector('#' + id.tags);
    if (!tags) return;
    const empty = tags.querySelector('.cm-tags-empty');
    if (empty) empty.remove();
    if (!tags.querySelector('[data-title="' + title + '"]')) {
      const tag = document.createElement('button');
      tag.className   = 'cm-tag';
      tag.dataset.title = preset.title;
      tag.dataset.ph    = preset.ph;
      tag.textContent   = preset.title;
      tags.appendChild(tag);
    }
  }

  // 拖拽排序：事件委托给 list，行是动态增删的，逐行绑会累积重复监听
  function bindDragSort(list) {
    if (!list || list._dragSortBound) return;
    list._dragSortBound = true;
    let dragging = null;

    list.addEventListener('mousedown', function(e) {
      const grip = e.target.closest('.cm-row-grip');
      if (!grip) return;
      const row = grip.closest('.cm-row');
      if (row && row.parentElement === list) row.draggable = true;
    });
    list.addEventListener('mouseup', function() {
      list.querySelectorAll('.cm-row').forEach(function(r) { r.draggable = false; });
    });
    list.addEventListener('dragstart', function(e) {
      const row = e.target.closest('.cm-row');
      if (!row || row.parentElement !== list) return;
      dragging = row;
      row.classList.add('cm-row-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    list.addEventListener('dragend', function() {
      if (dragging) { dragging.classList.remove('cm-row-dragging'); dragging.draggable = false; }
      dragging = null;
      list.querySelectorAll('.cm-row').forEach(function(r) { r.classList.remove('cm-row-drag-over'); });
    });
    list.addEventListener('dragover', function(e) {
      e.preventDefault();
      const row = e.target.closest('.cm-row');
      if (!row || row.parentElement !== list || !dragging || dragging === row) return;
      list.querySelectorAll('.cm-row').forEach(function(r) { r.classList.remove('cm-row-drag-over'); });
      row.classList.add('cm-row-drag-over');
      const rect = row.getBoundingClientRect();
      list.insertBefore(dragging, e.clientY < rect.top + rect.height / 2 ? row : row.nextSibling);
    });
    list.addEventListener('dragleave', function(e) {
      if (!list.contains(e.relatedTarget)) {
        list.querySelectorAll('.cm-row').forEach(function(r) { r.classList.remove('cm-row-drag-over'); });
      }
    });
    list.addEventListener('drop', function(e) { e.preventDefault(); });
  }

  // 每次重建弹窗 innerHTML 后调用一次
  function bind(modal) {
    modal.querySelector('#' + id.tags)?.addEventListener('click', function(e) {
      const btn = e.target.closest('.cm-tag');
      if (!btn) return;
      appendRow(modal, btn.dataset.title, '', btn.dataset.ph);
      btn.remove();
      const tags = modal.querySelector('#' + id.tags);
      if (!tags.querySelector('.cm-tag')) tags.innerHTML = '<span class="cm-tags-empty">所有预设已添加</span>';
    });

    modal.querySelector('#' + id.add)?.addEventListener('click', function() {
      appendRow(modal, '', '');
    });

    const list = modal.querySelector('#' + id.list);
    list?.addEventListener('click', function(e) {
      const row = e.target.closest('.cm-row');
      if (!row) return;
      if (e.target.closest('.cm-row-toggle'))   { expandRow(row); return; }
      if (e.target.closest('.cm-row-collapse')) { collapseRow(row); return; }
      if (e.target.closest('.cm-row-del')) {
        const titleEl = row.querySelector('.cm-row-title');
        const labelEl = row.querySelector('.cm-row-label');
        const t = (titleEl ? titleEl.value.trim() : '') || (labelEl ? labelEl.textContent.trim() : '');
        row.remove();
        restorePresetTag(modal, t);
      }
    });

    bindDragSort(list);
  }

  function collect(modal) {
    const out = [];
    modal.querySelectorAll('#' + id.list + ' .cm-row').forEach(function(row) {
      const titleInput = row.querySelector('.cm-row-title');
      const labelEl    = row.querySelector('.cm-row-label');
      const bodyInput  = row.querySelector('.cm-row-body');
      const title = (titleInput ? titleInput.value.trim() : '') || (labelEl ? labelEl.textContent.trim() : '');
      const text  = bodyInput ? bodyInput.value.trim() : '';
      if (!title && !text) return;
      const sec = md ? { title: title, content: '' } : { title: title, content: text };
      if (md) {
        const parsed = mdToChildren(text);
        sec.content = parsed.content;
        if (parsed.children) sec.children = parsed.children;
      }
      if (row.dataset.secId) sec.id = row.dataset.secId;
      out.push(sec);
    });
    return out;
  }

  // 放进弹窗底部操作栏，和保存/取消同行
  function addButtonHTML() {
    return '<button class="btn bn modal-btn cm-add-btn" id="' + id.add + '">' + escHtml(addLabel) + '</button>';
  }

  return { html, addButtonHTML, bind, collect };
}

// 存进库的是 JSON 数组；解析不出数组就当没有内容
export function parseSections(raw) {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch (_) { return []; }
}
