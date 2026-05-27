/* ─── Practice Page ──────────────────────────────────── */

window.PracticePage = (() => {
  let renderer = null;
  let gameState = null;
  let selectedPiece = null;
  let practiceMode = 'self';
  let humanSide = 'white';
  let aiTurnTimer = null;
  let practiceMoveHistory = [];
  let practiceStartedAt = null;

  function getUser() {
    try { return JSON.parse(localStorage.getItem('hostage_user') || localStorage.getItem('HostageChess_user')); } catch { return null; }
  }

  function render() {
    const user = getUser();
    if (!user) {
      window.App.navigate('/');
      return;
    }

    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="practice-page">
        <div class="game-header">
          <button id="back-to-lobby" class="btn-secondary">← Lobby</button>
          <h2>Practice</h2>
          <div></div>
        </div>

        <div class="practice-toolbar">
          <label style="color: var(--text-muted);">Mode</label>
          <select id="practice-mode-select">
            <option value="self">Self / Pass & Play</option>
            <option value="computer">Vs Computer</option>
          </select>
          <label style="color: var(--text-muted);">Side</label>
          <select id="practice-side-select">
            <option value="white">Play White</option>
            <option value="black">Play Black</option>
          </select>
          <button id="practice-promote-btn" class="btn-secondary" disabled>Promote</button>
          <button id="practice-demote-btn" class="btn-secondary" disabled>Demote</button>
          <button id="practice-reset-btn" class="btn-secondary">New Practice Game</button>
        </div>

        <div class="card practice-status-card">
          <div class="practice-status-line" id="practice-status-line">Loading practice board…</div>
          <div class="practice-status-help" id="practice-status-help">Practice mode follows game rules. Use Self / Pass & Play for two local players, or Vs Computer for solo drills.</div>
        </div>

        <div class="card practice-status-card" id="practice-outcome-details" style="display:none; margin-top:10px;">
          <div class="practice-status-line" id="practice-outcome-line"></div>
          <div class="practice-status-help" id="practice-outcome-help"></div>
        </div>

        <div class="rotation-controls" style="margin-top: 12px; display: flex; gap: 8px; justify-content: center; align-items:center;">
          <label style="color: var(--text-muted);">Board:</label>
          <button id="practice-view-white" class="btn-secondary">White at Top (A1 bottom)</button>
          <button id="practice-view-black" class="btn-secondary">Black at Top (H8 bottom)</button>
        </div>

        <div class="practice-layout">
          <div class="practice-main">
            <div class="board-container" id="practice-board-container"></div>
            <div class="board-controls" style="margin-top:10px;">
              <button id="practice-shape-toggle-btn" class="btn-secondary" title="Toggle rhombus/square board">□ Square</button>
            </div>
            <p class="error-msg" id="practice-info"></p>
          </div>
          <div class="practice-side">
            <div class="card practice-move-history-panel">
              <div class="move-log-header">
                <h3>Move History</h3>
                <div class="move-log-actions">
                  <button id="practice-download-btn" class="btn-sm" title="Download practice history">⬇ Download</button>
                  <button id="practice-copy-json-btn" class="btn-sm" title="Copy JSON">📄 Copy JSON</button>
                  <button id="practice-copy-positions-btn" class="btn-sm" title="Copy board positions CSV">♟ Copy Positions</button>
                </div>
              </div>
              <div class="move-list" id="practice-move-list">
                <p class="empty-message">No moves yet.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('back-to-lobby').addEventListener('click', () => window.App.navigate('/lobby'));

    const container = document.getElementById('practice-board-container');
    renderer = BoardRenderer.create(container, {
      size: Math.min(560, window.innerWidth - 40),
      diamond45: true,
      diamondScale: 0.68,
      pieceRotationDeg: 0,
    });
    renderer.onClick(handleClick);

    document.getElementById('practice-mode-select').addEventListener('change', (e) => {
      practiceMode = e.target.value;
      document.getElementById('practice-side-select').disabled = practiceMode !== 'computer';
      resetGame();
    });

    document.getElementById('practice-side-select').addEventListener('change', (e) => {
      humanSide = e.target.value;
      if (renderer) renderer.setRotation(humanSide === 'black' ? 180 : 0);
      resetGame();
    });

    document.getElementById('practice-promote-btn').addEventListener('click', () => {
      if (!gameState || !selectedPiece) return;
      const [r, c] = selectedPiece;
      const moverColor = gameState.turn;
      const promoteResult = HostageEngine.applyMove(gameState, [r, c], [r, c], { promote: true });
      if (!promoteResult.valid) {
        setInfo(promoteResult.error || 'Promotion is not legal for this selection.');
        updateActionButtons();
        return;
      }

      gameState = promoteResult.state;
      selectedPiece = null;
      renderer.clearHighlights();
      renderer.setBoard(gameState.board);
      renderer.setLastMove([r, c], [r, c]);
      appendPracticeMove({ color: moverColor, from: [r, c], to: [r, c], action: 'promote' });
      setInfo('Promotion complete.');
      updateStatus();
      updateActionButtons();
      queueComputerMoveIfNeeded();
    });

    document.getElementById('practice-demote-btn').addEventListener('click', () => {
      if (!gameState || !selectedPiece) return;
      const [r, c] = selectedPiece;
      const moverColor = gameState.turn;
      const demoteResult = HostageEngine.applyMove(gameState, [r, c], [r, c], { demote: true });
      if (!demoteResult.valid) {
        setInfo(demoteResult.error || 'Demotion is not legal for this selection.');
        updateActionButtons();
        return;
      }

      gameState = demoteResult.state;
      selectedPiece = null;
      renderer.clearHighlights();
      renderer.setBoard(gameState.board);
      renderer.setLastMove([r, c], [r, c]);
      appendPracticeMove({ color: moverColor, from: [r, c], to: [r, c], action: 'demote' });
      setInfo('Demotion complete.');
      updateStatus();
      updateActionButtons();
      queueComputerMoveIfNeeded();
    });

    document.getElementById('practice-reset-btn').addEventListener('click', () => resetGame());
    document.getElementById('practice-view-white').addEventListener('click', () => renderer.setRotation(0));
    document.getElementById('practice-view-black').addEventListener('click', () => renderer.setRotation(180));
    const practiceShapeToggleBtn = document.getElementById('practice-shape-toggle-btn');
    const syncPracticeShapeLabel = () => {
      if (!practiceShapeToggleBtn || !renderer) return;
      practiceShapeToggleBtn.textContent = renderer.isDiamond45() ? '□ Square' : '◇ Rhombus';
    };
    syncPracticeShapeLabel();
    if (practiceShapeToggleBtn) {
      practiceShapeToggleBtn.addEventListener('click', () => {
        renderer.toggleDiamond45();
        syncPracticeShapeLabel();
      });
    }
    document.getElementById('practice-download-btn').addEventListener('click', () => downloadPracticeHistory());
    document.getElementById('practice-copy-json-btn').addEventListener('click', () => copyPracticeHistoryJson());
    document.getElementById('practice-copy-positions-btn').addEventListener('click', () => copyPracticeBoardPositions());

    document.getElementById('practice-side-select').disabled = false;
    resetGame();
  }

  function setInfo(text) {
    const el = document.getElementById('practice-info');
    if (el) el.textContent = text;
  }

  function setStatus(mainText, helpText) {
    const line = document.getElementById('practice-status-line');
    const help = document.getElementById('practice-status-help');
    if (line) line.textContent = mainText;
    if (help) help.textContent = helpText;
  }

  function renderOutcomeDetails() {
    const card = document.getElementById('practice-outcome-details');
    const line = document.getElementById('practice-outcome-line');
    const help = document.getElementById('practice-outcome-help');
    if (!card || !line || !help || !gameState) return;

    if (gameState.status !== 'finished' || !gameState.result) {
      card.style.display = 'none';
      line.textContent = '';
      help.textContent = '';
      return;
    }

    const pts = gameState.points || { white: 0, black: 0 };
    const margin = Math.abs((pts.white || 0) - (pts.black || 0));
    const reason = gameState.result.reason || 'Game finished by rules resolution.';
    const verdict = gameState.result.type === 'win'
      ? `${String(gameState.result.winner || '').toUpperCase()} wins`
      : (gameState.result.type === 'null' ? 'Null game' : 'Draw');

    line.textContent = `Outcome: ${verdict} · White ${pts.white} - Black ${pts.black} (margin = ${margin}  (${Math.floor((Math.max(pts.white, pts.black) / Math.min(pts.white, pts.black)) * 1000)/10 - 100}%)`;
    help.textContent = `Reason: ${reason}`;
    card.style.display = 'block';
  }

  function resetGame() {
    if (aiTurnTimer) {
      clearTimeout(aiTurnTimer);
      aiTurnTimer = null;
    }
    gameState = HostageEngine.createGameState();
    practiceMoveHistory = [];
    practiceStartedAt = new Date().toISOString();
    selectedPiece = null;
    setInfo('');
    if (renderer) {
      renderer.clearHighlights();
      renderer.clearLastMove();
      renderer.setBoard(gameState.board);
      renderer.setRotation(practiceMode === 'computer' && humanSide === 'black' ? 180 : 0);
    }
    updateStatus();
    renderOutcomeDetails();
    renderPracticeMoveHistory();
    updateActionButtons();
    queueComputerMoveIfNeeded();
  }

  function formatPracticeMove(entry) {
    if (!entry) return '';
    if (entry.action === 'promote') return `${entry.moveNumber}. ${entry.color}: ${formatSquare(entry.from)} promote`;
    if (entry.action === 'demote') return `${entry.moveNumber}. ${entry.color}: ${formatSquare(entry.from)} demote`;
    return `${entry.moveNumber}. ${entry.color}: ${formatSquare(entry.from)} -> ${formatSquare(entry.to)}`;
  }

  function renderPracticeMoveHistory() {
    const listEl = document.getElementById('practice-move-list');
    if (!listEl) return;

    if (practiceMoveHistory.length === 0) {
      listEl.innerHTML = '<p class="empty-message">No moves yet.</p>';
      return;
    }

    listEl.innerHTML = practiceMoveHistory.map((entry) => {
      return `<div class="move-item ${entry.color}"><span class="move-text">${formatPracticeMove(entry)}</span></div>`;
    }).join('');
    listEl.scrollTop = listEl.scrollHeight;
  }

  function appendPracticeMove(moveData) {
    const entry = {
      moveNumber: practiceMoveHistory.length + 1,
      color: moveData.color || 'unknown',
      from: moveData.from,
      to: moveData.to,
      action: moveData.action || 'move',
    };
    practiceMoveHistory.push(entry);
    renderPracticeMoveHistory();
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

  async function copyPracticeBoardPositions() {
    try {
      const text = boardToCsv(gameState?.board || renderer?.getBoard?.() || null);
      await navigator.clipboard.writeText(text);
      if (typeof Toast !== 'undefined' && Toast.success) {
        Toast.success('Board positions copied as CSV!', 2000);
      } else {
        setInfo('Board positions copied as CSV.');
      }
    } catch {
      if (typeof Toast !== 'undefined' && Toast.error) {
        Toast.error('Could not copy board positions.', 2500);
      } else {
        setInfo('Could not copy board positions.');
      }
    }
  }

  function buildPracticeExportPayload() {
    const nowIso = new Date().toISOString();
    const status = gameState?.status || 'playing';
    const baseMoveHistory = Array.isArray(gameState?.moveHistory) ? gameState.moveHistory : [];

    return {
      id: `practice-${Date.now()}`,
      name: 'Practice Session',
      status,
      mode: practiceMode,
      humanSide,
      createdAt: practiceStartedAt || nowIso,
      exportedAt: nowIso,
      turn: gameState?.turn || null,
      points: gameState?.points || { white: 0, black: 0 },
      result: gameState?.result || null,
      moveHistory: practiceMoveHistory.map((m) => ({
        moveNumber: m.moveNumber,
        color: m.color,
        from: m.from,
        to: m.to,
        action: m.action,
      })),
      engineMoveHistory: baseMoveHistory,
      finalBoard: gameState?.board || null,
      meta: {
        source: 'practice',
        version: 1,
      },
    };
  }

  function downloadPracticeHistory() {
    try {
      const payload = buildPracticeExportPayload();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `practice-history-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      if (typeof Toast !== 'undefined' && Toast.success) {
        Toast.success('Practice history downloaded!', 2000);
      }
    } catch {
      if (typeof Toast !== 'undefined' && Toast.error) {
        Toast.error('Could not download practice history.', 3000);
      }
    }
  }

  async function copyPracticeHistoryJson() {
    try {
      const payload = buildPracticeExportPayload();
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      if (typeof Toast !== 'undefined' && Toast.success) {
        Toast.success('Practice JSON copied to clipboard!', 2000);
      }
    } catch {
      if (typeof Toast !== 'undefined' && Toast.error) {
        Toast.error('Could not copy practice JSON.', 3000);
      }
    }
  }

  function canPromoteSelected() {
    if (!gameState || gameState.status !== 'playing' || !selectedPiece) return false;
    const [r, c] = selectedPiece;
    const piece = gameState.board?.[r]?.[c];
    if (!piece || piece.color !== gameState.turn || piece.type !== 'pawn' || !piece.paired) return false;
    const probe = HostageEngine.applyMove(gameState, [r, c], [r, c], { promote: true });
    return !!probe.valid;
  }

  function canDemoteSelected() {
    if (!gameState || gameState.status !== 'playing' || !selectedPiece) return false;
    const [r, c] = selectedPiece;
    const piece = gameState.board?.[r]?.[c];
    if (!piece || piece.color !== gameState.turn || (piece.type !== 'rook' && piece.type !== 'fort')) return false;
    const probe = HostageEngine.applyMove(gameState, [r, c], [r, c], { demote: true });
    return !!probe.valid;
  }

  function updateActionButtons() {
    const promoteBtn = document.getElementById('practice-promote-btn');
    if (promoteBtn) promoteBtn.disabled = !canPromoteSelected();
    const demoteBtn = document.getElementById('practice-demote-btn');
    if (demoteBtn) demoteBtn.disabled = !canDemoteSelected();
  }

  function updateStatus() {
    if (!gameState) return;

    if (gameState.status === 'finished' && gameState.result) {
      if (gameState.result.type === 'win') {
        setStatus(
          `Practice result: ${gameState.result.winner.toUpperCase()} wins (${gameState.points.white}-${gameState.points.black})`,
          `Reset the board to try another line or switch between solo and pass-and-play practice. Reason: ${gameState.result.reason || 'Rules resolution'}.`
        );
      } else if (gameState.result.type === 'null') {
        setStatus(
          `Practice result: NULL (${gameState.points.white}-${gameState.points.black})`,
          `${gameState.result.reason || 'Both queens were lost behind enemy lines before returning to their own side.'}`
        );
      } else {
        setStatus(
          `Practice result: DRAW (${gameState.points.white}-${gameState.points.black})`,
          `The round resolved level. Reason: ${gameState.result.reason || 'Rules resolution'}. Reset to test a different continuation.`
        );
      }
      renderOutcomeDetails();
      return;
    }

    const turnOwner = gameState.turn.toUpperCase();
    if (practiceMode === 'computer') {
      const actor = gameState.turn === humanSide ? 'Your move' : 'Computer thinking';
      setStatus(`${actor} · ${turnOwner} to move`, 'Practice mode enforces turns and real game rules.');
      return;
    }

    setStatus(`${turnOwner} to move · Self / Pass & Play`, 'Use this mode for local two-player practice or solo line exploration under full rules.');
    renderOutcomeDetails();
  }

  function canHumanAct() {
    if (!gameState || gameState.status !== 'playing') return false;
    if (practiceMode === 'self') return true;
    return gameState.turn === humanSide && !aiTurnTimer;
  }

  function handleClick(r, c, meta = {}) {
    if (!renderer || !gameState || !canHumanAct()) return;

    const board = gameState.board;
    const turnColor = gameState.turn;

    if ((meta.clickCount || 1) >= 3 && board[r][c] && board[r][c].color === turnColor) {
      const piece = board[r][c];
      if (piece.type === 'rook' || piece.type === 'fort') {
        const demoteResult = HostageEngine.applyMove(gameState, [r, c], [r, c], { demote: true });
        if (!demoteResult.valid) {
          setInfo(demoteResult.error || 'Demotion failed.');
          selectedPiece = null;
          renderer.clearHighlights();
          updateActionButtons();
          return;
        }

        gameState = demoteResult.state;
        selectedPiece = null;
        renderer.clearHighlights();
        renderer.setBoard(gameState.board);
        renderer.setLastMove([r, c], [r, c]);
        appendPracticeMove({ color: turnColor, from: [r, c], to: [r, c], action: 'demote' });
        setInfo('Demotion complete.');
        updateStatus();
        updateActionButtons();
        queueComputerMoveIfNeeded();
        return;
      }
    }

    if (!selectedPiece) {
      if (board[r][c] && board[r][c].color === turnColor) {
        selectedPiece = [r, c];
        renderer.setSelected([r, c]);
        renderer.setLegalMoves(HostageEngine.getLegalMoves(board, turnColor, r, c));
        updateActionButtons();
      }
      return;
    }

    const [sr, sc] = selectedPiece;
    const fromPiece = board[sr]?.[sc];

    if (!fromPiece) {
      selectedPiece = null;
      renderer.clearHighlights();
      updateActionButtons();
      return;
    }

    if (sr === r && sc === c) {
      selectedPiece = null;
      renderer.clearHighlights();
      updateActionButtons();
      return;
    }

    const legalMoves = HostageEngine.getLegalMoves(board, turnColor, sr, sc);
    const canMove = legalMoves.some(([mr, mc]) => mr === r && mc === c);
    if (!canMove) {
      if (board[r][c] && board[r][c].color === turnColor) {
        selectedPiece = [r, c];
        renderer.setSelected([r, c]);
        renderer.setLegalMoves(HostageEngine.getLegalMoves(board, turnColor, r, c));
        updateActionButtons();
      } else {
        selectedPiece = null;
        renderer.clearHighlights();
        updateActionButtons();
      }
      return;
    }

    const result = HostageEngine.applyMove(gameState, [sr, sc], [r, c]);
    if (!result.valid) {
      setInfo(result.error || 'Illegal move.');
      selectedPiece = null;
      renderer.clearHighlights();
      updateActionButtons();
      return;
    }

    gameState = result.state;
    selectedPiece = null;
    renderer.clearHighlights();
    renderer.setBoard(gameState.board);
    renderer.setLastMove([sr, sc], [r, c]);
    appendPracticeMove({ color: turnColor, from: [sr, sc], to: [r, c], action: 'move' });
    setInfo('');
    updateStatus();
    updateActionButtons();
    queueComputerMoveIfNeeded();
  }

  function queueComputerMoveIfNeeded() {
    if (practiceMode !== 'computer' || !gameState || gameState.status !== 'playing') return;
    if (gameState.turn === humanSide) return;

    if (aiTurnTimer) clearTimeout(aiTurnTimer);
    aiTurnTimer = setTimeout(() => {
      aiTurnTimer = null;
      playComputerMove();
    }, 550);
  }

  function playComputerMove() {
    if (!gameState || gameState.status !== 'playing') return;
    const moverColor = gameState.turn;
    const choice = pickComputerMove(gameState);
    if (!choice) {
      setInfo('Computer found no legal move. Reset the board to continue practicing.');
      return;
    }

    const result = HostageEngine.applyMove(gameState, choice.from, choice.to);
    if (!result.valid) {
      setInfo(result.error || 'Computer move failed.');
      return;
    }

    gameState = result.state;
    selectedPiece = null;
    if (renderer) {
      renderer.clearHighlights();
      renderer.setBoard(gameState.board);
      renderer.setLastMove(choice.from, choice.to);
    }
    appendPracticeMove({ color: moverColor, from: choice.from, to: choice.to, action: 'move' });
    setInfo(`Computer played ${formatSquare(choice.from)} → ${formatSquare(choice.to)}.`);
    updateStatus();
    queueComputerMoveIfNeeded();
  }

  function pickComputerMove(state) {
    return rankCandidateMoves(state, state.turn, 1)[0] || null;
  }

  function rankCandidateMoves(state, color = state.turn, limit = 5) {
    const candidates = enumerateCandidateMoves(state, color)
      .map((candidate) => scoreCandidateMove(state, candidate, color))
      .filter(Boolean);

    candidates.sort((a, b) => b.score - a.score || Math.random() - 0.5);
    return candidates.slice(0, limit);
  }

  function enumerateCandidateMoves(state, color) {
    const board = state.board;
    const candidates = [];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r]?.[c];
        if (!piece || piece.color !== color) continue;

        const legalMoves = HostageEngine.getLegalMoves(board, color, r, c);
        for (const [tr, tc] of legalMoves) {
          candidates.push({
            from: [r, c],
            to: [tr, tc],
            options: {},
            piece,
            target: board[tr]?.[tc] || null,
            label: `${formatSquare([r, c])} -> ${formatSquare([tr, tc])}`,
          });
        }

        if (piece.type === 'pawn' && piece.paired) {
          const probe = HostageEngine.applyMove(state, [r, c], [r, c], { promote: true });
          if (probe.valid) {
            candidates.push({
              from: [r, c],
              to: [r, c],
              options: { promote: true },
              piece,
              target: null,
              label: `${formatSquare([r, c])} promote`,
            });
          }
        }

        if (piece.type === 'rook' || piece.type === 'fort') {
          const probe = HostageEngine.applyMove(state, [r, c], [r, c], { demote: true });
          if (probe.valid) {
            candidates.push({
              from: [r, c],
              to: [r, c],
              options: { demote: true },
              piece,
              target: null,
              label: `${formatSquare([r, c])} demote`,
            });
          }
        }
      }
    }

    return candidates;
  }

  function scoreCandidateMove(state, candidate, moverColor) {
    const moveResult = HostageEngine.applyMove(state, candidate.from, candidate.to, candidate.options || {});
    if (!moveResult.valid) return null;

    const nextState = moveResult.state;
    const immediateScore = evaluateStateForColor(nextState, moverColor, candidate, moveResult.meta || {});

    let opponentReplyScore = 0;
    if (nextState.status === 'playing') {
      const opponentColor = nextState.turn;
      const replies = enumerateCandidateMoves(nextState, opponentColor);
      let bestReply = -Infinity;
      for (const reply of replies) {
        const replyResult = HostageEngine.applyMove(nextState, reply.from, reply.to, reply.options || {});
        if (!replyResult.valid) continue;
        bestReply = Math.max(bestReply, evaluateStateForColor(replyResult.state, opponentColor, reply, replyResult.meta || {}));
      }
      opponentReplyScore = Number.isFinite(bestReply) ? bestReply : 0;
    }

    return {
      ...candidate,
      score: immediateScore - (opponentReplyScore * 0.9) + (Math.random() * 0.05),
      immediateScore,
      opponentReplyScore,
    };
  }

  function evaluateStateForColor(state, color, candidate, meta) {
    const enemy = color === 'white' ? 'black' : 'white';
    const points = state.points || { white: 0, black: 0 };
    let score = (points[color] || 0) - (points[enemy] || 0);

    if (state.status === 'finished' && state.result) {
      if (state.result.type === 'win') {
        score += state.result.winner === color ? 1000 : -1000;
      } else if (state.result.type === 'draw') {
        score += 10;
      } else if (state.result.type === 'null') {
        score += 4;
      }
    }

    if (candidate.target && candidate.target.color !== color) {
      score += getPieceValue(candidate.target) * 2.5;
    }
    if (meta.promoted) score += 5;
    if (meta.demoted) score -= 1;
    if (meta.pushed) score += 1.5;
    if (meta.royalMeet) score += 6;

    score += getMobilityScore(state.board, color) * 0.04;
    score -= getMobilityScore(state.board, enemy) * 0.03;
    score += getHomePressureScore(state.board, color) * 0.08;
    score -= getHomePressureScore(state.board, enemy) * 0.05;

    return score;
  }

  function getPieceValue(piece) {
    if (!piece) return 0;
    const values = {
      king: 15,   
      queen: 10,
      rook: 6,
      fort: 4,
      bishop: 4,
      knight: 3,
      pawn: 1.5,
    };
    if (piece.type === 'pawn' && piece.paired) return values.pawn * 2;
    return values[piece.type] || 0;
  }

  function getMobilityScore(board, color) {
    let total = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r]?.[c];
        if (!piece || piece.color !== color) continue;
        total += HostageEngine.getLegalMoves(board, color, r, c).length;
      }
    }
    return total;
  }

  function getHomePressureScore(board, color) {
    const home = HostageEngine.CASTLE_HOME?.[color];
    if (!home) return 0;
    let score = 0;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r]?.[c];
        if (!piece || piece.color !== color) continue;
        const distance = Math.abs(home[0] - r) + Math.abs(home[1] - c);
        score += Math.max(0, 10 - distance) * (piece.type === 'queen' ? 1.2 : 0.6);
      }
    }

    return score;
  }

  function formatSquare(square) {
    const [r, c] = square;
    return `${String.fromCharCode(65 + c)}${8 - r}`;
  }

  function cleanup() {
    if (aiTurnTimer) {
      clearTimeout(aiTurnTimer);
      aiTurnTimer = null;
    }
    renderer = null;
    gameState = null;
    selectedPiece = null;
    practiceMoveHistory = [];
    practiceStartedAt = null;
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.HostageMoveAgent = {
      rankMoves: rankCandidateMoves,
      pickMove: pickComputerMove,
    };
  }

  return { render, cleanup, rankMoves: rankCandidateMoves, pickMove: pickComputerMove };
})();
