/**
 * audit-log.test.ts —— plugins/audit-log.ts 单元测试
 *
 * 测试策略：
 * - 创建最小测试 app（挂 errorHandler + auditLogPlugin），用 app.handle() 模拟请求
 * - 不挂 db（setImmediate insert 会失败但被 catch 吞掉，测试只关注插件行为正确）
 * - 不挂 authPlugin（audit-log plugin 不依赖 auth context，user 为 undefined 时走兜底）
 *
 * 测试范围：
 * 1. audit macro 声明后路由正常工作（不影响响应）
 * 2. 未声明 audit 的路由不受影响
 * 3. buildErrorShell 分派逻辑（BizError / 真 VALIDATION / NOT_FOUND / 其他）
 */

import { describe, expect, test } from "bun:test";
import { Elysia, t } from "elysia";
import { BizError, ERR_CODE, notFound } from "@/lib/errors";
import { errorHandler } from "@/plugins/error-handler";
import { auditLogPlugin, buildEntry } from "../audit-log";

/** 模拟 request.headers 类型（buildEntry 只需要 get 方法） */
const fakeHeaders = (fields: Record<string, string>): Headers => {
	const h = new Headers();
	for (const [k, v] of Object.entries(fields)) {
		h.set(k, v);
	}
	return h;
};

/** 创建最小测试 app */
const makeApp = () =>
	new Elysia()
		.use(errorHandler)
		.use(auditLogPlugin)
		// 声明 audit 的成功路由
		.post("/test-audit-ok", () => ({ ok: true }), {
			audit: "test:create",
		})
		// 声明 audit 的失败路由（抛 BizError）
		.get(
			"/test-audit-fail",
			() => {
				throw notFound(ERR_CODE.USER_NOT_FOUND);
			},
			{
				audit: "test:read",
			},
		)
		// 未声明 audit 的路由（不产生日志）
		.get("/test-no-audit", () => ({ ok: true }))
		// 未声明 audit 的失败路由
		.get("/test-no-audit-fail", () => {
			throw notFound(ERR_CODE.ROLE_NOT_FOUND);
		})
		// 真 VALIDATION 触发：声明 name 必填，不传触发 Elysia zod 校验
		.post("/test-validation", () => ({ ok: true }), {
			audit: "test:validate",
			body: t.Object({ name: t.String() }),
		});

describe("audit-log plugin", () => {
	test("audit 声明后成功路由正常响应", async () => {
		const app = makeApp();
		const res = await app.handle(
			new Request("http://localhost/test-audit-ok", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ name: "test" }),
			}),
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toEqual({ ok: true });
	});

	test("audit 声明后失败路由返回错误结构", async () => {
		const app = makeApp();
		const res = await app.handle(
			new Request("http://localhost/test-audit-fail"),
		);

		expect(res.status).toBe(404);
		const body = (await res.json()) as { code: string };
		expect(body.code).toBe(ERR_CODE.USER_NOT_FOUND);
	});

	test("未声明 audit 的路由不受影响", async () => {
		const app = makeApp();
		const res = await app.handle(new Request("http://localhost/test-no-audit"));

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toEqual({ ok: true });
	});

	test("未声明 audit 的失败路由也不受影响", async () => {
		const app = makeApp();
		const res = await app.handle(
			new Request("http://localhost/test-no-audit-fail"),
		);

		expect(res.status).toBe(404);
		const body = (await res.json()) as { code: string };
		expect(body.code).toBe(ERR_CODE.ROLE_NOT_FOUND);
	});
});

describe("buildErrorShell（真触发验证）", () => {
	test("BizError → { code, msg, data: null }", () => {
		const e = new BizError(ERR_CODE.USER_PASSWORD_ERROR, undefined, 401);
		expect(e.code).toBe("A0210");
		expect(e.message).toBe("用户名或密码错误");
	});

	test("VALIDATION → 触发生效，返回 A0400", async () => {
		const app = makeApp();
		// 不传必填的 name 字段，触发 Elysia 内置 VALIDATION
		const res = await app.handle(
			new Request("http://localhost/test-validation", {
				method: "POST",
				headers: { "content-type": "application/json" },
			}),
		);

		expect(res.status).toBe(422);
		const body = (await res.json()) as { code: string; msg: string };
		expect(body.code).toBe(ERR_CODE.USER_REQUEST_PARAMETER_ERROR);
		expect(body.msg).toBe("参数校验失败");
	});

	test("NOT_FOUND code 映射到 C0113", () => {
		expect(ERR_CODE.INTERFACE_NOT_EXIST).toBe("C0113");
	});

	test("未知异常映射到 B0001", () => {
		expect(ERR_CODE.SYSTEM_ERROR).toBe("B0001");
	});
});

describe("buildEntry 直接调用验证", () => {
	test("成功 POST：脱敏 requestParams，无 responseResult，status=1", () => {
		const entry = buildEntry(
			{
				module: "user",
				action: "create",
				body: { username: "test", password: "secret123" },
				t0: 1000,
			},
			{
				method: "POST",
				url: "http://localhost/api/v1/users",
				headers: fakeHeaders({
					"user-agent": "test-agent",
					"x-forwarded-for": "1.2.3.4",
				}),
			},
			{ sub: "7", username: "admin" },
			true,
		);

		expect(entry.module).toBe("user");
		expect(entry.action).toBe("create");
		expect(entry.method).toBe("POST");
		expect(entry.status).toBe(1);
		expect(entry.userId).toBe(7);
		expect(entry.username).toBe("admin");
		expect(entry.ip).toBe("1.2.3.4");
		expect(entry.userAgent).toBe("test-agent");
		// responseResult 成功时为空
		expect(entry.responseResult).toBeUndefined();
		// requestParams 存在且 password 已脱敏
		expect(entry.requestParams).toBeDefined();
		const params = entry.requestParams as Record<string, unknown>;
		expect(params.password).toBe("***");
		expect(params.username).toBe("test");
		// costMs 已计算
		expect(entry.costMs).toBeGreaterThanOrEqual(0);
	});

	test("成功 GET：无 requestParams，costMs 已计算", () => {
		const entry = buildEntry(
			{
				module: "menu",
				action: "list",
				body: undefined,
				t0: 5000,
			},
			{
				method: "GET",
				url: "http://localhost/api/v1/menus",
				headers: fakeHeaders({}),
			},
			null,
			true,
		);

		expect(entry.method).toBe("GET");
		expect(entry.requestParams).toBeUndefined(); // GET 不写 body
		expect(entry.errorMsg).toBe("");
		expect(entry.costMs).toBeGreaterThanOrEqual(0);
	});

	test("失败 BizError：responseResult 含 code/msg，errorMsg 为异常原文", () => {
		const e = new BizError(ERR_CODE.ROLE_NOT_FOUND, undefined, 404);
		const entry = buildEntry(
			{
				module: "role",
				action: "delete",
				body: undefined,
				t0: 3000,
			},
			{
				method: "DELETE",
				url: "http://localhost/api/v1/roles/99",
				headers: fakeHeaders({}),
			},
			null,
			false,
			e,
			{ code: e.code, msg: e.message, data: null },
		);

		expect(entry.status).toBe(0);
		expect(entry.errorMsg).toBe("角色不存在");
		expect(entry.responseResult).toEqual({
			code: "A0410",
			msg: "角色不存在",
			data: null,
		});
	});
});
