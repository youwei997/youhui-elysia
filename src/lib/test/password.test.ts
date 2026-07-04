import { afterEach, describe, expect, test } from "bun:test";
import { hashPassword, verifyPassword } from "../password";

describe("password", () => {
	let hash: string;

	afterEach(async () => {
		hash = "";
	});

	test("hashPassword 返回非空字符串", async () => {
		hash = await hashPassword("my-secret-pw");
		expect(typeof hash).toBe("string");
		expect(hash.length).toBeGreaterThan(0);
	});

	test("相同明文生成不同哈希（salt 随机）", async () => {
		const h1 = await hashPassword("same-pw");
		const h2 = await hashPassword("same-pw");
		expect(h1).not.toBe(h2);
	});

	test("verifyPassword 正确密码返回 true", async () => {
		hash = await hashPassword("correct-pw");
		expect(await verifyPassword("correct-pw", hash)).toBe(true);
	});

	test("verifyPassword 错误密码返回 false", async () => {
		hash = await hashPassword("correct-pw");
		expect(await verifyPassword("wrong-pw", hash)).toBe(false);
	});

	test("不同明文哈希不同", async () => {
		const h1 = await hashPassword("password-a");
		const h2 = await hashPassword("password-b");
		expect(h1).not.toBe(h2);
		expect(await verifyPassword("password-a", h1)).toBe(true);
		expect(await verifyPassword("password-b", h2)).toBe(true);
		expect(await verifyPassword("password-a", h2)).toBe(false);
	});
});
