import {
	createInsertSchema,
	createSelectSchema,
	createUpdateSchema,
} from "drizzle-orm/zod";
import { z } from "zod";
import { sysTenantPlan } from "@/db/schema/system/tenant-plan";
import { createListQuery } from "@/lib/crud-dto";

/** 状态枚举：1=正常 0-停用 */
const statusSchema = z.union([
	z.literal(0).describe("停用"),
	z.literal(1).describe("正常"),
]);

/** 套餐编码约束：大写字母 + 数字 + 下划线，2-64 位 */
const codeSchema = z
	.string()
	.min(2)
	.max(64)
	.regex(
		/^[A-Z][A-Z0-9_]*$/,
		"编码必须以大写字母开头，仅含大写字母、数字、下划线",
	);

/** 套餐列表查询参数 */
export const TenantPlanListQuery = createListQuery(sysTenantPlan, {
	keywords: z.string().optional().describe("搜索关键字（模糊匹配名称与编码）"),
	status: statusSchema.optional().describe("状态：1-正常 0-停用"),
}).describe("套餐列表查询参数");

/** 创建套餐请求体 */
export const TenantPlanCreateBody = createInsertSchema(sysTenantPlan, {
	name: (s) => s.describe("套餐名称"),
	code: codeSchema.describe("套餐编码（全局唯一）"),
	status: statusSchema.default(1),
	sort: (s) => s.describe("排序，越小越靠前"),
	remark: (s) => s.optional().describe("备注"),
})
	.omit({
		id: true,
		createTime: true,
		updateTime: true,
	})
	.describe("创建套餐请求参数");

/** 更新套餐请求体 */
export const TenantPlanUpdateBody = createUpdateSchema(sysTenantPlan, {
	name: (s) => s.describe("套餐名称"),
	sort: (s) => s.describe("排序，越小越靠前"),
	remark: (s) => s.optional().describe("备注"),
})
	.omit({
		id: true,
		code: true,
		createTime: true,
		updateTime: true,
	})
	.describe("更新套餐请求参数，未传字段保持原值");

/** 套餐响应：排除备注 */
export const TenantPlanResponse = createSelectSchema(sysTenantPlan)
	.omit({ remark: true })
	.describe("套餐信息");

/** TenantPlanResponse.parse 的输入类型 */
export type TenantPlanResponseInput = z.input<typeof TenantPlanResponse>;

/** 套餐 ID 路径参数 */
export const TenantPlanParamsWithId = z
	.object({ id: z.coerce.number() })
	.describe("套餐 ID 路径参数");

/** 套餐菜单分配请求体 */
export const TenantPlanMenusBody = z
	.array(z.coerce.number().int().positive())
	.describe("菜单 ID 列表");

/** 套餐 ID 逗号分隔参数（批量删除用） */
export const TenantPlanParamsWithCommaIds = z
	.object({ ids: z.string() })
	.describe("套餐 ID 路径参数（逗号分隔批量）");
