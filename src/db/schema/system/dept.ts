import { auditColumns } from "@db/schema/_shared";
import { sql } from "drizzle-orm";
import {
	bigint,
	pgTable,
	smallint,
	uniqueIndex,
	varchar,
} from "drizzle-orm/pg-core";

/**
 * 系统部门表
 * treePath 用逗号分隔祖先链（如 "0,1,5"），子树查询靠 LIKE 匹配
 * 对齐 youlai-boot sys_dept 设计
 *
 * 多租户：code 唯一约束为租户内复合（tenant_id, code）且仅对未删除行生效。
 * 通过 uniqueIndex().where(sql`${t.deleteTime} IS NULL`) 声明部分唯一索引，Drizzle beta.22 支持。
 */
export const sysDept = pgTable(
	"sys_dept",
	{
		/** 主键 ID */
		id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
		/** 租户 ID */
		tenantId: bigint("tenant_id", { mode: "number" }).default(0).notNull(),
		/** 部门名称 */
		name: varchar("name", { length: 100 }).notNull(),
		/** 部门编号（租户内唯一，软删行不计入） */
		code: varchar("code", { length: 100 }).notNull(),
		/** 父部门 ID（0=顶级） */
		parentId: bigint("parent_id", { mode: "number" }).default(0),
		/** 父节点 ID 路径（逗号分隔），如 "0,1,5" */
		treePath: varchar("tree_path", { length: 255 }).notNull(),
		/** 排序 */
		sort: smallint("sort").default(0),
		/** 状态（1-正常 0-停用） */
		status: smallint("status").default(1),
		/** 审计字段 */
		...auditColumns,
	},
	(table) => ({
		/** 租户内部门编号唯一（软删行不计入） */
		idxDeptTenantCode: uniqueIndex("uniq_dept_tenant_code")
			.on(table.tenantId, table.code)
			.where(sql`${table.deleteTime} IS NULL`),
	}),
);
