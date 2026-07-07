# youhui-elysia · AI 工作规则

> 项目：基于 **Bun + ElysiaJS + Drizzle + PostgreSQL** 的 TS 全栈、函数式优先后台管理框架。  
> **项目架构与编码规范的唯一事实来源**：[`docs/architecture.md`](./docs/architecture.md)。  
> 阶段计划：[`docs/plan/`](./docs/plan/)。

---

## 🌐 1. 基本工作原则

- 始终用中文回答。
- 代码注释、ADR、commit message 全部用中文。
- 系统：Windows；路径使用正斜杠 `/`；shell 命令使用 bash 兼容语法或 PowerShell。
- 生成代码前先阅读 `docs/architecture.md` 和相关已有模块写法，不要凭空创造范式。
- 不确定的设计决策先提问，不要猜测后埋雷。
- 禁止过度工程，第一版只追求“对”，不追求“快”。

---

## 📖 2. 项目规范来源

- 项目架构、编码约定（§4）、反例参考（§5）、借鉴清单（§6），均以 `docs/architecture.md` 为准。
- `AGENTS.md` 只保留 AI 执行规则，不重复完整架构规范。
- 如果 `AGENTS.md` 与 `docs/architecture.md` 表述不一致，以 `docs/architecture.md` 为准。

---

## 🔧 3. 开发流程

### 🧹 3.1 日常小改动

- 先查已有实现，再改最少必要代码。
- Bug fix = 根因，不是症状：顺着调用链找到共享函数，修一次。
- **删 > 加**，**无聊 > 聪明**，**最少文件 > 多文件**。
- 不创建没被明确要求的抽象。
- 不引入可避免的新依赖。
- 不写没人要的模板代码。
- 一行能搞定的事，不扩成多文件。
- 最短可工作 diff 胜出，但前提是你真正理解了问题。
- 对复杂需求质疑："你真的需要 X 吗，还是 Y 就够了？"
- 简化之处可用 `ponytail:` 注释标记，写明已知天花板和升级路径。
- **懒惰 ≠ 疏忽**：输入校验、数据丢失防护、安全、无障碍设施、硬件校准，永远不在砍伐之列。

### 🛠️ 3.2 功能开发或 bug 修复

- 复杂需求先加载 brainstorming skill，明确需求、边界和设计。
- 涉及功能或 bug 修复时，优先写测试；一行能搞定的事不需要测试。非平凡逻辑至少留一个可运行的验证（assert / 自检 / 单测，不用 fixture）。
- 大段完整功能额外加载 ponytail 系列 skill，避免过度工程：
  - **`/ponytail`**：核心 skill，完整懒惰阶梯 + 代码生成规范
  - **`/ponytail-review`**：写完代码后用此 skill 审查是否有过度工程
  - **`/ponytail-audit`**：审查已有代码是否有冗余
  - **`/ponytail-debt`**：记录技术债
  - **`/ponytail-gain`**：量化收益
  - **`/ponytail-help`**：使用说明
- 完成前加载 verification-before-completion skill，运行验证并确认输出。

### 📋 3.3 阶段开发

- 每个阶段开始前阅读 `docs/plan/stage-N-*.md` 的“前置检查”。
- 每完成一个子任务勾选验收清单。
- 阶段全部完成后，用验收清单核对一遍再进入下一阶段。
- 关键决策写入 `docs/adr/`（含决策、理由、反对方案、取舍）。
- 每完成一阶段更新 `docs/plan/README.md` 进度看板。

---

## 🚫 4. AI 红线速查

生成代码时默认遵守以下约束，详细规范见 `docs/architecture.md`：
- 模块三件套：`modules/<domain>/{schema,routes,queries}.ts`，见 §4.1
- 禁止 Java 风格目录 / 装饰器控制器 / DI 容器 / `class XxxService` / `as any` / 静默吞错，见 §4.14
- **严禁使用 `sql` 模板或任何原生 SQL 字符串**；聚合、子查询、批量关联等应通过 Drizzle 类型安全 API 或应用层逻辑实现，避免数据库方言耦合
- 复杂类型 / 多处复用的 `typeof table.$inferSelect` 统一抽到 `modules/<domain>/types.ts`，不在 routes.ts 内联
- `INSERT ... RETURNING` 成功返回的记录非空，不在 routes 层写 `if (!xxx) throw` 死代码 guard；返回类型按 `XxxRecord` 收窄，需要时用 `as XxxRecord` 类型断言（例外：`auth` 守卫的 `if (!user) throw` 是 TS 类型收窄必需，见 `architecture.md` §4.14）
- 软删规则见 §4.10
- 前端响应约定见 §4.11
- 测试要求见 §4.15
- 性能原则见 §4.16
- 第一版不主动优化
- 提交前运行：`bun run lint` + `bun run tsc`（只读检查）；`bun run check` 会自动写盘修复，适合保存前格式化。hook/lifecycle 变更额外跑 `bun run check:dev`

---

## 📦 5. Git 提交

- **commit message 必须中文**，推荐使用“第一行简述 + 空行 + 正文说明”的格式：
  - 第一行格式：`<类型>(可选 scope): <一句话简述>`
  - 类型：`feat` / `fix` / `refactor` / `docs` / `chore` / `test` / `perf`
  - 第一行简述：一句话概括改了什么，不含句号，≤72 字符
  - 如有 scope，格式：`feat(auth):` / `fix(plugin):`
  - 正文按需补充：`新增:` / `更新:` / `验证:` / `注意:`，简单改动可省略正文
- **单次 commit 聚焦一件事**，不要混合重构和新功能
- 提交前运行 `bun run check`（biome）+ `bun run tsc`（类型检查）；涉及 hook / lifecycle 等运行时行为时额外跑 `bun run check:dev`
- 关键决策同步写入 `docs/adr/`（含决策、理由、反对方案、取舍）

---

## 📚 6. 重要参考

- 项目架构：[`docs/architecture.md`](./docs/architecture.md)
- 阶段计划：[`docs/plan/`](./docs/plan/)
- 反例参考：`docs/architecture.md` 第 5 节
- 借鉴清单：`docs/architecture.md` 第 6 节
