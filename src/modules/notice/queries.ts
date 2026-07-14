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
import { tenantEq } from "@/db/helpers/tenant";
import { escapeLike } from "@/db/helpers/like";
import { sysNotice, sysUserNotice } from "@/db/schema/system/notice";
import { sysUser } from "@/db/schema/system/user";
import type { PageResult } from "@/lib/pagination";
import type { MyNoticeRecord, NoticeListRecord, NoticeRecord } from "./types";

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
	tenantId: number,
	db: DB,
): Promise<PageResult<NoticeListRecord>> => {
	const where = [
		isNull(sysNotice.deleteTime),
		tenantEq(sysNotice.tenantId, tenantId),
	];

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
	tenantId: number,
	db: DB,
): Promise<NoticeRecord | undefined> => {
	const [notice] = await db
		.select()
		.from(sysNotice)
		.where(
			and(
				eq(sysNotice.id, id),
				tenantEq(sysNotice.tenantId, tenantId),
				isNull(sysNotice.deleteTime),
			),
		);
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
	tenantId: number,
	db: DB,
): Promise<NoticeRecord> => {
	const { targetUserIds, ...rest } = data;
	const [notice] = await db
		.insert(sysNotice)
		.values({ ...rest, tenantId, targetUserIds: (targetUserIds ?? []).join(",") })
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
	tenantId: number,
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
		.where(
			and(
				eq(sysNotice.id, id),
				tenantEq(sysNotice.tenantId, tenantId),
				isNull(sysNotice.deleteTime),
			),
		)
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
	tenantId: number,
	db: DB,
): Promise<NoticeRecord | undefined> => {
	return await db.transaction(async (tx) => {
		const now = new Date().toISOString();

		await tx
			.update(sysUserNotice)
			.set({ deleteTime: now })
			.where(
				and(
					eq(sysUserNotice.noticeId, id),
					tenantEq(sysUserNotice.tenantId, tenantId),
					isNull(sysUserNotice.deleteTime),
				),
			);

		const [notice] = await tx
			.select()
			.from(sysNotice)
			.where(
				and(
					eq(sysNotice.id, id),
					tenantEq(sysNotice.tenantId, tenantId),
					isNull(sysNotice.deleteTime),
				),
			);
		if (!notice) return undefined;

		const targetUserIds =
			notice.targetType === 2
				? notice.targetUserIds.split(",").filter(Boolean).map(Number)
				: undefined;

		const targetUsers = await tx
			.select({ id: sysUser.id })
			.from(sysUser)
			.where(
				and(
					isNull(sysUser.deleteTime),
					tenantEq(sysUser.tenantId, tenantId),
					...(targetUserIds ? [inArray(sysUser.id, targetUserIds)] : []),
				),
			);

		if (targetUsers.length > 0) {
			await tx.insert(sysUserNotice).values(
				targetUsers.map((u) => ({
					noticeId: id,
					userId: u.id,
					tenantId,
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
			.where(
				and(
					eq(sysNotice.id, id),
					tenantEq(sysNotice.tenantId, tenantId),
					isNull(sysNotice.deleteTime),
				),
			)
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
	tenantId: number,
	db: DB,
): Promise<NoticeRecord | undefined> => {
	return await db.transaction(async (tx) => {
		const now = new Date().toISOString();

		await tx
			.update(sysUserNotice)
			.set({ deleteTime: now })
			.where(
				and(
					eq(sysUserNotice.noticeId, id),
					tenantEq(sysUserNotice.tenantId, tenantId),
					isNull(sysUserNotice.deleteTime),
				),
			);

		const [updated] = await tx
			.update(sysNotice)
			.set({ publishStatus: -1, revokeTime: now })
			.where(
				and(
					eq(sysNotice.id, id),
					tenantEq(sysNotice.tenantId, tenantId),
					isNull(sysNotice.deleteTime),
				),
			)
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
	tenantId: number,
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
					tenantEq(sysUserNotice.tenantId, tenantId),
					isNull(sysUserNotice.deleteTime),
				),
			);
		const result = await tx
			.update(sysNotice)
			.set({ deleteTime: now })
			.where(
				and(
					inArray(sysNotice.id, ids),
					tenantEq(sysNotice.tenantId, tenantId),
					isNull(sysNotice.deleteTime),
				),
			)
			.returning({ id: sysNotice.id });
		return result.length;
	});
};

/**
 * 按 ID 查通知详情（LEFT JOIN sys_user 取发布人名称，软删过滤）
 *
 * 用于 GET /:id/detail 路由，返回含 publisherName 的完整详情。
 */
export const findNoticeDetailById = async (
	id: number,
	tenantId: number,
	db: DB,
): Promise<NoticeListRecord | undefined> => {
	const [row] = await db
		.select({ ...getColumns(sysNotice), publisherName: sysUser.nickname })
		.from(sysNotice)
		.leftJoin(sysUser, eq(sysNotice.publisherId, sysUser.id))
		.where(
			and(
				eq(sysNotice.id, id),
				tenantEq(sysNotice.tenantId, tenantId),
				isNull(sysNotice.deleteTime),
			),
		);
	return row;
};

/**
 * 置单条通知已读（更新 isRead=1 + readTime）
 *
 * 当前用户对该通知无 user_notice 记录时 UPDATE 影响 0 行，安全空操作。
 */
export const markNoticeAsRead = async (
	noticeId: number,
	userId: number,
	tenantId: number,
	db: DB,
): Promise<void> => {
	const now = new Date().toISOString();
	await db
		.update(sysUserNotice)
		.set({ isRead: 1, readTime: now })
		.where(
			and(
				eq(sysUserNotice.noticeId, noticeId),
				eq(sysUserNotice.userId, userId),
				tenantEq(sysUserNotice.tenantId, tenantId),
				isNull(sysUserNotice.deleteTime),
			),
		);
};

/**
 * 全部已读（当前用户所有未读 user_notice 一次性置 isRead=1）
 *
 * 对齐原 Java read-all 语义：与分页无关，直接更新当前用户全部未读记录。
 */
export const markAllNoticesAsRead = async (
	userId: number,
	tenantId: number,
	db: DB,
): Promise<void> => {
	const now = new Date().toISOString();
	await db
		.update(sysUserNotice)
		.set({ isRead: 1, readTime: now })
		.where(
			and(
				eq(sysUserNotice.userId, userId),
				tenantEq(sysUserNotice.tenantId, tenantId),
				eq(sysUserNotice.isRead, 0),
				isNull(sysUserNotice.deleteTime),
			),
		);
};

/**
 * 我的通知分页（INNER JOIN user_notice + LEFT JOIN sys_user，仅返回已发布通知）
 *
 * - INNER JOIN user_notice：只有物化给当前用户的通知才出现
 * - publishStatus=1 过滤：撤回/草稿对用户不可见
 * - 支持 isRead 过滤（0=未读 1=已读）和 title 模糊搜索
 */
export const findMyNotices = async (
	query: { pageNum: number; pageSize: number; title?: string; isRead?: number },
	userId: number,
	tenantId: number,
	db: DB,
): Promise<PageResult<MyNoticeRecord>> => {
	const where = [
		eq(sysUserNotice.userId, userId),
		tenantEq(sysUserNotice.tenantId, tenantId),
		isNull(sysUserNotice.deleteTime),
		eq(sysNotice.publishStatus, 1),
		isNull(sysNotice.deleteTime),
	];

	if (query.title) {
		where.push(like(sysNotice.title, `%${escapeLike(query.title)}%`));
	}
	if (query.isRead !== undefined) {
		where.push(eq(sysUserNotice.isRead, query.isRead));
	}

	const whereClause = and(...where);

	const list = await db
		.select({
			...getColumns(sysNotice),
			publisherName: sysUser.nickname,
			isRead: sysUserNotice.isRead,
		})
		.from(sysUserNotice)
		.innerJoin(sysNotice, eq(sysUserNotice.noticeId, sysNotice.id))
		.leftJoin(sysUser, eq(sysNotice.publisherId, sysUser.id))
		.where(whereClause)
		.orderBy(desc(sysUserNotice.id))
		.limit(query.pageSize)
		.offset((query.pageNum - 1) * query.pageSize);

	const [{ total = 0 } = {}] = await db
		.select({ total: count() })
		.from(sysUserNotice)
		.innerJoin(sysNotice, eq(sysUserNotice.noticeId, sysNotice.id))
		.where(whereClause);

	return { list, total };
};
