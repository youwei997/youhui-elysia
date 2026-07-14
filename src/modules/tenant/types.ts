import type { sysTenant } from "@/db/schema/system/tenant";

/** sys_tenant 表原始记录类型 */
export type TenantRecord = typeof sysTenant.$inferSelect;

/** 租户列表响应 */
export type TenantListResponse = TenantRecord & {
	planName?: string;
};

/** 创建租户结果（含初始化后的管理员凭据） */
export type TenantCreateResult = {
	tenant: TenantRecord;
	adminUsername: string;
	adminInitialPassword: string;
	adminRoleCode: string;
};
