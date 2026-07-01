import { openapi } from "@elysia/openapi";
import { Elysia } from "elysia";
import { authRoutes } from "@/modules/auth/routes";
import { deptRoutes } from "@/modules/dept/routes";
import { menuRoutes } from "@/modules/menu/routes";
import { operLogRoutes } from "@/modules/oper-log/routes";
import { roleRoutes } from "@/modules/role/routes";
import { userRoutes } from "@/modules/user/routes";
import { authPlugin } from "@/plugins/auth";
import { errorHandler } from "@/plugins/error-handler";
import { permissionPlugin } from "@/plugins/permission";
import { requestContext } from "@/plugins/request-context";
import { responseWrap } from "@/plugins/response-wrap";

export const app = new Elysia()
	// favicon 直接返回 204，避免浏览器自动请求触发 NOT_FOUND 污染日志
	.get("/favicon.ico", () => new Response(null, { status: 204 }))
	.use(requestContext)
	.use(responseWrap)
	.use(errorHandler)
	.use(authPlugin)
	.use(permissionPlugin)
	.use(
		openapi({
			scalar: { showDeveloperTools: "never" },
			documentation: {
				info: { title: "youhui-elysia API", version: "1.0.0" },
				tags: [
					{ name: "User", description: "用户管理" },
					{ name: "Role", description: "角色管理" },
					{ name: "Menu", description: "菜单管理" },
					{ name: "Dept", description: "部门管理" },
					{ name: "Auth", description: "认证管理" },
					{ name: "OperLog", description: "操作日志" },
				],
				components: {
					securitySchemes: {
						bearerAuth: {
							type: "http",
							scheme: "bearer",
							bearerFormat: "JWT",
							description:
								"Bearer JWT，登录后从 /auth/login 返回里取 accessToken",
						},
					},
				},
				// 全局默认要求 Bearer 认证
				// 公开接口（如 /auth/login）在 route detail 里写 security: [] 显式覆盖
				security: [{ bearerAuth: [] }],
			},
		}),
	)
	.use(authRoutes)
	.use(userRoutes)
	.use(roleRoutes)
	.use(menuRoutes)
	.use(deptRoutes)
	.use(operLogRoutes)
	.get("/", () => "Hello Elysia");
