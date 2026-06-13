import { Elysia } from "elysia";
import { z } from "zod";
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

export const userRoutes = new Elysia({ prefix: "/users" })
	.get(
		"/",
		async ({ query }) => {
			return findUsers(query);
		},
		{
			query: UserListQuery,
			detail: { tags: ["User"], summary: "用户列表（分页）" },
		},
	)
	.get(
		"/:id",
		async ({ params }) => {
			const user = await findUserById(params.id);
			if (!user) {
				throw new Error("用户不存在");
			}
			return user;
		},
		{
			params: ParamsWithId,
			detail: { tags: ["User"], summary: "用户详情" },
		},
	)
	.post(
		"/",
		async ({ body }) => {
			return createUser(body);
		},
		{
			body: UserCreateBody,
			detail: { tags: ["User"], summary: "创建用户" },
		},
	)
	.put(
		"/:id",
		async ({ params, body }) => {
			const user = await updateUser(params.id, body);
			if (!user) {
				throw new Error("用户不存在");
			}
			return user;
		},
		{
			body: UserUpdateBody,
			params: ParamsWithId,
			detail: { tags: ["User"], summary: "更新用户" },
		},
	)
	.delete(
		"/:id",
		async ({ params }) => {
			const user = await softDeleteUser(params.id);
			if (!user) {
				throw new Error("用户不存在");
			}
			return user;
		},
		{
			params: ParamsWithId,
			detail: { tags: ["User"], summary: "删除用户（软删）" },
		},
	);
