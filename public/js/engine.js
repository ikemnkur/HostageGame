/* ─── Game Engine (shared logic, browser + server) ───── */

(function initHostageEngine(root, factory) {
  const engine = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = engine;
  }
  if (root) {
    root.HostageEngine = engine;
    root.HostageChessEngine = engine;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const BOARD_SIZE = 8;
  const CENTER_SQUARES = [[3, 3], [3, 4], [4, 3], [4, 4]];
  const COLORS = ['white', 'black'];
  const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const KNIGHT = [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]];

  const CASTLE_HOME = {
    white: [0, 0], // A8 in white orientation
    black: [7, 7], // H1 in white orientation
  };

  const PIECE_VALUES = {
    king: 15, queen: 10,
    rook: 6,
    fort: 4,
    bishop: 4,
    knight: 3,
    pawn: 1.5,
  };

  const STARTING_CSV = `
BQueen,WKnight,WBishop,Wpawn,Wpawn,,,,
WBishop,WKing,Wpawn,Wpawn,,,,
WKnight,Wpawn,,,,,,
Wpawn,Wpawn,,,,,,Bpawn,
Wpawn,,,,,,Bpawn,Bpawn
,,,,,,Bpawn,BKnight
,,,,Bpawn,Bpawn,BKing,BBishop
,,,Bpawn,Bpawn,BBishop,BKnight,WQueen
`;

  function createEmptyBoard() {
    return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
  }

  function createStartingBoard() {
    return loadBoardFromCsv(STARTING_CSV);
  }

  function cloneBoard(board) {
    return board.map(row => row.map(cell => cell ? { ...cell } : null));
  }

  function inBounds(r, c) {
    return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
  }

  function isCenter(r, c) {
    return CENTER_SQUARES.some(([cr, cc]) => cr === r && cc === c);
  }

  function getOpponent(color) {
    return color === 'white' ? 'black' : 'white';
  }

  function isCastleSquare(r, c, color) {
    const home = CASTLE_HOME[color];
    return home[0] === r && home[1] === c;
  }

  function getEnemyCastle(color) {
    return CASTLE_HOME[getOpponent(color)];
  }

  function tokenToPiece(token) {
    const t = String(token || '').trim();
    if (!t) return null;
    const m = /^([WB])\s*(King|Queen|Bishop|Knight|Pawn|Rook|Fort)$/i.exec(t);
    if (!m) return null;
    const color = m[1].toUpperCase() === 'W' ? 'white' : 'black';
    const type = String(m[2]).toLowerCase();
    return { color, type: type === 'fort' ? 'fort' : type };
  }

  function loadBoardFromCsv(csvText) {
    const board = createEmptyBoard();
    const lines = String(csvText || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));

    for (let r = 0; r < BOARD_SIZE; r++) {
      const row = (lines[r] || '').split(',');
      for (let c = 0; c < BOARD_SIZE; c++) {
        board[r][c] = tokenToPiece(row[c] || '');
      }
    }
    return board;
  }

  function createGameState() {
    return {
      board: createStartingBoard(),
      turn: 'white',
      moveCount: 0,
      status: 'playing',
      result: null,
      points: { white: 0, black: 0 },
      // Tracks if a queen has reached its own side at least once; used for null-game detection.
      queenCrossedToOwnSide: { white: false, black: false },
    };
  }

  function findPiece(board, color, type) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const p = board[r][c];
        if (p && p.color === color && p.type === type) return [r, c];
      }
    }
    return null;
  }

  function getRoyalPositions(board, color) {
    return {
      king: findPiece(board, color, 'king'),
      queen: findPiece(board, color, 'queen'),
    };
  }

  function hasRoyal(board, color, type) {
    return !!findPiece(board, color, type);
  }

  function getAdjacentSquares(r, c) {
    const out = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (inBounds(nr, nc)) out.push([nr, nc]);
      }
    }
    return out;
  }

  function isPathClear(board, from, to) {
    const [fr, fc] = from;
    const [tr, tc] = to;
    if (!inBounds(fr, fc) || !inBounds(tr, tc)) return false;
    if (fr === tr && fc === tc) return true;

    // Path walking only applies to straight or diagonal movement.
    const rowDelta = tr - fr;
    const colDelta = tc - fc;
    const isLinear = rowDelta === 0 || colDelta === 0 || Math.abs(rowDelta) === Math.abs(colDelta);
    if (!isLinear) return false;

    const dr = Math.sign(tr - fr);
    const dc = Math.sign(tc - fc);
    let r = fr + dr;
    let c = fc + dc;
    while (r !== tr || c !== tc) {
      if (!inBounds(r, c)) return false;
      if (board[r]?.[c]) return false;
      r += dr;
      c += dc;
    }
    return true;
  }

  function canCoOccupyHome(moving, target, r, c) {
    if (!moving || !target) return false;
    if (moving.color !== target.color) return false;
    const isRoyalPair = (
      (moving.type === 'king' && target.type === 'queen') ||
      (moving.type === 'queen' && target.type === 'king')
    );
    return isRoyalPair && isCastleSquare(r, c, moving.color);
  }

  function isQueenVulnerable(board, queenColor) {
    const queenPos = findPiece(board, queenColor, 'queen');
    if (!queenPos) return false;
    // Queen is only capturable on her own side of the board.
    return isOnOwnSide(queenColor, queenPos[0], queenPos[1]);
  }

  function canPieceCapture(board, piece) {
    if (!piece) return false;
    if (piece.type === 'rook' || piece.type === 'fort') return false;
    if (piece.type === 'queen') {
      const queenPos = findPiece(board, piece.color, 'queen');
      if (!queenPos) return false;
      // Queen cannot capture while on enemy side or neutral diagonal.
      return isOnOwnSide(piece.color, queenPos[0], queenPos[1]);
    }
    return true;
  }

  function addMoveIfValid(board, moves, piece, tr, tc, opts = {}) {
    if (!inBounds(tr, tc)) return;
    const target = board[tr]?.[tc];

    if (!target) {
      moves.push([tr, tc]);
      return;
    }

    if (target.color === piece.color) {
      if (piece.type === 'pawn' && target.type === 'pawn' && !target.paired) {
        moves.push([tr, tc]);
      } else if (canCoOccupyHome(piece, target, tr, tc)) {
        moves.push([tr, tc]);
      }
      return;
    }

    if (!opts.capture) return;
    if (!canPieceCapture(board, piece)) return;
    if (target.type === 'rook' || target.type === 'fort') return;
    if (target.type === 'pawn' && target.paired) return;
    if (target.type === 'queen' && !isQueenVulnerable(board, target.color)) return;
    moves.push([tr, tc]);
  }

  function getSlidingMoves(board, r, c, dirs, piece, capture = true) {
    const moves = [];
    for (const [dr, dc] of dirs) {
      let tr = r + dr;
      let tc = c + dc;
      while (inBounds(tr, tc)) {
        const target = board[tr]?.[tc];
        if (!target) {
          moves.push([tr, tc]);
          tr += dr;
          tc += dc;
          continue;
        }
        addMoveIfValid(board, moves, piece, tr, tc, { capture });
        break;
      }
    }
    return moves;
  }

  function getLegalMoves(board, playerColor, fromR, fromC) {
    const piece = board[fromR]?.[fromC];
    if (!piece || piece.color !== playerColor) return [];

    const moves = [];

    if (piece.type === 'king') {
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          if (dr === 0 && dc === 0) continue;
          const tr = fromR + dr;
          const tc = fromC + dc;
          if (!inBounds(tr, tc)) continue;
          const dist = Math.max(Math.abs(dr), Math.abs(dc));
          if (dist > 2) continue;
          if (dist === 2) {
            const isLinear = dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc);
            if (!isLinear) continue;
            if (!isPathClear(board, [fromR, fromC], [tr, tc])) continue;
          }
          addMoveIfValid(board, moves, piece, tr, tc, { capture: true });
        }
      }
      return moves;
    }

    if (piece.type === 'queen') {
      for (const [dr, dc] of [...ORTHO, ...DIAG]) {
        addMoveIfValid(board, moves, piece, fromR + dr, fromC + dc, { capture: true });
      }
      return moves;
    }

    if (piece.type === 'bishop') {
      return getSlidingMoves(board, fromR, fromC, DIAG, piece, true);
    }

    if (piece.type === 'knight') {
      for (const [dr, dc] of KNIGHT) {
        addMoveIfValid(board, moves, piece, fromR + dr, fromC + dc, { capture: true });
      }
      return moves;
    }

    if (piece.type === 'rook' || piece.type === 'fort') {
      for (const [dr, dc] of ORTHO) {
        let tr = fromR + dr;
        let tc = fromC + dc;
        while (inBounds(tr, tc)) {
          const target = board[tr]?.[tc];
          if (!target) {
            if (!isCastleSquare(tr, tc, piece.color)) moves.push([tr, tc]);
            tr += dr;
            tc += dc;
            continue;
          }
          // Rook/Fort cannot capture; it may push one blocking piece.
          const pushR = tr + dr;
          const pushC = tc + dc;
          if (
            inBounds(pushR, pushC)
            && !board[pushR]?.[pushC]
            && !isCastleSquare(tr, tc, piece.color)
          ) {
            moves.push([tr, tc]);
          }
          break;
        }
      }
      return moves;
    }

    if (piece.type === 'pawn') {
      if (piece.paired) {
        // Pair cannot move as a pair; one pawn can split out to orthogonal empty squares.
        for (const [dr, dc] of ORTHO) {
          const tr = fromR + dr;
          const tc = fromC + dc;
          if (inBounds(tr, tc) && !board[tr]?.[tc]) moves.push([tr, tc]);
        }
        return moves;
      }

      // Pawn non-capture moves: orthogonal 1
      for (const [dr, dc] of ORTHO) {
        addMoveIfValid(board, moves, piece, fromR + dr, fromC + dc, { capture: false });
      }

      // Pawn captures: diagonal 1
      for (const [dr, dc] of DIAG) {
        const tr = fromR + dr;
        const tc = fromC + dc;
        if (!inBounds(tr, tc)) continue;
        const target = board[tr]?.[tc];
        if (!target || target.color === piece.color) continue;
        if (target.type === 'rook' || target.type === 'fort') continue;
        if (target.type === 'pawn' && target.paired) continue;
        if (target.type === 'queen' && !isQueenVulnerable(board, target.color)) continue;
        moves.push([tr, tc]);
      }

      return moves;
    }

    return moves;
  }

  function processMove(board, playerColor, from, to, options = {}) {
    const b = cloneBoard(board);
    const [fr, fc] = from;
    const [tr, tc] = to;
    const piece = b[fr]?.[fc];

    if (!piece || piece.color !== playerColor) {
      return { valid: false, error: 'Not your piece.' };
    }

    if (options.demote && (piece.type === 'rook' || piece.type === 'fort')) {
      b[fr][fc] = { color: piece.color, type: 'pawn', paired: true };
      return { valid: true, board: b, meta: { demoted: true } };
    }

    if (options.promote && piece.type === 'pawn' && piece.paired) {
      const notOnOwnSide = !isOnOwnSide(piece.color, fr, fc);
      const kingAdjacent = getAdjacentSquares(fr, fc).some(([ar, ac]) => {
        const adj = b[ar]?.[ac];
        return !!adj && adj.color === piece.color && adj.type === 'king';
      });

      if (!notOnOwnSide) {
        return { valid: false, error: 'Promotion requires enemy side or neutral diagonal.' };
      }
      if (!kingAdjacent) {
        return { valid: false, error: 'Promotion requires adjacent king.' };
      }

      b[fr][fc] = { color: piece.color, type: 'rook' };
      return { valid: true, board: b, meta: { promoted: true } };
    }

    const legal = getLegalMoves(b, playerColor, fr, fc);
    if (!legal.some(([r, c]) => r === tr && c === tc)) {
      return { valid: false, error: 'Illegal move for this piece.' };
    }

    const target = b[tr][tc];

    if (piece.type === 'rook' || piece.type === 'fort') {
      // Push move
      if (target) {
        const dr = Math.sign(tr - fr);
        const dc = Math.sign(tc - fc);
        const pushR = tr + dr;
        const pushC = tc + dc;
        if (!inBounds(pushR, pushC) || b[pushR][pushC]) {
          return { valid: false, error: 'Rook push blocked.' };
        }
        b[pushR][pushC] = { ...target };
      }
      b[tr][tc] = { ...piece };
      b[fr][fc] = null;
      return { valid: true, board: b, meta: { pushed: !!target } };
    }

    if (piece.type === 'pawn' && piece.paired) {
      // Split pair: one pawn moves, one stays.
      b[fr][fc] = { color: piece.color, type: 'pawn' };
      b[tr][tc] = { color: piece.color, type: 'pawn' };
      return { valid: true, board: b, meta: { splitPawnPair: true } };
    }

    if (piece.type === 'pawn' && target && target.type === 'pawn' && target.color === piece.color && !target.paired) {
      // Merge two pawns into a pair.
      b[tr][tc] = { color: piece.color, type: 'pawn', paired: true };
      b[fr][fc] = null;
      return { valid: true, board: b, meta: { mergedPawnPair: true } };
    }

    if (canCoOccupyHome(piece, target, tr, tc)) {
      // Keep both pieces on home square by marking sharedRoyalPair.
      // Renderer currently draws one piece per square, so we preserve king and annotate queen overlay.
      const king = piece.type === 'king' ? piece : target;
      const queen = piece.type === 'queen' ? piece : target;
      b[tr][tc] = { ...king, sharedRoyalPair: true, sharedWith: { color: queen.color, type: 'queen' } };
      if (fr !== tr || fc !== tc) b[fr][fc] = null;
      return { valid: true, board: b, meta: { royalMeet: true } };
    }

    b[tr][tc] = { ...piece };
    b[fr][fc] = null;
    return { valid: true, board: b, meta: { captured: !!target } };
  }

  function getSquareRegion(r, c) {
    const sum = r + c;
    if (sum === 7) return 'neutral';
    return sum < 7 ? 'white' : 'black';
  }

  function isOnOwnSide(color, r, c) {
    return getSquareRegion(r, c) === color;
  }

  function updateQueenCrossingFlags(state) {
    for (const color of COLORS) {
      const q = findPiece(state.board, color, 'queen');
      if (q && isOnOwnSide(color, q[0], q[1])) {
        state.queenCrossedToOwnSide[color] = true;
      }
    }
  }

  function queenAtHome(board, color) {
    const q = findPiece(board, color, 'queen');
    return !!(q && isCastleSquare(q[0], q[1], color));
  }

  function kingAtHome(board, color) {
    const k = findPiece(board, color, 'king');
    return !!(k && isCastleSquare(k[0], k[1], color));
  }

  function kingAtEnemyHome(board, color) {
    const k = findPiece(board, color, 'king');
    if (!k) return false;
    const enemyHome = getEnemyCastle(color);
    return k[0] === enemyHome[0] && k[1] === enemyHome[1];
  }

  function getMaterialScore(board, color) {
    let score = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const piece = board[r][c];
        if (!piece || piece.color !== color) continue;
        if (piece.type === 'pawn' && piece.paired) {
          score += PIECE_VALUES.pawn * 2;
        } else {
          score += PIECE_VALUES[piece.type] || 0;
        }
        // Royal co-occupancy stores queen as overlay metadata on king.
        if (piece.sharedRoyalPair && piece.sharedWith?.type) {
          score += PIECE_VALUES[piece.sharedWith.type] || 0;
        }
      }
    }
    return score;
  }

  function evaluateRoundResult(state, opts = {}) {
    const board = state.board;
    const whiteRoyal = getRoyalPositions(board, 'white');
    const blackRoyal = getRoyalPositions(board, 'black');
    const mutualDraw = !!opts.mutualDraw;

    if (mutualDraw) {
      return {
        type: 'draw',
        reason: 'Mutual agreement',
        points: { white: 0, black: 0 },
      };
    }

    if (!whiteRoyal.king && !whiteRoyal.queen && !blackRoyal.king && !blackRoyal.queen) {
      return {
        type: 'draw',
        reason: 'All royalty eliminated',
        points: { white: 0, black: 0 },
      };
    }

    if (!whiteRoyal.queen && !blackRoyal.queen && !state.queenCrossedToOwnSide.white && !state.queenCrossedToOwnSide.black) {
      return {
        type: 'null',
        reason: 'Both queens died behind enemy lines',
        points: { white: 0, black: 0 },
      };
    }

    const bothQueensHome = queenAtHome(board, 'white') && queenAtHome(board, 'black');
    if (bothQueensHome) {
      return {
        type: 'draw',
        reason: 'Both queens returned home in same round',
        points: { white: 1, black: 1 },
      };
    }

    // Immediate terminal condition: king is dead and own queen has returned home.
    const whiteKingDeadQueenHome = !whiteRoyal.king && queenAtHome(board, 'white');
    const blackKingDeadQueenHome = !blackRoyal.king && queenAtHome(board, 'black');
    if (whiteKingDeadQueenHome && !blackKingDeadQueenHome) {
      return {
        type: 'win',
        winner: 'white',
        reason: 'White queen reached home after white king was eliminated',
        points: {
          white: getMaterialScore(board, 'white') + 3,
          black: getMaterialScore(board, 'black') - 3,
        },
      };
    }
    if (blackKingDeadQueenHome && !whiteKingDeadQueenHome) {
      return {
        type: 'win',
        winner: 'black',
        reason: 'Black queen reached home after black king was eliminated',
        points: {
          white: getMaterialScore(board, 'white') - 3,
          black: getMaterialScore(board, 'black') + 3,
        },
      };
    }

    const points = {
      white: getMaterialScore(board, 'white'),
      black: getMaterialScore(board, 'black'),
    };

    for (const color of COLORS) {
      const royals = getRoyalPositions(board, color);
      const enemy = getOpponent(color);

      // Win: all remaining royals reached home
      const aliveRoyals = [royals.king, royals.queen].filter(Boolean);
      const aliveAtHome = aliveRoyals.length > 0 && aliveRoyals.every(([r, c]) => isCastleSquare(r, c, color));
      if (aliveAtHome) {
        points[color] += 10;
        return {
          type: 'win',
          winner: color,
          reason: 'king and queen have castled together',
          points,
        };
      }

      // Win: king breaches enemy home
      if (kingAtEnemyHome(board, color)) {
        points[color] += 5;

        return {
          type: 'win',
          winner: color,
          reason: 'King has breached enemy castle and points lead',
          points,
        };
      }

      // Win: king dead but queen back home
      if (!royals.king && queenAtHome(board, color)) {
        points[color] += 3;
        return {
          type: 'win',
          winner: color,
          reason: 'King is dead but queen has returned to home/castle',
          points,
        };
      }

      // Lose: king + queen dead
      if (!royals.king && !royals.queen) {
        points[color] -= 10;
        return {
          type: 'win',
          winner: enemy,
          reason: 'Both king and queen are dead',
          points,
        };
      }

      // Lose: castle breached by enemy king
      if (kingAtEnemyHome(board, enemy)) {
        points[color] -= 5;
        return {
          type: 'win',
          winner: enemy,
          reason: 'Enemy king has breached your castle',
          points,
        };
      }
    }

    // Special lose condition: opponent queen home while opponent king dead (3-point swing).
    if (!whiteRoyal.king && queenAtHome(board, 'white') && !kingAtEnemyHome(board, 'black')) {
      points.black -= 3;
      return {
        type: 'win',
        winner: 'black',
        reason: 'White king is dead but white queen has returned to home/castle',
        points,
      };
    }


    if (!blackRoyal.king && queenAtHome(board, 'black') && !kingAtEnemyHome(board, 'white')) {
      points.white -= 3;
      return {
        type: 'win',
        winner: 'white',
        reason: 'Black king is dead but black queen has returned to home/castle',
        points,
      };
    }


    if (points.white === points.black) {
      return {
        type: 'continue',
        reason: 'Equal points after black turn; game continues',
        points,
      };
    }

    // end game if one player has more than 2x the points of the other, indicating a decisive material advantage. This prevents long endgames where one player is heavily down in material but can still theoretically win by racing to breach or home with their queen.
    if ( Math.max(points.white, points.black) / Math.min(points.white, points.black) >= 2) {
      return {
        type: 'win',
        winner: points.white > points.black ? 'white' : 'black',
        reason: 'Higher material + outcome points',
        points,
      };
    }

    return {
      type: 'continue',
      reason: 'Score margin below win threshold; game continues',
      points,
    };
  }

  function hasAnyLegalMove(board, color) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const piece = board[r]?.[c];
        if (!piece || piece.color !== color) continue;
        const moves = getLegalMoves(board, color, r, c);
        if (moves.length > 0) return true;
      }
    }
    return false;
  }

  function applyMove(state, from, to, options = {}) {
    if (!state || state.status !== 'playing') {
      return { valid: false, error: 'Game is not active.' };
    }

    const result = processMove(state.board, state.turn, from, to, options);
    if (!result.valid) return result;

    const nextState = {
      ...state,
      board: result.board,
      moveCount: (state.moveCount || 0) + 1,
      turn: getOpponent(state.turn),
      result: null,
      points: { ...(state.points || { white: 0, black: 0 }) },
      queenCrossedToOwnSide: { ...(state.queenCrossedToOwnSide || { white: false, black: false }) },
    };

    updateQueenCrossingFlags(nextState);

    // Resolve outcome after every move so terminal states are not skipped.
    const roundResult = evaluateRoundResult(nextState, { mutualDraw: !!options.mutualDraw }) || {
      type: 'continue',
      reason: 'No round resolution returned; game continues',
      points: nextState.points,
    };
    nextState.result = roundResult;
    nextState.points = roundResult.points || nextState.points;
    if (roundResult.type === 'win' || roundResult.type === 'draw' || roundResult.type === 'null') {
      nextState.status = 'finished';
    }

    if (nextState.status === 'playing' && !hasAnyLegalMove(nextState.board, nextState.turn)) {
      const whitePts = nextState.points?.white || 0;
      const blackPts = nextState.points?.black || 0;
      // if (whitePts === blackPts) {
      if (Math.abs(whitePts - blackPts) <= 3) {
        nextState.result = {
          type: 'draw',
          reason: 'No legal moves for next player and scores are tied or close',
          points: nextState.points,
        };
      } else {
        nextState.result = {
          type: 'win',
          winner: whitePts > blackPts ? 'white' : 'black',
          reason: 'No legal moves for next player and score difference is significant',
          points: nextState.points,
        };
      }
      nextState.status = 'finished';
    }

    return { valid: true, state: nextState, meta: result.meta || {} };
  }

  // Compatibility helper kept for old callers.
  function countCenter(board, color) {
    let points = 0;
    for (const [r, c] of CENTER_SQUARES) {
      if (board[r][c] && board[r][c].color === color) {
        points += 1;
      }
    }
    return points;
  }

  return {
    BOARD_SIZE,
    CENTER_SQUARES,
    COLORS,
    CASTLE_HOME,
    createGameState,
    createEmptyBoard,
    createStartingBoard,
    cloneBoard,
    inBounds,
    isCenter,
    loadBoardFromCsv,
    findPiece,
    getRoyalPositions,
    evaluateRoundResult,
    applyMove,
    processMove,
    getLegalMoves,
    countCenter,
  };
});
