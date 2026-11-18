CREATE TABLE wishes (
  id TEXT PRIMARY KEY NOT NULL,
  nickname TEXT NOT NULL DEFAULT '' CHECK (length(nickname) <= 30),
  gift TEXT NOT NULL CHECK (length(trim(gift)) BETWEEN 1 AND 500),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
);
--> statement-breakpoint
CREATE INDEX wishes_created_at_idx ON wishes(created_at);
