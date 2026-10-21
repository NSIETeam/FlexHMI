'use client';
import { useEffect } from 'react';
import { qualifiedPackage } from '../lib/release';
type Tool = { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute: (input: unknown) => unknown };
type ModelContext = { registerTool: (tool: Tool, options?: { signal?: AbortSignal }) => void | Promise<void> };
export default function ReleaseTools() {
 useEffect(() => {
  const context = (document as Document & { modelContext?: ModelContext }).modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  const tool: Tool = {
   name: 'get_flexhmi_installer', title: '获取 FlexHMI 合格安装包',
   description: '按操作系统和处理器架构读取官网同一份验收版本、下载链接和 SHA-256。不开始下载，不安装软件。',
   inputSchema: { type: 'object', properties: { platform: { type: 'string', enum: ['windows','macos'] }, arch: { type: 'string', enum: ['x64','arm64'] } }, required: ['arch'], additionalProperties: false },
   annotations: { readOnlyHint: true, untrustedContentHint: false },
   execute(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['arch','platform'].includes(key)) || !('arch' in input) || (input.arch !== 'x64' && input.arch !== 'arm64')) throw new Error('arch 必须为 x64 或 arm64');
    const platform = 'platform' in input ? input.platform : 'windows';
    if (platform !== 'windows' && platform !== 'macos') throw new Error('platform 必须为 windows 或 macos');
    const pkg = qualifiedPackage(input.arch, platform);
    if (!pkg) return { available: false, arch: input.arch, reason: '此架构的新版安装包尚未完成验收' };
    const {release, ...download} = pkg;
    return { available: true, platform, ...download, version: release.version, channel: release.channel, codeSigned: false, sourceCommit: release.sourceCommit, qualificationUrl: release.qualificationUrl, releaseUrl: release.releaseUrl };
   },
  };
  try { Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => { /* Standard links remain usable when registration is unavailable. */ }); } catch { /* Optional browser capability. */ }
  return () => lifecycle.abort();
 }, []);
 return null;
}
