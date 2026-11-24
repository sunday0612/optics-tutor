/* =====================================================================
 * lab-lens.js —— 虚拟实验：光具座测凸透镜焦距（共轴调节、二次成像法、自准法）
 * 操作：大像追小像调共轴 → 固定物屏距离 D，移动透镜找两次清晰像，f = (D² − d²)/(4D)，换几个 D
 *       → 自准法：平面镜放在透镜后，物屏上成清晰的倒像时透镜到物的距离就是 f；透镜转 180° 再测一次
 * 物理模型：薄透镜；透镜架的读数指标与透镜主面相差 δ（转 180° 后变号）；离焦时像按弥散圆模糊
 * 光路图：近轴光线追迹，二维“光路图”视图与三维模型共用同一组光线
 * ===================================================================== */
const LN = (() => {
  const P='ln', XO=100, AP=18, INST=0.5;                // 物的位置 (mm)、透镜有效口径 (mm)、导轨刻度的仪器误差限 (mm)
  const s={}; let B=null;
  const sgn=()=>Math.random()<.5?-1:1;

  function init(){
    Object.assign(s,{f:rnd(140,190), dl:sgn()*rnd(1,4), ex:sgn()*rnd(1.5,3), ey:sgn()*rnd(1.5,3),
      xl:rnd(250,330), xs:900, rev:false, mode:'align', coax:false, rows:[], checked:false});
  }
  const save=()=>LabStore.save(P,s);
  const pp=()=>s.xl+(s.rev?-s.dl:s.dl);                 // 透镜主面的真实位置
  /* 屏上的成像：v 为理想像距，blur 为弥散圆直径 (mm)，m 为放大率（倒立），c 为像中心相对物轴的偏移 */
  function image(){
    const u=pp()-XO, vs=s.xs-pp();
    if (u<=s.f*1.001) return {real:false};
    const v=u*s.f/(u-s.f), blur=AP*Math.abs(vs-v)/v, m=vs/u;
    return {real:true, u, v, vs, blur, m, cx:s.ex*(1+m), cy:s.ey*(1+m)};
  }
  /* 自准法：物经透镜、平面镜、透镜回到物平面，物恰在焦面上时像最清晰 */
  const autoBlur=()=>2*AP*Math.abs(pp()-XO-s.f)/s.f;
  /* ---------- 近轴光线追迹 ----------
   * 返回折线（坐标 mm：x 沿导轨，y 为离光轴的高度），kind：fwd 去程，back 自准法的回程，tip 物顶点发出的特征光线
   * 成像：物点 → 透镜（θ′ = θ − y/f）→ 屏；自准法：物点 → 透镜 → 平面镜（反射）→ 透镜 → 回到物平面 */
  const MIR=20, H0=5;                                  // 平面镜在透镜后 20 mm；画图用的物高 5 mm
  function trace(){
    const P0=pp(), f=s.f, u=P0-XO, out=[];
    if (s.mode==='auto'){
      for (const k of [0.9,0.45,0,-0.45,-0.9]){ const yl=k*AP/2, t0=(yl-H0)/u, t1=t0-yl/f, M=P0+MIR, ym=yl+t1*MIR;
        out.push({kind:'fwd', pts:[[XO,H0],[P0,yl],[M,ym]]});
        const yl2=ym+t1*MIR, a=t1-yl2/f; out.push({kind:'back', pts:[[M,ym],[P0,yl2],[XO,yl2+a*u]]}); }
      return out;
    }
    const xEnd=s.xs;
    for (const k of [0.9,0.45,-0.45,-0.9]){ const yl=k*AP/2, t1=yl/u-yl/f; out.push({kind:'fwd', pts:[[XO,0],[P0,yl],[xEnd,yl+t1*(xEnd-P0)]]}); }
    /* 物顶点：平行光线、过光心的光线（只画到屏） */
    const t1=-H0/f; out.push({kind:'tip', pts:[[XO,H0],[P0,H0],[xEnd,H0+t1*(xEnd-P0)]]});
    out.push({kind:'tip', pts:[[XO,H0],[xEnd,H0-H0/u*(xEnd-XO)]]});
    return out;
  }
  /* 二次成像法两个清晰位置（读数）：理论值 */
  function sharpPos(xs=s.xs){ const D=xs-XO, q=D*D-4*D*s.f; if (q<=0) return null; const r=Math.sqrt(q); const off=s.rev?-s.dl:s.dl;
    return [XO+(D-r)/2-off, XO+(D+r)/2-off]; }

  /* ---------- 页面 ---------- */
  function mount(el){
    el.innerHTML=labShell(P,{
      title:'光具座测凸透镜焦距',
      principle:`<p><b>等高共轴</b>：物、透镜、屏的中心要在同一条与导轨平行的直线上，否则成像有偏差。固定物和屏（距离大于 4f），移动透镜可以得到一大一小两个清晰像。若透镜光轴偏离物的中心 e，像中心偏离 e(1 + v/u)：大像偏得多、小像偏得少。调透镜的高度和左右，直到大像、小像的中心落在屏上同一点（“大像追小像”）。</p>
        <p><b>二次成像法（贝塞尔法）</b>：物屏距离 D 固定且 D > 4f，透镜在两个位置成清晰像，两位置相距 d，则 <b>f = (D² − d²)/(4D)</b>。它只用到两个位置的差，透镜架读数指标和透镜主面不重合造成的偏差会抵消，所以比直接测物距、像距准确。换几个 D 重复测量。</p>
        <p><b>自准法</b>：在透镜后放平面镜，物在透镜焦面上时，光经透镜变成平行光，被平面镜反射回来后又会聚在物平面上，成一个与物等大的清晰倒像。此时透镜到物的距离就是 f。读数指标与主面不重合会带来系统误差 δ；把透镜转 180° 再测一次，δ 变号，取平均就能消掉。</p>
        <p>判断“最清晰”有一定范围，可以用<b>左右逼近法</b>：从两侧分别移到刚好清晰的位置，取平均。不确定度：A 类取各次 f 的标准偏差；B 类按导轨刻度 Δ<sub>仪</sub> = ${INST} mm，两次读数相减取 √2·Δ<sub>仪</sub>/√3，再按公式传递。</p>`,
      right:`<div class="canvas-wrap fill"><canvas id="${P}-bench"></canvas><div class="caption">光具座示意（导轨刻度单位 mm）</div></div>
      <div class="lab-grid">
        <div class="canvas-wrap"><canvas id="${P}-view" class="eye"></canvas><div class="caption" id="${P}-cap">像屏</div><div class="msg" id="${P}-msg"></div><div class="counter" id="${P}-counter"></div></div>
        <div class="panel" id="${P}-panel">
          <div class="seg" id="${P}-modes"><button class="tab" data-v="align">1 共轴调节</button><button class="tab" data-v="bessel">2 二次成像法</button><button class="tab" data-v="auto">3 自准法</button></div>
          <label class="ctl" data-m="align"><span>透镜高度螺丝</span><output id="${P}-oey"></output><input type="range" id="${P}-ey" min="-4" max="4" step="0.01"></label>
          <label class="ctl" data-m="align"><span>透镜左右螺丝</span><output id="${P}-oex"></output><input type="range" id="${P}-ex" min="-4" max="4" step="0.01"></label>
          <label class="ctl" data-m="align bessel"><span>像屏位置</span><output id="${P}-oxs"></output><input type="range" id="${P}-xs" min="500" max="1500" step="1"></label>
          <div class="row" data-m="auto" style="margin-top:0"><button class="hold" id="${P}-flip">透镜转 180°</button><span class="tip" id="${P}-fliptip"></span></div>
          <div class="readout" id="${P}-readout"></div>
          <canvas id="${P}-drum" class="strip"></canvas>
          ${turnControls(P,[[1,'微调 1 mm/s'],[10,'中速 10 mm/s'],[60,'快速 60 mm/s']],{assist:'',left:'◀ 透镜左移',rightLabel:'透镜右移 ▶'})}
          <div class="tip">按住按钮移动透镜滑座，也可以拖动刻度条；键盘 ← → 每次 0.5 mm（Shift 为 5 mm）。</div>
        </div>
      </div>`});
    init(); LabStore.restore(P,s); stats.records+=s.rows.length; $('#'+P+'-review').innerHTML=paras(s.review||'');
    B=benchArea(P, Models3D.lens, ()=>({xl:s.xl, xs:s.xs, mode:s.mode, rev:s.rev, XO, ex:s.ex, ey:s.ey, rays:trace()}), {cap3d:'三维模型（光线高度放大显示）', ray:{cap:'光路图（竖直方向放大；随透镜滑座实时变化）'}});
    B.onChange=render;
    $('#'+P+'-modes').onclick=e=>{ const b=e.target.closest('button'); if (b){ s.mode=b.dataset.v; render(); } };
    for (const k of ['ex','ey']){ $('#'+P+'-'+k).value=s[k]; $('#'+P+'-'+k).addEventListener('input',e=>{ s[k]=+e.target.value; if (Math.abs(s.ex)<0.15&&Math.abs(s.ey)<0.15) s.coax=true; render(); }); }
    $('#'+P+'-xs').value=s.xs; $('#'+P+'-xs').addEventListener('input',e=>{ s.xs=+e.target.value; if (s.xl>s.xs-30) s.xl=s.xs-30; render(); });
    $('#'+P+'-flip').onclick=()=>{ s.rev=!s.rev; render(); };
    bindHold($('#'+P+'-panel'), $('#'+P+'-speed'), d=>{ move(d); render(); });
    bindDrag($('#'+P+'-drum'), 6, d=>{ move(d/2); render(); });
    $('#'+P+'-rec').onclick=record;
    $('#'+P+'-undo').onclick=()=>{ s.checked=false; s.review=''; $('#'+P+'-review').innerHTML=''; if (s.rows.pop()) stats.records--; table(); render(); };
    $('#'+P+'-clr').onclick=()=>{ stats.records-=s.rows.length; s.rows=[]; s.checked=false; s.review=''; $('#'+P+'-review').innerHTML=''; table(); render(); };
    $('#'+P+'-check').onclick=review;
    table();
  }
  function move(d){ const hi=s.mode==='auto'?1400:s.xs-30; s.xl=Math.max(XO+30,Math.min(hi,s.xl+d)); }
  function key(dir,big){ move(dir*(big?5:0.5)); render(); }

  /* ---------- 绘图 ---------- */
  function render(){
    /* 先切换面板上的控件，再按新的布局绘图 */
    document.querySelectorAll('#'+P+'-modes .tab').forEach(b=>b.classList.toggle('active',b.dataset.v===s.mode));
    document.querySelectorAll('#'+P+'-panel [data-m]').forEach(el=>{ el.hidden=!el.dataset.m.split(' ').includes(s.mode); });
    if (B.isRay()) rays(); else if (!(B.is3d() && B.update())) bench();
    view();
    $('#'+P+'-oey').textContent=s.ey.toFixed(2); $('#'+P+'-oex').textContent=s.ex.toFixed(2); $('#'+P+'-oxs').textContent=s.xs.toFixed(0)+' mm';
    $('#'+P+'-fliptip').textContent=s.rev?'（现在是反向放置）':'（现在是正向放置）';
    $('#'+P+'-readout').innerHTML=`<div>滑座读数</div><div class="v">透镜 ${s.xl.toFixed(1)} mm</div><div class="f">物 ${XO} mm${s.mode==='auto'?'　平面镜紧贴透镜后方':`　像屏 ${s.xs.toFixed(0)} mm　物屏距离 D = ${(s.xs-XO).toFixed(0)} mm`}</div>`;
    drawStrip($('#'+P+'-drum'), s.xl*2, {px:6, label:k=>k%20===0?String(k/2):''});
    $('#'+P+'-rec').textContent = s.mode==='auto' ? '记录：自准时透镜位置' : '记录：成清晰像时透镜位置';
    const c=calc(), nD=c.bessel.items.length, nA=c.auto;
    renderSteps(P,[
      [s.coax,'<b>共轴调节</b>：屏放远一些（物屏距离大于 4f），移动透镜分别找到大像和小像，调透镜的高度、左右螺丝，直到两个像的中心都落在屏的十字中心。'],
      [nD>=3,`<b>二次成像法</b>：固定屏的位置，移动透镜，在大像、小像两个清晰位置各记一次；换 3 个以上的屏位置重复（已完成 ${Math.min(nD,3)}/3 个 D）。`],
      [nA.n1>0&&nA.n2>0,'<b>自准法</b>：切到“自准法”，移动透镜直到物旁边出现清晰的倒像，记录透镜位置；再把透镜转 180° 重测一次。'],
      [s.checked,'<b>处理数据</b>：算出两种方法的焦距和不确定度，再让 AI 助教检查。']]);
  }
  function bench(){
    const c=$('#'+P+'-bench'); const {ctx,W}=benchSetup(c);
    const span=700, sc=Math.min(1,(W-20)/span); ctx.translate((W-span*sc)/2,230*(1-sc)/2); ctx.scale(sc,sc);
    const y=110, X=x=>40+x/1500*620, F12='12px "PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif';
    ctx.font=F12; ctx.textAlign='center';
    ctx.fillStyle='#2b2f35'; ctx.fillRect(40,y+40,620,8); ctx.fillStyle='#6f757d'; for (let x=0;x<=1500;x+=100){ ctx.fillRect(X(x),y+48,1,6); if (x%300===0) ctx.fillText(String(x),X(x),y+66); }
    ctx.fillStyle='#f2c94c'; ctx.fillRect(X(XO)-26,y-16,18,32); ctx.fillStyle='#e8e7e2'; ctx.fillRect(X(XO)-4,y-20,4,40); ctx.fillStyle='#c9c8c2'; ctx.fillText('光源 + 物',X(XO)-8,y-28);
    const im=image();
    ctx.strokeStyle='rgba(255,215,120,.35)'; ctx.lineWidth=1;
    if (s.mode!=='auto' && im.real){ [-14,14].forEach(h=>{ ctx.beginPath(); ctx.moveTo(X(XO),y); ctx.lineTo(X(pp()),y+h); ctx.lineTo(X(pp()+im.v),y); ctx.stroke(); }); }
    ctx.strokeStyle='#a9bbd6'; ctx.lineWidth=3; ctx.beginPath(); ctx.ellipse(X(s.xl),y,4,28,0,0,Math.PI*2); ctx.stroke(); ctx.fillStyle='#c9c8c2'; ctx.fillText(s.rev?'透镜（反向）':'透镜',X(s.xl),y-36);
    if (s.mode==='auto'){ ctx.fillStyle='#d6d7dc'; ctx.fillRect(X(s.xl)+8,y-26,4,52); ctx.fillText('平面镜',X(s.xl)+36,y+4); }
    else { ctx.fillStyle='#e9e7e1'; ctx.fillRect(X(s.xs)-2,y-30,5,60); ctx.fillStyle='#c9c8c2'; ctx.fillText('像屏',X(s.xs),y-36); }
  }
  /* 光路图：近轴光线追迹的结果，竖直方向放大；屏上（或物屏上）光线的散开范围就是弥散斑 */
  function rays(){
    const c=$('#'+P+'-bench'), H=Math.max(160,c.parentElement.clientHeight), {ctx,dpr,W}=setup(c,H); ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle='#0f1012'; ctx.fillRect(0,0,W,H);
    const R=trace(), auto=s.mode==='auto', P0=pp(), im=image();
    const xs=R.flatMap(r=>r.pts.map(p=>p[0])), x0=XO-30, x1=Math.max(...xs, auto?P0+MIR+20:s.xs+20);
    const L=30, Rt=W-24, cy=H*0.47, ky=H*0.26/(AP/2), lab=Math.min(H-50, cy+H*0.26+18), X=x=>L+(x-x0)/(x1-x0)*(Rt-L), Yp=y=>cy-y*ky;
    const F='12px "PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif'; ctx.font=F; ctx.textAlign='center'; ctx.lineCap='round';
    ctx.strokeStyle='rgba(255,255,255,.18)'; ctx.setLineDash([4,4]); ctx.beginPath(); ctx.moveTo(L-10,cy); ctx.lineTo(Rt+10,cy); ctx.stroke(); ctx.setLineDash([]);
    ctx.save(); ctx.beginPath(); ctx.rect(0,30,W,lab-46); ctx.clip();      // 发散到画面外的光线截掉
    /* 物 */
    ctx.strokeStyle='#f2c94c'; ctx.lineWidth=2.2; ctx.beginPath(); ctx.moveTo(X(XO),Yp(0)); ctx.lineTo(X(XO),Yp(H0)); ctx.lineTo(X(XO)-4,Yp(H0)+7); ctx.moveTo(X(XO),Yp(H0)); ctx.lineTo(X(XO)+4,Yp(H0)+7); ctx.stroke();
    if (auto){ ctx.strokeStyle='rgba(233,231,225,.5)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(X(XO),Yp(AP/2)); ctx.lineTo(X(XO),Yp(-AP/2)); ctx.stroke(); }
    /* 光线 */
    for (const r of R){ ctx.strokeStyle = r.kind==='back' ? 'rgba(120,200,255,.75)' : r.kind==='tip' ? 'rgba(255,170,90,.6)' : 'rgba(255,215,120,.8)';
      ctx.lineWidth=r.kind==='tip'?1:1.3; ctx.setLineDash(r.kind==='back'?[5,3]:r.kind==='tip'?[2,3]:[]);
      ctx.beginPath(); r.pts.forEach(([x,y],i)=>i?ctx.lineTo(X(x),Yp(y)):ctx.moveTo(X(x),Yp(y))); ctx.stroke(); }
    ctx.setLineDash([]); ctx.restore();
    ctx.fillStyle='#c9c8c2'; ctx.fillText(auto?'物（物屏）':'物',X(XO),lab);
    /* 透镜（在主面处） */
    ctx.strokeStyle='#a9bbd6'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(X(P0),Yp(AP/2)); ctx.lineTo(X(P0),Yp(-AP/2)); ctx.stroke();
    for (const sgn of [1,-1]){ ctx.beginPath(); ctx.moveTo(X(P0)-6,Yp(sgn*AP/2)+sgn*7); ctx.lineTo(X(P0),Yp(sgn*AP/2)); ctx.lineTo(X(P0)+6,Yp(sgn*AP/2)+sgn*7); ctx.stroke(); }
    ctx.fillStyle='#c9c8c2'; ctx.fillText(s.rev?'透镜（反向）':'透镜',X(P0)-(auto?14:0),lab);
    if (s.checked){ ctx.fillStyle='#8fd3a4'; for (const [x,t] of [[P0-s.f,'F'],[P0+s.f,'F′']]) if (x>x0&&x<x1){ ctx.beginPath(); ctx.arc(X(x),cy,3,0,Math.PI*2); ctx.fill(); ctx.fillText(t,X(x),cy+16); } }
    let note='';
    if (auto){
      const M=P0+MIR; ctx.fillStyle='#d6d7dc'; ctx.fillRect(X(M)-1.5,Yp(AP/2+2),3,(AP+4)*ky); ctx.fillStyle='#c9c8c2'; ctx.fillText('平面镜',X(M)+14,lab);
      const ends=R.filter(r=>r.kind==='back').map(r=>r.pts[2][1]), lo=Math.min(...ends), hi=Math.max(...ends), spread=hi-lo;
      ctx.strokeStyle='#ff8a6a'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(X(XO)-5,Yp(hi)); ctx.lineTo(X(XO)-5,Yp(lo)); ctx.stroke();
      note = spread<0.6 ? `回程光线会聚在物平面上（物的下方，倒像），说明物在透镜焦面上` : `回程光线到物平面时还散开 ${spread.toFixed(1)} mm（红线）：物${pp()-XO>s.f?'在焦点外，透镜要向物靠近':'在焦点内，透镜要远离物'}`;
    } else {
      ctx.fillStyle='#e9e7e1'; ctx.fillRect(X(s.xs)-2,Yp(AP/2+3),4,(AP+6)*ky); ctx.fillStyle='#c9c8c2'; ctx.fillText('像屏',X(s.xs),lab);
      const ends=R.filter(r=>r.kind==='fwd').map(r=>r.pts[2][1]), lo=Math.min(...ends), hi=Math.max(...ends);
      ctx.strokeStyle='#ff8a6a'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(X(s.xs)+6,Yp(hi)); ctx.lineTo(X(s.xs)+6,Yp(lo)); ctx.stroke();
      if (im.real && P0+im.v<x1+1){ const xi=P0+im.v, hi2=-H0*im.v/(P0-XO); ctx.strokeStyle='rgba(255,224,150,.9)'; ctx.lineWidth=1.6; ctx.setLineDash([3,3]); ctx.beginPath(); ctx.moveTo(X(xi),Yp(0)); ctx.lineTo(X(xi),Yp(hi2)); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle='#c9c8c2'; ctx.fillText('像',X(xi),Yp(hi2)+(hi2<0?16:-8)); }
      note = !im.real ? '透镜离物太近（物在焦点以内），光线经透镜后发散，屏上得不到实像'
        : im.blur<0.35 ? '光线正好会聚在屏上：像最清晰' : `光线会聚在屏${P0+im.v>s.xs?'后':'前'}，到屏上散开 ${im.blur.toFixed(1)} mm（红线），像是模糊的`;
    }
    ctx.textAlign='left'; ctx.fillStyle='#d9d6cf'; ctx.fillText(note,L,H-30);
    ctx.fillStyle='#6f757d'; ctx.fillText(auto?'实线：去程　虚线：经平面镜反射的回程':'实线：物上一点发出的光　点线：物顶点的特征光线', L, H-12);
  }
  /* 画一个物（向上的箭头加一横），按放大率倒立缩放；blur 用一圈偏移的副本模拟弥散圆 */
  function drawObj(ctx,cx,cy,scale,blur,ppm,col){
    const pts=[[0,-6],[0,6],[-2.2,3.6],[0,6],[2.2,3.6]], bar=[[-3,-1.5],[3,-1.5]];
    const n=blur*ppm>1.2?14:1, r=blur*ppm/2;
    ctx.strokeStyle=col; ctx.lineWidth=Math.max(1.4,0.9*ppm*Math.abs(scale)*0.25); ctx.lineCap='round';
    for (let k=0;k<n;k++){ const a=2*Math.PI*k/n, ox=n>1?Math.cos(a)*r:0, oy=n>1?Math.sin(a)*r:0; ctx.globalAlpha=n>1?Math.min(1,2.2/n):1;
      ctx.beginPath(); pts.forEach(([x,y],i)=>{ const X=cx+ox+x*scale*ppm, Y=cy+oy-y*scale*ppm; i?ctx.lineTo(X,Y):ctx.moveTo(X,Y); }); ctx.stroke();
      ctx.beginPath(); bar.forEach(([x,y],i)=>{ const X=cx+ox+x*scale*ppm, Y=cy+oy-y*scale*ppm; i?ctx.lineTo(X,Y):ctx.moveTo(X,Y); }); ctx.stroke(); }
    ctx.globalAlpha=1;
  }
  function view(){
    const c=$('#'+P+'-view'), S=eyeSize(c); c.style.width=S+'px';
    const {ctx,dpr}=setup(c,S); ctx.setTransform(dpr,0,0,dpr,0,0);
    const msg=$('#'+P+'-msg');
    ctx.fillStyle='#0b0c0e'; ctx.fillRect(0,0,S,S);
    if (s.mode==='auto'){
      /* 物屏（毛玻璃）：物在左，反射回来的倒像在右 */
      const ppm=S/60, cx=S/2;
      ctx.fillStyle='#2a2b2f'; ctx.fillRect(10,10,S-20,S-20);
      drawObj(ctx,cx-ppm*7,S/2,1,0,ppm,'rgba(255,224,150,.95)');
      const b=autoBlur(); drawObj(ctx,cx+ppm*7,S/2,-1,Math.min(b,25),ppm,`rgba(255,214,120,${Math.max(0.08,0.85/(1+b*0.3))})`);
      ctx.fillStyle='#8a9099'; ctx.font='11px "PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif'; ctx.fillText('物',cx-ppm*7-4,S-24); ctx.fillText('反射回来的像',cx+ppm*2,S-24);
      $('#'+P+'-cap').textContent='物屏（自准法）';
      msg.textContent = b<0.4 ? '' : b<3 ? '像已经出现，继续微调透镜位置' : '移动透镜，直到物旁边出现清晰的倒像';
    } else {
      const im=image(), ppm=S/90, cx=S/2, cy=S*0.55, RS=S*0.42;
      ctx.fillStyle='#e9e7e1'; ctx.beginPath(); ctx.arc(cx,cy,RS,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='rgba(60,60,60,.35)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(cx-RS,cy); ctx.lineTo(cx+RS,cy); ctx.moveTo(cx,cy-RS); ctx.lineTo(cx,cy+RS); ctx.stroke();
      if (im.real){ const b=Math.min(im.blur,30), a=Math.max(0.06,0.95/(1+b*0.12));
        ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,RS,0,Math.PI*2); ctx.clip();
        drawObj(ctx,cx+im.cx*ppm,cy-im.cy*ppm,-im.m,b,ppm,`rgba(150,95,20,${a})`); ctx.restore(); }
      const sharp=im.real&&im.blur<0.35, big=im.real&&im.m>1;
      $('#'+P+'-cap').textContent='像屏（十字为物的中心轴）';
      msg.textContent = !im.real ? '屏上没有实像：透镜离物太近' : sharp ? (s.mode==='align' ? `清晰的${big?'大':'小'}像：像中心偏离十字 ${Math.hypot(im.cx,im.cy).toFixed(1)} mm` : `清晰的${big?'大':'小'}像`) : '';
      msg.style.top='10%';
    }
    $('#'+P+'-counter').hidden=true;
  }

  /* ---------- 数据 ---------- */
  function note(t){ table(); $('#'+P+'-result').insertAdjacentHTML('afterbegin',`<div class="note">${esc(t)}</div>`); }
  function record(){
    if (s.mode==='align') return note('共轴调节不需要记录数据。调好后切到“二次成像法”。');
    if (!s.coax) return note('先完成共轴调节（大像、小像中心都落在十字中心）。');
    const x=+(s.xl+Math.round(rnd(-1.4,1.4))*0.1).toFixed(1);
    let row;
    if (s.mode==='bessel'){ const im=image(), sp=sharpPos();
      if (!sp) return note('物屏距离不大于 4f，移动透镜只能得到一个或得不到清晰像：把屏移远一些。');
      const k=Math.abs(s.xl-sp[0])<Math.abs(s.xl-sp[1])?0:1;
      row={t:'b', xs:+s.xs.toFixed(0), x, big:k===0, off:+(s.xl-sp[k]).toFixed(2), blur:im.real?+im.blur.toFixed(2):null}; }
    else row={t:'a', x, rev:s.rev, off:+(pp()-XO-s.f).toFixed(2)};
    s.rows.push(row); s.checked=false; s.review=''; $('#'+P+'-review').innerHTML='';
    stats.records++; logEvent('lab_record',{lab:P,n:s.rows.length,row}); table(); render();
  }
  function calc(){
    /* 二次成像法：同一屏位置的大像、小像各取最后一次（同一像多次记录取平均） */
    const m=new Map(); s.rows.filter(r=>r.t==='b').forEach(r=>{ if (!m.has(r.xs)) m.set(r.xs,{xs:r.xs,big:[],small:[]}); m.get(r.xs)[r.big?'big':'small'].push(r.x); });
    const items=[...m.values()].filter(g=>g.big.length&&g.small.length).map(g=>{ const x1=Unc.mean(g.big), x2=Unc.mean(g.small), D=g.xs-XO, d=Math.abs(x2-x1);
      return {D, x1, x2, d, f:(D*D-d*d)/(4*D)}; });
    const bessel={items, groups:[...m.values()]};
    if (items.length){ const uD=Math.SQRT2*INST/Unc.SQRT3, ud=uD;
      const uB=Unc.mean(items.map(x=>Math.hypot((x.D*x.D+x.d*x.d)/(4*x.D*x.D)*uD, x.d/(2*x.D)*ud)));
      Object.assign(bessel,{sum:Unc.summarize(items.map(x=>x.f),uB)}); bessel.mean=bessel.sum.mean; bessel.err=(bessel.mean-s.f)/s.f*100; }
    /* 自准法：正向、反向各自平均，再取两者的平均消去 δ */
    const a=s.rows.filter(r=>r.t==='a'), a1=a.filter(r=>!r.rev), a2=a.filter(r=>r.rev);
    const auto={n1:a1.length, n2:a2.length};
    if (a1.length) auto.f1=Unc.mean(a1.map(r=>r.x))-XO;
    if (a2.length) auto.f2=Unc.mean(a2.map(r=>r.x))-XO;
    if (a1.length&&a2.length){
      /* f = (x̄₁ + x̄₂)/2 − x物：A 类为两个方向平均值标准偏差的一半合成，B 类为两次透镜读数（各乘 ½）与物的读数 */
      auto.mean=(auto.f1+auto.f2)/2;
      const ua=[a1,a2].map(g=>g.length>1?Unc.typeA(g.map(r=>r.x)):0), uA=0.5*Math.hypot(ua[0],ua[1]), uB=INST/Unc.SQRT3*Math.sqrt(1.5);
      auto.sum={n:a.length, mean:auto.mean, uA:a1.length>1||a2.length>1?uA:null, uB, u:Unc.combine(uA,uB)};
      auto.err=(auto.mean-s.f)/s.f*100; auto.delta=(auto.f2-auto.f1)/2; }
    return {bessel, auto};
  }
  function table(){
    save(); renderStats();
    if (!s.rows.length){ $('#'+P+'-table').innerHTML='<div class="empty">还没有数据。先完成共轴调节，再用二次成像法和自准法测量。</div>'; $('#'+P+'-result').innerHTML=''; return; }
    const c=calc(), b=c.bessel, a=c.auto;
    let h='';
    if (b.groups.length) h+=`<table class="data"><tr><th>屏 / mm</th><th>D / mm</th><th>大像时 x₁</th><th>小像时 x₂</th><th>d / mm</th><th>f / mm</th></tr>`+
      b.groups.map(g=>{ const it=b.items.find(x=>x.D===g.xs-XO); return `<tr${it?'':' class="warn"'}><td>${g.xs}</td><td>${g.xs-XO}</td><td>${g.big.map(v=>v.toFixed(1)).join('、')||'—'}</td><td>${g.small.map(v=>v.toFixed(1)).join('、')||'—'}</td><td>${it?it.d.toFixed(1):'—'}</td><td>${it?it.f.toFixed(1):'—'}</td></tr>`; }).join('')+'</table>';
    const ar=s.rows.filter(r=>r.t==='a');
    if (ar.length) h+=`<div class="hint" style="margin-top:8px">自准法透镜读数（物在 ${XO} mm）：正向 ${ar.filter(r=>!r.rev).map(r=>r.x.toFixed(1)).join('、')||'—'}；反向 ${ar.filter(r=>r.rev).map(r=>r.x.toFixed(1)).join('、')||'—'}</div>`;
    $('#'+P+'-table').innerHTML=`<div class="fbtable">${h}</div>`;
    let out='';
    if (b.sum){ const f=Unc.format(b.mean,b.sum.u,'mm');
      out+=`<div class="result">二次成像法：${b.items.map(x=>x.f.toFixed(1)).join('、')} mm
        <div>平均 f = <span class="big">${b.mean.toFixed(1)} mm</span></div>${Unc.html(b.sum,'f','mm')}
        ${s.checked?`<div>透镜真实焦距 ${s.f.toFixed(1)} mm，相对误差 <b>${b.err>=0?'+':''}${b.err.toFixed(2)}%</b></div>`:'<div class="hint">真实焦距在 AI 批改后显示。</div>'}</div>`; }
    if (a.n1||a.n2){
      out+=`<div class="result">自准法：${a.f1!=null?`正向 f₁ = ${a.f1.toFixed(1)} mm`:'正向还没测'}；${a.f2!=null?`反向 f₂ = ${a.f2.toFixed(1)} mm`:'反向还没测'}
        ${a.mean!=null?`<div>取平均 f = (f₁ + f₂)/2 = <span class="big">${a.mean.toFixed(1)} mm</span>，两次之差的一半 ${Math.abs(a.delta).toFixed(1)} mm 就是读数指标与透镜主面的偏差</div>${Unc.html(a.sum,'f','mm')}
          ${s.checked?`<div>真实焦距 ${s.f.toFixed(1)} mm，相对误差 <b>${a.err>=0?'+':''}${a.err.toFixed(2)}%</b>；真实偏差 δ = ${Math.abs(s.dl).toFixed(1)} mm</div>`:''}`
          :'<div class="hint">只测了一个方向时，透镜架读数指标与主面的偏差没有消掉，结果会有系统误差。把透镜转 180° 再测一次。</div>'}</div>`; }
    $('#'+P+'-result').innerHTML=out;
  }

  /* ---------- AI 批改 ---------- */
  function offline(c){
    const b=c.bessel, a=c.auto, p=[];
    if (b.items.length&&b.items.length<3) p.push(`二次成像法只测了 ${b.items.length} 个 D，建议 3 个以上`);
    const loose=s.rows.filter(r=>Math.abs(r.off)>3);
    if (loose.length) p.push(`${loose.length} 次记录离真正最清晰的位置超过 3 mm（${loose.map(r=>`${r.t==='b'?`屏 ${r.xs} ${r.big?'大像':'小像'}`:`自准${r.rev?'反向':'正向'}`} 偏 ${r.off} mm`).join('，')}）`);
    const near=b.items.filter(x=>x.D<4.08*s.f), far=b.items.filter(x=>x.D>7*s.f);
    if (near.length) p.push(`D = ${near.map(x=>x.D).join('、')} mm 几乎等于 4f，两个清晰位置的“清晰范围”接近重叠，不容易分辨`);
    if (far.length) p.push(`D = ${far.map(x=>x.D).join('、')} mm 比 4f 大得多，f 对两个位置的读数更敏感，小像也太小，不确定度反而增大`);
    if ((a.n1&&!a.n2)||(!a.n1&&a.n2)) p.push('自准法只测了一个方向，没有消去透镜架读数指标的偏差');
    if (!b.items.length) p.push('还没有完成二次成像法');
    const t1=b.sum?`二次成像法 f = ${Unc.format(b.mean,b.sum.u,'mm').text}，相对误差 ${b.err.toFixed(2)}%。`:'', t2=a.mean!=null?`自准法 f = ${a.mean.toFixed(1)} mm，相对误差 ${a.err.toFixed(2)}%，正反两次相差 ${Math.abs(2*a.delta).toFixed(1)} mm，说明读数指标与主面偏差约 ${Math.abs(a.delta).toFixed(1)} mm。`:'';
    return [`【总评】透镜真实焦距 ${s.f.toFixed(1)} mm。${t1}${t2}`,
      '【数据问题】'+(p.length?p.join('；')+'。':'没有发现明显问题。'),
      '【误差来源】判断像最清晰的位置有一定范围（景深），这是主要误差；导轨读数误差；物、透镜、屏不共轴时像会变形、清晰位置不好判断；透镜有厚度、主面不在读数指标处（二次成像法能消去，自准法要正反各测一次）。',
      '【改进建议】用左右逼近法：从两侧分别移到刚好清晰的位置取平均；二次成像法的 D 取略大于 4f（约 4.2f～5f），既能分清两个清晰位置，f 的不确定度又小，换 3～5 个 D；自准法正反各测几次取平均；先做好共轴调节。'].join('\n');
  }
  function review(){
    const c=calc();
    runReview(P,{
      check:()=>c.bessel.sum||c.auto.mean!=null?'':'至少需要一组完整的二次成像数据（同一屏位置的大像和小像），或自准法正反两个方向的数据。',
      prompt:()=>`你是大学应用光学实验课的助教，正在批改大一学生“光具座测凸透镜焦距”的实验数据。透镜真实焦距 ${s.f.toFixed(1)} mm，透镜架读数指标与主面相差 ${s.dl.toFixed(1)} mm（学生不知道）。物在 ${XO} mm。
二次成像法：${c.bessel.items.map(x=>`D=${x.D} mm，大像 x₁=${x.x1.toFixed(1)}，小像 x₂=${x.x2.toFixed(1)}，d=${x.d.toFixed(1)}，f=${x.f.toFixed(1)}`).join('；')||'没有完整数据'}${c.bessel.sum?`；平均 ${c.bessel.mean.toFixed(1)} mm，${Unc.line(c.bessel.sum,'f','mm')}`:''}。
自准法：正向 ${c.auto.f1!=null?c.auto.f1.toFixed(1):'未测'} mm，反向 ${c.auto.f2!=null?c.auto.f2.toFixed(1):'未测'} mm${c.auto.mean!=null?`，平均 ${c.auto.mean.toFixed(1)} mm`:''}。
系统记录：每次记录时透镜离真正最清晰位置的偏差（mm）：${s.rows.map(r=>`${r.t==='b'?`屏${r.xs}${r.big?'大像':'小像'}`:`自准${r.rev?'反向':'正向'}`}:${r.off}`).join('，')}。
请给出批改意见：中文，250~350 字，分 4 段，每段开头依次写【总评】【数据问题】【误差来源】【改进建议】，段与段之间换行。比较两种方法的结果，解释为什么二次成像法不受透镜主面位置影响、自准法要正反各测一次。只根据给出的数据说话，语气像耐心的助教，不要使用 Markdown。`,
      offline:()=>offline(c)
    }).then(ok=>{ if (ok){ s.checked=true; s.review=ok; table(); render(); } });
  }
  /* 方案优化：二次成像法 D 取多大时 f 的不确定度最小 */
  const uR=Math.SQRT2*INST/Unc.SQRT3;
  function ufOf(r, f, judge){                           // r = D/f；judge：再计入判断“最清晰”的误差
    const D=r*f, d=Math.sqrt(Math.max(0,D*D-4*D*f)), a=(D*D+d*d)/(4*D*D), b=d/(2*D); let ud2=uR*uR;
    if (judge) for (const u of [(D-d)/2,(D+d)/2]){ const v=D-u, m=v/u, h=0.35*v/(AP*Math.abs(m*m-1)); ud2+=(h/Unc.SQRT3)**2; }
    return Math.sqrt((a*uR)**2+b*b*ud2);
  }
  function rMin(f){ for (let r=4.0005;r<5;r+=0.0005){ const D=r*f, d=Math.sqrt(D*D-4*D*f); let hs=0; for (const u of [(D-d)/2,(D+d)/2]){ const v=D-u, m=v/u; hs+=0.35*v/(AP*Math.abs(m*m-1)); } if (d>2*hs) return r; } return 5; }
  typeof Learn!=='undefined' && Learn.design(P,{title:'二次成像法的物屏距离 D 取多大最好',
    text:`二次成像法 f = (D² − d²)/(4D)。D 和 d 都是两个导轨读数之差，标准不确定度都是 u = √2·Δ<sub>仪</sub>/√3 = ${uR.toFixed(2)} mm。<b>先推导</b> u<sub>f</sub> 随 D 怎样变化（提示：令 t = f/D，可以化成 u<sub>f</sub> = u·√(t² − 2t + 1/2)），再回答：`,
    fields:[
      {k:'r1', label:'只考虑读数误差时，D 越接近几倍 f，u<sub>f</sub> 越小？', unit:'倍', answer:()=>4, tol:()=>0.1, hint:'看 t = f/D 取最大值 1/4 时'},
      {k:'r2', label:'只考虑读数误差，D 从 4.2f 增大到 8f，u<sub>f</sub> 变为原来的几倍？', unit:'倍', answer:()=>ufOf(8,1,false)/ufOf(4.2,1,false), tol:()=>0.06, hint:'分别代入 t = 1/4.2 和 t = 1/8'}],
    reveal:()=>{ const f=s.f, r0=rMin(f); return `只看读数误差，D → 4f 时 u<sub>f</sub> → u/4 最小：此时 d 很小，而 ∂f/∂d = −d/(2D) 也很小，d 的误差几乎不影响 f；D 很大时 u<sub>f</sub> → u/√2。但 D 太接近 4f 时，大像、小像两个位置靠得太近，各自的“清晰范围”（透镜移动 Δ 时离焦量为 Δ·|m² − 1|，m 接近 1 时很不敏感）会重叠，分不清两次成像；按本仿真的透镜，D 至少约 ${r0.toFixed(2)}f。所以 D <b>略大于 4f</b>（约 4.2f～5f）最好。下图是两种模型下 u<sub>f</sub> 随 D/f 的变化，圆点是你在不同 D 下测得的 f 与平均值之差，可以在仿真里换几个 D 验证。`; },
    draw:function dd(cv){ const f=s.f, rs=[...Array(120)].map((_,i)=>4.02+i*0.05), c=calc().bessel, mean=c.items.length?Unc.mean(c.items.map(x=>x.f)):null;
      const curve=j=>rs.map(r=>[r,ufOf(r,f,j)]), pts=c.items.map(x=>[x.D/f, Math.abs(x.f-mean)]);
      if (!cv.clientWidth) return whenVisible(cv,()=>dd(cv));
      const {ctx,dpr,W,H}=setup(cv,190); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);
      const all=[...curve(false),...curve(true),...pts], ymax=Math.max(...all.map(p=>p[1]))*1.1, L=44, R=W-10, T=12, B=H-26, X=r=>L+(r-4)/(10-4)*(R-L), Y=v=>B-v/ymax*(B-T);
      ctx.strokeStyle='#ccc'; ctx.beginPath(); ctx.moveTo(L,T); ctx.lineTo(L,B); ctx.lineTo(R,B); ctx.stroke();
      ctx.fillStyle='#5b616a'; ctx.font='11px "PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif'; ctx.textAlign='center'; for (let r=4;r<=10;r++) ctx.fillText(r+'f',X(r),B+14);
      ctx.textAlign='right'; for (let k=0;k<=4;k++){ const v=ymax*k/4; ctx.fillText(v.toFixed(2),L-4,Y(v)+4); }
      [[false,'#4E4486','只计读数误差'],[true,'#d08a3c','再计入判断清晰的误差']].forEach(([j,c2,t],n)=>{ ctx.strokeStyle=c2; ctx.lineWidth=1.6; ctx.beginPath(); curve(j).forEach(([r,v],i)=>i?ctx.lineTo(X(r),Y(v)):ctx.moveTo(X(r),Y(v))); ctx.stroke(); ctx.fillStyle=c2; ctx.textAlign='left'; ctx.fillText(t,L+8,T+12+n*14); });
      ctx.fillStyle='#1d1e21'; pts.forEach(([r,v])=>{ if (r<10){ ctx.beginPath(); ctx.arc(X(r),Y(v),3,0,Math.PI*2); ctx.fill(); } });
      ctx.textAlign='left'; ctx.fillStyle='#5b616a'; ctx.fillText('纵轴：u_f / mm（圆点为 |f − f̄|）　横轴：D',L+8,H-2); }});
  typeof Learn!=='undefined' && Learn.task(P,{title:'透镜架读数指标的偏差', label:'偏差 δ', unit:'mm',
    text:'透镜架上的读数指标不一定正好在透镜主面处。<b>用你的数据</b>：由自准法正向、反向两次的焦距 f₁、f₂，算出读数指标与主面的偏差 δ = |f₂ − f₁|/2。',
    ready:()=>calc().auto.mean!=null, need:'先用自准法正向、反向各测一次。', hint:'正反两次的差值的一半。',
    answer:()=>Math.abs(calc().auto.delta), tol:()=>0.15,
    reveal:()=>`读数指标与主面实际相差 ${Math.abs(s.dl).toFixed(2)} mm。自准法只测一个方向，f 就会差这么多；二次成像法只用到两个透镜位置的差 d，这个偏差自动抵消。`});
  return {mount, render, key};
})();
