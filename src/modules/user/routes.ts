import { Elysia } from "elysia";
import { db } from "@/db/client";
import { buildDataScopeContext } from "@/db/helpers/data-scope";
import { BizError, ERR_CODE, notFound } from "@/lib/errors";
import { findUserPerms, findUserRoles } from "@/modules/auth/queries";
import { authPlugin } from "@/plugins/auth";
import {
	batchSoftDeleteUsers,
	createUser,
	findUserById,
	findUserFormData,
	findUserOptions,
	findUsers,
	resetUserPassword,
	softDeleteUser,
	updateUser,
} from "./queries";
import {
	UserCreateBody,
	UserListQuery,
	UserParamsWithCommaIds,
	UserParamsWithId,
	UserResetPasswordQuery,
	UserResponse,
	UserUpdateBody,
} from "./schema";

/** 响应转换：parse 后 id 转 string */
const parseUser = (user: Parameters<typeof UserResponse.parse>[0]) => {
	const parsed = UserResponse.parse(user);
	return { ...parsed, id: String(parsed.id) };
};

export const userRoutes = new Elysia({ prefix: "/api/v1/users" })
	.use(authPlugin)
	.get(
		"/me",
		async ({ user }) => {
			if (!user) {
				throw new BizError(ERR_CODE.ACCESS_TOKEN_INVALID, undefined, 401);
			}
			const userId = Number(user.sub);
			const userInfo = await findUserById(userId, db);
			if (!userInfo) {
				throw notFound(ERR_CODE.USER_NOT_FOUND);
			}
			const [roles, perms] = await Promise.all([
				findUserRoles(userId, db),
				findUserPerms(userId, db),
			]);
			return {
				userId: String(userInfo.id),
				username: userInfo.username,
				nickname: userInfo.nickname,
				avatar: userInfo.avatar,
				roles: roles.map((r) => r.code),
				perms,
			};
		},
		{
			auth: true,
			detail: {
				tags: ["User"],
				summary: "获取当前用户信息",
				description: "返回当前登录用户的角色和权限标识集合",
			},
			// 不加 perm：所有登录用户都需要获取自己的信息
		},
	)
	.get(
		"/",
		async ({ user, query }) => {
			// auth: true macro 运行时拦截 null，类型层手动收窄
			if (!user) {
				throw new BizError(ERR_CODE.ACCESS_TOKEN_INVALID, undefined, 401);
			}
			// 装配数据权限上下文（3 次查询并行：user / customDeptIds，treePath 串行）
			const dataScopeCtx = await buildDataScopeContext(
				Number(user.sub),
				user.dataScopes,
				db,
			);
			const result = await findUsers(query, dataScopeCtx, db);
			return {
				...result,
				list: result.list.map((u) => parseUser(u)),
			};
		},
		{
			auth: true,
			perm: ["sys:user:list"],
			query: UserListQuery,
			detail: {
				tags: ["User"],
				summary: "用户列表（分页）",
				description:
					"支持关键字模糊搜索、状态筛选和部门过滤；按当前用户角色 dataScope 自动裁剪数据",
			},
		},
	)
	.get(
		"/options",
		async () => {
			return findUserOptions(db);
		},
		{
			auth: true,
			perm: ["sys:user:list"],
			detail: {
				tags: ["User"],
				summary: "用户下拉选项",
				description: "返回启用用户的 id 和名称列表，供前端下拉选择器使用",
			},
		},
	)
	.get(
		"/:id/form",
		async ({ params }) => {
			const data = await findUserFormData(params.id, db);
			if (!data) {
				throw notFound(ERR_CODE.USER_NOT_FOUND);
			}
			const { roleIds } = data;
			const parsed = parseUser(data);
			return { ...parsed, roleIds };
		},
		{
			auth: true,
			perm: ["sys:user:list"],
			params: UserParamsWithId,
			detail: {
				tags: ["User"],
				summary: "用户表单数据",
				description: "返回用户信息及其已绑定的角色 ID 列表，供编辑页回显",
			},
		},
	)
	.get(
		"/:id",
		async ({ params }) => {
			const user = await findUserById(params.id, db);
			if (!user) {
				throw notFound(ERR_CODE.USER_NOT_FOUND);
			}
			return parseUser(user);
		},
		{
			auth: true,
			perm: ["sys:user:list"],
			params: UserParamsWithId,
			detail: {
				tags: ["User"],
				summary: "用户详情",
				description: "根据 ID 获取单个用户信息",
			},
		},
	)
	.post(
		"/",
		async ({ body }) => {
			const user = await createUser(body, db);
			return parseUser(user);
		},
		{
			auth: true,
			perm: ["sys:user:create"],
			audit: { module: "user", action: "create" },
			body: UserCreateBody,
			detail: {
				tags: ["User"],
				summary: "创建用户",
				description: "新增系统用户，除用户名/密码外可选填其他信息",
			},
		},
	)
	.put(
		"/:id/password/reset",
		async ({ params, query }) => {
			const { password } = query;
			const user = await resetUserPassword(params.id, password, db);
			if (!user) {
				throw notFound(ERR_CODE.USER_NOT_FOUND);
			}
			return parseUser(user);
		},
		{
			auth: true,
			perm: ["sys:user:reset-password"],
			audit: { module: "user", action: "reset-password" },
			params: UserParamsWithId,
			query: UserResetPasswordQuery,
			detail: {
				tags: ["User"],
				summary: "重置用户密码",
				description: "管理员重置指定用户的登录密码",
			},
		},
	)
	.put(
		"/:id",
		async ({ params, body }) => {
			const user = await updateUser(params.id, body, db);
			if (!user) {
				throw notFound(ERR_CODE.USER_NOT_FOUND);
			}
			return parseUser(user);
		},
		{
			auth: true,
			perm: ["sys:user:update"],
			audit: { module: "user", action: "update" },
			body: UserUpdateBody,
			params: UserParamsWithId,
			detail: {
				tags: ["User"],
				summary: "更新用户",
				description: "部分字段更新，未传字段保持原值不变",
			},
		},
	)
	.delete(
		"/:id",
		async ({ params }) => {
			// 前端批量删除发送 "1,2,3" 格式，单条删除发送 "1"
			const idStr = params.id;
			if (idStr.includes(",")) {
				const ids = idStr
					.split(",")
					.map((s) => Number(s.trim()))
					.filter((n) => !Number.isNaN(n));
				const deleted = await batchSoftDeleteUsers(ids, db);
				return deleted.map((u) => parseUser(u));
			}
			const id = Number(idStr);
			if (Number.isNaN(id)) {
				throw notFound(ERR_CODE.USER_NOT_FOUND);
			}
			const user = await softDeleteUser(id, db);
			if (!user) {
				throw notFound(ERR_CODE.USER_NOT_FOUND);
			}
			return parseUser(user);
		},
		{
			auth: true,
			perm: ["sys:user:delete"],
			audit: { module: "user", action: "delete" },
			params: UserParamsWithCommaIds,
			detail: {
				tags: ["User"],
				summary: "删除用户（软删，支持批量）",
				description:
					"单条：DELETE /api/v1/users/1；批量：DELETE /api/v1/users/1,2,3",
			},
		},
	);
