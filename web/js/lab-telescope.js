/* =====================================================================
 * lab-telescope.js —— 虚拟实验：望远镜的放大率与视场（开普勒望远镜，目镜带分划板）
 * 操作：目镜调焦看清分划板 → 物镜调焦看清 5 m 外的标尺并消视差
 *       → 比较法（双眼对比标尺块数）、出瞳法（Γ = D/D′）测放大率 → 读视场边缘求视场角 → 进阶：换 40 mm 目镜
 * 物理模型：薄透镜。标尺在有限远 L 处，调焦后镜筒长度为 s′ + fₑ（s′ = Lf₀/(L − f₀)），
 *   出瞳直径 D′ = D·fₑ/s′，出瞳距 l′ = fₑ(s′ + fₑ)/s′，所以出瞳法得到 Γ = s′/fₑ，比 f₀/fₑ 略大；
 *   比较法中直接看标尺的眼睛离标尺 L + ℓ（ℓ 为物镜到眼睛的距离），Γ比 = (s′/fₑ)(L + ℓ)/L。
 *   视场光阑（半径 a）在目镜焦面上，物方半视场角 tanω = a/s′。像是倒立的。
 * ===================================================================== */
const TS = (() => {
  const P='ts', L=5000, FO=300, BLK=100;              // 标尺距物镜 (mm)、物镜标称焦距 (mm)、标尺黑白块长度 (mm)
  const EP={A:{nom:25, a:5, name:'A（25 mm）'}, B:{nom:40, a:8, name:'B（40 mm）'}};
  const s={}; let B=null, wig=0, wigOn=false, pend=null;
  const sgn=()=>Math.random()<.5?-1:1;

  function init(){
    const fo=rnd(294,306), sp=L*fo/(L-fo), D=30+rnd(-0.05,0.05);
    Object.assign(s,{fo, feA:rnd(24.5,25.5), feB:rnd(39.3,40.7), D, Dcal:+(Math.round(D/0.02)*0.02).toFixed(2),
      e0:rnd(-1.2,1.2), e:0, t:+(sp+sgn()*rnd(6,12)).toFixed(2), ep:'A', mode:'focus', c:Math.round(rnd(420,780)), z:rnd(32,52),
      eyeOk:false, focused:false, rows:[], checked:false});
    s.e=Math.max(-3,Math.min(3,s.e0+sgn()*rnd(1.2,2)));
  }
  const save=()=>LabStore.save(P,s);
  const fe=()=>s.ep==='A'?s.feA:s.feB, ap=()=>EP[s.ep].a;
  const sp=()=>L*s.fo/(L-s.fo);                         // 标尺的像距
  const dF=()=>s.t-sp();                                 // 分划板离标尺像的距离（物镜调焦误差）
  const dE=()=>s.e-s.e0-(s.ep==='B'?s.eB:0);            // 目镜视度误差（换目镜后视度圈的零点不同）
  const Dp=()=>s.D*fe()/sp(), lp=()=>fe()*(sp()+fe())/sp(), Gp=()=>sp()/fe();
  const ell=()=>sp()+fe()+lp(), Gc=()=>Gp()*(L+ell())/L;
  const halfW=()=>ap()*L/sp();                           // 视场在标尺上的半宽 (mm)
  /* 比较法时望远镜对准标尺上黑白块的中间，保证视场里有 K 个完整的块 */
  const center=()=>s.mode!=='cmp' ? s.c : s.ep==='A' ? Math.round(s.c/BLK)*BLK+BLK/2 : Math.round(s.c/BLK)*BLK;
  const inFocus=()=>Math.abs(dE())<0.35 && Math.abs(dF())<0.6;

  /* ---------- 页面 ---------- */
  function mount(el){
    el.innerHTML=labShell(P,{
      title:'望远镜放大率与视场测量',
      principle:`<p><b>开普勒望远镜</b>由长焦距物镜 f₀ 和短焦距目镜 fₑ 组成，物镜把远处物体成实像在目镜焦面上，分划板（十字叉丝）也放在这里。看无穷远物体时视放大率 <b>Γ = f₀/fₑ</b>，像是倒立的。</p>
        <p><b>调焦</b>：先转目镜视度圈，看清分划板；再转调焦手轮，看清标尺。眼睛左右稍晃动时，标尺的像和叉丝没有相对移动，说明像正好落在分划板上（消除视差），否则读数会随眼睛位置变化。</p>
        <p><b>比较法</b>：一只眼睛通过望远镜看标尺，另一只眼睛直接看标尺，两个像重叠在一起。数出望远镜里 K 块对应直接看到的 N 块，Γ比 = N/K。</p>
        <p><b>出瞳法</b>：望远镜对着明亮的毛玻璃，在目镜后放白屏，前后移动到光斑最小、边缘最清晰处，这个光斑就是出射光瞳（物镜通光孔经目镜成的像）。Γ瞳 = D/D′，D 为物镜通光口径（游标卡尺测量），D′ 为出瞳直径。</p>
        <p><b>视场</b>：分划板旁的视场光阑限制了能看到的范围。读出视场两侧边缘对应的标尺读数 x₁、x₂，物方视场角 <b>2ω = 2·arctan[(x₂ − x₁)/(2L)]</b>。</p>
        <p><b>有限远的修正</b>：标尺只在 L = ${L/1000} m 处，调焦后镜筒变长，Γ瞳 = s′/fₑ 比 f₀/fₑ 大约 f₀/L；比较法中直接看标尺的眼睛还比物镜远 ℓ（物镜到眼睛的距离）。换算到无穷远：Γ∞ = Γ瞳·(L − f₀)/L，Γ∞ = Γ比·(L − f₀)/(L + ℓ)。</p>
        <p>不确定度：比较法 B 类按估读 0.2 块；出瞳法按光斑直径估读 0.05 mm、卡尺 0.02 mm；视场按每个边缘估读 1 mm。A 类取多次测量的标准偏差。</p>`,
      right:`<div class="canvas-wrap fill"><canvas id="${P}-bench"></canvas><div class="caption">装置示意</div></div>
      <div class="lab-grid">
        <div class="canvas-wrap"><canvas id="${P}-view" class="eye"></canvas><div class="caption" id="${P}-cap">目镜视场</div><div class="msg" id="${P}-msg"></div><div class="counter" id="${P}-counter"></div></div>
        <div class="panel" id="${P}-panel">
          <div class="seg" id="${P}-modes"><button class="tab" data-v="focus">1 调焦</button><button class="tab" data-v="cmp">2 比较法</button><button class="tab" data-v="pupil">3 出瞳法</button><button class="tab" data-v="field">4 视场</button></div>
          <div class="seg" id="${P}-eps"><button class="tab" data-ep="A">目镜 A　25 mm</button><button class="tab" data-ep="B">目镜 B　40 mm</button></div>
          <label class="ctl" data-m="focus cmp field"><span>目镜视度圈</span><output id="${P}-oe"></output><input type="range" id="${P}-e" min="-3" max="3" step="0.01"></label>
          <div class="row" data-m="focus" style="margin-top:0"><button class="hold" id="${P}-wig">按住：眼睛左右晃动（查视差）</button></div>
          <div class="readout" id="${P}-readout"></div>
          <canvas id="${P}-drum" class="strip"></canvas>
          ${turnControls(P,[[0.2,'微调 0.2 mm/s'],[1,'中速 1 mm/s'],[5,'快速 5 mm/s']],{assist:'',left:'◀ 向前',rightLabel:'向后 ▶'})}
          <div class="tip" id="${P}-tip"></div>
        </div>
      </div>`});
    init(); s.eB=rnd(-1.5,1.5);
    LabStore.restore(P,s); if (!Number.isFinite(s.eB)) s.eB=0;
    stats.records+=s.rows.length; $('#'+P+'-review').innerHTML=paras(s.review||'');
    B=benchArea(P, Models3D.telescope, ()=>({t:s.t, ep:s.ep, mode:s.mode, z:s.z, lp:lp()}), {cap3d:'三维模型'});
    B.onChange=render;
    $('#'+P+'-modes').onclick=e=>{ const b=e.target.closest('button'); if (b){ s.mode=b.dataset.v; pend=null; $('#'+P+'-ask').hidden=true; render(); save(); } };
    $('#'+P+'-eps').onclick=e=>{ const b=e.target.closest('button'); if (!b||b.dataset.ep===s.ep) return; s.ep=b.dataset.ep; pend=null; $('#'+P+'-ask').hidden=true; render(); save(); };
    $('#'+P+'-e').value=s.e; $('#'+P+'-e').addEventListener('input',e=>{ s.e=+e.target.value; latch(); render(); });
    $('#'+P+'-e').addEventListener('change',save);
    const wb=$('#'+P+'-wig'), loop=t=>{ if (!wigOn) return; wig=Math.sin(t/180); view(); requestAnimationFrame(loop); };
    wb.addEventListener('pointerdown',e=>{ e.preventDefault(); if (!wigOn){ wigOn=true; requestAnimationFrame(loop); } });
    ['pointerup','pointerleave','pointercancel'].forEach(ev=>wb.addEventListener(ev,()=>{ wigOn=false; wig=0; view(); }));
    bindHold($('#'+P+'-panel'), $('#'+P+'-speed'), d=>{ move(d); render(); });
    bindDrag($('#'+P+'-drum'), 20, d=>{ move(d); render(); });
    /* 读数表单：比较法、出瞳法、视场各自要填的内容 */
    $('#'+P+'-rec').parentElement.insertAdjacentHTML('afterend',`<div class="askcount" id="${P}-ask" hidden>
        <div id="${P}-askq"></div><div id="${P}-askf"></div>
        <div class="row" style="margin-top:8px"><button class="primary" id="${P}-ok">记录读数</button><button class="ghost" id="${P}-no">取消</button><span class="hint" id="${P}-askmsg"></span></div></div>`);
    $('#'+P+'-ok').onclick=confirmRead;
    $('#'+P+'-no').onclick=()=>{ pend=null; $('#'+P+'-ask').hidden=true; };
    $('#'+P+'-ask').addEventListener('keydown',e=>{ if (e.key==='Enter'){ e.preventDefault(); confirmRead(); } });
    $('#'+P+'-rec').onclick=record;
    $('#'+P+'-undo').onclick=()=>{ pend=null; $('#'+P+'-ask').hidden=true; s.checked=false; s.review=''; $('#'+P+'-review').innerHTML=''; if (s.rows.pop()) stats.records--; table(); render(); };
    $('#'+P+'-clr').onclick=()=>{ pend=null; $('#'+P+'-ask').hidden=true; stats.records-=s.rows.length; s.rows=[]; s.checked=false; s.review=''; $('#'+P+'-review').innerHTML=''; table(); render(); };
    $('#'+P+'-check').onclick=review;
    table();
  }
  function latch(){ if (s.ep==='A' && Math.abs(dE())<0.15) s.eyeOk=true; if (s.ep==='A' && s.eyeOk && Math.abs(dE())<0.15 && Math.abs(dF())<0.3) s.focused=true; }
  function move(d){
    if (s.mode==='pupil') s.z=Math.max(2,Math.min(70,s.z+d));
    else { s.t=Math.max(290,Math.min(345,s.t+d)); latch(); }
  }
  function key(dir,big){ move(dir*(big?0.5:0.05)); render(); }

  /* ---------- 绘图 ---------- */
  function render(){
    document.querySelectorAll('#'+P+'-modes .tab').forEach(b=>b.classList.toggle('active',b.dataset.v===s.mode));
    document.querySelectorAll('#'+P+'-eps .tab').forEach(b=>b.classList.toggle('active',b.dataset.ep===s.ep));
    document.querySelectorAll('#'+P+'-panel [data-m]').forEach(el=>{ el.hidden=!el.dataset.m.split(' ').includes(s.mode); });
    if (!(B.is3d() && B.update())) bench();
    view();
    const pupil=s.mode==='pupil';
    $('#'+P+'-oe').textContent=s.e.toFixed(2);
    $('#'+P+'-readout').innerHTML=`<div>${pupil?'白屏到目镜的距离':'调焦读数（物镜到分划板）'}</div><div class="v">${pupil?s.z.toFixed(1):s.t.toFixed(2)} mm</div>
      <div class="f">物镜标称 f₀ = ${FO} mm，通光口径（游标卡尺）D = ${s.Dcal.toFixed(2)} mm　目镜 ${EP[s.ep].name}　标尺距物镜 L = ${(L/1000).toFixed(2)} m</div>`;
    drawStrip($('#'+P+'-drum'), (pupil?s.z:s.t)*10, {px:4, label:k=>k%50===0?String(k/10):''});
    $('#'+P+'-tip').textContent = pupil ? '按住按钮或拖动刻度条前后移动白屏；键盘 ← → 每次 0.05 mm（Shift 为 0.5 mm）。' : '按住按钮或拖动刻度条转调焦手轮；键盘 ← → 每次 0.05 mm（Shift 为 0.5 mm）。';
    $('#'+P+'-rec').textContent = {focus:'记录读数', cmp:'记录：比较法读数', pupil:'记录：出瞳直径', field:'记录：视场边缘读数'}[s.mode];
    const n=(t,ep)=>s.rows.filter(r=>r.t===t&&r.ep===ep).length, nB=s.rows.filter(r=>r.ep==='B'&&r.t!=='f').length;
    renderSteps(P,[
      [s.eyeOk,'<b>目镜调焦</b>：转动目镜视度圈，直到分划板上的十字叉丝最清晰（每个人的视度不同，要自己调）。'],
      [s.focused,'<b>物镜调焦、消视差</b>：转调焦手轮，看清 5 m 外的标尺；按住“眼睛左右晃动”，标尺的像与叉丝不再相对移动为止。'],
      [n('c','A')>=3,`<b>比较法测放大率</b>：切到“比较法”，数出望远镜里 K 块对应直接看到的标尺块数，记录 3 次以上（已完成 ${Math.min(n('c','A'),3)}/3）。`],
      [n('p','A')>=2,`<b>出瞳法测放大率</b>：切到“出瞳法”，前后移动白屏，在光斑最小、边缘最清晰处读出光斑直径，记录 2 次以上（已完成 ${Math.min(n('p','A'),2)}/2）。`],
      [n('f','A')>=2,`<b>测视场</b>：切到“视场”，读出视场两侧边缘对应的标尺读数，记录 2 次以上（已完成 ${Math.min(n('f','A'),2)}/2）。`],
      [nB>=2,`<b>进阶：换目镜</b>：换 40 mm 目镜，重新调视度和焦距，用比较法或出瞳法再测 2 次以上，看放大率和视场怎么变（已完成 ${Math.min(nB,2)}/2）。`],
      [s.checked,'<b>处理数据</b>：比较两种方法和标称值 f₀/fₑ，换算到无穷远，再让 AI 助教检查。']]);
  }
  function bench(){
    const c=$('#'+P+'-bench'); const {ctx,W}=benchSetup(c);
    const span=700, sc=Math.min(1,(W-20)/span); ctx.translate((W-span*sc)/2,230*(1-sc)/2); ctx.scale(sc,sc);
    const y=105, F12='12px "PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif'; ctx.font=F12; ctx.textAlign='center';
    /* 远处的标尺（不按比例） */
    ctx.fillStyle='#e8e6df'; ctx.fillRect(40,y-70,26,140); for (let k=0;k<7;k++) if (k%2===0){ ctx.fillStyle='#1d1e21'; ctx.fillRect(44,y-66+k*19,18,19); }
    ctx.fillStyle='#c9c8c2'; ctx.fillText(s.mode==='pupil'?'毛玻璃灯箱':'标尺',53,y-80);
    ctx.strokeStyle='#6f757d'; ctx.setLineDash([5,5]); ctx.beginPath(); ctx.moveTo(72,y); ctx.lineTo(196,y); ctx.stroke(); ctx.setLineDash([]); ctx.fillText(`约 ${(L/1000).toFixed(0)} m（不按比例）`,134,y-8);
    /* 望远镜：物镜、镜筒、分划板、目镜 */
    const X=mm=>214+mm*0.95, xo=X(0), xr=X(s.t), xe=X(s.t+fe());
    ctx.fillStyle='#2b2f35'; ctx.fillRect(xo,y-22,xr-xo+8,44); ctx.fillStyle='#3a3f47'; ctx.fillRect(xr-30,y-18,xe-xr+48,36);
    ctx.strokeStyle='#a9bbd6'; ctx.lineWidth=3; ctx.beginPath(); ctx.ellipse(xo,y,4,26,0,0,Math.PI*2); ctx.stroke(); ctx.beginPath(); ctx.ellipse(xe,y,3,13,0,0,Math.PI*2); ctx.stroke();
    ctx.strokeStyle='#ffd27a'; ctx.lineWidth=1; ctx.setLineDash([3,3]); ctx.beginPath(); ctx.moveTo(xr,y-18); ctx.lineTo(xr,y+18); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle='#c9c8c2'; ctx.fillText('物镜',xo,y-34); ctx.fillText('分划板',xr,y+34); ctx.fillText('目镜',xe,y-26);
    ctx.fillStyle='#6f757d'; ctx.fillText(`调焦读数 ${s.t.toFixed(1)} mm`,(xo+xr)/2,y+54);
    if (s.mode==='pupil'){ const xs=xe+s.z*0.95*1.6; ctx.fillStyle='#e9e7e1'; ctx.fillRect(xs-2,y-26,5,52); ctx.fillStyle='#c9c8c2'; ctx.fillText('白屏',xs,y-34); }
    else { ctx.fillStyle='#c9c8c2'; ctx.beginPath(); ctx.ellipse(xe+26,y,9,6,0,0,Math.PI*2); ctx.fill(); ctx.fillStyle='#1d1e21'; ctx.beginPath(); ctx.arc(xe+23,y,3,0,Math.PI*2); ctx.fill(); ctx.fillStyle='#c9c8c2'; ctx.fillText('眼睛',xe+26,y-14); }
  }
  /* 标尺：上半为 100 mm 黑白块，下半为毫米刻度（每 10 mm 一格，每 100 mm 标数） */
  function drawRuler(ctx, ox, oy, ppm, x0, x1, h, inv){
    ctx.save(); ctx.translate(ox,oy); if (inv) ctx.scale(-1,-1);
    const a=Math.floor(x0/BLK)*BLK;
    ctx.fillStyle='#f1efe8'; ctx.fillRect((x0-x0)*ppm-2,-h,(x1-x0)*ppm+4,2*h);
    for (let x=a;x<x1;x+=BLK){ if ((x/BLK)%2===0){ ctx.fillStyle='#1b1c1f'; ctx.fillRect((x-x0)*ppm,-h,BLK*ppm,h*0.78); } }
    ctx.fillStyle='#1b1c1f'; ctx.strokeStyle='#1b1c1f'; ctx.lineWidth=Math.max(1,ppm*0.6);
    for (let x=Math.floor(x0/5)*5;x<=x1;x+=5){ const X=(x-x0)*ppm, L2=x%100===0?h*0.75:x%50===0?h*0.5:x%10===0?h*0.36:h*0.18; if (x%10&&ppm<1.2) continue; ctx.beginPath(); ctx.moveTo(X,0); ctx.lineTo(X,L2); ctx.stroke(); }
    ctx.font=`600 ${Math.max(10,Math.min(18,ppm*9))}px "PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif`; ctx.textAlign='center';
    for (let x=Math.ceil(x0/100)*100;x<=x1;x+=100) ctx.fillText(String(x),(x-x0)*ppm,h*0.98);
    ctx.restore();
  }
  function view(){
    const c=$('#'+P+'-view'), S=eyeSize(c); c.style.width=S+'px';
    const {ctx,dpr}=setup(c,S); ctx.setTransform(dpr,0,0,dpr,0,0);
    const msg=$('#'+P+'-msg'), cx=S/2, cy=S/2, R=S*0.46;
    ctx.fillStyle='#0b0c0e'; ctx.fillRect(0,0,S,S);
    $('#'+P+'-counter').hidden=true; msg.style.top='11%';
    if (s.mode==='pupil'){
      /* 白屏（印有 0.5 mm 方格），出瞳光斑：离出瞳 δ 处边缘按视场角散开 */
      const span=8, ppm=(S-20)/span, x0=10, dz=s.z-lp(), spread=Math.abs(dz)*ap()/fe(), r=Dp()/2, cxp=x0+(span/2+0.37)*ppm;
      ctx.fillStyle='#ecebe6'; ctx.fillRect(x0,x0,S-20,S-20);
      for (let k=0;k<=span*2;k++){ const X=x0+k*ppm/2; ctx.strokeStyle=k%2?'rgba(80,120,160,.25)':'rgba(80,120,160,.55)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(X,x0); ctx.lineTo(X,S-x0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x0,X); ctx.lineTo(S-x0,X); ctx.stroke(); }
      ctx.fillStyle='rgba(60,90,120,.85)'; ctx.font='10px "PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif'; ctx.textAlign='center';
      for (let k=0;k<=span;k+=1) ctx.fillText(String(k),x0+k*ppm,S-x0-4);
      const g=ctx.createRadialGradient(cxp,S/2,Math.max(0,(r-spread)*ppm),cxp,S/2,(r+spread)*ppm+0.6);
      g.addColorStop(0,'rgba(255,236,170,.95)'); g.addColorStop(1,'rgba(255,236,170,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(cxp,S/2,(r+spread)*ppm+0.6,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#0b0c0e'; ctx.fillRect(0,0,S,26);   // 顶部留给说明文字
      $('#'+P+'-cap').textContent='目镜后的白屏（方格 0.5 mm，数字单位 mm）';
      msg.textContent = Math.abs(dz)<1 ? '光斑边缘清晰：这里就是出瞳' : Math.abs(dz)<6 ? '光斑边缘还有点模糊，继续前后移动白屏' : '前后移动白屏，找光斑最小、边缘最清晰的位置';
      return;
    }
    /* 目镜视场：倒立的标尺像 + 十字叉丝；视度、调焦不对时模糊，晃动眼睛时有视差 */
    const s1=S/340, eb=3*Math.abs(dE())*s1, ib=Math.abs(dF())*s.D/sp()*R/ap(), blur=Math.hypot(eb,ib), ppm=R/halfW(), par=wig*dF()*R/ap()*0.12;
    ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.clip();
    ctx.fillStyle='#4a4c50'; ctx.fillRect(0,0,S,S);
    ctx.filter=blur>0.3?`blur(${Math.min(12,blur).toFixed(1)}px)`:'none';
    const cc=center();
    const x0=cc-halfW()*1.15;                          // 倒像：读数 x 画在 cx − (x − cc)·ppm 处
    drawRuler(ctx, cx+par+(cc-x0)*ppm, cy+R*0.05, ppm, x0, cc+halfW()*1.15, R*0.42, true);
    /* 倒像：画布已旋转 180°，所以左端读数大 */
    ctx.filter=eb>0.3?`blur(${Math.min(8,eb).toFixed(1)}px)`:'none';
    ctx.strokeStyle='rgba(20,20,20,.9)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(cx-R,cy); ctx.lineTo(cx+R,cy); ctx.moveTo(cx,cy-R); ctx.lineTo(cx,cy+R); ctx.stroke();
    ctx.filter='none'; ctx.restore();
    ctx.strokeStyle='#000'; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(cx,cy,R+2,0,Math.PI*2); ctx.stroke();
    if (s.mode==='cmp'){
      /* 另一只眼睛直接看到的标尺（与望远镜里的像重叠）：只画黑白块，块的左缘与望远镜里某一块的边缘对齐 */
      const g=Gc(), pd=ppm/g, edge=cc-(s.ep==='A'?BLK/2:BLK), xEdge=cx-(edge-cc)*ppm;   // 倒像：标尺读数小的一端在右边
      const y0=cy+R*0.5, h=R*0.12;
      ctx.save(); ctx.globalAlpha=0.78;
      for (let k=-80;k<80;k++){ const X=xEdge+k*BLK*pd; if (X>S||X+BLK*pd<0) continue; ctx.fillStyle=k%2?'#f4f2ea':'#24262a'; ctx.fillRect(X,y0,BLK*pd,h); }
      ctx.strokeStyle='rgba(255,120,80,.9)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(xEdge,y0-6); ctx.lineTo(xEdge,y0+h+6); ctx.stroke(); ctx.restore();
      ctx.fillStyle='#d9d6cf'; ctx.font='11px "PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif'; ctx.textAlign='left'; ctx.fillText('另一只眼睛直接看到的标尺（每块 100 mm）',8,y0+h+15);
    }
    $('#'+P+'-cap').textContent = s.mode==='cmp' ? '双眼同时看：圆内为望远镜里的像（倒立）' : '目镜视场（像是倒立的）';
    msg.textContent = Math.abs(dE())>=0.35 ? '叉丝模糊：先转目镜视度圈' : Math.abs(dF())>=0.6 ? '标尺模糊：转调焦手轮' : wigOn&&Math.abs(dF())>=0.3 ? '晃动眼睛时标尺和叉丝有相对移动：还有视差，继续微调焦' : '';
  }

  /* ---------- 记录 ---------- */
  function note(t){ table(); $('#'+P+'-result').insertAdjacentHTML('afterbegin',`<div class="note">${esc(t)}</div>`); }
  function record(){
    if (s.mode==='focus') return note('调焦不需要记录数据。调好后切到“比较法”“出瞳法”或“视场”。');
    if (s.mode!=='pupil' && !inFocus()) return note('先调焦：叉丝和标尺都要清晰（视度圈和调焦手轮）。');
    const f=$('#'+P+'-askf'), q=$('#'+P+'-askq');
    if (s.mode==='cmp'){ const Kmax=s.ep==='A'?1:2;
      q.textContent='数一数：从红线（两个像对齐的边缘）向左，望远镜里的 K 个黑白块对应直接看到的多少块？估读到 0.1 块。';
      f.innerHTML=`<div class="row" style="margin-top:6px">望远镜里 <select id="${P}-K">${[...Array(Kmax)].map((_,i)=>`<option>${i+1}</option>`).join('')}</select> 块 = 直接看到 <input type="number" id="${P}-N" step="0.1" min="0" style="width:84px"> 块</div>`; }
    if (s.mode==='pupil'){ q.textContent='读出光斑（出瞳）的直径：两侧边缘在方格上的位置之差，估读到 0.05 mm。';
      f.innerHTML=`<div class="row" style="margin-top:6px">光斑直径 D′ <input type="number" id="${P}-d" step="0.01" min="0" style="width:84px"> mm</div>`; }
    if (s.mode==='field'){ q.textContent='读出视场两侧边缘对应的标尺读数（单位 mm，估读到 1 mm）。像是倒立的，左边缘读数反而大。';
      f.innerHTML=`<div class="row" style="margin-top:6px">较小读数 x₁ <input type="number" id="${P}-x1" step="1" style="width:84px"> mm　较大读数 x₂ <input type="number" id="${P}-x2" step="1" style="width:84px"> mm</div>`; }
    pend={mode:s.mode}; $('#'+P+'-askmsg').textContent=''; $('#'+P+'-ask').hidden=false; f.querySelector('input')?.focus();
  }
  function confirmRead(){
    if (!pend) return; const m=$('#'+P+'-askmsg'), v=id=>$('#'+P+'-'+id).value.trim();
    let row;
    if (pend.mode==='cmp'){ const K=+v('K'), N=+v('N'), exp=K*Gc();
      if (!v('N')||!(N>0)) return m.textContent='填写直接看到的块数。';
      if (Math.abs(N-exp)>Math.max(0.8,0.08*exp)) return m.textContent='和画面上相差较大：从红线开始数直接看到的小块，数到望远镜里第 K 块的另一条边缘为止。';
      row={t:'c', ep:s.ep, K, N, off:+(N-exp).toFixed(2), tl:+s.t.toFixed(2), dF:+dF().toFixed(2)}; }
    if (pend.mode==='pupil'){ const d=+v('d'), spread=2*Math.abs(s.z-lp())*ap()/fe();
      if (!v('d')||!(d>0)) return m.textContent='填写光斑直径（mm）。';
      if (Math.abs(d-Dp())>0.3+spread) return m.textContent='和画面上相差较大：读光斑左右两侧边缘在方格上的位置，相减得到直径。';
      row={t:'p', ep:s.ep, d, z:+s.z.toFixed(1), dz:+(s.z-lp()).toFixed(1)}; }
    if (pend.mode==='field'){ const x1=+v('x1'), x2=+v('x2'), e1=x1-(s.c-halfW()), e2=x2-(s.c+halfW());
      if (!v('x1')||!v('x2')||!(x2>x1)) return m.textContent='填写两个读数，较大的填在右边。';
      if (Math.abs(e1)>8||Math.abs(e2)>8) return m.textContent='和画面上相差较大：读视场圆的边缘与标尺中线相交处的刻度（像是倒立的）。';
      row={t:'f', ep:s.ep, x1, x2, e1:+e1.toFixed(1), e2:+e2.toFixed(1)}; }
    pend=null; $('#'+P+'-ask').hidden=true;
    s.rows.push(row); s.checked=false; s.review=''; $('#'+P+'-review').innerHTML='';
    stats.records++; logEvent('lab_record',{lab:P,n:s.rows.length,row}); table(); render();
  }

  /* ---------- 计算 ---------- */
  function calc(){
    const out={};
    for (const ep of ['A','B']){
      const nom=EP[ep].nom, r=s.rows.filter(x=>x.ep===ep), c=r.filter(x=>x.t==='c'), p=r.filter(x=>x.t==='p'), f=r.filter(x=>x.t==='f'), o={ep, nom, theory:FO/nom};
      if (c.length){ const g=c.map(x=>x.N/x.K), uB=Unc.mean(c.map(x=>0.2/Unc.SQRT3/x.K)), sum=Unc.summarize(g,uB), t=Unc.mean(c.map(x=>x.tl)), l=t+2*nom;
        o.cmp={g, sum, l, inf:sum.mean*(L-FO)/(L+l), uinf:sum.u*(L-FO)/(L+l)}; }
      if (p.length){ const g=p.map(x=>s.Dcal/x.d), uB=Unc.mean(p.map((x,i)=>g[i]*Math.hypot(0.02/Unc.SQRT3/s.Dcal,0.05/Unc.SQRT3/x.d))), sum=Unc.summarize(g,uB);
        o.pup={g, sum, inf:sum.mean*(L-FO)/L, uinf:sum.u*(L-FO)/L}; }
      if (f.length){ const w=f.map(x=>2*Math.atan((x.x2-x.x1)/2/L)*180/Math.PI), uB=2*Math.SQRT2*1/Unc.SQRT3/(2*L)*180/Math.PI, sum=Unc.summarize(w,uB);
        o.fov={w, sum}; }
      if (o.cmp||o.pup||o.fov) out[ep]=o;
    }
    return out;
  }
  function table(){
    save(); renderStats();
    if (!s.rows.length){ $('#'+P+'-table').innerHTML='<div class="empty">还没有数据。先调好目镜和焦距，再用比较法、出瞳法测放大率，读视场边缘。</div>'; $('#'+P+'-result').innerHTML=''; return; }
    const by=t=>s.rows.filter(r=>r.t===t);
    let h='';
    if (by('c').length) h+=`<table class="data"><tr><th>目镜</th><th>比较法 K</th><th>N（块）</th><th>Γ比 = N/K</th><th>调焦读数 / mm</th></tr>`+by('c').map(r=>`<tr><td>${r.ep}</td><td>${r.K}</td><td>${r.N}</td><td>${(r.N/r.K).toFixed(2)}</td><td>${r.tl.toFixed(2)}</td></tr>`).join('')+'</table>';
    if (by('p').length) h+=`<table class="data"><tr><th>目镜</th><th>出瞳直径 D′ / mm</th><th>白屏位置 / mm</th><th>Γ瞳 = D/D′</th></tr>`+by('p').map(r=>`<tr${Math.abs(r.dz)>3?' class="warn"':''}><td>${r.ep}</td><td>${r.d.toFixed(2)}</td><td>${r.z.toFixed(1)}</td><td>${(s.Dcal/r.d).toFixed(2)}</td></tr>`).join('')+'</table>';
    if (by('f').length) h+=`<table class="data"><tr><th>目镜</th><th>x₁ / mm</th><th>x₂ / mm</th><th>x₂ − x₁</th><th>2ω</th></tr>`+by('f').map(r=>`<tr><td>${r.ep}</td><td>${r.x1}</td><td>${r.x2}</td><td>${r.x2-r.x1}</td><td>${(2*Math.atan((r.x2-r.x1)/2/L)*180/Math.PI).toFixed(3)}°</td></tr>`).join('')+'</table>';
    $('#'+P+'-table').innerHTML=`<div class="fbtable">${h}</div>`;
    const c=calc(); let out='';
    for (const ep of ['A','B']){ const o=c[ep]; if (!o) continue;
      out+=`<div class="result"><b>目镜 ${EP[ep].name}</b>　标称 Γ = f₀/fₑ = ${FO}/${o.nom} = ${o.theory.toFixed(2)}`;
      if (o.cmp) out+=`<div>比较法：Γ比 = ${o.cmp.g.map(v=>v.toFixed(2)).join('、')}，平均 <span class="big">${o.cmp.sum.mean.toFixed(2)}</span>；换算到无穷远（ℓ ≈ ${o.cmp.l.toFixed(0)} mm）Γ∞ = ${Unc.format(o.cmp.inf,o.cmp.uinf,'').text}</div>${Unc.html(o.cmp.sum,'Γ比','')}`;
      if (o.pup) out+=`<div>出瞳法：Γ瞳 = ${o.pup.g.map(v=>v.toFixed(2)).join('、')}，平均 <span class="big">${o.pup.sum.mean.toFixed(2)}</span>；换算到无穷远 Γ∞ = ${Unc.format(o.pup.inf,o.pup.uinf,'').text}</div>${Unc.html(o.pup.sum,'Γ瞳','')}`;
      if (o.fov){ const g=o.pup?o.pup.sum.mean:o.cmp?o.cmp.sum.mean:o.theory, half=o.fov.sum.mean/2*Math.PI/180;
        out+=`<div>视场：物方视场角 2ω = <span class="big">${o.fov.sum.mean.toFixed(3)}°</span>，像方视场角 2ω′ = 2·arctan(Γ·tanω) ≈ ${(2*Math.atan(g*Math.tan(half))*180/Math.PI).toFixed(1)}°</div>${Unc.html(o.fov.sum,'2ω','°')}`; }
      if (s.checked) out+=`<div>真实值：f₀ = ${s.fo.toFixed(1)} mm，fₑ = ${(ep==='A'?s.feA:s.feB).toFixed(2)} mm，无穷远 Γ = ${(s.fo/(ep==='A'?s.feA:s.feB)).toFixed(2)}；标尺处 Γ瞳 = ${(sp()/(ep==='A'?s.feA:s.feB)).toFixed(2)}</div>`;
      out+='</div>';
    }
    if (!s.checked && Object.keys(c).length) out+='<div class="hint">真实焦距在 AI 批改后显示。</div>';
    $('#'+P+'-result').innerHTML=out;
  }

  /* ---------- AI 批改 ---------- */
  function offline(c){
    const p=[], A=c.A;
    if (!A) p.push('还没有 25 mm 目镜的数据');
    else { if (!A.cmp) p.push('没有做比较法'); if (!A.pup) p.push('没有做出瞳法'); if (!A.fov) p.push('没有测视场');
      if (A.cmp&&A.pup&&Math.abs(A.cmp.inf-A.pup.inf)>3*Math.hypot(A.cmp.uinf,A.pup.uinf)) p.push(`两种方法换算到无穷远后相差 ${(A.cmp.inf-A.pup.inf).toFixed(2)}，超出不确定度`); }
    const off=s.rows.filter(r=>r.t==='p'&&Math.abs(r.dz)>3);
    if (off.length) p.push(`${off.length} 次出瞳测量时白屏离出瞳超过 3 mm，光斑偏大，Γ瞳 偏小`);
    const pr=s.rows.filter(r=>r.t==='c'&&Math.abs(r.dF)>0.3); if (pr.length) p.push(`${pr.length} 次比较法记录时还有视差`);
    if (!c.B) p.push('没有做换目镜的进阶内容');
    return [`【总评】物镜真实焦距 ${s.fo.toFixed(1)} mm，目镜 A ${s.feA.toFixed(2)} mm、B ${s.feB.toFixed(2)} mm。`+(A?`目镜 A：${A.cmp?`比较法 Γ∞ ≈ ${A.cmp.inf.toFixed(2)}；`:''}${A.pup?`出瞳法 Γ∞ ≈ ${A.pup.inf.toFixed(2)}；`:''}真实值 ${(s.fo/s.feA).toFixed(2)}。`:''),
      '【数据问题】'+(p.length?p.join('；')+'。':'没有发现明显问题。'),
      '【误差来源】比较法数块时的估读和两眼像的对齐；出瞳法中白屏不在出瞳处时光斑变大、边缘模糊；视场边缘的估读；物镜、目镜标称焦距本身有公差；标尺不在无穷远，需要换算。',
      '【改进建议】先消除视差再测；比较法多数几块、取 K 大一些；出瞳法前后移动白屏，从两侧逼近最清晰的位置；记录调焦读数，用来估算眼睛到物镜的距离；比较两种方法换算后的结果。'].join('\n');
  }
  function review(){
    const c=calc();
    runReview(P,{
      check:()=>Object.keys(c).length?'':'还没有数据。至少用一种方法测一次放大率或视场。',
      prompt:()=>`你是大学应用光学实验课的助教，正在批改大一学生“望远镜放大率与视场测量”的实验数据。真实情况（学生不知道）：物镜 f₀ = ${s.fo.toFixed(1)} mm（标称 ${FO}），目镜 A fₑ = ${s.feA.toFixed(2)} mm（标称 25），目镜 B fₑ = ${s.feB.toFixed(2)} mm（标称 40）；标尺距物镜 ${L} mm，标尺的像距 s′ = ${sp().toFixed(1)} mm；物镜通光口径 ${s.D.toFixed(2)} mm（卡尺读 ${s.Dcal.toFixed(2)}）。
${['A','B'].filter(ep=>c[ep]).map(ep=>{ const o=c[ep]; return `目镜 ${ep}：${o.cmp?`比较法 Γ比 ${o.cmp.g.map(v=>v.toFixed(2)).join('、')}，平均 ${o.cmp.sum.mean.toFixed(3)}，换算到无穷远 ${o.cmp.inf.toFixed(3)}（ℓ≈${o.cmp.l.toFixed(0)} mm）；`:''}${o.pup?`出瞳法 Γ瞳 ${o.pup.g.map(v=>v.toFixed(2)).join('、')}，平均 ${o.pup.sum.mean.toFixed(3)}，换算 ${o.pup.inf.toFixed(3)}；`:''}${o.fov?`视场 2ω ${o.fov.w.map(v=>v.toFixed(3)).join('、')}°；`:''}标称 ${o.theory.toFixed(2)}，真实无穷远 Γ ${(s.fo/(ep==='A'?s.feA:s.feB)).toFixed(3)}。`; }).join('\n')}
系统记录：比较法每次与画面真实值的差（块）${s.rows.filter(r=>r.t==='c').map(r=>r.off).join('，')||'无'}；记录时调焦误差（mm）${s.rows.filter(r=>r.t==='c').map(r=>r.dF).join('，')||'无'}；出瞳法白屏离出瞳的距离（mm）${s.rows.filter(r=>r.t==='p').map(r=>r.dz).join('，')||'无'}；视场边缘读数误差（mm）${s.rows.filter(r=>r.t==='f').map(r=>`${r.e1}/${r.e2}`).join('，')||'无'}。
请给出批改意见：中文，250~350 字，分 4 段，每段开头依次写【总评】【数据问题】【误差来源】【改进建议】，段与段之间换行。比较两种方法与标称值，说明为什么标尺在有限远时测得的放大率比 f₀/fₑ 大、换算后是否吻合；换目镜后放大率和视场如何变化。只根据给出的数据说话，语气像耐心的助教，不要使用 Markdown。`,
      offline:()=>offline(c)
    }).then(ok=>{ if (ok){ s.checked=true; s.review=ok; table(); render(); } });
  }
  typeof Learn!=='undefined' && Learn.task(P,{title:'由放大率反推物镜焦距', label:'f₀', unit:'mm',
    text:'标尺在有限远处时，调焦后镜筒变长，出瞳法测得的 Γ瞳 = s′/fₑ。<b>用你的数据</b>：取目镜标称焦距 fₑ，由 Γ瞳 的平均值算出 s′ = Γ瞳·fₑ，再由 1/f₀ = 1/L + 1/s′ 反推物镜焦距 f₀（L = 5000 mm）。',
    ready:()=>{ const c=calc(); return !!(c.A?.pup||c.B?.pup); }, need:'先用出瞳法测至少一次放大率。', hint:'f₀ = L·s′/(L + s′)，用你测出瞳时那个目镜的标称焦距。',
    answer:()=>{ const c=calc(), o=c.A?.pup?c.A:c.B, sp_=o.pup.sum.mean*o.nom; return L*sp_/(L+sp_); }, tol:a=>a*0.004,
    reveal:()=>`物镜实际焦距 ${s.fo.toFixed(1)} mm（标称 ${FO} mm），目镜 A、B 实际为 ${s.feA.toFixed(2)}、${s.feB.toFixed(2)} mm。反推结果与真实值的差，主要来自目镜标称焦距的公差——标称值不等于真实值，这也是一种系统误差。`});
  return {mount, render, key};
})();
