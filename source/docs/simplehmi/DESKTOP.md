# FlexHMI 桌面使用说明

安装后打开 FlexHMI，即可进入中文编辑器。Windows 支持 x64 / ARM64；macOS 支持 Apple Silicon / Intel。发布版本和系统验证范围以下载页为准。

1. 在“项目”中新建工程，选择数据可视化、智能控制或行业 AI 系统。
2. 从模拟设备开始添加变量，将组件或变量拖入画布，在右侧绑定数据、设置外观和动作。
3. 选择两个设备创建连接。已知回流设为“回流”；在 AI 工作台预览自动优化，查看关联影响后应用。
4. 点击“运行”预览。修改会自动保存，可在项目和历史记录中加载或恢复配置。
5. 在 AI 工作台配置模型服务，再用自然语言生成或修改工程。先检查预览与提示；应用工程不会自动启动控制。外部 Agent 可复制软件内生成的 MCP 配置。

报警上限留空时不能判断报警；失效数据不会显示正常。显示“未触发上限报警”仅说明这个上限未触发。模拟工程不代表真实设备连接，演示参数不是行业标准。

工程师模式保留 FUXA 高级能力。全屏是可选展示功能，普通桌面使用无需专门的工控机配置。卸载和升级的用户数据行为请查看对应版本说明。

完整使用文档、协议说明、开源代码与逐版本验收证据保存在公开仓库，不放入安装包：

- [下载与版本说明](https://github.com/NSIETeam/FlexHMI/releases)
- [项目说明](https://github.com/NSIETeam/FlexHMI#readme)
- [AI 模型配置](https://github.com/NSIETeam/FlexHMI/blob/main/docs/simplehmi/ai/MODEL-SETUP.md)
- [外部 Agent 接口](https://github.com/NSIETeam/FlexHMI/blob/main/docs/simplehmi/ai/AGENT-API.md)
- [控制与行业资料](https://github.com/NSIETeam/FlexHMI/tree/main/docs/simplehmi/ai)

应用内置运行环境。当前预览版未提供 Windows 发布者签名或 Apple Developer ID 签名与公证；是否已验证你的系统版本，请看对应发行说明。
