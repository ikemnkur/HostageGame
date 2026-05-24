/* ─── Hostage Lab (experimental sandbox) ─────────────── */

window.HostageLabPage = (() => {
//   const STARTING_CSV = `
// #Start-----------------------------------------
// BQueen,WKnight,WBishop,Wpawn,,,,,
// WBishop,WKing,Wpawn,,,,,
// WKnight,Wpawn,,,,,,
// Wpawn,,,,,,,
// ,,,,,,,Bpawn
// ,,,,,,Bpawn,BKnight
// ,,,,,Bpawn,BKing,BBishop
// ,,,,Bpawn,BBishop,BKnight,WQueen
// #End-----------------------------------------
// `;

  const STARTING_CSV = `
#Start-----------------------------------------
BQueen,WKnight,WBishop,Wpawn,Wpawn,,,,
WBishop,WKing,Wpawn,Wpawn,,,,
WKnight,Wpawn,,,,,,
Wpawn,Wpawn,,,,,,Bpawn,
Wpawn,,,,,,Bpawn,Bpawn
,,,,,,Bpawn,BKnight
,,,,Bpawn,Bpawn,BKing,BBishop
,,,Bpawn,Bpawn,BBishop,BKnight,WQueen
#End-----------------------------------------
`;
  const TOKEN_MAP = {
    king: 'king',
    queen: 'queen',
    bishop: 'bishop',
    knight: 'knight',
    pawn: 'pawn',
    rook: 'rook',
    fort: 'fort',
  };

  let renderer = null;
  let board = null;
  let mode = 'move';
  let selectedSide = 'white';
  let selectedType = 'pawn';
  let selectedPiece = null;
  let recentTap = { key: null, count: 0, ts: 0 };

  const CASTLE_BY_COLOR = {
    white: [7, 0], // A1 in white view
    black: [0, 7], // H8 in white view
  };

  const ORTHO_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const DIAG_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const KNIGHT_DIRS = [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]];

  function createEmptyBoard() {
    return Array.from({ length: 8 }, () => Array(8).fill(null));
  }

  function clonePiece(piece) {
    return piece ? { ...piece } : null;
  }

  function inBounds(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
  }

  function isCastleSquare(r, c, color) {
    const castle = CASTLE_BY_COLOR[color];
    return !!castle && castle[0] === r && castle[1] === c;
  }

  function canShareCastle(moving, target, tr, tc) {
    if (!moving || !target) return false;
    if (moving.color !== target.color) return false;
    const bothRoyal = (
      (moving.type === 'king' && target.type === 'queen') ||
      (moving.type === 'queen' && target.type === 'king')
    );
    return bothRoyal && isCastleSquare(tr, tc, moving.color);
  }

  function canLandOnSquare(piece, tr, tc, forCapture = true) {
    const target = board[tr][tc];
    if (!target) return true;

    if (piece.type === 'pawn') {
      if (target.type === 'pawn' && target.color === piece.color && !target.paired) return true;
      if (forCapture && target.color !== piece.color) return true;
      if (canShareCastle(piece, target, tr, tc)) return true;
      return false;
    }

    if (piece.type === 'queen') {
      if (canShareCastle(piece, target, tr, tc)) return true;
      return false;
    }

    if (piece.type === 'rook' || piece.type === 'fort') {
      return false;
    }

    if (target.color === piece.color) {
      return canShareCastle(piece, target, tr, tc);
    }

    return true;
  }

  function pushMoveIfAllowed(moves, piece, tr, tc, forCapture = true) {
    if (!inBounds(tr, tc)) return;
    if (!canLandOnSquare(piece, tr, tc, forCapture)) return;
    moves.push([tr, tc]);
  }

  function getSlidingMoves(r, c, dirs, piece) {
    const moves = [];
    for (const [dr, dc] of dirs) {
      let tr = r + dr;
      let tc = c + dc;
      while (inBounds(tr, tc)) {
        const target = board[tr][tc];
        if (!target) {
          moves.push([tr, tc]);
          tr += dr;
          tc += dc;
          continue;
        }

        if (target.color !== piece.color && canLandOnSquare(piece, tr, tc, true)) {
          moves.push([tr, tc]);
        } else if (target.color === piece.color && canShareCastle(piece, target, tr, tc)) {
          moves.push([tr, tc]);
        }
        break;
      }
    }
    return moves;
  }

  function getRookOrFortMoves(r, c, piece) {
    const moves = [];
    for (const [dr, dc] of ORTHO_DIRS) {
      let tr = r + dr;
      let tc = c + dc;
      while (inBounds(tr, tc)) {
        if (!board[tr][tc]) {
          if (!isCastleSquare(tr, tc, piece.color)) moves.push([tr, tc]);
          tr += dr;
          tc += dc;
          continue;
        }

        const pushR = tr + dr;
        const pushC = tc + dc;
        if (inBounds(pushR, pushC) && !board[pushR][pushC] && !isCastleSquare(tr, tc, piece.color)) {
          moves.push([tr, tc]);
        }
        break;
      }
    }
    return moves;
  }

  function getPawnSingleMoves(r, c, piece) {
    const moves = [];
    for (const [dr, dc] of ORTHO_DIRS) {
      const tr = r + dr;
      const tc = c + dc;
      if (!inBounds(tr, tc)) continue;
      const target = board[tr][tc];
      if (!target) {
        moves.push([tr, tc]);
      } else if (target.type === 'pawn' && target.color === piece.color && !target.paired) {
        moves.push([tr, tc]);
      }
    }

    for (const [dr, dc] of DIAG_DIRS) {
      const tr = r + dr;
      const tc = c + dc;
      if (!inBounds(tr, tc)) continue;
      const target = board[tr][tc];
      if (target && target.color !== piece.color) {
        moves.push([tr, tc]);
      }
    }

    return moves;
  }

  function getLegalMovesForPiece(r, c) {
    const piece = board[r][c];
    if (!piece) return [];

    if (piece.type === 'pawn') {
      if (piece.paired) {
        const moves = getPawnSingleMoves(r, c, { color: piece.color, type: 'pawn' });
        return moves.filter(([tr, tc]) => board[tr][tc] === null);
      }
      return getPawnSingleMoves(r, c, piece);
    }

    if (piece.type === 'king') {
      const moves = [];
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          if (dr === 0 && dc === 0) continue;
          if (Math.abs(dr) > 2 || Math.abs(dc) > 2) continue;
          pushMoveIfAllowed(moves, piece, r + dr, c + dc, true);
        }
      }
      return moves;
    }

    if (piece.type === 'queen') {
      const moves = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const tr = r + dr;
          const tc = c + dc;
          if (!inBounds(tr, tc)) continue;
          if (!board[tr][tc] || canShareCastle(piece, board[tr][tc], tr, tc)) moves.push([tr, tc]);
        }
      }
      return moves;
    }

    if (piece.type === 'rook' || piece.type === 'fort') {
      return getRookOrFortMoves(r, c, piece);
    }

    if (piece.type === 'bishop') {
      return getSlidingMoves(r, c, DIAG_DIRS, piece);
    }

    if (piece.type === 'knight') {
      const moves = [];
      for (const [dr, dc] of KNIGHT_DIRS) {
        pushMoveIfAllowed(moves, piece, r + dr, c + dc, true);
      }
      return moves;
    }

    return [];
  }

  function canMoveTo(sr, sc, tr, tc) {
    const moves = getLegalMovesForPiece(sr, sc);
    return moves.some(([mr, mc]) => mr === tr && mc === tc);
  }

  function tokenToPiece(token) {
    const trimmed = String(token || '').trim();
    if (!trimmed) return null;

    const m = /^([WB])\s*(King|Queen|Bishop|Knight|Pawn|Rook|Fort)$/i.exec(trimmed);
    if (!m) return null;

    const color = m[1].toUpperCase() === 'W' ? 'white' : 'black';
    const typeKey = String(m[2] || '').toLowerCase();
    const type = TOKEN_MAP[typeKey] || 'pawn';
    return { color, type };
  }

  function loadBoardFromCsv(csvText) {
    const b = createEmptyBoard();
    const lines = String(csvText || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));

    for (let r = 0; r < 8; r++) {
      const row = (lines[r] || '').split(',');
      for (let c = 0; c < 8; c++) {
        b[r][c] = tokenToPiece(row[c] || '');
      }
    }

    return b;
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

  function boardToCsv() {
    const lines = [];
    for (let r = 0; r < 8; r++) {
      const row = [];
      for (let c = 0; c < 8; c++) row.push(pieceToToken(board[r][c]));
      lines.push(row.join(','));
    }
    return lines.join('\n');
  }

  function setInfo(text) {
    const el = document.getElementById('hostage-info');
    if (el) el.textContent = text;
  }

  function render() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="practice-page hostage-lab-page">
        <div class="game-header" style="justify-content:space-between; display:flex; align-items:center; margin-bottom:16px;">
          <button id="back-to-lobby" class="btn-secondary">← Lobby</button>
          <h2>Hostage Lab (Experimental)</h2>
          <div></div>
        </div>

        <p class="practice-mode-label">Mode: <strong id="hostage-mode-label">Move Pieces</strong></p>

        <div class="practice-controls">
          <button id="hostage-mode-move" class="btn-secondary">Move</button>
          <button id="hostage-mode-place">Place</button>
          <button id="hostage-mode-erase" class="btn-secondary">Erase</button>
          <button id="hostage-load-opening" class="btn-secondary">Load CSV Opening</button>
          <button id="hostage-clear-board" class="btn-secondary">Clear Board</button>
          <button id="hostage-export-csv" class="btn-secondary">Copy CSV</button>
        </div>

        <div class="color-picker" id="hostage-side-picker">
          <button class="color-btn selected hostage-white-btn" data-side="white" title="White"></button>
          <button class="color-btn hostage-black-btn" data-side="black" title="Black"></button>
        </div>

        <div class="value-picker" style="margin-top: 12px;">
          <label style="color: var(--text-muted); margin-right: 8px;">Piece:</label>
          <select id="hostage-piece-type" class="hostage-select">
            <option value="pawn">Pawn</option>
            <option value="knight">Knight</option>
            <option value="bishop">Bishop</option>
            <option value="rook">Rook</option>
            <option value="fort">Fort</option>
            <option value="queen">Queen</option>
            <option value="king">King</option>
          </select>
        </div>

        <div class="rotation-controls" style="margin-top: 12px; display: flex; gap: 8px; justify-content: center; align-items:center;">
          <label style="color: var(--text-muted);">Board:</label>
          <button id="hostage-view-white" class="btn-secondary">White View (A1 bottom)</button>
          <button id="hostage-view-black" class="btn-secondary">Black View (H8 bottom)</button>
        </div>

        <div class="hostage-notation-note">
          A1 is bottom-left in White view. H8 is top-right. Use this lab to prototype positions and movement ideas.
        </div>

        <br>
        <div class="board-container" id="hostage-board-container"></div>
        <p class="error-msg" id="hostage-info" style="color: var(--text-muted); margin-top:12px;"></p>
      </div>
    `;

    board = loadBoardFromCsv(STARTING_CSV);

    const container = document.getElementById('hostage-board-container');
    renderer = BoardRenderer.create(container, {
      size: Math.min(560, window.innerWidth - 40),
      diamond45: true,
      diamondScale: 0.68,
      pieceRotationDeg: -45,
    });
    renderer.setBoard(board);
    renderer.onClick(handleClick);

    document.getElementById('back-to-lobby').addEventListener('click', () => window.App.navigate('/lobby'));
    document.getElementById('hostage-mode-move').addEventListener('click', () => setMode('move'));
    document.getElementById('hostage-mode-place').addEventListener('click', () => setMode('place'));
    document.getElementById('hostage-mode-erase').addEventListener('click', () => setMode('erase'));
    document.getElementById('hostage-load-opening').addEventListener('click', () => {
      board = loadBoardFromCsv(STARTING_CSV);
      selectedPiece = null;
      renderer.clearHighlights();
      renderer.setBoard(board);
      setInfo('Loaded Hostage opening from CSV.');
    });

    document.getElementById('hostage-clear-board').addEventListener('click', () => {
      board = createEmptyBoard();
      selectedPiece = null;
      renderer.clearHighlights();
      renderer.setBoard(board);
      setInfo('Board cleared.');
    });

    document.getElementById('hostage-export-csv').addEventListener('click', async () => {
      const text = boardToCsv();
      try {
        await navigator.clipboard.writeText(text);
        setInfo('Current board copied as CSV.');
      } catch {
        setInfo('Could not copy automatically. Open console and run HostageLabPage.exportCsv().');
      }
    });

    document.querySelectorAll('#hostage-side-picker .color-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedSide = btn.dataset.side;
        document.querySelectorAll('#hostage-side-picker .color-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });

    document.getElementById('hostage-piece-type').addEventListener('change', (e) => {
      selectedType = e.target.value;
    });

    document.getElementById('hostage-view-white').addEventListener('click', () => renderer.setRotation(0));
    document.getElementById('hostage-view-black').addEventListener('click', () => renderer.setRotation(180));

    setMode('move');
    setInfo('Experimental mode active. Place, erase, and move pieces freely.');
  }

  function setMode(newMode) {
    mode = newMode;
    selectedPiece = null;
    if (renderer) renderer.clearHighlights();

    const labels = {
      move: 'Move Pieces',
      place: 'Place Pieces',
      erase: 'Erase Pieces',
    };

    const label = document.getElementById('hostage-mode-label');
    if (label) label.textContent = labels[newMode];

    ['hostage-mode-move', 'hostage-mode-place', 'hostage-mode-erase'].forEach((id) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.className = id.includes(newMode) ? '' : 'btn-secondary';
    });

    if (newMode === 'move') {
      setInfo('Move mode: click a piece to preview legal moves, then click a highlighted destination.');
    }
    if (newMode === 'place') {
      setInfo('Place mode: click any square to place the selected side and piece.');
    }
    if (newMode === 'erase') {
      setInfo('Erase mode: click a piece to remove it. Paired pawns are reduced to a single pawn first.');
    }
  }

  function mergeOrPlacePawn(r, c) {
    const current = board[r][c];
    if (!current) {
      board[r][c] = { color: selectedSide, type: 'pawn' };
      return;
    }

    const canPair = (
      current.type === 'pawn' &&
      current.color === selectedSide &&
      !current.paired
    );

    if (canPair) {
      board[r][c] = { ...current, paired: true };
      setInfo('Created a paired pawn on this square.');
      return;
    }

    board[r][c] = { color: selectedSide, type: 'pawn' };
  }

  function deletePieceAt(r, c) {
    const current = board[r][c];
    if (!current) return false;

    if (current.type === 'pawn' && current.paired) {
      board[r][c] = { color: current.color, type: 'pawn' };
    } else {
      board[r][c] = null;
    }

    renderer.setBoard(board);
    selectedPiece = null;
    renderer.clearHighlights();
    return true;
  }

  function isTripleTapDelete(r, c, meta) {
    if (!meta || meta.shiftKey) return false;
    const now = meta.timeStamp || Date.now();
    const key = `${r},${c}`;
    const isFastSameCell = recentTap.key === key && (now - recentTap.ts) <= 500;

    if (isFastSameCell) {
      recentTap.count += 1;
      recentTap.ts = now;
    } else {
      recentTap = { key, count: 1, ts: now };
    }

    if (recentTap.count >= 3) {
      recentTap = { key: null, count: 0, ts: 0 };
      return true;
    }
    return false;
  }

  function handleClick(r, c, meta = {}) {
    if (!renderer) return;

    if (meta.shiftKey && board[r][c]) {
      deletePieceAt(r, c);
      setInfo('Deleted piece with shift+click.');
      return;
    }

    if (isTripleTapDelete(r, c, meta) && board[r][c]) {
      deletePieceAt(r, c);
      setInfo('Deleted piece with triple tap.');
      return;
    }

    if (mode === 'place') {
      if (selectedType === 'pawn') {
        mergeOrPlacePawn(r, c);
      } else {
        board[r][c] = { color: selectedSide, type: selectedType };
      }
      renderer.setBoard(board);
      return;
    }

    if (mode === 'erase') {
      deletePieceAt(r, c);
      return;
    }

    if (!selectedPiece) {
      if (board[r][c]) {
        selectedPiece = [r, c];
        renderer.setSelected([r, c]);
        renderer.setLegalMoves(getLegalMovesForPiece(r, c));
      }
      return;
    }

    const [sr, sc] = selectedPiece;
    const fromPiece = board[sr][sc];

    if (sr === r && sc === c) {
      selectedPiece = null;
      renderer.clearHighlights();
      return;
    }

    if (!fromPiece) {
      selectedPiece = null;
      renderer.clearHighlights();
      return;
    }

    if (!canMoveTo(sr, sc, r, c)) {
      if (board[r][c]) {
        selectedPiece = [r, c];
        renderer.setSelected([r, c]);
        renderer.setLegalMoves(getLegalMovesForPiece(r, c));
      } else {
        selectedPiece = null;
        renderer.clearHighlights();
      }
      return;
    }

    // Paired-pawn split move: one pawn stays, one pawn moves.
    if (fromPiece.type === 'pawn' && fromPiece.paired && board[r][c] === null) {
      board[sr][sc] = { color: fromPiece.color, type: 'pawn' };
      board[r][c] = { color: fromPiece.color, type: 'pawn' };
      selectedPiece = null;
      renderer.clearHighlights();
      renderer.setBoard(board);
      setInfo('Paired pawn split: one pawn remained, one moved.');
      return;
    }

    const target = board[r][c];

    // Merge two same-color single pawns.
    if (
      fromPiece.type === 'pawn' &&
      !fromPiece.paired &&
      target &&
      target.type === 'pawn' &&
      !target.paired &&
      target.color === fromPiece.color
    ) {
      board[r][c] = { color: fromPiece.color, type: 'pawn', paired: true };
      board[sr][sc] = null;
      selectedPiece = null;
      renderer.clearHighlights();
      renderer.setBoard(board);
      setInfo('Two pawns merged into a paired pawn.');
      return;
    }

    if ((fromPiece.type === 'rook' || fromPiece.type === 'fort') && target) {
      const dr = Math.sign(r - sr);
      const dc = Math.sign(c - sc);
      const pushR = r + dr;
      const pushC = c + dc;
      if (inBounds(pushR, pushC) && board[pushR][pushC] === null) {
        board[pushR][pushC] = clonePiece(target);
        board[r][c] = clonePiece(fromPiece);
        board[sr][sc] = null;
        selectedPiece = null;
        renderer.clearHighlights();
        renderer.setBoard(board);
        setInfo('Rook/Fort push move applied.');
        return;
      }
      selectedPiece = null;
      renderer.clearHighlights();
      setInfo('Push blocked: target square behind piece is occupied or out of bounds.');
      return;
    }

    board[r][c] = clonePiece(fromPiece);
    board[sr][sc] = clonePiece(target);

    selectedPiece = null;
    renderer.clearHighlights();
    renderer.setBoard(board);
  }

  function cleanup() {
    renderer = null;
    board = null;
    selectedPiece = null;
  }

  function exportCsv() {
    return boardToCsv();
  }

  return {
    render,
    cleanup,
    exportCsv,
  };
})();
