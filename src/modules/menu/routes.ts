import { Elysia } from "elysia";
import { db } from "@/db/client";
import { buildTree, type TreeNode } from "@/db/helpers/tree";
import type { AuthContext } from "@/plugins/auth";
import { authPlugin } from "@/plugins/auth";
import { findAllMenus, findMenusByRoleCodes, type MenuRoute } from "./queries";

/** RouteItem 元数据 */
type Meta = {
	title: string;
	icon?: string | undefined;
	hidden?: boolean | undefined;
	keepAlive?: boolean | undefined;
	alwaysShow?: boolean | undefined;
	params?: Record<string, unknown> | undefined;
};

/** RouteItem 结构，对齐前端 RouteItem 类型 */
type RouteItem = {
	children: RouteItem[];
	component?: string | undefined;
	name?: string | undefined;
	path?: string | undefined;
	redirect?: string | undefined;
	meta?: Meta;
};

/** 将单条菜单映射为 RouteItem */
const toRouteItem = (menu: MenuRoute, children: RouteItem[]): RouteItem => {
	const item: RouteItem = {
		children,
		path: menu.routePath ?? undefined,
		component: menu.component ?? undefined,
		redirect: menu.redirect ?? undefined,
	};

	// name 优先取 routeName，兜底从 routePath 自动生成
	if (menu.routeName) {
		item.name = menu.routeName;
	} else if (menu.routePath) {
		item.name = menu.routePath
			.split("/")
			.filter(Boolean)
			.map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
			.join("");
	}

	// meta 仅含非空字段
	const meta: Meta = { title: menu.name };
	if (menu.icon) meta.icon = menu.icon;
	if (menu.visible === 0) meta.hidden = true;
	if (menu.keepAlive === 1) meta.keepAlive = true;
	if (menu.alwaysShow === 1) meta.alwaysShow = true;
	if (menu.params) meta.params = menu.params as Record<string, unknown>;

	item.meta = meta;
	return item;
};

export const menuRoutes = new Elysia({ prefix: "/api/v1/menus" })
	.use(authPlugin)
	.get(
		"/routes",
		async ({ user }: AuthContext) => {
			if (!user) {
				return [];
			}

			// 1. 查菜单列表：ROOT 查全部，其他按角色过滤
			const isRoot = user.roles.includes("ROOT");
			const menus = isRoot
				? await findAllMenus()
				: await findMenusByRoleCodes(db, user.roles);

			// 2. 平面列表 → 嵌套树
			const tree = buildTree(menus);

			// 3. 映射为 RouteItem 结构
			const mapToRouteItem = (
				nodes: TreeNode<(typeof menus)[number]>[],
			): RouteItem[] => {
				return nodes.map((node) =>
					toRouteItem(node, mapToRouteItem(node.children)),
				);
			};

			return mapToRouteItem(tree);
		},
		{
			auth: true,
			detail: {
				tags: ["Menu"],
				summary: "当前用户路由列表",
				description:
					"返回当前用户角色可见的菜单路由树（不含按钮），供前端动态生成路由表",
			},
		},
	);
