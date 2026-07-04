/**
 * LIKE 通配符转义工具
 *
 * 防止用户搜索词中的 % 或 _ 被 LIKE 运算符当作通配符解析。
 * 在拼接 LIKE 模板前用 escapeLike 处理 keywords，确保搜索精确性。
 *
 * 用法：
 *   like(sysUser.name, `%${escapeLike(keywords)}%`)
 */
export const escapeLike = (s: string): string => {
	return s.replace(/[%_]/g, "\\$&");
};
