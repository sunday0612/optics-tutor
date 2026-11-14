/* =====================================================================
 * lab-newton.js —— 虚拟实验：牛顿环测平凸透镜曲率半径（读数显微镜）
 * 操作：调焦 → 对中 → 先越过第 35 环再反向，依次对准左 30…21、右 21…30 暗环 → 逐差法
 * ===================================================================== */
const NR = (() => {
  const P='nr', LAM=589.3e-6;          // 钠光波长 (mm)
  const FOV=2.4, DIV=0.01, BACKLASH=0.03;
  const SEQ=[...Array(10)].map((_,i)=>({side:'L',k:30-i})).concat([...Array(10)].map((_,i)=>({side:'R',k:21+i})));
  const s={}; let B=null;

  function init(){
    const Xc=rnd(24.2,25.8), X=Xc+rnd(-1.2,1.2);
    Object.assign(s,{Rtrue:rnd(850,1250), Xc, X, A:X, scale:rnd(0.998,1.002),
      focus:(Math.random()<.5?-1:1)*rnd(.45,.85), y0:(Math.random()<.5?-1:1)*rnd(.35,.8),
      focused:false, centered:false, lastDir:0, dead:0, reversals:0, rows:[], checked:false});
  }
  const sharp=()=>Math.abs(s.focus)<0.05, inCenter=()=>Math.abs(s.y0)<0.05;
  const order=()=>((s.A-s.Xc)**2+s.y0**2)/(s.Rtrue*LAM);                 // 叉丝处的干涉级次（暗环在整数处）
  const ideal=(side,k)=>{ const h2=k*s.Rtrue*LAM-s.y0**2; if (h2<=0) return null; const h=Math.sqrt(h2); return side==='L'?s.Xc-h:s.Xc+h; };

  function turn(divs){
    if (!divs) return;
    const dir=Math.sign(divs), delta=divs*DIV;
    if (s.lastDir && dir!==s.lastDir){ s.dead=BACKLASH; if (s.rows.length) s.reversals++; }
    s.lastDir=dir;
    let move=delta;
    if (s.dead>0){ const eat=Math.min(s.dead,Math.abs(delta)); s.dead-=eat; move=dir*(Math.abs(delta)-eat); }
    const na=s.A+move*s.scale; if (Math.abs(na-s.Xc)>7.5) return;
    s.X+=delta; s.A=na;
  }

  /* ---------- 页面 ---------- */
  function mount(el){
    el.innerHTML=labShell(P,{
      title:'牛顿环测平凸透镜的曲率半径',
      principle:`<p>平凸透镜放在平板玻璃上，两者之间形成中心薄、边缘厚的空气层。钠光垂直照射时，空气层上下表面的反射光干涉，形成以接触点为中心的明暗相间圆环，中心是暗斑。</p>
        <p>第 k 级暗环直径 D<sub>k</sub> 满足 D<sub>k</sub>² = 4kRλ。接触点可能有灰尘或形变，所以不直接用一个环，而是用两个环直径平方之差：<b>R = (D<sub>m</sub>² − D<sub>n</sub>²) / [4(m − n)λ]</b>，这样级次的绝对值数不准也没关系。</p>`,
      right:`<div class="canvas-wrap fill"><canvas id="${P}-bench"></canvas><div class="caption">装置示意（侧视）</div></div>
      <div class="lab-grid">
        <div class="canvas-wrap"><canvas id="${P}-view" class="eye"></canvas><div class="caption">读数显微镜视场</div><div class="msg" id="${P}-msg"></div><div class="counter" id="${P}-counter"></div></div>
        <div class="panel" id="${P}-panel">
          <label class="ctl"><span>调焦手轮</span><output id="${P}-of"></output><input type="range" id="${P}-focus" min="-1" max="1" step="0.005"></label>
          <label class="ctl"><span>牛顿环装置前后位置</span><output id="${P}-oy"></output><input type="range" id="${P}-y0" min="-1.5" max="1.5" step="0.005"></label>
          <div class="readout" id="${P}-readout"></div>
          <canvas id="${P}-drum" class="strip"></canvas>
          ${turnControls(P,[[3,'微调'],[15,'中速'],[80,'快速']],{assist:'显示级次',left:'◀ 叉丝左移',rightLabel:'叉丝右移 ▶'})}
          <div class="tip">按住按钮转动测微鼓轮（1 格 = 0.01 mm），也可以拖动刻度条；键盘 ← → 每次 1 格（Shift 为 10 格）。</div>
        </div>
      </div>`});
    init(); LabStore.restore(P,s); stats.records+=s.rows.length; $('#'+P+'-review').innerHTML=paras(s.review||'');
    B=benchArea(P, Models3D.newton, ()=>({dx:s.A-s.Xc, y0:s.y0, drum:((s.X*100)%100+100)%100, focus:s.focus}),
      {cap3d:'三维模型（显微镜和装置的移动量已放大显示）'});
    B.onChange=render;
    $('#'+P+'-focus').value=s.focus; $('#'+P+'-y0').value=s.y0;
    const latch=()=>{ if (sharp()) s.focused=true; if (sharp()&&inCenter()) s.centered=true; };
    $('#'+P+'-focus').addEventListener('input',e=>{ s.focus=parseFloat(e.target.value); latch(); render(); });
    $('#'+P+'-y0').addEventListener('input',e=>{ s.y0=parseFloat(e.target.value); latch(); render(); });
    $('#'+P+'-assist').onchange=render;
    bindHold($('#'+P+'-panel'), $('#'+P+'-speed'), d=>{ turn(d); render(); });
    bindDrag($('#'+P+'-drum'), 8, d=>{ turn(d); render(); });
    $('#'+P+'-rec').onclick=record;
    $('#'+P+'-undo').onclick=()=>{ s.checked=false; s.review=''; $('#'+P+'-review').innerHTML=''; if (s.rows.pop()) stats.records--; if(!s.rows.length) s.reversals=0; table(); render(); };
    $('#'+P+'-clr').onclick=()=>{ stats.records-=s.rows.length; s.rows=[]; s.reversals=0; s.checked=false; s.review=''; $('#'+P+'-review').innerHTML=''; table(); render(); };
    $('#'+P+'-check').onclick=review;
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
    const next=SEQ[s.rows.length];
    $('#'+P+'-rec').textContent = next ? `记录：${next.side==='L'?'左':'右'}侧第 ${next.k} 暗环` : '已记满 20 个';
    renderSteps(P,[
      [s.focused,'<b>调焦</b>：转动调焦手轮，直到干涉环清晰。'],
      [s.centered,'<b>对中</b>：前后移动牛顿环装置，让叉丝横线穿过环的中心（视场里环左右对称）。'],
      [s.rows.length>=20,`<b>测量</b>：先把叉丝<b>从中心向左移过第 35 暗环</b>，再反向向右移，依次对准左侧第 30…21 暗环、越过中心后对准右侧第 21…30 暗环，每次记录读数（已记 ${s.rows.length}/20）。`],
      [s.checked,'<b>处理数据</b>：用逐差法算出曲率半径 R，再让 AI 助教检查。']]);
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
        const I=(0.5-0.5*C*Math.cos(2*Math.PI*r2/RL))*(1-0.35*q)+0.04;
        img.data[o]=col[0]*255*I; img.data[o+1]=col[1]*255*I; img.data[o+2]=col[2]*255*I; img.data[o+3]=255; } }
    ctx.putImageData(img,0,0); ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.strokeStyle='rgba(255,255,255,.35)'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(S/2,8); ctx.lineTo(S/2,S-8); ctx.moveTo(8,S/2); ctx.lineTo(S-8,S/2); ctx.stroke();
    ctx.strokeStyle='#111'; ctx.lineWidth=1.2; ctx.beginPath(); ctx.moveTo(S/2,8); ctx.lineTo(S/2,S-8); ctx.moveTo(8,S/2); ctx.lineTo(S-8,S/2); ctx.stroke();
    $('#'+P+'-msg').textContent = !sharp() ? '视场模糊：先转动调焦手轮' : !inCenter() ? '横线没有穿过环心：调节装置前后位置' : '';
    const ctr=$('#'+P+'-counter');
    if (sharp() && $('#'+P+'-assist').checked){ const k=order(); ctr.textContent=`叉丝处约为 ${(s.A<s.Xc?'左':'右')}侧第 ${k.toFixed(1)} 级（暗环在整数级）`; ctr.hidden=false; }
    else ctr.hidden=true;
  }

  /* ---------- 数据 ---------- */
  function record(){
    const next=SEQ[s.rows.length];
    if (!next) return;
    if (!s.focused||!s.centered){ $('#'+P+'-result').innerHTML='<div class="note">先完成调焦和对中，再开始记录。</div>'; return; }
    const id=ideal(next.side,next.k), est=Math.round(rnd(-1.4,1.4))*1e-3;
    s.rows.push({...next, x:+(s.X+est).toFixed(3), off:id==null?null:+(s.A-id).toFixed(4)});
    s.checked=false; s.review=''; $('#'+P+'-review').innerHTML='';
    stats.records++; logEvent('lab_record',{lab:P,n:s.rows.length,row:s.rows[s.rows.length-1]}); table(); render();
  }
  function byK(){
    const m={}; s.rows.forEach(r=>{ (m[r.k]=m[r.k]||{})[r.side]=r.x; });
    return m;
  }
  function calc(){
    const m=byK(), D={}; for (const k in m) if (m[k].L!=null&&m[k].R!=null) D[k]=Math.abs(m[k].R-m[k].L);
    const items=[]; for (let k=26;k<=30;k++) if (D[k]!=null&&D[k-5]!=null) items.push({m:k,n:k-5,R:(D[k]**2-D[k-5]**2)/(4*5*LAM)/1000});
    if (!items.length) return {D,items};
    const mean=items.reduce((a,b)=>a+b.R,0)/items.length;
    return {D,items,mean,err:(mean-s.Rtrue/1000)/(s.Rtrue/1000)*100};
  }
  function table(){
    LabStore.save(P,s);
    renderStats();
    if (!s.rows.length){ $('#'+P+'-table').innerHTML='<div class="empty">还没有数据。调好焦、对好中心后，按步骤 3 的顺序记录。</div>'; $('#'+P+'-result').innerHTML=''; return; }
    const m=byK(), c=calc(), ks=Object.keys(m).map(Number).sort((a,b)=>b-a);
    $('#'+P+'-table').innerHTML=`<table class="data"><tr><th>级次 k</th><th>左侧 x / mm</th><th>右侧 x / mm</th><th>D<sub>k</sub> / mm</th><th>D<sub>k</sub>² / mm²</th></tr>`+
      ks.map(k=>`<tr><td>${k}</td><td>${m[k].L!=null?m[k].L.toFixed(3):'—'}</td><td>${m[k].R!=null?m[k].R.toFixed(3):'—'}</td><td>${c.D[k]!=null?c.D[k].toFixed(3):'—'}</td><td>${c.D[k]!=null?(c.D[k]**2).toFixed(3):'—'}</td></tr>`).join('')+'</table>';
    $('#'+P+'-result').innerHTML = c.items.length ? `<div class="result">逐差法（m − n = 5）：${c.items.map(x=>`R(${x.m},${x.n}) = ${x.R.toFixed(3)}`).join('，')} m
        <div>平均曲率半径 <span class="big">${c.mean.toFixed(3)} m</span>　本台装置参考值 ${(s.Rtrue/1000).toFixed(3)} m　相对误差 <b>${c.err>=0?'+':''}${c.err.toFixed(2)}%</b></div></div>`
      : '<div class="hint" style="margin-top:8px">左右两侧都记到相差 5 级的两个环后，自动用逐差法计算 R。</div>';
  }

  /* ---------- AI 批改 ---------- */
  function offline(c){
    const p=[], med=[...c.items.map(x=>x.R)].sort((a,b)=>a-b)[Math.floor(c.items.length/2)];
    const level=Math.abs(c.err)<1.5?'很好':Math.abs(c.err)<4?'基本合格':'偏大';
    if (s.rows.length<20) p.push(`只记录了 ${s.rows.length} 个位置，完整测量应左右各 10 个暗环`);
    const outl=c.items.filter(x=>Math.abs(x.R-med)/med>0.03);
    if (outl.length) p.push(`${outl.map(x=>`第 ${x.m} 与第 ${x.n} 级`).join('、')}这组算出的 R 和其他组差别明显，说明其中某个环对准不准或数错了环`);
    const miss=s.rows.filter(r=>r.off!=null&&Math.abs(r.off)>0.035), loose=s.rows.filter(r=>r.off!=null&&Math.abs(r.off)>0.012&&Math.abs(r.off)<=0.035);
    if (miss.length) p.push(`${miss.map(r=>(r.side==='L'?'左':'右')+r.k).join('、')} 的位置偏离超过半个环宽，很可能数错了环`);
    if (loose.length) p.push(`${loose.map(r=>(r.side==='L'?'左':'右')+r.k).join('、')} 叉丝没有压在暗环正中`);
    if (s.reversals) p.push(`记录过程中鼓轮反转了 ${s.reversals} 次，会引入回程差`);
    return [`【总评】得到 R = ${c.mean.toFixed(3)} m，与本台装置参考值 ${(s.Rtrue/1000).toFixed(3)} m 的相对误差为 ${c.err.toFixed(2)}%，结果${level}。`,
      '【数据问题】'+(p.length?p.join('；')+'。':'没有发现明显问题，各组结果一致，操作方向正确。'),
      '【误差来源】叉丝对准暗环中心的误差、数环时的计数错误、鼓轮的估读误差、测微螺杆的回程差，以及叉丝横线没有严格通过环心。',
      '【改进建议】测量前先越过第 35 环再反向，整个记录过程只朝一个方向转鼓轮；对准时让竖直叉丝与暗环相切在环宽中央；边移动边默数环数，必要时回到中心重数。'].join('\n');
  }
  function review(){
    const c=calc();
    runReview(P,{
      check:()=>c.items.length?'':'至少要有一组相差 5 级、左右两侧都记录了的数据才能检查。',
      prompt:()=>`你是大学物理实验课的助教，正在批改大一学生“牛顿环测平凸透镜曲率半径”的实验数据。钠光 λ = 589.3 nm，本台装置参考值 R = ${(s.Rtrue/1000).toFixed(3)} m。
学生的记录（级次 k，左侧读数，右侧读数，单位 mm）：
${Object.entries(byK()).sort((a,b)=>b[0]-a[0]).map(([k,v])=>`k=${k}: 左 ${v.L!=null?v.L.toFixed(3):'未记'}，右 ${v.R!=null?v.R.toFixed(3):'未记'}`).join('\n')}
逐差法结果：${c.items.map(x=>`R(${x.m},${x.n})=${x.R.toFixed(3)} m`).join('，')}；平均 ${c.mean.toFixed(3)} m，相对误差 ${c.err.toFixed(2)}%。
系统记录的操作情况：记录过程中鼓轮反转 ${s.reversals} 次；每次记录时叉丝偏离对应暗环中心的距离（μm，正为偏右）：${s.rows.map(r=>`${r.side==='L'?'左':'右'}${r.k}:${r.off==null?'?':Math.round(r.off*1000)}`).join('，')}。该处相邻暗环间距约 70 μm，偏离超过 35 μm 说明很可能数错了环。
请给出批改意见：中文，200~300 字，分 4 段，每段开头依次写【总评】【数据问题】【误差来源】【改进建议】，段与段之间换行。要点名具体是哪几个环有问题。只根据给出的数据说话，语气像耐心的助教，不要使用 Markdown。`,
      offline:()=>offline(c)
    }).then(ok=>{ if(ok){ s.checked=true; s.review=ok; LabStore.save(P,s); render(); } });
  }
  return {mount, render, key};
})();
