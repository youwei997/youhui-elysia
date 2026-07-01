import { Elysia } from "elysia";
import { ERR_CODE, forbidden } from "@/lib/errors";
import { redis } from "@/lib/redis";
import { redisKeys } from "@/lib/redis-keys";

/** 从请求头提取客户端 IP */
const getIp = (headers: Headers): string =>
	headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
	headers.get("x-real-ip") ??
	"";

/**
 * 限流 + IP 黑名单 plugin
 *
 * 两个功能：
 * 1. IP 黑名单检查（全局）—— 每次请求都跑，命中直接 403
 * 2. rateLimit macro（路由级）—— 声明式限流
 *    用法: rateLimit: "60:5"（60 秒窗口内最多 5 次）
 *    触发: 返回 429 + Retry-After header
 */
export const rateLimitPlugin = new Elysia({ name: "rate-limit" })
	// 全局黑名单检查（独立于 macro，始终生效）
	.onBeforeHandle({ as: "global" }, async ({ request }) => {
		const ip = getIp(request.headers);
		if (!ip) return;

		const blocked = await redis.get(redisKeys.ipBlacklist(ip));
		if (blocked !== null) {
			throw forbidden(ERR_CODE.ACCESS_UNAUTHORIZED);
		}
	})
	.macro({
		// ponytail: Elysia 的 macro 类型推导要求返回完整的路由配置类型（含 body/headers/query 等），
		// 但我们的 macro 只返回 beforeHandle 钩子。用 any 绕开类型检查，运行时行为不受影响。
		// 若未来 Elysia 版本修复了此类型约束，可移除 any 改用 `opts: string` 推导。
		rateLimit: (opts: any): any => {
			const [windowStr, maxStr] = opts.split(":");
			const window = Number(windowStr);
			const max = Number(maxStr);

			return {
				async beforeHandle(context: any) {
					const ip = getIp(context.request.headers);
					if (!ip) return;

					const key = redisKeys.rateLimit(ip, context.path);
					const current = await redis.incr(key);

					if (current === 1) {
						await redis.expire(key, window);
					}

					if (current > max) {
						context.set.status = 429;
						context.set.headers = { "Retry-After": String(window) };
						return {
							code: ERR_CODE.USER_ERROR,
							msg: "请求过于频繁，请稍后重试",
							data: null,
						};
					}
					return;
				},
			};
		},
	});
