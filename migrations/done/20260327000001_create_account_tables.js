/**
 * Migration: create account and emailVerifications tables
 *
 * account            — Full user auth / profile table (re-used from videoscrambler).
 * emailVerifications — Short-lived records for email verification codes.
 */

exports.up = async function (knex) {
  await knex.schema.createTable('account', (t) => {
    t.string('id', 10).primary();
    t.string('username', 50).nullable().unique();
    t.string('email', 100).nullable().unique();
    t.integer('credits').defaultTo(150);
    t.string('passwordHash', 255).nullable();
    t.enum('accountType', ['free', 'basic', 'standard', 'premium']).nullable();
    t.dateTime('lastLogin').nullable();
    t.boolean('loginStatus').nullable();
    t.string('firstName', 50).nullable();
    t.string('lastName', 50).nullable();
    t.string('phoneNumber', 20).nullable();
    t.date('birthDate').nullable();
    t.string('encryptionKey', 100).nullable();
    t.integer('reportCount').nullable();
    t.boolean('isBanned').nullable().defaultTo(false);
    t.text('banReason').nullable();
    t.dateTime('banDate').nullable();
    t.integer('banDuration').nullable();
    t.bigInteger('createdAt').nullable();
    t.bigInteger('updatedAt').nullable();
    t.boolean('twoFactorEnabled').nullable().defaultTo(false);
    t.string('twoFactorSecret', 50).nullable();
    t.json('recoveryCodes').nullable();
    t.string('profilePicture', 255).nullable();
    t.text('bio').nullable();
    t.json('socialLinks').nullable();
    t.timestamp('dayPassExpiry').nullable();
    t.string('dayPassMode', 15).nullable();
    t.timestamp('planExpiry').nullable();
    t.string('verification', 5).nullable().defaultTo('false');
    t.double('amount1').nullable();
    t.double('amount2').nullable();
    t.string('resetCode', 6).nullable();
    t.dateTime('resetCodeExpiry').nullable();
    t.string('cryptoAmounts', 255).nullable();
  });

  await knex.schema.createTable('emailVerifications', (t) => {
    t.increments('id').primary();
    t.string('email', 100).notNullable();
    t.string('code', 10).notNullable();
    t.dateTime('expiresAt').notNullable();
    t.dateTime('createdAt').notNullable();
    t.boolean('used').defaultTo(false);
    t.index('email', 'idx_email_verif');
    t.index('expiresAt', 'idx_expires_verif');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('emailVerifications');
  await knex.schema.dropTableIfExists('account');
};
