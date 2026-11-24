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

  /* ================= 挂到实验页面上 ================= */
  function attach(P, {virtual=true}={}){
    const res=document.getElementById(P+'-result'); if (!res) return;
    res.insertAdjacentHTML('beforebegin', `<div class="selfcalc" id="${P}-self"></div>`);
    if (virtual && POE[P]) document.getElementById(P+'-steps').insertAdjacentHTML('afterend', `<div class="poe" id="${P}-poe"></div>`);
    if (virtual && TASKS[P]) document.getElementById(P+'-check').closest('.card').insertAdjacentHTML('beforebegin', `<div class="card minor-card inquiry" id="${P}-inq"></div>`);
    const upd=()=>{ renderSelf(P); renderTask(P); };
    new MutationObserver(upd).observe(res,{childList:true, subtree:true, characterData:true});
    new MutationObserver(()=>renderTask(P)).observe(document.getElementById(P+'-table'),{childList:true, subtree:true});
    upd(); renderPoe(P);
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
    if (t && e.inq?.tries) blocks.push({p:[{t:`探究任务（${t.title}）：`,b:true},{t:`答案 ${e.inq.in} ${t.unit||''}，${e.inq.pass?`第 ${e.inq.tries} 次正确。`:`提交 ${e.inq.tries} 次未通过（参考值 ${fmtNum(t.answer())}）。`}`}]});
    return blocks;
  }

  /* 结果是否已经可以看（算对了、跳过了，或不使用“我先算”） */
  function selfDone(P){ if (prefs.calc==='show') return true; const l=quantities(P); return l.length>0 && visible(P,l); }
  return {ready, prefs:()=>prefs, selfDone, savePrefs, setPrefs, attach, task, gate, rerender, reportBlocks, quantities, check, POE, TASKS};
})();
