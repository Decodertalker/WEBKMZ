/* Cliente del servidor de usuarios y ubicaciones (Supabase, solo con fetch) */
(function (g) {
  'use strict';
  const K_CFG = 'cajas.cloud.cfg', K_SES = 'cajas.cloud.session';
  const rd = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const wr = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };

  function normUrl(u) {
    u = String(u || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');
    if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
    return u;
  }
  let cfg = { url: normUrl((g.CAJAS_CLOUD || {}).url), key: String((g.CAJAS_CLOUD || {}).key || '').trim() };
  const saved = rd(K_CFG); if ((!cfg.url || !cfg.key) && saved && saved.url && saved.key) cfg = { url: normUrl(saved.url), key: String(saved.key).trim() };
  let ses = rd(K_SES);

  const MSG = {
    bad_credentials: 'Usuario o contraseña incorrectos', locked: 'Demasiados intentos. Espera 5 minutos e inténtalo otra vez',
    no_session: 'Tu sesión terminó. Entra de nuevo', forbidden: 'Solo el administrador puede hacer esto',
    username_taken: 'Ese usuario ya existe', bad_username: 'El usuario debe tener 3 a 30 letras, números, punto, guion o guion bajo (sin espacios)',
    bad_name: 'Escribe el nombre completo', weak_password: 'La contraseña es muy corta (mínimo 8 para la tuya, 6 para una inicial)',
    bad_items: 'Datos no válidos', cannot_delete_self: 'No puedes eliminar ni suspender tu propia cuenta', not_found: 'El usuario ya no existe', bad_location: 'Ubicación no válida',
    network: 'No hay conexión con el servidor. Revisa tu internet', config: 'Falta configurar el servidor'
  };
  const errText = e => MSG[e && e.code] || (e && e.message) || 'Error desconocido';

  async function rpc(fn, args, ms) {
    if (!cfg.url || !cfg.key) { const e = new Error(MSG.config); e.code = 'config'; throw e; }
    const h = { 'Content-Type': 'application/json', apikey: cfg.key };
    if (/^eyJ/.test(cfg.key)) h.Authorization = 'Bearer ' + cfg.key;
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), ms || 15000);
    let res;
    try { res = await fetch(cfg.url + '/rest/v1/rpc/' + fn, { method: 'POST', headers: h, body: JSON.stringify(args || {}), signal: ctl.signal }); }
    catch (e) { clearTimeout(tm); const er = new Error(MSG.network); er.code = 'network'; throw er; }
    clearTimeout(tm);
    const txt = await res.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) { }
    if (!res.ok) {
      const code = j && (j.message || j.hint) ? String(j.message).trim() : 'http_' + res.status;
      const er = new Error(MSG[code] || (j && j.message) || 'Error ' + res.status); er.code = code;
      if (code === 'no_session' && ses) { ses = null; wr(K_SES, null); if (api.onExpired) api.onExpired(); }
      throw er;
    }
    return j;
  }
  const tk = () => (ses ? ses.token : '');

  const api = {
    onExpired: null, errText,
    configured: () => !!(cfg.url && cfg.key),
    config: () => ({ url: cfg.url, key: cfg.key }),
    setConfig(url, key) { cfg = { url: normUrl(url), key: String(key || '').trim() }; wr(K_CFG, cfg); },
    clearConfig() { cfg = { url: normUrl((g.CAJAS_CLOUD || {}).url), key: String((g.CAJAS_CLOUD || {}).key || '').trim() }; wr(K_CFG, null); },
    session: () => ses,
    user: () => (ses ? ses.user : null),
    async login(u, p) {
      const r = await rpc('cj_login', { p_user: u, p_pass: p });
      if (r && r.error) { const e = new Error(MSG[r.error] || r.error); e.code = r.error; throw e; }
      ses = { token: r.token, user: r.user }; wr(K_SES, ses); return ses;
    },
    async me() { const u = await rpc('cj_me', { p_token: tk() }); if (ses) { ses.user = u; wr(K_SES, ses); } return u; },
    async logout() { const t = tk(); ses = null; wr(K_SES, null); if (t) { try { await rpc('cj_logout', { p_token: t }, 6000); } catch (e) { } } },
    async changePassword(o, n) { await rpc('cj_change_password', { p_token: tk(), p_old: o, p_new: n }); if (ses) { ses.user.must_change = false; wr(K_SES, ses); } },
    listUsers: () => rpc('cj_list_users', { p_token: tk() }),
    createUser: (username, name, code, role, pass) => rpc('cj_create_user', { p_token: tk(), p_username: username, p_name: name, p_code: code || '', p_role: role, p_pass: pass }),
    deleteUser: id => rpc('cj_delete_user', { p_token: tk(), p_id: id }),
    resetPassword: (id, pass) => rpc('cj_reset_password', { p_token: tk(), p_id: id, p_new: pass }),
    setActive: (id, on) => rpc('cj_set_active', { p_token: tk(), p_id: id, p_active: !!on }),
    sendLocation: (lat, lon, acc, speed) => rpc('cj_send_location', { p_token: tk(), p_lat: lat, p_lon: lon, p_acc: acc == null ? null : acc, p_speed: speed == null || !isFinite(speed) ? null : speed }, 10000),
    locations: () => rpc('cj_locations', { p_token: tk() }),
    pull: (ts, u, limit) => rpc('cj_pull', { p_token: tk(), p_ts: ts, p_u: u, p_limit: limit || 200 }, 40000),
    push: items => rpc('cj_push', { p_token: tk(), p_items: items }, 60000)
  };
  g.Cloud = api;
})(window);
