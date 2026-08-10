import { pool } from "../src/lib/db";

/** Verifies the application can connect to PostgreSQL using DATABASE_URL. */
async function main() {
  const result = await pool.query("select 1 as ok");
  if (result.rows[0]?.ok !== 1) {
    throw new Error("unexpected result from database");
  }
  console.log("Database connection verified.");
  await pool.end();
}

main().catch((error) => {
  console.error("Database connection failed:", error);
  process.exit(1);
});
