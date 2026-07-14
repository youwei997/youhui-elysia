import { Elysia } from "elysia";
import { db } from "@/db/client";
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
	DATA_SCOPE_LABEL_MAP,
	RoleAssignDeptsBody,
	RoleAssignMenusBody,
	RoleCreateBody,
	RoleListQuery,
	RoleParamsWithCommaIds,
	RoleParamsWithId,
	RoleResponse,
	type RoleResponseInput,
	RoleUpdateBody,
} from "./schema";

/** 内部预设：系统内置角色 code 列表，禁止删除/改编码 */
const PROTECTED_CODES = ["ROOT"] as const;

const ensureNotProtected = (role: { code: string }) => {
	if (new Set<string>(PROTECTED_CODES).has(role.code)) {
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
	const validIds = await findValidDeptIds(deptIds, db);
	if (validIds.length !== deptIds.length) {
		const validSet = new Set(validIds);
		const invalid = deptIds.filter((id) => !validSet.has(id));
		throw new BizError(
			ERR_CODE.ROLE_DEPT_ID_INVALID,
			`以下 deptId 非法：${invalid.join(", ")}`,
		);
	}
};

/** 响应转换：id 转 string，计算 dataScopeLabel */
const parseRole = (role: RoleResponseInput) => {
	const parsed = RoleResponse.parse(role);
	return {
		...parsed,
		id: String(parsed.id),
		dataScopeLabel:
			DATA_SCOPE_LABEL_MAP[
				parsed.dataScope as keyof typeof DATA_SCOPE_LABEL_MAP
			] ?? "未知",
	};
};

export const roleRoutes = new Elysia({ prefix: "/api/v1/roles" })
	.use(authPlugin)
		.get(
			"/",
			async ({ user, query }) => {
				if (!user) {
					throw new BizError(ERR_CODE.ACCESS_TOKEN_INVALID, undefined, 401);
				}
				const result = await findRoles(query, user.tenantId, db);
			return {
				...result,
				list: result.list.map((r) => parseRole(r)),
			};
		},
		{
			auth: true,
			requirePerm: ["sys:role:list"],
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
			async ({ user }) => {
				if (!user) {
					throw new BizError(ERR_CODE.ACCESS_TOKEN_INVALID, undefined, 401);
				}
				return findRoleOptions(user.tenantId, db);
			},
		{
			auth: true,
			requirePerm: ["sys:role:list"],
			detail: {
				tags: ["Role"],
				summary: "角色下拉选项",
				description: "返回 { value, label }[] 供前端下拉选择器使用",
			},
		},
	)
		.get(
			"/:id",
			async ({ user, params }) => {
				if (!user) {
					throw new BizError(ERR_CODE.ACCESS_TOKEN_INVALID, undefined, 401);
				}
				const role = await findRoleById(params.id, user.tenantId, db);
			if (!role) {
				throw notFound(ERR_CODE.ROLE_NOT_FOUND);
			}
			return parseRole(role);
		},
		{
			auth: true,
			requirePerm: ["sys:role:list"],
			params: RoleParamsWithId,
			detail: {
				tags: ["Role"],
				summary: "角色详情",
				description: "根据 ID 获取单个角色信息",
			},
		},
	)
		.get(
			"/:id/form",
			async ({ user, params }) => {
				if (!user) {
					throw new BizError(ERR_CODE.ACCESS_TOKEN_INVALID, undefined, 401);
				}
				const role = await findRoleFormData(params.id, user.tenantId, db);
			if (!role) {
				throw notFound(ERR_CODE.ROLE_NOT_FOUND);
			}
			const { deptIds } = role;
			const parsed = parseRole(role);
			return { ...parsed, deptIds };
		},
		{
			auth: true,
			requirePerm: ["sys:role:list"],
			params: RoleParamsWithId,
			detail: {
				tags: ["Role"],
				summary: "角色表单数据（含 deptIds）",
				description: "编辑角色时回填表单，dataScope=5 时返回已绑定的部门ID列表",
			},
		},
	)
		.post(
			"/",
			async ({ user, body }) => {
				if (!user) {
					throw new BizError(ERR_CODE.ACCESS_TOKEN_INVALID, undefined, 401);
				}
				if (body.deptIds) {
					await ensureValidDeptIds(body.deptIds);
				}
				if (!/^[A-Z][A-Z0-9_]*$/.test(body.code)) {
					throw new BizError(
						ERR_CODE.USER_REQUEST_PARAMETER_ERROR,
						"角色编码必须以大写字母开头，且仅含大写字母、数字、下划线（如 ADMIN）",
					);
				}
				const role = await createRole(body, user.tenantId, db);
			return parseRole(role);
		},
		{
			auth: true,
			requirePerm: ["sys:role:create"],
			audit: "role:create",
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
			async ({ user, params, body }) => {
				if (!user) {
					throw new BizError(ERR_CODE.ACCESS_TOKEN_INVALID, undefined, 401);
				}
				const existing = await findRoleById(params.id, user.tenantId, db);
				if (!existing) {
					throw notFound(ERR_CODE.ROLE_NOT_FOUND);
				}
				ensureNotProtected(existing);
				if (body.deptIds) {
					await ensureValidDeptIds(body.deptIds);
				}
				const role = await updateRole(params.id, body, user.tenantId, db);
			if (!role) {
				throw notFound(ERR_CODE.ROLE_NOT_FOUND);
			}
			return parseRole(role);
		},
		{
			auth: true,
			requirePerm: ["sys:role:update"],
			audit: "role:update",
			body: RoleUpdateBody,
			params: RoleParamsWithId,
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
			async ({ user: ctxUser, params }) => {
				if (!ctxUser) {
					throw new BizError(ERR_CODE.ACCESS_TOKEN_INVALID, undefined, 401);
				}
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
						const existing = await findRoleById(id, ctxUser.tenantId, db);
						if (!existing) {
							throw notFound(ERR_CODE.ROLE_NOT_FOUND);
						}
						ensureNotProtected(existing);
						if (await isRoleAssignedToUsers(id, ctxUser.tenantId, db)) {
							throw new BizError(
								ERR_CODE.ROLE_HAS_ASSIGNED_USERS,
								`角色 ${existing.name} 下存在已分配用户，无法删除`,
							);
						}
					}

					const deleted = await batchSoftDeleteRoles(ids, ctxUser.tenantId, db);
					return deleted.map((r) => parseRole(r));
				}

				// 单条删除
				const id = Number(idStr);
				if (Number.isNaN(id)) {
					throw notFound(ERR_CODE.ROLE_NOT_FOUND);
				}

				const existing = await findRoleById(id, ctxUser.tenantId, db);
				if (!existing) {
					throw notFound(ERR_CODE.ROLE_NOT_FOUND);
				}
				ensureNotProtected(existing);
				if (await isRoleAssignedToUsers(id, ctxUser.tenantId, db)) {
					throw new BizError(ERR_CODE.ROLE_HAS_ASSIGNED_USERS);
				}
				const role = await softDeleteRole(id, ctxUser.tenantId, db);
			if (!role) {
				throw notFound(ERR_CODE.ROLE_NOT_FOUND);
			}
			return parseRole(role);
		},
		{
			auth: true,
			requirePerm: ["sys:role:delete"],
			audit: "role:delete",
			params: RoleParamsWithCommaIds,
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
			async ({ user, params }) => {
				if (!user) {
					throw new BizError(ERR_CODE.ACCESS_TOKEN_INVALID, undefined, 401);
				}
				const existing = await findRoleById(params.id, user.tenantId, db);
				if (!existing) {
					throw notFound(ERR_CODE.ROLE_NOT_FOUND);
				}
				return await findRoleMenuIds(params.id, user.tenantId, db);
			},
		{
			auth: true,
			requirePerm: ["sys:role:assign"],
			params: RoleParamsWithId,
			detail: {
				tags: ["Role"],
				summary: "查询角色已绑定的菜单 ID 列表",
			},
		},
	)
		.get(
			"/:id/dept-ids",
			async ({ user, params }) => {
				if (!user) {
					throw new BizError(ERR_CODE.ACCESS_TOKEN_INVALID, undefined, 401);
				}
				const existing = await findRoleById(params.id, user.tenantId, db);
				if (!existing) {
					throw notFound(ERR_CODE.ROLE_NOT_FOUND);
				}
				return await findRoleDeptIds(params.id, user.tenantId, db);
			},
		{
			auth: true,
			requirePerm: ["sys:role:assign"],
			params: RoleParamsWithId,
			detail: {
				tags: ["Role"],
				summary: "查询角色已绑定的部门 ID 列表（仅 CUSTOM dataScope 角色）",
			},
		},
	)
		.put(
			"/:id/menus",
			async ({ user, params, body }) => {
				if (!user) {
					throw new BizError(ERR_CODE.ACCESS_TOKEN_INVALID, undefined, 401);
				}
				const existing = await findRoleById(params.id, user.tenantId, db);
				if (!existing) {
					throw notFound(ERR_CODE.ROLE_NOT_FOUND);
				}
				// 业务规则前置校验：所有 menuId 必须存在且未软删
				if (body.length > 0) {
					const validIds = await findValidMenuIds(body, db);
					if (validIds.length !== body.length) {
						const validSet = new Set(validIds);
						const invalid = body.filter((id) => !validSet.has(id));
						throw new BizError(
							ERR_CODE.ROLE_MENU_ID_INVALID,
							`以下 menuId 非法：${invalid.join(", ")}`,
						);
					}
				}
				await replaceRoleMenus(params.id, body, user.tenantId, db);
			return true;
		},
		{
			auth: true,
			requirePerm: ["sys:role:assign"],
			audit: "role:assign-menu",
			body: RoleAssignMenusBody,
			params: RoleParamsWithId,
			detail: {
				tags: ["Role"],
				summary: "绑定角色菜单",
				description: "事务内先删后插；menuIds 为空数组表示清空绑定",
			},
		},
	)
		.put(
			"/:id/depts",
			async ({ user, params, body }) => {
				if (!user) {
					throw new BizError(ERR_CODE.ACCESS_TOKEN_INVALID, undefined, 401);
				}
				const existing = await findRoleById(params.id, user.tenantId, db);
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
				if (body.deptIds.length > 0) {
					const validIds = await findValidDeptIds(body.deptIds, db);
					if (validIds.length !== body.deptIds.length) {
						const validSet = new Set(validIds);
						const invalid = body.deptIds.filter((id) => !validSet.has(id));
						throw new BizError(
							ERR_CODE.ROLE_DEPT_ID_INVALID,
							`以下 deptId 非法：${invalid.join(", ")}`,
						);
					}
				}
				await replaceRoleDepts(params.id, body, user.tenantId, db);
			return true;
		},
		{
			auth: true,
			requirePerm: ["sys:role:assign"],
			audit: "role:assign-dept",
			body: RoleAssignDeptsBody,
			params: RoleParamsWithId,
			detail: {
				tags: ["Role"],
				summary: "绑定角色部门（仅 CUSTOM dataScope）",
				description: "事务内先删后插；deptIds 为空数组表示清空绑定",
			},
		},
	);
