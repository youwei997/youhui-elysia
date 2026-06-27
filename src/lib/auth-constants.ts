/**
 * 认证与权限相关常量
 *
 * 与前端 `vue3-element-admin` 的 `constants/index.ts` 语义对齐：
 * 前端 v-hasPerm 指令用 roles.includes(ROLE_ROOT) 短路，后端必须保持一致，
 * 否则 ROOT 用户（按约定不绑定菜单，perms 为空）会被 perm macro 误判为无权限。
 */

/**
 * 超级管理员角色编码
 *
 * ROOT 角色按约定不绑定菜单（perms 为空数组），拥有所有权限。
 * 权限校验时短路放行，与前端 v-hasPerm 指令语义一致。
 */
export const ROLE_ROOT = "ROOT" as const;

/**
 * 通配权限标识
 *
 * 表示"所有权限"，来自 RuoYi/youlai-boot 体系惯例。
 * 当某用户的 perms 包含此标识时，权限校验短路放行。
 *
 * ⚠️ 当前项目状态：
 *   - seed 数据中没有任何角色绑定此 perm（ROOT 不绑菜单、其他角色绑具体 perm）
 *   - `isSuperUser()` 保留此检查作为防御性兜底，防止有人手动在数据库加了这个值
 *   - 实际只有 ROLE_ROOT 短路在生效
 */
export const WILDCARD_PERM = "*:*:*" as const;
