import { auditColumns } from "@db/schema/_shared";
import { bigint, integer, pgTable, smallint, varchar } from "drizzle-orm/pg-core";

/**
 * 系统角色表
 * 对齐 youlai-boot sys_role 设计，data_scope 用 smallint(1-5) 与前端 RoleItem.dataScope: number 一致
 */
export const sysRole = pgTable("sys_role", {
	/** 主键 ID */
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	/** 角色名称（唯一） */
	name: varchar("name", { length: 64 }).notNull().unique(),
	/** 角色编码（唯一），如 ADMIN / DEPT_MANAGER / STAFF */
	code: varchar("code", { length: 32 }).notNull().unique(),
	/** 排序 */
	sort: integer("sort").default(0),
	/** 状态（1-正常 0-停用） */
	status: smallint("status").default(1).notNull(),
	/** 数据权限（1=所有数据 2=部门及子部门 3=本部门 4=本人 5=自定义） */
	dataScope: smallint("data_scope").default(1),
	/** 审计字段 */
	...auditColumns,
});
