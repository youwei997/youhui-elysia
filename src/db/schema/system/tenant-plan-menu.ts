import { bigint, pgTable, primaryKey } from "drizzle-orm/pg-core";

/**
 * 租户套餐-菜单关联表（桥表）
 *
 * 定义某套餐包含哪些菜单 ID，无审计列（同 relation.ts 桥表风格）。
 * PK: (planId, menuId)
 */
export const sysTenantPlanMenu = pgTable(
	"sys_tenant_plan_menu",
	{
		/** 套餐 ID */
		planId: bigint("plan_id", { mode: "number" }).notNull(),
		/** 菜单 ID */
		menuId: bigint("menu_id", { mode: "number" }).notNull(),
	},
	(t) => [primaryKey({ columns: [t.planId, t.menuId] })],
);
