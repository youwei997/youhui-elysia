/**
 * 菜单模块 — 路由映射类型
 *
 * 对齐前端 RouteItem / Meta 类型（vue3-element-admin 期约），
 * 仅用于 /api/v1/menus/routes 接口的响应转换，不涉及 DB 字段。
 */

/** 路由元数据 */
export type RouteMeta = {
	/** 菜单标题 */
	title: string;
	/** 图标 */
	icon?: string | undefined;
	/** 是否隐藏 */
	hidden?: boolean | undefined;
	/** 是否缓存页面 */
	keepAlive?: boolean | undefined;
	/** 是否始终显示（仅目录生效） */
	alwaysShow?: boolean | undefined;
	/** 路由参数 */
	params?: Record<string, unknown> | undefined;
};

/** 前端路由对象 */
export type RouteItem = {
	/** 子路由 */
	children: RouteItem[];
	/** 组件路径 */
	component?: string | undefined;
	/** 路由名称 */
	name?: string | undefined;
	/** 路由路径 */
	path?: string | undefined;
	/** 跳转路径 */
	redirect?: string | undefined;
	/** 路由元数据 */
	meta?: RouteMeta;
};
