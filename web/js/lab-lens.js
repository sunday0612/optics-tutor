/* =====================================================================
 * lab-lens.js —— 虚拟实验：光具座测凸透镜焦距（共轴调节、二次成像法、自准法）
 * 操作：大像追小像调共轴 → 固定物屏距离 D，移动透镜找两次清晰像，f = (D² − d²)/(4D)，换几个 D
 *       → 自准法：平面镜放在透镜后，物屏上成清晰的倒像时透镜到物的距离就是 f；透镜转 180° 再测一次
 * 物理模型：薄透镜；透镜架的读数指标与透镜主面相差 δ（转 180° 后变号）；离焦时像按弥散圆模糊
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
    B=benchArea(P, Models3D.lens, ()=>({xl:s.xl, xs:s.xs, mode:s.mode, rev:s.rev, XO, ex:s.ex, ey:s.ey}), {cap3d:'三维模型'});
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
    if (!(B.is3d() && B.update())) bench();
    view();
    document.querySelectorAll('#'+P+'-modes .tab').forEach(b=>b.classList.toggle('active',b.dataset.v===s.mode));
    document.querySelectorAll('#'+P+'-panel [data-m]').forEach(el=>{ el.hidden=!el.dataset.m.split(' ').includes(s.mode); });
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
      msg.style.top='3%';
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
    const near=b.items.filter(x=>x.D<4.6*s.f);
    if (near.length) p.push(`D = ${near.map(x=>x.D).join('、')} mm 离 4f 太近，两个清晰位置靠得很近，d 的相对误差大`);
    if ((a.n1&&!a.n2)||(!a.n1&&a.n2)) p.push('自准法只测了一个方向，没有消去透镜架读数指标的偏差');
    if (!b.items.length) p.push('还没有完成二次成像法');
    const t1=b.sum?`二次成像法 f = ${Unc.format(b.mean,b.sum.u,'mm').text}，相对误差 ${b.err.toFixed(2)}%。`:'', t2=a.mean!=null?`自准法 f = ${a.mean.toFixed(1)} mm，相对误差 ${a.err.toFixed(2)}%，正反两次相差 ${Math.abs(2*a.delta).toFixed(1)} mm，说明读数指标与主面偏差约 ${Math.abs(a.delta).toFixed(1)} mm。`:'';
    return [`【总评】透镜真实焦距 ${s.f.toFixed(1)} mm。${t1}${t2}`,
      '【数据问题】'+(p.length?p.join('；')+'。':'没有发现明显问题。'),
      '【误差来源】判断像最清晰的位置有一定范围（景深），这是主要误差；导轨读数误差；物、透镜、屏不共轴时像会变形、清晰位置不好判断；透镜有厚度、主面不在读数指标处（二次成像法能消去，自准法要正反各测一次）。',
      '【改进建议】用左右逼近法：从两侧分别移到刚好清晰的位置取平均；二次成像法的 D 取 4f 的 1.2～2 倍，换 3～5 个 D；自准法正反各测几次取平均；先做好共轴调节。'].join('\n');
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
  return {mount, render, key};
})();
