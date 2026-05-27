exports.up = async function (knex) {
  const hasFingerprintHash = await knex.schema.hasColumn('HostageChess_users', 'fingerprint_hash');
  if (!hasFingerprintHash) {
    await knex.schema.alterTable('HostageChess_users', (t) => {
      t.string('fingerprint_hash', 64).nullable();
      t.index(['fingerprint_hash'], 'idx_hostage_users_fingerprint_hash');
    });
    return;
  }

  // Ensure index exists if column already existed.
  try {
    await knex.raw('CREATE INDEX idx_hostage_users_fingerprint_hash ON HostageChess_users (fingerprint_hash)');
  } catch {
    // Ignore duplicate index creation attempts.
  }
};

exports.down = async function (knex) {
  const hasFingerprintHash = await knex.schema.hasColumn('HostageChess_users', 'fingerprint_hash');
  if (!hasFingerprintHash) return;

  try {
    await knex.raw('DROP INDEX idx_hostage_users_fingerprint_hash ON HostageChess_users');
  } catch {
    // Ignore if index is absent.
  }

  await knex.schema.alterTable('HostageChess_users', (t) => {
    t.dropColumn('fingerprint_hash');
  });
};
