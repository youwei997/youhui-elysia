import { auditColumns } from "@db/schema/_shared";
import {
	bigint,
	integer,
	pgTable,
	smallint,
	uniqueIndex,
	varchar,
} from "drizzle-orm/pg-core";

/**
 * 系统角色表
 * 对齐 youlai-boot sys_role 设计，data_scope 用 smallint(1-5) 与前端 RoleItem.dataScope: number 一致
 *
 * 多租户：name/code 唯一约束改为租户内复合（tenant_id, name/code），
 * 允许不同租户使用相同角色名称/编码。
 */
export const sysRole = pgTable(
	"sys_role",
	{
		/** 主键 ID */
		id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
		/** 租户 ID */
		tenantId: bigint("tenant_id", { mode: "number" }).default(0).notNull(),
		/** 角色名称（租户内唯一） */
		name: varchar("name", { length: 64 }).notNull(),
		/** 角色编码（租户内唯一），如 ADMIN / DEPT_MANAGER / STAFF */
		code: varchar("code", { length: 32 }).notNull(),
		/** 排序 */
		sort: integer("sort").default(0),
		/** 状态（1-正常 0-停用） */
		status: smallint("status").default(1).notNull(),
		/** 数据权限（1=所有数据 2=部门及子部门 3=本部门 4=本人 5=自定义） */
		dataScope: smallint("data_scope").default(1),
		/** 备注（对齐 youlai-boot RoleForm.remark，最多 255 字符） */
		remark: varchar("remark", { length: 255 }),
		/** 审计字段 */
		...auditColumns,
	},
	(table) => ({
		/** 租户内角色名称唯一 */
		uniqRoleTenantName: uniqueIndex("uniq_role_tenant_name").on(
			table.tenantId,
			table.name,
		),
		/** 租户内角色编码唯一 */
		uniqRoleTenantCode: uniqueIndex("uniq_role_tenant_code").on(
			table.tenantId,
			table.code,
		),
	}),
);
