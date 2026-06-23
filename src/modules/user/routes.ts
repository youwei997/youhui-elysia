import { Elysia } from "elysia";
import { z } from "zod";
import { db } from "@/db/client";
import { BizError, ERR_CODE, notFound } from "@/lib/errors";
import { findUserPerms, findUserRoles } from "@/modules/auth/queries";
import { authPlugin } from "@/plugins/auth";
import {
	createUser,
	findUserById,
	findUsers,
	softDeleteUser,
	updateUser,
} from "./queries";
import { UserCreateBody, UserListQuery, UserUpdateBody } from "./schema";

/** 路径参数 id 校验 */
const ParamsWithId = z.object({ id: z.coerce.number() });

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
				description: "支持用户名模糊搜索和状态筛选",
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
			return user;
		},
		{
			auth: true,
			params: ParamsWithId,
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
			params: ParamsWithId,
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
			const user = await softDeleteUser(params.id);
			if (!user) {
				throw notFound();
			}
			return user;
		},
		{
			auth: true,
			params: ParamsWithId,
			detail: {
				tags: ["User"],
				summary: "删除用户（软删）",
				description: "软删除，记录仍保留在数据库，查询时自动过滤",
			},
		},
	);
