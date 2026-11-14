// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
//  imprimir.js — (infra, 14-nov-2026, JP: «desde un celular o una tablet poder imprimir en las impresoras los
//  recibos de sueldo; hoy Andrea o Soraya lo hacen con PrintShare, que es medio incómodo»)
//  Manda un PDF a la impresora del local (la que eligió administración en Hub → Permisos → Computadoras). La imprime
//  el programa de impresión del local (el mismo de las etiquetas del POS), que la toma de la base cada pocos segundos.
//
//  Uso desde un módulo (con el cliente de Supabase de quien está usando la pantalla):
//    const r = await ADORNO_IMPRIMIR.enviar({ cli: sb, pdf: doc /* jsPDF, Blob, ArrayBuffer o Uint8Array */,
//                                             nombre: 'Recibo octubre · Pérez', local: 'alcorta' /* opcional */,
//                                             copias: 1, modulo: 'rrhh' });
//    r → { ok: true, id, estado: 'impreso' | 'imprimiendo' | 'pendiente' } | { ok: false, motivo: 'cancel' | 'sin_impresora' | 'error', error }
//    ADORNO_IMPRIMIR.destinos({ cli }) → [{ local, impresora, conectada }]   (para mostrar o no el botón)
//  El PDF se sube a un bucket privado ('impresiones', carpeta = el usuario), la impresora lo baja con un link que vence
//  en 15 minutos y se borra apenas termina. No queda guardado.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
(function () {
  if (window.ADORNO_IMPRIMIR) return;
  var LOCALES = { alcorta: 'Alcorta', unicenter: 'Unicenter', oficina: 'Oficina' };
  var BUCKET = 'impresiones';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function css() {
    if (document.getElementById('aim-css')) return;
    var s = document.createElement('style'); s.id = 'aim-css';
    s.textContent = [
      '.aim-fondo{position:fixed;inset:0;z-index:99991;background:rgba(28,22,18,.55);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}',
      '.aim-caja{background:var(--surface,#fff);color:var(--text,#1C1612);border-radius:28px;max-width:420px;width:100%;max-height:calc(100vh - 32px);overflow:auto;padding:22px 20px 18px;box-sizing:border-box;font-family:Jost,system-ui,-apple-system,sans-serif;box-shadow:0 24px 60px -20px rgba(0,0,0,.5)}',
      '.aim-caja h3{margin:0 0 4px;font-size:18px;font-weight:500}',
      '.aim-nota{font-size:12.5px;line-height:1.45;color:var(--muted,#685B51);margin:0 0 12px;word-break:break-word}',
      '.aim-et{font-size:11px;color:var(--muted,#685B51);margin:10px 0 4px}',
      '.aim-pills{display:flex;flex-wrap:wrap;gap:6px}',
      '.aim-pill{border:1px solid var(--border,#D6CCBA);background:transparent;color:var(--text,#1C1612);border-radius:999px;padding:8px 14px;font:inherit;font-size:13px;cursor:pointer}',
      '.aim-pill.on{background:var(--boton,#1C1612);color:var(--boton-txt,#F7F3EC);border-color:transparent}',
      '.aim-cop{display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:3px;background:var(--bg,#E9E2D5)}',
      '.aim-cop button{border:0;width:34px;height:34px;border-radius:50%;background:var(--surface,#fff);color:var(--text,#1C1612);font:inherit;font-size:17px;cursor:pointer}',
      '.aim-cop span{min-width:32px;text-align:center;font-size:15px}',
      '.aim-estado{min-height:20px;font-size:13px;line-height:1.4;margin:14px 0 0}',
      '.aim-estado.ok{color:var(--ok,#5E7F52)} .aim-estado.mal{color:var(--mal,#A84B37)} .aim-estado.aviso{color:var(--aviso,#A2702C)}',
      '.aim-pie{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px}',
      '.aim-b{border:0;border-radius:999px;padding:10px 20px;font:inherit;font-size:14px;cursor:pointer;background:var(--boton,#1C1612);color:var(--boton-txt,#F7F3EC);white-space:nowrap}',
      '.aim-b.sec{background:transparent;color:var(--text,#1C1612);box-shadow:inset 0 0 0 1px var(--border,#D6CCBA)}',
      '.aim-b:disabled{opacity:.5;cursor:default}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(s);
  }
  function aBlob(pdf) {
    if (!pdf) return null;
    if (typeof Blob !== 'undefined' && pdf instanceof Blob) return pdf;
    if (typeof pdf.output === 'function') return pdf.output('blob');   // jsPDF
    if (pdf instanceof ArrayBuffer || (pdf.buffer && pdf.byteLength != null)) return new Blob([pdf], { type: 'application/pdf' });
    return null;
  }
  function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  async function destinos(o) {
    var r = await o.cli.rpc('hub_imprimir_destinos');
    if (r.error) throw new Error(r.error.message);
    return r.data || [];
  }
  // borra lo propio que haya quedado de antes (más de 1 hora)
  async function limpiar(cli, uid) {
    try {
      var l = await cli.storage.from(BUCKET).list(uid, { limit: 100 });
      var viejos = (l.data || []).filter(function (f) { return f.created_at && (Date.now() - new Date(f.created_at)) > 3600000; })
        .map(function (f) { return uid + '/' + f.name; });
      if (viejos.length) await cli.storage.from(BUCKET).remove(viejos);
    } catch (e) {}
  }

  function enviar(o) {
    o = o || {};
    return new Promise(function (resolver) {
      var cli = o.cli, blob = aBlob(o.pdf), nombre = String(o.nombre || 'Documento').slice(0, 120);
      if (!cli || !blob) { resolver({ ok: false, motivo: 'error', error: 'Falta el documento para imprimir' }); return; }
      css();
      var f = document.createElement('div'); f.className = 'aim-fondo';
      f.innerHTML = '<div class="aim-caja" role="dialog" aria-modal="true"><h3>🖨 Imprimir en el local</h3>' +
        '<p class="aim-nota">' + esc(nombre) + '</p><div class="aim-cuerpo"><p class="aim-nota">Buscando la impresora…</p></div>' +
        '<div class="aim-estado"></div><div class="aim-pie"><button type="button" class="aim-b sec" data-a="cerrar">Cancelar</button>' +
        '<button type="button" class="aim-b" data-a="imprimir" disabled>Imprimir</button></div></div>';
      document.body.appendChild(f);
      var cuerpo = f.querySelector('.aim-cuerpo'), est = f.querySelector('.aim-estado'),
        bImp = f.querySelector('[data-a="imprimir"]'), bCer = f.querySelector('[data-a="cerrar"]');
      var lista = [], elegido = null, copias = Math.min(Math.max(parseInt(o.copias, 10) || 1, 1), 10), terminado = false, resultado = null, ruta = null;
      function estado(t, cls) { est.textContent = t || ''; est.className = 'aim-estado ' + (cls || ''); }
      function cerrar() { if (f.isConnected) f.remove(); resolver(resultado || { ok: false, motivo: 'cancel' }); }
      function pintar() {
        var d = lista.find(function (x) { return x.local === elegido; }) || lista[0];
        cuerpo.innerHTML = (lista.length > 1 ? '<div class="aim-et">¿En qué local?</div><div class="aim-pills">' + lista.map(function (x) {
            return '<button type="button" class="aim-pill ' + (x.local === d.local ? 'on' : '') + '" data-l="' + esc(x.local) + '">' + esc(LOCALES[x.local] || x.local) + '</button>'; }).join('') + '</div>' : '') +
          '<p class="aim-nota" style="margin-top:10px;">Sale por <b>' + esc(d.impresora) + '</b> de ' + esc(LOCALES[d.local] || d.local) + '.' +
          (d.conectada ? '' : ' <span style="color:var(--aviso,#A2702C)">El programa de impresión del local no está conectado ahora: sale cuando se prenda la computadora del local (si tarda más de 15 minutos, se cancela).</span>') + '</p>' +
          '<div class="aim-et">Copias</div><div class="aim-cop"><button type="button" data-c="-1" aria-label="Una copia menos">−</button><span>' + copias + '</span><button type="button" data-c="1" aria-label="Una copia más">+</button></div>';
        elegido = d.local;
      }
      f.addEventListener('click', function (ev) {
        var t = ev.target;
        if (t === f && !bImp.disabled) { cerrar(); return; }
        if (t.dataset && t.dataset.a === 'cerrar') { cerrar(); return; }
        if (t.dataset && t.dataset.l && !terminado) { elegido = t.dataset.l; pintar(); return; }
        if (t.dataset && t.dataset.c && !terminado) { copias = Math.min(Math.max(copias + parseInt(t.dataset.c, 10), 1), 10); pintar(); return; }
        if (t.dataset && t.dataset.a === 'imprimir' && !t.disabled) mandar();
      });
      destinos({ cli: cli }).then(function (ds) {
        lista = ds;
        if (!lista.length) {
          cuerpo.innerHTML = '<p class="aim-nota">Tu local todavía no tiene una impresora elegida para imprimir desde acá. La elige administración en el Hub → Permisos → Computadoras.</p>';
          resultado = { ok: false, motivo: 'sin_impresora' }; bCer.textContent = 'Cerrar'; return;
        }
        var pref = String(o.local || '').toLowerCase();
        elegido = (lista.find(function (x) { return x.local === pref; }) || lista[0]).local;
        pintar(); bImp.disabled = false;
      }).catch(function (e) {
        cuerpo.innerHTML = ''; estado('No pude buscar la impresora: ' + e.message, 'mal');
        resultado = { ok: false, motivo: 'error', error: e.message }; bCer.textContent = 'Cerrar';
      });

      async function mandar() {
        bImp.disabled = true; terminado = true; estado('Mandando a la impresora…');
        try {
          var u = await cli.auth.getUser(); var uid = u && u.data && u.data.user && u.data.user.id;
          if (!uid) throw new Error('Sin sesión: volvé a entrar al módulo');
          limpiar(cli, uid);
          ruta = uid + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.pdf';
          var up = await cli.storage.from(BUCKET).upload(ruta, blob, { contentType: 'application/pdf', upsert: false });
          if (up.error) throw new Error(up.error.message);
          var fir = await cli.storage.from(BUCKET).createSignedUrl(ruta, 900);
          if (fir.error || !fir.data) throw new Error((fir.error && fir.error.message) || 'No se pudo preparar el archivo');
          var url = fir.data.signedUrl || fir.data.signedURL;
          var p = await cli.rpc('hub_imprimir_pedir', { p_local: elegido, p_nombre: nombre, p_url: url, p_archivo: ruta, p_copias: copias, p_modulo: o.modulo || null });
          if (p.error) throw new Error(p.error.message);
          var id = p.data.id, fin = null;
          resultado = { ok: true, id: id, estado: 'pendiente' };
          estado('Esperando a la impresora de ' + (LOCALES[elegido] || elegido) + '…');
          bCer.textContent = 'Cerrar';
          for (var i = 0; i < 30 && f.isConnected; i++) {   // hasta 1 minuto mirando
            await esperar(2000);
            var s = await cli.rpc('hub_imprimir_estado', { p_id: id });
            var e = s.data && s.data.estado;
            if (e) resultado.estado = e;
            if (e === 'imprimiendo') estado('Imprimiendo…');
            if (e === 'impreso' || e === 'error' || e === 'vencido') { fin = s.data; break; }
          }
          if (fin && fin.estado === 'impreso') { estado('✓ Listo: salió por la impresora.', 'ok'); setTimeout(cerrar, 1600); }
          else if (fin) { resultado = { ok: false, motivo: 'error', id: id, error: fin.error || 'No se pudo imprimir' }; estado('No se pudo imprimir: ' + (fin.error || 'error'), 'mal'); }
          else estado('Quedó en la cola: sale apenas el programa del local lo tome. Podés cerrar esta ventana.', 'aviso');
          if (fin) cli.storage.from(BUCKET).remove([ruta]).catch(function () {});
        } catch (e) {
          resultado = { ok: false, motivo: 'error', error: e.message };
          estado('No se pudo mandar: ' + e.message, 'mal'); bCer.textContent = 'Cerrar';
          if (ruta) cli.storage.from(BUCKET).remove([ruta]).catch(function () {});
        }
      }
    });
  }

  window.ADORNO_IMPRIMIR = { enviar: enviar, destinos: destinos };
})();
