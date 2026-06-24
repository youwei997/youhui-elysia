import { and, asc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type z from "zod";
import type { DB } from "@/db/client";
import { sysMenu } from "@/db/schema/system/menu";
import { sysRoleMenu } from "@/db/schema/system/relation";
import { sysRole } from "@/db/schema/system/role";
import type { MenuCreateBody, MenuUpdateBody } from "./schema";

/** 菜单路由查询结果类型（仅路由接口所需字段，不含审计列） */
export type MenuRoute = {
	id: number;
	parentId: number;
	treePath: string | null;
	type: string;
	name: string;
	routeName: string | null;
	routePath: string | null;
	component: string | null;
	perm: string | null;
	alwaysShow: number | null;
	keepAlive: number | null;
	visible: number | null;
	sort: number | null;
	icon: string | null;
	redirect: string | null;
	params: unknown;
};

/**
 * 获取所有非按钮菜单（供 ROOT 角色使用）
 * 按 sort 升序排列
 */
export const findAllMenus = async (db: DB): Promise<MenuRoute[]> => {
	const rows = await db
		.select({
			id: sysMenu.id,
			parentId: sysMenu.parentId,
			treePath: sysMenu.treePath,
			type: sysMenu.type,
			name: sysMenu.name,
			routeName: sysMenu.routeName,
			routePath: sysMenu.routePath,
			component: sysMenu.component,
			perm: sysMenu.perm,
			alwaysShow: sysMenu.alwaysShow,
			keepAlive: sysMenu.keepAlive,
			visible: sysMenu.visible,
			sort: sysMenu.sort,
			icon: sysMenu.icon,
			redirect: sysMenu.redirect,
			params: sysMenu.params,
		})
		.from(sysMenu)
		.where(and(isNull(sysMenu.deletedAt), ne(sysMenu.type, "B")))
		.orderBy(asc(sysMenu.sort));
	// Drizzle 用 .select({ ... }) 投影字段后返回类型与 MenuRoute 不完全匹配，需显式断言
	return rows as MenuRoute[];
};

/**
 * 根据角色编码列表获取菜单（非 ROOT 角色）
 *
 * 链路：sys_role → sys_role_menu → sys_menu
 * 过滤：角色软删/禁用 + 菜单软删 + 排除按钮
 * 去重：角色间可能绑同一菜单，DB 层用 DISTINCT 去重
 * 排序：按菜单 sort 升序
 */
export const findMenusByRoleCodes = async (
	roleCodes: string[],
	db: DB,
): Promise<MenuRoute[]> => {
	if (roleCodes.length === 0) {
		return [];
	}

	const rows = await db
		.selectDistinct({
			id: sysMenu.id,
			parentId: sysMenu.parentId,
			treePath: sysMenu.treePath,
			type: sysMenu.type,
			name: sysMenu.name,
			routeName: sysMenu.routeName,
			routePath: sysMenu.routePath,
			component: sysMenu.component,
			perm: sysMenu.perm,
			alwaysShow: sysMenu.alwaysShow,
			keepAlive: sysMenu.keepAlive,
			visible: sysMenu.visible,
			sort: sysMenu.sort,
			icon: sysMenu.icon,
			redirect: sysMenu.redirect,
			params: sysMenu.params,
		})
		.from(sysMenu)
		.innerJoin(sysRoleMenu, eq(sysRoleMenu.menuId, sysMenu.id))
		.innerJoin(sysRole, eq(sysRole.id, sysRoleMenu.roleId))
		.where(
			and(
				inArray(sysRole.code, roleCodes),
				isNull(sysRole.deletedAt),
				eq(sysRole.status, 1),
				isNull(sysMenu.deletedAt),
				ne(sysMenu.type, "B"),
			),
		)
		.orderBy(asc(sysMenu.sort));
	// Drizzle 用 .select({ ... }) 投影字段后返回类型与 MenuRoute 不完全匹配，需显式断言
	return rows as MenuRoute[];
};

/**
 * 根据 ID 查菜单（软删过滤）
 */
export const findMenuById = async (
	id: number,
	db: DB,
): Promise<typeof sysMenu.$inferSelect | undefined> => {
	const rows = await db
		.select()
		.from(sysMenu)
		.where(and(eq(sysMenu.id, id), isNull(sysMenu.deletedAt)))
		.limit(1);
	return rows[0];
};

/**
 * 获取所有菜单（含按钮）用于管理页树形列表
 * 按 sort 升序排列
 */
export const findAllMenusWithButtons = async (
	keywords: string | undefined,
	db: DB,
): Promise<(typeof sysMenu.$inferSelect)[]> => {
	const where = [isNull(sysMenu.deletedAt)];
	if (keywords) {
		// Postgres ILIKE：大小写不敏感的 LIKE，无需手动 lower()
		where.push(sql`${sysMenu.name} ILIKE ${`%${keywords}%`}`);
	}
	const rows = await db
		.select()
		.from(sysMenu)
		.where(and(...where))
		.orderBy(asc(sysMenu.sort));
	return rows;
};

/**
 * 获取菜单下拉选项
 * onlyParent 为 true 时过滤按钮（type != 'B'）
 */
export const findMenuOptions = async (
	onlyParent: boolean | undefined,
	db: DB,
): Promise<Array<{ value: string; label: string; parentId: number }>> => {
	const where = [isNull(sysMenu.deletedAt)];
	if (onlyParent) {
		where.push(ne(sysMenu.type, "B"));
	}
	const rows = await db
		.select({
			id: sysMenu.id,
			name: sysMenu.name,
			parentId: sysMenu.parentId,
		})
		.from(sysMenu)
		.where(and(...where))
		.orderBy(asc(sysMenu.sort));
	return rows.map((r) => ({
		value: String(r.id),
		label: r.name,
		parentId: Number(r.parentId),
	}));
};

/**
 * 计算 treePath：parentId 为 0 → "0"，否则取父节点的 treePath + parentId
 */
const calcTreePath = async (parentId: number, db: DB): Promise<string> => {
	if (parentId === 0) {
		return "0";
	}
	const parent = await db
		.select({ treePath: sysMenu.treePath })
		.from(sysMenu)
		.where(and(eq(sysMenu.id, parentId), isNull(sysMenu.deletedAt)))
		.limit(1);
	const parentPath = parent[0]?.treePath;
	if (!parentPath) {
		throw new Error(`父菜单 ID=${parentId} 不存在或已删除`);
	}
	return `${parentPath},${parentId}`;
};

/**
 * 创建菜单
 * treePath 根据 parentId 自动计算
 */
export const createMenu = async (
	data: z.infer<typeof MenuCreateBody>,
	db: DB,
): Promise<typeof sysMenu.$inferSelect | undefined> => {
	const treePath = await calcTreePath(data.parentId ?? 0, db);
	const [menu] = await db
		.insert(sysMenu)
		.values({ ...data, treePath })
		.returning();
	return menu;
};

/**
 * 更新菜单
 * 如果 parentId 变了，重新计算 treePath
 */
export const updateMenu = async (
	id: number,
	data: z.infer<typeof MenuUpdateBody>,
	db: DB,
): Promise<typeof sysMenu.$inferSelect | undefined> => {
	const updateData: Record<string, unknown> = { ...data };
	if (data.parentId !== undefined) {
		updateData.treePath = await calcTreePath(data.parentId, db);
	}
	const [menu] = await db
		.update(sysMenu)
		.set(updateData)
		.where(and(eq(sysMenu.id, id), isNull(sysMenu.deletedAt)))
		.returning();
	return menu;
};

/**
 * 软删除菜单（级联删除所有子孙）
 *
 * 使用 treePath 正则匹配一次性删除自身 + 整棵子树：
 *   tree_path ~ '(^|,)ID(,|$)' 匹配路径中含有该 ID 的节点（身为祖先或自身）
 *   加上自身 id 直接匹配覆盖根节点边界情况
 */
export const softDeleteMenu = async (
	id: number,
	db: DB,
): Promise<(typeof sysMenu.$inferSelect)[]> => {
	const pattern = `(^|,)${id}(,|$)`;
	return await db.transaction(async (tx) => {
		// 先清理 sys_role_menu 中所有引用（被删节点及其子孙可能被角色绑定）
		const menuIds = await tx
			.select({ id: sysMenu.id })
			.from(sysMenu)
			.where(
				and(
					isNull(sysMenu.deletedAt),
					or(eq(sysMenu.id, id), sql`${sysMenu.treePath} ~ ${pattern}`),
				),
			);
		const idsToDelete = menuIds.map((m) => m.id);
		if (idsToDelete.length > 0) {
			await tx
				.delete(sysRoleMenu)
				.where(inArray(sysRoleMenu.menuId, idsToDelete));
		}
		// 软删：自身 + 所有子孙
		const menus = await tx
			.update(sysMenu)
			.set({ deletedAt: new Date().toISOString() })
			.where(
				and(
					isNull(sysMenu.deletedAt),
					or(eq(sysMenu.id, id), sql`${sysMenu.treePath} ~ ${pattern}`),
				),
			)
			.returning();
		return menus;
	});
};

/**
 * 判断 parentId 是否会导致循环引用
 *
 * 检查 parentId 所在节点的 treePath 是否包含目标 nodeId，
 * 即"把自身或子孙节点设为新的父节点"的情况。
 *
 * 实现：取 parentId 的 treePath，检查 nodeId 是否以逗号分隔元素的形式出现。
 * 纯 JS 字符串操作，不依赖 SQL 正则，避免跨平台兼容问题。
 */
export const isParentIdCyclic = async (
	nodeId: number,
	parentId: number,
	db: DB,
): Promise<boolean> => {
	if (parentId === 0) {
		return false; // 顶级永远不会循环
	}
	if (nodeId === parentId) {
		return true; // 自己不能做自己的父
	}
	const parent = await db
		.select({ treePath: sysMenu.treePath })
		.from(sysMenu)
		.where(and(eq(sysMenu.id, parentId), isNull(sysMenu.deletedAt)))
		.limit(1);
	if (!parent[0]) {
		return false; // 父节点不存在，由 routes 层单独报错
	}
	const parentPath = parent[0].treePath ?? "0";
	const idStr = String(nodeId);
	// 三种匹配：路径就是 nodeId、nodeId 在开头、在中间、在结尾
	return (
		parentPath === idStr ||
		parentPath.startsWith(`${idStr},`) ||
		parentPath.includes(`,${idStr},`) ||
		parentPath.endsWith(`,${idStr}`)
	);
};
