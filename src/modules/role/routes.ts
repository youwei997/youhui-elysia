import { Elysia } from "elysia";
import { z } from "zod";
import { BizError, ERR_CODE, notFound } from "@/lib/errors";
import { authPlugin } from "@/plugins/auth";
import {
	batchSoftDeleteRoles,
	createRole,
	findRoleById,
	findRoleDeptIds,
	findRoleFormData,
	findRoleMenuIds,
	findRoleOptions,
	findRoles,
	findValidDeptIds,
	findValidMenuIds,
	isRoleAssignedToUsers,
	replaceRoleDepts,
	replaceRoleMenus,
	softDeleteRole,
	updateRole,
} from "./queries";
import {
	RoleAssignDeptsBody,
	RoleAssignMenusBody,
	RoleCreateBody,
	RoleListQuery,
	RoleUpdateBody,
} from "./schema";

/** 路径参数 id 校验：路由 `:id` 是 string，coerce 转 number */
const ParamsWithId = z.object({ id: z.coerce.number() });

/** DELETE 专用：接受原始字符串（支持 "1" 和 "1,2,3" 两种形式），对齐前端批量删除 */
const ParamsWithCommaIds = z.object({ id: z.string() });

/** 内部预设：系统内置角色 code 列表，禁止删除/改编码 */
const PROTECTED_CODES = ["ROOT"] as const;

const ensureNotProtected = (role: { code: string }) => {
	if ((PROTECTED_CODES as readonly string[]).includes(role.code)) {
		throw new BizError(
			ERR_CODE.ROLE_PROTECTED,
			`内置角色 ${role.code} 受保护，禁止该操作`,
			403,
		);
	}
};

/**
 * 校验 deptIds 是否全部存在且未软删
 * routes 层业务规则校验，非法时抛 BizError
 */
const ensureValidDeptIds = async (deptIds: number[]) => {
	if (deptIds.length === 0) return;
	const validIds = await findValidDeptIds(undefined, deptIds);
	if (validIds.length !== deptIds.length) {
		const validSet = new Set(validIds);
		const invalid = deptIds.filter((id) => !validSet.has(id));
		throw new BizError(
			ERR_CODE.ROLE_DEPT_ID_INVALID,
			`以下 deptId 非法：${invalid.join(", ")}`,
		);
	}
};

export const roleRoutes = new Elysia({ prefix: "/api/v1/roles" })
	.use(authPlugin)
	.get(
		"/",
		async ({ query }) => {
			return findRoles(undefined, query);
		},
		{
			auth: true,
			query: RoleListQuery,
			detail: {
				tags: ["Role"],
				summary: "角色列表（分页）",
				description: "支持 code / name 模糊搜索和 status 筛选",
			},
		},
	)
	.get(
		"/options",
		async () => {
			return findRoleOptions(undefined);
		},
		{
			auth: true,
			detail: {
				tags: ["Role"],
				summary: "角色下拉选项",
				description: "返回 { value, label }[] 供前端下拉选择器使用",
			},
		},
	)
	.get(
		"/:id",
		async ({ params }) => {
			const role = await findRoleById(undefined, params.id);
			if (!role) {
				throw notFound(ERR_CODE.ROLE_NOT_FOUND);
			}
			return role;
		},
		{
			auth: true,
			params: ParamsWithId,
			detail: {
				tags: ["Role"],
				summary: "角色详情",
				description: "根据 ID 获取单个角色信息",
			},
		},
	)
	.get(
		"/:id/form",
		async ({ params }) => {
			const role = await findRoleFormData(undefined, params.id);
			if (!role) {
				throw notFound(ERR_CODE.ROLE_NOT_FOUND);
			}
			return role;
		},
		{
			auth: true,
			params: ParamsWithId,
			detail: {
				tags: ["Role"],
				summary: "角色表单数据（含 deptIds）",
				description: "编辑角色时回填表单，dataScope=5 时返回已绑定的部门ID列表",
			},
		},
	)
	.post(
		"/",
		async ({ body }) => {
			if (body.deptIds) {
				await ensureValidDeptIds(body.deptIds);
			}
			return createRole(undefined, body);
		},
		{
			auth: true,
			body: RoleCreateBody,
			detail: {
				tags: ["Role"],
				summary: "创建角色",
				description:
					"新增系统角色，code 全局唯一；dataScope=5 时同时保存 deptIds",
			},
		},
	)
	.put(
		"/:id",
		async ({ params, body }) => {
			const existing = await findRoleById(undefined, params.id);
			if (!existing) {
				throw notFound(ERR_CODE.ROLE_NOT_FOUND);
			}
			ensureNotProtected(existing);
			if (body.deptIds) {
				await ensureValidDeptIds(body.deptIds);
			}
			const role = await updateRole(undefined, params.id, body);
			return role;
		},
		{
			auth: true,
			body: RoleUpdateBody,
			params: ParamsWithId,
			detail: {
				tags: ["Role"],
				summary: "更新角色",
				description:
					"code 不可改；dataScope=5 时同时保存 deptIds，dataScope 切出 5 时自动清空",
			},
		},
	)
	.delete(
		"/:id",
		async ({ params }) => {
			const idStr = params.id;

			// 前端批量删除传 "1,2,3"，单条传 "1"
			if (idStr.includes(",")) {
				const ids = idStr
					.split(",")
					.map((s) => Number(s.trim()))
					.filter((n) => !Number.isNaN(n));

				if (ids.length === 0) {
					throw notFound(ERR_CODE.ROLE_NOT_FOUND);
				}

				// 逐条前置校验：受保护角色 / 已绑定用户
				for (const id of ids) {
					const existing = await findRoleById(undefined, id);
					if (!existing) {
						throw notFound(ERR_CODE.ROLE_NOT_FOUND);
					}
					ensureNotProtected(existing);
					if (await isRoleAssignedToUsers(undefined, id)) {
						throw new BizError(
							ERR_CODE.ROLE_HAS_ASSIGNED_USERS,
							`角色 ${existing.name} 下存在已分配用户，无法删除`,
						);
					}
				}

				return batchSoftDeleteRoles(undefined, ids);
			}

			// 单条删除
			const id = Number(idStr);
			if (Number.isNaN(id)) {
				throw notFound(ERR_CODE.ROLE_NOT_FOUND);
			}

			const existing = await findRoleById(undefined, id);
			if (!existing) {
				throw notFound(ERR_CODE.ROLE_NOT_FOUND);
			}
			ensureNotProtected(existing);
			if (await isRoleAssignedToUsers(undefined, id)) {
				throw new BizError(ERR_CODE.ROLE_HAS_ASSIGNED_USERS);
			}
			const role = await softDeleteRole(undefined, id);
			return role;
		},
		{
			auth: true,
			params: ParamsWithCommaIds,
			detail: {
				tags: ["Role"],
				summary: "删除角色（软删，支持批量）",
				description:
					"单条：DELETE /api/v1/roles/1；批量：DELETE /api/v1/roles/1,2,3。删除时自动清理 sys_user_role / sys_role_menu / sys_role_dept 关联",
			},
		},
	)
	.get(
		"/:id/menu-ids",
		async ({ params }) => {
			const existing = await findRoleById(undefined, params.id);
			if (!existing) {
				throw notFound(ERR_CODE.ROLE_NOT_FOUND);
			}
			return await findRoleMenuIds(undefined, params.id);
		},
		{
			auth: true,
			params: ParamsWithId,
			detail: {
				tags: ["Role"],
				summary: "查询角色已绑定的菜单 ID 列表",
			},
		},
	)
	.get(
		"/:id/dept-ids",
		async ({ params }) => {
			const existing = await findRoleById(undefined, params.id);
			if (!existing) {
				throw notFound(ERR_CODE.ROLE_NOT_FOUND);
			}
			return await findRoleDeptIds(undefined, params.id);
		},
		{
			auth: true,
			params: ParamsWithId,
			detail: {
				tags: ["Role"],
				summary: "查询角色已绑定的部门 ID 列表（仅 CUSTOM dataScope 角色）",
			},
		},
	)
	.put(
		"/:id/menus",
		async ({ params, body }) => {
			const existing = await findRoleById(undefined, params.id);
			if (!existing) {
				throw notFound(ERR_CODE.ROLE_NOT_FOUND);
			}
			// 业务规则前置校验：所有 menuId 必须存在且未软删
			// 抽到 routes 层用 BizError 抛，符合 AGENTS.md "queries 不抛 HTTP 错误"
			if (body.menuIds.length > 0) {
				const validIds = await findValidMenuIds(undefined, body.menuIds);
				if (validIds.length !== body.menuIds.length) {
					const validSet = new Set(validIds);
					const invalid = body.menuIds.filter((id) => !validSet.has(id));
					throw new BizError(
						ERR_CODE.ROLE_MENU_ID_INVALID,
						`以下 menuId 非法：${invalid.join(", ")}`,
					);
				}
			}
			await replaceRoleMenus(undefined, params.id, body);
			return true;
		},
		{
			auth: true,
			body: RoleAssignMenusBody,
			params: ParamsWithId,
			detail: {
				tags: ["Role"],
				summary: "绑定角色菜单",
				description: "事务内先删后插；menuIds 为空数组表示清空绑定",
			},
		},
	)
	.put(
		"/:id/depts",
		async ({ params, body }) => {
			const existing = await findRoleById(undefined, params.id);
			if (!existing) {
				throw notFound(ERR_CODE.ROLE_NOT_FOUND);
			}
			// 业务规则：仅 dataScope=5（自定义）角色支持绑定部门
			if (existing.dataScope !== 5) {
				throw new BizError(
					ERR_CODE.ROLE_NOT_CUSTOM_DATA_SCOPE,
					"仅 dataScope=5（自定义）的角色支持绑定部门",
				);
			}
			// 业务规则前置校验：所有 deptId 必须存在且未软删
			// 避免传非法 deptId 导致 sys_role_dept 留下悬空关联
			if (body.deptIds.length > 0) {
				const validIds = await findValidDeptIds(undefined, body.deptIds);
				if (validIds.length !== body.deptIds.length) {
					const validSet = new Set(validIds);
					const invalid = body.deptIds.filter((id) => !validSet.has(id));
					throw new BizError(
						ERR_CODE.ROLE_DEPT_ID_INVALID,
						`以下 deptId 非法：${invalid.join(", ")}`,
					);
				}
			}
			await replaceRoleDepts(undefined, params.id, body);
			return true;
		},
		{
			auth: true,
			body: RoleAssignDeptsBody,
			params: ParamsWithId,
			detail: {
				tags: ["Role"],
				summary: "绑定角色部门（仅 CUSTOM dataScope）",
				description: "事务内先删后插；deptIds 为空数组表示清空绑定",
			},
		},
	);
