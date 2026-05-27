-- CloudBrain 2.0 Database Schema

CREATE DATABASE IF NOT EXISTS cloudbrain;
USE cloudbrain;

-- Credentials storage (encrypted)
CREATE TABLE IF NOT EXISTS credentials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  `key` VARCHAR(100) UNIQUE NOT NULL,
  `value` TEXT NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'general',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Conversation history
CREATE TABLE IF NOT EXISTS conversations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(100) NOT NULL,
  channel VARCHAR(20) NOT NULL,
  role ENUM('user', 'assistant', 'system') NOT NULL,
  content TEXT NOT NULL,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_channel (user_id, channel),
  INDEX idx_created (created_at)
);

-- Long-term memory
CREATE TABLE IF NOT EXISTS memories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(100) NOT NULL,
  content TEXT NOT NULL,
  importance INT DEFAULT 5,
  tags JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_importance (importance DESC)
);

-- Scheduled tasks (heartbeat)
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id VARCHAR(50) PRIMARY KEY,
  user_id VARCHAR(100) NOT NULL,
  task_name VARCHAR(200) NOT NULL,
  action TEXT NOT NULL,
  cron_expression VARCHAR(50) NOT NULL,
  channel VARCHAR(20) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  last_run TIMESTAMP NULL,
  next_run TIMESTAMP NULL,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_active (is_active)
);

-- Task execution log
CREATE TABLE IF NOT EXISTS task_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id VARCHAR(50),
  user_id VARCHAR(100) NOT NULL,
  action VARCHAR(200) NOT NULL,
  status ENUM('pending', 'running', 'success', 'failed') NOT NULL,
  result TEXT,
  error TEXT,
  duration_ms INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_task (task_id),
  INDEX idx_status (status)
);

-- Agent operations audit
CREATE TABLE IF NOT EXISTS audit_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(100),
  operation VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id VARCHAR(200),
  details JSON,
  status ENUM('success', 'failed') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_operation (operation)
);
