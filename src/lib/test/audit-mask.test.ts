/**
 * audit-mask.test.ts —— lib/audit-mask.ts 单元测试
 *
 * 覆盖：
 * - 各种敏感字段脱敏（password / token / secret / apiKey / clientSecret）
 * - 大小写不敏感 + 子串匹配
 * - 嵌套对象 / 数组
 * - 4KB 截断边界（4096 不截、4097 截）
 * - 循环引用不抛错
 * - 非对象输入原样返回
 */

import { describe, expect, test } from "bun:test";
import { maskSensitiveData, SENSITIVE_FIELDS } from "../audit-mask";

describe("SENSITIVE_FIELDS", () => {
	test("白名单包含关键子串模式", () => {
		expect(SENSITIVE_FIELDS).toContain("password");
		expect(SENSITIVE_FIELDS).toContain("token");
		expect(SENSITIVE_FIELDS).toContain("secret");
		expect(SENSITIVE_FIELDS).toContain("apikey");
	});

	test("白名单全部为小写且非空", () => {
		for (const field of SENSITIVE_FIELDS) {
			expect(field.length).toBeGreaterThan(0);
			expect(field === field.toLowerCase()).toBe(true);
		}
	});
});

describe("maskSensitiveData —— 敏感字段脱敏", () => {
	test("password / oldPassword / newPassword 被替换为 '***'", () => {
		const result = maskSensitiveData({
			password: "x",
			oldPassword: "x",
			newPassword: "x",
		}) as Record<string, unknown>;
		expect(result.password).toBe("***");
		expect(result.oldPassword).toBe("***");
		expect(result.newPassword).toBe("***");
	});

	test("token / accessToken / refreshToken / secret / apiKey / clientSecret 被替换为 '***'", () => {
		const result = maskSensitiveData({
			token: "x",
			accessToken: "x",
			refreshToken: "x",
			secret: "x",
			apiKey: "x",
			clientSecret: "x",
		}) as Record<string, unknown>;
		expect(result.token).toBe("***");
		expect(result.accessToken).toBe("***");
		expect(result.refreshToken).toBe("***");
		expect(result.secret).toBe("***");
		expect(result.apiKey).toBe("***");
		expect(result.clientSecret).toBe("***");
	});

	test("字段名匹配不区分大小写", () => {
		const result = maskSensitiveData({
			PASSWORD: "x",
			AccessToken: "x",
			APIKEY: "x",
			ClientSecret: "x",
		}) as Record<string, unknown>;
		expect(result.PASSWORD).toBe("***");
		expect(result.AccessToken).toBe("***");
		expect(result.APIKEY).toBe("***");
		expect(result.ClientSecret).toBe("***");
	});

	test("子串匹配：userPassword / x-access-token 等自定义字段也能命中", () => {
		const result = maskSensitiveData({
			userPassword: "x",
			"x-access-token": "x",
			apiKeyId: "x",
		}) as Record<string, unknown>;
		expect(result.userPassword).toBe("***");
		expect(result["x-access-token"]).toBe("***");
		expect(result.apiKeyId).toBe("***");
	});

	test("普通字段不被脱敏，值保持不变", () => {
		const input = { username: "alice", email: "a@b.c", age: 30, active: true };
		expect(maskSensitiveData(input)).toEqual(input);
	});

	test("字段名不含敏感子串时不被脱敏", () => {
		const result = maskSensitiveData({
			noteId: "id-not-secret",
			userBio: "bio-not-secret",
		}) as Record<string, unknown>;
		expect(result.noteId).toBe("id-not-secret");
		expect(result.userBio).toBe("bio-not-secret");
	});
});

describe("maskSensitiveData —— 嵌套结构", () => {
	test("嵌套对象中的敏感字段被脱敏", () => {
		const result = maskSensitiveData({
			user: {
				name: "alice",
				password: "p",
				profile: { apiKey: "ak", age: 30 },
			},
		}) as {
			user: {
				name: string;
				password: string;
				profile: { apiKey: string; age: number };
			};
		};
		expect(result.user.password).toBe("***");
		expect(result.user.profile.apiKey).toBe("***");
		expect(result.user.name).toBe("alice");
		expect(result.user.profile.age).toBe(30);
	});

	test("数组中的对象敏感字段被脱敏", () => {
		const result = maskSensitiveData({
			users: [
				{ name: "alice", token: "t1" },
				{ name: "bob", password: "p2" },
			],
		}) as {
			users: Array<{ name: string; token?: string; password?: string }>;
		};
		expect(result.users[0]?.token).toBe("***");
		expect(result.users[1]?.password).toBe("***");
		expect(result.users[0]?.name).toBe("alice");
		expect(result.users[1]?.name).toBe("bob");
	});

	test("数组本身作为输入时也能脱敏", () => {
		const result = maskSensitiveData([
			{ password: "p" },
			{ apiKey: "k" },
		]) as Array<Record<string, unknown>>;
		expect(result[0]?.password).toBe("***");
		expect(result[1]?.apiKey).toBe("***");
	});

	test("空对象 / 空数组正常处理", () => {
		expect(maskSensitiveData({})).toEqual({});
		expect(maskSensitiveData([])).toEqual([]);
	});
});

describe("maskSensitiveData —— 截断阈值", () => {
	test("刚好 4096 字节不截断，返回脱敏对象", () => {
		// {"data":"<4085 x>"} = 11 + 4085 = 4096 字节
		const padding = "x".repeat(4085);
		const input = { data: padding };
		const result = maskSensitiveData(input);
		const json = JSON.stringify(result);
		expect(new TextEncoder().encode(json).length).toBe(4096);
		expect(typeof result).toBe("object");
	});

	test("4097 字节被截断，返回 { _truncated: true, preview } 形式的 JSON-safe 对象", () => {
		// {"data":"<4086 x>"} = 11 + 4086 = 4097 字节
		const padding = "x".repeat(4086);
		const input = { data: padding };
		const result = maskSensitiveData(input) as {
			_truncated: boolean;
			preview: string;
		};
		expect(typeof result).toBe("object");
		expect(result._truncated).toBe(true);
		expect(typeof result.preview).toBe("string");
		expect(result.preview.endsWith("...truncated")).toBe(true);
	});

	test("自定义 maxBytes 阈值生效", () => {
		// {"data":"<50 x>"} = 11 + 50 = 61 字节
		const input = { data: "x".repeat(50) };
		const result = maskSensitiveData(input, { maxBytes: 60 }) as {
			_truncated: boolean;
			preview: string;
		};
		expect(typeof result).toBe("object");
		expect(result._truncated).toBe(true);
		expect(result.preview.endsWith("...truncated")).toBe(true);
	});
});

describe("maskSensitiveData —— 边界与异常", () => {
	test("对象自循环引用不抛错", () => {
		const a: Record<string, unknown> = { name: "alice", password: "p" };
		a.self = a;
		expect(() => maskSensitiveData(a)).not.toThrow();
		const result = maskSensitiveData(a) as Record<string, unknown>;
		// 循环点处保留原引用，不爆栈
		expect(result.self).toBeDefined();
	});

	test("对象间接循环引用不抛错", () => {
		const a: Record<string, unknown> = { name: "alice" };
		const b: Record<string, unknown> = { ref: a };
		a.b = b;
		expect(() => maskSensitiveData(a)).not.toThrow();
	});

	test("数组循环引用不抛错", () => {
		const arr: unknown[] = [1, 2];
		arr.push(arr);
		expect(() => maskSensitiveData(arr)).not.toThrow();
	});

	test("非对象输入原样返回", () => {
		expect(maskSensitiveData("hello")).toBe("hello");
		expect(maskSensitiveData(42)).toBe(42);
		expect(maskSensitiveData(true)).toBe(true);
		expect(maskSensitiveData(null)).toBeNull();
		expect(maskSensitiveData(undefined)).toBeUndefined();
	});

	test("不存在的字段 / 嵌套空对象不影响其他字段", () => {
		const input = { a: 1, b: { c: 2 }, d: null };
		expect(maskSensitiveData(input)).toEqual({ a: 1, b: { c: 2 }, d: null });
	});
});
