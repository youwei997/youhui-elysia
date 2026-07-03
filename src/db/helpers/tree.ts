/**
 * 通用树形构建工具
 *
 * 整体思路：
 *   平面列表 → 两遍 for...of → 嵌套树（每个节点多一个 children:[] 字段）。
 *   O(n) 复杂度，不递归，不 reduce。
 *
 * 输入： [{ id: 1, parentId: 0 }, { id: 2, parentId: 1 }]
 * 输出： [{ id: 1, parentId: 0, children: [{ id: 2, parentId: 1, children: [] }] }]
 *
 * 根判定：
 *   节点的 parentId === 0 → 视为根
 *   节点的 parentId 在 lookup 表中不存在 → 也视为根（兜底，防止数据有悬空引用的脏数据时丢节点）
 */

import { sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

/**
 * 带 children 递归子节点的节点类型
 * 原始 T 的所有字段 + children: TreeNode<T>[]
 */
export type TreeNode<T> = T & {
	children: TreeNode<T>[];
};

/**
 * @param items 平面节点列表，每个元素必须包含 id 和 parentId（number 或 string 均可）
 * @returns 根节点数组，每个根节点内部 children 递归嵌套子节点
 *
 * 根判定：parentId == 0（宽松相等，同时兼容 number 0 和 string "0"）
 */
export const buildTree = <
	T extends { id: number | string; parentId: number | string },
>(
	items: T[],
): TreeNode<T>[] => {
	// ─── 第一遍：建 lookup 表 ───
	// 统一用 String() 作为 key，兼容 number / string 两种 id 类型
	const lookup: Record<string, TreeNode<T>> = {};
	for (const item of items) {
		lookup[String(item.id)] = { ...item, children: [] };
	}

	// ─── 第二遍：挂载父子关系 ───
	const roots: TreeNode<T>[] = [];
	for (const item of items) {
		const node = lookup[String(item.id)];
		if (!node) {
			continue;
		}

		// 宽松判定根：parentId == 0 同时覆盖 number 0 和 string "0"
		const parentIdStr = String(item.parentId);
		const parent = parentIdStr !== "0" ? lookup[parentIdStr] : undefined;

		if (parent) {
			parent.children.push(node);
		} else {
			roots.push(node);
		}
	}

	return roots;
};

/**
 * 子树查询 helper（用于数据权限 DEPT_AND_SUB）
 *
 * @param treePathColumn Drizzle 表的 treePath 列
 * @param rootTreePath 根节点的 treePath 值（如 "0,1,3"）
 * @returns SQL fragment：匹配 treePath = rootTreePath（自身）或 treePath LIKE 'rootTreePath,%'（子孙）
 *
 * 为什么不直接用 LIKE 'rootTreePath%'：
 *   "0,1,3%" 会误匹配 "0,1,30"（id=30 不是 id=3 的子孙）。
 *   用 "treePath = rootTreePath OR treePath LIKE rootTreePath,%" 避免此边界。
 *
 * 使用示例：
 * ```ts
 * const where = and(
 *   isNull(sysDept.deleteTime),
 *   descendantsByTreePath(sysDept.treePath, "0,1,3")
 * );
 * // 查出 treePath="0,1,3" / "0,1,3,5" / "0,1,3,5,7" 等所有子孙
 * ```
 */
export const descendantsByTreePath = (
	treePathColumn: PgColumn,
	rootTreePath: string,
): SQL => {
	return sql`${treePathColumn} = ${rootTreePath} OR ${treePathColumn} LIKE ${`${rootTreePath},%`}`;
};
