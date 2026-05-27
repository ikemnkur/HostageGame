exports.up = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('HostageChess_users', 'sportsmanship_ratings');
  if (!hasColumn) {
    await knex.schema.alterTable('HostageChess_users', (t) => {
      t.string('sportsmanship_ratings', 255).notNullable().defaultTo('');
    });
  }
};

exports.down = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('HostageChess_users', 'sportsmanship_ratings');
  if (hasColumn) {
    await knex.schema.alterTable('HostageChess_users', (t) => {
      t.dropColumn('sportsmanship_ratings');
    });
  }
};
