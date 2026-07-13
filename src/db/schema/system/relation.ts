import { bigint, index, pgTable, primaryKey } from "drizzle-orm/pg-core";

/**
 * 用户-角色关联表
 *
 * PK 保持 (userId, roleId)，tenantId 为冗余索引列。
 */
export const sysUserRole = pgTable(
	"sys_user_role",
	{
		/** 租户 ID（冗余索引列，userId 全局唯一不会跨租户命中） */
		tenantId: bigint("tenant_id", { mode: "number" }).default(0).notNull(),
		/** 用户 ID */
		userId: bigint("user_id", { mode: "number" }).notNull(),
		/** 角色 ID */
		roleId: bigint("role_id", { mode: "number" }).notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.userId, t.roleId] }),
		index("idx_user_role_tenant_id").on(t.tenantId),
	],
);

/**
 * 角色-菜单关联表
 *
 * PK 保持 (roleId, menuId)，tenantId 为冗余索引列。
 * 对齐 Java 原版：idx_role_menu_tenant_id + idx_tenant_role。
 */
export const sysRoleMenu = pgTable(
	"sys_role_menu",
	{
		/** 租户 ID（冗余索引列） */
		tenantId: bigint("tenant_id", { mode: "number" }).default(0).notNull(),
		/** 角色 ID */
		roleId: bigint("role_id", { mode: "number" }).notNull(),
		/** 菜单 ID */
		menuId: bigint("menu_id", { mode: "number" }).notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.roleId, t.menuId] }),
		index("idx_role_menu_tenant_id").on(t.tenantId),
		index("idx_tenant_role").on(t.tenantId, t.roleId),
	],
);

/**
 * 角色-部门关联表（仅 dataScope=5 自定义权限时使用）
 *
 * PK 扩展为 (tenantId, roleId, deptId)，对齐 Java 原版唯一索引含 tenant_id。
 */
export const sysRoleDept = pgTable(
	"sys_role_dept",
	{
		/** 租户 ID */
		tenantId: bigint("tenant_id", { mode: "number" }).default(0).notNull(),
		/** 角色 ID */
		roleId: bigint("role_id", { mode: "number" }).notNull(),
		/** 部门 ID */
		deptId: bigint("dept_id", { mode: "number" }).notNull(),
	},
	(t) => [primaryKey({ columns: [t.tenantId, t.roleId, t.deptId] })],
);
