/* =====================================================================
 * mydata.js —— 处理我的数据：把真实实验课上记下的原始数据录进来，
 *              按与虚拟实验相同的方法（逐差法、最小二乘拟合、不确定度）计算，
 *              检查常见问题，交给 AI 助教批改，并导出实验报告。
 *
 * 每个实验由一份 SPEC 描述：
 *   groups：实验内容（如“He-Ne 波长”“钠光双线”），各有参数 params 和数据列 cols
 *   process(D)：D(gid) 返回该组解析后的参数与数据行；返回左侧的数据表、结果、问题清单和给 AI 的摘要
 * 存档：{g 当前组, prm 参数（原样字符串）, rows [{g, v:[各列原样字符串]}], review, checked}
 * ===================================================================== */
const MyData = (() => {
  /* ---------------- 解析与工具 ---------------- */
  const FW = s => String(s ?? '').replace(/[０-９．－＋]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[−–—]/g, '-').replace(/，/g, '.').trim();
  /* 数字：空 → null，不合法 → NaN */
  function num(v){ const t = FW(v); if (t === '') return null; if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return NaN; return +t; }
  /* 角度：164°31′、164°31'、164 31、164度31分、164.52 → 度 */
  function ang(v){
    const t = FW(v).replace(/[度°]/g, ' ').replace(/[分′']/g, ' ').replace(/[秒″"]/g, ' ').trim();
    if (t === '') return null;
    const p = t.split(/\s+/);
    if (p.length > 3 || p.some(x => !/^\d+(\.\d+)?$/.test(x))) return NaN;
    const [d, m = 0, s = 0] = p.map(Number);
    if (m >= 60 || s >= 60) return NaN;
    return d + m / 60 + s / 3600;
  }
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const median = a => { const b = a.slice().sort((x, y) => x - y), n = b.length; return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2; };
  const p3 = v => (+(+v).toPrecision(3)).toString();
  const sig = (v, n = 4) => Number.isFinite(v) ? (+v.toPrecision(n)).toString() : '—';
  const pct = v => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
  const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
  function linfit(xs, ys){
    const n = xs.length, mx = mean(xs), my = mean(ys), sxx = xs.reduce((q, x) => q + (x - mx) ** 2, 0);
    if (!(sxx > 0)) return null;
    const b = xs.reduce((q, x, i) => q + (x - mx) * (ys[i] - my), 0) / sxx, a = my - b * mx;
    const res = ys.reduce((q, y, i) => q + (y - a - b * xs[i]) ** 2, 0), sst = ys.reduce((q, y) => q + (y - my) ** 2, 0);
    const s2 = n > 2 ? res / (n - 2) : null;
    return {a, b, n, sxx, r2: sst > 0 ? 1 - res / sst : 1, sb: s2 != null ? Math.sqrt(s2 / sxx) : null,
      sa: s2 != null ? Math.sqrt(s2 * (1 / n + mx * mx / sxx)) : null, cov: s2 != null ? -mx * s2 / sxx : null};
  }
  function solve(M, b){ const n = b.length, A = M.map((r, i) => [...r, b[i]]);
    for (let i = 0; i < n; i++){ let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k; [A[i], A[p]] = [A[p], A[i]];
      if (Math.abs(A[i][i]) < 1e-300) return null;
      for (let k = 0; k < n; k++) if (k !== i){ const f = A[k][i] / A[i][i]; for (let j = i; j <= n; j++) A[k][j] -= f * A[i][j]; } }
    return A.map((r, i) => r[n] / r[i]); }
  const inv = M => { const n = M.length, cols = []; for (let j = 0; j < n; j++){ const c = solve(M, [...Array(n)].map((_, i) => +(i === j))); if (!c) return null; cols.push(c); } return M.map((_, i) => cols.map(c => c[i])); };
  /* 逐差法配对：n 个数据分成前后两半，第 i 个与第 i + k 个相减 */
  const halves = n => { const k = Math.floor(n / 2); return [...Array(k)].map((_, i) => [i, i + k]); };
  /* 规范结果的一段 HTML */
  function finalBlock(desc, sym, x, u, unit){
    const f = Unc.format(x, u, unit);
    return `<div class="unc">${desc}<div class="final">结果：<b>${sym} = ${f.text}</b>，相对不确定度 ${f.rel.toFixed(2)}%</div></div>`;
  }
  const fmtU = (x, u, unit = '') => u > 0 ? Unc.format(x, u, unit).text : `${sig(x)}${unit ? ' ' + unit : ''}`;
  const cmp = (x, ref, name = '参考值', unit = '') => ref ? `　${name} ${ref}${unit ? ' ' + unit : ''}，相对偏差 <b>${pct((x - ref) / ref * 100)}</b>` : '';
  /* 与参考值相差太多：多半是单位、级次或抄写错误 */
  const refCheck = (out, tag, x, ref, lim = 5) => { if (ref && Math.abs((x - ref) / ref * 100) > lim) out.issues.push(`${tag}：结果与参考值相差 ${pct((x - ref) / ref * 100)}，超出正常范围，检查单位、数据或参数`); };
  const T = (head, body, cls = '') => `<div class="udt"><table class="data${cls ? ' ' + cls : ''}"><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${body.map(r => `<tr${r.warn ? ' class="warn"' : ''}>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table></div>`;
  const sub = (t, first) => `<div class="hint" style="margin-top:${first ? 0 : 12}px"><b>${t}</b></div>`;
  /* 散点 + 拟合曲线 */
  function plot(cv, {pts, fit, xl, yl, x0: xa, y0: ya}){
    if (!cv || !pts.length) return; if (!cv.clientWidth) return whenVisible(cv, () => plot(cv, {pts, fit, xl, yl, x0: xa, y0: ya}));
    const {ctx, dpr, W, H} = setup(cv, 180); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    let xmin = Math.min(...xs, xa ?? Infinity), xmax = Math.max(...xs), ymin = Math.min(...ys, ya ?? Infinity), ymax = Math.max(...ys);
    const fs = fit ? [...Array(61)].map((_, i) => { const x = xmin + (xmax - xmin) * i / 60; return [x, fit(x)]; }).filter(p => Number.isFinite(p[1])) : [];
    fs.forEach(p => { ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]); });
    const dx = (xmax - xmin) || 1, dy = (ymax - ymin) || 1; xmin -= dx * .05; xmax += dx * .05; ymin -= dy * .08; ymax += dy * .08;
    const L = 52, R = W - 12, B = H - 28, Tp = 18, X = x => L + (x - xmin) / (xmax - xmin) * (R - L), Y = y => B - (y - ymin) / (ymax - ymin) * (B - Tp);
    ctx.font = '11px "PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif'; ctx.lineWidth = 1;
    ctx.strokeStyle = '#e4e2dc'; ctx.fillStyle = '#5b616a';
    for (let k = 0; k <= 4; k++){ const y = ymin + (ymax - ymin) * k / 4; ctx.beginPath(); ctx.moveTo(L, Y(y)); ctx.lineTo(R, Y(y)); ctx.stroke(); ctx.textAlign = 'right'; ctx.fillText(sig(y, 3), L - 5, Y(y) + 4); }
    ctx.textAlign = 'center'; for (let k = 0; k <= 4; k++){ const x = xmin + (xmax - xmin) * k / 4; ctx.fillText(sig(x, 3), X(x), B + 15); }
    ctx.strokeStyle = '#8a8f97'; ctx.beginPath(); ctx.moveTo(L, Tp); ctx.lineTo(L, B); ctx.lineTo(R, B); ctx.stroke();
    if (fs.length){ ctx.strokeStyle = '#b5442c'; ctx.lineWidth = 1.4; ctx.beginPath(); fs.forEach((p, i) => i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))); ctx.stroke(); }
    ctx.fillStyle = '#1d1e21'; pts.forEach(p => { ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), 3, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = '#5b616a'; ctx.textAlign = 'left'; ctx.fillText(`纵轴：${yl}　横轴：${xl}${fit ? '（曲线为拟合结果）' : ''}`, L + 6, 12);
  }
  /* 确定性的小扰动，用于生成示例数据（每次相同，便于对照） */
  const nz = (i, a = 1) => a * (Math.sin(i * 12.9898 + 4.1) * 43758.5453 % 1);
  const erfc = x => { const t = 1 / (1 + 0.3275911 * Math.abs(x)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return 1 - (x >= 0 ? y : -y); };

  /* ================= 各实验 ================= */
  const SPECS = {};

  /* ---------- 迈克尔逊干涉仪 ---------- */
  SPECS.michelson = {P: 'umi', title: '迈克尔逊干涉仪测波长（实测数据）', ai: '迈克尔逊干涉仪测 He-Ne 激光波长（及钠光双线波长差）',
    principle: `<p>M₁ 每移动 λ/2，中心冒出或缩进一个环：<b>λ = 2Δd / ΔN</b>。把 n 次读数分成前后两半，第 i 次与第 i + n/2 次相减（逐差法），每组得到一个 λ，再求平均。</p>
      <p>不确定度：A 类取各组 λ 的平均值标准偏差；B 类由鼓轮仪器误差限 Δ<sub>仪</sub> 估算，两次读数相减 u(Δd) = √2·Δ<sub>仪</sub>/√3，按 λ ∝ Δd 传递。</p>
      <p>钠光双线：相邻两次视见度最低之间 M₁ 移动 Δd，<b>Δλ = λ̄²/(2Δd)</b>，λ̄ = 589.3 nm。连续记录多次最低位置，同样用逐差法求 Δd。</p>`,
    groups: [
      {id: 'he', name: '测波长', desc: '每数过一定环数（如 50 环）记一次鼓轮读数。N 填从第一次记录起累计的环数，第一行 N = 0。',
        params: [{k: 'inst', label: '鼓轮仪器误差限', unit: 'mm', def: '0.0001'}, {k: 'ref', label: '参考波长（可不填）', unit: 'nm', def: '632.8', opt: true}],
        cols: [{k: 'N', label: '累计环数 N'}, {k: 'd', label: '读数 d / mm'}],
        example: () => [...Array(10)].map((_, i) => [String(i * 50), (32.41256 + i * 50 * 632.8e-6 / 2 + nz(i, 6e-5)).toFixed(5)])},
      {id: 'na', name: '钠光双线（选做）', desc: '换钠灯后，每到条纹最模糊（视见度最低）时记一次读数，连续记 6 次以上，中间不要漏记。',
        params: [{k: 'lam', label: '平均波长 λ̄', unit: 'nm', def: '589.3'}, {k: 'inst', label: '鼓轮仪器误差限', unit: 'mm', def: '0.0001'}, {k: 'ref', label: '参考 Δλ（可不填）', unit: 'nm', def: '0.597', opt: true}],
        cols: [{k: 'd', label: '最低时读数 d / mm'}],
        example: () => [...Array(6)].map((_, i) => [(31.0532 + i * 0.29085 + nz(i + 3, 0.006)).toFixed(5)])}],
    process(D){
      const out = {table: '', result: '', issues: [], ai: [], ok: false};
      const he = D('he'), na = D('na');
      if (he.rows.length){
        const r = he.rows, n = r.length;
        out.table += sub('测波长：读数记录', true) + T(['序号', '累计环数 N', '读数 d / mm', '与上次间隔'], r.map((x, i) => [i + 1, x.raw.N, x.raw.d, i ? `${x.N - r[i - 1].N} 环，${(x.d - r[i - 1].d).toFixed(5)} mm` : '—']));
        const steps = r.slice(1).map((x, i) => x.d - r[i].d);
        if (steps.some(v => v > 0) && steps.some(v => v < 0)) out.issues.push('测波长：读数不是单向变化，中途反转过鼓轮，会引入回程差，应沿同一方向转动');
        if (new Set(r.slice(1).map((x, i) => x.N - r[i].N)).size > 1) out.issues.push('测波长：相邻两次记录的间隔环数不全相同（逐差法按实际环数计算，仍可用，但一般应每次间隔相同环数）');
        if (n < 4) out.result += '<div class="hint">测波长：至少需要 4 次读数才能用逐差法，建议 10 次。</div>';
        else {
          const items = halves(n).map(([i, j]) => { const dN = Math.abs(r[j].N - r[i].N), dd = Math.abs(r[j].d - r[i].d); return {i, j, dN, dd, lam: dN ? 2 * dd / dN * 1e6 : NaN}; });
          if (items.some(x => !(x.lam > 0))) { out.result += '<div class="note">测波长：有一组配对的环数差或读数差为 0，无法计算，请检查是否重复录入。</div>'; out.issues.push('测波长：有配对的环数差或读数差为 0'); }
          else {
            const lams = items.map(x => x.lam), m = mean(lams), uB = m * Math.SQRT2 * he.prm.inst / Unc.SQRT3 / mean(items.map(x => x.dd)), sum = Unc.summarize(lams, uB), md = median(lams);
            items.forEach(x => { if (Math.abs(x.lam - md) / md > 0.02) out.issues.push(`测波长：第 ${r[x.i].no} 行与第 ${r[x.j].no} 行得到 λ = ${x.lam.toFixed(1)} nm，偏离其他组 2% 以上，可能数错了环`); });
            out.result += `<div class="result">测波长：逐差法（第 i 次与第 i + ${items.length} 次相减）各组 λ：${lams.map(v => v.toFixed(1)).join('、')} nm
              <div>平均 λ = <span class="big">${m.toFixed(1)} nm</span>${cmp(m, he.prm.ref, '参考值', 'nm')}</div>${Unc.html(sum, 'λ', 'nm')}${n % 2 ? '<div class="hint">数据为奇数次，最后一次没有参与逐差。</div>' : ''}</div>`;
            refCheck(out, '测波长', m, he.prm.ref);
            out.ai.push(`测波长：${n} 次读数（N, d）：${r.map(x => `(${x.raw.N}, ${x.raw.d})`).join('、')}；逐差得各组 λ ${lams.map(v => v.toFixed(1)).join('、')} nm，平均 ${m.toFixed(2)} nm；${Unc.line(sum, 'λ', 'nm')}${he.prm.ref ? `；参考值 ${he.prm.ref} nm` : ''}。`);
            out.ok = true;
          }
        }
      }
      if (na.rows.length){
        const r = na.rows, n = r.length;
        out.table += sub('钠光双线：视见度最低时的读数', !he.rows.length) + T(['序号', '读数 d / mm', '与上次间隔 / mm'], r.map((x, i) => [i + 1, x.raw.d, i ? Math.abs(x.d - r[i - 1].d).toFixed(5) : '—']));
        const gaps = r.slice(1).map((x, i) => Math.abs(x.d - r[i].d));
        if (gaps.length >= 2){ const mg = median(gaps); gaps.forEach((g, i) => { if (Math.abs(g - mg) / mg > 0.3) out.issues.push(`钠光双线：第 ${r[i].no}～${r[i + 1].no} 行之间的间隔 ${g.toFixed(4)} mm 与其他间隔（约 ${mg.toFixed(4)} mm）差别大，可能漏记了一次最低或没卡准最模糊的位置`); }); }
        if (n < 4) out.result += '<div class="hint">钠光双线：至少记录 4 次视见度最低的位置。</div>';
        else {
          const items = halves(n).map(([i, j]) => { const k = j - i, dd = Math.abs(r[j].d - r[i].d) / k; return {dd, dl: dd > 0 ? na.prm.lam ** 2 / (2 * dd) * 1e-6 : NaN}; });
          if (items.some(x => !(x.dl > 0))) out.result += '<div class="note">钠光双线：有配对的读数相同，无法计算。</div>';
          else {
            const k = Math.floor(n / 2), ddm = mean(items.map(x => x.dd)), dls = items.map(x => x.dl), m = mean(dls);
            const sum = Unc.summarize(dls, m * Math.SQRT2 * na.prm.inst / Unc.SQRT3 / (ddm * k));
            out.result += `<div class="result">钠光双线：逐差法求相邻两次最低的间距 Δd = ${ddm.toFixed(5)} mm
              <div>Δλ = λ̄²/(2Δd) = <span class="big">${m.toFixed(4)} nm</span>${cmp(m, na.prm.ref, '参考值', 'nm')}</div>${Unc.html(sum, 'Δλ', 'nm')}</div>`;
            refCheck(out, '钠光双线', m, na.prm.ref, 10);
            out.ai.push(`钠光双线：${n} 次最低位置读数 ${r.map(x => x.raw.d).join('、')} mm；Δd = ${ddm.toFixed(5)} mm，Δλ = ${m.toFixed(4)} nm；${Unc.line(sum, 'Δλ', 'nm')}。`);
            out.ok = true;
          }
        }
      }
      return out;
    }};

  /* ---------- 牛顿环与劈尖 ---------- */
  SPECS.newton = {P: 'unr', title: '牛顿环测曲率半径（实测数据）', ai: '牛顿环测平凸透镜曲率半径（及劈尖测细丝直径）',
    principle: `<p>第 k 级暗环直径 D<sub>k</sub> 满足 D<sub>k</sub>² = 4kRλ（理想接触时）。接触点有灰尘或形变时会多出一个常数项，所以用两环之差：<b>R = (D<sub>m</sub>² − D<sub>n</sub>²) / [4(m − n)λ]</b>（逐差法），也可以对 D<sub>k</sub>² − k 作直线拟合，斜率 = 4Rλ。</p>
      <p>不确定度：A 类取各组 R 的平均值标准偏差；B 类由读数显微镜仪器误差限传递，u(D) = √2·Δ<sub>仪</sub>/√3。</p>
      <p>劈尖：相邻暗纹间距 b，棱边到细丝距离 L，细丝直径 <b>d = Lλ/(2b)</b>。</p>`,
    groups: [
      {id: 'ring', name: '牛顿环', desc: '每一行填一个环：级次 k，叉丝在左侧、右侧与该暗环相切时的读数。级次要真实（从中心数起），逐差时按级次从小到大配对。',
        params: [{k: 'lam', label: '光源波长 λ', unit: 'nm', def: '589.3'}, {k: 'inst', label: '读数显微镜仪器误差限', unit: 'mm', def: '0.005'}, {k: 'ref', label: '参考 R（可不填）', unit: 'm', def: '', opt: true}],
        cols: [{k: 'k', label: '级次 k'}, {k: 'L', label: '左侧读数 / mm'}, {k: 'R', label: '右侧读数 / mm'}],
        example: () => [30, 29, 28, 27, 26, 25, 24, 23, 22, 21].map((k, i) => { const h = Math.sqrt((k - 0.3) * 1.05e3 * 589.3e-6); return [String(k), (25.012 - h + nz(i, 0.004)).toFixed(3), (25.012 + h + nz(i + 7, 0.004)).toFixed(3)]; })},
      {id: 'wedge', name: '劈尖（选做）', desc: '从棱边附近开始，每隔相同条数（如 10 条）暗纹记一次位置；再在参数里填棱边和细丝的位置。',
        params: [{k: 'lam', label: '光源波长 λ', unit: 'nm', def: '589.3'}, {k: 'inst', label: '仪器误差限', unit: 'mm', def: '0.005'}, {k: 'xe', label: '棱边位置', unit: 'mm', def: ''}, {k: 'xw', label: '细丝位置', unit: 'mm', def: ''}],
        cols: [{k: 'N', label: '暗纹序号 N'}, {k: 'x', label: '位置 x / mm'}],
        example: () => [...Array(8)].map((_, i) => [String(i * 10), (6.204 + i * 10 * 0.1652 + nz(i, 0.003)).toFixed(3)]), exParams: {xe: '5.318', xw: '38.976'}}],
    process(D){
      const out = {table: '', result: '', issues: [], ai: [], ok: false};
      const g = D('ring'), w = D('wedge');
      if (g.rows.length){
        const lam = g.prm.lam * 1e-6, r = g.rows.map(x => ({...x, D: Math.abs(x.R - x.L), mid: (x.R + x.L) / 2})).sort((a, b) => a.k - b.k);
        out.table += sub('牛顿环：各环直径', true) + T(['级次 k', '左侧 / mm', '右侧 / mm', 'D<sub>k</sub> / mm', 'D<sub>k</sub>² / mm²'], r.slice().reverse().map(x => [x.raw.k, x.raw.L, x.raw.R, x.D.toFixed(3), (x.D ** 2).toFixed(4)]));
        if (new Set(r.map(x => x.k)).size < r.length) out.issues.push('牛顿环：有重复的级次 k');
        const mids = r.map(x => x.mid), spread = Math.max(...mids) - Math.min(...mids);
        if (spread > 0.05) out.issues.push(`牛顿环：各环左右读数的中点相差 ${spread.toFixed(3)} mm，测量过程中装置或显微镜可能移动过，或者叉丝没有沿直径移动`);
        r.slice(1).forEach((x, i) => { if (x.D <= r[i].D) out.issues.push(`牛顿环：第 ${x.k} 级的直径不大于第 ${r[i].k} 级，可能读错或级次填错`); });
        if (r.length < 4) out.result += '<div class="hint">牛顿环：至少需要 4 个环才能用逐差法，建议 10 个。</div>';
        else {
          const uD = Math.SQRT2 * g.prm.inst / Unc.SQRT3;
          const items = halves(r.length).map(([i, j]) => { const a = r[i], b = r[j]; return {n: a.k, m: b.k, R: (b.D ** 2 - a.D ** 2) / (4 * (b.k - a.k) * lam) / 1000, uB: Math.hypot(2 * b.D * uD, 2 * a.D * uD) / (4 * Math.abs(b.k - a.k) * lam) / 1000}; });
          if (items.some(x => !(x.R > 0))) { out.result += '<div class="note">牛顿环：有一组 D<sub>m</sub>² − D<sub>n</sub>² ≤ 0，无法计算，请检查读数和级次。</div>'; out.issues.push('牛顿环：逐差出现 D_m² − D_n² ≤ 0'); }
          else {
            const Rs = items.map(x => x.R), sum = Unc.summarize(Rs, mean(items.map(x => x.uB))), m = sum.mean;
            const f = linfit(r.map(x => x.k), r.map(x => x.D ** 2)), Rf = f ? f.b / (4 * lam) / 1000 : null, uRf = f && f.sb != null ? f.sb / (4 * lam) / 1000 : null;
            out.result += `<div class="result">牛顿环：逐差法各组 R：${items.map(x => `${x.m}−${x.n}：${x.R.toFixed(4)}`).join('、')} m
              <div>平均 R = <span class="big">${m.toFixed(4)} m</span>${cmp(m, g.prm.ref, '参考值', 'm')}</div>${Unc.html(sum, 'R', 'm')}
              ${f ? `<div>对照：D<sub>k</sub>² 对 k 直线拟合，斜率 ${f.b.toFixed(4)} mm²，R = ${fmtU(Rf, uRf, 'm')}，截距 ${f.a.toFixed(4)} mm²，R² = ${f.r2.toFixed(5)}${Math.abs(f.a) > 0.05 * f.b ? '（截距不为零，说明接触处有灰尘或形变，正是要用逐差法的原因）' : ''}</div>` : ''}
              <canvas class="chart" data-plot="nr"></canvas></div>`;
            out.charts = [cv => plot(cv, {pts: r.map(x => [x.k, x.D ** 2]), fit: f ? k => f.a + f.b * k : null, xl: '级次 k', yl: 'D² / mm²'})];
            if (f && f.r2 < 0.999) out.issues.push(`牛顿环：D² 与 k 的线性不太好（R² = ${f.r2.toFixed(4)}），有的环可能读错`);
            refCheck(out, '牛顿环', m, g.prm.ref);
            out.ai.push(`牛顿环：λ = ${g.prm.lam} nm；各环（k, 左, 右）：${r.map(x => `(${x.raw.k}, ${x.raw.L}, ${x.raw.R})`).join('、')}；逐差各组 R ${Rs.map(v => v.toFixed(4)).join('、')} m；${Unc.line(sum, 'R', 'm')}；直线拟合 R = ${Rf != null ? Rf.toFixed(4) : '—'} m，截距 ${f ? f.a.toFixed(4) : '—'} mm²。`);
            out.ok = true;
          }
        }
      }
      if (w.rows.length){
        const lam = w.prm.lam * 1e-6, r = w.rows.slice().sort((a, b) => a.N - b.N);
        out.table += sub('劈尖：暗纹位置', !g.rows.length) + T(['暗纹序号 N', '位置 x / mm'], r.map(x => [x.raw.N, x.raw.x]));
        out.table += `<div class="hint">棱边位置 ${w.raw.xe || '未填'} mm，细丝位置 ${w.raw.xw || '未填'} mm</div>`;
        if (r.length < 4) out.result += '<div class="hint">劈尖：至少记 4 个暗纹位置。</div>';
        else {
          const items = halves(r.length).map(([i, j]) => { const dN = r[j].N - r[i].N; return dN ? Math.abs(r[j].x - r[i].x) / dN : NaN; });
          if (items.some(v => !(v > 0))) out.result += '<div class="note">劈尖：有配对的暗纹序号相同，无法计算。</div>';
          else {
            const dNm = mean(halves(r.length).map(([i, j]) => r[j].N - r[i].N)), sum = Unc.summarize(items, Math.SQRT2 * w.prm.inst / Unc.SQRT3 / dNm), b = sum.mean;
            let h = `<div class="result">劈尖：条纹间距（逐差法）b = ${fmtU(b, sum.u, 'mm')}`;
            if (w.prm.xe != null && w.prm.xw != null){
              const L = Math.abs(w.prm.xw - w.prm.xe), uL = Math.SQRT2 * w.prm.inst / Unc.SQRT3, d = L * lam / (2 * b), ud = d * Math.hypot(uL / L, sum.u / b);
              h += `<div>棱边到细丝 L = ${L.toFixed(3)} mm，细丝直径 d = Lλ/(2b) = <span class="big">${(d * 1000).toFixed(2)} µm</span></div>` +
                finalBlock(`不确定度：u(b) = ${p3(sum.u)} mm，u(L) = ${p3(uL)} mm，u(d)/d = √[(u(L)/L)² + (u(b)/b)²]`, 'd', d * 1000, ud * 1000, 'µm');
              out.ai.push(`劈尖：暗纹（N, x）${r.map(x => `(${x.raw.N}, ${x.raw.x})`).join('、')}；b = ${b.toFixed(5)} mm，L = ${L.toFixed(3)} mm，d = ${(d * 1000).toFixed(2)} µm ± ${(ud * 1000).toFixed(2)} µm。`);
              out.ok = true;
            } else h += '<div class="hint">在参数里填写棱边和细丝的位置后计算细丝直径。</div>';
            out.result += h + '</div>';
          }
        }
      }
      return out;
    }};

  /* ---------- 分光计与光栅 ---------- */
  const ANG = k => ({k, kind: 'ang'});
  SPECS.grating = {P: 'usp', title: '分光计测光栅常数与谱线波长（实测数据）', ai: '分光计测光栅常数（汞灯）及未知谱线波长',
    principle: `<p>平行光垂直入射光栅时，第 k 级主极大满足 d·sinφ = kλ。用左右两个游标分别读出 +1 级和 −1 级的角位置，<b>φ = (|θ₁ − θ₁′| + |θ₂ − θ₂′|)/4</b>，两个游标取平均消除度盘偏心差。</p>
      <p>先用已知波长（如汞绿线 546.1 nm）求光栅常数 <b>d = λ/sinφ</b>，再测其他谱线：<b>λ = d·sinφ</b>。</p>
      <p>不确定度：B 类 u(φ) = Δ<sub>仪</sub>/(2√3)，按 d = λ/sinφ 传递为 d·cotφ·u(φ)；待测波长由 u(d)·sinφ 与 d·cosφ·u(φ) 合成。</p>
      <p>角度可以写成 164°31′、164 31 或 164.52（度）。</p>`,
    groups: [
      {id: 'cal', name: '测光栅常数', desc: '用已知谱线测量。每一行是一次完整测量：+1 级时左、右游标读数，−1 级时左、右游标读数。建议重复 3 次。',
        params: [{k: 'lam', label: '已知谱线波长', unit: 'nm', def: '546.1'}, {k: 'inst', label: '游标仪器误差限', unit: '′', def: '1'}, {k: 'lines', label: '标称线数（可不填）', unit: '线/mm', def: '600', opt: true}],
        cols: [{...ANG('t1'), label: '+1 级 左游标 θ₁'}, {...ANG('t2'), label: '+1 级 右游标 θ₂'}, {...ANG('t1p'), label: '−1 级 左游标 θ₁′'}, {...ANG('t2p'), label: '−1 级 右游标 θ₂′'}],
        example: () => [0, 1, 2].map(i => { const z = 150.2 + i * 0.03, ph = 19.1340 + nz(i, 0.02); return [z + ph, z + 180 + ph + nz(i + 5, 0.02), z - ph, z + 180 - ph].map(v => dms(v)); })},
      {id: 'unk', name: '测谱线波长', desc: '光栅常数测好后，对其他谱线同样读 +1、−1 级左右游标。每行一条谱线，名称和参考波长可以不填。',
        params: [],
        cols: [{k: 'name', label: '谱线', kind: 'text', opt: true}, {k: 'ref', label: '参考波长 / nm', opt: true}, {...ANG('t1'), label: '+1 级 θ₁'}, {...ANG('t2'), label: '+1 级 θ₂'}, {...ANG('t1p'), label: '−1 级 θ₁′'}, {...ANG('t2p'), label: '−1 级 θ₂′'}],
        example: () => [['紫', 404.7], ['蓝紫', 435.8], ['黄', 577.0], ['黄', 579.1]].map(([n, l], i) => { const z = 150.21, ph = deg(Math.asin(l / 1666.9)) + nz(i, 0.015); return [n, String(l), ...[z + ph, z + 180 + ph, z - ph, z + 180 - ph].map(v => dms(v))]; })}],
    process(D){
      const out = {table: '', result: '', issues: [], ai: [], ok: false};
      const c = D('cal'), u = D('unk');
      const phiOf = x => (angDiff(x.t1, x.t1p) + angDiff(x.t2, x.t2p)) / 4;
      const check = (x, tag) => {
        const a = angDiff(x.t1, x.t1p), b = angDiff(x.t2, x.t2p);
        if (Math.abs(a - b) * 60 > 6) out.issues.push(`${tag}：左右两个游标得到的 2φ 相差 ${(Math.abs(a - b) * 60).toFixed(0)}′（一般只差几分），可能读错或抄错游标`);
        if (Math.abs(angDiff(x.t1, x.t2) - 180) > 2) out.issues.push(`${tag}：+1 级左右游标读数相差不是约 180°（${angDiff(x.t1, x.t2).toFixed(1)}°），可能抄错`);
      };
      let d = null, ud = null, uPhi = null;
      if (c.rows.length){
        const lam = c.prm.lam, inst = c.prm.inst / 60;
        const items = c.rows.map(x => { const phi = phiOf(x); return {...x, phi, d: phi > 0 ? lam / Math.sin(rad(phi)) : NaN}; });
        items.forEach(x => check(x, `光栅常数第 ${x.no} 行`));
        out.table += sub('测光栅常数（已知谱线 ' + lam + ' nm）', true) + T(['次数', 'θ₁', 'θ₂', 'θ₁′', 'θ₂′', 'φ', 'd / nm'], items.map((x, i) => [i + 1, x.raw.t1, x.raw.t2, x.raw.t1p, x.raw.t2p, dms(x.phi), Number.isFinite(x.d) ? x.d.toFixed(1) : '—']));
        const ok = items.filter(x => x.d > 0 && Number.isFinite(x.d));
        if (items.length > ok.length) out.issues.push('光栅常数：有的行 +1 级与 −1 级读数相同（φ = 0），无法计算，可能抄错了');
        if (ok.length){
          uPhi = rad(inst / (2 * Unc.SQRT3));
          const m = mean(ok.map(x => x.d)), sum = Unc.summarize(ok.map(x => x.d), m / Math.tan(rad(mean(ok.map(x => x.phi)))) * uPhi);
          d = sum.mean; ud = sum.u;
          const nom = c.prm.lines ? 1e6 / c.prm.lines : null;
          out.result += `<div class="result">光栅常数：各次 ${ok.map(x => x.d.toFixed(1)).join('、')} nm
            <div>平均 d = <span class="big">${d.toFixed(1)} nm</span>（约 ${(1e6 / d).toFixed(1)} 线/mm）${nom ? cmp(d, +nom.toFixed(1), '标称', 'nm') : ''}</div>${Unc.html(sum, 'd', 'nm')}${ok.length < 3 ? '<div class="hint">建议重复测量 3 次以上，A 类不确定度才有意义。</div>' : ''}</div>`;
          if (nom) refCheck(out, '光栅常数', d, nom, 3);
          out.ai.push(`光栅常数：已知谱线 ${lam} nm；各次（θ₁, θ₂, θ₁′, θ₂′）：${items.map(x => `(${x.raw.t1}, ${x.raw.t2}, ${x.raw.t1p}, ${x.raw.t2p})`).join('；')}；φ = ${items.map(x => dms(x.phi)).join('、')}；d = ${d.toFixed(2)} nm；${Unc.line(sum, 'd', 'nm')}${nom ? `；标称 ${nom.toFixed(1)} nm` : ''}。`);
          out.ok = true;
        }
      }
      if (u.rows.length){
        const items = u.rows.map(x => { const phi = phiOf(x); return {...x, phi}; });
        items.forEach(x => check(x, `谱线 ${x.raw.name || '第 ' + x.no + ' 行'}`));
        if (d == null){
          out.table += sub('测谱线波长', !c.rows.length) + T(['谱线', 'θ₁', 'θ₂', 'θ₁′', 'θ₂′', 'φ'], items.map(x => [esc(x.raw.name || '—'), x.raw.t1, x.raw.t2, x.raw.t1p, x.raw.t2p, dms(x.phi)]));
          out.result += '<div class="hint">先在“测光栅常数”里录入已知谱线的数据，才能计算未知谱线的波长。</div>';
        } else {
          const res = items.map(x => { const p = rad(x.phi), lam = d * Math.sin(p), uu = Math.hypot(ud * Math.sin(p), d * Math.cos(p) * uPhi); return {...x, lam, u: uu}; });
          out.table += sub('测谱线波长', false) + T(['谱线', 'θ₁', 'θ₂', 'θ₁′', 'θ₂′', 'φ', 'λ / nm'], res.map(x => [esc(x.raw.name || '—'), x.raw.t1, x.raw.t2, x.raw.t1p, x.raw.t2p, dms(x.phi), x.lam.toFixed(1)]));
          out.result += `<div class="result">谱线波长 λ = d̄·sinφ（不确定度由 u(d)·sinφ 与 d̄·cosφ·u(φ) 合成）：` +
            res.map(x => `<div class="unc"><div class="final">${esc(x.raw.name || '谱线')}：<b>λ = ${Unc.format(x.lam, x.u, 'nm').text}</b>${x.ref ? `，参考 ${x.ref} nm，相对偏差 ${pct((x.lam - x.ref) / x.ref * 100)}` : ''}</div></div>`).join('') + '</div>';
          res.forEach(x => { if (x.ref && Math.abs(x.lam - x.ref) > 3 * x.u + 0.5) out.issues.push(`谱线 ${x.raw.name || ''}：测得 ${x.lam.toFixed(1)} nm，与参考 ${x.ref} nm 的差超出不确定度范围`); });
          out.ai.push(`谱线：${res.map(x => `${x.raw.name || '?'} φ = ${dms(x.phi)}，λ = ${x.lam.toFixed(2)} ± ${x.u.toFixed(2)} nm${x.ref ? `（参考 ${x.ref}）` : ''}`).join('；')}。`);
          out.ok = true;
        }
      }
      return out;
    }};

  /* ---------- 光纤 ---------- */
  SPECS.fiber = {P: 'ufb', title: '光纤耦合效率、弯曲损耗与远场发散角（实测数据）', ai: '光纤耦合效率、弯曲损耗与远场发散角',
    principle: `<p><b>耦合效率</b> η = P<sub>出</sub>/P<sub>入</sub>，耦合损耗 = −10·lg η（dB）。</p>
      <p><b>弯曲损耗</b>：光纤在半径 R 的圆柱上绕 N 圈，与伸直时的基准 P₀ 比较，每圈损耗 L = 10·lg(P₀/P)/N（dB/圈）。绕前、取下后各测一次基准，变化不应超过 3%。损耗随 R 近似按 L ∝ √R·e<sup>−cR</sup> 变化，对 ln(L/√R) − R 作直线拟合求 c。</p>
      <p><b>远场发散角</b>：在不同距离 L 处测光斑半径 r，直线拟合斜率即半发散角 θ；单模光纤的模场直径 MFD ≈ 2λ/(πθ)。</p>`,
    groups: [
      {id: 'cpl', name: '耦合效率', desc: '每次调好耦合后，记入射到光纤前的功率和光纤出射功率（单位相同即可）。',
        params: [{k: 'acc', label: '功率计误差限', unit: '%', def: '3'}],
        cols: [{k: 'Pin', label: '入射功率 P<sub>入</sub>'}, {k: 'Pout', label: '出射功率 P<sub>出</sub>'}],
        example: () => [[1000, 612.4], [998, 618.9], [1001, 609.5]].map(r => r.map(String))},
      {id: 'bend', name: '弯曲损耗', desc: '每一行：弯曲半径 R、圈数 N、绕之前的基准 P₀、绕上后的功率 P、取下后复测的基准（可不填）。',
        params: [{k: 'drift', label: '基准允许变化', unit: '%', def: '3'}],
        cols: [{k: 'R', label: '半径 R / mm'}, {k: 'N', label: '圈数 N'}, {k: 'P0', label: '基准 P₀'}, {k: 'P', label: '绕上后 P'}, {k: 'P0b', label: '取下后基准', opt: true}],
        example: () => [[3.5, 1], [4, 1], [4.5, 2], [5, 2], [5.5, 3], [6, 3]].map(([R, N], i) => { const L = 9.5 * Math.sqrt(R) * Math.exp(-0.78 * R) * (1 + nz(i, 0.04)), P0 = 702 + nz(i + 2, 4); return [String(R), String(N), P0.toFixed(1), (P0 * 10 ** (-L * N / 10)).toFixed(2), (P0 + nz(i + 9, 6)).toFixed(1)]; })},
      {id: 'far', name: '远场发散角', desc: '在导轨上不同位置放白屏（或探测器），测光斑半径（光强降到 1/e² 处，或按你的实验约定）。',
        params: [{k: 'lam', label: '波长 λ', unit: 'nm', def: '632.8'}, {k: 'res', label: '光斑测量分度', unit: 'mm', def: '0.05'}],
        cols: [{k: 'L', label: '位置 L / mm'}, {k: 'r', label: '光斑半径 r / mm'}],
        example: () => [20, 25, 30, 35, 40, 45, 50].map((L, i) => [String(L), (0.25 + L * 0.0771 + nz(i, 0.03)).toFixed(2)])}],
    process(D){
      const out = {table: '', result: '', issues: [], ai: [], ok: false};
      const c = D('cpl'), b = D('bend'), f = D('far');
      if (c.rows.length){
        const it = c.rows.map(x => ({...x, eta: x.Pout / x.Pin}));
        out.table += sub('耦合效率', true) + T(['次数', 'P<sub>入</sub>', 'P<sub>出</sub>', 'η', '损耗 / dB'], it.map((x, i) => [i + 1, x.raw.Pin, x.raw.Pout, (x.eta * 100).toFixed(1) + '%', (-10 * Math.log10(x.eta)).toFixed(2)]));
        if (it.some(x => !(x.eta > 0) || x.eta > 1)) { out.issues.push('耦合效率：有效率不在 0～100% 之间，检查是否填反了入射和出射功率'); out.result += '<div class="note">耦合效率：有一行的效率不在 0～100% 之间。</div>'; }
        else {
          const sum = Unc.summarize(it.map(x => x.eta * 100), mean(it.map(x => x.eta * 100)) * Math.SQRT2 * c.prm.acc / 100 / Unc.SQRT3);
          out.result += `<div class="result">耦合效率：平均 η = <span class="big">${sum.mean.toFixed(1)}%</span>，耦合损耗 ${(-10 * Math.log10(sum.mean / 100)).toFixed(2)} dB${Unc.html(sum, 'η', '%')}</div>`;
          out.ai.push(`耦合效率：${it.map(x => `${x.raw.Pin}→${x.raw.Pout}`).join('、')}，平均 ${sum.mean.toFixed(1)}%。`);
          out.ok = true;
        }
      }
      if (b.rows.length){
        const it = b.rows.map(x => { const P0 = x.P0b != null ? (x.P0 + x.P0b) / 2 : x.P0, drift = x.P0b != null ? (x.P0b - x.P0) / x.P0 * 100 : null, dB = 10 * Math.log10(P0 / x.P);
          const flag = drift != null && Math.abs(drift) > b.prm.drift ? `基准变化 ${pct(drift)}，耦合变了，应重测` : !(dB > 0) ? '绕上后功率不小于基准' : dB < 0.2 ? '损耗不到 0.2 dB，误差大，可多绕几圈' : '';
          return {...x, P0m: P0, drift, dB, L: dB / x.N, flag, use: !flag || flag.startsWith('损耗不到')}; });
        out.table += sub('弯曲损耗', !c.rows.length) + T(['R / mm', 'N', 'P₀', 'P', '复测基准', 'L / (dB/圈)', '说明'], it.map(x => Object.assign([x.raw.R, x.raw.N, x.raw.P0, x.raw.P, x.raw.P0b || '—', Number.isFinite(x.L) ? x.L.toFixed(3) : '—', x.flag || (x.drift != null ? `基准变化 ${pct(x.drift)}` : '未复测基准')], {warn: !x.use})));
        it.filter(x => x.flag).forEach(x => out.issues.push(`弯曲损耗 R = ${x.raw.R} mm：${x.flag}`));
        if (it.some(x => x.P0b == null)) out.issues.push('弯曲损耗：有的测量没有在取下后复测基准，无法确认耦合是否稳定');
        const byR = {}; it.filter(x => x.use && x.L > 0).forEach(x => (byR[x.R] = byR[x.R] || []).push(x.L));
        const pts = Object.keys(byR).map(Number).sort((a, z) => a - z).map(R => [R, mean(byR[R])]);
        let h = `<div class="result">弯曲损耗：各半径每圈损耗 ${pts.map(p => `R = ${p[0]} mm：${p[1].toFixed(3)} dB/圈`).join('；') || '—'}`;
        if (pts.length >= 3){
          const fit = linfit(pts.map(p => p[0]), pts.map(p => Math.log(p[1] / Math.sqrt(p[0]))));
          if (fit && fit.b < 0){
            const cc = -fit.b, Lf = R => Math.exp(fit.a) * Math.sqrt(R) * Math.exp(fit.b * R);
            let lo = 0.5, hi = 100; for (let k = 0; k < 60; k++){ const m = (lo + hi) / 2; if (Lf(m) > 0.1) lo = m; else hi = m; }
            h += `<div>拟合 ln(L/√R) = a − cR：c = ${fmtU(cc, fit.sb, 'mm⁻¹')}，R² = ${fit.r2.toFixed(4)}；每圈损耗降到 0.1 dB 的半径约 <span class="big">${((lo + hi) / 2).toFixed(1)} mm</span></div><canvas class="chart" data-plot="fb"></canvas>`;
            out.charts = (out.charts || []).concat([cv => plot(cv, {pts, fit: Lf, xl: 'R / mm', yl: 'L / (dB/圈)'})]);
            out.ai.push(`弯曲损耗：${it.map(x => `R=${x.raw.R} N=${x.raw.N} P₀=${x.raw.P0} P=${x.raw.P} 复测=${x.raw.P0b || '无'}`).join('；')}；拟合 c = ${cc.toFixed(3)} mm⁻¹，R² = ${fit.r2.toFixed(4)}。`);
            out.ok = true;
          } else h += '<div class="note">损耗没有随半径增大而减小，无法拟合，检查数据。</div>';
        } else h += '<div class="hint">至少需要 3 个不同半径的有效数据才能拟合。</div>';
        out.result += h + '</div>';
      }
      if (f.rows.length){
        const r = f.rows.slice().sort((a, z) => a.L - z.L);
        out.table += sub('远场：光斑半径', !c.rows.length && !b.rows.length) + T(['位置 L / mm', '半径 r / mm'], r.map(x => [x.raw.L, x.raw.r]), 'plt');
        const fit = r.length >= 3 ? linfit(r.map(x => x.L), r.map(x => x.r)) : null;
        if (!fit) out.result += '<div class="hint">远场：至少需要 3 个不同位置。</div>';
        else if (!(fit.b > 0)) out.result += '<div class="note">远场：光斑没有随距离变大，检查数据。</div>';
        else {
          const th = fit.b, uB = f.prm.res / Unc.SQRT3 / Math.sqrt(fit.sxx), u = Unc.combine(fit.sb, uB), lam = f.prm.lam * 1e-6, mfd = 2 * lam / (Math.PI * th);
          out.result += `<div class="result">远场：r 对 L 直线拟合，R² = ${fit.r2.toFixed(4)}
            <div>半发散角 θ = <span class="big">${(th * 1000).toFixed(1)} mrad</span>（${deg(th).toFixed(2)}°），模场直径 MFD ≈ 2λ/(πθ) = ${(mfd * 1000).toFixed(2)} µm</div>
            ${finalBlock(`不确定度：u<sub>A</sub>(θ) = ${fit.sb != null ? p3(fit.sb * 1000) + ' mrad' : '—'}（拟合），u<sub>B</sub>(θ) = ${p3(uB * 1000)} mrad（分度 ${f.prm.res} mm）`, 'θ', th * 1000, u * 1000, 'mrad')}
            <canvas class="chart" data-plot="far"></canvas></div>`;
          out.charts = (out.charts || []).concat([cv => plot(cv, {pts: r.map(x => [x.L, x.r]), fit: L => fit.a + fit.b * L, xl: 'L / mm', yl: 'r / mm'})]);
          if (fit.r2 < 0.995) out.issues.push(`远场：r 与 L 的线性不太好（R² = ${fit.r2.toFixed(4)}），可能有的光斑量错，或离光纤端面太近还没到远场`);
          out.ai.push(`远场：（L, r）${r.map(x => `(${x.raw.L}, ${x.raw.r})`).join('、')}；θ = ${(th * 1000).toFixed(2)} ± ${(u * 1000).toFixed(2)} mrad，MFD ≈ ${(mfd * 1000).toFixed(2)} µm。`);
          out.ok = true;
        }
      }
      return out;
    }};

  /* ---------- 偏振 ---------- */
  SPECS.polar = {P: 'upl', title: '马吕斯定律与波片（实测数据）', ai: '验证马吕斯定律并鉴别波片',
    principle: `<p><b>马吕斯定律</b>：I = I<sub>min</sub> + (I<sub>max</sub> − I<sub>min</sub>)·cos²(θ − θ<sub>∥</sub>)。写成 I = a₀ + a₁cos2θ + a₂sin2θ 作线性最小二乘拟合，求出 I<sub>max</sub>、I<sub>min</sub>、消光比和检偏器与起偏器平行时的读数 θ<sub>∥</sub>。</p>
      <p><b>波片</b>：起偏、检偏正交消光后放入波片，转到消光位置，再把波片转过 α，转动检偏器找出射光的 I<sub>max</sub>、I<sub>min</sub>。理想 λ/4 波片的 I<sub>min</sub>/I<sub>max</sub> = min(tan²α, cot²α)（α = 45° 时为圆偏振，比值为 1）；理想 λ/2 波片出射线偏振光，比值接近 0。</p>`,
    groups: [
      {id: 'malus', name: '马吕斯定律', desc: '检偏器转一圈或半圈，每隔 10°～20° 记一次光强。角度分布要超过半圈。',
        params: [{k: 'inst', label: '转盘仪器误差限', unit: '°', def: '0.1'}],
        cols: [{k: 'th', label: '检偏器角度 θ / °'}, {k: 'I', label: '光强 I'}],
        example: () => [...Array(19)].map((_, i) => { const th = i * 10; return [String(th), (2.1 + 468 * Math.cos(rad(th - 23.4)) ** 2 + nz(i, 3)).toFixed(1)]; })},
      {id: 'plate', name: '波片（选做）', desc: 'α 为波片从消光位置转过的角度；每个 α 转动检偏器，记出射光的最大和最小光强。',
        params: [],
        cols: [{k: 'a', label: '波片转角 α / °'}, {k: 'Imax', label: 'I<sub>max</sub>'}, {k: 'Imin', label: 'I<sub>min</sub>'}],
        example: () => [15, 30, 45, 60, 75].map((a, i) => { const s2 = Math.sin(rad(a)) ** 2, c2 = 1 - s2, hi = Math.max(s2, c2), lo = Math.min(s2, c2); return [String(a), (300 * hi + nz(i, 2)).toFixed(1), (300 * lo + 1.5 + nz(i + 4, 1.5)).toFixed(1)]; })}],
    process(D){
      const out = {table: '', result: '', issues: [], ai: [], ok: false};
      const m = D('malus'), p = D('plate');
      if (m.rows.length){
        const r = m.rows;
        out.table += sub('马吕斯定律', true) + T(['θ / °', 'I'], r.map(x => [x.raw.th, x.raw.I]));
        const a180 = r.map(x => ((x.th % 180) + 180) % 180).sort((a, b) => a - b), gaps = a180.map((v, i) => (i ? v - a180[i - 1] : v + 180 - a180[a180.length - 1]));
        if (r.length < 6 || Math.max(...gaps) > 60) out.result += '<div class="hint">马吕斯定律：至少需要 6 个点，并且角度要分布在半圈以上（相邻间隔不超过 60°）才能拟合。</div>';
        else {
          const X = r.map(x => [1, Math.cos(rad(2 * x.th)), Math.sin(rad(2 * x.th))]), y = r.map(x => x.I);
          const M = [0, 1, 2].map(i => [0, 1, 2].map(j => X.reduce((q, x) => q + x[i] * x[j], 0))), bv = [0, 1, 2].map(i => X.reduce((q, x, k) => q + x[i] * y[k], 0));
          const sol = solve(M, bv), Mi = inv(M);
          if (sol && Mi){
            const [a0, a1, a2] = sol, C = Math.hypot(a1, a2), res = y.map((v, k) => v - (a0 + a1 * X[k][1] + a2 * X[k][2])), ss = res.reduce((q, v) => q + v * v, 0), n = r.length, s2 = ss / (n - 3);
            const v11 = Mi[1][1] * s2, v22 = Mi[2][2] * s2, v12 = Mi[1][2] * s2;
            const uA = deg(0.5 * Math.sqrt(Math.max(0, a1 * a1 * v22 + a2 * a2 * v11 - 2 * a1 * a2 * v12)) / (C * C)), uB = m.prm.inst / Unc.SQRT3, u = Unc.combine(uA, uB);
            const my = mean(y), r2 = 1 - ss / y.reduce((q, v) => q + (v - my) ** 2, 0), par = ((deg(0.5 * Math.atan2(a2, a1)) % 180) + 180) % 180;
            const Imax = a0 + C, Imin = a0 - C, sd = Math.sqrt(s2), peak = Math.max(...y.map(Math.abs));
            const fail = !(peak > 0) ? '光强全部为零：检查光源是否打开、光路是否被遮挡、功率计是否接好、探头是否对准，以及量程是否太大'
              : !(C > 3 * sd) || !(C > 0.05 * Math.abs(a0)) ? `光强几乎不随检偏器角度变化（调制幅度 ${sig(C, 3)}，读数离散 ${sig(sd, 3)}）：检查起偏器是否装上、检偏器是否真的在转动、杂散光是否太强，以及功率计是否饱和（量程太小）`
              : ![par, u, Imax, Imin].every(Number.isFinite) ? '拟合得到的结果不是有限值，检查数据' : '';
            if (fail){
              out.result += `<div class="result"><div class="note"><b>马吕斯定律：无法确定平行位置。</b>${fail}。这组数据不能作为实验结论。</div></div>`;
              out.issues.push('马吕斯定律：无法确定平行位置——' + fail);
              out.ai.push(`马吕斯定律：（θ, I）${r.map(x => `(${x.raw.th}, ${x.raw.I})`).join('、')}；程序判定无法确定平行位置：${fail}。`);
            } else {
            out.result += `<div class="result">马吕斯定律：最小二乘拟合 I = I<sub>min</sub> + (I<sub>max</sub> − I<sub>min</sub>)·cos²(θ − θ<sub>∥</sub>)
              <div>I<sub>max</sub> = ${Imax.toFixed(2)}，I<sub>min</sub> = ${Imin.toFixed(2)}，消光比 ${(Imin / Imax * 100).toFixed(2)}%，R² = ${r2.toFixed(5)}</div>
              <div>平行位置 θ<sub>∥</sub> = <span class="big">${par.toFixed(2)}°</span>（正交消光位置 ${((par + 90) % 180).toFixed(2)}°）</div>
              ${finalBlock(`不确定度：u<sub>A</sub> = ${p3(uA)}°（拟合协方差），u<sub>B</sub> = ${p3(uB)}°（转盘 ${m.prm.inst}°）`, 'θ<sub>∥</sub>', par, u, '°')}
              <canvas class="chart" data-plot="ml"></canvas></div>`;
            out.charts = [cv => plot(cv, {pts: r.map(x => [Math.cos(rad(x.th - par)) ** 2, x.I]), fit: t => Imin + (Imax - Imin) * t, xl: 'cos²(θ − θ∥)', yl: 'I'})];
            if (r2 < 0.995) out.issues.push(`马吕斯定律：拟合 R² = ${r2.toFixed(4)}，偏离 cos² 关系较明显，检查是否有读数错误或光源不稳定`);
            if (Imin / Imax > 0.02) out.issues.push(`马吕斯定律：消光比 ${(Imin / Imax * 100).toFixed(1)}% 偏大，可能有杂散光进入探测器，或偏振片质量不好`);
            res.forEach((v, k) => { if (Math.abs(v) > 3 * Math.sqrt(s2) && Math.abs(v) > 0.02 * Imax) out.issues.push(`马吕斯定律：θ = ${r[k].raw.th}° 的光强偏离拟合曲线较大，可能读错`); });
            if (Imin < -3 * sd) out.issues.push(`马吕斯定律：拟合的 I_min = ${Imin.toFixed(2)} 明显小于 0，功率计可能没有调零或扣除本底时扣多了`);
            out.ai.push(`马吕斯定律：（θ, I）${r.map(x => `(${x.raw.th}, ${x.raw.I})`).join('、')}；Imax = ${Imax.toFixed(2)}，Imin = ${Imin.toFixed(2)}，R² = ${r2.toFixed(5)}，θ∥ = ${par.toFixed(2)}° ± ${u.toFixed(2)}°。`);
            out.ok = true;
            }
          }
        }
      }
      if (p.rows.length){
        const it = p.rows.map(x => { const ratio = Math.min(x.Imin, x.Imax) / Math.max(x.Imin, x.Imax), t2 = Math.tan(rad(x.a)) ** 2; return {...x, ratio, q: Math.min(t2, 1 / t2)}; });
        out.table += sub('波片', !m.rows.length) + T(['α / °', 'I<sub>max</sub>', 'I<sub>min</sub>', 'I<sub>min</sub>/I<sub>max</sub>', 'λ/4 理论', 'λ/2 理论'], it.map(x => [x.raw.a, x.raw.Imax, x.raw.Imin, x.ratio.toFixed(3), x.q.toFixed(3), '0']));
        it.forEach(x => { if (!(x.Imin >= 0) || x.Imin > x.Imax * 1.05) out.issues.push(`波片 α = ${x.raw.a}°：I_min 明显大于 I_max 或为负，检查是否填反`); });
        const rq = Math.sqrt(mean(it.map(x => (x.ratio - x.q) ** 2))), rh = Math.sqrt(mean(it.map(x => x.ratio ** 2)));
        const verdict = it.length < 2 ? '至少测 2 个不同的 α 才能判断' : rq < rh * 0.5 ? '更接近 <b>λ/4 波片</b>' : rh < rq * 0.5 ? '更接近 <b>λ/2 波片</b>' : '两种理论都不太吻合，建议补测 α = 45° 附近的数据';
        const near45 = it.find(x => Math.abs(x.a % 90 - 45) < 5);
        out.result += `<div class="result">波片：测量比值与 λ/4 理论的均方根偏差 ${rq.toFixed(3)}，与 λ/2 理论的 ${rh.toFixed(3)}；${verdict}。${near45 ? `α ≈ 45° 时比值 ${near45.ratio.toFixed(3)}（λ/4 波片应接近 1）。` : '<span class="hint">还没测 α ≈ 45° 的位置，这一点最能区分两种波片。</span>'}</div>`;
        out.ai.push(`波片：（α, Imax, Imin）${it.map(x => `(${x.raw.a}, ${x.raw.Imax}, ${x.raw.Imin})`).join('、')}；与 λ/4 理论偏差 ${rq.toFixed(3)}，与 λ/2 理论偏差 ${rh.toFixed(3)}。`);
        if (it.length >= 2) out.ok = true;
      }
      return out;
    }};

  /* ---------- 半导体激光器与光电二极管 ---------- */
  SPECS.laser = {P: 'uld', title: '半导体激光器 P–I 特性与光电二极管响应度（实测数据）', ai: '半导体激光器 P–I 特性、阈值电流、特征温度与光电二极管响应度',
    principle: `<p><b>P–I 特性</b>：电流超过阈值 I<sub>th</sub> 后输出功率近似线性增长。对阈值以上的点作直线拟合 P = η(I − I<sub>th</sub>)，斜率 η 为斜率效率（W/A），外微分量子效率 η<sub>d</sub> = η·λ/1239.84（λ 以 nm 计）。</p>
      <p><b>特征温度</b>：I<sub>th</sub>(T) = I₀·e<sup>T/T₀</sup>，对 ln I<sub>th</sub> − T（开尔文）作直线拟合，T₀ = 1/斜率。</p>
      <p><b>光电二极管</b>：光电流 I<sub>ph</sub> 与入射功率成正比，响应度 R = ΔI<sub>ph</sub>/ΔP（A/W），量子效率 = R·1239.84/λ。</p>`,
    groups: [
      {id: 'pi', name: 'P–I 特性', desc: '每一行：温度 T（°C）、驱动电流 I（mA）、输出功率 P（mW）。可以录入多个温度，用来求特征温度 T₀。',
        params: [{k: 'lam', label: '激光波长', unit: 'nm', def: '650'}, {k: 'plin', label: '线性段功率下限（可不填）', unit: 'mW', def: '', opt: true}],
        cols: [{k: 'T', label: '温度 T / °C'}, {k: 'I', label: '电流 I / mA'}, {k: 'P', label: '功率 P / mW'}],
        example: () => [20, 30].flatMap((T, t) => { const ith = 27.5 * Math.exp((T - 25) / 85); return [0, 10, 20, 25, 30, 35, 40, 45, 50, 55].map((I, i) => [String(T), String(I), Math.max(0.002, I < ith ? 0.004 * I : 0.47 * (I - ith) * (1 - t * 0.04) + 0.1 + nz(i + t * 20, 0.04)).toFixed(3)]); })},
      {id: 'pd', name: '光电二极管', desc: '用功率计和光电二极管在同一光路分别测量，每行一组：入射功率 P（mW）与光电流 I<sub>ph</sub>（µA）。',
        params: [{k: 'lam', label: '波长', unit: 'nm', def: '650'}, {k: 'dark', label: '暗电流（可不填）', unit: 'µA', def: '', opt: true}, {k: 'acc', label: '功率计误差限', unit: '%', def: '3'}],
        cols: [{k: 'P', label: '功率 P / mW'}, {k: 'I', label: '光电流 I<sub>ph</sub> / µA'}],
        example: () => [0.5, 1, 2, 3, 4, 5].map((P, i) => [String(P), (0.15 + 425 * P * (1 + nz(i, 0.01))).toFixed(1)])}],
    process(D){
      const out = {table: '', result: '', issues: [], ai: [], ok: false};
      const g = D('pi'), d = D('pd');
      if (g.rows.length){
        const byT = new Map(); g.rows.forEach(x => { if (!byT.has(x.T)) byT.set(x.T, []); byT.get(x.T).push(x); });
        const groups = [...byT.keys()].sort((a, b) => a - b).map(T => {
          const r = byT.get(T).slice().sort((a, b) => a.I - b.I), pmax = Math.max(...r.map(x => x.P)), plin = g.prm.plin ?? 0.15 * pmax, lin = r.filter(x => x.P >= plin);
          const G = {T, r, lin, plin};
          if (lin.length >= 3){ const f = linfit(lin.map(x => x.I), lin.map(x => x.P)); if (f && f.b > 0){ const th = -f.a / f.b; G.fit = {eta: f.b, ueta: f.sb, ith: th, uith: f.sb != null ? Math.sqrt(f.sa ** 2 + th * th * f.sb ** 2 + 2 * th * f.cov) / f.b : null, r2: f.r2, a: f.a}; G.below = r.filter(x => x.I < th).length; } }
          return G; });
        groups.forEach((G, k) => { out.table += sub(`P–I：T = ${G.T} °C（${G.r.length} 个点，线性段 ${G.lin.length} 个）`, k === 0) + T(['I / mA', ...G.r.map(x => x.raw.I)], [['P / mW', ...G.r.map(x => x.raw.P)]], 'plt'); });
        let h = '';
        groups.forEach(G => {
          const pmax = Math.max(...G.r.map(x => x.P));
          if (!(pmax > 0)){ h += `<div class="note">T = ${G.T} °C：功率全部为零，无法确定阈值。检查激光器是否出光、功率计探头是否对准、量程是否太大。</div>`; out.issues.push(`P–I（${G.T} °C）：功率全部为零`); return; }
          if (!G.fit){ h += `<div class="hint">T = ${G.T} °C：功率不低于 ${sig(G.plin, 3)} mW 的点少于 3 个，或功率没有随电流增大，无法拟合线性段。</div>`; return; }
          const Imax = Math.max(...G.r.map(x => x.I));
          if (!(G.fit.ith > 0) || G.fit.ith > Imax){ const why = G.fit.ith > 0 ? '超出了测量的最大电流' : '小于 0，说明没有测到阈值以下的点，或线性段下限设得太低';
            h += `<div class="note">T = ${G.T} °C：拟合得到的阈值电流 ${G.fit.ith.toFixed(2)} mA ${why}，不能作为结果。</div>`; out.issues.push(`P–I（${G.T} °C）：阈值电流 ${why}`); G.fit = null; return; }
          const f = G.fit, ed = f.eta * g.prm.lam / 1239.84;
          h += `<div class="result">T = ${G.T} °C：线性段拟合 P = η(I − I<sub>th</sub>)，R² = ${f.r2.toFixed(5)}
            <div>阈值电流 I<sub>th</sub> = <span class="big">${fmtU(f.ith, f.uith, 'mA')}</span>，斜率效率 η = ${fmtU(f.eta, f.ueta, 'W/A')}，外微分量子效率 η<sub>d</sub> = ${(ed * 100).toFixed(1)}%</div></div>`;
          if (G.below < 2) out.issues.push(`P–I（${G.T} °C）：阈值以下只有 ${G.below} 个点，看不清阈值前后的转折，应在阈值附近多测几个点`);
          if (f.r2 < 0.995) out.issues.push(`P–I（${G.T} °C）：线性段 R² = ${f.r2.toFixed(4)}，可能混入了阈值附近或接近饱和的点`);
          out.ai.push(`P–I（${G.T} °C）：（I, P）${G.r.map(x => `(${x.raw.I}, ${x.raw.P})`).join('、')}；线性段下限 ${sig(G.plin, 3)} mW，Ith = ${f.ith.toFixed(2)} mA，η = ${f.eta.toFixed(3)} W/A，R² = ${f.r2.toFixed(5)}。`);
          out.ok = true;
        });
        const ok = groups.filter(G => G.fit && G.fit.ith > 0);
        if (ok.length >= 2){
          const f = linfit(ok.map(G => G.T + 273.15), ok.map(G => Math.log(G.fit.ith)));
          if (f && f.b > 0){ const T0 = 1 / f.b, uT0 = f.sb != null ? f.sb / (f.b * f.b) : null;
            h += `<div class="result">特征温度：ln I<sub>th</sub> 对 T 直线拟合（${ok.length} 个温度），T₀ = 1/斜率 = <span class="big">${fmtU(T0, uT0, 'K')}</span>${ok.length < 3 ? '<div class="hint">只有 2 个温度，无法估计不确定度，建议测 3 个以上温度。</div>' : ''}</div>`;
            out.ai.push(`特征温度 T₀ = ${T0.toFixed(1)} K（${ok.length} 个温度）。`); }
          else out.issues.push('特征温度：阈值没有随温度升高而增大，检查各温度的数据');
        }
        out.result += h + `<canvas class="chart" data-plot="pi"></canvas>`;
        out.charts = [cv => plot(cv, {pts: g.rows.map(x => [x.I, x.P]), fit: groups.length === 1 && groups[0].fit ? I => Math.max(0, groups[0].fit.a + groups[0].fit.eta * I) : null, xl: 'I / mA', yl: 'P / mW'})];
      }
      if (d.rows.length){
        const r = d.rows.slice().sort((a, b) => a.P - b.P);
        out.table += sub('光电二极管', !g.rows.length) + T(['P / mW', ...r.map(x => x.raw.P)], [['I<sub>ph</sub> / µA', ...r.map(x => x.raw.I)]], 'plt');
        const f = r.length >= 3 ? linfit(r.map(x => x.P), r.map(x => x.I)) : null;
        if (!f) out.result += '<div class="hint">光电二极管：至少需要 3 组不同功率的数据。</div>';
        else if (!(f.b > 0) || !(f.b > 3 * (f.sb || 0))){ out.result += '<div class="note">光电二极管：光电流没有随入射功率明显增大，无法确定响应度。检查光电二极管是否对准光束、偏置和电流表接线，以及读数单位。</div>'; out.issues.push('光电二极管：光电流不随功率增大，无法确定响应度'); }
        else {
          const R = f.b / 1000, uA = f.sb != null ? f.sb / 1000 : null, uB = R * d.prm.acc / 100 / Unc.SQRT3, u = Unc.combine(uA, uB), qe = R * 1239.84 / d.prm.lam;
          out.result += `<div class="result">光电二极管：I<sub>ph</sub> 对 P 直线拟合，R² = ${f.r2.toFixed(5)}，截距 ${f.a.toFixed(3)} µA${d.prm.dark != null ? `（实测暗电流 ${d.prm.dark} µA）` : ''}
            <div>响应度 R = <span class="big">${R.toFixed(4)} A/W</span>，量子效率 ${(qe * 100).toFixed(1)}%</div>
            ${finalBlock(`不确定度：u<sub>A</sub> = ${uA != null ? p3(uA) : '—'} A/W（拟合），u<sub>B</sub> = ${p3(uB)} A/W（功率计 ${d.prm.acc}%）`, 'R', R, u, 'A/W')}</div>`;
          if (qe > 1) out.issues.push('光电二极管：量子效率超过 100%，检查功率和电流的单位');
          if (f.r2 < 0.999) out.issues.push(`光电二极管：线性 R² = ${f.r2.toFixed(4)}，可能有读数错误、功率计与光电二极管没有对准同一光束，或光太强接近饱和`);
          out.ai.push(`光电二极管：（P, Iph）${r.map(x => `(${x.raw.P}, ${x.raw.I})`).join('、')}；R = ${R.toFixed(4)} ± ${u.toFixed(4)} A/W，量子效率 ${(qe * 100).toFixed(1)}%，截距 ${f.a.toFixed(3)} µA。`);
          out.ok = true;
        }
      }
      return out;
    }};

  /* ---------- 光束 M² ---------- */
  function hyperFit(zs, ws, lam){
    const X = zs.map(z => [1, z, z * z]), ys = ws.map(w => w * w);
    const M = [0, 1, 2].map(i => [0, 1, 2].map(j => X.reduce((a, x) => a + x[i] * x[j], 0))), bv = [0, 1, 2].map(i => X.reduce((a, x, k) => a + x[i] * ys[k], 0));
    const p = solve(M, bv); if (!p) return null; const [a, b, c] = p;
    if (!(c > 0) || !(a - b * b / (4 * c) > 0)) return {invalid: true};
    const n = zs.length, res = ys.reduce((q, y, k) => q + (y - (a + b * zs[k] + c * zs[k] ** 2)) ** 2, 0), Ci = inv(M), s2 = n > 3 ? res / (n - 3) : 0;
    const f = q => { const [A, B, C] = q, W0 = Math.sqrt(A - B * B / (4 * C)), th = Math.sqrt(C); return {z0: -B / (2 * C), W0, th, zR: W0 / th, M2: Math.PI * W0 * th / lam}; };
    const v = f(p), u = {};
    for (const key of ['z0', 'W0', 'th', 'zR', 'M2']){ const g = [0, 1, 2].map(i => { const h = Math.abs(p[i]) * 1e-6 + 1e-12, q = p.slice(); q[i] += h; return (f(q)[key] - v[key]) / h; });
      u[key] = Ci && s2 ? Math.sqrt(Math.max(0, g.reduce((acc, gi, i) => acc + g.reduce((a2, gj, j) => a2 + gi * Ci[i][j] * gj, 0), 0) * s2)) : null; }
    const lo = zs.filter(z => z < v.z0).length, hi = zs.filter(z => z > v.z0).length, reach = Math.max(...zs.map(z => Math.abs(z - v.z0))), why = [];
    if (n < 5) why.push(`只有 ${n} 个位置，至少需要 5 个`);
    if (v.M2 < 1) why.push(`M² = ${v.M2.toFixed(2)}，小于物理下限 1`);
    if (lo < 2 || hi < 2) why.push(`束腰两侧的测量位置不均衡（前侧 ${lo} 个、后侧 ${hi} 个），束腰位置和 W₀ 要靠外推`);
    if (reach < v.zR) why.push(`离束腰最远的点只有 ${reach.toFixed(0)} mm，不到一个瑞利长度（约 ${v.zR.toFixed(0)} mm），测不出远场发散`);
    if (u.M2 != null && u.M2 > 0.3 * v.M2) why.push('M² 的相对不确定度超过 30%');
    const resid = Math.sqrt(mean(zs.map((z, k) => (Math.sqrt(Math.max(0, a + b * z + c * z * z)) / ws[k] - 1) ** 2)));
    return {...v, u, n, lo, hi, reach, resid, why, reliable: !why.length};
  }
  SPECS.beam = {P: 'ubm', title: '激光光束半径、发散角与 M²（实测数据）', ai: '刀口法测激光光束半径、束腰、发散角与 M²',
    principle: `<p><b>刀口法</b>：刀片横向推进挡光，透过功率 P(x) = (P₀/2)·erfc[√2(x − x<sub>c</sub>)/w]，对 P–x 数据作误差函数拟合得到光斑半径 w（1/e² 半径）。</p>
      <p><b>束腰与 M²</b>：在多个位置 z 测 w，把 w² 写成 a + bz + cz² 作最小二乘拟合：z₀ = −b/(2c)，W₀² = a − b²/(4c)，半发散角 √c，z<sub>R</sub> = W₀/√c，<b>M² = πW₀√c/λ</b>。测量点应分布在束腰两侧，并有离束腰一个瑞利长度以外的点（参照 ISO 11146 对测点分布的要求）。</p>
      <p><b>适用范围</b>：这里的光斑半径是把刀口曲线按理想高斯分布拟合得到的 1/e² 半径，所以 M² 是<b>近高斯光束的教学估计</b>。ISO 11146 用光强分布的二阶矩定义束宽；对接近基模（TEM₀₀）的光束两者基本一致，对多模或明显非高斯的光束（如未整形的半导体激光）会有偏差。要按标准报告 M²，需要先验证刀口束宽与二阶矩束宽在所测光束上等效。</p>
      <p>如果你用光束分析仪或其他方法直接得到了各位置的 w，可以在“直接输入光斑半径”中录入。</p>`,
    groups: [
      {id: 'scan', name: '刀口扫描数据', desc: '每一行一个点：导轨位置 z、刀口位置 x、透过功率 P。同一 z 的点会自动分成一组拟合，每组至少 6 个点，并覆盖透过率 10%～90%。',
        params: [{k: 'lam', label: '波长 λ', unit: 'nm', def: '632.8'}, {k: 'inst', label: '刀口千分尺仪器误差限', unit: 'mm', def: '0.005'}],
        cols: [{k: 'z', label: '位置 z / mm'}, {k: 'x', label: '刀口 x / mm'}, {k: 'P', label: '功率 P'}],
        example: () => { const W0 = 0.13, z0 = 600, zR = Math.PI * W0 * W0 / (1.15 * 632.8e-6), out = []; [400, 480, 540, 600, 660, 720, 800].forEach((z, k) => { const w = W0 * Math.sqrt(1 + ((z - z0) / zR) ** 2); for (let i = 0; i < 12; i++){ const x = 4 - 2 * w + i * 4 * w / 11; out.push([String(z), x.toFixed(3), (1.2 * 0.5 * erfc(Math.SQRT2 * (x - 4) / w) * (1 + nz(i + k * 13, 0.006)) + 0.0004).toFixed(4)]); } }); return out; }},
      {id: 'w', name: '直接输入光斑半径', desc: '已经得到各位置光斑半径（1/e² 半径）时使用。',
        params: [{k: 'lam', label: '波长 λ', unit: 'nm', def: '632.8'}],
        cols: [{k: 'z', label: '位置 z / mm'}, {k: 'w', label: '光斑半径 w / mm'}],
        example: () => [350, 450, 520, 580, 620, 680, 760, 900].map((z, i) => { const W0 = 0.13, zR = Math.PI * W0 * W0 / (1.15 * 632.8e-6); return [String(z), (W0 * Math.sqrt(1 + ((z - 600) / zR) ** 2) * (1 + nz(i, 0.01))).toFixed(4)]; })}],
    process(D){
      const out = {table: '', result: '', issues: [], ai: [], ok: false};
      const sc = D('scan'), dw = D('w'), lab = (globalThis.LabMath || {}).beam;
      const show = (zs, ws, lam, tag, chartKey) => {
        if (zs.length < 4) return `<div class="hint">${tag}：至少需要 4 个位置的光斑半径才能做二次拟合（建议 7 个以上）。</div>`;
        const h = hyperFit(zs, ws, lam * 1e-6);
        if (!h || h.invalid) { out.issues.push(`${tag}：二次拟合得不到合理的束腰（开口向下或 W₀² < 0），位置太集中或有点测错`); return `<div class="note">${tag}：二次拟合得不到合理的束腰，多换几个位置或检查数据。</div>`; }
        if (!h.reliable) out.issues.push(`${tag}：结果不可信——${h.why.join('；')}`);
        out.charts = (out.charts || []).concat([cv => plot(cv, {pts: zs.map((z, i) => [z, ws[i]]), fit: z => h.W0 * Math.sqrt(1 + ((z - h.z0) / h.zR) ** 2), xl: 'z / mm', yl: 'w / mm'})]);
        out.ai.push(`${tag}：（z, w）${zs.map((z, i) => `(${z}, ${ws[i].toFixed(4)})`).join('、')}；W₀ = ${h.W0.toFixed(4)} mm，z₀ = ${h.z0.toFixed(0)} mm，全发散角 ${(2 * h.th * 1000).toFixed(3)} mrad，zR = ${h.zR.toFixed(0)} mm，M² = ${h.M2.toFixed(3)}（近高斯光束的教学估计；束腰前 ${h.lo} 个、后 ${h.hi} 个测点，最远 ${(h.reach / h.zR).toFixed(1)} zR，w 残差 ${(h.resid * 100).toFixed(1)}%）${h.u.M2 != null ? ` ± ${h.u.M2.toFixed(3)}` : ''}；${h.reliable ? '分布检查通过' : '程序判定不可信：' + h.why.join('，')}。`);
        out.ok = out.ok || h.reliable;
        return `<div class="result${h.reliable ? '' : ' unreliable'}">${tag}：w² 对 z 二次拟合（${h.n} 个位置）
          ${h.reliable ? '' : `<div class="note"><b>这组结果不可信，不能作为实验结论。</b>${h.why.join('；')}。建议在束腰前后各测 2～3 个位置，并在离束腰一个瑞利长度以外补测。</div>`}
          <div>束腰半径 W₀ = <b>${fmtU(h.W0, h.u.W0, 'mm')}</b>，束腰位置 z₀ = ${fmtU(h.z0, h.u.z0, 'mm')}</div>
          <div>全发散角 θ = <b>${fmtU(2 * h.th * 1000, h.u.th != null ? 2 * h.u.th * 1000 : null, 'mrad')}</b>，瑞利长度 z<sub>R</sub> = ${fmtU(h.zR, h.u.zR, 'mm')}</div>
          <div>${h.reliable ? `<span class="big">M² = ${fmtU(h.M2, h.u.M2)}</span>` : `M² = ${fmtU(h.M2, h.u.M2)}（不可信）`}</div>
          <div class="hint">方法与适用范围：${chartKey === 'bm1' ? '刀口曲线按高斯分布拟合的' : '直接输入的'} 1/e² 光斑半径，M² 为近高斯光束的教学估计（不是 ISO 11146 的二阶矩法）。测点：束腰前 ${h.lo} 个、后 ${h.hi} 个，最远离束腰 ${(h.reach / h.zR).toFixed(1)} 个瑞利长度；二次拟合后 w 的均方根相对残差 ${(h.resid * 100).toFixed(1)}%。</div>
          <canvas class="chart" data-plot="${chartKey}"></canvas></div>`;
      };
      if (sc.rows.length){
        const byZ = new Map(); sc.rows.forEach(x => { if (!byZ.has(x.z)) byZ.set(x.z, []); byZ.get(x.z).push(x); });
        const gs = [...byZ.keys()].sort((a, b) => a - b).map(z => {
          const pts = byZ.get(z).map(x => ({x: x.x, P: x.P})), srt = pts.slice().sort((a, b) => a.x - b.x), rising = srt[srt.length - 1].P > srt[0].P;
          const f = lab ? lab.erfFit(rising ? pts.map(p => ({x: -p.x, P: p.P})) : pts) : null;
          const fit = f && !f.bad ? {...f, u: Unc.combine(f.uA, Math.SQRT2 * sc.prm.inst / Unc.SQRT3 / 1.2816)} : null;
          return {z, n: pts.length, fit, bad: f && f.bad ? f : null}; });
        out.table += sub('刀口扫描：各位置拟合的光斑半径', true) + T(['z / mm', '点数', 'w（拟合）/ mm', 'w（90%–10%）/ mm', '说明'], gs.map(g => Object.assign([g.z, g.n, g.fit ? Unc.format(g.fit.w, g.fit.u, '').text : '—', g.fit ? g.fit.w1090.toFixed(4) : g.bad && g.bad.w1090 != null ? g.bad.w1090.toFixed(4) : '—',
          g.fit ? '' : g.n < 6 ? '点太少（至少 6 个）' : `透过率 12%～88% 之间只有 ${g.bad ? g.bad.inMid : 0} 个点，或没扫到全挡 / 全透`], {warn: !g.fit})));
        gs.filter(g => !g.fit).forEach(g => out.issues.push(`刀口扫描 z = ${g.z} mm：无法拟合（点太少或没覆盖透过率 10%～90%）`));
        const ok = gs.filter(g => g.fit);
        out.result += show(ok.map(g => g.z), ok.map(g => g.fit.w), sc.prm.lam, '刀口扫描', 'bm1');
      }
      if (dw.rows.length){
        const r = dw.rows.slice().sort((a, b) => a.z - b.z);
        out.table += sub('直接输入的光斑半径', !sc.rows.length) + T(['z / mm', ...r.map(x => x.raw.z)], [['w / mm', ...r.map(x => x.raw.w)]], 'plt');
        out.result += show(r.map(x => x.z), r.map(x => x.w), dw.prm.lam, '光斑半径', 'bm2');
      }
      return out;
    }};

  /* ---------- 光具座测焦距 ---------- */
  SPECS.lens = {P: 'uln', title: '光具座测凸透镜焦距（实测数据）', ai: '光具座测凸透镜焦距（物距像距法、二次成像法、自准法）',
    principle: `<p><b>物距像距法</b>：u、v 分别为物、像到透镜的距离，<b>f = uv/(u + v)</b>。</p>
      <p><b>二次成像法（贝塞尔法）</b>：物与屏的距离 D 固定（D > 4f），移动透镜两次成清晰像，两次透镜位置相距 d，<b>f = (D² − d²)/(4D)</b>。不需要知道透镜主面的位置，是最常用的方法。</p>
      <p><b>自准法</b>：透镜后放平面镜，物屏上出现清晰的倒像时，物到透镜的距离就是 f。透镜架读数指标与主面不重合，透镜转 180° 再测一次，两次平均消去这个偏差。</p>
      <p>不确定度：各方法 A 类取多次结果的平均值标准偏差；B 类由导轨刻度仪器误差限（每个读数 Δ<sub>仪</sub>/√3）按公式传递。</p>`,
    groups: [
      {id: 'uv', name: '物距像距法', desc: '每一行：物、透镜、像屏的导轨读数（像最清晰时）。',
        params: [{k: 'inst', label: '导轨仪器误差限', unit: 'mm', def: '0.5'}],
        cols: [{k: 'xo', label: '物 / mm'}, {k: 'xl', label: '透镜 / mm'}, {k: 'xi', label: '像屏 / mm'}],
        example: () => [[100, 400], [100, 450], [100, 500], [100, 550]].map(([xo, xl], i) => { const u = xl - xo, v = u * 165 / (u - 165); return [String(xo), String(xl), (xl + v + nz(i, 2)).toFixed(1)]; })},
      {id: 'bessel', name: '二次成像法', desc: '每一行：物和屏的读数，以及成大像、小像时透镜的读数。可以换几个 D 测量。',
        params: [{k: 'inst', label: '导轨仪器误差限', unit: 'mm', def: '0.5'}],
        cols: [{k: 'xo', label: '物 / mm'}, {k: 'xs', label: '屏 / mm'}, {k: 'x1', label: '大像时透镜 / mm'}, {k: 'x2', label: '小像时透镜 / mm'}],
        example: () => [800, 850, 900, 950].map((xs, i) => { const Dd = xs - 100, d = Math.sqrt(Dd * Dd - 4 * Dd * 165); return ['100', String(xs), (100 + (Dd - d) / 2 + nz(i, 1.2)).toFixed(1), (100 + (Dd + d) / 2 + nz(i + 3, 1.2)).toFixed(1)]; })},
      {id: 'auto', name: '自准法', desc: '物屏上出现清晰倒像时记透镜读数；“正向”“反向”指透镜转 180° 前后。每个方向建议测 3 次。',
        params: [{k: 'xo', label: '物的位置', unit: 'mm', def: '100'}, {k: 'inst', label: '导轨仪器误差限', unit: 'mm', def: '0.5'}],
        cols: [{k: 'dir', label: '方向', kind: 'sel', opts: [['正向', '正向'], ['反向', '反向']]}, {k: 'x', label: '透镜 / mm'}],
        example: () => [['正向', 263.2], ['正向', 262.6], ['正向', 263.5], ['反向', 267.1], ['反向', 266.4], ['反向', 266.9]].map(r => r.map(String))}],
    process(D){
      const out = {table: '', result: '', issues: [], ai: [], ok: false};
      const g1 = D('uv'), g2 = D('bessel'), g3 = D('auto');
      if (g1.rows.length){
        const it = g1.rows.map(x => { const u = Math.abs(x.xl - x.xo), v = Math.abs(x.xi - x.xl); return {...x, u, v, f: u * v / (u + v)}; });
        out.table += sub('物距像距法', true) + T(['物', '透镜', '像屏', 'u / mm', 'v / mm', 'f / mm'], it.map(x => [x.raw.xo, x.raw.xl, x.raw.xi, x.u.toFixed(1), x.v.toFixed(1), x.f.toFixed(1)]));
        if (it.some(x => Math.sign(x.xl - x.xo) !== Math.sign(x.xi - x.xl))) out.issues.push('物距像距法：有的行透镜不在物和像屏之间，检查读数');
        const uR = Math.SQRT2 * g1.prm.inst / Unc.SQRT3, uB = mean(it.map(x => Math.hypot(x.v ** 2 / (x.u + x.v) ** 2 * uR, x.u ** 2 / (x.u + x.v) ** 2 * uR)));
        const sum = Unc.summarize(it.map(x => x.f), uB);
        out.result += `<div class="result">物距像距法：各次 f ${it.map(x => x.f.toFixed(1)).join('、')} mm，平均 <span class="big">${sum.mean.toFixed(1)} mm</span>${Unc.html(sum, 'f', 'mm')}</div>`;
        out.ai.push(`物距像距法：（物, 透镜, 像）${it.map(x => `(${x.raw.xo}, ${x.raw.xl}, ${x.raw.xi})`).join('、')}；f = ${sum.mean.toFixed(2)} mm；${Unc.line(sum, 'f', 'mm')}。`);
        out.ok = true;
      }
      if (g2.rows.length){
        const it = g2.rows.map(x => { const Dd = Math.abs(x.xs - x.xo), d = Math.abs(x.x2 - x.x1); return {...x, D: Dd, d, f: (Dd * Dd - d * d) / (4 * Dd)}; });
        out.table += sub('二次成像法', !g1.rows.length) + T(['物', '屏', 'x₁', 'x₂', 'D / mm', 'd / mm', 'f / mm'], it.map(x => [x.raw.xo, x.raw.xs, x.raw.x1, x.raw.x2, x.D.toFixed(1), x.d.toFixed(1), x.f.toFixed(1)]));
        it.forEach(x => { if (x.d >= x.D) out.issues.push(`二次成像法：D = ${x.D.toFixed(1)} mm 时 d 不小于 D，读数有误`); const mid = (x.x1 + x.x2) / 2, c = (x.xo + x.xs) / 2; if (Math.abs(mid - c) > 0.05 * x.D) out.issues.push(`二次成像法：D = ${x.D.toFixed(1)} mm 时两次透镜位置的中点离物屏中点 ${Math.abs(mid - c).toFixed(1)} mm，理论上应重合，可能某次像没调到最清晰`); });
        const ok = it.filter(x => x.f > 0);
        if (ok.length){
          const uD = Math.SQRT2 * g2.prm.inst / Unc.SQRT3, uB = mean(ok.map(x => Math.hypot((x.D * x.D + x.d * x.d) / (4 * x.D * x.D) * uD, x.d / (2 * x.D) * uD)));
          const sum = Unc.summarize(ok.map(x => x.f), uB);
          ok.forEach(x => { if (x.D < 4 * sum.mean * 1.05) out.issues.push(`二次成像法：D = ${x.D.toFixed(1)} mm 只比 4f 略大，两次成像位置靠得很近，误差大`); });
          out.result += `<div class="result">二次成像法：各次 f ${ok.map(x => x.f.toFixed(1)).join('、')} mm，平均 <span class="big">${sum.mean.toFixed(1)} mm</span>${Unc.html(sum, 'f', 'mm')}</div>`;
          out.ai.push(`二次成像法：（物, 屏, x₁, x₂）${it.map(x => `(${x.raw.xo}, ${x.raw.xs}, ${x.raw.x1}, ${x.raw.x2})`).join('、')}；f = ${sum.mean.toFixed(2)} mm；${Unc.line(sum, 'f', 'mm')}。`);
          out.ok = true;
        }
      }
      if (g3.rows.length){
        const a1 = g3.rows.filter(x => x.dir !== '反向'), a2 = g3.rows.filter(x => x.dir === '反向'), xo = g3.prm.xo;
        out.table += sub('自准法', !g1.rows.length && !g2.rows.length) + `<div class="hint">物的位置 ${g3.raw.xo} mm；正向 ${a1.map(x => x.raw.x).join('、') || '—'}；反向 ${a2.map(x => x.raw.x).join('、') || '—'}</div>`;
        if (xo == null) out.result += '<div class="hint">自准法：在参数里填写物的位置。</div>';
        else if (!a1.length || !a2.length) out.result += `<div class="hint">自准法：${a1.length ? `正向 f₁ = ${(mean(a1.map(x => x.x)) - xo).toFixed(1)} mm；` : ''}${a2.length ? `反向 f₂ = ${(mean(a2.map(x => x.x)) - xo).toFixed(1)} mm；` : ''}透镜正反两个方向都要测，平均后才能消去读数指标与主面的偏差。</div>`;
        else {
          const f1 = Math.abs(mean(a1.map(x => x.x)) - xo), f2 = Math.abs(mean(a2.map(x => x.x)) - xo), f = (f1 + f2) / 2;
          const ua = [a1, a2].map(gg => gg.length > 1 ? Unc.typeA(gg.map(x => x.x)) : 0), uA = 0.5 * Math.hypot(ua[0], ua[1]), uB = g3.prm.inst / Unc.SQRT3 * Math.sqrt(1.5);
          const sum = {n: a1.length + a2.length, mean: f, uA: a1.length > 1 || a2.length > 1 ? uA : null, uB, u: Unc.combine(uA, uB)};
          out.result += `<div class="result">自准法：正向 f₁ = ${f1.toFixed(1)} mm，反向 f₂ = ${f2.toFixed(1)} mm，读数指标与主面的偏差约 ${(Math.abs(f2 - f1) / 2).toFixed(1)} mm
            <div>f = (f₁ + f₂)/2 = <span class="big">${f.toFixed(1)} mm</span></div>${Unc.html(sum, 'f', 'mm')}</div>`;
          out.ai.push(`自准法：物 ${g3.raw.xo} mm，正向 ${a1.map(x => x.raw.x).join('、')}，反向 ${a2.map(x => x.raw.x).join('、')}；f = ${f.toFixed(2)} mm。`);
          out.ok = true;
        }
      }
      return out;
    }};

  /* ================= 页面与交互 ================= */
  const S = {};                                   // 各实验的存档对象
  const blank = spec => ({g: spec.groups[0].id, prm: {}, rows: [], ex: {}, checked: false, review: ''});   // ex：v1.8.0 按组记录示例数据，读入后转成逐格标记
  /* 数据来源逐格记录：行对象的 x[j] = 1 表示这一格仍是“填入示例数据”生成的值，学生改过或粘贴过就清零 */
  const filled = r => r.v.some(v => String(v ?? '').trim());
  const exCell = (r, j) => !!(r.x && r.x[j] && String(r.v[j] ?? '').trim());
  const isEx = r => r.v.some((_, j) => exCell(r, j));
  function provenance(spec, s){
    let mine = 0, e = 0; const where = [];          // 按格计数：自己填的格子 / 示例格子
    spec.groups.forEach(g => { const rows = rowsOf(s, g.id), no = []; let gm = 0;
      rows.forEach((r, i) => { if (!filled(r)) return; r.v.forEach((v, j) => { if (!String(v ?? '').trim()) return; if (exCell(r, j)) e++; else { mine++; gm++; } }); if (isEx(r)) no.push(i + 1); });
      if (no.length) where.push({g, no, all: !gm}); });
    return {source: !e ? 'real' : !mine ? 'example' : 'mixed', where};
  }
  /* 存档时去掉空行（空行只是录入用的占位） */
  const saveS = (P, s) => LabStore.save(P, {...s, rows: s.rows.filter(filled)});
  const grp = (spec, s) => spec.groups.find(x => x.id === s.g) || spec.groups[0];
  const rowsOf = (s, gid) => s.rows.filter(r => r.g === gid);
  const prmVal = (s, g, p) => { const v = s.prm[g.id]?.[p.k]; return v == null ? p.def : v; };

  /* 解析一组：参数、数据行（全空的行跳过，有不合法单元格的行单独列出） */
  function parse(spec, s, gid){
    const g = spec.groups.find(x => x.id === gid), prm = {}, raw = {}, badPrm = [];
    g.params.forEach(p => { const t = prmVal(s, g, p); raw[p.k] = t; if (p.kind === 'text'){ prm[p.k] = t; return; }
      const v = num(t), dv = num(p.def);
      if (v == null){ if (!p.opt && p.def !== '') badPrm.push(p); prm[p.k] = p.opt ? null : dv ?? null; }      // 必填参数空着时先按默认值算，同时提示
      else if (Number.isNaN(v)){ badPrm.push(p); prm[p.k] = p.opt ? null : dv ?? null; } else prm[p.k] = v; });
    const rows = [], bad = [];
    rowsOf(s, gid).forEach((r, i) => {
      if (r.v.every(v => !String(v ?? '').trim())) return;
      const o = {raw: {}, no: i + 1}; let okRow = true;
      g.cols.forEach((c, j) => { const t = String(r.v[j] ?? '').trim(); o.raw[c.k] = esc(t);
        if (c.kind === 'text' || c.kind === 'sel'){ o[c.k] = t || (c.opts ? c.opts[0][0] : ''); return; }
        const v = c.kind === 'ang' ? ang(t) : num(t);
        if (v == null){ if (!c.opt) okRow = false; o[c.k] = null; } else if (Number.isNaN(v)) okRow = false; else o[c.k] = v; });
      (okRow ? rows : bad).push(okRow ? o : i + 1);
    });
    return {prm, raw, rows, bad, badPrm};
  }
  function compute(spec, s){
    const cache = {}, D = gid => cache[gid] || (cache[gid] = parse(spec, s, gid));
    let res; try { res = spec.process(D); } catch(e){ res = {table: '', result: `<div class="note">计算出错：${esc(e.message)}</div>`, issues: [], ai: [], ok: false}; }
    if (/NaN|Infinity/.test(res.result)){ res.ok = false; res.issues.push('有的结果无法计算（出现了非有限值），多半是参数为 0 或数据重复，请检查'); }
    spec.groups.forEach(g => { const d = D(g.id);
      if (d.bad.length) res.issues.unshift(`${g.name}：第 ${d.bad.join('、')} 行有空白或不合法的数据，没有参与计算`);
      if (d.badPrm.length && d.rows.length) res.issues.unshift(`${g.name}：参数“${d.badPrm.map(p => p.label).join('、')}”没有填或格式不对`); });
    res.entered = spec.groups.some(g => D(g.id).rows.length);
    res.prmOk = spec.groups.every(g => !D(g.id).rows.length || !D(g.id).badPrm.length);
    return res;
  }

  /* ---------- 右侧：录入区 ---------- */
  function entryHTML(spec){
    const P = spec.P;
    return `<div class="ud" id="${P}-ud">
      <div class="ud-top"><h3>录入实验数据</h3><div class="hint">可以从 Excel / WPS 表格选中多行多列复制，点任意单元格后粘贴；按 Enter 跳到下一行。角度可写成 164°31′ 或 164 31。</div></div>
      ${spec.groups.length > 1 ? `<div class="ud-tabs" role="tablist" id="${P}-gtabs">${spec.groups.map(g => `<button role="tab" data-g="${g.id}">${g.name}</button>`).join('')}</div>` : ''}
      <div class="ud-desc" id="${P}-gdesc"></div>
      <div class="ud-params" id="${P}-params"></div>
      <div class="ud-grid"><table class="ud-table" id="${P}-grid"></table></div>
      <div class="row ud-actions"><button class="ghost" data-act="add">添加一行</button><button class="ghost" data-act="example">填入示例数据</button><button class="ghost" data-act="clear">清空本组</button><span class="hint" id="${P}-count"></span></div>
    </div>`;
  }
  function drawEntry(spec){
    const s = S[spec.key], g = grp(spec, s), P = spec.P;
    document.querySelectorAll(`#${P}-gtabs button`).forEach(b => { const on = b.dataset.g === g.id; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); b.classList.toggle('has', rowsOf(s, b.dataset.g).some(r => r.v.some(v => String(v).trim()))); });
    $('#' + P + '-gdesc').innerHTML = g.desc;
    $('#' + P + '-params').innerHTML = g.params.map(p => `<label>${p.label}${p.unit ? `（${p.unit}）` : ''}<input data-p="${p.k}" value="${esc(prmVal(s, g, p))}" inputmode="decimal"></label>`).join('');
    let rows = rowsOf(s, g.id);
    if (!rows.length){ for (let i = 0; i < 3; i++) s.rows.push({g: g.id, v: g.cols.map(() => '')}); rows = rowsOf(s, g.id); }
    const cell = (c, v, j, r) => c.kind === 'sel' ? `<select data-c="${j}"${exCell(r, j) ? ' class="ex"' : ''}>${c.opts.map(([val, t]) => `<option value="${val}"${val === v ? ' selected' : ''}>${t}</option>`).join('')}</select>` : `<input data-c="${j}"${exCell(r, j) ? ' class="ex" title="示例数据"' : ''} value="${esc(v ?? '')}"${c.kind === 'text' ? '' : ' inputmode="decimal"'} aria-label="${c.label.replace(/<[^>]+>/g, '')}">`;
    $('#' + P + '-grid').innerHTML = `<thead><tr><th>#</th>${g.cols.map(c => `<th>${c.label}${c.opt ? '<span class="optl">（可不填）</span>' : ''}</th>`).join('')}<th></th></tr></thead><tbody>` +
      rows.map((r, i) => `<tr data-r="${i}"><td class="n">${i + 1}</td>${g.cols.map((c, j) => `<td>${cell(c, r.v[j], j, r)}</td>`).join('')}<td><button class="ud-del" data-act="del" title="删除这一行" aria-label="删除第 ${i + 1} 行">×</button></td></tr>`).join('') + '</tbody>';
    markBad(spec);
  }
  /* 标出不合法的单元格（不重建表格，避免打断输入） */
  function markBad(spec){
    const s = S[spec.key], g = grp(spec, s), P = spec.P, rows = rowsOf(s, g.id);
    $('#' + P + '-grid').querySelectorAll('tbody tr').forEach(tr => { const r = rows[+tr.dataset.r]; if (!r) return; const empty = r.v.every(v => !String(v ?? '').trim());
      tr.querySelectorAll('input[data-c]').forEach(inp => { const c = g.cols[+inp.dataset.c], t = inp.value.trim();
        const v = c.kind === 'text' ? 0 : c.kind === 'ang' ? ang(t) : num(t), bad = !empty && (Number.isNaN(v) || (v == null && !c.opt));
        inp.classList.toggle('bad', bad); inp.title = bad ? (t ? (c.kind === 'ang' ? '角度格式不对，可写成 164°31′ 或 164 31' : '不是数字') : '这一格不能空') : ''; }); });
    $('#' + P + '-params').querySelectorAll('input[data-p]').forEach(inp => { const p = g.params.find(x => x.k === inp.dataset.p), v = p.kind === 'text' ? 0 : num(inp.value);
      inp.classList.toggle('bad', Number.isNaN(v) || (v == null && !p.opt && p.def !== '')); });
    const n = rows.filter(r => r.v.some(v => String(v ?? '').trim())).length;
    $('#' + P + '-count').textContent = `本组 ${n} 行，最多 ${LabStore.limit(P)} 行（所有内容合计）`;
  }

  /* ---------- 左侧：结果、步骤 ---------- */
  function refresh(spec){
    const s = S[spec.key], P = spec.P, res = compute(spec, s), pv = provenance(spec, s);
    saveS(P, s);
    $('#databox-' + spec.key).dataset.source = pv.source;
    pv.where.slice().reverse().forEach(w => res.issues.unshift(w.all ? `“${w.g.name}”中全部是程序生成的示例数据，不是你的实测数据，不能作为实验结果上交`
      : `“${w.g.name}”第 ${w.no.join('、')} 行仍含程序生成的示例数据（灰色斜体的格子），整行改成自己的数据或删除后才算实测数据`));
    $('#' + P + '-table').innerHTML = res.table || '<div class="empty">还没有数据。</div>';
    const nRows = s.rows.filter(filled).length;
    $('#' + P + '-rawsum').textContent = nRows ? `原始读数与中间量（${nRows} 行）` : '原始读数与中间量';
    $('#' + P + '-result').innerHTML = (res.entered ? '' : '<div class="empty">还没有数据。在右边录入实验课上记下的原始数据，结果和数据检查会显示在这里。</div>') + res.result + (res.issues.length ? `<div class="note"><b>程序检查发现：</b>${res.issues.map(esc).join('；')}。</div>` : res.ok ? '<div class="hint">程序检查没有发现明显问题。</div>' : '');
    $('#' + P + '-result').querySelectorAll('canvas[data-plot]').forEach((cv, i) => res.charts?.[i]?.(cv));
    renderSteps(P, [
      [res.entered && res.prmOk, `<b>选择内容、核对参数</b>：右边选择要处理的实验内容（${spec.groups.map(g => g.name).join('、')}），按你的实验条件修改参数，如波长、仪器误差限。`],
      [res.entered, '<b>录入数据</b>：照实验记录本把原始读数填进右边的表格，也可以从 Excel / WPS 复制粘贴。不会填时，点“填入示例数据”看看格式。'],
      [res.ok, '<b>查看结果</b>：左边会自动给出数据表、逐差或拟合结果、不确定度，并列出程序检查发现的问题。'],
      [s.checked, '<b>AI 助教检查</b>：让 AI 根据你的数据指出问题、分析误差来源，然后导出实验报告。']]);
    return res;
  }

  function mount(key, el){
    const spec = SPECS[key]; spec.key = key; const P = spec.P;
    el.innerHTML = labShell(P, {title: spec.title, principle: spec.principle, right: entryHTML(spec), rightClass: 'card ud-card', recBar: false, resultFirst: true});
    const s = S[key] = blank(spec);
    LabStore.restore(P, s);
    if (!spec.groups.some(g => g.id === s.g)) s.g = spec.groups[0].id;
    for (const gid in s.ex) if (s.ex[gid]) rowsOf(s, gid).forEach(r => { if (!r.x) r.x = r.v.map(() => 1); });   // 兼容 v1.8.0 的存档
    s.ex = {};
    $('#' + P + '-review').innerHTML = paras(s.review || '');
    const ud = $('#' + P + '-ud');
    let timer = 0;
    const changed = (now) => { s.checked = false; s.review = ''; $('#' + P + '-review').innerHTML = ''; clearTimeout(timer); const run = () => { refresh(spec); markBad(spec); }; if (now) run(); else timer = setTimeout(run, 250); };
    ud.addEventListener('click', e => {
      const tab = e.target.closest('[data-g]'); if (tab){ s.g = tab.dataset.g; drawEntry(spec); saveS(P, s); return; }
      const b = e.target.closest('[data-act]'); if (!b) return;
      const g = grp(spec, s), rows = rowsOf(s, g.id);
      if (b.dataset.act === 'add'){ if (LabStore.full(P)) return; s.rows.push({g: g.id, v: g.cols.map(() => '')}); drawEntry(spec); ud.querySelector('tbody tr:last-child input')?.focus(); }
      if (b.dataset.act === 'del'){ const r = rows[+b.closest('tr').dataset.r]; s.rows.splice(s.rows.indexOf(r), 1); drawEntry(spec); changed(true); }
      if (b.dataset.act === 'clear'){ if (rows.some(r => r.v.some(v => String(v).trim())) && !confirm(`清空“${g.name}”的全部数据？`)) return; s.rows = s.rows.filter(r => r.g !== g.id); drawEntry(spec); changed(true); }
      if (b.dataset.act === 'example'){
        if (rows.some(r => r.v.some(v => String(v).trim())) && !confirm(`用示例数据替换“${g.name}”现有的数据？`)) return;
        s.rows = s.rows.filter(r => r.g !== g.id).concat(g.example().map(v => ({g: g.id, v: v.map(String), x: v.map(() => 1)})));
        if (g.exParams){ s.prm[g.id] = {...(s.prm[g.id] || {}), ...g.exParams}; }
        drawEntry(spec); changed(true);
        $('#' + P + '-save-status').textContent = '已填入示例数据（模拟生成，仅用于熟悉格式和流程）。';
      }
    });
    ud.addEventListener('input', e => {
      const g = grp(spec, s);
      const pi = e.target.closest('input[data-p]'); if (pi){ (s.prm[g.id] = s.prm[g.id] || {})[pi.dataset.p] = pi.value; changed(); return; }
      const ci = e.target.closest('[data-c]'); if (!ci) return;
      const r = rowsOf(s, g.id)[+ci.closest('tr').dataset.r], j = +ci.dataset.c; r.v[j] = ci.value; if (r.x) r.x[j] = 0; ci.classList.remove('ex'); changed();
    });
    ud.addEventListener('change', e => { if (e.target.matches('select[data-c]')){ const g = grp(spec, s), r = rowsOf(s, g.id)[+e.target.closest('tr').dataset.r], j = +e.target.dataset.c; r.v[j] = e.target.value; if (r.x) r.x[j] = 0; e.target.classList.remove('ex'); changed(); } });
    ud.addEventListener('keydown', e => {
      const ci = e.target.closest('input[data-c]'); if (!ci || e.key !== 'Enter') return; e.preventDefault();
      const tr = ci.closest('tr'), j = ci.dataset.c, next = tr.nextElementSibling;
      if (next) next.querySelector(`[data-c="${j}"]`)?.focus();
      else { if (LabStore.full(P)) return; const g = grp(spec, s); s.rows.push({g: g.id, v: g.cols.map(() => '')}); drawEntry(spec); ud.querySelector(`tbody tr:last-child [data-c="${j}"]`)?.focus(); }
    });
    /* 从表格软件粘贴多行多列 */
    ud.addEventListener('paste', e => {
      const ci = e.target.closest('input[data-c]'); if (!ci) return;
      const text = (e.clipboardData || window.clipboardData)?.getData('text') || '';
      if (!/[\t\n]/.test(text.trim())) return;
      e.preventDefault();
      const g = grp(spec, s), lines = text.replace(/\r/g, '').replace(/\n+$/, '').split('\n').map(l => l.split('\t'));
      let rows = rowsOf(s, g.id); const r0 = +ci.closest('tr').dataset.r, c0 = +ci.dataset.c;
      const need = r0 + lines.length - rows.length;
      if (need > 0 && LabStore.full(P, need)) return;
      for (let k = 0; k < need; k++) s.rows.push({g: g.id, v: g.cols.map(() => '')});
      rows = rowsOf(s, g.id);
      lines.forEach((cells, i) => cells.forEach((t, j) => { const row = rows[r0 + i]; if (c0 + j < g.cols.length){ row.v[c0 + j] = t.trim(); if (row.x) row.x[c0 + j] = 0; } }));   // 粘贴进来的是自己的数据
      drawEntry(spec); changed(true);
      const wide = Math.max(...lines.map(l => l.length)), room = g.cols.length - c0;
      $('#' + P + '-save-status').textContent = `已粘贴 ${lines.length} 行。` + (wide > room ? `粘贴的数据有 ${wide} 列，从这一格往右只有 ${room} 列，多出的列没有填入，请确认选对了实验内容和起始单元格。` : '');
    });
    $('#' + P + '-check').onclick = () => review(spec);
    drawEntry(spec); refresh(spec);
  }

  /* ---------- AI 批改 ---------- */
  function review(spec){
    const s = S[spec.key], P = spec.P, res = compute(spec, s);
    runReview(P, {
      check: () => res.ok ? '' : '还没有可以计算出结果的数据。先按左边的提示录入完整的数据。',
      prompt: () => `你是大学物理实验课的助教，正在批改大一学生“${spec.ai}”实验的数据。注意：这是学生在真实实验室里测得、手工录入的数据，不是虚拟实验，没有“真实值”可以对照；如果给了参考值或标称值，只能作为参考。
学生的数据与程序计算结果：
${res.ai.join('\n')}
程序检查发现的问题：${res.issues.length ? res.issues.join('；') : '无'}。
请给出批改意见：中文，250~350 字，分 4 段，每段开头依次写【总评】【数据问题】【误差来源】【改进建议】，段与段之间换行。具体指出哪几个数据可疑、为什么；误差来源要结合这个实验的仪器和操作；改进建议要具体到下次实验怎么做。只根据给出的数据说话，不要编造数据，语气像耐心的助教，不要使用 Markdown。`,
      offline: () => ['【总评】' + (res.ai.length ? '已根据录入的数据完成计算，结果见左侧。' : '数据还不完整。'),
        '【数据问题】' + (res.issues.length ? res.issues.join('；') + '。' : '程序检查没有发现明显问题。'),
        '【误差来源】仪器读数误差（含仪器误差限）、调节不到位（如没调到最清晰、没对准）、环境扰动和光源不稳定，以及记录、抄写时的笔误。',
        '【改进建议】实验时同一方向转动读数机构避免回程差；关键读数重复测量；记录后当场检查数据是否随条件规律变化，发现异常立即重测。'].join('\n')
    }).then(text => { if (text){ s.checked = true; s.review = text; refresh(spec); } });
  }

  const KEYS = Object.keys(SPECS);
  return {SPECS, KEYS, mount: (key, el) => mount(key, el), render: key => { const spec = SPECS[key]; if (S[key]) { refresh(spec); } }, parse, compute, num, ang, hyperFit, linfit, blank, provenance};
})();
