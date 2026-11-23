/* =====================================================================
 * lab-fiber.js —— 虚拟实验：单模光纤耦合与弯曲损耗（He-Ne 632.8 nm）
 * 操作：三维调整架把光耦合进光纤 → 记直纤基准 P₀ → 绕不同半径的圆柱测 P → 取下复测基准
 *       → 拟合 ln(L/√R) 与 R 的直线；选做：远场光斑测模场直径
 * 物理模型：LP₀₁ 本征方程（贝塞尔函数）+ 高斯模场重叠（耦合效率）+ Marcuse 弯曲损耗公式
 * ===================================================================== */
const FB = (() => {
  const P='fb';
  /* ---------- 光纤与光源参数（长度单位 µm） ---------- */
  const LAM=0.6328, A=1.75, NA=0.12, N2=1.457, N1=Math.sqrt(N2*N2+NA*NA), K=2*Math.PI/LAM, V=K*A*NA;
  const W0=2.6;                                        // 物镜会聚光斑的束腰半径
  const ETA_Q=0.82;                                    // 物镜像差、端面质量等造成的额外耦合损失
  const T2=(1-((N2-1)/(N2+1))**2)**2;                  // 入射、出射两个端面的菲涅耳透射
  const PL=1000;                                       // 激光功率 (µW)
  const RADII=[3.5,4,4.5,5,5.5,6,6.5,7];               // 弯曲半径（光纤轴线处，mm）
  const DISTS=[20,25,30,35,40,45,50];                  // 白屏在导轨上的读数 (mm)
  const DRIFT=3, FLOOR=0.05, RES=0.05;                 // 基准允许变化 (%)、功率计下限 (µW)、游标分度 (mm)

  /* ---------- 贝塞尔函数（Abramowitz & Stegun 多项式近似） ---------- */
  function J0(x){ const ax=Math.abs(x); if (ax<8){ const y=x*x; return (57568490574+y*(-13362590354+y*(651619640.7+y*(-11214424.18+y*(77392.33017+y*-184.9052456)))))/(57568490411+y*(1029532985+y*(9494680.718+y*(59272.64853+y*(267.8532712+y))))); }
    const z=8/ax, y=z*z, t=ax-0.785398164; return Math.sqrt(0.636619772/ax)*(Math.cos(t)*(1+y*(-0.1098628627e-2+y*(0.2734510407e-4+y*(-0.2073370639e-5+y*0.2093887211e-6))))-z*Math.sin(t)*(-0.1562499995e-1+y*(0.1430488765e-3+y*(-0.6911147651e-5+y*(0.7621095161e-6-y*0.934935152e-7))))); }
  function J1(x){ const ax=Math.abs(x); if (ax<8){ const y=x*x; return x*(72362614232+y*(-7895059235+y*(242396853.1+y*(-2972611.439+y*(15704.4826+y*-30.16036606)))))/(144725228442+y*(2300535178+y*(18583304.74+y*(99447.43394+y*(376.9991397+y))))); }
    const z=8/ax, y=z*z, t=ax-2.356194491, v=Math.sqrt(0.636619772/ax)*(Math.cos(t)*(1+y*(0.183105e-2+y*(-0.3516396496e-4+y*(0.2457520174e-5+y*-0.240337019e-6))))-z*Math.sin(t)*(0.04687499995+y*(-0.2002690873e-3+y*(0.8449199096e-5+y*(-0.88228987e-6+y*0.105787412e-6))))); return x<0?-v:v; }
  function I0(x){ const y=(x/3.75)**2; return 1+y*(3.5156229+y*(3.0899424+y*(1.2067492+y*(0.2659732+y*(0.0360768+y*0.0045813))))); }
  function I1(x){ const y=(x/3.75)**2; return x*(0.5+y*(0.87890594+y*(0.51498869+y*(0.15084934+y*(0.02658733+y*(0.00301532+y*0.00032411)))))); }
  function K0(x){ if (x<=2){ const y=x*x/4; return -Math.log(x/2)*I0(x)+(-0.57721566+y*(0.4227842+y*(0.23069756+y*(0.0348859+y*(0.00262698+y*(0.0001075+y*0.0000074)))))); }
    const y=2/x; return Math.exp(-x)/Math.sqrt(x)*(1.25331414+y*(-0.07832358+y*(0.02189568+y*(-0.01062446+y*(0.00587872+y*(-0.0025154+y*0.00053208)))))); }
  function K1(x){ if (x<=2){ const y=x*x/4; return Math.log(x/2)*I1(x)+(1/x)*(1+y*(0.15443144+y*(-0.67278579+y*(-0.18156897+y*(-0.01919402+y*(-0.00110404+y*-0.00004686)))))); }
    const y=2/x; return Math.exp(-x)/Math.sqrt(x)*(1.25331414+y*(0.23498619+y*(-0.0365562+y*(0.01504268+y*(-0.00780353+y*(0.00325614+y*-0.00068245)))))); }

  /* ---------- LP₀₁ 模：U·J₁(U)/J₀(U) = W·K₁(W)/K₀(W)，U² + W² = V² ---------- */
  const MODE=(()=>{
    const f=u=>{ const w=Math.sqrt(V*V-u*u); return u*J1(u)/J0(u)-w*K1(w)/K0(w); };
    let lo=1e-6, hi=Math.min(V,2.4048)-1e-9;
    for (let i=0;i<100;i++){ const m=(lo+hi)/2; if (f(lo)*f(m)<=0) hi=m; else lo=m; }
    const U=(lo+hi)/2, W=Math.sqrt(V*V-U*U), b=W*W/(V*V);
    const beta=K*Math.sqrt(N2*N2+b*(N1*N1-N2*N2)), kap=U/A, gam=W/A;
    const w=A*(0.65+1.619*V**-1.5+2.879*V**-6);                            // Marcuse 模场半径近似
    return {U,W,b,beta,kap,gam,w,c:2*gam**3/(3*beta*beta)};               // c：µm⁻¹
  })();
  const WF=MODE.w, TH=LAM/(Math.PI*WF);                                    // 远场 1/e² 发散半角 (rad)
  const C_TH=MODE.c*1000;                                                  // 理论 c (mm⁻¹)
  /* Marcuse 公式：功率衰减系数 2α = √π κ² e^(−cR) / (2 γ^1.5 V² √R K₁²(γa))，每圈损耗 = 4.343·2α·2πR (dB) */
  function lossTurn(Rmm){ const R=Rmm*1000, {kap,gam,W,c}=MODE;
    const a2=Math.sqrt(Math.PI)*kap*kap*Math.exp(-c*R)/(2*gam**1.5*V*V*Math.sqrt(R)*K1(W)**2);
    return 10/Math.LN10*a2*2*Math.PI*R; }
  /* 两个高斯场的耦合效率：d 为横向偏离，z 为离焦量 */
  function etaCore(x,y,z){ const S=W0*W0+WF*WF, q=LAM*z/Math.PI;
    return 4/((W0/WF+WF/W0)**2+(q/(W0*WF))**2)*Math.exp(-2*(x*x+y*y)*S/(S*S+q*q)); }
  const ETA_MAX=etaCore(0,0,0);

  const s={}; let B=null, timer=0;
  const gauss=()=>{ let u=0; while(!u) u=Math.random(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*Math.random()); };
  const sgn=()=>Math.random()<.5?-1:1;

  function init(){
    Object.assign(s,{x:sgn()*rnd(6,14), y:sgn()*rnd(6,14), z:sgn()*rnd(30,70), X0:rnd(4,8), Y0:rnd(4,8), Z0:rnd(4,8), dl:rnd(0.8,2.2),
      view:'couple', axis:'x', wound:false, wR:5, wN:1, wid:0, R:5, N:1, L:30, r:2, coupled:false, rows:[], checked:false});
  }
  const save=()=>LabStore.save(P,s);
  const bendDB=()=>s.wound?lossTurn(s.wR)*s.wN:0;
  /* 功率计读数（未计激光功率起伏），µW */
  function parts(){
    const ec=etaCore(s.x,s.y,s.z);
    const core=PL*ETA_Q*T2*ec*10**(-bendDB()/10);
    const clad=s.wound?0:PL*T2*0.012*Math.exp(-(s.x*s.x+s.y*s.y)/(2*22*22))*(1-ec/ETA_MAX*ETA_Q);   // 进入包层的光，弯曲时被剥除
    return {ec,core,clad};
  }
  const power=()=>{ const p=parts(); return p.core+p.clad+0.002; };
  const fluct=()=>{ const t=(typeof performance!=='undefined'?performance.now():Date.now())/1000; return 0.003*Math.sin(2*Math.PI*t/9.7)+0.0015*Math.sin(2*Math.PI*t/3.1+1); };
  const meter=()=>power()*(1+fluct());
  const round4=p=>p>=100?+p.toFixed(1):p>=10?+p.toFixed(2):p>=1?+p.toFixed(3):+p.toFixed(4);
  const fmtP=p=>p>=1?`${round4(p)} µW`:`${(p*1000).toFixed(1)} nW`;
  const rTrue=L=>TH*(L+s.dl);                                              // 白屏上光斑的 1/e² 半径 (mm)
  function move(axis,um){ const lim=axis==='z'?150:40; s[axis]=Math.max(-lim,Math.min(lim,s[axis]+um));
    if (etaCore(s.x,s.y,s.z)>=0.85*ETA_MAX) s.coupled=true; }
  /* 绕、取光纤时手会碰到光纤：耦合通常只变一点点，偶尔碰得重一些，端面就偏了 */
  function disturb(){ const k=Math.random()<0.06?0.6:0.05; s.x+=gauss()*k; s.y+=gauss()*k; }
  function wind(){
    if (s.wound){ s.wound=false; } else { s.wound=true; s.wR=s.R; s.wN=s.N; s.wid++; }
    disturb(); render();
  }

  /* ---------- 页面 ---------- */
  function mount(el){
    el.innerHTML=labShell(P,{
      title:'光纤耦合与弯曲损耗',
      principle:`<p>实验用单模光纤：纤芯半径 a = 1.75 µm，数值孔径 NA = 0.12。在 632.8 nm 下归一化频率 <b>V = 2πa·NA/λ ≈ ${V.toFixed(2)} &lt; 2.405</b>，只传导 LP₀₁ 一个模式，模场近似为高斯分布，模场半径 w ≈ ${WF.toFixed(2)} µm。</p>
        <p><b>耦合</b>：物镜把激光会聚成束腰为 w₀ 的光斑，耦合效率由两个高斯场的重叠决定：η = 4 / [(w₀/w + w/w₀)² + (λz/πw₀w)²] · exp{−2d²(w₀² + w²) / [(w₀² + w²)² + (λz/π)²]}，d 是端面横向偏离，z 是离焦量。d 偏 2 µm，效率就降到一半左右，所以最后要用微调。没进纤芯的光有一部分进入包层，在白屏上是一片很淡的大光晕；光进入纤芯后，中心才出现明亮的光斑。</p>
        <p><b>弯曲损耗</b>：光纤弯曲时，弯曲外侧的场要比包层中的光走得更快才能跟上，跟不上的部分就辐射出去。按 Marcuse 公式，每圈损耗 <b>L ∝ √R · e<sup>−cR</sup></b>，c = 2γ³/(3β²)，与纤芯半径、折射率差和波长有关。取 y = ln(L/√R) 对 R 作直线拟合，斜率就是 −c。R 指光纤轴线的弯曲半径；本仿真没有计入弹光效应（实际光纤常把 R 换成约 1.28R 来修正）。</p>
        <p><b>测量方法</b>：损耗 = 10·lg(P₀/P) dB，除以圈数得到每圈损耗。每绕一次，前后都要测一次直纤基准 P₀：绕光纤时会碰动输入端，激光功率也会缓慢起伏。前后两次基准相差超过 ${DRIFT}%，说明耦合变了，这时功率下降并不全是弯曲造成的，这一组要重测。判断方法：弯曲损耗在取下光纤后会完全恢复，而且能看到圆柱上的光纤在发红光；端面没对准造成的下降，取下后依然存在，要重新调耦合。</p>
        <p><b>选做</b>：单模光纤出射的是高斯光束，远场 1/e² 半径 r 随距离线性增大：r = θ·(L + δ)，δ 是白屏刻度零点到光纤端面的未知距离。用几个不同的 L 拟合出斜率 θ，模场直径 <b>MFD = 2λ/(πθ)</b>。对单模光纤，远场发散角反映的是模场大小，而不是光纤的 NA。</p>
        <p>不确定度：c 取拟合斜率的标准偏差（A 类）；θ 取拟合斜率的标准偏差，再合成游标分度 ${RES} mm 带来的 B 类分量，并传递到 MFD。</p>`,
      right:`<div class="canvas-wrap fill"><canvas id="${P}-bench"></canvas><div class="caption">装置俯视图（示意）</div></div>
      <div class="lab-grid">
        <div class="canvas-wrap"><canvas id="${P}-view" class="eye"></canvas><div class="caption" id="${P}-cap">光功率计与输出端白屏</div><div class="msg" id="${P}-msg"></div><div class="counter" id="${P}-counter"></div></div>
        <div class="panel" id="${P}-panel">
          <div class="seg" id="${P}-views"><button class="tab" data-v="couple">耦合调节</button><button class="tab" data-v="bend">弯曲损耗</button><button class="tab" data-v="far">远场光斑（选做）</button></div>
          <div id="${P}-pane-couple" class="panel">
            <div class="seg" id="${P}-axes"><button class="tab" data-a="x">X 左右</button><button class="tab" data-a="y">Y 上下</button><button class="tab" data-a="z">Z 前后（调焦）</button></div>
            <div class="readout" id="${P}-readout"></div>
            ${turnControls(P,[[0.5,'微调 0.5 µm/s'],[5,'中速 5 µm/s'],[40,'快速 40 µm/s']],{assist:'',left:'◀ 减小',rightLabel:'增大 ▶'})}
            <div class="tip">按住按钮移动三维调整架上的光纤端面；键盘 ← → 每次 0.1 µm（Shift 为 1 µm）。</div>
          </div>
          <div id="${P}-pane-bend" class="panel" hidden>
            <label class="ctl-inline">弯曲半径 R <select id="${P}-R">${RADII.map(r=>`<option value="${r}">${r.toFixed(1)} mm</option>`).join('')}</select>
              圈数 <select id="${P}-N">${Array.from({length:10},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}</select></label>
            <div class="row" style="margin-top:0"><button class="hold" id="${P}-wind">绕到圆柱上</button></div>
            <div class="readout" id="${P}-bendinfo"></div>
            <div class="tip">每测一组：伸直记基准 → 绕上记功率 → 取下再记一次基准。损耗很小的半径可以多绕几圈。</div>
          </div>
          <div id="${P}-pane-far" class="panel" hidden>
            <label class="ctl-inline">白屏位置 L <select id="${P}-L">${DISTS.map(d=>`<option value="${d}">${d} mm</option>`).join('')}</select></label>
            <label class="ctl"><span>光斑半径游标 r</span><output id="${P}-or"></output><input type="range" id="${P}-r" min="0.5" max="7" step="0.05"></label>
            <div class="tip">把两条竖直游标线移到光强曲线与 13.5%（1/e²）横线的交点，记录 r。键盘 ← → 每次 0.05 mm。</div>
          </div>
        </div>
      </div>`});
    init(); LabStore.restore(P,s); stats.records+=s.rows.length; $('#'+P+'-review').innerHTML=paras(s.review||'');
    B=benchArea(P, Models3D.fiber, ()=>({x:s.x, y:s.y, z:s.z, wound:s.wound, wR:s.wR, wN:s.wN, view:s.view, L:s.L, dl:s.dl, th:TH,
      core:parts().core, max:PL*ETA_Q*T2*ETA_MAX, lost:s.wound?1-10**(-bendDB()/10):0, reading:fmtP(meter()), radii:RADII}), {cap3d:'三维模型（调整架位移已放大显示）'});
    B.onChange=render;
    $('#'+P+'-views').onclick=e=>{ const b=e.target.closest('button'); if (b){ s.view=b.dataset.v; render(); } };
    $('#'+P+'-axes').onclick=e=>{ const b=e.target.closest('button'); if (b){ s.axis=b.dataset.a; render(); } };
    $('#'+P+'-R').value=s.R; $('#'+P+'-N').value=s.N; $('#'+P+'-L').value=s.L; $('#'+P+'-r').value=s.r;
    $('#'+P+'-R').onchange=e=>{ s.R=+e.target.value; render(); };
    $('#'+P+'-N').onchange=e=>{ s.N=+e.target.value; render(); };
    $('#'+P+'-L').onchange=e=>{ s.L=+e.target.value; render(); };
    $('#'+P+'-r').addEventListener('input',e=>{ s.r=+e.target.value; render(); });
    $('#'+P+'-wind').onclick=wind;
    bindHold($('#'+P+'-pane-couple'), $('#'+P+'-speed'), d=>{ move(s.axis,d); render(); });
    $('#'+P+'-rec').onclick=record;
    $('#'+P+'-undo').onclick=()=>{ s.checked=false; s.review=''; $('#'+P+'-review').innerHTML=''; if (s.rows.pop()) stats.records--; table(); render(); };
    $('#'+P+'-clr').onclick=()=>{ stats.records-=s.rows.length; s.rows=[]; s.checked=false; s.review=''; $('#'+P+'-review').innerHTML=''; table(); render(); };
    $('#'+P+'-check').onclick=review;
    table();
    /* 激光功率有缓慢起伏：页面可见时每 0.6 s 刷新一次功率计 */
    clearInterval(timer);
    timer=setInterval(()=>{ const box=el; if (!document.hidden && box.offsetParent!==null && s.view!=='far'){ view(); if (B.is3d()) B.update(); } },600);
  }
  function key(dir,big){
    if (s.view==='far'){ s.r=Math.max(0.5,Math.min(7,+(s.r+dir*(big?0.5:0.05)).toFixed(2))); $('#'+P+'-r').value=s.r; }
    else if (s.view==='couple') move(s.axis,dir*(big?1:0.1));
    render();
  }

  /* ---------- 绘图 ---------- */
  function render(){
    if (!(B.is3d() && B.update())) bench();
    view();
    ['couple','bend','far'].forEach(v=>{ $('#'+P+'-pane-'+v).hidden=s.view!==v; });
    document.querySelectorAll('#'+P+'-views .tab').forEach(b=>b.classList.toggle('active',b.dataset.v===s.view));
    document.querySelectorAll('#'+P+'-axes .tab').forEach(b=>b.classList.toggle('active',b.dataset.a===s.axis));
    const um=v=>(v/1000).toFixed(4);
    $('#'+P+'-readout').innerHTML=`<div>调整架千分尺读数（mm）</div><div class="v">X ${um(s.X0*1000+s.x)}　Y ${um(s.Y0*1000+s.y)}　Z ${um(s.Z0*1000+s.z)}</div><div class="f">差分千分尺，最小分度 0.1 µm；当前调节 ${s.axis.toUpperCase()} 轴</div>`;
    $('#'+P+'-wind').textContent=s.wound?'从圆柱上取下（恢复直纤）':'绕到圆柱上';
    $('#'+P+'-R').disabled=$('#'+P+'-N').disabled=s.wound;
    $('#'+P+'-bendinfo').innerHTML=`<div>光纤状态</div><div class="v">${s.wound?`绕在 R = ${s.wR.toFixed(1)} mm 的圆柱上 ${s.wN} 圈`:'伸直'}</div><div class="f">功率计读数 ${fmtP(meter())}</div>`;
    $('#'+P+'-or').textContent=s.r.toFixed(2)+' mm';
    const bends=s.rows.filter(r=>r.t==='bend'), radii=new Set(bends.map(r=>r.R)).size, far=new Set(s.rows.filter(r=>r.t==='far').map(r=>r.L)).size;
    $('#'+P+'-rec').textContent = s.view==='far' ? '记录光斑半径' : s.wound ? '记录弯曲后功率' : (bends.length&&!afterBase() ? '复测直纤基准' : '记录直纤基准');
    renderSteps(P,[
      [s.coupled,'<b>调耦合</b>：在“耦合调节”中选 X、Y、Z 轴移动光纤端面。先用快速找到白屏中心出现亮斑的位置，再换微调，三个轴轮流调，直到功率计读数不再增大。'],
      [s.rows.some(r=>r.t==='base'),'<b>记录直纤基准</b>：光纤伸直时记录功率 P₀。'],
      [radii>=5,`<b>测弯曲损耗</b>：切到“弯曲损耗”，选半径和圈数，绕上后记录 P；取下后<b>复测一次基准</b>。至少测 5 个不同半径（已测 ${Math.min(radii,5)}/5）。`],
      [s.checked,'<b>处理数据</b>：每圈损耗 L = 10·lg(P₀/P)/N，拟合 ln(L/√R) 与 R 的直线求 c，再让 AI 助教检查。'],
      [far>=3,`<b>选做：测模场直径</b>：在“远场光斑”中换 3 个以上白屏位置，读出光斑 1/e² 半径（已记 ${Math.min(far,3)}/3）。`]]);
  }
  const afterBase=()=>{ for (let i=s.rows.length-1;i>=0;i--){ const t=s.rows[i].t; if (t==='base') return true; if (t==='bend') return false; } return true; };

  function bench(){
    const c=$('#'+P+'-bench'); const {ctx,W}=benchSetup(c);
    const y=115, F='12px "PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif';
    ctx.font=F; ctx.textAlign='center'; ctx.fillStyle='#c9c8c2';
    const span=680, sc=Math.min(1,(W-20)/span); ctx.translate((W-span*sc)/2,230*(1-sc)/2); ctx.scale(sc,sc); const x0=10;   // 窄屏时整体缩小
    ctx.fillStyle='#3b4048'; ctx.fillRect(x0,y-12,120,24); ctx.fillStyle='#c9c8c2'; ctx.fillText('He-Ne 激光器',x0+60,y+40);
    ctx.strokeStyle='rgba(255,60,40,.8)'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(x0+120,y); ctx.lineTo(x0+170,y); ctx.stroke();
    ctx.fillStyle='#9aa1aa'; ctx.beginPath(); ctx.moveTo(x0+170,y-14); ctx.lineTo(x0+190,y-6); ctx.lineTo(x0+190,y+6); ctx.lineTo(x0+170,y+14); ctx.closePath(); ctx.fill(); ctx.fillStyle='#c9c8c2'; ctx.fillText('物镜',x0+180,y+40);
    const ex=x0+212+Math.max(-14,Math.min(14,s.z*0.12)), ey=y+Math.max(-14,Math.min(14,s.x*1.2));
    ctx.strokeStyle='rgba(255,60,40,.5)'; ctx.beginPath(); ctx.moveTo(x0+190,y-5); ctx.lineTo(x0+206,y); ctx.lineTo(x0+190,y+5); ctx.stroke();
    ctx.fillStyle='#4a545e'; ctx.fillRect(ex-6,ey-20,40,40); ctx.fillStyle='#c9c8c2'; ctx.fillText('三维调整架',ex+14,y+40+14);
    const pts=[[ex,ey],[ex+70,y],[x0+330,y]];
    ctx.strokeStyle='#e8c33a'; ctx.lineWidth=2.4; ctx.beginPath(); ctx.moveTo(...pts[0]); pts.slice(1).forEach(p=>ctx.lineTo(...p));
    const mx=x0+400, my=y-34, rr=8+(s.wound?s.wR:5)*3;
    if (s.wound){ ctx.lineTo(mx-rr,my+rr*0.4); ctx.stroke(); ctx.beginPath(); ctx.arc(mx,my,rr,0,Math.PI*2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(mx+rr,my+rr*0.4); ctx.lineTo(x0+470,y); }
    else ctx.lineTo(x0+470,y);
    ctx.lineTo(x0+520,y); ctx.stroke();
    if (s.wound){ const lost=1-10**(-bendDB()/10); ctx.strokeStyle=`rgba(255,50,30,${0.15+0.7*Math.sqrt(lost)})`; ctx.lineWidth=7; ctx.beginPath(); ctx.arc(mx,my,rr,0,Math.PI*2); ctx.stroke(); }
    ctx.fillStyle='#6b7480'; ctx.beginPath(); ctx.arc(mx,my,rr-3,0,Math.PI*2); ctx.fill(); ctx.fillStyle='#c9c8c2'; ctx.fillText(s.wound?`弯曲圆柱 R = ${s.wR} mm`:'弯曲圆柱（未绕）',mx,my-rr-10);
    ctx.fillStyle='#1d1e21'; ctx.strokeStyle='#5b616a'; ctx.lineWidth=1; ctx.fillRect(x0+522,y-14,26,28); ctx.strokeRect(x0+522,y-14,26,28);
    ctx.fillStyle='#2b2f35'; ctx.fillRect(x0+560,y-30,96,50); ctx.fillStyle='#9fe7b0'; ctx.font='16px ui-monospace,Consolas,monospace'; ctx.fillText(fmtP(meter()),x0+608,y);
    ctx.font=F; ctx.fillStyle='#c9c8c2'; ctx.fillText('探头',x0+535,y+40); ctx.fillText('光功率计',x0+608,y+40); ctx.fillText('单模光纤',x0+290,y+28);
  }
  function view(){
    const c=$('#'+P+'-view'), S=eyeSize(c); c.style.width=S+'px';
    const {ctx,dpr}=setup(c,S); ctx.setTransform(dpr,0,0,dpr,0,0);
    const msg=$('#'+P+'-msg'), ctr=$('#'+P+'-counter'), F='"PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif';
    ctx.fillStyle='#0b0c0e'; ctx.fillRect(0,0,S,S);
    const p=parts(), max=PL*ETA_Q*T2*ETA_MAX;
    if (s.view!=='far'){
      /* 光功率计 */
      const h=S*0.3, rd=meter();
      ctx.fillStyle='#1c1f23'; ctx.fillRect(10,10,S-20,h); ctx.fillStyle='#0f1a14'; ctx.fillRect(22,22,S-44,h-24);
      ctx.fillStyle='#9fe7b0'; ctx.textAlign='right'; ctx.font=`300 ${Math.round(h*0.36)}px ui-monospace,Consolas,monospace`;
      const [num,unit]=fmtP(rd).split(' '); ctx.fillText(num,S-86,22+h*0.5);
      ctx.font=`${Math.round(h*0.16)}px ${F}`; ctx.textAlign='left'; ctx.fillText(unit,S-80,22+h*0.5);
      const dbm=10*Math.log10(rd/1000), k=Math.max(0,Math.min(1,(dbm+50)/50));
      ctx.fillStyle='#22352a'; ctx.fillRect(34,h-6,S-68,7); ctx.fillStyle='#5fd486'; ctx.fillRect(34,h-6,(S-68)*k,7);
      ctx.fillStyle='#6f8d79'; ctx.font=`11px ${F}`; ctx.fillText(`λ = 633 nm　${dbm.toFixed(2)} dBm`,34,h-14);
      /* 输出端白屏 */
      const cx=S/2, cy=h+20+(S-h-30)/2, R=(S-h-40)/2;
      ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.clip();
      ctx.fillStyle='#1f2023'; ctx.fillRect(0,0,S,S);
      const ic=Math.min(1,p.core/max), icl=Math.min(1,p.clad/12);
      if (icl>0.002){ const g=ctx.createRadialGradient(cx,cy,R*0.2,cx,cy,R); g.addColorStop(0,`rgba(255,60,40,${0.32*Math.sqrt(icl)})`); g.addColorStop(0.55,`rgba(255,40,30,${0.22*Math.sqrt(icl)})`); g.addColorStop(1,'rgba(255,40,30,0)'); ctx.fillStyle=g; ctx.fillRect(0,0,S,S); }
      if (ic>1e-4){ const rs=R*0.42, g=ctx.createRadialGradient(cx,cy,0,cx,cy,rs); const a=Math.pow(ic,0.35);
        g.addColorStop(0,`rgba(255,${Math.round(120+100*ic)},${Math.round(90+90*ic)},${a})`); g.addColorStop(0.35,`rgba(255,50,30,${0.85*a})`); g.addColorStop(1,'rgba(255,30,20,0)'); ctx.fillStyle=g; ctx.fillRect(0,0,S,S); }
      ctx.restore();
      ctx.strokeStyle='#3a3e45'; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.stroke();
      msg.style.top=(cy/S*100-2)+'%';
      msg.textContent = s.view==='bend' && s.wound ? '' : p.core<0.5 ? '白屏上只有很淡的大光晕，光还没进纤芯：先用快速调 X、Y' : p.ec<0.85*ETA_MAX ? '中心已出现亮斑，换成微调，X、Y、Z 轮流调到读数最大' : '';
      ctr.textContent = s.wound ? `光纤绕在 R = ${s.wR.toFixed(1)} mm 圆柱上 ${s.wN} 圈` : '光纤伸直'; ctr.hidden=false;
      $('#'+P+'-cap').textContent='光功率计与输出端白屏';
    } else {
      /* 远场：白屏上的光斑 + 水平方向的光强分布 */
      const rt=rTrue(s.L), span=8, top=S*0.46, ppm=(S-40)/(2*span), cx=S/2, cy=top/2+6, a=Math.min(1,p.core/(PL*ETA_Q*T2*ETA_MAX));
      ctx.fillStyle='#1f2023'; ctx.fillRect(14,8,S-28,top-8);
      const g=ctx.createRadialGradient(cx,cy,0,cx,cy,rt*ppm*1.3); g.addColorStop(0,`rgba(255,90,60,${a})`); g.addColorStop(0.5,`rgba(255,40,25,${0.55*a})`); g.addColorStop(1,'rgba(255,30,20,0)');
      ctx.fillStyle=g; ctx.fillRect(14,8,S-28,top-8);
      ctx.strokeStyle='rgba(200,200,200,.25)'; ctx.fillStyle='rgba(220,220,220,.6)'; ctx.font=`10px ${F}`; ctx.textAlign='center';
      for (let mm=-span;mm<=span;mm++){ const x=cx+mm*ppm; ctx.beginPath(); ctx.moveTo(x,top-(mm%5===0?12:6)); ctx.lineTo(x,top); ctx.stroke(); if (mm%5===0) ctx.fillText(String(mm),x,top-14); }
      const y0=S-20, hh=S-top-44;
      ctx.strokeStyle='#3a3e45'; ctx.beginPath(); ctx.moveTo(20,y0); ctx.lineTo(S-20,y0); ctx.stroke();
      ctx.strokeStyle='#ff5a3c'; ctx.lineWidth=1.6; ctx.beginPath();
      for (let i=0;i<=200;i++){ const xm=-span+i/200*2*span, I=Math.exp(-2*xm*xm/(rt*rt)); const X=cx+xm*ppm, Y=y0-I*hh; i?ctx.lineTo(X,Y):ctx.moveTo(X,Y); } ctx.stroke();
      ctx.setLineDash([4,4]); ctx.strokeStyle='#8a9099'; ctx.lineWidth=1; const y13=y0-Math.exp(-2)*hh; ctx.beginPath(); ctx.moveTo(20,y13); ctx.lineTo(S-20,y13); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle='#8a9099'; ctx.textAlign='left'; ctx.fillText('13.5%',22,y13-4); ctx.fillText('100%',22,y0-hh+4);
      ctx.strokeStyle='#5dd0ff'; ctx.lineWidth=1.4; for (const sg of [-1,1]){ const x=cx+sg*s.r*ppm; ctx.beginPath(); ctx.moveTo(x,y0-hh-6); ctx.lineTo(x,y0+4); ctx.stroke(); }
      for (let mm=-span;mm<=span;mm+=2){ ctx.fillStyle='#6f757d'; ctx.textAlign='center'; ctx.fillText(String(mm),cx+mm*ppm,y0+14); }
      msg.textContent = a<0.3 ? '光斑太暗：先回到“耦合调节”把光耦合进纤芯' : ''; msg.style.top='20%';
      ctr.hidden=true;
      $('#'+P+'-cap').textContent='远场光斑与光强分布（横轴：mm）';
    }
  }

  /* ---------- 数据 ---------- */
  function note(t){ $('#'+P+'-result').insertAdjacentHTML('afterbegin',`<div class="note">${esc(t)}</div>`); }
  function push(row){ s.rows.push(row); s.checked=false; s.review=''; $('#'+P+'-review').innerHTML='';
    stats.records++; logEvent('lab_record',{lab:P,n:s.rows.length,row}); table(); render(); }
  function record(){
    const reading=round4(meter());
    if (s.view==='far'){
      if (parts().core<0.3*PL*ETA_Q*T2*ETA_MAX){ table(); note('光斑太暗，先回到“耦合调节”把光耦合进纤芯。'); return; }
      return push({t:'far', L:s.L, r:+s.r.toFixed(2), off:+(s.r-rTrue(s.L)).toFixed(3)});
    }
    if (!s.coupled){ table(); note('先调好耦合：功率计读数要达到几百微瓦，白屏中心有明亮的光斑。'); return; }
    if (!s.wound) return push({t:'base', P:reading, eta:+(etaCore(s.x,s.y,s.z)/ETA_MAX).toFixed(3)});
    if (!s.rows.some(r=>r.t==='base')){ table(); note('还没有直纤基准：先取下光纤，伸直时记录 P₀。'); return; }
    const last=[...s.rows].reverse().find(r=>r.t==='bend');
    if (last && last.wid===s.wid){ table(); note('这一次绕线已经记录过了。取下光纤复测基准后，再换一个半径。'); return; }
    push({t:'bend', R:s.wR, N:s.wN, P:reading, wid:s.wid, eta:+(etaCore(s.x,s.y,s.z)/ETA_MAX).toFixed(3)});
  }
  function linfit(xs,ys){
    const n=xs.length, mx=Unc.mean(xs), my=Unc.mean(ys), sxx=xs.reduce((a,x)=>a+(x-mx)**2,0);
    const b=xs.reduce((a,x,i)=>a+(x-mx)*(ys[i]-my),0)/sxx, a=my-b*mx;
    const res=ys.reduce((q,y,i)=>q+(y-a-b*xs[i])**2,0);
    return {a,b,sxx,n,se:n>2?Math.sqrt(res/(n-2)/sxx):null};
  }
  function calc(){
    const rows=s.rows, items=[];
    rows.forEach((r,i)=>{ if (r.t!=='bend') return;
      let b=null, a=null;
      for (let j=i-1;j>=0;j--) if (rows[j].t==='base'){ b=rows[j]; break; }
      for (let j=i+1;j<rows.length;j++){ if (rows[j].t==='bend') break; if (rows[j].t==='base'){ a=rows[j]; break; } }
      const it={i, R:r.R, N:r.N, P:r.P, P0b:b?b.P:null, P0a:a?a.P:null};
      if (!b){ it.flag='nobase'; items.push(it); return; }
      it.P0=a?(b.P+a.P)/2:b.P; it.drift=a?(a.P-b.P)/b.P*100:null;
      it.dB=10*Math.log10(it.P0/r.P); it.L=it.dB/r.N;
      it.flag = it.drift!=null&&Math.abs(it.drift)>DRIFT ? 'drift' : r.P<FLOOR ? 'floor' : it.dB<0.2 ? 'small' : !a ? 'nocheck' : '';
      it.use = it.flag===''||it.flag==='nocheck';
      items.push(it); });
    const byR={}; items.filter(x=>x.use).forEach(x=>{ (byR[x.R]=byR[x.R]||[]).push(x.L); });
    const pts=Object.keys(byR).map(Number).sort((a,b)=>a-b).map(R=>({R, L:Unc.mean(byR[R])}));
    let fit=null;
    if (pts.length>=3){
      const f=linfit(pts.map(p=>p.R), pts.map(p=>Math.log(p.L/Math.sqrt(p.R))));
      const Lfit=R=>Math.exp(f.a)*Math.sqrt(R)*Math.exp(f.b*R);
      let lo=1, hi=30; for (let k=0;k<60;k++){ const m=(lo+hi)/2; if (Lfit(m)>0.1) lo=m; else hi=m; }
      fit={c:-f.b, uc:f.se, A:Math.exp(f.a), n:f.n, Rcrit:(lo+hi)/2, Lfit, err:(-f.b-C_TH)/C_TH*100};
    }
    const fr=rows.filter(r=>r.t==='far'), Ls=new Set(fr.map(r=>r.L));
    let far=null;
    if (Ls.size>=2){
      const f=linfit(fr.map(r=>r.L), fr.map(r=>r.r)), th=f.b;
      const uB=RES/Unc.SQRT3/Math.sqrt(f.sxx), u=Unc.combine(f.se,uB);
      const mfd=th>0?2*LAM/(Math.PI*th):null;
      far={n:fr.length, th, uA:f.se, uB, u, delta:th>0?f.a/th:null, mfd, umfd:mfd?mfd*u/th:null, err:mfd?(mfd-2*WF)/(2*WF)*100:null};
    }
    return {items, pts, fit, far, ref:{c:C_TH, mfd:2*WF, th:TH}};
  }
  const FLAG={nobase:'之前没有基准，无法计算', drift:'前后基准变化超过 3%，耦合变了，请重测', floor:'低于功率计下限，换大一点的半径或少绕几圈', small:'损耗太小（不到 0.2 dB），误差大，建议多绕几圈', nocheck:'取下后还没复测基准'};
  const SHORT={nobase:'前面没有基准', drift:'基准变化超过 3%，重测', floor:'低于功率计下限', small:'损耗太小，多绕几圈', nocheck:'取下后未复测基准'};
  const pct=v=>Math.abs(v)<0.05?'0.0%':`${v>0?'+':''}${v.toFixed(1)}%`;
  function table(){
    save(); renderStats();
    if (!s.rows.length){ $('#'+P+'-table').innerHTML='<div class="empty">还没有数据。先调好耦合，光纤伸直时记录基准 P₀。</div>'; $('#'+P+'-result').innerHTML=''; return; }
    const c=calc(), bases=s.rows.filter(r=>r.t==='base');
    const fP=v=>v==null?'—':String(round4(v));
    let h=`<div class="hint" style="margin-top:0">直纤基准 P₀（µW）：${bases.map(r=>fP(r.P)).join('、')||'—'}</div>`;
    if (c.items.length) h+=`<table class="data"><tr><th>R/mm</th><th>N</th><th>P₀/µW</th><th>P/µW</th><th>L/(dB/圈)</th><th>说明</th></tr>`+
      c.items.map(x=>`<tr${x.use?'':' class="bad"'}><td>${x.R.toFixed(1)}</td><td>${x.N}</td><td>${x.P0!=null?fP(x.P0):'—'}</td><td>${fP(x.P)}</td><td>${x.L!=null?x.L.toFixed(3):'—'}</td><td>${x.flag?SHORT[x.flag]:x.drift!=null?`基准变化 ${pct(x.drift)}`:''}</td></tr>`).join('')+'</table>';
    const fr=s.rows.filter(r=>r.t==='far');
    if (fr.length) h+=`<table class="data" style="margin-top:10px"><tr><th>白屏位置 L/mm</th>${fr.map(r=>`<td>${r.L}</td>`).join('')}</tr><tr><th>光斑半径 r/mm</th>${fr.map(r=>`<td>${r.r.toFixed(2)}</td>`).join('')}</tr></table>`;
    $('#'+P+'-table').innerHTML=`<div class="fbtable">${h}</div>`;
    let out='';
    if (c.fit){
      const f=Unc.format(c.fit.c,c.fit.uc||0,'mm⁻¹');
      out+=`<div class="result">拟合 ln(L/√R) = ln A − cR（${c.fit.n} 个半径）：
        <div>c = <span class="big">${c.fit.c.toFixed(3)} mm⁻¹</span>　每圈损耗降到 0.1 dB 的半径约 ${c.fit.Rcrit.toFixed(2)} mm</div>
        <div class="unc">${c.fit.uc!=null?`不确定度：取拟合斜率的标准偏差 u<sub>A</sub> = ${(+c.fit.uc.toPrecision(3))} mm⁻¹<div>结果：<b>c = ${f.text}</b>，相对不确定度 ${f.rel.toFixed(2)}%</div>`:'只有 3 个以内的点时无法估计斜率的标准偏差，建议多测几个半径。'}</div>
        ${s.checked?`<div>Marcuse 公式理论值 c = ${C_TH.toFixed(3)} mm⁻¹，相对偏差 <b>${c.fit.err>=0?'+':''}${c.fit.err.toFixed(1)}%</b></div>`:'<div class="hint">理论值在 AI 批改后显示。</div>'}
        <canvas id="${P}-chart" class="chart"></canvas></div>`;
    } else if (c.items.length) out+='<div class="hint" style="margin-top:8px">至少需要 3 个不同半径的有效数据才能拟合。</div>';
    if (c.far){
      const f=c.far, ok=f.mfd>0, fm=ok?Unc.format(f.mfd,f.umfd,'µm'):null;
      out+=`<div class="result">远场：r 对 L 拟合斜率 θ = ${(f.th*1000).toFixed(1)} mrad${f.delta!=null?`，白屏零点到端面约 ${f.delta.toFixed(1)} mm`:''}
        ${ok?`<div>模场直径 MFD = 2λ/(πθ) = <span class="big">${f.mfd.toFixed(2)} µm</span></div>
        <div class="unc">不确定度：u<sub>A</sub>(θ) = ${f.uA!=null?(+(f.uA*1000).toPrecision(3))+' mrad':'—（只有两个点）'}，u<sub>B</sub>(θ) = ${(+(f.uB*1000).toPrecision(3))} mrad，合成 u(θ) = ${(+(f.u*1000).toPrecision(3))} mrad<div>结果：<b>MFD = ${fm.text}</b>，相对不确定度 ${fm.rel.toFixed(1)}%</div></div>
        ${s.checked?`<div>理论值 MFD = ${(2*WF).toFixed(2)} µm，相对偏差 <b>${f.err>=0?'+':''}${f.err.toFixed(1)}%</b></div>`:''}`:'<div class="note">斜率不为正，检查各位置的光斑半径读数。</div>'}</div>`;
    }
    $('#'+P+'-result').innerHTML=out;
    if (c.fit) chart(c);
  }
  /* 每圈损耗随半径的变化（对数纵轴）+ 拟合曲线 */
  function chart(c){
    const cv=$('#'+P+'-chart'); if (!cv) return; if (!cv.clientWidth) return whenVisible(cv,()=>chart(c));
    const {ctx,dpr,W,H}=setup(cv,170); ctx.setTransform(dpr,0,0,dpr,0,0);
    const x0=46, x1=W-12, y0=H-28, y1=10, Rmin=3, Rmax=7.5;
    const Ls=c.pts.map(p=>p.L), lmin=Math.floor(Math.log10(Math.min(...Ls,c.fit.Lfit(Rmax))))-0, lmax=Math.ceil(Math.log10(Math.max(...Ls,c.fit.Lfit(Rmin))));
    const X=R=>x0+(R-Rmin)/(Rmax-Rmin)*(x1-x0), Y=L=>y0-(Math.log10(L)-lmin)/(lmax-lmin||1)*(y0-y1);
    ctx.font='11px "PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif'; ctx.fillStyle='#5b616a'; ctx.strokeStyle='#e4e2dc'; ctx.lineWidth=1;
    for (let e=lmin;e<=lmax;e++){ const y=Y(10**e); ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke(); ctx.textAlign='right'; ctx.fillText(e>=0?String(10**e):String(+(10**e).toPrecision(1)),x0-6,y+4); }
    ctx.textAlign='center'; for (let R=3;R<=7.5;R+=0.5){ const x=X(R); ctx.beginPath(); ctx.moveTo(x,y0); ctx.lineTo(x,y0+4); ctx.stroke(); if (R%1===0) ctx.fillText(R+' mm',x,y0+16); }
    ctx.strokeStyle='#8a8f97'; ctx.beginPath(); ctx.moveTo(x0,y1); ctx.lineTo(x0,y0); ctx.lineTo(x1,y0); ctx.stroke();
    ctx.strokeStyle='#b5442c'; ctx.lineWidth=1.5; ctx.beginPath(); for (let i=0;i<=80;i++){ const R=Rmin+i/80*(Rmax-Rmin), L=c.fit.Lfit(R); if (L<=0) continue; const y=Math.max(y1,Math.min(y0,Y(L))); i?ctx.lineTo(X(R),y):ctx.moveTo(X(R),y); } ctx.stroke();
    ctx.fillStyle='#1d1e21'; c.pts.forEach(p=>{ ctx.beginPath(); ctx.arc(X(p.R),Y(p.L),3.5,0,Math.PI*2); ctx.fill(); });
    ctx.textAlign='left'; ctx.fillStyle='#5b616a'; ctx.fillText('每圈损耗 / dB（对数坐标）',x0+6,y1+10);
  }

  /* ---------- AI 批改 ---------- */
  function offline(c){
    const f=c.fit, p=[], bad=c.items.filter(x=>!x.use), drift=c.items.filter(x=>x.flag==='drift'), noc=c.items.filter(x=>x.flag==='nocheck');
    const eta=s.rows.filter(r=>r.t==='base').map(r=>r.eta), lowEta=eta.filter(e=>e<0.9);
    if (drift.length) p.push(`R = ${drift.map(x=>x.R).join('、')} mm 这几组前后基准变化超过 3%，说明绕线时碰动了输入端，功率下降不全是弯曲造成的，已剔除，需要重新调耦合后重测`);
    if (noc.length) p.push(`R = ${noc.map(x=>x.R).join('、')} mm 取下后没有复测基准，无法确认耦合没变`);
    const small=bad.filter(x=>x.flag==='small'), floor=bad.filter(x=>x.flag==='floor');
    if (small.length) p.push(`R = ${small.map(x=>x.R).join('、')} mm 总损耗不到 0.2 dB，功率起伏的影响很大，应该多绕几圈`);
    if (floor.length) p.push(`R = ${floor.map(x=>x.R).join('、')} mm 的功率低于功率计下限`);
    if (lowEta.length) p.push(`记录基准时耦合没有调到最佳（最低只有最佳值的 ${Math.round(Math.min(...lowEta)*100)}%），这时端面处在效率曲线的斜坡上，轻轻一碰功率就变，基准容易漂`);
    if (c.pts.length<5) p.push(`只测了 ${c.pts.length} 个有效半径，拟合的点偏少`);
    const fe=c.far&&c.far.mfd?`选做部分测得模场直径 ${Unc.format(c.far.mfd,c.far.umfd,'µm').text}，理论值 ${(2*WF).toFixed(2)} µm，相对偏差 ${c.far.err.toFixed(1)}%。`:'';
    return [`【总评】拟合得到 c = ${Unc.format(f.c,f.uc||0,'mm⁻¹').text}，与 Marcuse 公式理论值 ${C_TH.toFixed(3)} mm⁻¹ 的相对偏差为 ${f.err.toFixed(1)}%，${Math.abs(f.err)<5?'结果很好':Math.abs(f.err)<12?'结果基本合格':'偏差较大'}。每圈损耗降到 0.1 dB 的半径约 ${f.Rcrit.toFixed(2)} mm，说明这种光纤弯曲半径小于这个值时损耗会迅速增大。${fe}`,
      '【数据问题】'+(p.length?p.join('；')+'。':'没有发现明显问题，每组都在前后测了基准，基准变化都在 3% 以内。'),
      '【误差来源】激光功率的缓慢起伏、绕线时碰动输入端使耦合效率改变、包层光在弯曲处被剥除（直纤基准里含有少量包层光，会让弯曲损耗略偏大）、弯曲半径应取到光纤轴线而不是圆柱表面，以及损耗很小时读数的相对误差大。',
      '【改进建议】先把耦合调到最大再测，这时效率曲线最平，轻微碰动影响最小；每组都按“基准 → 绕上 → 取下复测基准”的顺序做；小损耗的半径多绕几圈；功率下降时先取下光纤看能否恢复，能恢复的是弯曲损耗，恢复不了的是耦合变了。'].join('\n');
  }
  function review(){
    const c=calc();
    runReview(P,{
      check:()=>c.fit?'':'至少需要 3 个不同弯曲半径的有效数据（前面有基准，且前后基准变化不超过 3%）。',
      prompt:()=>`你是大学光纤光学实验课的助教，正在批改大一学生“光纤耦合与弯曲损耗”的实验数据。单模光纤：纤芯半径 1.75 µm，NA = 0.12，λ = 632.8 nm，V = ${V.toFixed(3)}，模场半径 ${WF.toFixed(2)} µm。每圈损耗 L = 10·lg(P₀/P)/N，Marcuse 公式 L ∝ √R·e^(−cR)，学生用 ln(L/√R) 对 R 作直线拟合求 c。
学生的全部记录（按时间顺序；base 为直纤基准，bend 为绕线后，eta 为系统记录的当时耦合效率与最佳值之比，学生看不到）：
${s.rows.filter(r=>r.t!=='far').map((r,i)=>r.t==='base'?`${i+1}. 基准 P₀ = ${r.P} µW（eta=${r.eta}）`:`${i+1}. 绕 R = ${r.R} mm 圆柱 ${r.N} 圈，P = ${r.P} µW（eta=${r.eta}）`).join('\n')}
计算结果：${c.items.map(x=>`R=${x.R} mm：${x.L!=null?`每圈 ${x.L.toFixed(3)} dB`:''}${x.drift!=null?`，前后基准变化 ${x.drift.toFixed(1)}%`:''}${x.flag?`，${FLAG[x.flag]}`:''}`).join('；')}。
拟合 c = ${c.fit.c.toFixed(3)} mm⁻¹${c.fit.uc!=null?`，斜率标准偏差 ${c.fit.uc.toPrecision(2)} mm⁻¹`:''}；理论值 ${C_TH.toFixed(3)} mm⁻¹，相对偏差 ${c.fit.err.toFixed(1)}%；每圈 0.1 dB 对应半径 ${c.fit.Rcrit.toFixed(2)} mm。
${c.far&&c.far.mfd?`选做远场：${s.rows.filter(r=>r.t==='far').map(r=>`L=${r.L} mm 时 r=${r.r} mm（与真实 1/e² 半径相差 ${r.off} mm）`).join('；')}；拟合 θ = ${(c.far.th*1000).toFixed(1)} mrad，MFD = ${c.far.mfd.toFixed(2)} µm，不确定度 ${c.far.umfd.toFixed(2)} µm，理论值 ${(2*WF).toFixed(2)} µm。`:'学生没有做选做的远场测量。'}
请给出批改意见：中文，250~350 字，分 4 段，每段开头依次写【总评】【数据问题】【误差来源】【改进建议】，段与段之间换行。重点检查：每组是否在绕线前后都测了基准、基准变化大的组是否说明“端面没对准”而不是弯曲造成的功率下降、耦合是否调到了最佳、损耗太小的组是否多绕了几圈。只根据给出的数据说话，语气像耐心的助教，不要使用 Markdown。`,
      offline:()=>offline(c)
    }).then(ok=>{ if (ok){ s.checked=true; s.review=ok; table(); render(); } });
  }
  return {mount, render, key};
})();
