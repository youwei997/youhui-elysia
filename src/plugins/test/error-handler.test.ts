import { describe, expect, test } from "bun:test";
import { Elysia, t } from "elysia";
import { BizError, ERR_CODE, notFound } from "@/lib/errors";
import { errorHandler } from "../error-handler";

/** 创建带 errorHandler 的最小测试 app */
const makeApp = () =>
	new Elysia().use(errorHandler)
		// NOT_FOUND：路由不存在
		.get("/missing", () => "ok")
		// VALIDATION：zod 校验失败
		.post(
			"/validate",
			() => "ok",
			{ body: t.Object({ name: t.String() }) },
		)
		// BizError：业务错误
		.get("/biz", () => {
			throw new BizError(ERR_CODE.ROLE_NOT_FOUND, "角色不存在", 404);
		})
		// 未知错误：抛原生 Error
		.get("/unknown", () => {
			throw new Error("something went wrong");
		});

describe("error-handler", () => {
	test("NOT_FOUND → 404 + C0113", async () => {
		const app = makeApp();
		const res = await app.handle(
			new Request("http://localhost/not-exist"),
		);
		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body.code).toBe(ERR_CODE.INTERFACE_NOT_EXIST);
		expect(body.msg).toBe("接口不存在");
		expect(body.data).toBeNull();
	});

	test("VALIDATION → 422 + A0400", async () => {
		const app = makeApp();
		const res = await app.handle(
			new Request("http://localhost/validate", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{}",
			}),
		);
		expect(res.status).toBe(422);
		const body = await res.json();
		expect(body.code).toBe(ERR_CODE.USER_REQUEST_PARAMETER_ERROR);
		expect(body.msg).toBe("参数校验失败");
		expect(body.data).toBeNull();
	});

	test("BizError → 对应状态码 + 错误码 + 自定义消息", async () => {
		const app = makeApp();
		const res = await app.handle(
			new Request("http://localhost/biz"),
		);
		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body.code).toBe(ERR_CODE.ROLE_NOT_FOUND);
		expect(body.msg).toBe("角色不存在");
		expect(body.data).toBeNull();
	});

	test("未知 Error → 500 + B0001", async () => {
		const app = makeApp();
		const res = await app.handle(
			new Request("http://localhost/unknown"),
		);
		expect(res.status).toBe(500);
		const body = await res.json();
		expect(body.code).toBe(ERR_CODE.SYSTEM_ERROR);
		expect(body.msg).toBe("系统执行出错");
		expect(body.data).toBeNull();
	});

	test("notFound 便捷工厂 → 404 + 默认 USER_NOT_FOUND", async () => {
		const app = new Elysia()
			.use(errorHandler)
			.get("/nf", () => {
				throw notFound();
			});
		const res = await app.handle(
			new Request("http://localhost/nf"),
		);
		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body.code).toBe(ERR_CODE.USER_NOT_FOUND);
	});
});
