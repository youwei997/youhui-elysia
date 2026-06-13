import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { sysUser } from "@/db/schema/system/user";
import {
	createInsertDto,
	createListQuery,
	createUpdateDto,
} from "@/lib/crud-dto";

/** 用户列表查询参数 */
export const UserListQuery = createListQuery(sysUser, {
	username: z.string().optional().describe("用户名（模糊搜索）"),
	status: z.coerce.number().optional().describe("状态：1-正常 0-禁用"),
}).describe("用户列表查询参数");

/** 创建用户请求体 */
export const UserCreateBody =
	createInsertDto(sysUser).describe("创建用户请求参数");

/** 更新用户请求体 */
export const UserUpdateBody = createUpdateDto(sysUser).describe(
	"更新用户请求参数，未传字段保持原值",
);

/** 用户响应（排除密码字段） */
export const UserResponse = createSelectSchema(sysUser)
	.omit({
		password: true,
	})
	.describe("用户信息（不含密码）");
