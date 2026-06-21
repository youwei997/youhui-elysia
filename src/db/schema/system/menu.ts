import { auditColumns } from "@db/schema/_shared";
import {
	bigint,
	char,
	integer,
	jsonb,
	pgTable,
	smallint,
	varchar,
} from "drizzle-orm/pg-core";

/**
 * 系统菜单表
 * 一表三用：目录(C) + 菜单(M) + 按钮(B)
 * 对齐 youlai-boot sys_menu 设计，补充 routeName / redirect / alwaysShow / params 等前端期望字段
 */
export const sysMenu = pgTable("sys_menu", {
	/** 主键 ID */
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	/** 父菜单 ID（0=顶级） */
	parentId: bigint("parent_id", { mode: "number" }).notNull().default(0),
	/** 父节点 ID 路径（逗号分隔），用于级联删除和过滤，如 "0,1,5" */
	treePath: varchar("tree_path", { length: 255 }),
	/** 菜单类型（C=目录 M=菜单 B=按钮） */
	type: char("type", { length: 1 }).notNull(),
	/** 菜单名称 */
	name: varchar("name", { length: 64 }).notNull(),
	/** 路由名称（前端路由 name 字段） */
	routeName: varchar("route_name", { length: 255 }),
	/** 路由路径 */
	routePath: varchar("route_path", { length: 128 }),
	/** 组件路径（前端 Vue 组件文件路径） */
	component: varchar("component", { length: 128 }),
	/** 权限标识，如 sys:user:create */
	perm: varchar("perm", { length: 128 }),
	/** 是否始终显示（仅目录生效，1=是 0=否） */
	alwaysShow: smallint("always_show").default(0),
	/** 是否缓存页面（1=缓存 0=不缓存） */
	keepAlive: smallint("keep_alive").default(0),
	/** 是否可见（1=显示 0=隐藏） */
	visible: smallint("visible").default(1).notNull(),
	/** 排序 */
	sort: integer("sort").default(0),
	/** 图标 */
	icon: varchar("icon", { length: 64 }),
	/** 跳转路由（仅目录生效） */
	redirect: varchar("redirect", { length: 128 }),
	/** 路由参数（JSON 格式） */
	params: jsonb("params"),
	/** 审计字段 */
	...auditColumns,
});
