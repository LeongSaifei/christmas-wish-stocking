CREATE TABLE stockings (
  id TEXT PRIMARY KEY NOT NULL,
  owner_hash TEXT NOT NULL,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 24),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
ALTER TABLE wishes ADD COLUMN stocking_id TEXT REFERENCES stockings(id);
--> statement-breakpoint
CREATE INDEX wishes_stocking_idx ON wishes(stocking_id);
--> statement-breakpoint
CREATE INDEX stockings_created_idx ON stockings(created_at);
