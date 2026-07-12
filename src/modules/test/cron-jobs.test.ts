/**
 * cron-jobs.test.ts —— 定时任务模块测试
 *
 * 测试 cleanExpiredOperLogs：物理删除超过保留期的操作日志。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sysOperLog } from "@/db/schema/system/oper-log";
import { cleanExpiredOperLogs } from "@/modules/oper-log/queries";

/** 测试专用标记，避免污染真实数据 */
const TEST_MODULE = "__test_cron_jobs__";

const cleanUp = async () => {
	await db.delete(sysOperLog).where(eq(sysOperLog.module, TEST_MODULE));
};

describe("cron jobs", () => {
	beforeAll(cleanUp);
	afterAll(cleanUp);

	test("cleanExpiredOperLogs 删除超过保留期的记录并返回条数", async () => {
		const now = Date.now();
		const ago31d = new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString();
		const ago29d = new Date(now - 29 * 24 * 60 * 60 * 1000).toISOString();

		// 插入：31 天前（应被删）+ 29 天前（应保留）
		await db.insert(sysOperLog).values([
			{
				module: TEST_MODULE,
				action: "old",
				method: "GET",
				url: "/test",
				status: 1,
				createTime: ago31d,
			},
			{
				module: TEST_MODULE,
				action: "recent",
				method: "GET",
				url: "/test",
				status: 1,
				createTime: ago29d,
			},
		]);

		const deleted = await cleanExpiredOperLogs(30, db);

		// 返回值：只删了 1 条
		expect(deleted).toBe(1);

		// 验证：31 天前的已删
		const remaining = await db
			.select({ action: sysOperLog.action })
			.from(sysOperLog)
			.where(eq(sysOperLog.module, TEST_MODULE));

		expect(remaining).toHaveLength(1);
		expect(remaining[0]?.action).toBe("recent");
	});
});
