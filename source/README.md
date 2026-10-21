# FlexHMI 官网

黑白视觉官网，使用 FlexHMI 产品图标与真实编辑界面截图。官网介绍三种工程模式，并提供 Windows x64 / ARM64 与 macOS Apple Silicon / Intel 桌面预览版下载。

`npm ci` 安装依赖，`npm run dev` 本地预览，`npm run build` 生成静态站点。部署配置为 `.openai/hosting.json`，静态输出在 `dist/client`。

## 更新下载

`public/downloads.json` 是唯一版本来源。每个操作系统独立记录版本；只有它的两种架构都完成原生安装验收、对应安装器哈希与公开 GitHub Release 资产一致后，才将 `qualified` 设为 true 并更新下载 URL、SHA-256、大小、源码提交和验收链接。`lib/release.ts` 阻止未合格的包显示下载按钮。

这里的合格范围为记录的安装与功能验收，不等于现场 PLC 认证或全产品成熟度声明。未签名、预览版和平台测试范围必须在下载区保留。不要把旧载荷的验收结果复用到新版本。

## 资源来源

- `public/flexhmi-icon.png`：产品现有用户指定黑白图标。
- `public/flexhmi-workspace.png`：独立模拟工程的真实编辑器截图，不含客户数据。
- 图标：lucide-react。
- 产品源码：https://github.com/NSIETeam/FlexHMI

## 浏览器 Agent 支持

支持 WebMCP 的浏览器可注册只读工具 `get_flexhmi_installer`，从与下载卡片相同的版本清单返回指定操作系统与架构的链接和校验值。它不会自动下载或安装。不支持该提议接口时正常链接不受影响。当前环境尚未提供可验证的 WebMCP 浏览器上下文，因此未声称此工具完成浏览器注册/调用验收。
