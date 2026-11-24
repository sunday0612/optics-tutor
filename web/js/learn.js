/* =====================================================================
 * learn.js —— 让学生自己动脑的四个环节（所有实验共用）
 *   1. 我先算：结果区先隐藏，学生自己算平均值、u_A、u_B、u 和规范结果，程序逐项核对
 *   2. 教学设置：A 类是否乘 t 因子、是否给扩展不确定度、不确定度保留几位、只进不舍还是四舍五入、
 *      “我先算”可跳过 / 必须先算 / 不使用（存在本机数据目录）
 *   3. 先预测再观察：每个虚拟实验开始记录前先做一道预测题，动手观察后再看解释
 *   4. 探究任务：用自己的数据发现并量化实验里藏着的系统误差
 * 学习过程存在各实验存档的 _learn 里（LabStore.extra），会写进实验报告。
 * ===================================================================== */
const Learn = (() => {
  const DEF={calc:'try', tA:'none', k:1, sig:'auto', round:'up'};
  let prefs={...DEF};
  const OPTS={calc:['try','must','show'], tA:['none','t68'], k:[1,2], sig:['auto','1','2'], round:['up','half']};
  function setPrefs(p){
    prefs={...DEF};
    for (const k in OPTS) if (p && OPTS[k].includes(k==='k'?+p[k]:p[k])) prefs[k]=k==='k'?+p[k]:p[k];
    Unc.config({tA:prefs.tA, k:prefs.k, sig:prefs.sig, round:prefs.round});
  }
  const ready=AI.ready.then(async()=>{ if (!AI.backend) return; try { const r=await fetch('api/prefs',{cache:'no-store'}); if (r.ok) setPrefs(await r.json()); } catch(e){} });
  async function savePrefs(p){
    const r=await fetch('api/prefs',{method:'POST',headers:apiHeaders(),body:JSON.stringify(p)});
    const j=await r.json().catch(()=>({})); if (!r.ok) throw Error(j.error||'保存失败'); setPrefs(j.prefs||p); return prefs;
  }
  const ex=P=>LabStore.extra[P]||(LabStore.extra[P]={});
  const persist=P=>{ const s=LabStore.live[P]; if (s) LabStore.save(P,s); };
  const numOf=v=>{ const t=String(v??'').trim().replace(/[−–]/g,'-').replace(/，/g,'.'); return t===''||!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)?null:+t; };
  const decOf=t=>{ const m=String(t).trim().match(/\.(\d+)$/); return m?m[1].length:0; };
  const sigOf=t=>{ const d=String(t).trim().replace(/^[-+]/,'').replace('.','').replace(/^0+/,''); return d.length; };

  /* ================= 1. 我先算 ================= */
  /* 从结果区找出每个要报告的物理量：Unc.html 输出的块带有完整的 data-q；其余只解析“结果：符号 = (x ± u) 单位” */
  function quantities(P){
    const res=document.getElementById(P+'-result'); if (!res) return [];
    const out=[], seen=new Set();
    res.querySelectorAll('.unc').forEach(block=>{
      const fin=block.querySelector('.final'), b=fin?.querySelector('b'); if (!b) return;
      const m=b.textContent.replace(/\s+/g,' ').trim().match(/^(.*?)\s*=\s*\(\s*([-−]?[\d.]+)\s*±\s*([\d.]+)\s*\)\s*(.*)$/); if (!m) return;
      let label=[...fin.childNodes].filter(n=>n!==b&&n.nodeType===3).map(n=>n.textContent).join('').split('：')[0].replace('结果','').trim();
      if (!label){ const r=block.closest('.result'); const t=(r?.firstChild?.textContent||'').trim(); label=t.split(/[：:]/)[0].slice(0,16); }
      let q=null; try { q=block.dataset.q?JSON.parse(decodeURIComponent(block.dataset.q)):null; } catch(e){}
      const sym=m[1].trim(), id=(label||'结果')+'｜'+sym; if (seen.has(id)) return; seen.add(id);
      out.push({id, label:label||'结果', sym, astr:m[2].replace('−','-'), ustr:m[3], unit:m[4].trim(), full:q&&q.mean!=null?q:null, sig:m[2]+'±'+m[3]});
    });
    return out;
  }
  const RULE=()=>`不确定度保留 ${prefs.sig==='auto'?'1 位有效数字（首位是 1 或 2 时保留 2 位）':prefs.sig+' 位有效数字'}，${prefs.round==='up'?'只进不舍':'四舍五入'}；测量值的末位与不确定度的末位对齐`;
  function check(q, inp){
    const r={}, hint={};
    if (q.full){
      const f=q.full, rel=(v,t)=>t!=null&&v!=null&&Math.abs(v-t)<=Math.abs(t)*0.06+1e-15;
      const m=numOf(inp.mean); r.mean=m!=null&&Math.abs(m-f.mean)<=Math.max(Math.abs(f.mean)*2e-4,(f.u||0)*0.15);
      hint.mean='平均值：把各次（或逐差得到的各组）结果加起来除以个数';
      if (f.uA!=null){ r.uA=rel(numOf(inp.uA),f.uA); hint.uA=`u_A = √[Σ(xᵢ − x̄)² / (n(n − 1))]${prefs.tA==='t68'?'，再乘 t 因子 t₀.₆₈₃（查表，按 n − 1 自由度）':''}`; }
      r.uB=rel(numOf(inp.uB),f.uB); hint.uB='u_B：仪器误差限 Δ仪 / √3，再按公式传递到结果（两次读数相减要乘 √2）';
      r.u=rel(numOf(inp.u),f.u); hint.u='合成：u = √(u_A² + u_B²)'+(prefs.k===2?'（这里填 u，不是扩展不确定度 U）':'');
    }
    const a=String(inp.a??'').trim(), b=String(inp.b??'').trim(), A=numOf(a), Bv=numOf(b), Bt=numOf(q.ustr), At=numOf(q.astr);
    if (Bv==null||A==null){ r.final=false; hint.final=`按规范写出结果：${q.sym} = (测量值 ± ${prefs.k===2?'U':'u'})`; }
    else if (Math.abs(Bv-Bt)>1e-12){ r.final=false;
      hint.final = sigOf(b)!==sigOf(q.ustr) ? `${prefs.k===2?'扩展不确定度 U = 2u，':''}${RULE()}` : prefs.round==='up'&&q.full&&Bv<q.full.u*prefs.k ? '不确定度只进不舍：截掉的部分不为零时，保留的末位要加 1' : `${prefs.k===2?'U = 2u；':''}不确定度的数值不对，先检查 u 再按规则取位`; }
    else if (decOf(a)!==decOf(b)){ r.final=false; hint.final='测量值的末位要与不确定度的末位对齐（小数位数相同）'; }
    else { r.final=Math.abs(A-At)<=1.01*10**-decOf(b)+1e-12; hint.final='测量值不对：先算准平均值，再按不确定度的末位取位'; }
    return {r, hint, pass:Object.values(r).every(Boolean)};
  }
  function scState(P){ const e=ex(P); return e.sc||(e.sc={q:{}, skip:''}); }
  function visible(P, list){
    const sc=scState(P), all=list.map(q=>q.id+'='+q.sig).join(';');
    return prefs.calc==='show' || !list.length || list.every(q=>sc.q[q.id]?.pass===q.sig) || (prefs.calc==='try' && sc.skip===all);
  }
  function renderSelf(P){
    const box=document.getElementById(P+'-self'); if (!box) return;
    const list=quantities(P), sc=scState(P), show=visible(P,list), card=box.closest('.data-card');
    card?.classList.toggle('sc-hidden', !show);
    if (prefs.calc==='show' || !list.length){ box.innerHTML=''; return; }
    const done=list.filter(q=>sc.q[q.id]?.pass===q.sig).length, U=prefs.k===2;
    const field=(q,k,label,ok)=>`<label class="scf${ok===true?' ok':ok===false?' bad':''}"><span>${label}</span><input data-q="${esc(q.id)}" data-k="${k}" value="${esc(sc.q[q.id]?.in?.[k]??'')}" inputmode="decimal"></label>`;
    box.innerHTML=`<div class="sc-head"><b>我先算</b>　${done===list.length?'全部算对了 ✓':`用你的数据自己算出下面的结果，再和程序核对（已算对 ${done}/${list.length}）`}</div>
      ${list.map(q=>{ const st=sc.q[q.id], passed=st?.pass===q.sig, last=st?.sig===q.sig?st.last:null, h=st?.sig===q.sig?st.hint:null;
        return `<div class="sc-q${passed?' passed':''}"><div class="sc-t">${esc(q.label)}：${esc(q.sym)}${q.unit?`（${esc(q.unit)}）`:''}${passed?`<span class="sc-ok">✓ 第 ${st.tries} 次算对</span>`:st?.tries&&st.sig===q.sig?`<span class="sc-n">已核对 ${st.tries} 次</span>`:''}</div>
          ${passed?'':`<div class="sc-fields">${q.full?field(q,'mean','平均值',last?.mean)+(q.full.uA!=null?field(q,'uA','u<sub>A</sub>',last?.uA):'')+field(q,'uB','u<sub>B</sub>',last?.uB)+field(q,'u','u',last?.u):''}
            <label class="scf wide${last?.final===true?' ok':last?.final===false?' bad':''}"><span>结果 ${esc(q.sym)} =</span>( <input data-q="${esc(q.id)}" data-k="a" value="${esc(st?.in?.a??'')}" inputmode="decimal"> ± <input data-q="${esc(q.id)}" data-k="b" value="${esc(st?.in?.b??'')}" inputmode="decimal"> )${U?'，k = 2':''}</label></div>
            ${h?`<ul class="sc-hint">${Object.entries(h).filter(([k])=>last&&last[k]===false).map(([,t])=>`<li>${esc(t)}</li>`).join('')}</ul>`:''}
            <div class="row" style="margin-top:6px"><button class="ghost mini" data-sc-check="${esc(q.id)}">核对</button></div>`}</div>`; }).join('')}
      ${show?'':`<div class="sc-foot">${prefs.calc==='must'?'老师设置为必须先自己算：全部算对后才显示程序的结果，才能让 AI 检查、导出报告。':'<button class="ghost mini" data-sc-skip>跳过，直接看程序结果</button><span class="hint">程序的结果暂时隐藏，算完核对后显示。</span>'}</div>`}
      <div class="hint sc-rule">${esc(RULE())}${prefs.tA==='t68'?'；u_A 乘 t₀.₆₈₃ 因子':''}${U?'；结果写扩展不确定度 U = 2u':''}。</div>`;
  }
  function onSelfClick(e){
    const box=e.target.closest('.selfcalc'); if (!box) return; const P=box.id.slice(0,-5);
    if (e.target.closest('[data-sc-skip]')){ const sc=scState(P); sc.skip=quantities(P).map(q=>q.id+'='+q.sig).join(';'); persist(P); renderSelf(P); logEvent('selfcalc_skip',{lab:P}); document.dispatchEvent(new CustomEvent('learnchange',{detail:P})); return; }
    const b=e.target.closest('[data-sc-check]'); if (!b) return;
    const q=quantities(P).find(x=>x.id===b.dataset.scCheck); if (!q) return;
    const sc=scState(P), st=sc.q[q.id]&&sc.q[q.id].sig===q.sig?sc.q[q.id]:(sc.q[q.id]={sig:q.sig, tries:0, in:sc.q[q.id]?.in||{}});
    box.querySelectorAll(`input[data-q="${CSS.escape(q.id)}"]`).forEach(i=>{ st.in[i.dataset.k]=i.value; });
    const c=check(q, st.in); st.tries++; st.last=c.r; st.hint=c.hint; if (c.pass) st.pass=q.sig;
    persist(P); renderSelf(P); logEvent('selfcalc_check',{lab:P, q:q.sym, pass:c.pass, tries:st.tries});
    document.dispatchEvent(new CustomEvent('learnchange',{detail:P}));
  }
  document.addEventListener('click', onSelfClick);
  document.addEventListener('keydown', e=>{ if (e.key==='Enter' && e.target.closest?.('.selfcalc input')){ e.preventDefault(); e.target.closest('.sc-q')?.querySelector('[data-sc-check]')?.click(); } });
  document.addEventListener('input', e=>{ const i=e.target.closest?.('.selfcalc input'); if (!i) return; const P=i.closest('.selfcalc').id.slice(0,-5), sc=scState(P), id=i.dataset.q; (sc.q[id]||(sc.q[id]={sig:'', tries:0, in:{}})).in[i.dataset.k]=i.value; });
  /* AI 检查、导出报告前的关口（“必须先自己算”时） */
  function gate(P){
    if (prefs.calc!=='must' || !document.getElementById(P+'-self')) return '';
    const list=quantities(P); return visible(P,list)?'':'老师设置为必须先自己算：先在“我先算”里算对全部结果。';
  }

  /* ================= 3. 先预测、再观察 ================= */
  const POE={
    mi:{q:'动镜 M₁ 向 M₂′ 靠近（d 变小）时，视场中的圆环会怎样？', opts:['从中心一个个冒出来，向外扩','向中心一个个缩进去、消失','位置不变，只是变亮'], ans:1,
      how:'转动鼓轮，让 d 变小，盯住视场中心看几圈。', why:'第 k 级亮环满足 2d·cosθ = kλ。d 变小时，同一级要靠更小的 θ（更靠近中心）才能满足，所以各环向中心缩进；每缩进一个环，d 变化 λ/2。'},
    nr:{q:'用反射光看牛顿环，中心是亮斑还是暗斑？越往外条纹的间距怎样变？', opts:['中心亮，越往外越疏','中心暗，越往外越密','中心暗，间距处处相等'], ans:1,
      how:'调好显微镜后看中心和外圈的条纹。', why:'接触点空气膜厚度为 0，但下表面反射有半波损失，所以中心是暗斑。暗环半径 r = √(kRλ)，随 k 增大得越来越慢，所以越往外越密。'},
    sp:{q:'换一块刻线更密（光栅常数 d 更小）的光栅，同一条谱线的一级衍射角会怎样？', opts:['变小','不变','变大'], ans:2,
      how:'测完绿线后，比较不同谱线：波长越长，衍射角越大；想一想 d 变小时的情形。', why:'d·sinφ = kλ，λ 一定时 d 越小，sinφ 越大，谱线偏得越开，色散也越大。'},
    pm:{q:'看着折射出来的绿线，把载物台朝一个方向一直转下去，绿线会怎样移动？', opts:['一直朝同一个方向移动','先朝直射光方向移动，到某处停住后反向','几乎不动'], ans:1,
      how:'切到“看光谱”，选“转载物台”，用中速朝一个方向转，用望远镜跟住绿线。', why:'偏向角 δ 随入射角 i₁ 先减小后增大：两次折射对称（光线在棱镜内平行于底边）时 δ 最小，绿线在这里停住并折回。只有在这个位置，n 才能用 sin[(A+δ)/2]/sin(A/2) 简单算出；而且这里 δ 对入射角的变化最不敏感，位置容易读准。'},
    fb:{q:'光纤弯曲半径从 6 mm 减到 4 mm，每圈的弯曲损耗大约会？', opts:['几乎不变','增大到约 2 倍','增大一个数量级左右'], ans:2,
      how:'在两个半径上各绕一圈，比较损耗。', why:'弯曲损耗随半径近似按 e^(−cR) 变化，是指数规律，半径小一点损耗就大很多，所以光纤布线有最小弯曲半径的要求。'},
    pl:{q:'检偏器从和起偏器平行的位置转过 45°，透过的光强约为原来的多少？', opts:['3/4','1/2','1/4'], ans:1,
      how:'先找到光强最大的位置，再转 45° 读光强。', why:'马吕斯定律 I = I₀cos²θ，cos²45° = 1/2。'},
    ld:{q:'温度升高时，半导体激光器的阈值电流会怎样？', opts:['变小','不变','变大'], ans:2,
      how:'在两个温度下各测一条 P–I 曲线，比较拐点。', why:'温度升高时载流子泄漏和非辐射复合增加，要更大的电流才能达到粒子数反转，阈值电流按 I_th ∝ e^(T/T₀) 增大，斜率效率也下降。'},
    bm:{q:'在离束腰一个瑞利长度 z_R 的地方，光斑半径是束腰半径的多少倍？', opts:['1 倍（不变）','√2 倍','2 倍'], ans:1,
      how:'做完透镜后的扫描后，比较束腰附近和远处的光斑半径。', why:'w(z) = W₀√(1 + (z/z_R)²)，z = z_R 时为 √2·W₀，光斑面积正好是束腰处的 2 倍。'},
    ln:{q:'二次成像法中，如果物和屏的距离 D 小于 4f，移动透镜会看到什么？', opts:['仍有一大一小两个清晰像','只有一个清晰像','找不到清晰的实像'], ans:2,
      how:'把像屏移近，使物屏距离小于 4 倍焦距，再前后移动透镜。', why:'1/u + 1/v = 1/f 且 u + v = D，有实数解要求 D² − 4Df ≥ 0，即 D ≥ 4f；D = 4f 时两个位置重合，D < 4f 时没有实像。'},
    ts:{q:'把 25 mm 目镜换成 40 mm 目镜后，放大率和视场会怎样？', opts:['放大率变小，物方视场变大','放大率变大，物方视场变大','放大率变小，物方视场变小'], ans:0,
      how:'用两个目镜分别看标尺，比较一块标尺占的大小和视场里能看到的范围。', why:'Γ = f₀/fₑ，fₑ 变大则放大率变小；物方视场 tanω = a/f₀，40 mm 目镜的视场光阑更大，能看到的范围更宽。像方视场角两者差不多。'},
  };
  function renderPoe(P){
    const box=document.getElementById(P+'-poe'), c=POE[P]; if (!box||!c) return;
    const st=ex(P).poe||{};
    if (st.seen){ const ok=st.pick===c.ans; box.className='poe done'; box.innerHTML=`<details><summary>先预测：${ok?'✓ 预测正确':'预测与观察不同'}</summary><p>${esc(c.q)}</p><p>你的预测：${esc(c.opts[st.pick])}；实际：<b>${esc(c.opts[c.ans])}</b></p><p>${esc(c.why)}</p></details>`; return; }
    box.className='poe';
    if (st.pick==null){ box.innerHTML=`<div class="poe-h">开始前先预测</div><p>${esc(c.q)}</p><div class="poe-o">${c.opts.map((o,i)=>`<button class="ghost" data-poe="${i}">${esc(o)}</button>`).join('')}</div><div class="hint">选一个你认为对的答案，再动手验证。预测之后才能记录数据。</div>`; return; }
    box.innerHTML=`<div class="poe-h">动手验证你的预测</div><p>你预测：<b>${esc(c.opts[st.pick])}</b></p><p>${esc(c.how)}</p><button class="ghost" data-poe-seen>我观察到了，看解释</button>`;
  }
  document.addEventListener('click', e=>{
    const b=e.target.closest?.('[data-poe],[data-poe-seen]'); if (!b) return; const box=b.closest('.poe'), P=box.id.slice(0,-4), st=ex(P).poe||(ex(P).poe={});
    if (b.dataset.poe!=null){ st.pick=+b.dataset.poe; logEvent('poe_predict',{lab:P, pick:st.pick}); } else { st.seen=true; logEvent('poe_seen',{lab:P, right:st.pick===POE[P].ans}); }
    persist(P); renderPoe(P);
  });
  /* 还没预测时拦下“记录读数” */
  document.addEventListener('click', e=>{ const b=e.target.closest?.('button[id$="-rec"]'); if (!b) return; const P=b.id.slice(0,-4);
    if (POE[P] && document.getElementById(P+'-poe') && ex(P).poe?.pick==null){ e.stopPropagation(); e.preventDefault();
      const box=document.getElementById(P+'-poe'); box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash'); box.scrollIntoView({block:'nearest'}); } }, true);

  /* ================= 4. 探究任务 ================= */
  const TASKS={};
  function task(P, def){ TASKS[P]=def; }
  function renderTask(P){
    const box=document.getElementById(P+'-inq'), t=TASKS[P]; if (!box||!t) return;
    const st=ex(P).inq||{}, ready=t.ready();
    let h=`<h2><span class="n">探究</span>探究任务：${esc(t.title)}</h2><div class="inq-t">${t.text}</div>`;
    if (st.pass) h+=`<div class="inq-ok">✓ 你的答案 ${esc(st.in)} ${esc(t.unit||'')}${st.tries>1?`（第 ${st.tries} 次）`:''}</div><div class="inq-r">${t.reveal()}</div>`;
    else if (!ready) h+=`<div class="hint">${esc(t.need)}</div>`;
    else { h+=`<div class="row" style="margin-top:8px"><label class="ctl-inline" style="color:inherit">${esc(t.label)} <input id="${P}-inq-in" value="${esc(st.in||'')}" inputmode="decimal" style="width:110px"> ${esc(t.unit||'')}</label><button class="ghost mini" data-inq="${P}">提交</button></div>`;
      if (st.tries) h+=`<div class="note">${st.tries>=3?`还不对。用你的数据算出的值约为 ${esc(fmtNum(t.answer()))} ${esc(t.unit||'')}，对照下面的思路找找哪里算错了。`:'和用你的数据算出的值不符，再检查一下。'}${t.hint?`<br>思路：${esc(t.hint)}`:''}</div>`;
      if (st.tries>=3) h+=`<div class="inq-r">${t.reveal()}</div>`; }
    box.innerHTML=h;
  }
  const fmtNum=v=>Number.isFinite(v)?(+v.toPrecision(3)).toString():'—';
  document.addEventListener('click', e=>{ const b=e.target.closest?.('[data-inq]'); if (!b) return; const P=b.dataset.inq, t=TASKS[P], st=ex(P).inq||(ex(P).inq={tries:0});
    const v=numOf($('#'+P+'-inq-in').value); st.in=$('#'+P+'-inq-in').value.trim(); if (v==null) return;
    const ans=t.answer(); st.tries=(st.tries||0)+1;
    if (Number.isFinite(ans) && Math.abs(v-ans)<=t.tol(ans)) st.pass=true;
    persist(P); renderTask(P); logEvent('inquiry_submit',{lab:P, pass:!!st.pass, tries:st.tries}); });

  /* ================= 5. 方案优化题（如二次成像法 D 取多大最好） ================= */
  const DESIGNS={};
  function design(P, def){ DESIGNS[P]=def; }
  function renderDesign(P){
    const box=document.getElementById(P+'-des'), d=DESIGNS[P]; if (!box||!d) return;
    const st=ex(P).des||{in:{}, ok:{}, tries:0}, done=d.fields.every(f=>st.ok[f.k]), show=done||st.tries>=3;
    box.innerHTML=`<h2><span class="n">方案</span>方案优化：${esc(d.title)}</h2><div class="inq-t">${d.text}</div>
      ${d.fields.map(f=>`<div class="row" style="margin-top:8px"><label class="ctl-inline" style="color:inherit"><span>${f.label}</span> <input data-des="${P}" data-k="${f.k}" value="${esc(st.in[f.k]||'')}" inputmode="decimal" style="width:90px"> ${esc(f.unit||'')}</label>${st.ok[f.k]?'<span class="sc-ok">✓</span>':st.tries&&st.in[f.k]!=null?`<span class="sc-n">${esc(f.hint)}</span>`:''}</div>`).join('')}
      ${done?'':`<div class="row" style="margin-top:8px"><button class="ghost mini" data-des-go="${P}">提交</button>${st.tries?`<span class="hint">已提交 ${st.tries} 次${st.tries>=3?'，下面给出了分析':''}</span>`:''}</div>`}
      ${show?`<div class="inq-r">${d.reveal()}</div><canvas class="chart des-chart"></canvas>`:''}`;
    if (show){ const cv=box.querySelector('.des-chart'); d.draw(cv); }
  }
  document.addEventListener('click', e=>{ const b=e.target.closest?.('[data-des-go]'); if (!b) return; const P=b.dataset.desGo, d=DESIGNS[P], st=ex(P).des||(ex(P).des={in:{}, ok:{}, tries:0});
    document.querySelectorAll(`input[data-des="${P}"]`).forEach(i=>{ st.in[i.dataset.k]=i.value.trim(); });
    d.fields.forEach(f=>{ const v=numOf(st.in[f.k]), a=f.answer(); st.ok[f.k]=v!=null&&Number.isFinite(a)&&Math.abs(v-a)<=f.tol(a); });
    st.tries++; persist(P); renderDesign(P); logEvent('design_submit',{lab:P, ok:st.ok, tries:st.tries}); });

  /* ================= 6. 作图法：在坐标纸上目测画直线，取线上两点求斜率 ================= */
  function nice(span){ const e=10**Math.floor(Math.log10(span/8)), m=span/8/e; return (m<=1?1:m<=2?2:m<=5?5:10)*e; }
  function graph(el, g, P){
    const xs=g.pts.map(p=>p[0]), ys=g.pts.map(p=>p[1]);
    const mx=nice(Math.max(...xs)-Math.min(...xs)||1), my=nice((Math.max(...ys)-Math.min(...ys))||1);
    const X0=Math.floor(Math.min(...xs)/mx)*mx-mx, X1=Math.ceil(Math.max(...xs)/mx)*mx+mx, Y0=Math.floor(Math.min(...ys)/my)*my-my, Y1=Math.ceil(Math.max(...ys)/my)*my+my;
    const ym=Unc.mean(ys), H=[[X0+(X1-X0)*0.15, ym],[X1-(X1-X0)*0.15, ym]];
    const snap=(v,step)=>Math.round(v/(step/10))*(step/10), dec=step=>Math.max(0,-Math.floor(Math.log10(step/10)+1e-9));
    el.innerHTML=`<div class="hint">拖动两个圆点，目测画一条最能代表这些数据点的直线（让点均匀分布在线的两侧）。斜率要用<b>直线上另取的两点</b>来算，两点尽量离得远，不要直接用数据点。坐标估读到小格的 1/2。</div>
      <canvas class="gw"></canvas><div class="gw-out"></div><div class="row" style="margin-top:6px"><button class="ghost mini" data-gw-cmp>和最小二乘拟合比较</button></div><div class="gw-cmp"></div>`;
    const cv=el.querySelector('canvas'); let geo=null, drag=-1;
    function draw(){
      if (!cv.clientWidth) return whenVisible(cv, draw);
      const {ctx,dpr,W,H:Hh}=setup(cv,260); ctx.setTransform(dpr,0,0,dpr,0,0);
      const L=48, R=W-12, T=10, B=Hh-30, Xp=x=>L+(x-X0)/(X1-X0)*(R-L), Yp=y=>B-(y-Y0)/(Y1-Y0)*(B-T);
      geo={Xp,Yp,inv:(px,py)=>[X0+(px-L)/(R-L)*(X1-X0), Y0+(B-py)/(B-T)*(Y1-Y0)],L,R,T,B};
      ctx.fillStyle='#fffdf6'; ctx.fillRect(0,0,W,Hh);
      for (let k=0;k<=Math.round((X1-X0)/mx*5);k++){ const x=Xp(X0+k*mx/5); ctx.strokeStyle=k%5?'rgba(214,120,90,.18)':'rgba(214,120,90,.5)'; ctx.beginPath(); ctx.moveTo(x,T); ctx.lineTo(x,B); ctx.stroke(); }
      for (let k=0;k<=Math.round((Y1-Y0)/my*5);k++){ const y=Yp(Y0+k*my/5); ctx.strokeStyle=k%5?'rgba(214,120,90,.18)':'rgba(214,120,90,.5)'; ctx.beginPath(); ctx.moveTo(L,y); ctx.lineTo(R,y); ctx.stroke(); }
      ctx.fillStyle='#5b616a'; ctx.font='11px "PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif'; ctx.textAlign='center';
      for (let x=X0;x<=X1+1e-9;x+=mx) ctx.fillText(String(+x.toPrecision(6)),Xp(x),B+14);
      ctx.textAlign='right'; for (let y=Y0;y<=Y1+1e-9;y+=my) ctx.fillText(String(+y.toPrecision(6)),L-4,Yp(y)+4);
      ctx.textAlign='left'; ctx.fillText(`横轴 ${g.xl}　纵轴 ${g.yl}　（每大格 5 小格）`,L,Hh-4);
      ctx.strokeStyle='#1d1e21'; ctx.lineWidth=1.4; g.pts.forEach(([x,y])=>{ const px=Xp(x), py=Yp(y); ctx.beginPath(); ctx.moveTo(px-4,py-4); ctx.lineTo(px+4,py+4); ctx.moveTo(px+4,py-4); ctx.lineTo(px-4,py+4); ctx.stroke(); });
      const [a,b]=H, k=(b[1]-a[1])/(b[0]-a[0]), ext=x=>a[1]+k*(x-a[0]);
      ctx.strokeStyle='#4E4486'; ctx.lineWidth=1.6; ctx.beginPath(); ctx.moveTo(Xp(X0),Yp(ext(X0))); ctx.lineTo(Xp(X1),Yp(ext(X1))); ctx.stroke();
      H.forEach(([x,y],i)=>{ ctx.fillStyle='#fff'; ctx.strokeStyle='#4E4486'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(Xp(x),Yp(y),6,0,Math.PI*2); ctx.fill(); ctx.stroke(); ctx.fillStyle='#4E4486'; ctx.fillText(i?'B':'A',Xp(x)+8,Yp(y)-8); });
      out();
    }
    function out(){
      const [a,b]=H.map(([x,y])=>[snap(x,mx),snap(y,my)]), k=(b[1]-a[1])/(b[0]-a[0]), c=a[1]-k*a[0], warn=[];
      if (Math.abs(b[0]-a[0])<0.5*(Math.max(...xs)-Math.min(...xs))) warn.push('两点离得太近：取点应尽量靠近直线两端，斜率的相对误差才小');
      if (g.pts.some(([x,y])=>H.some(([hx,hy])=>Math.abs(hx-x)<(X1-X0)*0.015&&Math.abs(hy-y)<(Y1-Y0)*0.03))) warn.push('有一个取点和数据点重合了：求斜率要在画好的直线上另取两点');
      const fx=v=>v.toFixed(dec(mx)), fy=v=>v.toFixed(dec(my));
      el.querySelector('.gw-out').innerHTML=`<div>A（${fx(a[0])}，${fy(a[1])}），B（${fx(b[0])}，${fy(b[1])}）</div><div>斜率 k = (y<sub>B</sub> − y<sub>A</sub>)/(x<sub>B</sub> − x<sub>A</sub>) = <b>${Number.isFinite(k)?+k.toPrecision(4):'—'}</b>，截距 ${Number.isFinite(c)?+c.toPrecision(4):'—'}${Number.isFinite(k)&&g.derive?`；${g.derive(k,c)}`:''}</div>${warn.length?`<div class="note">${warn.join('；')}。</div>`:''}`;
      el._k=k; el._c=c;
    }
    cv.addEventListener('pointerdown',e=>{ if (!geo) return; const r=cv.getBoundingClientRect(), px=e.clientX-r.left, py=e.clientY-r.top;
      drag=H.findIndex(([x,y])=>Math.hypot(geo.Xp(x)-px,geo.Yp(y)-py)<14); if (drag>=0){ cv.setPointerCapture(e.pointerId); e.preventDefault(); } });
    cv.addEventListener('pointermove',e=>{ if (drag<0||!geo) return; const r=cv.getBoundingClientRect(), [x,y]=geo.inv(Math.min(geo.R,Math.max(geo.L,e.clientX-r.left)),Math.min(geo.B,Math.max(geo.T,e.clientY-r.top))); H[drag]=[x,y]; draw(); });
    ['pointerup','pointercancel'].forEach(ev=>cv.addEventListener(ev,()=>{ if (drag>=0) logEvent('graph_line',{lab:P}); drag=-1; }));
    el.querySelector('[data-gw-cmp]').onclick=()=>{
      const box=el.querySelector('.gw-cmp');
      if (prefs.calc==='must' && !selfDone(P)){ box.innerHTML='<div class="note">老师设置为必须先自己算：先在“我先算”里算对结果，再和最小二乘比较。</div>'; return; }
      const f=g.fit, k=el._k, d=(k-f.b)/f.b*100;
      box.innerHTML=`<div class="inq-r">最小二乘：斜率 ${f.sb!=null?Unc.format(f.b,f.sb,'').text:+f.b.toPrecision(4)}，截距 ${+f.a.toPrecision(4)}${g.derive?`；${g.derive(f.b,f.a)}`:''}。<br>你的作图斜率与它相差 <b>${d>=0?'+':''}${d.toFixed(1)}%</b>${f.sb!=null?`，${Math.abs(k-f.b)<=f.sb?'在最小二乘斜率的标准差之内':`约为斜率标准差的 ${(Math.abs(k-f.b)/f.sb).toFixed(1)} 倍`}`:''}。作图法直观、能一眼看出可疑点，但直线靠目测，因人而异；最小二乘法客观，并且能给出斜率的不确定度。</div>`;
      logEvent('graph_compare',{lab:P, diff:+d.toFixed(2)});
    };
    draw();
  }
  /* 实测页调用：list 为 [{title, pts, fit, xl, yl, derive}]，数据没变时不重建（保留学生画的线） */
  function graphs(P, list){
    const box=document.getElementById(P+'-graph'); if (!box) return;
    const sig=JSON.stringify(list.map(g=>[g.title,g.pts]));
    if (box.dataset.sig===sig) return; box.dataset.sig=sig;
    box.innerHTML=list.map((g,i)=>`<details class="graphw" data-i="${i}"><summary>作图法练习：${esc(g.title)}</summary><div class="gw-body"></div></details>`).join('');
    box.querySelectorAll('details').forEach(d=>d.addEventListener('toggle',()=>{ if (d.open && !d.dataset.ok){ d.dataset.ok=1; graph(d.querySelector('.gw-body'), list[+d.dataset.i], P); } }));
  }

  /* ================= 7. 思考题：学生作答，AI 按要点评分 ================= */
  const THINK={
    mi:[{q:'为什么测量时鼓轮只能沿一个方向转动？中途反转会对结果有什么影响？', keys:[{t:'回程差（空程）的存在',k:['回程','空程','间隙']},{t:'反转时读数变化而动镜没有移动',k:['没有移动','没动','不动','读数变']},{t:'会使 λ 偏大或数错环',k:['偏大','数错','误差']}]},
        {q:'用钠光做实验时，条纹为什么会周期性地变模糊再变清晰？Δλ 和两次最模糊之间的 Δd 是什么关系？', keys:[{t:'两个波长的两套条纹叠加',k:['两套','两个波长','双线','叠加']},{t:'亮纹重合时清晰、错开时模糊',k:['重合','错开','交错']},{t:'Δλ = λ̄²/(2Δd)',k:['λ²','2Δd','λ̄²']}]}],
    nr:[{q:'为什么用逐差法 D_m² − D_n² 求 R，而不直接用某一个环的直径？', keys:[{t:'接触处有灰尘或形变，级次整体偏移',k:['灰尘','形变','接触','附加']},{t:'中心级次难以确定',k:['中心','级次','绝对']},{t:'两环相减消去附加项',k:['相减','消去','抵消']}]},
        {q:'牛顿环为什么越往外越密？', keys:[{t:'暗环半径 r = √(kRλ)，与 √k 成正比',k:['√','根号','平方根','r²']},{t:'空气膜厚度随 r² 增大，越往外变化越快',k:['厚度','空气膜','变化快']}]}],
    sp:[{q:'为什么每个位置都要读左右两个游标？', keys:[{t:'刻度盘中心与转轴不重合（偏心差）',k:['偏心','不重合','中心']},{t:'两个游标的偏心误差大小相等、符号相反，取平均抵消',k:['相反','抵消','平均']}]},
        {q:'光栅不垂直于入射光时会怎样？怎样判断光栅已经调垂直？', keys:[{t:'±1 级衍射角不对称',k:['不对称','不相等','左右']},{t:'用自准法：光栅面反射的十字像与叉丝重合',k:['自准','反射','十字','重合']},{t:'带来系统误差',k:['误差','偏']}]}],
    fb:[{q:'测弯曲损耗时，为什么在绕上之前、取下之后都要测一次基准功率？', keys:[{t:'耦合状态或光源功率可能漂移',k:['漂移','变化','起伏','耦合']},{t:'两次基准相近才能确认损耗来自弯曲',k:['确认','判断','相近','一致']}]},
        {q:'为什么弯曲半径越小，损耗增加得越快？', keys:[{t:'弯曲处入射角变小，不再满足全反射',k:['全反射','临界角','入射角']},{t:'部分模场泄漏到包层外',k:['泄漏','辐射','包层','模场']},{t:'损耗随半径近似按指数变化',k:['指数','e^','急剧']}]}],
    pl:[{q:'用马吕斯定律测消光位置时，为什么用拟合比直接找最暗点更准？', keys:[{t:'消光附近光强随角度变化很慢（斜率为零）',k:['变化慢','斜率','平缓','极小']},{t:'拟合利用全部数据点',k:['全部','所有','多个点','拟合']}]},
        {q:'怎样用实验区分 λ/4 波片和 λ/2 波片？', keys:[{t:'把波片快轴转到与起偏方向成 45°',k:['45']},{t:'λ/4：出射圆偏振光，转检偏器光强几乎不变',k:['圆偏振','不变','不随']},{t:'λ/2：出射仍是线偏振光，能找到消光',k:['线偏振','消光','最暗']}]}],
    ld:[{q:'怎样从 P–I 曲线确定阈值电流？为什么不用“刚开始有功率”的那一点？', keys:[{t:'对阈值以上的线性段作直线拟合，外推到 P = 0',k:['线性','直线','外推','拟合']},{t:'阈值以下也有自发辐射，功率不为零',k:['自发辐射','荧光','LED','不为零']}]},
        {q:'温度升高时，阈值电流和斜率效率怎样变化？为什么？', keys:[{t:'阈值电流增大',k:['增大','变大','升高']},{t:'斜率效率下降',k:['下降','减小','降低']},{t:'载流子泄漏、非辐射复合增加',k:['载流子','泄漏','非辐射','俄歇']}]}],
    bm:[{q:'测 M² 时，为什么要在束腰两侧、并且在离束腰一个瑞利长度以外都测光斑？', keys:[{t:'束腰两侧都有点才能确定束腰位置和大小',k:['两侧','束腰','位置']},{t:'远处的点决定发散角',k:['发散','远场','远处']},{t:'只在一侧测要外推，误差大',k:['外推','误差','不可靠']}]},
        {q:'M² 的物理意义是什么？M² = 1 代表什么？', keys:[{t:'束腰半径与远场发散角的乘积与理想高斯光束之比',k:['乘积','发散角','束腰']},{t:'M² = 1 为理想高斯（基模）光束',k:['理想','高斯','基模','TEM']},{t:'实际光束 M² ≥ 1，越大光束质量越差',k:['大于','≥','质量']}]}],
    ln:[{q:'二次成像法为什么不需要知道透镜主面的确切位置？', keys:[{t:'只用到两个清晰位置的距离 d',k:['两个位置','距离','d']},{t:'读数指标与主面的偏差在相减时抵消',k:['抵消','消去','相减']}]},
        {q:'自准法为什么要把透镜转 180° 再测一次？', keys:[{t:'透镜架读数指标与主面不重合',k:['读数指标','主面','不重合']},{t:'转 180° 后偏差变号，取平均抵消',k:['变号','平均','抵消']}]}],
    pm:[{q:'为什么要在最小偏向位置测偏向角，而不是随便一个入射角？', keys:[{t:'最小偏向时光路对称（i₁ = i₂′），才能用 n = sin[(A+δ)/2]/sin(A/2)',k:['对称','i₁','平行于底边','公式']},{t:'任意入射角还要另外测入射角，多一项误差',k:['入射角','另外测','多测','多一']},{t:'转折点附近 δ 对入射角不敏感（二阶小量），位置容易定准',k:['不敏感','变化很小','二阶','转折','极小']}]},
        {q:'自准法测顶角前为什么要先把三棱镜调平？两次读数之间为什么不能碰载物台？', keys:[{t:'两个光学面要平行于仪器转轴，反射像才能回到上方叉丝',k:['平行','转轴','垂直','调平']},{t:'没调平时测到的是法线投影之间的夹角，顶角有误差',k:['投影','夹角','顶角误差','偏差']},{t:'载物台转动会把棱镜转过的角度混进 φ',k:['转过','混进','载物台','φ']}]}],
    ts:[{q:'标尺在有限远处时，测得的放大率为什么比 f₀/fₑ 大？', keys:[{t:'调焦后像距 s′ 大于 f₀，镜筒变长',k:['镜筒','像距','s′','变长','调焦']},{t:'测得的是 s′/fₑ',k:['s′/f','s\'']},{t:'需要换算到无穷远',k:['换算','修正','无穷远']}]},
        {q:'出瞳的位置和大小有什么实际意义？', keys:[{t:'眼睛瞳孔要放在出瞳处才能看到完整视场',k:['眼睛','瞳孔','视场']},{t:'出瞳距决定眼睛离目镜多远',k:['出瞳距','眼点','距离']},{t:'出瞳直径影响像的亮度',k:['亮度','明亮','光通量']}]}],
  };
  const thinkOf=P=>THINK[P]||(P[0]==='u'?THINK[P.slice(1)]:null);
  function renderThink(P){
    const box=document.getElementById(P+'-think'), qs=thinkOf(P); if (!box||!qs) return;
    const st=ex(P).think||{ans:[], res:null};
    box.innerHTML=`<h2><span class="n">思考</span>思考题</h2>${qs.map((q,i)=>`<div class="th-q"><div class="th-t">${i+1}. ${esc(q.q)}</div><textarea data-th="${P}" data-i="${i}" rows="3" placeholder="用自己的话回答，写出关键的物理原因">${esc(st.ans[i]||'')}</textarea>
        ${st.res?.[i]?`<div class="th-r"><b>${st.res[i].score} / 5 分</b>　${esc(st.res[i].comment||'')}</div>`:''}</div>`).join('')}
      <div class="row" style="margin-top:8px"><button class="ghost" data-th-go="${P}">提交并评分</button><span class="hint" id="${P}-th-msg">${st.res?`合计 ${st.res.reduce((a,r)=>a+(+r.score||0),0)} / ${qs.length*5} 分${st.by==='rule'?'（离线按关键词评分）':'（AI 按要点评分）'}`:'按要点评分，每题 5 分'}</span></div>`;
  }
  document.addEventListener('input', e=>{ const a=e.target.closest?.('textarea[data-th]'); if (!a) return; const st=ex(a.dataset.th).think||(ex(a.dataset.th).think={ans:[], res:null}); st.ans[+a.dataset.i]=a.value; });
  document.addEventListener('click', async e=>{ const b=e.target.closest?.('[data-th-go]'); if (!b) return; const P=b.dataset.thGo, qs=thinkOf(P), st=ex(P).think||(ex(P).think={ans:[], res:null});
    document.querySelectorAll(`textarea[data-th="${P}"]`).forEach(a=>{ st.ans[+a.dataset.i]=a.value.trim(); });
    if (st.ans.filter(Boolean).length<qs.length){ $('#'+P+'-th-msg').textContent='每道题都写一写再提交。'; return; }
    b.disabled=true; $('#'+P+'-th-msg').textContent='正在评分…';
    const rule=()=>qs.map((q,i)=>{ const a=st.ans[i]||'', hit=q.keys.filter(k=>k.k.some(w=>a.includes(w))), sc=Math.round(hit.length/q.keys.length*10)/2;
      return {score:sc, comment:hit.length===q.keys.length?'要点齐全。':'还可以补充：'+q.keys.filter(k=>!hit.includes(k)).map(k=>k.t).join('；')}; });
    let res=null, by='ai';
    try { await AI.ready;
      if (AI.online()){ const t=await aiText(`你是大学物理实验课的助教，给大一学生的思考题回答评分。每题满分 5 分，按要点给分（意思对即可，不必逐字相同；错误的说法要扣分）。只输出 JSON，格式：{"scores":[{"score":分数,"comment":"不超过 60 字的点评，指出答对的要点和缺少的要点"}]}，数组顺序与题目一致，分数可以是 0.5 的倍数。
${qs.map((q,i)=>`第 ${i+1} 题：${q.q}\n要点：${q.keys.map(k=>k.t).join('；')}\n学生回答：${st.ans[i]}`).join('\n\n')}`);
        const m=t.match(/\{[\s\S]*\}/); const j=m?JSON.parse(m[0]):null;
        if (j&&Array.isArray(j.scores)&&j.scores.length===qs.length) res=j.scores.map(x=>({score:Math.max(0,Math.min(5,Math.round((+x.score||0)*2)/2)), comment:String(x.comment||'').slice(0,120)})); }
    } catch(err){}
    if (!res){ res=rule(); by='rule'; }
    st.res=res; st.by=by; persist(P); renderThink(P); logEvent('think_score',{lab:P, by, total:res.reduce((a,r)=>a+r.score,0)});
  });

  /* ================= 8. AI 批改前的追问 ================= */
  const ASK=`

现在先不要给出批改意见。根据上面的数据，向学生提出 1～2 个最关键的追问（每个不超过 45 字），引导学生自己发现数据中的问题或解释某个现象，不要直接说出答案。只输出问题，每行一个，分别以“问1：”“问2：”开头。`;
  function parseAsk(t){ return String(t||'').split(/\n+/).map(s=>s.trim()).filter(s=>/^问\s*\d\s*[：:]/.test(s)).map(s=>s.replace(/^问\s*\d\s*[：:]\s*/,'')).slice(0,2); }
  /* 显示追问，等学生回答或跳过；返回 [{q,a}] 或 null */
  function askStudent(P, box, qs){
    return new Promise(res=>{
      box.innerHTML=`<div class="follow"><div class="poe-h">AI 助教先问你几个问题</div>${qs.map((q,i)=>`<div class="th-q"><div class="th-t">${i+1}. ${esc(q)}</div><textarea rows="2" data-fq="${i}" placeholder="想一想再回答，可以结合你的数据"></textarea></div>`).join('')}
        <div class="row" style="margin-top:8px"><button class="primary" data-f-ok>提交回答，完成批改</button><button class="ghost" data-f-skip>跳过追问，直接批改</button></div></div>`;
      box.querySelector('[data-f-ok]').onclick=()=>{ const ans=[...box.querySelectorAll('[data-fq]')].map(a=>a.value.trim()); if (ans.some(a=>!a)){ box.querySelector('textarea:placeholder-shown')?.focus(); return; } res(qs.map((q,i)=>({q, a:ans[i]}))); };
      box.querySelector('[data-f-skip]').onclick=()=>res(null);
    });
  }
  async function reviewText(P, box, prompt){
    let qa=null;
    try { const qs=parseAsk(await aiText(prompt+ASK)); if (qs.length) qa=await askStudent(P, box, qs); } catch(e){}
    box.innerHTML=loadingHTML(qa?'正在根据你的回答批改…':'正在检查数据…');
    if (qa){ const st=ex(P); st.follow=qa; persist(P); logEvent('review_followup',{lab:P, n:qa.length}); }
    const text=await aiText(qa?`${prompt}

批改前你已向学生追问，学生的回答如下：
${qa.map((x,i)=>`问${i+1}：${x.q}\n答：${x.a}`).join('\n')}
请在批改意见的最前面加一段【对追问的点评】：逐条评价学生的回答，指出对在哪里、哪里还不准确，并补充正确的解释；然后再按原要求分段给出意见。`:prompt);
    return text;
  }

  /* ================= 挂到实验页面上 ================= */
  function attach(P, {virtual=true}={}){
    const res=document.getElementById(P+'-result'); if (!res) return;
    res.insertAdjacentHTML('beforebegin', `<div class="selfcalc" id="${P}-self"></div>`);
    if (virtual && POE[P]) document.getElementById(P+'-steps').insertAdjacentHTML('afterend', `<div class="poe" id="${P}-poe"></div>`);
    const ai=document.getElementById(P+'-check').closest('.card');
    if (virtual && TASKS[P]) ai.insertAdjacentHTML('beforebegin', `<div class="card minor-card inquiry" id="${P}-inq"></div>`);
    if (virtual && DESIGNS[P]) ai.insertAdjacentHTML('beforebegin', `<div class="card minor-card inquiry" id="${P}-des"></div>`);
    if (thinkOf(P)) ai.insertAdjacentHTML('beforebegin', `<div class="card minor-card inquiry" id="${P}-think"></div>`);
    const upd=()=>{ renderSelf(P); renderTask(P); renderDesign(P); };
    new MutationObserver(upd).observe(res,{childList:true, subtree:true, characterData:true});
    new MutationObserver(()=>renderTask(P)).observe(document.getElementById(P+'-table'),{childList:true, subtree:true});
    upd(); renderPoe(P); renderThink(P);
  }
  function rerender(){ document.querySelectorAll('.selfcalc').forEach(b=>renderSelf(b.id.slice(0,-5))); }

  /* ================= 报告里的“自主计算与探究” ================= */
  function reportBlocks(P){
    const e=LabStore.extra[P]||{}, blocks=[], list=quantities(P);
    if (list.length && prefs.calc!=='show'){
      const rows=[[[{t:'物理量',b:true}],[{t:'学生自己算的结果',b:true}],[{t:'程序结果',b:true}],[{t:'核对情况',b:true}]]];
      list.forEach(q=>{ const st=e.sc?.q?.[q.id]; const mine=st?.in?.a?`(${st.in.a} ± ${st.in.b})`:'未作答';
        rows.push([[{t:`${q.label}：${q.sym}`}],[{t:mine}],[{t:`(${q.astr} ± ${q.ustr}) ${q.unit}`}],[{t:st?.pass===q.sig?`第 ${st.tries} 次算对`:st?.tries?`核对 ${st.tries} 次，未全部算对`:e.sc?.skip?'跳过':'未核对'}]]); });
      blocks.push({p:[{t:'我先算：',b:true},{t:RULE()+'。'}]}, {table:rows});
    }
    const c=POE[P];
    if (c && e.poe?.pick!=null) blocks.push({p:[{t:'先预测：',b:true},{t:`${c.q} 预测“${c.opts[e.poe.pick]}”，${e.poe.seen?(e.poe.pick===c.ans?'与观察一致。':`观察结果为“${c.opts[c.ans]}”。`):'尚未完成观察。'}`}]});
    const t=TASKS[P];
    const d=DESIGNS[P];
    if (d && e.des?.tries) blocks.push({p:[{t:`方案优化（${d.title}）：`,b:true},{t:d.fields.map(f=>`${f.label.replace(/<[^>]+>/g,'')} 答 ${e.des.in[f.k]||'—'}${e.des.ok[f.k]?'（正确）':`（参考 ${fmtNum(f.answer())}）`}`).join('；')+'。'}]});
    const th=thinkOf(P);
    if (th && e.think?.ans?.some(Boolean)) th.forEach((q,i)=>blocks.push({p:[{t:`思考题 ${i+1}：`,b:true},{t:q.q}]},{p:[{t:'回答：',b:true},{t:e.think.ans[i]||'（未作答）'}]},...(e.think.res?.[i]?[{p:[{t:`得分 ${e.think.res[i].score}/5：`,b:true},{t:e.think.res[i].comment||''}]}]:[])));
    if (e.follow?.length) e.follow.forEach((x,i)=>blocks.push({p:[{t:`AI 追问 ${i+1}：`,b:true},{t:x.q+' '},{t:'学生回答：',b:true},{t:x.a}]}));
    if (t && e.inq?.tries) blocks.push({p:[{t:`探究任务（${t.title}）：`,b:true},{t:`答案 ${e.inq.in} ${t.unit||''}，${e.inq.pass?`第 ${e.inq.tries} 次正确。`:`提交 ${e.inq.tries} 次未通过（参考值 ${fmtNum(t.answer())}）。`}`}]});
    return blocks;
  }

  /* 结果是否已经可以看（算对了、跳过了，或不使用“我先算”） */
  function selfDone(P){ if (prefs.calc==='show') return true; const l=quantities(P); return l.length>0 && visible(P,l); }
  return {ready, prefs:()=>prefs, selfDone, design, graphs, reviewText, savePrefs, setPrefs, attach, task, gate, rerender, reportBlocks, quantities, check, POE, TASKS};
})();
