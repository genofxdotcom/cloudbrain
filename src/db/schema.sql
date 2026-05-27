-- CloudBrain 2.0 Database Schema

CREATE TABLE IF NOT EXISTS credentials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  `key` VARCHAR(100) UNIQUE NOT NULL,
  `value` TEXT NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'general',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS system_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  `key` VARCHAR(100) UNIQUE NOT NULL,
  `value` TEXT NOT NULL,
  description VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(100) NOT NULL,
  operation VARCHAR(100) NOT NULL,
  policy ENUM('ask', 'always_approve', 'always_deny') NOT NULL DEFAULT 'ask',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY idx_user_op (user_id, operation)
);
