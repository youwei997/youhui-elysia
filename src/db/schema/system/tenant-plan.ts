import { auditColumns } from "@db/schema/_shared";
import { bigint, pgTable, smallint, varchar } from "drizzle-orm/pg-core";

/**
 * 系统租户套餐表
 *
 * 管理表，完整 auditColumns（含软删）。
 * 套餐定义一组可授权给租户的业务菜单范围。
 */
export const sysTenantPlan = pgTable("sys_tenant_plan", {
	/** 主键 ID */
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	/** 套餐名称 */
	name: varchar("name", { length: 128 }).notNull(),
	/** 套餐编码（全局唯一，平台级定义） */
	code: varchar("code", { length: 64 }).notNull().unique(),
	/** 状态（1-正常 0-停用） */
	status: smallint("status").default(1).notNull(),
	/** 排序 */
	sort: smallint("sort").default(0),
	/** 备注 */
	remark: varchar("remark", { length: 255 }),

	...auditColumns,
});
