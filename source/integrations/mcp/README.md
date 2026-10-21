# FlexHMI 外部 Agent 接入

这是可选的本机 MCP stdio 扩展，使用官方 TypeScript SDK。需要 Node.js 22 或更高版本。Windows 0.4.0 与 macOS 0.4.1 桌面包已内置；0.3.0 IPC 旧草稿包不包含。0.4.2 四平台桌面包已包含历史恢复、步骤流程和访问保护，并通过安装后的 MCP 服务端权限测试。

## 启动与连接

1. 按根目录 README 安装并启动 FlexHMI。
2. 在仓库根目录运行 `npm run setup:mcp`。
3. 打开 AI 工作台 → 连接外部 Agent，选择操作范围并复制配置，添加到支持 MCP stdio 的客户端。
4. 重新连接客户端。应发现 24 个工具（完整范围）、4 个资源与 `build_system` 提示模板。

也可以手动配置。路径必须替换成当前机器的绝对路径；Windows JSON 中反斜杠需要转义。直接以 Node 启动，避免 npm 启动横幅混入协议输出。

```json
{
  "mcpServers": {
    "flexhmi": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/FlexHMI/integrations/mcp/server.mjs"],
      "env": {
        "FLEXHMI_URL": "http://127.0.0.1:1881/simplehmi/api/",
        "FLEXHMI_ACCESS": "full",
        "FLEXHMI_PHYSICAL_WRITES": "0",
        "FLEXHMI_AGENT_ID": "external-agent"
      }
    }
  }
}
```

未指定 URL 时，扩展尝试查询 IPC 启动器的本机服务状态，再回退到 1881。只允许 loopback HTTP(S)，禁止重定向及带凭据的 URL。

## 可选访问保护

在 AI 工作台的接入面板设置所有者密码，选择范围、名称和有效期，再创建授权并复制配置。启用后，每个客户端的 env 增加 `FLEXHMI_TOKEN`，值来自一次性显示的授权配置；后端没有配置令牌的请求会被拒绝。不要把包含令牌的配置提交到仓库。撤销令牌后原配置即失效，相关自动控制停止后续写入。改密码会撤销全部 Agent 授权。详见 [访问保护](../../docs/simplehmi/ai/ACCESS.md)。

## 范围和操作

| 宿主配置 | 可用操作 |
|---|---|
| `read` | 能力、当前工程、已保存工程列表、实时值、历史、契约、计划状态、审计、知识、评估与控制状态 |
| `engineering` | 以上加工程预览/应用/取消、设备连接测试、行业评估上下文与评估计划 |
| `full`（默认） | 以上加控制授权/暂停、点位写入；默认只允许模拟控制 |

工程修改遵循读取 state/schema → preview → 检查所有关联影响和诊断 → apply。应用不会自动启动控制。保存工程支持读取完整内容、加载、归档删除和恢复：先读取 `flexhmi_projects` 的目标 `revision`，在对应操作提供 `expectedSavedRevision`，再经预览应用。`project.load` 必须首项；`project.delete/restore` 必须单独计划。不能删除当前工程，恢复不会加载工程或启动设备。加载即使为同一工程也暂停自动控制。`flexhmi_plans` 可发现中断和不可读的计划记录。高级协议依然通过工程师模式配置。

`flexhmi_write_point` 必须携带最新工程版本、设备和点位 ID、预期当前值、观察时间戳 `observedAt`、目标值及范围。观察时间取自 `flexhmi_values` 的 `values[tagId].ts`。服务端重新检查数据质量、时效、类型、版本和当前值，接管对应自动控制，写入并验证新鲜回读。写入或回读失败可能意味着设备已经动作；返回 `outcomeUnknown` 时先检查实时值与审计，不盲目重试。

真实设备写入需要用户在客户端宿主配置 `FLEXHMI_PHYSICAL_WRITES=1`，启用访问保护时还需所有者为该令牌授予真实写入许可，并提供符合点位许可的明确目标。模型不能通过工具参数开启宿主配置。暂停自动控制不会把其他输出自动复位。

行业评估先调用 `assessment_context` 取得有版本的资料与实时观察，再提交带精确引用和适用区间的 `evaluate`，最后预览应用。资料和采样过期或变化会拒绝应用。内置资料仅用于演示。

## 验证和边界

`npm run test:mcp` 使用官方 SDK 客户端通过 stdio 连接真实本机 FUXA 测试进程，覆盖工具发现、范围、版本冲突、预览/幂等应用、模拟写入回读、控制启停、行业评估与审计。后端测试使用隔离临时目录，不覆盖用户工程。

默认可信本机模式下，宿主操作范围只约束此 MCP 进程，Agent ID 只是审计标签。启用访问保护后，服务端独立校验令牌范围，审计身份采用授权 ID；修改宿主配置不能扩大令牌权限。当前尚缺少多用户和按项目权限、通用回滚与灾难恢复、跨流程事务协调及真实模型/现场设备验收。本扩展的协议回归通过不等于这些产品能力完成。


重启会核对 `applying` 日志：保存结果与计划相符则标记已应用，后续请求只返回历史成功；不相符则标记 `interrupted`，要求根据当前工程重新预览。不会自动重放通信变更或控制写入。归档通过同目录树内原子重命名完成，可核对源文件消失和目标内容哈希。损坏的单条计划保留原件并报告，不阻止其他工程启动。此验证覆盖进程强制退出，不保证磁盘损坏或突然断电恢复。

工程历史恢复：先调用 `flexhmi_plans` / `flexhmi_plan` 检查来源，再用 `flexhmi_preview` 单项操作 `project.revert`（planId）生成恢复计划。检查全部覆盖内容后 `flexhmi_apply`；自动控制保持暂停，不回滚设备输出，资料恢复采用新版本。


步骤流程通过 `flexhmi_preview` 中的 `machine.upsert {machine}` / `machine.delete {id}` 操作，再经 `flexhmi_apply` 保存；工具数量为 24。完整模型见 [控制文档](../../docs/simplehmi/ai/CONTROL.md)。`flexhmi_control_status.machines` 返回当前步骤、跳转次数和已验证写入次数。保存不启动；`flexhmi_control_arm` 要求初始输出一致、全部引用新鲜、允许条件和依据有效，真实输出的会话许可涵盖所有步骤。`flexhmi_control_pause` 停止后续动作。多个输出逐项写入，失败时已发出的动作不会回滚。

官方 MCP 客户端验收包含：生成待机 → 供水 → 停机配置、预览不改变工程、应用保持手动、显式启动、两次模拟输出回读、终点与人工接管。它验证真实 MCP/FUXA 协议链路，不代表真实语言模型生成质量。


`flexhmi_plans` 可读取普通编辑保存记录（source=editor）、AI/Agent 计划（agent）和直接打开工程（load）；这些是操作通道，尚非已认证身份。参数 `projectId`、`source`、`limit`、`cursor` 支持筛选和历史翻页，使用上一页最后一条 ID 作为下一页 cursor，返回少于 limit 项即结束。响应仍为 `data` 数组，工具数量为 24。编辑记录读取与恢复仍使用 `flexhmi_plan` 和 `project.revert`。

## 评估记录

`flexhmi_assessments` 检索内置 AI 和外部 Agent 保存的评估，包含无工程改动的报告。支持 `projectId`、`source`（model / external）、`q`、`limit`（1–100）、`cursor`；响应为 `records`、`nextCursor`、`unreadable`。使用返回的 nextCursor 翻页，为 null 时结束；再用 `flexhmi_assessment` 打开详情。有计划的评估应读取其最新 plan 状态再考虑应用，历史观测不是当前值。

### 切换过程模型与真实设备

`flexhmi_preview` 的 `project.configure` 现在支持 `simulation`：`water-transfer`、`waste-to-energy` 或 `null`。`null` 移除模型，省略字段保留现状。切换模型与 `device.upsert` / `tag.upsert` 可放在同一计划中，按最终工程统一校验；组件绑定的变量 ID 可以保留。未提供实际点表时不要推测现场地址和控制含义。

预览会列出模型切换、通信重启、模拟状态/历史缓存重置以及自动控制暂停等影响。移除模型本身不会把模拟设备变成真实设备；保留的模拟点将恢复独立信号行为。应用设备配置会尝试建立通信，但不代表连接成功，也不会授权物理写入或启动自动控制。读取设备状态和点位质量后，再按原有显式授权流程操作。可再次设置原模型并将相应点位设备恢复为 `sim`，从固定演示初始状态重新开始。
