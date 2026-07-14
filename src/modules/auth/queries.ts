import { and, eq, isNotNull, isNull, ne } from "drizzle-orm";
import type { DB } from "@/db/client";
import { sysMenu } from "@/db/schema/system/menu";
import { sysRoleMenu, sysUserRole } from "@/db/schema/system/relation";
import { sysRole } from "@/db/schema/system/role";
import { sysTenant } from "@/db/schema/system/tenant";
import { sysUser } from "@/db/schema/system/user";
import type { UserRecord } from "@/modules/user/types";
import type { UserRoleItem } from "./types";

/**
 * 根据用户名查找有效用户（软删过滤 + 状态正常）
 * @param username 用户名
 * @param db Drizzle 实例（事务场景下传入 tx）
 */
export const findActiveUserByUsername = async (
	username: string,
	db: DB,
): Promise<UserRecord | undefined> => {
	const rows = await db
		.select()
		.from(sysUser)
		.where(
			and(
				eq(sysUser.username, username),
				isNull(sysUser.deleteTime),
				eq(sysUser.status, 1),
			),
		)
		.limit(1);

	return rows[0];
};

/**
 * 查询用户关联的有效角色列表
 * 过滤：角色软删 + 角色状态正常
 * 返回 { code, dataScope }，供 JWT payload 注入 roles / dataScopes 字段
 */
export const findUserRoles = async (
	userId: number,
	db: DB,
): Promise<UserRoleItem[]> => {
	const rows = await db
		.select({
			code: sysRole.code,
			dataScope: sysRole.dataScope,
		})
		.from(sysUserRole)
		.innerJoin(sysRole, eq(sysRole.id, sysUserRole.roleId))
		.where(
			and(
				eq(sysUserRole.userId, userId),
				isNull(sysRole.deleteTime),
				eq(sysRole.status, 1),
			),
		);
	return rows;
};

/**
 * 查询用户拥有的权限点集合（perm 字符串）
 *
 * 链路：sys_user_role → sys_role → sys_role_menu → sys_menu
 * 过滤：角色软删/禁用 + 菜单软删 + 仅取有 perm 的菜单（B 按钮或带 perm 的菜单）
 * 去重：用 Set 内存去重（多角色绑同一菜单的情况）
 *
 * 注意：ROOT 角色按约定不绑定菜单（短路通过靠 roles.includes('ROOT') 判断），
 * 因此 ROOT 用户此函数可能返回 []，业务层不应依赖 perms 推断 ROOT 身份。
 */
export const findUserPerms = async (
	userId: number,
	db: DB,
): Promise<string[]> => {
	const rows = await db
		.select({ perm: sysMenu.perm })
		.from(sysUserRole)
		.innerJoin(sysRole, eq(sysRole.id, sysUserRole.roleId))
		.innerJoin(sysRoleMenu, eq(sysRoleMenu.roleId, sysRole.id))
		.innerJoin(sysMenu, eq(sysMenu.id, sysRoleMenu.menuId))
		.where(
			and(
				eq(sysUserRole.userId, userId),
				isNull(sysRole.deleteTime),
				eq(sysRole.status, 1),
				isNull(sysMenu.deleteTime),
				isNotNull(sysMenu.perm),
				ne(sysMenu.perm, ""),
			),
		);

	// 数组里的 perm 已经经过 isNotNull 过滤，运行时不会是 null
	// 但 Drizzle 推导出的类型仍是 string | null，这里 filter 收窄类型
	const perms = rows
		.map((r) => r.perm)
		.filter((p): p is string => p !== null && p !== "");

	return Array.from(new Set(perms));
};

/**
 * 查询目标租户是否存在且状态正常（status=1）
 * 供 switch-tenant 路由和 Step 5 tenant 模块复用
 */
export const findActiveTenantById = async (
	id: number,
	db: DB,
): Promise<boolean> => {
	const rows = await db
		.select()
		.from(sysTenant)
		.where(
			and(
				eq(sysTenant.id, id),
				eq(sysTenant.status, 1),
			),
		)
		.limit(1);

	return rows.length > 0;
};
