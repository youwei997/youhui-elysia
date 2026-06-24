import { and, eq, isNotNull, isNull, ne } from "drizzle-orm";
import type { DB } from "@/db/client";
import { sysMenu } from "@/db/schema/system/menu";
import { sysRoleMenu, sysUserRole } from "@/db/schema/system/relation";
import { sysRole } from "@/db/schema/system/role";
import { sysUser } from "@/db/schema/system/user";
import { redis } from "@/lib/redis";
import { redisKeys } from "@/lib/redis-keys";

/** 登录失败次数上限，达到后锁定账户 */
const MAX_FAIL_COUNT = 5;

/** 登录失败计数 TTL（秒）：15 分钟窗口 */
const FAIL_TTL = 15 * 60;

/**
 * 根据用户名查找有效用户（软删过滤 + 状态正常）
 * @param username 用户名
 * @param db Drizzle 实例（事务场景下传入 tx）
 */
export const findActiveUserByUsername = async (
	username: string,
	db: DB,
): Promise<typeof sysUser.$inferSelect | undefined> => {
	const rows = await db
		.select()
		.from(sysUser)
		.where(
			and(
				eq(sysUser.username, username),
				isNull(sysUser.deletedAt),
				eq(sysUser.status, 1),
			),
		)
		.limit(1);

	return rows[0];
};

/** 获取登录失败次数 */
export const getLoginFailCount = async (username: string): Promise<number> => {
	const val = await redis.get(redisKeys.loginFailCount(username));
	return val ? Number(val) : 0;
};

/** 登录失败计数 +1，首次失败时设置过期 */
export const incrementLoginFailCount = async (
	username: string,
): Promise<number> => {
	const key = redisKeys.loginFailCount(username);
	const count = await redis.incr(key);
	// 首次失败时设置过期，后续失败只 incr 不重置 TTL
	if (count === 1) {
		await redis.expire(key, FAIL_TTL);
	}
	return count;
};

/** 清除登录失败计数（登录成功时调用） */
export const clearLoginFailCount = async (username: string): Promise<void> => {
	await redis.del(redisKeys.loginFailCount(username));
};

/** 检查是否因失败次数过多被锁定 */
export const isAccountLocked = async (username: string): Promise<boolean> => {
	return (await getLoginFailCount(username)) >= MAX_FAIL_COUNT;
};

/** 递增 token 版本号（踢全端），返回递增后的值 */
export const incrementTokenVersion = async (
	userId: number,
): Promise<number> => {
	const key = redisKeys.userTokenVersion(userId);
	return await redis.incr(key);
};

/**
 * 查询用户关联的有效角色列表
 * 过滤：角色软删 + 角色状态正常
 * 返回 { code, dataScope }，供 JWT payload 注入 roles / dataScopes 字段
 */
export const findUserRoles = async (
	userId: number,
	db: DB,
): Promise<Array<{ code: string; dataScope: number | null }>> => {
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
				isNull(sysRole.deletedAt),
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
				isNull(sysRole.deletedAt),
				eq(sysRole.status, 1),
				isNull(sysMenu.deletedAt),
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
