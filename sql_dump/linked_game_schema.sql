-- ============================================================
--  HostageChessGame — schema creation script
--  Run against a fresh MySQL 8+ database:
--    mysql -u root -p HostageChessGame < HostageChess_game_schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS `HostageChessGame`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `HostageChessGame`;

-- ────────────────────────────────────────────────────────────
--  HostageChess_users
--  Stores player accounts, credentials, and cumulative stats.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `HostageChess_users` (
  `id`           VARCHAR(36)   NOT NULL,
  `username`     VARCHAR(50)   NOT NULL,
  `password`     VARCHAR(255)  DEFAULT NULL,
  `email`        VARCHAR(100)  DEFAULT NULL,
  `wins`         INT UNSIGNED  NOT NULL DEFAULT 0,
  `losses`       INT UNSIGNED  NOT NULL DEFAULT 0,
  `draws`        INT UNSIGNED  NOT NULL DEFAULT 0,
  `games_played` INT UNSIGNED  NOT NULL DEFAULT 0,
  `elo`          INT           NOT NULL DEFAULT 1200,
  `created_at`   BIGINT        DEFAULT NULL   COMMENT 'Unix ms timestamp',

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────
--  HostageChess_games
--  Stores active and finished game records.
--  Complex state (board, players, history) kept as JSON columns.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `HostageChess_games` (
  `id`                   VARCHAR(36)                           NOT NULL,
  `name`                 VARCHAR(200)                          NOT NULL,
  `status`               ENUM('waiting','playing','finished')  NOT NULL DEFAULT 'waiting',
  `max_players`          INT UNSIGNED                          NOT NULL DEFAULT 4,
  `players`              JSON                                  DEFAULT NULL  COMMENT 'Array of {id, username, color, …}',
  `board`                JSON                                  DEFAULT NULL  COMMENT 'Full board state',
  `current_turn`         INT                                   NOT NULL DEFAULT 0,
  `turn_count`           INT                                   NOT NULL DEFAULT 0,
  `center_hold_tracker`  JSON                                  DEFAULT NULL,
  `winner`               VARCHAR(20)                           DEFAULT NULL,
  `timer_mode`           VARCHAR(20)                           NOT NULL DEFAULT 'none',
  `timer_value`          INT                                   NOT NULL DEFAULT 0,
  `timer_starts_at`      BIGINT                                DEFAULT NULL  COMMENT 'Unix ms timestamp',
  `eliminated_colors`    JSON                                  DEFAULT NULL,
  `move_history`         JSON                                  DEFAULT NULL,
  `finished_at`          BIGINT                                DEFAULT NULL  COMMENT 'Unix ms timestamp',
  `created_at`           BIGINT                                DEFAULT NULL  COMMENT 'Unix ms timestamp',

  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────
--  account
--  Full user auth and profile (re-used from videoscrambler schema).
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `account` (
  `id`               VARCHAR(10)                                   NOT NULL,
  `username`         VARCHAR(50)                                   DEFAULT NULL,
  `email`            VARCHAR(100)                                  DEFAULT NULL,
  `credits`          INT                                           DEFAULT 150,
  `passwordHash`     VARCHAR(255)                                  DEFAULT NULL,
  `accountType`      ENUM('free','basic','standard','premium')     DEFAULT NULL,
  `lastLogin`        DATETIME                                      DEFAULT NULL,
  `loginStatus`      TINYINT(1)                                    DEFAULT NULL,
  `firstName`        VARCHAR(50)                                   DEFAULT NULL,
  `lastName`         VARCHAR(50)                                   DEFAULT NULL,
  `phoneNumber`      VARCHAR(20)                                   DEFAULT NULL,
  `birthDate`        DATE                                          DEFAULT NULL,
  `encryptionKey`    VARCHAR(100)                                  DEFAULT NULL,
  `reportCount`      INT                                           DEFAULT NULL,
  `isBanned`         TINYINT(1)                                    DEFAULT 0,
  `banReason`        TEXT                                          DEFAULT NULL,
  `banDate`          DATETIME                                      DEFAULT NULL,
  `banDuration`      INT                                           DEFAULT NULL,
  `createdAt`        BIGINT                                        DEFAULT NULL,
  `updatedAt`        BIGINT                                        DEFAULT NULL,
  `twoFactorEnabled` TINYINT(1)                                    DEFAULT 0,
  `twoFactorSecret`  VARCHAR(50)                                   DEFAULT NULL,
  `recoveryCodes`    JSON                                          DEFAULT NULL,
  `profilePicture`   VARCHAR(255)                                  DEFAULT NULL,
  `bio`              TEXT                                          DEFAULT NULL,
  `socialLinks`      JSON                                          DEFAULT NULL,
  `dayPassExpiry`    TIMESTAMP                                     NULL DEFAULT NULL,
  `dayPassMode`      VARCHAR(15)                                   DEFAULT NULL,
  `planExpiry`       TIMESTAMP                                     NULL DEFAULT NULL,
  `verification`     VARCHAR(5)                                    DEFAULT 'false',
  `amount1`          DOUBLE                                        DEFAULT NULL,
  `amount2`          DOUBLE                                        DEFAULT NULL,
  `resetCode`        VARCHAR(6)                                    DEFAULT NULL,
  `resetCodeExpiry`  DATETIME                                      DEFAULT NULL,
  `cryptoAmounts`    VARCHAR(255)                                  DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_account_username` (`username`),
  UNIQUE KEY `uq_account_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ────────────────────────────────────────────────────────────
--  emailVerifications
--  Short-lived records for email verification codes.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `emailVerifications` (
  `id`        INT          NOT NULL AUTO_INCREMENT,
  `email`     VARCHAR(100) NOT NULL,
  `code`      VARCHAR(10)  NOT NULL,
  `expiresAt` DATETIME     NOT NULL,
  `createdAt` DATETIME     NOT NULL,
  `used`      TINYINT(1)   DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_email_verif`   (`email`),
  KEY `idx_expires_verif` (`expiresAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────
--  knex_migrations  (created automatically by knex migrate:latest,
--  included here so the schema is fully self-contained)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `knex_migrations` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`           VARCHAR(255) DEFAULT NULL,
  `batch`          INT          DEFAULT NULL,
  `migration_time` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `knex_migrations_lock` (
  `index`     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `is_locked` INT          DEFAULT 0,
  PRIMARY KEY (`index`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
