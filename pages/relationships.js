// relationships.js - 人物关系图谱页面
import { supaClient, setSyncStatus } from '../core/supabase-client.js';
import { isEditor, onAuthChange } from '../core/auth.js';
import { showToast, confirmDialog } from '../core/ui.js';

let pageContainer = null;
let canvas = null;
let ctx = null;

// 数据
let characters = [];
let relationships = [];
let positions = {};
let selectedIds = new Set();
let avatarImages = {};

// 画布状态
let isDragging = false;
let draggedChar = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let canvasOffsetX = 0;
let canvasOffsetY = 0;
let scale = 1;

// 画布拖拽状态
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panOffsetX = 0;
let panOffsetY = 0;

// 关系编辑弹窗状态
let relModalCharA = null;
let relModalCharB = null;

// Panel
let panelOpen = true;

// Realtime
let realtimeCh = null;

// 常量
const NODE_RADIUS = 40;
const NODE_SELECTED_COLOR = '#5865f2';
const LINE_COLOR = '#cbd5e1';
const LINE_SELECTED_COLOR = '#7c83f7';
const LABEL_BG = 'rgba(255, 255, 255, 0.9)';

// ── HTML 构建 ────────────────────────────────────

function buildHTML() {
  return `
<div class="rel-page">
  <div class="rel-layout">
    <!-- Canvas container -->
    <div id="rel-cw" class="rel-cw">
      <canvas id="rel-canvas"></canvas>

      <!-- Floating expand button (shows when panel collapsed) -->
      <button id="rel-expand" class="expand-btn-float" title="展开人物列表">◀</button>

      <!-- Zoom toolbar (top-left, map-style) -->
      <div class="rel-toolbar">
        <button class="rel-tb-btn" id="rel-zoom-in"  title="放大">＋</button>
        <button class="rel-tb-btn" id="rel-zoom-out" title="缩小">－</button>
        <button class="rel-tb-btn" id="rel-zoom-fit" title="重置视角">⊡</button>
      </div>
    </div>

    <!-- 右侧面板 (map-panel 同款) -->
    <div id="rel-panel" class="rel-panel">
      <div class="rel-panel-hdr" id="rel-panel-toggle">
        <span>🕸 人物列表</span><span id="rel-panel-chevron">◀</span>
      </div>

      <div class="rel-panel-body">
        <div style="display:flex;gap:4px;padding:8px 10px 4px 10px;">
          <button class="btn bn" id="rel-select-all" style="flex:1;font-size:12px">显示全部</button>
          <button class="btn bn" id="rel-clear-all" style="flex:1;font-size:12px">清空选择</button>
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

<style>
.rel-page {
  height: 100%;
  display: flex;
  flex-direction: column;
}

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

#rel-canvas.dragging {
  cursor: grabbing;
}

/* Floating expand button positioning */
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
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: 1px solid var(--ibr);
  background: var(--panel);
  color: var(--text);
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all .15s;
  box-shadow: 0 2px 8px rgba(0,0,0,.3);
}

.rel-tb-btn:hover {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.rel-tb-btn:active { transform: scale(.92); }

/* ── Right panel (map-panel style) ── */
.rel-panel {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 50;
  width: 240px;
  background: var(--panel);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: transform .28s cubic-bezier(0.4,0,0.2,1);
}

.rel-panel.collapsed {
  transform: translateX(100%);
}

.rel-panel-hdr {
  padding: 11px 14px;
  font-size: 13px;
  font-weight: 700;
  color: var(--accent);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
}

.rel-panel-hdr:hover { background: #22263a; }

#rel-panel-chevron {
  font-size: 11px;
  color: var(--muted);
}

.rel-panel-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Character list ── */
.rel-char-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.rel-char-list::-webkit-scrollbar { width: 3px; }
.rel-char-list::-webkit-scrollbar-thumb { background: var(--ibr); border-radius: 3px; }

.rel-char-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 12px;
  cursor: pointer;
  transition: background .1s;
  opacity: 0.6;
}

.rel-char-item:hover { background: #22263a; opacity: 0.85; }
.rel-char-item.selected { opacity: 1; background: rgba(124, 131, 247, 0.1); }

.rel-char-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--accent);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
  overflow: hidden;
}

.rel-char-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.rel-char-name {
  flex: 1;
  font-size: 13px;
  color: #cdd;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rel-char-edit-btn {
  opacity: 0;
  transition: opacity .15s;
  font-size: 11px;
  padding: 3px 7px;
  border-radius: 5px;
  border: 1px solid var(--ibr);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}

.rel-char-item:hover .rel-char-edit-btn { opacity: 1; }
.rel-char-edit-btn:hover { color: var(--accent); border-color: var(--accent); }

/* ── Relationship modal char picker ── */
.rel-modal-char-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  padding: 6px 0;
  max-height: 160px;
  overflow-y: auto;
  margin-bottom: 4px;
}

.rel-modal-char-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px;
  border-radius: 8px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all .15s;
  width: 58px;
  background: var(--bg);
}

.rel-modal-char-btn:hover { background: #22263a; border-color: var(--border); }
.rel-modal-char-btn.selected { border-color: var(--accent); background: rgba(124, 131, 247, 0.1); }

.rel-modal-char-av {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

.rel-modal-char-av img { width: 100%; height: 100%; object-fit: cover; }

.rel-modal-char-name {
  font-size: 11px;
  color: #cdd;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
}

@media (max-width: 768px) {
  .rel-panel { width: 220px; }
}
</style>
  `;
}

// ── Canvas 绘制 ──────────────────────────────────

function resizeCanvas() {
  if (!canvas) return;
  const container = canvas.parentElement;
  const oldWidth = canvas.width;
  const oldHeight = canvas.height;
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;

  if (oldWidth === 0 && oldHeight === 0) {
    canvasOffsetX = canvas.width / 2;
    canvasOffsetY = canvas.height / 2;
  }

  draw();
}

function draw() {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  ctx.save();
  ctx.translate(canvasOffsetX, canvasOffsetY);
  ctx.scale(scale, scale);

  drawRelationships();
  drawCharacters();

  ctx.restore();
}

function drawGrid() {
  const step = 50;
  const offsetX = canvasOffsetX % step;
  const offsetY = canvasOffsetY % step;

  ctx.save();
  ctx.strokeStyle = 'rgba(124, 131, 247, 0.07)';
  ctx.lineWidth = 1;

  for (let x = offsetX; x < canvas.width; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = offsetY; y < canvas.height; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }
  ctx.restore();
}

function drawRelationships() {
  const selectedArray = Array.from(selectedIds);

  relationships.forEach(rel => {
    const char1 = characters.find(c => c.id === rel.fromCharacterId);
    const char2 = characters.find(c => c.id === rel.toCharacterId);
    if (!char1 || !char2) return;

    const bothSelected = selectedIds.has(char1.id) && selectedIds.has(char2.id);
    if (!bothSelected) return;

    const pos1 = positions[char1.id] || { x: 100, y: 100 };
    const pos2 = positions[char2.id] || { x: 300, y: 100 };

    const isActive = selectedArray.length === 2 &&
                     selectedArray.includes(char1.id) &&
                     selectedArray.includes(char2.id);

    ctx.strokeStyle = isActive ? LINE_SELECTED_COLOR : LINE_COLOR;
    ctx.lineWidth = isActive ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(pos1.x, pos1.y);
    ctx.lineTo(pos2.x, pos2.y);
    ctx.stroke();

    if (rel.fromLabel || rel.toLabel) {
      const dx = pos2.x - pos1.x;
      const dy = pos2.y - pos1.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ux = dx / dist, uy = dy / dist;
      const labelOffset = NODE_RADIUS + 10;

      if (rel.fromLabel) drawLabelAtPosition(rel.fromLabel, pos1.x + ux * labelOffset, pos1.y + uy * labelOffset, isActive);
      if (rel.toLabel)   drawLabelAtPosition(rel.toLabel,   pos2.x - ux * labelOffset, pos2.y - uy * labelOffset, isActive);
    }
  });
}

function drawLabelAtPosition(text, x, y, isActive) {
  ctx.save();
  ctx.font = '12px system-ui, sans-serif';
  const metrics = ctx.measureText(text);
  const padding = 6;
  const width = metrics.width + padding * 2;
  const height = 20;

  ctx.fillStyle = isActive ? 'rgba(124, 131, 247, 0.95)' : LABEL_BG;
  ctx.fillRect(x - width / 2, y - height / 2, width, height);
  ctx.strokeStyle = isActive ? '#5865f2' : LINE_COLOR;
  ctx.lineWidth = 1;
  ctx.strokeRect(x - width / 2, y - height / 2, width, height);
  ctx.fillStyle = isActive ? '#ffffff' : '#334155';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawCharacters() {
  characters.forEach(char => {
    if (!selectedIds.has(char.id)) return;
    const pos = positions[char.id] || { x: 100, y: 100 };

    ctx.save();
    ctx.fillStyle = NODE_SELECTED_COLOR;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, NODE_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    const avatarImg = avatarImages[char.id];
    if (avatarImg && avatarImg.complete) {
      drawAvatar(avatarImg, pos.x, pos.y);
    } else {
      drawInitial(char, pos);
    }
    ctx.restore();
  });
}

function drawAvatar(img, x, y) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, NODE_RADIUS - 2, 0, Math.PI * 2);
  ctx.clip();

  const size = NODE_RADIUS * 2;
  const imgRatio = img.width / img.height;
  let drawWidth, drawHeight, offsetX, offsetY;

  if (imgRatio > 1) {
    drawHeight = size; drawWidth = size * imgRatio;
    offsetX = -(drawWidth - size) / 2; offsetY = 0;
  } else {
    drawWidth = size; drawHeight = size / imgRatio;
    offsetX = 0; offsetY = -(drawHeight - size) / 2;
  }

  ctx.drawImage(img, x - NODE_RADIUS + offsetX, y - NODE_RADIUS + offsetY, drawWidth, drawHeight);
  ctx.restore();
}

function drawInitial(char, pos) {
  ctx.fillStyle = 'white';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(char.name.charAt(0), pos.x, pos.y);
}

// ── 交互处理 ──────────────────────────────────────

function getCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left - canvasOffsetX) / scale,
    y: (e.clientY - rect.top  - canvasOffsetY) / scale,
  };
}

function findCharacterAt(x, y) {
  return characters.find(char => {
    if (!selectedIds.has(char.id)) return false;
    const pos = positions[char.id];
    if (!pos) return false;
    return Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2) <= NODE_RADIUS;
  });
}

function handleCanvasMouseDown(e) {
  const { x, y } = getCanvasCoords(e);
  const char = findCharacterAt(x, y);

  if (char && isEditor()) {
    draggedChar = char;
    const pos = positions[char.id];
    dragOffsetX = x - pos.x;
    dragOffsetY = y - pos.y;
    isDragging = true;
    canvas.classList.add('dragging');
  } else {
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panOffsetX = canvasOffsetX;
    panOffsetY = canvasOffsetY;
    canvas.style.cursor = 'grabbing';
  }

  isPanning.clickX = e.clientX;
  isPanning.clickY = e.clientY;
}

function handleCanvasMouseMove(e) {
  if (isDragging && draggedChar) {
    const { x, y } = getCanvasCoords(e);
    positions[draggedChar.id] = { x: x - dragOffsetX, y: y - dragOffsetY };
    draw();
  } else if (isPanning) {
    canvasOffsetX = panOffsetX + (e.clientX - panStartX);
    canvasOffsetY = panOffsetY + (e.clientY - panStartY);
    draw();
  }
}

function handleCanvasMouseUp(e) {
  const dx = e.clientX - (isPanning.clickX || e.clientX);
  const dy = e.clientY - (isPanning.clickY || e.clientY);
  const isClick = Math.sqrt(dx * dx + dy * dy) < 5;

  if (isClick && !isDragging) {
    const { x, y } = getCanvasCoords(e);
    const char = findCharacterAt(x, y);
    if (char) showToast(`${char.name}${char.description ? ': ' + char.description.slice(0, 40) : ''}`, 2500);
  }

  if (isDragging && draggedChar && isEditor()) {
    savePosition(draggedChar.id, positions[draggedChar.id]);
  }

  isDragging = false;
  draggedChar = null;
  isPanning = false;
  canvas.classList.remove('dragging');
  canvas.style.cursor = 'grab';
}

function handleCanvasWheel(e) {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
  const newScale = Math.min(3, Math.max(0.3, scale * zoomFactor));
  canvasOffsetX = mouseX - (mouseX - canvasOffsetX) * (newScale / scale);
  canvasOffsetY = mouseY - (mouseY - canvasOffsetY) * (newScale / scale);
  scale = newScale;
  draw();
}

// ── 数据操作 ──────────────────────────────────────

async function fetchCharacters() {
  try {
    const { data, error } = await supaClient.from('characters').select('*').order('created_at');
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

    await fetchPositions();
    autoLayoutIfNeeded();
    renderCharacterList();
    draw();
  } catch (e) {
    console.error('Failed to fetch characters:', e);
    showToast('加载人物失败');
  }
}

async function fetchPositions() {
  try {
    const { data, error } = await supaClient.from('character_positions').select('*');
    if (error) throw error;
    positions = {};
    (data || []).forEach(pos => { positions[pos.character_id] = { x: pos.x, y: pos.y }; });
  } catch (e) {
    console.error('Failed to fetch positions:', e);
  }
}

async function fetchRelationships() {
  try {
    const { data, error } = await supaClient.from('character_relationships').select('*');
    if (error) throw error;
    relationships = (data || []).map(r => ({
      id: r.id,
      fromCharacterId: r.from_character_id,
      toCharacterId: r.to_character_id,
      fromLabel: r.from_label || '',
      toLabel: r.to_label || ''
    }));
    draw();
  } catch (e) {
    console.error('Failed to fetch relationships:', e);
    showToast('加载关系失败');
  }
}

function autoLayoutIfNeeded() {
  const needsLayout = characters.some(char => !positions[char.id]);
  if (!needsLayout) return;

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = Math.min(canvas.width, canvas.height) / 3;

  characters.forEach((char, idx) => {
    if (!positions[char.id]) {
      const angle = (idx / characters.length) * Math.PI * 2;
      positions[char.id] = {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius
      };
    }
  });
}

async function savePosition(characterId, pos) {
  try {
    const { error } = await supaClient.from('character_positions').upsert({
      character_id: characterId, x: pos.x, y: pos.y
    });
    if (error) throw error;
  } catch (e) {
    console.error('Failed to save position:', e);
  }
}

async function saveRelationship(charAId, charBId, labelFromA, labelFromB) {
  // DB stores from_id < to_id always
  const [from, to]       = charAId < charBId ? [charAId, charBId] : [charBId, charAId];
  const [label1, label2] = charAId < charBId ? [labelFromA, labelFromB] : [labelFromB, labelFromA];

  try {
    const { error } = await supaClient.from('character_relationships').upsert({
      from_character_id: from, to_character_id: to,
      from_label: label1, to_label: label2
    });
    if (error) throw error;
    await fetchRelationships();
    showToast('关系已保存');
  } catch (e) {
    console.error('Failed to save relationship:', e);
    showToast('保存关系失败');
  }
}

async function deleteRelationship(charAId, charBId) {
  const [from, to] = charAId < charBId ? [charAId, charBId] : [charBId, charAId];
  try {
    const { error } = await supaClient.from('character_relationships').delete()
      .eq('from_character_id', from).eq('to_character_id', to);
    if (error) throw error;
    await fetchRelationships();
    showToast('关系已删除');
  } catch (e) {
    console.error('Failed to delete relationship:', e);
    showToast('删除关系失败');
  }
}

// ── 关系编辑弹窗 ──────────────────────────────────

function openRelModal(charA) {
  relModalCharA = charA;
  relModalCharB = null;

  pageContainer.querySelector('#rel-modal-title').textContent = `编辑 ${charA.name} 的关系`;
  pageContainer.querySelector('#rel-modal-labels').style.display = 'none';
  pageContainer.querySelector('#rel-modal-save').disabled = true;
  pageContainer.querySelector('#rel-modal-delete').style.display = 'none';
  pageContainer.querySelector('#rel-modal-from-input').value = '';
  pageContainer.querySelector('#rel-modal-to-input').value = '';

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
    const isSelected = relModalCharB?.id === c.id;
    return `
      <button class="rel-modal-char-btn${isSelected ? ' selected' : ''}" data-id="${c.id}">
        <div class="rel-modal-char-av" style="background:${avBg}">${avHtml}</div>
        <div class="rel-modal-char-name">${c.name}</div>
      </button>`;
  }).join('');

  picker.querySelectorAll('.rel-modal-char-btn').forEach(btn => {
    btn.addEventListener('click', () => selectModalCharB(parseInt(btn.dataset.id)));
  });
}

function selectModalCharB(charBId) {
  relModalCharB = characters.find(c => c.id === charBId);
  if (!relModalCharB) return;

  // Update visual selection
  pageContainer.querySelectorAll('.rel-modal-char-btn').forEach(btn => {
    btn.classList.toggle('selected', parseInt(btn.dataset.id) === charBId);
  });

  // Show labels
  pageContainer.querySelector('#rel-modal-labels').style.display = 'block';
  pageContainer.querySelector('#rel-modal-label-a').textContent = `${relModalCharA.name} 对 ${relModalCharB.name} 是`;
  pageContainer.querySelector('#rel-modal-label-b').textContent = `${relModalCharB.name} 对 ${relModalCharA.name} 是`;

  // Load existing relationship
  const [from, to] = relModalCharA.id < relModalCharB.id
    ? [relModalCharA.id, relModalCharB.id]
    : [relModalCharB.id, relModalCharA.id];

  const rel = relationships.find(r => r.fromCharacterId === from && r.toCharacterId === to);
  const fromInput = pageContainer.querySelector('#rel-modal-from-input');
  const toInput   = pageContainer.querySelector('#rel-modal-to-input');

  if (rel) {
    // If charA has smaller ID, it's "from" in DB; otherwise it's "to"
    if (relModalCharA.id < relModalCharB.id) {
      fromInput.value = rel.fromLabel || '';
      toInput.value   = rel.toLabel   || '';
    } else {
      // charA is stored as "to" in DB, so swap for display
      fromInput.value = rel.toLabel   || '';
      toInput.value   = rel.fromLabel || '';
    }
    pageContainer.querySelector('#rel-modal-delete').style.display = '';
  } else {
    fromInput.value = '';
    toInput.value   = '';
    pageContainer.querySelector('#rel-modal-delete').style.display = 'none';
  }

  pageContainer.querySelector('#rel-modal-save').disabled = false;
}

function closeRelModal() {
  pageContainer.querySelector('#rel-edit-modal').classList.remove('show');
  relModalCharA = null;
  relModalCharB = null;
}

// ── UI 渲染 ───────────────────────────────────────

function renderCharacterList() {
  const listEl = pageContainer.querySelector('#rel-char-list');
  if (!characters.length) {
    listEl.innerHTML = '<div style="padding:16px;text-align:center;color:var(--muted);font-size:13px">暂无人物</div>';
    return;
  }

  const editor = isEditor();

  listEl.innerHTML = characters.map(char => {
    const avContent = char.avatar_url
      ? `<img src="${char.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.style.display='none'" />`
      : char.name.charAt(0).toUpperCase();
    const avBg = char.avatar_url ? 'transparent' : (char.color || '#7c83f7');

    return `
      <div class="rel-char-item ${selectedIds.has(char.id) ? 'selected' : ''}" data-id="${char.id}">
        <div class="rel-char-avatar" style="background:${avBg}">${avContent}</div>
        <span class="rel-char-name">${char.name}</span>
        ${editor ? `<button class="rel-char-edit-btn" data-edit-id="${char.id}" title="编辑关系">✏️</button>` : ''}
      </div>`;
  }).join('');

  listEl.querySelectorAll('.rel-char-item').forEach(el => {
    const id = parseInt(el.dataset.id);
    el.addEventListener('click', e => {
      if (e.target.closest('.rel-char-edit-btn')) return;
      toggleCharacterSelection(id);
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

function toggleCharacterSelection(charId) {
  if (selectedIds.has(charId)) {
    selectedIds.delete(charId);
  } else {
    selectedIds.add(charId);
  }
  renderCharacterList();
  draw();
}

// ── 控制绑定 ──────────────────────────────────────

function bindControls() {
  // Canvas events
  canvas.addEventListener('mousedown', handleCanvasMouseDown);
  canvas.addEventListener('mousemove', handleCanvasMouseMove);
  canvas.addEventListener('mouseup', handleCanvasMouseUp);
  canvas.addEventListener('mouseleave', handleCanvasMouseUp);
  canvas.addEventListener('wheel', handleCanvasWheel, { passive: false });

  // Panel toggle (map-panel style: slide out with transform)
  function togglePanel() {
    panelOpen = !panelOpen;
    const panel    = pageContainer.querySelector('#rel-panel');
    const chevron  = pageContainer.querySelector('#rel-panel-chevron');
    const expandBtn = pageContainer.querySelector('#rel-expand');
    panel.classList.toggle('collapsed', !panelOpen);
    if (chevron)    chevron.textContent = panelOpen ? '◀' : '▶';
    if (expandBtn)  expandBtn.classList.toggle('show', !panelOpen);
  }

  pageContainer.querySelector('#rel-panel-toggle')?.addEventListener('click', togglePanel);
  pageContainer.querySelector('#rel-expand')?.addEventListener('click', togglePanel);

  // Zoom toolbar
  pageContainer.querySelector('#rel-zoom-in').addEventListener('click', () => {
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const nz = Math.min(3, scale * 1.3);
    canvasOffsetX = cx - (cx - canvasOffsetX) * (nz / scale);
    canvasOffsetY = cy - (cy - canvasOffsetY) * (nz / scale);
    scale = nz; draw();
  });
  pageContainer.querySelector('#rel-zoom-out').addEventListener('click', () => {
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const nz = Math.max(0.3, scale / 1.3);
    canvasOffsetX = cx - (cx - canvasOffsetX) * (nz / scale);
    canvasOffsetY = cy - (cy - canvasOffsetY) * (nz / scale);
    scale = nz; draw();
  });
  pageContainer.querySelector('#rel-zoom-fit').addEventListener('click', () => {
    scale = 1;
    canvasOffsetX = canvas.width / 2;
    canvasOffsetY = canvas.height / 2;
    draw();
    showToast('视角已重置');
  });

  // Select/clear
  pageContainer.querySelector('#rel-select-all').addEventListener('click', () => {
    characters.forEach(c => selectedIds.add(c.id));
    renderCharacterList();
    draw();
  });
  pageContainer.querySelector('#rel-clear-all').addEventListener('click', () => {
    selectedIds.clear();
    renderCharacterList();
    draw();
  });

  // Modal buttons
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

  // Auth changes: re-render list + close modal if needed
  onAuthChange(() => {
    renderCharacterList();
    if (!isEditor() && pageContainer.querySelector('#rel-edit-modal')?.classList.contains('show')) {
      closeRelModal();
    }
  });

  window.addEventListener('resize', resizeCanvas);
}

// ── Realtime ──────────────────────────────────────

function subscribeRealtime() {
  realtimeCh = supaClient.channel('relationships-page')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'characters' }, () => fetchCharacters())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'character_relationships' }, () => fetchRelationships())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'character_positions' }, () => fetchPositions().then(draw))
    .subscribe();
}

// ── 生命周期 ──────────────────────────────────────

export async function mount(container) {
  pageContainer = container;
  container.innerHTML = buildHTML();

  canvas = container.querySelector('#rel-canvas');
  ctx = canvas.getContext('2d');

  bindControls();
  resizeCanvas();

  setSyncStatus('syncing');
  await Promise.all([fetchCharacters(), fetchRelationships()]);
  setSyncStatus('ok');

  subscribeRealtime();
}

export function unmount() {
  window.removeEventListener('resize', resizeCanvas);
  realtimeCh && supaClient.removeChannel(realtimeCh);
}
