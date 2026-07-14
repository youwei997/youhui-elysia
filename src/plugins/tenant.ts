import { Elysia } from "elysia";
import type { AuthContext } from "@/plugins/auth";

/**
 * 租户上下文 plugin
 *
 * - derive 从 JWT payload（由 app.ts 中 authPlugin 注入的 ctx.user）提取 tenantId / isPlatform
 * - 依赖前提：app.ts 注册顺序为 authPlugin → tenantPlugin → permissionPlugin
 * - 不要在本文件内再 .use(authPlugin)——app.ts 已全局注册，重复 derive 冗余
 *
 * 使用示例：
 * ```ts
 * const { tenantId, isPlatform } = ctx;
 * // tenantId: 当前数据视图租户 ID
 * // isPlatform: 是否平台租户（0），平台可跨租户查数据
 * ```
 */
export type TenantContext = AuthContext & {
	/** 当前数据视图租户 ID（login=home tenant, switch-tenant=target, refresh=透传旧值） */
	tenantId: number;
	/** 是否平台租户（tenantId === 0），平台超管可跨租户查数据 */
	isPlatform: boolean;
};

export const tenantPlugin = new Elysia({ name: "tenant" }).derive(
	{ as: "global" },
	(ctx): TenantContext => {
		// authPlugin 的全局 derive 已注入 ctx.user，但 TS 在 plugin 定义时无法推断
		// 需经 unknown 中转才能断言为 AuthContext（TS 要求）
		const { user } = ctx as unknown as AuthContext;

		if (!user) {
			return { user: null, tenantId: 0, isPlatform: false };
		}

		const tenantId = user.tenantId;
		return {
			user,
			tenantId,
			isPlatform: tenantId === 0,
		};
	},
);
