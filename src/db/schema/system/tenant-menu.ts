import { bigint, pgTable, primaryKey } from "drizzle-orm/pg-core";

/**
 * 租户-菜单关联表（桥表）
 *
 * 记录某租户实际授权的菜单 ID 集合（可小于套餐范围），无审计列。
 * PK: (tenantId, menuId)
 */
export const sysTenantMenu = pgTable(
	"sys_tenant_menu",
	{
		/** 租户 ID */
		tenantId: bigint("tenant_id", { mode: "number" }).notNull(),
		/** 菜单 ID */
		menuId: bigint("menu_id", { mode: "number" }).notNull(),
	},
	(t) => [primaryKey({ columns: [t.tenantId, t.menuId] })],
);
