import { and, count, eq, inArray, isNull, like } from "drizzle-orm";
import type z from "zod";
import { type DB, db as defaultDb } from "@/db/client";
import type { PageResult } from "@/db/helpers/pagination";
import { sysDept } from "@/db/schema/system/dept";
import { sysMenu } from "@/db/schema/system/menu";
import {
	sysRoleDept,
	sysRoleMenu,
	sysUserRole,
} from "@/db/schema/system/relation";
import { sysRole } from "@/db/schema/system/role";
import type {
	RoleAssignDeptsBody,
	RoleAssignMenusBody,
	RoleCreateBody,
	RoleUpdateBody,
} from "./schema";

/** 角色列表查询（软删过滤 + 可选 code/name/status 过滤） */
export const findRoles = async (
	db: DB = defaultDb,
	query: {
		pageNum: number;
		pageSize: number;
		code?: string;
		name?: string;
		status?: number;
	},
): Promise<PageResult<typeof sysRole.$inferSelect>> => {
	const where = [isNull(sysRole.deletedAt)];
	if (query.code) {
		where.push(eq(sysRole.code, query.code));
	}
	if (query.name) {
		where.push(like(sysRole.name, `%${query.name}%`));
	}
	if (query.status !== undefined) {
		where.push(eq(sysRole.status, query.status));
	}

	const list = await db
		.select()
		.from(sysRole)
		.where(and(...where))
		.limit(query.pageSize)
		.offset((query.pageNum - 1) * query.pageSize);

	const [{ total = 0 } = {}] = await db
		.select({ total: count() })
		.from(sysRole)
		.where(and(...where));

	return { list, total };
};

/** 根据 ID 查角色（软删过滤） */
export const findRoleById = async (db: DB = defaultDb, id: number) => {
	const rows = await db
		.select()
		.from(sysRole)
		.where(and(eq(sysRole.id, id), isNull(sysRole.deletedAt)))
		.limit(1);
	return rows[0];
};

/** 创建角色 */
export const createRole = async (
	db: DB = defaultDb,
	data: z.infer<typeof RoleCreateBody>,
) => {
	const [role] = await db.insert(sysRole).values(data).returning();
	return role;
};

/** 更新角色（软删过滤） */
export const updateRole = async (
	db: DB = defaultDb,
	id: number,
	data: z.infer<typeof RoleUpdateBody>,
) => {
	const [role] = await db
		.update(sysRole)
		.set(data)
		.where(and(eq(sysRole.id, id), isNull(sysRole.deletedAt)))
		.returning();
	return role;
};

/**
 * 软删除角色 + 清理关联
 *
 * 事务内顺序：先解绑 user_role → 再解绑 role_menu / role_dept → 最后软删角色本体
 * 顺序保证：解绑过程若依赖"角色还存在"的事实，先删会留 FK 悬挂（虽然当前 schema 没建 FK，
 * 但语义上要保持"先解绑再标记删除"）
 */
export const softDeleteRole = async (db: DB = defaultDb, id: number) => {
	return await db.transaction(async (tx) => {
		await tx.delete(sysUserRole).where(eq(sysUserRole.roleId, id));
		await tx.delete(sysRoleMenu).where(eq(sysRoleMenu.roleId, id));
		await tx.delete(sysRoleDept).where(eq(sysRoleDept.roleId, id));
		const [role] = await tx
			.update(sysRole)
			.set({ deletedAt: new Date().toISOString() })
			.where(eq(sysRole.id, id))
			.returning();
		return role;
	});
};

/** 查某角色已绑定的菜单 ID 列表（前端"角色编辑"页回显用） */
export const findRoleMenuIds = async (db: DB = defaultDb, roleId: number) => {
	const rows = await db
		.select({ menuId: sysRoleMenu.menuId })
		.from(sysRoleMenu)
		.where(eq(sysRoleMenu.roleId, roleId));
	return rows.map((r) => r.menuId);
};

/** 查某角色已绑定的部门 ID 列表 */
export const findRoleDeptIds = async (db: DB = defaultDb, roleId: number) => {
	const rows = await db
		.select({ deptId: sysRoleDept.deptId })
		.from(sysRoleDept)
		.where(eq(sysRoleDept.roleId, roleId));
	return rows.map((r) => r.deptId);
};

/**
 * 过滤出"合法且未软删"的菜单 ID 子集
 *
 * 给 routes 层在调 replaceRoleMenus 之前做前置校验用：
 * 把请求里的 menuIds 与 DB 实际存在的有效 ID 取交集，
 * 调用方对比请求长度即可知道哪些 ID 非法。
 *
 * 不在事务内、不抛错，遵守 queries 纯函数约定。
 */
export const findValidMenuIds = async (
	db: DB = defaultDb,
	menuIds: number[],
): Promise<number[]> => {
	if (menuIds.length === 0) {
		return [];
	}
	const rows = await db
		.select({ id: sysMenu.id })
		.from(sysMenu)
		.where(and(inArray(sysMenu.id, menuIds), isNull(sysMenu.deletedAt)));
	return rows.map((r) => r.id);
};

/**
 * 过滤出"合法且未软删"的部门 ID 子集
 *
 * 与 findValidMenuIds 同模式，用于 replaceRoleDepts 的前置校验。
 * 避免传非法 deptId 导致 sys_role_dept 留下悬空关联。
 */
export const findValidDeptIds = async (
	db: DB = defaultDb,
	deptIds: number[],
): Promise<number[]> => {
	if (deptIds.length === 0) {
		return [];
	}
	const rows = await db
		.select({ id: sysDept.id })
		.from(sysDept)
		.where(and(inArray(sysDept.id, deptIds), isNull(sysDept.deletedAt)));
	return rows.map((r) => r.id);
};

/**
 * 替换角色菜单绑定（事务内先删后插）
 *
 * 入口业务规则（角色存在 / dataScope / menuId 合法性）由 routes 层前置校验，
 * 本函数只做"换绑"动作，事务内不再做业务校验，保持 queries 纯函数性质。
 */
export const replaceRoleMenus = async (
	db: DB = defaultDb,
	roleId: number,
	body: z.infer<typeof RoleAssignMenusBody>,
) => {
	return await db.transaction(async (tx) => {
		await tx.delete(sysRoleMenu).where(eq(sysRoleMenu.roleId, roleId));
		if (body.menuIds.length > 0) {
			await tx
				.insert(sysRoleMenu)
				.values(body.menuIds.map((menuId) => ({ roleId, menuId })));
		}
	});
};

/**
 * 替换角色部门绑定（事务内先删后插）
 * 与 replaceRoleMenus 同结构，业务规则（仅 dataScope=5）由 routes 层把关
 */
export const replaceRoleDepts = async (
	db: DB = defaultDb,
	roleId: number,
	body: z.infer<typeof RoleAssignDeptsBody>,
) => {
	return await db.transaction(async (tx) => {
		await tx.delete(sysRoleDept).where(eq(sysRoleDept.roleId, roleId));
		if (body.deptIds.length > 0) {
			await tx
				.insert(sysRoleDept)
				.values(body.deptIds.map((deptId) => ({ roleId, deptId })));
		}
	});
};

/** 判断某角色是否已被用户绑定（用于软删前置拦截） */
export const isRoleAssignedToUsers = async (
	db: DB = defaultDb,
	roleId: number,
): Promise<boolean> => {
	const rows = await db
		.select({ userId: sysUserRole.userId })
		.from(sysUserRole)
		.where(eq(sysUserRole.roleId, roleId))
		.limit(1);
	return rows.length > 0;
};
