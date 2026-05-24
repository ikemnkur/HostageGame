/**
 * game-server.js — Linked Game Module (Express Router + Socket.IO)
 *
 * Usage in server.js:
 *   const http = require('http');
 *   const httpServer = http.createServer(server);   // wrap express app
 *   const createGameModule = require('./game-server');
 *   const { router: gameRouter, io: gameIO } = createGameModule(httpServer, { pool });
 *   server.use(gameRouter);                         // mounts REST endpoints
 *   // httpServer.listen(PORT, ...) instead of server.listen(PORT, ...)
 *
 * The module:
 *  - Creates a Socket.IO server attached to the httpServer
 *  - Exposes an Express Router with /api/game/* REST endpoints
 *  - Stores transient game state in local JSON files  (fast, no SQL latency)
 *  - Looks up real user records from the MySQL pool    (userData table)
 *  - Manages per-game timers, clocks, spectator chat in-memory
 *
 * No authentication layer — the caller's JWT middleware (or session) should
 * already have resolved the user before requests hit these endpoints.
 */

const express = require('express');
const { Server }  = require('socket.io');
const fs   = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const knex = require('./config/knex');

module.exports = function createGameModule(httpServer, deps = {}) {

  const router = express.Router();
  router.use(express.json());

  // ─── Paths ─────────────────────────────────────────────
  const DATA_DIR    = path.join(__dirname, 'data');

  const HISTORY_DIR = path.join(DATA_DIR, 'game_history');
  if (!fs.existsSync(DATA_DIR))    fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });

  // ─── In-memory transient state ─────────────────────────
  const activeTimers  = {};  // gameId → intervalId
  const gameClocks    = {};  // gameId → { color: remainingMs, … }
  const turnStartTs   = {};  // gameId → Date.now()
  const drawRequests  = {};  // gameId → { requestedBy, agreedBy[] }
  const spectateChats = {};  // gameId → [{ username, message, ts }]

  // ─── Socket.IO (cross-origin aware) ───────────────────
  const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  // Always allow common dev origins
  ['http://localhost:3000', 'http://localhost:3001',
   'http://localhost:5173', 'http://localhost:5174'].forEach(o => {
    if (!ALLOWED_ORIGINS.includes(o)) ALLOWED_ORIGINS.push(o);
  });

  const io = new Server(httpServer, {
    cors: {
      origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Path shared with frontend client
    path: '/socket.io',
  });

  // ─── DB helpers ──────────────────────────────────────────
  function parseJSON(val) {
    if (val === null || val === undefined) return val;
    if (typeof val === 'object') return val;
    try { return JSON.parse(val); } catch { return val; }
  }

  function rowToUser(row) {
    if (!row) return null;
    return {
      id: row.id,
      username: row.username,
      password: row.password || null,
      email: row.email || null,
      stats: {
        wins: row.wins || 0,
        losses: row.losses || 0,
        draws: row.draws || 0,
        gamesPlayed: row.games_played || 0,
        elo: row.elo || 1200,
      },
      createdAt: row.created_at,
    };
  }

  function rowToGame(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      maxPlayers: row.max_players,
      players: parseJSON(row.players) || [],
      board: parseJSON(row.board) || [],
      currentTurn: row.current_turn,
      turnCount: row.turn_count,
      centerHoldTracker: parseJSON(row.center_hold_tracker) || { red: 0, blue: 0, green: 0, yellow: 0 },
      winner: row.winner || null,
      timerMode: row.timer_mode || 'none',
      timerValue: row.timer_value || 0,
      timerStartsAt: row.timer_starts_at || null,
      eliminatedColors: parseJSON(row.eliminated_colors) || [],
      moveHistory: parseJSON(row.move_history) || [],
      finishedAt: row.finished_at || null,
      createdAt: row.created_at,
    };
  }

  async function getGame(id) {
    const row = await knex('linked_games').where({ id }).first();
    return rowToGame(row);
  }

  async function saveGame(game) {
    await knex('linked_games').where({ id: game.id }).update({
      name: game.name,
      status: game.status,
      max_players: game.maxPlayers,
      players: JSON.stringify(game.players),
      board: JSON.stringify(game.board),
      current_turn: game.currentTurn,
      turn_count: game.turnCount,
      center_hold_tracker: JSON.stringify(game.centerHoldTracker),
      winner: game.winner || null,
      timer_mode: game.timerMode,
      timer_value: game.timerValue,
      timer_starts_at: game.timerStartsAt || null,
      eliminated_colors: JSON.stringify(game.eliminatedColors || []),
      move_history: JSON.stringify(game.moveHistory || []),
      finished_at: game.finishedAt || null,
    });
  }

  // ─── User lookup ─────────────────────────────────────────
  async function findUserById(id) {
    const row = await knex('linked_users').where({ id }).first();
    return rowToUser(row);
  }

  async function findUserByUsername(username) {
    const row = await knex('linked_users')
      .whereRaw('LOWER(username) = ?', [username.toLowerCase()])
      .first();
    return rowToUser(row);
  }

  // ─── Pending-game cleanup (every 60 s) ────────────────
  const cleanupInterval = setInterval(async () => {
    try {
      const cutoff = Date.now() - 5 * 60 * 1000;
      const deleted = await knex('linked_games')
        .where({ status: 'waiting' })
        .where('created_at', '<', cutoff)
        .delete();
      if (deleted > 0) {
        io.emit('lobby:update');
        console.log(`[game] Cleaned up ${deleted} stale pending game(s).`);
      }
    } catch (e) {
      console.error('[game] Cleanup error:', e.message);
    }
  }, 60_000);

  // ═══════════════════════════════════════════════════════
  //  REST API — all prefixed however the caller mounts us
  //  (recommended: server.use(gameRouter)  → /api/game/*)
  // ═══════════════════════════════════════════════════════

  // ── List open games (lobby) ──
  router.get('/api/game/games', async (_req, res) => {
    try {
      const rows = await knex('linked_games').whereNot({ status: 'finished' });
      const games = rows.map(r => {
        const g = rowToGame(r);
        return {
          id: g.id, name: g.name, status: g.status,
          playerCount: g.players.length,
          maxPlayers: g.maxPlayers || 4,
          players: g.players.map(p => ({ username: p.username, color: p.color })),
          timerMode: g.timerMode || 'none',
          timerValue: g.timerValue || 0,
        };
      });
      res.json({ games });
    } catch (e) {
      console.error('[game:list]', e.message);
      res.status(500).json({ error: 'Server error.' });
    }
  });

  // ── Create game ──
  router.post('/api/game/games', async (req, res) => {
    try {
      const { userId, gameName, maxPlayers, timerMode, timerValue } = req.body;
      const user = await findUserById(userId);
      if (!user) return res.status(400).json({ error: 'User not found.' });

      const COLORS = ['red', 'blue', 'green', 'yellow'];
      const max = [2, 3, 4].includes(maxPlayers) ? maxPlayers : 4;

      let tMode = 'none', tValue = 0;
      if (timerMode === 'total' && timerValue > 0) {
        tMode = 'total';
        tValue = Math.max(1, Math.min(60, timerValue));
      } else if (timerMode === 'perTurn' && timerValue > 0) {
        tMode = 'perTurn';
        tValue = Math.max(10, Math.min(300, timerValue));
      }

      const username = user.username || 'Player';
      const gameId = uuidv4();
      const gameName_ = gameName || `${username}'s Game`;
      const players = [{ id: user.id, username, color: COLORS[0] }];
      const centerHoldTracker = { red: 0, blue: 0, green: 0, yellow: 0 };

      await knex('linked_games').insert({
        id: gameId,
        name: gameName_,
        status: 'waiting',
        max_players: max,
        players: JSON.stringify(players),
        board: JSON.stringify(createEmptyBoard()),
        current_turn: 0, turn_count: 0,
        center_hold_tracker: JSON.stringify(centerHoldTracker),
        winner: null, timer_mode: tMode, timer_value: tValue,
        eliminated_colors: JSON.stringify([]),
        move_history: JSON.stringify([]),
        created_at: Date.now(),
      });

      io.emit('lobby:update');
      res.json({ game: { id: gameId, name: gameName_, status: 'waiting', playerCount: 1, maxPlayers: max } });
    } catch (e) {
      console.error('[game:create]', e.message);
      res.status(500).json({ error: 'Server error.' });
    }
  });

  // ── Join game ──
  router.post('/api/game/games/:gameId/join', async (req, res) => {
    try {
      const { userId } = req.body;
      const game = await getGame(req.params.gameId);
      if (!game) return res.status(404).json({ error: 'Game not found.' });
      if (game.status !== 'waiting') return res.status(400).json({ error: 'Game already started.' });
      if (game.players.length >= game.maxPlayers) return res.status(400).json({ error: 'Game is full.' });
      if (game.players.find(p => p.id === userId)) return res.status(400).json({ error: 'Already in this game.' });

      const user = await findUserById(userId);
      if (!user) return res.status(400).json({ error: 'User not found.' });

      const COLORS = ['red', 'blue', 'green', 'yellow'];
      const takenColors = game.players.map(p => p.color);
      const color = COLORS.find(c => !takenColors.includes(c));
      const username = user.username || 'Player';

      game.players.push({ id: user.id, username, color });

      if (game.players.length === game.maxPlayers) {
        game.status = 'playing';
        game.board = createStartingBoard(game.players);
        game.timerStartsAt = Date.now() + 3000;
        setTimeout(() => startGameTimers(game), 3000);
      }

      await saveGame(game);
      io.emit('lobby:update');
      io.to(game.id).emit('game:update', sanitizeGame(game));
      res.json({ game: sanitizeGame(game) });
    } catch (e) {
      console.error('[game:join]', e.message);
      res.status(500).json({ error: 'Server error.' });
    }
  });

  // ── Get game state ──
  router.get('/api/game/games/:gameId', async (req, res) => {
    try {
      const game = await getGame(req.params.gameId);
      if (!game) return res.status(404).json({ error: 'Game not found.' });
      res.json({ game: sanitizeGame(game) });
    } catch (e) { res.status(500).json({ error: 'Server error.' }); }
  });

  // ── Live game state (spectators) ──
  router.get('/api/game/games/:gameId/live', async (req, res) => {
    try {
      const game = await getGame(req.params.gameId);
      if (!game) return res.status(404).json({ error: 'Game not found.' });
      res.json({ game: sanitizeGame(game) });
    } catch (e) { res.status(500).json({ error: 'Server error.' }); }
  });

  // ── User stats ──
  router.get('/api/game/users/:userId/stats', async (req, res) => {
    try {
      const row = await knex('linked_users').where({ id: req.params.userId }).first();
      if (!row) return res.status(404).json({ error: 'User not found.' });
      const user = rowToUser(row);
      res.json({ username: user.username, stats: user.stats, createdAt: user.createdAt });
    } catch (e) { res.status(500).json({ error: 'Server error.' }); }
  });

  // ── Leaderboard ──
  router.get('/api/game/leaderboard', async (_req, res) => {
    try {
      const rows = await knex('linked_users')
        .where('games_played', '>', 0)
        .orderBy('elo', 'desc')
        .limit(100);
      const leaderboard = rows.map(r => ({
        id: r.id, username: r.username,
        elo: r.elo || 1200,
        wins: r.wins || 0, losses: r.losses || 0,
        draws: r.draws || 0, gamesPlayed: r.games_played || 0,
      }));
      res.json({ leaderboard });
    } catch (e) { res.status(500).json({ error: 'Server error.' }); }
  });

  // ── Game history (review / download) ──
  router.get('/api/game/games/:gameId/history/download', (req, res) => {
    try {
      const histFile = path.join(HISTORY_DIR, `${req.params.gameId}.json`);
      if (!fs.existsSync(histFile)) return res.status(404).json({ error: 'Game history not found.' });
      const data = JSON.parse(fs.readFileSync(histFile, 'utf-8'));
      res.setHeader('Content-Disposition', `attachment; filename="game-${req.params.gameId}.json"`);
      res.json(data);
    } catch { res.status(500).json({ error: 'Failed to load game history.' }); }
  });

  router.get('/api/game/games/:gameId/history', (req, res) => {
    try {
      const histFile = path.join(HISTORY_DIR, `${req.params.gameId}.json`);
      if (!fs.existsSync(histFile)) return res.status(404).json({ error: 'Game history not found.' });
      res.json(JSON.parse(fs.readFileSync(histFile, 'utf-8')));
    } catch { res.status(500).json({ error: 'Failed to load game history.' }); }
  });

  // ── User's finished games ──
  router.get('/api/game/users/:userId/games', async (req, res) => {
    try {
      // JSON_CONTAINS on the players column to filter by userId
      const rows = await knex('linked_games')
        .where({ status: 'finished' })
        .whereRaw(`JSON_CONTAINS(players, JSON_ARRAY(JSON_OBJECT('id', ?)))`, [req.params.userId])
        .orderBy('finished_at', 'desc')
        .limit(50);
      const games = rows.map(r => {
        const g = rowToGame(r);
        return {
          id: g.id, name: g.name, winner: g.winner,
          players: g.players.map(p => ({ username: p.username, color: p.color })),
          turnCount: g.turnCount, finishedAt: g.finishedAt,
        };
      });
      res.json({ games });
    } catch (e) { res.status(500).json({ error: 'Server error.' }); }
  });

  // ═══════════════════════════════════════════════════════
  //  SOCKET.IO — real-time game events
  // ═══════════════════════════════════════════════════════

  io.on('connection', (socket) => {
    console.log(`[game] Socket connected: ${socket.id}`);

    socket.on('game:join', (gameId) => { socket.join(gameId); });

    socket.on('game:move', async (data) => {
      try {
        const { gameId, userId, from, to } = data;
        const game = await getGame(gameId);
        if (!game || game.status !== 'playing') return;

        const playerIndex = game.players.findIndex(p => p.id === userId);
        if (playerIndex === -1 || playerIndex !== game.currentTurn) return;

        const playerColor = game.players[playerIndex].color;
        if (game.eliminatedColors && game.eliminatedColors.includes(playerColor)) {
          socket.emit('game:moveError', { error: 'You have been eliminated.' });
          return;
        }

        const result = processMove(game, playerColor, from, to);
        if (!result.valid) {
          socket.emit('game:moveError', { error: result.error });
          return;
        }

        game.board = result.board;
        if (!game.moveHistory) game.moveHistory = [];
        game.moveHistory.push({
          turn: game.turnCount, color: playerColor,
          username: game.players[playerIndex].username,
          from, to, timestamp: Date.now(),
        });

        if (game.timerMode === 'total' && gameClocks[game.id]) {
          const elapsed = Date.now() - (turnStartTs[game.id] || Date.now());
          gameClocks[game.id][playerColor] = Math.max(0, (gameClocks[game.id][playerColor] || 0) - elapsed);
        }

        const centerSquares = [[3,3],[3,4],[4,3],[4,4]];
        const centerPoints = { red: 0, blue: 0, green: 0, yellow: 0 };
        for (const [r, c] of centerSquares) {
          if (game.board[r][c]) centerPoints[game.board[r][c].color] += game.board[r][c].value || 1;
        }
        for (const color of Object.keys(centerPoints)) {
          if (centerPoints[color] >= 6) game.centerHoldTracker[color]++;
          else game.centerHoldTracker[color] = 0;
        }
        for (const color of Object.keys(game.centerHoldTracker)) {
          if (game.centerHoldTracker[color] >= 1) {
            game.winner = color;
            game.status = 'finished';
            game.finishedAt = Date.now();
            clearInterval(activeTimers[game.id]);
            delete activeTimers[game.id];
            await updatePlayerStats(game);
          }
        }

        game.currentTurn = advanceTurn(game);
        game.turnCount++;
        turnStartTs[game.id] = Date.now();

        await saveGame(game);
        saveGameHistory(game);
        io.to(gameId).emit('game:update', sanitizeGame(game));
        io.emit('lobby:update');
      } catch (e) {
        console.error('[game:move]', e.message);
      }
    });

    socket.on('game:resign', async (data) => {
      try {
        const { gameId, userId } = data;
        const game = await getGame(gameId);
        if (!game || game.status !== 'playing') return;

        const player = game.players.find(p => p.id === userId);
        if (!player) return;

        if (!game.eliminatedColors) game.eliminatedColors = [];
        if (!game.eliminatedColors.includes(player.color)) game.eliminatedColors.push(player.color);

        if (!game.moveHistory) game.moveHistory = [];
        game.moveHistory.push({ turn: game.turnCount, color: player.color, event: 'resigned', timestamp: Date.now() });

        const alive = game.players.filter(p => !game.eliminatedColors.includes(p.color));
        if (alive.length <= 1) {
          if (alive.length === 1) game.winner = alive[0].color;
          game.status = 'finished';
          game.finishedAt = Date.now();
          clearInterval(activeTimers[game.id]);
          delete activeTimers[game.id];
          await updatePlayerStats(game);
        } else if (game.currentTurn === game.players.indexOf(player)) {
          game.currentTurn = advanceTurn(game);
          turnStartTs[game.id] = Date.now();
        }

        await saveGame(game);
        saveGameHistory(game);
        io.to(game.id).emit('game:update', sanitizeGame(game));
        io.emit('lobby:update');
      } catch (e) {
        console.error('[game:resign]', e.message);
      }
    });

    socket.on('game:requestDraw', async (data) => {
      try {
        const { gameId, userId } = data;
        const game = await getGame(gameId);
        if (!game || game.status !== 'playing') return;

        const player = game.players.find(p => p.id === userId);
        if (!player) return;

        if (!drawRequests[gameId]) {
          drawRequests[gameId] = { requestedBy: userId, agreedBy: [userId] };
          io.to(gameId).emit('game:drawRequested', {
            requestedBy: player.username, agreedCount: 1, totalPlayers: game.players.length,
          });
        } else if (!drawRequests[gameId].agreedBy.includes(userId)) {
          drawRequests[gameId].agreedBy.push(userId);
          const agreedCount = drawRequests[gameId].agreedBy.length;
          const requesterRow = await knex('linked_users').where({ id: drawRequests[gameId].requestedBy }).first();
          io.to(gameId).emit('game:drawRequested', {
            requestedBy: requesterRow?.username,
            agreedCount, totalPlayers: game.players.length,
          });

          if (agreedCount === game.players.length) {
            game.status = 'finished';
            game.finishedAt = Date.now();
            game.winner = 'draw';
            clearInterval(activeTimers[game.id]);
            delete activeTimers[game.id];
            delete drawRequests[gameId];
            if (!game.moveHistory) game.moveHistory = [];
            game.moveHistory.push({ turn: game.turnCount, event: 'draw', reason: 'agreement', timestamp: Date.now() });
            await updatePlayerStats(game);
            await saveGame(game);
            saveGameHistory(game);
            io.to(gameId).emit('game:update', sanitizeGame(game));
            io.emit('lobby:update');
          }
        }
      } catch (e) {
        console.error('[game:requestDraw]', e.message);
      }
    });

    // ── Spectator chat ──
    socket.on('spectate:chat:send', ({ gameId, username, message }) => {
      if (!gameId || !username || !message) return;
      const text = String(message).trim().slice(0, 200);
      if (!text) return;
      if (!spectateChats[gameId]) spectateChats[gameId] = [];
      const entry = { username: String(username).trim().slice(0, 20), message: text, ts: Date.now() };
      spectateChats[gameId].push(entry);
      if (spectateChats[gameId].length > 100) spectateChats[gameId].shift();
      io.to(gameId).emit('spectate:chat:msg', entry);
    });

    socket.on('spectate:join', ({ gameId }) => {
      socket.join(gameId);
      socket.emit('spectate:chat:history', spectateChats[gameId] || []);
    });

    socket.on('disconnect', () => {
      console.log(`[game] Socket disconnected: ${socket.id}`);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  GAME ENGINE
  // ═══════════════════════════════════════════════════════

  function createEmptyBoard() {
    return Array.from({ length: 8 }, () => Array(8).fill(null));
  }

  function createStartingBoard(players) {
    const board = createEmptyBoard();
    const colorToEdge = {};
    players.forEach(p => { colorToEdge[p.color] = true; });
    const values = [null, 3, 2, 1, 1, 2, 3, null];

    if (colorToEdge.red)    for (let c = 1; c <= 6; c++) board[0][c] = { color: 'red',    value: values[c] };
    if (colorToEdge.blue)   for (let c = 1; c <= 6; c++) board[7][c] = { color: 'blue',   value: values[c] };
    if (colorToEdge.green)  for (let r = 1; r <= 6; r++) board[r][0] = { color: 'green',  value: values[r] };
    if (colorToEdge.yellow) for (let r = 1; r <= 6; r++) board[r][7] = { color: 'yellow', value: values[r] };

    return board;
  }

  function sanitizeGame(game) {
    return {
      id: game.id, name: game.name, status: game.status,
      maxPlayers: game.maxPlayers || 4,
      players: game.players.map(p => ({ id: p.id, username: p.username, color: p.color })),
      board: game.board,
      currentTurn: game.currentTurn,
      turnCount: game.turnCount,
      centerHoldTracker: game.centerHoldTracker,
      winner: game.winner,
      timerMode: game.timerMode || 'none',
      timerValue: game.timerValue || 0,
      timerStartsAt: game.timerStartsAt || null,
      clocks: gameClocks[game.id] || null,
      turnStartTs: turnStartTs[game.id] || null,
      eliminatedColors: game.eliminatedColors || [],
      moveHistory: game.moveHistory || [],
    };
  }

  // ── Move processing ──

  function processMove(game, playerColor, from, to) {
    const board = game.board.map(row => row.map(cell => cell ? { ...cell } : null));
    const [fr, fc] = from;
    const [tr, tc] = to;

    if (!board[fr][fc] || board[fr][fc].color !== playerColor) {
      return { valid: false, error: 'Not your piece.' };
    }

    const dr = tr - fr;
    const dc = tc - fc;
    const isDiagonal = Math.abs(dr) === 1 && Math.abs(dc) === 1;
    const isOrthogonal = (Math.abs(dr) + Math.abs(dc)) === 1;
    const isTwoAwayDiagonally = Math.abs(dr) === 2 && Math.abs(dc) === 2;

    if (!isDiagonal && !isOrthogonal && !isTwoAwayDiagonally) {
      return { valid: false, error: 'Invalid move distance.' };
    }

    if (isOrthogonal) {
      if (board[tr][tc] !== null) return { valid: false, error: 'Square is occupied.' };
      board[tr][tc] = board[fr][fc];
      board[fr][fc] = null;
    }

    if (isDiagonal) {
      if (board[tr][tc] !== null && board[tr][tc].color !== playerColor) {
        const enemy = board[tr][tc];
        const pushTarget = findPushLanding(board, fr, fc, tr, tc);
        if (!pushTarget) return { valid: false, error: 'No valid square to push enemy to.' };
        board[pushTarget[0]][pushTarget[1]] = enemy;
        board[tr][tc] = board[fr][fc];
        board[fr][fc] = null;
      } else if (board[tr][tc] === null) {
        if (!hasAdjacentFriendly(board, tr, tc, playerColor, fr, fc)) {
          return { valid: false, error: 'Diagonal hop must connect to a friendly piece.' };
        }
        board[tr][tc] = board[fr][fc];
        board[fr][fc] = null;
      } else {
        return { valid: false, error: 'Cannot move onto your own piece.' };
      }
    }

    if (isTwoAwayDiagonally) {
      if (board[tr][tc] !== null) return { valid: false, error: 'Cannot capture – landing square is occupied.' };
      const midR = fr + dr / 2;
      const midC = fc + dc / 2;
      if (!board[midR][midC] || board[midR][midC].color === playerColor) {
        return { valid: false, error: 'Cannot capture – must jump over an enemy piece.' };
      }
      board[midR][midC] = null;
      board[tr][tc] = board[fr][fc];
      board[fr][fc] = null;
    }

    removeUnlinkedPieces(board, playerColor);
    return { valid: true, board };
  }

  function findPushLanding(board, origR, origC, attackedR, attackedC) {
    const dr = attackedR - origR;
    const dc = attackedC - origC;
    const candidates = [
      [attackedR + dr, attackedC + dc],
      [attackedR + dr, attackedC],
      [attackedR, attackedC + dc],
      [attackedR - dr, attackedC + dc],
      [attackedR + dr, attackedC - dc],
    ];
    for (const [r, c] of candidates) {
      if (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r][c] === null) return [r, c];
    }
    return null;
  }

  function hasAdjacentFriendly(board, r, c, color, excludeR, excludeC) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;
        if (nr === excludeR && nc === excludeC) continue;
        if (board[nr][nc] && board[nr][nc].color === color) return true;
      }
    }
    return false;
  }

  function removeUnlinkedPieces(board, color) {
    const pieces = [];
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++)
        if (board[r][c] && board[r][c].color === color) pieces.push([r, c]);

    const visited = new Set();
    const components = [];

    function bfs(startR, startC) {
      const comp = [];
      const q = [[startR, startC]];
      visited.add(`${startR},${startC}`);
      while (q.length) {
        const [r, c] = q.shift();
        comp.push([r, c]);
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr, nc = c + dc, key = `${nr},${nc}`;
            if (visited.has(key) || nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;
            if (board[nr][nc] && board[nr][nc].color === color) { visited.add(key); q.push([nr, nc]); }
          }
        }
      }
      return comp;
    }

    for (const [r, c] of pieces) if (!visited.has(`${r},${c}`)) components.push(bfs(r, c));
    for (const comp of components) if (comp.length === 1) { const [r, c] = comp[0]; board[r][c] = null; }
  }

  // ── Timers ──

  function startGameTimers(game) {
    if (game.timerMode === 'none') return;

    if (game.timerMode === 'total') {
      const totalMs = game.timerValue * 60 * 1000;
      gameClocks[game.id] = {};
      game.players.forEach(p => { gameClocks[game.id][p.color] = totalMs; });
    } else if (game.timerMode === 'perTurn') {
      const turnMs = game.timerValue * 1000;
      gameClocks[game.id] = {};
      game.players.forEach(p => { gameClocks[game.id][p.color] = turnMs; });
    }

    turnStartTs[game.id] = Date.now();
    activeTimers[game.id] = setInterval(() => tickGameTimer(game.id), 1000);
  }

  function tickGameTimer(gameId) {
    (async () => {
      try {
        const game = await getGame(gameId);
        if (!game || game.status !== 'playing') { clearInterval(activeTimers[gameId]); delete activeTimers[gameId]; return; }

        const clocks = gameClocks[gameId];
        if (!clocks) return;

        const currentPlayer = game.players[game.currentTurn];
        if (!currentPlayer) return;
        const color = currentPlayer.color;
        const elapsed = Date.now() - (turnStartTs[gameId] || Date.now());

        let remaining;
        if (game.timerMode === 'total') {
          remaining = Math.max(0, (clocks[color] || 0) - elapsed);
        } else {
          remaining = Math.max(0, game.timerValue * 1000 - elapsed);
        }

        const clockSnapshot = { ...clocks };
        clockSnapshot[color] = remaining;
        io.to(gameId).emit('game:timerTick', { clocks: clockSnapshot, currentColor: color, turnStartTs: turnStartTs[gameId] });

        if (remaining <= 0) {
          if (game.timerMode === 'perTurn') await skipPlayerTurn(game, color);
          else await eliminatePlayer(game, color);
        }
      } catch (e) {
        console.error('[timer]', e.message);
      }
    })();
  }

  async function eliminatePlayer(game, color) {
    if (!game.eliminatedColors) game.eliminatedColors = [];
    if (game.eliminatedColors.includes(color)) return;
    game.eliminatedColors.push(color);
    if (gameClocks[game.id]) gameClocks[game.id][color] = 0;

    if (!game.moveHistory) game.moveHistory = [];
    game.moveHistory.push({ turn: game.turnCount, color, event: 'eliminated', reason: 'timeout', timestamp: Date.now() });

    const alive = game.players.filter(p => !game.eliminatedColors.includes(p.color));
    if (alive.length <= 1) {
      if (alive.length === 1) game.winner = alive[0].color;
      game.status = 'finished';
      game.finishedAt = Date.now();
      clearInterval(activeTimers[game.id]);
      delete activeTimers[game.id];
      await updatePlayerStats(game);
    } else {
      game.currentTurn = advanceTurn(game);
      turnStartTs[game.id] = Date.now();
      if (game.timerMode === 'perTurn' && gameClocks[game.id]) {
        gameClocks[game.id][game.players[game.currentTurn].color] = game.timerValue * 1000;
      }
    }

    await saveGame(game);
    saveGameHistory(game);
    io.to(game.id).emit('game:update', sanitizeGame(game));
    io.emit('lobby:update');
  }

  async function skipPlayerTurn(game, color) {
    if (!game.moveHistory) game.moveHistory = [];
    game.moveHistory.push({ turn: game.turnCount, color, event: 'turnSkipped', reason: 'timeout', timestamp: Date.now() });

    game.currentTurn = advanceTurn(game);
    turnStartTs[game.id] = Date.now();
    if (game.timerMode === 'perTurn' && gameClocks[game.id]) {
      gameClocks[game.id][game.players[game.currentTurn].color] = game.timerValue * 1000;
    }

    await saveGame(game);
    saveGameHistory(game);
    io.to(game.id).emit('game:update', sanitizeGame(game));
  }

  function advanceTurn(game) {
    const n = game.players.length;
    let next = (game.currentTurn + 1) % n;
    const eliminated = game.eliminatedColors || [];
    for (let i = 0; i < n; i++) {
      if (!eliminated.includes(game.players[next].color)) break;
      next = (next + 1) % n;
    }
    if (game.timerMode === 'perTurn' && gameClocks[game.id]) {
      gameClocks[game.id][game.players[next].color] = game.timerValue * 1000;
    }
    return next;
  }

  // ── Stats / history ──

  async function updatePlayerStats(game) {
    if (game.status !== 'finished') return;
    const isDraw = game.winner === 'draw';

    // Fetch current ELO for all players in one query
    const ids = game.players.map(p => p.id);
    const rows = await knex('linked_users').whereIn('id', ids);
    const userMap = Object.fromEntries(rows.map(r => [r.id, r]));

    if (!isDraw && rows.length > 0) {
      const avgElo = rows.reduce((s, r) => s + (r.elo || 1200), 0) / rows.length;
      const K = 32;

      for (const player of game.players) {
        const row = userMap[player.id];
        if (!row) continue;
        const oldElo = row.elo || 1200;

        let score;
        if (player.color === game.winner) score = 1.0;
        else if (game.eliminatedColors?.includes(player.color)) score = 0.0;
        else score = 0.33;

        const expected = 1 / (1 + Math.pow(10, (avgElo - oldElo) / 400));
        const newElo = Math.max(100, oldElo + Math.round(K * (score - expected)));

        const update = { games_played: knex.raw('games_played + 1'), elo: newElo };
        if (player.color === game.winner) update.wins = knex.raw('wins + 1');
        else update.losses = knex.raw('losses + 1');
        await knex('linked_users').where({ id: player.id }).update(update);
      }
    } else {
      for (const player of game.players) {
        await knex('linked_users').where({ id: player.id }).update({
          games_played: knex.raw('games_played + 1'),
          draws: knex.raw('draws + 1'),
        });
      }
    }
  }

  function saveGameHistory(game) {
    try {
      const histFile = path.join(HISTORY_DIR, `${game.id}.json`);
      fs.writeFileSync(histFile, JSON.stringify({
        id: game.id, name: game.name, players: game.players,
        status: game.status, winner: game.winner,
        moveHistory: game.moveHistory || [],
        updatedAt: new Date().toISOString(),
      }, null, 2));
    } catch (e) { console.error('[game] Failed to save game history:', e.message); }
  }

  // ── Cleanup handle (for graceful shutdown) ──
  router._gameCleanup = () => {
    clearInterval(cleanupInterval);
    Object.values(activeTimers).forEach(id => clearInterval(id));
  };

  return { router, io };
};
