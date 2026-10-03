import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env["BEDLINK_DB_PATH"] ?? join(here, "..", "..", "data", "bedlink.db");

// git doesn't track empty directories, so a fresh clone has no server/data/
// until something creates it.
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function runMigrations() {
  const schema = readFileSync(join(here, "schema.sql"), "utf-8");
  db.exec(schema);
}

runMigrations();

