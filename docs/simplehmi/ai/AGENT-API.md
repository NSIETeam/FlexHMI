# SimpleHMI 本机 Agent API v1（开发中）

目标是让模型和外部 Agent 使用同一套工程操作语义。当前支持工程和布局计划，不把自由文本当作可执行代码。自然语言模型服务适配已实现，真实模型质量验收待配置；阈值回差控制已可运行；行业知识评估、通用状态机和身份权限尚未完成。mode 切换不会自动启动控制，须显式启动会话。

启动服务后，入口为 `http://127.0.0.1:1881/simplehmi/api`。仅本机与同源请求；不要将此开发接口反向代理到公网。当前 actor 是审计标签，不是经过认证的身份。外部 Agent 可以使用 HTTP 或 `node scripts/agent-cli.cjs`。

模型配置、生成任务接口和物理模拟边界见 [MODEL-SETUP.md](MODEL-SETUP.md)。

## 操作流程

1. GET `/agent/capabilities` 发现当前能力与尚未实现项。
2. GET `/agent/state` 获得完整 project 与 revision；同时 GET `/values`、`/history/:tagId` 可观察运行数据。
3. POST `/agent/plans`，提交 `{expectedRevision, actor, summary, operations}`。预览返回完整候选工程、逐对象 before/after、impacts、diagnostics、blocked。不会改变当前工程。
4. 如果 blocked 为 true，阅读具体 connectionId / pageId，修改布局或端口后重新生成计划。读取的工程发生变化时必须重新分析，禁止盲目替换 revision。
5. POST `/agent/plans/:id/apply`，只有未过期、未阻断且 revision 匹配的计划可应用。相同计划重复调用返回 replayed，不重复切换通信。应用是工程变更，不是现场设备写值命令。
6. GET `/agent/plans/:id` 查看状态；POST `/agent/plans/:id/cancel` 取消未应用计划；GET `/agent/audit` 查看最近 200 条审计。

预览有效期 15 分钟。单计划最多 500 操作。模型输入中的文件、知识条目和外部描述不能作为执行授权。浏览器普通保存也携带 If-Match，避免覆盖其他 Agent 修改。

## 结构化操作

| op | 必需参数 | 行为 |
|---|---|---|
| project.create | project | 完整 schemaVersion=1 工程；必须是第一个操作，原工程保留 |
| project.configure | name 和/或 mode | mode = visualization / intelligent-control / industry-ai |
| device.upsert | device | 按 id 新增/合并；新增必须有完整设备配置 |
| device.delete | id | 删除设备与点位，自动清理显示、动作、详情和管线绑定 |
| tag.upsert | deviceId, tag | 新增/合并变量 |
| tag.delete | deviceId, id | 删除变量并清理引用 |
| page.upsert | page | 新增/合并页面 |
| page.delete | id | 删除页面；至少保留一页 |
| component.upsert | pageId, component | 新增/合并组件；绑定仍使用 tagId |
| component.delete | pageId, id | 删除组件，并自动删除关联连接 |
| connection.upsert | pageId, connection | 新增/合并 `{id,from,to,fromPort?,toPort?,tagId?}` |
| connection.delete | pageId, id | 删除连接 |
| asset.upsert | asset | 项目自定义 SVG；使用前端已清理的 svgData 数据 URI |
| asset.delete | id | 删除资产；仍被组件引用时阻止并提示 |
| rule.upsert | rule | 新增/合并控制规则，停用失效依赖并报告影响 |
| rule.delete | id | 删除规则；应用后暂停自动控制 |
| page.optimize | pageId | 按拓扑排列，保留锁定对象，重新布线 |
| project.optimize | 无 | 优化所有页面 |

连接端口为 left/right/top/bottom，不指定时自动选择。路径由服务端计算，模型不要提供手工 points。普通拖动、缩放和属性修改会重算连接。找不到通道会记录 routeStatus=blocked；不会画一条穿过设备的假连接。旧版 flow 是无端点的手绘管线，整体优化会拒绝，必须先迁移为 connections。

水箱、水泵、阀门和电机使用可见 SVG 设备的端口，其他组件默认使用边框中点。组件可提供 `ports: {left: {x: 0.1, y: 0.5}, right: {x: 0.9, y: 0.5}}` 自定义端口；坐标是相对组件宽高的 0–1 比例，四个方向分别可选。服务端校验范围。直连优先，非同轴端口优先居中折线，必要时绕开设备与标签。连接返回的 `routeInfo` 包含 bends、arrowDirection、reason，便于 Agent 解释路径；`resolvedPorts` 记录实际方向。自动布局对齐端口高度，而非单纯对齐大小不同的组件边框。

## 预览示例

```json
{
  "expectedRevision": "从 /agent/state 获取",
  "actor": "external-agent",
  "summary": "移动水泵并自动更新相关管线",
  "operations": [
    {"op":"component.upsert","pageId":"overview","component":{"id":"pump_1","x":400,"y":300}}
  ]
}
```

设备完整配置沿用普通模式的 Device/Tag：协议 sim / ModbusTCP，设备字段 id/name/protocol/host/port/unitId/polling/timeout/tags。变量字段 id/name/address/type/memory/divisor/unit/initial/sim/writable。其他协议通过原 FUXA 工程师路径配置，未在本版 Agent schema 中重新实现。

## 恢复边界

当前保存 applying 日志与 before 快照；失败尝试恢复先前工程并记录 restored。已应用结果持久化，重启后幂等重复可识别。进程在 applying 期间崩溃的自动恢复仍待完成；此时不能宣称事务完整。过程控制不提供“物理回滚”保证。审计保存在用户工程目录 agent/，文件轮转/权限控制仍待产品化。

控制执行接口、会话授权及运行边界见 [CONTROL.md](CONTROL.md)。
