import { Elysia } from "elysia";
import { z } from "zod";
import { db } from "@/db/client";
import { buildTree } from "@/db/helpers/tree";
import { BizError, ERR_CODE, notFound } from "@/lib/errors";
import { authPlugin } from "@/plugins/auth";
import {
	batchSoftDeleteDepts,
	createDept,
	findAllDepts,
	findDeptById,
	isDeptUsedByUsers,
	isParentIdCyclic,
	softDeleteDept,
	updateDept,
} from "./queries";
import { DeptCreateBody, DeptUpdateBody } from "./schema";

/** 路径参数 id 校验（coerce.number 将字符串转数字） */
const ParamsWithId = z.object({ id: z.coerce.number() });

/** DELETE 专用：接受原始字符串（支持 "1" 和 "1,2,3" 两种形式） */
const ParamsWithCommaIds = z.object({ id: z.string() });

export const deptRoutes = new Elysia({ prefix: "/api/v1/depts" })
	.use(authPlugin)
	.get(
		"/",
		async ({ query }) => {
			const list = await findAllDepts(db, query);
			const validList = list.filter(
				(item): item is typeof item & { parentId: number } =>
					item.parentId !== null,
			);
			return buildTree(validList);
		},
		{
			auth: true,
			query: z.object({
				keywords: z.string().optional().describe("搜索关键字"),
				status: z.coerce.number().optional().describe("状态：1=正常 0=停用"),
			}),
			detail: {
				tags: ["Dept"],
				summary: "获取部门树形列表",
				description: "返回完整部门树，支持关键字模糊搜索和状态筛选",
			},
		},
	)
	.get(
		"/options",
		async () => {
			const list = await findAllDepts(db);
			return list.map((item) => ({
				value: String(item.id),
				label: item.name,
			}));
		},
		{
			auth: true,
			detail: {
				tags: ["Dept"],
				summary: "部门下拉选项",
				description: "返回 { value, label }[] 供前端下拉选择器使用",
			},
		},
	)
	.get(
		"/:id",
		async ({ params }) => {
			const dept = await findDeptById(db, params.id);
			if (!dept) {
				throw notFound(ERR_CODE.DEPT_NOT_FOUND);
			}
			return dept;
		},
		{
			auth: true,
			params: ParamsWithId,
			detail: {
				tags: ["Dept"],
				summary: "获取部门详情",
			},
		},
	)
	.get(
		"/:id/form",
		async ({ params }) => {
			const dept = await findDeptById(db, params.id);
			if (!dept) {
				throw notFound(ERR_CODE.DEPT_NOT_FOUND);
			}
			return dept;
		},
		{
			auth: true,
			params: ParamsWithId,
			detail: {
				tags: ["Dept"],
				summary: "获取部门表单数据",
				description: "编辑部门时回填表单",
			},
		},
	)
	.post(
		"/",
		async ({ body }) => {
			if (body.parentId && body.parentId !== 0) {
				const parent = await findDeptById(db, body.parentId);
				if (!parent) {
					throw notFound(ERR_CODE.DEPT_NOT_FOUND);
				}
			}
			return await createDept(db, body);
		},
		{
			auth: true,
			body: DeptCreateBody,
			detail: {
				tags: ["Dept"],
				summary: "创建部门",
				description: "新增部门，treePath 由服务端根据 parentId 自动计算",
			},
		},
	)
	.put(
		"/:id",
		async ({ params, body }) => {
			const existing = await findDeptById(db, params.id);
			if (!existing) {
				throw notFound(ERR_CODE.DEPT_NOT_FOUND);
			}
			if (
				body.parentId !== undefined &&
				body.parentId !== null &&
				body.parentId !== 0
			) {
				const parent = await findDeptById(db, body.parentId);
				if (!parent) {
					throw notFound(ERR_CODE.DEPT_NOT_FOUND);
				}
			}
			if (body.parentId !== undefined && body.parentId !== null) {
				const cyclic = await isParentIdCyclic(db, params.id, body.parentId);
				if (cyclic) {
					throw new BizError(
						ERR_CODE.DEPT_PARENT_CYCLE,
						"不能将部门移动到自己的子部门下",
					);
				}
			}
			const updated = await updateDept(db, params.id, body);
			if (!updated) {
				throw notFound(ERR_CODE.DEPT_NOT_FOUND);
			}
			return updated;
		},
		{
			auth: true,
			params: ParamsWithId,
			body: DeptUpdateBody,
			detail: {
				tags: ["Dept"],
				summary: "更新部门",
				description:
					"部分字段更新，parentId 变更时自动重算 treePath，级联更新子树，禁止循环引用",
			},
		},
	)
	.delete(
		"/:id",
		async ({ params }) => {
			const idStr = params.id;
			if (idStr.includes(",")) {
				const ids = idStr
					.split(",")
					.map((s) => Number(s.trim()))
					.filter((n) => !Number.isNaN(n));
				if (ids.length === 0) {
					throw notFound(ERR_CODE.DEPT_NOT_FOUND);
				}
				for (const id of ids) {
					const existing = await findDeptById(db, id);
					if (!existing) {
						throw notFound(ERR_CODE.DEPT_NOT_FOUND);
					}
					const inUse = await isDeptUsedByUsers(db, id);
					if (inUse) {
						throw new BizError(
							ERR_CODE.DEPT_HAS_USERS,
							"部门下存在用户，无法删除",
						);
					}
				}
				return await batchSoftDeleteDepts(db, ids);
			}
			const id = Number(idStr);
			if (Number.isNaN(id)) {
				throw notFound(ERR_CODE.DEPT_NOT_FOUND);
			}
			const existing = await findDeptById(db, id);
			if (!existing) {
				throw notFound(ERR_CODE.DEPT_NOT_FOUND);
			}
			const inUse = await isDeptUsedByUsers(db, id);
			if (inUse) {
				throw new BizError(ERR_CODE.DEPT_HAS_USERS, "部门下存在用户，无法删除");
			}
			const count = await softDeleteDept(db, id);
			return { deletedCount: count };
		},
		{
			auth: true,
			params: ParamsWithCommaIds,
			detail: {
				tags: ["Dept"],
				summary: "删除部门（级联删除子部门，支持批量）",
				description:
					"单条：DELETE /api/v1/depts/1；批量：DELETE /api/v1/depts/1,2,3。删除时清理 sys_role_dept 关联",
			},
		},
	);
