// 1. 直接从顶层导入 drizzle
import { drizzle } from "drizzle-orm/postgres-js";
import { config } from "@/config";

// 2. 直接传入连接字符串和驱动配置（Drizzle 会在后台自动创建 postgres 实例）
export const db = drizzle({
	connection: config.DATABASE_URL,
});

export type DB = typeof db;
