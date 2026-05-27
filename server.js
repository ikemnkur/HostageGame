const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
require('dotenv').config();

const knex = require('./config/knex');
const emailService = require('./email-service');
const HostageEngine = require('./public/js/engine.js');

function normalizeOrigin(origin) {
  if (!origin) return '';
  return String(origin).trim().replace(/\/$/, '');
}

const configuredCorsOrigins = Array.from(new Set([
  ...(process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || '').split(','),
  process.env.FRONTEND_URL,
].map(normalizeOrigin).filter(Boolean)));
const allowAllCorsOrigins = configuredCorsOrigins.length === 0;

function isAllowedCorsOrigin(origin) {
  if (!origin) return true; // allow server-to-server calls without Origin
  if (allowAllCorsOrigins) return true;
  return configuredCorsOrigins.includes(normalizeOrigin(origin));
}

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedCorsOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
};

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      if (isAllowedCorsOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const HISTORY_DIR = path.join(__dirname, 'data', 'game_history');
if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });

// ─── In-memory timer state (not persisted to DB) ──────────
const activeTimers = {};  // gameId -> intervalId
const gameClocks  = {};   // gameId -> { color: remainingMs, ... }
const turnStartTs = {};   // gameId -> Date.now() when current turn began
const drawRequests = {};  // gameId -> { requestedBy: userId, agreedBy: [userIds] }

const TABLES = {
  accounts: 'account',
  users: 'HostageChess_users',
  games: 'HostageChess_games',
};

// ─── DB helpers ───────────────────────────────────────────

// mysql2 returns JSON columns pre-parsed, but guard against string values
// in case the column type falls back to TEXT.
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
      elo: row.elo != null ? row.elo : 1200,
    },
    createdAt: row.created_at,
  };
}

function rowToGame(row) {
  if (!row) return null;
  const storedTracker = parseJSON(row.center_hold_tracker) || {};
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    maxPlayers: row.max_players,
    players: parseJSON(row.players) || [],
    board: parseJSON(row.board) || [],
    currentTurn: row.current_turn,
    turnCount: row.turn_count,
    centerHoldTracker: storedTracker,
    points: storedTracker.points || { white: 0, black: 0 },
    queenCrossedToOwnSide: storedTracker.queenCrossedToOwnSide || { white: false, black: false },
    result: storedTracker.result || null,
    timeControl: storedTracker.timeControl || null,
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
  const row = await knex(TABLES.games).where({ id }).first();
  return rowToGame(row);
}

async function saveGame(game) {
  const tracker = {
    points: game.points || { white: 0, black: 0 },
    queenCrossedToOwnSide: game.queenCrossedToOwnSide || { white: false, black: false },
    result: game.result || null,
    timeControl: game.timeControl || null,
  };
  await knex(TABLES.games).where({ id: game.id }).update({
    name: game.name,
    status: game.status,
    max_players: game.maxPlayers,
    players: JSON.stringify(game.players),
    board: JSON.stringify(game.board),
    current_turn: game.currentTurn,
    turn_count: game.turnCount,
    center_hold_tracker: JSON.stringify(tracker),
    winner: game.winner || null,
    timer_mode: game.timerMode,
    timer_value: game.timerValue,
    timer_starts_at: game.timerStartsAt || null,
    eliminated_colors: JSON.stringify(game.eliminatedColors || []),
    move_history: JSON.stringify(game.moveHistory || []),
    finished_at: game.finishedAt || null,
  });
}

function parseChessTimeControl(input) {
  const raw = String(input || '').trim();
  const m = raw.match(/^(\d{1,2})\s*m?\s*([+-])\s*(\d{1,2})\s*s?$/i);
  if (!m) return null;

  const baseMinutes = parseInt(m[1], 10);
  const sign = m[2];
  const incrementSecondsAbs = parseInt(m[3], 10);

  if (!Number.isFinite(baseMinutes) || baseMinutes < 1 || baseMinutes > 60) return null;
  if (!Number.isFinite(incrementSecondsAbs) || incrementSecondsAbs > 60) return null;

  const incrementSeconds = sign === '-' ? -incrementSecondsAbs : incrementSecondsAbs;
  return {
    label: `${baseMinutes}${sign}${incrementSecondsAbs}`,
    baseMinutes,
    baseMs: baseMinutes * 60 * 1000,
    incrementSeconds,
    incrementMs: incrementSeconds * 1000,
  };
}

// ─── Auth helpers ─────────────────────────────────────────

const BCRYPT_ROUNDS = 12;
const VERIFICATION_CODE_EXPIRY_MINUTES = parseInt(process.env.VERIFICATION_CODE_EXPIRY_MINUTES, 10) || 30;
const FRONTEND_URL = process.env.FRONTEND_URL || `http://localhost:${process.env.PORT || 3000}`;

function generateAccountId() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 10; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function formatDateTimeForMySQL(date) {
  if (!date) return null;
  return new Date(date).toISOString().slice(0, 19).replace('T', ' ');
}

function buildVerificationLink(email) {
  const base = FRONTEND_URL.replace(/\/$/, '');
  return `${base}/verify-email?email=${encodeURIComponent(email)}`;
}

function generateVerificationCode() {
  const length = Math.floor(Math.random() * 3) + 6; // 6–8 digits
  let code = '';
  for (let i = 0; i < length; i++) code += Math.floor(Math.random() * 10);
  return code;
}

function generateResetCode() {
  const length = Math.floor(Math.random() * 3) + 6; // 6–8 digits
  let code = '';
  for (let i = 0; i < length; i++) code += Math.floor(Math.random() * 10);
  return code;
}

async function createEmailVerificationRecord(email, code) {
  const expiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000);
  const createdAt = new Date();
  await knex('emailVerifications').where({ email }).del();
  await knex('emailVerifications').insert({
    email,
    code,
    expiresAt: formatDateTimeForMySQL(expiresAt),
    createdAt: formatDateTimeForMySQL(createdAt),
    used: 0,
  });
  return { expiresAt };
}

async function sendVerificationEmailHelper(account) {
  const code = generateVerificationCode();
  const { expiresAt } = await createEmailVerificationRecord(account.email, code);
  const link = buildVerificationLink(account.email);
  try {
    await emailService.sendAccountVerificationEmail({
      to: account.email,
      username: account.firstName || account.username || 'there',
      verificationLink: link,
      verificationCode: code,
      subject: 'Verify your Hostage account',
    });
    console.log(`✅ Verification email sent to ${account.email} (expires ${expiresAt.toISOString()})`);
  } catch (err) {
    console.error('⚠️  Failed to send verification email:', err.message);
  }
}

async function sendPasswordResetEmailHelper(account, code) {
  try {
    await emailService.sendPasswordResetEmail({
      to: account.email,
      username: account.firstName || account.username || 'there',
      resetCode: code,
      subject: 'Reset your Hostage password',
    });
    console.log(`✅ Password reset email sent to ${account.email}`);
  } catch (err) {
    console.error('⚠️  Failed to send password reset email:', err.message);
  }
}

// Ensure the game stats record exists for an account (creates one on first play)
async function ensureHostageChessUser(accountRow) {
  const existing = await knex(TABLES.users).where({ id: accountRow.id }).first();
  if (!existing) {
    await knex(TABLES.users).insert({
      id: accountRow.id,
      username: accountRow.username,
      wins: 0, losses: 0, draws: 0, games_played: 0,
      elo: 1200,
      created_at: Date.now(),
    });
    return await knex(TABLES.users).where({ id: accountRow.id }).first();
  }
  return existing;
}

function safeAccountResponse(row, statsRow = null) {
  return {
    id:        row.id,
    username:  row.username,
    email:     row.email,
    firstName: row.firstName || null,
    lastName:  row.lastName  || null,
    accountType: row.accountType || 'free',
    verification: row.verification || 'false',
    profilePicture: row.profilePicture || null,
    bio: row.bio || null,
    isBanned: !!row.isBanned,
    createdAt: row.createdAt,
    stats: statsRow ? {
      wins:        statsRow.wins        || 0,
      losses:      statsRow.losses      || 0,
      draws:       statsRow.draws       || 0,
      gamesPlayed: statsRow.games_played || 0,
      elo:         statsRow.elo != null ? statsRow.elo : 1200,
    } : null,
  };
}

// ─── middleware ───────────────────────────────────────────
app.use(cors(corsOptions));
app.use(express.json());

// Prevent caching of index.html so the browser always loads the latest JS/CSS
app.use((req, res, next) => {
  if (req.path === '/' || req.path === '/index.html') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// Prevent caching of API responses
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,        // disable ETag-based conditional caching
  lastModified: false, // disable Last-Modified-based conditional caching
  setHeaders: (res) => {
    // Always serve the latest static assets to avoid hard-refresh requirements.
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }
}));

// ─── REST API ────────────────────────────────────────────

// ── Register ──
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, firstName, lastName } = req.body;

    if (!username || username.trim().length < 2 || username.trim().length > 50)
      return res.status(400).json({ error: 'Username must be 2–50 characters.' });
    if (!email || !email.includes('@'))
      return res.status(400).json({ error: 'Valid email is required.' });
    if (!password || password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    // Check uniqueness
    const conflict = await knex(TABLES.accounts)
      .where(function () {
        this.whereRaw('LOWER(username) = ?', [username.trim().toLowerCase()])
            .orWhereRaw('LOWER(email) = ?', [email.trim().toLowerCase()]);
      })
      .first();
    if (conflict) {
      const field = conflict.username?.toLowerCase() === username.trim().toLowerCase() ? 'Username' : 'Email';
      return res.status(409).json({ error: `${field} is already registered.` });
    }

    const id = generateAccountId();
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    await knex(TABLES.accounts).insert({
      id,
      username:  username.trim(),
      email:     email.trim().toLowerCase(),
      passwordHash,
      firstName: firstName ? firstName.trim() : null,
      lastName:  lastName  ? lastName.trim()  : null,
      accountType: 'free',
      verification: 'false',
      isBanned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const newAccount = await knex(TABLES.accounts).where({ id }).first();
    const statsRow = await ensureHostageChessUser(newAccount);

    // Send verification email if email service is configured
    if (process.env.SES_SMTP_USER) {
      await sendVerificationEmailHelper(newAccount);
    }

    res.status(201).json({
      success: true,
      message: process.env.SES_SMTP_USER
        ? 'Account created. Please check your email to verify your account.'
        : 'Account created successfully.',
      user: safeAccountResponse(newAccount, statsRow),
    });
  } catch (e) {
    console.error('[auth:register]', e.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── Login ──
app.post('/api/auth/login', async (req, res) => {
  try {
    const { login, password } = req.body; // login = username or email
    if (!login || !password)
      return res.status(400).json({ error: 'Username/email and password are required.' });

    const row = await knex(TABLES.accounts)
      .where(function () {
        this.whereRaw('LOWER(username) = ?', [login.trim().toLowerCase()])
            .orWhereRaw('LOWER(email) = ?',    [login.trim().toLowerCase()]);
      })
      .first();

    if (!row || !row.passwordHash)
      return res.status(401).json({ error: 'Invalid credentials.' });

    if (row.isBanned)
      return res.status(403).json({ error: 'This account has been banned.', reason: row.banReason });

    const match = await bcrypt.compare(password, row.passwordHash);
    if (!match)
      return res.status(401).json({ error: 'Invalid credentials.' });

    await knex(TABLES.accounts).where({ id: row.id }).update({
      lastLogin:   formatDateTimeForMySQL(new Date()),
      loginStatus: true,
      updatedAt:   Date.now(),
    });

    // Ensure game stats row exists
    const statsRow = await ensureHostageChessUser(row);

    res.json({
      success: true,
      user: safeAccountResponse(row, statsRow),
    });
  } catch (e) {
    console.error('[auth:login]', e.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── Verify email ──
app.post('/api/auth/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code)
      return res.status(400).json({ error: 'Email and verification code are required.' });

    const record = await knex('emailVerifications')
      .where({ email, code })
      .orderBy('createdAt', 'desc')
      .first();

    if (!record)
      return res.status(400).json({ error: 'Invalid verification code.' });
    if (record.used)
      return res.status(400).json({ error: 'Verification code has already been used.' });
    if (new Date(record.expiresAt).getTime() < Date.now())
      return res.status(400).json({ error: 'Verification code has expired.' });

    await knex('emailVerifications').where({ id: record.id }).update({ used: 1 });
    await knex(TABLES.accounts).where({ email }).update({ verification: 'true', updatedAt: Date.now() });

    res.json({ success: true, message: 'Email verified successfully.' });
  } catch (e) {
    console.error('[auth:verify-email]', e.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── Resend verification email ──
app.post('/api/auth/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const account = await knex(TABLES.accounts).whereRaw('LOWER(email) = ?', [email.trim().toLowerCase()]).first();
    if (!account) return res.status(404).json({ error: 'No account found with that email.' });
    if (account.verification === 'true') return res.status(400).json({ error: 'Email is already verified.' });

    if (!process.env.SES_SMTP_USER)
      return res.status(503).json({ error: 'Email service not configured.' });

    await sendVerificationEmailHelper(account);
    res.json({ success: true, message: 'Verification email resent.' });
  } catch (e) {
    console.error('[auth:resend-verification]', e.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── Forgot password ──
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const account = await knex(TABLES.accounts).whereRaw('LOWER(email) = ?', [email.trim().toLowerCase()]).first();
    // Always return success to avoid user enumeration
    if (!account) return res.json({ success: true, message: 'If that email exists, a reset code has been sent.' });

    const code = generateResetCode();
    const expiry = formatDateTimeForMySQL(new Date(Date.now() + 15 * 60 * 1000)); // 15 min
    await knex(TABLES.accounts).where({ id: account.id }).update({ resetCode: code, resetCodeExpiry: expiry, updatedAt: Date.now() });

    if (process.env.SES_SMTP_USER) {
      await sendPasswordResetEmailHelper(account, code);
    }

    res.json({ success: true, message: 'If that email exists, a reset code has been sent.' });
  } catch (e) {
    console.error('[auth:forgot-password]', e.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── Reset password ──
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, resetCode, newPassword } = req.body;
    if (!email || !resetCode || !newPassword)
      return res.status(400).json({ error: 'Email, reset code, and new password are required.' });
    if (newPassword.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    const account = await knex(TABLES.accounts).whereRaw('LOWER(email) = ?', [email.trim().toLowerCase()]).first();
    if (!account || account.resetCode !== resetCode)
      return res.status(400).json({ error: 'Invalid or expired reset code.' });
    if (!account.resetCodeExpiry || new Date(account.resetCodeExpiry).getTime() < Date.now())
      return res.status(400).json({ error: 'Reset code has expired.' });

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await knex(TABLES.accounts).where({ id: account.id }).update({
      passwordHash,
      resetCode: null,
      resetCodeExpiry: null,
      updatedAt: Date.now(),
    });

    res.json({ success: true, message: 'Password reset successfully.' });
  } catch (e) {
    console.error('[auth:reset-password]', e.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── Logout ──
app.post('/api/auth/logout', async (req, res) => {
  try {
    const { userId } = req.body;
    if (userId) {
      await knex(TABLES.accounts).where({ id: userId }).update({ loginStatus: false, updatedAt: Date.now() });
    }
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (e) {
    console.error('[auth:logout]', e.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

// List games
app.get('/api/games', async (_req, res) => {
  try {
    const rows = await knex(TABLES.games).whereNot({ status: 'finished' });
    const games = rows.map(r => {
      const g = rowToGame(r);
      return {
        id: g.id,
        name: g.name,
        status: g.status,
        playerCount: g.players.length,
        maxPlayers: g.maxPlayers,
        players: g.players.map(p => ({ username: p.username, color: p.color })),
        timerMode: g.timerMode,
        timerValue: g.timerValue,
        timeControl: g.timeControl || null,
      };
    });
    res.json({ games });
  } catch (e) {
    console.error('[games:list]', e.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

// Create game
app.post('/api/games', async (req, res) => {
  try {
    const { userId, gameName, timerMode, timerValue, timeControl } = req.body;
    const userRow = await knex(TABLES.users).where({ id: userId }).first();
    if (!userRow) return res.status(400).json({ error: 'User not found.' });
    const user = rowToUser(userRow);

    const COLORS = ['white', 'black'];
    const max = 2;

    let tMode = 'none', tValue = 0;
    if (timerMode === 'total' && timerValue > 0) {
      tMode = 'total';
      tValue = Math.max(1, Math.min(60, timerValue));
    } else if (timerMode === 'perTurn' && timerValue > 0) {
      tMode = 'perTurn';
      tValue = Math.max(10, Math.min(300, timerValue));
    } else if (timerMode === 'chess') {
      const parsed = parseChessTimeControl(timeControl);
      if (!parsed) {
        return res.status(400).json({ error: 'Invalid chess time control. Use format like 1+1, 5+0, or 3-1.' });
      }
      tMode = 'chess';
      // Store base seconds in legacy timer_value column.
      tValue = Math.floor(parsed.baseMs / 1000);
    }

    const gameId = uuidv4();
    const gameName_ = gameName || `${user.username}'s Game`;
    const players = [{ id: user.id, username: user.username, color: COLORS[0] }];
    const centerHoldTracker = {
      points: { white: 0, black: 0 },
      queenCrossedToOwnSide: { white: false, black: false },
      timeControl: tMode === 'chess' ? parseChessTimeControl(timeControl) : null,
    };

    await knex(TABLES.games).insert({
      id: gameId,
      name: gameName_,
      status: 'waiting',
      max_players: max,
      players: JSON.stringify(players),
      board: JSON.stringify(createEmptyBoard()),
      current_turn: 0,
      turn_count: 0,
      center_hold_tracker: JSON.stringify(centerHoldTracker),
      winner: null,
      timer_mode: tMode,
      timer_value: tValue,
      eliminated_colors: JSON.stringify([]),
      move_history: JSON.stringify([]),
      created_at: Date.now(),
    });

    io.emit('lobby:update');
    res.json({ game: { id: gameId, name: gameName_, status: 'waiting', playerCount: 1, maxPlayers: max } });
  } catch (e) {
    console.error('[games:create]', e.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

// Join game
app.post('/api/games/:gameId/join', async (req, res) => {
  try {
    const { userId } = req.body;
    const game = await getGame(req.params.gameId);
    if (!game) return res.status(404).json({ error: 'Game not found.' });
    if (game.status !== 'waiting') return res.status(400).json({ error: 'Game already started.' });
    if (game.players.length >= game.maxPlayers) return res.status(400).json({ error: 'Game is full.' });
    if (game.players.find(p => p.id === userId)) return res.status(400).json({ error: 'Already in this game.' });

    const userRow = await knex(TABLES.users).where({ id: userId }).first();
    if (!userRow) return res.status(400).json({ error: 'User not found.' });
    const user = rowToUser(userRow);

    const COLORS = ['white', 'black'];
    const takenColors = game.players.map(p => p.color);
    const color = COLORS.find(c => !takenColors.includes(c));

    game.players.push({ id: user.id, username: user.username, color });

    if (game.players.length === game.maxPlayers) {
      game.status = 'playing';
      game.board = HostageEngine.createStartingBoard();
      game.points = { white: 0, black: 0 };
      game.queenCrossedToOwnSide = { white: false, black: false };
      game.timerStartsAt = Date.now() + 3000;
      setTimeout(() => startGameTimers(game), 3000);
    }

    await saveGame(game);
    io.emit('lobby:update');
    io.to(game.id).emit('game:update', sanitizeGame(game));
    res.json({ game: sanitizeGame(game) });
  } catch (e) {
    console.error('[games:join]', e.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

// Get game state
app.get('/api/games/:gameId', async (req, res) => {
  try {
    const game = await getGame(req.params.gameId);
    if (!game) return res.status(404).json({ error: 'Game not found.' });
    res.json({ game: sanitizeGame(game) });
  } catch (e) {
    console.error('[games:get]', e.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

// Get game history (for review)
app.get('/api/games/:gameId/history', async (req, res) => {
  try {
    const game = await getGame(req.params.gameId);
    if (!game) return res.status(404).json({ error: 'Game not found.' });
    res.json({
      id: game.id,
      name: game.name,
      status: game.status,
      players: game.players,
      winner: game.winner,
      result: game.result || null,
      points: game.points || { white: 0, black: 0 },
      turnCount: game.turnCount,
      moveHistory: game.moveHistory || [],
      finishedAt: game.finishedAt,
      createdAt: game.createdAt,
    });
  } catch (e) {
    console.error('[games:history]', e.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

// Download game history as JSON file
app.get('/api/games/:gameId/history/download', async (req, res) => {
  try {
    const game = await getGame(req.params.gameId);
    if (!game) return res.status(404).json({ error: 'Game not found.' });
    res.setHeader('Content-Disposition', `attachment; filename="game-${game.id}.json"`);
    res.json({
      id: game.id,
      name: game.name,
      status: game.status,
      players: game.players,
      winner: game.winner,
      result: game.result || null,
      points: game.points || { white: 0, black: 0 },
      turnCount: game.turnCount,
      moveHistory: game.moveHistory || [],
      finishedAt: game.finishedAt,
      createdAt: game.createdAt,
    });
  } catch (e) {
    console.error('[games:history:download]', e.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

// User stats
app.get('/api/users/:userId/stats', async (req, res) => {
  try {
    let row = await knex(TABLES.users).where({ id: req.params.userId }).first();
    if (!row) {
      const accountRow = await knex(TABLES.accounts).where({ id: req.params.userId }).first();
      if (!accountRow) return res.status(404).json({ error: 'User not found.' });
      row = await ensureHostageChessUser(accountRow);
    }
    const user = rowToUser(row);
    const { password: _, ...safe } = user;
    res.json({ ...safe });
  } catch (e) {
    console.error('[users:stats]', e.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

// User finished games
app.get('/api/users/:userId/games', async (req, res) => {
  try {
    const { userId } = req.params;
    const rows = await knex(TABLES.games)
      .where({ status: 'finished' })
      .whereRaw('JSON_CONTAINS(players, JSON_ARRAY(JSON_OBJECT(\'id\', ?)))', [userId])
      .orderBy('finished_at', 'desc')
      .limit(50);
    const games = rows.map(r => {
      const g = rowToGame(r);
      return {
        id: g.id,
        name: g.name,
        status: g.status,
        players: g.players,
        winner: g.winner,
        turnCount: g.turnCount,
        finishedAt: g.finishedAt,
        createdAt: g.createdAt,
      };
    });
    res.json({ games });
  } catch (e) {
    console.error('[users:games]', e.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

// Leaderboard
app.get('/api/leaderboard', async (_req, res) => {
  try {
    const rows = await knex(TABLES.users)
      .where('games_played', '>', 0)
      .orderBy('elo', 'desc')
      .limit(100)
      .select('id', 'username', 'elo', 'wins', 'losses', 'draws', 'games_played');
    const leaderboard = rows.map(r => ({
      id: r.id,
      username: r.username,
      elo: r.elo != null ? r.elo : 1200,
      wins: r.wins || 0,
      losses: r.losses || 0,
      draws: r.draws || 0,
      gamesPlayed: r.games_played || 0,
    }));
    res.json({ leaderboard });
  } catch (e) {
    console.error('[leaderboard]', e.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── Board helpers ────────────────────────────────────────

function createEmptyBoard() {
  return Array.from({ length: 8 }, () => Array(8).fill(null));
}

function createStartingBoard(players) {
  return HostageEngine.createStartingBoard();
}

function sanitizeGame(game) {
  return {
    id: game.id,
    name: game.name,
    status: game.status,
    maxPlayers: game.maxPlayers || 4,
    players: game.players.map(p => ({ id: p.id, username: p.username, color: p.color })),
    board: game.board,
    currentTurn: game.currentTurn,
    turnCount: game.turnCount,
    centerHoldTracker: game.centerHoldTracker,
    points: game.points || { white: 0, black: 0 },
    queenCrossedToOwnSide: game.queenCrossedToOwnSide || { white: false, black: false },
    result: game.result || null,
    timeControl: game.timeControl || null,
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

// ─── Socket.IO ────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on('game:join', (gameId) => {
    socket.join(gameId);
  });

  socket.on('game:move', async (data) => {
    try {
      const { gameId, userId, from, to, options } = data;
      const game = await getGame(gameId);
      if (!game || game.status !== 'playing') return;

      const playerIndex = game.players.findIndex(p => p.id === userId);
      if (playerIndex === -1 || playerIndex !== game.currentTurn) return;

      const playerColor = game.players[playerIndex].color;
      if (game.eliminatedColors && game.eliminatedColors.includes(playerColor)) {
        socket.emit('game:moveError', { error: 'You have been eliminated (time ran out).' });
        return;
      }

      const engineState = {
        board: game.board,
        turn: game.players[game.currentTurn]?.color || 'white',
        moveCount: game.turnCount || 0,
        status: game.status || 'playing',
        points: game.points || { white: 0, black: 0 },
        queenCrossedToOwnSide: game.queenCrossedToOwnSide || { white: false, black: false },
      };

      const result = HostageEngine.applyMove(engineState, from, to, options || {});
      if (!result.valid) {
        socket.emit('game:moveError', { error: result.error || 'Illegal move.' });
        return;
      }

      game.board = result.state.board;
      game.turnCount = result.state.moveCount;
      game.points = result.state.points;
      game.queenCrossedToOwnSide = result.state.queenCrossedToOwnSide;
      game.result = result.state.result || null;
      if (!game.moveHistory) game.moveHistory = [];
      game.moveHistory.push({
        turn: result.state.moveCount,
        color: playerColor,
        username: game.players[playerIndex].username,
        from, to,
        action: result.meta?.promoted ? 'promote' : (result.meta?.demoted ? 'demote' : undefined),
        timestamp: Date.now(),
      });

      if (game.timerMode === 'total' && gameClocks[game.id]) {
        const elapsed = Date.now() - (turnStartTs[game.id] || Date.now());
        gameClocks[game.id][playerColor] = Math.max(0, (gameClocks[game.id][playerColor] || 0) - elapsed);
      } else if (game.timerMode === 'chess' && gameClocks[game.id]) {
        const elapsed = Date.now() - (turnStartTs[game.id] || Date.now());
        const incrementMs = game.timeControl?.incrementMs || 0;
        const next = (gameClocks[game.id][playerColor] || 0) - elapsed + incrementMs;
        gameClocks[game.id][playerColor] = Math.max(0, next);
      }

      game.currentTurn = result.state.turn === 'white' ? 0 : 1;
      turnStartTs[game.id] = Date.now();

      if (result.state.status === 'finished' && result.state.result) {
        game.status = 'finished';
        if (result.state.result.type === 'win') game.winner = result.state.result.winner;
        else game.winner = 'draw';
        clearInterval(activeTimers[game.id]);
        delete activeTimers[game.id];
        await updatePlayerStats(game);
      }

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
          requestedBy: player.username,
          agreedCount: 1,
          totalPlayers: game.players.length,
        });
      } else if (!drawRequests[gameId].agreedBy.includes(userId)) {
        drawRequests[gameId].agreedBy.push(userId);

        const agreedCount = drawRequests[gameId].agreedBy.length;
        const requesterRow = await knex(TABLES.users).where({ id: drawRequests[gameId].requestedBy }).first();
        io.to(gameId).emit('game:drawRequested', {
          requestedBy: requesterRow?.username,
          agreedCount,
          totalPlayers: game.players.length,
        });

        if (agreedCount === game.players.length) {
          game.status = 'finished';
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

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

// ─── Timer management ─────────────────────────────────────

function startGameTimers(game) {
  if (game.timerMode === 'none') return;

  if (game.timerMode === 'total') {
    const totalMs = game.timerValue * 60 * 1000;
    gameClocks[game.id] = {};
    game.players.forEach(p => { gameClocks[game.id][p.color] = totalMs; });
  } else if (game.timerMode === 'chess') {
    const baseMs = game.timeControl?.baseMs || (game.timerValue * 1000);
    gameClocks[game.id] = {};
    game.players.forEach(p => { gameClocks[game.id][p.color] = baseMs; });
  } else if (game.timerMode === 'perTurn') {
    const turnMs = game.timerValue * 1000;
    gameClocks[game.id] = {};
    game.players.forEach(p => { gameClocks[game.id][p.color] = turnMs; });
  }

  turnStartTs[game.id] = Date.now();
  activeTimers[game.id] = setInterval(() => tickGameTimer(game.id), 1000);
}

async function tickGameTimer(gameId) {
  try {
    const game = await getGame(gameId);
    if (!game || game.status !== 'playing') {
      clearInterval(activeTimers[gameId]);
      delete activeTimers[gameId];
      return;
    }

    const clocks = gameClocks[gameId];
    if (!clocks) return;

    const currentPlayer = game.players[game.currentTurn];
    if (!currentPlayer) return;
    const color = currentPlayer.color;
    const elapsed = Date.now() - (turnStartTs[gameId] || Date.now());

    let remaining;
    if (game.timerMode === 'total' || game.timerMode === 'chess') {
      remaining = Math.max(0, (clocks[color] || 0) - elapsed);
    } else {
      remaining = Math.max(0, game.timerValue * 1000 - elapsed);
    }

    const clockSnapshot = { ...clocks };
    clockSnapshot[color] = remaining;
    io.to(gameId).emit('game:timerTick', {
      clocks: clockSnapshot,
      currentColor: color,
      turnStartTs: turnStartTs[gameId],
    });

    if (remaining <= 0) {
      if (game.timerMode === 'perTurn') await skipPlayerTurn(game, color);
      else await eliminatePlayer(game, color);
    }
  } catch (e) {
    console.error('[timer]', e.message);
  }
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

async function updatePlayerStats(game) {
  if (game.status !== 'finished') return;
  const isDraw = game.winner === 'draw';

  for (const player of game.players) {
    if (isDraw) {
      await knex(TABLES.users).where({ id: player.id }).increment({ draws: 1, games_played: 1 });
    } else if (player.color === game.winner) {
      await knex(TABLES.users).where({ id: player.id }).increment({ wins: 1, games_played: 1 });
    } else {
      await knex(TABLES.users).where({ id: player.id }).increment({ losses: 1, games_played: 1 });
    }
  }

  const now = Date.now();
  game.finishedAt = now;
  await knex(TABLES.games).where({ id: game.id }).update({ finished_at: now });

}

function saveGameHistory(game) {
  try {
    const histFile = path.join(HISTORY_DIR, `${game.id}.json`);
    fs.writeFileSync(histFile, JSON.stringify({
      id: game.id,
      name: game.name,
      players: game.players,
      status: game.status,
      winner: game.winner,
      moveHistory: game.moveHistory || [],
      updatedAt: new Date().toISOString(),
    }, null, 2));
  } catch (e) {
    console.error('Failed to save game history:', e.message);
  }
}

// ─── SPA fallback ─────────────────────────────────────────
app.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start ────────────────────────────────────────────────
const PORT = process.env.PORT || 3002;
const PROXY = process.env.PROXY_PATH || '';
// server.listen(PORT, () => {
//   console.log(`HostageChess server running on http://localhost:${PORT}`);
// });




// const PORT = process.env.PORT || 3001;
server.listen(PORT, async () => {
  try {
    // Test database connection
    await knex.raw('SELECT 1');
    console.log('🚀 Express Server with MySQL is running on port', PORT);
    console.log('�️  Database: lnx_game (MySQL)');
    console.log('🌐 API Base URL: http://localhost:' + PORT + PROXY + '/api');
    console.log('📋 Available endpoints:');
    console.log('   - GET /api/userData');
    // console.log('   - GET /api/createdKeys');
    // console.log('   - GET /api/unlocks/:username');
    console.log('   - GET /api/purchases/:username');
    // console.log('   - GET /api/redemptions/:username');
    console.log('   - GET /api/notifications/:username');
    console.log('   - POST /api/auth/login');
    console.log('   - GET /api/wallet/balance');
    // console.log('   - POST /api/unlock/:keyId');
    // console.log('   - GET /api/listings');
    // console.log('   - POST /api/create-key');
    console.log('   - GET /api/:table');
    console.log('   - GET /api/:table/:id');
    console.log('   - PATCH /api/:table/:id');
  } catch (error) {
    console.error('❌ Failed to connect to MySQL database:', error.message);
    console.log('📝 Please ensure:');
    console.log('   1. MySQL server is running');
    console.log('   2. KeyChingDB database exists');
    console.log('   3. Database credentials are correct in server.cjs');
    process.exit(1);
  }
});
// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  await knex.destroy();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  await knex.destroy();
  process.exit(0);
});