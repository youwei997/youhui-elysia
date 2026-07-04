import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { sysDict } from "@/db/schema/system/dict";
import { sysDictItem } from "@/db/schema/system/dict-item";
import { createListQuery } from "@/lib/crud-dto";

// ── 字典类型 ──

/** 字典类型列表查询参数（前端用 keywords 模糊匹配 type/name） */
export const DictListQuery = createListQuery(sysDict, {
	keywords: z.string().optional().describe("搜索关键词（模糊匹配 type/name）"),
	status: z.coerce.number().int().optional().describe("状态：1-启用 0-禁用"),
}).describe("字典类型列表查询参数");

/** 字典类型响应 */
export const DictResponse = createSelectSchema(sysDict)
	.omit({
		createdBy: true,
		updatedBy: true,
		deleteTime: true,
	})
	.describe("字典类型信息");

/** DictResponse.parse 的输入类型 */
export type DictResponseInput = z.input<typeof DictResponse>;

/** 字典类型新增 body（前端传 dictCode，后端存 type，两者皆可） */
export const DictCreateBody = z
	.object({
		type: z
			.string()
			.min(1)
			.max(64)
			.optional()
			.describe("字典类型标识（后端字段）"),
		dictCode: z
			.string()
			.min(1)
			.max(64)
			.optional()
			.describe("字典类型标识（前端字段）"),
		name: z.string().min(1).max(64).describe("字典名称"),
		status: z.coerce.number().int().default(1).describe("状态：1-启用 0-禁用"),
	})
	.describe("创建字典类型请求体");

/** 字典类型更新 body */
export const DictUpdateBody = z
	.object({
		name: z.string().min(1).max(64).optional().describe("字典名称"),
		status: z.coerce.number().int().optional().describe("状态：1-启用 0-禁用"),
	})
	.describe("更新字典类型请求体");

// ── 字典项 ──

/** 字典项列表查询参数 */
export const DictItemListQuery = z
	.object({
		pageNum: z.coerce.number().int().default(1).describe("页码"),
		pageSize: z.coerce.number().int().max(100).default(20).describe("每页条数"),
		keywords: z
			.string()
			.optional()
			.describe("搜索关键词（模糊匹配 label/value）"),
		status: z.coerce.number().int().optional().describe("状态：1-启用 0-禁用"),
	})
	.describe("字典项列表查询参数");

/** 字典项响应 */
export const DictItemResponse = createSelectSchema(sysDictItem)
	.omit({
		createdBy: true,
		updatedBy: true,
		deleteTime: true,
	})
	.describe("字典项信息");

/** DictItemResponse.parse 的输入类型 */
export type DictItemResponseInput = z.input<typeof DictItemResponse>;

/** 字典项新增 body */
export const DictItemCreateBody = z
	.object({
		label: z.string().min(1).max(128).describe("字典项标签"),
		value: z.string().min(1).max(128).describe("字典项值"),
		sort: z.coerce.number().int().default(0).describe("排序号"),
		status: z.coerce.number().int().default(1).describe("状态：1-启用 0-禁用"),
		tagType: z.string().max(8).default("N").describe("标签类型：N/P/S/W/I/D"),
	})
	.describe("创建字典项请求体");

/** 字典项更新 body */
export const DictItemUpdateBody = z
	.object({
		label: z.string().min(1).max(128).optional().describe("字典项标签"),
		value: z.string().min(1).max(128).optional().describe("字典项值"),
		sort: z.coerce.number().int().optional().describe("排序号"),
		status: z.coerce.number().int().optional().describe("状态：1-启用 0-禁用"),
		tagType: z.string().max(8).optional().describe("标签类型：N/P/S/W/I/D"),
	})
	.describe("更新字典项请求体");

// ── 通用参数 ──

/** 字典类型 ID 路径参数 */
export const DictParamsWithId = z
	.object({ id: z.coerce.number() })
	.describe("字典类型 ID");

/** 字典项 ID 路径参数 */
export const DictItemParamsWithId = z
	.object({ itemId: z.coerce.number() })
	.describe("字典项 ID");

/** 字典类型标识路径参数（供 /dicts/:type/items 查询） */
export const DictTypeParam = z
	.object({ type: z.string().max(64) })
	.describe("字典类型标识");
