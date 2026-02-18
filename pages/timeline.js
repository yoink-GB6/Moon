// pages/timeline.js
// 人物年龄时间轴页面模块

import { supaClient, setSyncStatus, dbError } from '../core/supabase-client.js';
import { isEditor, onAuthChange } from '../core/auth.js';
import { showToast, escHtml, confirmDialog } from '../core/ui.js';

// ── 状态 ──────────────────────────────────────────
let characters = [];
let ageOffset  = 0;
let scale      = 60;
let viewOffX   = 0;
const MIN_SCALE = 5, MAX_SCALE = 260;

const PALETTE = ['#7c83f7','#27ae60','#e67e22','#e74c3c','#9b59b6',
                 '#1abc9c','#f39c12','#3498db','#e91e63','#00bcd4',
                 '#8bc34a','#ff5722','#795548','#607d8b','#ffc107'];

let canvas, ctx, wrap;
let NODE_R = 18, STACK_GAP = 46;
let imgCache = {};
let editTarget = null, pendingAvatar = undefined, pendingAvatarIsFile = false;
let cfgTimer = null;
let resizeObserver = null;
let realtimeChannel = null;
let authUnsub = null;

// Pointer state
let ptr   = { active:false, sx:0, sy:0, so:0, moved:false };
let pinch = { active:false, dist0:0, scale0:0, cx:0, off0:0 };
let lpTimer = null;

// ── Mount / Unmount ────────────────────────────────
export async function mount(container) {
  container.innerHTML = buildHTML();
  canvas = container.querySelector('#tl-canvas');
  ctx    = canvas.getContext('2d');
  wrap   = container.querySelector('#tl-cw');

  bindControls(container);
  bindPointer();
  bindModal(container);

  // Listen for auth changes → refresh UI
  authUnsub = onAuthChange(() => {
    updateEditUI(container);
    draw();
  });

  // Resize observer so canvas fills its container
  resizeObserver = new ResizeObserver(() => resizeCanvas());
  resizeObserver.observe(wrap);
  resizeCanvas();

  await fetchAll();
  subscribeRealtime();
}

export function unmount() {
  resizeObserver?.disconnect();
  realtimeChannel && supaClient.removeChannel(realtimeChannel);
  if (authUnsub) { /* auth listeners are cumulative; keep small list */ }
  clearTimeout(cfgTimer);
  clearTimeout(lpTimer);
}

// ── HTML template ──────────────────────────────────
function buildHTML() {
  return `
<div class="tl-layout">
  <!-- Canvas area -->
  <div id="tl-cw" class="tl-cw">
    <canvas id="tl-canvas"></canvas>
  </div>

  <!-- Floating expand button (shows when panel collapsed) -->
  <button id="tl-expand" class="expand-btn-float" title="展开面板">◀</button>

  <!-- Right panel -->
  <div id="tl-panel" class="tl-panel">
    <div class="map-panel-hdr" id="tl-panel-toggle">
      <span>⏱ 时间轴</span>
      <span id="tl-panel-chevron">◀</span>
    </div>

    <!-- Tab bar -->
    <div class="tl-tabs">
      <button class="tl-tab active" data-tab="list">📋 列表</button>
      <button class="tl-tab" data-tab="edit">✏️ 编辑</button>
    </div>

    <!-- TAB: 列表 -->
    <div id="tl-tab-list" class="tl-tab-content">
      <!-- Age offset (collapsible) -->
      <div class="tl-section">
        <div class="tl-section-hdr" id="tl-offset-hdr">
          <span>🕐 年龄偏移</span>
          <span class="tl-chevron">▾</span>
        </div>
        <div class="tl-section-body" id="tl-offset-body">
          <div class="tl-offset-row">
            <button class="tl-ob" data-d="-10">≪</button>
            <button class="tl-ob" data-d="-1">−</button>
            <div id="tl-age-val" class="tl-age-val">+0</div>
            <button class="tl-ob" data-d="1">+</button>
            <button class="tl-ob" data-d="10">≫</button>
          </div>
          <div class="tl-slider-row">
            <input id="tl-slider" type="range" min="-100" max="100" value="0"/>
            <button class="small-btn" id="tl-reset-ages">归零</button>
          </div>
        </div>
      </div>

      <!-- Character list -->
      <div id="tl-clist" class="tl-clist"></div>

      <div class="tl-info">
        缩放：<b id="tl-info-scale">60</b> px/岁 | 人物：<b id="tl-info-count">0</b>
        <br><button class="small-btn" id="tl-reset-zoom" style="margin-top:4px">⊡ 重置缩放</button>
      </div>
    </div>

    <!-- TAB: 编辑（需权限） -->
    <div id="tl-tab-edit" class="tl-tab-content" style="display:none">
      <div id="tl-edit-locked" style="padding:20px 14px;color:#667;font-size:13px;line-height:1.9">
        🔒 请先解锁编辑权限
      </div>
      <div id="tl-add-area" class="tl-add-area" style="display:none">
        <div class="ctrl-label">＋ 添加人物到时间轴</div>
        <button class="btn bp" id="tl-select-char-btn" style="width:100%">从 Character 表中选择人物</button>
      </div>
    </div>
  </div>
</div>

<!-- Select character modal -->
<div id="tl-select-modal" class="tl-modal-overlay">
  <div class="tl-modal" style="max-width:560px" onmousedown="event.stopPropagation()">
    <h2>从 Character 表中选择人物</h2>
    <div id="tl-select-list" class="map-char-picker" style="max-height:400px"></div>
    <div class="mbtns" style="justify-content:flex-end;margin-top:14px">
      <button class="btn bn" id="tl-select-cancel">取消</button>
    </div>
  </div>
</div>

<!-- Edit modal (scoped inside timeline) -->
<div id="tl-modal-overlay" class="tl-modal-overlay">
  <div class="tl-modal" id="tl-modal">
    <h2 id="tl-modal-title">✏️ 修改人物</h2>
    <label>名字</label>
    <input id="tl-edit-name" type="text" autocomplete="off"/>
    <label>年龄（当前显示年龄）</label>
    <input id="tl-edit-age" type="number" min="0" max="200"/>

    <div class="tl-avatar-section">
      <label>头像</label>
      <div class="tl-avatar-wrap">
        <div id="tl-avatar-preview" class="tl-avatar-preview">
          <span id="tl-avatar-letter">?</span>
          <div id="tl-avatar-clear-x" title="移除头像">✕</div>
        </div>
        <div class="tl-avatar-btns-col">
          <div class="tl-avatar-btns">
            <button class="btn bn" id="tl-upload-btn">📁 上传</button>
            <button class="btn bn" id="tl-url-btn">🔗 链接</button>
          </div>
          <div id="tl-url-row" style="display:none" class="tl-url-row">
            <input id="tl-url-input" type="text" placeholder="https://..."/>
            <button class="btn bp" id="tl-url-confirm">确认</button>
          </div>
          <div id="tl-avatar-error" style="display:none;color:#e74c3c;font-size:11px">图片加载失败</div>
        </div>
      </div>
    </div>

    <div class="tl-limit-section">
      <label>年龄上限（可选）</label>
      <div class="tl-limit-row">
        <button id="tl-limit-toggle" class="tl-toggle"></button>
        <input id="tl-limit-input" type="number" min="1" max="300" placeholder="上限岁数" disabled/>
      </div>
      <div class="ctrl-note">超过上限后节点停留在上限位置并呈灰色「消逝」状态。</div>
    </div>

    <input type="file" id="tl-file-input" accept="image/*"/>
    <div class="mbtns" style="justify-content:flex-end">
      <button class="btn bn" id="tl-modal-cancel">取消</button>
      <button class="btn bp" id="tl-modal-save">保存</button>
    </div>
    <div class="mbtns" style="justify-content:center;margin-top:8px;padding-top:8px;border-top:1px solid #2d3048">
      <button class="btn br" id="tl-modal-delete" style="min-width:120px">🗑 删除此人物</button>
    </div>
  </div>
</div>`;
}

// ── Control bindings ───────────────────────────────
function bindControls(container) {
  // Tab switching
  container.querySelectorAll('.tl-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.tl-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const id = tab.dataset.tab;
      container.querySelectorAll('.tl-tab-content').forEach(c => c.style.display = 'none');
      container.querySelector(`#tl-tab-${id}`).style.display = '';
    });
  });

  // Collapsible offset section
  container.querySelector('#tl-offset-hdr')?.addEventListener('click', () => {
    const body = container.querySelector('#tl-offset-body');
    const chevron = container.querySelector('#tl-offset-hdr .tl-chevron');
    const collapsed = body.style.display === 'none';
    body.style.display = collapsed ? '' : 'none';
    chevron.textContent = collapsed ? '▾' : '▸';
  });

  // Offset buttons
  // 年龄偏移：无需编辑权限，任何人都可调整
  container.querySelectorAll('.tl-ob').forEach(btn => {
    btn.addEventListener('click', () => {
      ageOffset += parseInt(btn.dataset.d);
      syncSlider(); draw(); saveConfigDebounced();
    });
  });

  // Slider
  const slider = container.querySelector('#tl-slider');
  slider.addEventListener('input', () => {
    ageOffset = parseInt(slider.value);
    updateAgeVal(); draw(); saveConfigDebounced();
  });

  // Reset ages
  container.querySelector('#tl-reset-ages').addEventListener('click', () => {
    ageOffset = 0; syncSlider(); draw(); saveConfigDebounced();
    showToast('年龄已归零');
  });

  // Reset zoom
  container.querySelector('#tl-reset-zoom').addEventListener('click', () => {
    scale = 60; viewOffX = 0; draw();
    if (isEditor()) saveConfigDebounced();
    showToast('缩放已重置');
  });

  // Panel toggle
  function toggleTimelinePanel() {
    const panel = container.querySelector('#tl-panel');
    const chevron = container.querySelector('#tl-panel-chevron');
    const expandBtn = container.querySelector('#tl-expand');
    const collapsed = panel.classList.toggle('collapsed');
    chevron.textContent = collapsed ? '▶' : '◀';
    if (expandBtn) expandBtn.classList.toggle('show', collapsed);
  }
  container.querySelector('#tl-panel-toggle')?.addEventListener('click', toggleTimelinePanel);
  container.querySelector('#tl-expand')?.addEventListener('click', toggleTimelinePanel);

  // Select character button
  container.querySelector('#tl-select-char-btn')?.addEventListener('click', () => {
    if (!isEditor()) { showToast('🔒 请先解锁编辑'); return; }
    openSelectModal(container);
  });
  container.querySelector('#tl-select-cancel')?.addEventListener('click', () => {
    container.querySelector('#tl-select-modal').classList.remove('show');
  });
  container.querySelector('#tl-select-modal')?.addEventListener('mousedown', e => {
    if (e.target === container.querySelector('#tl-select-modal')) {
      container.querySelector('#tl-select-modal').classList.remove('show');
    }
  });
}

function updateEditUI(container) {
  const ed = isEditor();
  const addArea = container?.querySelector('#tl-add-area');
  const locked  = container?.querySelector('#tl-edit-locked');
  if (addArea) addArea.style.display = ed ? '' : 'none';
  if (locked)  locked.style.display  = ed ? 'none' : '';
  updateSidebar();
}

// ── Modal bindings ─────────────────────────────────
function bindModal(container) {
  container.querySelector('#tl-modal-cancel').addEventListener('click', closeModal);
  container.querySelector('#tl-modal-save').addEventListener('click', () => confirmEdit(container));
  container.querySelector('#tl-modal-delete').addEventListener('click', () => deleteChar(container));
  container.querySelector('#tl-modal-overlay').addEventListener('click', e => {
    if (e.target === container.querySelector('#tl-modal-overlay')) closeModal();
  });
  container.querySelector('#tl-upload-btn').addEventListener('click', () => container.querySelector('#tl-file-input').click());
  container.querySelector('#tl-url-btn').addEventListener('click', () => {
    const row = container.querySelector('#tl-url-row');
    row.style.display = row.style.display==='none' ? '' : 'none';
    if (row.style.display !== 'none') container.querySelector('#tl-url-input').focus();
  });
  container.querySelector('#tl-url-confirm').addEventListener('click', () => {
    const url = container.querySelector('#tl-url-input').value.trim();
    if (!url) return;
    pendingAvatar = url; pendingAvatarIsFile = false;
    refreshAvatarPreview(container, url);
    container.querySelector('#tl-url-row').style.display = 'none';
  });
  container.querySelector('#tl-avatar-clear-x').addEventListener('click', () => {
    pendingAvatar = null; pendingAvatarIsFile = false;
    refreshAvatarPreview(container, null);
    showToast('头像已清除');
  });
  container.querySelector('#tl-file-input').addEventListener('change', e => handleFileUpload(e, container));
  container.querySelector('#tl-limit-toggle').addEventListener('click', () => toggleLimit(container));

  document.addEventListener('keydown', e => {
    const overlay = document.querySelector('#tl-modal-overlay');
    if (!overlay?.classList.contains('show')) return;
    if (e.key === 'Escape') closeModal();
  });
}

function openModal(c) {
  if (!isEditor()) return;
  editTarget = c; pendingAvatar = undefined; pendingAvatarIsFile = false;
  document.querySelector('#tl-edit-name').value = c.name;
  document.querySelector('#tl-edit-age').value  = c.baseAge + ageOffset;
  document.querySelector('#tl-url-input').value  = '';
  document.querySelector('#tl-url-row').style.display = 'none';
  document.querySelector('#tl-avatar-error').style.display = 'none';
  refreshAvatarPreview(document, c.avatar, c.name, c.color);
  const hasLimit = c.ageLimit != null;
  const tog = document.querySelector('#tl-limit-toggle');
  const li  = document.querySelector('#tl-limit-input');
  tog.className = 'tl-toggle' + (hasLimit?' on':'');
  li.disabled = !hasLimit; li.value = hasLimit ? c.ageLimit : '';
  document.querySelector('#tl-modal-overlay').classList.add('show');
  setTimeout(() => document.querySelector('#tl-edit-name').focus(), 80);
}

function closeModal() {
  document.querySelector('#tl-modal-overlay')?.classList.remove('show');
  editTarget = null; pendingAvatar = undefined; pendingAvatarIsFile = false;
}

function refreshAvatarPreview(scope, src, name, color) {
  const p    = (scope.querySelector || scope.getElementById.bind(scope))
               ? scope.querySelector('#tl-avatar-preview') : null;
  if (!p) return;
  const xBtn = p.querySelector('#tl-avatar-clear-x') || document.querySelector('#tl-avatar-clear-x');
  p.style.background = color || '#252840';
  const initial = ((name || editTarget?.name || '?').charAt(0).toUpperCase());
  if (src) {
    p.innerHTML = `<img src="${src}" onerror="this.parentElement.innerHTML='<span style=color:#e74c3c>✕</span>'" style="width:100%;height:100%;object-fit:cover"/>`;
  } else {
    p.innerHTML = `<span style="color:#fff;font-size:20px;font-weight:700">${initial}</span>`;
  }
  p.appendChild(xBtn);
  xBtn.style.display = src ? '' : 'none';
}

function handleFileUpload(e, container) {
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
      container.querySelector('#tl-avatar-error').style.display = 'none';
      refreshAvatarPreview(container, result);
    };
    img2.src = ev.target.result;
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

function toggleLimit(container) {
  const tog = container.querySelector('#tl-limit-toggle');
  const li  = container.querySelector('#tl-limit-input');
  const on  = tog.classList.toggle('on');
  li.disabled = !on;
  if (on && !li.value) li.value = Math.max(1, parseInt(container.querySelector('#tl-edit-age').value) || 50);
  if (on) li.focus();
}

async function confirmEdit(container) {
  if (!editTarget || !isEditor()) return;
  const nm = container.querySelector('#tl-edit-name').value.trim();
  const da = parseInt(container.querySelector('#tl-edit-age').value);
  if (!nm)               { showToast('名字不能为空'); return; }
  if (isNaN(da)||da<0||da>200) { showToast('年龄无效'); return; }
  if (characters.some(c => c.name===nm && c.id!==editTarget.id)) { showToast('已存在同名人物'); return; }

  editTarget.name    = nm;
  editTarget.baseAge = da - ageOffset;

  if (pendingAvatar !== undefined) {
    if (pendingAvatar === null) {
      editTarget.avatar = undefined;
    } else if (pendingAvatarIsFile) {
      showToast('⏳ 上传图片中…');
      const url = await uploadImage(pendingAvatar);
      editTarget.avatar = url || pendingAvatar;
    } else {
      editTarget.avatar = pendingAvatar;
    }
    clearImgCache(editTarget.id);
    if (editTarget.avatar) getImg(editTarget);
  }

  const tog = container.querySelector('#tl-limit-toggle');
  const li  = container.querySelector('#tl-limit-input');
  if (tog.classList.contains('on')) {
    const lv = parseInt(li.value);
    if (!isNaN(lv) && lv > 0) editTarget.ageLimit = lv;
    else { showToast('年龄上限无效'); return; }
  } else { editTarget.ageLimit = null; }

  // ★ 必须先保存再关弹窗：closeModal() 会把 editTarget 清为 null
  const saving = editTarget;   // 保留引用
  draw();
  closeModal();
  await saveCharacter(saving);
  showToast('已更新：' + nm);
}

async function deleteChar() {
  if (!editTarget || !isEditor()) return;
  if (!confirmDialog(`确定要删除「${editTarget.name}」？`)) return;
  const c = editTarget;          // ★ 先保留引用再关弹窗
  characters = characters.filter(x => x.id !== c.id);
  clearImgCache(c.id);
  closeModal(); draw();
  await deleteCharacter(c);
  showToast('已删除：' + c.name);
}

// ── Add character ──────────────────────────────────

// ── Select character modal ─────────────────────────
async function openSelectModal(container) {
  setSyncStatus('syncing');
  try {
    const { data, error } = await supaClient.from('characters').select('*').order('name');
    if (error) throw error;
    const allChars = (data||[]).map(c => ({
      id:c.id, name:c.name, baseAge:c.base_age, color:c.color||'#7c83f7', avatar:c.avatar_url
    }));
    
    const list = container.querySelector('#tl-select-list');
    if (!allChars.length) {
      list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:14px">暂无人物<br>请先在「人物」页面创建</div>';
      container.querySelector('#tl-select-modal').classList.add('show');
      setSyncStatus('ok');
      return;
    }

    // Filter out characters already in timeline
    const existingIds = characters.map(c => c.id);
    const available = allChars.filter(c => !existingIds.includes(c.id));

    if (!available.length) {
      list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:14px">所有人物都已添加到时间轴</div>';
      container.querySelector('#tl-select-modal').classList.add('show');
      setSyncStatus('ok');
      return;
    }

    list.innerHTML = available.map(c => {
      const av = c.avatar
        ? `<div class="char-pick-av"><img src="${escHtml(c.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"></div>`
        : `<div class="char-pick-av" style="background:${c.color}">${escHtml(c.name.charAt(0))}</div>`;
      return `<div class="char-pick-item" data-id="${c.id}">
        ${av}
        <span class="char-pick-name">${escHtml(c.name)}</span>
      </div>`;
    }).join('');

    list.querySelectorAll('.char-pick-item').forEach(item => {
      item.addEventListener('click', async () => {
        const id = parseInt(item.dataset.id);
        const char = available.find(c => c.id === id);
        if (!char) return;
        container.querySelector('#tl-select-modal').classList.remove('show');
        await addCharFromTable(char, container);
      });
    });

    container.querySelector('#tl-select-modal').classList.add('show');
    setSyncStatus('ok');
  } catch(e) { dbError('加载人物列表', e); }
}

async function addCharFromTable(char, container) {
  if (!isEditor()) return;
  // Add to local timeline with baseAge = 0 (user can edit later)
  const c = {
    id: char.id,
    name: char.name,
    baseAge: char.baseAge ?? 0,
    color: char.color,
    avatar: char.avatar,
    sortOrder: characters.length
  };
  characters.push(c);
  draw();
  await saveCharacter(c);
  showToast(`已添加：${c.name}`);
}


// ── Canvas geometry helpers ────────────────────────
function dispAge(c) {
  const raw = c.baseAge + ageOffset;
  if (c.ageLimit != null && raw > c.ageLimit) return c.ageLimit;
  return raw;
}
function isGone(c) { return c.ageLimit != null && (c.baseAge + ageOffset) > c.ageLimit; }
function dispAgeToX(da) { return canvas.width/2 + viewOffX + da * scale; }
function xToDispAge(x)  { return (x - canvas.width/2 - viewOffX) / scale; }

function resizeCanvas() {
  if (!wrap || !canvas) return;
  canvas.width  = wrap.clientWidth;
  canvas.height = wrap.clientHeight;
  NODE_R    = canvas.width < 480 ? 14 : 18;
  STACK_GAP = NODE_R * 2.6;
  draw();
}

// ── Draw ───────────────────────────────────────────
function draw() {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const ay = Math.round(canvas.height * .44);
  const s  = Math.floor(xToDispAge(0)) - 1;
  const e  = Math.ceil(xToDispAge(canvas.width)) + 1;

  // Grid
  for (let a = s; a <= e; a++) {
    if (a%5!==0) continue;
    const gx=dispAgeToX(a), maj=(a%10===0);
    ctx.strokeStyle = maj?'rgba(255,255,255,.07)':'rgba(255,255,255,.02)';
    ctx.lineWidth = maj?1:.5;
    ctx.beginPath(); ctx.moveTo(gx,0); ctx.lineTo(gx,canvas.height); ctx.stroke();
  }
  // Axis
  const gr=ctx.createLinearGradient(0,0,canvas.width,0);
  gr.addColorStop(0,'rgba(124,131,247,0)'); gr.addColorStop(.12,'rgba(124,131,247,.55)');
  gr.addColorStop(.88,'rgba(124,131,247,.55)'); gr.addColorStop(1,'rgba(124,131,247,0)');
  ctx.strokeStyle=gr; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(0,ay); ctx.lineTo(canvas.width,ay); ctx.stroke();
  // Ticks
  for (let a2=s; a2<=e; a2++) {
    if (a2<-50||a2>300) continue;
    const maj2=(a2%10===0), mid2=(a2%5===0);
    if (!maj2&&!mid2&&scale<30) continue;
    if (!maj2&&scale<14) continue;
    const x2=dispAgeToX(a2);
    ctx.strokeStyle=maj2?'rgba(124,131,247,.85)':'rgba(124,131,247,.35)';
    ctx.lineWidth=maj2?1.5:1;
    const th=maj2?13:7;
    ctx.beginPath(); ctx.moveTo(x2,ay-th); ctx.lineTo(x2,ay+th); ctx.stroke();
    if (maj2||(mid2&&scale>22)) {
      ctx.fillStyle=maj2?'rgba(200,202,255,.82)':'rgba(200,202,255,.38)';
      ctx.font=(maj2?12:10)+'px system-ui'; ctx.textAlign='center';
      ctx.fillText(a2,x2,ay+26);
    }
  }
  // Center line
  ctx.save();
  ctx.strokeStyle='rgba(124,131,247,.18)'; ctx.setLineDash([4,4]); ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(canvas.width/2,0); ctx.lineTo(canvas.width/2,canvas.height);
  ctx.stroke(); ctx.setLineDash([]); ctx.restore();
  // Limit markers
  characters.forEach(c => {
    if (c.ageLimit==null) return;
    const lx=dispAgeToX(c.ageLimit);
    ctx.save();
    ctx.strokeStyle=c.color+'55'; ctx.lineWidth=1.5; ctx.setLineDash([3,4]);
    ctx.beginPath(); ctx.moveTo(lx,ay-30); ctx.lineTo(lx,ay+10); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
    ctx.save(); ctx.fillStyle=c.color+'88';
    ctx.beginPath(); ctx.moveTo(lx,ay-8); ctx.lineTo(lx+5,ay); ctx.lineTo(lx,ay+8); ctx.lineTo(lx-5,ay); ctx.closePath(); ctx.fill();
    ctx.restore();
  });
  // Nodes
  const byDA={};
  characters.forEach(c => { const da=dispAge(c); if(!byDA[da])byDA[da]=[]; byDA[da].push(c); });
  Object.keys(byDA).forEach(da => {
    const group=byDA[da], gx=dispAgeToX(Number(da));
    group.forEach((c,idx) => {
      const cy=ay-idx*STACK_GAP;
      if (idx>0) {
        ctx.save();
        ctx.strokeStyle=c.color+(isGone(c)?'30':'55'); ctx.lineWidth=1.5; ctx.setLineDash([3,3]);
        ctx.beginPath(); ctx.moveTo(gx,ay); ctx.lineTo(gx,cy); ctx.stroke();
        ctx.setLineDash([]); ctx.restore();
      }
      drawNode(c,gx,cy);
    });
  });
  // Info
  const scaleEl = document.querySelector('#tl-info-scale');
  const countEl = document.querySelector('#tl-info-count');
  if (scaleEl) scaleEl.textContent = scale.toFixed(0);
  if (countEl) countEl.textContent = characters.length;
  updateSidebar();
}

function lighten(hex,amt) {
  const n=parseInt(hex.slice(1),16);
  const r=Math.min(255,(n>>16)+amt),g=Math.min(255,((n>>8)&255)+amt),b=Math.min(255,(n&255)+amt);
  return '#'+((1<<24)|(r<<16)|(g<<8)|b).toString(16).slice(1);
}

function drawNode(c,x,cy) {
  const r=NODE_R, da=dispAge(c), gone=isGone(c);
  ctx.save(); if(gone) ctx.globalAlpha=0.28;
  const glow=ctx.createRadialGradient(x,cy,0,x,cy,r*2.4);
  glow.addColorStop(0,(gone?'#888888':c.color)+'40'); glow.addColorStop(1,(gone?'#888888':c.color)+'00');
  ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(x,cy,r*2.4,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(x,cy,r,0,Math.PI*2); ctx.save(); ctx.clip();
  const img=c.avatar?getImg(c):null;
  if (img&&img.complete&&img.naturalWidth>0) {
    ctx.drawImage(img,x-r,cy-r,r*2,r*2);
    if(gone){ctx.fillStyle='rgba(20,20,30,.55)';ctx.fillRect(x-r,cy-r,r*2,r*2);}
    const ov=ctx.createLinearGradient(x,cy-r,x,cy+r);
    ov.addColorStop(0,'rgba(0,0,0,0)'); ov.addColorStop(1,'rgba(0,0,0,.45)');
    ctx.fillStyle=ov; ctx.fillRect(x-r,cy-r,r*2,r*2);
  } else {
    const col=gone?'#555':c.color;
    const bg=ctx.createRadialGradient(x-r*.28,cy-r*.28,0,x,cy,r);
    bg.addColorStop(0,gone?'#777':lighten(c.color,28)); bg.addColorStop(1,col);
    ctx.fillStyle=bg; ctx.fillRect(x-r,cy-r,r*2,r*2);
    ctx.fillStyle=gone?'#aaa':'#fff';
    ctx.font='bold '+Math.round(r*.72)+'px system-ui';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(c.name.charAt(0).toUpperCase(),x,cy);
  }
  ctx.restore();
  ctx.strokeStyle=gone?'rgba(120,120,130,.4)':'rgba(255,255,255,.25)'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.arc(x,cy,r,0,Math.PI*2); ctx.stroke();
  if(gone){
    ctx.strokeStyle='rgba(220,80,80,.9)'; ctx.lineWidth=1.5;
    const q=r*.38;
    ctx.beginPath(); ctx.moveTo(x-q,cy-q); ctx.lineTo(x+q,cy+q); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+q,cy-q); ctx.lineTo(x-q,cy+q); ctx.stroke();
  }
  ctx.restore();
  ctx.save(); ctx.fillStyle=gone?'#888':'#e8eaed';
  ctx.font='bold '+Math.round(r*.67)+'px system-ui';
  ctx.textAlign='center'; ctx.textBaseline='bottom';
  ctx.shadowColor='rgba(0,0,0,.9)'; ctx.shadowBlur=7;
  ctx.fillText(c.name,x,cy-r-4); ctx.restore();
  ctx.save(); ctx.fillStyle=gone?'#e74c3c':c.color;
  ctx.font=Math.round(r*.6)+'px system-ui';
  ctx.textAlign='center'; ctx.textBaseline='top';
  ctx.shadowColor='rgba(0,0,0,.8)'; ctx.shadowBlur=5;
  ctx.fillText(da+'岁'+(gone?' †':''),x,cy+r+3); ctx.restore();
}

// ── Hit test ───────────────────────────────────────
function hitTest(mx,my) {
  const ay=Math.round(canvas.height*.44), byDA={};
  let found=null;
  characters.forEach(c=>{const da=dispAge(c);if(!byDA[da])byDA[da]=[];byDA[da].push(c);});
  Object.keys(byDA).forEach(da=>{
    const group=byDA[da],gx=dispAgeToX(Number(da));
    group.forEach((c,idx)=>{
      const cy=ay-idx*STACK_GAP;
      if(Math.sqrt((mx-gx)**2+(my-cy)**2)<=NODE_R+6) found=c;
    });
  });
  return found;
}

// ── Pointer events ─────────────────────────────────
function bindPointer() {
  function ptDist(t1,t2){const dx=t1.clientX-t2.clientX,dy=t1.clientY-t2.clientY;return Math.sqrt(dx*dx+dy*dy);}
  function ptMid(t1,t2){return{x:(t1.clientX+t2.clientX)/2,y:(t1.clientY+t2.clientY)/2};}
  function evXY(e){if(e.touches)return{x:e.touches[0].clientX,y:e.touches[0].clientY};return{x:e.clientX,y:e.clientY};}

  function onStart(e) {
    if (e.touches?.length===2) {
      pinch.active=true; pinch.dist0=ptDist(e.touches[0],e.touches[1]);
      pinch.scale0=scale; const m=ptMid(e.touches[0],e.touches[1]);
      const rect=canvas.getBoundingClientRect(); pinch.cx=m.x-rect.left; pinch.off0=viewOffX;
      ptr.active=false; return;
    }
    pinch.active=false; ptr.active=true; ptr.moved=false;
    const p=evXY(e); ptr.sx=p.x; ptr.sy=p.y; ptr.so=viewOffX;
    wrap.classList.add('grabbing');
  }
  function onMove(e) {
    if (pinch.active&&e.touches?.length===2) {
      const d=ptDist(e.touches[0],e.touches[1]),ratio=d/pinch.dist0;
      const ns=Math.min(MAX_SCALE,Math.max(MIN_SCALE,pinch.scale0*ratio));
      const ac=(pinch.cx-canvas.width/2-pinch.off0)/pinch.scale0;
      scale=ns; viewOffX=pinch.cx-canvas.width/2-ac*scale; draw();
      if(isEditor()) saveConfigDebounced(); return;
    }
    if (!ptr.active) return;
    const p=evXY(e),dx=p.x-ptr.sx,dy=p.y-ptr.sy;
    if (Math.sqrt(dx*dx+dy*dy)>4) ptr.moved=true;
    if (ptr.moved) { viewOffX=ptr.so+dx; draw(); }
  }
  function onEnd(e) {
    pinch.active=false;
    if (!ptr.active) return;
    ptr.active=false; wrap.classList.remove('grabbing');
    if (ptr.moved&&isEditor()) { saveConfigDebounced(); return; }
    if (!ptr.moved) {
      const rect=canvas.getBoundingClientRect();
      let ex,ey;
      if (e.changedTouches){ex=e.changedTouches[0].clientX-rect.left;ey=e.changedTouches[0].clientY-rect.top;}
      else{ex=e.clientX-rect.left;ey=e.clientY-rect.top;}
      const c=hitTest(ex,ey);
      if (c) { if(isEditor()) openModal(c); else showToast('🔒 请先解锁编辑'); }
    }
  }

  wrap.addEventListener('mousedown',onStart);
  wrap.addEventListener('touchstart',onStart,{passive:true});
  window.addEventListener('mousemove',onMove);
  window.addEventListener('touchmove',onMove,{passive:false});
  window.addEventListener('mouseup',onEnd);
  window.addEventListener('touchend',onEnd);
  wrap.addEventListener('wheel',e=>{
    e.preventDefault();
    const rect=canvas.getBoundingClientRect(),mx=e.clientX-rect.left;
    const ac=xToDispAge(mx);
    scale=Math.min(MAX_SCALE,Math.max(MIN_SCALE,scale*(e.deltaY<0?1.11:.90)));
    viewOffX=mx-canvas.width/2-ac*scale; draw();
    if(isEditor()) saveConfigDebounced();
  },{passive:false});
  // Long press
  wrap.addEventListener('touchstart',e=>{
    if(e.touches.length!==1) return;
    const t=e.touches[0],rect=canvas.getBoundingClientRect();
    const lx=t.clientX-rect.left,ly=t.clientY-rect.top;
    lpTimer=setTimeout(()=>{
      const c=hitTest(lx,ly);
      if(c){if(isEditor())openModal(c);else showToast('🔒 请先解锁编辑');ptr.active=false;}
    },600);
  },{passive:true});
  wrap.addEventListener('touchmove',()=>clearTimeout(lpTimer),{passive:true});
  wrap.addEventListener('touchend',()=>clearTimeout(lpTimer),{passive:true});
}

// ── Sidebar list ───────────────────────────────────
function updateSidebar() {
  const list = document.querySelector('#tl-clist');
  if (!list) return;
  if (!characters.length) {
    list.innerHTML = `<div class="tl-empty">暂无人物<br>${isEditor()?'上方输入框添加':'解锁编辑后可添加'}</div>`;
    return;
  }
  const sorted = [...characters].sort((a,b) => dispAge(a)-dispAge(b));
  list.innerHTML = sorted.map(c => {
    const da=dispAge(c), gone=isGone(c);
    const av = c.avatar
      ? `<div class="tl-ci-av"><img src="${escHtml(c.avatar)}" onerror="this.style.display='none'" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/></div>`
      : `<div class="tl-ci-av" style="background:${gone?'#555':c.color}">${escHtml(c.name.charAt(0).toUpperCase())}</div>`;
    let meta = '';
    if (c.ageLimit!=null) meta += `<span class="limit-tag">上限${c.ageLimit}岁</span>`;
    if (gone)             meta += `${meta?' ':''}<span class="dead-tag">†消逝</span>`;
    return `<div class="tl-ci" onclick="(()=>{const m=document.querySelector('#tl-modal-overlay');if(m){}})()">
      ${av}
      <div class="tl-ci-info">
        <div class="tl-cname" style="color:${gone?'#888':'#cdd'}">${escHtml(c.name)}</div>
        ${meta?`<div class="tl-cmeta">${meta}</div>`:''}
      </div>
      <div class="tl-cage${gone?' faded':''}">${da}</div>
      <div class="tl-cedit" onclick="window._tlOpenModal('${c.id}')">${isEditor()?'✎':'👁'}</div>
    </div>`;
  }).join('');

  // Expose modal opener globally for inline onclick
  window._tlOpenModal = (id) => {
    const c = characters.find(x => String(x.id)===String(id));
    if (c) { if(isEditor()) openModal(c); else showToast('🔒 请先解锁编辑'); }
  };
}

// ── Image cache ────────────────────────────────────
function getImg(c) {
  const key = c.id+'_'+c.avatar;
  if (imgCache[key]) return imgCache[key];
  const img=new Image(); img.crossOrigin='anonymous';
  img.onload=()=>{imgCache[key]=img;draw();};
  img.onerror=()=>{imgCache[key]=null;};
  img.src=c.avatar;
  imgCache[key]=img; return null;
}
function clearImgCache(id) {
  Object.keys(imgCache).filter(k=>k.startsWith(id+'_')).forEach(k=>delete imgCache[k]);
}

// ── Supabase CRUD ──────────────────────────────────
async function fetchAll() {
  setSyncStatus('syncing');
  try {
    const [charRes,cfgRes] = await Promise.all([
      supaClient.from('characters').select('*').order('sort_order').order('id'),
      supaClient.from('timeline_config').select('*').eq('id',1).single()
    ]);
    if (charRes.error) throw charRes.error;
    if (cfgRes.error) throw cfgRes.error;
    characters = (charRes.data||[]).map((r,i) => ({
      id:r.id, name:r.name, baseAge:r.base_age, ageLimit:r.age_limit,
      color:r.color||PALETTE[i%PALETTE.length], avatar:r.avatar_url||undefined, sortOrder:r.sort_order||0
    }));
    const cfg=cfgRes.data;
    ageOffset=cfg.age_offset||0; scale=cfg.scale||60; viewOffX=cfg.view_off_x||0;
    syncSlider(); draw(); setSyncStatus('ok');
  } catch(e) { dbError('加载数据',e); }
}

async function saveCharacter(c) {
  if (!isEditor()) return;
  setSyncStatus('syncing');
  try {
    const row = {
      name:       c.name,
      base_age:   c.baseAge,
      age_limit:  c.ageLimit || null,
      color:      c.color,
      avatar_url: c.avatar || null,
      sort_order: c.sortOrder || 0
    };
    console.log('[saveCharacter]', c.name, '→ avatar_url:', row.avatar_url);
    let res;
    if (c.id && typeof c.id === 'number') {
      res = await supaClient.from('characters').update(row).eq('id', c.id);
    } else {
      res = await supaClient.from('characters').insert(row).select().single();
      if (!res.error && res.data) c.id = res.data.id;
    }
    if (res.error) throw res.error;
    console.log('[saveCharacter] 成功，id:', c.id);
    setSyncStatus('ok');
  } catch(e) { dbError('保存人物', e); }
}

async function deleteCharacter(c) {
  if (!isEditor()||!c.id||typeof c.id!=='number') return;
  setSyncStatus('syncing');
  try {
    // 删 Storage 头像（仅 Storage URL，外链跳过）
    if (c.avatar && c.avatar.includes('/storage/v1/object/public/avatars/')) {
      const filename = c.avatar.split('/avatars/').pop();
      if (filename) {
        const { error: se } = await supaClient.storage.from('avatars').remove([filename]);
        if (se) console.warn('[delete] Storage 删除失败:', se.message);
        else console.log('[delete] 头像已从 Storage 删除:', filename);
      }
    }
    const res = await supaClient.from('characters').delete().eq('id', c.id);
    if (res.error) throw res.error;
    setSyncStatus('ok');
  } catch(e) { dbError('删除人物', e); }
}

function saveConfigDebounced() {
  clearTimeout(cfgTimer);
  cfgTimer = setTimeout(async ()=>{
    // ageOffset 任何人都可保存；pan/zoom 仅编辑者保存（由调用方决定是否传入）
    setSyncStatus('syncing');
    try {
      const res=await supaClient.from('timeline_config').upsert({id:1,age_offset:ageOffset,scale,view_off_x:viewOffX});
      if (res.error) throw res.error;
      setSyncStatus('ok');
    } catch(e) { dbError('保存配置',e); }
  },800);
}

async function uploadImage(base64) {
  const arr  = base64.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8 = new Uint8Array(n);
  while (n--) u8[n] = bstr.charCodeAt(n);
  const blob = new Blob([u8], {type: mime});

  const filename = `avatar_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
  try {
    const { data: upData, error: upErr } =
      await supaClient.storage.from('avatars').upload(filename, blob, {
        contentType: 'image/jpeg',
        upsert: false
      });
    if (upErr) throw upErr;

    // getPublicUrl 不会失败，但要确保拿到的是字符串
    const { data: urlData } = supaClient.storage.from('avatars').getPublicUrl(filename);
    const publicUrl = urlData?.publicUrl;
    if (!publicUrl) throw new Error('getPublicUrl 返回为空');
    console.log('[upload] 上传成功，URL：', publicUrl);
    return publicUrl;
  } catch (e) {
    console.error('[upload] 上传失败：', e);
    dbError('上传图片', e);
    return null;
  }
}

function subscribeRealtime() {
  realtimeChannel = supaClient.channel('timeline-data')
    .on('postgres_changes',{event:'*',schema:'public',table:'characters'},()=>fetchAll())
    .on('postgres_changes',{event:'*',schema:'public',table:'timeline_config'},payload=>{
      if (!isEditor()&&payload.new) {
        ageOffset=payload.new.age_offset||0; scale=payload.new.scale||60; viewOffX=payload.new.view_off_x||0;
        syncSlider(); draw();
      }
    })
    .subscribe();
}

// ── Offset/zoom helpers ────────────────────────────
function syncSlider() {
  const sl=document.querySelector('#tl-slider');
  if (sl) sl.value=Math.max(-100,Math.min(100,ageOffset));
  updateAgeVal();
}
function updateAgeVal() {
  const el=document.querySelector('#tl-age-val');
  if (el) el.textContent=(ageOffset>=0?'+':'')+ageOffset;
}
