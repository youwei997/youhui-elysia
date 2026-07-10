import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { sysNotice, sysUserNotice } from "@/db/schema/system/notice";
import { sysUser } from "@/db/schema/system/user";
import {
	batchSoftDeleteNotices,
	createNotice,
	findNoticeById,
	findNotices,
	updateNotice,
} from "@/modules/notice/queries";
import { NoticeParamsWithCommaIds } from "@/modules/notice/schema";

// 固定高位测试 ID，避免与 identity 序列（从 1 递增）产生的真实数据冲突
const LIST_DRAFT_ID = 9001; // 草稿（publisherId 空 → publisherName null）
const LIST_PUBLISHED_ID = 9002; // 已发布（publisherId 指向真实用户 → publisherName 非空）
const UPDATE_ID = 9003; // 编辑目标
const DELETE_ID_A = 9004; // 批量删目标
const DELETE_ID_B = 9005; // 批量删目标（带 user_notice 验级联）
const ALL_IDS = [
	LIST_DRAFT_ID,
	LIST_PUBLISHED_ID,
	UPDATE_ID,
	DELETE_ID_A,
	DELETE_ID_B,
];

// 发布人取库中任一真实用户，避免耦合具体 seed ID
let publisherId: number;
let publisherName: string | null;

const cleanUp = async () => {
	await db
		.delete(sysUserNotice)
		.where(inArray(sysUserNotice.noticeId, ALL_IDS));
	await db.delete(sysNotice).where(inArray(sysNotice.id, ALL_IDS));
};

describe("notice 模块查询", () => {
	beforeAll(async () => {
		await cleanUp();
		const [u] = await db
			.select({ id: sysUser.id, nickname: sysUser.nickname })
			.from(sysUser)
			.limit(1);
		if (!u) throw new Error("测试前置：库中至少需要一名用户作为发布人");
		publisherId = u.id;
		publisherName = u.nickname;

		const now = new Date().toISOString();
		const audit = {
			createdBy: 1,
			createTime: now,
			updatedBy: 1,
			updateTime: now,
		};
		await db.insert(sysNotice).values([
			{
				id: LIST_DRAFT_ID,
				title: "测试通知草稿",
				content: "草稿内容",
				type: 1,
				level: "L",
				targetType: 1,
				publishStatus: 0,
				...audit,
			},
			{
				id: LIST_PUBLISHED_ID,
				title: "测试通知已发布",
				content: "已发布内容",
				type: 1,
				level: "M",
				targetType: 1,
				publishStatus: 1,
				publisherId,
				publishTime: now,
				...audit,
			},
			{
				id: UPDATE_ID,
				title: "测试通知待编辑",
				content: "编辑前内容",
				type: 1,
				level: "L",
				targetType: 1,
				publishStatus: 0,
				...audit,
			},
			{
				id: DELETE_ID_A,
				title: "测试通知待删A",
				content: "待删A",
				type: 1,
				level: "L",
				targetType: 1,
				publishStatus: 0,
				...audit,
			},
			{
				id: DELETE_ID_B,
				title: "测试通知待删B",
				content: "待删B",
				type: 1,
				level: "H",
				targetType: 2,
				targetUserIds: String(publisherId),
				publishStatus: 1,
				publisherId,
				publishTime: now,
				...audit,
			},
		]);
		// DELETE_ID_B 物化一条 user_notice，用于验证批量删的级联软删
		await db.insert(sysUserNotice).values({
			noticeId: DELETE_ID_B,
			userId: publisherId,
			isRead: 0,
			...audit,
		});
	});

	afterAll(async () => {
		await cleanUp();
	});

	test("findNotices 分页 + title 模糊 + publisherName join", async () => {
		const result = await findNotices(
			{ pageNum: 1, pageSize: 50, title: "测试通知" },
			db,
		);
		expect(result.total).toBeGreaterThanOrEqual(5);

		const draft = result.list.find((n) => n.id === LIST_DRAFT_ID);
		const published = result.list.find((n) => n.id === LIST_PUBLISHED_ID);
		// 草稿无发布人 → publisherName 为 null；已发布 → 取用户昵称
		expect(draft?.publisherName).toBeNull();
		expect(published?.publisherName).toBe(publisherName);
	});

	test("findNotices 按 publishStatus 过滤", async () => {
		const result = await findNotices(
			{ pageNum: 1, pageSize: 50, title: "测试通知", publishStatus: 0 },
			db,
		);
		const ids = result.list.map((n) => n.id);
		expect(ids).toContain(LIST_DRAFT_ID);
		expect(ids).not.toContain(LIST_PUBLISHED_ID);
	});

	test("createNotice 默认存草稿（publishStatus=0，无发布人）", async () => {
		const created = await createNotice(
			{
				title: "测试通知新增",
				content: "新增内容",
				type: 0,
				level: "L",
				targetType: 2,
				targetUserIds: [11, 22, 33],
			},
			db,
		);
		expect(created.publishStatus).toBe(0);
		expect(created.publisherId).toBeNull();
		// 数组在 queries 层 join 为逗号串入库
		expect(created.targetUserIds).toBe("11,22,33");

		await db.delete(sysNotice).where(eq(sysNotice.id, created.id));
	});

	test("findNoticeById 命中与不存在", async () => {
		const hit = await findNoticeById(UPDATE_ID, db);
		expect(hit?.title).toBe("测试通知待编辑");

		const miss = await findNoticeById(999999, db);
		expect(miss).toBeUndefined();
	});

	test("updateNotice 更新标题与 targetUserIds", async () => {
		const updated = await updateNotice(
			UPDATE_ID,
			{ title: "测试通知编辑后", targetUserIds: [7, 8] },
			db,
		);
		expect(updated?.title).toBe("测试通知编辑后");
		expect(updated?.targetUserIds).toBe("7,8");
	});

	test("batchSoftDeleteNotices 批量软删 + 级联软删 user_notice + 返回条数", async () => {
		const deleted = await batchSoftDeleteNotices(
			[DELETE_ID_A, DELETE_ID_B],
			db,
		);
		expect(deleted).toBe(2);

		// 软删后主表查不到
		expect(await findNoticeById(DELETE_ID_A, db)).toBeUndefined();
		expect(await findNoticeById(DELETE_ID_B, db)).toBeUndefined();

		// 关联 user_notice 一并被软删（deleteTime 非空 → 未删的条数为 0）
		const alive = await db
			.select({ id: sysUserNotice.id })
			.from(sysUserNotice)
			.where(
				and(
					eq(sysUserNotice.noticeId, DELETE_ID_B),
					isNull(sysUserNotice.deleteTime),
				),
			);
		expect(alive).toHaveLength(0);
	});

	test("batchSoftDeleteNotices 目标全不存在时返回 0（route 据此报 NOTICE_NOT_FOUND）", async () => {
		const deleted = await batchSoftDeleteNotices([888888, 999999], db);
		expect(deleted).toBe(0);
	});

	test("NoticeParamsWithCommaIds 拒绝脏参数（route 层 400 的边界）", async () => {
		expect(NoticeParamsWithCommaIds.safeParse({ ids: "1" }).success).toBe(true);
		expect(NoticeParamsWithCommaIds.safeParse({ ids: "1,2,3" }).success).toBe(
			true,
		);
		// 含非数字段整串拒绝，不静默过滤成 "1,2"
		expect(NoticeParamsWithCommaIds.safeParse({ ids: "1,abc,2" }).success).toBe(
			false,
		);
		expect(NoticeParamsWithCommaIds.safeParse({ ids: "" }).success).toBe(false);
		expect(NoticeParamsWithCommaIds.safeParse({ ids: "1," }).success).toBe(
			false,
		);
	});
});
