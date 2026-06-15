import { Elysia } from "elysia";
import { success } from "@/lib/errors";

/** 白名单：这些路径的响应不包壳（文档页、健康检查等） */
const WHITELIST = ["/openapi", "/favicon.ico", "/health"];

/**
 * 响应壳 plugin：onAfterHandle 拦截成功响应，统一包成 { code, msg, data }
 *
 * 装配：app.use(responseWrap)，注册在路由之前确保所有路由都经过。
 */
export const responseWrap = new Elysia({ name: "response-wrap" }).onAfterHandle(
	{ as: "global" },
	({ path, responseValue }) => {
		if (WHITELIST.some((p) => path.startsWith(p))) {
			return responseValue;
		}

		if (responseValue instanceof Response) {
			return responseValue;
		}

		if (typeof responseValue !== "object" || responseValue === null) {
			return responseValue;
		}

		return success(responseValue);
	},
);
