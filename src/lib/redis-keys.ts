/**
 * Redis key 命名集中管理
 * 格式：业务域:实体:{id}:动作
 * 新增 key 时在此追加，禁止在业务代码里硬拼字符串
 */
export const redisKeys = {
	/**
	 * 用户 token 版本号
	 * 改密码、踢全部端时把值 +1，使该用户所有旧 token 失效
	 */
	userTokenVersion: (userId: string | number): string => {
		return `auth:user:${userId}:version`;
	},

	/**
	 * 单 token 注销黑名单（jti → 过期时间戳）
	 * logout 时把当前 token 的 jti 写入，TTL 与 token 剩余有效期一致
	 */
	revokedToken: (jti: string): string => {
		return `auth:revoked:${jti}`;
	},
} as const;
