// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
//  caras.js — (infra, 12-nov-2026, JP: "tendría que ser en el hub porque el control de cara se va a usar para casi
//  todos los módulos… en el usuario genérico no se tendría que grabar… que cada persona tenga su usuario grabado en
//  el hub con la cara, para que esas caras puedan ir interactuando en todo el sistema")
//  · Graba la cara de CADA PERSONA (su usuario personal / su legajo). Las cuentas compartidas no llevan cara.
//  · Se guarda en pos_caras (128 números por toma, nunca la foto) con las RPC hub_caras_* : la usan POS, Tesorería,
//    Ventas y las autorizaciones de todo el sistema.
//  · Graba administración (a todos) o la encargada con SU usuario personal (a la gente de su local).
//    En la compu trabada del local se abre con "usuario superior": un cliente aparte que no guarda sesión.
//  · Tres tomas por pasada (frente, izquierda, derecha); "Con lentes" repite la pasada con los lentes puestos.
//  API: ADORNO_CARAS.equipo({ cli?, superior? }) · .ficha({ cli, persona, alCambiar }) · .grabar({ cli, persona, lentes })
//       .probar({ cli }) · .superior() → cliente | null
//       .quien({ cli, rpc, params, titulo, nota }) → { ok:true, data } | { ok:false, motivo:'cancel'|'lista'|'no'|'camara', error? }
//         (13-nov-2026) abre la cámara y, sin tocar nada, lee la cara y la busca con la RPC que le pasan (p_descriptor + params).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
(function () {
  if (window.ADORNO_CARAS) return;
  var SB = 'https://jfwtiagteuwmyvblgwms.supabase.co', KEY = 'sb_publishable_udSPma98Sw9eskeeLCgdCw_S2vIX0Fk';
  var CDN = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13';
  var SRI = 'sha384-5SEinnOIOK1Nl6bzEIWwfXWMg4EaJhN2bXKgrjYC0Bq+fYNZHwhD3ntM92lTHnfL';
  var LOCALES = { alcorta: 'Alcorta', unicenter: 'Unicenter', oficina: 'Oficina' };
  var PASOS = {
    sin: [['frente', 'Mirá de frente a la cámara'], ['izq', 'Girá un poco la cabeza hacia tu izquierda'], ['der', 'Ahora girá un poco hacia tu derecha']],
    lentes: [['lentes', 'Con los lentes puestos, mirá de frente'], ['lentes_izq', 'Con lentes: girá un poco hacia tu izquierda'], ['lentes_der', 'Con lentes: girá un poco hacia tu derecha']]
  };
  var libP = null, stream = null, vivo = null;

  // ── utilidades ──
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function tit(s) { return String(s || '').toLowerCase().replace(/(^|[\s'-])\S/g, function (x) { return x.toUpperCase(); }); }
  function nombre(n) { var t = String(n || '').trim(); if (!t.includes(',')) return tit(t); var p = t.split(','); return tit(p[1].trim() + ' ' + p[0].trim()); }
  function pila(n) { return nombre(n).split(' ')[0] || ''; }
  function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function msjError(e) { return String((e && e.message) || e || 'Error'); }
  function fecha(ts) { if (!ts) return ''; var d = new Date(ts); return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }); }

  function css() {
    if (document.getElementById('acr-css')) return;
    var s = document.createElement('style'); s.id = 'acr-css';
    s.textContent = [
      '.acr-fondo{position:fixed;inset:0;z-index:99990;background:rgba(28,22,18,.55);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}',
      '.acr-fondo.arriba{z-index:99992}',
      '.acr-fondo.pregunta{z-index:99994}',
      '.acr-caja{background:var(--surface,#fff);color:var(--text,#1C1612);border-radius:28px;max-width:440px;width:100%;max-height:calc(100vh - 32px);overflow:auto;padding:22px 20px 18px;box-sizing:border-box;font-family:Jost,system-ui,-apple-system,sans-serif;box-shadow:0 24px 60px -20px rgba(0,0,0,.5)}',
      '.acr-caja.ancha{max-width:560px}',
      '.acr-cab{display:flex;align-items:center;gap:10px;margin-bottom:6px}',
      '.acr-cab h3{margin:0;font-size:18px;font-weight:500;flex:1;min-width:0}',
      '.acr-x{border:0;background:transparent;color:var(--muted,#685B51);font-size:18px;cursor:pointer;padding:4px 8px;border-radius:999px}',
      '.acr-nota{font-size:12.5px;line-height:1.45;color:var(--muted,#685B51);margin:0 0 12px}',
      '.acr-in{width:100%;box-sizing:border-box;padding:10px 16px;margin:0 0 10px;border:1px solid var(--border,#D6CCBA);border-radius:999px;font:inherit;font-size:15px;background:var(--surface,#fff);color:var(--text,#1C1612)}',
      '.acr-err{min-height:18px;font-size:12.5px;color:var(--mal,#A84B37);margin:2px 0 8px}',
      '.acr-ok{color:var(--ok,#5E7F52)}',
      '.acr-pie{display:flex;gap:8px;justify-content:flex-end;align-items:center;flex-wrap:wrap;margin-top:12px}',
      '.acr-pie .esp{flex:1}',
      '.acr-b{border:0;border-radius:999px;padding:9px 18px;font:inherit;font-size:13.5px;cursor:pointer;background:var(--boton,#1C1612);color:var(--boton-txt,#F7F3EC);white-space:nowrap}',
      '.acr-b.sec{background:transparent;color:var(--text,#1C1612);box-shadow:inset 0 0 0 1px var(--border,#D6CCBA)}',
      '.acr-b.peligro{background:transparent;color:var(--mal,#A84B37);box-shadow:inset 0 0 0 1px var(--mal,#A84B37)}',
      '.acr-b.chico{padding:7px 14px;font-size:12.5px}',
      '.acr-b:disabled{opacity:.5;cursor:default}',
      '.acr-video{position:relative;border-radius:24px;overflow:hidden;background:#1C1612;aspect-ratio:4/3;margin:8px 0 6px}',
      '.acr-video video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1);display:block}',
      '.acr-ovalo{position:absolute;left:50%;top:50%;width:46%;height:72%;transform:translate(-50%,-50%);border-radius:50%;border:3px dashed rgba(247,243,236,.75);transition:border-color .2s;pointer-events:none}',
      '.acr-ovalo.ve{border-style:solid;border-color:#8FB07F}',
      '.acr-msg{position:absolute;left:12px;right:12px;bottom:12px;text-align:center;color:#F7F3EC;font-size:13px;text-shadow:0 1px 4px rgba(0,0,0,.6)}',
      '.acr-pasos{display:flex;gap:6px;margin:6px 0 4px}',
      '.acr-paso{flex:1;text-align:center;font-size:11.5px;padding:6px 4px;border-radius:999px;background:var(--bg,#E9E2D5);color:var(--muted,#685B51)}',
      '.acr-paso.ahora{background:var(--aviso-suave,#F3E9D6);color:var(--aviso,#A2702C);font-weight:500}',
      '.acr-paso.hecho{background:var(--ok-suave,#E4EBDD);color:var(--ok,#5E7F52)}',
      '.acr-instr{font-size:15px;font-weight:500;margin:4px 0 0}',
      '.acr-fila{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:.5px solid var(--border,#D6CCBA)}',
      '.acr-fila .q{flex:1;min-width:0}',
      '.acr-fila .q b{display:block;font-weight:500;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.acr-fila .q small{display:block;font-size:11.5px;color:var(--muted,#685B51)}',
      '.acr-chip{display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:3px 10px;font-size:11.5px;white-space:nowrap}',
      '.acr-chip.si{background:var(--ok-suave,#E4EBDD);color:var(--ok,#5E7F52)}',
      '.acr-chip.no{background:var(--bg,#E9E2D5);color:var(--muted,#685B51)}',
      '.acr-chip.media{background:var(--aviso-suave,#F3E9D6);color:var(--aviso,#A2702C)}',
      '.acr-grupo{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted,#685B51);margin:14px 0 2px}',
      '.acr-resumen{font-size:13px;margin:0 0 6px}',
      '@media (max-width:520px){.acr-in{font-size:16px}.acr-fila{flex-wrap:wrap}.acr-fila .acc{width:100%;display:flex;gap:6px;justify-content:flex-end}}'
    ].join('\n');
    document.head.appendChild(s);
  }
  function abrir(html, o) {
    css(); o = o || {};
    var f = document.createElement('div'); f.className = 'acr-fondo' + (o.arriba ? ' arriba' : '') + (o.pregunta ? ' pregunta' : '');
    f.setAttribute('data-adorno-superior', '1');   // para /hub/equipo.js: no es el ingreso del equipo
    f.innerHTML = '<div class="acr-caja' + (o.ancha ? ' ancha' : '') + '" role="dialog" aria-modal="true">' + html + '</div>';
    document.body.appendChild(f);
    return f;
  }
  // pregunta con dos pastillas (en vez del cuadro del navegador)
  function confirmar(texto, si, no) {
    return new Promise(function (listo) {
      var f = abrir('<p class="acr-resumen" style="font-size:14.5px;line-height:1.45;margin:4px 0 4px">' + esc(texto) + '</p>' +
        '<div class="acr-pie"><button class="acr-b sec" data-r="0">' + esc(no || 'Cancelar') + '</button><button class="acr-b" data-r="1">' + esc(si || 'Sí') + '</button></div>', { pregunta: true });
      f.querySelectorAll('[data-r]').forEach(function (b) { b.onclick = function () { f.remove(); listo(b.dataset.r === '1'); }; });
    });
  }
  function avisar(texto) { return confirmar(texto, 'Entendido', 'Cerrar'); }
  function estado(p) {
    var t = (p && p.tomas) || [];
    var base = ['frente', 'izq', 'der'].filter(function (v) { return t.indexOf(v) >= 0; }).length;
    var lentes = t.indexOf('lentes') >= 0;
    if (base === 3) return { cls: 'si', txt: '✓ Grabada' + (lentes ? ' · con lentes' : ''), completa: true, lentes: lentes };
    if (t.length) return { cls: 'media', txt: 'Incompleta · ' + t.length + (t.length === 1 ? ' toma' : ' tomas'), completa: false, lentes: lentes };
    return { cls: 'no', txt: 'Sin grabar', completa: false, lentes: false };
  }

  // ── reconocimiento (face-api, se baja solo la primera vez) ──
  function lib() {
    return libP || (libP = new Promise(function (ok, mal) {
      if (window.faceapi && faceapi.nets) return cargarModelos().then(ok, mal);
      var sc = document.createElement('script'); sc.src = CDN + '/dist/face-api.js'; sc.integrity = SRI; sc.crossOrigin = 'anonymous';
      sc.onload = function () { cargarModelos().then(ok, mal); };
      sc.onerror = function () { libP = null; mal(new Error('No pude bajar el reconocimiento de caras. Revisá internet.')); };
      document.head.appendChild(sc);
    })).catch(function (e) { libP = null; throw e; });
  }
  function cargarModelos() {
    var m = CDN + '/model';
    return Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri(m), faceapi.nets.faceLandmark68TinyNet.loadFromUri(m), faceapi.nets.faceRecognitionNet.loadFromUri(m)]);
  }
  function camara(video) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('Este navegador no deja usar la cámara.'));
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
      .then(function (s) { stream = s; video.srcObject = s; return video.play(); })
      .catch(function (e) {
        if (e && e.name === 'NotAllowedError') throw new Error('El navegador no dio permiso para la cámara. Tocá el candado de la barra de direcciones y permitila.');
        if (e && e.name === 'NotFoundError') throw new Error('No encontré ninguna cámara conectada a esta computadora.');
        throw e;
      });
  }
  function apagar() { clearInterval(vivo); vivo = null; if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; } }
  function opciones() { return new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }); }
  function leerUna(video) { return faceapi.detectSingleFace(video, opciones()).withFaceLandmarks(true).withFaceDescriptor().then(function (d) { return d ? d.descriptor : null; }); }
  function dist(a, b) { var t = 0; for (var i = 0; i < 128; i++) { var x = a[i] - b[i]; t += x * x; } return Math.sqrt(t); }
  // 5 lecturas buenas (de 8 intentos), promediadas; null si no se vio la cara o se movió
  async function lectura(video, msg) {
    var ds = [];
    for (var i = 0; i < 8 && ds.length < 5 && stream; i++) {
      msg('Leyendo… ' + ds.length + ' de 5');
      var d = null; try { d = await leerUna(video); } catch (x) {}
      if (d) ds.push(d);
      await esperar(250);
    }
    if (ds.length < 3) return { error: 'poca' };
    var prom = []; for (var k = 0; k < 128; k++) { var s = 0; for (var j = 0; j < ds.length; j++) s += ds[j][k]; prom.push(s / ds.length); }
    var peor = 0; ds.forEach(function (d) { peor = Math.max(peor, dist(d, prom)); });
    if (peor > 0.35) return { error: 'movio' };
    return { descriptor: prom };
  }
  // el óvalo se pone verde cuando ve una cara
  function mirar(video, ovalo) {
    clearInterval(vivo);
    vivo = setInterval(function () {
      if (!stream || video.readyState < 2) return;
      faceapi.detectSingleFace(video, opciones()).then(function (d) { ovalo.classList.toggle('ve', !!d); }).catch(function () {});
    }, 500);
  }

  // ── usuario superior (en la compu del local o de la oficina) ──
  function superior() {
    return new Promise(function (listo) {
      var f = abrir('<div class="acr-cab"><h3>Grabar caras</h3><button class="acr-x" aria-label="Cerrar">✕</button></div>' +
        '<p class="acr-nota">Entrá con <b>tu usuario personal</b>: administración, o la encargada del local (graba a la gente de su local). ' +
        'La cuenta del local o de la oficina no sirve. No queda guardado en esta computadora.</p>' +
        '<input class="acr-in" id="acr-mail" type="email" autocomplete="off" placeholder="Tu usuario (mail)">' +
        '<input class="acr-in" id="acr-clave" type="password" autocomplete="new-password" placeholder="Tu clave">' +
        '<div class="acr-err" id="acr-err"></div>' +
        '<div class="acr-pie"><button class="acr-b sec" id="acr-no">Cancelar</button><button class="acr-b" id="acr-si">Entrar</button></div>');
      var mail = f.querySelector('#acr-mail'), clave = f.querySelector('#acr-clave'), err = f.querySelector('#acr-err'), si = f.querySelector('#acr-si');
      function fin(v) { f.remove(); listo(v); }
      f.querySelector('.acr-x').onclick = f.querySelector('#acr-no').onclick = function () { fin(null); };
      clave.addEventListener('keydown', function (e) { if (e.key === 'Enter') si.click(); });
      setTimeout(function () { mail.focus(); }, 50);
      si.onclick = async function () {
        var em = (mail.value || '').trim().toLowerCase(), pw = clave.value || '';
        err.textContent = '';
        if (!em || !pw) { err.textContent = 'Completá el mail y la clave.'; return; }
        if (!window.supabase || !window.supabase.createClient) { err.textContent = 'Recargá la página y probá de nuevo.'; return; }
        si.disabled = true; si.textContent = 'Entrando…';
        var cli = window.supabase.createClient(SB, KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'adorno-caras-superior' } });
        var salir = function () { try { cli.auth.signOut({ scope: 'local' }); } catch (x) {} };
        try {
          var r = await cli.auth.signInWithPassword({ email: em, password: pw });
          if (r.error) throw new Error('Mail o clave incorrectos.');
          if (window.ADORNO_MFA && ADORNO_MFA.pedirCodigo && !(await ADORNO_MFA.pedirCodigo(cli))) { salir(); throw new Error('Sin el código del celular no se puede entrar.'); }
          var p = await cli.rpc('hub_caras_listar');
          if (p.error) { salir(); throw new Error(msjError(p.error)); }
          cli._acrSuperior = true; cli._acrDatos = p.data;
          fin(cli);
        } catch (e) { err.textContent = msjError(e); si.disabled = false; si.textContent = 'Entrar'; }
      };
    });
  }

  // ── lista del equipo ──
  async function equipo(o) {
    o = o || {};
    var cli = o.cli, datos = null;
    if (o.superior) { cli = await superior(); if (!cli) return; datos = cli._acrDatos; }
    if (!cli) return;
    var f = abrir('<div class="acr-cab"><h3>Caras del equipo</h3><button class="acr-x" aria-label="Cerrar">✕</button></div>' +
      '<div id="acr-cuerpo"><p class="acr-nota">Cargando…</p></div>' +
      '<div class="acr-pie"><button class="acr-b sec" id="acr-probar">Probar la cámara</button><span class="esp"></span><button class="acr-b" id="acr-listo">Listo</button></div>', { ancha: true });
    var cuerpo = f.querySelector('#acr-cuerpo'), idle = null;
    function cerrar() { clearTimeout(idle); f.remove(); if (cli._acrSuperior) { try { cli.auth.signOut({ scope: 'local' }); } catch (x) {} } }
    function tocar() { clearTimeout(idle); if (cli._acrSuperior) idle = setTimeout(cerrar, 15 * 60000); }   // con usuario superior se cierra sola a los 15 min sin uso
    f.querySelector('.acr-x').onclick = f.querySelector('#acr-listo').onclick = cerrar;
    f.querySelector('#acr-probar').onclick = function () { tocar(); probar({ cli: cli }); };
    async function pintar(d) {
      tocar();
      if (!d) { var r = await cli.rpc('hub_caras_listar'); if (r.error) { cuerpo.innerHTML = '<div class="acr-err">' + esc(msjError(r.error)) + '</div>'; return; } d = r.data; }
      var ps = d.personas || [], yo = d.yo || {}, listas = ps.filter(function (p) { return estado(p).completa; }).length;
      var h = '<p class="acr-nota">Cada persona graba su cara una sola vez, parada frente a la cámara de esta computadora: tres tomas seguidas (de frente y los dos costados). ' +
        'Después el sistema la reconoce para autorizar y para saber quién hizo cada cosa. No se guarda ninguna foto. Las cuentas compartidas no llevan cara.</p>' +
        '<p class="acr-resumen"><b>' + listas + ' de ' + ps.length + '</b> con la cara grabada' + (yo.admin ? '' : ' en ' + esc(LOCALES[yo.local] || yo.local || 'tu local')) + ' · graba ' + esc(nombre(yo.nombre)) + '</p>';
      var grupo = null;
      ps.forEach(function (p) {
        if (yo.admin && p.local !== grupo) { grupo = p.local; h += '<div class="acr-grupo">' + esc(LOCALES[grupo] || grupo || 'Sin local') + '</div>'; }
        var e = estado(p);
        h += '<div class="acr-fila"><div class="q"><b>' + esc(nombre(p.nombre)) + '</b><small><span class="acr-chip ' + e.cls + '">' + esc(e.txt) + '</span>' +
          (p.cara_at ? ' <span>' + esc(fecha(p.cara_at)) + '</span>' : '') + '</small></div><div class="acc">' +
          '<button class="acr-b chico' + (e.completa ? ' sec' : '') + '" data-g="' + p.empleado_id + '">' + (e.completa ? 'Volver a grabar' : 'Grabar cara') + '</button>' +
          '<button class="acr-b chico sec" data-l="' + p.empleado_id + '" title="Para quien usa anteojos: las mismas tres tomas con los anteojos puestos">' + (e.lentes ? '✓ Con lentes' : '+ Con lentes') + '</button>' +
          (p.tomas && p.tomas.length ? '<button class="acr-b chico peligro" data-b="' + p.empleado_id + '" aria-label="Borrar la cara">Borrar</button>' : '') +
          '</div></div>';
      });
      if (!ps.length) h += '<p class="acr-nota">No hay personas cargadas.</p>';
      cuerpo.innerHTML = h;
      var por = function (id) { return ps.find(function (p) { return String(p.empleado_id) === String(id); }); };
      cuerpo.querySelectorAll('[data-g]').forEach(function (b) { b.onclick = function () { tocar(); grabar({ cli: cli, persona: por(b.dataset.g) }).then(function (ok) { if (ok) pintar(); }); }; });
      cuerpo.querySelectorAll('[data-l]').forEach(function (b) { b.onclick = function () { tocar(); grabar({ cli: cli, persona: por(b.dataset.l), lentes: true }).then(function (ok) { if (ok) pintar(); }); }; });
      cuerpo.querySelectorAll('[data-b]').forEach(function (b) { b.onclick = function () { tocar(); borrar({ cli: cli, persona: por(b.dataset.b) }).then(function (ok) { if (ok) pintar(); }); }; });
    }
    pintar(datos);
  }

  // ── la ficha de una persona (Permisos → Personas) ──
  function ficha(o) {
    var p = o.persona, cli = o.cli, e = estado(p);
    var f = abrir('<div class="acr-cab"><h3>Cara de ' + esc(nombre(p.nombre)) + '</h3><button class="acr-x" aria-label="Cerrar">✕</button></div>' +
      '<p class="acr-nota">' + esc(LOCALES[p.local] || p.local || '') + (p.email ? ' · ' + esc(p.email) : '') + '</p>' +
      '<p class="acr-resumen"><span class="acr-chip ' + e.cls + '">' + esc(e.txt) + '</span>' + (p.cara_at ? ' <span class="acr-nota">' + esc(fecha(p.cara_at)) + (p.registrado_por ? ' · ' + esc(p.registrado_por) : '') + '</span>' : '') + '</p>' +
      '<p class="acr-nota">La persona se para frente a la cámara de esta computadora. Son tres tomas seguidas: de frente y los dos costados. ' +
      'Si usa anteojos siempre, después se graba otra pasada con los anteojos puestos. No se guarda ninguna foto.</p>' +
      '<div class="acr-pie">' + (p.tomas && p.tomas.length ? '<button class="acr-b sec peligro" id="acr-borrar">Borrar</button>' : '') + '<span class="esp"></span>' +
      '<button class="acr-b sec" id="acr-lentes">' + (e.lentes ? '✓ Con lentes' : '+ Con lentes') + '</button>' +
      '<button class="acr-b" id="acr-grabar">' + (e.completa ? 'Volver a grabar' : 'Grabar cara') + '</button></div>');
    var cerrar = function () { f.remove(); };
    var luego = function (ok) { if (ok) { cerrar(); if (o.alCambiar) o.alCambiar(); } };
    f.querySelector('.acr-x').onclick = cerrar;
    f.querySelector('#acr-grabar').onclick = function () { grabar({ cli: cli, persona: p }).then(luego); };
    f.querySelector('#acr-lentes').onclick = function () { grabar({ cli: cli, persona: p, lentes: true }).then(luego); };
    var bb = f.querySelector('#acr-borrar'); if (bb) bb.onclick = function () { borrar({ cli: cli, persona: p }).then(luego); };
  }

  // ── grabar: tres tomas guiadas ──
  function grabar(o) {
    return new Promise(function (listo) {
      var p = o.persona, cli = o.cli, pasos = PASOS[o.lentes ? 'lentes' : 'sin'], tomas = [], k = 0;
      if (!p) return listo(false);
      var f = abrir('<div class="acr-cab"><h3>' + esc(nombre(p.nombre)) + (o.lentes ? ' · con lentes' : '') + '</h3><button class="acr-x" aria-label="Cerrar">✕</button></div>' +
        '<div class="acr-pasos">' + pasos.map(function (s, n) { return '<span class="acr-paso" data-n="' + n + '">' + (n === 0 ? 'Frente' : n === 1 ? 'Izquierda' : 'Derecha') + '</span>'; }).join('') + '</div>' +
        '<div class="acr-instr" id="acr-instr">Abriendo la cámara…</div>' +
        '<div class="acr-video"><video id="acr-v" autoplay muted playsinline></video><div class="acr-ovalo" id="acr-ov"></div><div class="acr-msg" id="acr-msg"></div></div>' +
        '<p class="acr-nota">' + (o.lentes ? 'Con los anteojos que usa siempre. ' : 'Sin anteojos. ') + 'Buena luz, sin barbijo ni anteojos de sol, la cara adentro del óvalo. ' +
        'En las de costado girá apenas la cabeza: se tienen que seguir viendo los dos ojos. En cada una tocá <b>Capturar</b> y quedate quieta dos segundos.</p>' +
        '<div class="acr-err" id="acr-err"></div>' +
        '<div class="acr-pie"><button class="acr-b sec" id="acr-no">Cancelar</button><span class="esp"></span><button class="acr-b" id="acr-cap" disabled>Capturar</button></div>', { arriba: true });
      var video = f.querySelector('#acr-v'), ov = f.querySelector('#acr-ov'), cap = f.querySelector('#acr-cap'), err = f.querySelector('#acr-err');
      var msg = function (t) { var m = f.querySelector('#acr-msg'); if (m) m.textContent = t || ''; };
      var fin = function (v) { apagar(); f.remove(); listo(v); };
      f.querySelector('.acr-x').onclick = f.querySelector('#acr-no').onclick = function () { fin(false); };
      var pinta = function () {
        f.querySelector('#acr-instr').textContent = 'Toma ' + (k + 1) + ' de ' + pasos.length + ': ' + pasos[k][1];
        f.querySelectorAll('.acr-paso').forEach(function (c, n) { c.className = 'acr-paso' + (n < k ? ' hecho' : n === k ? ' ahora' : ''); if (n < k) c.textContent = '✓ ' + c.textContent.replace(/^✓ /, ''); });
      };
      Promise.all([lib(), camara(video)]).then(function () {
        if (!document.body.contains(f)) { apagar(); return; }
        pinta(); mirar(video, ov); cap.disabled = false;
      }).catch(function (e) { apagar(); f.querySelector('#acr-instr').textContent = 'No pude usar la cámara'; err.textContent = msjError(e); });
      cap.onclick = async function () {
        cap.disabled = true; err.textContent = '';
        var r = await lectura(video, msg);
        if (!document.body.contains(f)) return;
        msg('');
        if (r.error === 'poca') { err.textContent = k ? 'No llegué a ver la cara: giraste demasiado. Volvé un poco hacia el frente y probá de nuevo.' : 'No llegué a ver bien la cara. Acercate, buscá más luz y probá de nuevo.'; cap.disabled = false; return; }
        if (r.error === 'movio') { err.textContent = 'Las lecturas salieron muy distintas (¿te moviste o había otra persona?). Probá de nuevo.'; cap.disabled = false; return; }
        if (k === 0) {
          var otra = null; try { otra = (await cli.rpc('hub_cara_parecida', { p_descriptor: r.descriptor, p_excluir: p.empleado_id })).data; } catch (x) {}
          if (otra && !(await confirmar('Esta cara se parece mucho a la que ya tiene grabada ' + nombre(otra.nombre) + '. ¿Seguro que es ' + nombre(p.nombre) + '?', 'Sí, es ' + pila(p.nombre), 'Repetir la toma'))) { cap.disabled = false; return; }
        } else if (dist(r.descriptor, tomas[0].descriptor) > 0.75) {
          err.textContent = 'Esta toma no parece de la misma persona que la primera. Probá de nuevo.'; cap.disabled = false; return;
        }
        tomas.push({ variante: pasos[k][0], descriptor: r.descriptor }); k++;
        if (k < pasos.length) { msg('✓ Lista'); pinta(); cap.disabled = false; return; }
        apagar();
        f.querySelector('#acr-instr').textContent = 'Guardando…';
        f.querySelectorAll('.acr-paso').forEach(function (c) { c.className = 'acr-paso hecho'; });
        var g = await cli.rpc('hub_caras_guardar', { p_empleado_id: p.empleado_id, p_tomas: tomas });
        if (g.error) { f.querySelector('#acr-instr').textContent = 'No se guardó'; err.textContent = msjError(g.error); return; }
        f.querySelector('#acr-instr').innerHTML = '<span class="acr-ok">✓ Listo: la cara de ' + esc(pila(p.nombre)) + ' quedó grabada' + (o.lentes ? ' con lentes' : '') + '.</span>';
        cap.style.display = 'none'; f.querySelector('#acr-no').textContent = 'Cerrar';
        setTimeout(function () { if (document.body.contains(f)) fin(true); }, 1600);
        f.querySelector('#acr-no').onclick = function () { fin(true); };
      };
    });
  }

  async function borrar(o) {
    var p = o.persona, cli = o.cli;
    if (!(await confirmar('¿Borrar la cara grabada de ' + nombre(p.nombre) + '? Hasta que la vuelvan a grabar, el sistema no la va a reconocer.', 'Borrar', 'Cancelar'))) return false;
    var r = await cli.rpc('hub_cara_borrar', { p_empleado_id: p.empleado_id, p_solo_lentes: false });
    if (r.error) { await avisar('No se pudo borrar: ' + msjError(r.error)); return false; }
    return true;
  }

  // ── probar: a quién reconoce la cámara ──
  function probar(o) {
    var cli = o && o.cli;
    var f = abrir('<div class="acr-cab"><h3>Probar la cámara</h3><button class="acr-x" aria-label="Cerrar">✕</button></div>' +
      '<div class="acr-instr" id="acr-instr">Abriendo la cámara…</div>' +
      '<div class="acr-video"><video id="acr-v" autoplay muted playsinline></video><div class="acr-ovalo" id="acr-ov"></div><div class="acr-msg" id="acr-msg"></div></div>' +
      '<div class="acr-err" id="acr-err"></div>' +
      '<div class="acr-pie"><button class="acr-b sec" id="acr-no">Cerrar</button><span class="esp"></span><button class="acr-b" id="acr-cap" disabled>¿Quién soy?</button></div>', { arriba: true });
    var video = f.querySelector('#acr-v'), ov = f.querySelector('#acr-ov'), cap = f.querySelector('#acr-cap'), err = f.querySelector('#acr-err'), ins = f.querySelector('#acr-instr');
    var msg = function (t) { var m = f.querySelector('#acr-msg'); if (m) m.textContent = t || ''; };
    var fin = function () { apagar(); f.remove(); };
    f.querySelector('.acr-x').onclick = f.querySelector('#acr-no').onclick = fin;
    Promise.all([lib(), camara(video)]).then(function () {
      if (!document.body.contains(f)) { apagar(); return; }
      ins.textContent = 'Mirá de frente y tocá «¿Quién soy?»'; mirar(video, ov); cap.disabled = false;
    }).catch(function (e) { apagar(); ins.textContent = 'No pude usar la cámara'; err.textContent = msjError(e); });
    cap.onclick = async function () {
      cap.disabled = true; err.textContent = '';
      var r = await lectura(video, msg); msg('');
      if (!document.body.contains(f)) return;
      if (r.error) { err.textContent = r.error === 'poca' ? 'No llegué a ver bien la cara. Acercate y buscá más luz.' : 'Te moviste: probá de nuevo quieta.'; cap.disabled = false; return; }
      var q = await cli.rpc('hub_cara_parecida', { p_descriptor: r.descriptor, p_excluir: null });
      if (q.error) { err.textContent = msjError(q.error); cap.disabled = false; return; }
      ins.innerHTML = q.data ? '<span class="acr-ok">✓ Te reconocí: ' + esc(nombre(q.data.nombre)) + '</span>' : 'No reconocí a nadie. Si ya grabaste la cara, probá con más luz o volvé a grabarla.';
      cap.disabled = false;
    };
  }

  // ── (13-nov-2026, JP) ¿Quién sos? — reconocimiento automático para el WhatsApp del CRM (y lo que venga) ──
  // Abre la cámara, lee la cara sola (hasta 3 intentos) y la busca con `rpc` (recibe p_descriptor + params).
  // Devuelve { ok:true, data } con lo que devuelva la RPC; si no reconoce, { ok:false, motivo:'no' }; si la persona
  // elige la lista, 'lista'; si cierra, 'cancel'; si la cámara no anda, 'camara' (con error). Nunca guarda la foto.
  // (13-nov, JP: "sí, apagalo") respeta la llave central de caras (hub_parametros.caras_activas): si está apagada, o no
  //   se puede saber, no abre la cámara y devuelve 'lista' (el módulo pasa directo a elegir el nombre).
  function quien(o) {
    o = o || {};
    var cli = o.cli;
    if (!cli || !cli.rpc) return Promise.resolve({ ok: false, motivo: 'lista', apagado: true });
    return Promise.resolve().then(function () { return cli.rpc('hub_caras_activas', {}); }).catch(function () { return null; })
      .then(function (a) { return (a && !a.error && a.data === true) ? quienCamara(o) : { ok: false, motivo: 'lista', apagado: true }; });
  }
  function quienCamara(o) {
    var cli = o.cli;
    return new Promise(function (listo) {
      var f = abrir('<div class="acr-cab"><h3>' + esc(o.titulo || '¿Quién sos?') + '</h3><button class="acr-x" aria-label="Cerrar">✕</button></div>' +
        '<p class="acr-nota">' + esc(o.nota || 'Mirá a la cámara: te reconozco por la cara y seguimos. Si no te reconozco, elegís tu nombre de la lista.') + '</p>' +
        '<div class="acr-instr" id="acr-instr">Abriendo la cámara…</div>' +
        '<div class="acr-video"><video id="acr-v" autoplay muted playsinline></video><div class="acr-ovalo" id="acr-ov"></div><div class="acr-msg" id="acr-msg"></div></div>' +
        '<div class="acr-err" id="acr-err"></div>' +
        '<div class="acr-pie"><button class="acr-b sec" id="acr-no">Cancelar</button><span class="esp"></span><button class="acr-b sec" id="acr-lista">Elegir de la lista</button><button class="acr-b" id="acr-cap" disabled>Probar de nuevo</button></div>', { arriba: true });
      var video = f.querySelector('#acr-v'), ov = f.querySelector('#acr-ov'), cap = f.querySelector('#acr-cap'), err = f.querySelector('#acr-err'), ins = f.querySelector('#acr-instr');
      var msg = function (t) { var m = f.querySelector('#acr-msg'); if (m) m.textContent = t || ''; };
      var terminado = false;
      var fin = function (v) { if (terminado) return; terminado = true; apagar(); f.remove(); listo(v); };
      f.querySelector('.acr-x').onclick = f.querySelector('#acr-no').onclick = function () { fin({ ok: false, motivo: 'cancel' }); };
      f.querySelector('#acr-lista').onclick = function () { fin({ ok: false, motivo: 'lista' }); };
      var intentos = 0;
      async function intentar() {
        if (terminado || !stream) return;
        cap.disabled = true; err.textContent = ''; intentos++;
        var r = await lectura(video, msg); msg('');
        if (terminado) return;
        if (r.error) {
          ins.textContent = r.error === 'poca' ? 'No llegué a ver bien la cara. Acercate y buscá más luz.' : 'Te moviste: quedate quieta un segundo.';
        } else {
          var q = await cli.rpc(o.rpc || 'hub_cara_parecida', Object.assign({ p_descriptor: r.descriptor }, o.params || {}));
          if (terminado) return;
          if (q.error) { err.textContent = msjError(q.error); cap.disabled = false; return; }
          if (q.data) { ins.innerHTML = '<span class="acr-ok">✓ ' + esc(nombre(q.data.nombre)) + '</span>'; await esperar(600); fin({ ok: true, data: q.data }); return; }
          ins.textContent = 'No te reconocí.';
        }
        if (intentos < 3) { await esperar(700); return intentar(); }
        ins.textContent += ' Probá de nuevo o elegí tu nombre de la lista.';
        cap.disabled = false;
      }
      Promise.all([lib(), camara(video)]).then(function () {
        if (terminado) { apagar(); return; }
        ins.textContent = 'Mirá de frente…'; mirar(video, ov);
        setTimeout(intentar, 600);
      }).catch(function (e) { fin({ ok: false, motivo: 'camara', error: msjError(e) }); });
      cap.onclick = function () { intentos = 0; intentar(); };
    });
  }

  window.ADORNO_CARAS = { equipo: equipo, ficha: ficha, grabar: grabar, probar: probar, superior: superior, estado: estado, nombre: nombre, quien: quien, pila: pila };
})();
