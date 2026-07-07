import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, or } from "drizzle-orm";
import { db } from "@/db/client";
import { sysConfig } from "@/db/schema/system/config";
import {
	createConfig,
	findConfigById,
	findConfigByKey,
	findConfigs,
	softDeleteConfig,
	updateConfig,
} from "@/modules/config/queries";

const TEST_CONFIG_ID = 700;
const DUP_CONFIG_ID = 701;
const TEMP_CONFIG_ID = 702;

const cleanUp = async () => {
	await db
		.delete(sysConfig)
		.where(
			or(
				eq(sysConfig.id, TEST_CONFIG_ID),
				eq(sysConfig.id, DUP_CONFIG_ID),
				eq(sysConfig.id, TEMP_CONFIG_ID),
			),
		);
};

describe("config 模块查询", () => {
	beforeAll(async () => {
		await cleanUp();
		const now = new Date().toISOString();
		await db.insert(sysConfig).values([
			{
				id: TEST_CONFIG_ID,
				configName: "站点标题",
				configKey: "site.title.test",
				configValue: "测试站点",
				remark: "联合测试用",
				createdBy: 1,
				createTime: now,
				updatedBy: 1,
				updateTime: now,
			},
			{
				id: DUP_CONFIG_ID,
				configName: "重复标题",
				configKey: "site.title.dup",
				configValue: "重复值",
				remark: "干扰记录",
				createdBy: 1,
				createTime: now,
				updatedBy: 1,
				updateTime: now,
			},
		]);
	});

	afterAll(async () => {
		await cleanUp();
	});

	test("findConfigs 列表查询 + keywords 模糊匹配", async () => {
		const result = await findConfigs(
			{ pageNum: 1, pageSize: 10, keywords: "站点" },
			db,
		);
		expect(result.list.some((item) => item.id === TEST_CONFIG_ID)).toBe(true);
		expect(result.total).toBeGreaterThanOrEqual(1);
	});

	test("findConfigById 和 findConfigByKey 单条查询", async () => {
		const byId = await findConfigById(TEST_CONFIG_ID, db);
		expect(byId?.configKey).toBe("site.title.test");

		const byKey = await findConfigByKey("site.title.test", db);
		expect(byKey?.id).toBe(TEST_CONFIG_ID);
	});

	test("createConfig 新增配置", async () => {
		const created = await createConfig(
			{
				configName: "临时配置",
				configKey: "site.title.temp",
				configValue: "临时值",
				remark: "临时记录",
			},
			db,
		);

		expect(created.configKey).toBe("site.title.temp");
		expect(created.configName).toBe("临时配置");

		await db.delete(sysConfig).where(eq(sysConfig.id, created.id));
	});

	test("updateConfig 更新配置名称", async () => {
		const updated = await updateConfig(
			TEST_CONFIG_ID,
			{ configName: "更新后的站点标题" },
			db,
		);
		expect(updated?.configName).toBe("更新后的站点标题");

		await updateConfig(TEST_CONFIG_ID, { configName: "站点标题" }, db);
	});

	test("updateConfig 修改 configKey 时检查重复", async () => {
		let threw = false;
		try {
			await updateConfig(TEST_CONFIG_ID, { configKey: "site.title.dup" }, db);
		} catch (e) {
			threw = true;
			expect((e as Error).message).toBe("CONFIG_KEY_DUPLICATE");
		}
		expect(threw).toBe(true);
	});

	test("softDeleteConfig 软删后不可再查到", async () => {
		const ok = await softDeleteConfig(TEST_CONFIG_ID, db);
		expect(ok).toBe(true);

		const byId = await findConfigById(TEST_CONFIG_ID, db);
		expect(byId).toBeUndefined();

		const result = await findConfigs(
			{ pageNum: 1, pageSize: 10, keywords: "站点" },
			db,
		);
		expect(result.list.map((item) => item.id)).not.toContain(TEST_CONFIG_ID);
	});
});
