import { Elysia } from "elysia";
import { BizError, ERR_CODE, failed, type Result } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * 全局错误处理 plugin
 *
 * 职责：把所有异常统一序列化成 { code, msg, data: null } 响应壳。
 * 分四个分支处理：
 * 1. 参数校验失败（Elysia 的 ValidationError）→ A0400
 * 2. BizError 业务错误 → 用其 code + status
 * 3. Postgres 唯一约束冲突（23505）→ C0342
 * 4. 未知错误 → B0001，打日志含 stack，响应不泄露 stack
 *
 * 装配：app.use(errorHandler)，as: "global" 让它兜底所有路由。
 */
export const errorHandler = new Elysia({ name: "error-handler" }).onError(
	{ as: "global" },
	({ error, code, set, request, store }) => {
		const traceId = (store as { reqId?: string }).reqId;

		// 0. 接口不存在（路由未匹配，如拼错 URL 或浏览器请求 favicon）
		if (code === "NOT_FOUND") {
			set.status = 404;
			return failed(ERR_CODE.INTERFACE_NOT_EXIST);
		}

		// 1. 参数校验失败（zod schema 校验不通过）
		if (code === "VALIDATION") {
			set.status = 422;
			const result: Result<null> = failed(
				ERR_CODE.USER_REQUEST_PARAMETER_ERROR,
				"参数校验失败",
			);
			return result;
		}

		// 2. 业务错误（routes 层主动 throw BizError）
		if (error instanceof BizError) {
			set.status = error.status;
			return failed(error.code, error.message);
		}

		// 3. Postgres 错误（鸭子检测，避免依赖具体 class import）
		//    23505 = 唯一约束冲突，23503 = 外键冲突等
		const pgCode = (error as { code?: string }).code;
		if (typeof pgCode === "string" && pgCode.startsWith("23")) {
			set.status = 409;
			if (pgCode === "23505") {
				return failed(ERR_CODE.INTEGRITY_CONSTRAINT_VIOLATION, "数据已存在");
			}
			return failed(ERR_CODE.INTEGRITY_CONSTRAINT_VIOLATION);
		}

		// 4. 未知错误：打完整日志（含 stack），响应只给模糊提示，不泄露内部细节
		logger.error(
			{
				err: error,
				traceId,
				path: request.url,
				method: request.method,
			},
			"未处理异常",
		);
		set.status = 500;
		return failed(ERR_CODE.SYSTEM_ERROR);
	},
);
