import { and, count, eq, like } from "drizzle-orm";
import type z from "zod";
import { db } from "@/db/client";
import { sysUser } from "@/db/schema/system/user";
import type { UserCreateBody, UserUpdateBody } from "./schema";

/**
 * 查询用户列表（分页 + 可选过滤）
 */
export const findUsers = async (query: {
	page: number;
	pageSize: number;
	username?: string;
	status?: number;
}) => {
	// 组装查询条件：用户名模糊匹配 + 状态精确匹配
	const where = [];
	if (query.username) {
		where.push(like(sysUser.username, `%${query.username}%`));
	}
	if (query.status !== undefined) {
		where.push(eq(sysUser.status, query.status));
	}

	const list = await db
		.select()
		.from(sysUser)
		.where(where.length ? and(...where) : undefined) // 用 and() 合并数组
		.limit(query.pageSize)
		.offset((query.page - 1) * query.pageSize);

	const result = await db
		.select({ total: count() })
		.from(sysUser)
		.where(where.length ? and(...where) : undefined);

	const total = result[0]?.total ?? 0; // 安全访问，为空时默认 0

	return { list, total, page: query.page, pageSize: query.pageSize };
};

/** 根据 ID 查询用户 */
export const findUserById = async (id: number) => {
	const rows = await db.select().from(sysUser).where(eq(sysUser.id, id));
	return rows[0]; // 可能为 undefined，由 routes 层判断
};

/** 创建用户 */
export const createUser = async (data: z.infer<typeof UserCreateBody>) => {
	const [user] = await db.insert(sysUser).values(data).returning();
	return user;
};

/** 更新用户 */
export const updateUser = async (
	id: number,
	data: z.infer<typeof UserUpdateBody>,
) => {
	const [user] = await db
		.update(sysUser)
		.set(data)
		.where(eq(sysUser.id, id))
		.returning();
	return user;
};

/** 软删除用户 */
export const softDeleteUser = async (id: number) => {
	const [user] = await db
		.update(sysUser)
		.set({ deletedAt: new Date() })
		.where(eq(sysUser.id, id))
		.returning();
	return user;
};
