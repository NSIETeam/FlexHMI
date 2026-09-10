# FlexHMI 行业知识与 AI 评估

在 AI 工作台选择行业 AI 模式，打开行业知识库，可以创建、导入、搜索、编辑和导出带来源、版本、有效期的条目。条目变化必须增加版本，引用旧版本的控制规则自动停用；知识配置变化暂停自动控制。

内置的三个供水条目仅为源码衍生的演示知识，不是行业标准或已采购的专业数据库。正式使用需导入经客户工程师审核的参数、工艺文件和出处。

## 最短使用流程

1. 创建供水示例，选择行业 AI 模式；知识库加载示例资料。
2. 配置模型服务，在模型面板选择“依据知识评估当前系统”，明确勾选知识和观测变量，写明要评估的问题。
3. 查看结论、逐字证据、出处、版本、采样时刻、适用区间和工程改动。
4. 应用计划时重新核对工程版本、知识哈希/有效期、点位定义和新采样值；超出区间、数据过期或三分钟超时则拒绝，需重新评估。
5. 规则修改后保持手动，检查后从控制面板启动；实际设备写入需指定目标授权。

知识内容被明确作为资料发送给模型，不具有执行指令的优先级。程序验证引用来自所选资料，但不能独立证明模型推理正确；客户仍须审核结论及条件。无改动结论可保存为报告，不制造空变更。

## 外部 Agent

以 `/simplehmi/api` 为根路径：

- `GET /knowledge?q=...` 搜索资料及当前工程版本。
- `POST /industry/context`：`expectedRevision`、`prompt`、`knowledgeIds`、`observedTagIds`。生成可信采样上下文和 context ID，有效期三分钟。
- `POST /industry/evaluations`：`contextId`、`summary`、`operations`、`assessment`。assessment 包含 conclusion、citations（entryId/version/excerpt）和 conditions（tagId/min/max）。每个观察点位都必须给出包含采样值的适用范围。
- `GET /industry/evaluations/:id` 获取持久化评估。非空操作生成普通预览计划，再使用既有 `/agent/plans/:id/apply` 路径应用。
- UI 的“打开已有结果”接受 `evaluation_...` 和 `plan_...`，可审阅外部 Agent 的建议后应用。
- CLI 提供 `knowledge`、`context`、`assess`、`assessment`、`control`、`arm`、`pause` 子命令。

普通计划不能自称为经过验证的评估：可信 assessment 只能由验证入口附加。评估计划不能同时创建工程或改写引用资料。rule.upsert 自动附上证据引用。

## 实际验证与边界

59 项回归覆盖资料版本、出处/引用/采样核验、模型协议、写入和控制故障等。实际外部 Agent 读取现场模拟快照，依据两条明确标注的示例知识提出供水泵 35% / 40% 回差修改，在浏览器预览并应用成功；应用后保持手动。证据在本目录 live-agent-assessment.json 和 live-agent-assessment-applied.json。

内置模型使用本机协议夹具做了测试，尚未配置真实模型账号。没有接入生产行业数据库或物理 PLC；外部 API 当前只允许本机访问，尚无多用户角色/能力范围管理。这些不能视为整个产品目标已经完成。
