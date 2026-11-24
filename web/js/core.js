/* =====================================================================
 * core.js —— 公共工具：DOM、绘图、颜色、使用统计、AI 接口、实验页面骨架
 * 所有 js 文件按顺序加载，顶层声明的函数和常量可以互相使用。
 * ===================================================================== */

const APP_VERSION = '1.8.1';
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
  sent:{},                                   // 每个实验最近一次保存（或读入）的内容，没有变化就不重复保存
  /* 每个实验最多保存的记录条数（与 server.py 的 LAB_ROW_LIMIT 一致） */
  limit:p=>({bm:1500})[p]||500,
  live:{},
  room(p,s=this.live[p]){ return s?this.limit(p)-s.rows.length:Infinity; },
  /* 记录满额时给出明确提示（不再悄悄保存失败） */
  full(p,need=1){ const left=this.room(p); if (left>=need) return false;
    $('#'+p+'-save-status').textContent=left<=0?`记录已达上限 ${this.limit(p)} 条，请先撤销、删除部分数据或清空后再记录`:`还能记录 ${left} 条，不够这一次的 ${need} 条；请先删除部分数据`;
    $('#'+p+'-save-status').classList.add('warn-text'); return true; },
  ready:AI.ready.then(async()=>{
    if (!AI.backend) return;
    try { const r=await fetch('api/labs'); if(!r.ok) throw Error('读取失败'); LabStore.data=await r.json(); }
    catch(e){ LabStore.failed=true; alert('实验存档读取失败。请重新打开软件，以免覆盖原记录。'); }
  }),
  restore(p,s){
    this.live[p]=s;
    const saved=this.data[p];
    if(saved && Array.isArray(saved.rows) && saved.rows.length<=this.limit(p)){
      const keys=Object.keys(s);
      if(keys.every(k=>k in saved && (typeof s[k]!=='number' || Number.isFinite(saved[k])))) {
        const copy=JSON.parse(JSON.stringify(saved));      // 复制一份：之后修改 s 不会改到“已保存”的记录
        for(const k of keys) s[k]=copy[k];
        s.review=typeof saved.review==='string'?saved.review:'';
        this.sent[p]=JSON.stringify(s);
        return saved;
      }
    }
    this.sent[p]=JSON.stringify(s);   // 没有存档：初始状态不必立刻保存，有了变化再存
  },
  save(p,s){
    this.live[p]=s; $('#'+p+'-save-status')?.classList.remove('warn-text');
    if(!AI.backend || this.failed) return;
    if(s.rows.length>this.limit(p)){ $('#'+p+'-save-status').textContent=`记录已超过上限 ${this.limit(p)} 条，超出的部分无法保存，请撤销或删除一部分数据`; return; }
    const json=JSON.stringify(s); if(json===this.sent[p]) return;   // 内容没变，不发请求
    this.sent[p]=json; const state=JSON.parse(json); this.data[p]=state;
    this.queue=this.queue.then(async()=>{
      // keepalive 让关窗时的最后一次保存也能发出；Chrome 限制未读完的 keepalive 响应共 64 KB，所以每次都要读完响应
      const body=JSON.stringify({lab:p,state});
      const r=await fetch('api/labs',{method:'POST',headers:apiHeaders(),body,keepalive:body.length<60000});
      await r.text();
      if(!r.ok) throw Error('保存失败');
      $('#'+p+'-save-status').textContent='实验已保存到本机';
    }).catch(()=>{ if(this.sent[p]===json) this.sent[p]=null; $('#'+p+'-save-status').textContent='保存失败，请保持软件打开并再次记录或批改以重试'; });
  }
};
/* 所有实验的“记录读数”按钮：满额时拦下点击并提示 */
document.addEventListener('click',e=>{ const b=e.target.closest?.('button[id$="-rec"]'); if (!b) return;
  if (LabStore.full(b.id.slice(0,-4))){ e.stopPropagation(); e.preventDefault(); } },true);

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
function labShell(p, {title, principle, right, rightClass='card scope', recBar=true, resultFirst=false}){
  const table=`<div id="${p}-table"></div>`, result=`<div id="${p}-result"></div>`;
  return `<section>
    <div class="card">
      <h2 class="lab-title" data-title="${title}"><span class="n">实验</span>${title}<span class="prog" id="${p}-prog"></span></h2>
      <ol class="steps" id="${p}-steps"></ol>
      <details class="principle"><summary>实验原理</summary>${principle}</details>
    </div>
    <div class="card data-card">
      <h2><span class="n">记录</span>${resultFirst?'结果与检查':'数据记录'}</h2>
      <div class="row rec-bar" style="margin-top:0;flex-wrap:wrap"${recBar?'':' hidden'}>
        <button class="primary" id="${p}-rec">记录读数</button>
        <button class="ghost" id="${p}-undo">撤销</button>
        <button class="ghost" id="${p}-clr">清空</button>
      </div>
      <div id="${p}-save-status" class="hint" role="status"></div>
      ${resultFirst?`${result}<details class="rawdata"><summary id="${p}-rawsum">原始读数与中间量</summary>${table}</details>`:table+result}
    </div>
    <div class="card minor-card">
      <h2><span class="n">批改</span>AI 助教检查数据</h2>
      <button class="primary" id="${p}-check">检查我的数据</button>
      <div id="${p}-review" style="margin-top:10px"></div>
    </div>
    <div class="card report-card minor-card">
      <h2><span class="n">报告</span>导出实验报告</h2>
      <div class="hint" style="margin-top:0">包含实验原理、步骤完成情况、数据表、计算结果与不确定度、图表、当前视场和 AI 评语。可以先做 AI 批改再导出。</div>
      <div class="row rep-who"><input data-rep="name" placeholder="姓名（可不填）"><input data-rep="sid" placeholder="学号"><input data-rep="cls" placeholder="班级"></div>
      <div class="row" style="flex-wrap:wrap"><button class="primary" data-report="docx" data-lab="${p}">导出 Word 文档</button><button class="ghost" data-report="html" data-lab="${p}">导出网页（可打印为 PDF）</button>
        <button class="ghost" data-open-reports hidden>打开报告文件夹</button><button class="ghost" data-clear-who title="公用电脑上用完后可以清除">清除个人信息</button></div>
      <div class="hint rep-status" role="status"></div>
    </div>
  </section>
  <section><div class="${rightClass}">${right}</div></section>`;
}
/* 图表画布所在的实验还没打开时宽度为 0，等它显示出来再画（否则恢复存档后图是空的） */
function whenVisible(cv, draw){
  if (!cv || cv._waiting || typeof ResizeObserver==='undefined') return;
  cv._waiting=true;
  const ro=new ResizeObserver(()=>{ if (cv.clientWidth){ ro.disconnect(); cv._waiting=false; if (cv.isConnected) draw(); } });
  ro.observe(cv);
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
/* 步骤列表：当前步骤完整显示；已完成、未开始的只显示标题，点击展开说明 */
const stepsOpen={};
function renderSteps(p, list){
  const now=list.findIndex(x=>!x[0]), open=stepsOpen[p]||(stepsOpen[p]=new Set());
  const split=t=>{ const i=t.indexOf('</b>'); if (!t.startsWith('<b>')||i<0) return [t,'']; return [t.slice(3,i), t.slice(i+4).replace(/^[：:]\s*/,'')]; };
  /* 原地更新每个 <li>，不重建整个列表：键盘焦点停在某一步上时，调仪器触发重绘也不会丢焦点 */
  const ol=$('#'+p+'-steps');
  while (ol.children.length<list.length) ol.appendChild(document.createElement('li'));
  while (ol.children.length>list.length) ol.lastElementChild.remove();
  list.forEach(([ok,t],i)=>{ const [title,desc]=split(t), cls=ok?'done':i===now?'now':'later', li=ol.children[i];
    const c=cls+(open.has(i)?' open':''), html=`<span class="s">${ok?'✓':i+1}</span><span class="t"><b>${title}</b>${desc?`<span class="d">${desc}</span>`:''}</span>`;
    if (li.className!==c) li.className=c;
    li.dataset.i=i;
    if (li._html!==html){ li.innerHTML=html; li._html=html; }
    if (cls!=='now'&&desc){ li.tabIndex=0; li.setAttribute('role','button'); li.setAttribute('aria-expanded',open.has(i)); }
    else { li.tabIndex=-1; li.removeAttribute('role'); li.removeAttribute('aria-expanded'); }
  });
  const prog=$('#'+p+'-prog'); if (prog) prog.textContent=now<0?'全部完成':`第 ${now+1} 步 / 共 ${list.length} 步`;
}
document.addEventListener('click',e=>{ const li=e.target.closest('.steps li[data-i]'); if (!li||li.classList.contains('now')||!li.querySelector('.d')) return;
  const p=li.parentElement.id.replace(/-steps$/,''), i=+li.dataset.i, set=stepsOpen[p]||(stepsOpen[p]=new Set());
  set.has(i)?set.delete(i):set.add(i); li.classList.toggle('open'); li.setAttribute('aria-expanded',set.has(i)); });
document.addEventListener('keydown',e=>{ if ((e.key==='Enter'||e.key===' ')&&e.target.matches?.('.steps li[role=button]')){ e.preventDefault(); e.target.click(); } });
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
/* AI 批改流程（各实验共用） */
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


/* ===================================================================
 * 实验报告：从实验页面整理出原理、步骤、数据表、结果、图表和评语，交给服务器生成 Word / 网页
 * =================================================================== */
const Report = (() => {
  const INLINE=new Set(['B','STRONG','I','EM','SPAN','SUB','SUP','S','LABEL','OUTPUT','A','CODE','SMALL','U']);
  const SKIP=new Set(['BUTTON','INPUT','SELECT','SCRIPT','STYLE','TEXTAREA']);
  function runsOf(node, f={}, out=[]){
    for (const n of node.childNodes){
      if (n.nodeType===3){ const t=n.textContent.replace(/\s+/g,' '); if (t.trim()||(t===' '&&out.length)) out.push({t, ...f}); continue; }
      if (n.nodeType!==1 || SKIP.has(n.tagName) || n.hidden) continue;
      if (n.tagName==='BR'){ out.push({t:'\n'}); continue; }
      if (n.classList.contains('d') && out.length) out.push({t:'：', ...f});   // 步骤标题与说明之间（页面上用 CSS 补的冒号）
      runsOf(n, {...f, ...(n.tagName==='B'||n.tagName==='STRONG'?{b:true}:{}), ...(n.tagName==='SUB'?{sub:true}:{}), ...(n.tagName==='SUP'?{sup:true}:{})}, out);
    }
    return out;
  }
  const tidy=runs=>{ const r=runs.filter(x=>x.t!=='\n'); if (r.length){ r[0].t=r[0].t.replace(/^\s+/,''); r[r.length-1].t=r[r.length-1].t.replace(/\s+$/,''); } return r.filter(x=>x.t); };
  function tableOf(tb){ return [...tb.rows].map(tr=>[...tr.cells].map(td=>tidy(runsOf(td)))); }
  function imgOf(cv, cap, jpeg){
    try { if (!cv.width||!cv.height) return null;
      let src=cv;
      if (jpeg){ const c=document.createElement('canvas'); c.width=cv.width; c.height=cv.height; const g=c.getContext('2d'); g.fillStyle='#000'; g.fillRect(0,0,c.width,c.height); g.drawImage(cv,0,0); src=c; }
      else { const c=document.createElement('canvas'); c.width=cv.width; c.height=cv.height; const g=c.getContext('2d'); g.fillStyle='#fff'; g.fillRect(0,0,c.width,c.height); g.drawImage(cv,0,0); src=c; }
      const css=cv.getBoundingClientRect(), w=Math.round(css.width||cv.width/2), h=Math.round(css.height||cv.height/2);
      return {img:src.toDataURL(jpeg?'image/jpeg':'image/png',0.88), w:Math.min(w,620), h:Math.round(Math.min(w,620)*h/Math.max(1,w)), cap};
    } catch(e){ return null; }
  }
  /* 把一个区域拆成段落、表格、图片：遇到块级元素就断段 */
  function blocks(el, out=[]){
    let cur=[];
    const flush=()=>{ const r=tidy(cur); if (r.length) out.push({p:r}); cur=[]; };
    for (const n of el.childNodes){
      if (n.nodeType===3){ const t=n.textContent.replace(/\s+/g,' '); if (t.trim()) cur.push({t}); continue; }
      if (n.nodeType!==1 || SKIP.has(n.tagName) || n.hidden) continue;
      if (n.tagName==='BR'){ flush(); continue; }
      if (INLINE.has(n.tagName)){ cur.push(...runsOf(n, n.tagName==='B'||n.tagName==='STRONG'?{b:true}:n.tagName==='SUB'?{sub:true}:n.tagName==='SUP'?{sup:true}:{})); continue; }
      flush();
      if (n.tagName==='TABLE') out.push({table:tableOf(n)});
      else if (n.tagName==='CANVAS'){ const im=imgOf(n,'图：数据处理',false); if (im) out.push(im); }
      else blocks(n,out);
    }
    flush(); return out;
  }
  function collect(P){
    const box=document.getElementById(P+'-steps')?.closest('.labwrap');
    const title=box?.querySelector('h2[data-title]')?.dataset.title||'';
    const sections=[];
    const prin=box?.querySelector('details.principle');
    if (prin) sections.push({h:'一、实验原理', blocks:[...prin.querySelectorAll('p')].map(p=>({p:tidy(runsOf(p))})).filter(b=>b.p.length)});
    const steps=[...(box?.querySelectorAll('#'+P+'-steps li')||[])].map(li=>({li:tidy(runsOf(li.lastElementChild||li)), done:li.classList.contains('done')}));
    if (steps.length) sections.push({h:'二、实验步骤与完成情况', blocks:steps});
    const view=box?.querySelector('.lab-grid canvas.eye');
    const vi=view?imgOf(view,'导出时的'+(box.querySelector('.lab-grid .caption')?.textContent||'视场'),true):null;
    const data=blocks(document.getElementById(P+'-table'));
    sections.push({h:'三、实验数据', blocks:data.length?data:[{p:[{t:'还没有记录数据。'}]}]});
    const res=blocks(document.getElementById(P+'-result'));
    sections.push({h:'四、数据处理与结果', blocks:(res.length?res:[{p:[{t:'还没有足够的数据进行计算。'}]}]).concat(vi?[vi]:[])});
    const rv=[...document.getElementById(P+'-review').querySelectorAll('p')].map(p=>{ const t=p.textContent.trim(), m=t.match(/^【[^】]+】/); return {p:m?[{t:m[0],b:true},{t:t.slice(m[0].length)}]:[{t}]}; }).filter(b=>b.p.some(x=>x.t));
    sections.push({h:'五、AI 助教评语', blocks:rv.length?rv:[{p:[{t:'尚未进行 AI 批改。'}]}]});
    const who={}; box?.querySelectorAll('[data-rep]').forEach(i=>{ who[i.dataset.rep]=i.value.trim(); });
    const d=new Date(), pad=v=>String(v).padStart(2,'0');
    return {title, source:box?.dataset.source||'virtual', version:APP_VERSION, date:`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`, student:who, sections};
  }
  async function exportReport(P, fmt, card){
    const st=card.querySelector('.rep-status'), btns=card.querySelectorAll('[data-report]');
    if (card.dataset.busy) return;                                   // 生成期间不重复导出
    card.dataset.busy=1; btns.forEach(b=>{ b.disabled=true; }); st.textContent='正在生成报告…';
    const rep=collect(P);
    saveWho(rep.student);
    try {
      const r=await fetch('api/report',{method:'POST',headers:apiHeaders(),body:JSON.stringify({format:fmt,report:rep})});
      const j=await r.json().catch(()=>({error:'服务器没有返回结果'}));
      if (!r.ok||!j.ok) throw Error(j.error||'生成失败');
      st.textContent='已保存：'+j.path; card.querySelector('[data-open-reports]').hidden=false;
      logEvent('report_export',{lab:P,format:fmt});
      if (!window.pywebview){                                          // 浏览器里同时下载一份
        const bin=atob(j.b64), u8=new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i);
        const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([u8],{type:fmt==='docx'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'text/html'})); a.download=j.name; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1000);
      }
    } catch(e){ st.textContent='导出失败：'+e.message; }
    finally { delete card.dataset.busy; btns.forEach(b=>{ b.disabled=false; }); }
  }
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-report]'); if (b){ exportReport(b.dataset.lab,b.dataset.report,b.closest('.report-card')); return; }
    const o=e.target.closest('[data-open-reports]'); if (o) fetch('api/open-reports',{method:'POST',headers:apiHeaders(),body:'{}'});
  });
  /* 记住上次填的姓名、学号、班级：存在本地数据目录（桌面版每次启动端口不同，浏览器存储会丢） */
  const WHO=['name','sid','cls'];
  const fillWho=w=>document.querySelectorAll('[data-rep]').forEach(x=>{ x.value=w[x.dataset.rep]||''; });
  function saveWho(w){ if (!AI.backend) return;
    fetch('api/report-who',{method:'POST',headers:apiHeaders(),body:JSON.stringify(w)}).then(r=>r.text()).catch(()=>{}); }
  LabStore.ready.then(async()=>{ if (!AI.backend) return;
    try { const r=await fetch('api/report-who'); if (!r.ok) return; const w=await r.json();
      if (WHO.some(k=>w[k]) && ![...document.querySelectorAll('[data-rep]')].some(x=>x.value)) fillWho(w); } catch(e){} });
  /* 一处修改，所有实验的报告栏同步 */
  document.addEventListener('change',e=>{ const i=e.target.closest?.('[data-rep]'); if (!i) return;
    document.querySelectorAll(`[data-rep="${i.dataset.rep}"]`).forEach(x=>{ if (x!==i) x.value=i.value; });
    const w={}; WHO.forEach(k=>{ w[k]=(document.querySelector(`[data-rep="${k}"]`)?.value||'').trim(); }); saveWho(w); });
  document.addEventListener('click',e=>{ if (!e.target.closest?.('[data-clear-who]')) return;
    fillWho({}); saveWho({name:'',sid:'',cls:''});
    const st=e.target.closest('.report-card').querySelector('.rep-status'); st.textContent='已清除本机保存的姓名、学号和班级。'; });
  return {collect};
})();