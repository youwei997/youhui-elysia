import openapi from "@elysia/openapi";
import { Elysia } from "elysia";

const app = new Elysia()
	.use(openapi({ scalar: { showDeveloperTools: "never" } }))
	.get("/", () => "Hello Elysia")
	.listen(3000);

console.log(
	`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);
