import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { sysUser } from "@/db/schema/system/user";
import { importUsers } from "@/modules/user/queries";

// ==========================================
// importUsers 逐行导入：对账 created / messages / rowNum
// 用固定前缀用户名避免与种子数据冲突
// ==========================================
const A = "imp_test_a";
const B = "imp_test_b";
const PRE = "imp_test_pre";
const ALL_NAMES = [A, B, PRE];

const cleanUp = async () => {
	await db.delete(sysUser).where(inArray(sysUser.username, ALL_NAMES));
};

/** importUsers 入参构造器（密码已由调用方哈希，这里给占位字符串即可） */
const row = (username: string, rowNum: number) => ({
	username,
	password: "hashed-placeholder",
	rowNum,
});

describe("importUsers 逐行导入", () => {
	beforeAll(async () => {
		await cleanUp();
		// 预置一个已存在用户，模拟 DB 级别的用户名冲突（23505）
		await db
			.insert(sysUser)
			.values({ username: PRE, password: "x", tenantId: 0 });
	});

	afterAll(async () => {
		await cleanUp();
	});

	test("within-file 同名不整批回滚，冲突行落 messages 且行号正确", async () => {
		const result = await importUsers(
			[
				row(A, 2), // 新用户，成功
				row(B, 3), // 新用户，成功
				row(A, 4), // 文件内与第 2 行同名，冲突
				row(PRE, 5), // 与预置用户同名，冲突
			],
			0,
			db,
		);

		// 前两行成功入库，后两行冲突——批次未整体回滚
		expect(result.created).toBe(2);
		expect(result.messages).toHaveLength(2);

		// 行号取自 rowNum（真实 Excel 行），而非运行计数
		expect(result.messages[0]).toBe("第 4 行：用户名已存在");
		expect(result.messages[1]).toBe("第 5 行：用户名已存在");

		// 成功的两行确实写入
		const inserted = await db
			.select({ username: sysUser.username })
			.from(sysUser)
			.where(inArray(sysUser.username, [A, B]));
		expect(inserted.map((u) => u.username).sort()).toEqual([A, B]);
	});
});
