/* =====================================================================
 * app.js —— 页面路由与启动：#sim 现象仿真；#lab-michelson / #lab-newton / #lab-grating / #lab-fiber / #lab-polar 虚拟实验
 * ===================================================================== */
const LABS = {michelson:MI, newton:NR, grating:SP, fiber:FB, polar:PL};
let curLab = 'michelson';

function route(){
  const h = location.hash.slice(1);
  const v = h.startsWith('lab') ? 'lab' : 'sim';
  if (v==='lab'){ const k=h.split('-')[1]; if (LABS[k]) curLab=k; }
  $('#view-sim').hidden = v!=='sim';
  $('#view-lab').hidden = v!=='lab';
  document.querySelectorAll('.mode').forEach(b=>b.classList.toggle('active', b.dataset.v===v));
  document.querySelectorAll('.labtab').forEach(b=>b.classList.toggle('active', b.dataset.lab===curLab));
  for (const k in LABS) $('#labbox-'+k).hidden = k!==curLab;
  if (v==='sim') render(); else LABS[curLab].render();
}
document.querySelectorAll('.mode').forEach(b=>b.addEventListener('click',()=>{ location.hash = b.dataset.v==='lab' ? 'lab-'+curLab : 'sim'; }));
document.querySelectorAll('.labtab').forEach(b=>b.addEventListener('click',()=>{ location.hash = 'lab-'+b.dataset.lab; }));
window.addEventListener('hashchange', route);

/* 键盘 ← → 微调当前实验的鼓轮 / 望远镜 / 光纤调整架 / 偏振片转盘 */
document.addEventListener('keydown', e=>{
  if ($('#view-lab').hidden || !$('#settings').hidden || /input|textarea|select/i.test(e.target.tagName)) return;
  if (e.key==='ArrowRight' || e.key==='ArrowLeft'){ e.preventDefault(); LABS[curLab].key(e.key==='ArrowRight'?1:-1, e.shiftKey); }
});
let resizeTimer;
window.addEventListener('resize', ()=>{ clearTimeout(resizeTimer); resizeTimer=setTimeout(()=>{ if (!$('#view-sim').hidden) render(); else LABS[curLab].render(); },120); });

/* 启动 */
async function start(){
await LabStore.ready;
if(LabStore.failed) return;
for (const k in LABS) LABS[k].mount($('#labbox-'+k));
buildTabs(); buildControls(); renderStats();
$('#explain').innerHTML = `<p>${esc(PRINCIPLE.double)}</p><p style="color:var(--muted)">在上面输入问题或点一个示例，右边的图样、数值和下面的小测会一起更新；也可以直接拖动滑块做“虚拟实验”。</p>`;
showQuiz(QUIZ.double);
route();
/* 桌面版第一次打开、还没有填 Key 时，自动弹出设置 */
AI.ready.then(()=>{ if (AI.backend && AI.mode==='offline') Settings.open(); });

}
start();
