import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/database/schemas";

/** Shared PostgreSQL connection pool, sourced from DATABASE_URL. */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/** Drizzle ORM client bound to the shared connection pool. */
export const db = drizzle(pool, { schema });
