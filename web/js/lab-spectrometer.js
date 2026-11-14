/* =====================================================================
 * lab-spectrometer.js —— 虚拟实验：分光计测光栅常数（汞灯绿线 546.1 nm）
 * 操作：自准法调光栅垂直 → 找零级 → 对准 ±1 级绿线读双游标，重复 3 次 → d = λ / sinφ
 * ===================================================================== */
const SP = (() => {
  const P='sp', D_TRUE=1e6/600;                        // 600 线/mm 光栅，d = 1666.7 nm
  const LINES=[{w:404.7,a:.45},{w:435.8,a:.7},{w:546.1,a:1},{w:577.0,a:.75},{w:579.1,a:.75}];
  const GREEN=546.1, FOV=1.25;                         // 视场半宽 (°)
  const SEQ=[1,2,3].flatMap(n=>[{n,k:1},{n,k:-1}]);
  const s={}; let B=null;
  const sinD=x=>Math.sin(x*Math.PI/180), asinD=x=>Math.asin(x)*180/Math.PI;

  function init(){
    Object.assign(s,{Tz:rnd(110,250), i:(Math.random()<.5?-1:1)*rnd(2.5,5), e:rnd(2,5)/60, psi:rnd(0,360),
      view:'auto', aligned:false, zero:false, rows:[], checked:false});
    s.T=s.Tz+rnd(-35,-25);
  }
  /* 第 k 级、波长 w 的谱线所在的望远镜方位（考虑入射角 i 带来的不对称） */
  const lineT=(k,w)=>{ const x=k*w/D_TRUE+sinD(s.i); return Math.abs(x)>=1?null:s.Tz+asinD(x)-s.i; };
  const ecc=()=>s.e*sinD(s.T+s.psi);                   // 偏心差
  const left=()=>s.T+ecc(), right=()=>s.T+180-ecc();
  const roundMin=x=>Math.round(((x%360)+360)%360*60)/60;

  function turn(deg){ s.T+=deg; }

  /* ---------- 页面 ---------- */
  function mount(el){
    el.innerHTML=labShell(P,{
      title:'分光计测光栅常数',
      principle:`<p>平行光垂直照射光栅时，第 k 级主极大满足光栅方程 <b>d·sinφ = kλ</b>。用分光计测出汞灯绿线（λ = 546.1 nm）±1 级的位置，两者夹角的一半就是衍射角 φ，于是 <b>d = λ / sinφ</b>。</p>
        <p>刻度盘中心和转轴不完全重合会产生“偏心差”，所以每个位置都要读<b>左右两个游标</b>：φ = ¼(|θ₁ − θ₁′| + |θ₂ − θ₂′|)，偏心差会相互抵消。光栅不垂直于入射光时，±1 级不对称，需要先用自准法把光栅调垂直。</p>`,
      right:`<div class="canvas-wrap fill"><canvas id="${P}-bench"></canvas><div class="caption">分光计俯视图（示意）</div></div>
      <div class="lab-grid">
        <div class="canvas-wrap"><canvas id="${P}-view" class="eye"></canvas><div class="caption" id="${P}-cap">望远镜视场</div><div class="msg" id="${P}-msg"></div><div class="counter" id="${P}-counter"></div></div>
        <div class="panel" id="${P}-panel">
          <div class="seg"><button class="tab active" id="${P}-v1">自准直调节</button><button class="tab" id="${P}-v2">看光谱</button></div>
          <label class="ctl"><span>载物台（光栅）微调</span><output id="${P}-oi"></output><input type="range" id="${P}-i" min="-6" max="6" step="0.01"></label>
          <div class="readout" id="${P}-readout"></div>
          <canvas id="${P}-dial" class="strip"></canvas>
          ${turnControls(P,[[1/30,'微调'],[0.5,'中速'],[6,'快速']],{assist:'显示谱线名称',left:'◀ 望远镜左转',rightLabel:'望远镜右转 ▶'})}
          <div class="tip">按住按钮转动望远镜，也可以拖动刻度条；键盘 ← → 每次 1′（Shift 为 10′）。</div>
        </div>
      </div>`});
    init(); LabStore.restore(P,s); stats.records+=s.rows.length; $('#'+P+'-review').innerHTML=paras(s.review||''); $('#'+P+'-i').value=s.i;
    B=benchArea(P, Models3D.spectrometer, ()=>({T:s.T, Tz:s.Tz, i:s.i, left:left(), lineT, view:s.view}), {cap3d:'三维模型（光栅转角已放大显示）'});
    B.onChange=render;
    const setView=v=>{ s.view=v; $('#'+P+'-v1').classList.toggle('active',v==='auto'); $('#'+P+'-v2').classList.toggle('active',v==='spec'); render(); };
    $('#'+P+'-v1').onclick=()=>setView('auto');
    $('#'+P+'-v2').onclick=()=>setView('spec');
    $('#'+P+'-v1').classList.toggle('active',s.view==='auto'); $('#'+P+'-v2').classList.toggle('active',s.view==='spec');
    $('#'+P+'-i').addEventListener('input',e=>{ s.i=parseFloat(e.target.value); if (Math.abs(s.i)<0.05) s.aligned=true; render(); });
    $('#'+P+'-assist').onchange=render;
    bindHold($('#'+P+'-panel'), $('#'+P+'-speed'), d=>{ turn(d); render(); });
    bindDrag($('#'+P+'-dial'), 6, d=>{ turn(d/60); render(); });
    $('#'+P+'-rec').onclick=record;
    $('#'+P+'-undo').onclick=()=>{ s.checked=false; s.review=''; $('#'+P+'-review').innerHTML=''; if (s.rows.pop()) stats.records--; table(); render(); };
    $('#'+P+'-clr').onclick=()=>{ stats.records-=s.rows.length; s.rows=[]; s.checked=false; s.review=''; $('#'+P+'-review').innerHTML=''; table(); render(); };
    $('#'+P+'-check').onclick=review;
    table();
  }
  function key(dir,big){ turn(dir*(big?10:1)/60); render(); }

  /* ---------- 绘图 ---------- */
  function render(){
    if (s.view==='spec' && Math.abs(s.T-s.Tz)<0.1) s.zero=true;
    if (!(B.is3d() && B.update())) bench();
    view();
    drawStrip($('#'+P+'-dial'), left()*60, {px:6, label:k=>{ const m=((k%60)+60)%60; return m===0?`${(((Math.floor(k/60))%360)+360)%360}°`:`${m}′`; }});
    $('#'+P+'-readout').innerHTML=`<div>刻度盘读数</div><div class="v">左游标 ${dms(left())}　右游标 ${dms(right())}</div><div class="f">主刻度每格 0.5°，游标 30 格，精确到 1′</div>`;
    $('#'+P+'-oi').textContent=Math.abs(s.i)<0.05?'已垂直':'未垂直';
    const next=SEQ[s.rows.length];
    $('#'+P+'-rec').textContent = next ? `记录：第 ${next.n} 次 ${next.k>0?'+1':'−1'} 级绿线` : '已记满 3 次';
    renderSteps(P,[
      [s.aligned,'<b>调光栅</b>：在“自准直”视图中微调载物台，让绿色十字反射像与分划板<b>上方</b>那条横线的交点重合，光栅平面就垂直于入射光了。'],
      [s.zero,'<b>找零级</b>：切到“看光谱”，转动望远镜找到白色的零级狭缝像，并让它与竖直叉丝大致重合。'],
      [s.rows.length>=6,`<b>测量</b>：转到 +1 级<b>绿线</b>，竖直叉丝对准绿线中心后记录两个游标读数；再转到 −1 级绿线记录。重复 3 次（已记 ${s.rows.length}/6）。`],
      [s.checked,'<b>处理数据</b>：算出衍射角 φ 和光栅常数 d，再让 AI 助教检查。']]);
  }
  function bench(){
    const c=$('#'+P+'-bench'); const {ctx,W,H}=benchSetup(c);
    ctx.fillStyle='#0f1012'; ctx.fillRect(0,0,W,H);
    const cx=W*0.5, cy=118, Rd=78;
    ctx.strokeStyle='#3b4048'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(cx,cy,Rd,0,Math.PI*2); ctx.stroke();
    ctx.strokeStyle='#2b2f35'; ctx.lineWidth=1; for (let a=0;a<360;a+=10){ const r=a*Math.PI/180; ctx.beginPath(); ctx.moveTo(cx+Math.cos(r)*Rd,cy+Math.sin(r)*Rd); ctx.lineTo(cx+Math.cos(r)*(Rd-6),cy+Math.sin(r)*(Rd-6)); ctx.stroke(); }
    ctx.fillStyle='#3b4048'; ctx.fillRect(cx-Rd-96,cy-9,96,18); ctx.fillStyle='#e8e2ff'; ctx.beginPath(); ctx.arc(cx-Rd-108,cy,10,0,Math.PI*2); ctx.fill();   // 平行光管 + 汞灯
    ctx.strokeStyle='rgba(235,235,255,.6)'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(cx-Rd-10,cy); ctx.lineTo(cx,cy); ctx.stroke();
    LINES.forEach(L=>[1,-1].forEach(k=>{ const t=lineT(k,L.w); if (t==null) return; const a=-(t-s.Tz)*Math.PI/180;
      ctx.strokeStyle=cssColor(wl2rgb(L.w),0.15).replace('rgb','rgba').replace(')',',.55)'); ctx.lineWidth=1.2; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Math.cos(a)*(Rd+60),cy+Math.sin(a)*(Rd+60)); ctx.stroke(); }));
    ctx.strokeStyle='rgba(255,255,255,.7)'; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Rd+60,cy); ctx.stroke();
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(-s.i*3*Math.PI/180); ctx.fillStyle='#a9bbd6'; ctx.fillRect(-2,-22,4,44); ctx.restore();   // 光栅（倾角放大 3 倍）
    const ta=-(s.T-s.Tz)*Math.PI/180; ctx.save(); ctx.translate(cx,cy); ctx.rotate(ta); ctx.fillStyle='rgba(214,215,220,.85)'; ctx.fillRect(Rd+8,-8,100,16); ctx.fillStyle='#1f2226'; ctx.fillRect(Rd+100,-5,14,10); ctx.restore();
    ctx.fillStyle='#c9c8c2'; ctx.font='12px "PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif'; ctx.textAlign='left';
    ctx.fillText('汞灯',cx-Rd-122,cy+28); ctx.fillText('平行光管',cx-Rd-86,cy-16); ctx.fillText('光栅',cx-12,cy+40);
    ctx.fillText('望远镜',cx+Math.cos(ta)*(Rd+40)-18,cy+Math.sin(ta)*(Rd+40)+(Math.sin(ta)<0?-16:26));
  }
  function view(){
    const c=$('#'+P+'-view'), S=eyeSize(c); c.style.width=S+'px';
    const {ctx,dpr}=setup(c,S); ctx.setTransform(dpr,0,0,dpr,0,0);
    const ppd=S/(2*FOV), msg=$('#'+P+'-msg'), ctr=$('#'+P+'-counter');
    ctx.fillStyle='#08090b'; ctx.fillRect(0,0,S,S);
    ctx.save(); ctx.beginPath(); ctx.arc(S/2,S/2,S/2-2,0,Math.PI*2); ctx.clip();
    if (s.view==='auto'){
      ctx.fillStyle='#0d1a12'; ctx.fillRect(0,0,S,S);
      const x=S/2+2*s.i*ppd, y=S*0.3;
      if (Math.abs(x-S/2)<S/2){ ctx.strokeStyle='#5dff8a'; ctx.lineWidth=3; ctx.shadowColor='#5dff8a'; ctx.shadowBlur=8; ctx.beginPath(); ctx.moveTo(x-16,y); ctx.lineTo(x+16,y); ctx.moveTo(x,y-16); ctx.lineTo(x,y+16); ctx.stroke(); ctx.shadowBlur=0; }
      msg.textContent = Math.abs(s.i)<0.05 ? '✓ 十字像已与上叉丝重合，光栅已垂直' : Math.abs(x-S/2)>=S/2 ? `十字反射像不在视场内（偏${s.i>0?'右':'左'}），先粗调载物台` : '继续微调，让十字像落到上方叉丝交点';
      ctr.hidden=true;
    } else {
      const g=ctx.createRadialGradient(S/2,S/2,0,S/2,S/2,S/2); g.addColorStop(0,'#121418'); g.addColorStop(1,'#060708'); ctx.fillStyle=g; ctx.fillRect(0,0,S,S);
      const bar=(t,rgb,a)=>{ const x=S/2+(t-s.T)*ppd; if (x<-10||x>S+10) return;
        ctx.fillStyle=cssColor(rgb,0.25).replace('rgb','rgba').replace(')',`,${0.25*a})`); ctx.fillRect(x-6,0,12,S);
        ctx.fillStyle=cssColor(rgb,0.35).replace('rgb','rgba').replace(')',`,${a})`); ctx.fillRect(x-1.6,0,3.2,S); };
      bar(s.Tz,[1,1,1],1);
      const near=[];
      LINES.forEach(L=>[1,-1,2,-2].forEach(k=>{ const t=lineT(k,L.w); if (t==null) return; bar(t,wl2rgb(L.w),L.a*(Math.abs(k)===2?0.45:1)); if (Math.abs(t-s.T)<FOV) near.push(`${k>0?'+':'−'}${Math.abs(k)} 级 ${L.w} nm`); }));
      if (Math.abs(s.Tz-s.T)<FOV) near.unshift('零级（白光）');
      msg.textContent = near.length ? '' : '视场里没有谱线，继续转动望远镜';
      if ($('#'+P+'-assist').checked && near.length){ ctr.textContent='视场内：'+near.join('、'); ctr.hidden=false; } else ctr.hidden=true;
    }
    ctx.restore();
    ctx.strokeStyle='rgba(255,255,255,.75)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(S/2,6); ctx.lineTo(S/2,S-6); ctx.moveTo(S*0.15,S/2); ctx.lineTo(S*0.85,S/2); ctx.moveTo(S*0.3,S*0.3); ctx.lineTo(S*0.7,S*0.3); ctx.stroke();
    $('#'+P+'-cap').textContent = s.view==='auto' ? '望远镜视场：自准直' : '望远镜视场：汞灯光谱';
  }

  /* ---------- 数据 ---------- */
  function record(){
    const next=SEQ[s.rows.length];
    if (!next) return;
    if (!s.aligned||!s.zero||s.view!=='spec'){ $('#'+P+'-result').innerHTML='<div class="note">先完成第 1、2 步，并切到“看光谱”视图再记录。</div>'; return; }
    const t=lineT(next.k,GREEN);
    s.rows.push({...next, L:roundMin(left()), R:roundMin(right()), off:+((s.T-t)*60).toFixed(1)});
    s.checked=false; s.review=''; $('#'+P+'-review').innerHTML='';
    stats.records++; logEvent('lab_record',{lab:P,n:s.rows.length,row:s.rows[s.rows.length-1]}); table(); render();
  }
  function groups(){
    const g={}; s.rows.forEach(r=>{ (g[r.n]=g[r.n]||{})[r.k]=r; });
    return Object.keys(g).map(Number).sort().map(n=>{ const a=g[n][1], b=g[n][-1]; if (!a||!b) return {n,a,b};
      const pL=angDiff(a.L,b.L)/2, pR=angDiff(a.R,b.R)/2, phi=(pL+pR)/2;
      return {n,a,b,pL,pR,phi,d:phi>0?GREEN/sinD(phi):null,cross:Math.abs(a.R-b.R)>180}; });
  }
  function calc(){
    const gs=groups(), ok=gs.filter(x=>Number.isFinite(x.d)&&x.d>0); if (!ok.length) return {gs,ok};
    if(gs.some(x=>x.a&&x.b&&x.d==null)) return {gs,ok:[]};
    const mean=ok.reduce((a,b)=>a+b.d,0)/ok.length;
    return {gs,ok,mean,err:(mean-D_TRUE)/D_TRUE*100};
  }
  function table(){
    LabStore.save(P,s);
    renderStats();
    if (!s.rows.length){ $('#'+P+'-table').innerHTML='<div class="empty">还没有数据。完成调节后，对准 +1 级绿线开始记录。</div>'; $('#'+P+'-result').innerHTML=''; return; }
    const c=calc();
    $('#'+P+'-table').innerHTML=`<table class="data"><tr><th>次数</th><th>+1 级 θ₁</th><th>+1 级 θ₂</th><th>−1 级 θ₁′</th><th>−1 级 θ₂′</th><th>φ</th></tr>`+
      c.gs.map(x=>`<tr><td>${x.n}</td><td>${x.a?dms(x.a.L):'—'}</td><td>${x.a?dms(x.a.R):'—'}</td><td>${x.b?dms(x.b.L):'—'}</td><td>${x.b?dms(x.b.R):'—'}</td><td>${x.phi!=null?dms(x.phi):'—'}</td></tr>`).join('')+'</table>';
    $('#'+P+'-result').innerHTML = c.ok.length ? `<div class="result">各次光栅常数：${c.ok.map(x=>x.d.toFixed(1)).join('、')} nm
        <div>平均 d = <span class="big">${c.mean.toFixed(1)} nm</span>（约 ${(1e6/c.mean).toFixed(1)} 线/mm）　标称 1666.7 nm（600 线/mm）　相对误差 <b>${c.err>=0?'+':''}${c.err.toFixed(2)}%</b></div>
        ${c.ok.some(x=>x.cross)?'<div class="hint">有右游标读数跨过了 0°，计算夹角时已自动加 360°。</div>':''}</div>`
      : '<div class="hint" style="margin-top:8px">需要 +1、−1 级的有效读数。角度差为零时无法计算，请撤销重复记录并重新对准谱线。</div>';
  }

  /* ---------- AI 批改 ---------- */
  function offline(c){
    const p=[], level=Math.abs(c.err)<0.5?'很好':Math.abs(c.err)<1.5?'基本合格':'偏大';
    if (c.ok.length<3) p.push(`只完成了 ${c.ok.length} 次测量，建议重复 3 次`);
    const wrong=s.rows.filter(r=>Math.abs(r.off)>20), loose=s.rows.filter(r=>Math.abs(r.off)>1.5&&Math.abs(r.off)<=20);
    if (wrong.length) p.push(`${wrong.map(r=>`第 ${r.n} 次 ${r.k>0?'+1':'−1'} 级`).join('、')}对准的很可能不是绿线（偏离 ${wrong.map(r=>Math.abs(r.off).toFixed(0)+'′').join('、')}）`);
    if (loose.length) p.push(`${loose.map(r=>`第 ${r.n} 次 ${r.k>0?'+1':'−1'} 级`).join('、')}叉丝没有压在绿线正中（偏 ${loose.map(r=>Math.abs(r.off).toFixed(1)+'′').join('、')}）`);
    if (Math.abs(s.i)>=0.05) p.push(`光栅现在没有严格垂直于入射光（偏 ${s.i.toFixed(2)}°），±1 级会不对称`);
    const g=c.ok[0], ecc=g?Math.abs(g.pL-g.pR)*60:0;
    return [`【总评】完成 ${c.ok.length} 次测量，平均光栅常数 d = ${c.mean.toFixed(1)} nm，与标称值 1666.7 nm 的相对误差为 ${c.err.toFixed(2)}%，结果${level}。`,
      '【数据问题】'+(p.length?p.join('；')+'。':'没有发现明显问题，三次结果一致。')+(g?` 另外，第 1 次只用左游标算出的 φ 与只用右游标算出的相差约 ${ecc.toFixed(1)}′，这就是偏心差，取两游标平均后已经消除。`:''),
      '【误差来源】叉丝对准谱线中心的误差、游标读数误差（1′）、光栅没有严格垂直于入射光、望远镜和平行光管没有严格调到平行光状态。',
      '【改进建议】对准时用微调速度，让竖直叉丝压在谱线正中；每个位置都读两个游标；读数跨过 0° 时先加 360° 再相减；测量前用自准法反复检查光栅是否垂直。'].join('\n');
  }
  function review(){
    const c=calc();
    runReview(P,{
      check:()=>c.ok.length?'':'需要至少一组有效的 +1、−1 级读数，且所有完整组的角度差均非零。',
      prompt:()=>`你是大学物理实验课的助教，正在批改大一学生“分光计测光栅常数”的实验数据。汞灯绿线 λ = 546.1 nm，光栅标称 600 线/mm（d = 1666.7 nm）。φ = ¼(|θ₁−θ₁′|+|θ₂−θ₂′|)，d = λ/sinφ。
学生的记录（θ₁、θ₂ 为左右游标读数）：
${c.gs.map(x=>`第 ${x.n} 次：+1 级 θ₁=${x.a?dms(x.a.L):'未记'} θ₂=${x.a?dms(x.a.R):'未记'}；−1 级 θ₁′=${x.b?dms(x.b.L):'未记'} θ₂′=${x.b?dms(x.b.R):'未记'}${x.phi!=null?`；φ=${dms(x.phi)}，d=${x.d.toFixed(1)} nm（只用左游标 φ=${(x.pL).toFixed(4)}°，只用右游标 φ=${(x.pR).toFixed(4)}°）`:''}`).join('\n')}
平均 d = ${c.mean.toFixed(1)} nm，相对误差 ${c.err.toFixed(2)}%。
系统记录的操作情况：每次记录时竖直叉丝偏离绿线中心的角度（′，偏离超过 20′ 说明对准的可能是别的谱线）：${s.rows.map(r=>`第${r.n}次${r.k>0?'+1':'−1'}级:${r.off}`).join('，')}；当前光栅与入射光垂直度偏差 ${s.i.toFixed(2)}°。
请给出批改意见：中文，200~300 字，分 4 段，每段开头依次写【总评】【数据问题】【误差来源】【改进建议】，段与段之间换行。可以顺带解释为什么要读两个游标。只根据给出的数据说话，语气像耐心的助教，不要使用 Markdown。`,
      offline:()=>offline(c)
    }).then(ok=>{ if(ok){ s.checked=true; s.review=ok; LabStore.save(P,s); render(); } });
  }
  return {mount, render, key};
})();
