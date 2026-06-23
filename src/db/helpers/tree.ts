/**
 * 通用树形构建工具
 *
 * 将平面列表（每个元素通过 parentId 指向父节点）递归构建为嵌套树结构。
 * 根节点约定 parentId = 0，不支持多根场景需外部先过滤。
 *
 * @param items 平面列表
 * @param parentId 当前层级父节点 ID（递归参数，外部调用传 0）
 * @returns 嵌套树
 */
export type TreeNode<T> = T & {
	children: TreeNode<T>[];
};

export const buildTree = <T extends { id: number; parentId: number }>(
	items: T[],
	parentId: number = 0,
): TreeNode<T>[] => {
	return items
		.filter((item) => item.parentId === parentId)
		.map((item) => ({
			...item,
			children: buildTree(items, item.id),
		}));
};
