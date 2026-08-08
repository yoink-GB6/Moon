// pages/relations.js
// 人物关系网：力导向布局的拓扑图（Obsidian 那种）
//
// 坐标一律现算不入库 —— 这是和旧版关系图最大的区别，旧版存手动坐标，
// 于是每加一个角色都得摆位置、数据一改图就过期。
//
// 渲染分两层但共用同一套世界坐标：
//   SVG 画连线（线段/文字用 SVG 最省事）
//   DOM 画节点（头像圆形裁剪、文字省略号直接吃现成 CSS）
// 两层一起套同一个 transform，平移缩放就同步了。

import { supaClient, setSyncStatus, dbError } from '../core/supabase-client.js';
import { escHtml, showToast, bindCombobox } from '../core/ui.js';
import { isEditor, onAuthChange } from '../core/auth.js';
import { parseAvatarUrls, pickRandomUrl } from './characters/utils.js';
import { openCharReadonly } from './characters/modals/char-readonly-modal.js';
import * as State from './characters/state.js';
import { reflect } from '../core/router.js';
import { createPanZoom } from '../core/pan-zoom.js';

const W = 2400, H = 1600;          // 世界坐标尺寸
const R_NODE = 26;                 // 节点半径
const ITERS  = 320;                // 迭代次数，收敛后就停
const K_REP  = 90000;              // 斥力系数
const K_SPR  = 0.012;              // 弹簧系数
const REST   = 190;                // 弹簧自然长度
const K_CEN  = 0.006;              // 向心力
const DAMP   = 0.82;

let _container = null;
let _nodes = [], _links = [], _byId = new Map();
let _selected = null;
let _pz = null;    // core/pan-zoom.js 实例，视口状态 {x,y,k} 由它持有
let _cleanup = [];
let _pendingRoute = null;
let _loaded = false;
let _unsubAuth = null;
let _offset = 0;   // 年龄偏移：只影响展示，不写库

export async function mount(container) {
  _container = container;
  State.setPageContainer(container);   // openCharReadonly 从这里取挂载点
  container.innerHTML = _skeleton();
  _bindViewport();
  _bindEditing();
  _bindOffset();

  if (_unsubAuth) _unsubAuth();
  _unsubAuth = onAuthChange(() => { _syncEditorUI(); _renderList(_query()); });

  await _fetch();
  _build();
  _bestLayout();
  _render();
  _fit();
  _syncEditorUI();
  _loaded = true;
  if (_pendingRoute) { const fn = _pendingRoute; _pendingRoute = null; fn(); }
}

export function unmount() {
  if (_unsubAuth) { _unsubAuth(); _unsubAuth = null; }
  _cleanup.forEach(fn => { try { fn(); } catch (_) {} });
  _cleanup = [];
  _container = null; _nodes = []; _links = []; _byId = new Map();
  _selected = null; _loaded = false; _pendingRoute = null;
}

// #/relations/45 → 选中并居中到 45 号
export function applyRoute(parts) {
  const id = parts && parts[0];
  if (!id) { _select(null); return; }
  const run = () => { _select(String(id)); _centerOn(String(id)); };
  if (_loaded) run(); else _pendingRoute = run;
}

function _skeleton() {
  return `
<div class="rel-layout">
  <div class="rel-canvas panel-inset" id="rel-canvas">
    <div class="rel-world" id="rel-world">
      <svg class="rel-edges" id="rel-edges" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"></svg>
      <div class="rel-nodes" id="rel-nodes"></div>
    </div>
  </div>

  <div id="rel-panel" class="side-panel">
    <div class="lib-actions" id="rel-actions" style="display:none">
      <button id="rel-add-rel">＋ 关系</button>
      <button id="rel-add-char">＋ 年龄</button>
    </div>
    <div class="lib-actions rel-offset">
      <button class="rel-offset-step" data-d="-1">−</button>
      <input id="rel-offset-input" type="number" value="0" step="1"/>
      <button class="rel-offset-step" data-d="1">＋</button>
    </div>
    <div class="lib-panel-body">
      <div class="lib-search-wrap">
        <input id="rel-search" type="text" placeholder="搜索人物…" autocomplete="off"/>
      </div>
      <div id="rel-list" class="tl-clist"></div>
    </div>
  </div>
</div>

<!-- ＋关系 -->
<div id="rel-modal-rel" class="tl-modal-overlay modal-center">
  <div class="tl-modal" onmousedown="event.stopPropagation()">
    <h2>添加关系</h2>
    <label>人物 A</label>
    <div class="rel-pick"><input id="rel-a" type="text" placeholder="输入名字搜索…" autocomplete="off"/><div class="cb-sugg"></div></div>
    <label>人物 B</label>
    <div class="rel-pick"><input id="rel-b" type="text" placeholder="输入名字搜索…" autocomplete="off"/><div class="cb-sugg"></div></div>
    <label>关系</label>
    <input id="rel-label" type="text" placeholder="如：师徒" autocomplete="off"/>
    <div class="mbtns" style="justify-content:flex-end">
      <button class="btn bn" data-close="rel-modal-rel">取消</button>
      <button class="btn bp" id="rel-save-rel">保存</button>
    </div>
  </div>
</div>

<!-- ＋年龄（新建人物） -->
<div id="rel-modal-char" class="tl-modal-overlay modal-center">
  <div class="tl-modal" onmousedown="event.stopPropagation()">
    <h2>添加人物</h2>
    <label>名字</label>
    <input id="rel-new-name" type="text" autocomplete="off"/>
    <label>当前年龄</label>
    <input id="rel-new-age" type="number" min="0" max="300"/>
    <div class="mbtns" style="justify-content:flex-end">
      <button class="btn bn" data-close="rel-modal-char">取消</button>
      <button class="btn bp" id="rel-save-char">保存</button>
    </div>
  </div>
</div>

<!-- 单个人物：年龄 + 关系一览 -->
<div id="rel-modal-edit" class="tl-modal-overlay modal-center">
  <div class="tl-modal" onmousedown="event.stopPropagation()">
    <h2 id="rel-edit-title">编辑</h2>
    <label>当前年龄（含偏移）</label>
    <input id="rel-edit-age" type="number" min="0" max="300"/>
    <label>年龄上限（留空表示没有）</label>
    <input id="rel-edit-limit" type="number" min="1" max="300"/>
    <label>关系</label>
    <div id="rel-edit-list" class="cm-list"></div>
    <div class="mbtns" style="justify-content:space-between">
      <button class="btn bn" id="rel-edit-add">＋ 关系</button>
      <div style="display:flex;gap:10px">
        <button class="btn bn" data-close="rel-modal-edit">取消</button>
        <button class="btn bp" id="rel-edit-save">保存</button>
      </div>
    </div>
  </div>
</div>`;
}

async function _fetch() {
  setSyncStatus('syncing');
  try {
    // 只查两张表就够画图：节点要名字和头像，边要 a/b/label
    const [chars, rels] = await Promise.all([
      supaClient.from('characters').select('id,name,avatar_url,base_age,age_limit').order('name'),
      supaClient.from('character_relations').select('*'),
    ]);
    if (chars.error) throw chars.error;
    if (rels.error)  throw rels.error;
    State.setAllChars(chars.data || []);
    State.setAllRelations(rels.data || []);
    setSyncStatus('ok');
  } catch (e) {
    dbError('加载人物关系', e);
  }
}

function _build() {
  const chars = State.allChars || [];
  const rels  = State.allRelations || [];

  _nodes = chars.map(c => ({
    id: String(c.id), name: c.name, age: c.base_age, limit: c.age_limit,
    avatar: pickRandomUrl(parseAvatarUrls(c.avatar_url)),
    x: 0, y: 0, vx: 0, vy: 0, deg: 0,
  }));
  _byId = new Map(_nodes.map(nd => [nd.id, nd]));

  _links = rels
    .map(r => ({ a: _byId.get(String(r.a_id)), b: _byId.get(String(r.b_id)), label: r.label || '' }))
    .filter(l => l.a && l.b);
  _links.forEach(l => { l.a.deg++; l.b.deg++; });
}

// 减少连线交叉：彻底的最小交叉是 NP-hard，不值得。
// 但用几个不同的初始角度各跑一遍、数一下交叉数取最优，成本很低
// （交叉计数是 O(E²)，几十条边不过几千次比较）而且效果肉眼可见。
const TRIES = 6;

function _bestLayout() {
  let best = null, bestX = Infinity;
  for (let t = 0; t < TRIES; t++) {
    _seedPositions(t / TRIES * Math.PI * 2);
    _layout();
    const x = _countCrossings();
    if (x < bestX) {
      bestX = x;
      best = _nodes.map(nd => ({ x: nd.x, y: nd.y }));
      if (x === 0) break;
    }
  }
  if (best) best.forEach((pos, i) => { _nodes[i].x = pos.x; _nodes[i].y = pos.y; });
}

// 初始位置铺在圆上，旋转一个固定偏移量。不用随机数，
// 所以同一份数据每次打开算出来的最优布局都一样。
function _seedPositions(rot) {
  const n = _nodes.length || 1;
  _nodes.forEach((nd, i) => {
    const a = (i / n) * Math.PI * 2 + rot;
    nd.x = W / 2 + Math.cos(a) * 380;
    nd.y = H / 2 + Math.sin(a) * 380;
    nd.vx = 0; nd.vy = 0;
  });
}

function _segCross(p, q, r, s) {
  const d = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(p, q, r), d2 = d(p, q, s), d3 = d(r, s, p), d4 = d(r, s, q);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

function _countCrossings() {
  let n = 0;
  for (let i = 0; i < _links.length; i++) {
    for (let j = i + 1; j < _links.length; j++) {
      const A = _links[i], B = _links[j];
      // 共用端点的两条边不算交叉
      if (A.a === B.a || A.a === B.b || A.b === B.a || A.b === B.b) continue;
      if (_segCross(A.a, A.b, B.a, B.b)) n++;
    }
  }
  return n;
}

function _layout() {
  const cx = W / 2, cy = H / 2;
  for (let it = 0; it < ITERS; it++) {
    for (let i = 0; i < _nodes.length; i++) {
      const a = _nodes[i];
      for (let j = i + 1; j < _nodes.length; j++) {
        const b = _nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = (i - j) || 1; dy = 1; d2 = 2; }
        const f = K_REP / d2;
        const d = Math.sqrt(d2);
        a.vx += (dx / d) * f; a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
      }
    }
    for (const l of _links) {
      const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y;
      const d = Math.hypot(dx, dy) || 1;
      const f = (d - REST) * K_SPR;
      l.a.vx += (dx / d) * f; l.a.vy += (dy / d) * f;
      l.b.vx -= (dx / d) * f; l.b.vy -= (dy / d) * f;
    }
    for (const nd of _nodes) {
      nd.vx += (cx - nd.x) * K_CEN;
      nd.vy += (cy - nd.y) * K_CEN;
      nd.vx *= DAMP; nd.vy *= DAMP;
      nd.x += nd.vx; nd.y += nd.vy;
      nd.x = Math.max(R_NODE, Math.min(W - R_NODE, nd.x));
      nd.y = Math.max(R_NODE, Math.min(H - R_NODE, nd.y));
    }
  }
}

// 拖节点时只挪坐标，不重建 DOM（重建会丢掉正在进行的交互，也很浪费）
function _updatePositions() {
  const svg = _container.querySelector('#rel-edges');
  _links.forEach((l, i) => {
    const line = svg.querySelector(`line[data-i="${i}"]`);
    if (line) {
      line.setAttribute('x1', l.a.x.toFixed(1)); line.setAttribute('y1', l.a.y.toFixed(1));
      line.setAttribute('x2', l.b.x.toFixed(1)); line.setAttribute('y2', l.b.y.toFixed(1));
    }
    const tx = svg.querySelector(`text[data-i="${i}"]`);
    if (tx) {
      tx.setAttribute('x', ((l.a.x + l.b.x) / 2).toFixed(1));
      tx.setAttribute('y', ((l.a.y + l.b.y) / 2).toFixed(1));
    }
  });
  _container.querySelectorAll('.rel-node').forEach(el => {
    const nd = _byId.get(el.dataset.id);
    if (nd) { el.style.left = nd.x.toFixed(1) + 'px'; el.style.top = nd.y.toFixed(1) + 'px'; }
  });
}

// 偏移后的原始年龄（可能已超过上限），编辑弹窗用它，保证往返无损
function _rawAge(nd) { return nd.age == null ? null : nd.age + _offset; }

// 超过上限就判定「消逝」
function _isDead(nd) {
  const a = _rawAge(nd);
  return nd.limit != null && a != null && a > nd.limit;
}

// 展示用年龄：人死了年龄就停在上限，不再随偏移增长
// （所以排序到了某个偏移之后就不再变化，和年龄轴上节点停住是一个道理）
function _dispAge(nd) {
  const a = _rawAge(nd);
  if (a == null) return null;
  return (nd.limit != null && a > nd.limit) ? nd.limit : a;
}

function _render() {
  const svg  = _container.querySelector('#rel-edges');
  const host = _container.querySelector('#rel-nodes');

  svg.innerHTML = _links.map((l, i) => {
    const mx = (l.a.x + l.b.x) / 2, my = (l.a.y + l.b.y) / 2;
    return `<line class="rel-edge" data-i="${i}" x1="${l.a.x.toFixed(1)}" y1="${l.a.y.toFixed(1)}"
                  x2="${l.b.x.toFixed(1)}" y2="${l.b.y.toFixed(1)}"/>`
      + (l.label
        ? `<text class="rel-edge-label" data-i="${i}" x="${mx.toFixed(1)}" y="${my.toFixed(1)}">${escHtml(l.label)}</text>`
        : '');
  }).join('');

  host.innerHTML = _nodes.map(nd => `
    <div class="rel-node${nd.deg ? '' : ' isolated'}${_isDead(nd) ? ' dead' : ''}" data-id="${nd.id}"
         style="left:${nd.x.toFixed(1)}px;top:${nd.y.toFixed(1)}px">
      <div class="rel-node-av">${nd.avatar
        ? `<img src="${escHtml(nd.avatar)}" alt="" draggable="false"/>`
        : escHtml(nd.name.charAt(0).toUpperCase())}</div>
      <div class="rel-node-name">${escHtml(nd.name)}</div>
    </div>`).join('');

  _renderList('');
  _applyHighlight();
}

function _renderList(q) {
  const list = _container.querySelector('#rel-list');
  if (!list) return;
  let hit = q ? _nodes.filter(n => n.name.toLowerCase().includes(q)) : _nodes.slice();
  // 按展示年龄从小到大，没填年龄的沉到最后
  hit.sort((a, b) => {
    const av = _dispAge(a) == null ? Infinity : _dispAge(a);
    const bv = _dispAge(b) == null ? Infinity : _dispAge(b);
    return av - bv || a.name.localeCompare(b.name);
  });
  if (!hit.length) { list.innerHTML = '<div class="tl-empty">恭喜你，哥伦布</div>'; return; }
  const ed = isEditor();
  list.innerHTML = hit.map(nd => {
    const age  = _dispAge(nd);
    const dead = _isDead(nd);
    return `
    <div class="tl-ci rel-row${dead ? ' dead' : ''}" data-id="${nd.id}">
      <span class="rel-tick">${age == null ? '' : age}</span>
      <div class="tl-ci-av${nd.avatar ? '' : ' tl-ci-av-letter'}">${nd.avatar
        ? `<img src="${escHtml(nd.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`
        : escHtml(nd.name.charAt(0).toUpperCase())}</div>
      <div class="tl-ci-info">
        <div class="tl-cname">${escHtml(nd.name)}</div>
        ${dead ? '<div class="tl-cmeta">已消逝</div>' : ''}
      </div>
      ${ed ? `<button class="tl-cedit" data-edit="${nd.id}" title="编辑">✎</button>` : ''}
    </div>`;
  }).join('');
}

// 选中时高亮它和直接邻居，其余压暗 —— 这是拓扑图能看清的关键
function _applyHighlight() {
  const near = new Set();
  if (_selected) {
    near.add(_selected);
    _links.forEach(l => {
      if (l.a.id === _selected) near.add(l.b.id);
      if (l.b.id === _selected) near.add(l.a.id);
    });
  }
  _container.querySelector('.rel-layout')?.classList.toggle('has-selection', !!_selected);
  _container.querySelectorAll('.rel-node').forEach(el => {
    el.classList.toggle('near', near.has(el.dataset.id));
    el.classList.toggle('self', el.dataset.id === _selected);
  });
  _container.querySelectorAll('#rel-list .tl-ci').forEach(el => {
    el.classList.toggle('active-item', el.dataset.id === _selected);
  });
  _container.querySelectorAll('.rel-edge,.rel-edge-label').forEach(el => {
    const l = _links[+el.dataset.i];
    el.classList.toggle('near', !!_selected && (l.a.id === _selected || l.b.id === _selected));
  });
}

function _select(id) { _selected = id; _applyHighlight(); reflect('relations', id || ''); }

function _applyView(v) {
  const world = _container?.querySelector('#rel-world');
  if (world) world.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.k})`;
}

// 只框住节点实际占的范围。原来按整个世界尺寸缩，节点再少也被压得很小。
// 下限保证进来就能看清头像，上限防止节点很少时糊脸。
const K_MIN = 0.55, K_MAX = 1.3;

function _fit() {
  const box = _container.querySelector('#rel-canvas').getBoundingClientRect();
  if (!_nodes.length || !box.width) return;

  const pad = 90;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const nd of _nodes) {
    if (nd.x < x0) x0 = nd.x; if (nd.x > x1) x1 = nd.x;
    if (nd.y < y0) y0 = nd.y; if (nd.y > y1) y1 = nd.y;
  }
  const bw = (x1 - x0) + pad * 2, bh = (y1 - y0) + pad * 2;
  const k = Math.max(K_MIN, Math.min(K_MAX, Math.min(box.width / bw, box.height / bh)));

  _pz.view.k = k;
  _pz.view.x = box.width  / 2 - ((x0 + x1) / 2) * k;
  _pz.view.y = box.height / 2 - ((y0 + y1) / 2) * k;
  _pz.apply();
}

function _centerOn(id) {
  const nd = _byId.get(id);
  if (!nd) return;
  const box = _container.querySelector('#rel-canvas').getBoundingClientRect();
  _pz.view.k = Math.max(_pz.view.k, 0.7);
  _pz.view.x = box.width / 2  - nd.x * _pz.view.k;
  _pz.view.y = box.height / 2 - nd.y * _pz.view.k;
  _pz.apply();
}

function _on(el, type, fn, opts) {
  el.addEventListener(type, fn, opts);
  _cleanup.push(() => el.removeEventListener(type, fn, opts));
}

function _bindViewport() {
  const canvas = _container.querySelector('#rel-canvas');

  // 按下时命中的节点必须当场记住：setPointerCapture 之后，
  // pointerup 的 target 全变成 canvas，那时再 closest() 就找不到了
  let downId = null;

  // 手势力学在 core/pan-zoom.js，和图片查看器共用。
  // 这里不传 clamp / onDoubleTap / onGestureEnd —— 于是无边界、无双击、无退出手势。
  _pz = createPanZoom(canvas, {
    min: 0.15, max: 3,
    apply: _applyView,

    // 命中节点就接管这次拖拽，否则返回 null 交给模块平移画布
    onDragStart: e => {
      const el = e.target.closest('.rel-node');
      downId = el ? el.dataset.id : null;
      const nd = downId ? _byId.get(downId) : null;
      return nd ? { nd, ox: nd.x, oy: nd.y } : null;
    },
    onDrag: (h, dx, dy, k) => {
      // 拖节点只是临时挪一下，不入库；dx/dy 是屏幕像素，要除以 k 换成世界坐标
      h.nd.x = h.ox + dx / k;
      h.nd.y = h.oy + dy / k;
      _updatePositions();
    },

    onTap: () => {
      if (!downId) { _select(null); return; }
      // 已经选中的再点一次 → 打开人物详情（触屏上比双击好用）
      if (_selected === downId) _openChar(downId); else _select(downId);
    },
  });
  _cleanup.push(() => { _pz.destroy(); _pz = null; });

  _on(_container.querySelector('#rel-search'), 'input', e =>
    _renderList(e.target.value.trim().toLowerCase()));
  _on(_container.querySelector('#rel-list'), 'click', e => {
    const row = e.target.closest('.tl-ci');
    if (!row) return;
    const id = row.dataset.id;
    if (_selected === id) { _select(null); return; }   // 再点一次 = 取消选中
    _select(id);
    _centerOn(id);
  });
}

async function _openChar(id) {
  let char = (State.allChars || []).find(c => String(c.id) === String(id));
  // 图页面只查了少数字段，详情弹窗要完整记录，用时再补一次
  if (!char || char.description === undefined) {
    const { data } = await supaClient.from('characters').select('*').eq('id', id).single();
    if (data) char = data;
  }
  if (char) openCharReadonly(char);
}

// ── 编辑功能（需解锁编辑模式）───────────────────────────────

function _query() {
  return (_container?.querySelector('#rel-search')?.value || '').trim().toLowerCase();
}

function _syncEditorUI() {
  const bar = _container?.querySelector('#rel-actions');
  if (bar) bar.style.display = isEditor() ? '' : 'none';
}

function _openModal(id)  { _container.querySelector('#' + id)?.classList.add('show'); }
function _closeModal(id) { _container.querySelector('#' + id)?.classList.remove('show'); }

// 数据变了就整页重算：节点/边/布局全依赖这两张表，局部更新容易漏
async function _reload() {
  await _fetch();
  _build();
  _bestLayout();
  _render();
  _renderList(_query());
}

// combobox 本体在 core/ui.js，这里只提供候选来源。
// persist=false 用于弹窗里动态重建的行，监听器随节点一起销毁，不必登记 cleanup。
function _bindPicker(input, persist = true) {
  bindCombobox(input, () => _nodes, persist ? { bind: _on } : {});
}

// 年龄偏移：纯展示层状态，不写库，换页就归零
function _applyOffset() {
  _container.querySelector('#rel-offset-input').value = _offset;
  _renderList(_query());
  _render();          // 头像的「消逝」状态也要跟着变
}

function _bindOffset() {
  const c = _container;
  const inp = c.querySelector('#rel-offset-input');
  c.querySelectorAll('.rel-offset-step').forEach(btn =>
    _on(btn, 'click', () => { _offset += parseInt(btn.dataset.d); _applyOffset(); }));
  _on(inp, 'input', () => {
    const v = parseInt(inp.value);
    _offset = Number.isFinite(v) ? v : 0;
    _renderList(_query());
    _render();
  });
}

function _bindEditing() {
  const c = _container;

  c.querySelectorAll('[data-close]').forEach(btn =>
    _on(btn, 'click', () => _closeModal(btn.dataset.close)));
  c.querySelectorAll('.tl-modal-overlay').forEach(ov =>
    _on(ov, 'click', e => { if (e.target === ov) ov.classList.remove('show'); }));

  _bindPicker(c.querySelector('#rel-a'));
  _bindPicker(c.querySelector('#rel-b'));

  _on(c.querySelector('#rel-add-rel'), 'click', () => {
    const a = c.querySelector('#rel-a'), b = c.querySelector('#rel-b');
    a.value = ''; a.dataset.id = ''; b.value = ''; b.dataset.id = '';
    c.querySelector('#rel-label').value = '';
    _openModal('rel-modal-rel');
  });

  _on(c.querySelector('#rel-save-rel'), 'click', async () => {
    const a = c.querySelector('#rel-a').dataset.id;
    const b = c.querySelector('#rel-b').dataset.id;
    if (!a || !b) return showToast('两边都要从下拉里选一个人');
    if (a === b)  return showToast('不能和自己建立关系');
    if (!await _saveRelation(a, b, c.querySelector('#rel-label').value.trim())) return;
    _closeModal('rel-modal-rel');
    await _reload();
  });

  _on(c.querySelector('#rel-add-char'), 'click', () => {
    c.querySelector('#rel-new-name').value = '';
    c.querySelector('#rel-new-age').value = '';
    _openModal('rel-modal-char');
  });

  _on(c.querySelector('#rel-save-char'), 'click', async () => {
    const name = c.querySelector('#rel-new-name').value.trim();
    if (!name) return showToast('请输入名字');
    const ageV = c.querySelector('#rel-new-age').value.trim();
    const { error } = await supaClient.from('characters')
      .insert({ name, base_age: ageV === '' ? null : parseInt(ageV) });
    if (error) return dbError('添加人物', error);
    _closeModal('rel-modal-char');
    showToast('已添加');
    await _reload();
  });

  _on(c.querySelector('#rel-edit-save'), 'click', _commitEdit);

  _on(c.querySelector('#rel-edit-add'), 'click', () => {
    if (!_draft) return;
    // 临时 id 只在弹窗里用来定位这一行，提交时走 insert
    _draft.rels.push({
      id: 'new-' + (++_newRelSeq), isNew: true,
      otherId: '', label: '', origOther: null, origLabel: null, deleted: false,
    });
    _renderEditRelations();
  });

  // 列表每次都重渲染，所以用事件委托而不是逐行绑定
  _on(c.querySelector('#rel-list'), 'click', e => {
    const btn = e.target.closest('[data-edit]');
    if (!btn) return;
    e.stopPropagation();
    _openEdit(btn.dataset.edit);
  });
}

// 无向边：数据库强制 a_id < b_id，前端先排序再 upsert
async function _saveRelation(x, y, label) {
  const a = Math.min(Number(x), Number(y));
  const b = Math.max(Number(x), Number(y));
  const { error } = await supaClient.from('character_relations')
    .upsert({ a_id: a, b_id: b, label }, { onConflict: 'a_id,b_id' });
  if (error) { dbError('保存关系', error); return false; }
  return true;
}

// 弹窗里所有改动先攒在这里，点「保存」才一次性入库
let _draft = null;
let _newRelSeq = 0;

function _openEdit(id) {
  const nd = _byId.get(String(id));
  if (!nd) return;
  const raw = _rawAge(nd);
  _draft = {
    id: String(id),
    rels: (State.allRelations || [])
      .filter(r => String(r.a_id) === String(id) || String(r.b_id) === String(id))
      .map(r => {
        const other = String(String(r.a_id) === String(id) ? r.b_id : r.a_id);
        return { id: r.id, otherId: other, label: r.label || '',
                 origOther: other, origLabel: r.label || '', deleted: false };
      }),
  };
  _container.querySelector('#rel-edit-title').textContent = nd.name;
  // 显示的是偏移后的年龄，保存时再减回去，和年龄轴里「输入当前显示年龄」一致
  _container.querySelector('#rel-edit-age').value = raw == null ? '' : raw;
  _container.querySelector('#rel-edit-limit').value = nd.limit == null ? '' : nd.limit;
  _renderEditRelations();
  _openModal('rel-modal-edit');
}

// 和原始值比对，只把真正变过的写回数据库
async function _commitEdit() {
  if (!_draft) return;
  const c = _container, id = _draft.id;
  const nd = _byId.get(id);

  const ageV = c.querySelector('#rel-edit-age').value.trim();
  const limV = c.querySelector('#rel-edit-limit').value.trim();
  const nextAge   = ageV === '' ? null : parseInt(ageV) - _offset;
  const nextLimit = limV === '' ? null : parseInt(limV);

  if (nextAge !== (nd.age == null ? null : nd.age) ||
      nextLimit !== (nd.limit == null ? null : nd.limit)) {
    const { error } = await supaClient.from('characters')
      .update({ base_age: nextAge, age_limit: nextLimit }).eq('id', id);
    if (error) return dbError('保存人物', error);
  }

  for (const r of _draft.rels) {
    if (r.isNew) {
      if (r.deleted || !r.otherId) continue;          // 没选人就当没加
      const a = Math.min(Number(id), Number(r.otherId));
      const b = Math.max(Number(id), Number(r.otherId));
      const { error } = await supaClient.from('character_relations')
        .upsert({ a_id: a, b_id: b, label: r.label }, { onConflict: 'a_id,b_id' });
      if (error) { dbError('添加关系', error); return; }
      continue;
    }
    if (r.deleted) {
      const { error } = await supaClient.from('character_relations').delete().eq('id', r.id);
      if (error) return dbError('删除关系', error);
      continue;
    }
    if (r.otherId === r.origOther && r.label === r.origLabel) continue;
    const a = Math.min(Number(id), Number(r.otherId));
    const b = Math.max(Number(id), Number(r.otherId));
    const { error } = await supaClient.from('character_relations')
      .update({ a_id: a, b_id: b, label: r.label }).eq('id', r.id);
    if (error) {
      // 唯一索引挡下来的通常就是「这两人已经有一条关系了」
      showToast(error.code === '23505' ? '这两人之间已经有关系了' : '保存关系失败');
      return;
    }
  }

  _closeModal('rel-modal-edit');
  _draft = null;
  showToast('已保存');
  await _reload();
}

function _renderEditRelations() {
  const box = _container.querySelector('#rel-edit-list');
  const live = _draft.rels.filter(r => !r.deleted);

  box.innerHTML = live.length ? live.map(r => {
    const other = _byId.get(r.otherId);
    return `<div class="rel-edit-row" data-rid="${r.id}">
      <div class="rel-pick rel-edit-cell">
        <input class="rel-edit-who" value="${escHtml(other ? other.name : (r.otherId ? '#' + r.otherId : ''))}"
               data-id="${r.otherId}" placeholder="输入名字搜索…" autocomplete="off"/>
        <div class="cb-sugg"></div>
      </div>
      <input class="rel-edit-label rel-edit-cell" value="${escHtml(r.label)}"
             placeholder="关系" autocomplete="off"/>
      <button class="rel-edit-del" data-del="${r.id}" title="删除">✕</button>
    </div>`;
  }).join('') : '<div style="font-size:12px;color:var(--muted);padding:4px 0">さみしい……</div>';

  box.querySelectorAll('.rel-edit-row').forEach(row => {
    const rec   = _draft.rels.find(r => String(r.id) === row.dataset.rid);
    const who   = row.querySelector('.rel-edit-who');
    const label = row.querySelector('.rel-edit-label');
    _bindPicker(who, false);

    label.addEventListener('input', () => { rec.label = label.value.trim(); });
    who.addEventListener('pick', e => {
      if (String(e.detail) === _draft.id) {
        showToast('不能和自己建立关系');
        who.value = _byId.get(rec.otherId) ? _byId.get(rec.otherId).name : '';
        who.dataset.id = rec.otherId;
        return;
      }
      rec.otherId = String(e.detail);
    });
  });
  box.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      const rec = _draft.rels.find(r => String(r.id) === btn.dataset.del);
      if (rec) rec.deleted = true;      // 只标记，点保存才真删
      _renderEditRelations();
    });
  });
}
