import { migrate } from "drizzle-orm/node-postgres/migrator";

import { db, pool } from "../src/lib/db";

/** Applies all pending Drizzle migrations to the configured database. */
async function main() {
  await migrate(db, { migrationsFolder: "./src/database/migrations" });
  console.log("Migrations applied.");
  await pool.end();
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
