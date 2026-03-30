// pages/home.js
// 主页：全 Markdown 可编辑文档

import { supaClient, setSyncStatus, dbError } from '../core/supabase-client.js';
import { isEditor, onAuthChange } from '../core/auth.js';
import { showToast } from '../core/ui.js';

const KEY = 'home_md';
let _md = '';
let _container = null;

export async function mount(container) {
  _container = container;
  container.innerHTML = _skeleton();
  _bindEvents(container);
  onAuthChange(() => _refresh());
  await _fetch();
  _subscribe();
}

export function unmount() {}

// ── 骨架 ─────────────────────────────────────────────
function _skeleton() {
  return `
    <div class="page-home">
      <div class="home-md-toolbar" id="home-toolbar" style="display:none">
        <button class="btn bp" id="home-md-save">保存</button>
        <button class="btn bn" id="home-md-cancel">取消</button>
      </div>
      <div id="home-md-view" class="home-md-view"></div>
      <textarea id="home-md-textarea" class="home-md-textarea" style="display:none"
        placeholder="用 Markdown 写主页内容…

# 大标题
## 二级标题
### 三级标题

正文段落，空行分段。

[链接文字](https://...)
![图片描述](https://图片地址)
![整体缩放](https://图片地址 =50%)
![固定宽度](https://图片地址 =300x)
![定制缩放](https://图片地址 =50%x30%)

**粗体**  *斜体*  \`行内代码\`

- 列表项一
- 列表项二

> 引用文字

---"></textarea>
    </div>
  `;
}

// ── 渲染 ─────────────────────────────────────────────
function _refresh() {
  if (!_container) return;
  const view = _container.querySelector('#home-md-view');
  if (!view) return;

  if (_md.trim()) {
    view.innerHTML = _parseMd(_md);
  } else {
    view.innerHTML = isEditor()
      ? '<p class="home-placeholder">点击右上角「编辑」开始写内容（支持 Markdown）</p>'
      : '<p class="home-placeholder">暂无内容</p>';
  }

  // 编辑按钮（只在编辑模式且非编辑状态时显示）
  let editBtn = _container.querySelector('#home-md-edit');
  if (isEditor() && !editBtn) {
    editBtn = document.createElement('button');
    editBtn.id = 'home-md-edit';
    editBtn.className = 'btn bn home-md-edit-btn';
    editBtn.textContent = '编辑';
    editBtn.addEventListener('click', _openEdit);
    _container.querySelector('.page-home').prepend(editBtn);
  } else if (!isEditor() && editBtn) {
    editBtn.remove();
  }
}

function _openEdit() {
  const ta      = _container.querySelector('#home-md-textarea');
  const view    = _container.querySelector('#home-md-view');
  const toolbar = _container.querySelector('#home-toolbar');
  const editBtn = _container.querySelector('#home-md-edit');
  ta.value = _md;
  view.style.display = 'none';
  if (editBtn) editBtn.style.display = 'none';
  ta.style.display = '';
  toolbar.style.display = '';
  ta.focus();
  // 自动撑高
  _autoResize(ta);
}

function _closeEdit() {
  const ta      = _container.querySelector('#home-md-textarea');
  const view    = _container.querySelector('#home-md-view');
  const toolbar = _container.querySelector('#home-toolbar');
  const editBtn = _container.querySelector('#home-md-edit');
  ta.style.display = 'none';
  toolbar.style.display = 'none';
  view.style.display = '';
  if (editBtn) editBtn.style.display = '';
}

function _autoResize(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.max(ta.scrollHeight, 400) + 'px';
}

// ── 事件 ─────────────────────────────────────────────
function _bindEvents(container) {
  container.querySelector('#home-md-save')?.addEventListener('click', _save);
  container.querySelector('#home-md-cancel')?.addEventListener('click', () => {
    _closeEdit();
    _refresh();
  });
  const ta = container.querySelector('#home-md-textarea');
  ta?.addEventListener('input', () => _autoResize(ta));
  ta?.addEventListener('keydown', e => {
    if (e.key === 'Escape') { _closeEdit(); _refresh(); }
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = ta.selectionStart;
      ta.value = ta.value.substring(0, s) + '  ' + ta.value.substring(ta.selectionEnd);
      ta.selectionStart = ta.selectionEnd = s + 2;
    }
  });
}

// ── 保存 ─────────────────────────────────────────────
async function _save() {
  const val = _container.querySelector('#home-md-textarea').value;
  setSyncStatus('syncing');
  try {
    const { error } = await supaClient.from('site_content').upsert({ key: KEY, value: val });
    if (error) throw error;
    _md = val;
    setSyncStatus('ok');
    _closeEdit();
    _refresh();
    showToast('已保存');
  } catch (e) { dbError('保存主页', e); }
}

// ── 数据 ─────────────────────────────────────────────
async function _fetch() {
  setSyncStatus('syncing');
  try {
    const { data, error } = await supaClient
      .from('site_content').select('*').eq('key', KEY).single();
    if (error && error.code !== 'PGRST116') throw error;
    _md = data?.value || '';
    _refresh();
    setSyncStatus('ok');
  } catch (e) { dbError('加载主页', e); }
}

function _subscribe() {
  supaClient.channel('home-md')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'site_content' }, payload => {
      if (payload.new?.key === KEY) {
        _md = payload.new.value || '';
        _refresh();
      }
    })
    .subscribe();
}

// ── Markdown 解析器 ───────────────────────────────────
function _escAttr(s) {
  return s.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _inline(text) {
  let s = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // 图片（先于链接处理）支持 =宽x高 缩放，如 =50% / =300x / =x200 / =50%x30%
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+=([^)]*))?\)/g, (_, alt, url, size) => {
    let style = '';
    if (size) {
      const dim = size.trim().split('x');
      const toUnit = v => !v ? '' : (v.includes('%') ? v : /^\d+$/.test(v) ? v + 'px' : v);
      const w = toUnit(dim[0]);
      const h = dim.length > 1 ? toUnit(dim[1]) : '';
      if (w) style += `width:${w};`;
      if (h) style += `height:${h};`;
      if (w && !h) style += 'height:auto;';
      if (h && !w) style += 'width:auto;';
    }
    return `<img src="${_escAttr(url)}" alt="${_escAttr(alt)}" class="md-img"${style ? ` style="${style}"` : ''}/>`;
  });
  // 链接
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    (_, label, url) => `<a href="${_escAttr(url)}" target="_blank" rel="noopener">${label}</a>`);
  // 粗体
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // 斜体
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // 行内代码
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  return s;
}

function _parseMd(src) {
  const lines = src.split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 空行跳过
    if (!line.trim()) { i++; continue; }

    // 分隔线
    if (/^-{3,}$/.test(line.trim())) {
      out.push('<hr class="md-hr"/>');
      i++; continue;
    }

    // 标题
    const hm = line.match(/^(#{1,4})\s+(.+)/);
    if (hm) {
      const lvl = hm[1].length;
      out.push(`<h${lvl} class="md-h${lvl}">${_inline(hm[2])}</h${lvl}>`);
      i++; continue;
    }

    // 引用块
    if (line.startsWith('> ')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        rows.push(_inline(lines[i].slice(2)));
        i++;
      }
      out.push(`<blockquote class="md-bq">${rows.join('<br/>')}</blockquote>`);
      continue;
    }

    // 无序列表
    if (/^[-*]\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(`<li>${_inline(lines[i].replace(/^[-*]\s/, ''))}</li>`);
        i++;
      }
      out.push(`<ul class="md-ul">${items.join('')}</ul>`);
      continue;
    }

    // 有序列表
    if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(`<li>${_inline(lines[i].replace(/^\d+\.\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ol class="md-ol">${items.join('')}</ol>`);
      continue;
    }

    // 段落：连续非特殊行合并
    const pLines = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^#{1,4}\s/.test(lines[i]) &&
      !/^[-*]\s/.test(lines[i]) &&
      !/^\d+\.\s/.test(lines[i]) &&
      !lines[i].startsWith('> ') &&
      !/^-{3,}$/.test(lines[i].trim())
    ) {
      pLines.push(lines[i]);
      i++;
    }
    if (pLines.length) {
      out.push(`<p class="md-p">${pLines.map(_inline).join('<br/>')}</p>`);
    }
  }

  return out.join('\n');
}
