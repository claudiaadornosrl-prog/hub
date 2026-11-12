// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
//  equipo.js — (infra, 11-nov-2026, JP: "trabar un dispositivo para que solo pueda usar el usuario del local, para
//  que no se equivoquen y carguen otro usuario en la computadora del local")
//  · El equipo guarda un secreto propio en localStorage 'adorno-equipo' ({ token, estado, usuario, nombre, local }).
//    La base guarda solo su hash (hub_equipos). Se pide desde el Hub (Mi cuenta, con el usuario del local) y lo
//    aprueba administración en el Hub (engranaje → Permisos → Equipos).
//  · Si el equipo está TRABADO: en los formularios de ingreso el mail queda fijo en el usuario del local, y si en
//    cualquier página aparece la sesión de otra persona, se la cierra en este equipo y se recarga.
//  · Un equipo sin 'adorno-equipo' no hace nada (todos los demás equipos siguen igual).
//  Lo cargan solos los módulos que usan /hub/seguridad.js o /hub/version.js.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
(function () {
  if (window.ADORNO_EQUIPO) return;
  var SB = 'https://jfwtiagteuwmyvblgwms.supabase.co', KEY = 'sb_publishable_udSPma98Sw9eskeeLCgdCw_S2vIX0Fk';
  var CLAVE = 'adorno-equipo', SSO = (window.ADORNO_SSO && ADORNO_SSO.KEY) || 'adorno-auth', AVISO = 'adorno-equipo-aviso';
  var LOCALES = { alcorta: 'Alcorta', unicenter: 'Unicenter', oficina: 'Oficina' };

  function leer() { try { return JSON.parse(localStorage.getItem(CLAVE) || 'null'); } catch (e) { return null; } }
  function guardar(o) { try { if (o) localStorage.setItem(CLAVE, JSON.stringify(o)); else localStorage.removeItem(CLAVE); } catch (e) {} }
  function trabado() { var e = leer(); return !!(e && e.estado === 'trabado' && e.usuario); }
  function lugar(e) { return (e && (LOCALES[e.local] || e.local)) || 'este local'; }
  // (12-nov) el mail sale del user, o del propio token si la sesión se guardó sin user (Clientes, sesiones viejas)
  function mailDeToken(t) {
    try {
      var p = String(t || '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); while (p.length % 4) p += '=';
      return String(JSON.parse(atob(p)).email || '').toLowerCase();
    } catch (e) { return ''; }
  }
  function leerSesion(k) {
    try {
      var j = JSON.parse(localStorage.getItem(k) || 'null'); var s = j && (j.currentSession || j);
      if (!s || !s.access_token) return null;
      var mail = String((s.user && s.user.email) || s.email || mailDeToken(s.access_token) || '').toLowerCase();
      return mail ? { clave: k, email: mail, token: s.access_token } : null;
    } catch (e) { return null; }
  }
  function sesion() { return leerSesion(SSO); }
  // todas las sesiones guardadas en este navegador: la compartida, la de Clientes ('ca_session') y las sueltas de supabase
  function sesiones() {
    var ks = [SSO, 'ca_session'];
    try { Object.keys(localStorage).forEach(function (k) { if (/^sb-.+-auth-token$/.test(k) && ks.indexOf(k) < 0) ks.push(k); }); } catch (e) {}
    return ks.map(leerSesion).filter(Boolean);
  }
  function nuevoToken() {
    var a = new Uint8Array(32); crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function token() {   // el secreto de este equipo (se crea la primera vez que se pide la traba)
    var e = leer() || {};
    if (!e.token) { e.token = nuevoToken(); e.estado = 'nuevo'; guardar(e); }
    return e.token;
  }
  function rpc(nombre, args, conSesion) {
    var h = { apikey: KEY, 'Content-Type': 'application/json' }, s = conSesion && sesion();
    if (s && s.token) h.Authorization = 'Bearer ' + s.token;
    return fetch(SB + '/rest/v1/rpc/' + nombre, { method: 'POST', headers: h, body: JSON.stringify(args || {}), cache: 'no-store' })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j && j.message) || ('HTTP ' + r.status)); return j; }); });
  }
  // lo que dice la base de este equipo; si se cae la red, queda lo último que se supo
  function refrescar() {
    var e = leer(); if (!e || !e.token) return Promise.resolve(null);
    return rpc('hub_equipo_estado', { p_token: e.token }, true)
      .catch(function () { return rpc('hub_equipo_estado', { p_token: e.token }, false); })
      .then(function (r) {
        if (!r || !r.estado) return leer();
        if (r.estado === 'trabado' || r.estado === 'pendiente') {
          guardar({ token: e.token, estado: r.estado, usuario: r.usuario, nombre: r.nombre, local: r.local, id: r.id });
        } else if (e.estado !== 'nuevo') {
          guardar(null);   // destrabado, rechazado o borrado: el equipo vuelve a ser uno común
        }
        controlar(); return leer();
      })
      .catch(function () { return leer(); });
  }

  // ── si aparece otra persona en un equipo trabado, se la saca de este equipo ──
  function controlar() {
    if (!trabado()) return;
    var e = leer(), otras = sesiones().filter(function (s) { return s.email && s.email !== e.usuario; });
    if (otras.length) {
      otras.forEach(function (s) { try { localStorage.removeItem(s.clave); } catch (x) {} });
      try { sessionStorage.setItem(AVISO, otras[0].email); } catch (x) {}
      location.reload();
      return;
    }
    trabarCampos();
  }

  // ── en los formularios de ingreso (mail + contraseña) el mail queda fijo en el usuario del local ──
  function ponerValor(i, v) {
    var d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (d && d.set) d.set.call(i, v); else i.value = v;
    i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true }));
  }
  // (11-nov, arreglo) SOLO el mail de un formulario de ingreso: la contraseña tiene que estar a la vista y el mail tiene
  //   que estar justo antes que ella en el mismo formulario/caja chica. Antes se buscaba hacia arriba sin mirar si la
  //   contraseña se veía, y en Clientes trababa el mail del CLIENTE del pedido nuevo (la caja de ingreso estaba escondida).
  function visible(el) { return !!(el && el.offsetParent !== null && el.getClientRects().length); }
  function trabarCampos() {
    if (!trabado() || !document.body) return;
    var e = leer();
    document.querySelectorAll('input[type=password]').forEach(function (pw) {
      if (!visible(pw) || pw.autocomplete === 'new-password') return;
      var caja = pw.form || pw.parentElement; var n = 0;
      while (caja && n < 2 && !caja.querySelector('input[type=email], input[autocomplete=username], input[autocomplete=email]')) { caja = caja.parentElement; n++; }
      if (!caja || caja.querySelectorAll('input:not([type=hidden]):not([type=checkbox])').length > 4) return;   // es un formulario de datos, no de ingreso
      var ms = [].filter.call(caja.querySelectorAll('input[type=email], input[autocomplete=username], input[autocomplete=email]'), function (x) {
        return visible(x) && (x.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      var m = ms[ms.length - 1];
      if (!m || m.type === 'hidden') return;
      if (m.value !== e.usuario) ponerValor(m, e.usuario);
      if (m.dataset.adornoEquipo) return;
      m.dataset.adornoEquipo = '1'; m.readOnly = true; m.setAttribute('aria-readonly', 'true');
      m.title = 'Este equipo es de ' + lugar(e) + ': solo se usa con su usuario';
      m.style.opacity = '.7';
      var nota = document.createElement('div');
      nota.className = 'adorno-equipo-nota';
      nota.textContent = '🔒 Equipo de ' + lugar(e) + ': solo entra con este usuario';
      nota.style.cssText = 'font-size:11.5px;color:#685B51;margin:-4px 0 10px;line-height:1.3';
      m.insertAdjacentElement('afterend', nota);
    });
  }

  // ── aviso después de sacar a alguien ──
  function aviso() {
    var quien = null; try { quien = sessionStorage.getItem(AVISO); sessionStorage.removeItem(AVISO); } catch (x) {}
    if (!quien || !document.body) return;
    var e = leer(), d = document.createElement('div');
    d.setAttribute('role', 'alert');
    d.style.cssText = 'position:fixed;z-index:99995;left:50%;top:18px;transform:translateX(-50%);max-width:calc(100vw - 32px);' +
      'box-sizing:border-box;padding:12px 20px;border-radius:999px;background:#1C1612;color:#F4EFE6;' +
      'font:400 13px/1.35 Jost,system-ui,-apple-system,sans-serif;box-shadow:0 12px 30px -10px rgba(0,0,0,.45);text-align:center';
    d.textContent = 'Este equipo es de ' + lugar(e) + ': solo se usa con su usuario. Se cerró la sesión de ' + quien + '.';
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 7000);
  }

  window.ADORNO_EQUIPO = { leer: leer, guardar: guardar, trabado: trabado, token: token, refrescar: refrescar, controlar: controlar, lugar: lugar };

  function arrancar() {
    aviso(); controlar();
    if (window.MutationObserver) {
      var t = null;
      new MutationObserver(function () { if (!trabado() || t) return; t = setTimeout(function () { t = null; trabarCampos(); }, 150); })
        .observe(document.body, { childList: true, subtree: true });
    }
    setInterval(controlar, 2000);                                     // si alguien entra con otro usuario en esta pestaña
    window.addEventListener('storage', function (ev) { if (ev.key === SSO || ev.key === CLAVE || ev.key === 'ca_session' || /^sb-.+-auth-token$/.test(ev.key || '')) controlar(); });
    refrescar();
  }
  controlar();   // antes de que el módulo arranque, por si quedó la sesión de otra persona
  if (document.body) arrancar(); else document.addEventListener('DOMContentLoaded', arrancar);
})();
