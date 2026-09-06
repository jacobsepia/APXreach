import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const query = neon(process.env.DATABASE_URL);
await query.query(readFileSync(new URL("../migrations/20260906_email_attachments.sql", import.meta.url), "utf8"));
console.log("Email attachment record column added; existing messages preserved.");
