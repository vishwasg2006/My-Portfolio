-- Created automatically on first run. Included for reference / manual setup.
CREATE DATABASE IF NOT EXISTS portfolio CHARACTER SET utf8mb4;
USE portfolio;

-- Your name, tagline, about text, links (one row, JSON text)
CREATE TABLE IF NOT EXISTS profile (
  id   TINYINT PRIMARY KEY,
  data LONGTEXT NOT NULL
) CHARACTER SET utf8mb4;

-- Projects, certificates and skills (col = 'projects' | 'certificates' | 'skills')
CREATE TABLE IF NOT EXISTS items (
  id         VARCHAR(36) PRIMARY KEY,
  col        VARCHAR(20) NOT NULL,
  ord        INT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  data       LONGTEXT NOT NULL,
  INDEX idx_col_ord (col, ord)
) CHARACTER SET utf8mb4;
