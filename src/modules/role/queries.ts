import { and, count, eq, inArray, isNull, like } from "drizzle-orm";
import type z from "zod";
import type { DB } from "@/db/client";
import { tenantEq } from "@/db/helpers/tenant";
import { escapeLike } from "@/db/helpers/like";
import { sysDept } from "@/db/schema/system/dept";
import { sysMenu } from "@/db/schema/system/menu";
import {
	sysRoleDept,
	sysRoleMenu,
	sysUserRole,
} from "@/db/schema/system/relation";
import { sysRole } from "@/db/schema/system/role";
import { sysUser } from "@/db/schema/system/user";
import { BizError, ERR_CODE } from "@/lib/errors";
import type { PageResult } from "@/lib/pagination";
import type {
	RoleAssignDeptsBody,
	RoleAssignMenusBody,
	RoleCreateBody,
	RoleUpdateBody,
} from "./schema";
import type { RoleFormData, RoleRecord } from "./types";

/** 角色列表查询（软删过滤 + 租户隔离 + 可选 keywords/status 过滤） */
export const findRoles = async (
	query: {
		pageNum: number;
		pageSize: number;
		keywords?: string;
		status?: number;
	},
	tenantId: number,
	db: DB,
): Promise<PageResult<RoleRecord>> => {
	const where = [isNull(sysRole.deleteTime), tenantEq(sysRole.tenantId, tenantId)];
	if (query.keywords) {
		where.push(like(sysRole.name, `%${escapeLike(query.keywords)}%`));
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

/** 根据 ID 查角色（软删过滤 + 租户隔离） */
export const findRoleById = async (
	id: number,
	tenantId: number,
	db: DB,
): Promise<RoleRecord | undefined> => {
	const rows = await db
		.select()
		.from(sysRole)
		.where(
			and(
				eq(sysRole.id, id),
				tenantEq(sysRole.tenantId, tenantId),
				isNull(sysRole.deleteTime),
			),
		)
		.limit(1);
	return rows[0];
};

/** 创建角色（支持内联保存 deptIds，dataScope=5 时写入 sys_role_dept；注入 tenantId） */
export const createRole = async (
	data: z.infer<typeof RoleCreateBody>,
	tenantId: number,
	db: DB,
): Promise<RoleRecord> => {
	const { deptIds, ...roleData } = data;

	return await db.transaction(async (tx) => {
		const [role] = await tx
			.insert(sysRole)
			.values({ ...roleData, tenantId })
			.returning();
		if (!role) {
			throw new BizError(ERR_CODE.SYSTEM_ERROR, "创建角色失败：未返回插入记录");
		}

		if (roleData.dataScope === 5 && deptIds && deptIds.length > 0) {
			await tx
				.insert(sysRoleDept)
				.values(
					deptIds.map((deptId) => ({
						roleId: role.id,
						deptId,
						tenantId,
					})),
				);
		}

		return role;
	});
};

/** 更新角色（支持内联保存 deptIds，dataScope 变化时自动清理 sys_role_dept；加 tenantEq） */
export const updateRole = async (
	id: number,
	data: z.infer<typeof RoleUpdateBody>,
	tenantId: number,
	db: DB,
): Promise<RoleRecord | undefined> => {
	const { deptIds, ...roleData } = data;

	return await db.transaction(async (tx) => {
		const [role] = await tx
			.update(sysRole)
			.set(roleData)
			.where(
				and(
					eq(sysRole.id, id),
					tenantEq(sysRole.tenantId, tenantId),
					isNull(sysRole.deleteTime),
				),
			)
			.returning();

		if (!role) {
			return undefined;
		}

		// 有效 dataScope：请求传的优先，没传则取数据库当前值
		const effectiveDataScope = roleData.dataScope ?? role.dataScope;

		if (effectiveDataScope === 5) {
			await tx
				.delete(sysRoleDept)
				.where(and(eq(sysRoleDept.roleId, id), tenantEq(sysRoleDept.tenantId, tenantId)));
			if (deptIds && deptIds.length > 0) {
				await tx
					.insert(sysRoleDept)
					.values(
						deptIds.map((deptId) => ({
							roleId: id,
							deptId,
							tenantId,
						})),
					);
			}
		} else {
			await tx
				.delete(sysRoleDept)
				.where(and(eq(sysRoleDept.roleId, id), tenantEq(sysRoleDept.tenantId, tenantId)));
		}

		return role;
	});
};

/**
 * 软删除角色 + 清理关联（加 tenantEq 防跨租户误删）
 *
 * 事务内顺序：先解绑 user_role → 再解绑 role_menu / role_dept → 最后软删角色本体
 */
export const softDeleteRole = async (
	id: number,
	tenantId: number,
	db: DB,
): Promise<RoleRecord | undefined> => {
	return await db.transaction(async (tx) => {
		await tx
			.delete(sysUserRole)
			.where(and(eq(sysUserRole.roleId, id), tenantEq(sysUserRole.tenantId, tenantId)));
		await tx
			.delete(sysRoleMenu)
			.where(and(eq(sysRoleMenu.roleId, id), tenantEq(sysRoleMenu.tenantId, tenantId)));
		await tx
			.delete(sysRoleDept)
			.where(and(eq(sysRoleDept.roleId, id), tenantEq(sysRoleDept.tenantId, tenantId)));
		const [role] = await tx
			.update(sysRole)
			.set({ deleteTime: new Date().toISOString() })
			.where(
				and(eq(sysRole.id, id), tenantEq(sysRole.tenantId, tenantId)),
			)
			.returning();
		return role;
	});
};

/** 查某角色已绑定的菜单 ID 列表（前端"角色编辑"页回显用；加 tenantEq） */
export const findRoleMenuIds = async (
	roleId: number,
	tenantId: number,
	db: DB,
): Promise<number[]> => {
	const rows = await db
		.select({ menuId: sysRoleMenu.menuId })
		.from(sysRoleMenu)
		.where(
			and(
				eq(sysRoleMenu.roleId, roleId),
				tenantEq(sysRoleMenu.tenantId, tenantId),
			),
		);
	return rows.map((r) => r.menuId);
};

/** 查某角色已绑定的部门 ID 列表（加 tenantEq） */
export const findRoleDeptIds = async (
	roleId: number,
	tenantId: number,
	db: DB,
): Promise<number[]> => {
	const rows = await db
		.select({ deptId: sysRoleDept.deptId })
		.from(sysRoleDept)
		.where(
			and(
				eq(sysRoleDept.roleId, roleId),
				tenantEq(sysRoleDept.tenantId, tenantId),
			),
		);
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
		.where(and(inArray(sysMenu.id, menuIds), isNull(sysMenu.deleteTime)));
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
		.where(and(inArray(sysDept.id, deptIds), isNull(sysDept.deleteTime)));
	return rows.map((r) => r.id);
};

/**
 * 替换角色菜单绑定（事务内先删后插；注入 tenantId）
 */
export const replaceRoleMenus = async (
	roleId: number,
	menuIds: z.infer<typeof RoleAssignMenusBody>,
	tenantId: number,
	db: DB,
): Promise<void> => {
	return await db.transaction(async (tx) => {
		await tx
			.delete(sysRoleMenu)
			.where(and(eq(sysRoleMenu.roleId, roleId), tenantEq(sysRoleMenu.tenantId, tenantId)));
		if (menuIds.length > 0) {
			await tx
				.insert(sysRoleMenu)
				.values(
					menuIds.map((menuId) => ({ roleId, menuId, tenantId })),
				);
		}
	});
};

/**
 * 替换角色部门绑定（事务内先删后插；注入 tenantId）
 */
export const replaceRoleDepts = async (
	roleId: number,
	body: z.infer<typeof RoleAssignDeptsBody>,
	tenantId: number,
	db: DB,
): Promise<void> => {
	return await db.transaction(async (tx) => {
		await tx
			.delete(sysRoleDept)
			.where(and(eq(sysRoleDept.roleId, roleId), tenantEq(sysRoleDept.tenantId, tenantId)));
		if (body.deptIds.length > 0) {
			await tx
				.insert(sysRoleDept)
				.values(
					body.deptIds.map((deptId) => ({ roleId, deptId, tenantId })),
				);
		}
	});
};

/** 角色下拉选项（供前端下拉选择器使用；加 tenantEq） */
export const findRoleOptions = async (
	tenantId: number,
	db: DB,
): Promise<Array<{ value: string; label: string }>> => {
	const rows = await db
		.select({ id: sysRole.id, name: sysRole.name })
		.from(sysRole)
		.where(
			and(
				tenantEq(sysRole.tenantId, tenantId),
				isNull(sysRole.deleteTime),
			),
		)
		.orderBy(sysRole.sort);
	return rows.map((r) => ({ value: String(r.id), label: r.name }));
};

/**
 * 获取角色表单数据（含已绑定的部门 ID 列表；加 tenantEq）
 */
export const findRoleFormData = async (
	id: number,
	tenantId: number,
	db: DB,
): Promise<RoleFormData | undefined> => {
	const role = await findRoleById(id, tenantId, db);
	if (!role) {
		return undefined;
	}
	let deptIds: number[] = [];
	if (role.dataScope === 5) {
		const rows = await db
			.select({ deptId: sysRoleDept.deptId })
			.from(sysRoleDept)
			.where(
				and(
					eq(sysRoleDept.roleId, id),
					tenantEq(sysRoleDept.tenantId, tenantId),
				),
			);
		deptIds = rows.map((r) => r.deptId);
	}
	return { ...role, deptIds };
};

/**
 * 判断某角色是否已被"未软删"用户绑定（用于软删前置拦截；加 tenantEq）
 */
export const isRoleAssignedToUsers = async (
	roleId: number,
	tenantId: number,
	db: DB,
): Promise<boolean> => {
	const rows = await db
		.select({ userId: sysUserRole.userId })
		.from(sysUserRole)
		.innerJoin(sysUser, eq(sysUserRole.userId, sysUser.id))
		.where(
			and(
				eq(sysUserRole.roleId, roleId),
				tenantEq(sysUserRole.tenantId, tenantId),
				isNull(sysUser.deleteTime),
			),
		)
		.limit(1);
	return rows.length > 0;
};

/**
 * 批量软删除角色 + 清理关联（加 tenantEq 防跨租户误删）
 */
export const batchSoftDeleteRoles = async (
	ids: number[],
	tenantId: number,
	db: DB,
): Promise<RoleRecord[]> => {
	if (ids.length === 0) {
		return [];
	}
	return await db.transaction(async (tx) => {
		await tx
			.delete(sysUserRole)
			.where(and(inArray(sysUserRole.roleId, ids), tenantEq(sysUserRole.tenantId, tenantId)));
		await tx
			.delete(sysRoleMenu)
			.where(and(inArray(sysRoleMenu.roleId, ids), tenantEq(sysRoleMenu.tenantId, tenantId)));
		await tx
			.delete(sysRoleDept)
			.where(and(inArray(sysRoleDept.roleId, ids), tenantEq(sysRoleDept.tenantId, tenantId)));
		const roles = await tx
			.update(sysRole)
			.set({ deleteTime: new Date().toISOString() })
			.where(
				and(
					inArray(sysRole.id, ids),
					tenantEq(sysRole.tenantId, tenantId),
					isNull(sysRole.deleteTime),
				),
			)
			.returning();
		return roles;
	});
};
