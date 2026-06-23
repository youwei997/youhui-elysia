import {
	createInsertSchema,
	createSelectSchema,
	createUpdateSchema,
} from "drizzle-orm/zod";
import { z } from "zod";
import { sysMenu } from "@/db/schema/system/menu";
import { auditKeys } from "@/lib/crud-dto";

/** 菜单类型枚举 */
export const menuTypeSchema = z
	.enum(["C", "M", "B"])
	.describe("菜单类型：C=目录 M=菜单 B=按钮");

/** 菜单下拉选项查询参数 */
export const MenuOptionsQuery = z
	.object({
		onlyParent: z
			.string()
			.optional()
			.describe("是否仅返回目录/菜单（过滤按钮）"),
	})
	.describe("菜单选项查询参数");

/**
 * 创建菜单请求体
 * - type 约束为 C/M/B 枚举
 * - type=B 时 perm 必填（Zod refine 层面的静态校验，DB 依赖校验仍在 routes 层做）
 */
export const MenuCreateBody = createInsertSchema(sysMenu, {
	type: (_s) => menuTypeSchema,
	name: (s) => s.min(1, "菜单名称不能为空").describe("菜单名称"),
	parentId: (s) => s.describe("父菜单 ID，0 表示顶级"),
	routeName: (s) => s.describe("路由名称"),
	routePath: (s) => s.describe("路由路径"),
	component: (s) => s.describe("组件路径"),
	perm: (s) => s.describe("按钮权限标识"),
	alwaysShow: (s) => s.describe("是否始终显示（仅目录生效）"),
	keepAlive: (s) => s.describe("是否缓存"),
	visible: (s) => s.describe("是否可见"),
	sort: (s) => s.describe("排序"),
	icon: (s) => s.describe("图标"),
	redirect: (s) => s.describe("跳转路径"),
	params: (_s) => z.any().optional().describe("路由参数（JSON 对象）"),
})
	.omit(auditKeys)
	.refine(
		(data) => {
			// type=B（按钮）必须有权限标识
			if (data.type === "B" && !data.perm) {
				return false;
			}
			return true;
		},
		{ message: "按钮类型(type=B)必须填写权限标识(perm)", path: ["perm"] },
	)
	.describe("创建菜单请求参数");

/**
 * 更新菜单请求体
 * - 排除 id（路径参数提供）
 * - 排除 treePath（插入/更新时由 queries 层根据 parentId 自动重算）
 * - 排除审计列
 * - type 不可改（类型一旦确定就固定，改类型会破坏树结构语义）
 */
export const MenuUpdateBody = createUpdateSchema(sysMenu, {
	name: (s) => s.min(1, "菜单名称不能为空").describe("菜单名称"),
	parentId: (s) => s.describe("父菜单 ID，0 表示顶级"),
	routeName: (s) => s.describe("路由名称"),
	routePath: (s) => s.describe("路由路径"),
	component: (s) => s.describe("组件路径"),
	perm: (s) => s.describe("按钮权限标识"),
	alwaysShow: (s) => s.describe("是否始终显示"),
	keepAlive: (s) => s.describe("是否缓存"),
	visible: (s) => s.describe("是否可见"),
	sort: (s) => s.describe("排序"),
	icon: (s) => s.describe("图标"),
	redirect: (s) => s.describe("跳转路径"),
	params: (_s) => z.any().optional().describe("路由参数（JSON 对象）"),
})
	.omit({
		...auditKeys,
		type: true,
		treePath: true,
	})
	.describe("更新菜单请求参数，未传字段保持原值");

/** 菜单响应：排除审计列与软删标志 */
export const MenuResponse = createSelectSchema(sysMenu)
	.omit({
		deletedAt: true,
		createdBy: true,
		updatedBy: true,
	})
	.describe("菜单信息");

/** 菜单 ID 路径参数（coerce.number 将字符串转数字） */
export const MenuParamsWithId = z
	.object({ id: z.coerce.number() })
	.describe("菜单 ID 路径参数");

/** 菜单树形列表查询参数 */
export const MenuListQuery = z
	.object({
		keywords: z.string().optional().describe("搜索关键字"),
	})
	.describe("菜单列表查询参数");
