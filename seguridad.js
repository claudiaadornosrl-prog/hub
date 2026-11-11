// ═══════════════════════════════════════════════════════════════════════
//  ADORNO_MFA — código del celular (doble factor) para todos los módulos
//  (3-nov-2026, hardening SOC 2 / ISO 27001, charla Infraestructura)
//  · pedirCodigo(sb): si la cuenta tiene el código activado y la sesión todavía no lo pasó, lo pide (6 números).
//  · alCargar(sb): lo mismo con una sesión guardada de antes de activarlo (otra PC, el celular).
//  · activar / desactivar / activo: los usa el panel de sesión del Hub.
//  Lo hace cumplir la base: public.adorno_pre_request() rechaza todo pedido de una cuenta con el código activado
//  que no lo ingresó. Se carga en cada módulo con <script src="/hub/seguridad.js?v=N"> después de supabase-js.
// ═══════════════════════════════════════════════════════════════════════
window.ADORNO_MFA = (function () {
  var CSS = [
    '.amfa-fondo{position:fixed;inset:0;z-index:99999;background:rgba(20,18,16,.55);display:flex;align-items:center;justify-content:center;padding:16px;font-family:inherit}',
    '.amfa-caja{background:var(--surface,#fff);color:var(--text,#1c1917);border:1px solid var(--border,#e7e5e4);border-radius:26px;max-width:380px;width:100%;padding:22px 20px;box-shadow:0 10px 40px rgba(0,0,0,.25);max-height:calc(100vh - 32px);overflow:auto}',
    '.amfa-caja h3{margin:0 0 8px;font-size:17px;font-weight:600}',
    '.amfa-caja p,.amfa-caja li{font-size:13px;line-height:1.45;color:var(--muted,#57534e);margin:0 0 10px}',
    '.amfa-caja ol{padding-left:18px;margin:0 0 6px}',
    '.amfa-qr{display:block;width:180px;height:180px;margin:6px auto 10px;background:#fff;padding:6px}',
    '.amfa-clave{font-family:ui-monospace,Consolas,monospace;font-size:12px;word-break:break-all;background:var(--bg,#f5f5f4);padding:6px 8px;display:block;margin:4px 0 12px;user-select:all}',
    '.amfa-link{font-size:13px;color:var(--text,#1c1917);text-decoration:underline;text-underline-offset:3px}',
    '.amfa-codigo{width:100%;box-sizing:border-box;font-size:24px;letter-spacing:8px;text-align:center;padding:10px 20px;border:1px solid var(--border,#d6d3d1);border-radius:999px;background:var(--surface,#fff);color:var(--text,#1c1917);margin:4px 0 6px;font-family:ui-monospace,Consolas,monospace}',
    '.amfa-error{min-height:18px;font-size:12px;color:#b91c1c;margin-bottom:8px}',
    '.amfa-botones{display:flex;gap:10px;justify-content:flex-end}',
    '.amfa-botones button{font:inherit;font-size:14px;padding:9px 20px;border:1px solid var(--border,#d6d3d1);border-radius:999px;cursor:pointer;background:transparent;color:var(--text,#1c1917)}',
    '.amfa-botones .amfa-pri{background:var(--boton,#1c1917);color:var(--boton-txt,#fff);border-color:transparent}',
    '.amfa-botones button:disabled{opacity:.5;cursor:default}',
    '@media (prefers-color-scheme: dark){.amfa-caja{background:var(--surface,#1c1917);color:var(--text,#f5f5f4)}}'
  ].join('');

  function modal(html) {
    if (!document.getElementById('amfa-css')) {
      var s = document.createElement('style'); s.id = 'amfa-css'; s.textContent = CSS; document.head.appendChild(s);
    }
    var o = document.createElement('div');
    o.className = 'amfa-fondo';
    o.innerHTML = '<div class="amfa-caja" role="dialog" aria-modal="true">' + html + '</div>';
    document.body.appendChild(o);
    return o;
  }

  var CAMPO = '<input class="amfa-codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" aria-label="Código de 6 números">' +
              '<div class="amfa-error"></div>';

  // Lee el código, lo verifica con Supabase y llama a ok() si anduvo. Se manda solo al completar los 6 números.
  function atarCampo(o, verificar, ok) {
    var inp = o.querySelector('.amfa-codigo'), err = o.querySelector('.amfa-error'), btn = o.querySelector('.amfa-pri'), enCurso = false;
    async function probar() {
      var c = inp.value.replace(/\D/g, '');
      if (enCurso) return;
      if (c.length !== 6) { err.textContent = 'Son 6 números.'; return; }
      enCurso = true; btn.disabled = true; err.textContent = '';
      var r;
      try { r = await verificar(c); } catch (e) { r = { error: e }; }
      enCurso = false; btn.disabled = false;
      if (r && r.error) {
        err.textContent = 'Ese código no anda. Usá el que se ve ahora en la app (cambia cada 30 segundos).';
        inp.select();
        return;
      }
      ok();
    }
    btn.onclick = probar;
    inp.oninput = function () { inp.value = inp.value.replace(/\D/g, ''); if (inp.value.length === 6) probar(); };
    inp.onkeydown = function (e) { if (e.key === 'Enter') probar(); };
    setTimeout(function () { inp.focus(); }, 50);
  }

  async function factorVerificado(sb) {
    var r = await sb.auth.mfa.listFactors();           // pregunta al servidor: ve también lo activado en otro equipo
    return ((r.data && r.data.totp) || []).filter(function (f) { return f.status === 'verified'; })[0] || null;
  }

  // (3-nov, JP) el celular registrado con la cara ya son dos factores; en la computadora el código vale 30 días.
  // Las mismas reglas las hace cumplir adorno_pre_request() en la base.
  var DIAS_CODIGO = 30;
  async function estadoSesion(sb) {
    var d = ((await sb.auth.mfa.getAuthenticatorAssuranceLevel()).data) || {};
    var ms = d.currentAuthenticationMethods || [], t = 0, cara = false;
    ms.forEach(function (m) {
      var metodo = String((m && m.method) || m);
      if (/webauthn|passkey/.test(metodo)) cara = true;
      if (metodo === 'totp') t = Math.max(t, +m.timestamp || 0);
    });
    var vencido = t > 0 && (Date.now() / 1000 - t) > DIAS_CODIGO * 86400;
    return { conCara: cara, codigoAlDia: d.currentLevel === 'aal2' && !vencido, vencido: vencido };
  }

  // true = puede seguir (no tiene el código activado, ya lo pasó, entró con la cara, o lo acaba de ingresar); false = canceló
  async function pedirCodigo(sb) {
    var f, e;
    try {
      e = await estadoSesion(sb);
      if (e.conCara || e.codigoAlDia) return true;
      f = await factorVerificado(sb);
    } catch (x) { return true; }     // sin red no se traba el login: igual la base rechaza lo que falte
    if (!f) return true;
    return new Promise(function (listo) {
      var o = modal((e.vencido ? '<h3>Pasaron 30 días</h3><p>Por seguridad, cada 30 días la computadora te pide de nuevo el código. ' +
                                 'Abrí la app de autenticación del celular y escribí el código de 6 números de Claudia Adorno.</p>'
                               : '<h3>Código del celular</h3>' +
        '<p>Abrí la app de autenticación del celular y escribí el código de 6 números de Claudia Adorno.</p>') + CAMPO +
        '<div class="amfa-botones"><button class="amfa-sec">Cancelar</button><button class="amfa-pri">Entrar</button></div>');
      o.querySelector('.amfa-sec').onclick = function () { o.remove(); listo(false); };
      atarCampo(o, function (c) { return sb.auth.mfa.challengeAndVerify({ factorId: f.id, code: c }); },
                function () { o.remove(); listo(true); });
    });
  }

  // Sesión guardada sin el código (la de antes de activarlo): la base ya la rechaza, así que se pide y se recarga.
  // De paso, en un equipo que entra con la cara, pide la cara (ADORNO_CARA).
  async function alCargar(sb) {
    if (window.ADORNO_CARA) ADORNO_CARA.vigilar(sb);
    try {
      var s = (await sb.auth.getSession()).data.session;
      if (!s) return;
      var e = await estadoSesion(sb);
      if (e.conCara || e.codigoAlDia || !(await factorVerificado(sb))) return;
      var ok = await pedirCodigo(sb);
      if (!ok) await sb.auth.signOut({ scope: 'local' });
      location.reload();
    } catch (e) {}
  }

  async function activo(sb) {
    try { return !!(await factorVerificado(sb)); } catch (e) { return false; }
  }

  // Supabase devuelve el QR como SVG (suelto o en un data: sin codificar): se codifica para usarlo de src
  function qrComoImagen(q) {
    q = String(q || '');
    if (/^data:[^,]*;base64,/.test(q)) return q;
    if (q.indexOf('data:') === 0) { var i = q.indexOf(','); q = q.slice(i + 1); try { q = decodeURIComponent(q); } catch (e) {} }
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(q);
  }

  async function activar(sb) {
    // Un alta que quedó a medias (sin confirmar) se borra antes, si no Supabase no deja empezar otra
    var l = await sb.auth.mfa.listFactors();
    var colgados = ((l.data && l.data.all) || []).filter(function (f) { return f.status !== 'verified'; });
    for (var i = 0; i < colgados.length; i++) await sb.auth.mfa.unenroll({ factorId: colgados[i].id });
    var r = await sb.auth.mfa.enroll({ factorType: 'totp', issuer: 'Claudia Adorno',
                                       friendlyName: 'Celular ' + new Date().toLocaleString('es-AR') });
    if (r.error) { alert('No se pudo empezar: ' + r.error.message); return false; }
    var id = r.data.id, t = r.data.totp;
    return new Promise(function (listo) {
      var o = modal('<h3>Activar el código del celular</h3><ol>' +
        '<li>Instalá en el celular <b>Google Authenticator</b> o <b>Microsoft Authenticator</b>.</li>' +
        '<li>En la app tocá "+" y escaneá este código. Si estás en el celular, tocá <a class="amfa-link">abrir en la app</a>.</li></ol>' +
        '<img class="amfa-qr" alt="Código QR para la app de autenticación">' +
        '<p>¿No podés escanear? En la app elegí "ingresar clave" y copiá esta:</p><code class="amfa-clave">' + t.secret + '</code>' +
        '<p>3. Escribí el código de 6 números que te muestra la app:</p>' + CAMPO +
        '<div class="amfa-botones"><button class="amfa-sec">Cancelar</button><button class="amfa-pri">Activar</button></div>');
      o.querySelector('.amfa-link').href = t.uri;
      o.querySelector('.amfa-qr').src = qrComoImagen(t.qr_code);
      o.querySelector('.amfa-sec').onclick = async function () {
        o.remove();
        try { await sb.auth.mfa.unenroll({ factorId: id }); } catch (e) {}
        listo(false);
      };
      atarCampo(o, function (c) { return sb.auth.mfa.challengeAndVerify({ factorId: id, code: c }); }, function () {
        o.querySelector('.amfa-caja').innerHTML = '<h3>Listo</h3>' +
          '<p>Desde ahora, cuando entres a cualquier módulo con tu clave, te va a pedir también el código de la app del celular.</p>' +
          '<p>Si cambiás o perdés el celular, avisale a Infraestructura para darlo de baja.</p>' +
          '<div class="amfa-botones"><button class="amfa-pri">Entendido</button></div>';
        o.querySelector('.amfa-pri').onclick = function () { o.remove(); listo(true); };
      });
    });
  }

  async function desactivar(sb) {
    if (!confirm('¿Sacar el código del celular? Cualquiera que sepa tu clave va a poder entrar.')) return false;
    var f = await factorVerificado(sb);
    if (!f) return true;
    var r = await sb.auth.mfa.unenroll({ factorId: f.id });
    if (r.error) { alert('No se pudo: ' + r.error.message); return false; }
    try { await sb.auth.refreshSession(); } catch (e) {}
    return true;
  }

  return { pedirCodigo: pedirCodigo, alCargar: alCargar, activo: activo, activar: activar, desactivar: desactivar, modal: modal,
           estado: estadoSesion, factor: factorVerificado };
})();

// ═══════════════════════════════════════════════════════════════════════
//  ADORNO_CARA — entrar con la cara (o la huella) en este equipo
//  (3-nov-2026, JP: "que Clau deje su celular registrado y que solo le pida la cara")
//  · Desde el panel de sesión del Hub se registra una passkey de Supabase y el equipo queda marcado
//    (localStorage adorno-cara = email). Salir de la sesión no borra la marca.
//  · En un equipo marcado se pide la cara al abrir y al volver después de 5 minutos en segundo plano, como el home
//    banking. Entrar con la cara es un login real contra Supabase (signInWithPasskey), no un candado de pantalla.
// ═══════════════════════════════════════════════════════════════════════
window.ADORNO_CARA = (function () {
  var MARCA = 'adorno-cara', ABIERTA = 'adorno-cara-ok', FUERA = 'adorno-cara-fuera', PAUSA = 5 * 60 * 1000;
  function get(st, k) { try { return st.getItem(k); } catch (e) { return null; } }
  function set(st, k, v) { try { st.setItem(k, String(v)); } catch (e) {} }
  function del(st, k) { try { st.removeItem(k); } catch (e) {} }

  function soporta() { return !!window.PublicKeyCredential; }
  function marca() { return get(localStorage, MARCA); }
  function marcadoPara(email) { var m = marca(); return !!m && (m === '1' || m === String(email || '').toLowerCase()); }

  function _ok(email) {
    set(localStorage, MARCA, String(email || '1').toLowerCase());
    set(sessionStorage, ABIERTA, Date.now());
    try { ADORNO_SSO.confiar(true); } catch (e) {}     // es su equipo: los módulos no le vuelven a pedir la clave
  }

  function mensajeError(e) {
    var t = String((e && (e.code || e.name || e.message)) || '');
    if (/NotAllowed|AbortError|cancel/i.test(t)) return '';                         // la persona canceló
    if (/passkey_disabled/i.test(t)) return 'Todavía no está prendido en Supabase. Avisale a JP.';
    if (/credential_not_found/i.test(t)) return 'Esta cara no está registrada en el sistema. Entrá con tu clave.';
    return 'No se pudo. Probá de nuevo.';
  }

  async function entrar(sb) {
    var r = await sb.auth.signInWithPasskey();
    if (r.error) return { error: r.error, mensaje: mensajeError(r.error) };
    _ok(r.data && r.data.user && r.data.user.email);
    return r;
  }

  async function registrar(sb) {
    var r = await sb.auth.registerPasskey();
    if (r.error && !/credential_exists/i.test(String(r.error.code || r.error.message))) {
      return { error: r.error, mensaje: mensajeError(r.error) };
    }
    var s = (await sb.auth.getSession()).data.session;
    _ok(s && s.user.email);
    // Recién registrada, entra con la cara: con la cara registrada (y sin código) la clave sola ya no alcanza en la base
    var r2 = await entrar(sb);
    return { ok: true, entro: !r2.error };
  }

  function olvidar() { del(localStorage, MARCA); del(sessionStorage, ABIERTA); }

  // Pantalla que tapa todo hasta que entra con la cara.
  // (4-nov-2026, JP: "¿no lo puede pedir directamente sin que tenga que tocar el botón?") con sola=true pide la cara
  //   apenas aparece; si el celular no lo deja sin un toque (o la persona cancela), queda el botón como siempre.
  // (4-nov-2026, JP eligió el diseño) Clodi 3D en video saludando (Kling, 5 s, primer y último cuadro iguales: loop sin
  //   corte; fondo del video #E7DFD1), el saludo escrito sobre el fondo y el ícono de la cara como botón.
  var APODOS = { 'juanpsimonelli@gmail.com': 'JP', 'clau@claudiaadorno.com': 'Clau' };
  var CARA_SVG = '<svg viewBox="0 0 66 66" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">' +
    '<path d="M6 20V12a6 6 0 0 1 6-6h8M46 6h8a6 6 0 0 1 6 6v8M60 46v8a6 6 0 0 1-6 6h-8M20 60h-8a6 6 0 0 1-6-6v-8M24 25v4M42 25v4M33 25v13h-3M25 45c4.5 3.6 11.5 3.6 16 0"/></svg>';
  var CSS_HOLA = [
    "@font-face{font-family:'URW Gothic';src:url('/hub/fonts/URWGothic-Book.ttf') format('truetype');font-weight:300 700}",
    '.amfa-candado{position:fixed;inset:0;z-index:99999;background:#E7DFD1;color:#1C1612;overflow:hidden;font-family:Jost,system-ui,sans-serif;-webkit-font-smoothing:antialiased;transition:opacity .35s}',
    '.amfa-candado.ah-sale{opacity:0}',
    '.amfa-candado .ah-col{position:relative;height:100%;max-width:440px;margin:0 auto;text-align:center;padding-top:calc(env(safe-area-inset-top,0px) + 34px)}',
    '.amfa-candado .ah-col>*:not(.ah-clodi){position:relative;z-index:1}',
    '.amfa-candado .ah-marca{display:flex;align-items:center;justify-content:center;gap:7px;opacity:0;animation:ah-aparece .6s ease-out .1s forwards}',
    '.amfa-candado .ah-marca svg{width:28px;height:28px}.amfa-candado .ah-marca rect{fill:#D97757}',
    ".amfa-candado .ah-marca b{font:500 22px/1 'Cormorant Garamond',Georgia,serif}.amfa-candado .ah-marca i{font:normal 19px/1 'URW Gothic',Jost,sans-serif}",
    ".amfa-candado .ah-hola{margin:42px 0 0;font:500 42px/1.05 'Cormorant Garamond',Georgia,serif;color:#1C1612}",
    '.amfa-candado .ah-hola .l{display:inline-block;opacity:0;animation:ah-letra .6s cubic-bezier(.2,.7,.3,1) forwards;animation-delay:calc(.9s + var(--i) * 55ms)}',
    '.amfa-candado .ah-mira{margin:10px 0 0;font:400 15px/1.3 Jost,system-ui,sans-serif;color:#685B51;opacity:0;animation:ah-aparece .6s ease-out 1.5s forwards}',
    '.amfa-candado .ah-cara{display:block;margin:24px auto 0;width:76px;height:76px;padding:0;border:0;background:transparent;color:#1C1612;cursor:pointer;opacity:0;animation:ah-aparece .5s ease-out 1.8s forwards;-webkit-tap-highlight-color:transparent}',
    '.amfa-candado .ah-cara svg{width:100%;height:100%;display:block}.amfa-candado .ah-cara:active{transform:scale(.94)}.amfa-candado .ah-cara:disabled{cursor:default}',
    '.amfa-candado .ah-escaneo{position:absolute;left:10px;right:10px;height:2px;top:12px;background:#D97757;border-radius:2px;box-shadow:0 0 10px #D97757;opacity:0;animation:ah-escanea 1.9s ease-in-out 2.2s infinite}',
    '.amfa-candado .ah-error{min-height:18px;margin-top:6px;padding:0 24px;font-size:12.5px;line-height:1.35;color:#A84B37}',
    '.amfa-candado .ah-salir{background:transparent;border:0;color:#685B51;font:400 11px/1 Jost,system-ui,sans-serif;letter-spacing:.2em;text-transform:uppercase;padding:10px 14px;cursor:pointer;opacity:0;animation:ah-aparece .5s ease-out 2.1s forwards}',
    // Clodi abajo: 130 % del ancho, pegada a la derecha; en pantallas bajas se achica para no tapar el botón. El borde
    // de abajo del video queda fuera de la pantalla y el de arriba se funde con el fondo.
    '.amfa-candado .ah-clodi{position:absolute;z-index:0;bottom:-9%;right:-2%;width:min(130%,calc(100vh - 300px));aspect-ratio:1/1;pointer-events:none;transform:translateY(100%);animation:ah-asoma 1.05s cubic-bezier(.22,1.12,.36,1) .25s forwards}',
    '.amfa-candado .ah-clodi video{width:100%;height:100%;display:block;object-fit:cover;-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 16%);mask-image:linear-gradient(to bottom,transparent 0,#000 16%)}',
    // en pantallas anchas se ven los costados del video: también se funden
    '@media (min-width:600px){.amfa-candado .ah-clodi video{-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 16%),linear-gradient(to right,transparent 0,#000 9%,#000 91%,transparent 100%);-webkit-mask-composite:source-in;mask-image:linear-gradient(to bottom,transparent 0,#000 16%),linear-gradient(to right,transparent 0,#000 9%,#000 91%,transparent 100%);mask-composite:intersect}}',
    '@keyframes ah-aparece{to{opacity:1}}',
    '@keyframes ah-letra{from{opacity:0;transform:translateY(14px);filter:blur(4px)}to{opacity:1;transform:none;filter:none}}',
    '@keyframes ah-asoma{to{transform:translateY(0)}}',
    '@keyframes ah-escanea{0%{top:12px;opacity:0}15%,85%{opacity:1}100%{top:62px;opacity:0}}',
    '@media (prefers-reduced-motion:reduce){.amfa-candado *{animation-duration:.01s!important;animation-delay:0s!important;animation-iteration-count:1!important}}'
  ].join('');

  function candado(sb, sola, email) {
    if (document.querySelector('.amfa-candado')) return;
    if (!document.getElementById('amfa-hola-css')) {
      var st = document.createElement('style'); st.id = 'amfa-hola-css'; st.textContent = CSS_HOLA; document.head.appendChild(st);
      if (!document.querySelector('link[href*="Cormorant"]')) {
        var lk = document.createElement('link'); lk.rel = 'stylesheet';
        lk.href = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500&family=Jost:wght@400;500&display=swap';
        document.head.appendChild(lk);
      }
    }
    var nombre = APODOS[String(email || '').toLowerCase()];
    var hola = 'Hola' + (nombre ? ', ' + nombre : '');
    var letras = hola.split('').map(function (c, i) { return '<span class="l" style="--i:' + i + '">' + (c === ' ' ? '&nbsp;' : c) + '</span>'; }).join('');
    var rayos = ''; for (var k = 0; k < 12; k++) rayos += '<g transform="rotate(' + k * 15 + ' 50 50)"><rect x="48" y="6" width="4" height="88" rx="2"/></g>';
    var o = document.createElement('div');
    o.className = 'amfa-candado'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', hola);
    o.innerHTML = '<div class="ah-col">' +
      '<div class="ah-clodi"><video src="/hub/clodi/clodi_saluda.mp4" poster="/hub/clodi/clodi_saluda_poster.webp" autoplay muted loop playsinline preload="auto" aria-hidden="true"></video></div>' +
      '<div class="ah-marca"><svg viewBox="0 0 100 100" aria-hidden="true">' + rayos + '</svg><b>Claude</b><i>Adorno</i></div>' +
      '<h1 class="ah-hola" aria-label="' + hola + '">' + letras + '</h1>' +
      '<p class="ah-mira">Mirá el celular para entrar</p>' +
      '<button class="ah-cara" aria-label="Entrar con la cara">' + CARA_SVG + '<i class="ah-escaneo"></i></button>' +
      '<div class="ah-error" role="status"></div>' +
      '<button class="ah-salir">Salir</button></div>';
    document.body.appendChild(o);
    // el video arranca solo (sin sonido); si la página estaba oculta, apenas se ve
    var v = o.querySelector('video');
    var arrancar = function () { if (v.paused) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } };
    arrancar();
    document.addEventListener('visibilitychange', function vis() {
      if (!o.isConnected) { document.removeEventListener('visibilitychange', vis); return; }
      if (!document.hidden) arrancar();
    });
    var err = o.querySelector('.ah-error'), btn = o.querySelector('.ah-cara');
    btn.onclick = async function () {
      if (btn.disabled) return;
      btn.disabled = true; err.textContent = '';
      var r = await entrar(sb);
      btn.disabled = false;
      if (r.error) {
        err.textContent = r.mensaje;
        if (/credential_not_found/i.test(String(r.error.code || r.error.message))) olvidar();
        return;
      }
      o.classList.add('ah-sale');
      setTimeout(function () { o.remove(); }, 360);
    };
    o.querySelector('.ah-salir').onclick = async function () {
      try { await sb.auth.signOut({ scope: 'local' }); } catch (e) {}
      location.reload();
    };
    if (sola && !document.hidden) btn.onclick();
  }

  async function vigilar(sb) {
    try {
      if (!soporta()) return;
      var s = (await sb.auth.getSession()).data.session;
      if (!s) return;
      // Cuenta que solo entra con la cara (sin código) y sesión de clave: la base la rechaza, así que se pide la cara
      var e = await ADORNO_MFA.estado(sb);
      if (!e.conCara && sb.auth.passkey && !(await ADORNO_MFA.factor(sb))) {
        var pk = await sb.auth.passkey.list();
        if (pk && pk.data && pk.data.length) { candado(sb, false, s.user.email); return; }
      }
      if (!marcadoPara(s.user.email)) return;
      if (!get(sessionStorage, ABIERTA)) candado(sb, true, s.user.email);
      if (window.__adornoCaraVigila) return;
      window.__adornoCaraVigila = true;
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) { set(sessionStorage, FUERA, Date.now()); return; }
        var f = +get(sessionStorage, FUERA) || 0;
        if (f && Date.now() - f > PAUSA) { del(sessionStorage, ABIERTA); candado(sb, true, s.user.email); }
      });
    } catch (e) {}
  }

  return { soporta: soporta, marcadoPara: marcadoPara, entrar: entrar, registrar: registrar, olvidar: olvidar, vigilar: vigilar };
})();

// ═══════════════════════════════════════════════════════════════════════
//  ADORNO_SSO.migrar seguro (4-nov-2026, charla Infraestructura)
//  Cada módulo, antes de crear su cliente, llamaba ADORNO_SSO.migrar(claveVieja): si la sesión compartida
//  (adorno-auth) estaba vacía, copiaba la que hubiera guardada con la clave vieja del módulo. Esas claves quedaron
//  con sesiones de antes del cambio de proyecto (22-oct: el refresh da 400 "Refresh Token Not Found" y se vuelve a
//  pedir la cara) o, la clave por defecto sb-<proyecto>-auth-token, con la sesión de OTRA persona que entró en una
//  página suelta (4-nov: el iPhone de JP quedó con la sesión de Analía). Ahora no se copia nada: las claves viejas
//  de cada módulo se borran y la por defecto no se toca (la usan páginas sueltas de Obra) pero tampoco se adopta.
//  Este archivo se carga después de definir ADORNO_SSO y antes de que el módulo llame a migrar (Hub y módulos).
// ═══════════════════════════════════════════════════════════════════════
(function () {
  if (!window.ADORNO_SSO || ADORNO_SSO.migrarSeguro) return;
  ADORNO_SSO.migrarSeguro = true;
  ADORNO_SSO.migrar = function (keyVieja) {
    if (!keyVieja || keyVieja === ADORNO_SSO.KEY || keyVieja.indexOf('sb-') === 0) return;
    try { localStorage.removeItem(keyVieja); } catch (e) {}
  };
})();

// (infra, 4-nov-2026, JP) la versión del módulo en el título de la pestaña y el aviso de versión nueva: /hub/version.js
(function () {
  if (window.ADORNO_VERSION || document.querySelector('script[src*="/hub/version.js"]')) return;
  var s = document.createElement('script');
  s.src = '/hub/version.js?v=1'; s.async = true;
  (document.head || document.documentElement).appendChild(s);
})();

// (infra, 11-nov-2026, JP) en la computadora, el nombre del módulo en el banner abre la lista para pasar a otro módulo
(function () {
  if (window.ADORNO_SELECTOR || document.querySelector('script[src*="/hub/selector.js"]')) return;
  var s = document.createElement('script');
  s.src = '/hub/selector.js?v=1'; s.async = true;
  (document.head || document.documentElement).appendChild(s);
})();

// (infra, 11-nov-2026, JP) equipos trabados al usuario del local: /hub/equipo.js (en un equipo común no hace nada)
(function () {
  if (window.ADORNO_EQUIPO || document.querySelector('script[src*="/hub/equipo.js"]')) return;
  var s = document.createElement('script');
  s.src = '/hub/equipo.js?v=2'; s.async = true;
  (document.head || document.documentElement).appendChild(s);
})();
