/* =====================================================================
 * lab-laser.js —— 虚拟实验：半导体激光器 P-I 特性与光电二极管响应度（650 nm）
 * 操作：TEC 控温 → 逐点加大驱动电流测输出功率 → 拟合线性段求阈值电流、斜率效率
 *       → 换几个温度，由 ln I_th 与 T 的直线求特征温度 T₀
 *       → 挡光测暗电流，再用功率计和光电二极管分别测同一束光，求响应度和量子效率
 * ===================================================================== */
const LD = (() => {
  const P='ld', LAM=650, HC=1239.84;                   // 标称波长 (nm)，hc/e (eV·nm)
  const PMAX=7, IMAX=70, PLIN=0.5;                     // 额定功率 (mW)、电流上限 (mA)、线性段下限 (mW)
  const TEMPS=[15,20,25,30,35,40,45], TAU=3;           // TEC 设定点 (°C)、温度响应时间常数 (s)
  const PM_ACC=0.03;                                   // 功率计校准误差限（3%），作 B 类
  const s={}; let B=null, timer=0, last=0;
  const sgn=()=>Math.random()<.5?-1:1;

  function init(){
    Object.assign(s,{ith25:rnd(26,32), T0:rnd(62,92), eta25:rnd(0.42,0.52), T1:rnd(210,300), qe:rnd(0.76,0.84), dark:rnd(0.08,0.25),
      I:0, Ts:25, T:rnd(21,23), mode:'pi', det:'pm', shut:false, settled25:false, rows:[], checked:false});
  }
  const save=()=>LabStore.save(P,s);
  const ith=(T=s.T)=>s.ith25*Math.exp((T-25)/s.T0);
  const eta=(T=s.T)=>s.eta25*Math.exp(-(T-25)/s.T1);
  /* 输出功率 (mW)：线性段 + 阈值处平滑过渡 + 阈值以下的自发辐射 + 高电流时轻微饱和 */
  function power(I=s.I, T=s.T){
    const th=ith(T), d=0.35, x=(I-th)/d, sp=x>30?x:Math.log1p(Math.exp(x));
    return eta(T)*d*sp*(1-0.0015*Math.max(0,I-th)) + 0.0008*Math.min(I,th) + 0.00008*Math.max(0,I-th);
  }
  const lam=(T=s.T)=>LAM+0.2*(T-25);
  const resp=(T=s.T)=>s.qe*lam(T)/HC;                  // A/W
  const fluct=()=>{ const t=(typeof performance!=='undefined'?performance.now():Date.now())/1000; return 0.002*Math.sin(2*Math.PI*t/7.1)+0.001*Math.sin(2*Math.PI*t/2.3+1); };
  /* 当前探测器读数：功率计 mW；光电二极管 µA（含暗电流） */
  function reading(){
    const p=s.shut?0:power()*(1+fluct());
    return s.det==='pm' ? p+0.0001 : resp()*p*1000+s.dark*(1+0.03*Math.sin(Date.now()/900));
  }
  const fmt3=v=>v>=10?v.toFixed(2):v>=1?v.toFixed(3):v.toFixed(4);
  const settled=()=>Math.abs(s.T-s.Ts)<0.05;
  function setI(v){ s.I=Math.max(0,Math.min(IMAX,v)); }

  /* ---------- 页面 ---------- */
  function mount(el){
    el.innerHTML=labShell(P,{
      title:'半导体激光器与光电二极管特性',
      principle:`<p><b>P-I 特性</b>：注入电流小于阈值 I<sub>th</sub> 时，半导体激光器只有很弱的自发辐射；超过阈值后受激辐射占主导，输出功率随电流线性增大：<b>P = η<sub>s</sub>(I − I<sub>th</sub>)</b>，η<sub>s</sub> 是斜率效率（W/A）。对线性段（本实验取 P ≥ ${PLIN} mW）做直线拟合，斜率就是 η<sub>s</sub>，与电流轴的交点就是 I<sub>th</sub>。</p>
        <p><b>特征温度</b>：温度升高时载流子泄漏和俄歇复合增强，阈值按 <b>I<sub>th</sub>(T) = I<sub>th</sub>(T<sub>r</sub>)·exp[(T − T<sub>r</sub>)/T₀]</b> 增大。在几个温度下测出 I<sub>th</sub>，以 ln I<sub>th</sub> 对热力学温度 T 作直线，斜率的倒数就是特征温度 T₀。T₀ 越大，激光器对温度越不敏感。改变 TEC 设定温度后，要等实际温度稳定再测。</p>
        <p><b>光电二极管</b>：反向偏置的硅光电二极管，光电流与入射功率成正比：I<sub>ph</sub> = R·P + I<sub>d</sub>，R 是响应度（A/W），I<sub>d</sub> 是没有光照时也存在的暗电流。量子效率 <b>η = R·hc/(eλ) = R × 1239.84/λ(nm)</b>。先挡光测暗电流；再在几个电流下，同一束光先用功率计测 P，再换成光电二极管测电流。功率很小时不扣除暗电流，算出的响应度会明显偏大。</p>
        <p>不确定度：I<sub>th</sub>、η<sub>s</sub>、T₀ 和 R 的 A 类都来自直线拟合（I<sub>th</sub> 由截距和斜率的协方差传递）；R 再合成功率计校准误差 ${PM_ACC*100}% 的 B 类分量。额定输出 ${PMAX} mW，超过会损坏激光器，软件会禁止记录。</p>`,
      right:`<div class="canvas-wrap fill"><canvas id="${P}-bench"></canvas><div class="caption">装置示意</div></div>
      <div class="lab-grid">
        <div class="canvas-wrap"><canvas id="${P}-view" class="eye"></canvas><div class="caption" id="${P}-cap">驱动器与探测器读数</div><div class="msg" id="${P}-msg"></div><div class="counter" id="${P}-counter"></div></div>
        <div class="panel" id="${P}-panel">
          <div class="seg" id="${P}-modes"><button class="tab" data-v="pi">P-I 特性</button><button class="tab" data-v="pd">光电二极管响应度</button></div>
          <label class="ctl-inline">TEC 设定温度 <select id="${P}-Ts">${TEMPS.map(t=>`<option value="${t}">${t} °C</option>`).join('')}</select><span class="tip" id="${P}-Tnow"></span></label>
          <div class="readout" id="${P}-readout"></div>
          <canvas id="${P}-dial" class="strip"></canvas>
          ${turnControls(P,[[0.5,'微调 0.5 mA/s'],[3,'中速 3 mA/s'],[12,'快速 12 mA/s']],{assist:'',left:'◀ 减小电流',rightLabel:'增大电流 ▶'})}
          <div class="row" style="margin-top:0;flex-wrap:wrap" id="${P}-pdbox">
            <div class="seg" id="${P}-dets"><button class="tab" data-d="pm">功率计</button><button class="tab" data-d="pd">光电二极管</button></div>
            <button class="hold" id="${P}-shut">挡光</button>
          </div>
          <div class="tip">按住按钮调电流，也可以拖动刻度条；键盘 ← → 每次 0.1 mA（Shift 为 1 mA）。</div>
        </div>
      </div>`});
    init(); LabStore.restore(P,s); stats.records+=s.rows.length; $('#'+P+'-review').innerHTML=paras(s.review||'');
    B=benchArea(P, Models3D.laser, ()=>({I:s.I, T:s.T, Ts:s.Ts, P:power(), det:s.det, shut:s.shut, read:reading(), PMAX}), {cap3d:'三维模型'});
    B.onChange=render;
    $('#'+P+'-modes').onclick=e=>{ const b=e.target.closest('button'); if (!b) return; s.mode=b.dataset.v; if (s.mode==='pi'){ s.det='pm'; s.shut=false; } render(); };
    $('#'+P+'-dets').onclick=e=>{ const b=e.target.closest('button'); if (b){ s.det=b.dataset.d; render(); } };
    $('#'+P+'-shut').onclick=()=>{ s.shut=!s.shut; render(); };
    $('#'+P+'-Ts').value=s.Ts; $('#'+P+'-Ts').onchange=e=>{ s.Ts=+e.target.value; render(); };
    bindHold($('#'+P+'-panel'), $('#'+P+'-speed'), d=>{ setI(s.I+d); render(); });
    bindDrag($('#'+P+'-dial'), 4, d=>{ setI(s.I+d/10); render(); });
    $('#'+P+'-rec').onclick=record;
    $('#'+P+'-undo').onclick=()=>{ s.checked=false; s.review=''; $('#'+P+'-review').innerHTML=''; if (s.rows.pop()) stats.records--; table(); render(); };
    $('#'+P+'-clr').onclick=()=>{ stats.records-=s.rows.length; s.rows=[]; s.checked=false; s.review=''; $('#'+P+'-review').innerHTML=''; table(); render(); };
    $('#'+P+'-check').onclick=review;
    table();
    /* TEC：实际温度按指数规律趋近设定值；读数每 0.4 s 刷新 */
    clearInterval(timer); last=Date.now();
    timer=setInterval(()=>{ const now=Date.now(), dt=Math.min(1,(now-last)/1000); last=now;
      s.T+= (s.Ts-s.T)*(1-Math.exp(-dt/TAU)); if (Math.abs(s.T-s.Ts)<0.002) s.T=s.Ts;
      if (s.Ts===25 && settled()) s.settled25=true;
      if (!document.hidden && el.offsetParent!==null){ view(); panel(); if (B.is3d()) B.update(); } },400);
  }
  function key(dir,big){ setI(+(s.I+dir*(big?1:0.1)).toFixed(1)); render(); }

  /* ---------- 绘图 ---------- */
  function panel(){
    const r=reading();
    $('#'+P+'-Tnow').textContent=`实际 ${s.T.toFixed(2)} °C${settled()?'（已稳定）':'（稳定中…）'}`;
    $('#'+P+'-readout').innerHTML=`<div>驱动电流</div><div class="v">${s.I.toFixed(1)} mA</div><div class="f">${s.det==='pm'?`功率计 ${fmt3(r)} mW`:`光电二极管 ${fmt3(r)} µA`}${s.shut?'　（已挡光）':''}　电流分辨率 0.1 mA，上限 ${IMAX} mA</div>`;
  }
  function render(){
    if (!(B.is3d() && B.update())) bench();
    view(); panel();
    document.querySelectorAll('#'+P+'-modes .tab').forEach(b=>b.classList.toggle('active',b.dataset.v===s.mode));
    document.querySelectorAll('#'+P+'-dets .tab').forEach(b=>b.classList.toggle('active',b.dataset.d===s.det));
    $('#'+P+'-pdbox').hidden=s.mode!=='pd';
    $('#'+P+'-shut').textContent=s.shut?'移开挡光板':'挡光';
    drawStrip($('#'+P+'-dial'), s.I*10, {px:4, major:50, label:k=>`${k/10} mA`});
    const c=calc(), g25=c.groups.find(g=>g.Ts===25), fits=c.groups.filter(g=>g.fit).length;
    $('#'+P+'-rec').textContent = s.mode==='pi' ? '记录 P-I 数据点' : s.det==='pd'&&s.shut ? '记录暗电流' : s.det==='pm' ? '记录功率计读数' : '记录光电流';
    renderSteps(P,[
      [s.settled25,'<b>控温</b>：TEC 设为 25 °C，等实际温度稳定。'],
      [!!(g25&&g25.fit&&g25.below>=3),`<b>测 P-I 曲线</b>：从 0 开始逐渐加大电流，阈值以下每 2～5 mA 记一次，阈值附近和以上每 0.5～1 mA 记一次；线性段（P ≥ ${PLIN} mW）至少 5 个点，输出不要超过 ${PMAX} mW。`],
      [fits>=3,`<b>换温度</b>：把 TEC 设到其他温度（如 20、30、35 °C），等稳定后重复测量。至少 3 个温度（已完成 ${Math.min(fits,3)}/3）。`],
      [!!(c.pd&&c.pd.n>=5&&c.pd.dark!=null),`<b>测响应度</b>：切到“光电二极管”页，先挡光记录暗电流；再在至少 5 个电流下，同一束光分别用功率计和光电二极管各记一次（已配对 ${c.pd?Math.min(c.pd.n,5):0}/5）。`],
      [s.checked,'<b>处理数据</b>：求各温度的阈值电流和斜率效率、特征温度 T₀、响应度和量子效率，再让 AI 助教检查。']]);
  }
  function bench(){
    const c=$('#'+P+'-bench'); const {ctx,W}=benchSetup(c);
    const span=680, sc=Math.min(1,(W-20)/span); ctx.translate((W-span*sc)/2,230*(1-sc)/2); ctx.scale(sc,sc);
    const y=110, F='12px "PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif', p=power();
    ctx.font=F; ctx.textAlign='center';
    ctx.fillStyle='#2b2f35'; ctx.fillRect(20,y-60,150,40); ctx.fillStyle='#9fe7b0'; ctx.font='14px ui-monospace,Consolas,monospace';
    ctx.fillText(`${s.I.toFixed(1)} mA  ${s.T.toFixed(2)}°C`,95,y-35); ctx.font=F; ctx.fillStyle='#c9c8c2'; ctx.fillText('驱动器与 TEC 控制器',95,y-68);
    ctx.strokeStyle='#5b616a'; ctx.beginPath(); ctx.moveTo(95,y-20); ctx.lineTo(95,y-10); ctx.lineTo(150,y-10); ctx.stroke();
    ctx.fillStyle='#3b4048'; ctx.fillRect(150,y-16,60,32); ctx.fillStyle='#8a9099'; for (let k=0;k<6;k++) ctx.fillRect(152+k*10,y+16,6,10);
    ctx.fillStyle='#c9c8c2'; ctx.fillText('激光二极管 + TEC',180,y+44);
    ctx.fillStyle='#9aa1aa'; ctx.fillRect(212,y-8,22,16); ctx.fillStyle='#c9c8c2'; ctx.fillText('准直透镜',223,y-18);
    const a=Math.min(0.95,0.05+p/PMAX), end=s.shut?330:520;
    ctx.strokeStyle=`rgba(255,40,30,${a})`; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(234,y); ctx.lineTo(end,y); ctx.stroke();
    ctx.fillStyle=s.shut?'#c9c8c2':'#4a4f57'; ctx.fillRect(330,s.shut?y-18:y-48,6,30); ctx.fillStyle='#c9c8c2'; ctx.fillText(s.shut?'挡光板（挡住）':'挡光板',333,y+44);
    ctx.fillStyle='#1d1e21'; ctx.strokeStyle='#5b616a'; ctx.fillRect(520,y-16,30,32); ctx.strokeRect(520,y-16,30,32);
    ctx.fillStyle='#c9c8c2'; ctx.fillText(s.det==='pm'?'功率计探头':'光电二极管',535,y+44);
    ctx.fillStyle='#2b2f35'; ctx.fillRect(580,y-30,96,44); ctx.fillStyle='#9fe7b0'; ctx.font='14px ui-monospace,Consolas,monospace'; ctx.fillText(`${fmt3(reading())} ${s.det==='pm'?'mW':'µA'}`,628,y-3);
    ctx.font=F; ctx.fillStyle='#c9c8c2'; ctx.fillText(s.det==='pm'?'光功率计':'微电流计',628,y+44);
  }
  function view(){
    const c=$('#'+P+'-view'), S=eyeSize(c); c.style.width=S+'px';
    const {ctx,dpr}=setup(c,S); ctx.setTransform(dpr,0,0,dpr,0,0);
    const F='"PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif', r=reading(), p=power();
    ctx.fillStyle='#0b0c0e'; ctx.fillRect(0,0,S,S);
    const h=S*0.26;
    ctx.fillStyle='#1c1f23'; ctx.fillRect(10,10,S-20,h); ctx.fillStyle='#0f1a14'; ctx.fillRect(22,22,S-44,h-24);
    ctx.fillStyle='#9fe7b0'; ctx.textAlign='right'; ctx.font=`300 ${Math.round(h*0.4)}px ui-monospace,Consolas,monospace`; ctx.fillText(fmt3(r),S-86,22+h*0.55);
    ctx.font=`${Math.round(h*0.16)}px ${F}`; ctx.textAlign='left'; ctx.fillText(s.det==='pm'?'mW':'µA',S-80,22+h*0.55);
    ctx.fillStyle='#6f8d79'; ctx.font=`11px ${F}`; ctx.fillText(`${s.det==='pm'?'光功率计（λ 设为 650 nm）':'光电二极管，反偏 5 V'}　I = ${s.I.toFixed(1)} mA　T = ${s.T.toFixed(2)} °C`,30,h+2);
    /* 当前温度已记录的 P-I 点 */
    const pts=s.rows.filter(x=>x.t==='pi'&&x.Ts===s.Ts);
    const x0=40, x1=S-14, y0=S-28, y1=h+34, top=PMAX+1, X=i=>x0+i/IMAX*(x1-x0), Y=v=>y0-Math.min(v,top)/top*(y0-y1);
    ctx.strokeStyle='#2a2d33'; ctx.fillStyle='#6f757d'; ctx.font=`10px ${F}`; ctx.textAlign='center';
    for (let i=0;i<=IMAX;i+=10){ ctx.beginPath(); ctx.moveTo(X(i),y1); ctx.lineTo(X(i),y0); ctx.stroke(); ctx.fillText(String(i),X(i),y0+13); }
    ctx.textAlign='right'; for (let v=0;v<=top;v+=2){ ctx.beginPath(); ctx.moveTo(x0,Y(v)); ctx.lineTo(x1,Y(v)); ctx.stroke(); ctx.fillText(String(v),x0-4,Y(v)+3); }
    ctx.setLineDash([4,4]); ctx.strokeStyle='#7a3b30'; ctx.beginPath(); ctx.moveTo(x0,Y(PMAX)); ctx.lineTo(x1,Y(PMAX)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle='#ffd166'; pts.forEach(q=>{ ctx.beginPath(); ctx.arc(X(q.I),Y(q.P),2.8,0,Math.PI*2); ctx.fill(); });
    ctx.fillStyle='#ff5a3c'; ctx.beginPath(); ctx.arc(X(s.I),Y(p),4,0,Math.PI*2); ctx.fill();
    ctx.textAlign='left'; ctx.fillStyle='#8a9099'; ctx.fillText(`${s.Ts} °C 已记录的 P-I 点（横轴 mA，纵轴 mW；虚线为额定功率）`,x0+4,y1-8);
    const msg=$('#'+P+'-msg');
    msg.textContent = p>PMAX ? `输出 ${p.toFixed(2)} mW，超过额定功率 ${PMAX} mW！请立即减小电流` : !settled() ? `TEC 正在把温度调到 ${s.Ts} °C，等稳定后再记录` : '';
    msg.style.top='50%'; msg.style.color=p>PMAX?'#ff8a7a':'#fff';
    $('#'+P+'-counter').hidden=true;
  }

  /* ---------- 数据 ---------- */
  function note(t){ table(); $('#'+P+'-result').insertAdjacentHTML('afterbegin',`<div class="note">${esc(t)}</div>`); }
  function push(row){ s.rows.push(row); s.checked=false; s.review=''; $('#'+P+'-review').innerHTML='';
    stats.records++; logEvent('lab_record',{lab:P,n:s.rows.length,row}); table(); render(); }
  function record(){
    if (power()>PMAX) return note(`输出超过额定功率 ${PMAX} mW，先减小电流。`);
    if (!settled()) return note(`温度还没稳定（实际 ${s.T.toFixed(2)} °C，设定 ${s.Ts} °C），等 TEC 稳定后再记录。`);
    const v=+fmt3(reading()), base={Ts:s.Ts, T:+s.T.toFixed(2), I:+s.I.toFixed(1)};
    if (s.mode==='pi') return push({t:'pi', ...base, P:v});
    push({t:'pd', ...base, det:s.det, shut:s.shut, v});
  }
  /* 直线拟合 y = a + b·x，返回系数、标准偏差和协方差 */
  function linfit(xs,ys){
    const n=xs.length, mx=Unc.mean(xs), my=Unc.mean(ys), sxx=xs.reduce((q,x)=>q+(x-mx)**2,0);
    const b=xs.reduce((q,x,i)=>q+(x-mx)*(ys[i]-my),0)/sxx, a=my-b*mx, res=ys.reduce((q,y,i)=>q+(y-a-b*xs[i])**2,0);
    const s2=n>2?res/(n-2):null;
    return {a,b,n,sb:s2!=null?Math.sqrt(s2/sxx):null, sa:s2!=null?Math.sqrt(s2*(1/n+mx*mx/sxx)):null, cov:s2!=null?-mx*s2/sxx:null};
  }
  function calc(){
    const pi=s.rows.filter(r=>r.t==='pi'), byT=new Map();
    pi.forEach(r=>{ if (!byT.has(r.Ts)) byT.set(r.Ts,[]); byT.get(r.Ts).push(r); });
    const groups=[...byT.keys()].sort((a,b)=>a-b).map(Ts=>{
      const rows=byT.get(Ts).slice().sort((a,b)=>a.I-b.I), lin=rows.filter(r=>r.P>=PLIN);
      const g={Ts, rows, n:rows.length, nlin:lin.length, Tk:Ts+273.15};
      if (lin.length>=4){ const f=linfit(lin.map(r=>r.I),lin.map(r=>r.P)), th=-f.a/f.b;
        const uth=f.sb!=null?Math.sqrt(f.sa**2+th*th*f.sb**2+2*th*f.cov)/Math.abs(f.b):null;
        g.fit={eta:f.b, ueta:f.sb, ith:th, uith:uth, a:f.a}; g.below=rows.filter(r=>r.I<th).length; }
      return g; });
    const ok=groups.filter(g=>g.fit&&g.fit.ith>0);
    let T0=null;
    if (ok.length>=2){ const f=linfit(ok.map(g=>g.Tk),ok.map(g=>Math.log(g.fit.ith)));
      T0={T0:1/f.b, u:f.sb!=null?f.sb/(f.b*f.b):null, n:ok.length, k:f.b, ln0:f.a, err:(1/f.b-s.T0)/s.T0*100}; }
    /* 光电二极管：暗电流取挡光读数的平均；同一电流、同一温度下功率计与光电二极管读数配成一对 */
    const pd=s.rows.filter(r=>r.t==='pd'), darks=pd.filter(r=>r.det==='pd'&&r.shut), m=new Map();
    pd.filter(r=>!r.shut).forEach(r=>{ const k=r.Ts+'@'+r.I.toFixed(1); if (!m.has(k)) m.set(k,{Ts:r.Ts,I:r.I}); m.get(k)[r.det]=r.v; });
    const pairs=[...m.values()].filter(x=>x.pm!=null&&x.pd!=null).sort((a,b)=>a.pm-b.pm);
    const dark=darks.length?Unc.mean(darks.map(r=>r.v)):null;
    let pdr=null;
    if (pairs.length || dark!=null){
      pdr={pairs, n:pairs.length, dark, nd:darks.length};
      pairs.forEach(x=>{ x.raw=x.pd/x.pm/1000; x.R=dark!=null?(x.pd-dark)/x.pm/1000:null; });
      if (pairs.length>=3){ const f=linfit(pairs.map(x=>x.pm),pairs.map(x=>x.pd)), R=f.b/1000;
        const uA=f.sb!=null?f.sb/1000:null, uB=R*PM_ACC/Unc.SQRT3, u=Unc.combine(uA,uB);
        Object.assign(pdr,{R, uA, uB, u, int:f.a, qe:R*HC/LAM, uqe:u*HC/LAM, Rtrue:resp(25), err:(R-resp(25))/resp(25)*100}); }
    }
    return {groups, T0, pd:pdr, truth:{ith25:s.ith25, T0:s.T0, eta25:s.eta25, qe:s.qe, dark:s.dark}};
  }

  function table(){
    save(); renderStats();
    if (!s.rows.length){ $('#'+P+'-table').innerHTML='<div class="empty">还没有数据。TEC 温度稳定后，从 0 mA 开始逐渐加大电流并记录功率。</div>'; $('#'+P+'-result').innerHTML=''; return; }
    const c=calc(); let h='';
    c.groups.forEach(g=>{ h+=`<div class="hint" style="margin-top:6px">${g.Ts} °C（${g.n} 个点，线性段 ${g.nlin} 个）</div><table class="data plt"><tr><th>I/mA</th>${g.rows.map(r=>`<td>${r.I.toFixed(1)}</td>`).join('')}</tr><tr><th>P/mW</th>${g.rows.map(r=>`<td>${r.P}</td>`).join('')}</tr></table>`; });
    if (c.pd){ h+=`<div class="hint" style="margin-top:8px">光电二极管：暗电流 ${c.pd.dark!=null?`I<sub>d</sub> = ${c.pd.dark.toFixed(4)} µA（${c.pd.nd} 次平均）`:'还没测'}</div>`;
      if (c.pd.pairs.length) h+=`<table class="data"><tr><th>I/mA</th><th>P/mW</th><th>I<sub>ph</sub>/µA</th><th>R/(A/W)</th><th>不扣暗电流</th></tr>`+c.pd.pairs.map(x=>`<tr><td>${x.I.toFixed(1)}</td><td>${x.pm}</td><td>${x.pd}</td><td>${x.R!=null?x.R.toFixed(4):'—'}</td><td>${x.raw.toFixed(4)}</td></tr>`).join('')+'</table>'; }
    $('#'+P+'-table').innerHTML=`<div class="fbtable">${h}</div>`;
    let out='';
    const fits=c.groups.filter(g=>g.fit);
    if (fits.length){
      out+=`<div class="result">线性段拟合 P = η<sub>s</sub>(I − I<sub>th</sub>)：<table class="data"><tr><th>T/°C</th><th>I<sub>th</sub>/mA</th><th>η<sub>s</sub>/(W/A)</th></tr>${fits.map(g=>{ const a=g.fit.uith!=null?Unc.format(g.fit.ith,g.fit.uith,''):null, b=g.fit.ueta!=null?Unc.format(g.fit.eta,g.fit.ueta,''):null;
        return `<tr><td>${g.Ts}</td><td>${a?a.text:g.fit.ith.toFixed(2)}</td><td>${b?b.text:g.fit.eta.toFixed(3)}</td></tr>`; }).join('')}</table>
        ${c.T0?`<div>ln I<sub>th</sub> 对 T 拟合（${c.T0.n} 个温度）：特征温度 T₀ = <span class="big">${c.T0.T0.toFixed(1)} K</span></div>
          <div class="unc">${c.T0.u!=null?`不确定度：取拟合斜率的标准偏差传递，u(T₀) = T₀²·u(k) = ${(+c.T0.u.toPrecision(2))} K<div class="final">结果：<b>T₀ = ${Unc.format(c.T0.T0,c.T0.u,'K').text}</b></div>`:'只有 2 个温度，无法估计 T₀ 的不确定度，建议至少测 3 个温度。'}</div>
          ${s.checked?`<div>本台激光器的真实 T₀ = ${s.T0.toFixed(1)} K，25 °C 阈值 ${s.ith25.toFixed(2)} mA，斜率效率 ${s.eta25.toFixed(3)} W/A；T₀ 相对偏差 <b>${c.T0.err>=0?'+':''}${c.T0.err.toFixed(1)}%</b></div>`:'<div class="hint">真实参数在 AI 批改后显示。</div>'}`:'<div class="hint">至少要 2 个温度的阈值才能求 T₀。</div>'}
        <canvas id="${P}-chart" class="chart"></canvas></div>`;
    } else if (c.groups.length) out+=`<div class="hint" style="margin-top:8px">每个温度的线性段（P ≥ ${PLIN} mW）至少要 4 个点才能拟合。</div>`;
    if (c.pd&&c.pd.R!=null){ const f=Unc.format(c.pd.R,c.pd.u,'A/W');
      out+=`<div class="result">I<sub>ph</sub> 对 P 直线拟合（${c.pd.n} 对）：响应度 R = <span class="big">${c.pd.R.toFixed(4)} A/W</span>，截距 ${c.pd.int.toFixed(3)} µA${c.pd.dark!=null?`（实测暗电流 ${c.pd.dark.toFixed(3)} µA）`:''}
        <div class="unc">不确定度：u<sub>A</sub> = ${c.pd.uA!=null?(+c.pd.uA.toPrecision(2)):'—'} A/W（拟合），u<sub>B</sub> = ${(+c.pd.uB.toPrecision(2))} A/W（功率计校准 ${PM_ACC*100}%），u = ${(+c.pd.u.toPrecision(2))} A/W<div class="final">结果：<b>R = ${f.text}</b>，量子效率 η = R × 1239.84 / 650 = ${(c.pd.qe*100).toFixed(1)}% ± ${(c.pd.uqe*100).toFixed(1)}%</div></div>
        ${s.checked?`<div>光电二极管真实量子效率 ${(s.qe*100).toFixed(1)}%（25 °C 时 R = ${c.pd.Rtrue.toFixed(4)} A/W），暗电流 ${s.dark.toFixed(3)} µA；R 相对偏差 <b>${c.pd.err>=0?'+':''}${c.pd.err.toFixed(1)}%</b></div>`:''}
        <canvas id="${P}-chart2" class="chart"></canvas></div>`; }
    $('#'+P+'-result').innerHTML=out;
    if (fits.length) chartPI(c); if (c.pd&&c.pd.R!=null) chartPD(c);
  }
  const COLORS=['#2b6cb0','#2f855a','#b5442c','#805ad5','#b7791f','#319795','#c53030'];
  function axes(cv,xmax,ymax,xl,yl){
    const {ctx,dpr,W,H}=setup(cv,180); ctx.setTransform(dpr,0,0,dpr,0,0);
    const x0=40, x1=W-12, y0=H-28, y1=12, X=x=>x0+x/xmax*(x1-x0), Y=y=>y0-y/ymax*(y0-y1);
    ctx.font='11px "PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif'; ctx.strokeStyle='#e4e2dc'; ctx.fillStyle='#5b616a'; ctx.lineWidth=1;
    for (let k=0;k<=4;k++){ const v=ymax*k/4; ctx.beginPath(); ctx.moveTo(x0,Y(v)); ctx.lineTo(x1,Y(v)); ctx.stroke(); ctx.textAlign='right'; ctx.fillText(+v.toPrecision(3)+'',x0-5,Y(v)+4); }
    ctx.textAlign='center'; for (let k=0;k<=5;k++){ const v=xmax*k/5; ctx.fillText(+v.toPrecision(3)+'',X(v),y0+15); }
    ctx.strokeStyle='#8a8f97'; ctx.beginPath(); ctx.moveTo(x0,y1); ctx.lineTo(x0,y0); ctx.lineTo(x1,y0); ctx.stroke();
    ctx.textAlign='left'; ctx.fillText(`${yl}　横轴：${xl}`,x0+6,y1+10);
    return {ctx,X,Y};
  }
  function chartPI(c){
    const cv=$('#'+P+'-chart'); if (!cv) return; if (!cv.clientWidth) return whenVisible(cv,()=>chartPI(c));
    const imax=Math.max(...c.groups.flatMap(g=>g.rows.map(r=>r.I)),10), {ctx,X,Y}=axes(cv,Math.ceil(imax/10)*10,PMAX+1,'I / mA','P / mW');
    c.groups.forEach((g,i)=>{ const col=COLORS[TEMPS.indexOf(g.Ts)%COLORS.length]; ctx.fillStyle=col; ctx.strokeStyle=col;
      g.rows.forEach(r=>{ ctx.beginPath(); ctx.arc(X(r.I),Y(Math.min(r.P,PMAX+1)),2.4,0,Math.PI*2); ctx.fill(); });
      if (g.fit){ const i1=g.fit.ith+(PMAX)/g.fit.eta; ctx.lineWidth=1.2; ctx.beginPath(); ctx.moveTo(X(g.fit.ith),Y(0)); ctx.lineTo(X(i1),Y(PMAX)); ctx.stroke(); }
      ctx.fillText(`${g.Ts} °C`,X(0)+8+i*48,Y(PMAX)+4); });
  }
  function chartPD(c){
    const cv=$('#'+P+'-chart2'); if (!cv) return; if (!cv.clientWidth) return whenVisible(cv,()=>chartPD(c));
    const pm=Math.max(...c.pd.pairs.map(x=>x.pm)), im=Math.max(...c.pd.pairs.map(x=>x.pd)), {ctx,X,Y}=axes(cv,pm*1.1,im*1.1,'P / mW','I_ph / µA');
    ctx.strokeStyle='#b5442c'; ctx.lineWidth=1.4; ctx.beginPath(); ctx.moveTo(X(0),Y(Math.max(0,c.pd.int))); ctx.lineTo(X(pm*1.1),Y(c.pd.int+c.pd.R*1000*pm*1.1)); ctx.stroke();
    ctx.fillStyle='#1d1e21'; c.pd.pairs.forEach(x=>{ ctx.beginPath(); ctx.arc(X(x.pm),Y(x.pd),3,0,Math.PI*2); ctx.fill(); });
  }

  /* ---------- AI 批改 ---------- */
  function offline(c){
    const p=[], fits=c.groups.filter(g=>g.fit), g25=fits.find(g=>g.Ts===25)||fits[0];
    c.groups.filter(g=>!g.fit).forEach(g=>p.push(`${g.Ts} °C 的线性段只有 ${g.nlin} 个点，求不出阈值`));
    fits.filter(g=>g.below<3).forEach(g=>p.push(`${g.Ts} °C 阈值以下只记了 ${g.below} 个点，看不出阈值前后的变化`));
    fits.filter(g=>{ const near=g.rows.filter(r=>Math.abs(r.I-g.fit.ith)<2).length; return near<2; }).forEach(g=>p.push(`${g.Ts} °C 阈值附近（±2 mA）点太少，建议加密`));
    if (fits.length<3) p.push(`只测了 ${fits.length} 个温度，求 T₀ 至少需要 3 个温度才能估计不确定度`);
    if (c.pd){ if (c.pd.dark==null) p.push('没有测暗电流，响应度在小功率时会偏大'); if (c.pd.n<5) p.push(`响应度只配了 ${c.pd.n} 对数据`);
      const small=c.pd.pairs.find(x=>x.R!=null&&x.raw/x.R>1.03); if (small) p.push(`P = ${small.pm} mW 时不扣暗电流算出的 R 偏大 ${((small.raw/small.R-1)*100).toFixed(1)}%，说明扣除暗电流很重要`); }
    else p.push('还没有测光电二极管的响应度');
    const t0=c.T0&&c.T0.T0, pdText=c.pd&&c.pd.R!=null?`响应度 R = ${Unc.format(c.pd.R,c.pd.u,'A/W').text}，量子效率 ${(c.pd.qe*100).toFixed(1)}%，真实值 ${(s.qe*100).toFixed(1)}%。`:'';
    return [`【总评】${g25?`${g25.Ts} °C 时阈值电流 ${g25.fit.ith.toFixed(2)} mA，斜率效率 ${g25.fit.eta.toFixed(3)} W/A（真实值 ${ith(g25.Ts).toFixed(2)} mA、${eta(g25.Ts).toFixed(3)} W/A）。`:''}${t0?`特征温度 T₀ = ${t0.toFixed(1)} K，真实值 ${s.T0.toFixed(1)} K，相对偏差 ${c.T0.err.toFixed(1)}%。`:''}${pdText}`,
      '【数据问题】'+(p.length?p.join('；')+'。':'没有发现明显问题。'),
      '【误差来源】阈值附近 P-I 曲线是逐渐弯折的，线性段起点选得太低会把弯曲部分带进拟合；高电流时有轻微饱和；温度没有完全稳定；功率计校准误差（约 3%）直接进入响应度；暗电流在小功率时占比大。',
      '【改进建议】每次改温度后等 TEC 稳定；阈值附近每 0.5 mA 记一次；线性段只取远离阈值、又不超过额定功率的点；求 T₀ 至少用 3～4 个温度；测响应度前先挡光测暗电流，并在不同功率下配对测量。'].join('\n');
  }
  function review(){
    const c=calc();
    runReview(P,{
      check:()=>c.groups.some(g=>g.fit)?'':`至少要有一个温度的 P-I 数据线性段（P ≥ ${PLIN} mW）达到 4 个点。`,
      prompt:()=>`你是大学光电子技术实验课的助教，正在批改大一学生“半导体激光器与光电二极管特性”的实验数据。激光器标称波长 650 nm，额定 ${PMAX} mW。线性段取 P ≥ ${PLIN} mW。
P-I 数据：${c.groups.map(g=>`${g.Ts} °C：${g.rows.map(r=>`(${r.I}, ${r.P})`).join(' ')}${g.fit?`；拟合 I_th = ${g.fit.ith.toFixed(2)} mA，η_s = ${g.fit.eta.toFixed(3)} W/A（真实 ${ith(g.Ts).toFixed(2)} mA、${eta(g.Ts).toFixed(3)} W/A）；阈值以下 ${g.below} 个点`:'；线性段点数不足'}`).join('\n')}
${c.T0?`特征温度：ln I_th 对 T 拟合得 T₀ = ${c.T0.T0.toFixed(1)} K${c.T0.u!=null?`，不确定度 ${c.T0.u.toFixed(1)} K`:''}；真实 T₀ = ${s.T0.toFixed(1)} K。`:'温度数不足，没有求 T₀。'}
${c.pd?`光电二极管：暗电流 ${c.pd.dark!=null?c.pd.dark.toFixed(4)+' µA':'没有测'}（真实 ${s.dark.toFixed(3)} µA）；配对数据（P/mW, I_ph/µA）：${c.pd.pairs.map(x=>`(${x.pm}, ${x.pd})`).join(' ')}${c.pd.R!=null?`；拟合 R = ${c.pd.R.toFixed(4)} A/W，不确定度 ${c.pd.u.toFixed(4)}，量子效率 ${(c.pd.qe*100).toFixed(1)}%；真实量子效率 ${(s.qe*100).toFixed(1)}%`:''}。`:'学生还没有测光电二极管。'}
请给出批改意见：中文，250~350 字，分 4 段，每段开头依次写【总评】【数据问题】【误差来源】【改进建议】，段与段之间换行。检查阈值附近的点是否够密、线性段选取是否合理、温度数量是否足以求 T₀、是否扣除了暗电流。可以顺带解释 T₀ 的物理意义。只根据给出的数据说话，语气像耐心的助教，不要使用 Markdown。`,
      offline:()=>offline(c)
    }).then(ok=>{ if (ok){ s.checked=true; s.review=ok; table(); render(); } });
  }
  typeof Learn!=='undefined' && Learn.task(P,{title:'暗电流对响应度的影响', label:'偏大', unit:'%',
    text:'光电二极管没有光照时也有很小的暗电流。<b>用你的数据</b>：在功率最小的那组数据上，不扣暗电流直接算 R′ = I<sub>ph</sub>/P，再和扣除暗电流后的 R 相比，R′ 偏大百分之多少？',
    ready:()=>{ const p=calc().pd; return !!(p&&p.dark!=null&&p.pairs.length); }, need:'先测暗电流（关闭快门）和至少一组功率—光电流数据。', hint:'(R′ − R)/R × 100%，R = (I − I_暗)/P。',
    answer:()=>{ const x=calc().pd.pairs[0]; return (x.raw-x.R)/x.R*100; }, tol:a=>Math.max(0.2,Math.abs(a)*0.03),
    reveal:()=>`暗电流约 ${s.dark.toFixed(2)} µA。它是一个固定的附加量，入射功率越小，所占比例越大；所以响应度应扣除暗电流，或者用 I–P 直线的斜率（截距吸收了暗电流）。`});
  return {mount, render, key};
})();
