# 阶段 6 · 后端代码生成器（毕业作）

> 难度 ⭐⭐⭐⭐ · 工时 5-6 天 · 学到：模板引擎、AST/元数据反推、CLI 工具设计
> **意义**：把前面所有范式沉淀为"自动产物"，是真正的架构能力体现

## 目标

实现一个 CLI 工具：**输入一张 Drizzle schema 表 → 60 秒内生成一个完整的、可调的 CRUD 模块**。

包括：
- 元数据持久化（每字段如何展示/查询的配置）
- UI 可调元数据
- 文件冲突策略
- 端到端 demo

## 前置检查

- [ ] 阶段 5 验收全 ✅
- [ ] 模块三件套范式已稳定
- [ ] 你已经熟练写过 ≥ 5 个模块，知道生成器该生成什么

## 子任务清单

### 6.1 元数据表 (1d)

`db/schema/codegen/gen-table.ts`：
- 字段：id / tableName / moduleName（生成目录名，如 'business-goods'）/ businessName（如 '商品管理'）/ classNamePrefix / parentMenuId / status / createdBy + auditColumns
- 一行 = 一张被纳管的业务表

`db/schema/codegen/gen-column.ts`：
- 字段：id / tableId / columnName / columnType / tsType / comment
- **关键 UI 配置字段**：
  - `isPk` / `isRequired` / `isInsert` / `isUpdate`（生成 schema 时控制）
  - `isList`（是否在列表展示）/ `isQuery`（是否作为查询条件）/ `queryType`（'eq' | 'like' | 'between' | 'in'）
  - `isForm`（是否在表单）/ `formType`（'input' | 'textarea' | 'select' | 'datepicker' | 'switch'）
  - `dictType`（关联字典 type）
  - `sort`

迁移 + seed（不需要业务数据）。

### 6.2 元数据导入：从 information_schema 读 (1d)

`src/codegen/meta-reader.ts`：
- 函数 `importFromTable(tableName: string)`：
  - 查 PG 的 `information_schema.columns` + `pg_description` 拿字段 + 注释
  - 推断：tsType（int4 → number, text → string, timestamp → Date, jsonb → unknown）
  - 推断：queryType / formType 默认值（如 boolean → switch, varchar(N>200) → textarea）
  - 写入 sys_gen_table + sys_gen_column

CLI：`bun gen import <tableName>`

### 6.3 模板引擎选 eta + 模板编写 (1.5d)

为什么 eta：轻量、纯 TS 友好、能自定义 helper、比 handlebars 灵活。

`src/codegen/templates/`：
- `schema.ts.eta`：生成 `modules/<name>/schema.ts`（drizzle-typebox 派生 + CrudDto 工厂）
- `routes.ts.eta`：生成 `modules/<name>/routes.ts`（标准 CRUD 路由 + auth + perm + audit macro）
- `queries.ts.eta`：生成 `modules/<name>/queries.ts`（findMany / findById / create / update / softDelete + dataScope）

模板里要会处理：
- 字段循环（用 column 元数据）
- queryType 不同时生成不同 where 条件
- formType 影响 t.Object 校验类型
- dictType 字段在 schema 注释里标记

helper：
- pascalCase / camelCase / kebabCase 工具
- ts 类型映射
- import 排序

### 6.4 生成器引擎 + CLI (1d)

`src/codegen/generator.ts`：
- `generateModule(tableId: number, opts: { force?: boolean })`：
  - 读 sys_gen_table / sys_gen_column
  - 渲染 3 个模板
  - 写到 `src/modules/<name>/`
  - **文件冲突策略**：
    - 默认 skip（已存在不覆盖）
    - `--force` 覆盖
    - `--diff` 仅打印差异（让你审阅）

`scripts/gen.ts`（CLI 入口）：
```bash
bun gen import <tableName>     # 从 DB 表导入元数据
bun gen list                   # 列出已纳管的表
bun gen create <tableId>       # 生成代码
bun gen create <tableId> --force
bun gen create <tableId> --diff
bun gen remove <tableId>       # 删除元数据（不删生成的代码）
```

用 `cac` 或 `commander` 做 CLI 解析。

### 6.5 元数据 CRUD 接口（让 UI 可调）(1d)

`modules/codegen/`：
- gen-table CRUD
- gen-column 批量更新（一次提交一张表的所有字段配置）
- `POST /codegen/import/:tableName` 走 meta-reader 导入
- `POST /codegen/generate/:tableId` 触发生成（**返回生成的文件列表，不真写盘**——UI 预览）
- `POST /codegen/generate/:tableId/apply` 真正写盘
- `POST /codegen/preview/:tableId` 仅渲染不写，返回字符串

这样将来接前端 UI 时，用户可以可视化调整字段配置后预览生成结果。

### 6.6 端到端 demo (0.5d)

录制一个 demo 视频或 gif：
1. `bun run db:studio` 打开看看
2. 在 PG 创建一张 `business_goods`（id / name / price / stock / categoryId / status / 时间字段）
3. `bun gen import business_goods`
4. （可选）改改字段配置：`name` 设为查询条件、`status` 关联字典 `enable_status`
5. `bun gen create 1`
6. 重启服务（或 hot-reload）
7. Scalar UI 看到新接口
8. 调用 → 完整可用

写成 `docs/codegen-demo.md`。

### 6.7 ADR-002 codegen 决策 (0.5d)

`docs/adr/002-codegen.md`：
- 决策：生成"三件套"（schema/routes/queries），不生成"十件套"
- 理由：函数式 + Drizzle，不需要 controller/service/mapper 分层
- 反对方案：
  - youlai-boot 十件套（Java 包袱）
  - elysia-admin 三件套（参考但更简）
  - 不持久化元数据（每次重新猜，UI 改不了）
- 元数据驱动 vs 注解驱动：选元数据（数据可被 UI/SQL/版本控制）
- 模板引擎选型：eta 胜 handlebars 的理由
- 不生成测试：本项目偏框架沉淀，CRUD 测试模板化价值低，留给业务侧

## 学习重点

- **CLI 工具设计**：参数解析 / 子命令 / 帮助信息 / 退出码
- **information_schema 查询**：PG 的元数据怎么读
- **模板引擎的边界**：什么放模板、什么放数据驱动、什么放 helper
- **代码生成的幂等性**：重复运行是覆盖、跳过、还是报错？
- **生成代码的可读性**：注释、import 排序、空行规范
- **元数据持久化的价值**：表结构变了，元数据可以增量同步而不是全重置

## 避雷

- ❌ 不要生成 controller/service/mapper 分层（你不是 Java 项目）
- ❌ 不要让生成的代码写完后还需要手改才能跑（要么生成完整，要么不生成）
- ❌ 模板里**不要**直接拼 SQL，让 queries 里走 Drizzle API
- ❌ 默认不要 `--force`，覆盖必须显式
- ❌ 元数据导入**不要**直接覆盖已有配置（用户调过了），用 merge 策略
- ❌ 不要生成 `as any`（生成器的类型质量代表你的水平）
- ⚠️ 模板要 biome format 后再写盘，别让生成代码格式难看
- ⚠️ 字段名是 SQL 关键字时（`order` / `user` 等）要加引号转义
- ⚠️ jsonb 字段、数组字段、enum 字段要单独处理 schema 派生
- ⚠️ 跨表关联字段（如 `deptId`）的 form 配置应支持 `selector` 类型，第一版可以不实现，留 TODO

## 验收清单

### 元数据表
- [ ] sys_gen_table / sys_gen_column 已建
- [ ] 字段含 queryType / formType / dictType 等 UI 配置

### 元数据导入
- [ ] `bun gen import <table>` 可工作
- [ ] 字段类型推断准确（int4/text/timestamp/jsonb/bool 至少 5 种）
- [ ] 注释从 pg_description 读出
- [ ] 二次导入用 merge 策略（不覆盖用户已调字段）

### 模板
- [ ] 三个 .eta 模板齐
- [ ] 生成的代码 biome format 后无报错
- [ ] 生成的代码通过 typecheck
- [ ] 生成的代码风格与手写模块一致（命名 / import / 注释）

### 生成器引擎
- [ ] `bun gen create <id>` 默认 skip 已存在文件
- [ ] `--force` 覆盖
- [ ] `--diff` 打印差异不写盘
- [ ] 生成失败时输出有用错误信息

### CLI
- [ ] 子命令齐：import / list / create / remove
- [ ] `bun gen --help` 输出友好
- [ ] 退出码正确（成功 0 / 失败 非 0）

### UI 接口
- [ ] gen-table / gen-column CRUD 完整
- [ ] preview 接口不写盘只返渲染结果
- [ ] generate/apply 接口真正写盘后返回文件列表

### 端到端 demo
- [ ] 创建一张新表 → 一键生成 → 可调 → 全程 < 60 秒
- [ ] 生成的接口包含：列表（含分页+查询）、详情、新增、更新、软删
- [ ] 生成的接口自动带 auth + perm + audit macro
- [ ] 生成的接口 OpenAPI 文档自动出
- [ ] `docs/codegen-demo.md` 已写

### ADR
- [ ] `docs/adr/002-codegen.md` 已写

## 完成标志

```bash
# 数据库里建一张 business_goods 表
psql -c "CREATE TABLE business_goods (...)"

# 一键生成
bun gen import business_goods
bun gen create 1

# 重启服务后立即可用
curl localhost:3000/business-goods -H "Authorization: Bearer $TOKEN"
```

## 本阶段收获（完成后填写）
