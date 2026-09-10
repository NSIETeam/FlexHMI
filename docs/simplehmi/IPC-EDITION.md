# FlexHMI 0.3.0 工控机候选版

## 安装和使用

选择 Windows x64（Intel / AMD）或 Windows ARM64 安装包。目标为 64 位 Windows 10 / 11，需预装 Microsoft Edge。包内含 Node.js、离线编辑器、FUXA 运行及协议依赖，不需要另装 Node.js 或联网加载 UI。模型服务另行配置；无需为软件启动下载大模型。

安装后从开始菜单“FlexHMI 工控机版”进入：

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

运行 `python3 scripts/windows/build-ipc.py --help` 获取参数。脚本使用已下载校验的 Windows Node 22.23.2、各架构原生依赖、LLVM MinGW 和 NSIS 缓存，不联网下载，不复用旧 UI。输出安装包、每个架构原生模块检查与 SHA-256 清单。

构建机器是 macOS ARM64。已完成源码检查、Angular 构建、本机后端/模拟/Modbus 测试从站回归，以及启动器单实例、认证、就绪、窗口请求和停止子进程测试。PE 架构检查不能代替 Windows 安装运行验收。安装包未签名，尚未完成 Windows x64 / ARM64 实机安装、Edge 启动、中文路径、卸载和串口硬件测试。

Windows 验收：先执行包内 desktop/verify-runtime.ps1 检查架构、SQLite、串口绑定，再打开编辑→创建工程→供水示例→启停→保存→停止服务→重新打开；核对数据持久化、控制不自动恢复、全屏和卸载保留工程。物理设备需按 README 完成地址、字节序、权限和 PLC 联锁核验。

品牌为 FlexHMI，使用用户选定的黑白图形。移除了界面中旧品牌图标；FUXA、Node.js 及各依赖的许可证/版权声明保留。
