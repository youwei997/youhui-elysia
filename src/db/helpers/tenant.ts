import { eq, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

/**
 * 平台租户 ID（sys_tenant.id = 0）
 *
 * 平台租户跳过数据隔离，可跨租户查询所有数据。
 */
export const PLATFORM_TENANT_ID = 0;

/**
 * 是否为平台租户
 *
 * @param tenantId 租户 ID
 * @returns tenantId === 0 时为 true
 */
export const isPlatformTenant = (tenantId: number): boolean =>
	tenantId === PLATFORM_TENANT_ID;

/**
 * 生成租户隔离 SQL 条件
 *
 * 设计要点：
 *   - 平台租户（tenantId === 0）：返回 undefined，不加过滤条件（平台可跨租户查）
 *   - 普通租户（tenantId !== 0）：返回 eq(column, tenantId)
 *
 * 使用示例：
 * ```ts
 * import { tenantEq } from "@/db/helpers/tenant";
 * import { eq, and } from "drizzle-orm";
 * import { sysUser } from "@/db/schema/system/user";
 *
 * // 在查询中：
 * .where(and(
 *   isNull(sysUser.deleteTime),
 *   tenantEq(sysUser.tenantId, ctx.tenantId),
 * ))
 * ```
 *
 * @param column 租户 ID 列（如 sysUser.tenantId）
 * @param tenantId 当前数据视图租户 ID（来自 ctx.tenantId 或 JWT payload）
 * @returns SQL 条件或 undefined（平台租户不加过滤）
 */
export const tenantEq = (
	column: PgColumn,
	tenantId: number,
): SQL | undefined => {
	if (isPlatformTenant(tenantId)) {
		return undefined;
	}
	return eq(column, tenantId);
};
