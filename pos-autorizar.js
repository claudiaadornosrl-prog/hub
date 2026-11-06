// pos-autorizar.js · v1 (6-nov-2026) · Compartido por el Hub y RRHH (se carga como /hub/pos-autorizar.js).
// El POS pide autorización a una encargada/cajera: le llega un push (app rrhh) con el link ?autorizar=ID. En el iPhone la
// notificación solo puede abrir la PWA que la recibió (el Hub o RRHH), así que el Aceptar / Rechazar vive acá y no en el POS.
// Usa el cliente `sb` que ya tiene la página (sesión compartida por ADORNO_SSO) y la RPC pos_autorizacion_resolver.
(function () {
  function idPedido() { try { return new URLSearchParams(location.search).get('autorizar'); } catch (e) { return null; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function pila(n) { if (!n) return ''; const p = (String(n).split(',')[1] || n).trim().toLowerCase(); return p.replace(/(^|\s)\S/g, m => m.toUpperCase()); }
  const NOM = { nc: 'una nota de crédito', ma: 'un comprobante X', re: 'un remito', anular: 'una anulación' };
  function caja(html) {
    let ov = document.getElementById('pos-aut-ov');
    if (!ov) { ov = document.createElement('div'); ov.id = 'pos-aut-ov'; ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Nunito,system-ui,sans-serif'; document.body.appendChild(ov); }
    ov.innerHTML = '<div style="background:#fff;color:#1f2937;border-radius:18px;padding:18px 20px;max-width:420px;width:100%;box-shadow:0 12px 40px rgba(0,0,0,.25);font-size:15px;line-height:1.4">' + html + '</div>';
    return ov;
  }
  function cerrar() { const ov = document.getElementById('pos-aut-ov'); if (ov) ov.remove(); }
  const B = (txt, color, fondo, borde) => 'style="font-family:inherit;font-size:15px;font-weight:700;border-radius:999px;padding:10px 20px;cursor:pointer;border:1.5px solid ' + borde + ';background:' + fondo + ';color:' + color + '"';
  async function responder(id) {
    let cli = null; for (let i = 0; i < 60; i++) { try { if (typeof sb !== 'undefined' && sb && sb.rpc) { cli = sb; break; } } catch (e) {} await new Promise(r => setTimeout(r, 250)); }
    if (!cli) return;
    try { const { data: { session } } = await cli.auth.getSession(); if (!session) return; } catch (e) { return; }   // sin sesión: la página pedirá login y el ?autorizar sigue en la URL
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
    const { data: a } = await cli.from('pos_autorizaciones').select('*').eq('id', id).maybeSingle();
    const aviso = (t, sub) => { const ov = caja('<b style="font-size:17px">' + esc(t) + '</b><div style="color:#6b7280;font-size:13px;margin-top:6px">' + esc(sub) + '</div><div style="text-align:right;margin-top:14px"><button id="pa-ok" ' + B('#fff', '#0e7490', '#0e7490') + '>Listo</button></div>'); ov.querySelector('#pa-ok').onclick = cerrar; };
    if (!a) { aviso('No encontré ese pedido de autorización', 'Puede que lo hayan cancelado o que sea de otro local.'); return; }
    if (a.estado !== 'pendiente') { aviso(a.estado === 'aceptada' || a.estado === 'usada' ? 'Ese pedido ya estaba aceptado' : a.estado === 'rechazada' ? 'Ese pedido ya estaba rechazado' : 'Ese pedido se canceló o venció', ((a.detalle || {}).resumen || '') + (a.autorizadora_nombre ? ' · lo resolvió ' + pila(a.autorizadora_nombre) : '')); return; }
    const hora = new Date(a.creado_at).toTimeString().slice(0, 5);
    const ov = caja('<b style="font-size:17px">' + esc(pila(a.pedido_por_nombre)) + ' pide autorizar ' + esc(NOM[a.accion] || a.accion) + '</b>' +
      '<div style="margin:10px 0 4px">' + esc((a.local || '').charAt(0).toUpperCase() + (a.local || '').slice(1)) + ' · ' + esc((a.detalle || {}).resumen || '') + '</div>' +
      '<div style="color:#6b7280;font-size:13px">Pedido a las ' + hora + ' · vence a los 10 minutos</div>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px"><button id="pa-no" ' + B('#1f2937', '#fff', '#e5e7eb') + '>Rechazar</button><button id="pa-si" ' + B('#fff', '#0e7490', '#0e7490') + '>Aceptar</button></div>');
    const r = async acepta => {
      ov.querySelectorAll('button').forEach(b => b.disabled = true);
      const { data, error } = await cli.rpc('pos_autorizacion_resolver', { p_id: Number(id), p_acepta: acepta });
      if (error) { aviso('No se pudo', String(error.message || '').replace(/^.*?: /, '')); return; }
      if (data && data.ya) aviso('Ya lo había resuelto ' + pila(data.autorizadora), '');
      else if (data && data.estado === 'vencida') aviso('El pedido venció', 'Pasaron más de 10 minutos. Que lo pidan de nuevo.');
      else aviso(acepta ? 'Listo: ' + pila(a.pedido_por_nombre) + ' ya puede emitir' : 'Rechazado', acepta ? 'El comprobante sale solo en la caja.' : 'En la caja ven que lo rechazaste.');
    };
    ov.querySelector('#pa-si').onclick = () => r(true); ov.querySelector('#pa-no').onclick = () => r(false);
  }
  function mirar() { const id = idPedido(); if (id) responder(id); }
  if (document.readyState === 'complete') mirar(); else window.addEventListener('load', mirar);
  // con la app ya abierta, el service worker manda la URL por mensaje (RRHH) o navega (Hub); por las dudas, los dos caminos
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', ev => { const d = ev.data || {}; if (d.tipo !== 'abrir-url' || !d.url) return; try { const id = new URL(d.url).searchParams.get('autorizar'); if (id) responder(id); } catch (e) {} });
})();
