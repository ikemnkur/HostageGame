require('dotenv').config();

const knex = require('knex')(require('../knexfile'));

module.exports = knex;
