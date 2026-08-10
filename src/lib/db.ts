import { Pool } from "pg";

/** Shared PostgreSQL connection pool, sourced from DATABASE_URL. */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
