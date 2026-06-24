import { and, count, eq, inArray, isNull, like, or } from "drizzle-orm";
import type z from "zod";
import type { DB } from "@/db/client";
import type { PageResult } from "@/lib/pagination";
import { sysUserRole } from "@/db/schema/system/relation";
import { sysUser } from "@/db/schema/system/user";
import type { UserCreateBody, UserUpdateBody } from "./schema";

/**
 * 查询用户列表（分页 + 可选过滤）
 */
export const findUsers = async (
	query: {
		pageNum: number;
		pageSize: number;
		keywords?: string;
		status?: number;
		deptId?: number;
	},
	db: DB,
): Promise<PageResult<(typeof sysUser)["$inferSelect"]>> => {
	// 组装查询条件：软删过滤（必加）+ 关键字模糊匹配 + 状态精确匹配 + 部门筛选
	const where = [isNull(sysUser.deletedAt)];
	if (query.keywords) {
		const keywordCondition = or(
			like(sysUser.username, `%${query.keywords}%`),
			like(sysUser.nickname, `%${query.keywords}%`),
		);
		if (keywordCondition) {
			where.push(keywordCondition);
		}
	}
	if (query.status !== undefined) {
		where.push(eq(sysUser.status, query.status));
	}
	if (query.deptId !== undefined) {
		where.push(eq(sysUser.deptId, query.deptId));
	}

	const list = await db
		.select()
		.from(sysUser)
		.where(and(...where)) // 数组至少含软删过滤，永远不会空
		.limit(query.pageSize)
		.offset((query.pageNum - 1) * query.pageSize);

	const result = await db
		.select({ total: count() })
		.from(sysUser)
		.where(and(...where));

	const total = result[0]?.total ?? 0; // 安全访问，为空时默认 0

	return { list, total };
};

/** 根据 ID 查询用户（默认过滤已软删记录） */
export const findUserById = async (
	id: number,
	db: DB,
): Promise<typeof sysUser.$inferSelect | undefined> => {
	const rows = await db
		.select()
		.from(sysUser)
		.where(and(eq(sysUser.id, id), isNull(sysUser.deletedAt)));
	return rows[0]; // 可能为 undefined，由 routes 层判断
};

/** 创建用户 */
export const createUser = async (
	data: z.infer<typeof UserCreateBody>,
	db: DB,
): Promise<typeof sysUser.$inferSelect | undefined> => {
	const [user] = await db.insert(sysUser).values(data).returning();
	return user;
};

/** 更新用户（默认过滤已软删记录，禁止改活已删数据） */
export const updateUser = async (
	id: number,
	data: z.infer<typeof UserUpdateBody>,
	db: DB,
): Promise<typeof sysUser.$inferSelect | undefined> => {
	const [user] = await db
		.update(sysUser)
		.set(data)
		.where(and(eq(sysUser.id, id), isNull(sysUser.deletedAt)))
		.returning();
	return user;
};

/** 软删除用户（自身就是设 deletedAt，按软删规则不需要加 deletedAt 过滤） */
export const softDeleteUser = async (
	id: number,
	db: DB,
): Promise<typeof sysUser.$inferSelect | undefined> => {
	const [user] = await db
		.update(sysUser)
		.set({ deletedAt: new Date().toISOString() })
		.where(eq(sysUser.id, id))
		.returning();
	return user;
};

/** 查某用户已绑定的角色 ID 列表（前端"用户编辑"页回显用） */
export const findUserRoleIds = async (
	userId: number,
	db: DB,
): Promise<number[]> => {
	const rows = await db
		.select({ roleId: sysUserRole.roleId })
		.from(sysUserRole)
		.where(eq(sysUserRole.userId, userId));
	return rows.map((r) => r.roleId);
};

/**
 * 获取用户表单数据（含已绑定的角色 ID 列表）
 * 返回 { ...user, roleIds }，对齐前端 UserForm 类型
 */
export const findUserFormData = async (
	id: number,
	db: DB,
): Promise<(typeof sysUser.$inferSelect & { roleIds: number[] }) | undefined> => {
	const user = await findUserById(id, db);
	if (!user) {
		return undefined;
	}
	const roleIds = await findUserRoleIds(id, db);
	return { ...user, roleIds };
};

/** 用户下拉选项（供前端下拉选择器使用），仅返回启用且未删除的用户 */
export const findUserOptions = async (
	db: DB,
): Promise<Array<{ value: string; label: string }>> => {
	const rows = await db
		.select({
			id: sysUser.id,
			username: sysUser.username,
			nickname: sysUser.nickname,
		})
		.from(sysUser)
		.where(and(isNull(sysUser.deletedAt), eq(sysUser.status, 1)));
	return rows.map((r) => ({
		value: String(r.id),
		label: r.nickname || r.username,
	}));
};

/** 批量软删除用户 */
export const batchSoftDeleteUsers = async (
	ids: number[],
	db: DB,
): Promise<typeof sysUser.$inferSelect[]> => {
	if (ids.length === 0) {
		return [];
	}
	const users = await db
		.update(sysUser)
		.set({ deletedAt: new Date().toISOString() })
		.where(inArray(sysUser.id, ids))
		.returning();
	return users;
};

/** 重置用户密码（软删过滤，禁止重置已删用户的密码） */
export const resetUserPassword = async (
	id: number,
	password: string,
	db: DB,
): Promise<typeof sysUser.$inferSelect | undefined> => {
	const [user] = await db
		.update(sysUser)
		.set({ password })
		.where(and(eq(sysUser.id, id), isNull(sysUser.deletedAt)))
		.returning();
	return user;
};
