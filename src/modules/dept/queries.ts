import { and, asc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import type z from "zod";
import type { DB } from "@/db/client";
import { sysDept } from "@/db/schema/system/dept";
import { sysRoleDept } from "@/db/schema/system/relation";
import { sysUser } from "@/db/schema/system/user";
import type { DeptCreateBody, DeptUpdateBody } from "./schema";
import type { DeptRecord } from "./types";

/**
 * 查询所有部门（软删过滤，按 sort 升序）
 * 支持可选的 keywords（名称模糊匹配）和 status 筛选
 */
export const findAllDepts = async (
	query: { keywords?: string | undefined; status?: number | undefined } = {},
	db: DB,
) => {
	const where = [isNull(sysDept.deleteTime)];
	if (query.keywords) {
		where.push(like(sysDept.name, `%${query.keywords}%`));
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
 * 根据 ID 查部门（软删过滤）
 */
export const findDeptById = async (
	id: number,
	db: DB,
): Promise<DeptRecord | undefined> => {
	const rows = await db
		.select()
		.from(sysDept)
		.where(and(eq(sysDept.id, id), isNull(sysDept.deleteTime)))
		.limit(1);
	return rows[0];
};

/**
 * 计算 treePath：parentId 为 0 → "0"，否则取父节点的 treePath + "," + parentId
 */
const calcTreePath = async (parentId: number, db: DB): Promise<string> => {
	// 顶级部门：treePath 固定为 "0"
	if (parentId === 0) {
		return "0";
	}
	const parent = await db
		.select({ treePath: sysDept.treePath })
		.from(sysDept)
		.where(and(eq(sysDept.id, parentId), isNull(sysDept.deleteTime)))
		.limit(1);
	// 父部门不存在或已删除：抛错
	if (!parent[0]) {
		throw new Error(`父部门 ID=${parentId} 不存在或已删除`);
	}
	return `${parent[0].treePath},${parentId}`;
};

/**
 * 防循环：目标节点的 parentId 不能是自己或自己的子孙
 */
export const isParentIdCyclic = async (
	targetId: number,
	newParentId: number,
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
		.where(and(eq(sysDept.id, newParentId), isNull(sysDept.deleteTime)))
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
 * 创建部门（自动计算 treePath）
 */
export const createDept = async (
	data: z.infer<typeof DeptCreateBody>,
	db: DB,
): Promise<DeptRecord> => {
	const treePath = await calcTreePath(data.parentId ?? 0, db);
	const [dept] = await db
		.insert(sysDept)
		.values({ ...data, treePath })
		.returning();
	return dept as DeptRecord;
};

/**
 * 更新部门（parentId 变更时重新计算 treePath，级联更新子树的 treePath）
 */
export const updateDept = async (
	id: number,
	data: z.infer<typeof DeptUpdateBody>,
	db: DB,
): Promise<DeptRecord | undefined> => {
	const updateData: Record<string, unknown> = { ...data };

	// 只有 parentId 明确传值且非 null 时才重新计算 treePath
	if (data.parentId !== undefined && data.parentId !== null) {
		const newTreePath = await calcTreePath(data.parentId, db);

		return await db.transaction(async (tx) => {
			// 查出旧的 treePath（更新前），用于级联替换
			const before = await tx
				.select({ treePath: sysDept.treePath })
				.from(sysDept)
				.where(and(eq(sysDept.id, id), isNull(sysDept.deleteTime)))
				.limit(1);
			if (!before[0]) {
				return undefined;
			}
			const oldTreePath = before[0].treePath;

			// 更新目标节点
			const [dept] = await tx
				.update(sysDept)
				.set({ ...updateData, treePath: newTreePath })
				.where(and(eq(sysDept.id, id), isNull(sysDept.deleteTime)))
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
		.where(and(eq(sysDept.id, id), isNull(sysDept.deleteTime)))
		.returning();
	return dept;
};

/**
 * 软删除部门（级联删除子树 + 清理关联表）
 */
export const softDeleteDept = async (
	id: number,
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
			.where(inArray(sysRoleDept.deptId, idsToDelete));

		// 软删部门
		await tx
			.update(sysDept)
			.set({ deleteTime: new Date().toISOString() })
			.where(inArray(sysDept.id, idsToDelete));

		return idsToDelete.length;
	});
};

/**
 * 批量软删除部门 + 清理关联
 *
 * 与 softDeleteDept 同逻辑，但使用 inArray 批量操作，
 * 单事务内完成 sys_role_dept 清理 + 部门软删，减少往返。
 * 前置拦截（用户引用校验）由 routes 层负责。
 */
export const batchSoftDeleteDepts = async (
	ids: number[],
	db: DB,
): Promise<DeptRecord[]> => {
	if (ids.length === 0) {
		return [];
	}
	return await db.transaction(async (tx) => {
		await tx.delete(sysRoleDept).where(inArray(sysRoleDept.deptId, ids));
		const depts = await tx
			.update(sysDept)
			.set({ deleteTime: new Date().toISOString() })
			.where(inArray(sysDept.id, ids))
			.returning();
		return depts;
	});
};

/**
 * 检查部门是否被用户引用（删除前校验）
 */
export const isDeptUsedByUsers = async (
	deptId: number,
	db: DB,
): Promise<boolean> => {
	const rows = await db
		.select({ id: sysUser.id })
		.from(sysUser)
		.where(and(eq(sysUser.deptId, deptId), isNull(sysUser.deleteTime)))
		.limit(1);
	return rows.length > 0;
};
