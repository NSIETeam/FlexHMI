# FlexHMI 本机 Agent API v1（开发中）

目标是让模型和外部 Agent 使用同一套工程操作语义。当前支持工程和布局计划，不把自由文本当作可执行代码。自然语言模型服务适配已实现，真实模型质量验收待配置；阈值回差与步骤流程控制已可运行；行业知识评估已支持带版本引用与实时条件，生产资料库、跨流程事务协调和多用户权限尚未完成；本机所有者及 Agent 授权见 [访问保护](ACCESS.md)。mode 切换不会自动启动控制，须显式启动会话。

启动服务后，入口为 `http://127.0.0.1:1881/simplehmi/api`。仅本机与同源请求；不要将此开发接口反向代理到公网。未启用访问保护时 actor 只是审计标签；启用后 Agent 请求必须携带 Bearer 令牌，审计使用服务端识别的授权 ID，不能自报身份。外部 Agent 可以使用 HTTP 或 `node scripts/agent-cli.cjs`；CLI 从 `FLEXHMI_TOKEN` 环境变量读取授权，不把令牌放入 URL。

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
| project.load | id, expectedSavedRevision | 加载已保存工程，必须首项；可后接工程编辑，加载会暂停自动控制 |
| project.delete | id, expectedSavedRevision | 单独计划；将非当前工程移到可恢复归档区，当前通信不变 |
| project.restore | archiveId, expectedSavedRevision | 单独计划；恢复归档到工程列表，不覆盖同 ID 工程，不激活设备 |
| project.revert | planId | 单独计划；恢复当前工程某次已应用修改之前的配置，先预览覆盖差异，应用后暂停自动控制 |
| project.configure | name 和/或 mode | mode = visualization / intelligent-control / industry-ai |
| device.upsert | device | 按 id 新增/合并；新增必须有完整设备配置 |
| device.delete | id | 删除设备与点位，自动清理显示、动作、详情和管线绑定 |
| tag.upsert | deviceId, tag | 新增/合并变量 |
| tag.delete | deviceId, id | 删除变量并清理引用 |
| page.upsert | page | 新增/合并页面 |
| page.delete | id | 删除页面；至少保留一页 |
| component.upsert | pageId, component | 新增/合并组件；绑定仍使用 tagId |
| component.delete | pageId, id | 删除组件，并自动删除关联连接 |
| connection.upsert | pageId, connection | 新增/合并 `{id,from,to,label?,fromPort?,toPort?,routeMode?,tagId?}` |
| connection.delete | pageId, id | 删除连接 |
| asset.upsert | asset | 项目自定义 SVG；使用前端已清理的 svgData 数据 URI |
| asset.delete | id | 删除资产；仍被组件引用时阻止并提示 |
| rule.upsert | rule | 新增/合并控制规则，停用失效依赖并报告影响 |
| rule.delete | id | 删除规则；应用后暂停自动控制 |
| machine.upsert | machine | 新增/合并步骤流程；每个步骤声明全部输出值、跳转条件及优先级；缺失点位或过期依据会停用并报告 |
| machine.delete | id | 删除步骤流程；应用后暂停自动控制 |
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

当前保存 applying 日志与 before 快照；失败尝试恢复先前工程并记录 restored。已应用结果持久化，重启后幂等重复可识别。重启时核对 applying 日志与当前保存状态：结果完全匹配则恢复为 applied（不会再执行），否则为 interrupted，需根据当前状态重新预览。归档操作核对源路径消失、目标路径存在和内容哈希；损坏日志保留原件并显示不可读，不阻止其他工程启动。已通过保存前/后 SIGKILL 进程故障注入验证；不是断电、磁盘故障或完整事务回滚保证。过程控制不提供“物理回滚”保证。审计保存在用户工程目录 agent/，文件轮转和按项目权限仍待产品化。

控制执行接口、会话授权及运行边界见 [CONTROL.md](CONTROL.md)。


## 保存工程与操作历史

- GET `/agent/projects` → `{projects, archives}`。有效条目包含 `revision`；归档另有 `archiveId`，损坏文件会标记 `unavailable`。
- GET `/agent/projects/:id` → 完整保存工程、文件版本与修改时间；归档使用 `:archiveId?archived=1`。
- GET `/agent/plans` → 最多 200 条摘要，中断/损坏记录优先，供恢复检查和历史浏览。

加载、删除、恢复都通过 `/agent/plans` 创建预览。`expectedRevision` 校验当前运行工程，操作中的 `expectedSavedRevision` 独立校验目标保存文件；应用时再次核对目标版本或目标不存在。新建 ID 也在预览和应用两次检查。不得用新的版本号强行重放旧意图。

```json
{
  "expectedRevision": "当前运行工程的版本",
  "summary": "加载已审查的供水工程",
  "operations": [
    {"op":"project.load","id":"water_supply","expectedSavedRevision":"保存工程列表返回的版本"}
  ]
}
```

删除保留在工程目录 `trash/`，当前不提供永久清空工具。目标仍是当前工程时拒绝删除/恢复覆盖。所有文件操作都纳入串行应用与持久化审计；归档/恢复不调用运行引擎激活。其他编辑窗口尚未提交的内容不会被 Agent 保存，旧窗口的后续保存会由版本冲突保护。


## 循环与连接诊断

`routeMode: "return"` 请求外侧回流通道；未指定时按几何关系选择。`page.optimize` 先将有向环压缩为分组再展开顺序，保留原始 from/to 语义，给回流边设置派生 `layoutRole`。分支按已排列上游的行序排序；不会把未连接的标题、数据卡片强行排入设备列。

自动端口被组件或名称遮挡时可以改选其他侧，并返回 `port-adjusted` 和 `routeInfo.autoPortAdjusted`。用户明确指定的端口不被替换。没有可用路径时仍返回 `route-blocked` 阻止计划应用。`route-crossing` 提示几何交叉而非工艺连通，`route-overlap` 提示需要区分的共线路径；这两项为可审阅诊断，不会伪造新的连接节点。名称区域按单行排版参与避让。

管线 `tagId` 绑定 Bool 时可驱动运行页流动显示；仅接受新鲜的 true/1，false/0 停止，失效显示未知。其他类型保留兼容绑定但不被误当成流动。图形连接不会自动改变过程模型或控制规则。

## 恢复修改前版本

AI 工作台 → 工程与记录 → 最近操作 → 恢复修改前版本。普通预览会显示全部变化和逐项“应用前 / 应用后”内容，点击应用后才修改工程。也可通过 HTTP / MCP 的普通 preview 提交单项 `{"op":"project.revert","planId":"plan_..."}`，继续使用 expectedRevision 与原有 apply / cancel 流程。恢复计划标记 revertsPlanId，来源记录保留。

只接受当前工程内、已应用且拥有 before 快照的工程修改记录；跨工程创建/加载、未完成记录及归档文件操作不能借此恢复。可以选择较早记录，但该操作之后的配置变化可能被覆盖，必须检查完整差异；其他窗口未保存的修改不包含在快照里。普通编辑器保存也形成这类持久化修改记录；本地撤销/重做产生的下一次实际保存同样记录。尚未触发保存的窗口内容不属于持久化历史。

知识正文恢复按已保留计划中的最高版本创建新版本，不复用旧版本号；不自动重写规则引用，失效依据对应规则会停用，需重新评估。若历史记录损坏导致不能核对知识版本，恢复会报错，不能跳过版本校验。无论修改是否涉及控制，恢复应用都暂停自动控制。不会恢复历史实时值、写入设备或撤销已发出的现场指令。

恢复操作沿用串行应用、15 分钟预览过期、版本冲突保护、持久化幂等和中断核对。新应用的恢复计划也保留自身 before 快照，可再次预览恢复。当前不是通用磁盘灾难恢复或生产过程回滚。


## 普通编辑保存的持久化历史

`POST /project` 保留原工程响应格式，并在有实际变化时返回 `X-History-Id`。服务先验证工程、标准化默认值并计算布线，再将修改前后快照、差异、来源写入同一应用日志，最后完成保存。没有变化的重复保存不新增记录，也不重置实时模拟值。`If-Match` 冲突在写日志或激活工程之前拒绝。

`POST /load/:id` 同样记录打开工程，并明确暂停自动控制；浏览器为该入口也携带 `If-Match`。启动服务恢复活动工程不生成伪造的编辑记录。直接保存接口的来源 `editor` 表示保存通道，不是经过认证的用户身份。

`GET /agent/plans` 保持数组响应，增加可选参数：`projectId`、`source=editor|agent|load`、`limit=1..200`（默认200）、`cursor`（上一页最后一项的 ID）。重要异常记录优先，其余按时间和 ID 降序。筛选不变时传入 cursor 获取更早记录；返回不足 limit 项时到末页。筛选变化或游标不再存在时从首页重读。前端默认当前工程、每页20条，支持来源筛选和加载更早记录；外部 MCP 的 `flexhmi_plans` 支持相同参数。

完整记录由 `/agent/plans/:id` 获取，编辑保存也是 `applied` 记录，不得再次当作新操作执行。需要恢复时使用原有 `project.revert` 生成新预览，查看所有覆盖差异再应用。跨工程创建/加载记录不允许拿另一个工程的快照覆盖当前工程。

保存前/后强制结束进程的验收覆盖普通保存日志：目标已保存则重启核对为已应用，否则标记中断；均不重放写入。历史保存在用户工程目录 `agent/plan_*.json`，不是异机备份，也未配置自动清理策略。旧版本未记录的手动保存无法补造历史。该记录覆盖中文产品编辑器及其 /simplehmi/api/project 保存通道；上游工程师界面的独立项目修改不在这套记录中。
