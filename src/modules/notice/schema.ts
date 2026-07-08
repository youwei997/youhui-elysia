import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { sysNotice } from "@/db/schema/system/notice";
import { createListQuery } from "@/lib/crud-dto";

/** 通知列表查询参数（支持标题模糊搜索、按发布状态/类型过滤） */
export const NoticeListQuery = createListQuery(sysNotice, {
	title: z.string().optional().describe("标题关键词（模糊匹配）"),
	publishStatus: z.coerce
		.number()
		.int()
		.optional()
		.describe("发布状态：0-草稿 1-已发布 -1-已撤回"),
	type: z.coerce.number().int().optional().describe("通知类型"),
}).describe("通知列表查询参数");

/** 通知响应（ omit 审计字段 + 发布人/时间由业务层按需填充） */
export const NoticeResponse = createSelectSchema(sysNotice)
	.omit({
		createdBy: true,
		updatedBy: true,
		deleteTime: true,
	})
	.describe("通知详情");

/** NoticeResponse.parse 的输入类型 */
export type NoticeResponseInput = z.input<typeof NoticeResponse>;

/** 新增通知请求体（默认草稿，publisherId 由路由从 JWT 写入） */
export const NoticeCreateBody = z
	.object({
		title: z.string().min(1).max(128).describe("公告标题"),
		content: z.string().min(1).max(5000).describe("公告内容"),
		type: z.coerce.number().int().default(0).describe("公告类型"),
		level: z.enum(["L", "M", "H"]).default("M").describe("公告等级：L/M/H"),
		targetType: z.coerce
			.number()
			.int()
			.default(1)
			.describe("目标类型：1-全部 2-指定"),
		targetUserIds: z
			.array(z.coerce.number())
			.optional()
			.describe(
				"指定用户 ID 数组（targetType=2 时传，queries 层 join 为逗号串入库）",
			),
	})
	.describe("创建通知请求体");

/** 更新通知请求体（仅草稿态可编辑） */
export const NoticeUpdateBody = z
	.object({
		title: z.string().min(1).max(128).optional().describe("公告标题"),
		content: z.string().min(1).max(5000).optional().describe("公告内容"),
		type: z.coerce.number().int().optional().describe("公告类型"),
		level: z.enum(["L", "M", "H"]).optional().describe("公告等级"),
		targetType: z.coerce
			.number()
			.int()
			.optional()
			.describe("目标类型：1-全部 2-指定"),
		targetUserIds: z
			.array(z.coerce.number())
			.optional()
			.describe("指定用户 ID 数组（queries 层 join 为逗号串入库）"),
	})
	.describe("更新通知请求体");

/** 通知 ID 路径参数 */
export const NoticeParamsWithId = z
	.object({ id: z.coerce.number() })
	.describe("通知 ID");

/** 通知 ID 批量路径参数（逗号分隔） */
export const NoticeParamsWithCommaIds = z
	.object({ ids: z.string() })
	.describe("通知 ID（逗号分隔批量）");
