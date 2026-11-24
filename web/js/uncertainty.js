/* =====================================================================
 * uncertainty.js —— 测量不确定度与结果的规范表示（三个虚拟实验共用，纯计算，无界面）
 *
 * 约定（与多数《大学物理实验》教材一致，可按本校指导书修改）：
 *   · A 类：平均值的标准偏差  u_A = √( Σ(xᵢ − x̄)² / (n(n − 1)) )，只有 1 组时无法计算
 *   · B 类：仪器误差限按均匀分布  u_B = Δ仪 / √3，再按公式传递到结果
 *   · 合成：u = √(u_A² + u_B²)
 *   · 写结果：不确定度保留 1 位有效数字（首位是 1 或 2 时保留 2 位），只进不舍；
 *            测量值的末位与不确定度的末位对齐。
 * 以上是默认约定；“设置 → 教学设置”可以改成：A 类乘 t₀.₆₈₃ 因子、结果写扩展不确定度 U = 2u、
 * 不确定度固定保留 1 位或 2 位、四舍五入（见 config）。
 * ===================================================================== */
const Unc = (() => {
  const SQRT3 = Math.sqrt(3);
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const cfg = {tA: 'none', k: 1, sig: 'auto', round: 'up'};
  function config(c){ Object.assign(cfg, c); }
  /* t 分布因子（置信概率 0.683），自由度 ν = n − 1 */
  const T68 = [0, 1.837, 1.321, 1.197, 1.142, 1.111, 1.091, 1.077, 1.067, 1.059, 1.053];
  const t68 = df => df <= 10 ? T68[df] : 1 + 0.53 / df;
  function typeA(a){
    const n = a.length; if (n < 2) return null;
    const m = mean(a);
    return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (n * (n - 1))) * (cfg.tA === 't68' ? t68(n - 1) : 1);
  }
  const combine = (...us) => Math.sqrt(us.reduce((s, u) => s + (u || 0) ** 2, 0));

  /* 把不确定度截成规范的有效数字：返回 {u, decimals} */
  function round(u){
    if (!(u > 0)) return {u: 0, decimals: 0};
    const sig = v => { const e = Math.floor(Math.log10(v) + 1e-12), first = Math.floor(v / 10 ** e + 1e-9); return {e, n: cfg.sig === '1' ? 1 : cfg.sig === '2' ? 2 : first <= 2 ? 2 : 1}; };
    const a = sig(u), step = 10 ** (a.e - a.n + 1);
    const r = +((cfg.round === 'half' ? Math.round(u / step + 1e-9) : Math.ceil(u / step - 1e-9)) * step).toPrecision(12);   // 默认只进不舍
    const b = sig(r);                                                    // 进位后可能变成 1.0、10 之类，重新数一次位数
    return {u: r, decimals: Math.max(0, b.n - 1 - b.e)};
  }
  /* 写成 (x ± u) 单位 */
  function format(x, u, unit = ''){
    const {u: ur, decimals} = round(u * cfg.k);         // k = 2 时写扩展不确定度 U = 2u
    const xs = x.toFixed(decimals), us = ur.toFixed(decimals);
    return {text: `(${xs} ± ${us})${unit ? ' ' + unit : ''}`, x: +xs, u: ur, decimals, rel: ur / Math.abs(x) * 100};
  }
  /* 一组测量值 + 已传递到结果的 B 类不确定度 → 汇总 */
  function summarize(values, uB){
    const uA = typeA(values);
    return {n: values.length, mean: mean(values), uA, uB, u: combine(uA, uB)};
  }
  /* 结果区里的一段 HTML：sym 为物理量符号，unit 为单位 */
  function html(sum, sym, unit){
    const p = v => v == null ? null : (+v.toPrecision(3)).toString();      // 中间量多留一位，便于对照最终的进位
    const f = format(sum.mean, sum.u, unit);
    const a = sum.uA == null ? '无法计算（只有 1 组）' : `${p(sum.uA)} ${unit}${cfg.tA === 't68' ? `（已乘 t₀.₆₈₃ = ${t68(sum.n - 1).toFixed(2)}）` : ''}`;
    const q = encodeURIComponent(JSON.stringify({mean: sum.mean, uA: sum.uA, uB: sum.uB, u: sum.u, n: sum.n}));   // 供“我先算”核对
    return `<div class="unc" data-q="${q}">不确定度：u<sub>A</sub> = ${a}，u<sub>B</sub> = ${p(sum.uB)} ${unit}，u = √(u<sub>A</sub>² + u<sub>B</sub>²) = ${p(sum.u)} ${unit}${cfg.k === 2 ? `，扩展不确定度 U = 2u = ${p(2 * sum.u)} ${unit}` : ''}
      ${budget(sum)}<div class="final">结果：<b>${sym} = ${f.text}</b>${cfg.k === 2 ? '（k = 2）' : ''}，相对不确定度 ${f.rel.toFixed(2)}%</div></div>`;
  }
  /* 误差预算：各分量对合成方差 u² 的贡献，告诉学生改进实验应该从哪一项下手 */
  function budget(sum){
    if (sum.uA == null || !(sum.u > 0)) return '';
    const a = sum.uA ** 2 / sum.u ** 2 * 100, b = 100 - a;
    const tip = b >= 80 ? 'B 类（仪器、读数）占主要：再多测几次帮助不大，要提高读数精度或增大被测量（如多跨几个环、加大距离）'
      : a >= 80 ? 'A 类（数据离散）占主要：检查每次操作是否一致，并增加测量次数'
      : '两类相当：既要多测几次，也要提高读数精度';
    return `<div class="budget"><span class="bl">误差预算</span><span class="bar"><i class="ba" style="width:${a.toFixed(1)}%"></i><i class="bb" style="width:${b.toFixed(1)}%"></i></span><span class="bt">u<sub>A</sub>² 占 ${a.toFixed(0)}%，u<sub>B</sub>² 占 ${b.toFixed(0)}%</span><div class="btip">${tip}。</div></div>`;
  }
  /* 给 AI 的一行文字 */
  function line(sum, sym, unit){
    const p = v => v == null ? '无法计算（只有 1 组）' : (+v.toPrecision(2)) + ' ' + unit;
    return `不确定度 u_A = ${p(sum.uA)}，u_B = ${p(sum.uB)}，合成 u = ${p(sum.u)}；规范结果 ${sym} = ${format(sum.mean, sum.u, unit).text}${cfg.k === 2 ? '（扩展不确定度，k = 2）' : ''}`;
  }
  return {SQRT3, cfg, config, t68, mean, typeA, combine, round, format, summarize, html, line, budget};
})();
