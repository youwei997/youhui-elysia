import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, or } from "drizzle-orm";
import { db } from "@/db/client";
import { sysDict } from "@/db/schema/system/dict";
import { sysDictItem } from "@/db/schema/system/dict-item";
import {
	createDictItem,
	findDictById,
	findDictByType,
	findDictItemByDictIdAndLabel,
	findDictItemByDictIdAndValue,
	findDictItemById,
	findDictItems,
	findDicts,
	softDeleteDict,
	updateDict,
	updateDictItem,
} from "@/modules/dict/queries";

// ==========================================
// 测试数据：用固定 ID 避免与种子冲突
// ==========================================
const TEST_DICT_ID = 600;
const TEST_DICT_ITEM_ID_1 = 6000;
const TEST_DICT_ITEM_ID_2 = 6001;

const cleanUp = async () => {
	await db.delete(sysDictItem).where(eq(sysDictItem.dictId, TEST_DICT_ID));
	await db.delete(sysDict).where(eq(sysDict.id, TEST_DICT_ID));
	await db
		.delete(sysDictItem)
		.where(
			or(
				eq(sysDictItem.id, 601),
				eq(sysDictItem.id, 6000),
				eq(sysDictItem.id, 6001),
			),
		);
	await db.delete(sysDict).where(eq(sysDict.id, 601));
};

describe("dict 父子关联查询", () => {
	beforeAll(async () => {
		await cleanUp();
		const now = new Date().toISOString();
		await db.insert(sysDict).values({
			id: TEST_DICT_ID,
			type: "test_dict_type",
			name: "测试字典",
			status: 1,
			remark: "联合测试用",
			createdBy: 1,
			createTime: now,
			updatedBy: 1,
			updateTime: now,
		});
		await db.insert(sysDictItem).values([
			{
				id: TEST_DICT_ITEM_ID_1,
				dictId: TEST_DICT_ID,
				label: "选项1",
				value: "1",
				sort: 1,
				status: 1,
				tagType: "primary",
				createdBy: 1,
				createTime: now,
				updatedBy: 1,
				updateTime: now,
			},
			{
				id: TEST_DICT_ITEM_ID_2,
				dictId: TEST_DICT_ID,
				label: "选项2",
				value: "2",
				sort: 2,
				status: 1,
				tagType: "success",
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

	test("findDicts 列表查询 + keywords 模糊匹配", async () => {
		const result = await findDicts(
			{ pageNum: 1, pageSize: 10, keywords: "测试字典" },
			db,
		);
		expect(result.list.some((d) => d.id === TEST_DICT_ID)).toBe(true);
		expect(result.total).toBeGreaterThanOrEqual(1);
	});

	test("findDictById 和 findDictByType 单条查询", async () => {
		const byId = await findDictById(TEST_DICT_ID, db);
		expect(byId?.type).toBe("test_dict_type");

		const byType = await findDictByType("test_dict_type", db);
		expect(byType?.id).toBe(TEST_DICT_ID);
	});

	test("findDictItems 查询字典项列表（按 dictId）", async () => {
		const result = await findDictItems(
			TEST_DICT_ID,
			{
				pageNum: 1,
				pageSize: 10,
				keywords: "选项",
			},
			db,
		);
		expect(result.list.length).toBeGreaterThanOrEqual(2);
		const ids = result.list.map((item) => item.id);
		expect(ids).toContain(TEST_DICT_ITEM_ID_1);
		expect(ids).toContain(TEST_DICT_ITEM_ID_2);
	});

	test("findDictItemById 单条查询", async () => {
		const item = await findDictItemById(TEST_DICT_ITEM_ID_1, db);
		expect(item?.label).toBe("选项1");
		expect(item?.value).toBe("1");
	});

	test("findDictItemByDictIdAndLabel 跨表重复校验", async () => {
		const existing = await findDictItemByDictIdAndLabel(
			TEST_DICT_ID,
			"选项1",
			db,
		);
		expect(existing?.id).toBe(TEST_DICT_ITEM_ID_1);

		const notExist = await findDictItemByDictIdAndLabel(
			TEST_DICT_ID,
			"不存在",
			db,
		);
		expect(notExist).toBeUndefined();
	});

	test("findDictItemByDictIdAndValue 跨表重复校验", async () => {
		const existing = await findDictItemByDictIdAndValue(TEST_DICT_ID, "2", db);
		expect(existing?.id).toBe(TEST_DICT_ITEM_ID_2);
	});

	test("createDictItem 新增字典项", async () => {
		const item = await createDictItem(
			TEST_DICT_ID,
			{
				label: "新增选项",
				value: "3",
				sort: 3,
				status: 1,
				tagType: "warning",
			},
			db,
		);
		expect(item.dictId).toBe(TEST_DICT_ID);
		expect(item.label).toBe("新增选项");

		// 清理
		await db.delete(sysDictItem).where(eq(sysDictItem.id, item.id));
	});

	test("updateDictItem 更新字典项", async () => {
		const updated = await updateDictItem(
			TEST_DICT_ITEM_ID_1,
			{ label: "更新后的选项1" },
			db,
		);
		expect(updated?.label).toBe("更新后的选项1");

		// 恢复
		await updateDictItem(TEST_DICT_ITEM_ID_1, { label: "选项1" }, db);
	});

	test("updateDict 修改 type 时检查重复", async () => {
		// 先插入一个干扰记录
		const dupTypeId = 601;
		await db.insert(sysDict).values({
			id: dupTypeId,
			type: "dup_type",
			name: "干扰字典",
			status: 1,
			remark: "",
			createdBy: 1,
			createTime: new Date().toISOString(),
			updatedBy: 1,
			updateTime: new Date().toISOString(),
		});

		// 尝试把 TEST_DICT_ID 的 type 改为dup_type，应该抛错
		let threw = false;
		try {
			await updateDict(TEST_DICT_ID, { type: "dup_type" }, db);
		} catch (e) {
			threw = true;
			expect((e as Error).message).toBe("DICT_TYPE_DUPLICATE");
		}
		expect(threw).toBe(true);

		// 清理
		await db.delete(sysDict).where(eq(sysDict.id, dupTypeId));
	});

	test("softDeleteDict 级联软删字典项", async () => {
		await softDeleteDict(TEST_DICT_ID, db);

		const dict = await findDictById(TEST_DICT_ID, db);
		expect(dict?.deleteTime).not.toBeNull();

		const items = await findDictItems(
			TEST_DICT_ID,
			{
				pageNum: 1,
				pageSize: 10,
			},
			db,
		);
		expect(items.list.length).toBe(0);

		// 级联软删后，findDictItemById 也不应返回
		const item = await findDictItemById(TEST_DICT_ITEM_ID_1, db);
		expect(item).toBeUndefined();
	});
});
