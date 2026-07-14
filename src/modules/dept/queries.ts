import { and, asc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import type z from "zod";
import type { DB } from "@/db/client";
import { tenantEq } from "@/db/helpers/tenant";
import { escapeLike } from "@/db/helpers/like";
import { sysDept } from "@/db/schema/system/dept";
import { sysRoleDept } from "@/db/schema/system/relation";
import { sysUser } from "@/db/schema/system/user";
import type { DeptCreateBody, DeptUpdateBody } from "./schema";
import type { DeptRecord } from "./types";

/**
 * 查询所有部门（软删过滤 + 租户隔离，按 sort 升序）
 */
export const findAllDepts = async (
	query: { keywords?: string | undefined; status?: number | undefined } = {},
	tenantId: number,
	db: DB,
) => {
	const where = [isNull(sysDept.deleteTime), tenantEq(sysDept.tenantId, tenantId)];
	if (query.keywords) {
		where.push(like(sysDept.name, `%${escapeLike(query.keywords)}%`));
	}
	if (query.status !== undefined) {
		where.push(eq(sysDept.status, query.status));
	}
	const rows = await db
		.select()
		.from(sysDept)
		.where(and(...where))
		.orderBy(asc(sysDept.sort));
	return rows;
};

/**
 * 根据 ID 查部门（软删过滤 + 租户隔离）
 */
export const findDeptById = async (
	id: number,
	tenantId: number,
	db: DB,
): Promise<DeptRecord | undefined> => {
	const rows = await db
		.select()
		.from(sysDept)
		.where(
			and(
				eq(sysDept.id, id),
				tenantEq(sysDept.tenantId, tenantId),
				isNull(sysDept.deleteTime),
			),
		)
		.limit(1);
	return rows[0];
};

/**
 * 计算 treePath：parentId 为 0 → "0"，否则取父节点的 treePath + "," + parentId
 * @param parentId 父部门 ID
 * @param tenantId 租户 ID（隔离查询）
 * @param db Drizzle 实例
 */
const calcTreePath = async (
	parentId: number,
	tenantId: number,
	db: DB,
): Promise<string> => {
	// 顶级部门：treePath 固定为 "0"
	if (parentId === 0) {
		return "0";
	}
	const parent = await db
		.select({ treePath: sysDept.treePath })
		.from(sysDept)
		.where(
			and(
				eq(sysDept.id, parentId),
				tenantEq(sysDept.tenantId, tenantId),
				isNull(sysDept.deleteTime),
			),
		)
		.limit(1);
	// 父部门不存在或已删除：抛错
	if (!parent[0]) {
		throw new Error(`父部门 ID=${parentId} 不存在或已删除`);
	}
	return `${parent[0].treePath},${parentId}`;
};

/**
 * 防循环：目标节点的 parentId 不能是自己或自己的子孙（加 tenantEq）
 */
export const isParentIdCyclic = async (
	targetId: number,
	newParentId: number,
	tenantId: number,
	db: DB,
): Promise<boolean> => {
	// 顶级部门永远安全
	if (newParentId === 0) {
		return false;
	}
	// 自己不能做自己的父
	if (newParentId === targetId) {
		return true;
	}

	const parent = await db
		.select({ treePath: sysDept.treePath })
		.from(sysDept)
		.where(
			and(
				eq(sysDept.id, newParentId),
				tenantEq(sysDept.tenantId, tenantId),
				isNull(sysDept.deleteTime),
			),
		)
		.limit(1);

	// 父节点不存在：后续会在 calcTreePath 抛错，这里不管
	if (!parent[0]) {
		return false;
	}

	// 正则匹配：newParent 的 treePath 中是否含有 targetId（说明 target 是 newParent 的祖先）
	const pattern = `(^|,)${targetId}(,|$)`;
	return new RegExp(pattern).test(parent[0].treePath);
};

/**
 * 创建部门（自动计算 treePath；注入 tenantId）
 */
export const createDept = async (
	data: z.infer<typeof DeptCreateBody>,
	tenantId: number,
	db: DB,
): Promise<DeptRecord> => {
	const treePath = await calcTreePath(data.parentId ?? 0, tenantId, db);
	const [dept] = await db
		.insert(sysDept)
		.values({ ...data, tenantId, treePath })
		.returning();
	return dept as DeptRecord;
};

/**
 * 更新部门（parentId 变更时重新计算 treePath，级联更新子树的 treePath；加 tenantEq）
 */
export const updateDept = async (
	id: number,
	data: z.infer<typeof DeptUpdateBody>,
	tenantId: number,
	db: DB,
): Promise<DeptRecord | undefined> => {
	const updateData: Record<string, unknown> = { ...data };

	// 只有 parentId 明确传值且非 null 时才重新计算 treePath
	if (data.parentId !== undefined && data.parentId !== null) {
		const newTreePath = await calcTreePath(data.parentId, tenantId, db);

		return await db.transaction(async (tx) => {
			// 查出旧的 treePath（更新前），用于级联替换
			const before = await tx
				.select({ treePath: sysDept.treePath })
				.from(sysDept)
				.where(
					and(
						eq(sysDept.id, id),
						tenantEq(sysDept.tenantId, tenantId),
						isNull(sysDept.deleteTime),
					),
				)
				.limit(1);
			if (!before[0]) {
				return undefined;
			}
			const oldTreePath = before[0].treePath;

			// 更新目标节点
			const [dept] = await tx
				.update(sysDept)
				.set({ ...updateData, treePath: newTreePath })
				.where(
					and(
						eq(sysDept.id, id),
						tenantEq(sysDept.tenantId, tenantId),
						isNull(sysDept.deleteTime),
					),
				)
				.returning();

			// 级联更新子树的 treePath：替换前缀
			if (oldTreePath) {
				await tx
					.update(sysDept)
					.set({
						treePath: sql`REPLACE(${sysDept.treePath}, ${oldTreePath}, ${newTreePath})`,
					})
					.where(
						and(
							isNull(sysDept.deleteTime),
							tenantEq(sysDept.tenantId, tenantId),
							like(sysDept.treePath, `${oldTreePath},%`),
						),
					);
			}

			return dept;
		});
	}

	const [dept] = await db
		.update(sysDept)
		.set(updateData)
		.where(
			and(
				eq(sysDept.id, id),
				tenantEq(sysDept.tenantId, tenantId),
				isNull(sysDept.deleteTime),
			),
		)
		.returning();
	return dept;
};

/**
 * 软删除部门（级联删除子树 + 清理关联表；加 tenantEq）
 */
export const softDeleteDept = async (
	id: number,
	tenantId: number,
	db: DB,
): Promise<number | undefined> => {
	const pattern = `(^|,)${id}(,|$)`;
	return await db.transaction(async (tx) => {
		// 查出要删的所有部门 ID（自身 + 子树）
		const deptIds = await tx
			.select({ id: sysDept.id })
			.from(sysDept)
			.where(
				and(
					isNull(sysDept.deleteTime),
					tenantEq(sysDept.tenantId, tenantId),
					or(eq(sysDept.id, id), sql`${sysDept.treePath} ~ ${pattern}`),
				),
			);
		const idsToDelete = deptIds.map((d) => d.id);

		// 没有找到可删除的部门：直接返回
		if (idsToDelete.length === 0) {
			return undefined;
		}

		// 清理关联表：sys_role_dept 中的引用
		await tx
			.delete(sysRoleDept)
			.where(
				and(
					inArray(sysRoleDept.deptId, idsToDelete),
					tenantEq(sysRoleDept.tenantId, tenantId),
				),
			);

		// 软删部门
		await tx
			.update(sysDept)
			.set({ deleteTime: new Date().toISOString() })
			.where(
				and(
					inArray(sysDept.id, idsToDelete),
					tenantEq(sysDept.tenantId, tenantId),
				),
			);

		return idsToDelete.length;
	});
};

/**
 * 批量软删除部门 + 清理关联（加 tenantEq 防跨租户误删）
 */
export const batchSoftDeleteDepts = async (
	ids: number[],
	tenantId: number,
	db: DB,
): Promise<DeptRecord[]> => {
	if (ids.length === 0) {
		return [];
	}
	return await db.transaction(async (tx) => {
		await tx
			.delete(sysRoleDept)
			.where(
				and(
					inArray(sysRoleDept.deptId, ids),
					tenantEq(sysRoleDept.tenantId, tenantId),
				),
			);
		const depts = await tx
			.update(sysDept)
			.set({ deleteTime: new Date().toISOString() })
			.where(
				and(
					inArray(sysDept.id, ids),
					tenantEq(sysDept.tenantId, tenantId),
				),
			)
			.returning();
		return depts;
	});
};

/**
 * 检查部门是否被用户引用（删除前校验；加 tenantEq）
 */
export const isDeptUsedByUsers = async (
	deptId: number,
	tenantId: number,
	db: DB,
): Promise<boolean> => {
	const rows = await db
		.select({ id: sysUser.id })
		.from(sysUser)
		.where(
			and(
				eq(sysUser.deptId, deptId),
				tenantEq(sysUser.tenantId, tenantId),
				isNull(sysUser.deleteTime),
			),
		)
		.limit(1);
	return rows.length > 0;
};
