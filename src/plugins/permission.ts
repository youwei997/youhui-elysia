import { Elysia } from "elysia";
import { ROLE_ROOT, WILDCARD_PERM } from "@/lib/auth-constants";
import { forbidden, unauthorized } from "@/lib/errors";
import { type AuthContext, authPlugin } from "@/plugins/auth";

/**
 * 判断当前用户是否为超级管理员（短路放行）
 *
 * 两种短路条件（任一满足即放行）：
 * 1. roles 含 ROOT —— 与前端 v-hasPerm 指令语义对齐
 *    ROOT 角色按约定不绑定菜单（perms 为空），必须靠 roles 判断
 * 2. perms 含 *:*:* —— RuoYi 体系通配符惯例
 *    
 * ⚠️ *:*:* 当前状态：
 *    本项目的 seed 数据中没有任何角色被赋予此 perm。保留此检查仅作为
 *    防御性兜底，防止管理员手动在数据库设置了该值。实际只有 ROOT 短路在生效。
 *
 * @param user JWT 载荷，为 null 时返回 false（防御性，正常链路下不会为 null）
 */
const isSuperUser = (user: AuthContext["user"]): boolean => {
	if (!user) return false;
	return user.roles.includes(ROLE_ROOT) || user.perms.includes(WILDCARD_PERM);
};

/**
 * 权限校验 plugin
 *
 * 两个 macro：
 * - perm: string[]        → 用户 perms 包含数组中任一即放行
 * - requireRole: string[] → 用户 roles 包含数组中任一即放行
 *
 * 短路放行：roles 含 "ROOT" 或 perms 含 "*:*:*" 跳过校验
 * （详见 isSuperUser 函数说明）
 * 多值：数组用 OR 语义（任一满足即放行）
 * 同时声明：AND 语义（两者都要满足）
 *
 * 前置依赖：auth plugin 已注入 ctx.user（含 perms / roles）
 */
export const permissionPlugin = new Elysia({ name: "permission" })
	.use(authPlugin)
	.macro({
		perm: (perms: string[]) => ({
			beforeHandle: ({ user }: AuthContext) => {
				// 未登录不应通过权限校验
				if (!user) throw unauthorized();

				// 超管短路：ROOT 角色或通配权限直接放行
				if (isSuperUser(user)) return;

				// 用户 perms 与 requiredPerms 有交集即放行
				const hasPerm = perms.some((p) => user.perms.includes(p));
				if (!hasPerm) {
					throw forbidden();
				}
			},
		}),
		requireRole: (roles: string[]) => ({
			beforeHandle: ({ user }: AuthContext) => {
				// 未登录不应通过角色校验
				if (!user) throw unauthorized();

				const hasRole = roles.some((r) => user.roles.includes(r));
				if (!hasRole) {
					throw forbidden();
				}
			},
		}),
	});
