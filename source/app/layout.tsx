import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  metadataBase: new URL('https://flexhmi.nsieteam.chatgpt.site'),
  title: 'FlexHMI · 工业可视化，从此简单',
  description: '中文、开源、AI 原生的工控组态工作台。从设备点位到可运行画面，用拖放与自然语言构建你的工业系统。下载 Windows 与 macOS 桌面版，支持 Intel、AMD 和 Apple Silicon。',
  icons: { icon: '/flexhmi-icon.png' },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
