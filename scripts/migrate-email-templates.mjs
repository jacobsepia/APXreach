import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const query = neon(process.env.DATABASE_URL);
await query.query(readFileSync(new URL("../migrations/20260905_email_templates.sql", import.meta.url), "utf8"));
console.log("Email template storage added; existing records preserved.");
