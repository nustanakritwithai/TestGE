// P0 Stability Lock: lightweight runtime diagnostics; never wraps or replaces the renderer.
(function(){
  const boot=Date.now();
  function box(message,detail=''){
    if(document.getElementById('runtimeFallback')) return;
    const el=document.createElement('div'); el.id='runtimeFallback';
    el.style.cssText='margin:8px;padding:10px;border:1px solid #9b7040;border-radius:10px;background:#2a1b12;color:#ffe5bd;font:13px system-ui;white-space:pre-line';
    el.textContent=message+(detail?'\n'+detail:'');
    const battle=document.querySelector('.battle'); (battle?.parentNode||document.body).insertBefore(el,battle?.nextSibling||null);
  }
  window.addEventListener('error',e=>box('⚠️ เกมโหลด JavaScript ไม่สำเร็จ',e.message||'Unknown runtime error'));
  window.addEventListener('unhandledrejection',e=>box('⚠️ โมดูลเกมเริ่มทำงานไม่สำเร็จ',String(e.reason||'Unknown module error')));
  document.addEventListener('DOMContentLoaded',()=>{
    const canvas=document.createElement('canvas');
    const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
    if(!gl) box('⚠️ อุปกรณ์นี้ไม่สามารถเปิด WebGL ได้','ลองเปิด Hardware acceleration หรือใช้เบราว์เซอร์ที่รองรับ WebGL');
    setTimeout(()=>{
      if(!document.querySelector('#viewport canvas')) box('⚠️ Renderer 3D ยังไม่เริ่มภายใน 8 วินาที','หน้าเว็บยังทำงานอยู่ แต่โมดูล Three.js หรือ battle engine อาจโหลดไม่สำเร็จ');
    },8000);
  });
  window.__JRPG_STABILITY__={baseline:'battle-v5',boot};
})();
