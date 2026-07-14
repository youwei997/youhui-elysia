import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { hashPassword } from "@/lib/password";
import { BizError, ERR_CODE } from "@/lib/errors";
import { sysTenant } from "@/db/schema/system/tenant";
import { sysTenantMenu } from "@/db/schema/system/tenant-menu";
import { sysTenantPlanMenu } from "@/db/schema/system/tenant-plan-menu";
import { sysDept } from "@/db/schema/system/dept";
import { sysMenu } from "@/db/schema/system/menu";
import { sysRole } from "@/db/schema/system/role";
import { sysUser } from "@/db/schema/system/user";
import { sysRoleDept, sysRoleMenu, sysUserRole } from "@/db/schema/system/relation";
import type { TenantCreateResult, TenantRecord } from "./types";

/** 平台租户 ID */
export const PLATFORM_TENANT_ID = 0;

/**
 * 租户列表查询（分页，支持关键字/状态过滤）
 */
export const findTenants = async (
	query: {
		pageNum: number;
		pageSize: number;
		keywords?: string;
		status?: number;
	},
	db: DB,
): Promise<{ list: TenantRecord[]; total: number }> => {
	const where = [];

	if (query.keywords) {
		where.push(
			sql`${sysTenant.name} LIKE ${`%${query.keywords}%`} OR ${sysTenant.code} LIKE ${`%${query.keywords}%`}`,
		);
	}
	if (query.status !== undefined) {
		where.push(eq(sysTenant.status, query.status));
	}

	const whereClause = where.length > 0 ? and(...where) : undefined;

	const list = await db
		.select()
		.from(sysTenant)
		.where(whereClause)
		.orderBy(sql`${sysTenant.id} ASC`)
		.limit(query.pageSize)
		.offset((query.pageNum - 1) * query.pageSize);

	const [{ total = 0 } = {}] = await db
		.select({ total: count() })
		.from(sysTenant)
		.where(whereClause);

	return { list, total };
};

/**
 * 按 ID 查租户
 */
export const findTenantById = async (id: number, db: DB): Promise<TenantRecord | undefined> => {
	const [tenant] = await db
		.select()
		.from(sysTenant)
		.where(eq(sysTenant.id, id))
		.limit(1);
	return tenant;
};

/**
 * 按 ID 查活跃租户（存在且 status=1），供 switch-tenant 状态校验
 */
export const findActiveTenantById = async (
	id: number,
	db: DB,
): Promise<TenantRecord | undefined> => {
	const [tenant] = await db
		.select()
		.from(sysTenant)
		.where(and(eq(sysTenant.id, id), eq(sysTenant.status, 1)))
		.limit(1);
	return tenant;
};

/**
 * 租户选项列表（用于切换下拉），平台租户返回全量
 */
export const findTenantOptions = async (tenantId: number, db: DB): Promise<{ id: number; name: string; code: string }[]> => {
	if (tenantId === PLATFORM_TENANT_ID) {
		return db
			.select({ id: sysTenant.id, name: sysTenant.name, code: sysTenant.code })
			.from(sysTenant)
			.where(eq(sysTenant.status, 1))
			.orderBy(sql`${sysTenant.id} ASC`);
	}
	const [tenant] = await db
		.select({ id: sysTenant.id, name: sysTenant.name, code: sysTenant.code })
		.from(sysTenant)
		.where(and(eq(sysTenant.id, tenantId), eq(sysTenant.status, 1)))
		.limit(1);
	return tenant ? [tenant] : [];
};

/**
 * 创建租户（事务：创建租户 + 管理员用户 + 角色 + 部门 + 菜单绑定）
 */
export const createTenant = async (
	data: {
		name: string;
		code: string;
		contactName?: string;
		contactPhone?: string;
		contactEmail?: string;
		domain?: string;
		logo?: string;
		planId?: number;
		remark?: string;
		expireTime?: string;
		adminUsername: string;
		adminPassword: string;
	},
	db: DB,
): Promise<TenantCreateResult> => {
	return await db.transaction(async (tx) => {
		const now = new Date().toISOString();
		const { adminUsername, adminPassword } = data;

		// 1. 校验编码唯一
		const existingCode = await tx
			.select()
			.from(sysTenant)
			.where(eq(sysTenant.code, data.code))
			.limit(1);
		if (existingCode.length > 0) {
			throw new BizError(ERR_CODE.TENANT_CODE_DUPLICATE);
		}

		// 2. 创建租户
		const tenantRows = await tx.insert(sysTenant).values({
			name: data.name,
			code: data.code,
			contactName: data.contactName ?? null,
			contactPhone: data.contactPhone ?? null,
			contactEmail: data.contactEmail ?? null,
			domain: data.domain ?? null,
			logo: data.logo ?? null,
			planId: data.planId ?? null,
			remark: data.remark ?? null,
			expireTime: data.expireTime ?? null,
			status: 1,
		}).returning();
		if (tenantRows.length === 0) {
			throw new BizError(ERR_CODE.SYSTEM_ERROR, "创建租户失败");
		}
		const tenant = tenantRows[0]!;

		// 3. 解析菜单 ID（套餐菜单 or 兜底业务菜单）
		let menuIds: number[];
		if (data.planId) {
			const planRows = await tx
				.select({ menuId: sysTenantPlanMenu.menuId })
				.from(sysTenantPlanMenu)
				.where(eq(sysTenantPlanMenu.planId, data.planId));
			if (planRows.length > 0) {
				menuIds = planRows.map((r) => r.menuId);
			} else {
				const defaultRows = await tx
					.select({ id: sysMenu.id })
					.from(sysMenu)
					.where(and(eq(sysMenu.scope, 2), isNull(sysMenu.deleteTime)));
				menuIds = defaultRows.map((r) => r.id);
			}
		} else {
			const defaultRows = await tx
				.select({ id: sysMenu.id })
				.from(sysMenu)
				.where(and(eq(sysMenu.scope, 2), isNull(sysMenu.deleteTime)));
			menuIds = defaultRows.map((r) => r.id);
		}

		// 4. 创建根部门
		const deptRows = await tx.insert(sysDept).values({
			tenantId: tenant.id,
			name: `${data.name} 管理部门`,
			code: `${data.code}_DEPT`,
			parentId: 0,
			treePath: "0,",
			sort: 0,
			status: 1,
			createTime: now,
			updateTime: now,
		}).returning();
		if (deptRows.length === 0) {
			throw new BizError(ERR_CODE.SYSTEM_ERROR, "创建租户根部门失败");
		}
		const dept = deptRows[0]!;

		// 5. 创建管理员用户
		const hashedPassword = await hashPassword(adminPassword);
		const userRows = await tx.insert(sysUser).values({
			tenantId: tenant.id,
			username: adminUsername,
			password: hashedPassword,
			nickname: "租户管理员",
			gender: 1,
			deptId: dept.id,
			status: 1,
			createTime: now,
			updateTime: now,
		}).returning();
		if (userRows.length === 0) {
			throw new BizError(ERR_CODE.SYSTEM_ERROR, "创建租户管理员失败");
		}
		const user = userRows[0]!;

		// 6. 创建管理员角色
		const adminRoleCode = `TENANT_ADMIN_${data.code}`;
		const roleRows = await tx.insert(sysRole).values({
			tenantId: tenant.id,
			name: `${data.name} 管理员`,
			code: adminRoleCode,
			sort: 1,
			status: 1,
			dataScope: 4,
			createTime: now,
			updateTime: now,
		}).returning();
		if (roleRows.length === 0) {
			throw new BizError(ERR_CODE.SYSTEM_ERROR, "创建租户管理员角色失败");
		}
		const role = roleRows[0]!;

		// 7. 绑定用户-角色
		await tx.insert(sysUserRole).values({
			tenantId: tenant.id,
			userId: user.id,
			roleId: role.id,
		});

		// 8. 绑定角色-菜单
		if (menuIds.length > 0) {
			await tx.insert(sysRoleMenu).values(
				menuIds.map((menuId) => ({
					tenantId: tenant.id,
					roleId: role.id,
					menuId,
				})),
			);
		}

		// 9. 绑定租户-菜单
		await tx.insert(sysTenantMenu).values(
			menuIds.map((menuId) => ({
				tenantId: tenant.id,
				menuId,
			})),
		);

		return {
			tenant,
			adminUsername,
			adminInitialPassword: adminPassword,
			adminRoleCode,
		};
	});
};

/**
 * 更新租户基本信息
 */
export const updateTenant = async (
	id: number,
	data: {
		name?: string;
		contactName?: string;
		contactPhone?: string;
		contactEmail?: string;
		domain?: string;
		logo?: string;
		planId?: number;
		remark?: string;
		expireTime?: string;
	},
	db: DB,
): Promise<TenantRecord | undefined> => {
	const [tenant] = await db
		.update(sysTenant)
		.set({
			...data,
			updateTime: new Date().toISOString(),
		})
		.where(eq(sysTenant.id, id))
		.returning();
	return tenant;
};

/**
 * 硬删租户（前置校验：非平台租户、无用户）
 */
export const deleteTenants = async (ids: number[], db: DB): Promise<number> => {
	return await db.transaction(async (tx) => {
		// 1. 校验：不可删除平台租户
		if (ids.includes(PLATFORM_TENANT_ID)) {
			throw new BizError(ERR_CODE.TENANT_PROTECTED);
		}

		// 2. 校验：每个租户下不可有用户
		const userCounts = await tx
			.select({ tenantId: sysUser.tenantId, count: count() })
			.from(sysUser)
			.where(and(inArray(sysUser.tenantId, ids), isNull(sysUser.deleteTime)))
			.groupBy(sysUser.tenantId);

		const tenantsWithUsers = new Set(userCounts.map((r) => r.tenantId));
		if (tenantsWithUsers.size > 0) {
			throw new BizError(ERR_CODE.TENANT_HAS_USERS);
		}

		// 3. 级联清理关联数据
		await tx.delete(sysTenantMenu).where(inArray(sysTenantMenu.tenantId, ids));
		await tx.delete(sysUserRole).where(inArray(sysUserRole.tenantId, ids));
		await tx.delete(sysRoleMenu).where(inArray(sysRoleMenu.tenantId, ids));
		await tx.delete(sysRoleDept).where(inArray(sysRoleDept.tenantId, ids));

		// 4. 硬删租户
		const result = await tx
			.delete(sysTenant)
			.where(inArray(sysTenant.id, ids))
			.returning({ id: sysTenant.id });
		return result.length;
	});
};

/**
 * 更新租户状态
 */
export const updateTenantStatus = async (
	id: number,
	status: number,
	db: DB,
): Promise<TenantRecord | undefined> => {
	// 平台租户不可禁用
	if (id === PLATFORM_TENANT_ID && status === 0) {
		throw new BizError(ERR_CODE.TENANT_PROTECTED);
	}

	const [tenant] = await db
		.update(sysTenant)
		.set({ status, updateTime: new Date().toISOString() })
		.where(eq(sysTenant.id, id))
		.returning();
	return tenant;
};

/**
 * 获取租户已授权菜单 ID 列表
 */
export const findTenantMenuIds = async (tenantId: number, db: DB): Promise<number[]> => {
	if (tenantId === PLATFORM_TENANT_ID) {
		throw new BizError(ERR_CODE.TENANT_PROTECTED);
	}

	const rows = await db
		.select({ menuId: sysTenantMenu.menuId })
		.from(sysTenantMenu)
		.where(eq(sysTenantMenu.tenantId, tenantId));
	return rows.map((r) => r.menuId);
};

/**
 * 更新租户菜单授权
 */
export const updateTenantMenus = async (
	tenantId: number,
	menuIds: number[],
	db: DB,
): Promise<void> => {
	if (tenantId === PLATFORM_TENANT_ID) {
		throw new BizError(ERR_CODE.TENANT_PROTECTED);
	}

	// 1. 获取套餐菜单集合（或兜底业务菜单）
	const planMenuIds = await resolvePlanMenuIds(tenantId, db);
	const planMenuSet = new Set(planMenuIds);

	// 2. 校验提交的 menuIds 是套餐菜单的子集
	for (const menuId of menuIds) {
		if (!planMenuSet.has(menuId)) {
			throw new BizError(ERR_CODE.TENANT_MENU_NOT_IN_PLAN);
		}
	}

	// 3. 替换租户菜单
	await db.transaction(async (tx) => {
		await tx.delete(sysTenantMenu).where(eq(sysTenantMenu.tenantId, tenantId));
		if (menuIds.length > 0) {
			await tx.insert(sysTenantMenu).values(
				menuIds.map((menuId) => ({
					tenantId,
					menuId,
				})),
			);
		}
	});
};

/**
 * 解析租户当前套餐菜单 ID 列表（供 updateTenantMenus 校验用）
 */
const resolvePlanMenuIds = async (tenantId: number, db: DB): Promise<number[]> => {
	const [tenant] = await db
		.select({ planId: sysTenant.planId })
		.from(sysTenant)
		.where(eq(sysTenant.id, tenantId))
		.limit(1);

	if (!tenant?.planId) {
		return resolveDefaultBusinessMenuIds(db);
	}

	const rows = await db
		.select({ menuId: sysTenantPlanMenu.menuId })
		.from(sysTenantPlanMenu)
		.where(eq(sysTenantPlanMenu.planId, tenant.planId));
	if (rows.length > 0) {
		return rows.map((r) => r.menuId);
	}
	return resolveDefaultBusinessMenuIds(db);
};

/**
 * 兜底：全部业务菜单（scope=2）
 */
const resolveDefaultBusinessMenuIds = async (db: DB): Promise<number[]> => {
	const rows = await db
		.select({ id: sysMenu.id })
		.from(sysMenu)
		.where(and(eq(sysMenu.scope, 2), isNull(sysMenu.deleteTime)));
	return rows.map((r) => r.id);
};
