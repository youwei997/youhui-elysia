import { Elysia } from "elysia";
import { db } from "@/db/client";
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

export const userRoutes = new Elysia({ prefix: "/api/v1/users" })
	.use(authPlugin)
	.get(
		"/me",
		async ({ user }) => {
			if (!user) {
				throw new BizError(ERR_CODE.ACCESS_TOKEN_INVALID, undefined, 401);
			}
			const userId = Number(user.sub);
			const userInfo = await findUserById(userId);
			if (!userInfo) {
				throw notFound();
			}
			const [roles, perms] = await Promise.all([
				findUserRoles(db, userId),
				findUserPerms(db, userId),
			]);
			return {
				userId: userInfo.id,
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
		},
	)
	.get(
		"/",
		async ({ query }) => {
			return findUsers(query);
		},
		{
			auth: true,
			query: UserListQuery,
			detail: {
				tags: ["User"],
				summary: "用户列表（分页）",
				description: "支持关键字模糊搜索、状态筛选和部门过滤",
			},
		},
	)
	.get(
		"/options",
		async () => {
			return findUserOptions();
		},
		{
			auth: true,
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
			const data = await findUserFormData(params.id);
			if (!data) {
				throw notFound();
			}
			const { roleIds } = data;
			const parsed = UserResponse.parse(data);
			return { ...parsed, roleIds };
		},
		{
			auth: true,
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
			const user = await findUserById(params.id);
			if (!user) {
				throw notFound();
			}
			return UserResponse.parse(user);
		},
		{
			auth: true,
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
			return createUser(body);
		},
		{
			auth: true,
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
			const user = await resetUserPassword(params.id, password);
			if (!user) {
				throw notFound();
			}
			return user;
		},
		{
			auth: true,
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
			const user = await updateUser(params.id, body);
			if (!user) {
				throw notFound();
			}
			return user;
		},
		{
			auth: true,
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
				return batchSoftDeleteUsers(ids);
			}
			const id = Number(idStr);
			if (Number.isNaN(id)) {
				throw notFound();
			}
			const user = await softDeleteUser(id);
			if (!user) {
				throw notFound();
			}
			return user;
		},
		{
			auth: true,
			params: UserParamsWithCommaIds,
			detail: {
				tags: ["User"],
				summary: "删除用户（软删，支持批量）",
				description:
					"单条：DELETE /api/v1/users/1；批量：DELETE /api/v1/users/1,2,3",
			},
		},
	);
