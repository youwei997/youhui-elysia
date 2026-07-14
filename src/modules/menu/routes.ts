import { Elysia } from "elysia";
import { db } from "@/db/client";
import { buildTree, type TreeNode } from "@/db/helpers/tree";
import { BizError, ERR_CODE, notFound, unauthorized } from "@/lib/errors";
import { authPlugin, type AuthContext } from "@/plugins/auth";
import {
	createMenu,
	findAllMenus,
	findAllMenusWithButtons,
	findMenuById,
	findMenuOptions,
	findMenusByRoleCodes,
	isParentIdCyclic,
	softDeleteMenu,
	updateMenu,
} from "./queries";
import {
	MenuCreateBody,
	MenuDetailResponse,
	type MenuDetailResponseInput,
	MenuListQuery,
	MenuOptionsQuery,
	MenuParamsWithId,
	MenuResponse,
	type MenuResponseInput,
	MenuUpdateBody,
} from "./schema";
import type { MenuRoute, RouteItem, RouteMeta } from "./types";

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

/** 列表响应转换：parse 后 id / parentId 转 string */
const parseMenu = (menu: MenuResponseInput) => {
	const parsed = MenuResponse.parse(menu);
	return {
		...parsed,
		id: String(parsed.id),
		parentId: String(parsed.parentId ?? 0),
	};
};

/** 详情响应转换：保留 alwaysShow / keepAlive */
const parseMenuDetail = (menu: MenuDetailResponseInput) => {
	const parsed = MenuDetailResponse.parse(menu);
	return {
		...parsed,
		id: String(parsed.id),
		parentId: String(parsed.parentId ?? 0),
	};
};

/** 递归转换树中每个节点的 id / parentId */
const stringifyTreeIds = <
	T extends { id: number | string; parentId: number | string },
>(
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

/** 当前用户菜单树 + 权限列表响应类型 */
export type MyTreeResponse = {
	/** 按角色裁剪的菜单路由树（不含按钮） */
	menuTree: RouteItem[];
	/** 权限编码列表，供前端 v-permission 指令使用 */
	perms: string[];
};

/**
 * 构建当前用户的菜单路由树
 *
 * ROOT 查全部非按钮菜单，其他角色按角色绑定的菜单过滤。
 * 返回值可直接用于 /routes 和 /my-tree 两个接口。
 */
const buildUserMenuTree = async (
	user: AuthContext["user"],
): Promise<RouteItem[]> => {
	if (!user) {
		return [];
	}

	const isRoot = user.roles.includes("ROOT");
	const menus = isRoot
		? await findAllMenus(db)
		: await findMenusByRoleCodes(user.roles, user.tenantId, db);

	const tree = buildTree(menus);

	const mapToRouteItem = (
		nodes: TreeNode<(typeof menus)[number]>[],
	): RouteItem[] => {
		return nodes.map((node) =>
			toRouteItem(node, mapToRouteItem(node.children)),
		);
	};

	return mapToRouteItem(tree);
};

export const menuRoutes = new Elysia({ prefix: "/api/v1/menus" })
	.use(authPlugin)
	// ---- 当前用户菜单树 + 权限列表 ----
	.get(
		"/my-tree",
		async ({ user }: AuthContext): Promise<MyTreeResponse> => {
			if (!user) {
				return { menuTree: [], perms: [] };
			}

			const menuTree = await buildUserMenuTree(user);
			// perms 来自 JWT（登录时写入），角色变更通过 tokenVersion+1 强制重新登录生效
			const perms = user.perms;

			return { menuTree, perms };
		},
		{
			auth: true,
			detail: {
				tags: ["Menu"],
				summary: "当前用户菜单树 + 权限列表",
				description:
					"返回当前用户角色可见的菜单路由树（不含按钮）和权限编码列表，供前端动态路由 + v-permission 使用",
			},
		},
	)
	// ---- 路由菜单（前端动态路由，保持不变） ----
	.get(
		"/routes",
		async ({ user }: AuthContext) => {
			return buildUserMenuTree(user);
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
			// parentId 在 schema 定义为 .notNull().default(0)，DB 层永远不为 null，
			// 因此不需要 isNotNull 过滤，直接 map 即可
			const validMenus = menus.map((m) => {
				const { alwaysShow, keepAlive, ...rest } = m;
				return parseMenu({ ...rest, parentId: m.parentId as number });
			});
			const tree = buildTree(validMenus);
			return stringifyTreeIds(tree);
		},
		{
			auth: true,
			requirePerm: ["sys:menu:list"],
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
		async ({ query, user }) => {
			if (!user) throw unauthorized();
			const items = await findMenuOptions(
				query.onlyParent === "true" || query.onlyParent === "1",
				query.scope,
				user.tenantId,
				db,
			);
			// findMenuOptions 返回平面列表，需要组装成树
			const nodes = items.map((item) => ({
				id: Number(item.value),
				label: item.label,
				parentId: item.parentId,
			}));
			const tree = buildTree(nodes);
			// 递归转成 { value, label, children } 格式
			const toOption = (
				node: TreeNode<{
					id: number;
					label: string;
					parentId: number;
				}>,
			): {
				value: string;
				label: string;
				children: unknown[];
			} => ({
				value: String(node.id),
				label: node.label,
				children: node.children.map(toOption),
			});
			return tree.map(toOption);
		},
		{
			auth: true,
			requirePerm: ["sys:menu:list"],
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
			return parseMenuDetail(menu);
		},
		{
			auth: true,
			requirePerm: ["sys:menu:list"],
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
			if (!menu) {
				throw new BizError(ERR_CODE.SYSTEM_ERROR, undefined, 500);
			}
			return parseMenuDetail(menu);
		},
		{
			auth: true,
			requirePerm: ["sys:menu:create"],
			audit: "menu:create",
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
			return parseMenuDetail(menu);
		},
		{
			auth: true,
			requirePerm: ["sys:menu:update"],
			audit: "menu:update",
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
			async ({ user, params }) => {
				if (!user) {
					throw new BizError(ERR_CODE.ACCESS_TOKEN_INVALID, undefined, 401);
				}
				const existing = await findMenuById(params.id, db);
				if (!existing) {
					throw notFound(ERR_CODE.MENU_NOT_FOUND);
				}
				const deleted = await softDeleteMenu(params.id, user.tenantId, db);
			return deleted.map((m) => parseMenu(m));
		},
		{
			auth: true,
			requirePerm: ["sys:menu:delete"],
			audit: "menu:delete",
			params: MenuParamsWithId,
			detail: {
				tags: ["Menu"],
				summary: "删除菜单（级联软删）",
				description:
					"删除自身及所有子孙菜单，同时清理 sys_role_menu 中的关联绑定",
			},
		},
	);
