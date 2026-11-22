/* =====================================================================
 * lab-spectrometer.js —— 虚拟实验：分光计测光栅常数（汞灯绿线 546.1 nm）
 * 操作：自准法调光栅垂直 → 找零级 → 对准 ±1 级绿线读双游标，重复 3 次 → d = λ / sinφ
 * ===================================================================== */
const SP = (() => {
  const P='sp', D_TRUE=1e6/600;                        // 600 线/mm 光栅，d = 1666.7 nm
  const LINES=[{w:404.7,a:.45},{w:435.8,a:.7},{w:546.1,a:1},{w:577.0,a:.75},{w:579.1,a:.75}];
  const GREEN=546.1, FOV=1.25;                         // 视场半宽 (°)
  const SEQ=[1,2,3].flatMap(n=>[{n,k:1},{n,k:-1}]).concat([{n:4,k:1,x:true},{n:4,k:-1,x:true}]);   // 第 4 组：待测谱线
  const INST=1/60;                                    // 游标的仪器误差限：1′
  const UNKNOWN={435.8:'蓝紫色谱线', 404.7:'紫色谱线'};
  const s={}; let B=null;
  let X={target:435.8};                               // 待测谱线的真实波长，批改前不显示；单独保存，旧存档照样能打开
  const sinD=x=>Math.sin(x*Math.PI/180), asinD=x=>Math.asin(x)*180/Math.PI;

  function init(){
    Object.assign(s,{Tz:rnd(110,250), i:(Math.random()<.5?-1:1)*rnd(2.5,5), e:rnd(2,5)/60, psi:rnd(0,360),
      view:'auto', aligned:false, zero:false, rows:[], checked:false});
    s.T=s.Tz+rnd(-35,-25);
    X={target: rnd(0,1)<0.5 ? 435.8 : 404.7};
  }
  const save=()=>LabStore.save(P,{...s,x:X});
  const targetName=()=>UNKNOWN[X.target]||'待测谱线';
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
        <p>刻度盘中心和转轴不完全重合会产生“偏心差”，所以每个位置都要读<b>左右两个游标</b>：φ = ¼(|θ₁ − θ₁′| + |θ₂ − θ₂′|)，偏心差会相互抵消。光栅不垂直于入射光时，±1 级不对称，需要先用自准法把光栅调垂直。</p>
        <p>标定完光栅常数后，再测一条没有标明波长的谱线：<b>λ = d̄ · sinφ</b>。d̄ 的不确定度会和这次的角度误差一起传到 λ 上：u(λ)/λ = √[(u<sub>d</sub>/d̄)² + (cotφ · u<sub>φ</sub>)²]。</p>
        <p>不确定度：A 类取各次 d 的平均值标准偏差；B 类由游标的仪器误差限 Δ<sub>仪</sub> = 1′ 估算，φ 由四个读数算出，u(φ) = Δ<sub>仪</sub>/(2√3)，再按 d = λ/sinφ 传递。</p>`,
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
    init(); const saved=LabStore.restore(P,s); if (saved && saved.x && UNKNOWN[saved.x.target]) X={target:saved.x.target}; stats.records+=s.rows.length; $('#'+P+'-review').innerHTML=paras(s.review||''); $('#'+P+'-i').value=s.i;
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
    $('#'+P+'-rec').textContent = !next ? '已全部记录' : next.x ? `记录：待测谱线 ${next.k>0?'+1':'−1'} 级` : `记录：第 ${next.n} 次 ${next.k>0?'+1':'−1'} 级绿线`;
    renderSteps(P,[
      [s.aligned,'<b>调光栅</b>：在“自准直”视图中微调载物台，让绿色十字反射像与分划板<b>上方</b>那条横线的交点重合，光栅平面就垂直于入射光了。'],
      [s.zero,'<b>找零级</b>：切到“看光谱”，转动望远镜找到白色的零级狭缝像，并让它与竖直叉丝大致重合。'],
      [s.rows.length>=6,`<b>标定光栅</b>：转到 +1 级<b>绿线</b>，竖直叉丝对准绿线中心后记录两个游标读数；再转到 −1 级绿线记录。重复 3 次（已记 ${Math.min(s.rows.length,6)}/6）。`],
      [s.rows.length>=8,`<b>测未知谱线</b>：用刚标定的光栅，对准<b>${targetName()}</b>的 +1、−1 级各记录一次，求它的波长（已记 ${Math.max(0,s.rows.length-6)}/2）。`],
      [s.checked,'<b>处理数据</b>：算出光栅常数、未知波长和不确定度，再让 AI 助教检查。']]);
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
      LINES.forEach(L=>[1,-1,2,-2].forEach(k=>{ const t=lineT(k,L.w); if (t==null) return; bar(t,wl2rgb(L.w),L.a*(Math.abs(k)===2?0.45:1)); if (Math.abs(t-s.T)<FOV) near.push(`${k>0?'+':'−'}${Math.abs(k)} 级 ${UNKNOWN[L.w]&&!s.checked?UNKNOWN[L.w]:L.w+' nm'}`); }));
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
    const t=lineT(next.k,next.x?X.target:GREEN);
    s.rows.push({...next, L:roundMin(left()), R:roundMin(right()), off:+((s.T-t)*60).toFixed(1)});
    s.checked=false; s.review=''; $('#'+P+'-review').innerHTML='';
    stats.records++; logEvent('lab_record',{lab:P,n:s.rows.length,row:s.rows[s.rows.length-1]}); table(); render();
  }
  function groups(){
    const g={}; s.rows.filter(r=>!r.x).forEach(r=>{ (g[r.n]=g[r.n]||{})[r.k]=r; });
    return Object.keys(g).map(Number).sort().map(n=>{ const a=g[n][1], b=g[n][-1]; if (!a||!b) return {n,a,b};
      const pL=angDiff(a.L,b.L)/2, pR=angDiff(a.R,b.R)/2, phi=(pL+pR)/2;
      return {n,a,b,pL,pR,phi,d:phi>0?GREEN/sinD(phi):null,cross:Math.abs(a.R-b.R)>180}; });
  }
  function calc(){
    const gs=groups(), ok=gs.filter(x=>Number.isFinite(x.d)&&x.d>0); if (!ok.length) return {gs,ok};
    if(gs.some(x=>x.a&&x.b&&x.d==null)) return {gs,ok:[]};
    const mean=ok.reduce((a,b)=>a+b.d,0)/ok.length;
    // B 类：u(φ) = Δ仪/(2√3)（弧度），d = λ/sinφ ⇒ u_B(d) = d̄·cotφ̄·u(φ)
    const uPhi=INST/(2*Unc.SQRT3)*Math.PI/180, phiMean=Unc.mean(ok.map(x=>x.phi))*Math.PI/180;
    const sum=Unc.summarize(ok.map(x=>x.d), mean/Math.tan(phiMean)*uPhi);
    return {gs,ok,mean,sum,err:(mean-D_TRUE)/D_TRUE*100,unknown:unknown(mean,sum.u,uPhi)};
  }
  /* 待测谱线：λ = d̄·sinφ，标定的不确定度 u_d 与本次角度的不确定度一起传递 */
  function unknown(d,ud,uPhi){
    const a=s.rows.find(r=>r.x&&r.k===1), b=s.rows.find(r=>r.x&&r.k===-1);
    if (!a||!b) return {a,b};
    const phi=(angDiff(a.L,b.L)+angDiff(a.R,b.R))/4;
    if (!(phi>0)) return {a,b,invalid:true};
    const pr=phi*Math.PI/180, lam=d*Math.sin(pr);
    const fromD=ud*Math.sin(pr), fromPhi=d*Math.cos(pr)*uPhi, u=Math.hypot(fromD,fromPhi);
    return {a,b,phi,lam,u,fromD,fromPhi,err:(lam-X.target)/X.target*100,target:X.target};
  }
  function table(){
    save();
    renderStats();
    if (!s.rows.length){ $('#'+P+'-table').innerHTML='<div class="empty">还没有数据。完成调节后，对准 +1 级绿线开始记录。</div>'; $('#'+P+'-result').innerHTML=''; return; }
    const c=calc();
    $('#'+P+'-table').innerHTML=`<table class="data"><tr><th>次数</th><th>+1 级 θ₁</th><th>+1 级 θ₂</th><th>−1 级 θ₁′</th><th>−1 级 θ₂′</th><th>φ</th></tr>`+
      c.gs.map(x=>`<tr><td>${x.n}</td><td>${x.a?dms(x.a.L):'—'}</td><td>${x.a?dms(x.a.R):'—'}</td><td>${x.b?dms(x.b.L):'—'}</td><td>${x.b?dms(x.b.R):'—'}</td><td>${x.phi!=null?dms(x.phi):'—'}</td></tr>`).join('')+
      (()=>{ const a=s.rows.find(r=>r.x&&r.k===1), b=s.rows.find(r=>r.x&&r.k===-1), u=c.unknown;
        return a||b ? `<tr><td>待测</td><td>${a?dms(a.L):'—'}</td><td>${a?dms(a.R):'—'}</td><td>${b?dms(b.L):'—'}</td><td>${b?dms(b.R):'—'}</td><td>${u&&u.phi!=null?dms(u.phi):'—'}</td></tr>` : ''; })()+'</table>';
    $('#'+P+'-result').innerHTML = c.ok.length ? `<div class="result">各次光栅常数：${c.ok.map(x=>x.d.toFixed(1)).join('、')} nm
        <div>平均 d = <span class="big">${c.mean.toFixed(1)} nm</span>（约 ${(1e6/c.mean).toFixed(1)} 线/mm）　标称 1666.7 nm（600 线/mm）　相对误差 <b>${c.err>=0?'+':''}${c.err.toFixed(2)}%</b></div>
        ${Unc.html(c.sum,'d','nm')}
        ${c.ok.some(x=>x.cross)?'<div class="hint">有右游标读数跨过了 0°，计算夹角时已自动加 360°。</div>':''}</div>${unknownHtml(c)}`
      : '<div class="hint" style="margin-top:8px">需要 +1、−1 级的有效读数。角度差为零时无法计算，请撤销重复记录并重新对准谱线。</div>';
  }
  function unknownHtml(c){
    const u=c.unknown; if (!u || !u.a || !u.b) return '';
    if (u.invalid) return '<div class="note">待测谱线的 +1、−1 级读数角度差为零，无法计算，请撤销后重新对准。</div>';
    const f=Unc.format(u.lam,u.u,'nm'), p=v=>(+v.toPrecision(3)).toString();
    const reveal = s.checked
      ? `<div>标准值 ${u.target} nm，相对偏差 <b>${u.err>=0?'+':''}${u.err.toFixed(2)}%</b>；同时光栅常数的相对偏差为 ${c.err>=0?'+':''}${c.err.toFixed(2)}%。λ = d̄·sinφ，光栅常数标定偏大多少，测出的波长也会按同样比例偏大。</div>`
      : '<div class="hint">待测谱线的标准值在 AI 批改后显示。</div>';
    return `<div class="result">待测谱线（${targetName()}）：φ = ${dms(u.phi)}，λ = d̄·sinφ = <span class="big">${u.lam.toFixed(1)} nm</span>
      <div class="unc">不确定度：来自光栅常数 u<sub>d</sub>·sinφ = ${p(u.fromD)} nm，来自本次角度测量 d̄·cosφ·u<sub>φ</sub> = ${p(u.fromPhi)} nm，合成 u = ${p(u.u)} nm
      <div>结果：<b>λ = ${f.text}</b>，相对不确定度 ${f.rel.toFixed(2)}%</div></div>${reveal}</div>`;
  }

  /* ---------- AI 批改 ---------- */
  function offline(c){
    const p=[], level=Math.abs(c.err)<0.5?'很好':Math.abs(c.err)<1.5?'基本合格':'偏大';
    if (c.ok.length<3) p.push(`只完成了 ${c.ok.length} 次测量，建议重复 3 次`);
    const wrong=s.rows.filter(r=>Math.abs(r.off)>20), loose=s.rows.filter(r=>Math.abs(r.off)>1.5&&Math.abs(r.off)<=20);
    const lab=r=>r.x?`待测谱线 ${r.k>0?'+1':'−1'} 级`:`第 ${r.n} 次 ${r.k>0?'+1':'−1'} 级`;
    if (wrong.length) p.push(`${wrong.map(lab).join('、')}对准的很可能不是要测的谱线（偏离 ${wrong.map(r=>Math.abs(r.off).toFixed(0)+'′').join('、')}）`);
    if (loose.length) p.push(`${loose.map(lab).join('、')}叉丝没有压在谱线正中（偏 ${loose.map(r=>Math.abs(r.off).toFixed(1)+'′').join('、')}）`);
    if (Math.abs(s.i)>=0.05) p.push(`光栅现在没有严格垂直于入射光（偏 ${s.i.toFixed(2)}°），±1 级会不对称`);
    const g=c.ok[0], ecc=g?Math.abs(g.pL-g.pR)*60:0, u=c.unknown;
    const unk = u&&u.lam ? `待测谱线测得 λ = ${Unc.format(u.lam,u.u,'nm').text}，标准值 ${u.target} nm，相对偏差 ${u.err.toFixed(2)}%，${Math.abs(u.err-c.err)<0.2?'和光栅常数的偏差基本一致，说明误差主要来自标定':'与光栅常数的偏差不同，说明这次对准待测谱线时还有额外误差'}。` : '还没有测待测谱线，建议用标定好的光栅测一次，检验标定是否可靠。';
    return [`【总评】完成 ${c.ok.length} 次标定，光栅常数 d = ${Unc.format(c.sum.mean,c.sum.u,'nm').text}，与标称值 1666.7 nm 的相对误差为 ${c.err.toFixed(2)}%，结果${level}。${unk}`,
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
平均 d = ${c.mean.toFixed(1)} nm，相对误差 ${c.err.toFixed(2)}%。${Unc.line(c.sum,'d','nm')}（B 类按游标 1′ 估算）。
${c.unknown&&c.unknown.lam?`标定后测量待测谱线（学生不知道它的波长）：+1 级 θ₁=${dms(c.unknown.a.L)} θ₂=${dms(c.unknown.a.R)}，−1 级 θ₁′=${dms(c.unknown.b.L)} θ₂′=${dms(c.unknown.b.R)}，φ=${dms(c.unknown.phi)}，λ = d̄·sinφ = ${c.unknown.lam.toFixed(1)} nm，不确定度 ${c.unknown.u.toFixed(2)} nm（其中来自光栅常数 ${c.unknown.fromD.toFixed(2)} nm，来自本次角度 ${c.unknown.fromPhi.toFixed(2)} nm）；真实波长 ${c.unknown.target} nm，相对偏差 ${c.unknown.err.toFixed(2)}%。请说明标定的偏差怎样传到了这个结果里。`:'学生还没有测待测谱线。'}
系统记录的操作情况：每次记录时竖直叉丝偏离绿线中心的角度（′，偏离超过 20′ 说明对准的可能是别的谱线）：${s.rows.map(r=>`${r.x?'待测谱线':`第${r.n}次`}${r.k>0?'+1':'−1'}级:${r.off}`).join('，')}；当前光栅与入射光垂直度偏差 ${s.i.toFixed(2)}°。
请给出批改意见：中文，250~350 字，分 4 段，每段开头依次写【总评】【数据问题】【误差来源】【改进建议】，段与段之间换行。可以顺带解释为什么要读两个游标；【误差来源】里结合不确定度说明主要误差来自哪里。只根据给出的数据说话，语气像耐心的助教，不要使用 Markdown。`,
      offline:()=>offline(c)
    }).then(ok=>{ if(ok){ s.checked=true; s.review=ok; table(); render(); } });
  }
  return {mount, render, key};
})();
