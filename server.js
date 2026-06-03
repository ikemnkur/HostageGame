const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
require('dotenv').config();

const knex = require('./config/knex');
const emailService = require('./email-service');
const HostageEngine = require('./public/js/engine.js');

// ─── Cache-bust ID ────────────────────────────────────────
// Changes on every server restart (i.e. every deploy), forcing browsers to
// fetch fresh JS/CSS even when network intermediaries ignore no-store headers.
const BUILD_ID = Date.now().toString(36);

// Pre-process index.html once: append ?v=<BUILD_ID> to all local /js/ and /css/ URLs.
const INDEX_HTML_PATH = path.join(__dirname, 'public', 'index.html');
let cachedIndexHtml = null;
function getIndexHtml() {
  if (!cachedIndexHtml) {
    const raw = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
    // Inject version query string into src and href attributes pointing at local assets.
    cachedIndexHtml = raw
      .replace(/(src|href)="(\/(?:js|css)\/[^"]+)"/g, (_, attr, url) => {
        const sep = url.includes('?') ? '&' : '?';
        return `${attr}="${url}${sep}v=${BUILD_ID}"`;
      });
  }
  return cachedIndexHtml;
}

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
const inactivityWarnings = {}; // gameId -> { 30: bool, 60: bool, 80: bool }
const PRE_GAME_STATS_DELAY_MS = 4500;
const ELO_K_FACTOR = 32;
const INACTIVITY_FORFEIT_MS = 90000;
const ABORT_NULL_MOVE_LIMIT = 7;
const ABORT_NULL_ELO_PENALTY = -1;
const ABORT_FORFEIT_WIN_ELO = 3;
const ABORT_FORFEIT_LOSS_ELO = -3;
const BLOCK_REASON_MAX_LEN = 255;

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
  const sportsmanshipRatings = parseRatingsCsv(row.sportsmanship_ratings);
  const blockedUsers = parseBlockedUsers(row.BlockedUsers || row.blocked_users || '');
  const sportsmanshipAverage = sportsmanshipRatings.length
    ? Number((sportsmanshipRatings.reduce((sum, n) => sum + n, 0) / sportsmanshipRatings.length).toFixed(2))
    : null;
  return {
    id: row.id,
    username: row.username,
    password: row.password || null,
    email: row.email || null,
    age: row.age || null,
    gender: row.gender || null,
    country: row.country || null,
    fingerprintHash: row.fingerprint_hash || null,
    stats: {
      wins: row.wins || 0,
      losses: row.losses || 0,
      draws: row.draws || 0,
      gamesPlayed: row.games_played || 0,
      elo: row.elo != null ? row.elo : 1200,
      sportsmanshipRatings,
      sportsmanshipAverage,
    },
    blockedUsersCount: blockedUsers.length,
    createdAt: row.created_at,
  };
}

function parseRatingsCsv(csv) {
  if (!csv) return [];
  return String(csv)
    .split(',')
    .map((n) => Number.parseInt(n.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 5);
}

function parseBlockedUsers(value) {
  return parseBlockedEntries(value).map((entry) => entry.id);
}

function serializeBlockedUsers(list) {
  const entries = [];
  for (const item of (list || [])) {
    if (item && typeof item === 'object') {
      const id = String(item.id || '').trim();
      if (!id) continue;
      entries.push({ id, reason: sanitizeBlockReason(item.reason) });
      continue;
    }
    const id = String(item || '').trim();
    if (!id) continue;
    entries.push({ id, reason: '' });
  }

  const deduped = [];
  const byId = new Map();
  entries.forEach((entry) => {
    byId.set(entry.id, entry.reason || byId.get(entry.id) || '');
  });
  for (const [id, reason] of byId.entries()) {
    deduped.push({ id, reason: sanitizeBlockReason(reason) });
  }
  return JSON.stringify(deduped);
}

function sanitizeBlockReason(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, BLOCK_REASON_MAX_LEN);
}

function parseBlockedEntries(value) {
  if (!value) return [];
  const normalizeEntry = (entry) => {
    if (entry && typeof entry === 'object') {
      const id = String(entry.id || '').trim();
      if (!id) return null;
      return { id, reason: sanitizeBlockReason(entry.reason) };
    }
    const id = String(entry || '').trim();
    if (!id) return null;
    return { id, reason: '' };
  };

  let rawEntries = null;
  if (Array.isArray(value)) {
    rawEntries = value;
  } else {
    const raw = String(value).trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) rawEntries = parsed;
    } catch {
      // Fall back to CSV format below.
    }
    if (!rawEntries) rawEntries = raw.split(',');
  }

  const deduped = [];
  const byId = new Map();
  rawEntries.forEach((entry) => {
    const normalized = normalizeEntry(entry);
    if (!normalized) return;
    const prevReason = byId.get(normalized.id) || '';
    byId.set(normalized.id, normalized.reason || prevReason);
  });
  for (const [id, reason] of byId.entries()) {
    deduped.push({ id, reason: sanitizeBlockReason(reason) });
  }
  return deduped;
}

function upsertBlockedEntry(entries, targetUserId, reason = '') {
  const next = parseBlockedEntries(entries);
  const targetId = String(targetUserId || '').trim();
  if (!targetId) return next;
  const cleanReason = sanitizeBlockReason(reason);
  const idx = next.findIndex((entry) => entry.id === targetId);
  if (idx >= 0) {
    next[idx].reason = cleanReason;
  } else {
    next.push({ id: targetId, reason: cleanReason });
  }
  return next;
}

function removeBlockedEntry(entries, targetUserId) {
  const targetId = String(targetUserId || '').trim();
  return parseBlockedEntries(entries).filter((entry) => entry.id !== targetId);
}

function sortObjectDeep(value) {
  if (Array.isArray(value)) return value.map(sortObjectDeep);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, k) => {
      acc[k] = sortObjectDeep(value[k]);
      return acc;
    }, {});
  }
  return value;
}

function normalizeFingerprint(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  try {
    const parsed = JSON.parse(s);
    return JSON.stringify(sortObjectDeep(parsed));
  } catch {
    return s.toLowerCase().replace(/\s+/g, ' ').trim();
  }
}

function buildFingerprintHash(raw) {
  const normalized = normalizeFingerprint(raw);
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function serializeRatingsCsv(ratings) {
  return (ratings || []).slice(-50).join(',');
}

function sanitizeProfileField(value, maxLen = 255) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

function parseProfileInput(input = {}) {
  const fingerprint = sanitizeProfileField(input.fingerprint, 4096);
  return {
    age: sanitizeProfileField(input.age),
    gender: sanitizeProfileField(input.gender),
    country: sanitizeProfileField(input.country),
    fingerprint,
    fingerprintHash: buildFingerprintHash(fingerprint),
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
async function ensureHostageChessUser(accountRow, profileInput = {}) {
  const profile = parseProfileInput(profileInput);
  const existing = await knex(TABLES.users).where({ id: accountRow.id }).first();
  if (!existing) {
    await knex(TABLES.users).insert({
      id: accountRow.id,
      username: accountRow.username,
      wins: 0, losses: 0, draws: 0, games_played: 0,
      elo: 1200,
      sportsmanship_ratings: '',
      BlockedUsers: '',
      age: profile.age,
      gender: profile.gender,
      country: profile.country,
      fingerprint: profile.fingerprint,
      fingerprint_hash: profile.fingerprintHash,
      created_at: Date.now(),
    });
    return await knex(TABLES.users).where({ id: accountRow.id }).first();
  }

  const updates = {};
  if (profile.age) updates.age = profile.age;
  if (profile.gender) updates.gender = profile.gender;
  if (profile.country) updates.country = profile.country;
  if (profile.fingerprint) updates.fingerprint = profile.fingerprint;
  if (profile.fingerprintHash) updates.fingerprint_hash = profile.fingerprintHash;
  if (Object.keys(updates).length > 0) {
    await knex(TABLES.users).where({ id: accountRow.id }).update(updates);
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
    age: statsRow?.age || null,
    gender: statsRow?.gender || null,
    country: statsRow?.country || null,
    isBanned: !!row.isBanned,
    createdAt: row.createdAt,
    stats: statsRow ? {
      wins:        statsRow.wins        || 0,
      losses:      statsRow.losses      || 0,
      draws:       statsRow.draws       || 0,
      gamesPlayed: statsRow.games_played || 0,
      elo:         statsRow.elo != null ? statsRow.elo : 1200,
      sportsmanshipRatings: parseRatingsCsv(statsRow.sportsmanship_ratings),
      fingerprintHash: statsRow.fingerprint_hash || null,
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
    const { username, email, password, firstName, lastName, age, gender, country, fingerprint } = req.body;
    const profile = parseProfileInput({ age, gender, country, fingerprint });

    if (!username || username.trim().length < 2 || username.trim().length > 50)
      return res.status(400).json({ error: 'Username must be 2–50 characters.' });
    if (!email || !email.includes('@'))
      return res.status(400).json({ error: 'Valid email is required.' });
    if (!password || password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    if (!profile.age || !profile.gender || !profile.country)
      return res.status(400).json({ error: 'Age, gender, and country are required.' });
    const ageNum = Number.parseInt(profile.age, 10);
    if (!Number.isInteger(ageNum) || ageNum < 13 || ageNum > 120) {
      return res.status(400).json({ error: 'Age must be a number between 13 and 120.' });
    }
    profile.age = String(ageNum);

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
    const statsRow = await ensureHostageChessUser(newAccount, profile);

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
    const { login, password, fingerprint } = req.body; // login = username or email
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
    const statsRow = await ensureHostageChessUser(row, { fingerprint });

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
app.get('/api/games', async (req, res) => {
  try {
    const viewerId = String(req.query.userId || '').trim();
    const includeHiddenDiagnostics = String(req.query.includeHiddenDiagnostics || '') === '1';
    let includeDiagnostics = false;
    const expectedAdminKey = process.env.ADMIN_API_KEY || '';
    if (includeHiddenDiagnostics && expectedAdminKey) {
      const suppliedKey = req.headers['x-admin-key'];
      includeDiagnostics = suppliedKey && suppliedKey === expectedAdminKey;
    }

    let viewerBlocked = [];
    let viewerBlockedEntries = [];
    let viewerUsername = null;
    if (viewerId) {
      const viewerRow = await knex(TABLES.users).where({ id: viewerId }).first();
      viewerBlockedEntries = parseBlockedEntries(viewerRow?.BlockedUsers || viewerRow?.blocked_users || '');
      viewerBlocked = viewerBlockedEntries.map((entry) => entry.id);
      viewerUsername = viewerRow?.username || null;
    }

    const rows = await knex(TABLES.games).whereNot({ status: 'finished' });
    const parsedGames = rows.map((r) => rowToGame(r));
    const allPlayerIds = Array.from(new Set(parsedGames.flatMap((g) => (g.players || []).map((p) => p.id).filter(Boolean))));
    const playerRows = allPlayerIds.length
      ? await knex(TABLES.users).select('id', 'username', 'elo', 'BlockedUsers').whereIn('id', allPlayerIds)
      : [];
    const eloById = new Map(playerRows.map((r) => [r.id, r.elo != null ? r.elo : 1200]));
    const blockedEntriesById = new Map(playerRows.map((r) => [r.id, parseBlockedEntries(r.BlockedUsers || r.blocked_users || '')]));
    const blockedById = new Map(playerRows.map((r) => [r.id, parseBlockedUsers(r.BlockedUsers || r.blocked_users || '')]));
    const usernameById = new Map(playerRows.map((r) => [r.id, r.username || null]));
    if (viewerId && viewerUsername) usernameById.set(viewerId, viewerUsername);

    const hiddenDiagnostics = [];

    const games = rows.map(r => {
      const g = rowToGame(r);
      const creator = (g.players && g.players[0]) ? g.players[0] : null;
      const creatorId = creator ? creator.id : null;

      if (viewerId && creatorId) {
        const creatorBlocked = blockedById.get(creatorId) || [];
        const viewerBlockedCreator = viewerBlocked.includes(creatorId);
        const creatorBlockedViewer = creatorBlocked.includes(viewerId);
        const hidden = viewerBlockedCreator || creatorBlockedViewer;
        if (hidden) {
          if (includeDiagnostics) {
            const viewerEntry = viewerBlockedEntries.find((entry) => entry.id === creatorId) || null;
            const creatorEntries = blockedEntriesById.get(creatorId) || [];
            const creatorEntry = creatorEntries.find((entry) => entry.id === viewerId) || null;
            const causes = [];
            if (viewerBlockedCreator) {
              causes.push({
                direction: 'viewer_blocked_creator',
                blockerId: viewerId,
                blockerUsername: usernameById.get(viewerId) || viewerId,
                blockedId: creatorId,
                blockedUsername: usernameById.get(creatorId) || creator?.username || creatorId,
                reason: viewerEntry?.reason || '',
              });
            }
            if (creatorBlockedViewer) {
              causes.push({
                direction: 'creator_blocked_viewer',
                blockerId: creatorId,
                blockerUsername: usernameById.get(creatorId) || creator?.username || creatorId,
                blockedId: viewerId,
                blockedUsername: usernameById.get(viewerId) || viewerId,
                reason: creatorEntry?.reason || '',
              });
            }
            hiddenDiagnostics.push({
              gameId: g.id,
              gameName: g.name,
              creatorId,
              creatorUsername: creator?.username || usernameById.get(creatorId) || creatorId,
              causes,
            });
          }
          return null;
        }
      }

      return {
        id: g.id,
        name: g.name,
        status: g.status,
        playerCount: g.players.length,
        maxPlayers: g.maxPlayers,
        players: g.players.map(p => ({ id: p.id, username: p.username, color: p.color, elo: eloById.get(p.id) || 1200 })),
        createdBy: creator ? creator.username : null,
        createdById: creator ? creator.id : null,
        timerMode: g.timerMode,
        timerValue: g.timerValue,
        timeControl: g.timeControl || null,
      };
    });
    res.json({ games: games.filter(Boolean), hiddenDiagnostics: includeDiagnostics ? hiddenDiagnostics : [] });
  } catch (e) {
    console.error('[games:list]', e.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

// Create game
app.post('/api/games', async (req, res) => {
  try {
    const { userId, gameName, timerMode, timerValue, timeControl, isGuest, guestId, guestUsername } = req.body;

    let user;
    if (isGuest && guestId && guestUsername) {
      // Guest player: skip DB lookup
      const safeName = String(guestUsername).replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 20) || 'Guest';
      user = { id: String(guestId).slice(0, 60), username: safeName, elo: 1200, isGuest: true };
    } else {
      const userRow = await knex(TABLES.users).where({ id: userId }).first();
      if (!userRow) return res.status(400).json({ error: 'User not found.' });
      user = rowToUser(userRow);
    }

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
    const { userId, isGuest, guestId, guestUsername } = req.body;
    const game = await getGame(req.params.gameId);
    if (!game) return res.status(404).json({ error: 'Game not found.' });
    if (game.status !== 'waiting') return res.status(400).json({ error: 'Game already started.' });
    if (game.players.length >= game.maxPlayers) return res.status(400).json({ error: 'Game is full.' });

    let user;
    if (isGuest && guestId && guestUsername) {
      // Guest player: skip DB lookup and block checks
      const safeName = String(guestUsername).replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 20) || 'Guest';
      const safeId = String(guestId).slice(0, 60);
      if (game.players.find(p => p.id === safeId)) return res.status(400).json({ error: 'Already in this game.' });
      user = { id: safeId, username: safeName, elo: 1200, isGuest: true };
    } else {
      if (game.players.find(p => p.id === userId)) return res.status(400).json({ error: 'Already in this game.' });
      const userRow = await knex(TABLES.users).where({ id: userId }).first();
      if (!userRow) return res.status(400).json({ error: 'User not found.' });
      user = rowToUser(userRow);

      const creator = game.players[0];
      if (creator?.id) {
        const creatorRow = await knex(TABLES.users).where({ id: creator.id }).first();
        const creatorBlocked = parseBlockedUsers(creatorRow?.BlockedUsers || creatorRow?.blocked_users || '');
        const joinerBlocked = parseBlockedUsers(userRow?.BlockedUsers || userRow?.blocked_users || '');
        if (creatorBlocked.includes(user.id) || joinerBlocked.includes(creator.id)) {
          return res.status(403).json({ error: 'You cannot join this game due to block settings.' });
        }
      }
    }

    const COLORS = ['white', 'black'];
    const takenColors = game.players.map(p => p.color);
    const color = COLORS.find(c => !takenColors.includes(c));

    game.players.push({ id: user.id, username: user.username, color });

    if (game.players.length === game.maxPlayers) {
      game.status = 'playing';
      game.board = HostageEngine.createStartingBoard();
      game.points = { white: 0, black: 0 };
      game.queenCrossedToOwnSide = { white: false, black: false };
      game.timerStartsAt = Date.now() + PRE_GAME_STATS_DELAY_MS;
      setTimeout(() => startGameTimers(game), PRE_GAME_STATS_DELAY_MS);
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

// Creator can reject opponent before first move/clock start grace period.
app.post('/api/games/:gameId/reject', async (req, res) => {
  try {
    const { userId } = req.body;
    const game = await getGame(req.params.gameId);
    if (!game) return res.status(404).json({ error: 'Game not found.' });

    const creator = game.players?.[0];
    if (!creator || creator.id !== userId) return res.status(403).json({ error: 'Only game creator can reject.' });
    if (game.status !== 'playing') return res.status(400).json({ error: 'Game is not in pre-start state.' });
    if ((game.moveHistory || []).length > 0) return res.status(400).json({ error: 'Cannot reject after moves have started.' });
    if (!game.timerStartsAt || Date.now() > game.timerStartsAt + 1000) {
      return res.status(400).json({ error: 'Reject window has expired.' });
    }

    const opponent = game.players.find((p) => p.id !== userId);
    if (!opponent) return res.status(400).json({ error: 'No opponent to reject.' });

    game.players = [creator];
    game.status = 'waiting';
    game.currentTurn = 0;
    game.turnCount = 0;
    game.board = createEmptyBoard();
    game.timerStartsAt = null;
    game.moveHistory = [];
    game.eliminatedColors = [];
    game.winner = null;
    game.result = null;
    game.points = { white: 0, black: 0 };
    game.queenCrossedToOwnSide = { white: false, black: false };

    clearInterval(activeTimers[game.id]);
    delete activeTimers[game.id];
    delete inactivityWarnings[game.id];
    delete drawRequests[game.id];

    await saveGame(game);
    io.to(game.id).emit('game:update', sanitizeGame(game));
    io.emit('lobby:update');
    res.json({ success: true, rejectedUserId: opponent.id, game: sanitizeGame(game) });
  } catch (e) {
    console.error('[games:reject]', e.message);
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
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(toCompactHistory(game)));
  } catch (e) {
    console.error('[games:history:download]', e.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

function toCompactHistory(game) {
  const compactPlayers = (game.players || []).map((p) => [p.id, p.username, p.color]);
  const compactMoves = (game.moveHistory || []).map((m) => {
    const base = {
      t: m.turn,
      f: m.from,
      o: m.to,
      ts: m.timestamp,
    };

    if (m.event) {
      return {
        ...base,
        e: m.event,
        c: m.color,
        a: m.action,
        r: m.reason,
        by: m.userId || m.fromUserId || null,
        to: m.toUserId || null,
        rt: m.rating != null ? m.rating : undefined,
      };
    }

    if (m.action) {
      return {
        ...base,
        a: m.action,
      };
    }

    return base;
  });

  return {
    v: 2,
    id: game.id,
    n: game.name,
    s: game.status,
    w: game.winner,
    r: game.result || null,
    p: game.points || { white: 0, black: 0 },
    tc: game.turnCount,
    pl: compactPlayers,
    m: compactMoves,
    ca: game.createdAt,
    fa: game.finishedAt,
  };
}

async function applyAbortNullPenalty(abortingPlayer) {
  const row = await knex(TABLES.users).where({ id: abortingPlayer.id }).first();
  const currentElo = row?.elo != null ? row.elo : 1200;
  await knex(TABLES.users).where({ id: abortingPlayer.id }).update({
    elo: currentElo + ABORT_NULL_ELO_PENALTY,
  });
}

async function applyForfeitOutcome(game, abandoningPlayer, source = 'abandonment') {
  const winner = (game.players || []).find((p) => p.id !== abandoningPlayer.id);
  if (!winner) return;

  game.status = 'finished';
  game.winner = winner.color;
  game.result = {
    type: 'win',
    reason: source,
    abandonedBy: abandoningPlayer.id,
    winner: winner.color,
  };

  const rows = await knex(TABLES.users).whereIn('id', [winner.id, abandoningPlayer.id]);
  const byId = new Map(rows.map((r) => [r.id, r]));

  const winnerRow = byId.get(winner.id) || {};
  const loserRow = byId.get(abandoningPlayer.id) || {};

  await knex(TABLES.users).where({ id: winner.id }).update({
    wins: (winnerRow.wins || 0) + 1,
    games_played: (winnerRow.games_played || 0) + 1,
    elo: (winnerRow.elo != null ? winnerRow.elo : 1200) + ABORT_FORFEIT_WIN_ELO,
  });

  await knex(TABLES.users).where({ id: abandoningPlayer.id }).update({
    losses: (loserRow.losses || 0) + 1,
    games_played: (loserRow.games_played || 0) + 1,
    elo: (loserRow.elo != null ? loserRow.elo : 1200) + ABORT_FORFEIT_LOSS_ELO,
  });

  const now = Date.now();
  game.finishedAt = now;
  await knex(TABLES.games).where({ id: game.id }).update({ finished_at: now });
}

// Abort game (null game if before opening move limit)
app.post('/api/games/:gameId/abort', async (req, res) => {
  try {
    const { userId } = req.body;
    const game = await getGame(req.params.gameId);
    if (!game) return res.status(404).json({ error: 'Game not found.' });
    if (game.status !== 'playing') return res.status(400).json({ error: 'Only active games can be aborted.' });

    const abortingPlayer = game.players.find((p) => p.id === userId);
    if (!abortingPlayer) return res.status(403).json({ error: 'You are not a player in this game.' });

    const moveCount = (game.moveHistory || []).filter((m) => Array.isArray(m.from) && Array.isArray(m.to)).length;
    if (!game.moveHistory) game.moveHistory = [];

    if (moveCount < ABORT_NULL_MOVE_LIMIT) {
      game.status = 'finished';
      game.winner = 'draw';
      game.result = { type: 'null', reason: 'aborted-early', abortedBy: userId };
      game.moveHistory.push({
        turn: game.turnCount,
        event: 'abort',
        reason: 'null',
        userId,
        timestamp: Date.now(),
      });
      await applyAbortNullPenalty(abortingPlayer);
      const now = Date.now();
      game.finishedAt = now;
      await knex(TABLES.games).where({ id: game.id }).update({ finished_at: now });
    } else {
      game.moveHistory.push({
        turn: game.turnCount,
        event: 'abort',
        reason: 'forfeit',
        userId,
        timestamp: Date.now(),
      });
      await applyForfeitOutcome(game, abortingPlayer, 'abort');
    }

    clearInterval(activeTimers[game.id]);
    delete activeTimers[game.id];
    delete inactivityWarnings[game.id];
    delete drawRequests[game.id];

    await saveGame(game);
    saveGameHistory(game);
    io.to(game.id).emit('game:update', sanitizeGame(game));
    io.emit('lobby:update');
    res.json({ game: sanitizeGame(game) });
  } catch (e) {
    console.error('[games:abort]', e.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

app.post('/api/games/:gameId/sportsmanship', async (req, res) => {
  try {
    const { fromUserId, toUserId, rating } = req.body;
    const score = Number.parseInt(rating, 10);
    if (!Number.isInteger(score) || score < 0 || score > 5) {
      return res.status(400).json({ error: 'Rating must be an integer from 0 to 5.' });
    }

    const game = await getGame(req.params.gameId);
    if (!game) return res.status(404).json({ error: 'Game not found.' });
    if (game.status !== 'finished') return res.status(400).json({ error: 'Rate sportsmanship after game completion.' });
    if (fromUserId === toUserId) return res.status(400).json({ error: 'You cannot rate yourself.' });

    const isFromPlayer = (game.players || []).some((p) => p.id === fromUserId);
    const isToPlayer = (game.players || []).some((p) => p.id === toUserId);
    if (!isFromPlayer || !isToPlayer) return res.status(400).json({ error: 'Both users must be players in this game.' });

    const alreadyRated = (game.moveHistory || []).some((m) =>
      m.event === 'sportsmanshipRating' && m.fromUserId === fromUserId && m.toUserId === toUserId
    );
    if (alreadyRated) return res.status(400).json({ error: 'You already rated this player for this game.' });

    const toRow = await knex(TABLES.users).where({ id: toUserId }).first();
    if (!toRow) return res.status(404).json({ error: 'Rated player not found.' });

    const nextRatings = [...parseRatingsCsv(toRow.sportsmanship_ratings), score].slice(-50);
    await knex(TABLES.users).where({ id: toUserId }).update({
      sportsmanship_ratings: serializeRatingsCsv(nextRatings),
    });

    if (!game.moveHistory) game.moveHistory = [];
    game.moveHistory.push({
      turn: game.turnCount,
      event: 'sportsmanshipRating',
      fromUserId,
      toUserId,
      rating: score,
      timestamp: Date.now(),
    });

    await saveGame(game);
    saveGameHistory(game);
    io.to(game.id).emit('game:update', sanitizeGame(game));
    res.json({ success: true, ratingsCount: nextRatings.length });
  } catch (e) {
    console.error('[games:sportsmanship]', e.message);
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

// User search (for lobby profile lookup)
app.get('/api/users/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ users: [] });

    const rows = await knex(TABLES.users)
      .select('id', 'username', 'elo', 'country', 'created_at')
      .where('username', 'like', `%${q}%`)
      .orderBy('elo', 'desc')
      .limit(12);

    const users = rows.map((r) => ({
      id: r.id,
      username: r.username,
      elo: r.elo != null ? r.elo : 1200,
      country: r.country || null,
      createdAt: r.created_at || null,
    }));
    res.json({ users });
  } catch (e) {
    console.error('[users:search]', e.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

app.get('/api/users/:userId/block-status', async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    const viewerId = String(req.query.viewerId || '').trim();
    if (!viewerId) return res.status(400).json({ error: 'viewerId is required.' });

    const [viewer, target] = await Promise.all([
      knex(TABLES.users).where({ id: viewerId }).first(),
      knex(TABLES.users).where({ id: targetUserId }).first(),
    ]);
    if (!viewer) return res.status(404).json({ error: 'Viewer not found.' });
    if (!target) return res.status(404).json({ error: 'Target user not found.' });

    const viewerEntries = parseBlockedEntries(viewer.BlockedUsers || viewer.blocked_users || '');
    const targetEntries = parseBlockedEntries(target.BlockedUsers || target.blocked_users || '');
    const viewerEntry = viewerEntries.find((entry) => entry.id === targetUserId) || null;
    const targetEntry = targetEntries.find((entry) => entry.id === viewerId) || null;

    res.json({
      blocked: !!viewerEntry,
      blockedByTarget: !!targetEntry,
      reason: viewerEntry?.reason || '',
      blockedByTargetReason: targetEntry?.reason || '',
    });
  } catch (e) {
    console.error('[users:block-status]', e.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

app.post('/api/users/:userId/block', async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    const requesterId = String(req.body.requesterId || '').trim();
    const reason = sanitizeBlockReason(req.body.reason || '');
    if (!requesterId) return res.status(400).json({ error: 'requesterId is required.' });
    if (targetUserId === requesterId) return res.status(400).json({ error: 'You cannot block yourself.' });

    const requester = await knex(TABLES.users).where({ id: requesterId }).first();
    if (!requester) return res.status(404).json({ error: 'Requester not found.' });
    const target = await knex(TABLES.users).where({ id: targetUserId }).first();
    if (!target) return res.status(404).json({ error: 'Target user not found.' });

    const blockedEntries = upsertBlockedEntry(requester.BlockedUsers || requester.blocked_users || '', targetUserId, reason);
    await knex(TABLES.users).where({ id: requesterId }).update({
      BlockedUsers: serializeBlockedUsers(blockedEntries),
    });
    res.json({ success: true, blocked: true, reason });
  } catch (e) {
    console.error('[users:block]', e.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

app.post('/api/users/:userId/unblock', async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    const requesterId = String(req.body.requesterId || '').trim();
    if (!requesterId) return res.status(400).json({ error: 'requesterId is required.' });

    const requester = await knex(TABLES.users).where({ id: requesterId }).first();
    if (!requester) return res.status(404).json({ error: 'Requester not found.' });

    const next = removeBlockedEntry(requester.BlockedUsers || requester.blocked_users || '', targetUserId);
    await knex(TABLES.users).where({ id: requesterId }).update({
      BlockedUsers: serializeBlockedUsers(next),
    });
    res.json({ success: true, blocked: false });
  } catch (e) {
    console.error('[users:unblock]', e.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

// Submit report against a user for admin review
app.post('/api/users/:userId/report', async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    const reporterId = String(req.body.reporterId || '').trim();
    const reason = String(req.body.reason || '').trim();
    const details = String(req.body.details || '').trim();

    if (!reporterId) return res.status(400).json({ error: 'Missing reporterId.' });
    if (!reason) return res.status(400).json({ error: 'Reason is required.' });
    if (reason.length > 120) return res.status(400).json({ error: 'Reason is too long.' });
    if (details.length > 2000) return res.status(400).json({ error: 'Details are too long.' });
    if (targetUserId === reporterId) return res.status(400).json({ error: 'You cannot report yourself.' });

    const [target, reporter] = await Promise.all([
      knex(TABLES.users).where({ id: targetUserId }).first(),
      knex(TABLES.users).where({ id: reporterId }).first(),
    ]);

    if (!target) return res.status(404).json({ error: 'Reported user not found.' });
    if (!reporter) return res.status(404).json({ error: 'Reporter user not found.' });

    await knex('HostageChess_user_reports').insert({
      id: uuidv4(),
      reported_user_id: targetUserId,
      reporter_user_id: reporterId,
      reason,
      details: details || null,
      status: 'open',
      created_at: Date.now(),
    });

    res.json({ success: true });
  } catch (e) {
    console.error('[users:report]', e.message);
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

// Admin: find repeated matching browser fingerprints
app.get('/api/admin/fingerprint-flags', async (req, res) => {
  try {
    const expectedKey = process.env.ADMIN_API_KEY || '';
    const suppliedKey = req.headers['x-admin-key'];
    if (!expectedKey) return res.status(503).json({ error: 'ADMIN_API_KEY is not configured.' });
    if (!suppliedKey || suppliedKey !== expectedKey) return res.status(403).json({ error: 'Forbidden.' });

    const minCount = Math.max(2, Number.parseInt(req.query.minCount, 10) || 2);
    const hashRows = await knex(TABLES.users)
      .select('fingerprint_hash')
      .count({ count: '*' })
      .whereNotNull('fingerprint_hash')
      .where('fingerprint_hash', '<>', '')
      .groupBy('fingerprint_hash')
      .havingRaw('COUNT(*) >= ?', [minCount])
      .orderBy('count', 'desc');

    const hashes = hashRows.map((r) => r.fingerprint_hash).filter(Boolean);
    if (hashes.length === 0) {
      return res.json({ minCount, groups: [], totalFlaggedAccounts: 0 });
    }

    const users = await knex(TABLES.users)
      .select('id', 'username', 'fingerprint_hash', 'age', 'gender', 'country', 'created_at')
      .whereIn('fingerprint_hash', hashes)
      .orderBy('created_at', 'desc');

    const usersByHash = users.reduce((acc, u) => {
      const key = u.fingerprint_hash;
      if (!acc[key]) acc[key] = [];
      acc[key].push({
        id: u.id,
        username: u.username,
        age: u.age || null,
        gender: u.gender || null,
        country: u.country || null,
        createdAt: u.created_at || null,
      });
      return acc;
    }, {});

    const groups = hashRows.map((r) => ({
      fingerprintHash: r.fingerprint_hash,
      matchCount: Number(r.count) || 0,
      accounts: usersByHash[r.fingerprint_hash] || [],
    }));

    const totalFlaggedAccounts = groups.reduce((sum, g) => sum + g.accounts.length, 0);
    res.json({ minCount, groups, totalFlaggedAccounts });
  } catch (e) {
    console.error('[admin:fingerprint-flags]', e.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

app.get('/api/admin/user-reports', async (req, res) => {
  try {
    const expectedKey = process.env.ADMIN_API_KEY || '';
    const suppliedKey = req.headers['x-admin-key'];
    if (!expectedKey) return res.status(503).json({ error: 'ADMIN_API_KEY is not configured.' });
    if (!suppliedKey || suppliedKey !== expectedKey) return res.status(403).json({ error: 'Forbidden.' });

    const status = String(req.query.status || '').trim();
    const limit = Math.max(1, Math.min(200, Number.parseInt(req.query.limit, 10) || 100));

    let query = knex('HostageChess_user_reports as r')
      .leftJoin(`${TABLES.users} as u1`, 'u1.id', 'r.reported_user_id')
      .leftJoin(`${TABLES.users} as u2`, 'u2.id', 'r.reporter_user_id')
      .select(
        'r.id', 'r.reason', 'r.details', 'r.status', 'r.created_at',
        'r.reported_user_id', 'u1.username as reported_username',
        'r.reporter_user_id', 'u2.username as reporter_username'
      )
      .orderBy('r.created_at', 'desc')
      .limit(limit);

    if (status) query = query.where('r.status', status);
    const rows = await query;

    const reports = rows.map((r) => ({
      id: r.id,
      reason: r.reason,
      details: r.details || '',
      status: r.status,
      createdAt: r.created_at,
      reportedUser: { id: r.reported_user_id, username: r.reported_username || null },
      reporterUser: { id: r.reporter_user_id, username: r.reporter_username || null },
    }));

    res.json({ reports });
  } catch (e) {
    console.error('[admin:user-reports]', e.message);
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
        positionHistory: game.positionHistory || [],
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
      game.positionHistory = result.state.positionHistory || [];
      game.result = result.state.result || null;
      if (!game.moveHistory) game.moveHistory = [];
      game.moveHistory.push({
        turn: result.state.moveCount,
        color: playerColor,
        username: game.players[playerIndex].username,
        from, to,
        action: (result.meta?.promoted || result.meta?.castlePromoted) ? 'promote' : (result.meta?.demoted ? 'demote' : undefined),
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
      resetTurnInactivityWindow(game.id);

      if (result.state.status === 'finished' && result.state.result) {
        game.status = 'finished';
        if (result.state.result.type === 'win') game.winner = result.state.result.winner;
        else game.winner = 'draw';
        clearInterval(activeTimers[game.id]);
        delete activeTimers[game.id];
        delete inactivityWarnings[game.id];
        delete drawRequests[game.id];
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
        delete inactivityWarnings[game.id];
        delete drawRequests[game.id];
        await updatePlayerStats(game);
      } else if (game.currentTurn === game.players.indexOf(player)) {
        game.currentTurn = advanceTurn(game);
        resetTurnInactivityWindow(game.id);
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
          delete inactivityWarnings[game.id];

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

  resetTurnInactivityWindow(game.id);
  activeTimers[game.id] = setInterval(() => tickGameTimer(game.id), 1000);
}

function resetTurnInactivityWindow(gameId) {
  turnStartTs[gameId] = Date.now();
  inactivityWarnings[gameId] = { 30: false, 60: false, 80: false };
}

async function tickGameTimer(gameId) {
  try {
    const game = await getGame(gameId);
    if (!game || game.status !== 'playing') {
      clearInterval(activeTimers[gameId]);
      delete activeTimers[gameId];
      return;
    }

    const currentPlayer = game.players[game.currentTurn];
    if (!currentPlayer) return;
    const color = currentPlayer.color;
    const elapsed = Date.now() - (turnStartTs[gameId] || Date.now());

    const warnings = inactivityWarnings[gameId] || { 30: false, 60: false, 80: false };
    if (elapsed >= 30000 && !warnings[30]) {
      warnings[30] = true;
      io.to(gameId).emit('game:abandonWarning', { secondsElapsed: 30, message: '60 sec left to move or lose.' });
    }
    if (elapsed >= 60000 && !warnings[60]) {
      warnings[60] = true;
      io.to(gameId).emit('game:abandonWarning', { secondsElapsed: 60, message: '30 sec left to move or lose.' });
    }
    if (elapsed >= 80000 && !warnings[80]) {
      warnings[80] = true;
      io.to(gameId).emit('game:abandonWarning', { secondsElapsed: 80, message: '10 sec left to move or lose.' });
    }
    inactivityWarnings[gameId] = warnings;

    if (elapsed >= INACTIVITY_FORFEIT_MS) {
      await applyForfeitOutcome(game, currentPlayer, 'inactivity-timeout');
      if (!game.moveHistory) game.moveHistory = [];
      game.moveHistory.push({
        turn: game.turnCount,
        event: 'abandonTimeout',
        color,
        userId: currentPlayer.id,
        reason: 'no-move-90s',
        timestamp: Date.now(),
      });
      clearInterval(activeTimers[gameId]);
      delete activeTimers[gameId];
      delete inactivityWarnings[gameId];
      delete drawRequests[gameId];
      await saveGame(game);
      saveGameHistory(game);
      io.to(game.id).emit('game:update', sanitizeGame(game));
      io.emit('lobby:update');
      return;
    }

    const clocks = gameClocks[gameId];
    if (!clocks || game.timerMode === 'none') return;

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
    delete inactivityWarnings[game.id];
    delete drawRequests[game.id];
    await updatePlayerStats(game);
  } else {
    game.currentTurn = advanceTurn(game);
    resetTurnInactivityWindow(game.id);
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
  resetTurnInactivityWindow(game.id);
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
  // Skip ELO updates for any game that included a guest player.
  if (game.players.some(p => p.isGuest)) return;
  const isDraw = game.winner === 'draw' || !game.winner;
  const userRows = await knex(TABLES.users).whereIn('id', game.players.map(p => p.id));
  const byId = new Map(userRows.map(r => [r.id, r]));

  const ratedPlayers = game.players.map((p) => ({
    ...p,
    elo: (byId.get(p.id)?.elo != null) ? byId.get(p.id).elo : 1200,
  }));

  const winners = isDraw ? [] : ratedPlayers.filter(p => p.color === game.winner);

  for (const player of ratedPlayers) {
    const row = byId.get(player.id) || {};
    const opponents = ratedPlayers.filter(o => o.id !== player.id);
    const opponentAvg = opponents.length
      ? opponents.reduce((sum, o) => sum + o.elo, 0) / opponents.length
      : player.elo;
    const expected = 1 / (1 + Math.pow(10, (opponentAvg - player.elo) / 400));

    let actual = 0.5;
    if (!isDraw) actual = winners.some(w => w.id === player.id) ? 1 : 0;

    const nextElo = Math.round(player.elo + ELO_K_FACTOR * (actual - expected));
    const update = {
      elo: nextElo,
      games_played: (row.games_played || 0) + 1,
    };

    if (isDraw) {
      update.draws = (row.draws || 0) + 1;
    } else if (winners.some(w => w.id === player.id)) {
      update.wins = (row.wins || 0) + 1;
    } else {
      update.losses = (row.losses || 0) + 1;
    }

    await knex(TABLES.users).where({ id: player.id }).update(update);
  }

  const now = Date.now();
  game.finishedAt = now;
  await knex(TABLES.games).where({ id: game.id }).update({ finished_at: now });

}

function saveGameHistory(game) {
  try {
    const histFile = path.join(HISTORY_DIR, `${game.id}.json`);
    const compact = {
      ...toCompactHistory(game),
      ua: new Date().toISOString(),
    };
    fs.writeFileSync(histFile, JSON.stringify(compact));
  } catch (e) {
    console.error('Failed to save game history:', e.message);
  }
}

// ─── SPA fallback ─────────────────────────────────────────
app.use((_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(getIndexHtml());
});

// ─── Start ────────────────────────────────────────────────
const PORT = process.env.PORT || 3002;
const PROXY = process.env.PROXY_PATH || '';
// server.listen(PORT, () => {
//   console.log(`HostageChess server running on http://localhost:${PORT}`);
// });




// const PORT = process.env.PORT || 3001;
// ─── Stale game cleanup (every 5 min, removes waiting games > 30 min old) ──
const STALE_GAME_AGE_MS = 30 * 60 * 1000; // 30 minutes
const STALE_GAME_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function cleanupStaleGames() {
  try {
    const cutoff = Date.now() - STALE_GAME_AGE_MS;
    const stale = await knex(TABLES.games)
      .where({ status: 'waiting' })
      .where('created_at', '<', cutoff)
      .select('id');

    if (stale.length === 0) return;

    const staleIds = stale.map(r => r.id);
    await knex(TABLES.games).whereIn('id', staleIds).delete();

    io.emit('lobby:update');
    console.log(`[cleanup] Removed ${staleIds.length} stale waiting game(s).`);
  } catch (err) {
    console.error('[cleanup] Failed to remove stale games:', err.message);
  }
}

server.listen(PORT, async () => {
  try {
    // Test database connection
    await knex.raw('SELECT 1');
    console.log('🚀 Express Server with MySQL is running on port', PORT);

    // Start stale game cleanup job
    setInterval(cleanupStaleGames, STALE_GAME_CHECK_INTERVAL_MS);
    console.log(`🧹 Stale game cleanup job started (interval: ${STALE_GAME_CHECK_INTERVAL_MS / 60000} min, max age: ${STALE_GAME_AGE_MS / 60000} min).`);
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