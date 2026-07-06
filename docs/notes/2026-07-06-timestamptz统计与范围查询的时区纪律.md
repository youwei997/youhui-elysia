# timestamptz 统计与范围查询的时区纪律

`2026-07-06` · 阶段 5 日志 analytics 接口

---

## 起因

`getVisitTrend`（按日聚合 PV/UV）一开始用 `sql` 模板 `DATE(createTime)` 分组，趋势图**全 0**；`findOperLogs` 的 `createTime` 上界用裸字符串 `"${end} 23:59:59"`（无 `Z`），依赖数据库 session 时区。

## 隐藏地雷：pg 驱动会把 `DATE()` 结果转成 `Date` 对象，不是字符串

`sql<string>`\`DATE(...)\`.as("date")\` 这行代码里的 `<string>` 只是 Drizzle 给的 TS 类型标注，**不影响运行时**。node-postgres 驱动对 PG 的 `date` 类型（oid 1082）默认会自动解析成 JS `Date` 实例，跟 TS 类型标注写的是不是 `string` 无关。

代码里拿这个"字符串"当 `Map` 的 key：

```ts
const dateMap = new Map(raw.map((r) => [r.date, { pv: r.pv, uv: r.uv }]));
// r.date 运行时其实是 Date 对象，不是 "2026-07-06" 这样的字符串

const entry = dateMap.get(ds); // ds 是真正的字符串
// Map 的 key 查找按值比较，Date 对象 !== 字符串，永远 miss
```

后果是**趋势图全部返回 0，不报任何错、不抛异常**——是最容易被忽略过去的一类 bug：类型标注和运行时行为对不上，TS 编译器完全帮不上忙，只能跑起来看实际返回值才能发现。

这个坑不限于 `DATE()`，凡是 **Drizzle `sql` 模板配合 TS 类型断言**的写法，都要留意断言只是"骗过编译器"，pg 驱动实际怎么转型是另一回事（`timestamp`/`date`/`numeric` 等类型都有类似的自动转型行为）。

## 另外两个连带问题

**裸字符串边界依赖 session 时区**：`"${end} 23:59:59"` 没有时区标记，Postgres 按当前 session 时区解释。DB session 不是 UTC 时，末尾 8 小时会漏查，而 analytics 另一处用 `toISOString()`（UTC），两处判断标准不一致。

**`sql` 模板本身违反项目红线**：原生 `DATE()` / `TO_CHAR(... AT TIME ZONE 'UTC')` 违反 AGENTS.md「严禁 sql 模板」——方言耦合，换库直接失效。

## 想通后的判断

对 `timestamptz` 列做按日聚合 / 范围查询：

- **边界用绝对 UTC 时刻**：`gte(\`${start}T00:00:00.000Z\`)` + `lte(\`${end}T23:59:59.999Z\`)`。`timestamptz` + `mode: "string"` 传带 `Z` 的 ISO 比对天然时区安全。
- **应用层分组替代 `DATE()` / `TO_CHAR`**：JS 里 `new Date(row.createTime).toISOString().slice(0, 10)` 算 UTC 日期，`Map<string, { pv, uv: Set }>` 做 PV 累加 + UV 去重（`uv.size` 输出）。日期截断 Drizzle 无法跨库表达 → 走应用层，不碰 `sql`。
- **分组 key 与日期循环 key 必须同源**：循环用 `new Date(start).toISOString()` + `setUTCDate()`，和分组 key 同为 UTC 字符串，否则对齐不上（这正是 `DATE()` bug 的根因）。

## 口诀

**别信 `sql` 模板的 TS 类型标注——pg 驱动的实际转型才是运行时真相。timestamptz 做日期聚合：边界用 `Z`、分组走应用层、key 同源；别碰 `sql` 模板。**

## 关联

- 红线依据见 `AGENTS.md` §4「严禁使用 sql 模板」
- 同类"驱动层类型转换与预期不符"的坑见 `docs/troubleshooting.md`「Drizzle ORM」章节（如 `.get()` 仅 SQLite 可用）
