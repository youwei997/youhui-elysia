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

import { like, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

/**
 * 带 children 递归子节点的节点类型
 * 原始 T 的所有字段 + children: TreeNode<T>[]
 */
export type TreeNode<T> = T & {
	children: TreeNode<T>[];
};

/**
 * @param items 平面节点列表，每个元素必须包含 id:number 和 parentId:number
 * @returns 根节点数组，每个根节点内部 children 递归嵌套子节点
 */
export const buildTree = <T extends { id: number; parentId: number }>(
	items: T[],
): TreeNode<T>[] => {
	// ─── 第一遍：建 lookup 表 ───
	// 目的：后续按 id 查找节点时用 O(1) 取值，不需要嵌套循环
	// 同时给每个节点挂一个空的 children[]，后续往里面推子节点
	const lookup: Record<number, TreeNode<T>> = {};
	for (const item of items) {
		lookup[item.id] = { ...item, children: [] };
	}

	// ─── 第二遍：挂载父子关系 ───
	// 遍历原数组（不是 lookup，保持原始顺序），用 lookup 表找父节点
	const roots: TreeNode<T>[] = [];
	for (const item of items) {
		// 从 lookup 取出已经套壳（带 children[]）的当前节点
		const node = lookup[item.id];
		if (!node) {
			// 理论上不会走到这里（第一遍已放入），纯防御
			continue;
		}

		// 查父节点：parentId=0 就是根，否则去 lookup 找
		const parent = item.parentId !== 0 ? lookup[item.parentId] : undefined;

		if (parent) {
			// 找到父节点 → 把自己挂到父节点的 children 里
			parent.children.push(node);
		} else {
			// 没找到父节点（parentId=0 或父不在 lookup）→ 自己就是根
			roots.push(node);
		}
	}

	// 只返回根节点数组，前端需要全量时拿根往下递归 children 即可
	return roots;
};

/**
 * 子树查询 helper（用于数据权限 DEPT_AND_SUB）
 *
 * @param treePathColumn Drizzle 表的 treePath 列
 * @param rootTreePath 根节点的 treePath 值（如 "0,1,3"）
 * @returns SQL fragment：匹配 treePath LIKE 'rootTreePath%' 的所有节点（含根自身）
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
	return like(treePathColumn, `${rootTreePath}%`);
};
