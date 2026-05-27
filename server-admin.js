/**
 * server-admin.js — System Admin Panel (Express Router)
 *
 * Usage in server.cjs:
 *   const createAdminRouter = require('./server-admin');
 *   const adminRouter = createAdminRouter({ analytics, logs, dbConfig });
 *   server.use('/admin', adminRouter);
 *
 * All routes below are relative to the mount point (e.g. /admin).
 *
 * Public routes:
 *   GET  /login            Admin login page
 *   POST /api/login        Authenticate
 *
 * Protected routes (require admin cookie):
 *   GET  /                 Dashboard (uptime, memory, analytics)
 *   GET  /logs             Log viewer with filters
 *   GET  /health           Health check
 *   GET  /db               Database manager
 *   GET  /db/table/:name   Browse table records
 *   POST /api/logout       Clear admin session
 *   POST /api/logs/clear   Clear in-memory logs
 *   GET  /api/logs/export  Export logs as JSON
 *   GET  /api/logs         Logs as JSON
 *   GET  /api/db/stats     DB statistics JSON
 *   GET  /api/db/tables    Table list JSON
 *   GET  /api/db/table/:n  Table records JSON
 *   POST /api/db/query     Execute read-only SQL
 */

const express = require('express');
const crypto  = require('crypto');
const path    = require('path');
const fs      = require('fs');
const knex    = require('./config/knex');
require('dotenv').config();

// ─────────────────────────────────────────────────────────
//  Factory — call with shared dependencies from main server
// ─────────────────────────────────────────────────────────
module.exports = function createAdminRouter(deps = {}) {
  const {
    analytics = null,       // { visitors, users, totalRequests, dataTx, dataRx, endpointCalls, startTime }
    logs      = null,       // { entries: [], maxLogs: 500 }
    dbConfig  = {},         // { host, port, database, ... }
    getLogFilePath = null,  // function → current log file path on disk
  } = deps;

  const router  = express.Router();
  const SECRET  = process.env.ADMIN_SECRET || 'hostage-chess-admin-default-secret';
  const TOKEN_TTL = 24 * 60 * 60 * 1000; // 24 h
  const COOKIE  = '__admin_tok';

  // ───────────── Token helpers (HMAC-SHA256, no JWT dep) ─────────────

  function createToken(payload) {
    const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig  = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
    return `${data}.${sig}`;
  }

  function verifyToken(token) {
    if (!token || typeof token !== 'string') return null;
    const [data, sig] = token.split('.');
    if (!data || !sig) return null;
    const expected = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    try {
      const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
      if (Date.now() - payload.iat > TOKEN_TTL) return null;
      return payload;
    } catch { return null; }
  }

  function parseCookies(header) {
    const map = {};
    if (!header) return map;
    header.split(';').forEach(c => {
      const [k, ...v] = c.split('=');
      if (k) map[k.trim()] = v.join('=').trim();
    });
    return map;
  }

  // ───────────── Auth middleware ──────────────────────────

  function requireAdmin(req, res, next) {
    const cookies = parseCookies(req.headers.cookie);
    const payload = verifyToken(cookies[COOKIE]);
    if (payload && payload.role === 'admin') {
      req.adminUser = payload;
      return next();
    }
    // API routes get 401 JSON; page routes redirect to login
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Unauthorized — admin login required' });
    }
    return res.redirect(req.baseUrl + '/login');
  }

  // ───────────── Shared HTML layout ─────────────────────

  function escapeHtml(text) {
    if (typeof text !== 'string') text = String(text);
    return text.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]);
  }

  function adminLayout(title, activeNav, bodyContent) {
    const navItems = [
      { href: '',       icon: '📊', label: 'Dashboard' },
      { href: '/logs',  icon: '📋', label: 'Logs'      },
      { href: '/health',icon: '💚', label: 'Health'     },
    ];
    navItems.push({ href: '/db', icon: '🗄️', label: 'Database' });

    const navHtml = navItems.map(n => {
      const active = activeNav === n.href ? 'active' : '';
      return `<a class="nav-item ${active}" href="${'BASE_URL' + n.href}">${n.icon} ${n.label}</a>`;
    }).join('\n        ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — Admin</title>
  <style>
    :root {
      --bg:       #0f1117;
      --surface:  #1a1d27;
      --surface2: #242837;
      --border:   #2e3348;
      --accent:   #6c63ff;
      --accent2:  #4ecdc4;
      --text:     #e1e4ed;
      --text2:    #8b90a5;
      --red:      #ff6b6b;
      --orange:   #ffa34d;
      --green:    #4ecdc4;
      --blue:     #6c63ff;
      --radius:   10px;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
    }
    /* ─── Top nav ─── */
    .admin-topbar {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      padding: 0 24px;
      height: 56px;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .admin-topbar .brand {
      font-weight: 700;
      font-size: 1.1em;
      color: var(--accent);
      margin-right: 32px;
      text-decoration: none;
    }
    .admin-topbar .nav-item {
      color: var(--text2);
      text-decoration: none;
      padding: 16px 14px;
      font-size: 0.9em;
      transition: color .2s, border-bottom .2s;
      border-bottom: 2px solid transparent;
    }
    .admin-topbar .nav-item:hover { color: var(--text); }
    .admin-topbar .nav-item.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
    }
    .admin-topbar .spacer { flex: 1; }
    .admin-topbar .logout-btn {
      background: none;
      border: 1px solid var(--border);
      color: var(--text2);
      padding: 6px 14px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.85em;
      transition: all .2s;
    }
    .admin-topbar .logout-btn:hover {
      border-color: var(--red);
      color: var(--red);
    }
    /* ─── Main content ─── */
    .admin-main {
      max-width: 1400px;
      margin: 0 auto;
      padding: 28px 24px;
    }
    .page-title {
      font-size: 1.6em;
      font-weight: 700;
      margin-bottom: 24px;
    }
    /* ─── Cards ─── */
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 22px;
      margin-bottom: 20px;
    }
    .card h3 {
      color: var(--accent2);
      font-size: 0.8em;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 12px;
    }
    .card .big-value {
      font-size: 2em;
      font-weight: 700;
    }
    .card .sub-label {
      color: var(--text2);
      font-size: 0.85em;
      margin-top: 4px;
    }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
    @media (max-width: 900px) {
      .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
    }
    /* ─── Tables ─── */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9em;
    }
    th, td {
      text-align: left;
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
    }
    th {
      color: var(--text2);
      font-size: 0.8em;
      text-transform: uppercase;
      letter-spacing: .5px;
    }
    tr:hover td { background: var(--surface2); }
    /* ─── Buttons / inputs ─── */
    .btn {
      display: inline-block;
      padding: 8px 18px;
      border: none;
      border-radius: 6px;
      font-size: 0.9em;
      cursor: pointer;
      transition: opacity .2s;
      font-weight: 600;
      text-decoration: none;
    }
    .btn:hover { opacity: 0.85; }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-danger  { background: var(--red); color: #fff; }
    .btn-outline { background: none; border: 1px solid var(--border); color: var(--text); }
    input[type="text"], input[type="password"], input[type="number"],
    select, textarea {
      background: var(--surface2);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 0.9em;
      outline: none;
      transition: border-color .2s;
    }
    input:focus, select:focus, textarea:focus { border-color: var(--accent); }
    /* ─── Log entries ─── */
    .log-entry {
      padding: 8px 12px;
      border-left: 3px solid transparent;
      margin-bottom: 4px;
      border-radius: 4px;
      background: var(--surface2);
      font-family: 'Courier New', monospace;
      font-size: 0.82em;
      line-height: 1.6;
    }
    .log-entry.info  { border-left-color: var(--green); }
    .log-entry.error { border-left-color: var(--red); }
    .log-entry.warn  { border-left-color: var(--orange); }
    .log-time  { color: var(--text2); font-size: 0.85em; margin-right: 8px; }
    .log-badge {
      display: inline-block;
      padding: 1px 7px;
      border-radius: 3px;
      font-size: 0.75em;
      font-weight: 700;
      text-transform: uppercase;
      margin-right: 8px;
    }
    .log-badge.info  { background: var(--blue); color: #fff; }
    .log-badge.error { background: var(--red); color: #fff; }
    .log-badge.warn  { background: var(--orange); color: #1e1e1e; }
    .controls-bar {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 20px;
    }
    .controls-bar label { color: var(--text2); font-size: 0.85em; }
    /* ─── Status dot ─── */
    .dot {
      display: inline-block;
      width: 10px; height: 10px;
      border-radius: 50%;
      margin-right: 6px;
    }
    .dot-green  { background: var(--green); }
    .dot-red    { background: var(--red); }
    .dot-orange { background: var(--orange); }
  </style>
</head>
<body>
  <div class="admin-topbar">
    <a class="brand" href="BASE_URL">🔧 Admin</a>
    ${navHtml}
    <span class="spacer"></span>
    <button class="logout-btn" onclick="fetch('BASE_URL/api/logout',{method:'POST'}).then(()=>location.href='BASE_URL/login')">Logout</button>
  </div>
  <div class="admin-main">
    ${bodyContent}
  </div>
</body>
</html>`.replace(/BASE_URL/g, '{{BASE}}');
  }

  // The actual base URL gets injected per-request
  function render(req, res, title, activeNav, bodyContent) {
    const html = adminLayout(title, activeNav, bodyContent)
      .replace(/\{\{BASE\}\}/g, req.baseUrl);
    res.type('html').send(html);
  }

  // ═══════════════════════════════════════════════════════
  //  PUBLIC ROUTES (no auth required)
  // ═══════════════════════════════════════════════════════

  // ── Login page ──
  router.get('/login', (req, res) => {
    // If already authenticated, redirect to dashboard
    const cookies = parseCookies(req.headers.cookie);
    const payload = verifyToken(cookies[COOKIE]);
    if (payload && payload.role === 'admin') {
      return res.redirect(req.baseUrl + '/');
    }

    res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Login</title>
  <style>
    :root { --bg: #0f1117; --surface: #1a1d27; --border: #2e3348; --accent: #6c63ff; --text: #e1e4ed; --text2: #8b90a5; --red: #ff6b6b; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .login-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 40px 36px;
      width: 100%;
      max-width: 400px;
      text-align: center;
    }
    .login-card h1 { font-size: 1.8em; margin-bottom: 6px; }
    .login-card .sub { color: var(--text2); font-size: 0.9em; margin-bottom: 28px; }
    .login-card input {
      width: 100%;
      padding: 12px 14px;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--text);
      border-radius: 8px;
      font-size: 1em;
      margin-bottom: 16px;
      outline: none;
      transition: border-color .2s;
    }
    .login-card input:focus { border-color: var(--accent); }
    .login-card button {
      width: 100%;
      padding: 12px;
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 1em;
      font-weight: 600;
      cursor: pointer;
      transition: opacity .2s;
    }
    .login-card button:hover { opacity: 0.88; }
    .error-msg { color: var(--red); font-size: 0.85em; margin-bottom: 12px; display: none; }
  </style>
</head>
<body>
  <div class="login-card">
    <h1>🔧 Admin</h1>
    <p class="sub">System administration panel</p>
    <div class="error-msg" id="err"></div>
    <input type="password" id="pwd" placeholder="Admin password" autofocus
           onkeydown="if(event.key==='Enter') doLogin()">
    <button onclick="doLogin()">Sign In</button>
  </div>
  <script>
    async function doLogin() {
      const pwd = document.getElementById('pwd').value;
      const err = document.getElementById('err');
      err.style.display = 'none';
      try {
        const r = await fetch('${req.baseUrl}/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pwd })
        });
        const data = await r.json();
        if (r.ok) {
          location.href = '${req.baseUrl}/';
        } else {
          err.textContent = data.error || 'Invalid password';
          err.style.display = 'block';
        }
      } catch(e) {
        err.textContent = 'Network error';
        err.style.display = 'block';
      }
    }
  </script>
</body>
</html>`);
  });

  // ── Login API ──
  router.post('/api/login', express.json(), (req, res) => {
    const { password } = req.body || {};
    if (!password || password !== SECRET) {
      return res.status(401).json({ error: 'Invalid admin password' });
    }
    const token = createToken({ role: 'admin', iat: Date.now() });
    res.setHeader('Set-Cookie',
      `${COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${TOKEN_TTL / 1000}; SameSite=Lax`);
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════
  //  PROTECTED ROUTES (all require admin auth)
  // ═══════════════════════════════════════════════════════
  router.use(requireAdmin);

  // ── Logout API ──
  router.post('/api/logout', (req, res) => {
    res.setHeader('Set-Cookie',
      `${COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
    res.json({ ok: true });
  });

  // ══════════════════════════════════════════════
  //  PAGE: Dashboard
  // ══════════════════════════════════════════════
  router.get('/', (req, res) => {
    const uptime = process.uptime();
    const up = {
      d: Math.floor(uptime / 86400),
      h: Math.floor((uptime % 86400) / 3600),
      m: Math.floor((uptime % 3600) / 60),
      s: Math.floor(uptime % 60),
    };
    const mem = process.memoryUsage();
    const fmt = (b) => `${Math.round(b / 1024 / 1024)} MB`;

    const a = analytics || { visitors: new Set(), users: new Set(), totalRequests: 0, dataTx: 0, dataRx: 0, endpointCalls: {} };

    const topEndpoints = Object.entries(a.endpointCalls)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 20)
      .map(([ep, count]) => {
        const [method, ...p] = ep.split(' ');
        const cls = method.toLowerCase();
        return `<tr><td><span class="log-badge ${cls === 'get' ? 'info' : cls === 'post' ? '' : cls === 'delete' ? 'error' : 'warn'}" style="background:${
          cls === 'get' ? '#61affe' : cls === 'post' ? '#49cc90' : cls === 'delete' ? '#f93e3e' : '#fca130'
        }">${escapeHtml(method)}</span> ${escapeHtml(p.join(' '))}</td><td>${count}</td></tr>`;
      }).join('');

    render(req, res, 'Dashboard', '', `
      <h1 class="page-title">📊 Dashboard</h1>
      <div class="grid-4">
        <div class="card">
          <h3>⏱️ Uptime</h3>
          <div class="big-value">${up.d}d ${up.h}h ${up.m}m</div>
          <div class="sub-label">${Math.floor(uptime).toLocaleString()} seconds</div>
        </div>
        <div class="card">
          <h3>💾 Heap Used</h3>
          <div class="big-value">${fmt(mem.heapUsed)}</div>
          <div class="sub-label">of ${fmt(mem.heapTotal)} heap</div>
        </div>
        <div class="card">
          <h3>📊 Requests</h3>
          <div class="big-value">${a.totalRequests.toLocaleString()}</div>
          <div class="sub-label">since start</div>
        </div>
        <div class="card">
          <h3>👥 Visitors</h3>
          <div class="big-value">${a.visitors.size}</div>
          <div class="sub-label">unique IPs</div>
        </div>
      </div>

      <div class="grid-3">
        <div class="card">
          <h3>👤 Users</h3>
          <div class="big-value">${a.users.size}</div>
          <div class="sub-label">accounts touched</div>
        </div>
        <div class="card">
          <h3>📤 TX</h3>
          <div class="big-value">${(a.dataTx / 1024 / 1024).toFixed(2)} MB</div>
          <div class="sub-label">data transmitted</div>
        </div>
        <div class="card">
          <h3>📥 RX</h3>
          <div class="big-value">${(a.dataRx / 1024 / 1024).toFixed(2)} MB</div>
          <div class="sub-label">data received</div>
        </div>
      </div>

      <div class="card">
        <h3>🌐 Environment</h3>
        <table>
          <tr><td>Node</td><td>${process.version}</td></tr>
          <tr><td>Env</td><td>${process.env.NODE_ENV || 'development'}</td></tr>
          <tr><td>RSS</td><td>${fmt(mem.rss)}</td></tr>
          <tr><td>External</td><td>${fmt(mem.external)}</td></tr>
          <tr><td>Platform</td><td>${process.platform} ${process.arch}</td></tr>
          <tr><td>PID</td><td>${process.pid}</td></tr>
        </table>
      </div>

      ${topEndpoints ? `
      <div class="card">
        <h3>🛣️ Top Endpoints</h3>
        <table>
          <thead><tr><th>Endpoint</th><th>Calls</th></tr></thead>
          <tbody>${topEndpoints}</tbody>
        </table>
      </div>` : ''}

      <script>setTimeout(()=>location.reload(), 30000);</script>
    `);
  });

  // ══════════════════════════════════════════════
  //  PAGE: Logs
  // ══════════════════════════════════════════════
  router.get('/logs', (req, res) => {
    const logStore = logs || { entries: [] };
    const type  = req.query.type || 'all';
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);

    let filtered = logStore.entries;
    if (type !== 'all') filtered = filtered.filter(l => l.type === type);
    const display = filtered.slice(-limit).reverse();

    const counts = {
      all:   logStore.entries.length,
      info:  logStore.entries.filter(l => l.type === 'info').length,
      warn:  logStore.entries.filter(l => l.type === 'warn').length,
      error: logStore.entries.filter(l => l.type === 'error').length,
    };

    const logRows = display.length === 0
      ? '<div style="text-align:center;padding:40px;color:var(--text2)">No logs to display</div>'
      : display.map(l => `
        <div class="log-entry ${l.type}">
          <span class="log-time">${new Date(l.timestamp).toLocaleString()}</span>
          <span class="log-badge ${l.type}">${l.type}</span>
          <span>${escapeHtml(l.message)}</span>
        </div>`).join('');

    render(req, res, 'Logs', '/logs', `
      <h1 class="page-title">📋 Server Logs</h1>

      <div class="grid-4" style="margin-bottom:20px">
        <div class="card"><h3>Total</h3><div class="big-value">${counts.all}</div></div>
        <div class="card"><h3>Info</h3><div class="big-value" style="color:var(--green)">${counts.info}</div></div>
        <div class="card"><h3>Warnings</h3><div class="big-value" style="color:var(--orange)">${counts.warn}</div></div>
        <div class="card"><h3>Errors</h3><div class="big-value" style="color:var(--red)">${counts.error}</div></div>
      </div>

      <div class="controls-bar">
        <label>Filter:</label>
        <select id="typeFilter" onchange="applyFilter()">
          <option value="all" ${type === 'all' ? 'selected' : ''}>All</option>
          <option value="info" ${type === 'info' ? 'selected' : ''}>Info</option>
          <option value="warn" ${type === 'warn' ? 'selected' : ''}>Warnings</option>
          <option value="error" ${type === 'error' ? 'selected' : ''}>Errors</option>
        </select>
        <label>Limit:</label>
        <input type="number" id="limitInput" value="${limit}" min="10" max="500" step="10" style="width:80px" onchange="applyFilter()">
        <label><input type="checkbox" id="autoRef" onchange="toggleAuto()"> Auto-refresh 5 s</label>
        <button class="btn btn-outline" onclick="location.reload()">🔄 Refresh</button>
        <button class="btn btn-danger" onclick="clearLogs()">🗑️ Clear</button>
        <button class="btn btn-outline" onclick="exportLogs()">📥 Export</button>
      </div>

      <div class="card" style="max-height:60vh;overflow-y:auto;padding:12px" id="logBox">
        ${logRows}
      </div>

      <script>
        let _auto;
        function applyFilter(){
          const t=document.getElementById('typeFilter').value;
          const l=document.getElementById('limitInput').value;
          location.href='${req.baseUrl}/logs?type='+t+'&limit='+l;
        }
        function toggleAuto(){
          const c=document.getElementById('autoRef');
          if(c.checked) _auto=setInterval(()=>location.reload(),5000);
          else clearInterval(_auto);
        }
        function clearLogs(){
          if(!confirm('Clear all logs?')) return;
          fetch('${req.baseUrl}/api/logs/clear',{method:'POST'}).then(()=>location.reload());
        }
        function exportLogs(){
          fetch('${req.baseUrl}/api/logs/export').then(r=>r.json()).then(d=>{
            const b=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});
            const a=document.createElement('a');
            a.href=URL.createObjectURL(b);
            a.download='logs-'+new Date().toISOString()+'.json';
            a.click();
          });
        }
        document.getElementById('logBox').scrollTop=document.getElementById('logBox').scrollHeight;
      </script>
    `);
  });

  // ── Log APIs ──
  router.post('/api/logs/clear', (req, res) => {
    if (logs) logs.entries = [];
    res.json({ ok: true, message: 'Logs cleared' });
  });

  router.get('/api/logs/export', (req, res) => {
    const logStore = logs || { entries: [] };
    res.json({ exportDate: new Date().toISOString(), total: logStore.entries.length, logs: logStore.entries });
  });

  router.get('/api/logs', (req, res) => {
    const logStore = logs || { entries: [] };
    const type  = req.query.type || 'all';
    const limit = parseInt(req.query.limit) || 100;
    let filtered = logStore.entries;
    if (type !== 'all') filtered = filtered.filter(l => l.type === type);
    res.json({ total: filtered.length, logs: filtered.slice(-limit).reverse() });
  });

  // ── Log file endpoint (raw on-disk log) ──
  router.get('/api/logs/file', (req, res) => {
    const filePath = typeof getLogFilePath === 'function' ? getLogFilePath() : null;
    if (!filePath) return res.status(404).json({ error: 'Log file path not configured' });
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) return res.status(500).json({ error: 'Failed to read log file' });
      res.type('text/plain').send(data);
    });
  });

  // ══════════════════════════════════════════════
  //  PAGE: Health
  // ══════════════════════════════════════════════
  router.get('/health', async (req, res) => {
    const uptime = process.uptime();
    const up = {
      d: Math.floor(uptime / 86400),
      h: Math.floor((uptime % 86400) / 3600),
      m: Math.floor((uptime % 3600) / 60),
      s: Math.floor(uptime % 60),
    };
    const mem = process.memoryUsage();
    const fmt = (b) => `${Math.round(b / 1024 / 1024)} MB`;

    let dbStatus = 'Not configured';
    let dbClass  = 'dot-orange';
    try {
      await knex.raw('SELECT 1');
      dbStatus = 'Connected';
      dbClass  = 'dot-green';
    } catch (e) {
      dbStatus = 'Error: ' + e.message;
      dbClass  = 'dot-red';
    }

    render(req, res, 'Health', '/health', `
      <h1 class="page-title">💚 Health Check</h1>
      <div class="grid-2">
        <div class="card">
          <h3>Server Status</h3>
          <div style="display:flex;align-items:center;gap:8px;margin:12px 0">
            <span class="dot dot-green"></span>
            <span class="big-value" style="font-size:1.4em">Healthy</span>
          </div>
          <table>
            <tr><td>Uptime</td><td>${up.d}d ${up.h}h ${up.m}m ${up.s}s</td></tr>
            <tr><td>Environment</td><td>${process.env.NODE_ENV || 'development'}</td></tr>
            <tr><td>Node</td><td>${process.version}</td></tr>
            <tr><td>Platform</td><td>${process.platform} ${process.arch}</td></tr>
            <tr><td>PID</td><td>${process.pid}</td></tr>
          </table>
        </div>
        <div class="card">
          <h3>Resources</h3>
          <table>
            <tr><td>Heap Used</td><td>${fmt(mem.heapUsed)}</td></tr>
            <tr><td>Heap Total</td><td>${fmt(mem.heapTotal)}</td></tr>
            <tr><td>RSS</td><td>${fmt(mem.rss)}</td></tr>
            <tr><td>External</td><td>${fmt(mem.external)}</td></tr>
          </table>
        </div>
      </div>
      <div class="card">
        <h3>Database</h3>
        <div style="display:flex;align-items:center;gap:8px;margin:12px 0">
          <span class="dot ${dbClass}"></span>
          <span style="font-size:1.1em;font-weight:600">${escapeHtml(dbStatus)}</span>
        </div>
        <table>
          <tr><td>Host</td><td>${escapeHtml(dbConfig.host || 'localhost')}</td></tr>
          <tr><td>Port</td><td>${dbConfig.port || 3306}</td></tr>
          <tr><td>Database</td><td>${escapeHtml(dbConfig.database || '—')}</td></tr>
        </table>
      </div>
      <div style="text-align:center;color:var(--text2);margin-top:24px;font-size:0.85em">
        Last checked: ${new Date().toISOString()}
      </div>
      <script>setTimeout(()=>location.reload(), 30000);</script>
    `);
  });

  // ══════════════════════════════════════════════
  //  PAGE: Database Manager
  // ══════════════════════════════════════════════
  router.get('/db', async (req, res) => {
    try {
      const [sizeRes]  = await knex.raw(`SELECT ROUND(SUM(data_length + index_length)/1024/1024, 2) AS size_mb FROM information_schema.TABLES WHERE table_schema = ?`, [dbConfig.database]);
      const [tableRes] = await knex.raw(`SELECT COUNT(*) as count FROM information_schema.TABLES WHERE table_schema = ?`, [dbConfig.database]);
      const [connRes]  = await knex.raw(`SELECT COUNT(*) as count FROM information_schema.PROCESSLIST WHERE DB = ?`, [dbConfig.database]);

      const [tables] = await knex.raw(`
          SELECT table_name, table_rows, ROUND((data_length+index_length)/1024/1024, 2) AS size_mb, engine
          FROM information_schema.TABLES WHERE table_schema = ? ORDER BY table_name`, [dbConfig.database]);

        const tableRows = tables.map(t => `
          <tr>
            <td><a href="${req.baseUrl}/db/table/${encodeURIComponent(t.table_name)}" style="color:var(--accent);text-decoration:none">${escapeHtml(t.table_name)}</a></td>
            <td>${t.table_rows}</td>
            <td>${t.size_mb} MB</td>
            <td>${escapeHtml(t.engine || '—')}</td>
          </tr>`).join('');

        render(req, res, 'Database', '/db', `
          <h1 class="page-title">🗄️ Database Manager</h1>
          <div class="grid-3" style="margin-bottom:20px">
            <div class="card"><h3>Size</h3><div class="big-value">${(sizeRes[0] || {}).size_mb || 0} MB</div></div>
            <div class="card"><h3>Tables</h3><div class="big-value">${(tableRes[0] || {}).count || 0}</div></div>
            <div class="card"><h3>Connections</h3><div class="big-value">${(connRes[0] || {}).count || 0}</div></div>
          </div>
          <div class="card">
            <h3>Tables in ${escapeHtml(dbConfig.database)}</h3>
            <table>
              <thead><tr><th>Name</th><th>Rows</th><th>Size</th><th>Engine</th></tr></thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>
          <div class="card">
            <h3>🔍 Run Query (read-only)</h3>
            <textarea id="sql" rows="3" style="width:100%;resize:vertical;font-family:monospace" placeholder="SELECT * FROM users LIMIT 10"></textarea>
            <button class="btn btn-primary" style="margin-top:8px" onclick="runQuery()">Execute</button>
            <div id="queryResult" style="margin-top:12px;overflow-x:auto"></div>
          </div>
          <script>
            async function runQuery(){
              const sql=document.getElementById('sql').value.trim();
              if(!sql) return;
              const r=await fetch('${req.baseUrl}/api/db/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:sql})});
              const d=await r.json();
              const el=document.getElementById('queryResult');
              if(!r.ok){ el.innerHTML='<div style="color:var(--red)">'+d.error+': '+(d.message||'')+'</div>'; return; }
              if(!d.results||!d.results.length){ el.innerHTML='<div style="color:var(--text2)">No results</div>'; return; }
              const cols=Object.keys(d.results[0]);
              let html='<div style="font-size:0.8em;color:var(--text2);margin-bottom:6px">'+d.rowCount+' row(s)</div>';
              html+='<table><thead><tr>'+cols.map(c=>'<th>'+c+'</th>').join('')+'</tr></thead><tbody>';
              d.results.forEach(row=>{html+='<tr>'+cols.map(c=>'<td>'+(row[c]===null?'<span style=color:var(--text2)>NULL</span>':row[c])+'</td>').join('')+'</tr>';});
              html+='</tbody></table>';
              el.innerHTML=html;
            }
          </script>
        `);
      } catch (err) {
        render(req, res, 'Database Error', '/db', `<div class="card"><h3>Error</h3><p style="color:var(--red)">${escapeHtml(err.message)}</p></div>`);
      }
  });

  // ── Table browser ──
  router.get('/db/table/:tableName', async (req, res) => {
    const { tableName } = req.params;
    const limit  = Math.min(parseInt(req.query.limit) || 50, 500);
    const offset = parseInt(req.query.offset) || 0;
    const search = req.query.search || '';

    try {
      // Validate table exists in the target schema
      const [chk] = await knex.raw(
        `SELECT table_name FROM information_schema.TABLES WHERE table_schema = ? AND table_name = ?`,
        [dbConfig.database, tableName]);
      if (chk.length === 0) {
        return render(req, res, 'Not Found', '/db', `<div class="card"><h3>Table not found</h3></div>`);
      }

      // Count + fetch (table name validated above; backtick-quoted for safety)
      let countQ = `SELECT COUNT(*) as total FROM \`${tableName}\``;
      let dataQ  = `SELECT * FROM \`${tableName}\``;
      const params = [];

      if (search) {
        const [cols] = await knex.raw(
          `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE table_schema = ? AND table_name = ?`,
          [dbConfig.database, tableName]);
        const cond = cols.map(c => `\`${c.COLUMN_NAME}\` LIKE ?`).join(' OR ');
        const sp   = cols.map(() => `%${search}%`);
        countQ += ` WHERE ${cond}`;
        dataQ  += ` WHERE ${cond}`;
        params.push(...sp);
      }

      const [countRes] = await knex.raw(countQ, params);
      const total = countRes[0].total;
      dataQ += ` LIMIT ? OFFSET ?`;
      const [records] = await knex.raw(dataQ, [...params, limit, offset]);

        const cols = records.length ? Object.keys(records[0]) : [];
        const headerCells = cols.map(c => `<th>${escapeHtml(c)}</th>`).join('');
        const bodyRows = records.map(row =>
          '<tr>' + cols.map(c => `<td>${row[c] === null ? '<span style="color:var(--text2)">NULL</span>' : escapeHtml(String(row[c]).substring(0, 200))}</td>`).join('') + '</tr>'
        ).join('');

        const prevOffset = Math.max(0, offset - limit);
        const nextOffset = offset + limit;
        const hasPrev = offset > 0;
        const hasNext = nextOffset < total;

        render(req, res, tableName, '/db', `
          <h1 class="page-title"><a href="${req.baseUrl}/db" style="color:var(--text2);text-decoration:none">Database</a> / ${escapeHtml(tableName)}</h1>

          <div class="controls-bar">
            <label>Search:</label>
            <input type="text" id="searchInput" value="${escapeHtml(search)}" placeholder="Search all columns…" style="width:240px"
                   onkeydown="if(event.key==='Enter') applySearch()">
            <button class="btn btn-outline" onclick="applySearch()">Search</button>
            <span style="color:var(--text2);font-size:0.85em">${total} record(s) total · showing ${offset + 1}–${Math.min(offset + limit, total)}</span>
          </div>

          <div class="card" style="overflow-x:auto">
            <table>
              <thead><tr>${headerCells}</tr></thead>
              <tbody>${bodyRows || '<tr><td colspan="99" style="text-align:center;color:var(--text2)">No records</td></tr>'}</tbody>
            </table>
          </div>

          <div style="display:flex;gap:12px;justify-content:center;margin-top:12px">
            ${hasPrev ? `<a class="btn btn-outline" href="${req.baseUrl}/db/table/${encodeURIComponent(tableName)}?limit=${limit}&offset=${prevOffset}&search=${encodeURIComponent(search)}">← Prev</a>` : ''}
            ${hasNext ? `<a class="btn btn-outline" href="${req.baseUrl}/db/table/${encodeURIComponent(tableName)}?limit=${limit}&offset=${nextOffset}&search=${encodeURIComponent(search)}">Next →</a>` : ''}
          </div>

          <script>
            function applySearch(){
              const s=document.getElementById('searchInput').value;
              location.href='${req.baseUrl}/db/table/${encodeURIComponent(tableName)}?search='+encodeURIComponent(s)+'&limit=${limit}';
            }
          </script>
        `);
      } catch (err) {
        render(req, res, 'Error', '/db', `<div class="card"><h3>Error</h3><p style="color:var(--red)">${escapeHtml(err.message)}</p></div>`);
      }
  });

  // ── DB API endpoints ──
  router.get('/api/db/stats', async (req, res) => {
    try {
      const [sizeRes]  = await knex.raw(`SELECT ROUND(SUM(data_length+index_length)/1024/1024, 2) AS size_mb FROM information_schema.TABLES WHERE table_schema = ?`, [dbConfig.database]);
      const [tableRes] = await knex.raw(`SELECT COUNT(*) as count FROM information_schema.TABLES WHERE table_schema = ?`, [dbConfig.database]);
      const [connRes]  = await knex.raw(`SELECT COUNT(*) as count FROM information_schema.PROCESSLIST WHERE DB = ?`, [dbConfig.database]);
      const [tables]   = await knex.raw(`SELECT table_name, table_rows, ROUND((data_length+index_length)/1024/1024,2) AS size_mb, engine, table_collation FROM information_schema.TABLES WHERE table_schema = ? ORDER BY table_name`, [dbConfig.database]);

      res.json({
        databaseSize: (sizeRes[0] || {}).size_mb,
        totalTables: (tableRes[0] || {}).count,
        activeConnections: (connRes[0] || {}).count,
        tables,
        databaseName: dbConfig.database,
        host: dbConfig.host,
        port: dbConfig.port,
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to retrieve database statistics', message: err.message });
    }
  });

  router.get('/api/db/tables', async (req, res) => {
    try {
      const [tables] = await knex.raw(`
          SELECT table_name as name, table_rows as \`rows\`, ROUND((data_length+index_length)/1024/1024,2) AS size, engine, create_time, update_time
          FROM information_schema.TABLES WHERE table_schema = ? ORDER BY table_name`, [dbConfig.database]);
      res.json({ tables: tables.map(t => ({ ...t, size: `${t.size} MB` })) });
    } catch (err) {
      res.status(500).json({ error: 'Failed to retrieve tables', message: err.message });
    }
  });

  router.get('/api/db/table/:tableName', async (req, res) => {
    try {
      const { tableName } = req.params;
      const limit  = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;
      const search = req.query.search || '';

      const [chk] = await knex.raw(
        `SELECT table_name FROM information_schema.TABLES WHERE table_schema = ? AND table_name = ?`,
        [dbConfig.database, tableName]);
      if (chk.length === 0) return res.status(404).json({ error: 'Table not found' });

      let countQ = `SELECT COUNT(*) as total FROM \`${tableName}\``;
      let dataQ  = `SELECT * FROM \`${tableName}\``;
      const params = [];

      if (search) {
        const [cols] = await knex.raw(
          `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE table_schema = ? AND table_name = ?`,
          [dbConfig.database, tableName]);
        const cond = cols.map(c => `\`${c.COLUMN_NAME}\` LIKE ?`).join(' OR ');
        const sp   = cols.map(() => `%${search}%`);
        countQ += ` WHERE ${cond}`;
        dataQ  += ` WHERE ${cond}`;
        params.push(...sp);
      }

      const [countRes] = await knex.raw(countQ, params);
      dataQ += ` LIMIT ? OFFSET ?`;
      const [records] = await knex.raw(dataQ, [...params, limit, offset]);

      res.json({ records, total: countRes[0].total, limit, offset });
    } catch (err) {
      res.status(500).json({ error: 'Failed to retrieve records', message: err.message });
    }
  });

  router.post('/api/db/query', express.json(), async (req, res) => {
    try {
      const { query } = req.body;
      if (!query) return res.status(400).json({ error: 'Query is required' });

      const trimmed = query.trim().toUpperCase();
      if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('SHOW') && !trimmed.startsWith('DESCRIBE')) {
        return res.status(403).json({ error: 'Only SELECT, SHOW, and DESCRIBE queries are allowed' });
      }

      const [results] = await knex.raw(query);
      res.json({ success: true, results, rowCount: results.length });
    } catch (err) {
      res.status(500).json({ error: 'Query execution failed', message: err.message });
    }
  });

  return router;
};
