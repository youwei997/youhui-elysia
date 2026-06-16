import { Elysia } from "elysia";
import { unauthorized } from "@/lib/errors";
import type { JwtPayload } from "@/lib/jwt";
import { verifyToken } from "@/lib/jwt";

/** auth plugin 注入到 ctx 的字段类型 */
export type AuthContext = {
	/** 当前登录用户；未登录或 token 无效时为 null */
	user: JwtPayload | null;
};

/**
 * Auth Plugin
 *
 * - derive 解析 Authorization 头并校验 token，注入 ctx.user
 * - macro auth: true 让路由声明即生效权限校验
 *
 * 设计：token 缺失或校验失败时 user = null，不直接抛 401。
 * 公开路由和需登录路由都过 derive，差异由 auth macro 决定。
 *
 * 类型说明：macro 运行时拦截了 null 情况，但 TS 类型层面 ctx.user 仍是
 * JwtPayload | null，handler 里需自行用 if (!user) 收窄（与 auth.test.ts 一致）。
 */
export const authPlugin = new Elysia({ name: "auth" })
	.derive({ as: "global" }, async ({ headers }): Promise<AuthContext> => {
		const auth = headers.authorization;

		// 缺 token 或格式不对 → 视为未登录
		if (!auth?.startsWith("Bearer ")) {
			return { user: null };
		}

		// 任何 verifyToken 失败（过期/篡改/失效）都统一降级为未登录
		const token = auth.slice(7);
		try {
			const payload = await verifyToken(token);
			return { user: payload };
		} catch {
			return { user: null };
		}
	})
	.macro({
		auth: () => ({
			beforeHandle: ({ user }: AuthContext) => {
				// user 为 null = 未登录或 token 失效，路由声明 { auth: true } 时拒绝
				if (!user) {
					throw unauthorized();
				}
			},
		}),
	});
