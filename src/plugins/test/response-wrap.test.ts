import { beforeEach, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { responseWrap } from "@/plugins/response-wrap";

/**
 * response-wrap plugin 单测
 *
 * 覆盖：对象 / 数组 / 布尔值 / null / 字符串 / 数字 / 登出场景
 */
const buildApp = () =>
	new Elysia()
		.use(responseWrap)
		.get("/obj", () => ({ hello: "world" }))
		.get("/arr", () => [1, 2, 3])
		.get("/bool", () => true)
		.get("/num", () => 42)
		.get("/str", () => "plain text")
		.get("/null", () => null)
		.post("/logout", () => true, {
			detail: { tags: ["Auth"], summary: "登出" },
		});

describe("response-wrap · 包壳行为", () => {
	let app: ReturnType<typeof buildApp>;

	beforeEach(() => {
		app = buildApp();
	});

	test("对象返回 → 包成 {code,msg,data}", async () => {
		const res = await app.handle(new Request("http://localhost/obj"));
		const body = (await res.json()) as {
			code: string;
			msg: string;
			data: unknown;
		};
		expect(res.headers.get("content-type")).toMatch(/application\/json/);
		expect(body.code).toBe("00000");
		expect(body.data).toEqual({ hello: "world" });
	});

	test("布尔值返回 → 包成 {code,msg,data: true}（修复前是 text/plain: true）", async () => {
		const res = await app.handle(new Request("http://localhost/bool"));
		const body = (await res.json()) as {
			code: string;
			msg: string;
			data: unknown;
		};
		expect(res.headers.get("content-type")).toMatch(/application\/json/);
		expect(body.code).toBe("00000");
		expect(body.data).toBe(true);
	});

	test("数组返回 → 包成 {code,msg,data: [...]}", async () => {
		const res = await app.handle(new Request("http://localhost/arr"));
		const body = (await res.json()) as {
			code: string;
			msg: string;
			data: unknown;
		};
		expect(body.data).toEqual([1, 2, 3]);
	});

	test("数字返回 → 包成 {code,msg,data: 42}", async () => {
		const res = await app.handle(new Request("http://localhost/num"));
		const body = (await res.json()) as {
			code: string;
			msg: string;
			data: unknown;
		};
		expect(body.data).toBe(42);
	});

	test("字符串返回 → 原样放行（不包壳，避免破坏纯文本接口）", async () => {
		const res = await app.handle(new Request("http://localhost/str"));
		const text = await res.text();
		expect(text).toBe("plain text");
	});

	test("null 返回 → 包成 {code,msg,data: null}（同布尔值的修复路径）", async () => {
		const res = await app.handle(new Request("http://localhost/null"));
		const body = (await res.json()) as {
			code: string;
			msg: string;
			data: unknown;
		};
		expect(body.code).toBe("00000");
		expect(body.data).toBeNull();
	});

	test("登出场景模拟：POST /logout 返 true → JSON {code,msg,data:true}", async () => {
		const res = await app.handle(
			new Request("http://localhost/logout", { method: "POST" }),
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toMatch(/application\/json/);
		const body = (await res.json()) as {
			code: string;
			msg: string;
			data: unknown;
		};
		expect(body).toEqual({
			code: "00000",
			msg: "成功",
			data: true,
		});
	});
});
