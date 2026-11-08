/**
 * InsureClub Supabase sign-in
 * Shared by the Netlify portal (site/) and the Android app (android/.../assets/).
 *
 * The CRM tables only allow signed-in advisors listed in public.crm_members, so the
 * public project key on its own cannot read or change any customer data. This module:
 *   - signs the advisor in with Supabase Auth (email + password)
 *   - stores and refreshes the session in localStorage (never inside the app's data/backups)
 *   - swaps the "Bearer <project key>" header on every request to <project>/rest/v1/
 *     for the advisor's own access token, so the existing sync code keeps working.
 */
(function () {
  'use strict';

  const PROJECT_URL = 'https://pzezoumopzwczakpsdlk.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_M6hWtVUT1bwaAkV2Ma6VKw_OzToQzvz';
  const SESSION_KEY = 'insureclub_supabase_session_v1';
  const REFRESH_MARGIN_SECONDS = 60;

  const nativeFetch = window.fetch.bind(window);
  let session = null;
  let refreshing = null;

  try {
    session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    session = null;
  }

  function saveSession(next) {
    session = next;
    try {
      if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      else localStorage.removeItem(SESSION_KEY);
    } catch {}
    window.dispatchEvent(new CustomEvent('insureclub-auth-changed', { detail: { signedIn: Boolean(next), email: next?.email || null } }));
    renderMounts();
  }

  function fromTokenResponse(data) {
    const now = Math.floor(Date.now() / 1000);
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at || now + Number(data.expires_in || 3600),
      email: data.user?.email || session?.email || null
    };
  }

  async function tokenRequest(grantType, body) {
    const res = await nativeFetch(`${PROJECT_URL}/auth/v1/token?grant_type=${grantType}`, {
      method: 'POST',
      headers: { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.error_description || data.msg || data.message || `Sign-in failed (${res.status})`;
      const err = new Error(/invalid login credentials/i.test(msg) ? 'Wrong email or password.' : msg);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function signIn(email, password) {
    const data = await tokenRequest('password', { email: String(email || '').trim(), password: String(password || '') });
    saveSession(fromTokenResponse(data));
    return session;
  }

  async function refresh() {
    if (!session?.refresh_token) return null;
    if (!refreshing) {
      refreshing = tokenRequest('refresh_token', { refresh_token: session.refresh_token })
        .then(data => {
          saveSession(fromTokenResponse(data));
          return session;
        })
        .catch(err => {
          // A rejected refresh token means the session is over; keep it on network errors.
          if (err.status === 400 || err.status === 401) saveSession(null);
          throw err;
        })
        .finally(() => { refreshing = null; });
    }
    return refreshing;
  }

  async function accessToken() {
    if (!session) return null;
    const now = Math.floor(Date.now() / 1000);
    if (session.expires_at - REFRESH_MARGIN_SECONDS <= now) {
      await refresh();
    }
    return session?.access_token || null;
  }

  async function signOut() {
    const token = session?.access_token;
    saveSession(null);
    if (token) {
      nativeFetch(`${PROJECT_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${token}` }
      }).catch(() => {});
    }
  }

  // --- Request interceptor for <project>/rest/v1/ ---
  function requestUrl(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input.url === 'string') return input.url;
    return String(input || '');
  }

  window.fetch = async function insureClubFetch(input, init) {
    const url = requestUrl(input);
    if (!url.startsWith(`${PROJECT_URL}/rest/v1/`)) {
      return nativeFetch(input, init);
    }
    const token = await accessToken().catch(() => null);
    if (!token) {
      const err = new Error('Sign in to sync with InsureClub cloud.');
      err.code = 'NOT_SIGNED_IN';
      throw err;
    }
    const headers = new Headers((init && init.headers) || (input && input.headers) || {});
    headers.set('apikey', PUBLISHABLE_KEY);
    headers.set('Authorization', `Bearer ${token}`);
    const res = await nativeFetch(input, { ...(init || {}), headers });
    if (res.status === 401) {
      // Token was revoked or expired early: try one refresh, then retry once.
      const fresh = await refresh().catch(() => null);
      if (fresh?.access_token) {
        headers.set('Authorization', `Bearer ${fresh.access_token}`);
        return nativeFetch(input, { ...(init || {}), headers });
      }
    }
    return res;
  };

  // --- UI: inline account card + modal prompt ---
  const STYLE = `
    .icauth-card{display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid rgba(99,102,241,.25);border-radius:12px;background:rgba(99,102,241,.06);font:inherit;color:inherit}
    .icauth-card strong{font-size:13px}
    .icauth-card small{opacity:.75;font-size:11px;line-height:1.4}
    .icauth-card input{width:100%;box-sizing:border-box;padding:9px 10px;border-radius:8px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;font:inherit}
    .icauth-card button{padding:9px 12px;border-radius:8px;border:0;background:#4f46e5;color:#fff;font-weight:700;cursor:pointer;font:inherit}
    .icauth-card button.icauth-secondary{background:transparent;color:inherit;border:1px solid rgba(127,127,127,.4)}
    .icauth-card .icauth-error{color:#dc2626;font-size:11px;min-height:1em}
    .icauth-overlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(15,23,42,.55)}
    .icauth-overlay .icauth-card{max-width:360px;width:100%;background:#fff;color:#0f172a;box-shadow:0 20px 60px rgba(0,0,0,.3)}
    @media (prefers-color-scheme: dark){.icauth-overlay .icauth-card{background:#0f172a;color:#e2e8f0}}
  `;
  const mounts = new Set();
  let overlay = null;

  function ensureStyle() {
    if (document.getElementById('icauth-style')) return;
    const el = document.createElement('style');
    el.id = 'icauth-style';
    el.textContent = STYLE;
    document.head.appendChild(el);
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  }

  function cardHtml(withClose) {
    if (session) {
      return `<strong>☁ Cloud account</strong>
        <small>Signed in as <b>${escapeHtml(session.email || 'advisor')}</b>. Changes sync to InsureClub cloud.</small>
        <button type="button" class="icauth-secondary" data-icauth="signout">Sign out</button>`;
    }
    return `<strong>☁ Sign in to InsureClub cloud</strong>
      <small>Use the advisor login created in Supabase (Authentication → Users). Your data stays on this device until you sign in.</small>
      <input type="email" data-icauth="email" placeholder="Email" autocomplete="username">
      <input type="password" data-icauth="password" placeholder="Password" autocomplete="current-password">
      <div class="icauth-error" data-icauth="error"></div>
      <button type="button" data-icauth="signin">Sign in</button>
      ${withClose ? '<button type="button" class="icauth-secondary" data-icauth="close">Not now</button>' : ''}`;
  }

  function wireCard(card, withClose) {
    card.className = 'icauth-card';
    card.innerHTML = cardHtml(withClose);
    const q = sel => card.querySelector(`[data-icauth="${sel}"]`);
    q('signout')?.addEventListener('click', () => signOut());
    q('close')?.addEventListener('click', () => closePrompt());
    const submit = async () => {
      const btn = q('signin');
      const errBox = q('error');
      btn.disabled = true;
      btn.textContent = 'Signing in…';
      errBox.textContent = '';
      try {
        await signIn(q('email').value, q('password').value);
        closePrompt();
      } catch (err) {
        errBox.textContent = /failed to fetch|load failed|network/i.test(err.message) ? 'No internet connection.' : err.message;
        btn.disabled = false;
        btn.textContent = 'Sign in';
      }
    };
    q('signin')?.addEventListener('click', submit);
    q('password')?.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  }

  function renderMounts() {
    mounts.forEach(el => {
      if (!document.contains(el)) { mounts.delete(el); return; }
      wireCard(el, false);
    });
  }

  function mount(container) {
    if (!container) return;
    ensureStyle();
    const el = document.createElement('div');
    container.appendChild(el);
    mounts.add(el);
    wireCard(el, false);
  }

  function prompt() {
    if (session || overlay) return;
    ensureStyle();
    overlay = document.createElement('div');
    overlay.className = 'icauth-overlay';
    const card = document.createElement('div');
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    wireCard(card, true);
    card.querySelector('[data-icauth="email"]')?.focus();
  }

  function closePrompt() {
    overlay?.remove();
    overlay = null;
  }

  window.InsureClubAuth = {
    PROJECT_URL,
    PUBLISHABLE_KEY,
    isSignedIn: () => Boolean(session),
    email: () => session?.email || null,
    accessToken,
    signIn,
    signOut,
    mount,
    prompt
  };
})();
