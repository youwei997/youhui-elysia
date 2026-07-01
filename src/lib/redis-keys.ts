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

	/**
	 * 登录失败计数（15 分钟窗口）
	 * 连续失败达到上限后触发账户锁定
	 */
	loginFailCount: (username: string): string => {
		return `auth:fail:${username}`;
	},

	/**
	 * 用户权限集合缓存
	 * 登录时把 perms 字符串数组（JSON）写入，TTL 与 access token 一致
	 * 角色变更（assign menus / 改 dataScope 等）时由编排逻辑主动删除
	 */
	userPerms: (userId: string | number): string => {
		return `auth:user:${userId}:perms`;
	},

	/**
	 * 验证码答案缓存
	 * 生成验证码时写入算术结果，校验后立即删除（一次性使用），TTL 5 分钟
	 */
	captchaAnswer: (captchaId: string): string => {
		return `auth:captcha:${captchaId}`;
	},
	/**
	 * 在线用户状态
	 * 登录成功时写入 JSON（含 username / loginAt / ip / userAgent），
	 * 登出 / 强制下线时删除，TTL 与 access token 有效期一致（15min）
	 */
	onlineUser: (userId: string | number): string => {
		return `online:user:${userId}`;
	},

	/**
	 * 字典项缓存
	 * withCache 写入，字典写操作（增改删）时主动失效
	 */
	dictCache: (type: string): string => {
		return `dict:${type}`;
	},

	/**
	 * 限流计数器：按 IP + 路由隔离
	 * 每次请求 +1，超限返回 429
	 */
	rateLimit: (ip: string, path: string): string => {
		return `ratelimit:${ip}:${path}`;
	},

	/**
	 * IP 黑名单缓存
	 * 登录失败超限 / 手动添加时写入，TTL 与封禁时长一致
	 */
	ipBlacklist: (ip: string): string => {
		return `blacklist:ip:${ip}`;
	},
} as const;
