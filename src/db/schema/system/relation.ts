import { bigint, pgTable, primaryKey } from "drizzle-orm/pg-core";

/**
 * 用户-角色关联表
 */
export const sysUserRole = pgTable(
	"sys_user_role",
	{
		/** 用户 ID */
		userId: bigint("user_id", { mode: "number" }).notNull(),
		/** 角色 ID */
		roleId: bigint("role_id", { mode: "number" }).notNull(),
	},
	(t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);

/**
 * 角色-菜单关联表
 */
export const sysRoleMenu = pgTable(
	"sys_role_menu",
	{
		/** 角色 ID */
		roleId: bigint("role_id", { mode: "number" }).notNull(),
		/** 菜单 ID */
		menuId: bigint("menu_id", { mode: "number" }).notNull(),
	},
	(t) => [primaryKey({ columns: [t.roleId, t.menuId] })],
);

/**
 * 角色-部门关联表（仅 dataScope=5 自定义权限时使用）
 */
export const sysRoleDept = pgTable(
	"sys_role_dept",
	{
		/** 角色 ID */
		roleId: bigint("role_id", { mode: "number" }).notNull(),
		/** 部门 ID */
		deptId: bigint("dept_id", { mode: "number" }).notNull(),
	},
	(t) => [primaryKey({ columns: [t.roleId, t.deptId] })],
);
