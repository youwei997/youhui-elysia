import { auditColumns } from "@db/schema/_shared";
import { bigint, pgTable, smallint, varchar } from "drizzle-orm/pg-core";

/**
 * 系统部门表
 * treePath 用逗号分隔祖先链（如 "0,1,5"），子树查询靠 LIKE 匹配
 * 对齐 youlai-boot sys_dept 设计
 *
 * 多租户：code 唯一约束为租户内复合（tenant_id, code）且仅对未删除行生效。
 * 部分唯一索引无法通过 Drizzle schema 声明，由 seed.ts 在 db:push 后通过原生 SQL 创建。
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
	// 部分唯一索引（deleted_at IS NULL）由 seed.ts 原生 SQL 创建，Drizzle schema 不声明
);
