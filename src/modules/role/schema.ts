import {
	createInsertSchema,
	createSelectSchema,
	createUpdateSchema,
} from "drizzle-orm/zod";
import { z } from "zod";
import { sysRole } from "@/db/schema/system/role";
import { auditKeys, createListQuery } from "@/lib/crud-dto";

/** 状态枚举：1=正常 0=停用 */
const statusSchema = z.union([
	z.literal(0).describe("停用"),
	z.literal(1).describe("正常"),
]);

/** 数据权限描述映射（1→"所有数据" … 5→"自定义"） */
export const DATA_SCOPE_LABEL_MAP: Record<number, string> = {
	1: "所有数据",
	2: "部门及子部门",
	3: "本部门",
	4: "本人",
	5: "自定义",
};

/**
 * 数据权限枚举：与 sys_role.dataScope 字段对齐
 * 1=所有 2=部门及子 3=本部门 4=本人 5=自定义
 */
const dataScopeSchema = z.union([
	z.literal(1).describe("所有数据"),
	z.literal(2).describe("部门及子部门"),
	z.literal(3).describe("本部门"),
	z.literal(4).describe("本人"),
	z.literal(5).describe("自定义"),
]);

/** 角色编码约束：大写字母 + 下划线 + 数字，2-32 位，避免建表后存奇形怪状的值 */
const codeSchema = z
	.string()
	.min(2)
	.max(32)
	.regex(
		/^[A-Z][A-Z0-9_]*$/,
		"编码必须以大写字母开头，仅含大写字母、数字、下划线",
	);

/** 角色列表查询参数 */
export const RoleListQuery = createListQuery(sysRole, {
	code: z.string().optional().describe("角色编码（精确匹配）"),
	name: z.string().optional().describe("角色名称（模糊搜索）"),
	status: statusSchema.optional().describe("状态：1-正常 0-停用"),
}).describe("角色列表查询参数");

/**
 * 创建角色请求体
 * - 排除 id（主键 DB 生成）
 * - 排除审计列
 * - code 走业务正则约束（比 DB unique 更严）
 * - dataScope 给默认值 1（所有数据），与 DB 默认一致
 */
export const RoleCreateBody = createInsertSchema(sysRole, {
	code: codeSchema.describe("角色编码（唯一），如 ADMIN"),
	name: (s) => s.describe("角色名称（唯一）"),
	sort: (s) => s.describe("排序，越小越靠前"),
	status: statusSchema,
	dataScope: dataScopeSchema.default(1),
	remark: (s) => s.describe("备注"),
})
	.omit(auditKeys)
	.extend({
		deptIds: z
			.array(z.coerce.number().int().positive())
			.optional()
			.describe("自定义数据权限部门 ID 列表（dataScope=5 时有效）"),
	})
	.describe("创建角色请求参数");

/**
 * 更新角色请求体
 * - 排除 id
 * - 排除 code：角色编码是稳定标识（代码里硬编码 ROOT 短路判断依赖 code），改名会破坏契约
 * - 排除审计列
 */
export const RoleUpdateBody = createUpdateSchema(sysRole, {
	name: (s) => s.describe("角色名称"),
	sort: (s) => s.describe("排序"),
	status: statusSchema,
	dataScope: dataScopeSchema,
	remark: (s) => s.describe("备注"),
})
	.omit({
		...auditKeys,
		code: true,
	})
	.extend({
		deptIds: z
			.array(z.coerce.number().int().positive())
			.optional()
			.describe("自定义数据权限部门 ID 列表（dataScope=5 时有效）"),
	})
	.describe("更新角色请求参数，未传字段保持原值");

/** 绑定菜单请求体：菜单 ID 数组（前端传裸数组 [1,2,3]） */
export const RoleAssignMenusBody = z
	.array(z.coerce.number().int().positive())
	.describe("菜单 ID 列表");

/** 绑定部门请求体：部门 ID 数组 */
export const RoleAssignDeptsBody = z
	.object({
		deptIds: z
			.array(z.coerce.number().int().positive())
			.describe("部门 ID 列表"),
	})
	.describe("绑定角色部门请求体（仅 dataScope=5 时启用）");

/** 角色响应：排除软删标志、备注、创建人/更新人，保留创建/更新时间 */
export const RoleResponse = createSelectSchema(sysRole)
	.omit({
		deleteTime: true,
		remark: true,
		createdBy: true,
		updatedBy: true,
	})
	.describe("角色信息");

/** 角色 ID 路径参数（coerce.number 将字符串转数字） */
export const RoleParamsWithId = z
	.object({ id: z.coerce.number() })
	.describe("角色 ID 路径参数");

/** DELETE 专用：接受原始字符串（支持 "1" 和 "1,2,3" 两种形式） */
export const RoleParamsWithCommaIds = z
	.object({ id: z.string() })
	.describe("角色 ID 路径参数（逗号分隔批量）");
