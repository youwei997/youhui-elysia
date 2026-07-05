import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { app } from "@/app";
import { db } from "@/db/client";
import { sysOperLog } from "@/db/schema/system/oper-log";
import { sysUser } from "@/db/schema/system/user";
import { type JwtPayload, signAccessToken } from "@/lib/jwt";

const makeAdminPayload = (): JwtPayload => ({
	sub: "1",
	username: "root", // 种子数据中超级管理员 username 为 root
	roles: ["ROOT"],
	perms: ["*:*:*"],
	dataScopes: [1],
	tokenVersion: 0,
	jti: "test-integration-jti-oper-log",
});

const defined = <T>(value: T | undefined): T => {
	if (value === undefined) throw new Error("Expected defined value");
	return value;
};

describe("Operation Log Integration (5.1.5)", () => {
	let token: string;
	let createdUserId: number | null = null;
	const testUsername = "audit_test_user_unique";
	let port: number;

	beforeAll(async () => {
		// 1. 启动真实的 HTTP 监听，以触发 onAfterResponse 钩子
		app.listen(0);
		port = app.server?.port ?? 8000;

		// 2. 在测试开始前，先清理之前可能残留的数据，确保测试的独立性与准确性
		await db.delete(sysOperLog).where(eq(sysOperLog.module, "user"));
		await db.delete(sysUser).where(eq(sysUser.username, testUsername));
	});

	afterAll(async () => {
		// 1. 关闭监听
		await app.stop();

		// 2. 物理清理测试生成的用户 data
		if (createdUserId) {
			await db.delete(sysUser).where(eq(sysUser.id, createdUserId));
		}
		// 3. 物理清理测试生成的日志数据（避免在 sys_oper_log 中留下垃圾数据）
		await db.delete(sysOperLog).where(eq(sysOperLog.module, "user"));
	});

	test("1. 链路连通验证 - 创建用户", async () => {
		token = await signAccessToken(makeAdminPayload());

		const res = await fetch(`http://localhost:${port}/api/v1/users`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({
				username: testUsername,
				password: "password123",
				nickname: "测试日志用户",
				gender: 1,
				status: 1,
				deptId: 1,
			}),
		});

		expect(res.status).toBe(200);
		const json = (await res.json()) as { data: { id: string } };
		createdUserId = Number(json.data.id);
		expect(createdUserId).toBeGreaterThan(0);

		// 等待 setImmediate 异步落库完成
		await new Promise((resolve) => setTimeout(resolve, 200));

		// 检查数据库 sys_oper_log 是否有记录
		const logs = await db
			.select()
			.from(sysOperLog)
			.where(
				and(eq(sysOperLog.module, "user"), eq(sysOperLog.action, "create")),
			);

		expect(logs.length).toBe(1);
		const log = defined(logs[0]);
		expect(log.username).toBe("root");
		expect(log.status).toBe(1); // 成功

		// 验证密码脱敏
		const params = log.requestParams as Record<string, unknown>;
		expect(params.password).toBe("***");
		expect(params.username).toBe(testUsername);
	});

	test("2. 链路连通验证 - 更新用户", async () => {
		if (!createdUserId) {
			throw new Error("User was not created in step 1");
		}

		const res = await fetch(
			`http://localhost:${port}/api/v1/users/${createdUserId}`,
			{
				method: "PUT",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({
					nickname: "测试更新日志用户",
					gender: 2,
					status: 1,
					deptId: 1,
				}),
			},
		);

		expect(res.status).toBe(200);

		// 等待 setImmediate 异步落库完成
		await new Promise((resolve) => setTimeout(resolve, 200));

		// 检查数据库 sys_oper_log 是否有记录
		const logs = await db
			.select()
			.from(sysOperLog)
			.where(
				and(eq(sysOperLog.module, "user"), eq(sysOperLog.action, "update")),
			);

		expect(logs.length).toBe(1);
		const log = defined(logs[0]);
		expect(log.status).toBe(1);
		const params = log.requestParams as Record<string, unknown>;
		expect(params.nickname).toBe("测试更新日志用户");
	});

	test("3. 链路连通验证 - 删除用户", async () => {
		if (!createdUserId) {
			throw new Error("User was not created in step 1");
		}

		const res = await fetch(
			`http://localhost:${port}/api/v1/users/${createdUserId}`,
			{
				method: "DELETE",
				headers: {
					authorization: `Bearer ${token}`,
				},
			},
		);

		expect(res.status).toBe(200);

		// 等待 setImmediate 异步落库完成
		await new Promise((resolve) => setTimeout(resolve, 200));

		// 检查数据库 sys_oper_log 是否有记录
		const logs = await db
			.select()
			.from(sysOperLog)
			.where(
				and(eq(sysOperLog.module, "user"), eq(sysOperLog.action, "delete")),
			);

		expect(logs.length).toBe(1);
		const log = defined(logs[0]);
		expect(log.status).toBe(1);
	});
});
