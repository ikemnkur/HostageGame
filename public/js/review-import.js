/* ─── Imported JSON Review Page ─────────────────────── */

window.ImportReviewPage = (() => {
  let renderer = null;
  let gameHistory = null;
  let moveHistory = [];
  let currentMoveIndex = -1;
  let autoPlayInterval = null;
  let boardStates = [];

  function getUser() {
    try { return JSON.parse(localStorage.getItem('hostage_user') || localStorage.getItem('HostageChess_user')); } catch { return null; }
  }

  function safeText(value, fallback = 'N/A') {
    if (value == null || value === '') return fallback;
    return String(value);
  }

  function formatDate(value) {
    if (!value) return 'N/A';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? safeText(value) : d.toLocaleString();
  }

  function validateImportedGame(data) {
    if (!data || typeof data !== 'object') {
      return 'JSON root must be an object.';
    }
    if (!Array.isArray(data.moveHistory)) {
      return 'Missing moveHistory array.';
    }
    return null;
  }

  function render() {
    const user = getUser();
    if (!user) {
      window.App.navigate('/');
      return;
    }

    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="review-page import-review-page">
        <div class="game-header">
          <button id="back-to-stats" class="btn-secondary">← Stats</button>
          <h2 id="review-title">Imported Game Review</h2>
          <div></div>
        </div>

        <div class="card import-review-upload">
          <div class="import-review-upload-row">
            <label for="import-review-file" class="import-review-file-label">Choose JSON file</label>
            <input id="import-review-file" type="file" accept="application/json,.json" />
            <button id="import-review-load-btn" class="btn-sm">Load File</button>
          </div>
          <div style="margin-top:10px; text-align:left;">
            <label for="import-review-json-text" class="import-review-file-label">Or paste JSON</label>
            <textarea id="import-review-json-text" class="moderation-input" rows="8" placeholder='Paste exported game JSON here'></textarea>
            <div style="margin-top:8px;">
              <button id="import-review-load-text-btn" class="btn-sm">Load Pasted JSON</button>
            </div>
          </div>
          <p class="auth-info import-review-note">Load a downloaded game-history JSON and replay it move by move.</p>
          <p id="import-review-error" class="error-msg"></p>
        </div>

        <div class="review-body" id="import-review-body" style="display:none;">
          <div class="review-right">
            <div class="move-history-panel card">
              <div class="move-log-header">
                <h3>Move History</h3>
                <div class="move-log-actions">
                  <button id="import-copy-positions-btn" class="btn-sm" title="Copy board positions CSV">♟ Copy Positions</button>
                </div>
              </div>
              <div class="move-list" id="move-list">
                <p>Loading moves...</p>
              </div>
            </div>
          </div>
          <div class="review-left">
            <div class="board-container" id="board-container"></div>

            <div class="review-controls card">
              <div class="playback-controls">
                <button id="first-btn" class="btn-icon" title="First Move">⏮</button>
                <button id="prev-btn" class="btn-icon" title="Previous">◀</button>
                <button id="play-btn" class="btn-icon" title="Auto Play">▶</button>
                <button id="pause-btn" class="btn-icon" style="display:none;" title="Pause">⏸</button>
                <button id="next-btn" class="btn-icon" title="Next">▶</button>
                <button id="last-btn" class="btn-icon" title="Last Move">⏭</button>
              </div>
              <div class="move-counter">
                <span id="move-indicator">Start</span>
              </div>
              <div class="playback-speed">
                <label>Speed:</label>
                <select id="speed-select">
                  <option value="2000">0.5x</option>
                  <option value="1000" selected>1x</option>
                  <option value="500">2x</option>
                  <option value="250">4x</option>
                </select>
              </div>
              <div class="rotation-controls" style="margin-top: 8px; display: flex; gap: 6px; justify-content: center; flex-wrap: wrap;">
                <label style="color: var(--text-muted); font-size: 0.9rem;">View:</label>
                <button class="rotate-color-btn-sm" data-color="white">White</button>
                <button class="rotate-color-btn-sm" data-color="black">Black</button>
                <button id="import-shape-toggle-btn" class="btn-secondary" title="Toggle rhombus/square board">◇ Rhombus</button>
              </div>
            </div>

            <div class="game-info-panel card">
              <h3>Imported Game Information</h3>
              <div id="import-outcome-details" class="card" style="display:none; margin-bottom:10px; padding:10px 12px;"></div>
              <div id="game-info-content">Load a file to begin.</div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('back-to-stats').addEventListener('click', () => {
      cleanup();
      window.App.navigate('/stats');
    });

    document.getElementById('import-review-load-btn').addEventListener('click', handleLoadImportedFile);
    document.getElementById('import-review-load-text-btn').addEventListener('click', handleLoadImportedText);
    document.getElementById('import-review-file').addEventListener('change', clearImportError);
    document.getElementById('import-review-json-text').addEventListener('input', clearImportError);
  }

  function clearImportError() {
    const err = document.getElementById('import-review-error');
    if (err) err.textContent = '';
  }

  async function handleLoadImportedFile() {
    const fileInput = document.getElementById('import-review-file');
    const err = document.getElementById('import-review-error');
    if (!fileInput?.files?.length) {
      if (err) err.textContent = 'Choose a JSON file first.';
      return;
    }

    const file = fileInput.files[0];
    try {
      const text = await file.text();
      loadImportedGameFromText(text);
    } catch {
      if (err) err.textContent = 'Invalid JSON file. Please choose a valid game export.';
    }
  }

  function handleLoadImportedText() {
    const textarea = document.getElementById('import-review-json-text');
    const err = document.getElementById('import-review-error');
    const raw = String(textarea?.value || '').trim();
    if (!raw) {
      if (err) err.textContent = 'Paste JSON first.';
      return;
    }
    loadImportedGameFromText(raw);
  }

  function loadImportedGameFromText(rawText) {
    const err = document.getElementById('import-review-error');
    try {
      const parsed = JSON.parse(rawText);
      const validationError = validateImportedGame(parsed);
      if (validationError) {
        if (err) err.textContent = validationError;
        return;
      }

      gameHistory = parsed;
      moveHistory = Array.isArray(parsed.moveHistory) ? parsed.moveHistory : [];
      if (err) err.textContent = '';
      initializeReviewAfterImport();
    } catch {
      if (err) err.textContent = 'Invalid JSON. Please paste a valid game export object.';
    }
  }

  function initializeReviewAfterImport() {
    const reviewBody = document.getElementById('import-review-body');
    if (reviewBody) reviewBody.style.display = 'flex';

    if (!renderer) {
      const container = document.getElementById('board-container');
      renderer = BoardRenderer.create(container, { size: Math.min(480, window.innerWidth - 40) });
    }

    // Rebuild board states from start using imported move history.
    boardStates = [];
    let board = HostageEngine.createStartingBoard();
    boardStates.push(HostageEngine.cloneBoard(board));

    moveHistory.forEach((move) => {
      if (Array.isArray(move.from) && Array.isArray(move.to) && move.color) {
        const result = HostageEngine.processMove(board, move.color, move.from, move.to);
        if (result.valid) {
          board = result.board;
          boardStates.push(HostageEngine.cloneBoard(board));
        } else {
          // Support older exports by applying coordinate moves directly.
          board[move.to[0]][move.to[1]] = board[move.from[0]][move.from[1]];
          board[move.from[0]][move.from[1]] = null;
          boardStates.push(HostageEngine.cloneBoard(board));
        }
      } else {
        boardStates.push(HostageEngine.cloneBoard(board));
      }
    });

    currentMoveIndex = -1;
    showMove(0);
    renderMoveList();
    renderGameInfo();
    setupControls();
  }

  function showMove(index) {
    if (!renderer || boardStates.length === 0) return;
    if (index < 0) index = 0;
    if (index >= boardStates.length) index = boardStates.length - 1;

    currentMoveIndex = index;
    renderer.setBoard(boardStates[index]);
    renderer.clearHighlights();

    if (index > 0 && moveHistory[index - 1]) {
      const move = moveHistory[index - 1];
      if (Array.isArray(move.from) && Array.isArray(move.to)) {
        renderer.setLastMove(move.from, move.to);
      } else {
        renderer.clearLastMove();
      }
    } else {
      renderer.clearLastMove();
    }

    updateMoveIndicator();
    highlightCurrentMoveInList();
  }

  function formatMove(move) {
    if (!move) return 'Unknown move';
    if (move.event === 'resigned') return `${safeText(move.username, safeText(move.color, 'Player'))} resigned`;
    if (move.event === 'eliminated') return `${String(move.color || '').toUpperCase()} eliminated (${move.reason || 'timeout'})`;
    if (move.event === 'turnSkipped') return `${String(move.color || '').toUpperCase()} turn skipped (${move.reason || 'timeout'})`;
    if (move.event === 'draw') return 'Draw agreed';
    if (Array.isArray(move.from) && Array.isArray(move.to)) {
      const label = move.username || move.color || 'player';
      return `${label}: [${move.from}] → [${move.to}]`;
    }
    return safeText(move.action, 'Unknown move');
  }

  function updateMoveIndicator() {
    const indicator = document.getElementById('move-indicator');
    if (!indicator) return;
    if (currentMoveIndex === 0) {
      indicator.textContent = 'Start Position';
      return;
    }
    const move = moveHistory[currentMoveIndex - 1];
    indicator.textContent = `Move ${currentMoveIndex}: ${formatMove(move)}`;
  }

  function renderMoveList() {
    const container = document.getElementById('move-list');
    if (!container) return;
    if (moveHistory.length === 0) {
      container.innerHTML = '<p class="empty-message">No moves recorded.</p>';
      return;
    }

    const movesHtml = moveHistory.map((move, index) => {
      const colorClass = move.color || '';
      return `
        <div class="move-item ${colorClass}" data-index="${index + 1}">
          <span class="move-number">${index + 1}.</span>
          <span class="move-text">${formatMove(move)}</span>
        </div>
      `;
    }).join('');

    container.innerHTML = movesHtml;
    container.querySelectorAll('.move-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index, 10);
        stopAutoPlay();
        showMove(index);
      });
    });
  }

  function highlightCurrentMoveInList() {
    const items = document.querySelectorAll('.move-item');
    items.forEach((item, index) => {
      if (index === currentMoveIndex - 1) {
        item.classList.add('active');
        item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        item.classList.remove('active');
      }
    });
  }

  function renderGameInfo() {
    const content = document.getElementById('game-info-content');
    if (!content || !gameHistory) return;

    const winner = gameHistory.winner || gameHistory.result?.winner || null;
    const result = winner === 'draw' ? 'Draw' : (winner ? `Winner: ${winner}` : 'N/A');
    const mode = safeText(gameHistory.mode);
    const humanSide = safeText(gameHistory.humanSide);

    content.innerHTML = `
      <div class="info-grid">
        <div class="info-item">
          <strong>Name:</strong> ${safeText(gameHistory.name)}
        </div>
        <div class="info-item">
          <strong>Game ID:</strong> ${safeText(gameHistory.id)}
        </div>
        <div class="info-item">
          <strong>Status:</strong> ${safeText(gameHistory.status)}
        </div>
        <div class="info-item">
          <strong>Mode:</strong> ${mode}${humanSide !== 'N/A' ? ` (${humanSide})` : ''}
        </div>
        <div class="info-item">
          <strong>Result:</strong> ${result}
        </div>
        <div class="info-item">
          <strong>Total Moves:</strong> ${moveHistory.length}
        </div>
        <div class="info-item">
          <strong>Created:</strong> ${formatDate(gameHistory.createdAt)}
        </div>
        <div class="info-item">
          <strong>Exported:</strong> ${formatDate(gameHistory.exportedAt)}
        </div>
      </div>
    `;

    renderOutcomeDetails();
  }

  function renderOutcomeDetails() {
    const panel = document.getElementById('import-outcome-details');
    if (!panel || !gameHistory) return;

    const pts = gameHistory.points || gameHistory.result?.points || { white: 0, black: 0 };
    const whitePts = Number(pts.white || 0);
    const blackPts = Number(pts.black || 0);
    const margin = Math.abs(whitePts - blackPts);
    const bigger = Math.max(whitePts, blackPts);
    const smaller = Math.min(whitePts, blackPts);
    const pctDiff = smaller > 0 ? Math.floor((bigger / smaller) * 1000) / 10 - 100 : 0;
    const reason = gameHistory.result?.reason || 'Game finished by rules resolution.';

    let verdict = 'Game complete';
    const winner = gameHistory.winner || gameHistory.result?.winner;
    if (winner === 'draw') verdict = 'Draw';
    else if (winner) verdict = `${String(winner).toUpperCase()} won`;

    panel.style.display = 'block';
    panel.innerHTML = `
      <div style="font-weight:700; margin-bottom:4px;">Outcome: ${verdict}</div>
      <div style="font-size:13px; opacity:0.92; margin-bottom:2px;">Reason: ${reason}</div>
      <div style="font-size:13px; opacity:0.92;">Score: White ${whitePts} - Black ${blackPts} (margin = ${margin}${smaller > 0 ? ` (${pctDiff}%)` : ''})</div>
    `;
  }

  function setupControls() {
    const firstBtn = document.getElementById('first-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const lastBtn = document.getElementById('last-btn');
    const playBtn = document.getElementById('play-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const copyPositionsBtn = document.getElementById('import-copy-positions-btn');
    const shapeToggleBtn = document.getElementById('import-shape-toggle-btn');

    if (!firstBtn || !prevBtn || !nextBtn || !lastBtn || !playBtn || !pauseBtn || !shapeToggleBtn) return;

    firstBtn.onclick = () => { stopAutoPlay(); showMove(0); };
    prevBtn.onclick = () => { stopAutoPlay(); showMove(currentMoveIndex - 1); };
    nextBtn.onclick = () => { stopAutoPlay(); showMove(currentMoveIndex + 1); };
    lastBtn.onclick = () => { stopAutoPlay(); showMove(boardStates.length - 1); };
    playBtn.onclick = () => startAutoPlay();
    pauseBtn.onclick = () => stopAutoPlay();
    if (copyPositionsBtn) copyPositionsBtn.onclick = () => copyReviewBoardPositions();

    const syncShapeLabel = () => {
      if (!renderer) return;
      shapeToggleBtn.textContent = renderer.isDiamond45() ? '□ Square' : '◇ Rhombus';
    };
    syncShapeLabel();
    shapeToggleBtn.onclick = () => {
      renderer.toggleDiamond45();
      syncShapeLabel();
    };

    document.querySelectorAll('.rotate-color-btn-sm').forEach(btn => {
      btn.onclick = () => {
        const color = btn.dataset.color;
        renderer.rotateToPlayer(color);
      };
    });

    document.removeEventListener('keydown', handleKeyPress);
    document.addEventListener('keydown', handleKeyPress);
  }

  function handleKeyPress(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    switch (e.key) {
      case 'ArrowLeft':
        stopAutoPlay();
        showMove(currentMoveIndex - 1);
        break;
      case 'ArrowRight':
        stopAutoPlay();
        showMove(currentMoveIndex + 1);
        break;
      case ' ':
        e.preventDefault();
        if (autoPlayInterval) stopAutoPlay(); else startAutoPlay();
        break;
      case 'Home':
        stopAutoPlay();
        showMove(0);
        break;
      case 'End':
        stopAutoPlay();
        showMove(boardStates.length - 1);
        break;
    }
  }

  function startAutoPlay() {
    if (autoPlayInterval) return;

    const playBtn = document.getElementById('play-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const speedSelect = document.getElementById('speed-select');
    if (!playBtn || !pauseBtn || !speedSelect) return;
    const speed = parseInt(speedSelect.value, 10);

    playBtn.style.display = 'none';
    pauseBtn.style.display = 'inline-block';

    autoPlayInterval = setInterval(() => {
      if (currentMoveIndex >= boardStates.length - 1) {
        stopAutoPlay();
        return;
      }
      showMove(currentMoveIndex + 1);
    }, speed);
  }

  function stopAutoPlay() {
    if (autoPlayInterval) {
      clearInterval(autoPlayInterval);
      autoPlayInterval = null;
    }

    const playBtn = document.getElementById('play-btn');
    const pauseBtn = document.getElementById('pause-btn');
    if (playBtn) playBtn.style.display = 'inline-block';
    if (pauseBtn) pauseBtn.style.display = 'none';
  }

  function pieceToToken(piece) {
    if (!piece) return '';
    const prefix = piece.color === 'white' ? 'W' : 'B';
    const map = {
      king: 'King',
      queen: 'Queen',
      bishop: 'Bishop',
      knight: 'Knight',
      pawn: 'Pawn',
      rook: 'Rook',
      fort: 'Fort',
    };
    return `${prefix}${map[piece.type] || 'Pawn'}`;
  }

  function boardToCsv(board) {
    if (!board || !Array.isArray(board)) return '';
    const lines = [];
    for (let r = 0; r < 8; r++) {
      const row = [];
      for (let c = 0; c < 8; c++) row.push(pieceToToken(board[r]?.[c] || null));
      lines.push(row.join(','));
    }
    return lines.join('\n');
  }

  async function copyReviewBoardPositions() {
    const activeBoard = boardStates[currentMoveIndex] || boardStates[0] || null;
    try {
      const text = boardToCsv(activeBoard);
      await navigator.clipboard.writeText(text);
      if (typeof Toast !== 'undefined' && Toast.success) Toast.success('Board positions copied as CSV!', 2000);
    } catch {
      if (typeof Toast !== 'undefined' && Toast.error) Toast.error('Could not copy board positions.', 2500);
    }
  }

  function cleanup() {
    stopAutoPlay();
    document.removeEventListener('keydown', handleKeyPress);
    renderer = null;
    gameHistory = null;
    moveHistory = [];
    boardStates = [];
    currentMoveIndex = -1;
  }

  return { render, cleanup };
})();