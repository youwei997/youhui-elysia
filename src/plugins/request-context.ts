import { Elysia } from "elysia";
import { logger } from "@/lib/logger";

/**
 * 请求上下文 plugin：为每个请求注入 reqId + 子 logger + 耗时统计
 *
 * - onRequest 生成 reqId（uuid v4）+ startTime，写入 store
 * - derive 把 reqId 和子 logger 挂到 ctx，让 handler/其他 plugin 直接用
 * - onAfterResponse 打"请求完成"日志（reqId + 耗时 + status）
 *
 * 装配：必须在 errorHandler 之前 use，确保 error-handler 能读到 store.reqId。
 * reqId 原理详见 docs/architecture.md 4.2.1。
 */
export const requestContext = new Elysia({ name: "request-context" })
	.state("reqId", "")
	.state("startTime", 0)
	// 子 logger：把 reqId 绑死在 logger 上，handler 后续打日志自动带 reqId，不用每次手动传
	.derive({ as: "global" }, ({ store }) => {
		const childLogger = logger.child({ reqId: store.reqId });
		return { reqId: store.reqId, logger: childLogger };
	})
	.onRequest(({ store }) => {
		store.reqId = crypto.randomUUID();
		store.startTime = performance.now();
	})
	.onAfterResponse({ as: "global" }, ({ store, request }) => {
		const duration = performance.now() - store.startTime;
		logger.child({ reqId: store.reqId }).info(
			{
				method: request.method,
				path: request.url,
				duration: Math.round(duration),
			},
			"请求完成",
		);
	});
