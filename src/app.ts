import { openapi } from "@elysia/openapi";
import { Elysia } from "elysia";
import { userRoutes } from "@/modules/user/routes";
import { errorHandler } from "@/plugins/error-handler";

export const app = new Elysia()
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
