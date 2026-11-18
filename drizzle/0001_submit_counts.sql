-- 按“网络来源”统计每日提交次数，用于防刷。source 是加盐 IP 的 SHA-256 摘要前 16 字节，不保存原始 IP。
CREATE TABLE submit_counts (
  day TEXT NOT NULL,
  source TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, source)
);
