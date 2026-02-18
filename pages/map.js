// pages/map.js
// 地图页面：可拖拽缩放画布、不规则区域、坐标点、信息弹窗、关联人物

import { supaClient, setSyncStatus, dbError } from '../core/supabase-client.js';
import { isEditor, onAuthChange } from '../core/auth.js';
import { showToast, escHtml, confirmDialog } from '../core/ui.js';

// ── 状态 ──────────────────────────────────────────
let regions   = [];
let mapPoints = [];
let allChars  = [];

let canvas, ctx, wrap;
let panX = 0, panY = 0, zoom = 1;
const MIN_ZOOM = 0.05, MAX_ZOOM = 8;

let editMode   = 'none';
let drawingPts = [];
let hoverId    = null;
let popupData  = null;
let panelOpen  = true;
let modalEditItem = null;

let ptr   = { active:false, sx:0, sy:0, px:0, py:0, moved:false };
let pinch = { active:false, dist0:0, zoom0:0, cx:0, cy:0, px0:0, py0:0 };
let lpTimer = null;
let resizeObs = null, realtimeCh = null;

// ── Mount / Unmount ────────────────────────────────
export async function mount(container) {
  container.innerHTML = buildHTML();
  canvas = container.querySelector('#map-canvas');
  ctx    = canvas.getContext('2d');
  wrap   = container.querySelector('#map-cw');

  resizeObs = new ResizeObserver(() => { resizeCanvas(); draw(); });
  resizeObs.observe(wrap);
  resizeCanvas();

  bindPanel(container);
  bindPointer(container);
  bindEditControls(container);

  onAuthChange(() => { updatePanelUI(container); draw(); });

  await fetchAll();
  updateSidebarList(container);
  subscribeRealtime();
}

export function unmount() {
  resizeObs?.disconnect();
  realtimeCh && supaClient.removeChannel(realtimeCh);
  clearTimeout(lpTimer);
}

// ── HTML ───────────────────────────────────────────
function buildHTML() {
  return `<div class="map-layout">
  <div id="map-cw" class="map-cw">
    <canvas id="map-canvas"></canvas>

    <!-- Floating expand button (shows when panel collapsed) -->
    <button id="map-expand" class="expand-btn-float" title="展开面板" style="display:none">◀</button>

    <div class="map-toolbar">
      <button class="map-tb-btn" id="map-zoom-in"  title="放大">＋</button>
      <button class="map-tb-btn" id="map-zoom-out" title="缩小">－</button>
      <button class="map-tb-btn" id="map-zoom-fit" title="重置视角">⊡</button>
      <div class="map-tb-sep"></div>
      <button class="map-tb-btn active" data-mode="none"   title="选择/平移">↖</button>
      <button class="map-tb-btn"        data-mode="region" title="绘制区域">⬡</button>
      <button class="map-tb-btn"        data-mode="point"  title="添加坐标点">⊕</button>
      <span id="map-mode-hint" class="map-mode-hint" style="display:none"></span>
    </div>
    <div id="map-popup" class="map-popup" style="display:none">
      <div class="map-popup-header">
        <span id="map-popup-title" class="map-popup-title-text"></span>
        <button id="map-popup-close" class="map-popup-close">✕</button>
      </div>
      <div id="map-popup-desc"  class="map-popup-desc" style="display:none"></div>
      <div id="map-popup-chars" class="map-popup-chars" style="display:none"></div>
      <div id="map-popup-actions" class="map-popup-actions" style="display:none">
        <button class="btn bp" id="map-popup-edit"   style="font-size:12px;padding:5px 10px">✏️ 编辑</button>
        <button class="btn br" id="map-popup-delete" style="font-size:12px;padding:5px 10px">🗑 删除</button>
      </div>
    </div>
  </div>

  <div id="map-panel" class="map-panel">
    <div class="map-panel-hdr" id="map-panel-toggle">
      <span>🗺 地图</span><span id="map-panel-chevron">◀</span>
    </div>
    <div class="tl-tabs">
      <button class="tl-tab active" data-tab="list">📋 列表</button>
      <button class="tl-tab"        data-tab="edit">✏️ 编辑</button>
    </div>

    <div id="map-tab-list" class="tl-tab-content map-tab-scroll">
      <div class="tl-section">
        <div class="tl-section-hdr" id="map-reg-hdr"><span>🗾 区域</span><span class="tl-chevron">▾</span></div>
        <div class="tl-section-body" id="map-reg-body"><div id="map-regions-list" class="map-item-list"></div></div>
      </div>
      <div class="tl-section">
        <div class="tl-section-hdr" id="map-pts-hdr"><span>📍 坐标点</span><span class="tl-chevron">▾</span></div>
        <div class="tl-section-body" id="map-pts-body"><div id="map-points-list" class="map-item-list"></div></div>
      </div>
    </div>

    <div id="map-tab-edit" class="tl-tab-content map-tab-scroll" style="display:none">
      <div id="map-edit-locked" style="padding:20px 14px;color:#667;font-size:13px;line-height:1.9">🔒 请先解锁编辑权限</div>
      <div id="map-edit-tools" style="display:none">
        <div style="padding:12px 13px;border-bottom:1px solid var(--border)">
          <div class="ctrl-label">绘制工具</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <button class="btn bn" id="map-start-region" style="font-size:13px;text-align:left">⬡ 绘制不规则区域</button>
            <button class="btn bn" id="map-start-point"  style="font-size:13px;text-align:left">⊕ 添加坐标点</button>
          </div>
        </div>
        <div id="map-drawing-panel" style="display:none;padding:12px 13px;background:rgba(124,131,247,.07);border-bottom:1px solid var(--border)">
          <div class="ctrl-label" style="color:var(--accent)">✏️ 绘制区域中</div>
          <div style="font-size:12px;color:#889;margin-bottom:8px">在画布单击添加顶点，至少3个点后可完成；右键快速完成</div>
          <div id="map-draw-count" style="font-size:12px;color:var(--accent);margin-bottom:8px">已添加 0 个顶点</div>
          <div style="display:flex;gap:6px">
            <button class="btn bp" id="map-draw-finish" disabled style="flex:1;font-size:12px">✓ 完成</button>
            <button class="btn bn" id="map-draw-cancel" style="font-size:12px">取消</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<div id="map-item-modal" class="tl-modal-overlay">
  <div class="tl-modal" style="max-width:480px" onmousedown="event.stopPropagation()">
    <h2 id="map-modal-title">编辑</h2>
    <label>名称</label>
    <input id="map-modal-name" type="text" autocomplete="off"/>
    <label>描述</label>
    <textarea id="map-modal-desc" rows="3" placeholder="介绍文字…" style="margin-bottom:12px"></textarea>
    <div id="map-modal-color-row" style="margin-bottom:12px">
      <label>颜色</label>
      <div style="display:flex;align-items:center;gap:10px;margin-top:4px">
        <input id="map-modal-color" type="color" value="#7c83f7" style="width:44px;height:32px;padding:2px;border-radius:6px;border:1px solid var(--ibr);background:var(--ib);cursor:pointer"/>
        <span id="map-modal-color-val" style="font-size:12px;color:#889">#7c83f7</span>
      </div>
    </div>
    <label>关联人物</label>
    <div id="map-modal-chars" class="map-char-picker"></div>
    <div class="mbtns" style="justify-content:flex-end;margin-top:14px">
      <button class="btn bn" id="map-modal-cancel">取消</button>
      <button class="btn bp" id="map-modal-save">保存</button>
    </div>
  </div>
</div>`;
}

// ── Canvas helpers ─────────────────────────────────
function resizeCanvas() {
  if (!wrap||!canvas) return;
  canvas.width=wrap.clientWidth; canvas.height=wrap.clientHeight;
}
function w2s(wx,wy){return{x:wx*zoom+panX, y:wy*zoom+panY};}
function s2w(sx,sy){return{x:(sx-panX)/zoom, y:(sy-panY)/zoom};}
function cxy(e,t){const r=canvas.getBoundingClientRect(),s=t||e;return{x:s.clientX-r.left,y:s.clientY-r.top};}

// ── Draw ───────────────────────────────────────────
function draw() {
  if (!ctx) return;
  const W=canvas.width, H=canvas.height;
  ctx.clearRect(0,0,W,H);
  drawGrid();
  regions.forEach(r=>drawRegion(r));
  mapPoints.forEach(p=>drawPoint(p));
  if (editMode==='region'&&drawingPts.length>0) drawPreview();
}

function drawGrid() {
  const step=100*zoom; if(step<5) return;
  ctx.save(); ctx.strokeStyle='rgba(124,131,247,.07)'; ctx.lineWidth=1;
  const ox=((panX%step)+step)%step, oy=((panY%step)+step)%step;
  for(let x=ox;x<canvas.width;x+=step){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke();}
  for(let y=oy;y<canvas.height;y+=step){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();}
  ctx.restore();
}

function drawRegion(r) {
  if(!r.points||r.points.length<3) return;
  const pts=r.points.map(p=>w2s(p.x,p.y));
  const hov=hoverId==='r_'+r.id;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y);
  pts.slice(1).forEach(p=>ctx.lineTo(p.x,p.y)); ctx.closePath();
  ctx.fillStyle=(r.color||'#7c83f7')+(hov?'44':'22'); ctx.fill();
  ctx.strokeStyle=r.color||'#7c83f7'; ctx.lineWidth=hov?2.5:1.5; ctx.stroke();
  ctx.restore();
  const cx=pts.reduce((s,p)=>s+p.x,0)/pts.length;
  const cy=pts.reduce((s,p)=>s+p.y,0)/pts.length;
  ctx.save(); ctx.fillStyle=r.color||'#c8caff';
  ctx.font=`bold ${Math.max(10,Math.min(16,13*zoom))}px system-ui`;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.shadowColor='rgba(0,0,0,.85)'; ctx.shadowBlur=7;
  ctx.fillText(r.name||'',cx,cy); ctx.restore();
}

function drawPoint(p) {
  const {x,y}=w2s(p.x,p.y);
  const r=Math.max(5,8*zoom), hov=hoverId==='p_'+p.id;
  ctx.save();
  const g=ctx.createRadialGradient(x,y,0,x,y,r*2.5);
  g.addColorStop(0,'rgba(124,131,247,.35)'); g.addColorStop(1,'rgba(124,131,247,0)');
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r*2.5,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2);
  ctx.fillStyle=hov?'#a0a8ff':'#7c83f7'; ctx.fill();
  ctx.strokeStyle='#fff'; ctx.lineWidth=hov?2.5:1.5; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x,y+r); ctx.lineTo(x,y+r*2.2);
  ctx.strokeStyle=hov?'#a0a8ff':'#7c83f7'; ctx.lineWidth=hov?2.5:1.5; ctx.stroke();
  ctx.restore();
  ctx.save(); ctx.fillStyle='#e8eaed';
  ctx.font=`${Math.max(9,Math.min(13,11*zoom))}px system-ui`;
  ctx.textAlign='center'; ctx.textBaseline='top';
  ctx.shadowColor='rgba(0,0,0,.9)'; ctx.shadowBlur=5;
  ctx.fillText(p.name||'',x,y+r*2.5); ctx.restore();
}

function drawPreview() {
  ctx.save(); ctx.strokeStyle='rgba(124,131,247,.9)'; ctx.lineWidth=1.5; ctx.setLineDash([5,4]);
  ctx.beginPath(); ctx.moveTo(drawingPts[0].x,drawingPts[0].y);
  drawingPts.slice(1).forEach(p=>ctx.lineTo(p.x,p.y)); ctx.stroke(); ctx.setLineDash([]);
  drawingPts.forEach((p,i)=>{
    ctx.beginPath(); ctx.arc(p.x,p.y,5,0,Math.PI*2);
    ctx.fillStyle=i===0?'#27ae60':'#7c83f7'; ctx.fill();
    ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.stroke();
  }); ctx.restore();
}

// ── Hit test ───────────────────────────────────────
function hitTest(sx,sy) {
  for(const p of [...mapPoints].reverse()){
    const{x,y}=w2s(p.x,p.y), r=Math.max(5,8*zoom)+4;
    if(Math.hypot(sx-x,sy-y)<=r) return{type:'point',item:p};
  }
  for(const r of [...regions].reverse()){
    if(!r.points||r.points.length<3) continue;
    if(pointInPoly(sx,sy,r.points.map(p=>w2s(p.x,p.y)))) return{type:'region',item:r};
  }
  return null;
}
function pointInPoly(px,py,pts){
  let inside=false;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++){
    const{x:xi,y:yi}=pts[i],{x:xj,y:yj}=pts[j];
    if((yi>py)!==(yj>py)&&px<(xj-xi)*(py-yi)/(yj-yi)+xi) inside=!inside;
  } return inside;
}

// ── Pointer ────────────────────────────────────────
function bindPointer(container) {
  canvas.addEventListener('mousedown', e=>{
    if(e.button!==0) return;
    const{x,y}=cxy(e);
    if(editMode==='region'){addDrawPt(x,y,container);return;}
    if(editMode==='point'){placePoint(x,y,container);return;}
    ptr.active=true; ptr.moved=false;
    ptr.sx=e.clientX; ptr.sy=e.clientY; ptr.px=panX; ptr.py=panY;
    canvas.style.cursor='grabbing';
  });
  window.addEventListener('mousemove', e=>{
    if(ptr.active){
      const dx=e.clientX-ptr.sx,dy=e.clientY-ptr.sy;
      if(Math.hypot(dx,dy)>3) ptr.moved=true;
      panX=ptr.px+dx; panY=ptr.py+dy; draw(); return;
    }
    const{x,y}=cxy(e), hit=hitTest(x,y);
    const nid=hit?(hit.type==='region'?'r_':'p_')+hit.item.id:null;
    if(nid!==hoverId){hoverId=nid;draw();}
    canvas.style.cursor=editMode!=='none'?(editMode==='region'?'crosshair':'cell'):(hit?'pointer':'grab');
  });
  window.addEventListener('mouseup', e=>{
    if(!ptr.active) return;
    ptr.active=false; canvas.style.cursor=editMode!=='none'?'crosshair':'grab';
    if(!ptr.moved){
      const{x,y}=cxy(e), hit=hitTest(x,y);
      if(hit) showPopup(hit.type,hit.item,e.clientX,e.clientY,container);
      else closePopup(container);
    }
  });
  canvas.addEventListener('wheel', e=>{
    e.preventDefault();
    const{x,y}=cxy(e), f=e.deltaY<0?1.12:1/1.12;
    const nz=Math.min(MAX_ZOOM,Math.max(MIN_ZOOM,zoom*f));
    panX=x-(x-panX)*(nz/zoom); panY=y-(y-panY)*(nz/zoom); zoom=nz; draw();
  },{passive:false});
  canvas.addEventListener('touchstart', e=>{
    if(e.touches.length===2){
      pinch.active=true;
      const t0=e.touches[0],t1=e.touches[1];
      pinch.dist0=Math.hypot(t0.clientX-t1.clientX,t0.clientY-t1.clientY);
      pinch.zoom0=zoom;
      const r=canvas.getBoundingClientRect();
      pinch.cx=(t0.clientX+t1.clientX)/2-r.left;
      pinch.cy=(t0.clientY+t1.clientY)/2-r.top;
      pinch.px0=panX; pinch.py0=panY; ptr.active=false; return;
    }
    pinch.active=false;
    if(e.touches.length===1){
      const t=e.touches[0],{x,y}=cxy(e,t);
      if(editMode==='region'){addDrawPt(x,y,container);return;}
      if(editMode==='point'){placePoint(x,y,container);return;}
      ptr.active=true; ptr.moved=false;
      ptr.sx=t.clientX; ptr.sy=t.clientY; ptr.px=panX; ptr.py=panY;
      lpTimer=setTimeout(()=>{
        const hit=hitTest(x,y);
        if(hit) showPopup(hit.type,hit.item,t.clientX,t.clientY,container);
        ptr.active=false;
      },600);
    }
  },{passive:true});
  canvas.addEventListener('touchmove', e=>{
    clearTimeout(lpTimer);
    if(pinch.active&&e.touches.length===2){
      const t0=e.touches[0],t1=e.touches[1];
      const d=Math.hypot(t0.clientX-t1.clientX,t0.clientY-t1.clientY);
      const nz=Math.min(MAX_ZOOM,Math.max(MIN_ZOOM,pinch.zoom0*(d/pinch.dist0)));
      panX=pinch.cx-(pinch.cx-pinch.px0)*(nz/pinch.zoom0);
      panY=pinch.cy-(pinch.cy-pinch.py0)*(nz/pinch.zoom0);
      zoom=nz; draw(); return;
    }
    if(ptr.active&&e.touches.length===1){
      const t=e.touches[0],dx=t.clientX-ptr.sx,dy=t.clientY-ptr.sy;
      if(Math.hypot(dx,dy)>3) ptr.moved=true;
      panX=ptr.px+dx; panY=ptr.py+dy; draw();
    }
  },{passive:true});
  canvas.addEventListener('touchend', e=>{
    clearTimeout(lpTimer); pinch.active=false;
    if(ptr.active&&!ptr.moved&&e.changedTouches.length===1){
      const t=e.changedTouches[0],{x,y}=cxy(e,t), hit=hitTest(x,y);
      if(hit) showPopup(hit.type,hit.item,t.clientX,t.clientY,container);
      else closePopup(container);
    }
    ptr.active=false;
  },{passive:true});
}

// ── Panel bindings ─────────────────────────────────
function bindPanel(container) {
  function toggleMapPanel() {
    panelOpen=!panelOpen;
    const panel = container.querySelector('#map-panel');
    const chevron = container.querySelector('#map-panel-chevron');
    const expandBtn = container.querySelector('#map-expand');
    panel.classList.toggle('collapsed',!panelOpen);
    chevron.textContent = panelOpen?'◀':'▶';
    if (expandBtn) expandBtn.style.display = panelOpen ? 'none' : 'flex';
  }
  container.querySelector('#map-panel-toggle').addEventListener('click', toggleMapPanel);
  container.querySelector('#map-expand')?.addEventListener('click', toggleMapPanel);
  container.querySelectorAll('.tl-tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
      container.querySelectorAll('.tl-tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      container.querySelector('#map-tab-list').style.display=tab.dataset.tab==='list'?'':'none';
      container.querySelector('#map-tab-edit').style.display=tab.dataset.tab==='edit'?'':'none';
    });
  });
  [['#map-reg-hdr','#map-reg-body'],['#map-pts-hdr','#map-pts-body']].forEach(([h,b])=>{
    container.querySelector(h)?.addEventListener('click',()=>{
      const body=container.querySelector(b);
      const chev=container.querySelector(h+' .tl-chevron');
      const col=body.style.display==='none';
      body.style.display=col?'':'none'; chev.textContent=col?'▾':'▸';
    });
  });
}

// ── Edit controls ──────────────────────────────────
function bindEditControls(container) {
  container.querySelector('#map-zoom-in').addEventListener('click',()=>{
    const cx=canvas.width/2,cy=canvas.height/2,nz=Math.min(MAX_ZOOM,zoom*1.3);
    panX=cx-(cx-panX)*(nz/zoom); panY=cy-(cy-panY)*(nz/zoom); zoom=nz; draw();
  });
  container.querySelector('#map-zoom-out').addEventListener('click',()=>{
    const cx=canvas.width/2,cy=canvas.height/2,nz=Math.max(MIN_ZOOM,zoom/1.3);
    panX=cx-(cx-panX)*(nz/zoom); panY=cy-(cy-panY)*(nz/zoom); zoom=nz; draw();
  });
  container.querySelector('#map-zoom-fit').addEventListener('click',()=>{
    panX=canvas.width/2; panY=canvas.height/2; zoom=1; draw(); showToast('视角已重置');
  });
  container.querySelectorAll('[data-mode]').forEach(btn=>{
    btn.addEventListener('click',()=>setMode(btn.dataset.mode,container));
  });
  container.querySelector('#map-start-region').addEventListener('click',()=>{
    if(!isEditor()){showToast('🔒 请先解锁编辑');return;}
    setMode('region',container);
    flashHint(container,'在画布上单击添加顶点，右键快速完成');
  });
  container.querySelector('#map-start-point').addEventListener('click',()=>{
    if(!isEditor()){showToast('🔒 请先解锁编辑');return;}
    setMode('point',container);
    flashHint(container,'单击画布放置坐标点');
  });
  container.querySelector('#map-draw-finish').addEventListener('click',()=>finishRegion(container));
  container.querySelector('#map-draw-cancel').addEventListener('click',()=>cancelDraw(container));
  canvas.addEventListener('contextmenu',e=>{
    e.preventDefault();
    if(editMode==='region'&&drawingPts.length>=3) finishRegion(container);
  });
  container.querySelector('#map-popup-close').addEventListener('click',()=>closePopup(container));
  container.querySelector('#map-popup-edit').addEventListener('click',()=>{
    if(popupData) openItemModal(popupData.type,popupData.item,container);
  });
  container.querySelector('#map-popup-delete').addEventListener('click',()=>{
    if(popupData) deleteItem(popupData.type,popupData.item,container);
  });
  container.querySelector('#map-modal-cancel').addEventListener('click',()=>closeItemModal(container));
  container.querySelector('#map-modal-save').addEventListener('click',()=>saveItem(container));
  container.querySelector('#map-modal-color').addEventListener('input',e=>{
    container.querySelector('#map-modal-color-val').textContent=e.target.value;
  });
  container.querySelector('#map-item-modal').addEventListener('mousedown',e=>{
    if(e.target===container.querySelector('#map-item-modal')) closeItemModal(container);
  });
}

function setMode(mode,container){
  editMode=mode;
  container.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  canvas.style.cursor=mode==='none'?'grab':mode==='region'?'crosshair':'cell';
  if(mode!=='region'){drawingPts=[];container.querySelector('#map-drawing-panel').style.display='none';}
  container.querySelector('#map-mode-hint').style.display='none';
  draw();
}

function flashHint(container,text){
  const h=container.querySelector('#map-mode-hint');
  h.textContent=text; h.style.display='';
  setTimeout(()=>h.style.display='none',3000);
}

// ── Region drawing ─────────────────────────────────
function addDrawPt(sx,sy,container){
  if(!isEditor()){showToast('🔒 请先解锁编辑');return;}
  drawingPts.push({x:sx,y:sy});
  const cnt=container.querySelector('#map-draw-count');
  if(cnt) cnt.textContent=`已添加 ${drawingPts.length} 个顶点`;
  const finBtn=container.querySelector('#map-draw-finish');
  if(finBtn) finBtn.disabled=drawingPts.length<3;
  container.querySelector('#map-drawing-panel').style.display='';
  draw();
}
function finishRegion(container){
  if(drawingPts.length<3){showToast('至少需要3个顶点');return;}
  const wPts=drawingPts.map(p=>s2w(p.x,p.y));
  cancelDraw(container);
  openItemModal('region',{name:'',description:'',color:'#7c83f7',points:wPts,characters:[]},container);
}
function cancelDraw(container){
  drawingPts=[];
  setMode('none',container);
  container.querySelector('#map-drawing-panel').style.display='none';
}
function placePoint(sx,sy,container){
  if(!isEditor()){showToast('🔒 请先解锁编辑');return;}
  const w=s2w(sx,sy);
  setMode('none',container);
  openItemModal('point',{name:'',description:'',x:w.x,y:w.y,characters:[]},container);
}

// ── Popup ──────────────────────────────────────────
function showPopup(type,item,clientX,clientY,container){
  popupData={type,item};
  const popup=container.querySelector('#map-popup');
  container.querySelector('#map-popup-title').textContent=item.name||'（未命名）';
  const desc=container.querySelector('#map-popup-desc');
  if(item.description){desc.textContent=item.description;desc.style.display='';}
  else desc.style.display='none';
  const charEl=container.querySelector('#map-popup-chars');
  const chars=(item.characters||[]).map(id=>allChars.find(c=>c.id===id)).filter(Boolean);
  if(chars.length){
    charEl.innerHTML='<div class="popup-chars-label">关联人物</div>'+
      chars.map(c=>`<div class="popup-char-item">
        <div class="popup-char-av" style="background:${c.color}">
          ${c.avatar?`<img src="${escHtml(c.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:escHtml(c.name.charAt(0))}
        </div>
        <span>${escHtml(c.name)}</span>
      </div>`).join('');
    charEl.style.display='';
  } else { charEl.innerHTML=''; charEl.style.display='none'; }
  container.querySelector('#map-popup-actions').style.display=isEditor()?'':'none';
  popup.style.display='';
  const rect=canvas.getBoundingClientRect();
  let px=clientX-rect.left+14, py=clientY-rect.top+14;
  const pw=popup.offsetWidth||240, ph=popup.offsetHeight||120;
  if(px+pw>canvas.width-8)  px=clientX-rect.left-pw-14;
  if(py+ph>canvas.height-8) py=clientY-rect.top-ph-14;
  popup.style.left=Math.max(4,px)+'px';
  popup.style.top=Math.max(4,py)+'px';
}
function closePopup(container){
  popupData=null;
  container.querySelector('#map-popup').style.display='none';
}

// ── Item modal ─────────────────────────────────────
function openItemModal(type,item,container){
  if(!isEditor()){showToast('🔒 请先解锁编辑');return;}
  closePopup(container);
  modalEditItem={type,item};
  container.querySelector('#map-modal-title').textContent=
    type==='region'?(item.id?'编辑区域':'新建区域'):(item.id?'编辑坐标点':'新建坐标点');
  container.querySelector('#map-modal-name').value=item.name||'';
  container.querySelector('#map-modal-desc').value=item.description||'';
  const colorRow=container.querySelector('#map-modal-color-row');
  if(type==='region'){
    colorRow.style.display='';
    container.querySelector('#map-modal-color').value=item.color||'#7c83f7';
    container.querySelector('#map-modal-color-val').textContent=item.color||'#7c83f7';
  } else colorRow.style.display='none';
  buildCharPicker(container,item.characters||[]);
  container.querySelector('#map-item-modal').classList.add('show');
  setTimeout(()=>container.querySelector('#map-modal-name').focus(),60);
}
function closeItemModal(container){
  container.querySelector('#map-item-modal').classList.remove('show');
  modalEditItem=null;
}
function buildCharPicker(container,selIds){
  const el=container.querySelector('#map-modal-chars');
  if(!allChars.length){
    el.innerHTML='<div style="font-size:12px;color:#556;padding:4px 0">暂无人物（可在时间轴中添加）</div>';
    return;
  }
  el.innerHTML=allChars.map(c=>{
    const sel=selIds.includes(c.id);
    return `<label class="char-pick-item${sel?' selected':''}">
      <input type="checkbox" value="${c.id}" ${sel?'checked':''} style="display:none"/>
      <div class="char-pick-av" style="background:${c.color}">
        ${c.avatar?`<img src="${escHtml(c.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:escHtml(c.name.charAt(0))}
      </div>
      <span class="char-pick-name">${escHtml(c.name)}</span>
    </label>`;
  }).join('');
  el.querySelectorAll('label').forEach(lbl=>{
    lbl.addEventListener('click',()=>lbl.classList.toggle('selected'));
  });
}
async function saveItem(container){
  if(!modalEditItem||!isEditor()) return;
  const{type,item}=modalEditItem;
  const name=container.querySelector('#map-modal-name').value.trim();
  if(!name){showToast('名称不能为空');return;}
  const desc=container.querySelector('#map-modal-desc').value.trim();
  const color=type==='region'?container.querySelector('#map-modal-color').value:null;
  const selIds=[...container.querySelectorAll('#map-modal-chars input:checked')].map(i=>parseInt(i.value));
  const saving={...item,name,description:desc,characters:selIds};
  if(color) saving.color=color;
  closeItemModal(container);
  if(type==='region'){
    if(item.id){
      const idx=regions.findIndex(r=>r.id===item.id);
      if(idx>=0) regions[idx]={...regions[idx],...saving};
      draw(); updateSidebarList(container);
      await updateRegion(saving);
    } else {
      const tmp={...saving,id:'tmp_'+Date.now()};
      regions.push(tmp); draw();
      await insertRegion(tmp,container);
    }
  } else {
    if(item.id){
      const idx=mapPoints.findIndex(p=>p.id===item.id);
      if(idx>=0) mapPoints[idx]={...mapPoints[idx],...saving};
      draw(); updateSidebarList(container);
      await updateMapPoint(saving);
    } else {
      const tmp={...saving,id:'tmp_'+Date.now()};
      mapPoints.push(tmp); draw();
      await insertMapPoint(tmp,container);
    }
  }
}
async function deleteItem(type,item,container){
  if(!isEditor()) return;
  const label=type==='region'?'区域':'坐标点';
  if(!confirmDialog(`确定要删除${label}「${item.name||'未命名'}」？`)) return;
  closePopup(container);
  if(type==='region'){
    regions=regions.filter(r=>r.id!==item.id); draw();
    setSyncStatus('syncing');
    const{error}=await supaClient.from('map_regions').delete().eq('id',item.id);
    if(error) dbError('删除区域',error); else setSyncStatus('ok');
  } else {
    mapPoints=mapPoints.filter(p=>p.id!==item.id); draw();
    setSyncStatus('syncing');
    const{error}=await supaClient.from('map_points').delete().eq('id',item.id);
    if(error) dbError('删除坐标点',error); else setSyncStatus('ok');
  }
  updateSidebarList(container);
  showToast(`已删除${label}`);
}

// ── Sidebar list ───────────────────────────────────
function updateSidebarList(container){
  const rl=container.querySelector('#map-regions-list');
  const pl=container.querySelector('#map-points-list');
  if(!rl||!pl) return;
  rl.innerHTML=regions.length
    ?regions.map(r=>`<div class="map-list-item" data-id="r_${r.id}">
        <span class="map-list-dot" style="background:${r.color||'#7c83f7'}"></span>
        <span class="map-list-name">${escHtml(r.name||'未命名')}</span>
        <span class="map-list-count">${(r.characters||[]).length}人</span>
      </div>`).join('')
    :'<div class="map-empty">暂无区域</div>';
  pl.innerHTML=mapPoints.length
    ?mapPoints.map(p=>`<div class="map-list-item" data-id="p_${p.id}">
        <span class="map-list-dot"></span>
        <span class="map-list-name">${escHtml(p.name||'未命名')}</span>
        <span class="map-list-count">${(p.characters||[]).length}人</span>
      </div>`).join('')
    :'<div class="map-empty">暂无坐标点</div>';
  container.querySelectorAll('.map-list-item').forEach(el=>{
    el.addEventListener('click',()=>{
      const[t,rawId]=el.dataset.id.split('_');
      const id=isNaN(rawId)?rawId:parseInt(rawId);
      const item=t==='r'?regions.find(r=>r.id===id):mapPoints.find(p=>p.id===id);
      if(!item) return;
      if(t==='r'&&item.points?.length){
        const mx=item.points.reduce((s,p)=>s+p.x,0)/item.points.length;
        const my=item.points.reduce((s,p)=>s+p.y,0)/item.points.length;
        const{x:sx,y:sy}=w2s(mx,my);
        panX+=canvas.width/2-sx; panY+=canvas.height/2-sy; draw();
      } else if(t==='p'){
        const{x:sx,y:sy}=w2s(item.x,item.y);
        panX+=canvas.width/2-sx; panY+=canvas.height/2-sy; draw();
      }
      const r=canvas.getBoundingClientRect();
      showPopup(t==='r'?'region':'point',item,r.left+canvas.width/2,r.top+canvas.height/2,container);
    });
  });
}

// ── Panel auth update ──────────────────────────────
function updatePanelUI(container){
  const ed=isEditor();
  const locked=container.querySelector('#map-edit-locked');
  const tools =container.querySelector('#map-edit-tools');
  if(locked) locked.style.display=ed?'none':'';
  if(tools)  tools.style.display=ed?'':'none';
  const act=container.querySelector('#map-popup-actions');
  if(act) act.style.display=ed?'':'none';
  updateSidebarList(container);
}

// ── Supabase ───────────────────────────────────────
function parseJ(s,fb){try{return JSON.parse(s??'null')??fb;}catch{return fb;}}

async function fetchAll(){
  setSyncStatus('syncing');
  try{
    const[rRes,pRes,cRes]=await Promise.all([
      supaClient.from('map_regions').select('*').order('id'),
      supaClient.from('map_points').select('*').order('id'),
      supaClient.from('characters').select('id,name,color,avatar_url').order('id'),
    ]);
    if(rRes.error) throw rRes.error;
    if(pRes.error) throw pRes.error;
    if(cRes.error) throw cRes.error;
    allChars=(cRes.data||[]).map(c=>({id:c.id,name:c.name,color:c.color||'#7c83f7',avatar:c.avatar_url||undefined}));
    regions=(rRes.data||[]).map(r=>({
      id:r.id,name:r.name,description:r.description||'',color:r.color||'#7c83f7',
      points:parseJ(r.points_json,[]),characters:parseJ(r.characters_json,[]),
    }));
    mapPoints=(pRes.data||[]).map(p=>({
      id:p.id,name:p.name,description:p.description||'',x:p.x,y:p.y,
      characters:parseJ(p.characters_json,[]),
    }));
    draw(); setSyncStatus('ok');
  }catch(e){dbError('加载地图数据',e);}
}
async function insertRegion(r,container){
  setSyncStatus('syncing');
  try{
    const{data,error}=await supaClient.from('map_regions').insert({
      name:r.name,description:r.description,color:r.color,
      points_json:JSON.stringify(r.points),characters_json:JSON.stringify(r.characters),
    }).select().single();
    if(error) throw error;
    const idx=regions.findIndex(x=>x.id===r.id);
    if(idx>=0) regions[idx].id=data.id;
    draw(); updateSidebarList(container); setSyncStatus('ok'); showToast('区域已保存');
  }catch(e){dbError('保存区域',e);}
}
async function updateRegion(r){
  setSyncStatus('syncing');
  try{
    const{error}=await supaClient.from('map_regions').update({
      name:r.name,description:r.description,color:r.color,
      points_json:JSON.stringify(r.points),characters_json:JSON.stringify(r.characters),
    }).eq('id',r.id);
    if(error) throw error; setSyncStatus('ok'); showToast('区域已更新');
  }catch(e){dbError('更新区域',e);}
}
async function insertMapPoint(p,container){
  setSyncStatus('syncing');
  try{
    const{data,error}=await supaClient.from('map_points').insert({
      name:p.name,description:p.description,x:p.x,y:p.y,
      characters_json:JSON.stringify(p.characters),
    }).select().single();
    if(error) throw error;
    const idx=mapPoints.findIndex(x=>x.id===p.id);
    if(idx>=0) mapPoints[idx].id=data.id;
    draw(); updateSidebarList(container); setSyncStatus('ok'); showToast('坐标点已保存');
  }catch(e){dbError('保存坐标点',e);}
}
async function updateMapPoint(p){
  setSyncStatus('syncing');
  try{
    const{error}=await supaClient.from('map_points').update({
      name:p.name,description:p.description,x:p.x,y:p.y,
      characters_json:JSON.stringify(p.characters),
    }).eq('id',p.id);
    if(error) throw error; setSyncStatus('ok'); showToast('坐标点已更新');
  }catch(e){dbError('更新坐标点',e);}
}
function subscribeRealtime(){
  realtimeCh=supaClient.channel('map-data')
    .on('postgres_changes',{event:'*',schema:'public',table:'map_regions'},()=>fetchAll())
    .on('postgres_changes',{event:'*',schema:'public',table:'map_points'},()=>fetchAll())
    .on('postgres_changes',{event:'*',schema:'public',table:'characters'},()=>fetchAll())
    .subscribe();
}
