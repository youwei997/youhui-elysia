import { createInsertSchema, createUpdateSchema } from "drizzle-orm/zod";
import type { z } from "zod";
import { sysDept } from "@/db/schema/system/dept";

/**
 * 审计列黑名单：禁止前端通过请求体篡改
 */
const auditKeys = {
	id: true,
	createdBy: true,
	createdAt: true,
	updatedBy: true,
	updatedAt: true,
	deletedAt: true,
} as const;

/**
 * 创建部门请求体
 * treePath 由 queries 层自动计算，不暴露给前端
 */
export const DeptCreateBody = createInsertSchema(sysDept, {
	name: (s) => s.min(1, "部门名称不能为空").describe("部门名称"),
	code: (s) => s.min(1, "部门编码不能为空").describe("部门编码"),
	parentId: (s) => s.describe("父部门 ID，0 表示顶级"),
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
	parentId: (s) => s.describe("父部门 ID，0 表示顶级"),
	sort: (s) => s.describe("排序"),
	status: (s) => s.describe("状态：1=正常 0=停用"),
})
	.omit({ ...auditKeys, treePath: true })
	.describe("更新部门请求参数");

export type DeptCreateBody = z.infer<typeof DeptCreateBody>;
export type DeptUpdateBody = z.infer<typeof DeptUpdateBody>;
