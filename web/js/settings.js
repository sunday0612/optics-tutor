/* =====================================================================
 * settings.js —— 设置面板：填写 DeepSeek API Key、选择模型、查看使用数据
 * ===================================================================== */
const Settings = (() => {
  const box=$('#settings');
  $('#appVersion').textContent='v'+APP_VERSION;
  let lastFocus=null;

  async function api(path, body){
    const r = await fetch('api/'+path, body===undefined ? {cache:'no-store'} : {method:'POST', headers:apiHeaders(), body:JSON.stringify(body)});
    const j = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(j.error || ('HTTP '+r.status));
    return j;
  }
  function status(text, cls=''){ const el=$('#keyStatus'); el.textContent=text; el.className='kstatus '+cls; }

  async function open(){
    lastFocus=document.activeElement; box.hidden=false; status('');
    const disabled = !AI.backend;
    ['#apiKey','#apiModel','#saveKey','#openData','#refreshUsage'].forEach(s=>$(s).disabled=disabled);
    if (disabled){
      $('#keyHint').textContent='当前是预览版，设置只在桌面软件中可用。';
      $('#usage').innerHTML='<dt>预览版不记录使用数据</dt><dd></dd>';
    } else {
      try { const j=await api('settings'); $('#apiKey').value=''; $('#apiKey').placeholder=j.has_key?`已保存：${j.key_masked}（留空则不修改）`:'sk-…'; $('#apiModel').value=j.model||'deepseek-chat';
        $('#keyHint').textContent='在 platform.deepseek.com 创建 API Key 后填在这里。Key 只保存在这台电脑上。'; }
      catch(e){ status('读取设置失败：'+e.message,'bad'); }
      usage();
    }
    $('#apiKey').focus();
  }
  function close(){ box.hidden=true; if (lastFocus) lastFocus.focus(); }

  async function save(){
    if($('#saveKey').disabled) return;
    const key=$('#apiKey').value.trim(), model=$('#apiModel').value, btn=$('#saveKey');
    if (key && !/^sk-[\w-]{10,}$/.test(key)){ status('Key 的格式不对，应以 sk- 开头。','bad'); return; }
    btn.disabled=true; status('正在保存并测试…');
    try {
      await api('settings', key ? {api_key:key, model} : {model});
      const t=await api('test', {});
      status(`连接成功，用时 ${t.seconds} 秒。`,'ok'); $('#apiKey').value='';
      await aiDetect();
    } catch(e){ status(e.message,'bad'); await aiDetect(); }
    finally { btn.disabled=false; }
  }

  async function usage(){
    try {
      const u=await api('stats');
      const rows=[['使用天数',u.days],['AI 提问',u.ask+' 次'],['随堂小测',u.quiz?`${u.quiz} 道，正确率 ${Math.round(u.quiz_rate*100)}%`:'0 道'],['手动调参',u.adjust+' 次']];
      (u.labs||[]).forEach(l=>rows.push([l.name,`记录 ${l.records} 条，批改 ${l.reviews} 次`]));
      rows.push(['DeepSeek 调用', u.ai_calls?`${u.ai_calls} 次，平均 ${u.ai_avg_seconds} 秒`:'0 次']);
      if (u.ai_errors) rows.push(['AI 调用失败', u.ai_errors+' 次']);
      $('#usage').innerHTML=rows.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
    } catch(e){ $('#usage').innerHTML=`<dt>读取失败：${esc(e.message)}</dt><dd></dd>`; }
  }

  $('#openSettings').onclick=open;
  $('#closeSettings').onclick=close;
  box.addEventListener('click',e=>{ if (e.target===box) close(); });
  document.addEventListener('keydown',e=>{ if (e.key==='Escape' && !box.hidden) close(); });
  $('#saveKey').onclick=save;
  $('#apiKey').addEventListener('keydown',e=>{ if (e.key==='Enter') save(); });
  $('#refreshUsage').onclick=usage;
  $('#openData').onclick=()=>api('open-data',{}).catch(e=>status('无法打开文件夹：'+e.message,'bad'));
  $('#badge').addEventListener('click',()=>{ if (AI.backend && AI.mode==='offline') open(); });
  return {open};
})();
