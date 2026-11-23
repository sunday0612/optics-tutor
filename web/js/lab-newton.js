/* =====================================================================
 * lab-newton.js —— 虚拟实验：牛顿环测平凸透镜曲率半径、劈尖测细丝直径（读数显微镜）
 * 操作：调焦 → 对中 → 先越过第 35 环再反向，依次对准左 30…21、右 21…30 暗环 → 逐差法
 * 接触点有灰尘（附加厚度）：数到的第 k 环满足 r² = Rλ(k − f)，单环算 R 偏小，逐差法不受影响
 * 叉丝横线不过环心时量到的是弦长，弦长平方差等于直径平方差
 * 第二部分：同一台读数显微镜测劈尖干涉条纹间距、棱边到细丝的距离，求细丝直径
 * ===================================================================== */
const NR = (() => {
  const P='nr', LAM=589.3e-6;          // 钠光波长 (mm)
  const FOV=2.4, DIV=0.01, BACKLASH=0.03;
  const INST=0.005;                    // 读数显微镜的仪器误差限 (mm)
  const SEQ=[...Array(10)].map((_,i)=>({side:'L',k:30-i})).concat([...Array(10)].map((_,i)=>({side:'R',k:21+i})));
  const s={}; let B=null, retake=[];
  let NX={f:0, mode:'ring', ring:null, w:null};   // 新增状态单独保存：f 为接触点附加厚度造成的级次小数，w 为劈尖部分
  const newWedge=()=>{ const xe=rnd(4,7); return {xe, L:rnd(30,38), dw:rnd(0.06,0.1), rows:[], sel:'f', rev:0, pos:{X:xe+rnd(3,8), A:0, dead:0, lastDir:0}}; };

  function init(){
    const Xc=rnd(24.2,25.8), X=Xc+rnd(-1.2,1.2);
    Object.assign(s,{Rtrue:rnd(850,1250), Xc, X, A:X, scale:rnd(0.998,1.002),
      focus:(Math.random()<.5?-1:1)*rnd(.45,.85), y0:(Math.random()<.5?-1:1)*rnd(.35,.8),
      focused:false, centered:false, lastDir:0, dead:0, reversals:0, rows:[], checked:false});
    NX={f:rnd(0.25,0.85), mode:'ring', ring:null, w:newWedge()}; NX.w.pos.A=NX.w.pos.X;
  }
  const W=()=>NX.w, wedge=()=>NX.mode==='wedge';
  const bw=()=>LAM*W().L/(2*W().dw);                                       // 劈尖条纹间距 (mm)
  const sharp=()=>Math.abs(s.focus)<0.05, inCenter=()=>Math.abs(s.y0)<0.05;
  const order=()=>((s.A-s.Xc)**2+s.y0**2)/(s.Rtrue*LAM)+NX.f;          // 叉丝处的干涉级次（从中心数起，暗环在整数处）
  const ideal=(side,k)=>{ const h2=(k-NX.f)*s.Rtrue*LAM-s.y0**2; if (h2<=0) return null; const h=Math.sqrt(h2); return side==='L'?s.Xc-h:s.Xc+h; };

  function turn(divs){
    if (!divs) return;
    const dir=Math.sign(divs), delta=divs*DIV;
    if (s.lastDir && dir!==s.lastDir){ s.dead=BACKLASH; if (wedge()){ if (W().rows.length) W().rev++; } else if (s.rows.length) s.reversals++; }
    s.lastDir=dir;
    let move=delta;
    if (s.dead>0){ const eat=Math.min(s.dead,Math.abs(delta)); s.dead-=eat; move=dir*(Math.abs(delta)-eat); }
    const na=s.A+move*s.scale; if (wedge() ? (na<0||na>50) : Math.abs(na-s.Xc)>7.5) return;
    s.X+=delta; s.A=na;
  }

  /* 两部分共用一台读数显微镜：切换时保存各自的镜筒位置和回程状态 */
  function setMode(m){
    if (m===NX.mode) return;
    const cur={X:s.X, A:s.A, dead:s.dead, lastDir:s.lastDir};
    if (wedge()) W().pos=cur; else NX.ring=cur;
    const nx=m==='wedge'?W().pos:(NX.ring||{X:s.Xc+1, A:s.Xc+1, dead:0, lastDir:0});
    Object.assign(s,{X:nx.X, A:nx.A, dead:nx.dead, lastDir:nx.lastDir});
    NX.mode=m; save(); table(); render();
  }

  /* ---------- 页面 ---------- */
  function mount(el){
    el.innerHTML=labShell(P,{
      title:'牛顿环测平凸透镜的曲率半径',
      principle:`<p>平凸透镜放在平板玻璃上，两者之间形成中心薄、边缘厚的空气层。钠光垂直照射时，空气层上下表面的反射光干涉，形成以接触点为中心的明暗相间圆环，中心是暗斑。</p>
        <p>第 k 级暗环直径 D<sub>k</sub> 满足 D<sub>k</sub>² = 4kRλ。接触点可能有灰尘或形变，所以不直接用一个环，而是用两个环直径平方之差：<b>R = (D<sub>m</sub>² − D<sub>n</sub>²) / [4(m − n)λ]</b>，这样级次的绝对值数不准也没关系。</p>
        <p>不确定度：A 类取各组 R 的平均值标准偏差；B 类由读数显微镜的仪器误差限 Δ<sub>仪</sub> = 0.005 mm 估算，D = x<sub>右</sub> − x<sub>左</sub> 得 u(D) = √2·Δ<sub>仪</sub>/√3，再按 R 对 D<sub>m</sub>、D<sub>n</sub> 的偏导传递。</p>
        <p><b>为什么要用逐差法</b>：接触点常有灰尘或形变，相当于中心多了一层厚度 e₀。这时从中心数起的第 k 个暗环满足 r<sub>k</sub>² = Rλ(k − f)，f 是 2e₀/λ 的小数部分，中心也不再是全暗的。只用一个环算 R = D<sub>k</sub>²/(4kλ) 会偏小约 f/k；两环相减时 f 正好抵消。</p>
        <p><b>没对中也能测</b>：叉丝横线如果偏离环心 y，量到的是弦长 c，c² = D² − 4y²，同样在相减时抵消：c<sub>m</sub>² − c<sub>n</sub>² = D<sub>m</sub>² − D<sub>n</sub>²。但整个测量过程中装置不能再前后移动。</p>
        <p><b>第二部分：劈尖测细丝直径</b>：两块平板玻璃一端接触（棱边），另一端夹一根细丝，形成楔形空气层，看到与棱边平行、等间距的直条纹。相邻暗纹对应的厚度差 λ/2，间距 b = λ/(2θ)，θ = d/L。所以 <b>d = Lλ/(2b)</b>，L 是棱边到细丝的距离。每隔 10 条暗纹记一次位置，用逐差法求 b；再分别对准棱边和细丝读出 L。</p>
        <p>本台装置的参考值和相对误差在 AI 批改之后才显示，先凭自己的数据判断结果是否可信。</p>`,
      right:`<div class="canvas-wrap fill"><canvas id="${P}-bench"></canvas><div class="caption">装置示意（侧视）</div></div>
      <div class="lab-grid">
        <div class="canvas-wrap"><canvas id="${P}-view" class="eye"></canvas><div class="caption">读数显微镜视场</div><div class="msg" id="${P}-msg"></div><div class="counter" id="${P}-counter"></div></div>
        <div class="panel" id="${P}-panel">
          <div class="seg" id="${P}-modes"><button class="tab" data-m="ring">牛顿环</button><button class="tab" data-m="wedge">劈尖测细丝直径</button></div>
          <div class="seg" id="${P}-sels" hidden><button class="tab" data-s="f">记暗纹</button><button class="tab" data-s="e">记棱边</button><button class="tab" data-s="w">记细丝</button></div>
          <label class="ctl"><span>调焦手轮</span><output id="${P}-of"></output><input type="range" id="${P}-focus" min="-1" max="1" step="0.005"></label>
          <label class="ctl" id="${P}-y0box"><span>牛顿环装置前后位置</span><output id="${P}-oy"></output><input type="range" id="${P}-y0" min="-1.5" max="1.5" step="0.005"></label>
          <div class="readout" id="${P}-readout"></div>
          <canvas id="${P}-drum" class="strip"></canvas>
          ${turnControls(P,[[3,'微调'],[15,'中速'],[80,'快速']],{assist:'显示级次',left:'◀ 叉丝左移',rightLabel:'叉丝右移 ▶'})}
          <div class="tip">按住按钮转动测微鼓轮（1 格 = 0.01 mm），也可以拖动刻度条；键盘 ← → 每次 1 格（Shift 为 10 格）。</div>
        </div>
      </div>`});
    init();
    const saved=LabStore.restore(P,s);
    retake=Array.isArray(saved?.retake)?saved.retake:[];
    if (saved){ const x=saved.x;                                                   // 旧存档没有灰尘：f = 0，与已有读数一致
      if (x && Number.isFinite(x.f)) NX={...NX, f:x.f, mode:x.mode==='wedge'?'wedge':'ring', ring:x.ring||null, w:x.w&&Array.isArray(x.w.rows)?x.w:NX.w};
      else NX.f=0; }
    stats.records+=s.rows.length;
    if (calc().invalid.length || pendingRetake().length) clearReview();
    $('#'+P+'-review').innerHTML=paras(s.review||'');
    B=benchArea(P, Models3D.newton, ()=>({dx:s.A-s.Xc, y0:s.y0, drum:((s.X*100)%100+100)%100, focus:s.focus}),
      {cap3d:'三维模型（显微镜和装置的移动量已放大显示）'});
    B.onChange=render;
    $('#'+P+'-focus').value=s.focus; $('#'+P+'-y0').value=s.y0;
    const latch=()=>{ if (sharp()) s.focused=true; if (sharp()&&inCenter()) s.centered=true; };
    $('#'+P+'-focus').addEventListener('input',e=>{ s.focus=parseFloat(e.target.value); latch(); render(); });
    $('#'+P+'-y0').addEventListener('input',e=>{ s.y0=parseFloat(e.target.value); latch(); render(); });
    $('#'+P+'-assist').onchange=render;
    $('#'+P+'-modes').onclick=e=>{ const b=e.target.closest('button'); if (b) setMode(b.dataset.m); };
    $('#'+P+'-sels').onclick=e=>{ const b=e.target.closest('button'); if (b){ W().sel=b.dataset.s; save(); render(); } };
    bindHold($('#'+P+'-panel'), $('#'+P+'-speed'), d=>{ turn(d); render(); });
    bindDrag($('#'+P+'-drum'), 8, d=>{ turn(d); render(); });
    $('#'+P+'-rec').onclick=record;
    $('#'+P+'-undo').onclick=()=>{
      clearReview();
      if (wedge()){ if (W().rows.pop()) stats.records--; table(); render(); return; }
      const removed=s.rows.pop();
      if (removed){
        stats.records--;
        if (removed.retake && !retake.includes(removed.k)) retake.push(removed.k);
      }
      if (!s.rows.length) s.reversals=0;
      table(); render();
    };
    $('#'+P+'-clr').onclick=()=>{ if (wedge()){ stats.records-=W().rows.length; W().rows=[]; W().rev=0; clearReview(); table(); render(); return; }
      stats.records-=s.rows.length; s.rows=[]; retake=[]; NX.f=rnd(0.25,0.85); s.reversals=0; clearReview(); table(); render(); };
    $('#'+P+'-check').onclick=review;
    $('#'+P+'-result').onclick=e=>{
      const button=e.target.closest('button[data-retake]');
      if (!button) return;
      const m=Number(button.dataset.retake), n=m-5;
      retake=[...new Set([...retake,m,n])];
      const count=s.rows.length;
      s.rows=s.rows.filter(r=>r.k!==m&&r.k!==n);
      stats.records-=count-s.rows.length;
      clearReview(); table(); render();
      $('#'+P+'-rec').focus();
    };
    table();
  }
  function key(dir,big){ turn(dir*(big?10:1)); render(); }

  /* ---------- 绘图 ---------- */
  function render(){
    if (!(B.is3d() && B.update())) bench();
    view();
    drawStrip($('#'+P+'-drum'), s.X*100, {label:k=>((k%100)+100)%100});
    const main=Math.floor(s.X+1e-9), d=(s.X-main)*100;
    $('#'+P+'-readout').innerHTML=`<div>读数显微镜读数</div><div class="v">${s.X.toFixed(3)} mm</div><div class="f">= 主尺 ${main} mm + 测微鼓轮 ${d.toFixed(1)} × 0.01 mm</div>`;
    $('#'+P+'-of').textContent=sharp()?'清晰':'模糊'; $('#'+P+'-oy').textContent=inCenter()?'已对中':'偏离';
    const next=nextReading();
    document.querySelectorAll('#'+P+'-modes .tab').forEach(b=>b.classList.toggle('active',b.dataset.m===NX.mode));
    document.querySelectorAll('#'+P+'-sels .tab').forEach(b=>b.classList.toggle('active',b.dataset.s===W().sel));
    $('#'+P+'-sels').hidden=!wedge(); $('#'+P+'-y0box').hidden=wedge();
    const wr=W().rows, nf=wr.filter(r=>r.t==='f').length;
    $('#'+P+'-rec').textContent = wedge() ? {f:'记录：暗纹位置',e:'记录：棱边位置',w:'记录：细丝中心位置'}[W().sel] : next ? `记录：${next.side==='L'?'左':'右'}侧第 ${next.k} 暗环` : '已记满 20 个';
    renderSteps(P,[
      [s.focused,'<b>调焦</b>：转动调焦手轮，直到干涉环清晰。'],
      [s.centered||s.rows.length>0,'<b>对中</b>：前后移动牛顿环装置，让叉丝横线穿过环的中心（视场里环左右对称）。没严格对中也能测（量到的是弦长），但开始记录后不要再移动装置。'],
      [s.rows.length>=20,`<b>测量</b>：先把叉丝<b>从中心向左移过第 35 暗环</b>，再反向向右移，依次对准左侧第 30…21 暗环、越过中心后对准右侧第 21…30 暗环，每次记录读数（已记 ${s.rows.length}/20）。`],
      [s.checked,'<b>处理数据</b>：用逐差法算出曲率半径 R，再让 AI 助教检查。'],
      [nf>=8,`<b>劈尖：测条纹间距</b>：切到“劈尖测细丝直径”，调焦后沿一个方向移动叉丝，每隔 10 条暗纹记一次位置，至少记 8 次（已记 ${Math.min(nf,8)}/8）。`],
      [wr.some(r=>r.t==='e')&&wr.some(r=>r.t==='w'),'<b>劈尖：测 L</b>：选“记棱边”对准两块玻璃的接触线，选“记细丝”对准细丝中心，各记一次，求出细丝直径。']]);
  }
  function bench(){
    const c=$('#'+P+'-bench'); const {ctx,W,H}=benchSetup(c);
    ctx.fillStyle='#0f1012'; ctx.fillRect(0,0,W,H);
    const cx=W*0.55+Math.max(-60,Math.min(60,(s.A-s.Xc)*12)), base=196;
    ctx.fillStyle='#2b2f35'; ctx.fillRect(W*0.2,base,W*0.65,10);                                 // 载物台
    ctx.fillStyle='rgba(175,192,214,.35)'; ctx.fillRect(W*0.55-70,base-8,140,8);                  // 平板玻璃
    ctx.fillStyle='rgba(175,192,214,.6)'; ctx.beginPath(); ctx.moveTo(W*0.55-60,base-26); ctx.lineTo(W*0.55+60,base-26); ctx.quadraticCurveTo(W*0.55,base-4,W*0.55-60,base-26); ctx.fill();   // 平凸透镜
    ctx.fillStyle='#3b4048'; ctx.fillRect(cx-14,40,28,96); ctx.fillRect(cx-9,22,18,20);            // 显微镜筒 + 目镜
    ctx.save(); ctx.translate(cx,150); ctx.rotate(-Math.PI/4); ctx.fillStyle='rgba(175,192,214,.75)'; ctx.fillRect(-18,-2.5,36,5); ctx.restore();   // 45° 半反镜
    ctx.strokeStyle='rgba(255,210,80,.75)'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(54,150); ctx.lineTo(cx,150); ctx.lineTo(cx,base-12); ctx.stroke();
    ctx.fillStyle='#f2c94c'; ctx.beginPath(); ctx.arc(40,150,14,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#c9c8c2'; ctx.font='12px "PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif'; ctx.textAlign='left';
    ctx.fillText('钠光灯',22,178); ctx.fillText('半反镜',cx+20,154); ctx.fillText('读数显微镜（随鼓轮左右移动）',cx+22,60); ctx.fillText('平凸透镜 + 平板玻璃',W*0.55+76,base-8);
    ctx.strokeStyle='#8e9298'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(W*0.2,base+20); ctx.lineTo(W*0.85,base+20); ctx.stroke();
    ctx.fillText('←  测微鼓轮带动镜筒水平移动  →',W*0.33,base+34-2);
  }
  function view(){
    const c=$('#'+P+'-view'), S=eyeSize(c); c.style.width=S+'px';
    const {ctx,dpr}=setup(c,S), n=c.width, img=ctx.createImageData(n,n), col=wl2rgb(589.3), RL=s.Rtrue*LAM, x0=s.A-s.Xc;
    for (let j=0;j<n;j++){ const v=(j/(n-1))*2-1;
      for (let i=0;i<n;i++){ const u=(i/(n-1))*2-1, q=u*u+v*v, o=(j*n+i)*4;
        if (q>1){ img.data[o]=12; img.data[o+1]=13; img.data[o+2]=15; img.data[o+3]=255; continue; }
        const x=x0+u*FOV/2, y=s.y0+v*FOV/2, r2=x*x+y*y, r=Math.sqrt(r2);
        const C=Math.exp(-((s.focus/0.12)**2)*(0.4+r/3));                                   // 离焦越多、环越密，对比度越低
        let I;
        if (wedge()){ const w=W(), xa=s.A+u*FOV/2, xw=w.xe+w.L;                               // 劈尖：与棱边平行的直条纹
          const Cw=Math.exp(-((s.focus/0.12)**2)*0.6);
          I = xa<w.xe ? 0.42 : Math.abs(xa-xw)<w.dw/2 ? 0.05 : xa>xw ? 0.4 : (0.5-0.5*Cw*Math.cos(2*Math.PI*(xa-w.xe)/bw()))*0.95+0.03;
          if (Math.abs(xa-w.xe)<0.012) I=0.02;
          I*=1-0.35*q; }
        else I=(0.5-0.5*C*Math.cos(2*Math.PI*(r2/RL+NX.f)))*(1-0.35*q)+0.04;
        img.data[o]=col[0]*255*I; img.data[o+1]=col[1]*255*I; img.data[o+2]=col[2]*255*I; img.data[o+3]=255; } }
    ctx.putImageData(img,0,0); ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.strokeStyle='rgba(255,255,255,.35)'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(S/2,8); ctx.lineTo(S/2,S-8); ctx.moveTo(8,S/2); ctx.lineTo(S-8,S/2); ctx.stroke();
    ctx.strokeStyle='#111'; ctx.lineWidth=1.2; ctx.beginPath(); ctx.moveTo(S/2,8); ctx.lineTo(S/2,S-8); ctx.moveTo(8,S/2); ctx.lineTo(S-8,S/2); ctx.stroke();
    const w=W(), xw=w.xe+w.L;
    $('#'+P+'-msg').textContent = !sharp() ? '视场模糊：先转动调焦手轮' : wedge() ? (s.A<w.xe-FOV/2 ? '视场里没有上玻璃：向右移动找到棱边' : s.A>xw+FOV/2 ? '已经越过细丝：向左移动' : '') : !inCenter() ? '横线没有穿过环心：可以调节装置前后位置；不对中时量到的是弦长' : '';
    const ctr=$('#'+P+'-counter');
    if (wedge()){ if (sharp() && $('#'+P+'-assist').checked && s.A>=w.xe && s.A<=xw){ ctr.textContent=`叉丝处约为从棱边数起第 ${((s.A-w.xe)/bw()).toFixed(1)} 条暗纹`; ctr.hidden=false; } else ctr.hidden=true; }
    else if (sharp() && $('#'+P+'-assist').checked){ const k=order(); ctr.textContent=`叉丝处约为 ${(s.A<s.Xc?'左':'右')}侧第 ${k.toFixed(1)} 级（暗环在整数级）`; ctr.hidden=false; }
    else ctr.hidden=true;
  }

  /* ---------- 数据 ---------- */
  function clearReview(){
    s.checked=false;
    s.review='';
    $('#'+P+'-review').innerHTML='';
  }
  function save(){
    LabStore.save(P,{...s,retake,x:NX});
  }
  function pendingRetake(){
    const readings=byK();
    return retake.filter(k=>readings[k]?.L==null||readings[k]?.R==null);
  }
  function nextReading(){
    const readings=byK();
    const missing=SEQ.filter(({k,side})=>readings[k]?.[side]==null);
    return missing.find(({k})=>retake.includes(k))||missing[0];
  }
  function record(){
    if (wedge()) return recordWedge();
    const next=nextReading();
    if (!next) return;
    if (!s.focused||!sharp()){ $('#'+P+'-result').innerHTML='<div class="note">先调焦，看清干涉环后再开始记录。</div>'; return; }
    const id=ideal(next.side,next.k), est=Math.round(rnd(-1.4,1.4))*1e-3;
    const row={...next,x:+(s.X+est).toFixed(3),off:id==null?null:+(s.A-id).toFixed(4),y0:+s.y0.toFixed(3)};
    if (retake.includes(next.k)) row.retake=true;
    s.rows.push(row);
    clearReview();
    retake=pendingRetake();
    stats.records++; logEvent('lab_record',{lab:P,n:s.rows.length,row:s.rows[s.rows.length-1]}); table(); render();
  }
  function byK(){
    const m={}; s.rows.forEach(r=>{ (m[r.k]=m[r.k]||{})[r.side]=r.x; });
    return m;
  }
  /* 劈尖记录：off 为叉丝离对应目标（最近的暗纹 / 棱边 / 细丝中心）的距离，学生看不到 */
  function recordWedge(){
    if (!sharp()){ table(); $('#'+P+'-result').insertAdjacentHTML('afterbegin','<div class="note">先调焦，看清条纹再记录。</div>'); return; }
    const w=W(), est=Math.round(rnd(-1.4,1.4))*1e-3, x=+(s.X+est).toFixed(3), sel=w.sel;
    let row;
    if (sel==='f'){ if (s.A<w.xe||s.A>w.xe+w.L){ table(); $('#'+P+'-result').insertAdjacentHTML('afterbegin','<div class="note">叉丝不在劈尖条纹区域内。</div>'); return; }
      const N=Math.round((s.A-w.xe)/bw()); row={t:'f', x, N, off:+(s.A-(w.xe+N*bw())).toFixed(4)}; }
    else row={t:sel, x, off:+(s.A-(sel==='e'?w.xe:w.xe+w.L)).toFixed(4)};
    w.rows.push(row); clearReview(); stats.records++; logEvent('lab_record',{lab:P,wedge:w.rows.length,row}); table(); render();
  }
  function wedgeCalc(){
    const w=W(), fr=w.rows.filter(r=>r.t==='f').slice().sort((a,b)=>a.N-b.N), n=fr.length;
    const e=[...w.rows].reverse().find(r=>r.t==='e'), wi=[...w.rows].reverse().find(r=>r.t==='w');
    const out={n, fr, e, wi, b:null, L:null, d:null};
    if (n>=4){ const k=Math.floor(n/2), items=[];
      for (let i=0;i<k;i++){ const dN=Math.abs(fr[i+k].N-fr[i].N); if (dN) items.push({i,k,dN,b:Math.abs(fr[i+k].x-fr[i].x)/dN}); }
      if (items.length){ const uB=Math.SQRT2*INST/Unc.SQRT3/Unc.mean(items.map(x=>x.dN)); out.items=items; out.sum=Unc.summarize(items.map(x=>x.b),uB); out.b=out.sum.mean; } }
    if (e&&wi){ out.L=Math.abs(wi.x-e.x); out.uL=Math.SQRT2*INST/Unc.SQRT3; }
    if (out.b&&out.L){ out.d=out.L*LAM/(2*out.b); out.ud=out.d*Math.hypot(out.uL/out.L,out.sum.u/out.b); out.err=(out.d-w.dw)/w.dw*100; }
    return out;
  }
  /* 只用一个环直接算 R = D²/(4kλ)，用来和逐差法比较 */
  function single(D){ const ks=Object.keys(D).map(Number).filter(k=>D[k]>0); if (!ks.length) return null;
    const v=ks.map(k=>D[k]**2/(4*k*LAM)/1000); return {n:ks.length, mean:Unc.mean(v)}; }
  function calc(){
    const readings=byK(), diametersUm={}, D={};
    for (const [k,{L,R}] of Object.entries(readings)){
      if (L==null||R==null) continue;
      diametersUm[k]=Math.abs(Math.round(R*1000)-Math.round(L*1000));
      D[k]=diametersUm[k]/1000;
    }
    const items=[], invalid=[];
    for (let m=26;m<=30;m++){
      const n=m-5;
      if (D[m]==null||D[n]==null) continue;
      // 先用整数微米的平方作差，避免相同的直径出现浮点残差。
      const squaredDifferenceUm2=diametersUm[m]**2-diametersUm[n]**2;
      const squaredDifference=squaredDifferenceUm2/1e6;
      if (squaredDifferenceUm2<=0){
        invalid.push({m,n,Dm:D[m],Dn:D[n],squaredDifference});
        continue;
      }
      items.push({m,n,Dm:D[m],Dn:D[n],R:squaredDifference/(4*(m-n)*LAM)/1000});
    }
    const validCount=items.length;
    if (!validCount) return {D,items,invalid,validCount};
    const mean=items.reduce((a,b)=>a+b.R,0)/validCount;
    // B 类：u(D) = √2·Δ仪/√3；∂R/∂D = 2D/[4(m−n)λ]，各组取平均（单位换成 m）
    const uD=Math.SQRT2*INST/Unc.SQRT3;
    const uB=Unc.mean(items.map(x=>Math.hypot(2*x.Dm*uD,2*x.Dn*uD)/(4*(x.m-x.n)*LAM)/1000));
    const sum=Unc.summarize(items.map(x=>x.R), uB);
    const ys=s.rows.map(r=>r.y0).filter(v=>v!=null), ySpread=ys.length?Math.max(...ys)-Math.min(...ys):0;
    return {D,items,invalid,validCount,mean,sum,err:(mean-s.Rtrue/1000)/(s.Rtrue/1000)*100,single:single(D),ySpread,y0:ys.length?Unc.mean(ys):null};
  }
  function table(){
    save();
    renderStats();
    if (wedge()){ $('#'+P+'-table').innerHTML=wedgeTable(); $('#'+P+'-result').innerHTML=wedgeResult()+(s.rows.length?'<div class="hint" style="margin-top:8px">牛顿环部分的结果在“牛顿环”页查看。</div>':''); return; }
    if (!s.rows.length){ $('#'+P+'-table').innerHTML='<div class="empty">还没有数据。调好焦、对好中心后，按步骤 3 的顺序记录。</div>'; $('#'+P+'-result').innerHTML=wedgeResult(); return; }
    const m=byK(), c=calc(), ks=Object.keys(m).map(Number).sort((a,b)=>b-a);
    const invalidLevels=new Set(c.invalid.flatMap(({m,n})=>[m,n]));
    $('#'+P+'-table').innerHTML=`<table class="data"><tr><th>级次 k</th><th>左侧 x / mm</th><th>右侧 x / mm</th><th>D<sub>k</sub> / mm</th><th>D<sub>k</sub>² / mm²</th></tr>`+
      ks.map(k=>`<tr${invalidLevels.has(k)?' class="warn"':''}><td>${k}</td><td>${m[k].L!=null?m[k].L.toFixed(3):'—'}</td><td>${m[k].R!=null?m[k].R.toFixed(3):'—'}</td><td>${c.D[k]!=null?c.D[k].toFixed(3):'—'}</td><td>${c.D[k]!=null?(c.D[k]**2).toFixed(3):'—'}</td></tr>`).join('')+'</table>';
    const warnings=c.invalid.map(({m,n,Dm,Dn,squaredDifference})=>{
      const magnitude=Math.abs(squaredDifference);
      const difference=magnitude===0?'0':`−${magnitude.toFixed(magnitude<0.001?6:3)} mm²`;
      return `<div class="note">
        <div>第 ${m} 级与第 ${n} 级：D<sub>${m}</sub> = ${Dm.toFixed(3)} mm，D<sub>${n}</sub> = ${Dn.toFixed(3)} mm，直径平方差为 ${difference}，应为正。请重测这两级。</div>
        <button type="button" class="ghost" data-retake="${m}">重测第 ${m} 级和第 ${n} 级</button>
      </div>`;
    }).join('');
    let result='<div class="hint" style="margin-top:8px">左右两侧都记到相差 5 级的两个环后，自动用逐差法计算 R。</div>';
    if (c.validCount){
      const countNote=c.invalid.length?`<div class="hint">已剔除 ${c.invalid.length} 组无效数据，平均值基于 ${c.validCount} 组。</div>`:'';
      result=`<div class="result">逐差法（m − n = 5）：${c.items.map(x=>`R(${x.m},${x.n}) = ${x.R.toFixed(3)}`).join('，')} m
        <div>平均曲率半径 <span class="big">${c.mean.toFixed(3)} m</span>　${s.checked?`本台装置参考值 ${(s.Rtrue/1000).toFixed(3)} m　相对误差 <b>${c.err>=0?'+':''}${c.err.toFixed(2)}%</b>`:'<span class="hint">参考值和相对误差在 AI 批改后显示</span>'}</div>
        ${Unc.html(c.sum,'R','m')}
        ${countNote}
        ${c.single?(()=>{ const d=(c.single.mean-c.mean)/c.mean*100; return `<div class="hint">对比：只用一个环直接算 R = D<sub>k</sub>²/(4kλ)，${c.single.n} 个环的平均是 ${c.single.mean.toFixed(3)} m，${Math.abs(d)<0.3?'与逐差法基本一致：这台装置接触点干净、叉丝也过了环心。实际装置往往做不到，所以仍要用逐差法。':`比逐差法${d<0?'偏小':'偏大'} ${Math.abs(d).toFixed(1)}%。接触点的附加厚度和叉丝不过环心都会影响单环结果，但在两环相减时抵消。`}</div>`; })():''}
        ${c.ySpread>0.01?`<div class="note">记录过程中装置前后移动过（叉丝横线位置变化了 ${c.ySpread.toFixed(2)} mm），各环量到的弦不在同一条直线上，结果不可靠，建议重测。</div>`:''}</div>`;
    } else if (c.invalid.length) {
      result='<div class="hint">重测后给出平均值。</div>';
    }
    $('#'+P+'-result').innerHTML=result+warnings+wedgeResult();
  }
  function wedgeTable(){
    const w=W(), fr=w.rows.filter(r=>r.t==='f').slice().sort((a,b)=>a.N-b.N), e=w.rows.filter(r=>r.t==='e'), wi=w.rows.filter(r=>r.t==='w');
    if (!w.rows.length) return '<div class="empty">还没有劈尖数据。调焦后从棱边附近开始，每隔 10 条暗纹记一次位置；再分别记棱边和细丝的位置。</div>';
    const N0=fr.length?fr[0].N:0;
    return (fr.length?`<table class="data plt"><tr><th>暗纹序号</th>${fr.map(r=>`<td>${r.N-N0}</td>`).join('')}</tr><tr><th>x / mm</th>${fr.map(r=>`<td>${r.x.toFixed(3)}</td>`).join('')}</tr></table>`:'')+
      `<div class="hint">棱边位置：${e.length?e.map(r=>r.x.toFixed(3)).join('、')+' mm':'未记'}　细丝位置：${wi.length?wi.map(r=>r.x.toFixed(3)).join('、')+' mm':'未记'}${e.length>1||wi.length>1?'（取最后一次）':''}</div>`;
  }
  function wedgeResult(){
    const c=wedgeCalc(); if (!c.n && !c.L) return '';
    let h='<div class="result">劈尖测细丝直径：';
    h+= c.b ? `条纹间距（逐差法）b = ${c.b.toFixed(4)} mm${c.items?`，各组 ${c.items.map(x=>x.b.toFixed(4)).join('、')}`:''}` : '至少记 4 个暗纹位置才能求间距';
    h+= c.L!=null ? `<div>棱边到细丝 L = ${c.L.toFixed(3)} mm</div>` : '<div class="hint">还需要分别记录棱边和细丝的位置。</div>';
    if (c.d){ const f=Unc.format(c.d,c.ud,'mm');
      h+=`<div>细丝直径 d = Lλ/(2b) = <span class="big">${(c.d*1000).toFixed(1)} µm</span></div>
        <div class="unc">不确定度：u(b) = ${(+c.sum.u.toPrecision(2))} mm（A 类与读数 B 类合成），u(L) = ${(+c.uL.toPrecision(2))} mm，u(d)/d = √[(u(L)/L)² + (u(b)/b)²]<div>结果：<b>d = ${f.text}</b>，相对不确定度 ${f.rel.toFixed(1)}%</div></div>
        ${s.checked?`<div>细丝真实直径 ${(W().dw*1000).toFixed(1)} µm，相对误差 <b>${c.err>=0?'+':''}${c.err.toFixed(1)}%</b></div>`:'<div class="hint">真实直径在 AI 批改后显示。</div>'}`; }
    return h+'</div>';
  }

  /* ---------- AI 批改 ---------- */
  function wedgeOffline(wc){
    const w=W(), p=[], fr=wc.fr, bad=fr.filter(r=>Math.abs(r.off)>bw()*0.25), steps=fr.slice(1).map((r,i)=>r.N-fr[i].N);
    if (wc.n<8) p.push(`劈尖只记了 ${wc.n} 个暗纹位置，建议记 8 个以上`);
    if (bad.length) p.push(`劈尖第 ${bad.map(r=>r.N-fr[0].N).join('、')} 条暗纹的位置没有对准暗纹中心`);
    if (steps.some(d=>d!==steps[0])) p.push('劈尖相邻两次记录间隔的暗纹数不一致，检查是否数错');
    if (wc.e&&Math.abs(wc.e.off)>0.05) p.push(`棱边位置偏了 ${Math.abs(wc.e.off).toFixed(2)} mm`);
    if (wc.wi&&Math.abs(wc.wi.off)>0.03) p.push(`细丝位置偏了 ${Math.abs(wc.wi.off).toFixed(2)} mm，应对准细丝中心`);
    if (w.rev) p.push(`劈尖测量中鼓轮反转了 ${w.rev} 次，会引入回程差`);
    return {sum:wc.d?`劈尖测得细丝直径 d = ${Unc.format(wc.d,wc.ud,'mm').text}，真实值 ${(w.dw*1000).toFixed(1)} µm，相对误差 ${wc.err.toFixed(1)}%。`:'劈尖部分数据还不完整。', probs:p};
  }
  function offline(c, wc){
    const wx=wc&&(wc.n||wc.L)?wedgeOffline(wc):null;
    if (!c.validCount) return [`【总评】${wx.sum}`, '【数据问题】'+(wx.probs.length?wx.probs.join('；')+'。':'没有发现明显问题。'),
      '【误差来源】叉丝对准暗纹中心的误差、数条纹时的计数错误、棱边和细丝位置的判断误差、鼓轮读数误差和回程差。',
      '【改进建议】沿一个方向移动叉丝，每隔 10 条记一次；条纹多时边移边默数；棱边对准两块玻璃的接触线，细丝对准中心；多记几组用逐差法。'].join('\n');
    const p=[], med=[...c.items.map(x=>x.R)].sort((a,b)=>a-b)[Math.floor(c.items.length/2)];
    const level=Math.abs(c.err)<1.5?'很好':Math.abs(c.err)<4?'基本合格':'偏大';
    if (s.rows.length<20) p.push(`只记录了 ${s.rows.length} 个位置，完整测量应左右各 10 个暗环`);
    const outl=c.items.filter(x=>Math.abs(x.R-med)/med>0.03);
    if (outl.length) p.push(`${outl.map(x=>`第 ${x.m} 与第 ${x.n} 级`).join('、')}这组算出的 R 和其他组差别明显，说明其中某个环对准不准或数错了环`);
    const miss=s.rows.filter(r=>r.off!=null&&Math.abs(r.off)>0.035), loose=s.rows.filter(r=>r.off!=null&&Math.abs(r.off)>0.012&&Math.abs(r.off)<=0.035);
    if (miss.length) p.push(`${miss.map(r=>(r.side==='L'?'左':'右')+r.k).join('、')} 的位置偏离超过半个环宽，很可能数错了环`);
    if (loose.length) p.push(`${loose.map(r=>(r.side==='L'?'左':'右')+r.k).join('、')} 叉丝没有压在暗环正中`);
    if (s.reversals) p.push(`记录过程中鼓轮反转了 ${s.reversals} 次，会引入回程差`);
    if (c.ySpread>0.01) p.push(`记录过程中装置前后移动了 ${c.ySpread.toFixed(2)} mm，弦长不再对应同一条直线`);
    if (wx) p.push(...wx.probs);
    const dom=c.sum.uA!=null && c.sum.uA>c.sum.uB ? 'A 类（各组 R 的离散）比仪器误差大，说明对准和数环带来的偶然误差是主要来源' : 'B 类（读数显微镜的仪器误差）占主导，说明各组数据比较一致';
    const sg=c.single?`只用单个环直接算会得到 ${c.single.mean.toFixed(3)} m，偏差 ${((c.single.mean-c.mean)/c.mean*100).toFixed(1)}%，这正是要用逐差法的原因：接触点的附加厚度${Math.abs(c.y0||0)>0.05?'和叉丝没过环心':''}在相减时抵消了。`:'';
    return [`【总评】得到 R = ${Unc.format(c.sum.mean,c.sum.u,'m').text}，与本台装置参考值 ${(s.Rtrue/1000).toFixed(3)} m 的相对误差为 ${c.err.toFixed(2)}%，结果${level}。${sg}${wx?wx.sum:''}`,
      '【数据问题】'+(p.length?p.join('；')+'。':'没有发现明显问题，各组结果一致，操作方向正确。'),
      `【误差来源】叉丝对准暗环中心的误差、数环时的计数错误、鼓轮的估读误差、测微螺杆的回程差，以及叉丝横线没有严格通过环心。从不确定度看，${dom}。`,
      '【改进建议】测量前先越过第 35 环再反向，整个记录过程只朝一个方向转鼓轮；对准时让竖直叉丝与暗环相切在环宽中央；边移动边默数环数，必要时回到中心重数。'].join('\n');
  }
  function review(){
    const c=calc(), pending=pendingRetake(), wc=wedgeCalc();
    runReview(P,{
      check:()=>{
        if (!s.rows.length) return wc.d?'':'牛顿环部分至少要有一组相差 5 级、左右两侧都记录了的数据；或者完成劈尖部分（暗纹位置、棱边和细丝都要记录）。';
        if (c.invalid.length){
          const levels=c.invalid.map(({m,n})=>`第 ${m} 级与第 ${n} 级`).join('、');
          return `${levels}的数据无效，请先重测再检查。`;
        }
        if (pending.length){
          const levels=pending.map(k=>`第 ${k} 级`).join('、');
          return `${levels}尚未补齐，请完成重测再检查。`;
        }
        return c.validCount||wc.d?'':'至少要有一组相差 5 级、左右两侧都记录了的数据才能检查。';
      },
      prompt:()=>`你是大学物理实验课的助教，正在批改大一学生“牛顿环测平凸透镜曲率半径、劈尖测细丝直径”的实验数据。钠光 λ = 589.3 nm，本台牛顿环参考值 R = ${(s.Rtrue/1000).toFixed(3)} m。
${c.validCount?`本台装置接触点有附加厚度，相当于级次小数 f = ${NX.f.toFixed(2)}；记录时叉丝横线平均偏离环心 ${c.y0!=null?c.y0.toFixed(2):'0'} mm，过程中装置前后移动 ${c.ySpread.toFixed(3)} mm。只用单个环直接算 R 的平均为 ${c.single?c.single.mean.toFixed(3):'—'} m（用于说明逐差法的必要性）。
学生的记录（级次 k，左侧读数，右侧读数，单位 mm）：
${Object.entries(byK()).sort((a,b)=>b[0]-a[0]).map(([k,v])=>`k=${k}: 左 ${v.L!=null?v.L.toFixed(3):'未记'}，右 ${v.R!=null?v.R.toFixed(3):'未记'}`).join('\n')}
逐差法结果：${c.items.map(x=>`R(${x.m},${x.n})=${x.R.toFixed(3)} m`).join('，')}；平均 ${c.mean.toFixed(3)} m，相对误差 ${c.err.toFixed(2)}%。
${Unc.line(c.sum,'R','m')}（B 类按读数显微镜仪器误差限 0.005 mm 估算）。
系统记录的操作情况：记录过程中鼓轮反转 ${s.reversals} 次；每次记录时叉丝偏离对应暗环中心的距离（μm，正为偏右）：${s.rows.map(r=>`${r.side==='L'?'左':'右'}${r.k}:${r.off==null?'?':Math.round(r.off*1000)}`).join('，')}。该处相邻暗环间距约 70 μm，偏离超过 35 μm 说明很可能数错了环。
`:'学生没有做牛顿环部分。'}
${wc.n||wc.L!=null?`劈尖部分：细丝真实直径 ${(W().dw*1000).toFixed(1)} µm，棱边到细丝真实距离 ${W().L.toFixed(3)} mm，真实条纹间距 ${bw().toFixed(4)} mm。学生记录的暗纹（相对序号，位置 mm，离真实暗纹中心 mm）：${wc.fr.map(r=>`(${r.N-(wc.fr[0]?wc.fr[0].N:0)}, ${r.x.toFixed(3)}, ${r.off})`).join(' ')}；棱边读数 ${wc.e?wc.e.x.toFixed(3)+'（偏 '+wc.e.off+'）':'未记'}，细丝读数 ${wc.wi?wc.wi.x.toFixed(3)+'（偏 '+wc.wi.off+'）':'未记'}；鼓轮反转 ${W().rev} 次。${wc.d?`结果 b = ${wc.b.toFixed(4)} mm，L = ${wc.L.toFixed(3)} mm，d = ${(wc.d*1000).toFixed(1)} µm，不确定度 ${(wc.ud*1000).toFixed(1)} µm，相对误差 ${wc.err.toFixed(1)}%。`:''}`:'学生没有做劈尖部分。'}
${c.validCount?'请顺带解释为什么单环直接算 R 会有偏差而逐差法不会。':''}请给出批改意见：中文，200~300 字，分 4 段，每段开头依次写【总评】【数据问题】【误差来源】【改进建议】，段与段之间换行。要点名具体是哪几个环有问题；【误差来源】里结合 A、B 两类不确定度的大小说明主要误差来自哪里。只根据给出的数据说话，语气像耐心的助教，不要使用 Markdown。`,
      offline:()=>offline(c, wc)
    }).then(ok=>{ if(ok){ s.checked=true; s.review=ok; table(); render(); } });
  }
  return {mount, render, key};
})();
