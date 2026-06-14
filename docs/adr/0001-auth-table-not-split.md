# ADR-0001 认证凭证表第一版不拆分

- **状态**:已接受
- **日期**:2026-06-14
- **阶段**:阶段 3 开工前

## 背景

阶段 3 要实现 Auth 模块(login / refresh / logout)。业界主流认证系统(Convex Auth、Supabase、NextAuth、Better Auth、Lucia)均采用「用户主体表 + 登录身份表分离」的设计：

| 系统 | 用户表 | 登录身份表 |
|---|---|---|
| Convex Auth | `users` | `authIdentities` |
| Supabase | `auth.users` | `auth.identities` |
| NextAuth / Auth.js | `user` | `account` |
| Better Auth | `user` | `account` |
| Lucia Auth | `user` | `key` |

这种设计支撑一个用户绑定多个登录方式（密码 / OAuth / passkey），且认证查询只扫小表、不拉用户档案，性能与扩展性都更优。

stage-3 文档原本用 `auth_credential` 命名，但 `credential` 语义偏窄（暗示「密码/密钥」），而 OAuth 登录存的是 provider + subject（不是 credential）。**采用业界主流命名 `auth_accounts`**（NextAuth / Better Auth 风格），语义更准、生态共识更广。

## 决策

**阶段 3 第一版不拆分认证表，密码直接存 `sys_user.password`。未来加第二种登录方式时，按 `auth_accounts` 模式拆分。**

命名约定：未来拆分时用 `auth_accounts`，不用 `auth_credential`。

## 理由

1. **阶段 3 的学习目标是 Elysia plugin 机制**（auth plugin 的 derive / macro），拆表会分散精力到「表设计 + 跨表查询」，冲淡主题。
2. **AGENTS.md 明确「禁止过度工程」**——为用不到的功能建表，即过度设计。
3. **当前需求单一**——阶段 3 验收清单只有密码登录，无 OAuth / passkey / 短信验证码。
4. **拆表的正确时机是「真正加第二种登录方式时」**——Better Auth 等库的多表 schema 是它们已支持多 provider 才长那样，提前拆容易设计偏。
5. **不拆 ≠ 没考虑**——本 ADR 即记录此决策的来龙去脉，未来翻阅可知是「有意简化」而非「遗漏」。

## 反对方案

### 方案 B：现在就拆 `auth_accounts` 表

- 优点：架构一步到位，符合业界共识，未来加 OAuth 不用迁移
- 缺点：阶段 3 多约 0.5 天工作量（建表 + Drizzle schema + 跨表查询），且第一版只有 password 类型一条记录，空有架构无收益

### 方案 C：拆表但用 `auth_credential` 命名（stage-3 文档原方案）

- 否决：`credential` 语义偏窄，不适用于 OAuth 的 provider+subject 模型，业界无此命名

## 后果

- **短期**：阶段 3 login 流程简化为「查 sys_user by username → 比对 password → 签 token」，无跨表查询
- **长期**：未来加 OAuth / passkey 时，需新建 `auth_accounts` 表并迁移现有密码数据。迁移成本可控（单 provider、数据量小）
- **文档**：stage-3 文档中 `auth_credential` 改为 `auth_accounts`，保持命名一致
