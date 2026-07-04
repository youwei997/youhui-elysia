import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { requestContext } from "../request-context";

describe("requestContext", () => {
	test("derive 注入 reqId + startTime + logger", async () => {
		const app = new Elysia()
			.use(requestContext)
			.get("/test", ({ reqId, startTime, logger }) => {
				return { reqId, startTime, hasLogger: !!logger };
			});

		const res = await app.handle(
			new Request("http://localhost/test"),
		);
		const body = await res.json();

		expect(body.reqId).toBeTruthy();
		expect(body.reqId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
		);
		expect(typeof body.startTime).toBe("number");
		expect(body.startTime).toBeGreaterThan(0);
		expect(body.hasLogger).toBe(true);
	});

	test("不同请求的 reqId 互不相同", async () => {
		const app = new Elysia()
			.use(requestContext)
			.get("/test", ({ reqId }) => ({ reqId }));

		const res1 = await app.handle(
			new Request("http://localhost/test"),
		);
		const res2 = await app.handle(
			new Request("http://localhost/test"),
		);

		const body1 = await res1.json();
		const body2 = await res2.json();

		expect(body1.reqId).toBeTruthy();
		expect(body2.reqId).toBeTruthy();
		expect(body1.reqId).not.toBe(body2.reqId);
	});

	test("skip prefixes：/openapi 不记录完成日志", async () => {
		const app = new Elysia()
			.use(requestContext)
			.get("/openapi.json", () => "openapi");

		const res = await app.handle(
			new Request("http://localhost/openapi.json"),
		);
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toBe("openapi");
	});

	test("skip prefixes：/favicon.ico 不记录完成日志", async () => {
		const app = new Elysia()
			.use(requestContext)
			.get("/favicon.ico", () => "ico");

		const res = await app.handle(
			new Request("http://localhost/favicon.ico"),
		);
		expect(res.status).toBe(200);
	});

	test("skip prefixes：/health 不记录完成日志", async () => {
		const app = new Elysia()
			.use(requestContext)
			.get("/health", () => "ok");

		const res = await app.handle(
			new Request("http://localhost/health"),
		);
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toBe("ok");
	});

	test("普通请求正常通过，不跳过", async () => {
		const app = new Elysia()
			.use(requestContext)
			.get("/api/users", () => "users");

		const res = await app.handle(
			new Request("http://localhost/api/users"),
		);
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toBe("users");
	});
});
