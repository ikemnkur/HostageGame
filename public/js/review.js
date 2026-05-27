/* ─── Game Review Page ────────────────────────────────── */

window.ReviewPage = (() => {
  let renderer = null;
  let gameHistory = null;
  let moveHistory = [];
  let currentMoveIndex = -1;
  let autoPlayInterval = null;
  let boardStates = [];

  function getUser() {
    try { return JSON.parse(localStorage.getItem('hostage_user') || localStorage.getItem('HostageChess_user')); } catch { return null; }
  }

  async function fetchGameHistory(gameId) {
    try {
      const res = await fetch(`/api/games/${gameId}/history`);
      return await res.json();
    } catch (err) {
      console.error('Failed to fetch game history:', err);
      return null;
    }
  }

  async function render(gameId) {
    const user = getUser();
    if (!user) {
      window.App.navigate('/');
      return;
    }

    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="review-page">
        <div class="game-header">
          <button id="back-to-stats" class="btn-secondary">← Stats</button>
          <h2 id="review-title">Game Review</h2>
          <div></div>
        </div>

        <div class="review-body">
         <div class="review-right">
            <div class="move-history-panel card">
              <div class="move-log-header">
                <h3>Move History</h3>
                <div class="move-log-actions">
                  <button id="review-copy-positions-btn" class="btn-sm" title="Copy board positions CSV">♟ Copy Positions</button>
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
                <button id="review-shape-toggle-btn" class="btn-secondary" title="Toggle rhombus/square board">◇ Rhombus</button>
              </div>
            </div>

            <div class="game-info-panel card">
              <h3>Game Information</h3>
              <div id="review-outcome-details" class="card" style="display:none; margin-bottom:10px; padding:10px 12px;"></div>
              <div id="game-info-content">Loading...</div>
            </div>
          </div>

         
        </div>
      </div>
    `;

    document.getElementById('back-to-stats').addEventListener('click', () => {
      cleanup();
      window.App.navigate('/stats');
    });

    const container = document.getElementById('board-container');
    renderer = BoardRenderer.create(container, { size: Math.min(480, window.innerWidth - 40) });

    // Load game history
    gameHistory = await fetchGameHistory(gameId);
    if (!gameHistory) {
      document.getElementById('game-info-content').innerHTML = '<p class="error-msg">Failed to load game.</p>';
      return;
    }

    initializeReview();
    setupControls();
  }

  function initializeReview() {
    moveHistory = gameHistory.moveHistory || [];
    
    // Build board states for each move
    boardStates = [];
    let board = HostageEngine.createStartingBoard();
    boardStates.push(HostageEngine.cloneBoard(board));

    moveHistory.forEach((move, index) => {
      if (move.from && move.to) {
        const result = HostageEngine.processMove(board, move.color, move.from, move.to);
        if (result.valid) {
          board = result.board;
          boardStates.push(HostageEngine.cloneBoard(board));
        } else {
          // If move is invalid in engine, try to apply it manually (for backwards compatibility)
          board[move.to[0]][move.to[1]] = board[move.from[0]][move.from[1]];
          board[move.from[0]][move.from[1]] = null;
          boardStates.push(HostageEngine.cloneBoard(board));
        }
      } else {
        // Non-move events (resign, timeout, etc.)
        boardStates.push(HostageEngine.cloneBoard(board));
      }
    });

    currentMoveIndex = -1;
    showMove(0);
    renderMoveList();
    renderGameInfo();
  }

  function showMove(index) {
    if (index < 0) index = 0;
    if (index >= boardStates.length) index = boardStates.length - 1;
    
    currentMoveIndex = index;
    renderer.setBoard(boardStates[index]);
    renderer.clearHighlights();

    // Highlight the move if applicable
    if (index > 0 && moveHistory[index - 1]) {
      const move = moveHistory[index - 1];
      if (move.from && move.to) {
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

  function updateMoveIndicator() {
    const indicator = document.getElementById('move-indicator');
    if (currentMoveIndex === 0) {
      indicator.textContent = 'Start Position';
    } else {
      const move = moveHistory[currentMoveIndex - 1];
      indicator.textContent = `Move ${currentMoveIndex}: ${formatMove(move)}`;
    }
  }

  function formatMove(move) {
    if (move.event === 'resigned') return `${move.username} resigned`;
    if (move.event === 'eliminated') return `${String(move.color || '').toUpperCase()} eliminated (${move.reason || 'timeout'})`;
    if (move.event === 'turnSkipped') return `${String(move.color || '').toUpperCase()} turn skipped (${move.reason || 'timeout'})`;
    if (move.event === 'draw') return 'Draw agreed';
    if (move.from && move.to) {
      return `${move.username} (${move.color}): [${move.from}] → [${move.to}]`;
    }
    return 'Unknown move';
  }

  function renderMoveList() {
    const container = document.getElementById('move-list');
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

    // Add click handlers
    container.querySelectorAll('.move-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
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
    const players = gameHistory.players || [];
    const winner = gameHistory.winner;
    
    const playersHtml = players.map(p => {
      const isWinner = p.color === winner;
      return `
        <div class="player-info ${isWinner ? 'winner' : ''}">
          <span class="player-badge ${p.color}">${p.username}</span>
          ${isWinner ? '<span class="winner-badge">👑</span>' : ''}
        </div>
      `;
    }).join('');

    const result = winner === 'draw' ? 'Draw' : `Winner: ${winner}`;

    content.innerHTML = `
      <div class="info-grid">
        <div class="info-item">
          <strong>Game Name:</strong> ${gameHistory.name || 'N/A'}
        </div>
        <div class="info-item">
          <strong>Result:</strong> ${result}
        </div>
        <div class="info-item">
          <strong>Total Moves:</strong> ${moveHistory.length}
        </div>
        <div class="info-item">
          <strong>Players:</strong>
          <div class="players-list">${playersHtml}</div>
        </div>
      </div>
    `;

    renderOutcomeDetails();
  }

  function renderOutcomeDetails() {
    const panel = document.getElementById('review-outcome-details');
    if (!panel || !gameHistory) return;

    if (gameHistory.status !== 'finished') {
      panel.style.display = 'none';
      panel.innerHTML = '';
      return;
    }

    const pts = gameHistory.points || { white: 0, black: 0 };
    const margin = Math.abs((pts.white || 0) - (pts.black || 0));
    const result = gameHistory.result || {};
    const reason = result.reason || 'Game finished by rules resolution.';
    const resultType = result.type || (gameHistory.winner === 'draw' ? 'draw' : 'win');

    let verdict = 'Game complete';
    if (gameHistory.winner === 'draw') {
      verdict = resultType === 'null' ? 'Null game' : 'Draw';
    } else if (gameHistory.winner) {
      verdict = `${String(gameHistory.winner).toUpperCase()} won`;
    }

    panel.style.display = 'block';
    panel.innerHTML = `
      <div style="font-weight:700; margin-bottom:4px;">Outcome: ${verdict}</div>
      <div style="font-size:13px; opacity:0.92; margin-bottom:2px;">Reason: ${reason}</div>
      <div style="font-size:13px; opacity:0.92;">Score: White ${pts.white} - Black ${pts.black} (margin = ${margin}  (${Math.floor((Math.max(pts.white, pts.black) / Math.min(pts.white, pts.black)) * 1000)/10 - 100}%)</div>
    `;
  }

  function setupControls() {
    const firstBtn = document.getElementById('first-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const lastBtn = document.getElementById('last-btn');
    const playBtn = document.getElementById('play-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const speedSelect = document.getElementById('speed-select');
    const copyPositionsBtn = document.getElementById('review-copy-positions-btn');
    const shapeToggleBtn = document.getElementById('review-shape-toggle-btn');

    firstBtn.addEventListener('click', () => {
      stopAutoPlay();
      showMove(0);
    });

    prevBtn.addEventListener('click', () => {
      stopAutoPlay();
      showMove(currentMoveIndex - 1);
    });

    nextBtn.addEventListener('click', () => {
      stopAutoPlay();
      showMove(currentMoveIndex + 1);
    });

    lastBtn.addEventListener('click', () => {
      stopAutoPlay();
      showMove(boardStates.length - 1);
    });

    playBtn.addEventListener('click', () => {
      startAutoPlay();
    });

    pauseBtn.addEventListener('click', () => {
      stopAutoPlay();
    });

    if (copyPositionsBtn) {
      copyPositionsBtn.addEventListener('click', () => copyReviewBoardPositions());
    }

    const syncShapeLabel = () => {
      if (!shapeToggleBtn || !renderer) return;
      shapeToggleBtn.textContent = renderer.isDiamond45() ? '□ Square' : '◇ Rhombus';
    };
    syncShapeLabel();
    if (shapeToggleBtn) {
      shapeToggleBtn.addEventListener('click', () => {
        renderer.toggleDiamond45();
        syncShapeLabel();
      });
    }

    // Rotation controls
    document.querySelectorAll('.rotate-color-btn-sm').forEach(btn => {
      btn.addEventListener('click', () => {
        const color = btn.dataset.color;
        renderer.rotateToPlayer(color);
      });
    });

    // Keyboard controls
    document.addEventListener('keydown', handleKeyPress);
  }

  function handleKeyPress(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    switch(e.key) {
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
        if (autoPlayInterval) {
          stopAutoPlay();
        } else {
          startAutoPlay();
        }
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
    const speed = parseInt(speedSelect.value);

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
    playBtn.style.display = 'inline-block';
    pauseBtn.style.display = 'none';
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
      if (typeof Toast !== 'undefined' && Toast.success) {
        Toast.success('Board positions copied as CSV!', 2000);
      }
    } catch {
      if (typeof Toast !== 'undefined' && Toast.error) {
        Toast.error('Could not copy board positions.', 2500);
      }
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
