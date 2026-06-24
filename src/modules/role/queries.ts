import { and, count, eq, inArray, isNull, like } from "drizzle-orm";
import type z from "zod";
import type { DB } from "@/db/client";
import type { PageResult } from "@/db/helpers/pagination";
import { sysDept } from "@/db/schema/system/dept";
import { sysMenu } from "@/db/schema/system/menu";
import {
	sysRoleDept,
	sysRoleMenu,
	sysUserRole,
} from "@/db/schema/system/relation";
import { sysRole } from "@/db/schema/system/role";
import { sysUser } from "@/db/schema/system/user";
import type {
	RoleAssignDeptsBody,
	RoleAssignMenusBody,
	RoleCreateBody,
	RoleUpdateBody,
} from "./schema";

/** 角色列表查询（软删过滤 + 可选 code/name/status 过滤） */
export const findRoles = async (
	query: {
		pageNum: number;
		pageSize: number;
		code?: string;
		name?: string;
		status?: number;
	},
	db: DB,
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
export const findRoleById = async (id: number, db: DB) => {
	const rows = await db
		.select()
		.from(sysRole)
		.where(and(eq(sysRole.id, id), isNull(sysRole.deletedAt)))
		.limit(1);
	return rows[0];
};

/** 创建角色（支持内联保存 deptIds，dataScope=5 时写入 sys_role_dept） */
export const createRole = async (
	data: z.infer<typeof RoleCreateBody>,
	db: DB,
) => {
	const { deptIds, ...roleData } = data;

	return await db.transaction(async (tx) => {
		const [role] = await tx.insert(sysRole).values(roleData).returning();
		if (!role) {
			throw new Error("创建角色失败：未返回插入记录");
		}

		if (roleData.dataScope === 5 && deptIds && deptIds.length > 0) {
			await tx
				.insert(sysRoleDept)
				.values(deptIds.map((deptId) => ({ roleId: role.id, deptId })));
		}

		return role;
	});
};

/** 更新角色（支持内联保存 deptIds，dataScope 变化时自动清理 sys_role_dept） */
export const updateRole = async (
	id: number,
	data: z.infer<typeof RoleUpdateBody>,
	db: DB,
) => {
	const { deptIds, ...roleData } = data;

	return await db.transaction(async (tx) => {
		const [role] = await tx
			.update(sysRole)
			.set(roleData)
			.where(and(eq(sysRole.id, id), isNull(sysRole.deletedAt)))
			.returning();

		if (!role) {
			return undefined;
		}

		// 有效 dataScope：请求传的优先，没传则取数据库当前值
		const effectiveDataScope = roleData.dataScope ?? role.dataScope;

		if (effectiveDataScope === 5) {
			await tx.delete(sysRoleDept).where(eq(sysRoleDept.roleId, id));
			if (deptIds && deptIds.length > 0) {
				await tx
					.insert(sysRoleDept)
					.values(deptIds.map((deptId) => ({ roleId: id, deptId })));
			}
		} else {
			await tx.delete(sysRoleDept).where(eq(sysRoleDept.roleId, id));
		}

		return role;
	});
};

/**
 * 软删除角色 + 清理关联
 *
 * 事务内顺序：先解绑 user_role → 再解绑 role_menu / role_dept → 最后软删角色本体
 * 顺序保证：解绑过程若依赖"角色还存在"的事实，先删会留 FK 悬挂（虽然当前 schema 没建 FK，
 * 但语义上要保持"先解绑再标记删除"）
 */
export const softDeleteRole = async (id: number, db: DB) => {
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
export const findRoleMenuIds = async (roleId: number, db: DB) => {
	const rows = await db
		.select({ menuId: sysRoleMenu.menuId })
		.from(sysRoleMenu)
		.where(eq(sysRoleMenu.roleId, roleId));
	return rows.map((r) => r.menuId);
};

/** 查某角色已绑定的部门 ID 列表 */
export const findRoleDeptIds = async (roleId: number, db: DB) => {
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
	menuIds: number[],
	db: DB,
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
	deptIds: number[],
	db: DB,
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
	roleId: number,
	menuIds: z.infer<typeof RoleAssignMenusBody>,
	db: DB,
) => {
	return await db.transaction(async (tx) => {
		await tx.delete(sysRoleMenu).where(eq(sysRoleMenu.roleId, roleId));
		if (menuIds.length > 0) {
			await tx
				.insert(sysRoleMenu)
				.values(menuIds.map((menuId) => ({ roleId, menuId })));
		}
	});
};

/**
 * 替换角色部门绑定（事务内先删后插）
 * 与 replaceRoleMenus 同结构，业务规则（仅 dataScope=5）由 routes 层把关
 */
export const replaceRoleDepts = async (
	roleId: number,
	body: z.infer<typeof RoleAssignDeptsBody>,
	db: DB,
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

/** 角色下拉选项（供前端下拉选择器使用） */
export const findRoleOptions = async (db: DB) => {
	const rows = await db
		.select({ id: sysRole.id, name: sysRole.name })
		.from(sysRole)
		.where(isNull(sysRole.deletedAt))
		.orderBy(sysRole.sort);
	return rows.map((r) => ({ value: String(r.id), label: r.name }));
};

/**
 * 获取角色表单数据（含已绑定的部门 ID 列表）
 * 当 dataScope=5（CUSTOM）时额外查询 sys_role_dept
 */
export const findRoleFormData = async (id: number, db: DB) => {
	const role = await findRoleById(id, db);
	if (!role) {
		return undefined;
	}
	let deptIds: number[] = [];
	if (role.dataScope === 5) {
		const rows = await db
			.select({ deptId: sysRoleDept.deptId })
			.from(sysRoleDept)
			.where(eq(sysRoleDept.roleId, id));
		deptIds = rows.map((r) => r.deptId);
	}
	return { ...role, deptIds };
};

/**
 * 判断某角色是否已被"未软删"用户绑定（用于软删前置拦截）
 *
 * 必须 JOIN sys_user 过滤已删用户，否则角色只分配给已软删用户时
 * 会误判"有用户占用"，导致角色无法删除。
 */
export const isRoleAssignedToUsers = async (
	roleId: number,
	db: DB,
): Promise<boolean> => {
	const rows = await db
		.select({ userId: sysUserRole.userId })
		.from(sysUserRole)
		.innerJoin(sysUser, eq(sysUserRole.userId, sysUser.id))
		.where(and(eq(sysUserRole.roleId, roleId), isNull(sysUser.deletedAt)))
		.limit(1);
	return rows.length > 0;
};

/**
 * 批量软删除角色 + 清理关联
 *
 * 与 softDeleteRole 同逻辑，但使用 inArray 批量操作，
 * 单事务内完成所有 junction 表清理 + 角色软删，减少往返。
 * 前置拦截（受保护角色 / 已绑定用户）由 routes 层负责。
 */
export const batchSoftDeleteRoles = async (ids: number[], db: DB) => {
	if (ids.length === 0) {
		return [];
	}
	return await db.transaction(async (tx) => {
		await tx.delete(sysUserRole).where(inArray(sysUserRole.roleId, ids));
		await tx.delete(sysRoleMenu).where(inArray(sysRoleMenu.roleId, ids));
		await tx.delete(sysRoleDept).where(inArray(sysRoleDept.roleId, ids));
		const roles = await tx
			.update(sysRole)
			.set({ deletedAt: new Date().toISOString() })
			.where(and(inArray(sysRole.id, ids), isNull(sysRole.deletedAt)))
			.returning();
		return roles;
	});
};
