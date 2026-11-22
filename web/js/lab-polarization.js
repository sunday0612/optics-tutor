/* =====================================================================
 * lab-polarization.js —— 虚拟实验：验证马吕斯定律，鉴别波片（He-Ne 632.8 nm）
 * 操作：转检偏器找消光 → 每隔一定角度记录光强 → 拟合 I = I_min + (I_max − I_min)cos²(θ − θ∥)
 *       进阶：正交偏振器之间放入未知波片，找消光定光轴 → 转波片测各角度的 I_max、I_min → 判断 λ/4 还是 λ/2
 * 物理模型：琼斯矩阵；起偏器、检偏器有有限消光比，波片的相位延迟有制造误差
 * ===================================================================== */
const PL = (() => {
  const P='pl', I0=480, EPS=0.002, TP=0.98;            // 起偏后光强 (µW)、偏振片消光比、波片透过率
  const INST=0.1;                                      // 转盘游标的仪器误差限 (°)
  const ALIGNMENT_TOLERANCE=2, EXTINCTION_LIMIT=0.006, EXTREMA_TOLERANCE=15;
  const PLATE_GROUPS=5;
  const QUARTER_RATIO='理想 λ/4 波片在 α = 45° 时产生圆偏振光；其他角度的比值为 min(sin²α, cos²α) / max(sin²α, cos²α)。';
  const rad=d=>d*Math.PI/180, deg=r=>r*180/Math.PI;
  const mod=(x,m)=>((x%m)+m)%m, norm90=x=>{ x=mod(x,180); return x>90?x-180:x; };
  const round1=x=>Math.round(x*10)/10;
  const s={}; let B=null, timer=0, fit=null;
  const sgn=()=>Math.random()<.5?-1:1;

  function init(){
    const type=Math.random()<.5?'q':'h';
    Object.assign(s,{t0:mod(sgn()*rnd(8,35),180), f0:rnd(0,180), type, delta:type==='q'?90+sgn()*rnd(0.5,3.5):180+sgn()*rnd(0.5,4),
      th:rnd(0,360), a:rnd(0,360), plate:false, mode:'malus', sel:'an', ext:false, guess:'', rows:[], checked:false});
  }
  const save=()=>LabStore.save(P,s);

  /* ---------- 琼斯矩阵：起偏器透振方向为 x 轴（实验室 0°） ---------- */
  function field(a=s.a, plate=s.plate){
    if (!plate) return [[1,0],[0,0]];                  // [Ex, Ey]，每个分量 [实部, 虚部]
    const f=rad(a-s.f0), c=Math.cos(f), sn=Math.sin(f), d=rad(s.delta);
    const u=c, v=[-sn*Math.cos(d), -sn*Math.sin(d)];   // 快轴分量不变，慢轴分量滞后 δ
    return [[u*c - v[0]*sn, -v[1]*sn], [u*sn + v[0]*c, v[1]*c]];
  }
  /* 检偏器透振方向在实验室中的角度 = 读数 − t0 */
  function intensity(th=s.th, a=s.a, plate=s.plate){
    const E=field(a,plate), p=rad(th-s.t0), c=Math.cos(p), sn=Math.sin(p);
    const re=E[0][0]*c+E[1][0]*sn, im=E[0][1]*c+E[1][1]*sn;
    return I0*(plate?TP:1)*((1-EPS)*(re*re+im*im)+EPS)+0.05;
  }
  /* 某个波片位置的理想偏振态：转一圈检偏器求 I_max、I_min 与长轴方向（相对起偏器） */
  function ellipse(a){
    let mx=-1, mn=1e9, at=0;
    for (let k=0;k<1800;k++){ const p=k/10, E=field(a,true), c=Math.cos(rad(p)), sn=Math.sin(rad(p));
      const re=E[0][0]*c+E[1][0]*sn, im=E[0][1]*c+E[1][1]*sn, I=re*re+im*im; if (I>mx){ mx=I; at=p; } if (I<mn) mn=I; }
    return {ratio:mn/mx, major:norm90(at)};
  }
  const fluct=()=>{ const t=(typeof performance!=='undefined'?performance.now():Date.now())/1000; return 0.003*Math.sin(2*Math.PI*t/8.3)+0.0015*Math.sin(2*Math.PI*t/2.7+2); };
  const meter=()=>intensity()*(1+fluct());
  const fmtI=v=>v>=100?v.toFixed(1):v>=10?v.toFixed(2):v.toFixed(3);
  function turn(d){
    if (s.sel==='wp' && s.mode==='plate'){ if (s.plate) s.a=mod(s.a+d,360); }
    else s.th=mod(s.th+d,360);
    if (s.mode==='malus' && !s.plate && intensity()/I0<0.01) s.ext=true;
  }

  /* ---------- 页面 ---------- */
  function mount(el){
    el.innerHTML=labShell(P,{
      title:'马吕斯定律与波片',
      principle:`<p><b>马吕斯定律</b>：线偏振光通过检偏器后，光强 I = I₀cos²θ，θ 是光的振动方向与检偏器透振方向的夹角。实际偏振片不能完全消光，所以写成 <b>I = I<sub>min</sub> + (I<sub>max</sub> − I<sub>min</sub>)·cos²(θ − θ<sub>∥</sub>)</b>，θ 是检偏器转盘读数，θ<sub>∥</sub> 是检偏器与起偏器平行时的读数，I<sub>min</sub>/I<sub>max</sub> 叫消光比。转盘零点并没有对准起偏器，θ<sub>∥</sub> 要从数据里求出来。</p>
        <p>数据处理：cos²(θ − θ<sub>∥</sub>) = ½[1 + cos2(θ − θ<sub>∥</sub>)]，把 I 写成 a₀ + a₁cos2θ + a₂sin2θ，用最小二乘求出 a₀、a₁、a₂，就得到 I<sub>max</sub>、I<sub>min</sub> 和 θ<sub>∥</sub> = ½·atan2(a₂, a₁)。再以 cos²(θ − θ<sub>∥</sub>) 为横轴、I 为纵轴作图，数据点落在一条直线上就验证了马吕斯定律。</p>
        <p><b>波片</b>：波片使沿快轴、慢轴振动的两个分量产生相位差 δ。λ/4 波片 δ = 90°，λ/2 波片 δ = 180°。把波片放在两块正交的偏振片之间，转动波片到再次消光，这时波片的一个光轴与起偏器平行。从这个位置把波片转过 α 角：</p>
        <p>· λ/4 波片：出射椭圆偏振光，长轴沿波片光轴。I<sub>min</sub>/I<sub>max</sub> = min(sin²α, cos²α) / max(sin²α, cos²α)；理想波片在 α = 45° 时产生圆偏振光。<br>· λ/2 波片：出射仍是线偏振光，I<sub>min</sub> ≈ 0，振动方向转过 2α。</p>
        <p>只测光强可以找出波片光轴的方向，但分不出哪条是快轴、哪条是慢轴，要用一片已知快轴的波片做补偿才能区分。</p>
        <p>不确定度：θ<sub>∥</sub> 的 A 类由最小二乘的协方差矩阵求出，B 类按游标 ${INST}° 取 ${INST}°/√3，两者合成。</p>`,
      right:`<div class="canvas-wrap fill"><canvas id="${P}-bench"></canvas><div class="caption">装置示意（沿光路看各转盘）</div></div>
      <div class="lab-grid">
        <div class="canvas-wrap"><canvas id="${P}-view" class="eye"></canvas><div class="caption" id="${P}-cap">光功率计与 I–θ 记录</div><div class="msg" id="${P}-msg"></div><div class="counter" id="${P}-counter"></div></div>
        <div class="panel" id="${P}-panel">
          <div class="seg" id="${P}-modes"><button class="tab" data-v="malus">马吕斯定律</button><button class="tab" data-v="plate">波片（进阶）</button></div>
          <div class="seg" id="${P}-sels"><button class="tab" data-s="an">转检偏器</button><button class="tab" data-s="wp">转波片</button></div>
          <div class="readout" id="${P}-readout"></div>
          <canvas id="${P}-dial" class="strip"></canvas>
          ${turnControls(P,[[2,'微调 2°/s'],[15,'中速 15°/s'],[60,'快速 60°/s']],{assist:'',left:'◀ 逆时针',rightLabel:'顺时针 ▶'})}
          <div class="row" style="margin-top:0;flex-wrap:wrap" id="${P}-platebox">
            <button class="hold" id="${P}-insert">放入波片</button>
            <label class="ctl-inline">我的判断 <select id="${P}-guess"><option value="">还没判断</option><option value="q">λ/4 波片</option><option value="h">λ/2 波片</option></select></label>
          </div>
          <div class="tip">按住按钮转动转盘，也可以拖动刻度条；键盘 ← → 每次 0.1°（Shift 为 1°）。</div>
        </div>
      </div>`});
    init();
    const saved=LabStore.restore(P,s);
    s.plateReview=typeof saved?.plateReview==='string'?saved.plateReview:'';
    // 旧版批改可能把未知波片答案混进基础反馈，保留实验读数并重新批改这类存档。
    if (typeof saved?.plateReview!=='string' && eRow()){ s.checked=false; s.review=''; }
    showReview();
    stats.records+=s.rows.length;
    B=benchArea(P, Models3D.polarization, ()=>({th:s.th, a:s.a, t0:s.t0, plate:s.plate, I:intensity(), I0, reading:fmtI(meter())}), {cap3d:'三维模型'});
    B.onChange=render;
    $('#'+P+'-modes').onclick=e=>{
      const b=e.target.closest('button'); if (!b) return;
      s.mode=b.dataset.v;
      if (s.mode==='malus') s.sel='an';
      showReview(); save(); render();
    };
    $('#'+P+'-sels').onclick=e=>{ const b=e.target.closest('button'); if (b && !b.disabled){ s.sel=b.dataset.s; render(); } };
    $('#'+P+'-insert').onclick=()=>{ s.plate=!s.plate; if (!s.plate) s.sel='an'; render(); };
    $('#'+P+'-guess').value=s.guess;
    $('#'+P+'-guess').onchange=e=>{
      s.guess=e.target.value;
      clearReview('plate'); table(); render();
    };
    bindHold($('#'+P+'-panel'), $('#'+P+'-speed'), d=>{ turn(d); render(); });
    bindDrag($('#'+P+'-dial'), 6, d=>{ turn(d); render(); });
    $('#'+P+'-rec').onclick=record;
    $('#'+P+'-undo').onclick=()=>{
      const row=s.rows.pop();
      if (!row) return;
      stats.records--; clearReview(row.t==='m'?'malus':'plate'); table(); render();
    };
    $('#'+P+'-clr').onclick=()=>{
      stats.records-=s.rows.length; s.rows=[];
      clearReview('malus'); clearReview('plate'); table(); render();
    };
    $('#'+P+'-check').onclick=review;
    table();
    clearInterval(timer);
    timer=setInterval(()=>{ if (!document.hidden && el.offsetParent!==null){ view(); if (B.is3d()) B.update(); } },600);
  }
  function key(dir,big){ turn(dir*(big?1:0.1)); render(); }

  /* ---------- 绘图 ---------- */
  const eRow=()=>[...s.rows].reverse().find(r=>r.t==='e');
  function render(){
    if (!(B.is3d() && B.update())) bench();
    view();
    if (fit) chart(fit);
    const plateMode=s.mode==='plate';
    document.querySelectorAll('#'+P+'-modes .tab').forEach(b=>b.classList.toggle('active',b.dataset.v===s.mode));
    document.querySelectorAll('#'+P+'-sels .tab').forEach(b=>{ b.classList.toggle('active',b.dataset.s===s.sel); b.disabled=b.dataset.s==='wp'&&!(plateMode&&s.plate); });
    $('#'+P+'-platebox').hidden=!plateMode;
    $('#'+P+'-insert').textContent=s.plate?'取出波片':'放入波片';
    const cur=s.sel==='wp'?s.a:s.th;
    $('#'+P+'-readout').innerHTML=`<div>${s.sel==='wp'?'波片转盘读数':'检偏器转盘读数'}</div><div class="v">${(round1(mod(cur,360))%360).toFixed(1)}°</div><div class="f">检偏器 ${(round1(mod(s.th,360))%360).toFixed(1)}°　${s.plate?`波片 ${(round1(mod(s.a,360))%360).toFixed(1)}°`:'未放波片'}　主刻度 1°，游标 0.1°</div>`;
    drawStrip($('#'+P+'-dial'), cur, {px:6, label:k=>`${mod(k,360)}°`});
    const m=s.rows.filter(r=>r.t==='m'), cov=coverage(m.map(r=>r.th)), g=groups().filter(x=>x.valid).length;
    const aligned=validExtinction(eRow());
    $('#'+P+'-rec').textContent=plateMode&&s.plate&&!aligned?'记录消光位置':'记录光强';
    renderSteps(P,[
      [s.ext,'<b>找消光</b>：在“马吕斯定律”中转动检偏器，找到光强最小的位置。读数不是 90°，说明转盘零点没有对准起偏器。'],
      [m.length>=12&&cov,`<b>测 I(θ)</b>：从任意位置开始，每转 10°～15° 记录一次光强，至少转过 180°、记 12 个点（已记 ${Math.min(m.length,12)}/12）。`],
      [aligned,'<b>进阶：定波片光轴</b>：先取出波片，把检偏器转到消光。保持检偏器不动，放入波片后转动波片到再次消光。'],
      [g>=PLATE_GROUPS,`<b>进阶：测偏振态</b>：从消光位置起把波片转过 15°、30°、45°、60°、75°、90° 等角度。每个位置转动检偏器找最大、最小读数，各记一次；光强几乎不变时，仍要在相隔约 90° 的位置分别记录（已测 ${Math.min(g,PLATE_GROUPS)}/${PLATE_GROUPS} 个角度）。`],
      [plateMode?!!s.plateReview:s.checked,'<b>处理数据</b>：在基础页可独立检查拟合。进阶页至少测 5 个有效角度（含 45° 附近），选出波片类型后再提交。']]);
  }
  function bench(){
    const c=$('#'+P+'-bench'); const {ctx,W}=benchSetup(c);
    const span=680, sc=Math.min(1,(W-20)/span); ctx.translate((W-span*sc)/2,230*(1-sc)/2); ctx.scale(sc,sc);
    const y=110, F='12px "PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif', I=intensity();
    ctx.font=F; ctx.textAlign='center';
    ctx.fillStyle='#3b4048'; ctx.fillRect(10,y-12,110,24);
    const seg=(x0,x1,a)=>{ ctx.strokeStyle=`rgba(255,60,40,${a})`; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke(); };
    seg(120,200,.85); seg(240,s.plate?330:440,.6); if (s.plate) seg(370,440,.6); seg(480,580,Math.min(.9,0.08+I/I0));
    /* 沿光路看到的转盘：画出转盘上的读数指标，而不是真实透振方向 */
    const dialAt=(x,ang,name,col)=>{ ctx.strokeStyle='#5b616a'; ctx.lineWidth=1.2; ctx.beginPath(); ctx.arc(x,y,24,0,Math.PI*2); ctx.stroke();
      for (let k=0;k<36;k++){ const r=rad(k*10); ctx.beginPath(); ctx.moveTo(x+Math.cos(r)*24,y+Math.sin(r)*24); ctx.lineTo(x+Math.cos(r)*(k%9?21:18),y+Math.sin(r)*(k%9?21:18)); ctx.stroke(); }
      const r=rad(ang-90); ctx.strokeStyle=col; ctx.lineWidth=2.4; ctx.beginPath(); ctx.moveTo(x-Math.cos(r)*20,y-Math.sin(r)*20); ctx.lineTo(x+Math.cos(r)*20,y+Math.sin(r)*20); ctx.stroke();
      ctx.fillStyle='#c9c8c2'; ctx.fillText(name,x,y+46); };
    dialAt(220,0,'起偏器 P₁','#c9c8c2');
    if (s.plate) dialAt(350,s.a,`波片 ${(round1(mod(s.a,360))%360).toFixed(1)}°`,'#8fc3ff');
    dialAt(460,s.th,`检偏器 ${(round1(mod(s.th,360))%360).toFixed(1)}°`,'#ffd166');
    ctx.fillStyle='#c9c8c2'; ctx.fillText('He-Ne 激光器',65,y+46);
    ctx.fillStyle='#1d1e21'; ctx.strokeStyle='#5b616a'; ctx.fillRect(582,y-14,24,28); ctx.strokeRect(582,y-14,24,28); ctx.fillStyle='#c9c8c2'; ctx.fillText('探头',594,y+46);
    if (!s.plate){ ctx.fillStyle='#8a9099'; ctx.fillText('（波片未放入）',350,y+4); }
  }
  function view(){
    const c=$('#'+P+'-view'), S=eyeSize(c); c.style.width=S+'px';
    const {ctx,dpr}=setup(c,S); ctx.setTransform(dpr,0,0,dpr,0,0);
    const F='"PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif', rd=meter();
    ctx.fillStyle='#0b0c0e'; ctx.fillRect(0,0,S,S);
    const h=S*0.28;
    ctx.fillStyle='#1c1f23'; ctx.fillRect(10,10,S-20,h); ctx.fillStyle='#0f1a14'; ctx.fillRect(22,22,S-44,h-24);
    ctx.fillStyle='#9fe7b0'; ctx.textAlign='right'; ctx.font=`300 ${Math.round(h*0.38)}px ui-monospace,Consolas,monospace`; ctx.fillText(fmtI(rd),S-86,22+h*0.52);
    ctx.font=`${Math.round(h*0.16)}px ${F}`; ctx.textAlign='left'; ctx.fillText('µW',S-80,22+h*0.52);
    ctx.fillStyle='#22352a'; ctx.fillRect(34,h-6,S-68,7); ctx.fillStyle='#5fd486'; ctx.fillRect(34,h-6,(S-68)*Math.min(1,rd/I0),7);
    /* I–θ 记录：横轴是检偏器读数，显示当前模式（或当前波片位置）已记录的点 */
    const x0=40, x1=S-14, y0=S-28, y1=h+30, X=t=>x0+t/360*(x1-x0), Y=v=>y0-v/I0*(y0-y1);
    ctx.strokeStyle='#2a2d33'; ctx.lineWidth=1; ctx.fillStyle='#6f757d'; ctx.font=`10px ${F}`; ctx.textAlign='center';
    for (let t=0;t<=360;t+=90){ ctx.beginPath(); ctx.moveTo(X(t),y1); ctx.lineTo(X(t),y0); ctx.stroke(); ctx.fillText(t+'°',X(t),y0+13); }
    ctx.textAlign='right'; for (const v of [0,0.5,1]){ ctx.beginPath(); ctx.moveTo(x0,Y(v*I0)); ctx.lineTo(x1,Y(v*I0)); ctx.stroke(); ctx.fillText(String(Math.round(v*I0)),x0-4,Y(v*I0)+3); }
    const pts=s.mode==='malus'?s.rows.filter(r=>r.t==='m'):waveRows(eRow()).filter(r=>platePosition(r.a)===platePosition(s.a));
    ctx.fillStyle='#ffd166'; pts.forEach(r=>{ ctx.beginPath(); ctx.arc(X(r.th),Y(r.I),3,0,Math.PI*2); ctx.fill(); });
    ctx.strokeStyle='rgba(255,90,60,.9)'; ctx.beginPath(); ctx.moveTo(X(mod(s.th,360)),y1); ctx.lineTo(X(mod(s.th,360)),y0); ctx.stroke();
    ctx.fillStyle='#ff5a3c'; ctx.beginPath(); ctx.arc(X(mod(s.th,360)),Y(rd),4,0,Math.PI*2); ctx.fill();
    ctx.textAlign='left'; ctx.fillStyle='#8a9099'; ctx.fillText(s.mode==='malus'?'已记录的 I–θ（黄点）':'当前波片位置已记录的点',x0+4,y1-8);
    /* 批改后：画出当前波片位置出射光的偏振态 */
    const msg=$('#'+P+'-msg'), ctr=$('#'+P+'-counter');
    if (s.mode==='plate' && s.plateReview && s.plate){ const E=field(); const cx=S-48, cy=h+60, R=28;
      ctx.strokeStyle='#3a3e45'; ctx.beginPath(); ctx.arc(cx,cy,R+4,0,Math.PI*2); ctx.stroke();
      ctx.strokeStyle='#8fc3ff'; ctx.lineWidth=1.6; ctx.beginPath();
      for (let k=0;k<=64;k++){ const w=k/64*2*Math.PI, ex=E[0][0]*Math.cos(w)+E[0][1]*Math.sin(w), ey=E[1][0]*Math.cos(w)+E[1][1]*Math.sin(w); const px=cx+ey*R, py=cy-ex*R; k?ctx.lineTo(px,py):ctx.moveTo(px,py); } ctx.stroke();
      ctx.fillStyle='#8a9099'; ctx.textAlign='center'; ctx.fillText('出射偏振态',cx,cy+R+16); }
    msg.textContent = s.mode==='plate'&&!s.plate ? '先不放波片：把检偏器转到消光，再点“放入波片”' : '';
    msg.style.top='58%';
    ctr.hidden=true;
    $('#'+P+'-cap').textContent='光功率计与 I–θ 记录';
  }

  /* ---------- 数据 ---------- */
  function showReview(){
    const review=s.mode==='plate'?s.plateReview:s.review;
    $('#'+P+'-review').innerHTML=paras(review||'');
    $('#'+P+'-check').textContent=review?'重新检查':'检查我的数据';
  }
  function clearReview(mode){
    if (mode==='malus'){ s.checked=false; s.review=''; }
    else s.plateReview='';
    if (s.mode===mode) showReview();
  }
  const crossed=th=>norm90(th-s.t0-90);
  // 两条正交的光轴都能消光。这里衡量到最近光轴的偏差。
  const axisError=a=>mod(a-s.f0+45,90)-45;
  const validExtinction=e=>!!e && Math.abs(crossed(e.th))<=ALIGNMENT_TOLERANCE
    && Math.abs(axisError(e.a))<=ALIGNMENT_TOLERANCE && e.I/I0<=EXTINCTION_LIMIT;
  const platePosition=a=>round1(mod(a,180))%180;
  function waveRows(e){
    return validExtinction(e)?s.rows.slice(s.rows.indexOf(e)+1).filter(r=>r.t==='w'):[];
  }
  function note(t){ table(); $('#'+P+'-result').insertAdjacentHTML('afterbegin',`<div class="note">${esc(t)}</div>`); }
  function push(row){
    s.rows.push(row); clearReview(row.t==='m'?'malus':'plate');
    stats.records++; logEvent('lab_record',{lab:P,n:s.rows.length,row}); table(); render();
  }
  function record(){
    const I=+fmtI(meter()), th=round1(mod(s.th,360))%360;
    if (s.mode==='malus'){
      if (s.plate) return note('测马吕斯定律时要先取出波片（切到“波片”页点“取出波片”）。');
      return push({t:'m', th, I});
    }
    if (!s.plate) return note('先点“放入波片”。放入之前，检偏器要转到消光位置。');
    const a=round1(mod(s.a,360))%360;
    if (!validExtinction(eRow())){
      if (Math.abs(crossed(th))>ALIGNMENT_TOLERANCE) return note('检偏器尚未与起偏器正交。请取出波片，重新找消光，然后保持检偏器不动。');
      const e={t:'e', a, th, I, off:+axisError(a).toFixed(2), cross:+crossed(th).toFixed(2)};
      if (!validExtinction(e)) return note('波片还没有对准光轴。保持检偏器不动，继续转波片找光强最小的位置。');
      return push(e);
    }
    push({t:'w', a, th, I});
  }
  /* 角度覆盖：读数对 180° 取模后，相邻两点的最大间隔不超过 45° */
  function coverage(ths){
    if (ths.length<3) return false;
    const v=ths.map(t=>mod(t,180)).sort((x,y)=>x-y); let gap=v[0]+180-v[v.length-1];
    for (let i=1;i<v.length;i++) gap=Math.max(gap,v[i]-v[i-1]);
    return gap<=45;
  }
  function solve3(M,b){ const A=M.map((r,i)=>[...r,b[i]]);
    for (let i=0;i<3;i++){ let p=i; for (let k=i+1;k<3;k++) if (Math.abs(A[k][i])>Math.abs(A[p][i])) p=k; [A[i],A[p]]=[A[p],A[i]];
      for (let k=0;k<3;k++) if (k!==i){ const f=A[k][i]/A[i][i]; for (let j=i;j<4;j++) A[k][j]-=f*A[i][j]; } }
    return A.map((r,i)=>r[3]/r[i]); }
  function malus(){
    const m=s.rows.filter(r=>r.t==='m');
    if (m.length<8 || !coverage(m.map(r=>r.th))) return null;
    const X=m.map(r=>[1,Math.cos(rad(2*r.th)),Math.sin(rad(2*r.th))]), y=m.map(r=>r.I);
    const M=[0,1,2].map(i=>[0,1,2].map(j=>X.reduce((q,x)=>q+x[i]*x[j],0))), bv=[0,1,2].map(i=>X.reduce((q,x,k)=>q+x[i]*y[k],0));
    const [a0,a1,a2]=solve3(M,bv), C=Math.hypot(a1,a2);
    const res=y.map((v,k)=>v-(a0+a1*X[k][1]+a2*X[k][2])), ss=res.reduce((q,r)=>q+r*r,0), n=m.length, sig2=ss/(n-3);
    const inv=[0,1,2].map(j=>solve3(M,[0,1,2].map(i=>+(i===j))));                     // (XᵀX)⁻¹ 的各列
    const v11=inv[1][1]*sig2, v22=inv[2][2]*sig2, v12=inv[2][1]*sig2;
    const uA=deg(0.5*Math.sqrt(Math.max(0,a1*a1*v22+a2*a2*v11-2*a1*a2*v12))/(C*C)), uB=INST/Unc.SQRT3;
    const my=Unc.mean(y), st=y.reduce((q,v)=>q+(v-my)**2,0);
    const par=mod(deg(0.5*Math.atan2(a2,a1)),180);
    return {n, a0, a1, a2, Imax:a0+C, Imin:a0-C, ratio:(a0-C)/(a0+C), par, uA, uB, u:Unc.combine(uA,uB), r2:1-ss/st, rms:Math.sqrt(ss/n),
      err:norm90(par-s.t0), pts:m.map(r=>({x:Math.cos(rad(r.th-par))**2, I:r.I}))};
  }
  /* 构成极值的两次读数要接近正交。近圆偏振时长轴不稳定，只检查角度间隔。 */
  function plateExtrema(rs, theory){
    const high=Math.max(...rs.map(r=>r.I)), low=Math.min(...rs.map(r=>r.I));
    const nearlyCircular=theory.ratio>=0.95;
    const near=(th,target)=>Math.abs(norm90(th-target))<=EXTREMA_TOLERANCE;
    const major=theory.major+s.t0;
    const maxReading=rs.find(hi=>hi.I===high && (nearlyCircular||near(hi.th,major)) &&
      rs.some(lo=>lo.I===low && near(lo.th,hi.th+90) && (nearlyCircular||near(lo.th,major+90))));
    return {high,low,maxReading};
  }
  function groups(){
    const e=eRow(), g=new Map();
    for (const r of waveRows(e)){
      const key=platePosition(r.a);
      if (!g.has(key)) g.set(key,[]);
      g.get(key).push(r);
    }
    const par=e?mod(e.th+90,180):0;
    return [...g.values()].map(rs=>{
      const a=rs[0].a, th=ellipse(a);
      const {high,low,maxReading}=plateExtrema(rs,th);
      const valid=!!maxReading;
      const ratio=valid?low/high:null;
      const major=valid&&ratio<0.95?+norm90(maxReading.th-par).toFixed(1):null;
      return {a,alpha:+norm90(a-e.a).toFixed(1),n:rs.length,Imax:high,Imin:low,ratio,major,valid,th};
    }).sort((p,q)=>Math.abs(p.alpha)-Math.abs(q.alpha));
  }
  const near45=g=>g.find(x=>Math.abs(Math.abs(x.alpha)-45)<=3);
  function checkPlate(e,good){
    if (!validExtinction(e)) return '请先在检偏器正交时记录波片的消光位置。';
    if (good.length<PLATE_GROUPS) return `请先测满 ${PLATE_GROUPS} 个波片角度的有效极值（当前 ${good.length} 个）。`;
    if (!near45(good)) return '还缺少波片转过约 45° 时的有效极值，请补测。';
    if (s.guess!=='q' && s.guess!=='h') return '请先在“我的判断”中选择波片类型。';
    return '';
  }
  function calc(){ return {m:malus(),g:groups(),e:eRow(),truth:{type:s.type,delta:s.delta,t0:s.t0}}; }
  const TYPE={q:'λ/4 波片', h:'λ/2 波片'};

  function table(){
    save(); renderStats();
    fit=null;
    if (!s.rows.length){ $('#'+P+'-table').innerHTML='<div class="empty">还没有数据。先转检偏器找到消光位置，再开始记录。</div>'; $('#'+P+'-result').innerHTML=''; return; }
    const c=calc(), m=s.rows.filter(r=>r.t==='m');
    const revealPlate=!!s.plateReview;
    fit=c.m;
    let h='';
    if (m.length) h+=`<div class="hint" style="margin-top:0">马吕斯定律（${m.length} 个点）</div><table class="data plt"><tr><th>θ/°</th>${m.map(r=>`<td>${r.th.toFixed(1)}</td>`).join('')}</tr><tr><th>I/µW</th>${m.map(r=>`<td>${r.I}</td>`).join('')}</tr></table>`;
    if (validExtinction(c.e)) h+=`<div class="hint">波片消光位置：波片 ${c.e.a.toFixed(1)}°，检偏器 ${c.e.th.toFixed(1)}°，I = ${c.e.I} µW</div>`;
    else if (c.e) h+='<div class="note">旧存档的波片消光位置未通过检查。请重新记录消光位置，再测各角度的极值。原始记录仍保留。</div>';
    if (c.g.length) h+=`<table class="data"><tr><th>α/°</th><th>I<sub>max</sub>/µW</th><th>I<sub>min</sub>/µW</th><th>I<sub>min</sub>/I<sub>max</sub></th><th>长轴方向/°</th>${revealPlate?'<th>理论比值</th>':''}</tr>`+
      c.g.map(x=>{
        const ratio=x.valid?x.ratio.toFixed(3):x.n<2?'只记了 1 次':'请重新找极值';
        return `<tr${x.valid?'':' class="warn"'}><td>${x.alpha.toFixed(1)}</td><td>${x.valid?x.Imax:'—'}</td><td>${x.valid?x.Imin:'—'}</td><td>${ratio}</td><td>${x.major?.toFixed(1)??'—'}</td>${revealPlate?`<td>${x.th.ratio.toFixed(3)}</td>`:''}</tr>`;
      }).join('')+'</table>';
    $('#'+P+'-table').innerHTML=`<div class="fbtable">${h}</div>`;
    let out='';
    if (c.m){ const f=Unc.format(c.m.par,c.m.u,'°');
      out+=`<div class="result">最小二乘拟合 I = I<sub>min</sub> + (I<sub>max</sub> − I<sub>min</sub>)·cos²(θ − θ<sub>∥</sub>)：
        <div>I<sub>max</sub> = ${c.m.Imax.toFixed(1)} µW，I<sub>min</sub> = ${c.m.Imin.toFixed(2)} µW，消光比 ${(c.m.ratio*100).toFixed(2)}%，R² = ${c.m.r2.toFixed(5)}</div>
        <div>检偏器与起偏器平行时的读数 θ<sub>∥</sub> = <span class="big">${c.m.par.toFixed(2)}°</span></div>
        <div class="unc">不确定度：u<sub>A</sub> = ${(+c.m.uA.toPrecision(2))}°（拟合协方差），u<sub>B</sub> = ${(+c.m.uB.toPrecision(2))}°（游标 ${INST}°），u = ${(+c.m.u.toPrecision(2))}°<div>结果：<b>θ<sub>∥</sub> = ${f.text.replace(') °',')°')}</b></div></div>
        ${s.checked?`<div>转盘真实偏差：θ<sub>∥</sub> 应为 ${s.t0.toFixed(2)}°（或加 180°），相差 <b>${c.m.err>=0?'+':''}${c.m.err.toFixed(2)}°</b></div>`:''}
        <canvas id="${P}-chart" class="chart"></canvas></div>`;
    } else if (m.length) out+=`<div class="hint" style="margin-top:8px">至少需要 8 个点，并且角度要分布在半圈以上（相邻两点间隔不超过 45°）才能拟合。</div>`;
    const good=c.g.filter(x=>x.valid);
    if (good.length){
      const g45=near45(good);
      out+=`<div class="result">波片：${g45?`α ≈ 45° 时 I<sub>min</sub>/I<sub>max</sub> = ${g45.ratio.toFixed(3)}，`:'还没测 α ≈ 45° 的位置，'}你的判断：<b>${s.guess?TYPE[s.guess]:'还没选'}</b>
        ${revealPlate?`<div>这片是 <b>${TYPE[s.type]}</b>（实际相位延迟 δ = ${s.delta.toFixed(1)}°）。${s.type==='q'?QUARTER_RATIO:'理想 λ/2 波片的出射光为线偏振光，振动方向转过 2α；有制造误差时最小光强可能略大于零。'}</div>`:'<div class="hint">波片类型和理论值在进阶实验批改后显示。</div>'}</div>`;
    }
    $('#'+P+'-result').innerHTML=out;
    if (c.m) chart(c.m);
  }
  /* I 与 cos²(θ − θ∥) 的关系：应为直线 */
  function chart(m){
    const cv=$('#'+P+'-chart'), width=cv?.clientWidth;
    if (!width) return;
    const size=`${width}×${window.devicePixelRatio||1}`;
    if (cv.dataset.drawnSize===size) return;
    const {ctx,dpr,W,H}=setup(cv,170); ctx.setTransform(dpr,0,0,dpr,0,0);
    cv.dataset.drawnSize=size;
    const x0=46, x1=W-12, y0=H-28, y1=10, top=Math.ceil(m.Imax/100)*100;
    const X=x=>x0+x*(x1-x0), Y=v=>y0-v/top*(y0-y1);
    ctx.font='11px "PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif'; ctx.strokeStyle='#e4e2dc'; ctx.fillStyle='#5b616a'; ctx.lineWidth=1;
    for (let v=0;v<=top;v+=top/4){ ctx.beginPath(); ctx.moveTo(x0,Y(v)); ctx.lineTo(x1,Y(v)); ctx.stroke(); ctx.textAlign='right'; ctx.fillText(String(v),x0-6,Y(v)+4); }
    ctx.textAlign='center'; for (let x=0;x<=1.001;x+=0.25){ ctx.fillText(x.toFixed(2),X(x),y0+16); }
    ctx.strokeStyle='#8a8f97'; ctx.beginPath(); ctx.moveTo(x0,y1); ctx.lineTo(x0,y0); ctx.lineTo(x1,y0); ctx.stroke();
    ctx.strokeStyle='#b5442c'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(X(0),Y(m.Imin)); ctx.lineTo(X(1),Y(m.Imax)); ctx.stroke();
    ctx.fillStyle='#1d1e21'; m.pts.forEach(p=>{ ctx.beginPath(); ctx.arc(X(p.x),Y(p.I),3.2,0,Math.PI*2); ctx.fill(); });
    ctx.textAlign='left'; ctx.fillStyle='#5b616a'; ctx.fillText('I / µW　横轴：cos²(θ − θ∥)',x0+6,y1+10);
  }

  /* ---------- AI 批改 ---------- */
  function malusFeedback(m){
    const p=[];
    if (m.n<12) p.push(`只记了 ${m.n} 个点，建议每 10°～15° 记一次、记满半圈`);
    if (m.r2<0.999) p.push(`拟合的 R² 只有 ${m.r2.toFixed(4)}，请检查个别读数`);
    const conclusion=m.r2>=0.999?'数据很好地符合马吕斯定律。':'请根据残差复核数据与马吕斯定律的一致性。';
    return [`【总评】θ∥ = ${Unc.format(m.par,m.u,'°').text}，与真实值相差 ${Math.abs(m.err).toFixed(2)}°；R² = ${m.r2.toFixed(5)}，消光比 ${(m.ratio*100).toFixed(2)}%。${conclusion}`,
      '【数据问题】'+(p.length?p.join('；')+'。':'没有发现明显问题。'),
      '【误差来源】激光功率缓慢起伏、偏振片不能完全消光、转盘游标的读数误差。',
      '【改进建议】均匀取点；在消光和光强最大的位置附近用微调。'].join('\n');
  }
  function plateFeedback(c,good){
    const g45=near45(good), skipped=c.g.filter(x=>!x.valid);
    return [`【总评】α ≈ 45° 时 I_min/I_max = ${g45.ratio.toFixed(3)}。这片是${TYPE[s.type]}，你的判断${s.guess===s.type?'正确':'不对'}。`,
      skipped.length?`【数据问题】α = ${skipped.map(x=>x.alpha).join('°、')}° 的读数未构成有效极值。`:'【数据问题】所用角度均记录了有效极值。',
      '【误差来源】功率起伏、游标读数、波片相位延迟与标称值的偏差。',
      '【改进建议】'+(s.type==='q'?QUARTER_RATIO:'理想 λ/2 波片的线偏振方向转过 2α。')+'只测光强无法区分快轴和慢轴。'].join('\n');
  }
  async function review(){
    if ($('#'+P+'-check').disabled) return;
    const plateMode=s.mode==='plate', c=calc(), good=c.g.filter(x=>x.valid);
    const controls=[...document.querySelectorAll('#'+P+'-modes button'),$('#'+P+'-guess')];
    controls.forEach(b=>b.disabled=true);
    try {
      const text=await runReview(P,{
        check:()=>plateMode?checkPlate(c.e,good):c.m?'':'马吕斯定律至少需要 8 个点，并且相邻两点的角度间隔不超过 45°（对 180° 取模后）。',
        prompt:()=>plateMode
          ?`你是物理光学实验课的助教。只批改未知波片鉴别。
波片消光位置的报告：波片 ${c.e.a}°，检偏器 ${c.e.th}°，光强 ${c.e.I} µW。
有效测量：${good.map(x=>`α=${x.alpha}°：I_max=${x.Imax} µW，I_min=${x.Imin} µW，比值 ${x.ratio.toFixed(3)}（理论 ${x.th.ratio.toFixed(3)}），长轴 ${x.major==null?'在近圆偏振时不确定':x.major+'°'}`).join('；')}。
未通过极值检查的角度：${c.g.filter(x=>!x.valid).map(x=>x.alpha+'°').join('、')||'无'}。
实际是${TYPE[s.type]}（相位延迟 ${s.delta.toFixed(1)}°），学生判断为${TYPE[s.guess]}。说明 45° 附近的判断依据，并提醒只测光强分不出快轴和慢轴。${QUARTER_RATIO}
用中文分四段，段首依次为【总评】【数据问题】【误差来源】【改进建议】，只根据给出的数据批改。`
          :`你是物理光学实验课的助教。只批改马吕斯定律。
检偏器读数 θ/° 与光强 I/µW：${s.rows.filter(r=>r.t==='m').map(r=>`(${r.th}, ${r.I})`).join(' ')}。
拟合结果：I_max = ${c.m.Imax.toFixed(1)} µW，I_min = ${c.m.Imin.toFixed(2)} µW，消光比 ${(c.m.ratio*100).toFixed(2)}%，R² = ${c.m.r2.toFixed(5)}，θ∥ = ${c.m.par.toFixed(2)}°，不确定度 ${c.m.u.toFixed(2)}°。真实 θ∥ = ${s.t0.toFixed(2)}°（模 180°）。
用中文分四段，段首依次为【总评】【数据问题】【误差来源】【改进建议】，只根据给出的数据批改。`,
        offline:()=>plateMode?plateFeedback(c,good):malusFeedback(c.m)
      });
      if (text){
        if (plateMode) s.plateReview=text;
        else { s.checked=true; s.review=text; }
        table(); render();
      }
    } finally {
      controls.forEach(b=>b.disabled=false);
    }
  }
  return {mount, render, key};
})();
