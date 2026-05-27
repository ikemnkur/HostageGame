exports.up = async function (knex) {
  const hasAge = await knex.schema.hasColumn('HostageChess_users', 'age');
  const hasGender = await knex.schema.hasColumn('HostageChess_users', 'gender');
  const hasCountry = await knex.schema.hasColumn('HostageChess_users', 'country');
  const hasFingerprint = await knex.schema.hasColumn('HostageChess_users', 'fingerprint');

  if (!hasAge || !hasGender || !hasCountry || !hasFingerprint) {
    await knex.schema.alterTable('HostageChess_users', (t) => {
      if (!hasAge) t.string('age', 255).nullable();
      if (!hasGender) t.string('gender', 255).nullable();
      if (!hasCountry) t.string('country', 255).nullable();
      if (!hasFingerprint) t.text('fingerprint').nullable();
    });
  }
};

exports.down = async function (knex) {
  const hasAge = await knex.schema.hasColumn('HostageChess_users', 'age');
  const hasGender = await knex.schema.hasColumn('HostageChess_users', 'gender');
  const hasCountry = await knex.schema.hasColumn('HostageChess_users', 'country');
  const hasFingerprint = await knex.schema.hasColumn('HostageChess_users', 'fingerprint');

  if (hasAge || hasGender || hasCountry || hasFingerprint) {
    await knex.schema.alterTable('HostageChess_users', (t) => {
      if (hasAge) t.dropColumn('age');
      if (hasGender) t.dropColumn('gender');
      if (hasCountry) t.dropColumn('country');
      if (hasFingerprint) t.dropColumn('fingerprint');
    });
  }
};
