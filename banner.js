// ═══════════════════════════════════════════════════════
//  VER COMO (infra, 16-nov-2026, JP: «poder entrar a ver dentro de cada usuario, no para modificarles nada»).
//  Va primero en este archivo porque banner.js es lo único que TODOS los módulos cargan sin async.
//  Solo hace algo si el Hub dejó la marca `adorno-ver-como` (la pone JP con «Ver como» → «Entrar al módulo»).
//  NO se inicia sesión como la otra persona. Con la marca puesta:
//   · a cada consulta a la base se le agrega el encabezado x-ver-como: la base la responde como esa cuenta y en SOLO
//     LECTURA (public._hub_ver_como_pre; se lo acepta solo al token de JP, a cualquier otro lo rechaza);
//   · el módulo cree que la sesión es de esa cuenta (se cambia el `user` al leer la sesión guardada; el token sigue
//     siendo el de JP);
//   · no salen llamadas a funciones (/functions/v1) ni se sube o borra nada del almacenamiento;
//   · arriba queda un cartel «Viendo como … · solo lectura · Salir». La marca vence sola a la hora.
// ═══════════════════════════════════════════════════════
(function () {
  if (window.ADORNO_VERCOMO !== undefined) return;
  window.ADORNO_VERCOMO = null;
  try {
    var MARCA = 'adorno-ver-como', SES = 'adorno-auth';
    var getReal = Storage.prototype.getItem;
    var vc = null;
    try { vc = JSON.parse(getReal.call(localStorage, MARCA) || 'null'); } catch (e) {}
    if (!vc) return;
    if (!vc.email || !vc.id || !vc.de || !(vc.hasta > Date.now())) { try { localStorage.removeItem(MARCA); } catch (e) {} return; }
    if (/^\/hub\//.test(location.pathname)) return;                       // el Hub siempre se ve con la cuenta de JP
    var real = null;
    try { real = JSON.parse(getReal.call(localStorage, SES) || 'null'); } catch (e) {}
    // de quién es la sesión se mira en el TOKEN (no en el `user` guardado, que podría haber quedado disfrazado)
    function subDe(tok) { try { return JSON.parse(atob(String(tok).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub || null; } catch (e) { return null; } }
    if (!real || !real.access_token || subDe(real.access_token) !== vc.de) return;   // la sesión abierta no es la de quien pidió «ver como»
    var userReal = (real.user && real.user.id === vc.de) ? real.user : { id: vc.de, aud: 'authenticated', role: 'authenticated', email: vc.de_email || '', app_metadata: {}, user_metadata: {} };
    window.ADORNO_VERCOMO = { email: vc.email, nombre: vc.nombre || vc.email, salir: salir };

    function salir() { try { localStorage.removeItem(MARCA); } catch (e) {} location.href = '/hub/'; }
    function vigente() {
      if (vc.hasta > Date.now()) return true;
      try { localStorage.removeItem(MARCA); } catch (e) {}
      return false;
    }
    function disfrazar(u) {
      if (!u || typeof u !== 'object') return u;
      var c = {}; for (var k in u) c[k] = u[k];
      c.id = vc.id; c.email = vc.email; c.user_metadata = {}; c.identities = []; delete c.phone;
      return c;
    }

    // 1) la sesión guardada se lee con el usuario de la otra cuenta (el token no cambia)
    Storage.prototype.getItem = function (k) {
      var v = getReal.apply(this, arguments);
      try {
        if (this === localStorage && vigente()) {
          if (k === SES && v) {
            var s = JSON.parse(v);
            if (s && s.user && subDe(s.access_token) === vc.de) { s.user = disfrazar(s.user); return JSON.stringify(s); }
          }
          if (typeof k === 'string' && k.indexOf('adorno-modulo-') === 0) return '1';   // que no pida la clave por cambio de cuenta
        }
      } catch (e) {}
      return v;
    };

    // 1b) lo que se GUARDA es siempre la sesión real de JP: si el token se renueva en este modo, supabase-js guarda la
    //     respuesta (que le llegó disfrazada) y sin esto quedaría el `user` de la otra cuenta con el token de JP.
    //     Tampoco se borra la sesión guardada (un signOut del módulo no desloguea a JP).
    var setReal = Storage.prototype.setItem, delReal = Storage.prototype.removeItem;
    Storage.prototype.setItem = function (k, v) {
      try {
        if (this === localStorage && k === SES && typeof v === 'string') {
          var s = JSON.parse(v);
          if (s && s.user && s.user.id === vc.id && subDe(s.access_token) === vc.de) { s.user = userReal; v = JSON.stringify(s); }
        }
      } catch (e) {}
      return setReal.call(this, k, v);
    };
    Storage.prototype.removeItem = function (k) {
      if (this === localStorage && k === SES && vigente()) return;
      return delReal.apply(this, arguments);
    };

    // 2) las consultas a la base llevan el encabezado; lo que no es lectura de la base no sale
    var fetchReal = window.fetch;
    var avisado = 0;
    function aviso(t) {
      if (Date.now() - avisado < 2500) return; avisado = Date.now();
      try {
        var d = document.createElement('div');
        d.textContent = t;
        d.style.cssText = 'position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:2147483647;background:#1C1612;color:#F7F3EC;border-radius:999px;padding:11px 20px;font:500 13px Jost,system-ui,sans-serif;box-shadow:0 12px 30px -12px rgba(0,0,0,.5);max-width:calc(100vw - 30px);text-align:center;';
        (document.body || document.documentElement).appendChild(d);
        setTimeout(function () { d.remove(); }, 3800);
      } catch (e) {}
    }
    function trabada(motivo) {
      aviso('Modo «Ver como»: es solo para mirar, no se modifica nada.');
      return Promise.resolve(new Response(JSON.stringify({ code: 'VC00', message: 'Modo «Ver como»: solo lectura (' + motivo + ')', error: 'En modo «Ver como» esto no está disponible (' + motivo + ')' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }));
    }
    window.fetch = function (input, init) {
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || String(input);
        if (url.indexOf('.supabase.co/') < 0 || !vigente()) return fetchReal.apply(this, arguments);
        var metodo = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
        if (url.indexOf('/functions/v1/') >= 0) return trabada('funciones');
        if (url.indexOf('/storage/v1/') >= 0 && metodo !== 'GET' && metodo !== 'HEAD' && url.indexOf('/object/sign') < 0 && url.indexOf('/object/list') < 0) return trabada('archivos');
        if (url.indexOf('/auth/v1/') >= 0) {
          // «Salir» del módulo: se sale del modo y se vuelve al Hub SIN cerrar la sesión de JP (la promesa no se resuelve
          //   a propósito: si devolviera 403, supabase-js borraría igual la sesión guardada)
          if (url.indexOf('/auth/v1/logout') >= 0) { salir(); return new Promise(function () {}); }
          // de /token solo pasa la renovación: nadie inicia sesión con su clave en este modo
          if (url.indexOf('/auth/v1/token') >= 0 && url.indexOf('grant_type=refresh_token') < 0) return trabada('iniciar sesión');
          if (metodo !== 'GET' && url.indexOf('/auth/v1/token') < 0) return trabada('cuenta');       // nada de cambiar clave, etc.
          return fetchReal.apply(this, arguments).then(function (r) {
            if (!r.ok) return r;
            return r.clone().json().then(function (j) {
              if (j && j.user && j.access_token) j.user = disfrazar(j.user);                         // respuesta de renovar el token
              else if (j && j.id && j.aud) j = disfrazar(j);                                         // respuesta de /user
              return new Response(JSON.stringify(j), { status: r.status, statusText: r.statusText, headers: r.headers });
            }).catch(function () { return r; });
          });
        }
        if (url.indexOf('/rest/v1/') >= 0) {
          var h = new Headers((init && init.headers) || (typeof input !== 'string' && input && input.headers) || {});
          // solo si la consulta va con el token de JP: un cliente aparte (quien autoriza con su clave) o la clave pública no se disfrazan
          var sub = null;
          try { var tk = (h.get('Authorization') || '').replace(/^Bearer\s+/i, '').split('.')[1]; sub = tk ? JSON.parse(atob(tk.replace(/-/g, '+').replace(/_/g, '/'))).sub : null; } catch (e) {}
          if (sub !== vc.de) return fetchReal.apply(this, arguments);
          h.set('x-ver-como', vc.email);
          if (vc.local) h.set('x-ver-como-local', '1');
          var i2 = {}; if (init) for (var k in init) i2[k] = init[k];
          i2.headers = h;
          return fetchReal.call(this, input, i2).then(function (r) {
            if (r.status >= 400) r.clone().text().then(function (t) {
              if (/read-only transaction/i.test(t)) aviso('Modo «Ver como»: es solo para mirar, no se modifica nada.');
              else if (/VC0[12]/.test(t)) aviso('«Ver como» ya no está disponible: volvé al Hub.');
            }).catch(function () {});
            return r;
          });
        }
      } catch (e) {}
      return fetchReal.apply(this, arguments);
    };

    // 3) cartel fijo
    function cartel() {
      if (document.getElementById('vc-cartel')) return;
      var d = document.createElement('div');
      d.id = 'vc-cartel';
      d.style.cssText = 'position:fixed;bottom:10px;left:50%;transform:translateX(-50%);z-index:2147483646;display:flex;align-items:center;gap:10px;background:#F3E9D6;border:1px solid #C99A4B;color:#1C1612;border-radius:999px;padding:6px 8px 6px 16px;font:400 13px Jost,system-ui,sans-serif;box-shadow:0 10px 28px -14px rgba(28,22,18,.5);max-width:calc(100vw - 20px);white-space:nowrap;';
      var s = document.createElement('span');
      s.style.cssText = 'overflow:hidden;text-overflow:ellipsis;';
      s.textContent = 'Viendo como ' + (vc.nombre || vc.email) + ' · solo lectura' + (vc.local ? ' · adentro del local' : ' · afuera del local');
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = 'Salir';
      b.style.cssText = 'border:0;background:#1C1612;color:#F7F3EC;border-radius:999px;padding:7px 15px;font:inherit;font-size:12px;cursor:pointer;';
      b.onclick = salir;
      d.appendChild(s); d.appendChild(b);
      (document.body || document.documentElement).appendChild(d);
    }
    if (document.body) cartel(); else document.addEventListener('DOMContentLoaded', cartel);
    setInterval(function () { if (!vigente()) location.href = '/hub/'; else cartel(); }, 20000);
  } catch (e) {}
})();
// ═══════════════════════════════════════════════════════
//  CARTELES DE ERROR (infra, 16-nov-2026, JP: «los carteles rojos de avisos de sistema, que no se cierren solos, que
//  tengan una X para cerrarlos a mano, todos en castellano y que se entienda el error, sin tecnicismos»).
//  window.ADORNO_AVISO = { error(msg), traducir(msg), cerrarTodos() }
//  · error(msg): cartel rojo fijo arriba, con ✕; NO se cierra solo. El texto pasa por traducir().
//  · traducir(msg) → { texto, tecnico }: cambia los errores de la base, de la red o del navegador por una frase simple;
//    el original queda en «Ver detalle técnico» para soporte. Lo que ya está en castellano se deja como está.
//  · Sin tocar los módulos: si el módulo tiene una función global toast(msg, tipo), los toasts de ERROR pasan por acá
//    (los demás siguen igual). alert() muestra el texto ya traducido.
// ═══════════════════════════════════════════════════════
(function () {
  if (window.ADORNO_AVISO) return;
  var REGLAS = [
    [/read-only transaction/i, 'Estás en modo «Ver como»: es solo para mirar, así que no se guardó nada.'],
    [/VC0[012]/, 'Esto no está disponible en modo «Ver como».'],
    // va ANTES que la de «tu sesión venció»: el texto de Meta también dice «session has expired» (aviso de Clientes)
    [/\(#190\)|error validating access token|oauth|access token.*(expired|invalid|parse)|invalid.*access token/i, 'La conexión del número de WhatsApp con Meta venció. Avisale a JP.'],
    [/failed to fetch|networkerror|load failed|network request failed|err_internet|err_network|fetch failed/i, 'No hay conexión con el sistema. Revisá internet y probá de nuevo.'],
    [/invalid x-api-key|authentication_error/i, 'La clave de un servicio que usa el sistema no es válida. Avisale a JP.'],
    [/claude -p error|claude api|anthropic|overloaded_error/i, 'Claude no pudo terminar el trabajo. Probá de nuevo; si sigue pasando, avisale a JP.'],
    [/jwt expired|invalid jwt|jwt.*(invalid|malformed|cryptograph)|PGRST30[123]|refresh token|session.*(expired|missing|not found)|not authenticated/i, 'Tu sesión venció. Salí y volvé a entrar.'],
    [/invalid login credentials|invalid_grant|invalid email or password/i, 'El usuario o la clave no son correctos.'],
    [/email not confirmed/i, 'Ese usuario todavía no está confirmado. Avisale a JP.'],
    [/row-level security|violates row level|permission denied|insufficient.privilege|42501|not allowed|forbidden|unauthorized/i, 'Tu usuario no tiene permiso para hacer esto.'],
    // WhatsApp (Meta), por código — avisos de Clientes
    [/131047|re-engagement/i, 'Pasaron más de 24 horas desde que escribió la clienta: por WhatsApp ahora solo se le puede mandar una plantilla.'],
    [/131026|message undeliverable/i, 'Ese número no tiene WhatsApp o no se le pudo entregar el mensaje.'],
    [/131030|not in allowed list/i, 'Ese número no está habilitado para recibir mensajes desde esta línea.'],
    [/13200[01]|template.*(does not exist|not found|param)/i, 'La plantilla de WhatsApp tiene un problema. Avisale a JP.'],
    [/133010|not registered/i, 'El número de WhatsApp del local no está registrado en Meta. Avisale a JP.'],
    [/\(#100\)|invalid parameter/i, 'Hay un dato del mensaje que WhatsApp no acepta (por ejemplo, el número).'],
    [/failed to send a request to the edge function/i, 'No hay conexión con el sistema. Revisá internet y probá de nuevo.'],
    [/non-2xx|edge function returned/i, 'El servicio no respondió bien. Probá de nuevo en un momento.'],
    [/^\s*(error\s*[:：-]?\s*)?(sin permiso|no ten[eé]s permiso)\.?\s*$/i, 'Tu usuario no tiene permiso para hacer esto.'],
    [/JSON object requested|multiple \(or no\) rows|cannot coerce the result|PGRST116|0 rows/i, 'No se encontró ese dato. Puede que ya no exista o que esté repetido.'],
    [/aborterror|aborted|the operation was aborted|signal is aborted/i, 'Se cortó antes de terminar. Probá de nuevo.'],
    [/duplicate key|already exists|23505|unique constraint/i, 'Eso ya estaba cargado: está repetido.'],
    [/foreign key|23503|is still referenced/i, 'No se puede: hay otros datos del sistema que dependen de esto.'],
    [/not-null|null value in column|23502/i, 'Falta completar un dato obligatorio.'],
    [/check constraint|23514/i, 'Hay un dato con un valor que el sistema no acepta.'],
    [/invalid input syntax|22P02|invalid input value|date\/time field value out of range|22007|22008/i, 'Hay un dato mal escrito (por ejemplo un número o una fecha).'],
    [/value too long|22001/i, 'Un texto es demasiado largo.'],
    [/numeric field overflow|22003|out of range/i, 'Un número es demasiado grande.'],
    [/statement timeout|canceling statement|57014|timed? ?out|timeout|deadlock|lock timeout|55P03|40P01/i, 'El sistema tardó demasiado en responder. Esperá un momento y probá de nuevo.'],
    [/could not find the (function|table|relation)|PGRST20[0-5]|schema cache|does not exist|42883|42P01|42703/i, 'Esta parte del sistema todavía no está disponible. Avisale a JP.'],
    [/payload too large|entity too large|413|file size|exceeded the maximum/i, 'El archivo es demasiado pesado.'],
    [/too many requests|rate limit|429/i, 'Se hicieron demasiados intentos seguidos. Esperá un minuto y probá de nuevo.'],
    [/mime type|not supported|unsupported/i, 'Ese tipo de archivo no se acepta.'],
    [/notallowederror|permission dismissed|permission denied by (user|system)|notfounderror.*(device|camera)|could not start video/i, 'El navegador no dio permiso (cámara, micrófono, ubicación o avisos). Revisá el candado al lado de la dirección.'],
    [/quota.*exceeded|storage.*full/i, 'Este equipo se quedó sin espacio para guardar datos del sistema.'],
    [/internal server error|bad gateway|service unavailable|gateway timeout|\b50[0234]\b/i, 'El sistema no está respondiendo bien. Probá de nuevo en un momento.'],
    [/\b404\b|not found/i, 'No se encontró lo que se buscaba. Puede que ya no exista.'],
    [/unexpected token|unexpected end of|is not valid json|syntaxerror|typeerror|referenceerror|rangeerror|cannot read prop|is not a function|is not defined|undefined|\[object object\]|null is not|of null|of undefined/i, 'Algo falló adentro del sistema. Probá de nuevo; si sigue pasando, avisale a JP.']
  ];
  var _PAL = /\b(el|la|los|las|del|que|no|se|un|una|para|con|sin|por|falta|ya|tu|te|es|son|hay|esta|este|pudo|pude|puede|tiene|permiso|mes|cerrado|guardar|cargar|importe|local|cuenta|usuario|clave)\b/gi;
  var _ING = /\b(the|is|are|of|to|returned|failed|invalid|not|cannot|requested|request|response|status|code|function|message|parameter|token|expired|denied|missing|found|rows?|value|key|column|table|unexpected|undefined|null)\b/i;
  var CASTELLANO = { test: function (t) {
    t = String(t || '');
    if (/[áéíóúñ¿¡]/i.test(t)) return true;
    var m = t.match(_PAL), n = m ? m.length : 0;
    return n >= 2 || (n === 1 && !_ING.test(t));
  } };

  function traducir(msg) {
    var orig = String(msg == null ? '' : (msg.message || msg)).trim();
    if (!orig) return { texto: 'Algo falló. Probá de nuevo.', tecnico: '' };
    for (var i = 0; i < REGLAS.length; i++) {
      if (REGLAS[i][0].test(orig)) {
        // si el módulo ya decía en castellano qué estaba haciendo («No se pudo guardar: …»), eso se conserva
        var antes = orig.split(/[:：]/)[0].replace(/^[\s✗❌⚠️!¡]+/, '').trim();
        var sirve = antes && antes.length <= 70 && antes !== orig && CASTELLANO.test(antes) && !REGLAS[i][0].test(antes) && !/^error$/i.test(antes);
        // texto largo en castellano que al final pega el error técnico («…explicación… Detalle técnico: Failed to fetch»):
        // la explicación se conserva entera y solo se cambia la cola técnica (aviso de Ventas)
        var ult = orig.lastIndexOf(':');
        if (!sirve && orig.length > 110 && ult > 70) {
          var cabeza = orig.slice(0, ult).replace(/[\s\n]*(detalle t[eé]cnico|motivo|error|detalle)\s*$/i, '').trim();
          if (cabeza && CASTELLANO.test(cabeza) && !REGLAS[i][0].test(cabeza))
            return { texto: cabeza.replace(/[.\s]+$/, '') + '.\n' + REGLAS[i][1], tecnico: orig };
        }
        return { texto: (sirve ? antes.replace(/[.\s]+$/, '') + '. ' : '') + REGLAS[i][1], tecnico: orig };
      }
    }
    // «No se pudo redactar: <algo técnico que no reconozco>»: se muestra lo de antes en castellano y lo técnico va aparte
    var corte = orig.search(/[:：]/);
    if (corte > 0 && corte <= 70) {
      var cab = orig.slice(0, corte).replace(/^[\s✗❌⚠️!¡]+/, '').trim(), cola = orig.slice(corte + 1).trim();
      var colaTecnica = cola && (/[{}\[\]<>]|\w+_\w+|[A-Z]{2,}\d{2,}|\(#\d+\)/.test(cola) || _ING.test(cola));
      if (cab && CASTELLANO.test(cab) && !/^error$/i.test(cab) && colaTecnica)
        return { texto: cab.replace(/[.\s]+$/, '') + '. Algo falló y el sistema no supo explicarlo. Probá de nuevo; si sigue pasando, avisale a JP.', tecnico: orig };
    }
    if (CASTELLANO.test(orig)) return { texto: orig.replace(/^(error|err)\s*[:：-]\s*/i, ''), tecnico: '' };
    return { texto: 'Algo falló y el sistema no supo explicarlo. Probá de nuevo; si sigue pasando, avisale a JP.', tecnico: orig };
  }

  var caja = null, vivos = [];
  function armarCaja() {
    if (caja && caja.isConnected) return caja;
    caja = document.createElement('div');
    caja.id = 'adorno-avisos';
    caja.setAttribute('role', 'alert');
    caja.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483645;display:flex;flex-direction:column;gap:8px;width:min(520px,calc(100vw - 20px));pointer-events:none;font-family:Jost,system-ui,-apple-system,sans-serif;';
    (document.body || document.documentElement).appendChild(caja);
    return caja;
  }
  function error(msg) {
    var t = traducir(msg);
    var ya = vivos.filter(function (v) { return v.texto === t.texto && v.el.isConnected; })[0];
    if (ya) { ya.n++; ya.cuenta.textContent = '×' + ya.n; ya.cuenta.style.display = ''; return ya.el; }
    var el = document.createElement('div');
    el.style.cssText = 'pointer-events:auto;display:flex;align-items:flex-start;gap:10px;background:#F4E1DA;border:1px solid #D9A090;color:#7A2E1F;border-radius:18px;padding:12px 10px 12px 16px;box-shadow:0 14px 34px -16px rgba(28,22,18,.55);font-size:14px;line-height:1.4;';
    var cuerpo = document.createElement('div'); cuerpo.style.cssText = 'flex:1 1 auto;min-width:0;';
    var tx = document.createElement('div'); tx.textContent = t.texto; tx.style.cssText = 'font-weight:500;overflow-wrap:anywhere;white-space:pre-line;';
    var cuenta = document.createElement('span'); cuenta.style.cssText = 'display:none;margin-left:8px;background:#A84B37;color:#fff;border-radius:999px;padding:1px 8px;font-size:11px;';
    tx.appendChild(cuenta); cuerpo.appendChild(tx);
    if (t.tecnico) {
      var d = document.createElement('details'); d.style.cssText = 'margin-top:5px;font-size:11px;color:#8C5A4C;';
      var s = document.createElement('summary'); s.textContent = 'Ver detalle técnico (para soporte)'; s.style.cssText = 'cursor:pointer;';
      var p = document.createElement('div'); p.textContent = t.tecnico.slice(0, 600); p.style.cssText = 'margin-top:4px;overflow-wrap:anywhere;user-select:text;';
      d.appendChild(s); d.appendChild(p); cuerpo.appendChild(d);
    }
    var x = document.createElement('button');
    x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', 'Cerrar el aviso'); x.title = 'Cerrar';
    x.style.cssText = 'flex:0 0 auto;border:0;background:#A84B37;color:#fff;width:28px;height:28px;border-radius:50%;font-size:13px;line-height:1;cursor:pointer;';
    var reg = { texto: t.texto, el: el, n: 1, cuenta: cuenta };
    x.onclick = function () { el.remove(); vivos = vivos.filter(function (v) { return v !== reg; }); };
    el.appendChild(cuerpo); el.appendChild(x);
    armarCaja().appendChild(el);
    vivos.push(reg);
    while (vivos.length > 4) { var v = vivos.shift(); v.el.remove(); }   // como mucho 4 a la vez: se van los más viejos
    return el;
  }
  function cerrarTodos() { vivos.forEach(function (v) { v.el.remove(); }); vivos = []; }
  window.ADORNO_AVISO = { error: error, traducir: traducir, cerrarTodos: cerrarTodos };

  // ¿este toast es de error? por el 2º argumento (true, 'err', 'error', 'mal', 'bad'…) o, si el módulo no lo distingue, por el texto
  function esError(msg, tipo) {
    if (tipo === true) return true;
    if (typeof tipo === 'string' && tipo) return /err|mal|bad|rojo|danger|fail|fallo/i.test(tipo);
    if (tipo) return false;
    var m = String(msg || '');
    if (/^[\s]*(✗|❌|⛔|error\b|no se pudo|no pude|no pudimos|fall[oó]\b|ups\b)/i.test(m)) return true;
    for (var i = 0; i < REGLAS.length - 2; i++) if (REGLAS[i][0].test(m) && !CASTELLANO.test(m.split(/[:：]/)[0] === m ? m : '')) return true;
    return false;
  }
  function enganchar() {
    try {
      var f = window.toast;
      if (typeof f === 'function' && !f.__adornoAviso) {
        var nuevo = function (msg, tipo) {
          try { if (esError(msg, tipo)) { error(msg); return; } } catch (e) {}
          return f.apply(this, arguments);
        };
        nuevo.__adornoAviso = true;
        window.toast = nuevo;
      }
      var a = window.alert;
      if (typeof a === 'function' && !a.__adornoAviso) {
        var na = function (m) { var t; try { t = traducir(m); } catch (e) {} return a.call(window, t && t.tecnico ? t.texto : m); };
        na.__adornoAviso = true;
        window.alert = na;
      }
    } catch (e) {}
  }
  enganchar();
  document.addEventListener('DOMContentLoaded', enganchar);
  window.addEventListener('load', enganchar);
})();
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
//  banner.js — BANNER COMÚN de los módulos (infra, 11-nov-2026). Va con /hub/banner.css (ver ahí cómo se arma).
//  Se carga justo DESPUÉS del banner (<script src="/hub/banner.js?v=6"></script>), sin async: así la moneda aparece
//  junto con el banner, sin saltos.
//  · Pone la moneda del módulo (fondo crema, ícono del color del módulo, el mismo dibujo que la ficha del Hub).
//  · Si el banner no trae espacio flexible, lo agrega después de los apartados (los botones quedan a la derecha).
//  · Si no trae botón ☰ para el celular, agrega uno que abre/cierra los apartados.
//  · Oculta el botón Manual (JP, 11-nov: le preguntan a Clodi) y acomoda las rayitas de la derecha.
//  · En el celular copia adentro del ☰ los botones de la derecha (menos Hub y Salir).
//  Íconos: los de la letra Tabler 2.47 (los mismos códigos que hub/herramientas/iconos_modulos.py), pasados a SVG.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
(function () {
  var b = document.querySelector('.ab-banner');
  if (!b || b.getAttribute('data-ab-listo')) return;
  b.setAttribute('data-ab-listo', '1');
  var ICONOS = {
    crm: 'M349 206Q365 155 406 124Q448 94 500 92Q552 91 597 121Q644 153 661 205Q670 234 670 275V299H711Q755 299 773 303Q802 310 826 335Q855 364 861 405Q863 416 862 426Q862 441 856 481Q851 517 836 612Q818 724 812 755Q805 799 799 815Q795 827 784 844Q764 873 734 892Q705 911 669 916Q662 917 505 917H443Q365 917 350 916Q335 916 322 912H321Q277 901 246 868Q214 836 203 792L152 463Q147 432 147 420Q146 412 148 403L149 402Q153 378 167 355Q193 315 242 302Q249 300 256 299H340V275Q340 250 342 236Q343 222 349 206ZM585 241Q578 210 555 192Q533 176 505 176Q477 176 455 192Q432 209 425 241Q423 252 423 273V299H587V273Q587 252 585 241ZM260 383Q249 386 241 395Q233 404 231 417Q230 420 252 571Q275 727 283 767Q288 793 306 811Q323 829 349 834Q357 835 505 835Q653 835 661 834Q685 829 703 812Q721 795 726 772Q728 767 754 599Q781 427 779 417Q776 397 760 387Q753 383 746 382Q738 381 707 381H670V424Q670 468 669 471Q668 483 657 493Q645 505 628 505Q612 505 600 493Q590 483 588 471Q587 468 587 424V381H423V424Q423 468 422 471Q420 483 410 493Q398 505 382 505Q365 505 353 493Q342 483 341 471Q340 468 340 424V381H303Q268 381 260 383Z',
    rrhh: 'M236 445Q185 394 176 326Q168 264 198 206Q228 148 283 117Q342 84 412 95Q460 103 495 127Q551 164 574 225Q595 282 582 342Q569 403 526 446Q480 492 413 503Q386 508 351 503Q284 492 236 445ZM663 180Q639 174 632 154Q624 133 636 116Q647 98 671 98Q692 98 721 113Q753 130 779 158Q809 190 824 230Q841 277 834 329Q825 384 791 427Q763 461 723 482Q690 500 667 500Q647 499 636 482Q624 464 631 444Q638 425 663 418Q706 404 730 370Q752 338 752 299Q753 260 730 229Q707 195 663 180ZM501 329Q512 283 492 243Q472 206 434 188Q395 169 354 177Q310 187 281 227Q258 259 258 297Q258 333 278 364Q297 395 329 410Q364 427 403 420Q439 413 466 388Q492 364 501 329ZM284 588Q284 588 288 588Q341 587 386 587H470Q488 588 494 589Q545 598 584 626Q642 666 662 741L663 745Q668 762 669 773Q670 788 670 826Q670 879 669 883Q666 902 650 912Q633 921 615 916Q597 910 589 888Q587 884 587 830Q586 785 586 776Q585 766 580 753Q571 726 550 704Q528 683 501 675Q490 671 478 670Q467 670 419 670H381Q294 670 278 672Q240 680 212 706Q189 729 181 756Q177 770 176 780Q175 793 175 831Q175 880 174 884Q169 905 151 913Q133 921 115 913Q97 905 93 883Q92 879 92 826Q92 773 100 742Q113 687 152 648Q179 621 211 607Q243 593 284 588ZM746 594Q733 596 723 606Q713 617 712 632Q710 646 720 660Q725 667 747 676Q778 690 794 703Q820 726 831 764L834 776L835 830Q835 884 837 888Q845 909 862 915Q880 921 896 912Q913 903 917 884Q918 879 918 834Q918 789 917 777Q913 729 889 689Q869 656 837 631Q811 611 782 601Q757 591 746 594Z',
    ventas: 'M495 93Q483 96 475 105Q467 114 464 126Q463 129 463 173V216H441Q415 216 401 218Q387 219 370 225Q320 241 288 284Q257 328 257 381Q257 439 293 483Q331 531 395 545Q402 545 473 546L602 548Q625 553 642 568Q669 590 669 629Q669 653 658 672Q641 700 602 710L511 711Q436 711 422 710Q407 709 396 705Q378 697 367 684Q360 676 352 660Q346 649 343 644Q337 636 330 633Q314 625 298 630Q282 636 274 652Q267 667 272 684Q287 726 319 754Q366 794 442 794H463V837Q463 881 464 884Q469 906 487 914Q505 921 523 913Q541 905 546 884Q547 881 547 837V794H569Q597 794 603 793Q655 788 694 755Q732 722 746 674Q760 626 744 576Q730 536 700 508Q669 479 629 468Q616 465 575 464Q550 463 494 463Q410 463 400 460Q372 453 356 431Q341 409 341 382Q341 354 355 333Q371 309 400 302L408 300L499 299Q574 299 588 300Q603 300 613 305H614Q632 313 643 326Q650 334 658 350Q664 361 667 366Q673 373 680 377Q696 385 712 380Q728 374 736 358Q743 343 738 326Q725 287 695 260Q647 216 568 216H547V173Q547 129 546 126Q542 109 526 99Q511 89 495 93Z',
    stock: 'M488 96Q491 93 498 92Q511 90 526 98L695 193Q862 288 864 290Q869 295 875 309L876 503V697Q873 707 870 712Q868 716 862 721Q859 724 692 818Q525 913 523 914Q515 918 505 918Q495 918 487 914Q485 913 318 818Q151 724 148 721Q142 716 140 712Q137 707 134 697V503L135 309Q141 295 146 290Q152 284 436 125ZM505 181Q503 181 375 254Q262 319 260 320Q259 320 299 342Q339 365 341 364L584 227Q585 226 546 204Q506 181 505 181ZM669 274Q668 274 548 342Q428 409 426 410Q425 412 432 416Q438 420 464 435L505 457L625 390Q734 330 750 319ZM216 390V666L463 805V529L430 510Q237 401 216 390ZM670 459 547 529V805Q547 805 670 736L793 666L794 528V390Z',
    documentos: 'M203 135Q203 135 205 135Q253 134 298 134L392 135Q400 137 409 145Q418 153 463 199L523 257L791 258Q814 258 819 259Q845 266 866 281Q906 309 916 361Q917 366 917 430V470Q917 494 916 497Q910 516 893 522Q876 529 860 522Q843 515 837 497Q835 493 835 484V432L834 370Q828 356 820 350Q815 346 802 341L493 339Q486 336 478 328Q469 320 423 274L363 216H290Q215 216 211 217Q196 219 187 230Q181 236 176 248L175 482Q175 713 177 723Q184 743 204 750Q208 752 341 752H474L481 756Q495 763 501 776Q507 790 504 804Q500 819 487 828L485 829Q481 832 474 833Q465 834 436 834H237Q207 834 196 833Q188 832 179 829H177Q145 818 123 792Q101 767 94 734Q93 730 93 715V253Q93 239 94 235Q101 201 123 176Q141 156 166 144Q187 135 203 135ZM958 917Q958 935 946 946Q935 958 917 958Q908 958 903 956Q898 955 889 947Q883 942 864 923L836 895L826 900Q785 920 740 916Q696 913 659 888Q622 864 604 824Q580 774 590 722Q600 674 635 638Q670 601 719 591Q771 580 824 604Q856 619 880 648Q917 692 917 752Q917 794 901 826L895 836L923 864Q942 883 947 889Q955 898 956 903Q958 908 958 917ZM735 672Q710 678 693 696Q676 713 672 737Q667 761 676 784Q687 810 711 824Q735 837 762 834Q790 832 810 812Q830 792 834 766Q837 739 826 715Q814 691 791 679Q766 666 735 672Z',
    compras: 'M135 134Q135 114 148 103Q155 96 164 94Q172 92 215 92Q262 92 265 93Q277 95 286 104Q296 114 298 126Q299 129 299 154V177L313 178Q450 189 570 197Q837 215 843 217Q852 218 860 224Q868 231 872 241L873 242Q876 248 876 255Q876 265 871 298L856 409L834 557Q829 568 824 574Q814 585 799 587Q795 588 546 588H299V669L692 670Q728 670 733 671Q777 681 805 713Q830 743 834 782Q838 822 819 855Q799 891 758 908Q736 917 712 917Q673 917 643 897Q618 881 603 852Q589 826 587 798Q585 770 594 752H374L377 763Q388 805 371 844Q355 880 320 900Q284 921 245 918Q203 914 170 881Q141 852 134 812Q128 773 146 738Q165 702 203 683L216 677V175H193Q168 175 159 172Q146 167 138 150Q135 146 135 144ZM299 260V505H757L787 298V295L547 278Q447 272 323 262ZM257 834Q271 834 281 828Q297 817 297 793Q297 773 282 761Q268 749 250 752Q232 756 221 776Q219 781 218 783V793Q218 814 230 825Q241 834 257 834ZM701 754Q678 761 672 781Q667 801 679 818Q691 836 714 835Q736 834 746 816Q756 797 748 777Q741 757 719 753Q709 752 701 754Z',
    gastos: 'M243 135Q243 135 249 135Q372 134 485 134Q716 134 732 136Q772 143 800 172Q831 203 835 250Q836 257 836 515L835 766L833 776Q827 803 811 826Q783 865 732 874Q716 876 572 876H423V898Q423 916 422 923Q421 930 418 937Q409 953 392 957Q374 961 359 952Q344 944 341 926Q340 923 340 898V876H295Q248 876 244 875Q217 871 198 850Q178 830 175 801Q175 791 175 505Q175 219 175 209Q177 186 190 168Q201 154 218 144Q231 136 243 135ZM257 217V793H340V217ZM423 217V793H572L723 792Q746 783 751 760Q753 754 753 504Q753 255 751 250Q746 227 723 218L572 217ZM540 299Q545 298 587 298Q629 298 635 299Q651 301 662 317Q673 333 669 350Q664 370 640 380L590 381Q550 381 541 380Q532 380 526 375Q508 364 506 347Q503 330 514 316Q524 301 540 299ZM536 465Q524 468 515 478Q505 489 505 504Q505 520 515 532Q520 538 525 541Q532 545 540 546Q549 547 587 547Q635 547 638 546Q658 541 666 523Q673 505 666 487Q658 469 638 464Q635 463 587 463Q544 463 536 465Z',
    impuestos: 'M496 93Q505 91 514 93Q518 94 662 156Q806 217 813 221Q834 233 836 253Q837 273 822 288Q808 302 787 298Q784 297 653 242Q506 179 504 179Q503 179 422 214Q233 295 223 298Q208 301 194 292Q181 284 176 270Q171 255 178 240Q181 235 186 230Q190 224 194 222Q198 220 346 157Q493 94 496 93ZM123 382Q126 381 507 381L887 382Q913 395 917 415Q921 432 909 446Q897 461 882 463L877 464L876 650V835Q904 839 914 858Q922 875 914 894Q905 912 885 917Q881 918 505 918Q129 918 125 917Q105 912 97 894Q89 875 98 857Q106 839 128 836L134 835V650L133 464Q106 459 96 441Q88 424 96 406Q104 388 123 382ZM217 464V835H793V464ZM300 575Q306 557 322 550Q339 543 356 550Q373 557 379 575Q381 580 381 590V709Q381 719 379 724Q373 742 356 749Q340 756 323 749Q306 742 300 724Q299 720 299 695V604Q299 579 300 575ZM464 579Q467 562 482 553Q498 544 516 548Q533 552 542 569Q545 576 546 586Q547 597 547 650Q547 704 546 714Q545 725 541 733Q538 737 532 743Q520 752 505 752Q490 752 478 743Q472 737 469 733Q465 725 464 714Q463 704 463 650Q463 583 464 579ZM664 547Q653 548 644 556Q634 564 631 575Q629 580 629 590V709Q629 719 631 724Q637 742 654 749Q670 756 686 749Q703 742 710 724Q711 720 711 695V603Q711 579 710 575Q705 560 692 552Q680 545 664 547Z',
    productos: 'M202 217Q203 217 210 217Q265 216 307 216Q369 216 388 217Q415 218 429 222Q443 227 460 240Q470 248 589 365Q717 492 729 509Q752 545 752 592Q751 620 740 644Q733 661 719 678Q716 682 633 765L572 826Q553 844 544 851Q538 856 527 861Q501 875 468 876Q445 876 429 872Q402 865 376 846Q369 840 246 717Q120 592 114 582Q103 565 98 550Q94 536 93 509Q92 491 92 433Q92 355 92 338Q93 321 96 309Q105 273 134 247Q164 221 202 217ZM588 264Q585 250 593 236Q601 223 616 218Q631 213 648 221Q658 227 756 325Q854 423 868 442Q904 488 914 544Q923 598 909 650Q895 702 861 742Q853 751 815 790Q790 814 783 821Q773 830 768 832Q763 834 755 834H746Q739 834 736 832Q723 826 716 814Q710 801 712 787Q713 778 718 772Q723 766 747 741L757 731Q796 692 808 676Q825 651 832 620Q836 599 834 574Q831 530 805 495Q799 487 697 385L622 310Q600 287 594 279Q590 273 589 266ZM205 300Q194 303 187 312Q182 317 176 329V523Q179 530 185 536Q192 545 218 572L415 768Q432 785 438 787Q450 793 465 793Q478 793 486 789Q496 784 516 765Q530 752 580 702L648 633Q660 620 662 616Q669 602 669 588Q669 573 663 561Q660 553 537 430Q414 308 406 303L399 299H304Q209 299 205 300ZM286 383Q273 387 265 398Q257 408 257 422Q257 432 263 443Q273 463 299 463Q309 463 319 458Q339 448 339 422Q339 404 328 393Q320 384 308 382Q295 380 286 383Z',
    marketing: 'M660 156Q690 133 720 134Q743 135 763 151Q779 164 786 178Q792 190 793 200Q794 209 794 252V304L804 307Q855 323 886 367Q915 408 917 460Q919 512 892 554Q862 600 805 620L794 624V699Q793 722 792 728Q792 734 789 743Q781 764 761 778Q741 792 716 792Q691 793 670 778Q661 772 577 702L490 629H464V709Q464 775 464 790Q463 809 460 818Q454 837 440 852Q426 866 406 872L396 875H330Q325 875 319 873Q271 860 258 808L257 719V629H209Q166 629 153 626Q137 622 118 605Q106 593 100 581Q97 574 93 558V368Q98 346 108 332Q126 307 164 299L491 297L569 232Q642 172 660 156ZM620 299Q561 348 545 360Q526 376 515 380L490 381H464V546H484Q513 546 522 550Q530 555 619 629L711 705V223ZM175 381V546H381V381ZM794 464V535Q820 517 830 492Q839 469 833 446Q827 422 811 406Q798 393 795 393ZM341 711V793H381V629H341Z',
    obra: 'M473 126Q488 115 507 111Q538 104 568 124Q574 127 733 286Q892 445 899 453Q916 475 917 501Q919 531 899 556Q896 560 837 620Q791 665 780 674Q770 684 759 688Q744 695 726 694Q709 694 694 687Q685 683 675 675Q668 668 640 640L604 605L383 824Q317 890 315 891Q275 922 227 917Q184 913 150 882Q117 851 110 808Q103 761 132 718Q137 711 167 680L422 423L387 387Q350 350 348 347Q334 326 333 302Q332 279 344 257Q348 249 411 187Q470 128 473 126ZM522 192Q469 246 416 299L571 454Q728 611 728 611Q729 611 752 588L835 505ZM341 622Q202 760 198 768Q190 783 193 798Q196 814 208 824Q221 835 238 835Q250 835 262 828Q268 824 407 685L546 547L480 481Z',
    pos: 'M283 93Q291 92 504 92Q718 92 726 93Q766 98 794 124Q823 151 833 192L835 202L836 537Q836 875 835 880Q833 900 816 911Q798 922 779 915Q774 913 725 880L675 848L644 879Q617 906 608 912Q596 920 581 917Q572 915 566 910Q559 905 535 881L505 852L475 881Q449 907 441 913Q430 920 416 917Q406 915 399 910Q392 905 366 879L335 848L285 880Q236 913 231 915Q212 922 194 911Q177 900 175 881Q174 876 174 539L175 202L177 192Q183 166 200 142Q231 100 283 93ZM286 177Q270 183 262 197V199Q259 203 259 216Q258 233 258 295L257 799L294 775Q318 760 324 756Q331 752 340 752Q351 752 360 758Q368 764 394 790L422 818L451 789Q476 764 484 758Q493 752 505 752Q517 752 526 758Q534 764 558 789L588 818L616 790Q641 764 650 758Q658 752 670 752Q679 752 686 756Q692 760 716 775L752 799V506Q752 217 750 207Q747 194 738 186Q732 181 721 176L507 175H323Q290 176 286 177ZM370 258Q373 257 507 257H640L651 265Q655 267 657 269Q670 282 670 298Q669 313 659 326Q649 338 634 340Q627 340 505 340Q383 340 376 340Q356 337 346 320Q337 302 344 283Q350 264 370 258ZM375 423Q382 422 504 422Q627 422 634 423Q651 425 662 440Q672 455 668 473Q665 491 646 501L640 505H370Q352 493 347 486Q338 474 341 457Q343 444 352 434Q362 425 375 423ZM536 589Q524 592 515 602Q505 613 505 628Q505 643 515 655Q520 662 525 664Q532 669 540 670Q549 670 587 670Q635 670 638 669Q658 665 666 647Q673 629 666 611Q658 593 638 588Q635 587 587 587Q544 587 536 589Z'
  };
  var CAJA = '<svg class="ab-trazo" viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z"/><circle cx="12" cy="11" r="3.2"/><path d="M12 6.2v1.6M12 14.2v1.6M7.2 11h1.6M15.2 11h1.6M6 19v2M18 19v2"/></svg>';
  var MENU = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
  var id = b.getAttribute('data-modulo');

  // ── la moneda ──
  if (!b.querySelector('.ab-moneda')) {
    var m = document.createElement('span');
    m.className = 'ab-moneda'; m.setAttribute('aria-hidden', 'true');
    m.innerHTML = id === 'tesoreria' ? CAJA : (ICONOS[id] ? '<svg viewBox="0 0 1000 1000" aria-hidden="true"><path d="' + ICONOS[id] + '"/></svg>' : '');
    var izq = b.querySelector('.ab-izq'), nom = b.querySelector('.ab-nombre');
    if (izq) izq.insertBefore(m, izq.firstChild);
    else if (nom) nom.parentNode.insertBefore(m, nom);
    else b.insertBefore(m, b.firstChild);
  }

  // ── espacio flexible después de los apartados ──
  var tabs = b.querySelector('.ab-tabs');
  if (tabs && !b.querySelector('.ab-espacio')) {
    var e = document.createElement('span'); e.className = 'ab-espacio';
    tabs.parentNode.insertBefore(e, tabs.nextSibling);
  }

  var der = b.querySelector('.ab-der');

  // ── el botón Manual NO se muestra (JP, 11-nov: "nadie va a usar el manual, le preguntan todo a Clodi").
  //    El manual sigue existiendo (manual.js): Clodi contesta con ese texto. Lo agregan los manual.js de cada módulo
  //    (como apartado, a la derecha o en el menú ⋮), así que se busca en todo el banner. ──
  function esManual(x) {
    var tx = (x.textContent || '').replace(/\s+/g, ' ').trim();
    return x.id === 'btn-manual' || /^(📖 )?Manual( de uso)?$/.test(tx) || /^Manual/.test(x.title || '') || /abrirManual/.test(x.getAttribute('onclick') || '');
  }
  // ── el botón Salir tampoco (JP, 11-nov: "la sesión se cierra solo desde el Hub"): 👤 del Hub → Salir ──
  function esSalir(x) {
    var tx = (x.textContent || '').replace(/\s+/g, ' ').trim();
    return /^Salir/.test(x.title || '') || x.getAttribute('aria-label') === 'Salir' || tx === 'Salir' ||
      /(^|\W)(logout|doLogout|salir|cerrarSesion)\(\)/.test(x.getAttribute('onclick') || '');
  }
  function ocultarManual() {
    [].forEach.call(b.querySelectorAll('button, a'), function (x) {
      if (x.classList.contains('ab-manual') || x.classList.contains('ab-salir') || x.classList.contains('ab-espejo')) return;
      if (esManual(x)) { x.classList.add('ab-manual'); x.style.display = 'none'; }
      else if (esSalir(x)) { x.classList.add('ab-salir'); x.style.display = 'none'; }
    });
  }
  // ── rayitas de la derecha: nunca al principio, al final ni dos seguidas (según lo que se ve: en la compu el Hub
  //    no se muestra porque se vuelve desde la lista del nombre) ──
  function rayitas() {
    if (!der) return;
    var hijos = [].slice.call(der.children), visto = false, ultima = null;
    hijos.forEach(function (x) { if (x.classList.contains('hsep')) x.style.display = ''; });
    hijos.forEach(function (x) {
      if (x.classList.contains('hsep')) {
        if (!visto) x.style.display = 'none'; else { ultima = x; visto = false; }
      } else if (getComputedStyle(x).display !== 'none') { visto = true; ultima = null; }
    });
    if (ultima) ultima.style.display = 'none';   // quedó una rayita al final
  }

  // ── en el celular, los botones de la derecha (menos Hub y Salir) van adentro del menú ☰, abajo de los apartados ──
  function espejar() {
    if (!tabs || !der) return;
    tabs.querySelectorAll(':scope > .ab-espejo, :scope > .ab-espejo-sep').forEach(function (x) { x.remove(); });
    var bts = [].filter.call(der.querySelectorAll(':scope > .hbtn'), function (x) {
      return !x.classList.contains('ab-fijo') && !x.classList.contains('ab-hamb') && !x.classList.contains('kebab-tabs-btn') && x.style.display !== 'none';
    });
    if (!bts.length) return;
    var sep = document.createElement('span'); sep.className = 'ab-espejo-sep'; tabs.appendChild(sep);
    bts.forEach(function (o) {
      var c = document.createElement('button'); c.type = 'button'; c.className = 'ab-espejo';
      var ico = o.querySelector('svg'), lb = o.querySelector('.lb');
      c.innerHTML = (ico ? ico.outerHTML : '') + '<span class="lb"></span>';
      c.querySelector('.lb').textContent = (lb && lb.textContent.trim()) || o.getAttribute('aria-label') || o.title || '';
      c.addEventListener('click', function (ev) { ev.stopPropagation(); tabs.classList.remove('open'); o.click(); });
      tabs.appendChild(c);
    });
  }
  // ── si un apartado tiene alertas (ej. Pedidos de Clientes, en verde), el ☰ del celular lleva un puntito verde ──
  function aviso() {
    if (!tabs) return;
    var hay = !!tabs.querySelector(':scope > .has-alert:not(.ab-espejo), :scope > .ab-alerta:not(.ab-espejo)');
    [].forEach.call(b.querySelectorAll('.ab-hamb, .kebab-tabs-btn'), function (x) { x.classList.toggle('ab-con-aviso', hay); });
  }
  var t = null, ocupado = false;
  function revisar() {
    if (ocupado) return; ocupado = true;
    try { ocultarManual(); espejar(); rayitas(); aviso(); } finally { setTimeout(function () { ocupado = false; }, 0); }
  }
  revisar();
  if (window.MutationObserver) {
    var mo = new MutationObserver(function () { if (ocupado || t) return; t = setTimeout(function () { t = null; revisar(); }, 120); });
    mo.observe(b, { childList: true, subtree: true });
    if (tabs) mo.observe(tabs, { subtree: true, attributes: true, attributeFilter: ['class'] });
    if (der) mo.observe(der, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  }
  try { matchMedia('(min-width: 900px) and (pointer: fine)').addEventListener('change', function () { rayitas(); }); } catch (e) {}

  // ── botón ☰ para el celular (si el módulo no tiene el suyo) ──
  if (tabs && !b.querySelector('.kebab-tabs-btn, .ab-hamb')) {
    var donde = der || b;
    var h = document.createElement('button');
    h.type = 'button'; h.className = 'hbtn ab-hamb'; h.title = 'Apartados'; h.setAttribute('aria-label', 'Apartados');
    h.innerHTML = MENU;
    h.addEventListener('click', function (ev) { ev.stopPropagation(); tabs.classList.toggle('open'); });
    donde.insertBefore(h, donde.firstChild);
    document.addEventListener('click', function (ev) { if (!tabs.contains(ev.target)) tabs.classList.remove('open'); });
    tabs.addEventListener('click', function (ev) { if (ev.target.closest('button, a')) setTimeout(function () { tabs.classList.remove('open'); }, 0); });
  }
})();
