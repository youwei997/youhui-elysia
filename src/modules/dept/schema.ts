import {
	createInsertSchema,
	createSelectSchema,
	createUpdateSchema,
} from "drizzle-orm/zod";
import { z } from "zod";
import { sysDept } from "@/db/schema/system/dept";
import { auditKeys } from "@/lib/crud-dto";

/**
 * 创建部门请求体
 * treePath 由 queries 层自动计算，不暴露给前端
 */
export const DeptCreateBody = createInsertSchema(sysDept, {
	name: (s) => s.min(1, "部门名称不能为空").describe("部门名称"),
	code: (s) => s.min(1, "部门编码不能为空").describe("部门编码"),
	parentId: () => z.coerce.number().describe("父部门 ID，0 表示顶级"),
	sort: (s) => s.describe("排序"),
	status: (s) => s.describe("状态：1=正常 0=停用"),
})
	.omit({ ...auditKeys, treePath: true })
	.describe("创建部门请求参数");

/**
 * 更新部门请求体
 * 排除 id（路径参数）、treePath（自动计算）、审计列
 */
export const DeptUpdateBody = createUpdateSchema(sysDept, {
	name: (s) => s.min(1, "部门名称不能为空").describe("部门名称"),
	code: (s) => s.min(1, "部门编码不能为空").describe("部门编码"),
	parentId: () => z.coerce.number().describe("父部门 ID，0 表示顶级"),
	sort: (s) => s.describe("排序"),
	status: (s) => s.describe("状态：1=正常 0=停用"),
})
	.omit({ ...auditKeys, treePath: true })
	.describe("更新部门请求参数");

/** 部门列表查询参数（树形列表，无分页） */
export const DeptListQuery = z
	.object({
		keywords: z.string().optional().describe("搜索关键字"),
		status: z.coerce.number().optional().describe("状态：1=正常 0=停用"),
	})
	.describe("部门列表查询参数");

/** 部门 ID 路径参数（coerce.number 将字符串转数字） */
export const DeptParamsWithId = z
	.object({ id: z.coerce.number() })
	.describe("部门 ID 路径参数");

/** DELETE 专用：接受原始字符串（支持 "1" 和 "1,2,3" 两种形式） */
export const DeptParamsWithCommaIds = z
	.object({ id: z.string() })
	.describe("部门 ID 路径参数（逗号分隔批量）");

/** 部门响应：排除软删标志、treePath、创建人/更新人，保留创建/更新时间 */
export const DeptResponse = createSelectSchema(sysDept)
	.omit({
		deletedAt: true,
		treePath: true,
		createdBy: true,
		updatedBy: true,
	})
	.describe("部门信息");

export type DeptCreateBody = z.infer<typeof DeptCreateBody>;
export type DeptUpdateBody = z.infer<typeof DeptUpdateBody>;
export type DeptListQuery = z.infer<typeof DeptListQuery>;
