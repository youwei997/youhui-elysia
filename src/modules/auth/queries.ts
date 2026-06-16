import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { sysUser } from "@/db/schema/system/user";
import { redis } from "@/lib/redis";
import { redisKeys } from "@/lib/redis-keys";

/** 登录失败次数上限，达到后锁定账户 */
const MAX_FAIL_COUNT = 5;

/** 登录失败计数 TTL（秒）：15 分钟窗口 */
const FAIL_TTL = 15 * 60;

/** 根据用户名查找有效用户（软删过滤 + 状态正常） */
export const findActiveUserByUsername = async (
	username: string,
): Promise<typeof sysUser.$inferSelect | undefined> => {
	const rows = await db
		.select()
		.from(sysUser)
		.where(
			and(
				eq(sysUser.username, username),
				isNull(sysUser.deletedAt),
				eq(sysUser.status, 1),
			),
		)
		.limit(1);

	return rows[0];
};

/** 获取登录失败次数 */
export const getLoginFailCount = async (username: string): Promise<number> => {
	const val = await redis.get(redisKeys.loginFailCount(username));
	return val ? Number(val) : 0;
};

/** 登录失败计数 +1，首次失败时设置过期 */
export const incrementLoginFailCount = async (
	username: string,
): Promise<number> => {
	const key = redisKeys.loginFailCount(username);
	const count = await redis.incr(key);
	// 首次失败时设置过期，后续失败只 incr 不重置 TTL
	if (count === 1) {
		await redis.expire(key, FAIL_TTL);
	}
	return count;
};

/** 清除登录失败计数（登录成功时调用） */
export const clearLoginFailCount = async (username: string): Promise<void> => {
	await redis.del(redisKeys.loginFailCount(username));
};

/** 检查是否因失败次数过多被锁定 */
export const isAccountLocked = async (username: string): Promise<boolean> => {
	return (await getLoginFailCount(username)) >= MAX_FAIL_COUNT;
};

/** 递增 token 版本号（踢全端），返回递增后的值 */
export const incrementTokenVersion = async (
	userId: number,
): Promise<number> => {
	const key = redisKeys.userTokenVersion(userId);
	return await redis.incr(key);
};
