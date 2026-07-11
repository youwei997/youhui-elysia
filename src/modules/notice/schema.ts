import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { sysNotice } from "@/db/schema/system/notice";
import { createListQuery } from "@/lib/crud-dto";

/** 发布状态枚举约束：0=草稿 1=已发布 -1=已撤回 */
const publishStatusSchema = z.coerce
	.number()
	.int()
	.refine((v) => v === 0 || v === 1 || v === -1, {
		message: "发布状态必须是 0、1 或 -1",
	});

/** 目标类型枚举约束：1=全部 2=指定 */
const targetTypeSchema = z.coerce
	.number()
	.int()
	.refine((v) => v === 1 || v === 2, {
		message: "目标类型必须是 1（全部）或 2（指定）",
	});

/** 通知列表查询参数（支持标题模糊搜索、按发布状态/类型过滤） */
export const NoticeListQuery = createListQuery(sysNotice, {
	title: z.string().optional().describe("标题关键词（模糊匹配）"),
	publishStatus: publishStatusSchema.optional().describe("发布状态"),
	type: z.coerce.number().int().optional().describe("通知类型"),
	isRead: z.coerce
		.number()
		.int()
		.optional()
		.describe("是否已读（0=未读 1=已读，仅 /my 接口使用）"),
}).describe("通知列表查询参数");

/** 通知响应（ omit 审计字段 + publisherName 由 JOIN sys_user 派生，列表/详情/我的通知共用） */
export const NoticeResponse = createSelectSchema(sysNotice)
	.omit({
		createdBy: true,
		updatedBy: true,
		deleteTime: true,
	})
	.extend({
		/** 发布人昵称（LEFT JOIN sys_user.nickname，草稿态发布人为空时为 null） */
		publisherName: z.string().nullable().optional(),
	})
	.describe("通知详情");

/** NoticeResponse.parse 的输入类型 */
export type NoticeResponseInput = z.input<typeof NoticeResponse>;

/** 新增通知请求体（默认草稿，发布人/发布时间在发布动作中写入） */
export const NoticeCreateBody = z
	.object({
		title: z.string().min(1).max(128).describe("公告标题"),
		content: z.string().min(1).max(5000).describe("公告内容"),
		type: z.coerce.number().int().default(0).describe("公告类型"),
		level: z.enum(["L", "M", "H"]).default("L").describe("公告等级：L/M/H"),
		targetType: targetTypeSchema.default(1).describe("目标类型"),
		targetUserIds: z
			.array(z.coerce.number().int())
			.optional()
			.describe(
				"指定用户 ID 数组（targetType=2 时传，queries 层 join 为逗号串入库）",
			),
	})
	.describe("创建通知请求体")
	.refine(
		(v) =>
			v.targetType !== 2 ||
			(v.targetUserIds != null && v.targetUserIds.length > 0),
		{
			message: "targetType=2（指定）时 targetUserIds 不能为空",
			path: ["targetUserIds"],
		},
	);

/** 更新通知请求体（仅已发布态 publishStatus=1 不可编辑，草稿/已撤回可编辑，与前端 index.vue `publishStatus != 1` 一致） */
export const NoticeUpdateBody = z
	.object({
		title: z.string().min(1).max(128).optional().describe("公告标题"),
		content: z.string().min(1).max(5000).optional().describe("公告内容"),
		type: z.coerce.number().int().optional().describe("公告类型"),
		level: z.enum(["L", "M", "H"]).optional().describe("公告等级"),
		targetType: targetTypeSchema.optional().describe("目标类型"),
		targetUserIds: z
			.array(z.coerce.number().int())
			.optional()
			.describe("指定用户 ID 数组（queries 层 join 为逗号串入库）"),
	})
	.describe("更新通知请求体")
	.refine(
		(v) =>
			v.targetType !== 2 ||
			(v.targetUserIds != null && v.targetUserIds.length > 0),
		{
			message: "targetType=2（指定）时 targetUserIds 不能为空",
			path: ["targetUserIds"],
		},
	);

/** 通知 ID 路径参数 */
export const NoticeParamsWithId = z
	.object({ id: z.coerce.number() })
	.describe("通知 ID");

/** 通知 ID 批量路径参数（逗号分隔的纯数字串，非法段整串拒绝，不静默过滤） */
export const NoticeParamsWithCommaIds = z
	.object({
		ids: z
			.string()
			.regex(/^\d+(,\d+)*$/, "ids 必须是逗号分隔的数字（如 1 或 1,2,3）"),
	})
	.describe("通知 ID（逗号分隔批量）");
