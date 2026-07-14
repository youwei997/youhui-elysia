import type { sysTenantPlan } from "@/db/schema/system/tenant-plan";

/** sys_tenant_plan 表原始记录类型 */
export type TenantPlanRecord = typeof sysTenantPlan.$inferSelect;

/** 创建/更新租户套餐数据 */
export type TenantPlanData = {
	name: string;
	code: string;
	status?: number;
	sort?: number;
	remark?: string;
};
