// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
//  animaciones.js — ÍCONOS ANIMADOS en todos los módulos (infra, 11-nov-2026)
//  JP: "así como en Colaboradores todos los íconos tienen alguna animación, replicarlo en los demás módulos".
//  · Al pasar el mouse por un botón con ícono, o al tocarlo/hacer click, el ícono hace un movimiento corto.
//  · El movimiento sale de lo que hace el botón (su nombre: title / aria-label / texto) o del emoji:
//      Actualizar gira · Notificaciones/avisos se sacude · Buscar late · Borrar/anular se balancea · Descargar/enviar sube
//      · Editar/firmar saluda · Plata/caja/pagos da vuelta · Calendario/turnos hace tictac · Personas asienten
//      · Agregar/nuevo gira · el resto rebota. (Los mismos movimientos que Colaboradores: nav-* de rrhh styles.css.)
//  · Todos los botones del módulo, no solo los del banner (y lo que se toca sin ser botón, si es chico).
//  · Se anima solo el ícono (SVG chico, ícono de letra o imagen chica, o el emoji solo o al principio del texto,
//    que se envuelve en un span), nunca el texto ni dibujos grandes.
//  · Respeta "reducir movimiento" del equipo. Colaboradores tiene las suyas (no se carga ahí) y el Hub las monedas.
//  Lo cargan solos los módulos que usan /hub/seguridad.js o /hub/version.js.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
(function () {
  if (window.ADORNO_ANIM) return;
  window.ADORNO_ANIM = true;
  var ruta = location.pathname;
  if (/^\/(hub|rrhh-adorno)\//.test(ruta) || window._icoAnimar) return;   // el Hub y Colaboradores tienen las suyas
  if (!window.matchMedia || !document.addEventListener) return;
  var quieto = function () { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

  // ── los movimientos (mismos que Colaboradores) ──
  var css = document.createElement('style'); css.id = 'aa-css';
  css.textContent =
    '@keyframes aa-bounce{0%,100%{transform:translateY(0)}30%{transform:translateY(-4px)}55%{transform:translateY(0)}75%{transform:translateY(-2px)}}' +
    '@keyframes aa-wiggle{0%,100%{transform:rotate(0)}20%{transform:rotate(-12deg)}40%{transform:rotate(10deg)}60%{transform:rotate(-8deg)}80%{transform:rotate(5deg)}}' +
    '@keyframes aa-sway{0%,100%{transform:rotate(0)}25%{transform:rotate(-10deg)}75%{transform:rotate(10deg)}}' +
    '@keyframes aa-swing{0%,100%{transform:rotate(0)}25%{transform:rotate(14deg)}50%{transform:rotate(-10deg)}75%{transform:rotate(6deg)}}' +
    '@keyframes aa-spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}' +
    '@keyframes aa-tick{0%,100%{transform:rotate(0)}33%{transform:rotate(90deg)}66%{transform:rotate(180deg)}}' +
    '@keyframes aa-flip{0%{transform:rotateY(0)}100%{transform:rotateY(360deg)}}' +
    '@keyframes aa-climb{0%,100%{transform:translate(0,0)}30%{transform:translate(-2px,3px)}70%{transform:translate(2px,-4px)}}' +
    '@keyframes aa-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.28)}}' +
    '@keyframes aa-wave{0%,100%{transform:rotate(0)}25%{transform:rotate(18deg)}50%{transform:rotate(-6deg)}75%{transform:rotate(14deg)}}' +
    '@keyframes aa-nod{0%,100%{transform:translateY(0)}50%{transform:translateY(2px) rotate(6deg)}}' +
    '.aa-ico{transform-origin:50% 55%}' +
    'span.aa-ico{display:inline-block}' +
    '@media (prefers-reduced-motion:no-preference){.aa-ico.aa-anim{animation:var(--aa-anim,aa-bounce .55s ease) both}}';
  (document.head || document.documentElement).appendChild(css);

  // ── qué movimiento le toca a cada botón ──
  var POR_NOMBRE = [
    [/actualiz|refresc|recarg|sincron|volver a lo normal/i, 'aa-spin .7s ease-in-out'],
    [/notific|aviso|alerta|campan/i, 'aa-wiggle .6s'],
    [/busc|lupa|filtr|escane|c[aá]mara|foto/i, 'aa-pulse .5s'],
    [/borr|elimin|quit|papelera|anul|descart|rechaz/i, 'aa-swing .6s'],
    [/descarg|export|import|sub(ir|ida)|envi|mand|transfer|compart/i, 'aa-climb .6s'],
    [/edit|escrib|firm|anot|nota\b|renombr/i, 'aa-wave .6s'],
    [/pag|plata|dinero|caja|cobr|saldo|vale|precio|ventas?\b|efectivo|banco/i, 'aa-flip .7s'],
    [/calend|turno|hora|venc|reloj|pendient|fecha|historial/i, 'aa-tick .8s'],
    [/usuari|client|emplead|person|equipo|vendedor|contact|colaborad/i, 'aa-nod .5s'],
    [/config|ajuste|engran/i, 'aa-spin 1s ease-in-out'],
    [/cerrar mes|reabr|candado|bloque|traba|clave|permiso/i, 'aa-wiggle .55s'],
    [/whats|chat|mensaje|respuest|coment/i, 'aa-wiggle .5s'],
    [/nuev|agreg|crear|sumar|\+/i, 'aa-spin .6s ease-in-out'],
    [/vacacion|playa/i, 'aa-sway .9s ease-in-out']
  ];
  var POR_EMOJI = [
    [/[🔒🔓🔑]/u, 'aa-wiggle .55s'], [/[✍🖋✏📝]/u, 'aa-wave .6s'], [/[🎁🖨📋✅📊🧾]/u, 'aa-bounce .6s'],
    [/[🔄⚙➕]/u, 'aa-spin .7s ease-in-out'], [/[💎⚡👁⏸🔔🔍🔎]/u, 'aa-pulse .5s'], [/[🗑🛍]/u, 'aa-swing .6s'],
    [/[💵💰💸🪙]/u, 'aa-flip .7s'], [/[📤📥📈📉📨]/u, 'aa-climb .6s'], [/[🌴🌊]/u, 'aa-sway .9s ease-in-out'],
    [/[⏳🕐⏰📅]/u, 'aa-tick .8s'], [/[👤👥🙋]/u, 'aa-nod .5s']
  ];
  function nombreDe(btn) {
    return [btn.getAttribute('aria-label'), btn.title, btn.getAttribute('data-tip'), (btn.textContent || '').slice(0, 60)].filter(Boolean).join(' ');
  }
  function movimiento(btn, ico) {
    var txt = ico && ico.tagName !== 'svg' ? ico.textContent : '';
    for (var i = 0; i < POR_EMOJI.length; i++) if (txt && POR_EMOJI[i][0].test(txt)) return POR_EMOJI[i][1];
    var n = nombreDe(btn);
    for (var j = 0; j < POR_NOMBRE.length; j++) if (POR_NOMBRE[j][0].test(n)) return POR_NOMBRE[j][1];
    for (var k = 0; k < POR_EMOJI.length; k++) if (POR_EMOJI[k][0].test(n)) return POR_EMOJI[k][1];
    return 'aa-bounce .55s ease';
  }
  var EMOJI_SOLO = /^\s*(\p{Extended_Pictographic}|[←-⇿☀-➿])[️‍\p{Extended_Pictographic}]*\s*$/u;
  var EMOJI_INI = /^(\s*)((?:\p{Extended_Pictographic}|[←-⇿☀-➿])[️‍\u{1F3FB}-\u{1F3FF}\p{Extended_Pictographic}]*)/u;
  var ICONO = 'svg, i, img, .ico, .icon, .tab-icon, [class*="-ico"], [class^="ico-"], [class*="icono"]';
  function chico(el, max) { var r = el.getBoundingClientRect(); return r.width > 0 && r.width <= max && r.height <= max; }
  // si el texto empieza con un emoji ("📤 Exportar"), el emoji se envuelve en un span para moverlo solo a él
  function emojiInicial(nodo) {
    var t = nodo.firstChild;
    while (t && t.nodeType === 3 && !t.nodeValue.trim()) t = t.nextSibling;
    if (!t || t.nodeType !== 3) return null;
    var m = EMOJI_INI.exec(t.nodeValue); if (!m) return null;
    var s = document.createElement('span'); s.textContent = m[2];
    t.nodeValue = t.nodeValue.slice(m[0].length);
    nodo.insertBefore(s, t);
    if (m[1]) nodo.insertBefore(document.createTextNode(m[1]), s);
    return s;
  }
  // el ícono del botón: un dibujo chico (SVG), un ícono de letra o imagen chica, o el emoji (solo o al principio del texto)
  function iconoDe(btn) {
    var ya = btn.querySelector('.aa-ico'); if (ya) return ya;
    var el = btn.querySelector(ICONO);
    if (el && !el.closest('.ab-moneda')) {
      if (el.tagName.toLowerCase() === 'svg' || el.tagName === 'IMG') return chico(el, 40) ? el : null;   // no dibujos grandes (gráficos, logos)
      if (chico(el, 44)) return el;
    }
    if (btn.children.length === 0 && EMOJI_SOLO.test(btn.textContent || '')) {
      var t = btn.textContent; btn.textContent = '';
      var s = document.createElement('span'); s.textContent = t; btn.appendChild(s); return s;
    }
    var p = btn.firstElementChild;   // ej. <span class="tab-icon">🛍</span> o <b>📒</b> al principio
    if (p && p.children.length === 0 && EMOJI_SOLO.test(p.textContent || '')) return p;
    return emojiInicial(btn) || (p && p.children.length === 0 && btn.firstChild === p ? emojiInicial(p) : null);
  }
  // botones de verdad, y también lo que se toca sin ser botón (con onclick, data-tip o role="button") si es chico
  // (así no se anima una fila o una tarjeta entera)
  var SEL = 'button, a[href], [role="button"], [onclick], [data-tip], .hbtn, .tab-btn, .htab, .chip, .pill';
  var NO = '.asist-fab, .asist-panel, .ab-moneda, .asel-menu, input, select, textarea, #manual-overlay';
  function boton(el) {
    var b = el && el.closest && el.closest(SEL);
    if (!b || b.disabled || b === document.body || b.closest(NO)) return null;
    if (b.tagName !== 'BUTTON' && b.tagName !== 'A') {
      var r = b.getBoundingClientRect();
      if (r.width > 280 || (r.height > 64 && r.width > 120)) return null;   // filas y tarjetas enteras no
    }
    return b;
  }
  function animar(btn) {
    if (!btn || quieto()) return;
    var ico = iconoDe(btn); if (!ico) return;
    if (!ico.classList.contains('aa-ico')) {
      ico.classList.add('aa-ico');
      ico.style.setProperty('--aa-anim', movimiento(btn, ico));
    }
    ico.classList.remove('aa-anim'); void ico.getBoundingClientRect(); ico.classList.add('aa-anim');
  }
  document.addEventListener('animationend', function (ev) {
    var t = ev.target; if (t && t.classList && t.classList.contains('aa-anim') && /^aa-/.test(ev.animationName)) t.classList.remove('aa-anim');
  }, true);
  document.addEventListener('pointerover', function (ev) {
    if (ev.pointerType !== 'mouse') return;
    var b = boton(ev.target); if (!b || (ev.relatedTarget && b.contains(ev.relatedTarget))) return;
    animar(b);
  }, { passive: true });
  document.addEventListener('pointerdown', function (ev) { animar(boton(ev.target)); }, { passive: true });
  window.ADORNO_ANIM = { animar: animar };
})();
