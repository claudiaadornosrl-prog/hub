// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
//  autorizar.js — AUTORIZAR OPERACIONES DE RANGO SUPERIOR, común a todos los módulos (infra, 11-nov-2026, JP)
//  v2 (15-nov-2026, JP: «Sí, activala»): va por FUNCIÓN del Hub, no por rango. Base: hub/sql/20261115_hub_autorizaciones.sql.
//  Autoriza quien tiene esa función en «Habilitado» y ese local (Hub → Permisos), o un dueño.
//
//  Todos entran con el usuario genérico del local. Cuando una operación necesita a alguien de rango superior:
//    1) LA CARA: la cámara de la compu mira quién está; la base la compara con las caras registradas (POS → Ajustes
//       → Caras; se guardan 128 números por toma, nunca la foto). Si es alguien del rango, queda autorizado con su
//       nombre. Es lo más rápido: no se escribe nada.
//    2) EL CELU: si no anda la cámara o no está esa persona, se le pide a alguien del rango por aviso al celular
//       (Aceptar / Rechazar en la notificación o en el Hub). Se espera hasta 3 minutos.
//    3) USUARIO Y CLAVE de quien autoriza, en una sesión aparte (no toca la del local; si tiene código, lo pide).
//  Queda registrado quién autorizó, cómo (cara / celu / clave), qué y en qué módulo (tabla pos_autorizaciones).
//
//  Uso desde un módulo (cargando <script src="/hub/autorizar.js?v=1" defer></script>):
//    const a = await ADORNO_AUTORIZAR.pedir({
//      local: 'unicenter',                 // dónde pasa (obligatorio)
//      funcion: 'ventas.cerrar_dia',       // la función del Hub que está en «Pide permiso» (obligatorio)
//      que: 'anular una venta',            // para el aviso al celu: "Soraya pide autorizar anular una venta"
//      resumen: '$ 37.000 · Almohadón Late', // lo que se muestra en la ventana y en el aviso
//      detalle: { … }                      // datos extra que se guardan con la autorización (opcional)
//    });                                   // → { id, nombre, modo } o null si se canceló
//    // y la operación la "gasta" (un uso, 10 min), idealmente dentro de la función de la base que la hace:
//    await ADORNO_AUTORIZAR.usar(a.id, { funcion, local, usado_en: 'venta 1234' });   // o perform hub_autorizacion_usar(...) en la RPC
//  `demo: true` muestra la ventana sin tocar la base (para probarla). `sinCara: true` saltea la cámara.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
(function () {
  if (window.ADORNO_AUTORIZAR) return;
  var SB = 'https://jfwtiagteuwmyvblgwms.supabase.co', KEY = 'sb_publishable_udSPma98Sw9eskeeLCgdCw_S2vIX0Fk';
  var FACE = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13', FACE_SRI = 'sha384-5SEinnOIOK1Nl6bzEIWwfXWMg4EaJhN2bXKgrjYC0Bq+fYNZHwhD3ntM92lTHnfL';
  var SUPA_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.min.js', SUPA_SRI = 'sha384-UagCvVPT5XXA0Hx+nJYUAGBFseHT9zBgpJMSebsAxl9lciTwbT+39j5VfRjdP5Tp';
  var MODO = { cara: 'con la cara', push: 'desde el celu', clave: 'con su usuario y clave' };

  // ── lo básico ──
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pila(n) { if (!n) return ''; var p = (String(n).split(',')[1] || String(n)).trim().toLowerCase(); return p.replace(/(^|\s)\S/g, function (x) { return x.toUpperCase(); }); }
  var espera = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  function leerSesion(k) {
    try { var j = JSON.parse(localStorage.getItem(k) || 'null'); var s = j && (j.currentSession || j); return s && s.user ? { email: String(s.user.email || '').toLowerCase(), token: s.access_token } : null; } catch (e) { return null; }
  }
  // v4 (15-nov, pedido de Clientes): pedir({ sesion: { email, token } }) usa la sesión DEL MÓDULO en esa ventana (en una
  //   compu puede haber otra cuenta abierta en el Hub); usar(id, { sesion }) igual. Sin eso, la del Hub o 'ca_session'.
  var SES = null;
  function sesion() { return SES || leerSesion((window.ADORNO_SSO && ADORNO_SSO.KEY) || 'adorno-auth') || leerSesion('ca_session'); }
  function rpc(nombre, args, token) {
    var s = sesion(), tk = token || (s && s.token);
    return fetch(SB + '/rest/v1/rpc/' + nombre, { method: 'POST', cache: 'no-store', headers: { apikey: KEY, Authorization: 'Bearer ' + (tk || KEY), 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) })
      .then(function (r) { return r.text().then(function (t) { var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {} if (!r.ok) throw new Error((j && (j.message || j.hint)) || ('Error ' + r.status)); return j; }); });
  }
  function cargarScript(src, sri) {
    return new Promise(function (ok, mal) {
      var s = document.createElement('script'); s.src = src; if (sri) { s.integrity = sri; s.crossOrigin = 'anonymous'; }
      s.onload = ok; s.onerror = function () { s.remove(); mal(new Error('No pude bajar ' + src.split('/').slice(-1)[0])); };
      document.head.appendChild(s);
    });
  }
  var libCaras = null;
  function caras() {
    return libCaras || (libCaras = (window.faceapi ? Promise.resolve() : cargarScript(FACE + '/dist/face-api.js', FACE_SRI)).then(function () {
      var m = FACE + '/model';
      return Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri(m), faceapi.nets.faceLandmark68TinyNet.loadFromUri(m), faceapi.nets.faceRecognitionNet.loadFromUri(m)]);
    }).catch(function (e) { libCaras = null; throw e; }));
  }
  function moduloActual() { var b = document.querySelector('.ab-banner'); return (b && b.getAttribute('data-modulo')) || (location.pathname.split('/')[1] || 'hub').replace(/-adorno$/, ''); }
  function colorActual() {
    var b = document.querySelector('.ab-banner'); var c = b && getComputedStyle(b).getPropertyValue('--ab-c').trim();
    return c || '#685B51';
  }

  // ── la ventana (pastillas y puntas redondeadas, como pide JP; letra de la marca) ──
  function estilos() {
    if (document.getElementById('aut-css')) return;
    var s = document.createElement('style'); s.id = 'aut-css';
    s.textContent =
      '@font-face{font-family:"URW Gothic";src:url("/hub/fonts/URWGothic-Book.ttf") format("truetype");font-weight:300 700;font-display:swap}' +
      '.aut-fondo{position:fixed;inset:0;z-index:99970;background:rgba(28,22,18,.45);display:flex;align-items:center;justify-content:center;padding:16px;' +
        'font:400 14px/1.4 "URW Gothic",Jost,system-ui,-apple-system,"Segoe UI",sans-serif;color:#1C1612;animation:aut-entra .2s ease-out}' +
      '@keyframes aut-entra{from{opacity:0}}' +
      '.aut-caja{width:min(460px,100%);max-height:calc(100dvh - 32px);overflow:auto;background:#FBF8F3;border-radius:26px;padding:20px 20px 16px;' +
        'box-shadow:0 30px 70px -20px rgba(28,22,18,.55)}' +
      '.aut-tit{display:flex;align-items:center;gap:10px;font-size:17px;font-weight:700;margin:0 0 4px}' +
      '.aut-tit .aut-cand{width:32px;height:32px;flex:none;border-radius:50%;display:grid;place-items:center;background:var(--aut-c);color:#F7F3EC}' +
      '.aut-tit .aut-cand svg{width:17px;height:17px}' +
      '.aut-res{font-size:13px;color:#685B51;margin:0 0 12px;padding:8px 14px;background:#fff;border-radius:16px}' +
      '.aut-sub{font-size:12.5px;color:#685B51;margin:10px 2px 0}' +
      '.aut-video{position:relative;border-radius:22px;overflow:hidden;background:#1C1612;aspect-ratio:4/3}' +
      '.aut-video video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1);display:block}' +
      '.aut-msg{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);max-width:calc(100% - 24px);padding:7px 16px;border-radius:999px;' +
        'background:rgba(28,22,18,.75);color:#F7F3EC;font-size:13px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.aut-msg.ok{background:#16a34a}' +
      '.aut-lista{background:#fff;border-radius:20px;padding:10px 12px;font-size:13px}' +
      '.aut-lista>b{display:block;font-size:12px;color:#685B51;font-weight:600;margin:4px 2px 6px}' +
      '.aut-p{display:flex;align-items:center;gap:10px;padding:7px 2px;border-top:1px solid #F1ECE3}' +
      '.aut-p:first-of-type{border-top:0}.aut-p .aut-nom{flex:1;min-width:0}.aut-p small{display:block;font-size:11px;color:#8C7F73}' +
      '.aut-chip{display:inline-block;margin-left:6px;padding:1px 9px;border-radius:999px;background:#F1ECE3;color:#685B51;font-size:11px;vertical-align:1px}' +
      '.aut-btn{font:inherit;border:0;cursor:pointer;border-radius:999px;padding:9px 18px;font-size:13px;font-weight:600;white-space:nowrap;' +
        'background:#F1ECE3;color:#1C1612;transition:filter .15s,transform .1s}' +
      '.aut-btn:hover{filter:brightness(.96)}.aut-btn:active{transform:scale(.97)}.aut-btn[disabled]{opacity:.45;cursor:default}' +
      '.aut-btn.prim{background:var(--aut-c);color:#fff}.aut-btn.chico{padding:6px 14px;font-size:12px}' +
      '.aut-pie{display:flex;gap:8px;justify-content:space-between;align-items:center;margin-top:14px;flex-wrap:wrap}' +
      '.aut-clave{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}' +
      '.aut-clave input{flex:1 1 150px;min-width:0;font:inherit;font-size:14px;padding:10px 18px;border:1px solid #D6CCBA;border-radius:999px;background:#fff;color:#1C1612;outline:none}' +
      '.aut-clave input:focus{border-color:var(--aut-c)}' +
      '.aut-giro{display:inline-block;width:12px;height:12px;border:2px solid #D6CCBA;border-top-color:var(--aut-c);border-radius:50%;margin-right:6px;vertical-align:-2px;animation:aut-giro .8s linear infinite}' +
      '@keyframes aut-giro{to{transform:rotate(360deg)}}' +
      '.aut-link{color:var(--aut-c);font-weight:600;cursor:pointer;text-decoration:underline}' +
      '.aut-aviso{color:#b91c1c;font-size:12px;margin:2px 2px 6px}' +
      '.aut-toast{position:fixed;z-index:99975;left:50%;bottom:22px;transform:translateX(-50%);padding:10px 20px;border-radius:999px;background:#1C1612;color:#F7F3EC;' +
        'font:400 13px "URW Gothic",Jost,system-ui,sans-serif;box-shadow:0 12px 30px -10px rgba(0,0,0,.45)}';
    document.head.appendChild(s);
  }
  var CANDADO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  function toast(t) {
    var d = document.createElement('div'); d.className = 'aut-toast'; d.setAttribute('role', 'status'); d.textContent = t;
    document.body.appendChild(d); setTimeout(function () { d.remove(); }, 3500);
  }

  // ── un pedido de autorización ──
  var A = null;   // el pedido en curso (uno a la vez)
  function ventana(html) {
    estilos();
    var o = document.getElementById('aut-ventana');
    if (!o) { o = document.createElement('div'); o.id = 'aut-ventana'; o.className = 'aut-fondo'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); document.body.appendChild(o); }
    o.style.setProperty('--aut-c', A ? A.color : '#685B51');
    o.innerHTML = '<div class="aut-caja"><div class="aut-tit"><span class="aut-cand">' + CANDADO + '</span><span>' + html.tit + '</span></div>' +
      '<div class="aut-res">' + esc(A.resumen) + '</div>' + html.cuerpo + '</div>';
    o.querySelectorAll('[data-a]').forEach(function (b) { b.addEventListener('click', function (ev) { ev.preventDefault(); acciones[b.getAttribute('data-a')](b); }); });
    return o;
  }
  var stream = null;
  function camOff() { if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; } }
  function fin(v) {
    var a = A; if (!a || a.fin) return;
    a.fin = true; clearInterval(a.poll); if (a.cortar) a.cortar(); camOff(); A = null;
    var o = document.getElementById('aut-ventana'); if (o) o.remove();
    document.removeEventListener('keydown', teclas, true);
    a.resolve(v);
  }
  function cancelarPedido(id) { if (id && id > 0) rpc('hub_autorizacion_cancelar', { p_id: id }).catch(function () {}); }
  function teclas(ev) { if (ev.key === 'Escape' && A) { ev.preventDefault(); acciones.cancelar(); } }
  var acciones = {
    cancelar: function () { if (A) cancelarPedido(A.id); fin(null); },
    otro: function () { if (A) { A.saltar = true; if (A.cortar) A.cortar(); } },
    pedir: function (b) { pedirA(Number(b.getAttribute('data-id'))); },
    otra: function () { if (!A) return; clearInterval(A.poll); cancelarPedido(A.id); A.id = null; lista(); },
    clave: function () { conClave(); }
  };

  function pedir(op) {
    op = op || {};
    if (A) return Promise.resolve(null);   // ya hay una ventana abierta
    if (!op.local) return Promise.reject(new Error('ADORNO_AUTORIZAR.pedir: falta el local'));
    if (!op.funcion && !op.demo) return Promise.reject(new Error('ADORNO_AUTORIZAR.pedir: falta la función del Hub'));
    return new Promise(function (resolve) {
      SES = (op.sesion && op.sesion.token) ? { email: String(op.sesion.email || '').toLowerCase(), token: op.sesion.token } : null;
      var s = sesion();
      A = { op: op, modulo: op.modulo || moduloActual(), local: String(op.local).toLowerCase(), funcion: op.funcion || '',
            que: op.que || '', resumen: op.resumen || op.que || '', demo: !!op.demo,
            color: op.color || colorActual(), email: (s && s.email) || '', resolve: resolve, id: null, poll: null, fin: false, lista: [] };
      document.addEventListener('keydown', teclas, true);
      // (v6, 16-nov-2026, JP) modo «Ver como» (/hub/banner.js): la ventana se abre igual, con la lista real de quién
      //   puede autorizar a esa cuenta, pero no lee caras, no manda avisos ni acepta claves. JP ve que el pedido de permiso aparece.
      A.verComo = !!window.ADORNO_VERCOMO && !op.demo;
      if (A.verComo) op.sinCara = true;
      A.detalle = Object.assign({}, op.detalle || {}, { resumen: A.resumen, que: A.que, pedido_por_email: A.email, pedido_por: A.email });
      arrancar(A);
    });
  }
  function arrancar(a) {
    (a.demo ? Promise.resolve({ personas: DEMO, hay_caras: true }) : rpc('hub_autorizantes', { p_funcion: a.funcion, p_local: a.local }))
      .then(function (r) { a.lista = (r && r.personas) || []; a.hayCaras = !!(r && r.hay_caras); })
      .catch(function () { a.lista = []; a.hayCaras = false; })
      .then(function () { if (A !== a || a.fin) return; return conCara(a); })
      .then(function (listo) { if (A === a && !a.fin && !listo) lista(); });
  }

  // 1) la cámara: true = terminó (autorizado o cancelado); false = seguir con el celu o la clave
  function conCara(a) {
    if (a.op.sinCara || !a.hayCaras || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.resolve(false);
    // (15-nov-2026, JP: «en segundo plano, que no se vea») la cámara lee sin mostrarse; solo se ve «Verificando…»
    ventana({ tit: 'Esto necesita autorización', cuerpo:
      '<div style="position:fixed;left:-9999px;top:0;width:320px;height:240px;opacity:0;pointer-events:none"><video id="aut-video" autoplay muted playsinline width="320" height="240"></video></div>' +
      '<div class="aut-sub"><span class="aut-giro"></span><span id="aut-msg">Verificando…</span></div>' +
      '<div class="aut-pie"><button class="aut-btn" data-a="cancelar">Cancelar</button><button class="aut-btn prim" data-a="otro">📱 Pedir al celu o con clave</button></div>' });
    var corte = new Promise(function (r) { a.cortar = r; });
    var video = document.getElementById('aut-video');
    var msg = function (t, ok) { var m = document.getElementById('aut-msg'); if (m) { m.textContent = t; m.classList.toggle('ok', !!ok); } };
    var sigue = function () { return A === a && !a.fin && !a.saltar && !!document.getElementById('aut-video'); };
    var abrirCam = a.demo ? espera(600) : navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
      .then(function (st) { if (!video.isConnected) { st.getTracks().forEach(function (t) { t.stop(); }); throw new Error('cerrada'); } stream = st; video.srcObject = st; return video.play(); });
    var carga = Promise.all([a.demo ? espera(400) : caras(), abrirCam]); carga.catch(function () {});
    return Promise.race([carga.then(function () { return true; }), corte.then(function () { return 'corte'; })]).catch(function () { return false; }).then(function (camOk) {
      if (camOk === 'corte' || !sigue()) { camOff(); return A !== a || a.fin; }
      if (!camOk) { camOff(); return A !== a || a.fin; }
      var t0 = Date.now();
      var vuelta = function () {
        if (!sigue() || Date.now() - t0 > 6000) { camOff(); return A !== a || a.fin; }
        if (a.demo) return espera(1500).then(function () { if (!sigue()) { camOff(); return A !== a || a.fin; } msg('Modo de prueba: no compara caras'); return espera(1500).then(function () { camOff(); return false; }); });
        return faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 })).withFaceLandmarks(true).withFaceDescriptor()
          .then(function (d) {
            if (!d || !sigue()) return espera(250).then(vuelta);
            return rpc('hub_autorizacion_cara', { p_funcion: a.funcion, p_local: a.local, p_detalle: a.detalle, p_descriptor: Array.from(d.descriptor) })
              .then(function (r) {
                if (A !== a || a.fin) return true;
                if (r && r.ok) { msg('✔ Autorizado por ' + pila(r.autorizadora), true); return espera(700).then(function () { toast('Autorizado por ' + pila(r.autorizadora)); fin({ id: r.id, nombre: r.autorizadora, modo: 'cara' }); return true; }); }
                if (r && r.motivo === 'sin_rango') { camOff(); return false; }   // la que está adelante no autoriza: directo a celu o clave
                return espera(250).then(vuelta);
              }, function () { camOff(); return false; });
          }, function () { return espera(250).then(vuelta); });
      };
      return vuelta();
    });
  }
  function cap(t) { t = String(t || ''); return t.charAt(0).toUpperCase() + t.slice(1); }

  // 2) y 3) a quién pedirle (aviso al celu) o usuario y clave
  function persona(p) {
    var rango = p.rol || '';
    var donde = p.fuente === 'reloj' ? 'fichó ' + p.hora : p.fuente === 'turno' ? 'turno desde ' + p.hora : p.rol === 'dueño' ? 'fuera del local' : 'no está';
    return '<div class="aut-p"><span class="aut-nom"><b>' + esc(pila(p.nombre)) + '</b><span class="aut-chip">' + esc(rango) + '</span>' +
      '<small>' + esc(donde) + (p.push ? '' : ' · sin avisos en el celu') + '</small></span>' +
      '<button class="aut-btn prim chico" data-a="pedir" data-id="' + Number(p.empleado_id) + '"' + (p.push ? '' : ' disabled title="No tiene las notificaciones activadas en el celu"') + '>📱 Pedir a ' + esc(pila(p.nombre).split(' ')[0]) + '</button></div>';
  }
  function lista(aviso) {
    var a = A; if (!a) return;
    if (a.verComo && !aviso) aviso = 'Modo «Ver como»: así le aparece el pedido de permiso a esta cuenta. Es solo para mirar: no se manda ningún aviso ni se autoriza nada.';
    var pres = a.lista.filter(function (p) { return p.presente; }), fuera = a.lista.filter(function (p) { return !p.presente; });
    ventana({ tit: 'Esto necesita autorización', cuerpo:
      '<div class="aut-lista" id="aut-lista">' + (aviso ? '<div class="aut-aviso">' + esc(aviso) + '</div>' : '') +
        (pres.length ? '<b>Están en el local ahora</b>' + pres.map(persona).join('')
                     : '<b>No hay nadie en el local que pueda autorizarlo</b><small style="display:block;color:#8C7F73;font-size:11px;margin:0 2px 4px">Según el reloj, nadie con ese permiso fichó entrada ni tiene turno a esta hora.</small>') +
        (fuera.length ? '<b style="margin-top:10px">No están en el local (pueden autorizar desde el celu)</b>' + fuera.map(persona).join('') : '') +
      '</div>' +
      '<div class="aut-sub">¿No tiene el celu a mano? Que lo autorice acá con su usuario y clave:</div>' +
      '<div class="aut-clave"><input id="aut-mail" type="text" inputmode="email" placeholder="Usuario (mail)" autocomplete="off" autocapitalize="off" spellcheck="false">' +
        '<input id="aut-pass" type="password" placeholder="Clave" autocomplete="new-password"></div>' +
      '<div class="aut-pie"><button class="aut-btn" data-a="cancelar">Cancelar</button><button class="aut-btn prim" id="aut-btn-clave" data-a="clave">Autorizar con clave</button></div>' });
    var pass = document.getElementById('aut-pass');
    if (pass) pass.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); conClave(); } });
  }
  function pedirA(empId) {
    var a = A; if (!a || a.fin) return;
    var p = a.lista.filter(function (x) { return x.empleado_id === empId; })[0]; if (!p) return;
    if (a.verComo) { toast('Modo «Ver como»: acá le llegaría el aviso al celu a ' + pila(p.nombre) + '. No se manda nada.'); return; }
    var hecho = a.demo ? Promise.resolve({ id: -1 }) : rpc('hub_autorizacion_pedir', { p_funcion: a.funcion, p_local: a.local, p_detalle: a.detalle, p_empleado_id: empId });
    hecho.then(function (r) {
      if (A !== a || a.fin) { cancelarPedido(r && r.id); return; }
      var miId = r.id; a.id = miId; a.desde = Date.now();
      var pinta = function () {
        var b = document.getElementById('aut-lista'); if (!b) return;
        var s = Math.round((Date.now() - a.desde) / 1000);
        b.innerHTML = '<b>Le avisamos a ' + esc(pila(p.nombre)) + ' al celu</b><div style="font-size:12px;color:#685B51;margin:4px 2px 0"><span class="aut-giro"></span>Esperando que acepte… ' +
          Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + '</div><div style="font-size:12px;margin:8px 2px 2px"><span class="aut-link" data-a2="otra">Pedirle a otra persona</span></div>';
        var l = b.querySelector('[data-a2="otra"]'); if (l) l.onclick = acciones.otra;
      };
      pinta();
      clearInterval(a.poll);
      a.poll = setInterval(function () {
        if (A !== a || a.fin || a.id !== miId) return;
        pinta();
        if (Date.now() - a.desde > 180000) { clearInterval(a.poll); cancelarPedido(miId); a.id = null; lista('Nadie respondió en 3 minutos. Probá de nuevo o usá la clave.'); return; }
        if (a.demo) { if (Date.now() - a.desde > 5000) { toast('Modo de prueba: lo «aceptó» ' + pila(p.nombre) + ' desde el celu'); fin({ id: -1, nombre: p.nombre, modo: 'push', demo: true }); } return; }
        rpc('hub_autorizacion_estado', { p_id: miId }).then(function (e) {
          if (!e || A !== a || a.fin || a.id !== miId) return;
          if (e.estado === 'aceptada') { toast('Lo autorizó ' + pila(e.autorizadora) + ' desde el celu'); fin({ id: miId, nombre: e.autorizadora, modo: 'push' }); }
          else if (e.estado === 'rechazada') { clearInterval(a.poll); a.id = null; lista(pila(e.autorizadora) + ' rechazó el pedido.'); }
          else if (e.estado === 'cancelada') { clearInterval(a.poll); a.id = null; lista('El pedido venció o se canceló. Probá de nuevo.'); }
        }).catch(function () {});
      }, 2000);
    }, function (e) { lista(e.message || 'No se pudo avisar'); });
  }
  // usuario y clave: quien autoriza entra en una sesión aparte (sin guardar) y crea la autorización ya aceptada
  function conClave() {
    var a = A; if (!a || a.fin) return;
    if (a.verComo) { toast('Modo «Ver como»: acá autorizaría con su usuario y clave. No se autoriza nada.'); return; }
    var mail = ((document.getElementById('aut-mail') || {}).value || '').trim(), pass = (document.getElementById('aut-pass') || {}).value || '';
    if (!mail || !pass) { toast('Cargá el usuario y la clave de quien autoriza'); return; }
    if (mail.toLowerCase() === a.email) { toast('Tiene que ser el usuario de quien autoriza, no el de esta sesión'); return; }
    var btn = document.getElementById('aut-btn-clave'); if (btn) { btn.disabled = true; btn.textContent = 'Verificando…'; }
    var listo = function () { if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = 'Autorizar con clave'; } };
    if (a.demo) { espera(800).then(function () { listo(); toast('Modo de prueba: no se verificó la clave'); fin({ id: -1, nombre: mail, modo: 'clave', demo: true }); }); return; }
    var sb2 = null;
    (window.supabase && window.supabase.createClient ? Promise.resolve() : cargarScript(SUPA_JS, SUPA_SRI)).then(function () {
      sb2 = window.supabase.createClient(SB, KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'adorno-autoriza' } });
      return sb2.auth.signInWithPassword({ email: mail, password: pass });
    }).then(function (r) {
      if (r.error) { toast('Usuario o clave incorrectos'); var p = document.getElementById('aut-pass'); if (p) p.value = ''; return null; }
      return (window.ADORNO_MFA && ADORNO_MFA.pedirCodigo ? ADORNO_MFA.pedirCodigo(sb2) : Promise.resolve(true)).then(function (ok) {
        if (!ok || A !== a || a.fin) return null;
        return sb2.rpc('hub_autorizacion_clave', { p_funcion: a.funcion, p_local: a.local, p_detalle: a.detalle });
      });
    }).then(function (r) {
      if (!r) return;
      if (r.error) { toast(r.error.message); return; }
      cancelarPedido(a.id);
      toast('Lo autorizó ' + pila(r.data.autorizadora) + ' con su clave');
      fin({ id: r.data.id, nombre: r.data.autorizadora, modo: 'clave' });
    }, function (e) { toast(e.message || 'No se pudo verificar'); })
      .then(function () { listo(); if (sb2) sb2.auth.signOut({ scope: 'local' }).catch(function () {}); });
  }

  // ── la operación "gasta" la autorización (mejor hacerlo dentro de la función de la base que la hace) ──
  function usar(id, op) {
    op = op || {};
    return rpc('hub_autorizacion_usar', { p_id: id, p_funcion: op.funcion, p_local: String(op.local || '').toLowerCase(), p_usado_en: op.usado_en || null }, op.sesion && op.sesion.token);
  }

  var DEMO = [
    { empleado_id: 1, nombre: 'GONZÁLEZ, SORAYA', rol: 'encargada', push: true, presente: true, fuente: 'reloj', hora: '09:52' },
    { empleado_id: 2, nombre: 'PÉREZ, LUCÍA', rol: 'cajera', push: false, presente: true, fuente: 'turno', hora: '10:00' },
    { empleado_id: 3, nombre: 'SIMONELLI, JUAN PABLO', rol: 'dueño', push: true, presente: false }
  ];
  window.ADORNO_AUTORIZAR = { pedir: pedir, usar: usar, MODO: MODO, SESION: true };   // SESION: acepta sesion:{email,token} (v4+)
})();
