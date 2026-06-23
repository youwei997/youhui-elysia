import { Elysia } from "elysia";
import { z } from "zod";
import { db } from "@/db/client";
import { buildTree } from "@/db/helpers/tree";
import { BizError, ERR_CODE, notFound } from "@/lib/errors";
import { authPlugin } from "@/plugins/auth";
import {
	createDept,
	findAllDepts,
	findDeptById,
	isDeptUsedByUsers,
	isParentIdCyclic,
	softDeleteDept,
	updateDept,
} from "./queries";
import { DeptCreateBody, DeptUpdateBody } from "./schema";

/** 路径参数 id 校验 */
const ParamsWithId = z.object({ id: z.coerce.number() });

export const deptRoutes = new Elysia({ prefix: "/depts", name: "dept" })
	.use(authPlugin)
	.get(
		"/tree",
		async () => {
			const list = await findAllDepts(db);
			// 过滤掉 parentId 为 null 的脏数据，确保 buildTree 类型安全
			const validList = list.filter(
				(item): item is typeof item & { parentId: number } =>
					item.parentId !== null,
			);
			return buildTree(validList);
		},
		{
			auth: true,
			detail: {
				tags: ["Dept"],
				summary: "获取部门树",
			},
		},
	)
	.get(
		"/:id",
		async ({ params }) => {
			const dept = await findDeptById(db, params.id);
			// 部门不存在或已删除：返回 404
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
	.post(
		"/",
		async ({ body }) => {
			// 指定了父部门时检查父是否存在
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
			},
		},
	)
	.put(
		"/:id",
		async ({ params, body }) => {
			const existing = await findDeptById(db, params.id);
			// 部门不存在或已删除：返回 404
			if (!existing) {
				throw notFound(ERR_CODE.DEPT_NOT_FOUND);
			}

			// 指定了父部门时检查父是否存在
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

			// 防循环校验：更新时如果改了 parentId，检查是否形成循环
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
			// 更新失败（不应该走到这里，除非并发删除）：返回 404
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
			},
		},
	)
	.delete(
		"/:id",
		async ({ params }) => {
			const existing = await findDeptById(db, params.id);
			// 部门不存在或已删除：返回 404
			if (!existing) {
				throw notFound(ERR_CODE.DEPT_NOT_FOUND);
			}

			// 检查是否被用户引用：有用户归属此部门时禁止删除
			const inUse = await isDeptUsedByUsers(db, params.id);
			if (inUse) {
				throw new BizError(ERR_CODE.DEPT_HAS_USERS, "部门下存在用户，无法删除");
			}

			const count = await softDeleteDept(db, params.id);
			return { deletedCount: count };
		},
		{
			auth: true,
			params: ParamsWithId,
			detail: {
				tags: ["Dept"],
				summary: "删除部门（级联删除子部门）",
			},
		},
	);
