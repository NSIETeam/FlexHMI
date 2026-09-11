# FlexHMI Windows 桌面预览版

当前版本为 0.4.2，安装向导、卸载显示名和开始菜单已统一为“FlexHMI 桌面版”，保留旧安装标识与数据路径。新版的实际安装、步骤控制、历史恢复、授权与完整卸载验证见 [0.4.2 发布记录](releases/0.4.2.md)。下文也保留了旧版构建与验收的历史说明。

## 安装和使用

选择 Windows x64（Intel / AMD）或 Windows ARM64 安装包。目标为 64 位 Windows 10 / 11，需预装 Microsoft Edge。包内含 Node.js、离线编辑器、FUXA 运行及协议依赖，不需要另装 Node.js 或联网加载 UI。模型服务另行配置；无需为软件启动下载大模型。

安装后从开始菜单“FlexHMI 桌面版”进入：

- **编辑工程**：项目、设备、画面和 AI 工作台。
- **运行画面**：打开当前已保存工程。
- **全屏运行**：直接显示 kiosk 画面，隐藏编辑器。Alt+F4 关闭浏览器窗口。
- **停止服务**：停止本产品拥有的后端进程。关闭浏览器并不会停止采集或已授权自动控制；停止服务也不等于对物理设备发送停机指令。

编辑器自动保存；关闭前检查保存状态。重复打开复用同一后端。应用崩溃不会自动重启控制，重新启动时必须重新授权。此版是当前用户的桌面后台程序，尚不是开机前启动的 Windows 服务，也不包含 Windows 账户锁定/系统展台策略。

安装目录默认 `%LOCALAPPDATA%\Programs\FlexHMI-IPC`；工程、日志和模型配置位于 `%LOCALAPPDATA%\FlexHMI-IPC`。升级先停止服务；卸载只移除包拥有的文件，保留用户数据。旧 SimpleHMI 桌面版工程可通过 JSON 导出/导入迁移，勿同时连接同一真实 PLC 输出。

主程序参数：`FlexHMI.exe --editor`、`--runtime`、`--kiosk`、`--stop`。故障时查看用户目录的 ipc.log / last-error.txt。

## 体积和架构

移除随包附带的 Electron 浏览器内核，复用系统 Edge；保留 Node.js、通讯驱动、原生 SQLite / 串口组件及完整工程师界面，没有删除协议或高级功能。Node-RED 的可选原生密码加速包已移除，使用它自带的 bcryptjs 回退路径；实际验证正确密码通过、错误密码拒绝，消除额外 VC 运行库依赖。未把体积节省等同于已测得的运行内存节省。默认不加载工程师前端，用户打开高级入口时才请求该页面。

采用独立本机控制通道和单实例后端，随机认证令牌、就绪实例核验、独立用户目录、日志轮转和只终止自己创建的进程。界面仍通过原有 `/simplehmi/` 路径连接，已有工程及 Agent 协议保持兼容。

Microsoft Edge 全屏参数依据：[官方 kiosk 文档](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-configure-kiosk-mode)。

## 构建与验收边界

运行 `python3 scripts/windows/build-ipc.py --help` 获取参数。先提交源码；脚本只打包 Git 已跟踪的项目文件，使用已校验的 Windows Node 22.23.2、各架构原生依赖和 LLVM MinGW 缓存，输出载荷 ZIP 与源码/依赖来源清单。依赖缓存必须与当前 server/package-lock.json 一致。0.4.0 包含 MCP 及其依赖；仅保留运行所需的 Node.exe 和许可证，不附带 npm 开发工具。

把两个 Payload.zip 和 payloads.json 上传到候选草稿后，执行 **Windows source release qualification** 工作流。它验证载荷哈希、源码提交和每个项目文件，再在 Windows 上用匹配的 NSIS 编译器/插件生成安装器并验收。不要使用旧的 macOS NSIS 编译器与 Windows 插件混用路线；0.3.0 旧安装器曾由此产生启动崩溃。

0.3.0 载荷经 Windows 原生重建后，x64/ARM64 均通过中文路径安装、原生 SQLite/串口绑定、Edge 渲染、模拟守恒/启停、单实例、保存恢复、覆盖安装、卸载保留数据测试（运行 34490584866）。0.4.0 新源码包已独立通过运行 34492968066；增加已安装源码完整性、内置 MCP 23 工具、IPC 自动发现及回流布线检查。发布说明和校验清单注明具体通过的源码与包哈希，不能将旧包测试结果套到新包。

安装包未签名。测试机验证不等于客户现场验证；物理 PLC、串口设备、Windows 10 以及工控机的实际配置需要现场确认。

Windows 验收：先执行包内 desktop/verify-runtime.ps1 检查架构、SQLite、串口绑定，再打开编辑→创建工程→供水示例→启停→保存→停止服务→重新打开；核对数据持久化、控制不自动恢复、全屏和卸载保留工程。物理设备需按 README 完成地址、字节序、权限和 PLC 联锁核验。

品牌为 FlexHMI，使用用户选定的黑白图形。移除了界面中旧品牌图标；FUXA、Node.js 及各依赖的许可证/版权声明保留。
