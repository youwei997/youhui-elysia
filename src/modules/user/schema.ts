import {
	createInsertSchema,
	createSelectSchema,
	createUpdateSchema,
} from "drizzle-orm/zod";
import { z } from "zod";
import { sysUser } from "@/db/schema/system/user";
import { auditKeys, createListQuery } from "@/lib/crud-dto";

/**
 * 性别枚举约束：覆盖 smallint 原始范围（-32768~32767），限定业务取值。
 * z.literal 字面量联合优于 enum，符合 AGENTS.md「as const 字面量联合 > enum」。
 */
const genderSchema = z.union([
	z.literal(0).describe("保密"),
	z.literal(1).describe("男"),
	z.literal(2).describe("女"),
]);

/** 状态枚举约束 */
const statusSchema = z.union([
	z.literal(0).describe("禁用"),
	z.literal(1).describe("正常"),
]);

/** 用户列表查询参数 */
export const UserListQuery = createListQuery(sysUser, {
	keywords: z
		.string()
		.optional()
		.describe("搜索关键字（模糊匹配用户名和昵称）"),
	status: statusSchema.optional().describe("状态：1-正常 0-禁用"),
	deptId: z.coerce.number().optional().describe("部门 ID"),
}).describe("用户列表查询参数");

/**
 * 用户列表过滤字段（不含分页），用于导出等场景。
 * 不从 UserListQuery 派生：createListQuery 的泛型签名仅保留 pageFields key，业务字段被吞掉。
 * status 取值与 statusSchema 一致（0 | 1）。
 * 可选属性显式带 | undefined，兼容 tsconfig exactOptionalPropertyTypes。
 */
export type UserListFilter = {
	keywords?: string | undefined;
	status?: 0 | 1 | undefined;
	deptId?: number | undefined;
};

/**
 * 创建用户请求体
 * - 排除 id（主键，由 DB 生成；seed 脚本走 db.insert 不经此 schema，不受影响）
 * - 排除审计列（服务端控制，前端不可注入）
 * - gender/status 加业务枚举约束
 * - refine 箭头函数参数 s 不标注类型，交由 createInsertSchema 泛型推导
 *   （标注 z.ZodType 会击穿类型，详见 docs/troubleshooting.md）
 */
export const UserCreateBody = createInsertSchema(sysUser, {
	username: (s) => s.describe("登录用户名（唯一）"),
	password: (s) => s.describe("登录密码（明文传入，服务端哈希后存储）"),
	nickname: (s) => s.describe("昵称"),
	gender: genderSchema,
	deptId: (s) => s.describe("部门 ID，关联 sys_dept"),
	avatar: (s) => s.describe("用户头像 URL"),
	mobile: (s) => s.describe("手机号"),
	status: statusSchema,
	email: (s) => s.describe("邮箱"),
})
	.omit(auditKeys)
	.describe("创建用户请求参数");

/**
 * 更新用户请求体：最小可改集
 * - 排除 id（路径参数 /users/:id 提供）
 * - 排除 password（密码更新走阶段3专用接口，带旧密码校验）
 * - 排除审计列
 * - gender/status 加业务枚举约束
 * - username 排除：用户名唯一，改名涉及级联，留到后续单独接口
 */
export const UserUpdateBody = createUpdateSchema(sysUser, {
	nickname: (s) => s.describe("昵称"),
	gender: genderSchema,
	deptId: (s) => s.describe("部门 ID，关联 sys_dept"),
	avatar: (s) => s.describe("用户头像 URL"),
	mobile: (s) => s.describe("手机号"),
	status: statusSchema,
	email: (s) => s.describe("邮箱"),
})
	.omit({
		...auditKeys,
		password: true,
		username: true,
	})
	.describe("更新用户请求参数，未传字段保持原值");

/** 用户响应（排除密码、软删标志、创建人/更新人，保留创建/更新时间；deptName 为列表 JOIN 部门所得） */
export const UserResponse = createSelectSchema(sysUser)
	.omit({
		password: true,
		deleteTime: true,
		createdBy: true,
		updatedBy: true,
	})
	.extend({
		deptName: z.string().nullable().optional().describe("部门名称"),
		roleNames: z
			.string()
			.nullable()
			.optional()
			.describe("角色名称列表（逗号分隔）"),
	})
	.describe("用户信息（不含密码、软删标志）");

/** UserResponse.parse 的输入类型 */
export type UserResponseInput = z.input<typeof UserResponse>;

/** 用户 ID 路径参数（coerce.number 将字符串转数字） */
export const UserParamsWithId = z
	.object({ id: z.coerce.number() })
	.describe("用户 ID 路径参数");

/** DELETE 专用：接受原始字符串（支持 "1" 和 "1,2,3" 两种形式） */
export const UserParamsWithCommaIds = z
	.object({ id: z.string() })
	.describe("用户 ID 路径参数（逗号分隔批量）");

/** 重置密码请求体（query 参数传递，管理员强制重置） */
export const UserResetPasswordQuery = z
	.object({
		password: z.string().min(1, "密码不能为空"),
	})
	.describe("重置密码请求参数");

/* ── 个人中心 ── */

/** 个人中心信息更新请求体（仅允许修改 nickname / avatar / gender） */
export const UserProfileBody = z
	.object({
		nickname: z.string().nullable().optional().describe("昵称"),
		avatar: z.string().nullable().optional().describe("头像 URL"),
		gender: genderSchema
			.nullable()
			.optional()
			.describe("性别：0-保密 1-男 2-女"),
	})
	.refine(
		(data) =>
			data.nickname !== undefined ||
			data.avatar !== undefined ||
			data.gender !== undefined,
		{ message: "至少需要提供一个要更新的字段" },
	)
	.describe("个人中心信息更新参数");

/** 修改密码请求体 */
export const PasswordChangeBody = z
	.object({
		oldPassword: z.string().min(1, "原密码不能为空"),
		newPassword: z.string().min(6, "新密码至少 6 位"),
	})
	.describe("修改密码请求参数");

/** 密码验证请求体（解绑手机号/邮箱时校验当前密码） */
export const PasswordVerifyBody = z
	.object({
		password: z.string().min(1, "密码不能为空"),
	})
	.describe("密码验证请求参数");

/** 绑定/更换手机号请求体（code 字段保留但忽略，未接入短信服务） */
export const MobileUpdateBody = z
	.object({
		mobile: z.string().min(1, "手机号不能为空"),
		code: z.string().optional().describe("验证码（未接入短信服务，忽略）"),
		password: z.string().min(1, "密码不能为空"),
	})
	.describe("绑定/更换手机号请求参数");

/** 绑定/更换邮箱请求体（code 字段保留但忽略，未接入邮件服务） */
export const EmailUpdateBody = z
	.object({
		email: z.string().email("邮箱格式不正确"),
		code: z.string().optional().describe("验证码（未接入邮件服务，忽略）"),
		password: z.string().min(1, "密码不能为空"),
	})
	.describe("绑定/更换邮箱请求参数");
