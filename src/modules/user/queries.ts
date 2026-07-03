import {
	and,
	count,
	eq,
	getColumns,
	inArray,
	isNull,
	like,
	or,
} from "drizzle-orm";
import type z from "zod";
import type { DB } from "@/db/client";
import {
	type DataScopeContext,
	dataScopeFilter,
} from "@/db/helpers/data-scope";
import { sysDept } from "@/db/schema/system/dept";
import { sysUserRole } from "@/db/schema/system/relation";
import { sysRole } from "@/db/schema/system/role";
import { sysUser } from "@/db/schema/system/user";
import type { PageResult } from "@/lib/pagination";
import type { UserCreateBody, UserUpdateBody } from "./schema";
import type { UserFormData, UserListRecord, UserRecord } from "./types";

/**
 * 批量查询用户角色名
 *
 * 按 userId 分组，把同一用户的角色名用逗号拼接。
 * 不依赖原生 SQL 聚合函数，而是分两步：先批量查关联表，再在 JS 层拼接，
 * 保持 Drizzle 类型安全，同时避免 string_agg / array_agg 等非跨数据库函数。
 */
const batchFindUserRoleNames = async (
	userIds: number[],
	db: DB,
): Promise<Map<number, string>> => {
	if (userIds.length === 0) {
		return new Map();
	}

	const rows = await db
		.select({
			userId: sysUserRole.userId,
			roleName: sysRole.name,
		})
		.from(sysUserRole)
		.innerJoin(sysRole, eq(sysUserRole.roleId, sysRole.id))
		.where(inArray(sysUserRole.userId, userIds));

	const grouped = new Map<number, string[]>();
	for (const row of rows) {
		const names = grouped.get(row.userId) ?? [];
		names.push(row.roleName);
		grouped.set(row.userId, names);
	}

	const result = new Map<number, string>();
	for (const [userId, names] of grouped) {
		result.set(userId, names.join(","));
	}
	return result;
};

/**
 * 查询用户列表（分页 + 可选过滤 + 数据权限）
 *
 * 数据权限 ctx 必传：由 routes 层调用 buildDataScopeContext 装配
 * - ROOT/ALL → dataScopeFilter 返回 undefined → 不加过滤
 * - SELF → created_by = userId
 * - DEPT → dept_id = ctx.deptId
 * - DEPT_AND_SUB → dept_id IN (dept subtree)
 * - CUSTOM → dept_id IN customDeptIds
 *
 * 多角色取并集（OR 聚合），任一 ALL 短路不限（安全语义核心）
 */
export const findUsers = async (
	query: {
		pageNum: number;
		pageSize: number;
		keywords?: string;
		status?: number;
		deptId?: number;
	},
	ctx: DataScopeContext,
	db: DB,
): Promise<PageResult<UserListRecord>> => {
	// 组装查询条件：软删过滤（必加）+ 关键字模糊匹配 + 状态精确匹配 + 部门筛选 + 数据权限
	const where = [isNull(sysUser.deleteTime)];
	if (query.keywords) {
		const keywordCondition = or(
			like(sysUser.username, `%${query.keywords}%`),
			like(sysUser.nickname, `%${query.keywords}%`),
		);
		// Drizzle 的 or() 返回类型可能为 undefined，防御性检查避免推入空条件
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

	// 数据权限过滤（ALL 短路时返回 undefined，不推入空条件）
	const scopeFilter = dataScopeFilter(ctx, { user: sysUser, dept: sysDept });
	if (scopeFilter) {
		where.push(scopeFilter);
	}

	const list = await db
		.select({
			...getColumns(sysUser),
			deptName: sysDept.name,
		})
		.from(sysUser)
		.leftJoin(sysDept, eq(sysUser.deptId, sysDept.id))
		.where(and(...where)) // 数组至少含软删过滤，永远不会空
		.limit(query.pageSize)
		.offset((query.pageNum - 1) * query.pageSize);

	// 角色名通过单独批量查询聚合：避免在 select 里写原生 SQL，同时保持分页后只查当前页用户角色。
	const roleNameMap = await batchFindUserRoleNames(
		list.map((u) => u.id),
		db,
	);

	// 把角色名合并回用户记录；无角色时 roleNames 为 null，对齐 UserResponse 的 nullable 类型。
	const listWithRoles: UserListRecord[] = list.map((u) => ({
		...u,
		roleNames: roleNameMap.get(u.id) ?? null,
	}));

	const result = await db
		.select({ total: count() })
		.from(sysUser)
		.where(and(...where));

	const total = result[0]?.total ?? 0; // 安全访问，为空时默认 0

	return { list: listWithRoles, total };
};

/** 根据 ID 查询用户（默认过滤已软删记录） */
export const findUserById = async (
	id: number,
	db: DB,
): Promise<UserRecord | undefined> => {
	const rows = await db
		.select()
		.from(sysUser)
		.where(and(eq(sysUser.id, id), isNull(sysUser.deleteTime)));
	return rows[0]; // 可能为 undefined，由 routes 层判断
};

/** 创建用户 */
export const createUser = async (
	data: z.infer<typeof UserCreateBody>,
	db: DB,
): Promise<UserRecord | undefined> => {
	const [user] = await db.insert(sysUser).values(data).returning();
	return user;
};

/** 更新用户（默认过滤已软删记录，禁止改活已删数据） */
export const updateUser = async (
	id: number,
	data: z.infer<typeof UserUpdateBody>,
	db: DB,
): Promise<UserRecord | undefined> => {
	const [user] = await db
		.update(sysUser)
		.set(data)
		.where(and(eq(sysUser.id, id), isNull(sysUser.deleteTime)))
		.returning();
	return user;
};

/** 软删除用户（自身就是设 deleteTime，按软删规则不需要加 deleteTime 过滤） */
export const softDeleteUser = async (
	id: number,
	db: DB,
): Promise<UserRecord | undefined> => {
	const [user] = await db
		.update(sysUser)
		.set({ deleteTime: new Date().toISOString() })
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
): Promise<UserFormData | undefined> => {
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
		.where(and(isNull(sysUser.deleteTime), eq(sysUser.status, 1)));
	return rows.map((r) => ({
		value: String(r.id),
		label: r.nickname || r.username,
	}));
};

/** 批量软删除用户 */
export const batchSoftDeleteUsers = async (
	ids: number[],
	db: DB,
): Promise<UserRecord[]> => {
	if (ids.length === 0) {
		return [];
	}
	const users = await db
		.update(sysUser)
		.set({ deleteTime: new Date().toISOString() })
		.where(inArray(sysUser.id, ids))
		.returning();
	return users;
};

/** 重置用户密码（软删过滤，禁止重置已删用户的密码） */
export const resetUserPassword = async (
	id: number,
	password: string,
	db: DB,
): Promise<UserRecord | undefined> => {
	const [user] = await db
		.update(sysUser)
		.set({ password })
		.where(and(eq(sysUser.id, id), isNull(sysUser.deleteTime)))
		.returning();
	return user;
};
