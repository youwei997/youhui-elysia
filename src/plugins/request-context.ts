import { Elysia } from "elysia";
import { logger } from "@/lib/logger";

/** 请求完成日志跳过的路径前缀（文档页、favicon 等噪音请求） */
const LOG_SKIP_PREFIXES = ["/openapi", "/favicon.ico", "/health"];

/**
 * 请求上下文 plugin：为每个请求注入 reqId + 子 logger + 耗时统计
 *
 * 设计要点（详见 docs/troubleshooting.md "reqId 不放 store"）：
 * - reqId / startTime 放 derive 的 per-request context，**不放全局 store**。
 *   store 是整个 app 共享的单例，多个并发请求写同一字段会竞态串号。
 * - derive 回调每个请求执行一次，返回值挂到该请求独立的 context 上，
 *   天然隔离，等价于 Koa 的 ctx.reqId。
 *
 * reqId 原理详见 docs/architecture.md 4.2.1。
 */
export const requestContext = new Elysia({ name: "request-context" })
	// 每请求生成独立的 reqId / startTime / 子 logger，挂到 context（非 store）
	.derive({ as: "global" }, () => {
		const reqId = crypto.randomUUID();
		return {
			reqId,
			startTime: performance.now(),
			logger: logger.child({ reqId }),
		};
	})
	.onAfterResponse({ as: "global" }, ({ reqId, startTime, request }) => {
		// 只取 pathname 做前缀匹配，不带 query，避免 ?id=xxx 这类查询串干扰白名单判断
		const { pathname } = new URL(request.url);
		// 文档页/favicon/健康检查这类请求量大且无业务意义，逐条打日志纯属噪音，跳过
		if (LOG_SKIP_PREFIXES.some((p) => pathname.startsWith(p))) {
			return;
		}
		// duration 取整到毫秒：微秒级精度对排障无意义，且让日志更易读
		const duration = performance.now() - startTime;
		logger.child({ reqId }).info(
			{
				method: request.method,
				path: pathname,
				duration: Math.round(duration),
			},
			"请求完成",
		);
	});
