import { Elysia } from "elysia";
import { success } from "@/lib/errors";

/** 白名单：这些路径的响应不包壳（文档页、健康检查、SSE 流等） */
const WHITELIST = [
	"/openapi",
	"/favicon.ico",
	"/health",
	"/uploads",
	// SSE 是流式 generator 响应，包壳会破坏 text/event-stream 帧
	"/api/v1/sse",
];

/**
 * 响应壳 plugin：onAfterHandle 拦截成功响应，统一包成 { code, msg, data }
 *
 * 装配：app.use(responseWrap)，注册在路由之前确保所有路由都经过。
 */
export const responseWrap = new Elysia({ name: "response-wrap" }).onAfterHandle(
	{ as: "global" },
	({ path, responseValue }) => {
		// 文档页、favicon、健康检查等路径不能包壳，否则页面或文档渲染会炸
		if (WHITELIST.some((p) => path.startsWith(p))) {
			return responseValue;
		}

		// favicon 的 204 这类已经构造好的 Response 直接放行
		if (responseValue instanceof Response) {
			return responseValue;
		}

		// 仅放行 string（纯文本）和 undefined（Elysia 内部用），其余都包壳
		// boolean/number/object/null 一律包成 { code, msg, data }
		if (typeof responseValue === "string" || responseValue === undefined) {
			return responseValue;
		}

		return success(responseValue);
	},
);
