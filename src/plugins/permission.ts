import { Elysia } from "elysia";
import { forbidden } from "@/lib/errors";
import { type AuthContext, authPlugin } from "@/plugins/auth";

/**
 * 权限校验 plugin
 *
 * 两个 macro：
 * - perm: string[]        → 用户 perms 包含数组中任一即放行
 * - requireRole: string[] → 用户 roles 包含数组中任一即放行
 *
 * 通配符：*:*:* 代表"所有权限"，admin 角色用此短路通过
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
				// 未登录已经在 auth macro 拦截，这里 user 理论上不会 null
				// 但类型层 user 仍为 JwtPayload | null，防御性返回
				if (!user) return;

				// 通配符短路：admin 特权直接放行
				if (user.perms.includes("*:*:*")) return;

				// 用户 perms 与 requiredPerms 有交集即放行
				const hasPerm = perms.some((p) => user.perms.includes(p));
				if (!hasPerm) {
					throw forbidden();
				}
			},
		}),
		requireRole: (roles: string[]) => ({
			beforeHandle: ({ user }: AuthContext) => {
				if (!user) return;

				const hasRole = roles.some((r) => user.roles.includes(r));
				if (!hasRole) {
					throw forbidden();
				}
			},
		}),
	});
