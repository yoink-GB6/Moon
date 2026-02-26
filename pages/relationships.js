// relationships.js - 人物关系图谱页面
import { supaClient, isEditor, onAuthChange, showToast, setSyncStatus, confirmDialog } from '../core/common.js';

let pageContainer = null;
let canvas = null;
let ctx = null;

// 数据
let characters = [];      // 所有人物
let relationships = [];   // 所有关系
let positions = {};       // 人物位置 {characterId: {x, y}}
let selectedIds = new Set();  // 选中的人物 ID

// 画布状态
let isDragging = false;
let draggedChar = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let canvasOffsetX = 0;
let canvasOffsetY = 0;
let scale = 1;

// Realtime
let realtimeCh = null;

// 常量
const NODE_RADIUS = 40;
const NODE_COLOR = '#7c83f7';
const NODE_SELECTED_COLOR = '#5865f2';
const LINE_COLOR = '#cbd5e1';
const LINE_SELECTED_COLOR = '#7c83f7';
const LABEL_BG = 'rgba(255, 255, 255, 0.9)';

// ── HTML 构建 ────────────────────────────────────

function buildHTML() {
  return `
<div class="rel-page">
  <div class="rel-header">
    <h2>👥 人物关系图谱</h2>
    <div style="display:flex;gap:8px">
      <button class="btn bn" id="rel-fit-btn" title="适应画布">📐 适应画布</button>
      <button class="btn bn" id="rel-reset-btn" title="重置位置">🔄 重置</button>
    </div>
  </div>
  
  <div class="rel-layout">
    <!-- Canvas -->
    <div class="rel-canvas-container">
      <canvas id="rel-canvas"></canvas>
    </div>
    
    <!-- 右侧栏 -->
    <div class="rel-sidebar">
      <div class="rel-sidebar-header">
        <h3>人物列表</h3>
        <div style="display:flex;gap:4px;margin-top:8px">
          <button class="btn bn" id="rel-select-all" style="flex:1;font-size:12px">显示全部</button>
          <button class="btn bn" id="rel-clear-all" style="flex:1;font-size:12px">清空选择</button>
        </div>
      </div>
      
      <div id="rel-char-list" class="rel-char-list"></div>
      
      <!-- 编辑模式下的工具 -->
      <div id="rel-edit-tools" class="rel-edit-tools" style="display:none">
        <h4>编辑关系</h4>
        <div style="font-size:12px;color:var(--muted);margin-bottom:8px">
          选择两个人物后可编辑关系
        </div>
        <div id="rel-edit-form" style="display:none">
          <label>关系标签</label>
          <input id="rel-from-label" placeholder="A 称呼 B 为" />
          <input id="rel-to-label" placeholder="B 称呼 A 为" />
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="btn bp" id="rel-save-btn" style="flex:1">保存</button>
            <button class="btn br" id="rel-delete-btn" style="flex:1">删除</button>
          </div>
        </div>
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

.rel-header {
  padding: 20px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.rel-layout {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.rel-canvas-container {
  flex: 1;
  position: relative;
  background: var(--bg-canvas, #f8fafc);
  overflow: hidden;
}

#rel-canvas {
  display: block;
  cursor: grab;
}

#rel-canvas.dragging {
  cursor: grabbing;
}

.rel-sidebar {
  width: 300px;
  border-left: 1px solid var(--border);
  background: var(--bg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.rel-sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--border);
}

.rel-sidebar-header h3 {
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 600;
}

.rel-char-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.rel-char-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
}

.rel-char-item:hover {
  background: rgba(124, 131, 247, 0.1);
}

.rel-char-item.selected {
  background: rgba(124, 131, 247, 0.15);
}

.rel-char-checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.rel-char-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--accent);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}

.rel-char-info {
  flex: 1;
  min-width: 0;
}

.rel-char-name {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rel-edit-tools {
  padding: 16px;
  border-top: 1px solid var(--border);
  background: var(--bg-secondary, #f8fafc);
}

.rel-edit-tools h4 {
  margin: 0 0 8px 0;
  font-size: 13px;
  font-weight: 600;
}

.rel-edit-tools label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  margin: 8px 0 4px 0;
}

.rel-edit-tools input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text);
  font-size: 12px;
}

@media (max-width: 768px) {
  .rel-sidebar {
    width: 250px;
  }
}
</style>
  `;
}

// ── Canvas 绘制 ──────────────────────────────────

function resizeCanvas() {
  if (!canvas) return;
  const container = canvas.parentElement;
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  draw();
}

function draw() {
  if (!ctx || !canvas) return;
  
  // 清空画布
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  ctx.save();
  ctx.translate(canvasOffsetX, canvasOffsetY);
  ctx.scale(scale, scale);
  
  // 绘制关系线
  drawRelationships();
  
  // 绘制人物节点
  drawCharacters();
  
  ctx.restore();
}

function drawRelationships() {
  const selectedArray = Array.from(selectedIds);
  
  relationships.forEach(rel => {
    const char1 = characters.find(c => c.id === rel.fromCharacterId);
    const char2 = characters.find(c => c.id === rel.toCharacterId);
    
    if (!char1 || !char2) return;
    
    // 只有两个人物都被选中时才显示关系
    const bothSelected = selectedIds.has(char1.id) && selectedIds.has(char2.id);
    if (!bothSelected) return;
    
    const pos1 = positions[char1.id] || { x: 100, y: 100 };
    const pos2 = positions[char2.id] || { x: 300, y: 100 };
    
    // 检查是否是当前选中的关系（正好两个人选中）
    const isActive = selectedArray.length === 2 && 
                     selectedArray.includes(char1.id) && 
                     selectedArray.includes(char2.id);
    
    // 绘制连线
    ctx.strokeStyle = isActive ? LINE_SELECTED_COLOR : LINE_COLOR;
    ctx.lineWidth = isActive ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(pos1.x, pos1.y);
    ctx.lineTo(pos2.x, pos2.y);
    ctx.stroke();
    
    // 绘制标签
    if (rel.fromLabel || rel.toLabel) {
      const midX = (pos1.x + pos2.x) / 2;
      const midY = (pos1.y + pos2.y) / 2;
      
      // 计算角度
      const angle = Math.atan2(pos2.y - pos1.y, pos2.x - pos1.x);
      
      ctx.save();
      ctx.translate(midX, midY);
      
      // 绘制标签背景和文字
      if (rel.fromLabel) {
        drawLabel(rel.fromLabel, -20, angle);
      }
      if (rel.toLabel) {
        drawLabel(rel.toLabel, 20, angle + Math.PI);
      }
      
      ctx.restore();
    }
  });
}

function drawLabel(text, offset, angle) {
  ctx.save();
  
  ctx.font = '12px sans-serif';
  const metrics = ctx.measureText(text);
  const padding = 4;
  const width = metrics.width + padding * 2;
  const height = 16;
  
  // 旋转到垂直于线的方向
  ctx.rotate(angle + Math.PI / 2);
  ctx.translate(0, offset);
  
  // 背景
  ctx.fillStyle = LABEL_BG;
  ctx.fillRect(-width / 2, -height / 2, width, height);
  
  // 边框
  ctx.strokeStyle = LINE_COLOR;
  ctx.lineWidth = 1;
  ctx.strokeRect(-width / 2, -height / 2, width, height);
  
  // 文字
  ctx.fillStyle = '#334155';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  
  ctx.restore();
}

function drawCharacters() {
  characters.forEach(char => {
    if (!selectedIds.has(char.id)) return;
    
    const pos = positions[char.id] || { x: 100, y: 100 };
    const isSelected = selectedIds.has(char.id);
    
    // 绘制节点圆圈
    ctx.fillStyle = isSelected ? NODE_SELECTED_COLOR : NODE_COLOR;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, NODE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    
    // 绘制头像或首字母
    if (char.avatar) {
      // TODO: 如果有头像URL，绘制图片
      drawInitial(char, pos);
    } else {
      drawInitial(char, pos);
    }
    
    // 绘制名字
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(char.name, pos.x, pos.y + NODE_RADIUS + 8);
  });
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
  const x = (e.clientX - rect.left - canvasOffsetX) / scale;
  const y = (e.clientY - rect.top - canvasOffsetY) / scale;
  return { x, y };
}

function findCharacterAt(x, y) {
  return characters.find(char => {
    if (!selectedIds.has(char.id)) return false;
    const pos = positions[char.id];
    if (!pos) return false;
    const dx = x - pos.x;
    const dy = y - pos.y;
    return Math.sqrt(dx * dx + dy * dy) <= NODE_RADIUS;
  });
}

function handleCanvasMouseDown(e) {
  const { x, y } = getCanvasCoords(e);
  const char = findCharacterAt(x, y);
  
  if (char && isEditor()) {
    // 编辑模式：拖动人物
    draggedChar = char;
    const pos = positions[char.id];
    dragOffsetX = x - pos.x;
    dragOffsetY = y - pos.y;
    isDragging = true;
    canvas.classList.add('dragging');
  }
}

function handleCanvasMouseMove(e) {
  if (!isDragging || !draggedChar) return;
  
  const { x, y } = getCanvasCoords(e);
  positions[draggedChar.id] = {
    x: x - dragOffsetX,
    y: y - dragOffsetY
  };
  draw();
}

function handleCanvasMouseUp(e) {
  if (isDragging && draggedChar && isEditor()) {
    // 保存位置到数据库
    savePosition(draggedChar.id, positions[draggedChar.id]);
  }
  
  isDragging = false;
  draggedChar = null;
  canvas.classList.remove('dragging');
}

// ── 数据操作 ──────────────────────────────────────

async function fetchCharacters() {
  try {
    const { data, error } = await supaClient.from('characters').select('*').order('created_at');
    if (error) throw error;
    
    characters = data || [];
    
    // 初始化位置（如果没有保存的位置，使用自动布局）
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
    (data || []).forEach(pos => {
      positions[pos.character_id] = { x: pos.x, y: pos.y };
    });
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
  
  // 圆形布局
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
    const { error } = await supaClient
      .from('character_positions')
      .upsert({
        character_id: characterId,
        x: pos.x,
        y: pos.y
      });
    
    if (error) throw error;
  } catch (e) {
    console.error('Failed to save position:', e);
  }
}

async function saveRelationship(char1Id, char2Id, fromLabel, toLabel) {
  try {
    const [from, to] = char1Id < char2Id ? [char1Id, char2Id] : [char2Id, char1Id];
    const [label1, label2] = char1Id < char2Id ? [fromLabel, toLabel] : [toLabel, fromLabel];
    
    const { error } = await supaClient
      .from('character_relationships')
      .upsert({
        from_character_id: from,
        to_character_id: to,
        from_label: label1,
        to_label: label2
      });
    
    if (error) throw error;
    
    await fetchRelationships();
    showToast('关系已保存');
  } catch (e) {
    console.error('Failed to save relationship:', e);
    showToast('保存关系失败');
  }
}

async function deleteRelationship(char1Id, char2Id) {
  try {
    const [from, to] = char1Id < char2Id ? [char1Id, char2Id] : [char2Id, char1Id];
    
    const { error } = await supaClient
      .from('character_relationships')
      .delete()
      .eq('from_character_id', from)
      .eq('to_character_id', to);
    
    if (error) throw error;
    
    await fetchRelationships();
    showToast('关系已删除');
  } catch (e) {
    console.error('Failed to delete relationship:', e);
    showToast('删除关系失败');
  }
}

// ── UI 渲染 ───────────────────────────────────────

function renderCharacterList() {
  const listEl = pageContainer.querySelector('#rel-char-list');
  if (!characters.length) {
    listEl.innerHTML = '<div style="padding:16px;text-align:center;color:var(--muted)">暂无人物</div>';
    return;
  }
  
  listEl.innerHTML = characters.map(char => `
    <div class="rel-char-item ${selectedIds.has(char.id) ? 'selected' : ''}" data-id="${char.id}">
      <input type="checkbox" class="rel-char-checkbox" ${selectedIds.has(char.id) ? 'checked' : ''} />
      <div class="rel-char-avatar">${char.name.charAt(0)}</div>
      <div class="rel-char-info">
        <div class="rel-char-name">${char.name}</div>
      </div>
    </div>
  `).join('');
  
  // 绑定事件
  listEl.querySelectorAll('.rel-char-item').forEach(el => {
    const id = parseInt(el.dataset.id);
    const checkbox = el.querySelector('.rel-char-checkbox');
    
    el.addEventListener('click', (e) => {
      if (e.target === checkbox) return;
      toggleCharacterSelection(id);
    });
    
    checkbox.addEventListener('change', () => {
      toggleCharacterSelection(id);
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
  updateEditForm();
  draw();
}

function updateEditForm() {
  const editForm = pageContainer.querySelector('#rel-edit-form');
  const selectedArray = Array.from(selectedIds);
  
  if (!isEditor() || selectedArray.length !== 2) {
    editForm.style.display = 'none';
    return;
  }
  
  editForm.style.display = 'block';
  
  const [id1, id2] = selectedArray;
  const char1 = characters.find(c => c.id === id1);
  const char2 = characters.find(c => c.id === id2);
  
  if (!char1 || !char2) return;
  
  // 查找现有关系
  const [from, to] = id1 < id2 ? [id1, id2] : [id2, id1];
  const rel = relationships.find(r => 
    r.fromCharacterId === from && r.toCharacterId === to
  );
  
  const fromInput = pageContainer.querySelector('#rel-from-label');
  const toInput = pageContainer.querySelector('#rel-to-label');
  
  if (id1 < id2) {
    fromInput.placeholder = `${char1.name} 称 ${char2.name} 为`;
    toInput.placeholder = `${char2.name} 称 ${char1.name} 为`;
    fromInput.value = rel?.fromLabel || '';
    toInput.value = rel?.toLabel || '';
  } else {
    fromInput.placeholder = `${char1.name} 称 ${char2.name} 为`;
    toInput.placeholder = `${char2.name} 称 ${char1.name} 为`;
    fromInput.value = rel?.toLabel || '';
    toInput.value = rel?.fromLabel || '';
  }
}

// ── 控制按钮 ──────────────────────────────────────

function fitCanvas() {
  if (!characters.length || selectedIds.size === 0) return;
  
  const selectedChars = characters.filter(c => selectedIds.has(c.id));
  if (!selectedChars.length) return;
  
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  selectedChars.forEach(char => {
    const pos = positions[char.id];
    if (pos) {
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x);
      maxY = Math.max(maxY, pos.y);
    }
  });
  
  const padding = 100;
  const contentWidth = maxX - minX + padding * 2;
  const contentHeight = maxY - minY + padding * 2;
  
  const scaleX = canvas.width / contentWidth;
  const scaleY = canvas.height / contentHeight;
  scale = Math.min(scaleX, scaleY, 1);
  
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  
  canvasOffsetX = canvas.width / 2 - centerX * scale;
  canvasOffsetY = canvas.height / 2 - centerY * scale;
  
  draw();
}

function resetLayout() {
  if (!confirmDialog('确定要重置所有人物位置吗？')) return;
  
  positions = {};
  autoLayoutIfNeeded();
  
  // 保存所有位置
  if (isEditor()) {
    characters.forEach(char => {
      if (positions[char.id]) {
        savePosition(char.id, positions[char.id]);
      }
    });
  }
  
  draw();
  showToast('已重置布局');
}

// ── 事件绑定 ──────────────────────────────────────

function bindControls() {
  // Canvas 事件
  canvas.addEventListener('mousedown', handleCanvasMouseDown);
  canvas.addEventListener('mousemove', handleCanvasMouseMove);
  canvas.addEventListener('mouseup', handleCanvasMouseUp);
  canvas.addEventListener('mouseleave', handleCanvasMouseUp);
  
  // 按钮
  pageContainer.querySelector('#rel-select-all').addEventListener('click', () => {
    characters.forEach(c => selectedIds.add(c.id));
    renderCharacterList();
    draw();
  });
  
  pageContainer.querySelector('#rel-clear-all').addEventListener('click', () => {
    selectedIds.clear();
    renderCharacterList();
    updateEditForm();
    draw();
  });
  
  pageContainer.querySelector('#rel-fit-btn').addEventListener('click', fitCanvas);
  pageContainer.querySelector('#rel-reset-btn').addEventListener('click', resetLayout);
  
  // 编辑表单
  pageContainer.querySelector('#rel-save-btn').addEventListener('click', () => {
    const selectedArray = Array.from(selectedIds);
    if (selectedArray.length !== 2) return;
    
    const [id1, id2] = selectedArray;
    const fromLabel = pageContainer.querySelector('#rel-from-label').value.trim();
    const toLabel = pageContainer.querySelector('#rel-to-label').value.trim();
    
    saveRelationship(id1, id2, fromLabel, toLabel);
  });
  
  pageContainer.querySelector('#rel-delete-btn').addEventListener('click', () => {
    const selectedArray = Array.from(selectedIds);
    if (selectedArray.length !== 2) return;
    
    if (!confirmDialog('确定要删除这个关系吗？')) return;
    
    const [id1, id2] = selectedArray;
    deleteRelationship(id1, id2);
  });
  
  // 监听权限变化
  onAuthChange(() => {
    const editTools = pageContainer.querySelector('#rel-edit-tools');
    editTools.style.display = isEditor() ? 'block' : 'none';
    updateEditForm();
  });
  
  // 窗口大小变化
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
  
  // 初始显示编辑工具（根据权限）
  const editTools = container.querySelector('#rel-edit-tools');
  editTools.style.display = isEditor() ? 'block' : 'none';
  
  setSyncStatus('syncing');
  await Promise.all([
    fetchCharacters(),
    fetchRelationships()
  ]);
  setSyncStatus('ok');
  
  subscribeRealtime();
}

export function unmount() {
  window.removeEventListener('resize', resizeCanvas);
  realtimeCh && supaClient.removeChannel(realtimeCh);
}
