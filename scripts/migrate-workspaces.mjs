import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const query = neon(process.env.DATABASE_URL);
await query.query(readFileSync(new URL("../migrations/20260905_workspace_members.sql", import.meta.url), "utf8"));
console.log("Workspace membership migration applied; existing memberships preserved.");
