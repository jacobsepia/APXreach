import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const query = neon(process.env.DATABASE_URL);
await query.query(readFileSync(new URL("../migrations/20260906_email_rewrite_limits.sql", import.meta.url), "utf8"));
console.log("Email rewrite allowance columns added; existing workspaces preserved.");
