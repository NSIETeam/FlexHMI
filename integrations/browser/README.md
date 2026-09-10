# 独立浏览器验收

此可选测试使用真实 Chrome 无界面模式、临时 FUXA 数据目录和随机本机端口，不修改正在使用的工程。浏览器测试依赖不进入 IPC 安装包。

在仓库根目录执行：

```sh
npm run setup:browser
npm run test:browser
```

需要先安装后端依赖与 Google Chrome。其他 Chromium 可通过 `CHROMIUM_EXECUTABLE` 指定可执行文件绝对路径。`FLEXHMI_BROWSER_ARTIFACTS` 指定截图/结果目录，相对路径基于仓库根目录；默认保存到系统临时目录 `flexhmi-browser-evidence`。

覆盖管线新建和修改、画布点击入口、反向、删除/撤销、外侧回流预览、保存重载、运行时隐藏编辑入口、泵反馈对应管线流动、MCP 配置范围、保存工程预览/应用与窄屏操作。发生失败会保存截图和隔离后台日志；测试完成删除临时工程数据。

无界面浏览器验证不代表 Windows 安装包验收，也不等同于用户桌面交互验收。测试中的回流连接用于几何和编辑验证，不会给双水箱模拟增加回流物理模型。
