// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
//  version.js — (infra, 4-nov-2026, JP: "en la barra donde dice el nombre del módulo, la versión de cada módulo,
//  para saber si estoy corriendo la correcta o la vieja; en todo el sistema")
//  · Agrega " · v198" al título de la pestaña. El número sale del CACHE_VERSION del service-worker.js del módulo
//    (por eso cada publicación tiene que subir ese número).
//  · Se fija si hay publicada una versión más nueva que la que está abierta: compara la fecha de la página abierta
//    (document.lastModified) con la de la publicada (Last-Modified). Si la hay, el título dice " · v197 vieja" y
//    aparece abajo el cartel "Hay una versión nueva · Actualizar" (en el celular el título no se ve).
//  La cargan sola los módulos que usan /hub/seguridad.js; los demás con <script src="/hub/version.js" defer></script>.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
(function () {
  if (window.ADORNO_VERSION || !window.fetch) return;
  var base = location.pathname.replace(/[^\/]*$/, '');            // carpeta del módulo, ej. /compras-adorno/
  var abierta = Date.parse(document.lastModified) || 0;            // fecha de publicación de la página que está corriendo
  var CLAVE = 'adorno-versiones:' + base;                          // fecha de publicación → número, de lo ya visto
  var st = window.ADORNO_VERSION = { numero: null, vieja: false, nueva: null, revisar: revisar };
  var sufijo = '', ultima = 0, obs = null, tituloVigilado = null;

  function numeroDe(txt) { var m = /CACHE_VERSION\s*=\s*['"][^'"]*?v(\d+)/.exec(txt || ''); return m ? 'v' + m[1] : null; }
  function historial() { try { return JSON.parse(localStorage.getItem(CLAVE) || '{}') || {}; } catch (e) { return {}; } }
  function anotar(fecha, num) {
    if (!fecha || !num) return;
    try {
      var h = historial(); h[fecha] = num;
      var ks = Object.keys(h).sort(); while (ks.length > 12) delete h[ks.shift()];   // las últimas 12 alcanzan
      localStorage.setItem(CLAVE, JSON.stringify(h));
    } catch (e) {}
  }

  // ── el título: los módulos lo cambian solos (contadores, pestañas), así que se vuelve a poner el número cada vez ──
  var QUITAR = / · (v\d+( vieja)?|versión vieja)$/;
  function ponerTitulo() {
    if (!sufijo) return;
    var t = document.title.replace(QUITAR, '');
    if (document.title !== t + sufijo) document.title = t + sufijo;
    var el = document.querySelector('title');
    if (obs && el && el !== tituloVigilado) { tituloVigilado = el; obs.observe(el, { childList: true, characterData: true, subtree: true }); }
  }
  function vigilarTitulo() {
    if (obs || !window.MutationObserver || !document.head) return;
    obs = new MutationObserver(ponerTitulo);
    obs.observe(document.head, { childList: true });                // por si reemplazan el <title> entero
    ponerTitulo();
  }

  // ── el cartel de abajo, solo si la versión abierta es vieja ──
  function cartel(nueva) {
    if (document.getElementById('adorno-version-nueva') || !document.body) return;
    var css = document.createElement('style');
    css.textContent =
      '#adorno-version-nueva{position:fixed;z-index:99990;left:50%;transform:translateX(-50%);bottom:calc(18px + env(safe-area-inset-bottom,0px));' +
      'display:flex;align-items:center;gap:10px;max-width:calc(100vw - 32px);box-sizing:border-box;padding:8px 8px 8px 18px;border-radius:999px;' +
      'background:#1C1612;color:#F4EFE6;font:400 13px/1.3 Jost,system-ui,-apple-system,sans-serif;box-shadow:0 12px 30px -10px rgba(0,0,0,.45);' +
      'animation:avn-entra .35s ease-out both}' +
      '#adorno-version-nueva span{flex:1 1 auto;min-width:0}' +
      '#adorno-version-nueva button{font:inherit;border:0;cursor:pointer;border-radius:999px;-webkit-tap-highlight-color:transparent}' +
      '#adorno-version-nueva .avn-si{background:#D97757;color:#fff;font-weight:500;padding:8px 16px;white-space:nowrap}' +
      '#adorno-version-nueva .avn-no{background:transparent;color:#B9AC9C;width:30px;height:30px;font-size:16px;line-height:1}' +
      '@media (max-width:600px){#adorno-version-nueva{left:16px;right:92px;transform:none;max-width:none}}' +   // deja libre a Clodi
      '@keyframes avn-entra{from{opacity:0;translate:0 12px}}';
    document.head.appendChild(css);
    var d = document.createElement('div');
    d.id = 'adorno-version-nueva'; d.setAttribute('role', 'status');
    d.innerHTML = '<span>Hay una versión nueva' + (nueva ? ' (' + nueva + ')' : '') + '</span>' +
      '<button class="avn-si" type="button">Actualizar</button><button class="avn-no" type="button" aria-label="Cerrar">✕</button>';
    d.querySelector('.avn-si').onclick = function () { location.reload(); };
    d.querySelector('.avn-no').onclick = function () { d.remove(); };
    document.body.appendChild(d);
  }

  // ── la revisión: fecha publicada de esta página + número del service worker publicado ──
  function revisar() {
    if (navigator.onLine === false) return;
    ultima = Date.now();
    Promise.all([
      fetch(location.pathname, { method: 'HEAD', cache: 'no-store', credentials: 'same-origin' })
        .then(function (r) { return r.ok ? (Date.parse(r.headers.get('last-modified')) || 0) : 0; }).catch(function () { return 0; }),
      fetch(base + 'service-worker.js', { cache: 'no-cache', credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; })
    ]).then(function (res) {
      var publicada = res[0], numPub = numeroDe(res[1]);
      st.vieja = !!(abierta && publicada && publicada - abierta > 2000);
      if (!st.vieja) {
        st.numero = numPub; st.nueva = null;
        anotar(publicada || abierta, numPub);
        sufijo = numPub ? ' · ' + numPub : '';
      } else {
        st.numero = historial()[abierta] || null; st.nueva = numPub;
        sufijo = st.numero ? ' · ' + st.numero + ' vieja' : ' · versión vieja';
        anotar(publicada, numPub);
        // baja la nueva a la caché del navegador: así "Actualizar" la abre (si no, la caché de 10 min daba la vieja)
        fetch(location.pathname, { cache: 'reload', credentials: 'same-origin' }).catch(function () {})
          .then(function () { cartel(numPub); });
      }
      vigilarTitulo(); ponerTitulo();
    });
  }

  function arrancar() { setTimeout(revisar, 2500); }   // después de que el módulo termine de arrancar
  if (document.readyState === 'complete') arrancar(); else window.addEventListener('load', arrancar);
  document.addEventListener('visibilitychange', function () {   // al volver a una pestaña que quedó abierta
    if (!document.hidden && Date.now() - ultima > 300000) revisar();
  });
})();
