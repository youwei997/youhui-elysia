import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { type DB, db as defaultDb } from "@/db/client";
import { sysMenu } from "@/db/schema/system/menu";
import { sysRoleMenu } from "@/db/schema/system/relation";
import { sysRole } from "@/db/schema/system/role";

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
export const findAllMenus = async (
	db: DB = defaultDb,
): Promise<MenuRoute[]> => {
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
	db: DB = defaultDb,
	roleCodes: string[],
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
	return rows as MenuRoute[];
};
