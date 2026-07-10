import { Elysia } from "elysia";
import { db } from "@/db/client";
import { ERR_CODE, notFound } from "@/lib/errors";
import { authPlugin } from "@/plugins/auth";
import {
	batchSoftDeleteNotices,
	createNotice,
	findNoticeById,
	findNotices,
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

export const noticeRoutes = new Elysia({ prefix: "/api/v1/notices" })
	.use(authPlugin)
	.get(
		"/",
		async ({ query }) => {
			const result = await findNotices(query, db);
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
		async ({ params }) => {
			const row = await findNoticeById(params.id, db);
			if (!row) throw notFound(ERR_CODE.NOTICE_NOT_FOUND);
			return parseNotice(row);
		},
		{
			auth: true,
			requirePerm: ["sys:notice:list"],
			params: NoticeParamsWithId,
			detail: {
				tags: ["Notice"],
				summary: "通知公告表单数据",
				description: "编辑通知时回填表单",
			},
		},
	)
	.post(
		"/",
		async ({ body }) => {
			const row = await createNotice(body, db);
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
		"/:id",
		async ({ params, body }) => {
			const existing = await findNoticeById(params.id, db);
			if (!existing) throw notFound(ERR_CODE.NOTICE_NOT_FOUND);
			const row = await updateNotice(params.id, body, db);
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
	.delete(
		"/:ids",
		async ({ params }) => {
			// 前端批量删传 "1,2,3"，单条传 "1"；schema 已保证纯数字，直接 split
			const ids = params.ids.split(",").map(Number);
			const deleted = await batchSoftDeleteNotices(ids, db);
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
