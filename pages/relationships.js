import { supaClient, setSyncStatus } from '../core/supabase-client.js';
import { isEditor, onAuthChange } from '../core/auth.js';
import { showToast, confirmDialog, escHtml } from '../core/ui.js';

// ── 状态 ──────────────────────────────────────────
let pageContainer = null;
let canvas = null;
let ctx = null;

// 多画布
let boards = [];           // { id, name }[]
let activeBoardId = null;  // 当前显示的画布 ID

// 每个画布的独立状态（按 boardId 键值）
// boardStates[id] = { selectedIds, canvasOffsetX, canvasOffsetY, scale }
let boardStates = {};

// 全局数据（所有画布共享人物列表）
let characters = [];
let avatarImages = {};

// 当前画布数据
let relationships = [];   // 当前画布的关系（含 boardId）
let positions = {};       // 当前画布的节点位置 { charId: {x,y} }

// 画布交互
let isDragging = false;
let draggedChar = null;
let dragOffsetX = 0, dragOffsetY = 0;

let isPanning = false;
let panStartX = 0, panStartY = 0;
let panOffsetX = 0, panOffsetY = 0;

// 关系编辑弹窗
let relModalCharA = null;
let relModalCharB = null;

// 画布名称编辑弹窗
let renamingBoardId = null;

// Panel
let panelOpen = true;

// Realtime
let realtimeCh = null;

// 常量
const NODE_RADIUS = 40;
const NODE_COLOR = '#5865f2';
const LINE_COLOR = '#cbd5e1';
const LINE_SELECTED_COLOR = '#7c83f7';
const LABEL_BG = 'rgba(30,32,56,0.92)';

// ── 画布状态管理 ──────────────────────────────────
function getBoardState(id) {
  if (!boardStates[id]) {
    boardStates[id] = {
      selectedIds: new Set(),
      canvasOffsetX: 0,
      canvasOffsetY: 0,
      scale: 1,
      initialized: false,
    };
  }
  return boardStates[id];
}

function getState() { return getBoardState(activeBoardId); }

// Convenience getters/setters that proxy to active board state
function getSelectedIds()  { return getState().selectedIds; }
function getScale()        { return getState().scale; }
function setScale(v)       { getState().scale = v; }
function getOffsetX()      { return getState().canvasOffsetX; }
function setOffsetX(v)     { getState().canvasOffsetX = v; }
function getOffsetY()      { return getState().canvasOffsetY; }
function setOffsetY(v)     { getState().canvasOffsetY = v; }

// ── HTML ─────────────────────────────────────────

function buildHTML() {
  return `
<div class="rel-page">

  <!-- 画布切换 tab 栏 -->
  <div class="rel-tab-bar" id="rel-tab-bar">
    <div class="rel-tabs" id="rel-tabs"></div>
    <button class="rel-tab-add" id="rel-tab-add" style="display:none" title="新建画布">＋</button>
  </div>

  <div class="rel-layout">
    <!-- Canvas 区域 -->
    <div id="rel-cw" class="rel-cw">
      <canvas id="rel-canvas"></canvas>

      <!-- 浮动展开按钮 -->
      <button id="rel-expand" class="expand-btn-float" title="展开人物列表">◀</button>

      <!-- 缩放工具栏 -->
      <div class="rel-toolbar">
        <button class="rel-tb-btn" id="rel-zoom-in"  title="放大">＋</button>
        <button class="rel-tb-btn" id="rel-zoom-out" title="缩小">－</button>
        <button class="rel-tb-btn" id="rel-zoom-fit" title="重置视角">⊡</button>
      </div>
    </div>

    <!-- 右侧面板 -->
    <div id="rel-panel" class="rel-panel">
      <div class="rel-panel-hdr" id="rel-panel-toggle">
        <span>🕸 人物列表</span><span id="rel-panel-chevron">◀</span>
      </div>
      <div class="rel-panel-body">
        <div style="display:flex;gap:4px;padding:8px 10px 4px 10px;">
          <button class="btn bn" id="rel-select-all" style="flex:1;font-size:12px">显示全部</button>
          <button class="btn bn" id="rel-clear-all"  style="flex:1;font-size:12px">清空选择</button>
        </div>
        <div id="rel-char-list" class="rel-char-list"></div>
      </div>
    </div>
  </div>
</div>

<!-- 关系编辑弹窗 -->
<div id="rel-edit-modal" class="tl-modal-overlay">
  <div class="tl-modal" style="max-width:420px" onmousedown="event.stopPropagation()">
    <h2 id="rel-modal-title">编辑关系</h2>
    <label style="margin-bottom:6px;display:block;font-size:12px;color:var(--muted)">选择另一位人物</label>
    <div id="rel-modal-char-picker" class="rel-modal-char-picker"></div>
    <div id="rel-modal-labels" style="display:none;margin-top:14px">
      <label id="rel-modal-label-a" style="display:block;font-size:12px;font-weight:500;margin-bottom:4px"></label>
      <input id="rel-modal-from-input" type="text" placeholder="关系描述…" style="margin-bottom:10px"/>
      <label id="rel-modal-label-b" style="display:block;font-size:12px;font-weight:500;margin-bottom:4px"></label>
      <input id="rel-modal-to-input" type="text" placeholder="关系描述…"/>
    </div>
    <div class="mbtns" style="justify-content:space-between;margin-top:16px">
      <button class="btn br" id="rel-modal-delete" style="display:none">🗑 删除关系</button>
      <div style="display:flex;gap:8px;margin-left:auto">
        <button class="btn bn" id="rel-modal-cancel">取消</button>
        <button class="btn bp" id="rel-modal-save" disabled>保存</button>
      </div>
    </div>
  </div>
</div>

<!-- 画布重命名弹窗 -->
<div id="rel-rename-modal" class="tl-modal-overlay">
  <div class="tl-modal" style="max-width:340px" onmousedown="event.stopPropagation()">
    <h2>画布名称</h2>
    <input id="rel-rename-input" type="text" placeholder="画布名称…" maxlength="40" style="margin-bottom:4px"/>
    <div class="mbtns" style="justify-content:flex-end;margin-top:12px">
      <button class="btn bn" id="rel-rename-cancel">取消</button>
      <button class="btn bp" id="rel-rename-save">保存</button>
    </div>
  </div>
</div>

<!-- 画布右键菜单 -->
<div id="rel-board-menu" class="rel-board-menu" style="display:none">
  <button id="rel-bmenu-rename">✏️ 重命名</button>
  <button id="rel-bmenu-delete" style="color:var(--red)">🗑 删除画布</button>
</div>

<style>
/* ── Page layout ── */
.rel-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Tab bar ── */
.rel-tab-bar {
  display: flex;
  align-items: center;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  height: 36px;
  overflow: hidden;
  position: relative;
  z-index: 60;
}

.rel-tabs {
  display: flex;
  align-items: stretch;
  flex: 1;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  height: 100%;
}
.rel-tabs::-webkit-scrollbar { display: none; }

.rel-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
  cursor: pointer;
  white-space: nowrap;
  border-right: 1px solid var(--border);
  transition: all .15s;
  user-select: none;
  flex-shrink: 0;
  position: relative;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}

.rel-tab:hover { color: var(--text); background: rgba(124,131,247,.06); }

.rel-tab.active {
  color: var(--accent);
  background: var(--bg);
  border-bottom-color: var(--accent);
  font-weight: 600;
}

.rel-tab-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rel-tab-menu-btn {
  opacity: 0;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all .15s;
  flex-shrink: 0;
  padding: 0;
  line-height: 1;
}
.rel-tab:hover .rel-tab-menu-btn,
.rel-tab.active .rel-tab-menu-btn { opacity: 1; }
.rel-tab-menu-btn:hover { background: rgba(124,131,247,.15); color: var(--accent); }

.rel-tab-add {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 18px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all .15s;
  display: flex;
  align-items: center;
  justify-content: center;
  border-left: 1px solid var(--border);
}
.rel-tab-add:hover { color: var(--accent); background: rgba(124,131,247,.08); }

/* ── Board context menu ── */
.rel-board-menu {
  position: fixed;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px 0;
  z-index: 1000;
  box-shadow: 0 8px 24px rgba(0,0,0,.4);
  min-width: 140px;
}
.rel-board-menu button {
  display: block;
  width: 100%;
  padding: 8px 14px;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background .1s;
}
.rel-board-menu button:hover { background: rgba(124,131,247,.1); }

/* ── Layout ── */
.rel-layout {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.rel-cw {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

#rel-canvas {
  display: block;
  cursor: grab;
}
#rel-canvas.dragging { cursor: grabbing; }

/* ── Empty state overlay ── */
.rel-empty-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 5;
}
.rel-empty-msg {
  text-align: center;
  color: var(--muted);
  font-size: 14px;
  line-height: 2;
}

/* Floating expand button */
#rel-expand { top: 50%; right: 8px; transform: translateY(-50%); }

/* ── Zoom toolbar ── */
.rel-toolbar {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 20;
}

.rel-tb-btn {
  width: 34px; height: 34px;
  border-radius: 8px;
  border: 1px solid var(--ibr);
  background: var(--panel);
  color: var(--text);
  font-size: 16px; font-weight: 700;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all .15s;
  box-shadow: 0 2px 8px rgba(0,0,0,.3);
}
.rel-tb-btn:hover { background: var(--accent); color: #fff; border-color: var(--accent); }
.rel-tb-btn:active { transform: scale(.92); }

/* ── Right panel ── */
.rel-panel {
  position: absolute; right: 0; top: 0; bottom: 0; z-index: 50;
  width: 240px;
  background: var(--panel);
  border-left: 1px solid var(--border);
  display: flex; flex-direction: column; overflow: hidden;
  transition: transform .28s cubic-bezier(0.4,0,0.2,1);
}
.rel-panel.collapsed { transform: translateX(100%); }

.rel-panel-hdr {
  padding: 11px 14px;
  font-size: 13px; font-weight: 700; color: var(--accent);
  border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
  cursor: pointer; user-select: none; flex-shrink: 0;
}
.rel-panel-hdr:hover { background: #22263a; }
#rel-panel-chevron { font-size: 11px; color: var(--muted); }

.rel-panel-body { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

/* ── Character list ── */
.rel-char-list { flex: 1; overflow-y: auto; padding: 4px 0; }
.rel-char-list::-webkit-scrollbar { width: 3px; }
.rel-char-list::-webkit-scrollbar-thumb { background: var(--ibr); border-radius: 3px; }

.rel-char-item {
  display: flex; align-items: center; gap: 10px;
  padding: 7px 12px; cursor: pointer;
  transition: background .1s; opacity: 0.6;
}
.rel-char-item:hover { background: #22263a; opacity: 0.85; }
.rel-char-item.selected { opacity: 1; background: rgba(124,131,247,.1); }

.rel-char-avatar {
  width: 28px; height: 28px; border-radius: 50%;
  color: white; display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; flex-shrink: 0; overflow: hidden;
}
.rel-char-avatar img { width: 100%; height: 100%; object-fit: cover; }
.rel-char-name { flex: 1; font-size: 13px; color: #cdd; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.rel-char-edit-btn {
  opacity: 0; transition: opacity .15s;
  font-size: 11px; padding: 3px 7px; border-radius: 5px;
  border: 1px solid var(--ibr); background: transparent; color: var(--muted);
  cursor: pointer; white-space: nowrap; flex-shrink: 0;
}
.rel-char-item:hover .rel-char-edit-btn { opacity: 1; }
.rel-char-edit-btn:hover { color: var(--accent); border-color: var(--accent); }

/* Divider between on-board and off-board characters */
.rel-char-divider {
  font-size: 11px;
  color: var(--muted);
  text-align: center;
  padding: 6px 0 4px;
  letter-spacing: .3px;
  user-select: none;
  border-top: 1px solid var(--border);
  margin: 4px 12px 2px;
}

/* ── Relationship modal char picker ── */
.rel-modal-char-picker {
  display: flex; flex-wrap: wrap; gap: 7px;
  padding: 6px 0; max-height: 160px; overflow-y: auto; margin-bottom: 4px;
}
.rel-modal-char-btn {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 6px; border-radius: 8px; border: 2px solid transparent;
  cursor: pointer; transition: all .15s; width: 58px; background: var(--bg);
}
.rel-modal-char-btn:hover { background: #22263a; border-color: var(--border); }
.rel-modal-char-btn.selected { border-color: var(--accent); background: rgba(124,131,247,.1); }
.rel-modal-char-av {
  width: 32px; height: 32px; border-radius: 50%; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; color: #fff; flex-shrink: 0;
}
.rel-modal-char-av img { width: 100%; height: 100%; object-fit: cover; }
.rel-modal-char-name { font-size: 11px; color: #cdd; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; }

@media (max-width: 768px) {
  .rel-panel { width: 220px; }
  .rel-tab-name { max-width: 80px; }
}
</style>
  `;
}

// ── Canvas 绘制 ──────────────────────────────────

function resizeCanvas() {
  if (!canvas) return;
  const cw = canvas.parentElement;
  const oldW = canvas.width, oldH = canvas.height;
  canvas.width  = cw.clientWidth;
  canvas.height = cw.clientHeight;

  // 初始化新画布的视角中心
  if (oldW === 0 && oldH === 0 && activeBoardId) {
    const st = getState();
    if (!st.initialized) {
      st.canvasOffsetX = canvas.width  / 2;
      st.canvasOffsetY = canvas.height / 2;
      st.initialized = true;
    }
  }
  draw();
}

function draw() {
  if (!ctx || !canvas || !activeBoardId) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  ctx.save();
  ctx.translate(getOffsetX(), getOffsetY());
  ctx.scale(getScale(), getScale());

  drawRelationships();
  drawCharacters();

  ctx.restore();
}

function drawGrid() {
  const step = 50;
  const ox = getOffsetX() % step;
  const oy = getOffsetY() % step;
  ctx.save();
  ctx.strokeStyle = 'rgba(124,131,247,.07)';
  ctx.lineWidth = 1;
  for (let x = ox; x < canvas.width;  x += step) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
  for (let y = oy; y < canvas.height; y += step) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width, y);  ctx.stroke(); }
  ctx.restore();
}

function drawRelationships() {
  const selArr = Array.from(getSelectedIds());

  relationships.forEach(rel => {
    const c1 = characters.find(c => c.id === rel.fromCharacterId);
    const c2 = characters.find(c => c.id === rel.toCharacterId);
    if (!c1 || !c2) return;

    const sel = getSelectedIds();
    if (!sel.has(c1.id) || !sel.has(c2.id)) return;

    const pos1 = positions[c1.id] || { x: 100, y: 100 };
    const pos2 = positions[c2.id] || { x: 300, y: 100 };
    const isActive = selArr.length === 2 && sel.has(c1.id) && sel.has(c2.id);

    ctx.strokeStyle = isActive ? LINE_SELECTED_COLOR : LINE_COLOR;
    ctx.lineWidth   = isActive ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(pos1.x, pos1.y);
    ctx.lineTo(pos2.x, pos2.y);
    ctx.stroke();

    if (rel.fromLabel || rel.toLabel) {
      const dx = pos2.x - pos1.x, dy = pos2.y - pos1.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const ux = dx/dist, uy = dy/dist;
      const off = NODE_RADIUS + 10;
      if (rel.fromLabel) drawLabel(rel.fromLabel, pos1.x + ux*off, pos1.y + uy*off, isActive);
      if (rel.toLabel)   drawLabel(rel.toLabel,   pos2.x - ux*off, pos2.y - uy*off, isActive);
    }
  });
}

function drawLabel(text, x, y, isActive) {
  ctx.save();
  ctx.font = '12px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 12;
  const h = 20;
  ctx.fillStyle   = isActive ? 'rgba(124,131,247,.95)' : LABEL_BG;
  ctx.strokeStyle = isActive ? '#5865f2' : 'rgba(124,131,247,.3)';
  ctx.lineWidth = 1;
  ctx.fillRect  (x - w/2, y - h/2, w, h);
  ctx.strokeRect(x - w/2, y - h/2, w, h);
  ctx.fillStyle = isActive ? '#fff' : '#c8caff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawCharacters() {
  const sel = getSelectedIds();
  characters.forEach(char => {
    if (!sel.has(char.id)) return;
    const pos = positions[char.id] || { x: 100, y: 100 };

    ctx.save();
    ctx.fillStyle = NODE_COLOR;
    ctx.beginPath(); ctx.arc(pos.x, pos.y, NODE_RADIUS, 0, Math.PI*2); ctx.fill();

    const img = avatarImages[char.id];
    if (img && img.complete) drawAvatar(img, pos.x, pos.y);
    else                     drawInitial(char, pos);
    ctx.restore();
  });
}

function drawAvatar(img, x, y) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, NODE_RADIUS-2, 0, Math.PI*2); ctx.clip();
  const size = NODE_RADIUS*2;
  const r = img.width / img.height;
  let dw, dh, ox, oy;
  if (r > 1) { dh = size; dw = size*r; ox = -(dw-size)/2; oy = 0; }
  else       { dw = size; dh = size/r; ox = 0; oy = -(dh-size)/2; }
  ctx.drawImage(img, x - NODE_RADIUS + ox, y - NODE_RADIUS + oy, dw, dh);
  ctx.restore();
}

function drawInitial(char, pos) {
  ctx.fillStyle = 'white'; ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(char.name.charAt(0), pos.x, pos.y);
}

// ── 交互 ─────────────────────────────────────────

function getCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left  - getOffsetX()) / getScale(),
    y: (e.clientY - rect.top   - getOffsetY()) / getScale(),
  };
}

function findCharAt(x, y) {
  const sel = getSelectedIds();
  return characters.find(char => {
    if (!sel.has(char.id)) return false;
    const p = positions[char.id];
    return p && Math.sqrt((x-p.x)**2 + (y-p.y)**2) <= NODE_RADIUS;
  });
}

function handleMouseDown(e) {
  const { x, y } = getCanvasCoords(e);
  const char = findCharAt(x, y);

  if (char && isEditor()) {
    draggedChar = char;
    const p = positions[char.id];
    dragOffsetX = x - p.x; dragOffsetY = y - p.y;
    isDragging = true;
    canvas.classList.add('dragging');
  } else {
    isPanning = true;
    panStartX = e.clientX; panStartY = e.clientY;
    panOffsetX = getOffsetX(); panOffsetY = getOffsetY();
    canvas.style.cursor = 'grabbing';
  }
  isPanning.clickX = e.clientX; isPanning.clickY = e.clientY;
}

function handleMouseMove(e) {
  if (isDragging && draggedChar) {
    const { x, y } = getCanvasCoords(e);
    positions[draggedChar.id] = { x: x - dragOffsetX, y: y - dragOffsetY };
    draw();
  } else if (isPanning) {
    setOffsetX(panOffsetX + (e.clientX - panStartX));
    setOffsetY(panOffsetY + (e.clientY - panStartY));
    draw();
  }
}

function handleMouseUp(e) {
  const dx = e.clientX - (isPanning.clickX || e.clientX);
  const dy = e.clientY - (isPanning.clickY || e.clientY);
  const isClick = Math.sqrt(dx*dx + dy*dy) < 5;

  if (isClick && !isDragging) {
    const { x, y } = getCanvasCoords(e);
    const char = findCharAt(x, y);
    if (char) showToast(`${char.name}${char.description ? ': ' + char.description.slice(0,40) : ''}`, 2500);
  }

  if (isDragging && draggedChar && isEditor()) {
    savePosition(draggedChar.id, positions[draggedChar.id]);
  }

  isDragging = false; draggedChar = null; isPanning = false;
  canvas.classList.remove('dragging');
  canvas.style.cursor = 'grab';
}

function handleWheel(e) {
  e.preventDefault();
  const rect  = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const f  = e.deltaY < 0 ? 1.1 : 0.9;
  const nz = Math.min(3, Math.max(0.3, getScale() * f));
  setOffsetX(mx - (mx - getOffsetX()) * (nz / getScale()));
  setOffsetY(my - (my - getOffsetY()) * (nz / getScale()));
  setScale(nz);
  draw();
}

// ── 数据：多画布 ──────────────────────────────────

async function fetchBoards() {
  try {
    const { data, error } = await supaClient
      .from('relationship_boards').select('*').order('created_at');
    if (error) throw error;
    boards = (data || []).map(b => ({ id: b.id, name: b.name }));

    // 如果没有画布，自动创建一个
    if (!boards.length) {
      await createBoard('主关系图');
      return; // createBoard 会重新 fetchBoards
    }

    // 保持当前画布有效，或切换到第一个
    if (!activeBoardId || !boards.find(b => b.id === activeBoardId)) {
      activeBoardId = boards[0].id;
    }

    renderTabs();
    await switchToBoard(activeBoardId, true);
  } catch (e) {
    console.error('fetchBoards failed:', e);
    showToast('加载画布失败：' + e.message);
  }
}

async function createBoard(name) {
  if (!isEditor()) { showToast('🔒 请先解锁编辑'); return; }
  try {
    const { data, error } = await supaClient
      .from('relationship_boards').insert({ name }).select().single();
    if (error) throw error;
    activeBoardId = data.id;
    await fetchBoards();
    showToast(`画布「${name}」已创建`);
  } catch (e) {
    showToast('创建画布失败：' + e.message);
  }
}

async function renameBoard(id, name) {
  if (!isEditor()) return;
  try {
    const { error } = await supaClient
      .from('relationship_boards').update({ name }).eq('id', id);
    if (error) throw error;
    const b = boards.find(b => b.id === id);
    if (b) b.name = name;
    renderTabs();
    showToast('画布已重命名');
  } catch (e) {
    showToast('重命名失败：' + e.message);
  }
}

async function deleteBoard(id) {
  if (!isEditor()) return;
  if (boards.length <= 1) { showToast('至少保留一个画布'); return; }
  const b = boards.find(b => b.id === id);
  if (!confirmDialog(`确定删除画布「${b?.name}」？此画布的所有关系和布局将一并删除。`)) return;
  try {
    const { error } = await supaClient
      .from('relationship_boards').delete().eq('id', id);
    if (error) throw error;
    delete boardStates[id];
    if (activeBoardId === id) activeBoardId = null;
    await fetchBoards();
    showToast('画布已删除');
  } catch (e) {
    showToast('删除画布失败：' + e.message);
  }
}

// ── 切换画布 ──────────────────────────────────────

async function switchToBoard(id, forceLoad = false) {
  if (activeBoardId === id && !forceLoad) return;
  activeBoardId = id;

  // 初始化视角（若首次访问）
  const st = getBoardState(id);
  if (!st.initialized && canvas) {
    st.canvasOffsetX = canvas.width  / 2;
    st.canvasOffsetY = canvas.height / 2;
    st.initialized = true;
  }

  // 加载当前画布数据
  await Promise.all([
    fetchBoardRelationships(id),
    fetchBoardPositions(id),
  ]);

  // 默认选中：有 position 记录的人（即曾出现在此画布）；新空画布则选中全部
  const stAfter = getBoardState(id);
  if (!stAfter._selectionInitialized) {
    stAfter._selectionInitialized = true;
    const posIds = new Set(Object.keys(positions).map(Number));
    if (posIds.size === 0) {
      characters.forEach(c => stAfter.selectedIds.add(c.id));
    } else {
      posIds.forEach(pid => stAfter.selectedIds.add(pid));
    }
  }

  renderTabs();
  renderCharacterList();
  autoLayoutIfNeeded();
  draw();
}

// ── 数据：关系 & 位置（按 boardId） ──────────────

async function fetchBoardRelationships(boardId) {
  try {
    const { data, error } = await supaClient
      .from('character_relationships').select('*')
      .eq('board_id', boardId);
    if (error) throw error;
    relationships = (data || []).map(r => ({
      id: r.id,
      fromCharacterId: r.from_character_id,
      toCharacterId:   r.to_character_id,
      fromLabel: r.from_label || '',
      toLabel:   r.to_label   || '',
      boardId:   r.board_id,
    }));
  } catch (e) {
    console.error('fetchBoardRelationships failed:', e);
  }
}

async function fetchBoardPositions(boardId) {
  try {
    const { data, error } = await supaClient
      .from('character_positions').select('*')
      .eq('board_id', boardId);
    if (error) throw error;
    positions = {};
    (data || []).forEach(p => { positions[p.character_id] = { x: p.x, y: p.y }; });
  } catch (e) {
    console.error('fetchBoardPositions failed:', e);
  }
}

async function fetchCharacters() {
  try {
    const { data, error } = await supaClient
      .from('characters').select('*').order('created_at');
    if (error) throw error;
    characters = data || [];
    characters.forEach(char => {
      if (char.avatar_url && !avatarImages[char.id]) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload  = () => { avatarImages[char.id] = img; draw(); };
        img.onerror = () => { avatarImages[char.id] = null; };
        img.src = char.avatar_url;
      }
    });
    renderCharacterList();
  } catch (e) {
    console.error('fetchCharacters failed:', e);
    showToast('加载人物失败');
  }
}

function autoLayoutIfNeeded() {
  // 只对「已选中但还没有位置」的人物做自动布局（不动未在此画布的人）
  const sel = getSelectedIds();
  const needLayout = characters.filter(c => sel.has(c.id) && !positions[c.id]);
  if (!needLayout.length) return;

  const cx = canvas.width / 2, cy = canvas.height / 2;
  const r  = Math.min(canvas.width, canvas.height) / 3;
  needLayout.forEach((char, i) => {
    const angle = (i / needLayout.length) * Math.PI * 2;
    positions[char.id] = {
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
    };
  });
}

async function savePosition(charId, pos) {
  if (!activeBoardId) return;
  try {
    const { error } = await supaClient.from('character_positions').upsert({
      character_id: charId, board_id: activeBoardId, x: pos.x, y: pos.y
    });
    if (error) throw error;
  } catch (e) {
    console.error('savePosition failed:', e);
  }
}

async function saveRelationship(charAId, charBId, labelFromA, labelFromB) {
  if (!activeBoardId) return;
  const [from, to]   = charAId < charBId ? [charAId, charBId] : [charBId, charAId];
  const [l1, l2]     = charAId < charBId ? [labelFromA, labelFromB] : [labelFromB, labelFromA];
  try {
    const { error } = await supaClient.from('character_relationships').upsert({
      from_character_id: from, to_character_id: to,
      from_label: l1, to_label: l2,
      board_id: activeBoardId,
    });
    if (error) throw error;
    await fetchBoardRelationships(activeBoardId);
    draw();
    showToast('关系已保存');
  } catch (e) {
    showToast('保存关系失败：' + e.message);
  }
}

async function deleteRelationship(charAId, charBId) {
  if (!activeBoardId) return;
  const [from, to] = charAId < charBId ? [charAId, charBId] : [charBId, charAId];
  try {
    const { error } = await supaClient.from('character_relationships').delete()
      .eq('from_character_id', from)
      .eq('to_character_id',   to)
      .eq('board_id', activeBoardId);
    if (error) throw error;
    await fetchBoardRelationships(activeBoardId);
    draw();
    showToast('关系已删除');
  } catch (e) {
    showToast('删除关系失败：' + e.message);
  }
}

// ── Tab 渲染 ──────────────────────────────────────

function renderTabs() {
  const tabsEl  = pageContainer.querySelector('#rel-tabs');
  const addBtn  = pageContainer.querySelector('#rel-tab-add');

  tabsEl.innerHTML = boards.map(b => `
    <div class="rel-tab ${b.id === activeBoardId ? 'active' : ''}" data-board-id="${b.id}">
      <span class="rel-tab-name">${escHtml(b.name)}</span>
      <button class="rel-tab-menu-btn" data-board-id="${b.id}" title="画布选项">…</button>
    </div>
  `).join('');

  // Click tab → switch board
  tabsEl.querySelectorAll('.rel-tab').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.classList.contains('rel-tab-menu-btn')) return;
      switchToBoard(parseInt(el.dataset.boardId));
    });
  });

  // "…" button → context menu
  tabsEl.querySelectorAll('.rel-tab-menu-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (!isEditor()) { showToast('🔒 请先解锁编辑'); return; }
      const id = parseInt(btn.dataset.boardId);
      showBoardMenu(id, btn);
    });
  });

  // Show/hide add button based on editor status
  addBtn.style.display = isEditor() ? '' : 'none';
}

// ── 右键/上下文菜单 ──────────────────────────────

let boardMenuTargetId = null;

function showBoardMenu(boardId, anchorEl) {
  boardMenuTargetId = boardId;
  const menu = pageContainer.querySelector('#rel-board-menu');
  const rect = anchorEl.getBoundingClientRect();
  menu.style.display = 'block';
  menu.style.left = rect.left + 'px';
  menu.style.top  = (rect.bottom + 4) + 'px';

  // Adjust if off-screen right
  requestAnimationFrame(() => {
    const mw = menu.offsetWidth;
    if (rect.left + mw > window.innerWidth) {
      menu.style.left = (window.innerWidth - mw - 8) + 'px';
    }
  });
}

function hideBoardMenu() {
  const menu = pageContainer.querySelector('#rel-board-menu');
  if (menu) menu.style.display = 'none';
  boardMenuTargetId = null;
}

// ── 重命名弹窗 ────────────────────────────────────

function openRenameModal(boardId) {
  renamingBoardId = boardId;
  const b = boards.find(b => b.id === boardId);
  const input = pageContainer.querySelector('#rel-rename-input');
  input.value = b?.name || '';
  pageContainer.querySelector('#rel-rename-modal').classList.add('show');
  setTimeout(() => { input.focus(); input.select(); }, 60);
}

function closeRenameModal() {
  pageContainer.querySelector('#rel-rename-modal').classList.remove('show');
  renamingBoardId = null;
}

// ── 关系编辑弹窗 ──────────────────────────────────

function openRelModal(charA) {
  relModalCharA = charA;
  relModalCharB = null;

  pageContainer.querySelector('#rel-modal-title').textContent = `编辑 ${charA.name} 的关系`;
  pageContainer.querySelector('#rel-modal-labels').style.display  = 'none';
  pageContainer.querySelector('#rel-modal-save').disabled = true;
  pageContainer.querySelector('#rel-modal-delete').style.display  = 'none';
  pageContainer.querySelector('#rel-modal-from-input').value = '';
  pageContainer.querySelector('#rel-modal-to-input').value   = '';

  renderModalCharPicker();
  pageContainer.querySelector('#rel-edit-modal').classList.add('show');
}

function renderModalCharPicker() {
  const picker = pageContainer.querySelector('#rel-modal-char-picker');
  const others = characters.filter(c => c.id !== relModalCharA.id);
  if (!others.length) {
    picker.innerHTML = '<div style="font-size:13px;color:var(--muted);padding:8px">暂无其他人物</div>';
    return;
  }
  picker.innerHTML = others.map(c => {
    const avHtml = c.avatar_url
      ? `<img src="${c.avatar_url}" style="width:100%;height:100%;object-fit:cover" />`
      : c.name.charAt(0).toUpperCase();
    const avBg = c.avatar_url ? 'transparent' : (c.color || '#7c83f7');
    return `
      <button class="rel-modal-char-btn${relModalCharB?.id === c.id ? ' selected' : ''}" data-id="${c.id}">
        <div class="rel-modal-char-av" style="background:${avBg}">${avHtml}</div>
        <div class="rel-modal-char-name">${escHtml(c.name)}</div>
      </button>`;
  }).join('');

  picker.querySelectorAll('.rel-modal-char-btn').forEach(btn => {
    btn.addEventListener('click', () => selectModalCharB(parseInt(btn.dataset.id)));
  });
}

function selectModalCharB(charBId) {
  relModalCharB = characters.find(c => c.id === charBId);
  if (!relModalCharB) return;

  pageContainer.querySelectorAll('.rel-modal-char-btn').forEach(btn => {
    btn.classList.toggle('selected', parseInt(btn.dataset.id) === charBId);
  });

  pageContainer.querySelector('#rel-modal-labels').style.display = 'block';
  pageContainer.querySelector('#rel-modal-label-a').textContent = `${relModalCharA.name} 对 ${relModalCharB.name} 是`;
  pageContainer.querySelector('#rel-modal-label-b').textContent = `${relModalCharB.name} 对 ${relModalCharA.name} 是`;

  const [from, to] = relModalCharA.id < relModalCharB.id
    ? [relModalCharA.id, relModalCharB.id]
    : [relModalCharB.id, relModalCharA.id];

  const rel = relationships.find(r => r.fromCharacterId === from && r.toCharacterId === to);
  const fromInput = pageContainer.querySelector('#rel-modal-from-input');
  const toInput   = pageContainer.querySelector('#rel-modal-to-input');

  if (rel) {
    if (relModalCharA.id < relModalCharB.id) {
      fromInput.value = rel.fromLabel || ''; toInput.value = rel.toLabel   || '';
    } else {
      fromInput.value = rel.toLabel   || ''; toInput.value = rel.fromLabel || '';
    }
    pageContainer.querySelector('#rel-modal-delete').style.display = '';
  } else {
    fromInput.value = ''; toInput.value = '';
    pageContainer.querySelector('#rel-modal-delete').style.display = 'none';
  }
  pageContainer.querySelector('#rel-modal-save').disabled = false;
}

function closeRelModal() {
  pageContainer.querySelector('#rel-edit-modal').classList.remove('show');
  relModalCharA = null; relModalCharB = null;
}

// ── 人物列表渲染 ──────────────────────────────────

function renderCharacterList() {
  const listEl = pageContainer.querySelector('#rel-char-list');
  if (!listEl) return;
  if (!characters.length) {
    listEl.innerHTML = '<div style="padding:16px;text-align:center;color:var(--muted);font-size:13px">暂无人物</div>';
    return;
  }
  const editor = isEditor();
  const sel    = getSelectedIds();

  // 排序：当前画布有 position 记录的人在前（保持 characters 原始顺序），其余在后
  const onBoard  = characters.filter(c =>  positions[c.id] !== undefined);
  const offBoard = characters.filter(c =>  positions[c.id] === undefined);

  function charHtml(char) {
    const avContent = char.avatar_url
      ? `<img src="${char.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.style.display='none'" />`
      : char.name.charAt(0).toUpperCase();
    const avBg = char.avatar_url ? 'transparent' : (char.color || '#7c83f7');
    return `
      <div class="rel-char-item ${sel.has(char.id) ? 'selected' : ''}" data-id="${char.id}">
        <div class="rel-char-avatar" style="background:${avBg}">${avContent}</div>
        <span class="rel-char-name">${escHtml(char.name)}</span>
        ${editor ? `<button class="rel-char-edit-btn" data-edit-id="${char.id}" title="编辑关系">✏️</button>` : ''}
      </div>`;
  }

  const divider = offBoard.length && onBoard.length
    ? `<div class="rel-char-divider">— 未在本画布 —</div>`
    : '';

  listEl.innerHTML = [
    ...onBoard.map(charHtml),
    divider,
    ...offBoard.map(charHtml),
  ].join('');

  listEl.querySelectorAll('.rel-char-item').forEach(el => {
    const id = parseInt(el.dataset.id);
    el.addEventListener('click', e => {
      if (e.target.closest('.rel-char-edit-btn')) return;
      toggleSelection(id);
    });
  });
  listEl.querySelectorAll('.rel-char-edit-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (!isEditor()) { showToast('🔒 请先解锁编辑'); return; }
      const char = characters.find(c => c.id === parseInt(btn.dataset.editId));
      if (char) openRelModal(char);
    });
  });
}

function toggleSelection(charId) {
  const sel = getSelectedIds();
  if (sel.has(charId)) {
    sel.delete(charId);
  } else {
    sel.add(charId);
    // 如果这个人还没有位置，给他分配一个初始位置（放在现有节点旁边）
    if (!positions[charId]) {
      autoLayoutIfNeeded();
      // 仍然没有位置（理论上不会，但防御一下）→ 放中心
      if (!positions[charId]) {
        positions[charId] = { x: canvas.width / 2, y: canvas.height / 2 };
      }
    }
  }
  renderCharacterList();
  draw();
}

// ── 控制绑定 ──────────────────────────────────────

function bindControls() {
  // Canvas
  canvas.addEventListener('mousedown', handleMouseDown);
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseup',   handleMouseUp);
  canvas.addEventListener('mouseleave',handleMouseUp);
  canvas.addEventListener('wheel',     handleWheel, { passive: false });

  // Panel toggle
  function togglePanel() {
    panelOpen = !panelOpen;
    pageContainer.querySelector('#rel-panel').classList.toggle('collapsed', !panelOpen);
    pageContainer.querySelector('#rel-panel-chevron').textContent = panelOpen ? '◀' : '▶';
    pageContainer.querySelector('#rel-expand').classList.toggle('show', !panelOpen);
  }
  pageContainer.querySelector('#rel-panel-toggle')?.addEventListener('click', togglePanel);
  pageContainer.querySelector('#rel-expand')?.addEventListener('click', togglePanel);

  // Zoom
  pageContainer.querySelector('#rel-zoom-in').addEventListener('click', () => {
    const cx = canvas.width/2, cy = canvas.height/2;
    const nz = Math.min(3, getScale()*1.3);
    setOffsetX(cx - (cx - getOffsetX()) * (nz/getScale()));
    setOffsetY(cy - (cy - getOffsetY()) * (nz/getScale()));
    setScale(nz); draw();
  });
  pageContainer.querySelector('#rel-zoom-out').addEventListener('click', () => {
    const cx = canvas.width/2, cy = canvas.height/2;
    const nz = Math.max(0.3, getScale()/1.3);
    setOffsetX(cx - (cx - getOffsetX()) * (nz/getScale()));
    setOffsetY(cy - (cy - getOffsetY()) * (nz/getScale()));
    setScale(nz); draw();
  });
  pageContainer.querySelector('#rel-zoom-fit').addEventListener('click', () => {
    setScale(1);
    setOffsetX(canvas.width/2); setOffsetY(canvas.height/2);
    draw(); showToast('视角已重置');
  });

  // Select / clear
  pageContainer.querySelector('#rel-select-all').addEventListener('click', () => {
    characters.forEach(c => getSelectedIds().add(c.id));
    renderCharacterList(); draw();
  });
  pageContainer.querySelector('#rel-clear-all').addEventListener('click', () => {
    getSelectedIds().clear();
    renderCharacterList(); draw();
  });

  // New board button
  pageContainer.querySelector('#rel-tab-add').addEventListener('click', () => {
    if (!isEditor()) { showToast('🔒 请先解锁编辑'); return; }
    createBoard('新画布');
  });

  // Board context menu actions
  pageContainer.querySelector('#rel-bmenu-rename').addEventListener('click', () => {
    const id = boardMenuTargetId; hideBoardMenu();
    if (id) openRenameModal(id);
  });
  pageContainer.querySelector('#rel-bmenu-delete').addEventListener('click', () => {
    const id = boardMenuTargetId; hideBoardMenu();
    if (id) deleteBoard(id);
  });

  // Close board menu on outside click
  document.addEventListener('click', e => {
    const menu = pageContainer.querySelector('#rel-board-menu');
    if (menu && !menu.contains(e.target)) hideBoardMenu();
  }, true);

  // Rename modal
  pageContainer.querySelector('#rel-rename-cancel').addEventListener('click', closeRenameModal);
  pageContainer.querySelector('#rel-rename-save').addEventListener('click', async () => {
    const name = pageContainer.querySelector('#rel-rename-input').value.trim();
    if (!name) { showToast('名称不能为空'); return; }
    const id = renamingBoardId;
    closeRenameModal();
    await renameBoard(id, name);
  });
  pageContainer.querySelector('#rel-rename-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') pageContainer.querySelector('#rel-rename-save').click();
    if (e.key === 'Escape') closeRenameModal();
  });
  pageContainer.querySelector('#rel-rename-modal').addEventListener('mousedown', e => {
    if (e.target === pageContainer.querySelector('#rel-rename-modal')) closeRenameModal();
  });

  // Relationship modal
  pageContainer.querySelector('#rel-modal-cancel').addEventListener('click', closeRelModal);
  pageContainer.querySelector('#rel-edit-modal').addEventListener('mousedown', e => {
    if (e.target === pageContainer.querySelector('#rel-edit-modal')) closeRelModal();
  });
  pageContainer.querySelector('#rel-modal-save').addEventListener('click', async () => {
    if (!relModalCharA || !relModalCharB) return;
    const labelA = pageContainer.querySelector('#rel-modal-from-input').value.trim();
    const labelB = pageContainer.querySelector('#rel-modal-to-input').value.trim();
    const aId = relModalCharA.id, bId = relModalCharB.id;
    closeRelModal();
    await saveRelationship(aId, bId, labelA, labelB);
  });
  pageContainer.querySelector('#rel-modal-delete').addEventListener('click', async () => {
    if (!relModalCharA || !relModalCharB) return;
    if (!confirmDialog(`确定要删除「${relModalCharA.name}」和「${relModalCharB.name}」之间的关系吗？`)) return;
    const aId = relModalCharA.id, bId = relModalCharB.id;
    closeRelModal();
    await deleteRelationship(aId, bId);
  });

  // Auth change
  onAuthChange(() => {
    renderTabs();
    renderCharacterList();
    if (!isEditor() && pageContainer.querySelector('#rel-edit-modal')?.classList.contains('show')) closeRelModal();
    if (!isEditor() && pageContainer.querySelector('#rel-rename-modal')?.classList.contains('show')) closeRenameModal();
  });

  window.addEventListener('resize', resizeCanvas);
}

// ── Realtime ──────────────────────────────────────

function subscribeRealtime() {
  realtimeCh = supaClient.channel('relationships-page')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'characters' }, async () => {
      await fetchCharacters(); draw();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'character_relationships' }, async () => {
      if (activeBoardId) { await fetchBoardRelationships(activeBoardId); draw(); }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'character_positions' }, async () => {
      if (activeBoardId) { await fetchBoardPositions(activeBoardId); draw(); }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'relationship_boards' }, async () => {
      await fetchBoards();
    })
    .subscribe();
}

// ── 生命周期 ──────────────────────────────────────

export async function mount(container) {
  pageContainer = container;
  container.innerHTML = buildHTML();

  canvas = container.querySelector('#rel-canvas');
  ctx    = canvas.getContext('2d');

  bindControls();
  resizeCanvas();

  setSyncStatus('syncing');
  await fetchCharacters();
  await fetchBoards();
  setSyncStatus('ok');

  subscribeRealtime();
}

export function unmount() {
  window.removeEventListener('resize', resizeCanvas);
  realtimeCh && supaClient.removeChannel(realtimeCh);
  // Clean up global click listener
  document.removeEventListener('click', hideBoardMenu, true);
}
