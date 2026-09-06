import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const query = neon(process.env.DATABASE_URL);
await query.query(readFileSync(new URL("../migrations/20260906_sequences.sql", import.meta.url), "utf8"));
console.log("Sequence tables created; nothing is enrolled until someone is.");
