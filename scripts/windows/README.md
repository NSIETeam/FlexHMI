# 本次 Windows 交叉构建记录

构建主机 macOS ARM64，Electron 44.3.0 + 独立 Node.js 22.23.2。
本目录保存本次实际使用的构建脚本，脚本采用构建工作区目录约定，不能直接在此目录执行。

工作区布局：`<root>/outputs/SimpleHMI` 为源码；将本目录中的脚本复制到 `<root>/work/windows-tools` 后运行。正式产品可进一步改成 CI 参数化任务。

1. `download.py` 从 Node.js / Electron 官方下载双架构 zip，对照官方 SHASUMS256 校验。
2. `work/windows-runtime` 复制 server/package.json 与 package-lock.json，执行 `npm ci --omit=dev --ignore-scripts --os=win32 --cpu=arm64`。
3. 从 mstorsjo/llvm-mingw 官方 release 获取 `llvm-mingw-20260908-ucrt-macos-universal`；下载 Node v22.23.2 头文件至 `node/node-v22.23.2/include/node`，x64/arm64 node.lib 分别存为 `node/node-x64.lib` 与 `node/node-arm64.lib`。
4. `build_native.py` 编译两个架构的 sqlite3 5.1.7（所带 SQLite 3.44.2）、serialport bindings。串口编译副本移除未使用的 node_buffer.h 及未使用 v8 局部变量，避免 GNU/MSVC C++ ABI 混用；保持 N-API 接口。源码原文件不改。
5. `work/product-tools` 安装 resedit 3.1.0 与其 pe-library 依赖；`stage.py` 组装两份 Electron 目录、更新图标/版本，替换为对应原生模块，清除其他架构 .node。
6. NSIS 3.04 原生 macOS 编译器与 electron-builder-binaries nsis-3.0.4.1 的 Stubs/Plugins/Include 配套，置于 `nsis-bin`。本次 NSIS v304 的 SCons Python 2 文件通过 lib2to3 转换，StringType 改为 str、has_key 改为 in；以 VER_MAJOR=3 VER_MINOR=4 VERSION=3.04、SKIPSTUBS/PLUGINS/UTILS/MISC=all 构建 makensis。只变更宿主构建兼容性。
7. `verify-pe.py` 检查主程序、Node 和三个 native modules 的架构与导入表；`package.py` 使用 desktop/installer.nsi 生成中文按用户安装器，卸载清单逐文件生成，保留用户数据。

安装器 bootstrap 为 NSIS 32 位，其负载分别是原生 Windows x64 / ARM64，这是正常的安装器结构。未签名。不要用安装器自身的 PE 架构判断负载架构。

Windows 安装后可在 `resources/app` 中运行 `verify-runtime.ps1` 验证数据库与串口 native 模块加载，再完成 GUI/保存/卸载与真实设备验收。本次没有 Windows 主机，未执行该脚本。

许可证：FUXA MIT、Electron MIT（发行包内含 Chromium notices）、Node.js 自带 LICENSE、SQLite public domain、serialport MIT；生产依赖许可证保留在包内。工具仅用于构建，不需要部署到客户主机。
