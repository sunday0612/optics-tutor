/* =====================================================================
 * lab-prism.js —— 虚拟实验：分光计测三棱镜折射率（最小偏向角法）
 * 前提：分光计本身已调好（望远镜调焦到无穷远、光轴垂直于转轴，平行光管出射平行光）
 * 操作：调平三棱镜 → 自准法测顶角 A → 找最小偏向位置测 δ_min（汞绿线）→ 取下棱镜测直射光位置
 *       → n = sin[(A + δ_min)/2] / sin(A/2)；选做：测其他谱线，作 n − 1/λ² 图得色散（柯西公式）
 * ===================================================================== */
const PM = (() => {
  const P='pm', Rd=Math.PI/180;
  const LINES=[{w:404.7,a:.5,c:'紫'},{w:435.8,a:.75,c:'蓝紫'},{w:546.1,a:1,c:'绿'},{w:577.0,a:.8,c:'黄'},{w:579.1,a:.8,c:'黄'}];
  const GREEN=546.1, FOV=1.25, INST=1/60, UB=INST/Math.sqrt(3);     // 由读数差的平均得到的角度：u_B = Δ仪/√3
  const FACE={1:'AB',2:'AC'};
  const s={}; let B=null, tgt='tel', flash='', flashT=0, dir=0;
  const wrap=a=>((a%360)+540)%360-180;
  const sg=()=>Math.random()<.5?-1:1;

  /* ---------- 物理：柯西色散的玻璃，二维光线追迹 ---------- */
  const nOf=w=>s.ga+s.gb/(w*w);
  const nrm=k=>s.rho+(k===1?1:-1)*(90-s.A/2);                      // 光学面 AB(1)、AC(2) 的外法线方向
  function refract(d,N,eta){ const ci=-(d[0]*N[0]+d[1]*N[1]); if (ci<=0) return null;
    const k=1-eta*eta*(1-ci*ci); if (k<0) return null; const ct=Math.sqrt(k);
    return [eta*d[0]+(eta*ci-ct)*N[0], eta*d[1]+(eta*ci-ct)*N[1]]; }
  /* 平行光沿 +x 入射：从一个面进、另一个面出，返回偏向（带符号，度）和入射角 */
  function trace(w, rho=s.rho){
    const n=nOf(w), h=(90-s.A/2)*Rd, b=rho*Rd;
    for (const [p,q] of [[b+h,b-h],[b-h,b+h]]){
      const N1=[Math.cos(p),Math.sin(p)], N2=[Math.cos(q),Math.sin(q)];
      const t=refract([1,0],N1,1/n); if (!t) continue;
      const e=refract(t,[-N2[0],-N2[1]],n); if (!e) continue;
      return {dev:Math.atan2(e[1],e[0])/Rd, i1:Math.acos(-N1[0])/Rd};
    }
    return null;
  }
  const dmin=w=>{ const n=nOf(w); return 2*Math.asin(Math.min(1,n*Math.sin(s.A/2*Rd)))/Rd-s.A; };
  /* 绿线最小偏向时的载物台位置：粗扫再三分 */
  function rhoMin(w=GREEN){
    let best=null; for (let r=0;r<360;r+=0.5){ const t=trace(w,r); if (t&&(!best||Math.abs(t.dev)<best.d)) best={r,d:Math.abs(t.dev)}; }
    if (!best) return null; let a=best.r-0.6, b=best.r+0.6;
    const f=r=>{ const t=trace(w,r); return t?Math.abs(t.dev):1e9; };
    for (let k=0;k<80;k++){ const m1=a+(b-a)/3, m2=b-(b-a)/3; if (f(m1)<f(m2)) b=m2; else a=m1; }
    return (a+b)/2;
  }
  const lineT=w=>{ if (!s.on) return null; const t=trace(w); return t?s.Tz+t.dev:null; };
  const ecc=()=>s.e*Math.sin((s.T+s.psi)*Rd);
  const left=()=>s.T+ecc(), right=()=>s.T+180-ecc();
  const roundMin=x=>Math.round(((x%360)+360)%360*60)/60;
  const stageRead=()=>((s.rho+s.so)%360+360)%360;
  const levelOK=()=>Math.abs(s.t1)<0.03&&Math.abs(s.t2)<0.03;
  function faceSeen(){ const th=s.T-s.Tz; for (const k of [1,2]){ const eps=wrap(th-nrm(k)); if (s.on && Math.abs(2*eps)<FOV) return {k,eps}; } return null; }

  function init(){
    Object.assign(s,{Tz:rnd(110,250), A:rnd(59.6,60.4), ga:rnd(1.612,1.632), gb:rnd(1.1e4,1.4e4), e:rnd(2,5)/60, psi:rnd(0,360), so:rnd(0,360),
      t1:sg()*rnd(.35,.7), t2:sg()*rnd(.35,.7), on:true, view:'auto', rows:[], checked:false, review:''});
    const r0=rhoMin(); s.rho=r0+sg()*rnd(9,13); if (!trace(GREEN)) s.rho=r0+9;
    s.T=s.Tz+wrap(nrm(1))+sg()*rnd(8,15);
  }
  const save=()=>LabStore.save(P,s);

  /* ---------- 页面 ---------- */
  function mount(el){
    el.innerHTML=labShell(P,{
      title:'分光计测三棱镜折射率（最小偏向角法）',
      principle:`<p>光线经三棱镜两次折射后偏离原方向的角度叫<b>偏向角 δ</b>。转动棱镜改变入射角 i₁ 时，δ 先减小后增大；当光线在棱镜内平行于底边（i₁ = i₂′，光路对称）时 δ 最小，称为<b>最小偏向角 δ<sub>min</sub></b>，此时 <b>n = sin[(A + δ<sub>min</sub>)/2] / sin(A/2)</b>，A 是棱镜顶角。</p>
        <p><b>调平三棱镜</b>：分光计已调好（望远镜对无穷远调焦、光轴垂直于转轴）。把棱镜的一个光学面垂直于两个调平螺丝的连线放好，于是螺丝 b₁ 只改变 AB 面的倾斜、螺丝 b₂ 只改变 AC 面的倾斜。用自准法看两个面反射回来的绿十字像，分别调对应的螺丝，让像落在分划板<b>上方</b>横线上。</p>
        <p><b>自准法测顶角</b>：载物台固定不动，转望远镜先后正对 AB 面、AC 面（反射十字像与上方叉丝交点重合），两次方位差为 φ，<b>A = 180° − φ</b>。每次读左右两个游标取平均，消除度盘偏心差。<b>两次之间不能碰载物台</b>，否则 φ 里混进了棱镜转过的角度。</p>
        <p><b>测最小偏向角</b>：用眼睛先找到折射出来的谱线，再转载物台、用望远镜跟住绿线，直到绿线停下并开始反向——转折点就是最小偏向位置，读出此时望远镜的读数；然后取下棱镜，读直射光（狭缝像）的位置，两者之差就是 δ<sub>min</sub>。</p>
        <p>不确定度：A 与 δ<sub>min</sub> 都由两个读数差的平均得到，u<sub>B</sub> = Δ<sub>仪</sub>/√3（Δ<sub>仪</sub> = 1′）；再按 ∂n/∂δ = cos[(A+δ)/2] / [2 sin(A/2)]、∂n/∂A = −sin(δ/2) / [2 sin²(A/2)]（角度用弧度）传递到 n。</p>
        <p><b>选做（色散）</b>：再测几条汞谱线的最小偏向角，作 n − 1/λ² 图，近似是直线：<b>n = a + b/λ²</b>（柯西公式）。</p>`,
      right:`<div class="canvas-wrap fill"><canvas id="${P}-bench"></canvas><div class="caption">分光计俯视图（示意）</div></div>
      <div class="lab-grid">
        <div class="canvas-wrap"><canvas id="${P}-view" class="eye"></canvas><div class="caption" id="${P}-cap">望远镜视场</div><div class="msg" id="${P}-msg"></div><div class="counter" id="${P}-counter"></div></div>
        <div class="panel" id="${P}-panel">
          <div class="seg"><button class="tab" id="${P}-v1">自准（测顶角）</button><button class="tab" id="${P}-v2">看光谱</button></div>
          <div id="${P}-levbox">
            <label class="ctl"><span>调平螺丝 b₁（AB 面）</span><output id="${P}-o1"></output><input type="range" id="${P}-l1" min="-1" max="1" step="0.005"></label>
            <label class="ctl"><span>调平螺丝 b₂（AC 面）</span><output id="${P}-o2"></output><input type="range" id="${P}-l2" min="-1" max="1" step="0.005"></label>
          </div>
          <div class="row" style="margin-top:0"><button class="ghost" id="${P}-onoff"></button></div>
          <div class="readout" id="${P}-readout"></div>
          <canvas id="${P}-dial" class="strip"></canvas>
          <div class="seg" id="${P}-tgt"><button class="tab" data-t="tel">转望远镜</button><button class="tab" data-t="stage">转载物台</button></div>
          ${turnControls(P,[[1/30,'微调'],[0.5,'中速'],[6,'快速']],{assist:'显示谱线名称',left:'◀ 左转',rightLabel:'右转 ▶'})}
          <div class="tip">按住按钮转动，也可以拖动刻度条（转望远镜）；键盘 ← → 每次 1′（Shift 为 10′），转的是上面选中的部件。</div>
        </div>
      </div>`});
    init(); LabStore.restore(P,s); stats.records+=s.rows.length; $('#'+P+'-review').innerHTML=paras(s.review||'');
    B=benchArea(P, Models3D.prism, ()=>({T:s.T, Tz:s.Tz, rho:s.rho, A:s.A, on:s.on, left:left(), lineT:(k,w)=>lineT(w), view:s.view}), {cap3d:'三维模型'});
    B.onChange=render;
    $('#'+P+'-result').insertAdjacentHTML('afterend',`<div class="graphs" id="${P}-graph"></div>`);
    const setView=v=>{ s.view=v; save(); render(); };
    $('#'+P+'-v1').onclick=()=>setView('auto');
    $('#'+P+'-v2').onclick=()=>setView('spec');
    [['l1','t1'],['l2','t2']].forEach(([id,k])=>{ const e=$('#'+P+'-'+id); e.value=s[k]; e.addEventListener('input',ev=>{ s[k]=parseFloat(ev.target.value); save(); render(); }); });
    $('#'+P+'-onoff').onclick=()=>{ s.on=!s.on; save(); render(); };
    $('#'+P+'-tgt').onclick=e=>{ const b=e.target.closest('button'); if (b){ tgt=b.dataset.t; render(); } };
    $('#'+P+'-assist').onchange=render;
    bindHold($('#'+P+'-panel'), $('#'+P+'-speed'), d=>{ turn(d); render(); });
    bindDrag($('#'+P+'-dial'), 6, d=>{ const t=tgt; tgt='tel'; turn(d/60); tgt=t; render(); });
    $('#'+P+'-rec').onclick=record;
    $('#'+P+'-undo').onclick=()=>{ if (s.rows.pop()) stats.records--; dirty(); };
    $('#'+P+'-clr').onclick=()=>{ stats.records-=s.rows.length; s.rows=[]; dirty(); };
    $('#'+P+'-check').onclick=review;
    table();
  }
  function dirty(){ s.checked=false; s.review=''; $('#'+P+'-review').innerHTML=''; table(); render(); }
  /* 转动：望远镜不能转进平行光管；转载物台时盯住绿线，发现它折返就提示 */
  function turn(d){
    if (tgt==='stage'){
      const before=trace(GREEN); s.rho+=d; const after=trace(GREEN);
      if (s.on && s.view==='spec' && before && after){ const ch=Math.abs(after.dev)-Math.abs(before.dev);
        if (dir<0 && ch>0){ flash='绿线停下并开始反向：刚才的转折点就是最小偏向位置。退回转折点，再用望远镜对准绿线记录。'; flashT=Date.now(); }
        if (Math.abs(ch)>1e-7) dir=Math.sign(ch); }
    } else {
      const T0=s.T; s.T+=d;
      if (Math.abs(wrap(s.T-s.Tz-180))<16){ s.T=T0; flash='望远镜碰到平行光管了，转不过去。需要的话先转载物台，让要测的光学面朝向别处。'; flashT=Date.now(); }
    }
  }
  function key(dir,big){ turn(dir*(big?10:1)/60); render(); }

  /* ---------- 绘图 ---------- */
  function render(){
    if (!(B.is3d() && B.update())) bench();
    view();
    drawStrip($('#'+P+'-dial'), left()*60, {px:6, label:k=>{ const m=((k%60)+60)%60; return m===0?`${(((Math.floor(k/60))%360)+360)%360}°`:`${m}′`; }});
    $('#'+P+'-readout').innerHTML=`<div>刻度盘读数（望远镜）</div><div class="v">左游标 ${dms(left())}　右游标 ${dms(right())}</div><div class="f">载物台位置约 ${stageRead().toFixed(1)}°（转台刻线，只作参考）</div>`;
    $('#'+P+'-v1').classList.toggle('active',s.view==='auto'); $('#'+P+'-v2').classList.toggle('active',s.view==='spec');
    document.querySelectorAll('#'+P+'-tgt .tab').forEach(b=>b.classList.toggle('active',b.dataset.t===tgt));
    $('#'+P+'-levbox').hidden=s.view!=='auto';
    const lv=v=>Math.abs(v)<0.03?'✓ 已调平':'—'; $('#'+P+'-o1').textContent=lv(s.t1); $('#'+P+'-o2').textContent=lv(s.t2);
    $('#'+P+'-onoff').textContent=s.on?'取下三棱镜（测直射光位置）':'放回三棱镜';
    const c=calc(), nA=c.pairs.length, nG=(c.lines.find(l=>l.w===GREEN)||{rows:[]}).rows.length, others=c.lines.filter(l=>l.w!==GREEN).length;
    const rec=$('#'+P+'-rec'); rec.textContent = s.view==='auto' ? '记录：顶角（当前光学面）' : s.on ? '记录：最小偏向位置' : '记录：直射光位置';
    renderSteps(P,[
      [levelOK(),'<b>调平三棱镜</b>：在“自准”视图里转望远镜，分别找到 AB、AC 面反射回来的绿十字像，用对应的调平螺丝把像调到分划板<b>上方</b>横线上。'],
      [nA>=2,`<b>测顶角</b>：载物台不动，望远镜正对 AB 面（十字像与上方叉丝交点重合）时记录，再转到 AC 面记录，算一组。共测 2 组（已完成 ${Math.min(nA,2)}/2）。`],
      [nG>=3,`<b>测最小偏向位置</b>：切到“看光谱”，选“转载物台”，用望远镜跟住<b>绿线</b>，找到它停下并反向的位置，竖直叉丝对准绿线中心后记录。重复 3 次（已记 ${Math.min(nG,3)}/3），每次都重新找一遍转折点。`],
      [c.Z.length>=1,'<b>测直射光位置</b>：点“取下三棱镜”，转望远镜对准白色的狭缝像，记录。'],
      [others>=2||s.checked,`<b>选做：色散</b>：放回三棱镜，对紫、蓝紫、黄等谱线也各找一次最小偏向位置并记录（已测 ${others} 条），结果区会给出 n − 1/λ² 图。`],
      [s.checked,'<b>处理数据</b>：算出顶角、最小偏向角、折射率和不确定度，再让 AI 助教检查。']]);
  }
  function bench(){
    const cv=$('#'+P+'-bench'); const {ctx,W,H}=benchSetup(cv);
    ctx.fillStyle='#0f1012'; ctx.fillRect(0,0,W,H);
    const cx=W*0.5, cy=118, Rr=78, F='12px "PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif';
    ctx.strokeStyle='#3b4048'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(cx,cy,Rr,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle='#3b4048'; ctx.fillRect(cx-Rr-96,cy-9,96,18); ctx.fillStyle='#e8e2ff'; ctx.beginPath(); ctx.arc(cx-Rr-108,cy,10,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(235,235,255,.6)'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(cx-Rr-10,cy); ctx.lineTo(cx,cy); ctx.stroke();
    if (!s.on){ ctx.strokeStyle='rgba(255,255,255,.7)'; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Rr+60,cy); ctx.stroke(); }
    else LINES.forEach(L=>{ const t=trace(L.w); if (!t) return; const a=-t.dev*Rd;
      ctx.strokeStyle=cssColor(wl2rgb(L.w),0.15).replace('rgb','rgba').replace(')',',.6)'); ctx.lineWidth=1.3; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Math.cos(a)*(Rr+60),cy+Math.sin(a)*(Rr+60)); ctx.stroke(); });
    if (s.on){ ctx.save(); ctx.translate(cx,cy); ctx.rotate(-s.rho*Rd); const h=s.A/2*Rd, L=34;
      const ax=L*Math.cos(h)*2/3, bx=ax-L*Math.cos(h), by=L*Math.sin(h);
      ctx.beginPath(); ctx.moveTo(ax,0); ctx.lineTo(bx,by); ctx.lineTo(bx,-by); ctx.closePath();
      ctx.fillStyle='rgba(169,200,235,.35)'; ctx.fill(); ctx.strokeStyle='#a9c8eb'; ctx.lineWidth=1.5; ctx.stroke();
      ctx.fillStyle='#c9c8c2'; ctx.font='10px sans-serif'; ctx.fillText('A',ax+3,4); ctx.restore(); }
    const ta=-(s.T-s.Tz)*Rd; ctx.save(); ctx.translate(cx,cy); ctx.rotate(ta); ctx.fillStyle='rgba(214,215,220,.85)'; ctx.fillRect(Rr+8,-8,100,16); ctx.fillStyle='#1f2226'; ctx.fillRect(Rr+100,-5,14,10); ctx.restore();
    ctx.fillStyle='#c9c8c2'; ctx.font=F; ctx.textAlign='left';
    ctx.fillText('汞灯',cx-Rr-122,cy+28); ctx.fillText('平行光管',cx-Rr-86,cy-16); if (s.on) ctx.fillText('三棱镜',cx-18,cy+48);
    ctx.fillText('望远镜',cx+Math.cos(ta)*(Rr+40)-18,cy+Math.sin(ta)*(Rr+40)+(Math.sin(ta)<0?-16:26));
  }
  function view(){
    const c=$('#'+P+'-view'), S=eyeSize(c); c.style.width=S+'px';
    const {ctx,dpr}=setup(c,S); ctx.setTransform(dpr,0,0,dpr,0,0);
    const ppd=S/(2*FOV), msg=$('#'+P+'-msg'), ctr=$('#'+P+'-counter');
    ctx.save(); ctx.beginPath(); ctx.arc(S/2,S/2,S/2-2,0,Math.PI*2); ctx.clip();
    let text='';
    if (s.view==='auto'){
      ctx.fillStyle='#0d1a12'; ctx.fillRect(0,0,S,S);
      const f=faceSeen();
      if (f){ const t=f.k===1?s.t1:s.t2, x=S/2-2*f.eps*ppd, y=S*0.3+t*S*0.32;
        ctx.strokeStyle='#5dff8a'; ctx.lineWidth=3; ctx.shadowColor='#5dff8a'; ctx.shadowBlur=8; ctx.beginPath(); ctx.moveTo(x-16,y); ctx.lineTo(x+16,y); ctx.moveTo(x,y-16); ctx.lineTo(x,y+16); ctx.stroke(); ctx.shadowBlur=0;
        const lv=Math.abs(t)<0.03, on=Math.abs(f.eps)*60<0.5;
        text = !lv ? `${FACE[f.k]} 面的反射像偏离上方横线 ${(Math.abs(t)*10).toFixed(1)} 格：调螺丝 b${f.k}` : on ? `✓ 望远镜正对 ${FACE[f.k]} 面，可以记录` : `${FACE[f.k]} 面：用微调把十字像移到上方叉丝交点`; }
      else text = s.on ? '视场里没有反射像：转望远镜，找 AB 或 AC 面反射回来的绿十字' : '载物台上没有三棱镜';
      ctr.hidden=true;
    } else {
      const g=ctx.createRadialGradient(S/2,S/2,0,S/2,S/2,S/2); g.addColorStop(0,'#121418'); g.addColorStop(1,'#060708'); ctx.fillStyle=g; ctx.fillRect(0,0,S,S);
      const bar=(t,rgb,a)=>{ const x=S/2+(t-s.T)*ppd; if (x<-10||x>S+10) return;
        ctx.fillStyle=cssColor(rgb,0.25).replace('rgb','rgba').replace(')',`,${0.22*a})`); ctx.fillRect(x-6,0,12,S);
        ctx.fillStyle=cssColor(rgb,0.35).replace('rgb','rgba').replace(')',`,${a})`); ctx.fillRect(x-1.6,0,3.2,S); };
      const near=[];
      if (!s.on){ bar(s.Tz,[1,1,1],1); if (Math.abs(s.T-s.Tz)<FOV) near.push('直射光（狭缝像）'); }
      else LINES.forEach(L=>{ const t=lineT(L.w); if (t==null) return; bar(t,wl2rgb(L.w),L.a); if (Math.abs(t-s.T)<FOV) near.push(`${L.w} nm（${L.c}）`); });
      text = near.length ? '' : s.on ? '视场里没有谱线：先看俯视图里折射光的方向，把望远镜转过去' : '视场里没有直射光，继续转动望远镜';
      if ($('#'+P+'-assist').checked && near.length){ ctr.textContent='视场内：'+near.join('、'); ctr.hidden=false; } else ctr.hidden=true;
    }
    ctx.restore();
    ctx.strokeStyle='rgba(255,255,255,.75)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(S/2,6); ctx.lineTo(S/2,S-6); ctx.moveTo(S*0.15,S/2); ctx.lineTo(S*0.85,S/2); ctx.moveTo(S*0.3,S*0.3); ctx.lineTo(S*0.7,S*0.3); ctx.stroke();
    msg.textContent = Date.now()-flashT<4000 ? flash : text; msg.classList.toggle('low', s.view==='auto');
    $('#'+P+'-cap').textContent = s.view==='auto' ? '望远镜视场：自准法（绿十字反射像）' : s.on ? '望远镜视场：三棱镜折射后的汞灯光谱' : '望远镜视场：直射光';
  }

  /* ---------- 数据 ---------- */
  const note=t=>{ $('#'+P+'-result').innerHTML=`<div class="note">${t}</div>`; };
  function record(){
    if (!levelOK()) return note('先完成第 1 步：调平三棱镜（两个光学面的反射十字像都落在上方横线上）。');
    const L=roundMin(left()), R=roundMin(right());
    if (s.view==='auto'){
      if (!s.on) return note('自准法测顶角要把三棱镜放在载物台上。');
      const f=faceSeen(); if (!f) return note('视场里没有光学面反射回来的绿十字像：转动望远镜，对准 AB 或 AC 面后再记录。');
      return push({t:'A', f:f.k, L, R, off:+(f.eps*60).toFixed(1), rho:+s.rho.toFixed(4)});
    }
    if (!s.on){ const off=(s.T-s.Tz)*60; if (Math.abs(off)>FOV*60) return note('视场里没有直射光的狭缝像。'); return push({t:'Z', L, R, off:+off.toFixed(1)}); }
    let best=null; LINES.forEach(l=>{ const t=lineT(l.w); if (t!=null && Math.abs(t-s.T)<FOV && (!best||Math.abs(t-s.T)<Math.abs(best.t-s.T))) best={w:l.w,t}; });
    if (!best) return note('视场里没有谱线，先把望远镜转到谱线上。');
    push({t:'D', w:best.w, L, R, off:+((s.T-best.t)*60).toFixed(1), dm:+((Math.abs(trace(best.w).dev)-dmin(best.w))*60).toFixed(2)});
  }
  function push(row){ s.rows.push(row); stats.records++; logEvent('lab_record',{lab:P,n:s.rows.length,row}); dirty(); }
  function linfit(xs,ys){ const n=xs.length, mx=Unc.mean(xs), my=Unc.mean(ys), sxx=xs.reduce((q,x)=>q+(x-mx)**2,0); if (!(sxx>0)) return null;
    const b=xs.reduce((q,x,i)=>q+(x-mx)*(ys[i]-my),0)/sxx, a=my-b*mx, res=ys.reduce((q,y,i)=>q+(y-a-b*xs[i])**2,0);
    return {a,b,sb:n>2?Math.sqrt(res/(n-2)/sxx):null}; }
  function calc(){
    const f1=s.rows.filter(r=>r.t==='A'&&r.f===1), f2=s.rows.filter(r=>r.t==='A'&&r.f===2);
    const pairs=f1.slice(0,Math.min(f1.length,f2.length)).map((a,i)=>{ const b=f2[i], pL=angDiff(a.L,b.L), pR=angDiff(a.R,b.R), phi=(pL+pR)/2;
      return {n:i+1,a,b,pL,pR,phi,A:180-phi,moved:a.rho!=null&&b.rho!=null&&Math.abs(a.rho-b.rho)>0.02}; });
    const Z=s.rows.filter(r=>r.t==='Z'), D=s.rows.filter(r=>r.t==='D'), out={pairs,Z,D,lines:[]};
    const dev=r=>Unc.mean(Z.map(z=>(angDiff(r.L,z.L)+angDiff(r.R,z.R))/2));
    const byW={}; D.forEach(r=>{ (byW[r.w]=byW[r.w]||[]).push(r); });
    out.lines=Object.keys(byW).map(Number).sort((a,b)=>a-b).map(w=>{ const ds=Z.length?byW[w].map(dev):[]; return {w,rows:byW[w],ds,d:ds.length?Unc.mean(ds):null}; });
    if (pairs.length) out.sumA=Unc.summarize(pairs.map(p=>p.A),UB);
    const g=out.lines.find(l=>l.w===GREEN);
    if (out.sumA && g && g.d!=null && out.sumA.mean>0 && out.sumA.mean<180){
      out.sumD=Unc.summarize(g.ds,UB);
      const A=out.sumA.mean*Rd, d=out.sumD.mean*Rd, sA=Math.sin(A/2);
      out.n=Math.sin((A+d)/2)/sA; out.pA=-Math.sin(d/2)/(2*sA*sA); out.pD=Math.cos((A+d)/2)/(2*sA);
      out.fromA=Math.abs(out.pA)*out.sumA.u*Rd; out.fromD=Math.abs(out.pD)*out.sumD.u*Rd; out.un=Math.hypot(out.fromA,out.fromD);
      out.err=(out.n-nOf(GREEN))/nOf(GREEN)*100;
      out.lines.forEach(l=>{ if (l.d!=null) l.n=Math.sin((A+l.d*Rd)/2)/sA; });
      const ls=out.lines.filter(l=>l.n!=null);
      if (ls.length>=3){ out.pts=ls.map(l=>[1e6/(l.w*l.w), l.n]); out.fit=linfit(out.pts.map(p=>p[0]),out.pts.map(p=>p[1])); }
    }
    return out;
  }
  const lab=r=>r.t==='A'?`${FACE[r.f]} 面`:r.t==='Z'?'直射光':`${r.w} nm`;
  function table(){
    save(); renderStats();
    if (!s.rows.length){ $('#'+P+'-table').innerHTML='<div class="empty">还没有数据。先调平三棱镜，再用自准法测顶角。</div>'; $('#'+P+'-result').innerHTML=''; typeof Learn!=='undefined' && Learn.graphs(P,[]); return; }
    const c=calc(), p4=v=>v==null?'—':v.toFixed(4)+'°';
    let h='';
    if (c.pairs.length || s.rows.some(r=>r.t==='A')) h+=`<table class="data"><tr><th>组</th><th>AB 左</th><th>AB 右</th><th>AC 左</th><th>AC 右</th><th>φ</th><th>A</th></tr>`+
      c.pairs.map(p=>`<tr class="${p.moved?'warn':''}"><td>${p.n}</td><td>${dms(p.a.L)}</td><td>${dms(p.a.R)}</td><td>${dms(p.b.L)}</td><td>${dms(p.b.R)}</td><td>${dms(p.phi)}</td><td>${dms(p.A)}</td></tr>`).join('')+
      s.rows.filter(r=>r.t==='A').slice(c.pairs.length*2).filter(r=>!c.pairs.some(p=>p.a===r||p.b===r)).map(r=>`<tr><td>—</td><td colspan="6" style="text-align:left">${lab(r)}：${dms(r.L)} / ${dms(r.R)}（等另一个面配成一组）</td></tr>`).join('')+'</table>';
    if (c.D.length || c.Z.length) h+=`<table class="data"><tr><th>位置</th><th>左游标</th><th>右游标</th><th>偏向角 δ</th></tr>`+
      c.Z.map(z=>`<tr><td>直射光</td><td>${dms(z.L)}</td><td>${dms(z.R)}</td><td>—</td></tr>`).join('')+
      c.lines.flatMap(l=>l.rows.map((r,i)=>`<tr><td>${r.w} nm 最小偏向</td><td>${dms(r.L)}</td><td>${dms(r.R)}</td><td>${l.ds[i]!=null?dms(l.ds[i]):'—'}</td></tr>`)).join('')+'</table>';
    $('#'+P+'-table').innerHTML=h;
    let r='';
    if (c.sumA) r+=`<div class="result">顶角：各组 A = ${c.pairs.map(p=>p4(p.A)).join('、')}${c.pairs.some(p=>p.moved)?'<div class="note">有一组的两次读数之间载物台被转动过，这一组的 A 不可靠。</div>':''}${Unc.html(c.sumA,'A','°')}</div>`;
    else if (s.rows.some(r=>r.t==='A')) r+='<div class="hint">顶角需要 AB、AC 两个面各一次读数配成一组。</div>';
    if (c.D.length && !c.Z.length) r+='<div class="hint">还没有直射光位置：取下三棱镜测一次，才能算出偏向角。</div>';
    if (c.sumD){ const f=Unc.format(c.n,c.un,''), pf=v=>(+v.toPrecision(3)).toString();
      r+=`<div class="result">最小偏向角（绿线 546.1 nm）：各次 δ = ${c.lines.find(l=>l.w===GREEN).ds.map(p4).join('、')}${Unc.html(c.sumD,'δ<sub>min</sub>','°')}</div>
      <div class="result">折射率：n = sin[(A + δ<sub>min</sub>)/2] / sin(A/2) = <span class="big">${c.n.toFixed(5)}</span>
        <div class="unc">不确定度：∂n/∂A = ${pf(c.pA)} /rad，∂n/∂δ = ${pf(c.pD)} /rad；来自顶角 ${pf(c.fromA)}，来自偏向角 ${pf(c.fromD)}，合成 u(n) = ${pf(c.un)}
        <div class="final">结果：<b>n = ${f.text}</b>，相对不确定度 ${f.rel.toFixed(3)}%</div></div>
        ${s.checked?`<div>这块玻璃在 546.1 nm 的折射率为 ${nOf(GREEN).toFixed(5)}，顶角 ${dms(s.A)}（${s.A.toFixed(4)}°）；你的 n 相对偏差 <b>${c.err>=0?'+':''}${c.err.toFixed(3)}%</b>。</div>`:'<div class="hint">标准值在 AI 批改后显示。</div>'}</div>`; }
    const ls=c.lines.filter(l=>l.n!=null&&l.w!==GREEN);
    if (ls.length){ r+=`<div class="result">色散（选做）：${c.lines.filter(l=>l.n!=null).map(l=>`λ = ${l.w} nm，n = ${l.n.toFixed(4)}`).join('；')}
      ${c.fit?`<div>按柯西公式 n = a + b/λ² 拟合：a = ${c.fit.a.toFixed(4)}，b = ${(c.fit.b*1e6).toExponential(3)} nm²。波长越短 n 越大（正常色散）。</div>`:'<div class="hint">再测一条谱线（至少 3 条）就能作 n − 1/λ² 图。</div>'}</div>`; }
    $('#'+P+'-result').innerHTML=r||'<div class="hint">继续测量：顶角需要成组的数据，偏向角需要直射光位置。</div>';
    typeof Learn!=='undefined' && Learn.graphs(P, c.fit?[{title:'色散 n − 1/λ² 图（柯西公式）', pts:c.pts, fit:c.fit, xl:'1/λ² / µm⁻²', yl:'n', derive:(k,a)=>`柯西系数 a = ${a.toFixed(4)}，b = 斜率 = ${k.toFixed(4)} µm²`}]:[]);
  }

  /* ---------- AI 批改 ---------- */
  function issues(c){
    const p=[];
    if (c.pairs.length<2) p.push(`顶角只测了 ${c.pairs.length} 组，建议至少 2 组`);
    if (c.pairs.some(x=>x.moved)) p.push(`第 ${c.pairs.filter(x=>x.moved).map(x=>x.n).join('、')} 组测顶角时，两次读数之间载物台被转动了，φ 里混进了棱镜转过的角度`);
    const offA=s.rows.filter(r=>r.t==='A'&&Math.abs(r.off)>1); if (offA.length) p.push(`${offA.map(lab).join('、')}记录时十字像没有和叉丝交点重合（偏 ${offA.map(r=>Math.abs(r.off).toFixed(1)+'′').join('、')}）`);
    const far=s.rows.filter(r=>r.t==='D'&&r.dm>1); if (far.length) p.push(`${far.map(lab).join('、')}记录时棱镜不在最小偏向位置，偏向角多了 ${far.map(r=>r.dm.toFixed(1)+'′').join('、')}`);
    const loose=s.rows.filter(r=>(r.t==='D'||r.t==='Z')&&Math.abs(r.off)>1.5); if (loose.length) p.push(`${loose.map(lab).join('、')}竖直叉丝没有压在谱线（狭缝像）中心（偏 ${loose.map(r=>Math.abs(r.off).toFixed(1)+'′').join('、')}）`);
    if (!c.Z.length) p.push('没有测直射光位置');
    return p;
  }
  function offline(c){
    const p=issues(c), level=Math.abs(c.err)<0.03?'很好':Math.abs(c.err)<0.1?'基本合格':'偏差较大', g=c.pairs[0];
    return [`【总评】顶角 A = ${Unc.format(c.sumA.mean,c.sumA.u,'°').text}，最小偏向角 δ = ${Unc.format(c.sumD.mean,c.sumD.u,'°').text}，算得 n = ${Unc.format(c.n,c.un,'').text}，与这块玻璃的折射率 ${nOf(GREEN).toFixed(5)} 相对偏差 ${c.err.toFixed(3)}%，结果${level}。${c.fit?`还测了色散，柯西系数 a = ${c.fit.a.toFixed(4)}、b = ${(c.fit.b*1e6).toExponential(2)} nm²。`:''}`,
      '【数据问题】'+(p.length?p.join('；')+'。':'没有发现明显问题。')+(g?` 第 1 组只用左游标算的 φ 与只用右游标算的相差约 ${(Math.abs(g.pL-g.pR)*60).toFixed(1)}′，这就是度盘偏心差，两游标取平均后已消除。`:''),
      `【误差来源】n 的不确定度里，来自顶角的约 ${(+c.fromA.toPrecision(2))}，来自偏向角的约 ${(+c.fromD.toPrecision(2))}，${c.fromA>c.fromD?'顶角是主要来源':'偏向角是主要来源'}。具体是：十字像或谱线与叉丝的对准误差、游标读数误差（1′）、最小偏向位置判断不准（它对 δ 是二阶影响，较小）、棱镜没调平。`,
      '【改进建议】测顶角时两次读数之间绝不碰载物台；接近转折点时改用微调转载物台，绿线刚停住就停手，再用微调让叉丝压在谱线中心；每个位置都读两个游标；多测几组顶角取平均。'].join('\n');
  }
  function review(){
    const c=calc();
    runReview(P,{
      check:()=>!c.sumA?'先测顶角：AB、AC 两个面各记录一次，配成一组。':!c.sumD?'还需要绿线的最小偏向位置和直射光位置，才能算折射率。':'',
      prompt:()=>`你是大学物理实验课的助教，正在批改大一学生“分光计测三棱镜折射率（最小偏向角法）”的实验数据。A = 180° − φ（φ 为自准法两次望远镜方位差，取左右游标平均），δ_min = 最小偏向位置与直射光位置之差，n = sin[(A+δ)/2]/sin(A/2)，光源为汞灯绿线 546.1 nm。
顶角数据：${c.pairs.map(p=>`第 ${p.n} 组：AB 面 ${dms(p.a.L)}/${dms(p.a.R)}，AC 面 ${dms(p.b.L)}/${dms(p.b.R)}，φ=${dms(p.phi)}（只用左游标 ${p.pL.toFixed(4)}°，只用右游标 ${p.pR.toFixed(4)}°），A=${p.A.toFixed(4)}°${p.moved?'（两次读数之间载物台被转动过）':''}`).join('；')}。${Unc.line(c.sumA,'A','°')}
直射光：${c.Z.map(z=>`${dms(z.L)}/${dms(z.R)}`).join('；')}。最小偏向（绿线）：${c.lines.find(l=>l.w===GREEN).rows.map((r,i)=>`${dms(r.L)}/${dms(r.R)}，δ=${c.lines.find(l=>l.w===GREEN).ds[i].toFixed(4)}°`).join('；')}。${Unc.line(c.sumD,'δ','°')}
n = ${c.n.toFixed(5)}，u(n) = ${c.un.toExponential(2)}（来自顶角 ${c.fromA.toExponential(2)}，来自偏向角 ${c.fromD.toExponential(2)}）。这块玻璃真实折射率 ${nOf(GREEN).toFixed(5)}，真实顶角 ${s.A.toFixed(4)}°，相对偏差 ${c.err.toFixed(3)}%。
${c.lines.filter(l=>l.n!=null&&l.w!==GREEN).length?`其他谱线：${c.lines.filter(l=>l.n!=null).map(l=>`${l.w} nm n=${l.n.toFixed(4)}`).join('，')}${c.fit?`；柯西拟合 a=${c.fit.a.toFixed(4)}，b=${(c.fit.b*1e6).toExponential(3)} nm²`:''}。`:'学生没有做色散选做。'}
系统记录的操作问题：${issues(c).join('；')||'无'}。
请给出批改意见：中文，250~350 字，分 4 段，每段开头依次写【总评】【数据问题】【误差来源】【改进建议】，段与段之间换行。【误差来源】里结合两项不确定度的大小说明主要误差来自顶角还是偏向角；可以说明为什么最小偏向位置不需要找得特别准。只根据给出的数据说话，语气像耐心的助教，不要使用 Markdown。`,
      offline:()=>offline(c)
    }).then(ok=>{ if (ok){ s.checked=true; s.review=ok; table(); render(); } });
  }

  /* 探究：最小偏向位置附近，载物台多转一点谱线几乎不动（δ 对入射角是二阶小量） */
  const shift=deg=>{ const r0=rhoMin(), d0=Math.abs(trace(GREEN,r0).dev); return Unc.mean([deg,-deg].map(x=>{ const t=trace(GREEN,r0+x); return t?(Math.abs(t.dev)-d0)*60:0; })); };
  typeof Learn!=='undefined' && Learn.task(P,{title:'转折点附近为什么“不灵敏”', label:'谱线移动', unit:'′',
    text:'<b>动手测</b>：把绿线调到最小偏向位置，记下望远镜读数；再把载物台朝任一方向多转 <b>2°</b>（看读数区的载物台位置），重新用望远镜对准绿线读数。绿线移动了多少角分？',
    ready:()=>s.rows.some(r=>r.t==='D'&&r.w===GREEN), need:'先完成一次绿线最小偏向位置的记录。', hint:'两次望远镜读数之差，换算成角分（1° = 60′）。用左游标即可。',
    answer:()=>shift(2), tol:()=>Math.max(1,shift(2)*0.3),
    reveal:()=>`理论上多转 2° 谱线只移动约 ${shift(2).toFixed(1)}′，多转 0.5° 只移动约 ${shift(0.5).toFixed(2)}′，已经小于游标的 1′。在极小值附近 δ ≈ δ<sub>min</sub> + ½δ″(Δi)²，偏离量是二阶小量，所以转折点“找得不太准”影响很小；真正要小心的是叉丝对准谱线中心和读数。`});
  return {mount, render, key};
})();
