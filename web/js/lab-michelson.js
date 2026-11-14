/* =====================================================================
 * lab-michelson.js —— 虚拟实验：迈克尔逊干涉仪测 He-Ne 激光波长
 * 操作：调 M₂ 倾角使光点重合 → 看等倾条纹 → 转鼓轮每 50 环记一次 → 逐差法
 * ===================================================================== */
const MI = (() => {
  const P='mi', LAM=632.8e-6;           // He-Ne 波长 (mm)
  const TH=0.065, KT=6;                 // 视场半角 (rad)、M₂ 倾斜引起的条纹系数
  const DIV=1e-4, BACKLASH=0.0025;      // 鼓轮 1 格 = 0.0001 mm；回程差 (mm)
  const s={}; let B=null;

  function init(){
    const R=32+rnd(0.38,0.46);
    Object.assign(s,{R, M:R, eq:R-rnd(1.05,1.35), scale:rnd(0.996,1.004),
      tx:(Math.random()<.5?-1:1)*rnd(.45,.8), ty:(Math.random()<.5?-1:1)*rnd(.35,.7),
      aligned:false, view:'spots', lastDir:0, dead:0, reversals:0, rows:[], M0:null, checked:false});
  }
  const tilt=()=>Math.hypot(s.tx,s.ty);
  const gap=()=>s.M-s.eq;                                   // 等效空气膜厚度 (mm)
  const rings=()=>s.M0==null?0:2*(s.M-s.M0)/LAM;            // 自第一次记录起中心变化的环数（带符号）

  function turn(divs){
    if (!divs) return;
    const dir=Math.sign(divs), delta=divs*DIV;
    if (s.lastDir && dir!==s.lastDir){ s.dead=BACKLASH; if (s.rows.length) s.reversals++; }
    s.lastDir=dir;
    let move=delta;
    if (s.dead>0){ const eat=Math.min(s.dead,Math.abs(delta)); s.dead-=eat; move=dir*(Math.abs(delta)-eat); }   // 回程差：读数变了，M₁ 没动
    const nd=s.M+move*s.scale-s.eq; if (nd<0.25||nd>4) return;
    s.R+=delta; s.M+=move*s.scale;                                                                         // scale：螺杆传动的微小误差
  }
  const parts=R=>{ const main=Math.floor(R+1e-9), c=Math.floor((R-main)*100+1e-9), f=(R-main-c/100)*1e4; return {main,c,f}; };

  /* ---------- 页面 ---------- */
  function mount(el){
    el.innerHTML=labShell(P,{
      title:'迈克尔逊干涉仪测 He-Ne 激光波长',
      principle:`<p>分光板 G₁ 把激光分成两束，分别被 M₁、M₂ 反射后重新相遇产生干涉。M₂ 经 G₁ 成的虚像 M₂′ 与 M₁ 之间相当于一层厚度为 d 的“空气薄膜”，屏上看到等倾干涉的同心圆环。</p>
        <p>M₁ 每移动 λ/2，中心就冒出或缩进一个环。数出变化的环数 N，读出 M₁ 移动的距离 Δd，就能求出波长：<b>λ = 2Δd / N</b>。</p>`,
      right:`<div class="canvas-wrap fill"><canvas id="${P}-bench"></canvas><div class="caption">装置俯视图（示意，M₁ 位移已放大）</div></div>
      <div class="lab-grid">
        <div class="canvas-wrap"><canvas id="${P}-screen" class="eye"></canvas><div class="caption" id="${P}-cap">观察屏</div><div class="msg" id="${P}-msg"></div><div class="counter" id="${P}-counter"></div></div>
        <div class="panel" id="${P}-panel">
          <div class="seg"><button class="tab active" id="${P}-v1">看光点（未放毛玻璃）</button><button class="tab" id="${P}-v2">放上毛玻璃看条纹</button></div>
          <label class="ctl"><span>M₂ 水平倾角螺丝</span><output id="${P}-otx"></output><input type="range" id="${P}-tx" min="-1" max="1" step="0.005"></label>
          <label class="ctl"><span>M₂ 竖直倾角螺丝</span><output id="${P}-oty"></output><input type="range" id="${P}-ty" min="-1" max="1" step="0.005"></label>
          <div class="readout" id="${P}-readout"></div>
          <canvas id="${P}-drum" class="strip"></canvas>
          ${turnControls(P,[[4,'慢速'],[15,'中速'],[40,'快速']])}
          <div class="tip">按住按钮转动微动鼓轮，也可以左右拖动刻度条；键盘 ← → 每次转 1 格（按住 Shift 转 10 格）。</div>
        </div>
      </div>`});
    init(); LabStore.restore(P,s); stats.records+=s.rows.length; $('#'+P+'-review').innerHTML=paras(s.review||''); $('#'+P+'-tx').value=s.tx; $('#'+P+'-ty').value=s.ty;
    B=benchArea(P, Models3D.michelson, ()=>{ const p=parts(s.R); return {gap:gap(), tx:s.tx, ty:s.ty, fine:p.f, coarse:(s.R-p.main)*100, screen:$('#'+P+'-screen')}; },
      {cap3d:'三维模型（M₁ 的位移已放大显示）'});
    B.onChange=render;
    const setView=v=>{ s.view=v; if (v==='fringe' && tilt()<0.06) s.aligned=true; $('#'+P+'-v1').classList.toggle('active',v==='spots'); $('#'+P+'-v2').classList.toggle('active',v==='fringe'); render(); };
    $('#'+P+'-v1').onclick=()=>setView('spots');
    $('#'+P+'-v2').onclick=()=>setView('fringe');
    $('#'+P+'-v1').classList.toggle('active',s.view==='spots'); $('#'+P+'-v2').classList.toggle('active',s.view==='fringe');
    ['tx','ty'].forEach(k=>$('#'+P+'-'+k).addEventListener('input',e=>{ s[k]=parseFloat(e.target.value); if (tilt()<0.06) s.aligned=true; render(); }));
    $('#'+P+'-assist').onchange=render;
    bindHold($('#'+P+'-panel'), $('#'+P+'-speed'), d=>{ turn(d); render(); });
    bindDrag($('#'+P+'-drum'), 8, d=>{ turn(d); render(); });
    $('#'+P+'-rec').onclick=record;
    $('#'+P+'-undo').onclick=()=>{ s.checked=false; s.review=''; $('#'+P+'-review').innerHTML=''; if(!s.rows.pop()) return; if(!s.rows.length){ s.M0=null; s.reversals=0; } stats.records=Math.max(0,stats.records-1); table(); render(); };
    $('#'+P+'-clr').onclick=()=>{ stats.records-=s.rows.length; s.rows=[]; s.M0=null; s.reversals=0; s.checked=false; s.review=''; $('#'+P+'-review').innerHTML=''; table(); render(); };
    $('#'+P+'-check').onclick=review;
    table();
  }
  function key(dir,big){ turn(dir*(big?10:1)); render(); }

  /* ---------- 绘图 ---------- */
  function render(){
    screen(); if (!(B.is3d() && B.update())) bench();
    drawStrip($('#'+P+'-drum'), parts(s.R).f, {label:k=>((k%100)+100)%100});
    const {main,c,f}=parts(s.R);
    $('#'+P+'-readout').innerHTML=`<div>M₁ 位置读数</div><div class="v">${s.R.toFixed(5)} mm</div><div class="f">= 主尺 ${main} mm + 粗动手轮 ${c} × 0.01 mm + 微动鼓轮 ${f.toFixed(1)} × 0.0001 mm</div>`;
    $('#'+P+'-otx').textContent=(+s.tx).toFixed(3); $('#'+P+'-oty').textContent=(+s.ty).toFixed(3);
    renderSteps(P,[
      [s.aligned,'<b>调光路</b>：调节 M₂ 背后的两个螺丝，让观察屏上两组光点重合。'],
      [s.aligned&&s.view==='fringe','<b>看条纹</b>：放上毛玻璃，看到同心圆环；可以再微调螺丝，让圆心落在视场中央。'],
      [s.rows.length>=10,`<b>测量</b>：沿<b>同一方向</b>转动微动鼓轮，中心每冒出（或缩进）50 环记录一次读数，共记 10 组（已记 ${s.rows.length} 组）。`],
      [s.checked,'<b>处理数据</b>：用逐差法算出波长，再让 AI 助教检查。']]);
  }
  function bench(){
    const c=$('#'+P+'-bench'); const {ctx,W,H}=benchSetup(c);
    ctx.fillStyle='#0f1012'; ctx.fillRect(0,0,W,H);
    const cx=Math.max(170,W*0.42), cy=128, arm=Math.min(170,W-cx-60);
    const m1x=cx+arm+Math.max(-40,Math.min(40,(gap()-1.2)*45)), m2y=34, ey=H-14, red='rgba(255,70,60,';
    const line=(x1,y1,x2,y2,a=0.8,w=2)=>{ctx.strokeStyle=red+a+')';ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();};
    line(70,cy,cx,cy); line(cx,cy,m1x,cy,0.6); line(cx,cy-2,cx,m2y,0.6); line(cx,cy,cx,ey-6,0.9,3);
    ctx.fillStyle='#2b2f35'; ctx.fillRect(14,cy-12,56,24); ctx.fillStyle='#c9c8c2'; ctx.font='12px "PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif'; ctx.textAlign='left'; ctx.fillText('He-Ne 激光器',10,cy+30);
    ctx.strokeStyle='#a9bbd6'; ctx.lineWidth=2; ctx.beginPath(); ctx.ellipse(95,cy,4,12,0,0,Math.PI*2); ctx.stroke(); ctx.fillText('扩束镜',80,cy-18);
    const plate=(x,y,col)=>{ctx.save();ctx.translate(x,y);ctx.rotate(-Math.PI/4);ctx.fillStyle=col;ctx.fillRect(-22,-3,44,6);ctx.restore();};
    plate(cx,cy,'rgba(175,192,214,.75)'); plate(cx+arm*0.42,cy,'rgba(175,192,214,.35)');
    ctx.fillStyle='#c9c8c2'; ctx.fillText('G₁ 分光板',cx-82,cy+26); ctx.fillText('G₂ 补偿板',cx+arm*0.42-26,cy+30);
    ctx.strokeStyle='#3b4048'; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(cx+arm-48,cy+22); ctx.lineTo(cx+arm+48,cy+22); ctx.stroke();
    ctx.fillStyle='#e8e7e2'; ctx.fillRect(m1x-3,cy-26,6,52); ctx.fillStyle='#c9c8c2'; ctx.fillText('M₁（可移动）',m1x-30,cy-34);
    ctx.save(); ctx.translate(cx,m2y); ctx.rotate(s.tx*0.18); ctx.fillStyle='#e8e7e2'; ctx.fillRect(-26,-3,52,6);
    ctx.fillStyle='#d9b86a'; ctx.beginPath(); ctx.arc(-20,-9,3,0,Math.PI*2); ctx.arc(20,-9,3,0,Math.PI*2); ctx.fill(); ctx.restore();
    ctx.fillStyle='#c9c8c2'; ctx.fillText('M₂（倾角可调）',cx+34,m2y+4);
    ctx.strokeStyle='#8e9298'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(cx-30,ey); ctx.lineTo(cx+30,ey); ctx.stroke(); ctx.fillText('观察屏 E',cx+36,ey+3);
  }
  function screen(){
    const c=$('#'+P+'-screen'), S=eyeSize(c); c.style.width=S+'px';
    const {ctx,dpr}=setup(c,S), msg=$('#'+P+'-msg'), t=tilt();
    if (s.view==='spots'){
      ctx.setTransform(dpr,0,0,dpr,0,0); ctx.fillStyle='#0c0d0f'; ctx.fillRect(0,0,S,S);
      const spot=(x,y,a)=>{ const g=ctx.createRadialGradient(x,y,0,x,y,14); g.addColorStop(0,`rgba(255,235,225,${a})`); g.addColorStop(.35,`rgba(255,60,50,${a*.8})`); g.addColorStop(1,'rgba(255,40,40,0)'); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,14,0,Math.PI*2); ctx.fill(); };
      const h=S/2, off=S*0.4, set=[[0,0,1],[9,7,.35],[-8,10,.2]];
      set.forEach(([dx,dy,a])=>spot(h+dx,h+dy,a)); set.forEach(([dx,dy,a])=>spot(h+s.tx*off+dx,h-s.ty*off+dy,a));
      $('#'+P+'-cap').textContent='观察屏：两组反射光点';
      msg.textContent = t<0.06 ? '✓ 两组光点已重合，可以放上毛玻璃看条纹' : '调节 M₂ 的两个螺丝，让两组光点重合';
    } else {
      const n=c.width, img=ctx.createImageData(n,n), col=wl2rgb(632.8), C=Math.max(0,Math.min(1,1-(t-0.06)/0.12)), base=2*gap()/LAM;
      for (let j=0;j<n;j++){ const v=(j/(n-1))*2-1;
        for (let i=0;i<n;i++){ const u=(i/(n-1))*2-1, r2=u*u+v*v, o=(j*n+i)*4;
          if (r2>1){ img.data[o]=12; img.data[o+1]=13; img.data[o+2]=15; img.data[o+3]=255; continue; }
          const ph=2*Math.PI*(base*(1-r2*TH*TH/2)+KT*(s.tx*u-s.ty*v));
          const I=(0.5+0.5*C*Math.cos(ph))*Math.exp(-r2*0.7)*0.95+0.03;
          img.data[o]=col[0]*255*I; img.data[o+1]=col[1]*255*I; img.data[o+2]=col[2]*255*I; img.data[o+3]=255; } }
      ctx.putImageData(img,0,0);
      $('#'+P+'-cap').textContent='观察屏：等倾干涉条纹';
      msg.textContent = C<0.05 ? '光点没有重合，看不到条纹：回到“看光点”继续调节' : '';
    }
    const ctr=$('#'+P+'-counter');
    if (s.view==='fringe' && $('#'+P+'-assist').checked){
      if (s.M0==null) ctr.textContent='辅助计数：点“记录读数”后开始计数';
      else { const tot=Math.floor(Math.abs(rings())+1e-9), since=tot-s.rows[s.rows.length-1].N;
        ctr.textContent=`距上次记录 ${since} 环，累计 ${tot} 环（${gap()>=s.rows[0].dm?'冒出':'缩进'}）`; }
      ctr.hidden=false;
    } else ctr.hidden=true;
  }

  /* ---------- 数据 ---------- */
  function record(){
    if(s.rows.length>=500){ alert('已达 500 条记录，请清空后开始新实验。'); return; }
    if (s.view!=='fringe' || tilt()>=0.06){ $('#'+P+'-result').innerHTML='<div class="note">还看不到清晰的干涉条纹，先完成第 1、2 步。</div>'; return; }
    if (s.M0==null) s.M0=s.M;
    const n=Math.abs(rings()), N=Math.floor(n+1e-9), est=Math.round(rnd(-1.4,1.4))*1e-5;   // est：最后一位估读误差
    s.rows.push({N, R:+(s.R+est).toFixed(5), dm:gap(), frac:+(n-N).toFixed(2)});
    s.checked=false; s.review=''; $('#'+P+'-review').innerHTML='';
    stats.records++; logEvent('lab_record',{lab:P,n:s.rows.length,row:s.rows[s.rows.length-1]}); table(); render();
  }
  function calc(){
    const r=s.rows, n=r.length; if (n<4) return null;
    const k=Math.floor(n/2), items=[];
    for (let i=0;i<k;i++){ const dN=Math.abs(r[i+k].N-r[i].N), dd=Math.abs(r[i+k].R-r[i].R); items.push({i,k,dN,dd,lam:dN?2*dd/dN*1e6:NaN}); }
    const ok=items.filter(x=>Number.isFinite(x.lam)&&x.lam>0); if (ok.length!==items.length) return null;
    const mean=ok.reduce((a,b)=>a+b.lam,0)/ok.length;
    return {items,mean,err:(mean-632.8)/632.8*100,unused:n%2===1};
  }
  function table(){
    LabStore.save(P,s);
    const r=s.rows; renderStats();
    if (!r.length){ $('#'+P+'-table').innerHTML='<div class="empty">还没有数据。看到条纹后，先点一次“记录读数”作为起点（N = 0）。</div>'; $('#'+P+'-result').innerHTML=''; return; }
    $('#'+P+'-table').innerHTML=`<table class="data"><tr><th>序号</th><th>累计环数 N</th><th>读数 d / mm</th><th>与上次间隔</th></tr>`+
      r.map((x,i)=>{ const g=i?x.N-r[i-1].N:null; return `<tr class="${g!=null&&g!==50?'warn':''}"><td>${i+1}</td><td>${x.N}</td><td>${x.R.toFixed(5)}</td><td>${g==null?'—':g+' 环'}</td></tr>`; }).join('')+'</table>';
    const c=calc();
    $('#'+P+'-result').innerHTML = c ? `<div class="result">逐差法（第 i 组与第 i+${c.items[0].k} 组相减）：${c.items.map(x=>x.lam.toFixed(1)).join('、')} nm
        <div>平均波长 <span class="big">${c.mean.toFixed(1)} nm</span>　标准值 632.8 nm　相对误差 <b>${c.err>=0?'+':''}${c.err.toFixed(2)}%</b></div>
        ${c.unused?'<div class="hint">数据为奇数组，最后一组没有参与逐差。</div>':''}</div>`
      : '<div class="hint" style="margin-top:8px">需要至少 4 组有效数据；配对的环数差和位移必须非零，重复记录请撤销后重测。</div>';
  }

  /* ---------- AI 批改 ---------- */
  function offline(c){
    const r=s.rows, bad=r.slice(1).map((x,i)=>[x.N-r[i].N,i+2]).filter(([g])=>g!==50), late=r.map((x,i)=>[x.frac,i+1]).filter(([f])=>f>=0.5);
    const level=Math.abs(c.err)<1?'很好':Math.abs(c.err)<3?'基本合格':'偏大', p=[];
    if (r.length<10) p.push(`只记录了 ${r.length} 组，建议记满 10 组再用逐差法，可以减小偶然误差`);
    if (c.unused) p.push('数据是奇数组，最后一组没有用上');
    if (bad.length) p.push(`第 ${bad.map(x=>x[1]).join('、')} 组与上一组的间隔不是 50 环（${bad.map(x=>x[0]).join('、')} 环），说明记录时机没有卡准`);
    if (late.length) p.push(`第 ${late.map(x=>x[1]).join('、')} 组记录得偏晚，环已经变化了半个以上`);
    if (s.reversals) p.push(`测量过程中鼓轮反转了 ${s.reversals} 次，会引入回程差：读数变了但 M₁ 没有真正移动`);
    return [`【总评】共记录 ${r.length} 组数据，逐差法得到 λ = ${c.mean.toFixed(1)} nm，与标准值 632.8 nm 的相对误差为 ${c.err.toFixed(2)}%，结果${level}。`,
      '【数据问题】'+(p.length?p.join('；')+'。':'没有发现明显问题，记录间隔均匀，操作方向一致。'),
      '【误差来源】主要有：数环时的计数误差（记录时环没有刚好冒出或缩进）、鼓轮读数的估读误差、螺杆传动的回程差，以及 M₁ 移动时的机械误差。',
      '【改进建议】开始测量前先朝测量方向空转几圈，消除回程差；整个过程只朝一个方向转；在中心刚好冒出（或缩进）一个环的瞬间读数；记满 10 组，并做多次测量取平均。'].join('\n');
  }
  function review(){
    const c=calc();
    runReview(P,{
      check:()=>c?'':'需要至少 4 组有效数据，且每组逐差的环数差和位移均非零；请撤销重复读数后重测。',
      prompt:()=>`你是大学物理实验课的助教，正在批改大一学生“迈克尔逊干涉仪测 He-Ne 激光波长”的实验数据。标准值 632.8 nm。
学生的记录（N 为从第一次记录起中心累计冒出或缩进的环数，d 为 M₁ 位置读数，单位 mm）：
${s.rows.map((x,i)=>`${i+1}. N=${x.N}, d=${x.R.toFixed(5)}`).join('\n')}
逐差法结果：各组 λ = ${c.items.map(x=>x.lam.toFixed(1)).join(', ')} nm，平均 ${c.mean.toFixed(1)} nm，相对误差 ${c.err.toFixed(2)}%。
系统记录的操作情况：测量过程中反转鼓轮 ${s.reversals} 次（反转会引入回程差）；每次点击记录时，环已经多变化了 ${s.rows.map(x=>x.frac).join(', ')} 个（理想为 0，越大说明记录越晚）。${c.unused?'数据为奇数组，最后一组未参与逐差。':''}
请给出批改意见：中文，200~300 字，分 4 段，每段开头依次写【总评】【数据问题】【误差来源】【改进建议】，段与段之间换行。要指出具体是第几组数据有问题、可能是什么原因。只根据给出的数据说话，语气像耐心的助教，不要使用 Markdown。`,
      offline:()=>offline(c)
    }).then(ok=>{ if(ok){ s.checked=true; s.review=ok; LabStore.save(P,s); render(); } });
  }
  return {mount, render, key};
})();
