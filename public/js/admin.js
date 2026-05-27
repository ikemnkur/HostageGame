/* ─── Admin Dashboard ─────────────────────────────────── */

window.AdminPage = (() => {
  const STORAGE_KEY = 'hostage_admin_api_key';
  let lastReports = [];
  let lastFlags = [];

  function getSavedApiKey() {
    try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
  }

  function saveApiKey(value) {
    try { localStorage.setItem(STORAGE_KEY, value || ''); } catch {}
  }

  async function fetchAdminJson(path, apiKey) {
    const res = await fetch(path, {
      headers: {
        'x-admin-key': apiKey,
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Admin request failed.');
    return data;
  }

  async function loadDashboard() {
    const apiKey = (document.getElementById('admin-api-key')?.value || '').trim();
    const statusEl = document.getElementById('admin-status');
    if (!apiKey) {
      if (statusEl) statusEl.textContent = 'Enter admin API key.';
      return;
    }

    saveApiKey(apiKey);
    if (statusEl) statusEl.textContent = 'Loading admin data...';

    try {
      const [flagsData, reportsData] = await Promise.all([
        fetchAdminJson('/api/admin/fingerprint-flags?minCount=2', apiKey),
        fetchAdminJson('/api/admin/user-reports?status=open&limit=100', apiKey),
      ]);
      lastFlags = flagsData.groups || [];
      lastReports = reportsData.reports || [];
      renderFingerprintFlags();
      renderReports();
      if (statusEl) statusEl.textContent = `Loaded ${lastFlags.length} fingerprint groups and ${lastReports.length} reports.`;
    } catch (error) {
      if (statusEl) statusEl.textContent = error.message || 'Could not load admin data.';
      lastFlags = [];
      lastReports = [];
      renderFingerprintFlags();
      renderReports();
    }
  }

  function render() {
    const app = document.getElementById('app');
    const savedKey = getSavedApiKey();
    app.innerHTML = `
      <div class="stats-page">
        <div class="game-header">
          <button id="admin-back-btn" class="btn-secondary">← Lobby</button>
          <h2>Admin Dashboard</h2>
          <div></div>
        </div>

        <div class="stats-container">
          <div class="stats-section card">
            <h3>Admin Access</h3>
            <div class="auth-form" style="max-width:none;">
              <input type="password" id="admin-api-key" placeholder="Admin API key" value="${savedKey}" />
              <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
                <button id="admin-load-btn">Load Dashboard</button>
                <button id="admin-clear-btn" class="btn-secondary">Clear Saved Key</button>
              </div>
              <p id="admin-status" class="auth-info" style="margin-top:8px;"></p>
            </div>
          </div>

          <div class="stats-section card">
            <h3>Fingerprint Flags</h3>
            <div id="admin-fingerprint-flags"><p class="empty-message">Load dashboard to view fingerprint matches.</p></div>
          </div>

          <div class="stats-section card">
            <h3>Open User Reports</h3>
            <div id="admin-user-reports"><p class="empty-message">Load dashboard to view reports.</p></div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('admin-back-btn').addEventListener('click', () => {
      window.App.navigate('/lobby');
    });
    document.getElementById('admin-load-btn').addEventListener('click', () => {
      loadDashboard();
    });
    document.getElementById('admin-clear-btn').addEventListener('click', () => {
      saveApiKey('');
      const input = document.getElementById('admin-api-key');
      const statusEl = document.getElementById('admin-status');
      if (input) input.value = '';
      if (statusEl) statusEl.textContent = 'Saved admin key cleared.';
    });

    if (savedKey) loadDashboard();
  }

  function renderFingerprintFlags() {
    const container = document.getElementById('admin-fingerprint-flags');
    if (!container) return;
    if (!lastFlags.length) {
      container.innerHTML = '<p class="empty-message">No repeated fingerprint hashes found.</p>';
      return;
    }

    container.innerHTML = lastFlags.map((group) => `
      <div class="game-item" style="border-left:4px solid #d97706;">
        <div class="game-info" style="width:100%;">
          <div class="game-name">Hash: ${group.fingerprintHash}</div>
          <div class="game-meta">Matches: ${group.matchCount}</div>
          <div class="game-details" style="margin-top:8px; display:flex; flex-wrap:wrap; gap:8px;">
            ${group.accounts.map((account) => `
              <button class="btn-sm admin-user-link" data-user-id="${account.id}">${account.username}${account.country ? ` · ${account.country}` : ''}</button>
            `).join('')}
          </div>
        </div>
      </div>
    `).join('');

    bindAdminUserLinks(container);
  }

  function renderReports() {
    const container = document.getElementById('admin-user-reports');
    if (!container) return;
    if (!lastReports.length) {
      container.innerHTML = '<p class="empty-message">No open user reports.</p>';
      return;
    }

    container.innerHTML = lastReports.map((report) => `
      <div class="game-item loss">
        <div class="game-info" style="width:100%;">
          <div class="game-name">${report.reason}</div>
          <div class="game-details">
            Reported: <button class="btn-sm admin-user-link" data-user-id="${report.reportedUser.id}">${report.reportedUser.username || report.reportedUser.id}</button>
            by <button class="btn-sm admin-user-link" data-user-id="${report.reporterUser.id}">${report.reporterUser.username || report.reporterUser.id}</button>
          </div>
          <div class="game-meta">${report.createdAt ? new Date(report.createdAt).toLocaleString() : 'Unknown time'} • ${report.status}</div>
          <div style="margin-top:8px; white-space:pre-wrap;">${report.details || 'No additional details provided.'}</div>
        </div>
      </div>
    `).join('');

    bindAdminUserLinks(container);
  }

  function bindAdminUserLinks(container) {
    container.querySelectorAll('.admin-user-link').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.App.navigate(`/profile/${btn.dataset.userId}`);
      });
    });
  }

  function cleanup() {
    lastReports = [];
    lastFlags = [];
  }

  return { render, cleanup };
})();
