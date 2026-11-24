/* =====================================================================
 * app.js —— 页面路由与启动：#sim 现象仿真；#lab-michelson / #lab-newton / #lab-grating / #lab-fiber / #lab-polar / #lab-laser / #lab-beam / #lab-lens 虚拟实验；
 *           #data-michelson 等：处理我的数据（真实实验数据）
 * ===================================================================== */
const LABS = {michelson:MI, newton:NR, grating:SP, fiber:FB, polar:PL, laser:LD, beam:BM, lens:LN, telescope:TS};
let curLab = 'michelson', curData = 'michelson';

function route(){
  const h = location.hash.slice(1);
  const v = h.startsWith('lab') ? 'lab' : h.startsWith('data') ? 'data' : 'sim';
  /* 虚拟实验与实测数据两边停在同一个实验上：切换时不用重新选标签 */
  if (v==='lab'){ const k=h.split('-')[1]; if (LABS[k]) curLab=k; if (MyData.SPECS[curLab]) curData=curLab; }
  if (v==='data'){ const k=h.split('-')[1]; if (MyData.SPECS[k]) curData=k; if (LABS[curData]) curLab=curData; }
  $('#view-sim').hidden = v!=='sim';
  $('#view-lab').hidden = v!=='lab';
  $('#view-data').hidden = v!=='data';
  document.querySelectorAll('.mode').forEach(b=>b.classList.toggle('active', b.dataset.v===v));
  document.querySelectorAll('.labtab[data-lab]').forEach(b=>b.classList.toggle('active', b.dataset.lab===curLab));
  document.querySelectorAll('.labtab[data-data]').forEach(b=>b.classList.toggle('active', b.dataset.data===curData));
  for (const k in LABS) $('#labbox-'+k).hidden = k!==curLab;
  for (const k of MyData.KEYS) $('#databox-'+k).hidden = k!==curData;
  if (v==='sim') render(); else if (v==='lab') LABS[curLab].render(); else MyData.render(curData);
}
document.querySelectorAll('.mode').forEach(b=>b.addEventListener('click',()=>{ location.hash = b.dataset.v==='lab' ? 'lab-'+curLab : b.dataset.v==='data' ? 'data-'+curData : 'sim'; }));
document.querySelectorAll('.labtab[data-lab]').forEach(b=>b.addEventListener('click',()=>{ location.hash = 'lab-'+b.dataset.lab; }));
document.querySelectorAll('.labtab[data-data]').forEach(b=>b.addEventListener('click',()=>{ location.hash = 'data-'+b.dataset.data; }));
window.addEventListener('hashchange', route);

/* 键盘 ← → 微调当前实验的鼓轮 / 望远镜 / 光纤调整架 / 偏振片转盘 / 驱动电流 */
document.addEventListener('keydown', e=>{
  if ($('#view-lab').hidden || !$('#settings').hidden || /input|textarea|select/i.test(e.target.tagName)) return;
  if (e.key==='ArrowRight' || e.key==='ArrowLeft'){ e.preventDefault(); LABS[curLab].key(e.key==='ArrowRight'?1:-1, e.shiftKey); }
});
let resizeTimer;
window.addEventListener('resize', ()=>{ clearTimeout(resizeTimer); resizeTimer=setTimeout(()=>{ if (!$('#view-sim').hidden) render(); else if (!$('#view-lab').hidden) LABS[curLab].render(); else MyData.render(curData); },120); });

/* 启动 */
async function start(){
await LabStore.ready;
if(LabStore.failed) return;
for (const k in LABS) LABS[k].mount($('#labbox-'+k));
for (const k of MyData.KEYS) MyData.mount(k, $('#databox-'+k));
buildTabs(); buildControls(); renderStats();
$('#explain').innerHTML = `<p>${esc(PRINCIPLE.double)}</p><p style="color:var(--muted)">在上面输入问题或点一个示例，右边的图样、数值和下面的小测会一起更新；也可以直接拖动滑块做“虚拟实验”。</p>`;
showQuiz(QUIZ.double);
route();
/* 桌面版第一次打开、还没有填 Key 时，自动弹出设置 */
AI.ready.then(()=>{ if (AI.backend && AI.mode==='offline') Settings.open(); });

}
start();
