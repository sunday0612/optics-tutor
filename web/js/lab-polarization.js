/* =====================================================================
 * lab-polarization.js —— 虚拟实验：验证马吕斯定律，鉴别波片（He-Ne 632.8 nm）
 * 操作：转检偏器找消光 → 每隔一定角度记录光强 → 拟合 I = I_min + (I_max − I_min)cos²(θ − θ∥)
 *       进阶：正交偏振器之间放入未知波片，找消光定光轴 → 转波片测各角度的 I_max、I_min → 判断 λ/4 还是 λ/2
 * 物理模型：琼斯矩阵；起偏器、检偏器有有限消光比，波片的相位延迟有制造误差
 * ===================================================================== */
const PL = (() => {
  const P='pl', I0=480, EPS=0.002, TP=0.98;            // 起偏后光强 (µW)、偏振片消光比、波片透过率
  const INST=0.1;                                      // 转盘游标的仪器误差限 (°)
  const rad=d=>d*Math.PI/180, deg=r=>r*180/Math.PI;
  const mod=(x,m)=>((x%m)+m)%m, norm90=x=>{ x=mod(x,180); return x>90?x-180:x; };
  const round1=x=>Math.round(x*10)/10;
  const s={}; let B=null, timer=0;
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
        <p>数据处理：cos²(θ − θ<sub>∥</sub>) = ½[1 + cos2(θ − θ<sub>∥</sub>)]，把 I 写成 a₀ + a₁cos2θ + a₂sin2θ，用最小二乘求出 a₀、a₁、a₂，就得到 I<sub>max</sub>、I<sub>min</sub> 和 θ<sub>∥</sub> = ½·arctan(a₂/a₁)。再以 cos²(θ − θ<sub>∥</sub>) 为横轴、I 为纵轴作图，数据点落在一条直线上就验证了马吕斯定律。</p>
        <p><b>波片</b>：波片使沿快轴、慢轴振动的两个分量产生相位差 δ。λ/4 波片 δ = 90°，λ/2 波片 δ = 180°。把波片放在两块正交的偏振片之间，转动波片到再次消光，这时波片的一个光轴与起偏器平行。从这个位置把波片转过 α 角：</p>
        <p>· λ/4 波片：出射椭圆偏振光，长轴沿波片光轴，I<sub>min</sub>/I<sub>max</sub> = tan²α（α ≤ 45°）；α = 45° 时变成圆偏振光，转检偏器光强不变。<br>· λ/2 波片：出射仍是线偏振光，I<sub>min</sub> ≈ 0，振动方向转过 2α。</p>
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
    init(); LabStore.restore(P,s); stats.records+=s.rows.length; $('#'+P+'-review').innerHTML=paras(s.review||'');
    B=benchArea(P, Models3D.polarization, ()=>({th:s.th, a:s.a, t0:s.t0, plate:s.plate, I:intensity(), I0, reading:fmtI(meter())}), {cap3d:'三维模型'});
    B.onChange=render;
    $('#'+P+'-modes').onclick=e=>{ const b=e.target.closest('button'); if (!b) return; s.mode=b.dataset.v; if (s.mode==='malus') s.sel='an'; render(); };
    $('#'+P+'-sels').onclick=e=>{ const b=e.target.closest('button'); if (b && !b.disabled){ s.sel=b.dataset.s; render(); } };
    $('#'+P+'-insert').onclick=()=>{ s.plate=!s.plate; if (!s.plate) s.sel='an'; render(); };
    $('#'+P+'-guess').value=s.guess; $('#'+P+'-guess').onchange=e=>{ s.guess=e.target.value; save(); };
    bindHold($('#'+P+'-panel'), $('#'+P+'-speed'), d=>{ turn(d); render(); });
    bindDrag($('#'+P+'-dial'), 6, d=>{ turn(d); render(); });
    $('#'+P+'-rec').onclick=record;
    $('#'+P+'-undo').onclick=()=>{ s.checked=false; s.review=''; $('#'+P+'-review').innerHTML=''; if (s.rows.pop()) stats.records--; table(); render(); };
    $('#'+P+'-clr').onclick=()=>{ stats.records-=s.rows.length; s.rows=[]; s.checked=false; s.review=''; $('#'+P+'-review').innerHTML=''; table(); render(); };
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
    const plateMode=s.mode==='plate';
    document.querySelectorAll('#'+P+'-modes .tab').forEach(b=>b.classList.toggle('active',b.dataset.v===s.mode));
    document.querySelectorAll('#'+P+'-sels .tab').forEach(b=>{ b.classList.toggle('active',b.dataset.s===s.sel); b.disabled=b.dataset.s==='wp'&&!(plateMode&&s.plate); });
    $('#'+P+'-platebox').hidden=!plateMode;
    $('#'+P+'-insert').textContent=s.plate?'取出波片':'放入波片';
    const cur=s.sel==='wp'?s.a:s.th;
    $('#'+P+'-readout').innerHTML=`<div>${s.sel==='wp'?'波片转盘读数':'检偏器转盘读数'}</div><div class="v">${(round1(mod(cur,360))%360).toFixed(1)}°</div><div class="f">检偏器 ${(round1(mod(s.th,360))%360).toFixed(1)}°　${s.plate?`波片 ${(round1(mod(s.a,360))%360).toFixed(1)}°`:'未放波片'}　主刻度 1°，游标 0.1°</div>`;
    drawStrip($('#'+P+'-dial'), cur, {px:6, label:k=>`${mod(k,360)}°`});
    const m=s.rows.filter(r=>r.t==='m'), cov=coverage(m.map(r=>r.th)), g=groups().filter(x=>x.n>=2).length;
    $('#'+P+'-rec').textContent = plateMode ? (s.plate&&!eRow()?'记录消光位置':'记录光强') : '记录光强';
    renderSteps(P,[
      [s.ext,'<b>找消光</b>：在“马吕斯定律”中转动检偏器，找到光强最小的位置。读数不是 90°，说明转盘零点没有对准起偏器。'],
      [m.length>=12&&cov,`<b>测 I(θ)</b>：从任意位置开始，每转 10°～15° 记录一次光强，至少转过 180°、记 12 个点（已记 ${Math.min(m.length,12)}/12）。`],
      [!!eRow(),'<b>进阶：定波片光轴</b>：切到“波片”，先不放波片，把检偏器转到消光；再放入波片，转动<b>波片</b>直到再次消光，记录消光位置。'],
      [g>=5,`<b>进阶：测偏振态</b>：从消光位置起把波片转过 15°、30°、45°、60°、75°、90° 等角度，每个角度转检偏器找出光强最大和最小，各记一次（已测 ${Math.min(g,5)}/5 个角度）。`],
      [s.checked,'<b>处理数据</b>：拟合马吕斯定律，算出各角度的 I<sub>min</sub>/I<sub>max</sub>，在“我的判断”里选出波片类型，再让 AI 助教检查。']]);
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
    const pts = s.mode==='malus' ? s.rows.filter(r=>r.t==='m') : s.rows.filter(r=>r.t==='w'&&Math.abs(r.a-round1(mod(s.a,360))%360)<0.05);
    ctx.fillStyle='#ffd166'; pts.forEach(r=>{ ctx.beginPath(); ctx.arc(X(r.th),Y(r.I),3,0,Math.PI*2); ctx.fill(); });
    ctx.strokeStyle='rgba(255,90,60,.9)'; ctx.beginPath(); ctx.moveTo(X(mod(s.th,360)),y1); ctx.lineTo(X(mod(s.th,360)),y0); ctx.stroke();
    ctx.fillStyle='#ff5a3c'; ctx.beginPath(); ctx.arc(X(mod(s.th,360)),Y(rd),4,0,Math.PI*2); ctx.fill();
    ctx.textAlign='left'; ctx.fillStyle='#8a9099'; ctx.fillText(s.mode==='malus'?'已记录的 I–θ（黄点）':'当前波片位置已记录的点',x0+4,y1-8);
    /* 批改后：画出当前波片位置出射光的偏振态 */
    const msg=$('#'+P+'-msg'), ctr=$('#'+P+'-counter');
    if (s.checked && s.plate){ const E=field(); const cx=S-48, cy=h+60, R=28;
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
  function note(t){ table(); $('#'+P+'-result').insertAdjacentHTML('afterbegin',`<div class="note">${esc(t)}</div>`); }
  function push(row){ s.rows.push(row); s.checked=false; s.review=''; $('#'+P+'-review').innerHTML='';
    stats.records++; logEvent('lab_record',{lab:P,n:s.rows.length,row}); table(); render(); }
  function record(){
    const I=+fmtI(meter()), th=round1(mod(s.th,360))%360;
    if (s.mode==='malus'){
      if (s.plate) return note('测马吕斯定律时要先取出波片（切到“波片”页点“取出波片”）。');
      return push({t:'m', th, I});
    }
    if (!s.plate) return note('先点“放入波片”。放入之前，检偏器要转到消光位置。');
    const a=round1(mod(s.a,360))%360;
    if (!eRow()){
      if (I/I0>0.006) return note('还没有消光：先取出波片把检偏器转到消光，再放入波片，转动波片直到光强重新变到最小。');
      return push({t:'e', a, th, I, off:+norm90(a-s.f0).toFixed(2), cross:+norm90(th-s.t0-90).toFixed(2)});
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
  /* 波片数据：同一个波片读数下的记录为一组 */
  function groups(){
    const e=eRow(); if (!e) return [];
    const idx=s.rows.indexOf(e), g=new Map();
    s.rows.slice(idx+1).filter(r=>r.t==='w').forEach(r=>{ const k=r.a.toFixed(1); if (!g.has(k)) g.set(k,[]); g.get(k).push(r); });
    const par=mod(e.th+90,180);                                                         // 消光时检偏器与起偏器正交
    return [...g.values()].map(rs=>{ const mx=rs.reduce((p,r)=>r.I>p.I?r:p), mn=rs.reduce((p,r)=>r.I<p.I?r:p), a=rs[0].a;
      return {a, alpha:+norm90(a-e.a).toFixed(1), n:rs.length, Imax:mx.I, Imin:mn.I, ratio:mn.I/mx.I, major:+norm90(mx.th-par).toFixed(1), crossOK:Math.abs(norm90(mx.th-mn.th))>60, th:ellipse(a)}; })
      .sort((p,q)=>Math.abs(p.alpha)-Math.abs(q.alpha));
  }
  function calc(){ return {m:malus(), g:groups(), e:eRow(), truth:{type:s.type, delta:s.delta, t0:s.t0}}; }
  const TYPE={q:'λ/4 波片', h:'λ/2 波片'};

  function table(){
    save(); renderStats();
    if (!s.rows.length){ $('#'+P+'-table').innerHTML='<div class="empty">还没有数据。先转检偏器找到消光位置，再开始记录。</div>'; $('#'+P+'-result').innerHTML=''; return; }
    const c=calc(), m=s.rows.filter(r=>r.t==='m');
    let h='';
    if (m.length) h+=`<div class="hint" style="margin-top:0">马吕斯定律（${m.length} 个点）</div><table class="data plt"><tr><th>θ/°</th>${m.map(r=>`<td>${r.th.toFixed(1)}</td>`).join('')}</tr><tr><th>I/µW</th>${m.map(r=>`<td>${r.I}</td>`).join('')}</tr></table>`;
    if (c.e) h+=`<div class="hint">波片消光位置：波片 ${c.e.a.toFixed(1)}°，检偏器 ${c.e.th.toFixed(1)}°，I = ${c.e.I} µW</div>`;
    if (c.g.length) h+=`<table class="data"><tr><th>α/°</th><th>I<sub>max</sub>/µW</th><th>I<sub>min</sub>/µW</th><th>I<sub>min</sub>/I<sub>max</sub></th><th>长轴方向/°</th>${s.checked?'<th>理论比值</th>':''}</tr>`+
      c.g.map(x=>`<tr${x.n<2?' class="bad"':''}><td>${x.alpha.toFixed(1)}</td><td>${x.Imax}</td><td>${x.n<2?'—':x.Imin}</td><td>${x.n<2?'只记了 1 次':x.ratio.toFixed(3)}</td><td>${x.n<2?'—':x.major.toFixed(1)}</td>${s.checked?`<td>${x.th.ratio.toFixed(3)}</td>`:''}</tr>`).join('')+'</table>';
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
    const good=c.g.filter(x=>x.n>=2);
    if (good.length){
      const g45=good.find(x=>Math.abs(Math.abs(x.alpha)-45)<=3);
      out+=`<div class="result">波片：${g45?`α ≈ 45° 时 I<sub>min</sub>/I<sub>max</sub> = ${g45.ratio.toFixed(3)}，`:'还没测 α ≈ 45° 的位置，'}你的判断：<b>${s.guess?TYPE[s.guess]:'还没选'}</b>
        ${s.checked?`<div>这片是 <b>${TYPE[s.type]}</b>（实际相位延迟 δ = ${s.delta.toFixed(1)}°）。${s.type==='q'?'α = 45° 附近光强几乎不随检偏器变化，是圆偏振光；其他角度是长轴沿波片光轴的椭圆偏振光，I<sub>min</sub>/I<sub>max</sub> ≈ tan²α。':'各角度 I<sub>min</sub> 都接近零，出射仍是线偏振光，振动方向转过 2α。'}</div>`:'<div class="hint">波片类型和理论值在 AI 批改后显示。</div>'}</div>`;
    }
    $('#'+P+'-result').innerHTML=out;
    if (c.m) chart(c.m);
  }
  /* I 与 cos²(θ − θ∥) 的关系：应为直线 */
  function chart(m){
    const cv=$('#'+P+'-chart'); if (!cv||!cv.clientWidth) return;
    const {ctx,dpr,W,H}=setup(cv,170); ctx.setTransform(dpr,0,0,dpr,0,0);
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
  function offline(c){
    const m=c.m, p=[], good=c.g.filter(x=>x.n>=2), one=c.g.filter(x=>x.n<2);
    if (m.n<12) p.push(`马吕斯定律只记了 ${m.n} 个点，建议每 10°～15° 记一次、记满半圈以上`);
    if (m.r2<0.999) p.push(`拟合的 R² 只有 ${m.r2.toFixed(4)}，有个别点可能读错了`);
    if (c.e && Math.abs(c.e.off)>1) p.push(`记录波片消光位置时，波片光轴和起偏器差了约 ${Math.abs(c.e.off).toFixed(1)}°，后面各角度 α 都会带上这个偏差`);
    if (c.e && Math.abs(c.e.cross)>2) p.push(`找波片消光位置时检偏器并没有和起偏器正交（差 ${Math.abs(c.e.cross).toFixed(1)}°），可能是转了检偏器而不是波片，这样定出的光轴方向不对`);
    if (c.e && c.e.I/I0>0.008) p.push(`波片消光位置的光强 ${c.e.I} µW 偏大，可能没有转到最小`);
    const notCross=good.filter(x=>!x.crossOK);
    if (notCross.length) p.push(`α = ${notCross.map(x=>x.alpha).join('°、')}° 时记录的最大、最小光强对应的检偏器角度相差不到 60°，可能没有真正找到极值（应相差约 90°）`);
    if (one.length) p.push(`α = ${one.map(x=>x.alpha).join('°、')}° 只记了一次光强，求不出 I_min/I_max`);
    if (c.g.length && good.length<5) p.push(`波片只测了 ${good.length} 个角度，建议从 0° 到 90° 每隔 15° 测一次`);
    const g45=good.find(x=>Math.abs(Math.abs(x.alpha)-45)<=3);
    const right=s.guess&&s.guess===s.type;
    const plate = good.length ? `波片部分：${g45?`α ≈ 45° 时 I_min/I_max = ${g45.ratio.toFixed(3)}，`:''}这片实际是${TYPE[s.type]}，你的判断${s.guess?(right?'正确':'不对'):'还没有填写'}。${s.type==='q'?'λ/4 波片在 45° 时出射圆偏振光，比值接近 1；其他角度比值约为 tan²α。':'λ/2 波片出射始终是线偏振光，比值接近 0，振动方向转过 2α。'}` : '还没有做进阶的波片部分。';
    return [`【总评】拟合得到检偏器与起偏器平行时的读数 θ∥ = ${Unc.format(m.par,m.u,'°').text.replace(') °',')°')}，与真实值相差 ${m.err.toFixed(2)}°；R² = ${m.r2.toFixed(5)}，消光比 ${(m.ratio*100).toFixed(2)}%，数据很好地符合马吕斯定律。${plate}`,
      '【数据问题】'+(p.length?p.join('；')+'。':'没有发现明显问题。'),
      '【误差来源】激光功率的缓慢起伏、偏振片不能完全消光（I_min 不为零）、转盘游标读数误差（0.1°）、找光强极值时检偏器没有转到正好的位置，以及波片相位延迟与标称值有偏差。',
      '【改进建议】在消光和光强最大附近用微调；记录点均匀分布在一整圈上，用最小二乘而不是只用两三个点求 θ∥；测波片时每个角度都转检偏器找到真正的最大、最小值；判断波片类型重点看 α = 45° 的结果。'].join('\n');
  }
  function review(){
    const c=calc();
    runReview(P,{
      check:()=>c.m?'':'马吕斯定律至少需要 8 个点，并且相邻两点的角度间隔不超过 45°（对 180° 取模后）。',
      prompt:()=>`你是大学物理光学实验课的助教，正在批改大一学生“马吕斯定律与波片”的实验数据。He-Ne 激光（632.8 nm）经起偏器后为线偏振光，检偏器转盘的零点没有对准起偏器。
马吕斯定律数据（检偏器读数 θ/°，光强 I/µW）：${c.m?s.rows.filter(r=>r.t==='m').map(r=>`(${r.th}, ${r.I})`).join(' '):''}
最小二乘拟合 I = I_min + (I_max − I_min)cos²(θ − θ∥)：I_max = ${c.m.Imax.toFixed(1)} µW，I_min = ${c.m.Imin.toFixed(2)} µW，消光比 ${(c.m.ratio*100).toFixed(2)}%，R² = ${c.m.r2.toFixed(5)}，θ∥ = ${c.m.par.toFixed(2)}°，不确定度 ${c.m.u.toFixed(2)}°；真实 θ∥ = ${s.t0.toFixed(2)}°（模 180°），相差 ${c.m.err.toFixed(2)}°。
${c.e?`进阶波片部分：正交偏振器间放入未知波片，消光时波片读数 ${c.e.a}°（此时波片光轴与起偏器实际相差 ${c.e.off}°，检偏器偏离正交 ${c.e.cross}°，学生看不到），光强 ${c.e.I} µW。
各角度（α 为相对消光位置转过的角度）：${c.g.map(x=>`α=${x.alpha}°：记 ${x.n} 次，I_max=${x.Imax}，I_min=${x.Imin}，比值 ${x.ratio.toFixed(3)}，长轴方向 ${x.major}°（理论比值 ${x.th.ratio.toFixed(3)}，理论长轴 ${x.th.major.toFixed(1)}°）`).join('；')}。
这片实际是${TYPE[s.type]}（相位延迟 ${s.delta.toFixed(1)}°），学生的判断：${s.guess?TYPE[s.guess]:'没有填写'}。`:'学生还没有做进阶的波片部分。'}
请给出批改意见：中文，250~350 字，分 4 段，每段开头依次写【总评】【数据问题】【误差来源】【改进建议】，段与段之间换行。说明数据是否符合马吕斯定律；如果做了波片部分，说明判断依据（特别是 α = 45° 时的比值和长轴方向的变化）以及学生的判断是否正确，并指出只测光强分不出快轴和慢轴。只根据给出的数据说话，语气像耐心的助教，不要使用 Markdown。`,
      offline:()=>offline(c)
    }).then(ok=>{ if (ok){ s.checked=true; s.review=ok; table(); render(); } });
  }
  return {mount, render, key};
})();
