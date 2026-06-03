/* ─── Lobby Page ──────────────────────────────────────── */

window.LobbyPage = (() => {
  let pollTimer = null;
  let lobbyUpdateHandler = null;
  let userStatsSummary = null;
  let userSearchTimer = null;
  const autoEnterTimers = {};
  const rejectedGameIds = new Set();
  let hiddenDiagnostics = [];

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem('hostage_user') || localStorage.getItem('HostageChess_user'))
        || JSON.parse(localStorage.getItem('hostage_guest'));
    } catch { return null; }
  }

  function getAdminApiKey() {
    try { return String(localStorage.getItem('hostage_admin_api_key') || '').trim(); } catch { return ''; }
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function fetchGames() {
    try {
      const user = getUser();
      const adminApiKey = getAdminApiKey();
      const params = new URLSearchParams();
      if (user?.id) params.set('userId', user.id);
      if (adminApiKey) params.set('includeHiddenDiagnostics', '1');
      const qs = params.toString() ? `?${params.toString()}` : '';
      const headers = adminApiKey ? { 'x-admin-key': adminApiKey } : undefined;
      const res = await fetch(`/api/games${qs}`, headers ? { headers } : undefined);
      const data = await res.json();
      return {
        games: data.games || [],
        hiddenDiagnostics: data.hiddenDiagnostics || [],
      };
    } catch {
      return { games: [], hiddenDiagnostics: [] };
    }
  }

  async function fetchUserStats(userId) {
    try {
      const res = await fetch(`/api/users/${userId}/stats`);
      if (!res.ok) return null;
      const data = await res.json();
      return data?.stats || null;
    } catch {
      return null;
    }
  }

  async function searchUsers(query) {
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) return [];
      return data.users || [];
    } catch {
      return [];
    }
  }

  async function fetchBlockMap(targetUserIds, viewerId) {
    const map = new Map();
    if (!viewerId || !Array.isArray(targetUserIds) || targetUserIds.length === 0) return map;

    await Promise.all(targetUserIds.map(async (targetId) => {
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(targetId)}/block-status?viewerId=${encodeURIComponent(viewerId)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return;
        map.set(targetId, { blocked: !!data.blocked, blockedByTarget: !!data.blockedByTarget });
      } catch {
        // Ignore per-user status failures.
      }
    }));
    return map;
  }

  function render() {
    const user = getUser();
    if (!user) { window.App.navigate('/'); return; }

    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="lobby-page">
        ${user.isGuest ? `
        <div class="guest-banner" id="guest-banner" role="alert">
          <span>👤 You are playing in <strong>Guest Mode</strong>. Your stats are saved locally only and games won't affect ranked ELO. <br>
          <a href="#" id="guest-register-link" style="margin-left:8px;">Register for a full account →</a></span>
          <button style="display:none" class="guest-banner-close" id="guest-banner-close" title="Dismiss">✕</button>
        </div>` : ''}
        <div class="lobby-header">
          <div>
            <h1>Hostage Chess Lobby</h1>
            <p class="user-info" id="lobby-user-info">Playing as <strong>${user.username}</strong></p>
          </div>
          <div class="lobby-actions">
            <button id="show-create-form-btn">Create Game</button>
            <button id="stats-btn" class="btn-secondary">Stats</button>
            <button id="review-btn" class="btn-secondary">Review Game</button>
            <button id="practice-btn" class="btn-secondary">Practice/Play Bot</button>
            <button id="experimental-btn" class="btn-secondary">Experimental Mode</button>
            <button id="rules-btn" class="btn-secondary">How to Play</button>
            <button id="logout-btn" class="btn-secondary">${user.isGuest ? 'Exit Guest Mode' : 'Logout'}</button>
          </div>
        </div>

        <!-- Game creation form (hidden by default) -->
        <div id="create-form-wrap" class="card create-form-wrap" style="display:none">
          <h3 style="margin-bottom:14px">New Game Settings</h3>
          <form id="create-game-form" class="create-game-form">
            <label>
              Game Name <small>(optional)</small>
              <input type="text" id="cg-name" placeholder="My Game" maxlength="30" />
            </label>
            <label>
              Timer Mode
              <select id="cg-timer-mode">
                <option value="none">No Timer</option>
                <option value="total">Total Time per Player</option>
                <option value="perTurn">Time per Turn</option>
                <option value="chess">Chess Clock (base±inc)</option>
              </select>
            </label>
            <div id="cg-timer-value-wrap" style="display:none">
              <label>
                <span id="cg-timer-value-label">Minutes</span>
                <input type="number" id="cg-timer-value" min="1" max="60" value="5" />
              </label>
            </div>
            <div id="cg-time-control-wrap" style="display:none">
              <label>
                Time Control
                <input type="text" id="cg-time-control" placeholder="1+1, 5+0, 3-1, 1m+1s" maxlength="12" />
              </label>
              <div class="time-preset-row" id="cg-time-presets">
                <button type="button" class="btn-secondary time-preset-btn" data-tc="1+0">1+0</button>
                <button type="button" class="btn-secondary time-preset-btn" data-tc="1+1">1+1</button>
                <button type="button" class="btn-secondary time-preset-btn" data-tc="3+0">3+0</button>
                <button type="button" class="btn-secondary time-preset-btn" data-tc="3-1">3-1</button>
                <button type="button" class="btn-secondary time-preset-btn" data-tc="5+0">5+0</button>
              </div>
            </div>
            <div class="create-form-actions">
              <button type="submit">Create</button>
              <button type="button" id="cancel-create" class="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>

        <div id="game-list" class="game-list">
          <div class="empty-lobby">Loading games…</div>
        </div>

        <div id="admin-hidden-diagnostics" class="card" style="display:none; margin-top:16px;"></div>

        <div class="card" style="margin-top:16px; padding:12px;">
          <h3 style="margin-bottom:8px;">Find Player Profiles</h3>
          <input type="text" id="user-search-input" placeholder="Search username..." autocomplete="off" />
          <div id="user-search-results" style="margin-top:8px;"></div>
        </div>
      </div>
    `;

    document.getElementById('show-create-form-btn').addEventListener('click', () => {
      document.getElementById('create-form-wrap').style.display = 'block';
      document.getElementById('show-create-form-btn').disabled = true;
    });
    document.getElementById('cancel-create').addEventListener('click', () => {
      document.getElementById('create-form-wrap').style.display = 'none';
      document.getElementById('show-create-form-btn').disabled = false;
    });
    // Timer mode toggle
    document.getElementById('cg-timer-mode').addEventListener('change', (e) => {
      const wrap = document.getElementById('cg-timer-value-wrap');
      const chessWrap = document.getElementById('cg-time-control-wrap');
      const label = document.getElementById('cg-timer-value-label');
      const input = document.getElementById('cg-timer-value');
      if (e.target.value === 'none') {
        wrap.style.display = 'none';
        chessWrap.style.display = 'none';
      } else {
        if (e.target.value === 'chess') {
          wrap.style.display = 'none';
          chessWrap.style.display = 'block';
        } else {
          wrap.style.display = 'block';
          chessWrap.style.display = 'none';
        }
        if (e.target.value === 'total') {
          label.textContent = 'Minutes (1-60)';
          input.min = 1; input.max = 60; input.value = 5;
        } else if (e.target.value === 'perTurn') {
          label.textContent = 'Seconds per turn (10-300)';
          input.min = 10; input.max = 300; input.value = 30;
        }
      }
    });

    document.getElementById('create-game-form').addEventListener('submit', (e) => {
      e.preventDefault();
      createGame();
    });
    document.querySelectorAll('.time-preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = document.getElementById('cg-time-control');
        if (input) input.value = btn.dataset.tc || '';
      });
    });
    document.getElementById('stats-btn').addEventListener('click', () => window.App.navigate('/stats'));
    document.getElementById('review-btn').addEventListener('click', () => window.App.navigate('/review-import'));
    document.getElementById('practice-btn').addEventListener('click', () => window.App.navigate('/practice'));
    document.getElementById('experimental-btn').addEventListener('click', () => window.App.navigate('/experimental-mode'));
    document.getElementById('rules-btn').addEventListener('click', () => window.App.navigate('/rules'));
    document.getElementById('logout-btn').addEventListener('click', () => {
      localStorage.removeItem('hostage_user');
      localStorage.removeItem('HostageChess_user');
      localStorage.removeItem('hostage_guest');
      window.App.navigate('/');
    });

    // Guest-mode banner
    if (user.isGuest) {
      const closeBanner = document.getElementById('guest-banner-close');
      if (closeBanner) closeBanner.addEventListener('click', () => {
        const banner = document.getElementById('guest-banner');
        if (banner) banner.style.display = 'none';
      });
      const regLink = document.getElementById('guest-register-link');
      if (regLink) regLink.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('hostage_guest');
        window.App.navigate('/');
      });
    }

    const searchInput = document.getElementById('user-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        if (userSearchTimer) clearTimeout(userSearchTimer);
        userSearchTimer = setTimeout(() => runUserSearch(searchInput.value), 250);
      });
    }

    loadGames();
    loadUserSummary();

    // Real-time updates
    SocketClient.connect();
    lobbyUpdateHandler = () => loadGames();
    SocketClient.onLobbyUpdate(lobbyUpdateHandler);

    // Also poll as fallback
    pollTimer = setInterval(loadGames, 5000);
  }

  async function runUserSearch(raw) {
    const q = String(raw || '').trim();
    const container = document.getElementById('user-search-results');
    const user = getUser();
    if (!container) return;

    if (q.length < 2) {
      container.innerHTML = '<p class="empty-message">Type at least 2 characters.</p>';
      return;
    }

    const users = await searchUsers(q);
    const blockMap = await fetchBlockMap(users.map((u) => u.id), user?.id);
    if (!users.length) {
      container.innerHTML = '<p class="empty-message">No users found.</p>';
      return;
    }

    container.innerHTML = users.map((u) => `
      <button class="btn-secondary profile-result-btn" data-user-id="${u.id}" style="display:flex;justify-content:space-between;align-items:center;width:100%;margin-bottom:6px;">
        <span>
          ${u.username}${u.country ? ` · ${u.country}` : ''}
          ${(() => {
            const relation = blockMap.get(u.id);
            return relation && (relation.blocked || relation.blockedByTarget)
              ? '<span class="blocked-badge" style="margin-left:8px;">Blocked</span>'
              : '';
          })()}
        </span>
        <strong>ELO ${u.elo}</strong>
      </button>
    `).join('');

    container.querySelectorAll('.profile-result-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.App.navigate(`/profile/${btn.dataset.userId}`);
      });
    });
  }

  async function loadUserSummary() {
    const user = getUser();
    if (!user) return;
    const infoEl = document.getElementById('lobby-user-info');
    if (!infoEl) return;

    if (user.isGuest) {
      let gs = { wins: 0, losses: 0, draws: 0, gamesPlayed: 0, elo: 1200 };
      try { gs = { ...gs, ...(JSON.parse(localStorage.getItem('hostage_guest_stats') || '{}')) }; } catch {}
      infoEl.innerHTML = `Playing as <strong>${user.username}</strong> <span class="guest-badge">GUEST</span> · Local ELO <strong>${gs.elo}</strong> · ${gs.wins}W/${gs.losses}L/${gs.draws}D`;
      return;
    }

    userStatsSummary = await fetchUserStats(user.id);

    if (!userStatsSummary) {
      infoEl.innerHTML = `Playing as <strong>${user.username}</strong>`;
      return;
    }

    const wins = userStatsSummary.wins || 0;
    const losses = userStatsSummary.losses || 0;
    const draws = userStatsSummary.draws || 0;
    const elo = userStatsSummary.elo != null ? userStatsSummary.elo : 1200;
    infoEl.innerHTML = `Playing as <strong>${user.username}</strong> · ELO <strong>${elo}</strong> · ${wins}W/${losses}L/${draws}D`;
  }

  async function loadGames() {
    const payload = await fetchGames();
    const games = payload.games || [];
    hiddenDiagnostics = payload.hiddenDiagnostics || [];
    const container = document.getElementById('game-list');
    if (!container) return;

    renderAdminHiddenDiagnostics();

    if (games.length === 0) {
      container.innerHTML = '<div class="empty-lobby">No games yet. Create one to get started!</div>';
      return;
    }

    const user = getUser();

    // Partition into waiting and active (API already excludes finished)
    const waiting = games.filter(g => g.status === 'waiting');
    const active  = games.filter(g => g.status === 'playing');

    function renderGameCard(g) {
      const maxP = g.maxPlayers || 4;
      const dots = [];
      const COLORS = ['white', 'black'];
      for (let i = 0; i < maxP; i++) {
        if (g.players[i]) {
          dots.push(`<span class="player-dot filled ${g.players[i].color}"></span>`);
        } else {
          dots.push(`<span class="player-dot empty"></span>`);
        }
      }

      const isJoined  = g.players.some(p => p.username === user.username);
      const canJoin   = g.status === 'waiting' && g.playerCount < maxP && !isJoined;
      const canEnter  = isJoined && g.status === 'playing';
      const canWatch  = !isJoined && g.status === 'playing';
      const isCreator = g.createdById && g.createdById === user.id;
      const opponent = g.players.find((p) => p.id !== user.id) || null;

      let timerBadge = '';
      if (g.timerMode === 'total') timerBadge = `<span class="timer-badge">${g.timerValue}m total</span>`;
      else if (g.timerMode === 'perTurn') timerBadge = `<span class="timer-badge">${g.timerValue}s/turn</span>`;
      else if (g.timerMode === 'chess') {
        const tc = g.timeControl?.label || `${Math.floor((g.timerValue || 0) / 60)}+0`;
        timerBadge = `<span class="timer-badge">${tc}</span>`;
      }

      let statusLabel = g.status === 'playing' ? '🔴 Live' : `${g.playerCount}/${maxP} players · waiting`;
      const creator = g.createdBy || 'Unknown';

      let actionBtn = '';
      if (canJoin) {
        actionBtn = `<button class="join-btn" data-id="${g.id}">Join</button>`;
      } else if (canEnter) {
        const rejectBtn = (isCreator && opponent)
          ? `<button class="reject-btn btn-secondary" data-id="${g.id}" data-opp-name="${opponent.username}" data-opp-elo="${opponent.elo || 1200}">Reject (${opponent.username} ${opponent.elo || 1200})</button>`
          : '';
        actionBtn = `<div style="display:flex; gap:8px; flex-wrap:wrap;"><button class="enter-btn" data-id="${g.id}">Enter Game</button>${rejectBtn}</div>`;
      } else if (isJoined && g.status === 'waiting') {
        actionBtn = `<button class="enter-btn" data-id="${g.id}" disabled>Waiting…</button>`;
      } else if (canWatch) {
        actionBtn = `<button class="watch-btn" data-id="${g.id}">👁 Watch</button>`;
      }

      return `
        <div class="card game-card ${g.status === 'playing' ? 'game-card-active' : ''}">
          <div class="game-info">
            <h3>${g.name} ${timerBadge}</h3>
            <p class="player-count">${statusLabel} · by <button class="btn-sm creator-profile-btn" data-user-id="${g.createdById || ''}">${creator}</button></p>
            
          </div>
          <div class="player-dots">${dots.join('')}</div>
          ${actionBtn}
        </div>
      `;
    }

    let html = '';
    if (active.length > 0) {
      html += `<div class="lobby-section-header">Active Games</div>`;
      html += active.map(renderGameCard).join('');
    }
    if (waiting.length > 0) {
      html += `<div class="lobby-section-header">Open Games</div>`;
      html += waiting.map(renderGameCard).join('');
    }
    if (!html) {
      html = '<div class="empty-lobby">No open games. Create one to get started!</div>';
    }
    container.innerHTML = html;

    // Bind buttons
    container.querySelectorAll('.join-btn').forEach(btn => {
      btn.addEventListener('click', () => joinGame(btn.dataset.id));
    });
    container.querySelectorAll('.enter-btn').forEach(btn => {
      btn.addEventListener('click', () => window.App.navigate(`/game/${btn.dataset.id}`));
    });
    container.querySelectorAll('.watch-btn').forEach(btn => {
      btn.addEventListener('click', () => window.App.navigate(`/spectate/${btn.dataset.id}`));
    });
    container.querySelectorAll('.reject-btn').forEach(btn => {
      btn.addEventListener('click', () => rejectOpponent(btn.dataset.id, btn.dataset.oppName, btn.dataset.oppElo));
    });
    container.querySelectorAll('.creator-profile-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!btn.dataset.userId) return;
        window.App.navigate(`/profile/${btn.dataset.userId}`);
      });
    });

    const enterableIds = new Set(active
      .filter((g) => g.status === 'playing' && g.players.some((p) => p.id === user.id))
      .map((g) => g.id));
    Object.keys(autoEnterTimers).forEach((id) => {
      if (!enterableIds.has(id)) {
        clearTimeout(autoEnterTimers[id]);
        delete autoEnterTimers[id];
        rejectedGameIds.delete(id);
      }
    });

    active.forEach((g) => {
      const canEnter = g.status === 'playing' && g.players.some((p) => p.id === user.id);
      if (!canEnter || rejectedGameIds.has(g.id) || autoEnterTimers[g.id]) return;
      autoEnterTimers[g.id] = setTimeout(() => {
        delete autoEnterTimers[g.id];
        if (rejectedGameIds.has(g.id)) return;
        const btn = document.querySelector(`.enter-btn[data-id="${g.id}"]`);
        if (btn && !btn.disabled) btn.click();
      }, 10000);
    });
  }

  function renderAdminHiddenDiagnostics() {
    const container = document.getElementById('admin-hidden-diagnostics');
    if (!container) return;

    const adminApiKey = getAdminApiKey();
    if (!adminApiKey) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    container.style.display = 'block';
    if (!hiddenDiagnostics.length) {
      container.innerHTML = `
        <h3 style="margin-bottom:8px;">Admin Hidden-State Diagnostics</h3>
        <p class="empty-message">No games are currently hidden from this viewer by block rules.</p>
      `;
      return;
    }

    const cards = hiddenDiagnostics.map((entry) => {
      const causes = Array.isArray(entry.causes) ? entry.causes : [];
      const causeHtml = causes.map((cause) => {
        const blocker = escapeHtml(cause.blockerUsername || cause.blockerId || 'Unknown');
        const blocked = escapeHtml(cause.blockedUsername || cause.blockedId || 'Unknown');
        const reason = String(cause.reason || '').trim();
        return `
          <div class="admin-hidden-cause">
            <strong>${blocker}</strong> blocked <strong>${blocked}</strong>${reason ? ` <span class="admin-hidden-reason">Reason: ${escapeHtml(reason)}</span>` : ' <span class="admin-hidden-reason">Reason: (none)</span>'}
          </div>
        `;
      }).join('');
      return `
        <div class="game-item" style="border-left:4px solid #e94560; margin-bottom:8px;">
          <div class="game-info" style="width:100%;">
            <div class="game-name">${escapeHtml(entry.gameName || 'Game')} (${escapeHtml(entry.gameId || '')})</div>
            <div class="game-meta">Creator: ${escapeHtml(entry.creatorUsername || entry.creatorId || 'Unknown')}</div>
            <div style="margin-top:8px; display:flex; flex-direction:column; gap:6px;">${causeHtml || '<span class="admin-hidden-reason">No cause details.</span>'}</div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <h3 style="margin-bottom:8px;">Admin Hidden-State Diagnostics</h3>
      <p class="auth-info" style="margin-bottom:10px;">Shows which blocks hid open game requests for the current viewer.</p>
      ${cards}
    `;
  }

  async function rejectOpponent(gameId, opponentName, opponentElo) {
    const user = getUser();
    if (!user) return;
    if (!confirm(`Reject ${opponentName} (${opponentElo}) before game starts?`)) return;
    try {
      const res = await fetch(`/api/games/${gameId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        Toast.error(data.error || 'Could not reject opponent.', 3000);
        return;
      }
      rejectedGameIds.add(gameId);
      if (autoEnterTimers[gameId]) {
        clearTimeout(autoEnterTimers[gameId]);
        delete autoEnterTimers[gameId];
      }
      Toast.success(`Rejected ${opponentName}.`, 2500);
      loadGames();
    } catch {
      Toast.error('Could not reject opponent.', 3000);
    }
  }

  async function createGame() {
    const user = getUser();
    if (!user) return;

    const gameName = (document.getElementById('cg-name').value || '').trim();
    const maxPlayers = 2;
    const timerMode = document.getElementById('cg-timer-mode').value;
    const timerValue = parseInt(document.getElementById('cg-timer-value').value) || 0;
    const timeControl = (document.getElementById('cg-time-control').value || '').trim();

    if (timerMode === 'chess') {
      const ok = /^(\d{1,2})\s*m?\s*[+-]\s*(\d{1,2})\s*s?$/i.test(timeControl);
      if (!ok) {
        Toast.error('Use format like 1+1, 5+0, 3-1, or 1m+1s.', 3500);
        return;
      }
    }

    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          gameName, maxPlayers, timerMode, timerValue, timeControl,
          ...(user.isGuest ? { isGuest: true, guestId: user.id, guestUsername: user.username } : {}),
        }),
      });
      if (res.ok) {
        document.getElementById('create-form-wrap').style.display = 'none';
        document.getElementById('show-create-form-btn').disabled = false;
        loadGames();
      } else {
        const data = await res.json().catch(() => ({}));
        Toast.error(data.error || 'Could not create game.', 3000);
      }
    } catch {}
  }

  async function joinGame(gameId) {
    const user = getUser();
    if (!user) return;
    try {
      const res = await fetch(`/api/games/${gameId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          ...(user.isGuest ? { isGuest: true, guestId: user.id, guestUsername: user.username } : {}),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        loadGames();
        if (data.game && data.game.status === 'playing') {
          window.App.navigate(`/game/${gameId}`);
        }
      }
    } catch {}
  }

  function cleanup() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (userSearchTimer) { clearTimeout(userSearchTimer); userSearchTimer = null; }
    Object.keys(autoEnterTimers).forEach((id) => {
      clearTimeout(autoEnterTimers[id]);
      delete autoEnterTimers[id];
    });
    rejectedGameIds.clear();
    hiddenDiagnostics = [];
    if (lobbyUpdateHandler) SocketClient.off('lobby:update', lobbyUpdateHandler);
    lobbyUpdateHandler = null;
  }

  return { render, cleanup };
})();
