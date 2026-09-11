# FlexHMI macOS 版

Apple Silicon 与 Intel 提供独立安装包。请在 [发布记录](https://github.com/NSIETeam/FlexHMI/releases) 查看对应版本、安装验收范围与校验摘要。

Apple Silicon（M 系列）选择 arm64；Intel Mac 选择 x64。目标系统 macOS 13 或更新版本；具体通过的测试系统与安装包哈希见发布说明。

打开 DMG，将 FlexHMI 拖到 Applications（应用程序），然后从应用程序启动。应用内置 Node.js、工业协议依赖和 MCP，使用 macOS 的 WebKit 显示画面，无需 Edge、Chrome、Electron 或单独安装 Node.js。

当前为未进行 Developer ID 签名和 Apple 公证的预览版；本地 ad-hoc 签名只保证代码封装完整性，不证明发布者身份。从官网下载并核对 SHA-256 后，如果系统阻止打开，可在“系统设置 → 隐私与安全”查看对应提示并选择“仍要打开”。不要关闭 Gatekeeper。

项目、日志和配置保存于 `~/Library/Application Support/FlexHMI`，不写入应用包。菜单“FlexHMI → 打开工程数据目录”可直接进入。移动或删除应用不会删除这些数据。

- 关闭窗口：确认工程已保存后隐藏窗口，本机服务继续运行；点击 Dock 图标可重新打开。
- Command+Q / “退出并停止本机服务”：先确认保存，再停止本应用服务。停止服务不会向现场设备发送停机指令。
- “视图 → 编辑工程 / 运行画面 / 全屏”：切换显示方式。
- 升级：先退出应用，再拖入新版本覆盖。
- 卸载：退出后把 FlexHMI.app 移到废纸篓；工程数据保留。

在 AI 工作台复制 MCP 配置即可接入外部 Agent，配置会使用应用内置的 Node 路径。首次配置真实设备或模型服务时，按系统提示决定本地网络权限。模拟工程不需要连接现场设备。

真实模型质量、生产知识资料、现场 PLC 和安全联锁需另行验证。本机阈值控制不能取代 PLC 的独立保护逻辑。程序退出、重启或加载工程不会自动恢复控制授权。

开发构建：在目标架构 Mac 上安装 server 的生产依赖及 integrations/mcp 依赖，然后运行 `python3 scripts/macos/build.py --work <构建目录> --out <产物目录>`。脚本检查干净源码，校验官方 Node 22.23.2 下载包，编译原生 WebKit 启动器并生成 DMG。运行验收必须使用从 DMG 实际复制出的应用，不能仅测试源码目录。
