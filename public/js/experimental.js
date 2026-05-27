/* ─── Experimental Mode (sandbox) ───────────────────── */

window.ExperimentalModePage = (() => {
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
  let gameState = null;
  let mode = 'move';
  let selectedSide = 'white';
  let selectedType = 'pawn';
  let selectedPiece = null;
  let recentTap = { key: null, count: 0, ts: 0 };

  function createEmptyBoard() {
    return Array.from({ length: 8 }, () => Array(8).fill(null));
  }

  function clonePiece(piece) {
    return piece ? { ...piece } : null;
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
    return HostageEngine.loadBoardFromCsv(csvText);
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

  function setGameStateFromBoard(nextBoard, keepTurn = 'white') {
    gameState = {
      board: nextBoard,
      turn: keepTurn,
      moveCount: 0,
      status: 'playing',
      result: null,
      points: { white: 0, black: 0 },
      queenCrossedToOwnSide: { white: false, black: false },
    };
    board = gameState.board;
  }

  function updateTurnBanner() {
    const label = document.getElementById('hostage-turn-label');
    if (!label) return;
    label.textContent = 'Sandbox: no turns enforced';
  }

  function render() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="practice-page experimental-mode-page hostage-lab-page">
        <div class="game-header" style="justify-content:space-between; display:flex; align-items:center; margin-bottom:16px;">
          <button id="back-to-lobby" class="btn-secondary">← Lobby</button>
          <h2>Experimental Mode</h2>
          <div></div>
        </div>

        <p class="practice-mode-label">Mode: <strong id="hostage-mode-label">Move Pieces</strong> · <strong id="hostage-turn-label">Turn: WHITE</strong></p>

        <div class="practice-controls">
          <button id="hostage-mode-move" class="btn-secondary">Move</button>
          <button id="hostage-mode-place">Place</button>
          <button id="hostage-mode-erase" class="btn-secondary">Erase</button>
          <button id="hostage-load-opening" class="btn-secondary">Load Opening</button>
          <button id="hostage-load-custom" class="btn-secondary">Load Custom</button>
          <button id="hostage-clear-board" class="btn-secondary">Clear Board</button>
          <button id="hostage-export-csv" class="btn-secondary">Copy Positions</button>
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
          <button id="hostage-view-white" class="btn-secondary">Black at Top (White View A1 bottom)</button>
          <button id="hostage-view-black" class="btn-secondary">White at Top (Black View H8 bottom)</button>
        </div>

        <div class="hostage-notation-note">
          A1 is bottom-left in White view. H8 is top-right. Use Experimental Mode to test positions and movement ideas.
        </div>

        <br>
        <div class="board-container" id="hostage-board-container"></div>
        <div class="board-controls" style="margin-top:10px;">
          <button id="hostage-shape-toggle-btn" class="btn-secondary" title="Toggle rhombus/square board">□ Square</button>
        </div>
        <p class="error-msg" id="hostage-info" style="color: var(--text-muted); margin-top:12px;"></p>
      </div>
    `;

    setGameStateFromBoard(loadBoardFromCsv(STARTING_CSV), 'white');

    const container = document.getElementById('hostage-board-container');
    renderer = BoardRenderer.create(container, {
      size: Math.min(560, window.innerWidth - 40),
      diamond45: true,
      diamondScale: 0.68,
      pieceRotationDeg: 0,
    });
    renderer.setBoard(board);
    renderer.onClick(handleClick);
    updateTurnBanner();

    document.getElementById('back-to-lobby').addEventListener('click', () => window.App.navigate('/lobby'));
    document.getElementById('hostage-mode-move').addEventListener('click', () => setMode('move'));
    document.getElementById('hostage-mode-place').addEventListener('click', () => setMode('place'));
    document.getElementById('hostage-mode-erase').addEventListener('click', () => setMode('erase'));
    document.getElementById('hostage-load-opening').addEventListener('click', () => {
      setGameStateFromBoard(loadBoardFromCsv(STARTING_CSV), 'white');
      selectedPiece = null;
      renderer.clearHighlights();
      renderer.setBoard(board);
      setInfo('Loaded the opening setup from CSV.');
      updateTurnBanner();
    });

    document.getElementById('hostage-load-custom').addEventListener('click', () => {
      const initialValue = boardToCsv();
      const pasted = window.prompt('Paste 8x8 board CSV (e.g., WPawn,BQueen,...):', initialValue);
      if (pasted === null) return;

      try {
        const nextBoard = loadBoardFromCsv(pasted);
        setGameStateFromBoard(nextBoard, 'white');
        selectedPiece = null;
        renderer.clearHighlights();
        renderer.setBoard(board);
        setInfo('Loaded custom board from CSV.');
        updateTurnBanner();
      } catch {
        setInfo('Invalid CSV. Expected 8 rows x 8 columns with tokens like WPawn, BKing, etc.');
      }
    });

    document.getElementById('hostage-clear-board').addEventListener('click', () => {
      setGameStateFromBoard(createEmptyBoard(), 'white');
      selectedPiece = null;
      renderer.clearHighlights();
      renderer.setBoard(board);
      setInfo('Board cleared.');
      updateTurnBanner();
    });

    document.getElementById('hostage-export-csv').addEventListener('click', async () => {
      const text = boardToCsv();
      try {
        await navigator.clipboard.writeText(text);
        setInfo('Current board positions copied as CSV.');
      } catch {
        setInfo('Could not copy automatically. Open console and run ExperimentalModePage.exportCsv().');
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
    const hostageShapeToggleBtn = document.getElementById('hostage-shape-toggle-btn');
    const syncHostageShapeLabel = () => {
      if (!hostageShapeToggleBtn || !renderer) return;
      hostageShapeToggleBtn.textContent = renderer.isDiamond45() ? '□ Square' : '◇ Rhombus';
    };
    syncHostageShapeLabel();
    if (hostageShapeToggleBtn) {
      hostageShapeToggleBtn.addEventListener('click', () => {
        renderer.toggleDiamond45();
        syncHostageShapeLabel();
      });
    }

    setMode('move');
    setInfo('Experimental Mode active. Place, erase, and move pieces freely.');
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
      setInfo('Move mode: engine rules and turn order are enforced. Outcomes are evaluated after black moves.');
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
    updateTurnBanner();
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
      updateTurnBanner();
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
        renderer.setLegalMoves(HostageEngine.getLegalMoves(board, board[r][c].color, r, c));
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

    const pieceColor = fromPiece.color;
    const legalMoves = HostageEngine.getLegalMoves(board, pieceColor, sr, sc);
    const canMove = legalMoves.some(([mr, mc]) => mr === r && mc === c);
    if (!canMove) {
      if (board[r][c]) {
        if (board[r][c].color === pieceColor || board[r][c].color) {
          selectedPiece = [r, c];
          renderer.setSelected([r, c]);
          renderer.setLegalMoves(HostageEngine.getLegalMoves(board, board[r][c].color, r, c));
        } else {
          selectedPiece = null;
          renderer.clearHighlights();
        }
      } else {
        selectedPiece = null;
        renderer.clearHighlights();
      }
      return;
    }

    const moveResult = HostageEngine.processMove(board, pieceColor, [sr, sc], [r, c]);
    if (!moveResult.valid) {
      setInfo(moveResult.error || 'Illegal move.');
      selectedPiece = null;
      renderer.clearHighlights();
      return;
    }

    board = moveResult.board;
    if (gameState) gameState.board = board;

    selectedPiece = null;
    renderer.clearHighlights();
    renderer.setBoard(board);
    updateTurnBanner();
    setInfo('Position updated. Experimental Mode does not enforce turns or round results.');
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

window.HostageLabPage = window.ExperimentalModePage;
