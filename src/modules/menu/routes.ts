import { Elysia } from "elysia";
import { db } from "@/db/client";
import { buildTree, type TreeNode } from "@/db/helpers/tree";
import { BizError, ERR_CODE, notFound } from "@/lib/errors";
import type { AuthContext } from "@/plugins/auth";
import { authPlugin } from "@/plugins/auth";
import {
	createMenu,
	findAllMenus,
	findAllMenusWithButtons,
	findMenuById,
	findMenuOptions,
	findMenusByRoleCodes,
	isParentIdCyclic,
	type MenuRoute,
	softDeleteMenu,
	updateMenu,
} from "./queries";
import {
	MenuCreateBody,
	MenuListQuery,
	MenuOptionsQuery,
	MenuParamsWithId,
	MenuResponse,
	MenuUpdateBody,
} from "./schema";
import type { RouteItem, RouteMeta } from "./types";

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
	const meta: RouteMeta = { title: menu.name };
	if (menu.icon) meta.icon = menu.icon;
	if (menu.visible === 0) meta.hidden = true;
	if (menu.keepAlive === 1) meta.keepAlive = true;
	if (menu.alwaysShow === 1) meta.alwaysShow = true;
	// jsonb 字段从 DB 取出为 unknown，前端需要 Record<string, unknown> 类型
	if (menu.params) meta.params = menu.params as Record<string, unknown>;

	item.meta = meta;
	return item;
};

/** 响应转换：parse 后 id / parentId 转 string */
const parseMenu = (menu: Parameters<typeof MenuResponse.parse>[0]) => {
	const parsed = MenuResponse.parse(menu);
	return {
		...parsed,
		id: String(parsed.id),
		parentId: String(parsed.parentId ?? 0),
	};
};

/** 递归转换树中每个节点的 id / parentId */
const stringifyTreeIds = <T extends { id: number; parentId: number }>(
	nodes: TreeNode<T>[],
): (Omit<T, "id" | "parentId"> & {
	id: string;
	parentId: string;
	children: unknown[];
})[] => {
	return nodes.map((node) => ({
		...node,
		id: String(node.id),
		parentId: String(node.parentId),
		children: stringifyTreeIds(node.children),
	}));
};

export const menuRoutes = new Elysia({ prefix: "/api/v1/menus" })
	.use(authPlugin)
	// ---- 路由菜单（前端动态路由，保持不变） ----
	.get(
		"/routes",
		async ({ user }: AuthContext) => {
			if (!user) {
				return [];
			}

			// 1. 查菜单列表：ROOT 查全部，其他按角色过滤
			const isRoot = user.roles.includes("ROOT");
			const menus = isRoot
				? await findAllMenus(db)
				: await findMenusByRoleCodes(user.roles, db);

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
			// 不加 perm：所有登录用户都需要此接口生成前端路由
		},
	)
	// ---- 管理端 CRUD ----
	.get(
		"/",
		async ({ query }) => {
			const menus = await findAllMenusWithButtons(query.keywords, db);
			const validMenus = menus
				.filter((m) => m.parentId !== null)
				.map((m) => ({
					...m,
					parentId: m.parentId as number,
				}));
			const tree = buildTree(validMenus);
			return stringifyTreeIds(tree);
		},
		{
			auth: true,
			perm: ["sys:menu:list"],
			query: MenuListQuery,
			detail: {
				tags: ["Menu"],
				summary: "菜单树形列表（含按钮）",
				description: "返回完整菜单树供管理页展示，支持关键字模糊搜索",
			},
		},
	)
	.get(
		"/options",
		async ({ query }) => {
			return findMenuOptions(
				query.onlyParent === "true" || query.onlyParent === "1",
				db,
			);
		},
		{
			auth: true,
			perm: ["sys:menu:list"],
			query: MenuOptionsQuery,
			detail: {
				tags: ["Menu"],
				summary: "菜单下拉选项",
				description: "供前端下拉选择器使用，onlyParent=true 时过滤按钮",
			},
		},
	)
	.get(
		"/:id/form",
		async ({ params }) => {
			const menu = await findMenuById(params.id, db);
			if (!menu) {
				throw notFound(ERR_CODE.MENU_NOT_FOUND);
			}
			return parseMenu(menu);
		},
		{
			auth: true,
			perm: ["sys:menu:list"],
			params: MenuParamsWithId,
			detail: {
				tags: ["Menu"],
				summary: "获取菜单表单数据",
				description: "编辑菜单时回填表单",
			},
		},
	)
	.post(
		"/",
		async ({ body }) => {
			// 前置校验：type=B 时 perm 必填（Zod refine 已校验，此处防御）
			if (body.type === "B" && !body.perm) {
				throw new BizError(ERR_CODE.MENU_BUTTON_REQUIRES_PERM);
			}
			// 前置校验：parentId != 0 时父节点必须存在
			if (body.parentId && body.parentId !== 0) {
				const parent = await findMenuById(body.parentId, db);
				if (!parent) {
					throw new BizError(ERR_CODE.MENU_PARENT_NOT_FOUND);
				}
			}
			const menu = await createMenu(body, db);
			return parseMenu(menu);
		},
		{
			auth: true,
			perm: ["sys:menu:create"],
			body: MenuCreateBody,
			detail: {
				tags: ["Menu"],
				summary: "创建菜单",
				description:
					"新增菜单（目录/菜单/按钮），treePath 由服务端根据 parentId 自动计算",
			},
		},
	)
	.put(
		"/:id",
		async ({ params, body }) => {
			const existing = await findMenuById(params.id, db);
			if (!existing) {
				throw notFound(ERR_CODE.MENU_NOT_FOUND);
			}
			// 前置校验：type=B 且 perm 被清空（type 不可改，直接用 existing.type 判断）
			if (
				body.perm !== undefined &&
				body.perm !== null &&
				body.perm.trim() === "" &&
				existing.type === "B"
			) {
				throw new BizError(ERR_CODE.MENU_BUTTON_REQUIRES_PERM);
			}
			// 前置校验：parentId 防循环
			if (body.parentId !== undefined && body.parentId !== 0) {
				const parent = await findMenuById(body.parentId, db);
				if (!parent) {
					throw new BizError(ERR_CODE.MENU_PARENT_NOT_FOUND);
				}
				const isCyclic = await isParentIdCyclic(params.id, body.parentId, db);
				if (isCyclic) {
					throw new BizError(ERR_CODE.MENU_PARENT_CYCLE);
				}
			}
			const menu = await updateMenu(params.id, body, db);
			if (!menu) {
				throw notFound(ERR_CODE.MENU_NOT_FOUND);
			}
			return parseMenu(menu);
		},
		{
			auth: true,
			perm: ["sys:menu:update"],
			body: MenuUpdateBody,
			params: MenuParamsWithId,
			detail: {
				tags: ["Menu"],
				summary: "更新菜单",
				description:
					"部分字段更新，parentId 变更时自动重算 treePath，禁止循环引用",
			},
		},
	)
	.delete(
		"/:id",
		async ({ params }) => {
			const existing = await findMenuById(params.id, db);
			if (!existing) {
				throw notFound(ERR_CODE.MENU_NOT_FOUND);
			}
			const deleted = await softDeleteMenu(params.id, db);
			return deleted.map((m) => parseMenu(m));
		},
		{
			auth: true,
			perm: ["sys:menu:delete"],
			params: MenuParamsWithId,
			detail: {
				tags: ["Menu"],
				summary: "删除菜单（级联软删）",
				description:
					"删除自身及所有子孙菜单，同时清理 sys_role_menu 中的关联绑定",
			},
		},
	);
