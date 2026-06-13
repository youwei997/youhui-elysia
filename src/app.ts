import { openapi } from "@elysia/openapi";
import { Elysia } from "elysia";
import { userRoutes } from "@/modules/user/routes";

export const app = new Elysia()
	.use(openapi({ scalar: { showDeveloperTools: "never" } }))
	.use(userRoutes)
	.get("/", () => "Hello Elysia");
