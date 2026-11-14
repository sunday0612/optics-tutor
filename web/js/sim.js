/* =====================================================================
 * sim.js —— “现象仿真”：五个波动光学现象的数值仿真 + AI 讲解与小测
 * ===================================================================== */

/* ---------------- 实验定义 ---------------- */
const LAMBDA = {label:'波长 λ', unit:'nm', min:380, max:780, step:1, val:550};
const EXP = {
  double: {name:'杨氏双缝', xr:10, params:{
    lambda: LAMBDA,
    d: {label:'双缝间距 d', unit:'mm', min:0.05, max:2, step:0.01, val:0.25},
    a: {label:'单缝宽度 a', unit:'mm', min:0.01, max:0.2, step:0.005, val:0.04},
    L: {label:'缝屏距离 L', unit:'m', min:0.2, max:3, step:0.05, val:1}}},
  single: {name:'单缝衍射', xr:20, params:{
    lambda: LAMBDA,
    a: {label:'缝宽 a', unit:'mm', min:0.02, max:0.5, step:0.005, val:0.1},
    L: {label:'缝屏距离 L', unit:'m', min:0.2, max:3, step:0.05, val:1}}},
  grating: {name:'光栅衍射', xr:20, params:{
    lambda: LAMBDA,
    N: {label:'缝数 N', unit:'条', min:2, max:20, step:1, val:5},
    d: {label:'光栅常数 d', unit:'mm', min:0.02, max:0.5, step:0.005, val:0.1},
    a: {label:'单缝宽度 a', unit:'mm', min:0.005, max:0.1, step:0.001, val:0.025},
    L: {label:'缝屏距离 L', unit:'m', min:0.2, max:3, step:0.05, val:1}}},
  newton: {name:'牛顿环', rr:3, params:{
    lambda: LAMBDA,
    R: {label:'透镜曲率半径 R', unit:'m', min:1, max:10, step:0.1, val:2}}},
  malus: {name:'马吕斯定律', params:{
    theta: {label:'两偏振片夹角 θ', unit:'°', min:0, max:180, step:1, val:30},
    I0: {label:'入射偏振光强 I₀', unit:'', min:0.1, max:1, step:0.05, val:1}}}
};

const state = {exp:'double', p:{}};
for (const [k,e] of Object.entries(EXP)) { state.p[k] = {}; for (const [pk,d] of Object.entries(e.params)) state.p[k][pk] = d.val; }
const cur = () => state.p[state.exp];

/* ---------------- 物理计算 ---------------- */
const sinc = u => Math.abs(u) < 1e-9 ? 1 : Math.sin(u)/u;
function intensity(exp, p, x){ // x: 屏上位置 (m)；牛顿环为半径 r (m)
  const lam = p.lambda*1e-9;
  if (exp==='double'){
    const L=p.L, beta=Math.PI*p.d*1e-3*x/(lam*L), alpha=Math.PI*p.a*1e-3*x/(lam*L);
    return Math.cos(beta)**2 * sinc(alpha)**2;
  }
  if (exp==='single'){
    const alpha=Math.PI*p.a*1e-3*x/(lam*p.L); return sinc(alpha)**2;
  }
  if (exp==='grating'){
    const L=p.L, beta=Math.PI*p.d*1e-3*x/(lam*L), alpha=Math.PI*p.a*1e-3*x/(lam*L);
    const sb=Math.sin(beta); const m = Math.abs(sb)<1e-9 ? 1 : Math.sin(p.N*beta)/(p.N*sb);
    return sinc(alpha)**2 * m*m;
  }
  if (exp==='newton'){
    return Math.sin(Math.PI*x*x/(lam*p.R))**2; // 反射光，中心暗斑
  }
  return 0;
}
function metrics(exp, p){
  const lam=p.lambda*1e-9, out=[];
  if (exp==='double'){
    const dx=lam*p.L/(p.d*1e-3)*1e3, env=2*lam*p.L/(p.a*1e-3)*1e3, r=p.d/p.a;
    const isInt=Math.abs(r-Math.round(r))<0.03;
    const n=isInt?2*Math.round(r)-1:2*Math.floor(r)+1;
    out.push(['条纹间距 Δx = λL/d', dx, 'mm', 'key']);
    out.push(['衍射包络中央宽度 2λL/a', env, 'mm']);
    out.push(['中央包络内明纹数' + (isInt?`（±${Math.round(r)} 级缺级）`:''), n, '条']);
  } else if (exp==='single'){
    out.push(['中央明纹宽度 2λL/a', 2*lam*p.L/(p.a*1e-3)*1e3, 'mm', 'key']);
    out.push(['其他明纹宽度 λL/a', lam*p.L/(p.a*1e-3)*1e3, 'mm']);
  } else if (exp==='grating'){
    out.push(['主极大间距 λL/d', lam*p.L/(p.d*1e-3)*1e3, 'mm', 'key']);
    out.push(['相邻主极大间暗纹', p.N-1, '条']);
    out.push(['相邻主极大间次极大', Math.max(p.N-2,0), '个']);
  } else if (exp==='newton'){
    const r=k=>Math.sqrt(k*p.R*lam)*1e3;
    out.push(['第 1 级暗环半径 √(Rλ)', r(1), 'mm', 'key']);
    out.push(['第 5 级暗环半径', r(5), 'mm']);
    out.push(['第 10 级暗环半径', r(10), 'mm']);
  } else if (exp==='malus'){
    const t=Math.cos(p.theta*Math.PI/180)**2;
    out.push(['透射光强 I = I₀cos²θ', p.I0*t, '', 'key']);
    out.push(['透过比例 cos²θ', t*100, '%']);
  }
  return out;
}
const fmtParam = (d,v) => d.step>=1 ? String(Math.round(v)) : String(+v.toFixed(Math.max(0, -Math.floor(Math.log10(d.step)))));


/* ---------------- 绘图 ---------------- */
function renderPattern(){
  const c=$('#pattern'), exp=state.exp, p=cur();
  const {ctx,dpr,W,H}=setup(c, c.parentElement.clientHeight);
  const cw=c.width, ch=c.height;
  if (exp==='malus'){ drawMalus(ctx,dpr,W,H,p); return; }
  const img=ctx.createImageData(cw,ch), col=wl2rgb(p.lambda);
  if (exp==='newton'){
    const mmpp=2*EXP.newton.rr/ch;
    for (let j=0;j<ch;j++){ const y=(j-ch/2)*mmpp;
      for (let i=0;i<cw;i++){ const x=(i-cw/2)*mmpp, r=Math.sqrt(x*x+y*y)*1e-3;
        const o=(j*cw+i)*4;
        if (r*1e3>EXP.newton.rr){ img.data[o]=12; img.data[o+1]=13; img.data[o+2]=15; img.data[o+3]=255; continue; }
        const v=0.03+0.97*intensity('newton',p,r);
        img.data[o]=col[0]*255*v; img.data[o+1]=col[1]*255*v; img.data[o+2]=col[2]*255*v; img.data[o+3]=255; } }
    ctx.putImageData(img,0,0); ctx.setTransform(dpr,0,0,dpr,0,0);
    // 比例尺 1 mm
    const px=H/(2*EXP.newton.rr);
    ctx.strokeStyle='#fff'; ctx.fillStyle='#fff'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(14,H-16); ctx.lineTo(14+px,H-16); ctx.stroke();
    ctx.font='12px "PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif'; ctx.fillText('1 mm',14,H-22);
    $('#cap1').textContent='牛顿环（反射光，俯视）';
    return;
  }
  const xr=EXP[exp].xr, row=new Uint8ClampedArray(cw*4);
  for (let i=0;i<cw;i++){ const x=(i/(cw-1)*2-1)*xr*1e-3; const v=Math.pow(intensity(exp,p,x),0.5);
    row[i*4]=col[0]*255*v; row[i*4+1]=col[1]*255*v; row[i*4+2]=col[2]*255*v; row[i*4+3]=255; }
  for (let j=0;j<ch;j++) img.data.set(row,j*cw*4);
  ctx.putImageData(img,0,0); ctx.setTransform(dpr,0,0,dpr,0,0);
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'rgba(15,16,18,.75)'); g.addColorStop(.18,'rgba(15,16,18,0)'); g.addColorStop(.82,'rgba(15,16,18,0)'); g.addColorStop(1,'rgba(15,16,18,.85)');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  const step = xr>=20?5:2; ctx.strokeStyle='rgba(255,255,255,.7)'; ctx.fillStyle='rgba(255,255,255,.75)'; ctx.font='11px "PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif'; ctx.textAlign='center';
  for (let m=-xr;m<=xr;m+=step){ const X=(m+xr)/(2*xr)*W; ctx.beginPath(); ctx.moveTo(X,H); ctx.lineTo(X,H-(m===0?10:6)); ctx.stroke(); if (m>-xr&&m<xr) ctx.fillText(m+'', X, H-13); }
  $('#cap1').textContent=`${EXP[exp].name}：屏上图样（刻度单位 mm）`;
}
function drawMalus(ctx,dpr,W,H,p){
  ctx.setTransform(dpr,0,0,dpr,0,0); ctx.fillStyle='#0f1012'; ctx.fillRect(0,0,W,H);
  const y=H/2, x1=W*0.3, x2=W*0.58, xs=W-70, R=Math.min(62,H*0.32), t=p.theta*Math.PI/180, I=p.I0*Math.cos(t)**2;
  const beam=(a,b,al)=>{ ctx.strokeStyle=`rgba(255,240,200,${al})`; ctx.lineWidth=6; ctx.beginPath(); ctx.moveTo(a,y); ctx.lineTo(b,y); ctx.stroke(); };
  beam(30,x1,0.9); beam(x1,x2,0.25+0.6*p.I0); beam(x2,xs-34,0.08+0.85*I);
  const pol=(x,ang,label)=>{
    ctx.fillStyle='rgba(180,170,230,.08)'; ctx.strokeStyle='#b3a9dc'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(x,y,R,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.translate(x,y); ctx.rotate(ang); ctx.strokeStyle='rgba(210,205,235,.3)'; ctx.lineWidth=1;
    for (let k=-R+8;k<R;k+=8){ const h=Math.sqrt(R*R-k*k)-3; ctx.beginPath(); ctx.moveTo(k,-h); ctx.lineTo(k,h); ctx.stroke(); }
    ctx.strokeStyle='#fff'; ctx.lineWidth=2.5; ctx.beginPath(); ctx.moveTo(0,-R-10); ctx.lineTo(0,R+10); ctx.stroke(); ctx.restore();
    ctx.fillStyle='#c9c8c2'; ctx.font='13px "PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif'; ctx.textAlign='center'; ctx.fillText(label,x,y+R+30);
  };
  pol(x1,0,'起偏器 P₁'); pol(x2,t,'检偏器 P₂');
  ctx.strokeStyle='#d9b86a'; ctx.lineWidth=1.5; ctx.setLineDash([4,4]); ctx.beginPath(); ctx.arc(x2,y,R*0.55,-Math.PI/2,-Math.PI/2+t,false); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle='#d9b86a'; ctx.font='13px "PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif'; ctx.fillText(`θ = ${Math.round(p.theta)}°`, x2, y-R-18);
  const gr=ctx.createRadialGradient(xs,y,2,xs,y,34); gr.addColorStop(0,`rgba(255,246,220,${0.05+0.95*I})`); gr.addColorStop(1,'rgba(255,246,220,0)');
  ctx.fillStyle=gr; ctx.beginPath(); ctx.arc(xs,y,34,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='#3b4048'; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(xs,y,34,0,Math.PI*2); ctx.stroke();
  ctx.fillStyle='#c9c8c2'; ctx.fillText('屏',xs,y+R+30); ctx.fillText('自然光',50,y-14);
  $('#cap1').textContent='马吕斯定律：装置示意';
}
function renderCurve(){
  const c=$('#curve'), exp=state.exp, p=cur(); const {ctx,dpr,W,H}=setup(c,c.parentElement.clientHeight);
  ctx.setTransform(dpr,0,0,dpr,0,0); ctx.fillStyle='#0f1012'; ctx.fillRect(0,0,W,H);
  const L=46,Rp=14,T=30,B=30, pw=W-L-Rp, ph=H-T-B;
  let x0,x1,step,xt,f;
  if (exp==='malus'){ x0=0;x1=180;step=30;xt='夹角 θ (°)'; f=x=>p.I0*Math.cos(x*Math.PI/180)**2; }
  else if (exp==='newton'){ x0=0;x1=EXP.newton.rr;step=1;xt='半径 r (mm)'; f=x=>intensity(exp,p,x*1e-3); }
  else { const xr=EXP[exp].xr; x0=-xr;x1=xr;step=xr>=20?5:2;xt='屏上位置 x (mm)'; f=x=>intensity(exp,p,x*1e-3); }
  const X=v=>L+(v-x0)/(x1-x0)*pw, Y=v=>T+(1-v)*ph;
  ctx.strokeStyle='#24272c'; ctx.lineWidth=1; ctx.fillStyle='#868a90'; ctx.font='11px "PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif';
  ctx.textAlign='right'; for (const v of [0,0.5,1]){ ctx.beginPath(); ctx.moveTo(L,Y(v)); ctx.lineTo(W-Rp,Y(v)); ctx.stroke(); ctx.fillText(v+'',L-6,Y(v)+4); }
  ctx.textAlign='center'; for (let v=x0; v<=x1+1e-9; v+=step){ ctx.fillText(+v.toFixed(2)+'',X(v),H-B+15); }
  ctx.fillText(xt, L+pw/2, H-4);
  const col = exp==='malus' ? [1,0.93,0.75] : wl2rgb(p.lambda);
  const n=Math.max(400,Math.round(pw*3)), pts=[];
  for (let i=0;i<=n;i++){ const x=x0+(x1-x0)*i/n; pts.push([X(x),Y(Math.min(f(x),1))]); }
  ctx.beginPath(); ctx.moveTo(pts[0][0],Y(0)); for (const q of pts) ctx.lineTo(q[0],q[1]); ctx.lineTo(pts[pts.length-1][0],Y(0)); ctx.closePath();
  ctx.fillStyle=cssColor(col,0.2).replace('rgb','rgba').replace(')',',0.18)'); ctx.fill();
  ctx.beginPath(); pts.forEach((q,i)=>i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1])); ctx.strokeStyle=cssColor(col,0.3); ctx.lineWidth=1.6; ctx.stroke();
  if (exp==='malus'){ const v=f(p.theta); ctx.fillStyle='#d9b86a'; ctx.beginPath(); ctx.arc(X(p.theta),Y(v),5,0,Math.PI*2); ctx.fill(); }
  $('#cap2').textContent = exp==='malus' ? '透射光强 I(θ)' : '相对光强 I / I_max';
}
function renderMetrics(){
  $('#metrics').innerHTML = metrics(state.exp,cur()).map(([k,v,u])=>`<div class="metric"><div class="k">${esc(k)}</div><div class="v">${fmt(v)}<small>${esc(u)}</small></div></div>`).join('');
}
function render(){ if ($('#view-sim').hidden) return; renderPattern(); renderCurve(); renderMetrics(); }

/* ---------------- 控件 ---------------- */
function buildTabs(){
  $('#tabs').innerHTML = Object.entries(EXP).map(([k,e])=>`<button class="tab${k===state.exp?' active':''}" data-k="${k}">${e.name}</button>`).join('');
}
$('#tabs').addEventListener('click', e=>{ const b=e.target.closest('.tab'); if(!b) return; state.exp=b.dataset.k; buildTabs(); buildControls(); render(); });
function buildControls(){
  const e=EXP[state.exp], p=cur();
  $('#controls').innerHTML = Object.entries(e.params).map(([k,d])=>`
    <label class="ctl"><span>${d.label}</span><output id="o-${k}">${fmtParam(d,p[k])}<small>${d.unit}</small></output>
    <input type="range" data-k="${k}" min="${d.min}" max="${d.max}" step="${d.step}" value="${p[k]}"></label>`).join('');
}
$('#controls').addEventListener('input', e=>{
  const k=e.target.dataset.k; if(!k) return; const d=EXP[state.exp].params[k];
  cur()[k]=parseFloat(e.target.value); $('#o-'+k).innerHTML=`${fmtParam(d,cur()[k])}<small>${d.unit}</small>`; render();
});
$('#controls').addEventListener('change', e=>{ stats.adjust++; renderStats(); logEvent('adjust',{exp:state.exp,param:e.target.dataset.k}); });

/* ---------------- 讲解与小测 ---------------- */
const PRINCIPLE = {
  double:'杨氏双缝：两条缝发出的相干光在屏上叠加，光程差 δ = d·x/L 为波长整数倍处出现明纹。相邻明纹间距 Δx = λL/d，所以波长越长、屏越远、缝间距越小，条纹越稀疏。条纹亮度还受单缝衍射包络调制，当 d/a 为整数时会出现缺级。',
  single:'单缝衍射：按半波带法，a·sinθ = ±kλ 处为暗纹。中央明纹宽度为 2λL/a，是其他明纹宽度的两倍。缝越窄，衍射越明显，中央明纹反而越宽。',
  grating:'光栅衍射：多缝干涉决定主极大位置 d·sinθ = kλ，单缝衍射决定各级亮度的包络。缝数 N 越多，主极大越细、越亮，相邻主极大之间有 N−1 条暗纹、N−2 个次极大。',
  newton:'牛顿环：平凸透镜与平板玻璃之间形成空气薄膜，厚度 e = r²/2R。反射光的光程差为 2e + λ/2（含半波损失），所以中心 e = 0 处是暗斑。第 k 级暗环半径 r = √(kRλ)，越往外环越密。',
  malus:'马吕斯定律：线偏振光通过检偏器后，光强 I = I₀cos²θ，θ 是两偏振片透振方向的夹角。θ = 0° 时全部透过，θ = 90° 时完全消光。'
};
const QUIZ = {
  double:{question:'杨氏双缝实验中，只把波长从 600 nm 换成 400 nm，屏上条纹间距会怎样？',options:['变为原来的 2/3','变为原来的 3/2','不变','条纹消失'],answer:0,why:'Δx = λL/d 与波长成正比，400/600 = 2/3。'},
  single:{question:'单缝衍射中，缝宽 a 减小为原来的一半，中央明纹宽度变为原来的？',options:['2 倍','1/2','不变','4 倍'],answer:0,why:'中央明纹宽度 2λL/a 与缝宽成反比。'},
  grating:{question:'N 缝光栅中，相邻两个主极大之间有几条暗纹？',options:['N − 1 条','N − 2 条','N 条','N + 1 条'],answer:0,why:'相邻主极大之间有 N−1 条暗纹，暗纹之间夹着 N−2 个次极大。'},
  newton:{question:'用反射光观察牛顿环，中心处是？',options:['暗斑','亮斑','明暗交替闪烁','取决于波长'],answer:0,why:'中心空气膜厚度为 0，但反射时有半波损失，光程差为 λ/2，所以是暗斑。'},
  malus:{question:'两偏振片透振方向夹角为 60°，透射光强是入射偏振光强的？',options:['1/4','1/2','3/4','√3/2'],answer:0,why:'I = I₀cos²60° = I₀ × (1/2)² = I₀/4。'}
};
function showExplain(q, before, res, note){
  const after=state.p[state.exp], prev=before.all[state.exp], diffs=[];
  if (before.exp!==state.exp) diffs.push(`切换到：${EXP[state.exp].name}`);
  for (const [k,d] of Object.entries(EXP[state.exp].params)) if (Math.abs(prev[k]-after[k])>1e-12)
    diffs.push(`${d.label.split(' ')[0]}：${fmtParam(d,prev[k])} → ${fmtParam(d,after[k])} ${d.unit}`);
  const paras=String(res.explanation||'').replace(/\*\*/g,'').split(/\n+/).filter(Boolean).map(s=>`<p>${esc(s)}</p>`).join('');
  $('#explain').innerHTML = `<div class="qline">${esc(q)}</div>` + (diffs.length?`<div class="diffs">${diffs.map(s=>`<span class="diff">${esc(s)}</span>`).join('')}</div>`:'') + paras + (note?`<div class="note">${esc(note)}</div>`:'');
}
function showQuiz(qz){
  if (!qz || !Array.isArray(qz.options) || qz.options.length<2 || !(qz.answer>=0 && qz.answer<qz.options.length)) qz=QUIZ[state.exp];
  const box=$('#quiz');
  box.innerHTML = `<div>${esc(qz.question)}</div>` + qz.options.map((o,i)=>`<button class="opt" data-i="${i}">${'ABCD'[i]||i+1}. ${esc(o)}</button>`).join('') + '<div id="why"></div>';
  box.querySelectorAll('.opt').forEach(b=>b.addEventListener('click',()=>{
    const i=+b.dataset.i, ok=i===qz.answer; stats.quiz++; if(ok) stats.right++; logEvent('quiz',{exp:state.exp,correct:ok});
    box.querySelectorAll('.opt').forEach((x,j)=>{ x.disabled=true; if(j===qz.answer) x.classList.add('ok'); else if(j===i) x.classList.add('bad'); });
    $('#why').innerHTML=`<div class="why"><b style="color:${ok?'var(--ok)':'var(--bad)'}">${ok?'答对了！':'再想想。'}</b>${esc(qz.why||'')}</div>`;
    renderStats();
  }));
}


/* ---------------- AI 讲解 ---------------- */
function buildPrompt(q){
  const defs = Object.entries(EXP).map(([k,e])=>`- ${k}（${e.name}）：`+Object.entries(e.params).map(([pk,d])=>`${pk} = ${d.label}，单位 ${d.unit||'相对值'}，范围 ${d.min}~${d.max}`).join('；')).join('\n');
  return `你是“光影助教”，面向大一学生的大学物理波动光学 AI 助教。网页会根据你给出的实验和参数自动画出屏上图样和光强曲线，你负责选实验、设参数、讲解和出题。

可选实验与参数：
${defs}

当前实验：${state.exp}（${EXP[state.exp].name}），当前参数：${JSON.stringify(cur())}

学生的问题：${q}

要求：
1. 选出最适合回答这个问题的实验；params 只写需要改动的参数，数值使用上面规定的单位并落在范围内。学生说“换成/变为/增大一倍”等，要换算成具体数值。
2. explanation：中文，150~300 字，2~3 段，用换行分段。先直接回答问题，再结合改动前后的具体数值（例如 Δx 从多少变到多少）说明图上能看到的变化，最后点出背后的公式或原理。不要使用 Markdown 标记。
3. quiz：围绕这次的知识点出一道四选一的单选题，answer 是正确选项的下标（0~3），why 用一句话解释。
4. 如果问题和波动光学无关，experiment 保持当前，params 为空，explanation 礼貌说明本助教专注干涉、衍射、偏振，并举一个可以问的例子。

只输出一个 JSON 对象，不要输出任何其他文字：
{"experiment":"double|single|grating|newton|malus","params":{},"explanation":"","quiz":{"question":"","options":["","","",""],"answer":0,"why":""}}`;
}
function applyResult(res){
  const exp = EXP[res.experiment] ? res.experiment : state.exp; state.exp=exp;
  const ps=res.params||{};
  for (const [k,d] of Object.entries(EXP[exp].params)) if (ps[k]!=null && isFinite(+ps[k])) {
    let v=Math.min(d.max,Math.max(d.min,+ps[k])); if (d.step>=1) v=Math.round(v); state.p[exp][k]=v;
  }
  buildTabs(); buildControls(); render();
}


/* ---------------- 离线兜底（没有 AI 时按关键词回答） ---------------- */
const COLOR_WORDS=[[/紫光/,405],[/蓝光/,450],[/青光/,490],[/绿光/,532],[/黄光/,580],[/橙光/,600],[/红光/,650]];
function offlineAnswer(q){
  let exp=state.exp;
  if (/双缝|杨氏/.test(q)) exp='double'; else if (/单缝/.test(q)) exp='single'; else if (/光栅/.test(q)) exp='grating';
  else if (/牛顿环/.test(q)) exp='newton'; else if (/偏振|马吕斯|检偏|起偏/.test(q)) exp='malus';
  const base={...state.p[exp]}, ps={};
  const has=k=>k in EXP[exp].params;
  let m;
  const reNm=/(\d+(?:\.\d+)?)\s*(nm|纳米)/gi; while((m=reNm.exec(q))) if(has('lambda')) ps.lambda=+m[1];
  for (const [re,w] of COLOR_WORDS) if (re.test(q) && has('lambda') && ps.lambda==null) ps.lambda=w;
  const reMm=/(\d+(?:\.\d+)?)\s*(mm|毫米)/gi;
  while((m=reMm.exec(q))){ const ctx=q.slice(Math.max(0,m.index-8),m.index), v=+m[1];
    if (/宽/.test(ctx) && has('a')) ps.a=v; else if (/间距|缝距|常数|距/.test(ctx) && has('d')) ps.d=v; else if (has('d') && exp!=='single') ps.d=v; else if (has('a')) ps.a=v; }
  const reM=/(\d+(?:\.\d+)?)\s*(m|米)(?![a-z])/gi; // 不会匹配 mm、nm、毫米、纳米、厘米
  while((m=reM.exec(q))){ if (has('R')) ps.R=+m[1]; else if (has('L')) ps.L=+m[1]; }
  const reDeg=/(\d+(?:\.\d+)?)\s*(°|度)/g; while((m=reDeg.exec(q))) if(has('theta')) ps.theta=+m[1];
  if (has('N')){ const n=q.match(/(?:到|为|N\s*=\s*)\s*(\d+)(?![\d.]*\s*(?:mm|nm|cm|m|°|度|毫|纳|厘|米))/)||q.match(/(\d+)\s*条/); if(n) ps.N=+n[1]; }
  if (has('a') && ps.a==null){ if (/变窄|缝宽(减小|变小)/.test(q)) ps.a=base.a/2; else if (/变宽|缝宽(增大|变大)/.test(q)) ps.a=base.a*2; }
  if (has('d') && ps.d==null){ if (/(间距|d)(减小|变小|减半)/.test(q)) ps.d=base.d/2; else if (/(间距|d)(增大|变大|加倍|翻倍)/.test(q)) ps.d=base.d*2; }
  // 计算改动前后关键量
  const after={...base}; for (const [k,d] of Object.entries(EXP[exp].params)) if (ps[k]!=null) after[k]=Math.min(d.max,Math.max(d.min,ps[k]));
  const m0=metrics(exp,base), m1=metrics(exp,after);
  const changed=m1.map((x,i)=>[m0[i],x]).filter(([a,b])=>Math.abs(a[1]-b[1])>1e-9);
  let line;
  if (changed.length) line='按你给的条件：'+changed.map(([a,b])=>`${b[0]} 从 ${fmt(a[1])} ${a[2]} 变为 ${fmt(b[1])} ${b[2]}（${b[1]>a[1]?'变大':'变小'}）`).join('；')+'。右边的图样已经同步更新。';
  else line=`当前参数下，${m1[0][0]} = ${fmt(m1[0][1])} ${m1[0][2]}。可以拖动右下方的滑块，观察图样怎样变化。`;
  return {experiment:exp, params:ps, explanation:PRINCIPLE[exp]+'\n'+line, quiz:QUIZ[exp]};
}

async function onAsk(){
  const q=$('#q').value.trim(); if(!q) return;
  stats.ask++; renderStats();
  const btn=$('#ask'); btn.disabled=true; btn.textContent='AI 思考中…';
  $('#explain').innerHTML=`<div class="qline">${esc(q)}</div>`+loadingHTML('正在选实验、设参数、写讲解…');
  const before={exp:state.exp, all:JSON.parse(JSON.stringify(state.p))};
  await AI.ready;
  let res=null, note='';
  if (AI.online()){ try { res=await aiJSON(buildPrompt(q)); if (!res || typeof res!=='object') throw new Error('AI 返回格式不对'); } catch(e){ res=null; note=aiErrorNote(e); } }
  else note='离线演示模式：讲解来自内置模板，只能识别常见的数值和关键词。';
  const by = res ? AI.label() : '';
  if (!res) res=offlineAnswer(q);
  applyResult(res); showExplain(q,before,res,note); showQuiz(res.quiz);
  if (by) $('#explain').insertAdjacentHTML('beforeend',`<div class="hint">由 ${esc(by)} 生成</div>`);
  logEvent('ask',{q, exp:state.exp, ai:!!by});
  btn.disabled=false; btn.textContent='生成图样并讲解';
}
$('#ask').addEventListener('click', onAsk);
$('#q').addEventListener('keydown', e=>{ if(e.key==='Enter' && !e.shiftKey && !e.isComposing){ e.preventDefault(); onAsk(); } });

const EXAMPLES=['双缝间距 0.2mm，波长换成 450nm，条纹会怎么变？','单缝变窄，中央明纹为什么反而变宽？','光栅缝数从 5 增加到 15 会怎样？','牛顿环中心为什么是暗的？','两个偏振片夹角 60° 时还剩多少光？'];
$('#chips').innerHTML = '<span class="hint">也可以试试这些问题：</span>' + EXAMPLES.map(s=>`<button class="chip">${esc(s)}</button>`).join('');
$('#chips').addEventListener('click', e=>{ const b=e.target.closest('.chip'); if(!b) return; $('#q').value=b.textContent; onAsk(); });


