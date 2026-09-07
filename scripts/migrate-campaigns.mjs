import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const query = neon(process.env.DATABASE_URL);
const statements = readFileSync(new URL("../migrations/20260907_campaigns.sql", import.meta.url), "utf8")
  .split(/;\s*\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith("--"));
for (const statement of statements) await query.query(statement);
console.log("Campaign tables created; nothing sends until a campaign is sent by hand.");
