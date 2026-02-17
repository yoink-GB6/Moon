// pages/home.js
// 主页模块：可编辑标题、正文段落、自定义链接列表

import { supaClient, setSyncStatus, dbError } from '../core/supabase-client.js';
import { isEditor, onAuthChange } from '../core/auth.js';
import { showToast, escHtml, confirmDialog } from '../core/ui.js';

// ── 状态 ──────────────────────────────────────────
let content = { home_title: '', home_body: '', home_links: '[]' };
let links = []; // parsed from home_links JSON

// ── 主入口（从 router 调用）────────────────────────
export async function mount(container) {
  container.innerHTML = renderSkeleton();
  bindEvents(container);
  onAuthChange(() => renderAll(container));
  await fetchContent(container);
  subscribeRealtime(container);
}

export function unmount() {
  // 实时订阅在 mount 时创建，SPA 导航时可选择性断开
  // 当前实现：保持订阅（数据量小，无影响）
}

// ── 骨架 HTML ────────────────────────────────────
function renderSkeleton() {
  return `
    <div class="page-home">
      <div class="home-header">
        <div id="home-title-view" class="home-title-view"></div>
        <button id="home-edit-title-btn" class="edit-inline-btn" style="display:none" title="编辑标题">✎</button>
      </div>
      <div id="home-title-editor" class="inline-editor" style="display:none">
        <input id="home-title-input" type="text" placeholder="网站标题" maxlength="80"/>
        <div class="inline-editor-btns">
          <button class="btn bn" id="home-title-cancel">取消</button>
          <button class="btn bp" id="home-title-save">保存</button>
        </div>
      </div>

      <div class="home-body-wrap">
        <div id="home-body-view" class="home-body-view"></div>
        <button id="home-edit-body-btn" class="edit-inline-btn" style="display:none" title="编辑正文">✎ 编辑正文</button>
      </div>
      <div id="home-body-editor" class="inline-editor" style="display:none">
        <textarea id="home-body-input" rows="6" placeholder="主页正文内容（支持换行）" maxlength="2000"></textarea>
        <div class="inline-editor-btns">
          <button class="btn bn" id="home-body-cancel">取消</button>
          <button class="btn bp" id="home-body-save">保存</button>
        </div>
      </div>

      <div class="home-links-section">
        <div class="home-links-header">
          <h3>🔗 链接</h3>
          <button id="home-add-link-btn" class="btn bp" style="display:none;font-size:12px;padding:5px 10px">＋ 添加链接</button>
        </div>
        <div id="home-links-list"></div>
      </div>

      <div id="home-add-link-form" class="add-link-form" style="display:none">
        <input id="link-label-input" type="text" placeholder="链接文字" maxlength="60"/>
        <input id="link-url-input" type="text" placeholder="https://..." maxlength="500"/>
        <div class="inline-editor-btns">
          <button class="btn bn" id="link-form-cancel">取消</button>
          <button class="btn bp" id="link-form-save">添加</button>
        </div>
      </div>
    </div>
  `;
}

// ── 渲染所有内容 ──────────────────────────────────
function renderAll(container) {
  renderTitle(container);
  renderBody(container);
  renderLinks(container);
  updateEditButtons(container);
}

function renderTitle(container) {
  const el = container.querySelector('#home-title-view');
  if (el) el.textContent = content.home_title || '（未设置标题）';
}

function renderBody(container) {
  const el = container.querySelector('#home-body-view');
  if (!el) return;
  const text = content.home_body || '';
  el.innerHTML = text
    ? text.split('\n').map(line => `<p>${escHtml(line) || '&nbsp;'}</p>`).join('')
    : '<p class="home-placeholder">（暂无内容）</p>';
}

function renderLinks(container) {
  const el = container.querySelector('#home-links-list');
  if (!el) return;
  if (!links.length) {
    el.innerHTML = '<p class="home-placeholder">暂无链接</p>';
    return;
  }
  el.innerHTML = links.map((lk, i) => `
    <div class="link-item" data-idx="${i}">
      <a href="${escHtml(lk.url)}" target="_blank" rel="noopener">${escHtml(lk.label)}</a>
      <span class="link-url-preview">${escHtml(lk.url)}</span>
      ${isEditor() ? `<button class="link-delete-btn btn br" data-idx="${i}">✕</button>` : ''}
    </div>
  `).join('');

  // Delete buttons
  el.querySelectorAll('.link-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteLink(parseInt(btn.dataset.idx), container));
  });
}

function updateEditButtons(container) {
  const ed = isEditor();
  ['home-edit-title-btn','home-edit-body-btn','home-add-link-btn'].forEach(id => {
    const el = container.querySelector('#' + id);
    if (el) el.style.display = ed ? '' : 'none';
  });
}

// ── 事件绑定 ──────────────────────────────────────
function bindEvents(container) {
  // Title
  container.querySelector('#home-edit-title-btn')?.addEventListener('click', () => {
    container.querySelector('#home-title-input').value = content.home_title;
    container.querySelector('#home-title-view').closest('.home-header').style.display = 'none';
    container.querySelector('#home-title-editor').style.display = '';
    container.querySelector('#home-title-input').focus();
  });
  container.querySelector('#home-title-cancel')?.addEventListener('click', () => {
    container.querySelector('#home-title-editor').style.display = 'none';
    container.querySelector('#home-title-view').closest('.home-header').style.display = '';
  });
  container.querySelector('#home-title-save')?.addEventListener('click', () => saveTitle(container));

  // Body
  container.querySelector('#home-edit-body-btn')?.addEventListener('click', () => {
    container.querySelector('#home-body-input').value = content.home_body;
    container.querySelector('#home-body-view').style.display = 'none';
    container.querySelector('#home-edit-body-btn').style.display = 'none';
    container.querySelector('#home-body-editor').style.display = '';
    container.querySelector('#home-body-input').focus();
  });
  container.querySelector('#home-body-cancel')?.addEventListener('click', () => {
    container.querySelector('#home-body-editor').style.display = 'none';
    container.querySelector('#home-body-view').style.display = '';
    if (isEditor()) container.querySelector('#home-edit-body-btn').style.display = '';
  });
  container.querySelector('#home-body-save')?.addEventListener('click', () => saveBody(container));

  // Links
  container.querySelector('#home-add-link-btn')?.addEventListener('click', () => {
    container.querySelector('#home-add-link-form').style.display = '';
    container.querySelector('#link-label-input').focus();
  });
  container.querySelector('#link-form-cancel')?.addEventListener('click', () => {
    container.querySelector('#home-add-link-form').style.display = 'none';
  });
  container.querySelector('#link-form-save')?.addEventListener('click', () => addLink(container));

  // Keyboard shortcuts
  container.querySelector('#home-title-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveTitle(container);
    if (e.key === 'Escape') container.querySelector('#home-title-cancel').click();
  });
  container.querySelector('#home-body-input')?.addEventListener('keydown', e => {
    if (e.key === 'Escape') container.querySelector('#home-body-cancel').click();
  });
  container.querySelector('#link-url-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') addLink(container);
    if (e.key === 'Escape') container.querySelector('#link-form-cancel').click();
  });
}

// ── 数据操作 ──────────────────────────────────────
async function fetchContent(container) {
  setSyncStatus('syncing');
  try {
    const { data, error } = await supaClient
      .from('site_content')
      .select('*')
      .in('key', ['home_title','home_body','home_links']);
    if (error) throw error;
    data.forEach(row => { content[row.key] = row.value; });
    links = JSON.parse(content.home_links || '[]');
    renderAll(container);
    setSyncStatus('ok');
  } catch(e) { dbError('加载主页内容', e); }
}

async function upsertContent(key, value) {
  setSyncStatus('syncing');
  try {
    const { error } = await supaClient
      .from('site_content')
      .upsert({ key, value });
    if (error) throw error;
    content[key] = value;
    setSyncStatus('ok');
  } catch(e) { dbError('保存内容', e); }
}

async function saveTitle(container) {
  const val = container.querySelector('#home-title-input').value.trim();
  if (!val) { showToast('标题不能为空'); return; }
  await upsertContent('home_title', val);
  container.querySelector('#home-title-editor').style.display = 'none';
  container.querySelector('#home-title-view').closest('.home-header').style.display = '';
  renderTitle(container);
  showToast('标题已保存');
}

async function saveBody(container) {
  const val = container.querySelector('#home-body-input').value;
  await upsertContent('home_body', val);
  container.querySelector('#home-body-editor').style.display = 'none';
  container.querySelector('#home-body-view').style.display = '';
  if (isEditor()) container.querySelector('#home-edit-body-btn').style.display = '';
  renderBody(container);
  showToast('正文已保存');
}

async function addLink(container) {
  const label = container.querySelector('#link-label-input').value.trim();
  const url   = container.querySelector('#link-url-input').value.trim();
  if (!label) { showToast('请填写链接文字'); return; }
  if (!url || !url.startsWith('http')) { showToast('请填写有效的 URL（以 http 开头）'); return; }
  links.push({ label, url });
  await upsertContent('home_links', JSON.stringify(links));
  container.querySelector('#home-add-link-form').style.display = 'none';
  container.querySelector('#link-label-input').value = '';
  container.querySelector('#link-url-input').value = '';
  renderLinks(container);
  showToast('链接已添加');
}

async function deleteLink(idx, container) {
  if (!confirmDialog(`删除链接「${links[idx]?.label}」？`)) return;
  links.splice(idx, 1);
  await upsertContent('home_links', JSON.stringify(links));
  renderLinks(container);
  showToast('链接已删除');
}

// ── 实时订阅 ──────────────────────────────────────
function subscribeRealtime(container) {
  supaClient.channel('home-content')
    .on('postgres_changes', { event:'*', schema:'public', table:'site_content' }, payload => {
      if (payload.new?.key?.startsWith('home_')) {
        content[payload.new.key] = payload.new.value;
        if (payload.new.key === 'home_links') {
          try { links = JSON.parse(payload.new.value || '[]'); } catch(e) { links = []; }
        }
        renderAll(container);
      }
    })
    .subscribe();
}
