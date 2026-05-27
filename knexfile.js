require('dotenv').config();

function readEnv(name, fallback) {
  const value = process.env[name];
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

/** @type {import('knex').Knex.Config} */
module.exports = {
  client: 'mysql2',
  connection: {
    host:     readEnv('DB_HOST', 'localhost'),
    port:     parseInt(readEnv('DB_PORT', '3306'), 10) || 3306,
    user:     readEnv('DB_USER', 'root'),
    password: readEnv('DB_PASSWORD', ''),
    database: readEnv('DB_NAME', 'HostageChessGame'),
  },
  pool: {
    min: 0,
    max: parseInt(readEnv('DB_CONNECTION_LIMIT', '10'), 10) || 10,
  },
  migrations: {
    directory: './migrations',
    tableName:  'knex_migrations',
  },
};
