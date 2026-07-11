import {
	and,
	count,
	desc,
	eq,
	getColumns,
	inArray,
	isNull,
	like,
} from "drizzle-orm";
import type { DB } from "@/db/client";
import { escapeLike } from "@/db/helpers/like";
import { sysNotice, sysUserNotice } from "@/db/schema/system/notice";
import { sysUser } from "@/db/schema/system/user";
import type { PageResult } from "@/lib/pagination";
import type { NoticeListRecord, NoticeRecord } from "./types";

/**
 * 通知公告列表查询（分页，软删过滤）
 *
 * LEFT JOIN sys_user 取发布人昵称（publisherName），草稿态 publisherId 为空 → 返回 null。
 * 与 youlai-boot 原版 NoticeMapper.xml（t2.nickname AS publisherName）保持一致。
 * 过滤：title 模糊匹配、publishStatus / type 精确匹配。
 */
export const findNotices = async (
	query: {
		pageNum: number;
		pageSize: number;
		title?: string | undefined;
		publishStatus?: number | undefined;
		type?: number | undefined;
	},
	db: DB,
): Promise<PageResult<NoticeListRecord>> => {
	const where = [isNull(sysNotice.deleteTime)];

	if (query.title) {
		where.push(like(sysNotice.title, `%${escapeLike(query.title)}%`));
	}
	if (query.publishStatus !== undefined) {
		where.push(eq(sysNotice.publishStatus, query.publishStatus));
	}
	if (query.type !== undefined) {
		where.push(eq(sysNotice.type, query.type));
	}

	const whereClause = and(...where);

	const list = await db
		.select({ ...getColumns(sysNotice), publisherName: sysUser.nickname })
		.from(sysNotice)
		.leftJoin(sysUser, eq(sysNotice.publisherId, sysUser.id))
		.where(whereClause)
		.orderBy(desc(sysNotice.id))
		.limit(query.pageSize)
		.offset((query.pageNum - 1) * query.pageSize);

	const [{ total = 0 } = {}] = await db
		.select({ total: count() })
		.from(sysNotice)
		.where(whereClause);

	return { list, total };
};

/**
 * 按 ID 查通知公告（软删过滤）
 */
export const findNoticeById = async (
	id: number,
	db: DB,
): Promise<NoticeRecord | undefined> => {
	const [notice] = await db
		.select()
		.from(sysNotice)
		.where(and(eq(sysNotice.id, id), isNull(sysNotice.deleteTime)));
	return notice;
};

/**
 * 新增通知公告（默认草稿，publisherId / publishTime 由发布动作写入）
 *
 * targetUserIds 数组在此 join 为逗号串入库，草稿态无指定用户则存空串。
 */
export const createNotice = async (
	data: {
		title: string;
		content: string;
		type: number;
		level: string;
		targetType: number;
		targetUserIds?: number[] | undefined;
	},
	db: DB,
): Promise<NoticeRecord> => {
	const { targetUserIds, ...rest } = data;
	const [notice] = await db
		.insert(sysNotice)
		.values({ ...rest, targetUserIds: (targetUserIds ?? []).join(",") })
		.returning();
	return notice as NoticeRecord;
};

/**
 * 更新通知公告（软删过滤，targetUserIds 传入时 join 逗号串覆盖）
 */
export const updateNotice = async (
	id: number,
	data: {
		title?: string | undefined;
		content?: string | undefined;
		type?: number | undefined;
		level?: string | undefined;
		targetType?: number | undefined;
		targetUserIds?: number[] | undefined;
	},
	db: DB,
): Promise<NoticeRecord | undefined> => {
	const { targetUserIds, ...rest } = data;
	const [notice] = await db
		.update(sysNotice)
		.set({
			...rest,
			...(targetUserIds !== undefined
				? { targetUserIds: targetUserIds.join(",") }
				: {}),
		})
		.where(and(eq(sysNotice.id, id), isNull(sysNotice.deleteTime)))
		.returning();
	return notice as NoticeRecord | undefined;
};

/**
 * 发布通知公告（事务：先软删旧 user_notice 快照，再按最新内容重新物化）
 *
 * 对齐原 Java NoticeServiceImpl#publishNotice：
 * - targetType=1（全部）→ 物化给所有未软删用户（不按 status 过滤，与 Java 版一致）
 * - targetType=2（指定）→ 物化给 targetUserIds 解析出的用户
 * 状态流转校验（已发布不可重发）由 routes 层前置把关，本函数只做发布动作。
 */
export const publishNotice = async (
	id: number,
	publisherId: number,
	db: DB,
): Promise<NoticeRecord | undefined> => {
	return await db.transaction(async (tx) => {
		const now = new Date().toISOString();

		await tx
			.update(sysUserNotice)
			.set({ deleteTime: now })
			.where(
				and(eq(sysUserNotice.noticeId, id), isNull(sysUserNotice.deleteTime)),
			);

		const [notice] = await tx
			.select()
			.from(sysNotice)
			.where(and(eq(sysNotice.id, id), isNull(sysNotice.deleteTime)));
		if (!notice) return undefined;

		const targetUserIds =
			notice.targetType === 2
				? notice.targetUserIds
						.split(",")
						.filter(Boolean)
						.map(Number)
				: undefined;

		const targetUsers = await tx
			.select({ id: sysUser.id })
			.from(sysUser)
			.where(
				and(
					isNull(sysUser.deleteTime),
					...(targetUserIds ? [inArray(sysUser.id, targetUserIds)] : []),
				),
			);

		if (targetUsers.length > 0) {
			await tx.insert(sysUserNotice).values(
				targetUsers.map((u) => ({
					noticeId: id,
					userId: u.id,
					isRead: 0,
				})),
			);
		}

		const [updated] = await tx
			.update(sysNotice)
			.set({
				publishStatus: 1,
				publisherId,
				publishTime: now,
				revokeTime: null,
			})
			.where(and(eq(sysNotice.id, id), isNull(sysNotice.deleteTime)))
			.returning();
		return updated as NoticeRecord;
	});
};

/**
 * 撤回通知公告（事务：软删该 notice 的 user_notice + 状态改为已撤回）
 *
 * 状态流转校验（仅已发布可撤回）由 routes 层前置把关，本函数只做撤回动作。
 */
export const revokeNotice = async (
	id: number,
	db: DB,
): Promise<NoticeRecord | undefined> => {
	return await db.transaction(async (tx) => {
		const now = new Date().toISOString();

		await tx
			.update(sysUserNotice)
			.set({ deleteTime: now })
			.where(
				and(eq(sysUserNotice.noticeId, id), isNull(sysUserNotice.deleteTime)),
			);

		const [updated] = await tx
			.update(sysNotice)
			.set({ publishStatus: -1, revokeTime: now })
			.where(and(eq(sysNotice.id, id), isNull(sysNotice.deleteTime)))
			.returning();
		return updated as NoticeRecord | undefined;
	});
};

/**
 * 批量软删通知公告（事务：连带软删关联的 sys_user_notice）
 *
 * 返回实际软删的通知条数。草稿态尚无物化的 user_notice，连带删对其为空操作，
 * 但保证已发布通知被删时关联记录一并清理（对齐 DELETE /notices 契约）。
 */
export const batchSoftDeleteNotices = async (
	ids: number[],
	db: DB,
): Promise<number> => {
	return await db.transaction(async (tx) => {
		const now = new Date().toISOString();
		await tx
			.update(sysUserNotice)
			.set({ deleteTime: now })
			.where(
				and(
					inArray(sysUserNotice.noticeId, ids),
					isNull(sysUserNotice.deleteTime),
				),
			);
		const result = await tx
			.update(sysNotice)
			.set({ deleteTime: now })
			.where(and(inArray(sysNotice.id, ids), isNull(sysNotice.deleteTime)))
			.returning({ id: sysNotice.id });
		return result.length;
	});
};
