# 已知未解决问题（Known Issues）

> 记录已识别但暂未解决的问题。每条注明：现象、根因、为何暂不修、何时回来修。
> 与 `troubleshooting.md` 区别：那里是**已解决**的坑（带修复方案），这里是**未解决**的待办。

---

## 数字枚举字段在 OpenAPI 文档中渲染异常

**状态**：🟡 已确认根因，暂不修
**影响范围**：OpenAPI / Scalar UI 文档可读性（不影响校验和类型安全）
**发现时间**：2026-06-14 阶段 2

### 现象

`gender`（性别）/ `status`（状态）等数字枚举字段，在 Scalar UI 里渲染成下拉框时：
- 选项 label 显示为 `const`（JSON Schema 关键字名）
- 选中后显示 `const: 0` 这种"关键字名: 值"格式

而非期望的语义化下拉框（如"正常 / 禁用"）。

### 根因

zod v4 的 `z.union([z.literal(0), z.literal(1)])` 序列化成 JSON Schema 时输出：

```json
{
  "anyOf": [
    { "type": "number", "const": 0 },
    { "type": "number", "const": 1 }
  ]
}
```

而不是 OpenAPI 友好的 `enum`：

```json
{ "type": "integer", "enum": [0, 1] }
```

Scalar 渲染 `anyOf` + `const` 组合时，把关键字名 `const` 当成选项标签，导致显示异常。

**这是 zod v4 的固有限制**，已实测验证（`scripts/_test-enum.mjs`，已删除）：

| 写法 | JSON Schema 输出 | 下拉框渲染 | 校验 |
|---|---|---|---|
| `z.union([z.literal(0), z.literal(1)])` | `anyOf` + `const` | ❌ 难看 | ✅ |
| `z.enum(["0", "1"])` 字符串 | `enum`（字符串） | ✅ 但类型变字符串 | ✅ |
| `z.int().refine(n => n===0\|\|n===1)` | 只有 type + 范围 | ❌ 无枚举提示 | ✅ |
| `.meta()` / override | 不起作用 | ❌ | ✅ |

**结论**：没有任何写法能让"数字字面量联合"输出 `enum`。数字只能 `anyOf`+`const`，字符串才能 `enum`。

### 为何暂不修

1. **现状是正确的**：类型安全（字面量联合）、校验生效（传非法值被拒）、描述清晰（字段 description 写明取值）
2. **唯一解法得不偿失**：改用 `z.enum(["0","1"])` 字符串会让 schema 类型与 DB 的 smallint 脱节，查询时要 coerce 字符串→数字，违背"schema 即 DB 类型派生"范式
3. **是工具层问题**：Scalar 渲染 `anyOf`+`const` 难看是文档工具缺陷，不是后端 schema 问题
4. **AGENTS.md 原则**：第一版只追求"对"，不追求"快/漂亮"；禁止过度工程

### 何时回来修

- 阶段 6 代码生成器：若生成的 OpenAPI 文档需要更友好的枚举展示，可重新评估
- 若后续接入 Swagger UI / Redoc 等其他文档工具，渲染效果可能不同，届时再验证
- 若 zod 后续版本支持数字 `enum` 的 JSON Schema 输出（`z.toJSONSchema` 输出 `{ type:"number", enum:[...] }`），直接换写法

### 涉及字段

- `sys_user.gender`（0/1/2）
- `sys_user.status`（0/1）
- 后续其他业务表的数字枚举字段（如 `sys_dict.type` 等）

### 相关文件

- `src/modules/user/schema.ts`：`genderSchema` / `statusSchema` 定义
