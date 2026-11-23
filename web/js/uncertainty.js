/* =====================================================================
 * uncertainty.js —— 测量不确定度与结果的规范表示（三个虚拟实验共用，纯计算，无界面）
 *
 * 约定（与多数《大学物理实验》教材一致，可按本校指导书修改）：
 *   · A 类：平均值的标准偏差  u_A = √( Σ(xᵢ − x̄)² / (n(n − 1)) )，只有 1 组时无法计算
 *   · B 类：仪器误差限按均匀分布  u_B = Δ仪 / √3，再按公式传递到结果
 *   · 合成：u = √(u_A² + u_B²)
 *   · 写结果：不确定度保留 1 位有效数字（首位是 1 或 2 时保留 2 位），只进不舍；
 *            测量值的末位与不确定度的末位对齐。
 * ===================================================================== */
const Unc = (() => {
  const SQRT3 = Math.sqrt(3);
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  function typeA(a){
    const n = a.length; if (n < 2) return null;
    const m = mean(a);
    return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (n * (n - 1)));
  }
  const combine = (...us) => Math.sqrt(us.reduce((s, u) => s + (u || 0) ** 2, 0));

  /* 把不确定度截成规范的有效数字：返回 {u, decimals} */
  function round(u){
    if (!(u > 0)) return {u: 0, decimals: 0};
    const sig = v => { const e = Math.floor(Math.log10(v) + 1e-12), first = Math.floor(v / 10 ** e + 1e-9); return {e, n: first <= 2 ? 2 : 1}; };
    const a = sig(u), step = 10 ** (a.e - a.n + 1);
    const r = +(Math.ceil(u / step - 1e-9) * step).toPrecision(12);   // 只进不舍
    const b = sig(r);                                                    // 进位后可能变成 1.0、10 之类，重新数一次位数
    return {u: r, decimals: Math.max(0, b.n - 1 - b.e)};
  }
  /* 写成 (x ± u) 单位 */
  function format(x, u, unit = ''){
    const {u: ur, decimals} = round(u);
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
    const a = sum.uA == null ? '无法计算（只有 1 组）' : `${p(sum.uA)} ${unit}`;
    return `<div class="unc">不确定度：u<sub>A</sub> = ${a}，u<sub>B</sub> = ${p(sum.uB)} ${unit}，u = √(u<sub>A</sub>² + u<sub>B</sub>²) = ${p(sum.u)} ${unit}
      <div class="final">结果：<b>${sym} = ${f.text}</b>，相对不确定度 ${f.rel.toFixed(2)}%</div></div>`;
  }
  /* 给 AI 的一行文字 */
  function line(sum, sym, unit){
    const p = v => v == null ? '无法计算（只有 1 组）' : (+v.toPrecision(2)) + ' ' + unit;
    return `不确定度 u_A = ${p(sum.uA)}，u_B = ${p(sum.uB)}，合成 u = ${p(sum.u)}；规范结果 ${sym} = ${format(sum.mean, sum.u, unit).text}`;
  }
  return {SQRT3, mean, typeA, combine, round, format, summarize, html, line};
})();
