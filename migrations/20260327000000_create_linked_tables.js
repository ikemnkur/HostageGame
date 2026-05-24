/**
 * Migration: create linked_users and linked_games tables
 *
 * linked_users  — game-specific user auth & stats (separate from the main
 *                 videoscrambler userData table).
 * linked_games  — active and finished game records with JSON columns for
 *                 complex nested state (board, players, move history, etc.).
 */

exports.up = async function (knex) {
  await knex.schema.createTable('linked_users', (t) => {
    t.string('id', 36).primary();
    t.string('username', 50).notNullable().unique();
    t.string('password', 255).nullable();
    t.string('email', 100).nullable();
    t.integer('wins').unsigned().defaultTo(0);
    t.integer('losses').unsigned().defaultTo(0);
    t.integer('draws').unsigned().defaultTo(0);
    t.integer('games_played').unsigned().defaultTo(0);
    t.integer('elo').defaultTo(1200);
    t.bigInteger('created_at').nullable();
  });

  await knex.schema.createTable('linked_games', (t) => {
    t.string('id', 36).primary();
    t.string('name', 200).notNullable();
    t.enum('status', ['waiting', 'playing', 'finished']).defaultTo('waiting');
    t.integer('max_players').unsigned().defaultTo(4);
    // JSON columns — board, players list, move history, etc.
    t.json('players');
    t.json('board');
    t.integer('current_turn').defaultTo(0);
    t.integer('turn_count').defaultTo(0);
    t.json('center_hold_tracker');
    t.string('winner', 20).nullable();
    t.string('timer_mode', 20).defaultTo('none');
    t.integer('timer_value').defaultTo(0);
    t.bigInteger('timer_starts_at').nullable();
    t.json('eliminated_colors');
    t.json('move_history');
    t.bigInteger('finished_at').nullable();
    t.bigInteger('created_at').nullable();

    t.index('status');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('linked_games');
  await knex.schema.dropTableIfExists('linked_users');
};
