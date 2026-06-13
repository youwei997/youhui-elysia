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
	username: z.string().optional(),
	status: z.coerce.number().optional(),
});

/** 创建用户请求体 */
export const UserCreateBody = createInsertDto(sysUser);

/** 更新用户请求体 */
export const UserUpdateBody = createUpdateDto(sysUser);

/** 用户响应（排除密码字段） */
export const UserResponse = createSelectSchema(sysUser).omit({
	password: true,
});
