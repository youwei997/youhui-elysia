import {
	createInsertSchema,
	createSelectSchema,
	createUpdateSchema,
} from "drizzle-orm/zod";
import { z } from "zod";
import { sysTenant } from "@/db/schema/system/tenant";
import { createListQuery } from "@/lib/crud-dto";

/** 状态枚举：1=正常 0-停用 */
const statusSchema = z.union([
	z.literal(0).describe("停用"),
	z.literal(1).describe("正常"),
]);

/** 租户编码约束：大写字母 + 数字 + 下划线，2-64 位 */
const codeSchema = z
	.string()
	.min(2)
	.max(64)
	.regex(
		/^[A-Z][A-Z0-9_]*$/,
		"编码必须以大写字母开头，仅含大写字母、数字、下划线",
	);

/** 租户表审计列（sysTenant 无软删/创建人/更新人，仅 created_at/updated_at） */
const tenantAuditKeys = {
	id: true,
	createTime: true,
	updateTime: true,
} as const;

/** 租户列表查询参数 */
export const TenantListQuery = createListQuery(sysTenant, {
	keywords: z.string().optional().describe("搜索关键字（模糊匹配名称与编码）"),
	status: statusSchema.optional().describe("状态：1-正常 0-停用"),
}).describe("租户列表查询参数");

/** 创建租户请求体 */
export const TenantCreateBody = createInsertSchema(sysTenant, {
	name: (s) => s.describe("租户名称"),
	code: codeSchema.describe("租户编码（全局唯一）"),
	status: statusSchema.default(1),
	contactName: (s) => s.optional().describe("联系人"),
	contactPhone: (s) => s.optional().describe("联系电话"),
	contactEmail: (s) => s.optional().describe("联系邮箱"),
	domain: (s) => s.optional().describe("租户域名"),
	logo: (s) => s.optional().describe("Logo URL"),
	planId: (s) => s.optional().describe("关联套餐 ID"),
	remark: (s) => s.optional().describe("备注"),
	expireTime: (s) => s.optional().describe("过期时间"),
})
	.omit(tenantAuditKeys)
	.extend({
		adminUsername: z.string().describe("管理员用户名"),
		adminPassword: z.string().describe("管理员初始密码"),
	})
	.describe("创建租户请求参数");

/** 更新租户请求体 */
export const TenantUpdateBody = createUpdateSchema(sysTenant, {
	name: (s) => s.describe("租户名称"),
	contactName: (s) => s.optional().describe("联系人"),
	contactPhone: (s) => s.optional().describe("联系电话"),
	contactEmail: (s) => s.optional().describe("联系邮箱"),
	domain: (s) => s.optional().describe("租户域名"),
	logo: (s) => s.optional().describe("Logo URL"),
	planId: (s) => s.optional().describe("关联套餐 ID"),
	remark: (s) => s.optional().describe("备注"),
	expireTime: (s) => s.optional().describe("过期时间"),
})
	.omit({
		...tenantAuditKeys,
		code: true,
		status: true,
	})
	.describe("更新租户请求参数，未传字段保持原值");

/** 租户状态变更请求体 */
export const TenantStatusBody = z
	.object({
		status: statusSchema.describe("目标状态：1-正常 0-停用"),
	})
	.describe("租户状态变更请求参数");

/** 租户菜单分配请求体 */
export const TenantMenusBody = z
	.array(z.coerce.number().int().positive())
	.describe("菜单 ID 列表");

/** 租户响应：排除过期时间、备注 */
export const TenantResponse = createSelectSchema(sysTenant)
	.omit({
		expireTime: true,
		remark: true,
	})
	.describe("租户信息");

/** TenantResponse.parse 的输入类型 */
export type TenantResponseInput = z.input<typeof TenantResponse>;

/** 租户 ID 路径参数 */
export const TenantParamsWithId = z
	.object({ id: z.coerce.number() })
	.describe("租户 ID 路径参数");

/** 租户选项响应 */
export const TenantOption = z.object({
	id: z.number(),
	name: z.string(),
	code: z.string(),
});

/** 租户 ID 逗号分隔参数（批量删除用） */
export const TenantParamsWithCommaIds = z
	.object({ ids: z.string() })
	.describe("租户 ID 路径参数（逗号分隔批量）");
