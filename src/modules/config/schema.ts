import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { sysConfig } from "@/db/schema/system/config";
import { pageFields } from "@/lib/pagination";

/** 配置列表查询参数（支持关键词模糊匹配 configName/configKey） */
export const ConfigListQuery = z
	.object({
		...pageFields,
		keywords: z
			.string()
			.optional()
			.describe("搜索关键词（模糊匹配 configName/configKey）"),
	})
	.describe("配置列表查询参数");

/** 配置详情/表单响应（保留 remark） */
export const ConfigResponse = createSelectSchema(sysConfig)
	.omit({
		createdBy: true,
		updatedBy: true,
		deleteTime: true,
	})
	.describe("配置详情");

/** ConfigResponse.parse 的输入类型 */
export type ConfigResponseInput = z.input<typeof ConfigResponse>;

/** 配置列表响应（不含 remark） */
export const ConfigListResponse = ConfigResponse.omit({
	remark: true,
}).describe("配置列表项");

/** ConfigListResponse.parse 的输入类型 */
export type ConfigListResponseInput = z.input<typeof ConfigListResponse>;

/** 新增配置请求体 */
export const ConfigCreateBody = z
	.object({
		configName: z.string().min(1).max(128).describe("配置名称"),
		configKey: z.string().min(1).max(128).describe("配置键"),
		configValue: z.string().max(2000).describe("配置值"),
		remark: z.string().max(255).optional().describe("备注"),
	})
	.describe("创建配置请求体");

/** 更新配置请求体 */
export const ConfigUpdateBody = z
	.object({
		configName: z.string().min(1).max(128).optional().describe("配置名称"),
		configKey: z.string().min(1).max(128).optional().describe("配置键"),
		configValue: z.string().max(2000).optional().describe("配置值"),
		remark: z.string().max(255).optional().describe("备注"),
	})
	.describe("更新配置请求体");

/** 配置 ID 路径参数 */
export const ConfigParamsWithId = z
	.object({ id: z.coerce.number() })
	.describe("配置 ID 路径参数");
