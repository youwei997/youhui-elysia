/**
 * oper-log.test.ts —— oper-log 模块集成测试
 *
 * 测试策略：
 * - 启动真实 HTTP 监听，通过 fetch 调用 oper-log API
 * - 直接种子数据写入 sys_oper_log 表
 * - 覆盖列表查询（分页/关键字/状态/时间范围）、字段映射、趋势、概览
 * - 测试后清理种子数据
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { app } from "@/app";
import { db } from "@/db/client";
import { sysOperLog } from "@/db/schema/system/oper-log";
import { type JwtPayload, signAccessToken } from "@/lib/jwt";

/** 测试标记，用于 cleanup 区分测试数据 */
const TEST_MODULE = "__test_oper_log__";

const makeAdminPayload = (): JwtPayload => ({
	sub: "1",
	username: "root",
	roles: ["ROOT"],
	perms: ["*:*:*"],
	dataScopes: [1],
	tokenVersion: 0,
	jti: "test-jti-oper-log",
});

const seedData: (typeof sysOperLog.$inferInsert)[] = [
	{
		userId: 1,
		username: "admin",
		module: TEST_MODULE,
		action: "create",
		method: "POST",
		url: "/api/v1/users",
		ip: "192.168.1.1",
		ipRegion: "内网IP",
		status: 1,
		costMs: 100,
		createTime: "2026-07-05T10:00:00.000Z",
	},
	{
		userId: 2,
		username: "testuser",
		module: TEST_MODULE,
		action: "update",
		method: "PUT",
		url: "/api/v1/roles/1",
		ip: "10.0.0.1",
		ipRegion: "内网IP",
		status: 1,
		costMs: 200,
		createTime: "2026-07-05T11:00:00.000Z",
	},
	{
		userId: 1,
		username: "admin",
		module: TEST_MODULE,
		action: "delete",
		method: "DELETE",
		url: "/api/v1/menus/5",
		ip: "192.168.1.1",
		status: 0,
		errorMsg: "菜单有关联子项",
		costMs: 50,
		createTime: "2026-07-06T08:00:00.000Z",
	},
];

const defined = <T>(value: T | undefined): T => {
	if (value === undefined) throw new Error("Expected defined value");
	return value;
};

describe("oper-log 模块", () => {
	let token: string;
	let port: number;

	beforeAll(async () => {
		app.listen(0);
		port = defined(app.server?.port);

		token = await signAccessToken(makeAdminPayload());

		// 清理可能残留的测试数据 + 写入种子数据
		await db.delete(sysOperLog).where(eq(sysOperLog.module, TEST_MODULE));
		await db.insert(sysOperLog).values(seedData);
	});

	afterAll(async () => {
		await app.stop();
		await db.delete(sysOperLog).where(eq(sysOperLog.module, TEST_MODULE));
	});

	test("1. 列表查询 - 分页 + 倒序 + 模块筛选", async () => {
		const res = await fetch(
			`http://localhost:${port}/api/v1/logs/?pageNum=1&pageSize=10&module=${TEST_MODULE}`,
			{ headers: { authorization: `Bearer ${token}` } },
		);
		expect(res.status).toBe(200);

		const json = await res.json() as { data: { list: Array<{ createTime: string }>; total: number } };
		expect(json.data.list.length).toBe(seedData.length);
		expect(json.data.total).toBe(seedData.length);

		// 按 createTime 倒序：最新一条在前
		for (let i = 1; i < json.data.list.length; i++) {
			const prev = json.data.list[i - 1];
			const curr = json.data.list[i];
			if (prev && curr) {
				const t0 = new Date(prev.createTime).getTime();
				const t1 = new Date(curr.createTime).getTime();
				expect(t0).toBeGreaterThanOrEqual(t1);
			}
		}
	});

	test("2. 列表查询 - 关键字模糊匹配（username OR IP）", async () => {
		const res = await fetch(
			`http://localhost:${port}/api/v1/logs/?pageNum=1&pageSize=10&module=${TEST_MODULE}&keywords=admin`,
			{ headers: { authorization: `Bearer ${token}` } },
		);
		expect(res.status).toBe(200);

		const json = (await res.json()) as { data: { total: number } };
		// admin 有 2 条记录（create + delete，均为 admin 用户）
		expect(json.data.total).toBe(2);
	});

	test("3. 列表查询 - 状态筛选", async () => {
		const res = await fetch(
			`http://localhost:${port}/api/v1/logs/?pageNum=1&pageSize=10&module=${TEST_MODULE}&status=0`,
			{ headers: { authorization: `Bearer ${token}` } },
		);
		expect(res.status).toBe(200);

		const json = await res.json() as { data: { list: Array<{ status: number }>; total: number } };
		expect(json.data.total).toBe(1);
		expect(json.data.list[0]?.status).toBe(0);
	});

	test("4. 列表查询 - 时间范围筛选（UTC 边界）", async () => {
		const res = await fetch(
			`http://localhost:${port}/api/v1/logs/?pageNum=1&pageSize=10&module=${TEST_MODULE}&createTime=2026-07-05&createTime=2026-07-05`,
			{ headers: { authorization: `Bearer ${token}` } },
		);
		expect(res.status).toBe(200);

		const json = await res.json() as { data: { total: number } };
		// 7月5日有 2 条记录（create + update）
		expect(json.data.total).toBe(2);
	});		test("5. 响应字段映射 - OperLogResponse transform", async () => {
		const res = await fetch(
			`http://localhost:${port}/api/v1/logs/?pageNum=1&pageSize=1&module=${TEST_MODULE}`,
			{ headers: { authorization: `Bearer ${token}` } },
		);
		expect(res.status).toBe(200);

		const json = await res.json() as {
			data: {
				list: Array<Record<string, unknown>>;
			};
		};
		const item = json.data.list[0];

		// 映射后的字段存在
		expect(item).toHaveProperty("actionType"); // 原 action
		expect(item).toHaveProperty("operatorId"); // 原 userId
		expect(item).toHaveProperty("operatorName"); // 原 username
		expect(item).toHaveProperty("requestUri"); // 原 url
		expect(item).toHaveProperty("requestMethod"); // 原 method
		expect(item).toHaveProperty("executionTime"); // 原 costMs

		// 内部字段不应暴露
		expect(item).not.toHaveProperty("userAgent");
		expect(item).not.toHaveProperty("requestParams");
		expect(item).not.toHaveProperty("responseResult");
	});

	test("6. 访问趋势 - getVisitTrend（仅测试数据）", async () => {
		// 趋势接口不支持 module 筛选，所以改为直接调用 getVisitTrend 查询
		const { getVisitTrend } = await import("@/modules/oper-log/queries");
		const result = await getVisitTrend(db, "2026-07-05", "2026-07-06");

		expect(result.dates).toEqual(["2026-07-05", "2026-07-06"]);
		// 7月5日有 2 条（admin + testuser），7月6日有 1 条（admin）
		// 注意：结果包含全表数据，这里至少包含我们的种子数据
		expect(result.pvList[0]).toBeGreaterThanOrEqual(2);
		expect(result.pvList[1]).toBeGreaterThanOrEqual(1);
		expect(result.uvList[0]).toBeGreaterThanOrEqual(2);
		expect(result.uvList[1]).toBeGreaterThanOrEqual(1);
	});

	test("7. 访问概览 - getVisitOverview（响应结构正确）", async () => {
		const res = await fetch(
			`http://localhost:${port}/api/v1/logs/analytics/overview`,
			{ headers: { authorization: `Bearer ${token}` } },
		);
		expect(res.status).toBe(200);

		const json = (await res.json()) as {
			data: {
				todayPvCount: number;
				todayUvCount: number;
				totalPvCount: number;
				totalUvCount: number;
				pvGrowthRate: number | null;
				uvGrowthRate: number | null;
			};
		};
		// 响应结构完整
		expect(typeof json.data.todayPvCount).toBe("number");
		expect(typeof json.data.todayUvCount).toBe("number");
		expect(typeof json.data.totalPvCount).toBe("number");
		expect(json.data.totalPvCount).toBeGreaterThanOrEqual(seedData.length);
		expect(json.data.pvGrowthRate === null || typeof json.data.pvGrowthRate === "number").toBe(true);
		expect(json.data.uvGrowthRate === null || typeof json.data.uvGrowthRate === "number").toBe(true);
	});
});
