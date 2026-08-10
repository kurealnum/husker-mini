import { timestamp } from "drizzle-orm/pg-core";

/** Timestamp with timezone, using the given column name. */
export const timestamptz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });

export const createdAt = () => timestamptz("created_at").defaultNow().notNull();
export const updatedAt = () => timestamptz("updated_at").defaultNow().notNull();
export const accessedAt = () => timestamptz("accessed_at");

export const timestamps = {
  createdAt: createdAt(),
  updatedAt: updatedAt(),
};
