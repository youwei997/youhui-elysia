/**
 * 密码工具
 *
 * 基于 Bun 内置的 Bun.password API，默认 argon2id，零依赖。
 * verify 自动识别算法（兼容现有 bcrypt seed）。
 */

/**
 * 对明文密码进行哈希
 * @param plain 明文密码
 * @returns 哈希后的密码字符串
 */
export const hashPassword = (plain: string): Promise<string> => {
	return Bun.password.hash(plain);
};

/**
 * 校验明文密码与哈希是否匹配
 * @param plain 明文密码
 * @param hash 数据库中存储的哈希值
 * @returns 是否匹配
 */
export const verifyPassword = (
	plain: string,
	hash: string,
): Promise<boolean> => {
	return Bun.password.verify(plain, hash);
};
