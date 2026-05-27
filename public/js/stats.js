/* ─── Profile / Stats Page ───────────────────────────── */

window.ProfilePage = (() => {
  let viewedUser = null;
  let viewedGames = null;
  let leaderboard = null;
  let isBlockedByMe = false;
  let hasBlockedMe = false;
  let myBlockReason = '';

  function getUser() {
    try { return JSON.parse(localStorage.getItem('hostage_user') || localStorage.getItem('HostageChess_user')); } catch { return null; }
  }

  function getDefaultStats() {
    return {
      elo: 1200,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
    };
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function fetchStats(userId) {
    try {
      const res = await fetch(`/api/users/${userId}/stats`);
      const data = await res.json();
      if (!res.ok) return null;
      return data;
    } catch (err) {
      console.error('Failed to fetch stats:', err);
      return null;
    }
  }

  async function fetchUserGames(userId) {
    try {
      const res = await fetch(`/api/users/${userId}/games`);
      const data = await res.json();
      return data.games || [];
    } catch (err) {
      console.error('Failed to fetch games:', err);
      return [];
    }
  }

  async function fetchLeaderboard() {
    try {
      const res = await fetch('/api/leaderboard');
      const data = await res.json();
      return data.leaderboard || [];
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err);
      return [];
    }
  }

  async function submitReport(targetUserId, reporterId, reason, details) {
    const res = await fetch(`/api/users/${targetUserId}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reporterId, reason, details }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to submit report.');
    return data;
  }

  async function fetchBlockStatus(targetUserId, viewerId) {
    const res = await fetch(`/api/users/${targetUserId}/block-status?viewerId=${encodeURIComponent(viewerId)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Could not load block status.');
    return {
      blocked: !!data.blocked,
      blockedByTarget: !!data.blockedByTarget,
      reason: String(data.reason || ''),
      blockedByTargetReason: String(data.blockedByTargetReason || ''),
    };
  }

  async function blockUser(targetUserId, requesterId, reason) {
    const res = await fetch(`/api/users/${targetUserId}/block`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requesterId, reason }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Could not block user.');
    return data;
  }

  async function unblockUser(targetUserId, requesterId) {
    const res = await fetch(`/api/users/${targetUserId}/unblock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requesterId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Could not unblock user.');
    return data;
  }

  async function render(targetUserId) {
    const me = getUser();
    if (!me) {
      window.App.navigate('/');
      return;
    }

    const userId = targetUserId || me.id;
    const isSelf = userId === me.id;

    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="stats-page">
        <div class="game-header">
          <button id="back-to-lobby" class="btn-secondary">← Lobby</button>
          <h2>${isSelf ? 'My Profile' : 'Player Profile'}</h2>
          <div></div>
        </div>

        <div class="stats-container">
          <div class="stats-section card">
            <h3>Profile Details</h3>
            <div id="profile-details-content"><p>Loading...</p></div>
          </div>

          <div class="stats-section card">
            <h3>${isSelf ? 'Your Statistics' : 'Player Statistics'}</h3>
            <div id="user-stats-content"><p>Loading...</p></div>
          </div>

          <div class="stats-section card moderation-section" id="report-section" style="display:${isSelf ? 'none' : 'block'}">
            <div class="moderation-block">
              <h3 class="moderation-title">Block This User</h3>
              <div id="block-content"></div>
            </div>
            <br>
            <div class="moderation-block">
              <h3 class="moderation-title">Report This User</h3>
              <div id="report-content"></div>
            </div>
          </div>

          <div class="stats-section card">
            <h3>Recent Games</h3>
            <br>
            <div id="recent-games-content"><p>Loading...</p></div>
          </div>

          <div class="stats-section card">
            <h3>Leaderboard (Top 20)</h3>
            <br>
            <div id="leaderboard-content"><p>Loading...</p></div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('back-to-lobby').addEventListener('click', () => {
      window.App.navigate('/lobby');
    });

    viewedUser = await fetchStats(userId);
    viewedGames = await fetchUserGames(userId);
    leaderboard = await fetchLeaderboard();
    if (!isSelf) {
      try {
        const blockState = await fetchBlockStatus(userId, me.id);
        isBlockedByMe = !!blockState.blocked;
        hasBlockedMe = !!blockState.blockedByTarget;
        myBlockReason = String(blockState.reason || '');
      } catch {
        isBlockedByMe = false;
        hasBlockedMe = false;
        myBlockReason = '';
      }
    }

    renderProfileDetails();
    renderUserStats();
    renderRecentGames();
    renderLeaderboard();
    renderBlockSection(me, userId, isSelf);
    renderReportSection(me, userId, isSelf);
  }

  function renderBlockSection(me, targetUserId, isSelf) {
    if (isSelf) return;
    const content = document.getElementById('block-content');
    if (!content) return;

    content.innerHTML = `
      <div class="moderation-row">
        <button id="block-toggle-btn" class="btn-secondary">${isBlockedByMe ? 'Unblock User' : 'Block User'}</button>
        <span id="block-status-text" class="auth-info moderation-status">${isBlockedByMe ? 'You have blocked this user. Their open games are hidden.' : 'Blocking hides each other\'s open game requests.'}</span>
      </div>
      <label class="moderation-label" for="block-reason-input">
        Block reason (optional, visible to admins only)
        <textarea class="moderation-input" id="block-reason-input" rows="2" maxlength="255" placeholder="Optional context for moderation">${escapeHtml(myBlockReason)}</textarea>
      </label>
      <p id="block-reason-counter" class="auth-info moderation-status">${myBlockReason.length}/255</p>
      ${hasBlockedMe ? '<p class="error-msg moderation-inline-error">This player has also blocked you.</p>' : ''}
    `;

    const reasonInput = document.getElementById('block-reason-input');
    const reasonCounter = document.getElementById('block-reason-counter');
    if (reasonInput && reasonCounter) {
      reasonInput.addEventListener('input', () => {
        if (reasonInput.value.length > 255) reasonInput.value = reasonInput.value.slice(0, 255);
        reasonCounter.textContent = `${reasonInput.value.length}/255`;
      });
    }

    const btn = document.getElementById('block-toggle-btn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const reason = String(document.getElementById('block-reason-input')?.value || '').trim().slice(0, 255);
        if (isBlockedByMe) {
          await unblockUser(targetUserId, me.id);
          isBlockedByMe = false;
          myBlockReason = '';
          Toast.success('User unblocked.', 2000);
        } else {
          await blockUser(targetUserId, me.id, reason);
          isBlockedByMe = true;
          myBlockReason = reason;
          Toast.success('User blocked.', 2000);
        }
        renderBlockSection(me, targetUserId, false);
        renderProfileDetails();
      } catch (error) {
        Toast.error(error.message || 'Could not update block status.', 3000);
      } finally {
        btn.disabled = false;
      }
    });
  }

  function renderProfileDetails() {
    const content = document.getElementById('profile-details-content');
    if (!content) return;
    if (!viewedUser) {
      content.innerHTML = '<p class="error-msg">Failed to load profile details.</p>';
      return;
    }

    const stats = viewedUser.stats || {};
    const avg = stats.sportsmanshipAverage != null ? stats.sportsmanshipAverage : 'N/A';
    const country = viewedUser.country || 'N/A';
    const age = viewedUser.age || 'N/A';
    const gender = viewedUser.gender || 'N/A';
    const blockedBadge = (isBlockedByMe || hasBlockedMe)
      ? `<span class="blocked-badge" title="Blocking relationship exists">Blocked</span>`
      : '';

    content.innerHTML = `
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-label">Username</div>
          <div class="stat-value">${viewedUser.username || 'Unknown'} ${blockedBadge}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Country</div>
          <div class="stat-value">${country}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Age</div>
          <div class="stat-value">${age}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Gender</div>
          <div class="stat-value">${gender}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Sportsmanship</div>
          <div class="stat-value">${avg}</div>
        </div>
      </div>
    `;
  }

  function renderUserStats() {
    const content = document.getElementById('user-stats-content');
    if (!content) return;
    if (!viewedUser) {
      content.innerHTML = '<p class="error-msg">Failed to load stats.</p>';
      return;
    }

    const stats = { ...getDefaultStats(), ...(viewedUser?.stats || {}) };
    const winRate = stats.gamesPlayed > 0
      ? ((stats.wins / stats.gamesPlayed) * 100).toFixed(1)
      : '0.0';

    content.innerHTML = `
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-label">ELO Rating</div>
          <div class="stat-value elo">${stats.elo || 1200}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Games Played</div>
          <div class="stat-value">${stats.gamesPlayed}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Wins</div>
          <div class="stat-value wins">${stats.wins}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Losses</div>
          <div class="stat-value losses">${stats.losses}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Draws</div>
          <div class="stat-value draws">${stats.draws}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Win Rate</div>
          <div class="stat-value">${winRate}%</div>
        </div>
      </div>
    `;
  }

  function renderReportSection(me, targetUserId, isSelf) {
    if (isSelf) return;
    const content = document.getElementById('report-content');
    if (!content) return;

    content.innerHTML = `
      <form id="report-user-form" class="auth-form moderation-form">
        <select id="report-reason" class="moderation-input">
          <option value="">Select reason</option>
          <option value="abusive-chat">Abusive chat</option>
          <option value="harassment">Harassment</option>
          <option value="cheating">Cheating / exploitation</option>
          <option value="abandonment">Habitual abandonment</option>
          <option value="other">Other</option>
        </select>
        <textarea id="report-details" class="moderation-input" rows="4" placeholder="Optional details for admin"></textarea>
        <p class="error-msg" id="report-error"></p>
        <button type="submit" id="report-submit-btn" class="moderation-submit-btn">Submit Report</button>
      </form>
    `;

    const form = document.getElementById('report-user-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const reason = (document.getElementById('report-reason').value || '').trim();
      const details = (document.getElementById('report-details').value || '').trim();
      const err = document.getElementById('report-error');
      err.textContent = '';

      if (!reason) {
        err.textContent = 'Please select a reason.';
        return;
      }

      const btn = document.getElementById('report-submit-btn');
      btn.disabled = true;
      btn.textContent = 'Submitting...';
      try {
        await submitReport(targetUserId, me.id, reason, details);
        Toast.success('Report submitted to admin.', 2500);
        form.reset();
      } catch (error) {
        err.textContent = error.message || 'Could not submit report.';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Submit Report';
      }
    });
  }

  function renderRecentGames() {
    const content = document.getElementById('recent-games-content');
    if (!content) return;
    if (!viewedGames || viewedGames.length === 0) {
      content.innerHTML = '<p class="empty-message">No games played yet.</p>';
      return;
    }

    const viewedUserId = viewedUser?.id;
    const gamesHtml = viewedGames.slice(0, 10).map((game) => {
      const players = Array.isArray(game.players) ? game.players : [];
      const userPlayer = players.find((p) => p.id === viewedUserId);
      const isWinner = game.winner === userPlayer?.color;
      const isDraw = game.winner === 'draw';

      let resultClass = '';
      let resultText = '';
      if (isDraw) {
        resultClass = 'draw';
        resultText = 'Draw';
      } else if (isWinner) {
        resultClass = 'win';
        resultText = 'Win';
      } else {
        resultClass = 'loss';
        resultText = 'Loss';
      }

      const date = game.finishedAt ? new Date(game.finishedAt).toLocaleDateString() : 'N/A';

      return `
        <div class="game-item ${resultClass}">
          <div class="game-result">${resultText}</div>
          <div class="game-info">
            <div class="game-name">${game.name || 'Game'}</div>
            <div class="game-details">
              ${players.map((p) => `<span class="player-badge ${p.color}">${p.username}</span>`).join(' ')}
            </div>
            <div class="game-meta">${game.turnCount} turns • ${date}</div>
          </div>
          <div class="game-actions">
            <button class="btn-sm review-btn" data-game-id="${game.id}">Review</button>
            <button class="btn-sm download-btn" data-game-id="${game.id}">Download</button>
          </div>
        </div>
      `;
    }).join('');

    content.innerHTML = `<div class="games-list">${gamesHtml}</div>`;

    content.querySelectorAll('.review-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const gameId = btn.dataset.gameId;
        window.App.navigate(`/review/${gameId}`);
      });
    });

    content.querySelectorAll('.download-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const gameId = btn.dataset.gameId;
        await downloadGameHistory(gameId);
      });
    });
  }

  function renderLeaderboard() {
    const content = document.getElementById('leaderboard-content');
    if (!content) return;
    if (!leaderboard || leaderboard.length === 0) {
      content.innerHTML = '<p class="empty-message">No players on leaderboard yet.</p>';
      return;
    }

    const me = getUser();
    const top20 = leaderboard.slice(0, 20);

    const leaderboardHtml = top20.map((player, index) => {
      const isCurrentUser = player.username === me.username;
      const rankClass = index < 3 ? `rank-${index + 1}` : '';

      return `
        <div class="leaderboard-item ${rankClass} ${isCurrentUser ? 'current-user' : ''}">
          <div class="rank">${index + 1}</div>
          <div class="player-name">${player.username}</div>
          <div class="player-elo">${player.elo}</div>
          <div class="player-record">${player.wins}W / ${player.losses}L / ${player.draws}D</div>
        </div>
      `;
    }).join('');

    content.innerHTML = `
      <div class="leaderboard-header">
        <div class="rank">Rank</div>
        <div class="player-name">Player</div>
        <div class="player-elo">ELO</div>
        <div class="player-record">Record</div>
      </div>
      <div class="leaderboard-list">${leaderboardHtml}</div>
    `;
  }

  async function downloadGameHistory(gameId) {
    try {
      const res = await fetch(`/api/games/${gameId}/history/download`);
      const data = await res.json();

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `game-${gameId}.json`;
      a.click();
      URL.revokeObjectURL(url);

      Toast.success('Game history downloaded!', 2000);
    } catch (err) {
      console.error('Download failed:', err);
      Toast.error('Failed to download game history.', 3000);
    }
  }

  function cleanup() {
    viewedUser = null;
    viewedGames = null;
    leaderboard = null;
    isBlockedByMe = false;
    hasBlockedMe = false;
    myBlockReason = '';
  }

  return { render, cleanup };
})();

window.StatsPage = window.ProfilePage;
