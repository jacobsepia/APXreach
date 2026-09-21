import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const query = neon(process.env.DATABASE_URL);
const statements = readFileSync(
  new URL("../migrations/20260921_prospects.sql", import.meta.url),
  "utf8",
)
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);
await query.transaction(statements.map((statement) => query.query(statement)));
console.log("Prospect tables added. Existing CRM records preserved.");
