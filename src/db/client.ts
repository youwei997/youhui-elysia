import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { config } from "@/config";

const queryClient = postgres(config.DATABASE_URL, { max: 10 });

export const db = drizzle(queryClient);

export type DB = typeof db;