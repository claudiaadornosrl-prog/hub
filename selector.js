// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
//  selector.js — (infra, 11-nov-2026, JP: "en el banner de cada módulo un desplegable para pasar a otro módulo sin volver
//  al Hub; solo en la computadora", eligió la opción A del preview)
//  · Agrega al principio del banner del módulo una pastilla con su moneda (color + ícono, como en el Hub) y una flechita.
//    Al tocarla se abre la lista de los módulos que esa persona puede usar, con buscador y flechas del teclado.
//  · Solo en computadora (pantalla ancha y mouse). Sin sesión no aparece.
//  · La lista de quién ve qué sale de lo mismo que el Hub (hub_modulos, guardado en 'hub_modulos_perfil').
//  · MANTENER la lista MODULOS igual a HUB_MODULOS del Hub (nombres, íconos, colores, direcciones).
//  Lo cargan solos los módulos que usan /hub/seguridad.js o /hub/version.js.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
(function () {
  if (window.ADORNO_SELECTOR) return;
  window.ADORNO_SELECTOR = true;
  var SB = 'https://jfwtiagteuwmyvblgwms.supabase.co', KEY = 'sb_publishable_udSPma98Sw9eskeeLCgdCw_S2vIX0Fk';
  var BASE = 'https://claudiaadornosrl-prog.github.io';
  var SAFE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z"/><circle cx="12" cy="11" r="3.2"/><path d="M12 6.2v1.6M12 14.2v1.6M7.2 11h1.6M15.2 11h1.6M6 19v2M18 19v2"/></svg>';
  var MODULOS = [
    { id: 'crm', nombre: 'Clientes', desc: 'Pedidos · WhatsApp', icono: 'ti-shopping-bag', color: '#6E7D5A', ruta: '/crm-adorno/' },
    { id: 'rrhh', nombre: 'Colaboradores', desc: 'Empleadas · sueldos', icono: 'ti-users', color: '#7A6274', ruta: '/rrhh-adorno/' },
    { id: 'ventas', nombre: 'Ventas', desc: 'Carga diaria · cierre del día', icono: 'ti-currency-dollar', color: '#A65A42', ruta: '/ventas-adorno/' },
    { id: 'tesoreria', nombre: 'Tesorería', desc: 'Cajas · bancos', icono: null, color: '#A07F45', ruta: '/tesoreria-adorno/' },
    { id: 'stock', nombre: 'Stock', desc: 'Precios · existencias', icono: 'ti-package', color: '#4F6B68', ruta: '/stock-adorno/' },
    { id: 'documentos', nombre: 'Documentos', desc: 'Firmados · OneDrive', icono: 'ti-folder-search', color: '#5D7080', ruta: '/documentos-adorno/' },
    { id: 'compras', nombre: 'Compras', desc: 'Facturas · listados', icono: 'ti-shopping-cart', color: '#B07A55', ruta: '/compras-adorno/' },
    { id: 'gastos', nombre: 'Gastos', desc: 'Planilla mes a mes', icono: 'ti-notebook', color: '#7C7650', ruta: '/gastos-adorno/' },
    { id: 'impuestos', nombre: 'Impuestos', desc: 'IIBB · vencimientos', icono: 'ti-building-bank', color: '#6B4C3B', ruta: '/impuestos-adorno/' },
    { id: 'productos', nombre: 'Productos', desc: 'Ficha por artículo', icono: 'ti-tags', color: '#59698A', ruta: '/productos-adorno/' },
    { id: 'marketing', nombre: 'Marketing', desc: 'Redes · pauta · web', icono: 'ti-speakerphone', color: '#A3656F', ruta: '/marketing-adorno/' },
    { id: 'obra', nombre: 'Obra', desc: 'Local Martínez', icono: 'ti-hammer', color: '#8A7B70', ruta: '/obra-adorno/' },
    { id: 'pos', nombre: 'POS', desc: 'Facturas · notas de crédito', icono: 'ti-receipt', color: '#3D7C88', ruta: '/pos-adorno/' }
  ];
  var esCompu = function () { try { return matchMedia('(min-width: 900px) and (pointer: fine)').matches; } catch (e) { return false; } };
  var aqui = MODULOS.filter(function (m) { return location.pathname.indexOf(m.ruta) === 0; })[0];
  if (!aqui) return;   // el Hub u otra página: no va

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function leerSesion(k) {
    try { var j = JSON.parse(localStorage.getItem(k) || 'null'); var s = j && (j.currentSession || j); return s && s.user ? { email: String(s.user.email || '').toLowerCase(), token: s.access_token } : null; } catch (e) { return null; }
  }
  function sesion() { return leerSesion((window.ADORNO_SSO && ADORNO_SSO.KEY) || 'adorno-auth') || leerSesion('ca_session'); }
  function icono(m) { return m.icono ? '<i class="ti ' + m.icono + '" aria-hidden="true"></i>' : SAFE; }
  function moneda(m, cls) { return '<span class="asel-moneda ' + (cls || '') + '" style="--c:' + m.color + '">' + icono(m) + '</span>'; }

  // ── qué módulos puede usar: lo que el Hub dejó guardado; si no está, se le pregunta a la base ──
  var permitidos = null;
  function cargarPermitidos(s) {
    try {
      var c = JSON.parse(localStorage.getItem('hub_modulos_perfil') || 'null');
      if (c && c.email === s.email && Array.isArray(c.lista)) { permitidos = c.lista; return Promise.resolve(permitidos); }
    } catch (e) {}
    return fetch(SB + '/rest/v1/rpc/hub_modulos', { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' }, body: '{}' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && Array.isArray(d.modulos)) {
          permitidos = d.modulos;
          try { localStorage.setItem('hub_modulos_perfil', JSON.stringify({ email: s.email, lista: d.modulos })); } catch (e) {}
        }
        return permitidos;
      }).catch(function () { return null; });
  }
  function usos() { try { return JSON.parse(localStorage.getItem('hub-usos') || '{}') || {}; } catch (e) { return {}; } }
  function lista() {
    var u = usos();
    return MODULOS.filter(function (m) { return !permitidos || permitidos.indexOf(m.id) >= 0; })
      .sort(function (a, b) { return (a.id === aqui.id) - (b.id === aqui.id) || (u[b.ruta] || 0) - (u[a.ruta] || 0); });
  }

  // ── estilos (con el prefijo asel- para no chocar con los del módulo) ──
  function estilos() {
    if (document.getElementById('asel-css')) return;
    // la letra de los íconos (la misma del Hub); hasta que llega, los íconos no se muestran (si no, se ve un cuadradito)
    var listo = function () { document.documentElement.classList.add('asel-fuente'); };
    var esperar = function () { try { document.fonts.load('16px tabler-icons').then(listo, listo); } catch (e) { listo(); } setTimeout(listo, 6000); };
    if (!document.querySelector('link[href*="tabler-icons"]')) {
      var l = document.createElement('link'); l.rel = 'stylesheet';
      l.href = 'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.47.0/tabler-icons.min.css';
      l.onload = esperar; l.onerror = listo; document.head.appendChild(l);
    } else esperar();
    var s = document.createElement('style'); s.id = 'asel-css';
    s.textContent =
      '.asel-titulo{cursor:pointer;border-radius:999px;padding:3px 10px 3px 8px;margin-left:-8px;transition:background .15s;-webkit-tap-highlight-color:transparent}' +
      '.asel-titulo:hover,.asel-titulo:focus-visible{background:color-mix(in srgb,currentColor 13%,transparent);outline:none}' +
      '.asel-flecha{font-size:.8em;margin-left:4px;opacity:.75;vertical-align:middle;font-style:normal}' +
      '.asel-nombre{display:inline-flex;align-items:center;font-size:17px;font-weight:500;white-space:nowrap;flex:0 0 auto}' +
      '.asel-moneda{width:28px;height:28px;flex:0 0 28px;border-radius:50%;display:grid;place-items:center;background:var(--c);color:#F7F3EC;font-size:15px;' +
        'box-shadow:0 2px 0 color-mix(in srgb,var(--c) 60%,#000)}' +
      '.asel-moneda svg{width:16px;height:16px}' +
      '.asel-menu{position:fixed;z-index:99980;width:310px;max-height:min(70vh,560px);overflow:auto;padding:10px;border-radius:22px;background:#fff;color:#1C1612;' +
        'box-shadow:0 24px 50px -16px rgba(28,22,18,.45),0 0 0 1px rgba(28,22,18,.06);font:400 14px/1.35 Jost,system-ui,-apple-system,sans-serif;text-align:left}' +
      '.asel-buscar{display:block;width:100%;box-sizing:border-box;margin:2px 0 8px;padding:9px 16px;border:1px solid #D6CCBA;border-radius:999px;font:inherit;font-size:13px;color:#1C1612;background:#fff;outline:none}' +
      '.asel-buscar:focus{border-color:#A08C78}' +
      '.asel-item{display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;padding:7px 12px 7px 8px;border:0;border-radius:999px;background:transparent;' +
        'font:inherit;color:inherit;text-align:left;cursor:pointer;text-decoration:none}' +
      '.asel-item:hover,.asel-item.asel-foco{background:rgba(28,22,18,.06)}' +
      '.asel-item .asel-n{flex:1;min-width:0}.asel-item small{display:block;font-size:11px;color:#685B51;line-height:1.2}' +
      '.asel-item .asel-ok{color:#685B51;font-size:16px}' +
      '.asel-pie{border-top:1px solid #E5DDCF;margin-top:6px;padding-top:6px}' +
      '.asel-pie .asel-casa{width:28px;text-align:center;font-size:18px;color:#685B51}' +
      '.asel-vacio{padding:10px 14px;color:#685B51;font-size:13px}' +
      '.asel-flecha,.asel-menu .ti{visibility:hidden}.asel-fuente .asel-flecha,.asel-fuente .asel-menu .ti{visibility:visible}' +
      '@media (max-width:899px),(pointer:coarse){.asel-flecha{display:none!important}.asel-titulo{cursor:inherit}.asel-titulo:hover{background:none}}';
    document.head.appendChild(s);
  }

  // ── el menú ──
  var menu = null, boton = null, foco = 0;
  function ir(m) {
    try { var u = usos(); u[m.ruta] = (u[m.ruta] || 0) + 1; localStorage.setItem('hub-usos', JSON.stringify(u)); } catch (e) {}
    var url = BASE + m.ruta, enVentana = false;
    try { enVentana = localStorage.getItem('hub-ventana-modulo') === '1'; } catch (e) {}
    // (11-nov, JP: "si estoy en un módulo y elijo otro, que esa ventana se transforme en el otro, no que abra otra nueva")
    //   Normal: la misma ventana pasa al otro módulo. En un equipo con "Cada módulo en su ventana" (engranaje del Hub) el
    //   ícono de la barra es el de la app que abrió la ventana, así que para que cambie: se abre el otro módulo en su app
    //   y esta ventana se cierra al mismo tiempo (se ve como si se transformara). En una pestaña común no se cierra nada.
    if (enVentana && matchMedia('(display-mode: standalone)').matches) {
      cerrar();
      var a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { window.close(); }, 350);
      return;
    }
    location.href = url;
  }
  function cerrar() { if (menu) { menu.remove(); menu = null; document.removeEventListener('mousedown', fuera, true); } }
  function fuera(ev) { if (menu && !menu.contains(ev.target) && !(boton && boton.contains(ev.target))) cerrar(); }
  function pintar(q) {
    var cuerpo = menu.querySelector('.asel-lista'); q = (q || '').trim().toLowerCase();
    var ms = lista().filter(function (m) { return !q || (m.nombre + ' ' + m.desc).toLowerCase().indexOf(q) >= 0; });
    foco = Math.min(foco, Math.max(ms.length - 1, 0));
    cuerpo.innerHTML = ms.length ? ms.map(function (m, i) {
      var actual = m.id === aqui.id;
      return '<button type="button" class="asel-item' + (i === foco ? ' asel-foco' : '') + '" data-id="' + m.id + '">' + moneda(m) +
        '<span class="asel-n">' + esc(m.nombre) + '<small>' + (actual ? 'Estás acá' : esc(m.desc)) + '</small></span>' +
        (actual ? '<i class="ti ti-check asel-ok" aria-hidden="true"></i>' : '') + '</button>';
    }).join('') : '<div class="asel-vacio">No hay un módulo con ese nombre.</div>';
    cuerpo._ms = ms;
  }
  function abrir() {
    if (menu) { cerrar(); return; }
    menu = document.createElement('div'); menu.className = 'asel-menu'; menu.setAttribute('role', 'menu');
    menu.innerHTML = '<input class="asel-buscar" type="text" placeholder="Ir a… (escribí o usá las flechas)" aria-label="Buscar módulo">' +
      '<div class="asel-lista"></div>' +
      '<div class="asel-pie"><a class="asel-item" href="' + BASE + '/hub/"><span class="asel-casa"><i class="ti ti-home" aria-hidden="true"></i></span><span class="asel-n">Volver al Hub</span></a></div>';
    document.body.appendChild(menu);
    var r = boton.getBoundingClientRect();
    menu.style.top = Math.round(r.bottom + 8) + 'px';
    menu.style.left = Math.round(Math.max(8, Math.min(r.left, innerWidth - menu.offsetWidth - 8))) + 'px';
    foco = 0; pintar('');
    var inp = menu.querySelector('.asel-buscar');
    inp.addEventListener('input', function () { foco = 0; pintar(inp.value); });
    inp.addEventListener('keydown', function (ev) {
      var ms = menu.querySelector('.asel-lista')._ms || [];
      if (ev.key === 'ArrowDown') { ev.preventDefault(); foco = Math.min(foco + 1, ms.length - 1); pintar(inp.value); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); foco = Math.max(foco - 1, 0); pintar(inp.value); }
      else if (ev.key === 'Enter') { ev.preventDefault(); var m = ms[foco]; if (m && m.id !== aqui.id) ir(m); }
      else if (ev.key === 'Escape') { ev.preventDefault(); cerrar(); boton.focus(); }
    });
    menu.addEventListener('click', function (ev) {
      var b = ev.target.closest('.asel-item[data-id]'); if (!b) return;
      var m = MODULOS.filter(function (x) { return x.id === b.dataset.id; })[0];
      if (!m || m.id === aqui.id) { cerrar(); return; }
      ir(m);
    });
    setTimeout(function () { inp.focus(); }, 0);
    document.addEventListener('mousedown', fuera, true);
  }

  // ── el nombre del módulo en el banner es el botón (JP: "que toque sobre Tesorería y abra el desplegable, sin fichita de más")
  //    Si el módulo vuelve a dibujar su banner, se lo vuelve a preparar. En Obra solo la palabra "Obra" (el resto del
  //    título ya sirve para cambiar de obra); en Clientes el texto de arriba; en Colaboradores el logo.
  var TITULOS = { obra: '.lb-app', crm: '.header-txt', rrhh: '.topbar-logo' };
  function banner() {
    var cands = document.querySelectorAll('header, .topbar, .header');
    for (var i = 0; i < cands.length; i++) {
      var h = cands[i];
      if (h.closest('.asel-menu') || h.closest('#login, .login, #login-screen, .login-screen, #pantalla-login')) continue;
      if (h.offsetParent === null || h.getBoundingClientRect().top > 120) continue;   // escondido o no es el de arriba
      return h;
    }
    return null;
  }
  function poner() {
    if (!esCompu() || !sesion()) return;
    var h = banner(); if (!h) return;
    var t = h.querySelector('.asel-nombre') || h.querySelector(TITULOS[aqui.id] || 'h1, .header-title, .title');
    // (11-nov, JP: "Clientes no tiene título, no puedo salir a otro módulo") si el banner no muestra el nombre del módulo
    //   (vacío o escondido), se le pone uno ("Clientes") y ese es el botón
    var sinTexto = function (el) { return !el || !el.textContent.replace(/\s+/g, '').length || el.offsetWidth < 8; };
    if (sinTexto(t)) {
      var dentro = h.querySelector('.topbar-left, .header-left') || h;
      t = document.createElement('span'); t.className = 'asel-nombre'; t.textContent = aqui.nombre;
      var antes = t && dentro.querySelector('.hbtn, a[href*="/hub/"]');
      dentro.insertBefore(t, antes && antes.parentElement === dentro ? antes.nextSibling : dentro.firstChild);
    }
    estilos();
    if (!t.querySelector('.asel-flecha')) {
      var f = document.createElement('i'); f.className = 'ti ti-chevron-down asel-flecha'; f.setAttribute('aria-hidden', 'true');
      t.appendChild(f);
    }
    if (t.dataset.asel) return;
    t.dataset.asel = '1'; t.classList.add('asel-titulo');
    t.setAttribute('role', 'button'); t.setAttribute('tabindex', '0'); t.setAttribute('aria-haspopup', 'menu');
    t.title = 'Cambiar de módulo';
    var abrirDesde = function (ev) { if (!esCompu()) return; ev.preventDefault(); ev.stopPropagation(); boton = t; abrir(); };
    t.addEventListener('click', abrirDesde);
    t.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') abrirDesde(ev); });
  }
  function arrancar() {
    var s = sesion();
    if (s) cargarPermitidos(s);
    poner();
    var t = null;
    new MutationObserver(function () { if (t) return; t = setTimeout(function () { t = null; if (!permitidos && sesion()) cargarPermitidos(sesion()); poner(); }, 300); })
      .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
    addEventListener('resize', function () { cerrar(); poner(); });
  }
  if (document.body) arrancar(); else document.addEventListener('DOMContentLoaded', arrancar);
})();
