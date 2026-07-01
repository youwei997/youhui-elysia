import { Elysia } from "elysia";
import { ERR_CODE } from "@/lib/errors";
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
 * 1. IP 黑名单检查（全局）—— 每次请求都跑
 * 2. rateLimit macro（路由级）—— 声明式限流
 */
export const rateLimitPlugin = new Elysia({ name: "rate-limit" })
	.onBeforeHandle({ as: "global" }, async ({ request }) => {
		const ip = getIp(request.headers);
		if (!ip) return;

		const blocked = await redis.get(redisKeys.ipBlacklist(ip));
		if (blocked !== null) {
			return {
				code: ERR_CODE.ACCESS_UNAUTHORIZED,
				msg: "IP 已被封禁",
				data: null,
			};
		}
		return;
	})
	.macro({
		rateLimit: (opts: any): any => {
			const [windowStr, maxStr] = opts.split(":");
			const window = Number(windowStr);
			const max = Number(maxStr);

			return {
				async beforeHandle(ctx: any) {
					const ip = getIp(ctx.request.headers);
					if (!ip) return;

					const key = redisKeys.rateLimit(ip, ctx.path);
					const current = await redis.incr(key);

					if (current === 1) {
						await redis.expire(key, window);
					}

					if (current > max) {
						ctx.set.status = 429;
						ctx.set.headers = { "Retry-After": String(window) };
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
