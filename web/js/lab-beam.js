/* =====================================================================
 * lab-beam.js —— 虚拟实验：刀口法测激光光束半径、发散角、束腰与 M²（He-Ne 632.8 nm）
 * 操作：选导轨位置 z → 刀口横移扫描透过功率 → 拟合误差函数得光斑半径 w(z)
 *       → 多个位置的 w² 对 z 二次拟合，求束腰 W₀、位置 z₀、发散角、瑞利长度和 M²
 *       进阶：放入 f = 250 mm 透镜，在新束腰两侧测量
 * 物理模型：嵌入高斯光束，q 参数用 λ_eff = M²λ 传播，透镜按 1/q′ = 1/q − 1/f 变换
 * ===================================================================== */
const BM = (() => {
  const P='bm', LAM=632.8e-6, F=250, ZL=300, PL=1.2;        // 波长 (mm)、透镜焦距与位置 (mm)、激光功率 (mW)
  const INST=0.005;                                          // 刀口千分尺的仪器误差限 (mm)
  const s={}; let B=null, timer=0;
  const sgn=()=>Math.random()<.5?-1:1;

  function init(){
    Object.assign(s,{W0:rnd(0.3,0.42), z0:-rnd(150,350), M2:rnd(1.05,1.3), xc:rnd(3.4,4.4), z:300, x:1.0, lens:false, scanStep:0.05, rows:[], checked:false});
  }
  const save=()=>LabStore.save(P,s);
  /* 光束参数：返回某位置的光斑半径 w (mm)；有透镜时只对透镜之后有效 */
  function beam(lens=s.lens){
    const le=s.M2*LAM, zR=Math.PI*s.W0*s.W0/le;
    if (!lens) return {W0:s.W0, z0:s.z0, zR, le};
    const qr=ZL-s.z0, qi=zR, d=qr*qr+qi*qi, ir=qr/d-1/F, ii=-qi/d, dd=ir*ir+ii*ii, q2r=ir/dd, q2i=-ii/dd;   // 1/q′ = 1/q − 1/f
    return {W0:Math.sqrt(q2i*le/Math.PI), z0:ZL-q2r, zR:q2i, le};
  }
  const wAt=(z=s.z,lens=s.lens)=>{ const b=beam(lens); return b.W0*Math.sqrt(1+((z-b.z0)/b.zR)**2); };
  function erf(x){ const t=1/(1+0.3275911*Math.abs(x)), y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x); return x>=0?y:-y; }
  const erfc=x=>1-erf(x);
  const fluct=()=>{ const t=(typeof performance!=='undefined'?performance.now():Date.now())/1000; return 0.004*Math.sin(2*Math.PI*t/6.7)+0.002*Math.sin(2*Math.PI*t/2.1+1); };
  const power=(x=s.x)=>PL*0.5*erfc(Math.SQRT2*(x-s.xc)/wAt())*(1+fluct())+0.0004;
  const zMin=()=>s.lens?ZL+50:100;

  /* ---------- 页面 ---------- */
  function mount(el){
    el.innerHTML=labShell(P,{
      title:'激光光束半径、发散角与 M²',
      principle:`<p>He-Ne 激光的横截面光强接近高斯分布 I(r) = I₀·exp(−2r²/w²)，<b>光斑半径 w</b> 是光强降到中心 1/e²（13.5%）处的半径。光束沿传播方向按双曲线变化：<b>w(z)² = W₀²[1 + ((z − z₀)/z<sub>R</sub>)²]</b>，W₀ 是束腰半径，z₀ 是束腰位置，z<sub>R</sub> = πW₀²/(M²λ) 是瑞利长度。远场全发散角 θ = 2M²λ/(πW₀)。理想高斯光束 M² = 1，实际激光略大于 1。</p>
        <p><b>刀口法</b>：刀片垂直光束横向推进，挡住一侧，探测器测透过的功率。透过功率 P(x) = (P₀/2)·erfc[√2(x − x<sub>c</sub>)/w]，对 P–x 数据拟合误差函数就能得到 w；粗略地，透过 90% 和 10% 两点的距离约为 1.28w。</p>
        <p><b>求束腰和 M²</b>：在导轨上多个位置测出 w，把 w² 写成 z 的二次式 w² = a + bz + cz²，最小二乘拟合后 z₀ = −b/(2c)，W₀² = a − b²/(4c)，半发散角 √c，z<sub>R</sub> = W₀/√c，<b>M² = πW₀√c/λ</b>。只在激光器外面测，束腰在激光器内部，拟合要外推、不确定度大；<b>进阶</b>：在 ${ZL} mm 处放 f = ${F} mm 的透镜，新的束腰落在导轨上，在束腰两侧各测几个点，结果更可靠（这也是测 M² 的标准做法）。</p>
        <p>不确定度：每个 w 由误差函数拟合的协方差矩阵给出；W₀、M² 等由二次拟合的协方差矩阵传递。功率计读数有约 0.5% 的起伏。</p>`,
      right:`<div class="canvas-wrap fill"><canvas id="${P}-bench"></canvas><div class="caption">装置示意（导轨刻度单位 mm）</div></div>
      <div class="lab-grid">
        <div class="canvas-wrap"><canvas id="${P}-view" class="eye"></canvas><div class="caption">功率计与刀口平面</div><div class="msg" id="${P}-msg"></div><div class="counter" id="${P}-counter"></div></div>
        <div class="panel" id="${P}-panel">
          <div class="seg" id="${P}-modes"><button class="tab" data-v="0">直接测量</button><button class="tab" data-v="1">放透镜后（进阶）</button></div>
          <label class="ctl"><span>刀口架在导轨上的位置 z</span><output id="${P}-oz"></output><input type="range" id="${P}-z" min="100" max="2000" step="5"></label>
          <div class="readout" id="${P}-readout"></div>
          <canvas id="${P}-drum" class="strip"></canvas>
          ${turnControls(P,[[0.05,'微调 0.05 mm/s'],[0.3,'中速'],[1.5,'快速']],{assist:'',left:'◀ 刀口退出',rightLabel:'刀口推进 ▶'})}
          <div class="row" style="margin-top:0;flex-wrap:wrap"><label class="ctl-inline">电动扫描步长 <select id="${P}-step"><option value="0.01">0.01 mm</option><option value="0.02">0.02 mm</option><option value="0.05">0.05 mm</option><option value="0.1">0.1 mm</option><option value="0.2">0.2 mm</option></select></label>
            <button class="hold" id="${P}-scan">从当前位置自动扫描 30 步</button></div>
          <div class="tip">刀口从左侧推入光束：读数从最大降到零。按住按钮移动刀口（千分尺最小分度 0.01 mm），键盘 ← → 每次 0.01 mm（Shift 为 0.1 mm）；也可以用电动扫描自动记录。</div>
        </div>
      </div>`});
    init(); LabStore.restore(P,s); stats.records+=s.rows.length; $('#'+P+'-review').innerHTML=paras(s.review||'');
    B=benchArea(P, Models3D.beam, ()=>({z:s.z, x:s.x, xc:s.xc, w:wAt(), lens:s.lens, ZL, P:power(), PL, wf:z=>wAt(z,s.lens&&z>ZL)}), {cap3d:'三维模型（光束粗细和刀口位移已放大显示）'});
    B.onChange=render;
    $('#'+P+'-modes').onclick=e=>{ const b=e.target.closest('button'); if (!b) return; s.lens=b.dataset.v==='1'; if (s.z<zMin()) s.z=zMin(); $('#'+P+'-z').value=s.z; render(); };
    $('#'+P+'-z').value=s.z; $('#'+P+'-z').addEventListener('input',e=>{ s.z=Math.max(zMin(),+e.target.value); e.target.value=s.z; render(); });
    $('#'+P+'-step').value=String(s.scanStep); $('#'+P+'-step').onchange=e=>{ s.scanStep=+e.target.value; save(); };
    $('#'+P+'-scan').onclick=scan;
    bindHold($('#'+P+'-panel'), $('#'+P+'-speed'), d=>{ move(d); render(); });
    bindDrag($('#'+P+'-drum'), 6, d=>{ move(d/100); render(); });
    $('#'+P+'-rec').onclick=()=>record();
    $('#'+P+'-undo').onclick=()=>{ s.checked=false; s.review=''; $('#'+P+'-review').innerHTML=''; if (s.rows.pop()) stats.records--; table(); render(); };
    $('#'+P+'-clr').onclick=()=>{ stats.records-=s.rows.length; s.rows=[]; s.checked=false; s.review=''; $('#'+P+'-review').innerHTML=''; table(); render(); };
    $('#'+P+'-check').onclick=review;
    table();
    clearInterval(timer); timer=setInterval(()=>{ if (!document.hidden && el.offsetParent!==null){ view(); if (B.is3d()) B.update(); } },600);
  }
  function move(d){ s.x=Math.max(0,Math.min(8,s.x+d)); }
  function key(dir,big){ move(dir*(big?0.1:0.01)); s.x=+s.x.toFixed(3); render(); }

  /* ---------- 绘图 ---------- */
  function render(){
    if (!(B.is3d() && B.update())) bench();
    view();
    document.querySelectorAll('#'+P+'-modes .tab').forEach(b=>b.classList.toggle('active',(b.dataset.v==='1')===s.lens));
    $('#'+P+'-z').min=zMin(); $('#'+P+'-oz').textContent=s.z+' mm';
    $('#'+P+'-readout').innerHTML=`<div>刀口千分尺读数</div><div class="v">${s.x.toFixed(3)} mm</div><div class="f">功率计 ${power().toFixed(4)} mW　导轨位置 z = ${s.z} mm${s.lens?`　透镜在 ${ZL} mm（f = ${F} mm）`:''}</div>`;
    drawStrip($('#'+P+'-drum'), s.x*100, {px:6, label:k=>(k/100).toFixed(1)});
    const g=groups(), done=m=>g.filter(x=>x.lens===m&&x.fit).length;
    renderSteps(P,[
      [done(false)>=1,'<b>刀口扫描</b>：选一个导轨位置 z，刀口从光束外（读数最大）慢慢推进到全部挡住（读数为零），沿途记录 10 个以上的点，透过率 90%～10% 之间要多记几个。'],
      [done(false)>=5,`<b>改变位置</b>：在导轨上分散地选 5 个以上的位置（近处、远处都要有），每个位置都扫描一次（已完成 ${Math.min(done(false),5)}/5）。`],
      [done(true)>=5,`<b>进阶：透镜后的束腰</b>：切到“放透镜后”，先粗略找到光斑最小的位置，在它两侧各选几个位置扫描，至少 5 个（已完成 ${Math.min(done(true),5)}/5）。`],
      [s.checked,'<b>处理数据</b>：拟合每个位置的光斑半径，再对 w² 与 z 作二次拟合求束腰、发散角和 M²，然后让 AI 助教检查。']]);
  }
  function bench(){
    const c=$('#'+P+'-bench'); const {ctx,W}=benchSetup(c);
    const span=700, sc=Math.min(1,(W-20)/span); ctx.translate((W-span*sc)/2,230*(1-sc)/2); ctx.scale(sc,sc);
    const y=110, X=z=>130+z/2000*540, F12='12px "PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif';
    ctx.font=F12; ctx.textAlign='center';
    ctx.fillStyle='#2b2f35'; ctx.fillRect(120,y+30,560,8); ctx.fillStyle='#6f757d';
    for (let z=0;z<=2000;z+=250){ ctx.fillRect(X(z),y+38,1,6); ctx.fillText(String(z),X(z),y+56); }
    ctx.fillStyle='#3b4048'; ctx.fillRect(10,y-12,110,24); ctx.fillStyle='#c9c8c2'; ctx.fillText('He-Ne 激光器',65,y+48);
    const k=60;                                                  // 光束半径放大显示
    ctx.fillStyle='rgba(255,60,40,.28)'; ctx.beginPath(); ctx.moveTo(120,y-wAt(0,false)*k*0.1);
    const zs=[...Array(81)].map((_,i)=>i*25);
    zs.forEach(z=>ctx.lineTo(X(z),y-wAt(z,s.lens&&z>ZL)*k*0.1)); zs.slice().reverse().forEach(z=>ctx.lineTo(X(z),y+wAt(z,s.lens&&z>ZL)*k*0.1)); ctx.lineTo(120,y+wAt(0,false)*k*0.1); ctx.fill();
    if (s.lens){ ctx.strokeStyle='#a9bbd6'; ctx.lineWidth=3; ctx.beginPath(); ctx.ellipse(X(ZL),y,4,26,0,0,Math.PI*2); ctx.stroke(); ctx.fillStyle='#c9c8c2'; ctx.fillText(`透镜 f = ${F} mm`,X(ZL),y-34); }
    ctx.fillStyle='#d9b86a'; ctx.fillRect(X(s.z)-2,y-30,4,22+Math.max(-20,Math.min(20,(s.x-s.xc)*6))); ctx.fillStyle='#c9c8c2'; ctx.fillText('刀口',X(s.z),y-36);
    ctx.fillStyle='#1d1e21'; ctx.fillRect(X(s.z)+8,y-10,14,20); ctx.fillText('探测器',X(s.z)+30,y+24);
    ctx.textAlign='left'; ctx.fillStyle='#8a9099'; ctx.fillText('光束宽度放大约 6 倍显示',130,22);
  }
  function view(){
    const c=$('#'+P+'-view'), S=eyeSize(c); c.style.width=S+'px';
    const {ctx,dpr}=setup(c,S); ctx.setTransform(dpr,0,0,dpr,0,0);
    const Fn='"PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif', rd=power(), w=wAt();
    ctx.fillStyle='#0b0c0e'; ctx.fillRect(0,0,S,S);
    const h=S*0.22;
    ctx.fillStyle='#1c1f23'; ctx.fillRect(10,10,S-20,h); ctx.fillStyle='#0f1a14'; ctx.fillRect(22,22,S-44,h-24);
    ctx.fillStyle='#9fe7b0'; ctx.textAlign='right'; ctx.font=`300 ${Math.round(h*0.42)}px ui-monospace,Consolas,monospace`; ctx.fillText(rd.toFixed(4),S-86,22+h*0.56);
    ctx.font=`${Math.round(h*0.17)}px ${Fn}`; ctx.textAlign='left'; ctx.fillText('mW',S-80,22+h*0.56);
    /* 刀口平面：高斯光斑 + 刀片 */
    const top=h+22, hh=S*0.34, cx=S/2, cy=top+hh/2, ppm=Math.min(70,(S-40)/(2*Math.max(1.2,w*2.2)));
    ctx.fillStyle='#16171a'; ctx.fillRect(14,top,S-28,hh);
    const g=ctx.createRadialGradient(cx,cy,0,cx,cy,w*ppm*1.6); g.addColorStop(0,'rgba(255,120,90,1)'); g.addColorStop(0.45,'rgba(255,50,30,.5)'); g.addColorStop(0.62,'rgba(255,40,30,.14)'); g.addColorStop(1,'rgba(255,30,20,0)');
    ctx.fillStyle=g; ctx.fillRect(14,top,S-28,hh);
    const kx=cx+(s.x-s.xc)*ppm; ctx.fillStyle='rgba(185,190,198,.92)'; ctx.fillRect(14,top,Math.max(0,kx-14),hh);
    ctx.strokeStyle='#e8e7e2'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(kx,top); ctx.lineTo(kx,top+hh); ctx.stroke();
    ctx.fillStyle='#8a9099'; ctx.font=`10px ${Fn}`; ctx.fillText('刀片',18,top+12);
    /* 当前位置已记录的 P–x */
    const pts=s.rows.filter(r=>r.lens===s.lens&&r.z===s.z), x0=40, x1=S-14, y0=S-24, y1=top+hh+26;
    const xs=pts.map(r=>r.x).concat([s.x]), xmin=Math.min(...xs)-0.1, xmax=Math.max(...xs,xmin+0.5)+0.1, X=v=>x0+(v-xmin)/(xmax-xmin)*(x1-x0), Y=v=>y0-v/PL*(y0-y1);
    ctx.strokeStyle='#2a2d33'; ctx.beginPath(); ctx.moveTo(x0,y1); ctx.lineTo(x0,y0); ctx.lineTo(x1,y0); ctx.stroke();
    ctx.fillStyle='#ffd166'; pts.forEach(r=>{ ctx.beginPath(); ctx.arc(X(r.x),Y(r.P),2.6,0,Math.PI*2); ctx.fill(); });
    ctx.fillStyle='#ff5a3c'; ctx.beginPath(); ctx.arc(X(s.x),Y(rd),3.6,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#8a9099'; ctx.fillText(`z = ${s.z} mm 已记录 ${pts.length} 点（横轴：刀口位置 ${xmin.toFixed(2)}～${xmax.toFixed(2)} mm）`,x0+2,y1-6);
    $('#'+P+'-msg').textContent=''; $('#'+P+'-counter').hidden=true;
  }

  /* ---------- 数据 ---------- */
  function push(row){ s.rows.push(row); stats.records++; }
  function record(silent){
    const row={lens:s.lens, z:s.z, x:+(s.x+Math.round(rnd(-0.6,0.6))*0.001).toFixed(3), P:+power().toFixed(4)};
    push(row); if (silent) return;
    s.checked=false; s.review=''; $('#'+P+'-review').innerHTML=''; logEvent('lab_record',{lab:P,n:s.rows.length,row}); table(); render();
  }
  /* 电动平移台：按步长推进 30 步，每步记录一次 */
  function scan(){
    for (let i=0;i<30&&s.x<8;i++){ record(true); move(s.scanStep); s.x=+s.x.toFixed(3); }
    s.checked=false; s.review=''; $('#'+P+'-review').innerHTML=''; logEvent('lab_record',{lab:P,n:s.rows.length,scan:true}); table(); render();
  }
  function solve(M,b){ const n=b.length, A=M.map((r,i)=>[...r,b[i]]);
    for (let i=0;i<n;i++){ let p=i; for (let k=i+1;k<n;k++) if (Math.abs(A[k][i])>Math.abs(A[p][i])) p=k; [A[i],A[p]]=[A[p],A[i]];
      if (Math.abs(A[i][i])<1e-300) return null;
      for (let k=0;k<n;k++) if (k!==i){ const f=A[k][i]/A[i][i]; for (let j=i;j<=n;j++) A[k][j]-=f*A[i][j]; } }
    return A.map((r,i)=>r[n]/r[i]); }
  const inv=M=>{ const n=M.length, cols=[]; for (let j=0;j<n;j++){ const c=solve(M,[...Array(n)].map((_,i)=>+(i===j))); if (!c) return null; cols.push(c); } return M.map((_,i)=>cols.map(c=>c[i])); };
  /* 误差函数拟合：P = (Pm/2)·erfc[√2(x − xc)/w]，Levenberg–Marquardt */
  function erfFit(pts){
    const xs=pts.map(p=>p.x), ys=pts.map(p=>p.P), Pm0=Math.max(...ys);
    if (pts.length<6 || Pm0<=0) return null;
    const srt=pts.slice().sort((a,b)=>a.x-b.x), at=fr=>{ for (let i=1;i<srt.length;i++){ const a=srt[i-1], b=srt[i]; if ((a.P-fr*Pm0)*(b.P-fr*Pm0)<=0 && a.P!==b.P) return a.x+(fr*Pm0-a.P)*(b.x-a.x)/(b.P-a.P); } return null; };
    const x90=at(0.9), x10=at(0.1), x50=at(0.5);
    const inMid=ys.filter(v=>v>0.12*Pm0&&v<0.88*Pm0).length;
    if (x90==null||x10==null||x50==null||inMid<3) return {bad:true, inMid, w1090:x90!=null&&x10!=null?(x10-x90)/1.2816:null};
    let p=[Pm0,x50,Math.max(0.01,(x10-x90)/1.2816)], lam=1e-3;
    const model=(q,x)=>{ const u=Math.SQRT2*(x-q[1])/q[2], e=Math.exp(-u*u)/Math.sqrt(Math.PI); return [q[0]/2*erfc(u), [0.5*erfc(u), q[0]*e*Math.SQRT2/q[2], q[0]*e*u/q[2]]]; };
    const sse=q=>xs.reduce((a,x,i)=>a+(ys[i]-model(q,x)[0])**2,0);
    let cur=sse(p);
    for (let it=0;it<60;it++){
      const J=xs.map(x=>model(p,x)[1]), r=xs.map((x,i)=>ys[i]-model(p,x)[0]);
      const A=[0,1,2].map(i=>[0,1,2].map(j=>J.reduce((a,row)=>a+row[i]*row[j],0)+(i===j?lam*J.reduce((a,row)=>a+row[i]*row[i],0):0)));
      const g=[0,1,2].map(i=>J.reduce((a,row,k)=>a+row[i]*r[k],0)), d=solve(A,g); if (!d) break;
      const np=p.map((v,i)=>v+d[i]); if (np[2]<=0){ lam*=10; continue; }
      const ns=sse(np); if (ns<cur){ p=np; lam=Math.max(1e-9,lam/5); if (cur-ns<1e-14) { cur=ns; break; } cur=ns; } else lam*=8;
    }
    const J=xs.map(x=>model(p,x)[1]), JTJ=[0,1,2].map(i=>[0,1,2].map(j=>J.reduce((a,row)=>a+row[i]*row[j],0))), Ci=inv(JTJ), s2=cur/Math.max(1,xs.length-3);
    const uA=Ci?Math.sqrt(Math.max(0,Ci[2][2]*s2)):null, uB=Math.SQRT2*INST/Unc.SQRT3/1.2816;   // B 类：两次位置读数之差
    return {Pm:p[0], xc:p[1], w:p[2], uA, uB, u:Unc.combine(uA,uB), w1090:(x10-x90)/1.2816, inMid, rms:Math.sqrt(cur/xs.length)};
  }
  function groups(){
    const m=new Map();
    s.rows.forEach(r=>{ const k=(r.lens?'L':'D')+r.z; if (!m.has(k)) m.set(k,{lens:!!r.lens, z:r.z, pts:[]}); m.get(k).pts.push(r); });
    return [...m.values()].sort((a,b)=>(a.lens-b.lens)||(a.z-b.z)).map(g=>{ const f=erfFit(g.pts); return {...g, n:g.pts.length, fit:f&&!f.bad?f:null, bad:f&&f.bad?f:null, wTrue:wAt(g.z,g.lens)}; });
  }
  /* w² = a + b·z + c·z²：求 z₀、W₀、发散角、瑞利长度和 M²，并用协方差矩阵传递不确定度 */
  function hyper(gs, lens){
    const ok=gs.filter(g=>g.lens===lens&&g.fit); if (ok.length<4) return null;
    const zs=ok.map(g=>g.z), ys=ok.map(g=>g.fit.w**2), X=zs.map(z=>[1,z,z*z]);
    const M=[0,1,2].map(i=>[0,1,2].map(j=>X.reduce((a,x)=>a+x[i]*x[j],0))), bv=[0,1,2].map(i=>X.reduce((a,x,k)=>a+x[i]*ys[k],0));
    const p=solve(M,bv); if (!p) return null; const [a,b,c]=p;
    if (!(c>0) || !(a-b*b/(4*c)>0)) return {n:ok.length, invalid:true};
    const res=ys.reduce((q,y,k)=>q+(y-(a+b*zs[k]+c*zs[k]**2))**2,0), Ci=inv(M), s2=ok.length>3?res/(ok.length-3):0;
    const f=q=>{ const [A,Bb,C]=q, W0=Math.sqrt(A-Bb*Bb/(4*C)), th=Math.sqrt(C); return {z0:-Bb/(2*C), W0, th, zR:W0/th, M2:Math.PI*W0*th/LAM}; };
    const v=f(p), u={};
    for (const key of ['z0','W0','th','zR','M2']){ const g=[0,1,2].map(i=>{ const h=Math.abs(p[i])*1e-6+1e-12, q=p.slice(); q[i]+=h; return (f(q)[key]-v[key])/h; });
      u[key]=Ci?Math.sqrt(Math.max(0,g.reduce((acc,gi,i)=>acc+g.reduce((a2,gj,j)=>a2+gi*Ci[i][j]*gj,0),0)*s2)):null; }
    const near=ok.reduce((p2,g)=>g.z<p2.z?g:p2), far=ok.reduce((p2,g)=>g.z>p2.z?g:p2);
    const two=far.z>near.z?2*(far.fit.w-near.fit.w)/(far.z-near.z):null;
    const t=beam(lens);
    return {n:ok.length, ...v, u, two, truth:{W0:t.W0, z0:t.z0, zR:t.zR, M2:s.M2, th:t.W0/t.zR}, side:lens?{lo:ok.filter(g=>g.z<v.z0).length, hi:ok.filter(g=>g.z>v.z0).length}:null};
  }
  function calc(){ const gs=groups(); return {gs, D:hyper(gs,false), L:hyper(gs,true)}; }

  function table(){
    save(); renderStats();
    if (!s.rows.length){ $('#'+P+'-table').innerHTML='<div class="empty">还没有数据。选好导轨位置后，把刀口从光束外慢慢推进，沿途记录功率（或用电动扫描）。</div>'; $('#'+P+'-result').innerHTML=''; return; }
    const c=calc();
    $('#'+P+'-table').innerHTML=`<div class="fbtable"><table class="data"><tr><th></th><th>z / mm</th><th>点数</th><th>w（拟合）/ mm</th><th>w（90%–10%）/ mm</th><th>说明</th></tr>`+
      c.gs.map(g=>`<tr${g.fit?'':' class="warn"'}><td>${g.lens?'透镜':'直接'}</td><td>${g.z}</td><td>${g.n}</td><td>${g.fit?Unc.format(g.fit.w,g.fit.u,'').text:'—'}</td><td>${g.fit?g.fit.w1090.toFixed(3):g.bad&&g.bad.w1090!=null?g.bad.w1090.toFixed(3):'—'}</td><td style="text-align:left">${g.fit?(s.checked?`真实 ${g.wTrue.toFixed(3)}`:''):g.n<6?'点太少（至少 6 个）':g.bad?`透过率 12%～88% 之间只有 ${g.bad.inMid} 个点，或没扫到全挡/全透`:'拟合失败'}</td></tr>`).join('')+'</table></div>';
    const part=(h,lens)=>{
      if (!h) return `<div class="hint" style="margin-top:6px">${lens?'透镜后':'直接测量'}：至少需要 4 个位置的光斑半径才能做二次拟合。</div>`;
      if (h.invalid) return `<div class="note">${lens?'透镜后':'直接测量'}：二次拟合得不到合理的束腰（开口向下或 W₀² < 0），说明位置太集中或某个点测错了，多换几个位置。</div>`;
      const fm=(v,uu,unit,k=1)=>uu!=null&&uu>0?Unc.format(v*k,uu*k,unit).text:`${(v*k).toPrecision(4)} ${unit}`;
      return `<div class="result">${lens?'透镜后（进阶）':'直接测量'}：w² 对 z 二次拟合（${h.n} 个位置）
        <div>束腰半径 W₀ = <b>${fm(h.W0,h.u.W0,'mm')}</b>，束腰位置 z₀ = ${fm(h.z0,h.u.z0,'mm')}${!lens&&h.z0<0?'（在激光器内部，靠外推得到）':''}</div>
        <div>全发散角 θ = 2√c = <b>${fm(2*h.th,h.u.th!=null?2*h.u.th:null,'mrad',1000)}</b>${h.two!=null&&!lens?`；只用最近、最远两点估算 ${(h.two*1000).toFixed(3)} mrad（没到远场，两点法偏小）`:''}</div>
        <div>瑞利长度 z<sub>R</sub> = ${fm(h.zR,h.u.zR,'mm')}，<span class="big">M² = ${fm(h.M2,h.u.M2,'')}</span></div>
        ${lens&&h.side&&(h.side.lo<2||h.side.hi<2)?'<div class="note">束腰两侧的测量点不够均衡（每侧至少 2 个），拟合会偏。</div>':''}
        ${s.checked?`<div>真实值：W₀ = ${h.truth.W0.toFixed(3)} mm，z₀ = ${h.truth.z0.toFixed(0)} mm，全发散角 ${(2*h.truth.th*1000).toFixed(3)} mrad，M² = ${h.truth.M2.toFixed(3)}</div>`:'<div class="hint">真实参数在 AI 批改后显示。</div>'}
        <canvas class="chart" id="${P}-ch-${lens?1:0}"></canvas></div>`;
    };
    $('#'+P+'-result').innerHTML=part(c.D,false)+(c.gs.some(g=>g.lens)?part(c.L,true):'');
    [c.D,c.L].forEach((h,i)=>{ if (h&&!h.invalid) chart(c.gs.filter(g=>g.lens===!!i&&g.fit),h,$('#'+P+'-ch-'+i)); });
  }
  function chart(gs,h,cv){
    if (!cv) return; if (!cv.clientWidth) return whenVisible(cv,()=>chart(gs,h,cv));
    const {ctx,dpr,W,H}=setup(cv,170); ctx.setTransform(dpr,0,0,dpr,0,0);
    const zs=gs.map(g=>g.z), zmin=Math.min(...zs,h.z0)-50, zmax=Math.max(...zs)+50, wmax=Math.max(...gs.map(g=>g.fit.w))*1.15;
    const x0=44, x1=W-12, y0=H-26, y1=12, X=z=>x0+(z-zmin)/(zmax-zmin)*(x1-x0), Y=w=>y0-w/wmax*(y0-y1);
    ctx.font='11px "PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif'; ctx.strokeStyle='#8a8f97'; ctx.fillStyle='#5b616a'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(x0,y1); ctx.lineTo(x0,y0); ctx.lineTo(x1,y0); ctx.stroke();
    ctx.textAlign='right'; for (let k=0;k<=4;k++){ const w=wmax*k/4; ctx.fillText(w.toFixed(2),x0-4,Y(w)+4); }
    ctx.textAlign='center'; for (let k=0;k<=4;k++){ const z=zmin+(zmax-zmin)*k/4; ctx.fillText(z.toFixed(0),X(z),y0+15); }
    ctx.strokeStyle='#b5442c'; ctx.lineWidth=1.4; ctx.beginPath();
    for (let i=0;i<=120;i++){ const z=zmin+(zmax-zmin)*i/120, w=h.W0*Math.sqrt(1+((z-h.z0)/h.zR)**2); i?ctx.lineTo(X(z),Y(Math.min(w,wmax))):ctx.moveTo(X(z),Y(Math.min(w,wmax))); } ctx.stroke();
    ctx.fillStyle='#1d1e21'; gs.forEach(g=>{ ctx.beginPath(); ctx.arc(X(g.z),Y(g.fit.w),3,0,Math.PI*2); ctx.fill(); });
    ctx.textAlign='left'; ctx.fillText('w / mm　横轴：z / mm（曲线为拟合的双曲线）',x0+6,y1+10);
  }

  /* ---------- AI 批改 ---------- */
  function offline(c){
    const p=[], bad=c.gs.filter(g=>!g.fit);
    if (bad.length) p.push(`${bad.map(g=>`${g.lens?'透镜后':''}z=${g.z}`).join('、')} mm 的扫描没法拟合（点太少或没覆盖透过率 10%～90%）`);
    if (c.D && !c.D.invalid){ const zs=c.gs.filter(g=>!g.lens&&g.fit).map(g=>g.z); if (Math.max(...zs)-Math.min(...zs)<800) p.push('直接测量的位置太集中，应该分散到整条导轨'); }
    if (c.L && !c.L.invalid && c.L.side && (c.L.side.lo<2||c.L.side.hi<2)) p.push('透镜后的测量点没有分布在束腰两侧');
    if (!c.L) p.push('还没做进阶的透镜部分，直接测量时束腰在激光器内部，W₀ 和 M² 都靠外推，不确定度大');
    const t=(h,name)=>h&&!h.invalid?`${name}：W₀ = ${h.W0.toFixed(3)} mm（真实 ${h.truth.W0.toFixed(3)}），全发散角 ${(2*h.th*1000).toFixed(3)} mrad（真实 ${(2*h.truth.th*1000).toFixed(3)}），M² = ${h.M2.toFixed(2)}（真实 ${h.truth.M2.toFixed(2)}）。`:'';
    return [`【总评】${t(c.D,'直接测量')}${t(c.L,'透镜后')}`,
      '【数据问题】'+(p.length?p.join('；')+'。':'没有发现明显问题。'),
      '【误差来源】功率计读数起伏、刀口位置读数误差、扫描点在陡峭段太少、导轨位置读数误差；直接测量时束腰在激光器内部，二次拟合要外推，W₀、z₀ 和 M² 对每个 w 的误差都很敏感；两点法求发散角时没有到远场会偏小。',
      '【改进建议】每次扫描都从全透到全挡，在透过率 10%～90% 之间多记点；测量位置分散到整条导轨；求 M² 时用透镜把束腰移到导轨上，在束腰两侧各测 3 个以上的位置，并且离束腰一个瑞利长度以外也要有点。'].join('\n');
  }
  function review(){
    const c=calc();
    runReview(P,{
      check:()=>(c.D&&!c.D.invalid)||(c.L&&!c.L.invalid)?'':'至少需要在 4 个位置得到可拟合的刀口扫描，二次拟合才能给出束腰和 M²。',
      prompt:()=>`你是大学激光原理实验课的助教，正在批改大一学生“刀口法测激光光束半径、发散角与 M²”的实验数据。He-Ne 激光 λ = 632.8 nm；进阶部分在 ${ZL} mm 处放 f = ${F} mm 透镜。
各位置的刀口扫描结果（拟合的光斑半径；真实值学生看不到）：${c.gs.map(g=>`${g.lens?'透镜后':'直接'} z=${g.z} mm：${g.n} 点，${g.fit?`w=${g.fit.w.toFixed(4)}±${(g.fit.u||0).toFixed(4)} mm（90/10 法 ${g.fit.w1090.toFixed(4)}），透过率 12%～88% 之间 ${g.fit.inMid} 点，真实 ${g.wTrue.toFixed(4)}`:'无法拟合'}`).join('；')}。
${[['直接测量',c.D],['透镜后',c.L]].map(([n,h])=>h&&!h.invalid?`${n}二次拟合：W₀=${h.W0.toFixed(4)} mm，z₀=${h.z0.toFixed(0)} mm，全发散角 ${(2*h.th*1000).toFixed(3)} mrad，zR=${h.zR.toFixed(0)} mm，M²=${h.M2.toFixed(3)}${h.u.M2!=null?`（u=${h.u.M2.toFixed(3)}）`:''}；两点法发散角 ${h.two!=null?(h.two*1000).toFixed(3):'—'} mrad。真实：W₀=${h.truth.W0.toFixed(4)} mm，z₀=${h.truth.z0.toFixed(0)} mm，全发散角 ${(2*h.truth.th*1000).toFixed(3)} mrad，M²=${h.truth.M2.toFixed(3)}。`:`${n}：没有有效的二次拟合。`).join('\n')}
请给出批改意见：中文，250~350 字，分 4 段，每段开头依次写【总评】【数据问题】【误差来源】【改进建议】，段与段之间换行。说明直接测量与透镜后两种方法得到的 W₀、M² 哪个更可信及原因（束腰位置、是否外推、是否覆盖束腰两侧），检查扫描点是否覆盖陡峭段。只根据给出的数据说话，语气像耐心的助教，不要使用 Markdown。`,
      offline:()=>offline(c)
    }).then(ok=>{ if (ok){ s.checked=true; s.review=ok; table(); render(); } });
  }
  return {mount, render, key};
})();
