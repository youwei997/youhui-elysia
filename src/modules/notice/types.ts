import type { sysNotice } from "@/db/schema/system/notice";

/** sys_notice 表原始记录类型 */
export type NoticeRecord = typeof sysNotice.$inferSelect;

/**
 * 通知列表查询结果行类型
 *
 * 在 sys_notice 全字段基础上附加发布人名称（JOIN sys_user 聚合）。
 */
export type NoticeListRecord = NoticeRecord & {
	publisherName: string | null;
};

/**
 * 我的通知查询结果行类型
 *
 * 在 NoticeListRecord 基础上附加 isRead（来自 INNER JOIN sys_user_notice）。
 */
export type MyNoticeRecord = NoticeListRecord & {
	isRead: number;
};
