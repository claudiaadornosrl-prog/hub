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
    '.amfa-caja{background:var(--surface,#fff);color:var(--text,#1c1917);border:1px solid var(--border,#e7e5e4);max-width:380px;width:100%;padding:22px 20px;box-shadow:0 10px 40px rgba(0,0,0,.25);max-height:calc(100vh - 32px);overflow:auto}',
    '.amfa-caja h3{margin:0 0 8px;font-size:17px;font-weight:600}',
    '.amfa-caja p,.amfa-caja li{font-size:13px;line-height:1.45;color:var(--muted,#57534e);margin:0 0 10px}',
    '.amfa-caja ol{padding-left:18px;margin:0 0 6px}',
    '.amfa-qr{display:block;width:180px;height:180px;margin:6px auto 10px;background:#fff;padding:6px}',
    '.amfa-clave{font-family:ui-monospace,Consolas,monospace;font-size:12px;word-break:break-all;background:var(--bg,#f5f5f4);padding:6px 8px;display:block;margin:4px 0 12px;user-select:all}',
    '.amfa-link{font-size:13px;color:var(--text,#1c1917);text-decoration:underline;text-underline-offset:3px}',
    '.amfa-codigo{width:100%;box-sizing:border-box;font-size:24px;letter-spacing:8px;text-align:center;padding:10px;border:1px solid var(--border,#d6d3d1);background:var(--surface,#fff);color:var(--text,#1c1917);margin:4px 0 6px;font-family:ui-monospace,Consolas,monospace}',
    '.amfa-error{min-height:18px;font-size:12px;color:#b91c1c;margin-bottom:8px}',
    '.amfa-botones{display:flex;gap:10px;justify-content:flex-end}',
    '.amfa-botones button{font:inherit;font-size:14px;padding:9px 16px;border:1px solid var(--border,#d6d3d1);cursor:pointer;background:transparent;color:var(--text,#1c1917)}',
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

  async function nivelActual(sb) {
    var r = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    return (r.data && r.data.currentLevel) || 'aal1';
  }

  // true = puede seguir (no tiene el código activado, ya lo pasó, o lo acaba de ingresar); false = canceló
  async function pedirCodigo(sb) {
    var f;
    try {
      if (await nivelActual(sb) === 'aal2') return true;
      f = await factorVerificado(sb);
    } catch (e) { return true; }     // sin red no se traba el login: igual la base rechaza lo que falte
    if (!f) return true;
    return new Promise(function (listo) {
      var o = modal('<h3>Código del celular</h3>' +
        '<p>Abrí la app de autenticación del celular y escribí el código de 6 números de Claudia Adorno.</p>' + CAMPO +
        '<div class="amfa-botones"><button class="amfa-sec">Cancelar</button><button class="amfa-pri">Entrar</button></div>');
      o.querySelector('.amfa-sec').onclick = function () { o.remove(); listo(false); };
      atarCampo(o, function (c) { return sb.auth.mfa.challengeAndVerify({ factorId: f.id, code: c }); },
                function () { o.remove(); listo(true); });
    });
  }

  // Sesión guardada sin el código (la de antes de activarlo): la base ya la rechaza, así que se pide y se recarga.
  async function alCargar(sb) {
    try {
      var s = (await sb.auth.getSession()).data.session;
      if (!s || await nivelActual(sb) === 'aal2' || !(await factorVerificado(sb))) return;
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

  return { pedirCodigo: pedirCodigo, alCargar: alCargar, activo: activo, activar: activar, desactivar: desactivar };
})();
