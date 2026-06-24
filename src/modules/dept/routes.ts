import { type TreeNode, buildTree } from "@/db/helpers/tree";
import { Elysia } from "elysia";
import { db } from "@/db/client";
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
import {
	DeptCreateBody,
	DeptListQuery,
	DeptParamsWithCommaIds,
	DeptParamsWithId,
	DeptResponse,
	DeptUpdateBody,
} from "./schema";

export const deptRoutes = new Elysia({ prefix: "/api/v1/depts" })
	.use(authPlugin)
	.get(
		"/",
		async ({ query }) => {
			const list = await findAllDepts(query, db);
			const validList = list.filter(
				(item): item is typeof item & { parentId: number } =>
					item.parentId !== null,
			);
			return buildTree(validList);
		},
		{
			auth: true,
			perm: ["sys:dept:list"],
			query: DeptListQuery,
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
			const list = await findAllDepts({}, db);
			const validList = list.filter(
				(item): item is typeof item & { parentId: number } =>
					item.parentId !== null,
			);
			const tree = buildTree(validList);

			/** 递归将树形节点映射为 { value, label, children? } 选项格式 */
			const toOptions = (
				nodes: TreeNode<(typeof validList)[number]>[],
			): { value: string; label: string; children?: unknown[] }[] => {
				return nodes.map((node) => {
					const option: {
						value: string;
						label: string;
						children?: unknown[];
					} = {
						value: String(node.id),
						label: node.name,
					};
					if (node.children.length > 0) {
						option.children = toOptions(node.children);
					}
					return option;
				});
			};

			return toOptions(tree);
		},
		{
			auth: true,
			perm: ["sys:dept:list"],
			detail: {
				tags: ["Dept"],
				summary: "部门下拉选项",
				description: "返回嵌套树形 { value, label, children? }[] 供前端级联选择器使用",
			},
		},
	)
	.get(
		"/:id",
		async ({ params }) => {
			const dept = await findDeptById(params.id, db);
			if (!dept) {
				throw notFound(ERR_CODE.DEPT_NOT_FOUND);
			}
			return DeptResponse.parse(dept);
		},
		{
			auth: true,
			perm: ["sys:dept:list"],
			params: DeptParamsWithId,
			detail: {
				tags: ["Dept"],
				summary: "获取部门详情",
			},
		},
	)
	.get(
		"/:id/form",
		async ({ params }) => {
			const dept = await findDeptById(params.id, db);
			if (!dept) {
				throw notFound(ERR_CODE.DEPT_NOT_FOUND);
			}
			const parsed = DeptResponse.parse(dept);
			return {
				...parsed,
				id: String(parsed.id),
				parentId: String(parsed.parentId),
			};
		},
		{
			auth: true,
			perm: ["sys:dept:list"],
			params: DeptParamsWithId,
			detail: {
				tags: ["Dept"],
				summary: "获取部门表单数据",
				description: "编辑部门时回填表单，仅含可编辑字段，排除审计列",
			},
		},
	)
	.post(
		"/",
		async ({ body }) => {
			if (body.parentId && body.parentId !== 0) {
				const parent = await findDeptById(body.parentId, db);
				if (!parent) {
					throw notFound(ERR_CODE.DEPT_NOT_FOUND);
				}
			}
			const dept = await createDept(body, db);
			return DeptResponse.parse(dept);
		},
		{
			auth: true,
			perm: ["sys:dept:create"],
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
			const existing = await findDeptById(params.id, db);
			if (!existing) {
				throw notFound(ERR_CODE.DEPT_NOT_FOUND);
			}
			if (
				body.parentId !== undefined &&
				body.parentId !== null &&
				body.parentId !== 0
			) {
				const parent = await findDeptById(body.parentId, db);
				if (!parent) {
					throw notFound(ERR_CODE.DEPT_NOT_FOUND);
				}
			}
			if (body.parentId !== undefined && body.parentId !== null) {
				const cyclic = await isParentIdCyclic(params.id, body.parentId, db);
				if (cyclic) {
					throw new BizError(
						ERR_CODE.DEPT_PARENT_CYCLE,
						"不能将部门移动到自己的子部门下",
					);
				}
			}
			const updated = await updateDept(params.id, body, db);
			if (!updated) {
				throw notFound(ERR_CODE.DEPT_NOT_FOUND);
			}
			return DeptResponse.parse(updated);
		},
		{
			auth: true,
			perm: ["sys:dept:update"],
			params: DeptParamsWithId,
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
					const existing = await findDeptById(id, db);
					if (!existing) {
						throw notFound(ERR_CODE.DEPT_NOT_FOUND);
					}
					const inUse = await isDeptUsedByUsers(id, db);
					if (inUse) {
						throw new BizError(
							ERR_CODE.DEPT_HAS_USERS,
							"部门下存在用户，无法删除",
						);
					}
				}
				return await batchSoftDeleteDepts(ids, db);
			}
			const id = Number(idStr);
			if (Number.isNaN(id)) {
				throw notFound(ERR_CODE.DEPT_NOT_FOUND);
			}
			const existing = await findDeptById(id, db);
			if (!existing) {
				throw notFound(ERR_CODE.DEPT_NOT_FOUND);
			}
			const inUse = await isDeptUsedByUsers(id, db);
			if (inUse) {
				throw new BizError(ERR_CODE.DEPT_HAS_USERS, "部门下存在用户，无法删除");
			}
			const count = await softDeleteDept(id, db);
			return { deletedCount: count };
		},
		{
			auth: true,
			perm: ["sys:dept:delete"],
			params: DeptParamsWithCommaIds,
			detail: {
				tags: ["Dept"],
				summary: "删除部门（级联删除子部门，支持批量）",
				description:
					"单条：DELETE /api/v1/depts/1；批量：DELETE /api/v1/depts/1,2,3。删除时清理 sys_role_dept 关联",
			},
		},
	);
