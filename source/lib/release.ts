import manifest from '../public/downloads.json';
export type Platform = 'windows' | 'macos';
export type Download = { arch: 'x64' | 'arm64'; file: string; bytes: number; sha256: string; url: string; qualified: boolean };
export type Release = { platform: Platform; version: string; channel: string; qualified: boolean; sourceCommit: string | null; releaseUrl: string; qualificationUrl: string | null; checksumUrl: string | null; publishedAt: string | null; packages: Download[] };
export const releases = manifest.releases as Release[];
export function qualifiedPackage(arch: Download['arch'], platform: Platform = 'windows'): (Download & {release: Release}) | undefined {
 const release = releases.find(r => r.platform === platform);
 if (!release?.qualified || !release.sourceCommit || !release.qualificationUrl) return;
 const pkg = release.packages.find(p => p.arch === arch && p.qualified && p.bytes > 0 && /^[0-9a-f]{64}$/.test(p.sha256) && p.url.startsWith('https://github.com/NSIETeam/FlexHMI/releases/download/'));
 return pkg ? {...pkg,release} : undefined;
}
