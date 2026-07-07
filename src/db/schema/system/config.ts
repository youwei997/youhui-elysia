import { auditColumns } from "@db/schema/_shared";
import { bigint, pgTable, varchar } from "drizzle-orm/pg-core";

/**
 * 系统配置表
 *
 * configKey 全局唯一，供 withCache 按 key 读取；写操作后主动失效缓存。
 */
export const sysConfig = pgTable("sys_config", {
	/** 主键 ID */
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),

	/** 配置名称（展示用） */
	configName: varchar("config_name", { length: 128 }).notNull(),
	/** 配置键（如 'site.title'），全局唯一 */
	configKey: varchar("config_key", { length: 128 }).notNull().unique(),
	/** 配置值 */
	configValue: varchar("config_value", { length: 2000 }).notNull(),
	/** 备注 */
	remark: varchar("remark", { length: 255 }).default("").notNull(),

	...auditColumns,
});
