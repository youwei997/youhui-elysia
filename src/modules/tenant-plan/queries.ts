import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { BizError, ERR_CODE } from "@/lib/errors";
import { sysTenantPlan } from "@/db/schema/system/tenant-plan";
import { sysTenantPlanMenu } from "@/db/schema/system/tenant-plan-menu";
import { sysMenu } from "@/db/schema/system/menu";
import type { TenantPlanRecord } from "./types";

/**
 * 套餐列表查询（分页，支持关键字/状态过滤）
 */
export const findTenantPlans = async (
	query: {
		pageNum: number;
		pageSize: number;
		keywords?: string;
		status?: number;
	},
	db: DB,
): Promise<{ list: TenantPlanRecord[]; total: number }> => {
	const where = [];

	if (query.keywords) {
		where.push(
			sql`${sysTenantPlan.name} LIKE ${`%${query.keywords}%`} OR ${sysTenantPlan.code} LIKE ${`%${query.keywords}%`}`,
		);
	}
	if (query.status !== undefined) {
		where.push(eq(sysTenantPlan.status, query.status));
	}

	const whereClause = where.length > 0 ? and(...where) : undefined;

	const list = await db
		.select()
		.from(sysTenantPlan)
		.where(whereClause)
		.orderBy(sql`${sysTenantPlan.sort} ASC, ${sysTenantPlan.id} ASC`)
		.limit(query.pageSize)
		.offset((query.pageNum - 1) * query.pageSize);

	const [{ total = 0 } = {}] = await db
		.select({ total: count() })
		.from(sysTenantPlan)
		.where(whereClause);

	return { list, total };
};

/**
 * 按 ID 查套餐
 */
export const findTenantPlanById = async (
	id: number,
	db: DB,
): Promise<TenantPlanRecord | undefined> => {
	const [plan] = await db
		.select()
		.from(sysTenantPlan)
		.where(eq(sysTenantPlan.id, id))
		.limit(1);
	return plan;
};

/**
 * 套餐选项列表
 */
export const findTenantPlanOptions = async (db: DB): Promise<{ id: number; name: string; code: string }[]> => {
	return db
		.select({ id: sysTenantPlan.id, name: sysTenantPlan.name, code: sysTenantPlan.code })
		.from(sysTenantPlan)
		.where(eq(sysTenantPlan.status, 1))
		.orderBy(sql`${sysTenantPlan.sort} ASC, ${sysTenantPlan.id} ASC`);
};

/**
 * 创建套餐
 */
export const createTenantPlan = async (
	data: {
		name: string;
		code: string;
		status: number;
		sort: number | null;
		remark?: string | null;
	},
	db: DB,
): Promise<TenantPlanRecord> => {
	const [plan] = await db
		.insert(sysTenantPlan)
		.values({
			name: data.name,
			code: data.code,
			status: data.status,
			sort: data.sort,
			remark: data.remark ?? null,
		})
		.returning();
	return plan!;
};

/**
 * 更新套餐
 */
export const updateTenantPlan = async (
	id: number,
	data: {
		name?: string;
		status?: number;
		sort?: number;
		remark?: string;
	},
	db: DB,
): Promise<TenantPlanRecord | undefined> => {
	const updateData: Record<string, unknown> = {};
	if (data.name !== undefined) updateData.name = data.name;
	if (data.status !== undefined) updateData.status = data.status;
	if (data.sort !== undefined) updateData.sort = data.sort;
	if (data.remark !== undefined) updateData.remark = data.remark;

	const [plan] = await db
		.update(sysTenantPlan)
		.set(updateData)
		.where(eq(sysTenantPlan.id, id))
		.returning();
	return plan;
};

/**
 * 硬删套餐
 */
export const deleteTenantPlans = async (ids: number[], db: DB): Promise<number> => {
	return await db.transaction(async (tx) => {
		await tx.delete(sysTenantPlanMenu).where(inArray(sysTenantPlanMenu.planId, ids));
		const result = await tx
			.delete(sysTenantPlan)
			.where(inArray(sysTenantPlan.id, ids))
			.returning({ id: sysTenantPlan.id });
		return result.length;
	});
};

/**
 * 获取套餐已授权菜单 ID 列表
 */
export const findTenantPlanMenuIds = async (
	planId: number,
	db: DB,
): Promise<number[]> => {
	const rows = await db
		.select({ menuId: sysTenantPlanMenu.menuId })
		.from(sysTenantPlanMenu)
		.where(eq(sysTenantPlanMenu.planId, planId));
	return rows.map((r) => r.menuId);
};

/**
 * 更新套餐菜单授权
 *
 * 校验：所有 menuId 必须为业务菜单（scope=2）
 */
export const updateTenantPlanMenus = async (
	planId: number,
	menuIds: number[],
	db: DB,
): Promise<void> => {
	// 1. 校验：所有 menuId 必须是业务菜单（scope=2）
	const allowedRows = await db
		.select({ id: sysMenu.id })
		.from(sysMenu)
		.where(and(eq(sysMenu.scope, 2), inArray(sysMenu.id, menuIds), isNull(sysMenu.deleteTime)));
	const allowedSet = new Set(allowedRows.map((r) => r.id));

	for (const menuId of menuIds) {
		if (!allowedSet.has(menuId)) {
			throw new BizError(ERR_CODE.TENANT_PLAN_MENU_NOT_BUSINESS);
		}
	}

	// 2. 替换套餐菜单
	await db.transaction(async (tx) => {
		await tx.delete(sysTenantPlanMenu).where(eq(sysTenantPlanMenu.planId, planId));
		if (menuIds.length > 0) {
			await tx.insert(sysTenantPlanMenu).values(
				menuIds.map((menuId) => ({
					planId,
					menuId,
				})),
			);
		}
	});
};
