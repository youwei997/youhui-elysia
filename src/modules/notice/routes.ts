import { Elysia } from "elysia";
import { db } from "@/db/client";
import { BizError, ERR_CODE, notFound, unauthorized } from "@/lib/errors";
import { broadcast } from "@/modules/sse/registry";
import { authPlugin } from "@/plugins/auth";
import {
	batchSoftDeleteNotices,
	createNotice,
	findMyNotices,
	findNoticeById,
	findNoticeDetailById,
	findNotices,
	markAllNoticesAsRead,
	markNoticeAsRead,
	publishNotice,
	revokeNotice,
	updateNotice,
} from "./queries";
import {
	NoticeCreateBody,
	NoticeListQuery,
	NoticeParamsWithCommaIds,
	NoticeParamsWithId,
	NoticeResponse,
	type NoticeResponseInput,
	NoticeUpdateBody,
} from "./schema";

/**
 * 响应转换：parse + bigint id 转 string（列表/详情/表单共用）
 *
 * id、publisherId 均为 bigint，JS number 超 2^53 会丢精度，统一转 string 交前端。
 * 草稿态 publisherId 为空 → 返回 null。
 */
const parseNotice = (row: NoticeResponseInput) => {
	const parsed = NoticeResponse.parse(row);
	return {
		...parsed,
		id: String(parsed.id),
		publisherId: parsed.publisherId == null ? null : String(parsed.publisherId),
	};
};

const parseMyNotice = (row: NoticeResponseInput & { isRead: number }) => ({
	...parseNotice(row),
	isRead: row.isRead,
});

export const noticeRoutes = new Elysia({ prefix: "/api/v1/notices" })
	.use(authPlugin)
	.get(
		"/my",
		async ({ query, user }) => {
			if (!user) throw unauthorized();
			const result = await findMyNotices(
				query,
				Number(user.sub),
				user.tenantId,
				db,
			);
			return {
				...result,
				list: result.list.map((n) => parseMyNotice(n)),
			};
		},
		{
			auth: true,
			query: NoticeListQuery,
			detail: {
				tags: ["Notice"],
				summary: "我的通知（分页）",
				description:
					"仅返回已发布且物化给当前用户的通知，支持 isRead 过滤和 title 模糊搜索",
			},
		},
	)
	.get(
		"/",
		async ({ query, user }) => {
			if (!user) throw unauthorized();
			const result = await findNotices(query, user.tenantId, db);
			return {
				...result,
				list: result.list.map((n) => parseNotice(n)),
			};
		},
		{
			auth: true,
			requirePerm: ["sys:notice:list"],
			query: NoticeListQuery,
			detail: {
				tags: ["Notice"],
				summary: "通知公告列表（分页）",
				description: "支持标题模糊搜索、按发布状态/类型过滤，JOIN 取发布人昵称",
			},
		},
	)
	.get(
		"/:id/form",
		async ({ params, user }) => {
			if (!user) throw unauthorized();
			const row = await findNoticeById(params.id, user.tenantId, db);
			if (!row) throw notFound(ERR_CODE.NOTICE_NOT_FOUND);
			return parseNotice(row);
		},
		{
			auth: true,
			requirePerm: ["sys:notice:update"],
			params: NoticeParamsWithId,
			detail: {
				tags: ["Notice"],
				summary: "通知公告表单数据",
				description: "编辑通知时回填表单",
			},
		},
	)
	.get(
		"/:id/detail",
		async ({ params, user }) => {
			if (!user) throw unauthorized();
			const row = await findNoticeDetailById(params.id, user.tenantId, db);
			if (!row) throw notFound(ERR_CODE.NOTICE_NOT_FOUND);
			await markNoticeAsRead(params.id, Number(user.sub), user.tenantId, db);
			return parseNotice(row);
		},
		{
			auth: true,
			params: NoticeParamsWithId,
			detail: {
				tags: ["Notice"],
				summary: "查看通知详情（顺带置已读）",
				description:
					"返回含发布人名称的详情；当前用户有对应 user_notice 时自动置 isRead=1",
			},
		},
	)
	.post(
		"/",
		async ({ body, user }) => {
			if (!user) throw unauthorized();
			const row = await createNotice(body, user.tenantId, db);
			return parseNotice(row);
		},
		{
			auth: true,
			requirePerm: ["sys:notice:create"],
			audit: "notice:create",
			body: NoticeCreateBody,
			detail: {
				tags: ["Notice"],
				summary: "创建通知公告",
				description:
					"默认存草稿（publishStatus=0），发布人/发布时间由发布动作写入",
			},
		},
	)
	.put(
		"/read-all",
		async ({ user }) => {
			if (!user) throw unauthorized();
			await markAllNoticesAsRead(Number(user.sub), user.tenantId, db);
			return true;
		},
		{
			auth: true,
			audit: "notice:read-all",
			detail: {
				tags: ["Notice"],
				summary: "全部已读",
				description: "将当前用户所有未读 user_notice 置 isRead=1",
			},
		},
	)
	.put(
		"/:id",
		async ({ params, body, user }) => {
			if (!user) throw unauthorized();
			const existing = await findNoticeById(params.id, user.tenantId, db);
			if (!existing) throw notFound(ERR_CODE.NOTICE_NOT_FOUND);
			const row = await updateNotice(params.id, body, user.tenantId, db);
			if (!row) throw notFound(ERR_CODE.NOTICE_NOT_FOUND);
			return parseNotice(row);
		},
		{
			auth: true,
			requirePerm: ["sys:notice:update"],
			audit: "notice:update",
			params: NoticeParamsWithId,
			body: NoticeUpdateBody,
			detail: {
				tags: ["Notice"],
				summary: "更新通知公告",
				description: "仅草稿/已撤回态可编辑，前端对已发布行隐藏编辑入口",
			},
		},
	)
	.put(
		"/:id/publish",
		async ({ params, user }) => {
			if (!user) throw unauthorized();
			const existing = await findNoticeById(params.id, user.tenantId, db);
			if (!existing) throw notFound(ERR_CODE.NOTICE_NOT_FOUND);
			if (existing.publishStatus === 1) {
				throw new BizError(ERR_CODE.NOTICE_ALREADY_PUBLISHED);
			}
			const row = await publishNotice(
				params.id,
				Number(user.sub),
				user.tenantId,
				db,
			);
			if (!row) throw notFound(ERR_CODE.NOTICE_NOT_FOUND);
			// 广播实时通知（broadcast 内部按连接 try/catch 隔离，不会抛错阻断发布结果）
			// id 统一 String（对齐 notice 前端 id 约定，避免 bigint 精度丢失）；
			// publishTime 显式 toISOString（timestamptz 回读为 PG 文本格式，非 ISO）
			broadcast("notice", {
				id: String(row.id),
				title: row.title,
				type: row.type,
				publishTime: row.publishTime
					? new Date(row.publishTime).toISOString()
					: null,
			});
			return parseNotice(row);
		},
		{
			auth: true,
			requirePerm: ["sys:notice:publish"],
			audit: "notice:publish",
			params: NoticeParamsWithId,
			detail: {
				tags: ["Notice"],
				summary: "发布通知公告",
				description:
					"已发布不可重发；按 targetType 物化 sys_user_notice（全部/指定用户）",
			},
		},
	)
	.put(
		"/:id/revoke",
		async ({ params, user }) => {
			if (!user) throw unauthorized();
			const existing = await findNoticeById(params.id, user.tenantId, db);
			if (!existing) throw notFound(ERR_CODE.NOTICE_NOT_FOUND);
			if (existing.publishStatus !== 1) {
				throw new BizError(ERR_CODE.NOTICE_NOT_PUBLISHED);
			}
			const row = await revokeNotice(params.id, user.tenantId, db);
			if (!row) throw notFound(ERR_CODE.NOTICE_NOT_FOUND);
			// 广播撤回，前端按 id 从列表移除 + 未读 -1（撤回只关心 id）
			broadcast("notice-revoke", { id: String(row.id) });
			return parseNotice(row);
		},
		{
			auth: true,
			requirePerm: ["sys:notice:revoke"],
			audit: "notice:revoke",
			params: NoticeParamsWithId,
			detail: {
				tags: ["Notice"],
				summary: "撤回通知公告",
				description: "仅已发布可撤回；撤回后清空对应 sys_user_notice",
			},
		},
	)
	.delete(
		"/:ids",
		async ({ params, user }) => {
			if (!user) throw unauthorized();
			// 前端批量删传 "1,2,3"，单条传 "1"；schema 已保证纯数字，直接 split
			const ids = params.ids.split(",").map(Number);
			const deleted = await batchSoftDeleteNotices(ids, user.tenantId, db);
			// 0 条命中说明目标全部不存在或已软删，视为无效删除，避免前端误判成功
			if (deleted === 0) throw notFound(ERR_CODE.NOTICE_NOT_FOUND);
			return true;
		},
		{
			auth: true,
			requirePerm: ["sys:notice:delete"],
			audit: "notice:delete",
			params: NoticeParamsWithCommaIds,
			detail: {
				tags: ["Notice"],
				summary: "删除通知公告",
				description:
					"支持单条 ID 或逗号分隔的批量 ID，软删并级联软删 sys_user_notice",
			},
		},
	);
