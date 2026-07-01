# withCache 防缓存击穿

**日期**:2026-07-01
**阶段**:5.3 字典管理
**触发问题**:字典项被前端高频调用（下拉框/级联选择），每次刷新页面都查 DB 太浪费，需要缓存。但简单缓存（get/set）在 key 过期瞬间大量并发会打崩 DB，需要防击穿。

---

## 缓存三兄弟（先搞清楚问题到底是什么）

| 现象 | 原因 | 解法 |
|------|------|------|
| **穿透** | 查一个不存在的 key（如 userId=-1），每次都打 DB | 缓存空值，TTL 短一点 |
| **击穿** | 某个 key 刚好过期，1000 人同时请求，1000 人全去查 DB | **withCache 要做的就是这个** |
| **雪崩** | 大量 key 同时过期，或者 Redis 挂了 | TTL 加随机偏移 + Redis 主从 |

withCache 只防**击穿**。

---

## 场景还原

字典项 `dict:gender` 缓存过期了，此时 3 个人同时请求：

```
时间 →
请求A ── 查 Redis（无）── 查 DB ── 写 Redis ── 返回
请求B ── 查 Redis（无）── 查 DB ── 写 Redis ── 返回
请求C ── 查 Redis（无）── 查 DB ── 写 Redis ── 返回
```

3 个请求全部穿透到 DB。如果并发 1000 个，DB 被打垮。

**withCache 的目标：只让 1 个去查 DB，其他人等他。**

---

## 怎么做：分布式锁（SET NX）

```ts
async function withCache<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  // 第一步：先查缓存
  const cached = await redis.get(key);
  if (cached !== null) return JSON.parse(cached);

  // 第二步：没命中 → 抢锁
  // NX = key 不存在才设成功，EX 10 = 10 秒自动释放（防死锁）
  const lockKey = `lock:${key}`;
  const ok = await redis.set(lockKey, "1", "NX", "EX", 10);
  if (ok) {
    try {
      // 第三步：双重检查——等锁的时候别人可能已经写好了
      const doubleCheck = await redis.get(key);
      if (doubleCheck !== null) return JSON.parse(doubleCheck);

      // 真正查 DB
      const value = await fetcher();
      await redis.set(key, JSON.stringify(value), "EX", ttl);
      return value;
    } finally {
      await redis.del(lockKey); // 释放锁
    }
  }

  // 第四步：没抢到锁 → 等 50ms 再重试
  await new Promise((r) => setTimeout(r, 50));
  return withCache(key, ttl, fetcher);
}
```

---

## 这个锁到底是什么

**不是 Redis 的特殊功能，就是一个普通 key。**

```ts
SET lock:dict:gender 1 NX EX 10
```

| 部分 | 意思 |
|------|------|
| `lock:dict:gender` | 就是 key 名，"lock:" 前缀表示这是个锁 |
| `1` | value 不重要，随便填 |
| `NX` | **唯一关键的作用**：key 不存在才设成功，存在就返回 null |
| `EX 10` | 10 秒后自动删除——抢到锁的请求挂了，10 秒后其他人也能抢到 |

三个请求同时 `SET lock:xxx 1 NX EX 10`：

```
请求A → Redis 说 OK     → 抢到锁，去查 DB
请求B → Redis 说 null   → 没抢到，等 50ms
请求C → Redis 说 null   → 没抢到，等 50ms
```

**50ms 后：**

```
请求B → 查 Redis "dict:gender"
        ├── 有数据了（A写好的）→ 直接返回，不用查 DB
        └── 还没有（A慢查询）→ 再 SET NX 抢锁（大概率抢得到，因为 A 已经删锁了）
```

---

## 为什么不走消息队列？

听到"等 50ms 重试"可能想到消息队列。区分一下：

| 方案 | 适用场景 | 为什么这里不用 |
|------|---------|---------------|
| **同步等（withCache）** | 重建缓存很快（几毫秒） | 字典查 DB 几毫秒就返回，等人写完就行了 |
| **消息队列异步重建** | 重建缓存很慢（算全量索引要 5 分钟） | 不可能让用户等 5 分钟，先返回旧数据，后台慢慢算 |

字典查询走同步等就够了，不需要引入 MQ。

---

## 为什么不写时更新缓存，而是删 key？

写过一次对比：

| 做法 | 问题 |
|------|------|
| 更新缓存 | 要确保格式跟缓存一致、要重新序列化，写错了就脏数据 |
| **删 key** | 删不掉大不了多查一次 DB，不会读到脏数据 |

所以标准是：**写操作删 key，读操作自动重建**。

极端场景有"双删"（删了等几百毫秒再删一次兜底），第一版不做，线上遇到 race condition 再加。

---

## 哪里会用 withCache

目前只有字典。后续扩展：

- 字典项查询（第一个用户）
- 权限缓存（已用 Redis 直接 set/get，后续可改成 withCache 统一模式）
- 配置类数据

---

## 第一版不做的事

- **双删（延迟双删）**：并发 race 概率极低，线上遇到了再加
- **本地缓存二级缓存**：单机够用，不要多级
- **缓存预热**：启动时不需要主动加载，第一次访问自然重建