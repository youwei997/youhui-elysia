import { type Context, Elysia } from "elysia";
import { ERR_CODE, forbidden } from "@/lib/errors";
import { redis } from "@/lib/redis";
import { redisKeys } from "@/lib/redis-keys";

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
 *    触发返回 429 + Retry-After header
 *
 * 参考 elysiajs.com/integrations/better-auth.html#macro
 */
export const rateLimitPlugin = new Elysia({ name: "rate-limit" })
	.onBeforeHandle({ as: "global" }, async ({ request }) => {
		const ip = getIp(request.headers);
		if (!ip) return;
		const blocked = await redis.get(redisKeys.ipBlacklist(ip));
		if (blocked !== null) {
			throw forbidden(ERR_CODE.ACCESS_UNAUTHORIZED);
		}
	})
	.macro({
		// macro 不写显式返回类型，让 Elysia 自己推导 beforeHandle 的类型签名。
		// 如果手写 `(opts: string): { beforeHandle: (ctx: Context) => ... }`，
		// Elysia 内部 Context 和外部导入的 Context 被视为"两个不同类型"，TS 报错。
		rateLimit: (opts: string) => {
			const [windowStr, maxStr] = opts.split(":");
			const window = Number(windowStr);
			const max = Number(maxStr);
			return {
				async beforeHandle(context: Context) {
					const ip = getIp(context.request.headers);
					if (!ip) return;
					const key = redisKeys.rateLimit(ip, context.path);
					const current = await redis.incr(key);
					if (current === 1) {
						await redis.expire(key, window);
					}
					if (current > max) {
						context.set.status = 429;
						context.set.headers = {
							"Retry-After": String(window),
						};
						// return Response 给 Elysia，Elysia 将其作为响应返回给客户端。
						// 不要 return 对象（如 { code, msg, data }），
						// 对象不会被 Elysia 识别为"阻断信号"，请求会继续走到路由 handler。
						return new Response("Too Many Requests", { status: 429 });
					}
					// 显式 return void，避免 TS 推断为 Promise<Response | undefined>
					// 导致 beforeHandle 类型签名与 Elysia 预期不匹配。
					return;
				},
			};
		},
	});
