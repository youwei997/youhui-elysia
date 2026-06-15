import { openapi } from "@elysia/openapi";
import { Elysia } from "elysia";
import { userRoutes } from "@/modules/user/routes";
import { errorHandler } from "@/plugins/error-handler";
import { requestContext } from "@/plugins/request-context";
import { responseWrap } from "@/plugins/response-wrap";

export const app = new Elysia()
	// favicon 直接返回 204，避免浏览器自动请求触发 NOT_FOUND 污染日志
	.get("/favicon.ico", () => new Response(null, { status: 204 }))
	.use(requestContext)
	.use(responseWrap)
	.use(errorHandler)
	.use(
		openapi({
			scalar: { showDeveloperTools: "never" },
			documentation: {
				info: { title: "youhui-elysia API", version: "1.0.0" },
				tags: [{ name: "User", description: "用户管理" }],
			},
		}),
	)
	.use(userRoutes)
	.get("/", () => "Hello Elysia");
