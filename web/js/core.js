/* =====================================================================
 * core.js —— 公共工具：DOM、绘图、颜色、使用统计、AI 接口、实验页面骨架
 * 所有 js 文件按顺序加载，顶层声明的函数和常量可以互相使用。
 * ===================================================================== */

const APP_VERSION = '1.0.2';
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rnd = (a,b) => a + Math.random()*(b-a);
const fmt = v => { if (!isFinite(v)) return '—'; if (Number.isInteger(v)) return String(v); const a=Math.abs(v); return a>=100?v.toFixed(0):a>=10?v.toFixed(1):a>=1?v.toFixed(2):v.toFixed(3); };

/* 画布按设备像素比设置尺寸，返回 2D 上下文 */
function setup(c, cssH){
  const dpr=window.devicePixelRatio||1, W=c.clientWidth;
  c.style.height=cssH+'px'; c.width=Math.round(W*dpr); c.height=Math.round(cssH*dpr);
  const ctx=c.getContext('2d'); return {ctx,dpr,W,H:cssH};
}

/* 装置示意图：按高 230 的坐标系绘制，再缩放、居中到容器的实际高度 */
function benchSetup(c){
  const H=Math.max(140, c.parentElement.clientHeight), o=setup(c,H);
  o.ctx.fillStyle='#0f1012'; o.ctx.fillRect(0,0,c.width,c.height);
  const k=Math.min(1.3, H/230), dy=(H-230*k)/2;
  o.ctx.setTransform(o.dpr*k,0,0,o.dpr*k,0,o.dpr*dy);
  return {ctx:o.ctx, W:o.W/k, H:230};
}

/* 目镜 / 观察屏的边长：窗口矮时适当缩小 */
const eyeSize = c => Math.min(c.parentElement.clientWidth, 340, Math.max(240, window.innerHeight-440));

/* 波长 (nm) → RGB（0~1） */
function wl2rgb(w){
  let r=0,g=0,b=0;
  if (w<440){r=-(w-440)/60;b=1} else if (w<490){g=(w-440)/50;b=1} else if (w<510){g=1;b=-(w-510)/20}
  else if (w<580){r=(w-510)/70;g=1} else if (w<645){r=1;g=-(w-645)/65} else {r=1}
  let f=1; if (w<420) f=0.35+0.65*(w-380)/40; else if (w>700) f=0.35+0.65*(780-w)/80;
  return [r,g,b].map(v=>Math.pow(Math.max(v,0)*f,0.8));
}
const cssColor = (rgb,mix=0) => `rgb(${rgb.map(v=>Math.round((v*(1-mix)+mix)*255)).join(',')})`;

const loadingHTML = t => `<div class="loading"><span class="dot"></span><span class="dot"></span><span class="dot"></span>${esc(t)}</div>`;
const paras = t => String(t||'').replace(/\*\*/g,'').replace(/^#+\s*/gm,'').split(/\n+/).filter(s=>s.trim()).map(s=>`<p style="margin:0 0 8px">${esc(s)}</p>`).join('');

/* ---------------- 使用统计（页面底部 + 后端日志） ---------------- */
const stats = {ask:0, adjust:0, quiz:0, right:0, records:0, review:0};
function renderStats(){
  const rate = stats.quiz ? Math.round(stats.right/stats.quiz*100)+'%' : '—';
  $('#stats').innerHTML = `<span>本次使用记录</span><span>提问 <b>${stats.ask}</b> 次</span><span>手动调参 <b>${stats.adjust}</b> 次</span><span>答题 <b>${stats.quiz}</b> 道</span><span>正确率 <b>${rate}</b></span><span>实验记录 <b>${stats.records}</b> 条</span><span>AI 批改 <b>${stats.review}</b> 次</span><span style="margin-left:auto">${AI.backend?'使用数据已保存在本机，可在“设置”中查看':''}</span>`;
}
/* 把一次操作写进服务器日志（只有连上本地后端时才会发送） */
function logEvent(type, data={}){
  if (!AI.backend) return;
  fetch('api/log',{method:'POST',headers:apiHeaders(),body:JSON.stringify({type,data})}).catch(()=>{});
}

/* ---------------- AI 接口 ----------------
 * 优先级：本地后端 server.py（DeepSeek）→ Claude 在线预览 → 离线规则
 * 页面里所有 AI 调用都走 aiText / aiJSON，换模型只需要改 server.py。 */
function apiHeaders(){ return {'Content-Type':'application/json', 'X-Session-Token':AI.token||''}; }
const AI = {mode:'detecting', model:'', sample:null, backend:false};
AI.label = () => AI.mode==='deepseek' ? `DeepSeek（${AI.model}）` : AI.mode==='claude' ? 'Claude（预览）' : '内置规则';
AI.online = () => AI.mode==='deepseek' || AI.mode==='claude';
function setBadge(){
  const b=$('#badge'); b.className='badge '+(AI.online()?'on':AI.mode==='detecting'?'':'off');
  b.querySelector('span').textContent = AI.mode==='deepseek' ? 'AI：DeepSeek' : AI.mode==='claude' ? 'AI 已连接（预览）'
    : AI.mode==='detecting' ? '正在连接 AI…' : AI.backend ? '未设置 API Key' : '离线模式';
  b.title = AI.mode==='offline' ? (AI.backend ? '在“设置”里填写 DeepSeek API Key 后即可使用 AI 讲解和批改' : '没有连接到 AI，讲解和批改使用内置规则') : '';
  renderStats();
}
/* 检测可用的 AI；保存新的 Key 之后会再调用一次 */
function aiDetect(){
  AI.ready = (async () => {
    AI.mode='detecting'; setBadge();
    try {
      const r = await fetch('api/health', {cache:'no-store'});
      if (r.ok) { const j = await r.json(); AI.backend = !!(j && j.backend); AI.token=j.token||'';
        if (j && j.ok) { AI.mode='deepseek'; AI.model=j.model||'deepseek-chat'; setBadge(); return; } }
    } catch(e) {}
    if (!AI.backend) try {
      if (window.claude && typeof window.claude.use==='function') { AI.sample = await window.claude.use('sample'); if (AI.sample) { AI.mode='claude'; setBadge(); return; } }
    } catch(e) {}
    AI.mode='offline'; setBadge();
  })();
  return AI.ready;
}
aiDetect();

// Store experiments on disk through the backend: desktop ports change between launches.
const LabStore = {
  data:{}, queue:Promise.resolve(), failed:false,
  ready:AI.ready.then(async()=>{
    if (!AI.backend) return;
    try { const r=await fetch('api/labs'); if(!r.ok) throw Error('读取失败'); LabStore.data=await r.json(); }
    catch(e){ LabStore.failed=true; alert('实验存档读取失败。请重新打开软件，以免覆盖原记录。'); }
  }),
  restore(p,s){
    const saved=this.data[p];
    if(saved && Array.isArray(saved.rows) && saved.rows.length<=500){
      const keys=Object.keys(s);
      if(keys.every(k=>k in saved && (typeof s[k]!=='number' || Number.isFinite(saved[k])))) {
        for(const k of keys) s[k]=saved[k];
        s.review=typeof saved.review==='string'?saved.review:'';
        return saved;
      }
    }
  },
  save(p,s){
    if(!AI.backend || this.failed) return;
    const state=JSON.parse(JSON.stringify(s)); this.data[p]=state;
    this.queue=this.queue.then(async()=>{
      const r=await fetch('api/labs',{method:'POST',headers:apiHeaders(),body:JSON.stringify({lab:p,state}),keepalive:true});
      if(!r.ok) throw Error('保存失败');
      $('#'+p+'-save-status').textContent='实验已保存到本机';
    }).catch(()=>{ $('#'+p+'-save-status').textContent='保存失败，请保持软件打开并再次记录或批改以重试'; });
  }
};

async function aiText(prompt, {json=false}={}){
  await AI.ready;
  if (AI.mode==='deepseek'){
    const r = await fetch('api/chat', {method:'POST', headers:apiHeaders(), body:JSON.stringify({prompt, json})});
    const j = await r.json().catch(()=>({}));
    if (!r.ok || !j.text) { const e=new Error(j.error||('HTTP '+r.status)); e.code=j.code||'http'; throw e; }
    return j.text;
  }
  if (AI.mode==='claude'){ const r = await AI.sample(prompt, {modelTier:'default'}); return r.text; }
  const e=new Error('offline'); e.code='offline'; throw e;
}
function parseJSON(t){ const m=String(t).match(/\{[\s\S]*\}/); if(!m) throw new Error('AI 返回的不是 JSON'); return JSON.parse(m[0]); }
async function aiJSON(prompt){ return parseJSON(await aiText(prompt, {json:true})); }
/* AI 出错时给用户看的提示，同时处理“未授权”等情况 */
function aiErrorNote(e){
  if (e && e.code==='not_granted'){ AI.mode='offline'; AI.sample=null; setBadge(); return 'AI 未获授权，已切换到离线模式，下面的内容来自内置规则。'; }
  if (e && e.code==='rate_limited') return 'AI 请求太频繁，这次先用内置规则回答，稍后再试。';
  return `AI 暂时没有响应（${(e&&e.message)||'未知错误'}），这次先用内置规则回答。`;
}

/* ---------------- 虚拟实验通用部件 ---------------- */
/* 实验页面骨架：左边是步骤 / 数据 / 批改，右边是仪器 */
function labShell(p, {title, principle, right}){
  return `<section>
    <div class="card">
      <h2><span class="n">实验</span>${title}</h2>
      <ol class="steps" id="${p}-steps"></ol>
      <details class="principle"><summary>实验原理</summary>${principle}</details>
    </div>
    <div class="card">
      <h2><span class="n">记录</span>数据记录</h2>
      <div class="row" style="margin-top:0;flex-wrap:wrap">
        <button class="primary" id="${p}-rec">记录读数</button>
        <button class="ghost" id="${p}-undo">撤销</button>
        <button class="ghost" id="${p}-clr">清空</button>
      </div>
      <div id="${p}-save-status" class="hint" role="status"></div>
      <div id="${p}-table"></div>
      <div id="${p}-result"></div>
    </div>
    <div class="card">
      <h2><span class="n">批改</span>AI 助教检查数据</h2>
      <button class="primary" id="${p}-check">检查我的数据</button>
      <div id="${p}-review" style="margin-top:10px"></div>
    </div>
  </section>
  <section><div class="card scope">${right}</div></section>`;
}
/* 转动控件：按住按钮连续转动 + 速度选择 + 辅助开关 */
function turnControls(p, speeds, {assist='辅助计数', left='◀ 反转', rightLabel='正转 ▶'}={}){
  return `<div class="row" style="margin-top:0;flex-wrap:wrap">
    <button class="hold" data-dir="-1">${left}</button>
    <button class="hold" data-dir="1">${rightLabel}</button>
    <select id="${p}-speed">${speeds.map(([v,t],i)=>`<option value="${v}"${i===1?' selected':''}>${t}</option>`).join('')}</select>
    ${assist?`<label style="display:flex;align-items:center;gap:5px"><input type="checkbox" id="${p}-assist" checked>${assist}</label>`:''}
  </div>`;
}
function renderSteps(p, list){
  const now=list.findIndex(x=>!x[0]);
  $('#'+p+'-steps').innerHTML=list.map(([ok,t],i)=>`<li class="${ok?'done':i===now?'now':''}"><span class="s">${ok?'✓':i+1}</span><span>${t}</span></li>`).join('');
}
/* 装置区：“三维模型 / 示意图”切换。build(viewer, getState) 返回 update() */
function benchArea(P, build, getState, {cap3d='三维模型'}={}){
  const canvas=$('#'+P+'-bench'), wrap=canvas.parentElement, cap=wrap.querySelector('.caption'), cap2d=cap.textContent;
  wrap.classList.add('bench');
  wrap.insertAdjacentHTML('beforeend', `<div class="v3d" id="${P}-3d"></div>
    <div class="viewseg"><button data-v="3d">三维模型</button><button data-v="2d">示意图</button></div>
    <div class="v3d-tools"><button data-a="auto">自动旋转</button><button data-a="labels">标注</button><button data-a="reset">复位视角</button><button data-a="full">放大</button></div>
    <div class="v3d-hint">拖动旋转，滚轮缩放，右键拖动平移，双击复位</div>`);
  const box3d=$('#'+P+'-3d'), tools=wrap.querySelector('.v3d-tools'), hint=wrap.querySelector('.v3d-hint');
  let mode='3d', viewer=null, update=null, failed=false, onChange=()=>{};
  function sync(){
    const is3=mode==='3d'&&!failed, full=wrap.classList.contains('full');
    canvas.hidden=is3; box3d.hidden=!is3; tools.hidden=!is3; hint.hidden=!is3;
    wrap.querySelectorAll('.viewseg button').forEach(b=>b.classList.toggle('on', b.dataset.v===(is3?'3d':'2d')));
    cap.textContent = failed ? cap2d+'（这台电脑不支持三维显示）' : is3 ? cap3d : cap2d;
    if (viewer){ tools.querySelector('[data-a=auto]').classList.toggle('on',viewer.auto); tools.querySelector('[data-a=labels]').classList.toggle('on',viewer.showLabels); }
    tools.querySelector('[data-a=full]').textContent = full ? '还原' : '放大';
  }
  function ensure(){
    if (viewer||failed) return;
    try { viewer=new M3.Viewer(box3d, build.camera); update=build(viewer, getState); viewer.onAuto=sync; }
    catch(e){ failed=true; console.warn('三维模型不可用：', e); }
    sync();
  }
  wrap.querySelector('.viewseg').addEventListener('click',e=>{ const b=e.target.closest('button'); if (!b) return;
    mode=b.dataset.v; if (mode==='2d') wrap.classList.remove('full'); sync(); onChange(); });
  tools.addEventListener('click',e=>{ const b=e.target.closest('button'); if (!b||!viewer) return; const a=b.dataset.a;
    if (a==='auto') viewer.auto=!viewer.auto;
    if (a==='labels') viewer.showLabels=!viewer.showLabels;
    if (a==='reset') viewer.reset();
    if (a==='full') wrap.classList.toggle('full');
    viewer.dirty=true; sync(); });
  document.addEventListener('keydown',e=>{ if (e.key==='Escape' && wrap.classList.contains('full')){ wrap.classList.remove('full'); sync(); } });
  sync();
  return {
    is3d:()=>mode==='3d'&&!failed,
    update(){ ensure(); if (failed) return false; update(); viewer.dirty=true; return true; },
    set onChange(f){ onChange=f; },
  };
}

/* 按住按钮连续转动：onTurn(变化量) 中的变化量 = 方向 × 速度 × 时间 */
function bindHold(root, speedSel, onTurn){
  let dir=0, raf=0, last=0;
  const loop=t=>{ if(!dir){ raf=0; return; } const dt=last?Math.min(0.05,(t-last)/1000):0; last=t; onTurn(dir*parseFloat(speedSel.value)*dt); raf=requestAnimationFrame(loop); };
  root.querySelectorAll('.hold').forEach(b=>{
    b.addEventListener('pointerdown',e=>{ e.preventDefault(); dir=+b.dataset.dir; last=0; if(!raf) raf=requestAnimationFrame(loop); });
    ['pointerup','pointerleave','pointercancel'].forEach(ev=>b.addEventListener(ev,()=>{ dir=0; }));
  });
}
/* 拖动刻度条：向左拖 = 读数增大 */
function bindDrag(canvas, pxPerUnit, onTurn){
  let x=null;
  canvas.addEventListener('pointerdown',e=>{ x=e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove',e=>{ if(x==null) return; const dx=e.clientX-x; x=e.clientX; onTurn(-dx/pxPerUnit); });
  ['pointerup','pointercancel'].forEach(ev=>canvas.addEventListener(ev,()=>{ x=null; }));
}
/* 刻度条：value 为以“格”为单位的连续读数，中间红线是读数指标 */
function drawStrip(c, value, {px=8, major=10, label=k=>k}={}){
  const {ctx,dpr,W,H}=setup(c,54); ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle='#1a1c20'; ctx.fillRect(0,0,W,H);
  const span=W/2/px+2;
  ctx.strokeStyle='#c9c8c2'; ctx.fillStyle='#c9c8c2'; ctx.font='11px "PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif'; ctx.textAlign='center'; ctx.lineWidth=1;
  for (let k=Math.floor(value-span); k<=Math.ceil(value+span); k++){
    const x=W/2+(k-value)*px, m=((k%major)+major)%major, h=m===0?22:(major%2===0&&m===major/2)?15:9;
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke();
    if (m===0) ctx.fillText(label(k), x, h+13);
  }
  ctx.strokeStyle='#d4593f'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(W/2,0); ctx.lineTo(W/2,H); ctx.stroke();
}
/* AI 批改流程（三个实验共用） */
async function runReview(p, {check, prompt, offline}){
  const box=$('#'+p+'-review'), btn=$('#'+p+'-check');
  if(btn.disabled) return false;
  const msg=check(); if(msg){ box.innerHTML=`<div class="note">${esc(msg)}</div>`; return false; }
  const locked=['check','rec','undo','clr'].map(k=>$('#'+p+'-'+k));
  locked.forEach(b=>b.disabled=true);
  btn.textContent='AI 批改中…'; box.innerHTML=loadingHTML('正在检查数据…');
  try {
    const snapshotPrompt=prompt(), fallback=offline();
    await AI.ready;
    let text='', note='';
    if(AI.online()) { try { text=await aiText(snapshotPrompt); } catch(e){ note=aiErrorNote(e); } }
    else note='离线演示模式：下面是内置规则给出的批改意见。';
    if(!text) text=fallback;
    box.innerHTML=paras(text)+(note?`<div class="note">${esc(note)}</div>`:'');
    stats.review++; renderStats(); logEvent('lab_review',{lab:p,text});
    return text;
  } catch(e){ box.textContent='批改失败：'+e.message; return false; }
  finally { locked.forEach(b=>b.disabled=false); btn.textContent='重新检查'; }
}
/* 角度工具（分光计用） */
const angDiff = (a,b) => { let d=((a-b)%360+540)%360-180; return Math.abs(d); };     // 两个读数之间的夹角，自动处理跨 0° 的情况
const dms = deg => { deg=((deg%360)+360)%360; let d=Math.floor(deg), m=Math.round((deg-d)*60); if (m===60){ d=(d+1)%360; m=0; } return `${d}°${String(m).padStart(2,'0')}′`; };
