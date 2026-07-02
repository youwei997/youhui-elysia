import { openapi } from "@elysia/openapi";
import { staticPlugin } from "@elysia/static";
import { Elysia } from "elysia";
import { authRoutes } from "@/modules/auth/routes";
import { deptRoutes } from "@/modules/dept/routes";
import { dictRoutes } from "@/modules/dict/routes";
import { ipBlacklistRoutes } from "@/modules/ip-blacklist/routes";
import { loginLogRoutes } from "@/modules/login-log/routes";
import { menuRoutes } from "@/modules/menu/routes";
import { onlineRoutes } from "@/modules/online/routes";
import { operLogRoutes } from "@/modules/oper-log/routes";
import { roleRoutes } from "@/modules/role/routes";
import { storageRoutes } from "@/modules/storage/routes";
import { userRoutes } from "@/modules/user/routes";
import { auditLogPlugin } from "@/plugins/audit-log";
import { authPlugin } from "@/plugins/auth";
import { errorHandler } from "@/plugins/error-handler";
import { permissionPlugin } from "@/plugins/permission";
import { rateLimitPlugin } from "@/plugins/rate-limit";
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
	.use(auditLogPlugin)
	.use(rateLimitPlugin)
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
					{ name: "LoginLog", description: "登录日志" },
					{ name: "Online", description: "在线用户" },
					{ name: "Dict", description: "字典管理" },
					{ name: "File", description: "文件存储" },
					{ name: "IpBlacklist", description: "IP 黑名单" },
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
	.use(
		staticPlugin({
			assets: "./uploads",
			prefix: "/uploads",
		}),
	)
	.use(authRoutes)
	.use(userRoutes)
	.use(roleRoutes)
	.use(menuRoutes)
	.use(deptRoutes)
	.use(operLogRoutes)
	.use(loginLogRoutes)
	.use(onlineRoutes)
	.use(dictRoutes)
	.use(ipBlacklistRoutes)
	.use(storageRoutes)
	.get("/", () => "Hello Elysia");
