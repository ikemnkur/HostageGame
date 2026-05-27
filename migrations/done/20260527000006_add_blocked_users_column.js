exports.up = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('HostageChess_users', 'BlockedUsers');
  if (!hasColumn) {
    await knex.schema.alterTable('HostageChess_users', (t) => {
      t.text('BlockedUsers').nullable();
    });
  }
};

exports.down = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('HostageChess_users', 'BlockedUsers');
  if (hasColumn) {
    await knex.schema.alterTable('HostageChess_users', (t) => {
      t.dropColumn('BlockedUsers');
    });
  }
};
