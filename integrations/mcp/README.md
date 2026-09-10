# FlexHMI 外部 Agent 接入

这是可选的本机 MCP stdio 扩展，使用官方 TypeScript SDK。需要 Node.js 22 或更高版本。它不向工控机候选安装包增加依赖；已发布的 0.3.0 IPC 草稿安装包尚不包含此扩展。

## 启动与连接

1. 按根目录 README 安装并启动 FlexHMI。
2. 在仓库根目录运行 `npm run setup:mcp`。
3. 打开 AI 工作台 → 连接外部 Agent，选择操作范围并复制配置，添加到支持 MCP stdio 的客户端。
4. 重新连接客户端。应发现 23 个工具（完整范围）、4 个资源与 `build_system` 提示模板。

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

## 范围和操作

| 宿主配置 | 可用操作 |
|---|---|
| `read` | 能力、当前工程、已保存工程列表、实时值、历史、契约、计划状态、审计、知识、评估与控制状态 |
| `engineering` | 以上加工程预览/应用/取消、设备连接测试、行业评估上下文与评估计划 |
| `full`（默认） | 以上加控制授权/暂停、点位写入；默认只允许模拟控制 |

工程修改遵循读取 state/schema → preview → 检查所有关联影响和诊断 → apply。应用不会自动启动控制。保存工程支持读取完整内容、加载、归档删除和恢复：先读取 `flexhmi_projects` 的目标 `revision`，在对应操作提供 `expectedSavedRevision`，再经预览应用。`project.load` 必须首项；`project.delete/restore` 必须单独计划。不能删除当前工程，恢复不会加载工程或启动设备。加载即使为同一工程也暂停自动控制。`flexhmi_plans` 可发现中断和不可读的计划记录。高级协议依然通过工程师模式配置。

`flexhmi_write_point` 必须携带最新工程版本、设备和点位 ID、预期当前值、观察时间戳 `observedAt`、目标值及范围。观察时间取自 `flexhmi_values` 的 `values[tagId].ts`。服务端重新检查数据质量、时效、类型、版本和当前值，接管对应自动控制，写入并验证新鲜回读。写入或回读失败可能意味着设备已经动作；返回 `outcomeUnknown` 时先检查实时值与审计，不盲目重试。

真实设备写入需要用户在客户端宿主配置 `FLEXHMI_PHYSICAL_WRITES=1`，并提供符合点位许可的明确目标。模型不能通过工具参数开启宿主配置。暂停自动控制不会把其他输出自动复位。

行业评估先调用 `assessment_context` 取得有版本的资料与实时观察，再提交带精确引用和适用区间的 `evaluate`，最后预览应用。资料和采样过期或变化会拒绝应用。内置资料仅用于演示。

## 验证和边界

`npm run test:mcp` 使用官方 SDK 客户端通过 stdio 连接真实本机 FUXA 测试进程，覆盖工具发现、范围、版本冲突、预览/幂等应用、模拟写入回读、控制启停、行业评估与审计。后端测试使用隔离临时目录，不覆盖用户工程。

操作范围只约束此 MCP 进程，不是本机 HTTP 的多用户权限边界。Agent ID 是审计标签，不是经过认证的身份。当前已有应用中断后的结果核对，尚缺少完整权限、通用回滚与灾难恢复、通用状态机及真实模型/现场设备验收。本扩展的协议回归通过不等于这些产品能力完成。


重启会核对 `applying` 日志：保存结果与计划相符则标记已应用，后续请求只返回历史成功；不相符则标记 `interrupted`，要求根据当前工程重新预览。不会自动重放通信变更或控制写入。归档通过同目录树内原子重命名完成，可核对源文件消失和目标内容哈希。损坏的单条计划保留原件并报告，不阻止其他工程启动。此验证覆盖进程强制退出，不保证磁盘损坏或突然断电恢复。
