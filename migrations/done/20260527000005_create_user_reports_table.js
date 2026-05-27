exports.up = async function (knex) {
  const exists = await knex.schema.hasTable('HostageChess_user_reports');
  if (exists) return;

  await knex.schema.createTable('HostageChess_user_reports', (t) => {
    t.string('id', 36).primary();
    t.string('reported_user_id', 36).notNullable();
    t.string('reporter_user_id', 36).notNullable();
    t.string('reason', 120).notNullable();
    t.text('details').nullable();
    t.string('status', 20).notNullable().defaultTo('open');
    t.bigInteger('created_at').notNullable();

    t.index(['reported_user_id'], 'idx_hc_reports_reported');
    t.index(['reporter_user_id'], 'idx_hc_reports_reporter');
    t.index(['status'], 'idx_hc_reports_status');
    t.index(['created_at'], 'idx_hc_reports_created_at');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('HostageChess_user_reports');
};
