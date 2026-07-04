import { auditColumns } from "@db/schema/_shared";
import {
	bigint,
	index,
	pgTable,
	smallint,
	unique,
	varchar,
} from "drizzle-orm/pg-core";

/**
 * 系统字典类型表
 *
 * 字典类型（如 'gender'）下有多个字典项（如 '男'/'女'/'未知'）。
 * type 字段全局唯一，供前端 /dicts/:type/items 高频查询使用。
 */
export const sysDict = pgTable(
	"sys_dict",
	{
		/** 主键 ID */
		id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),

		/** 字典类型标识（如 'gender'、'status'），全局唯一 */
		type: varchar("type", { length: 64 }).notNull().unique(),
		/** 字典类型名称（如 "性别"、"状态"） */
		name: varchar("name", { length: 64 }).notNull(),
		/** 状态：1-启用 0-禁用 */
		status: smallint("status").default(1).notNull(),
		/** 备注 */
		remark: varchar("remark", { length: 255 }).default("").notNull(),

		...auditColumns,
	},
	(table) => ({
		/** 按 type 唯一查询（供 /dicts/:type/items 接口） */
		typeIdx: index("idx_dict_type").on(table.type),
		/** 唯一约束：type 不允许重复 */
		typeUnique: unique("uniq_dict_type").on(table.type),
	}),
);
