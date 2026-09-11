"""Shared distribution policy. Operates on an isolated staged dependency copy only."""
from pathlib import Path, PurePosixPath
import json, shutil

def include_source(name):
    path = PurePosixPath(name)
    if path.parts[:2] == ('docs', 'simplehmi'):
        return name == 'docs/simplehmi/DESKTOP.md'
    if path.parts[:3] == ('integrations', 'mcp', 'test'):
        return False
    return True

def prune_development(staged_modules, lockfile):
    modules = Path(staged_modules).resolve()
    source_modules = Path(lockfile).resolve().parent / 'node_modules'
    if modules == source_modules.resolve():
        raise ValueError('Refusing to prune source dependencies')
    lock = json.loads(Path(lockfile).read_text())
    if lock.get('lockfileVersion') not in (2, 3):
        raise ValueError('Dependency lock must describe package locations')
    report = {'removedPackages': [], 'removedBytes': 0}
    candidates = []
    for name, package in lock['packages'].items():
        if package.get('dev') is not True:
            continue
        rel = PurePosixPath(name)
        if rel.is_absolute() or '..' in rel.parts or not rel.parts or rel.parts[0] != 'node_modules':
            raise ValueError('Invalid locked dependency path: ' + name)
        target = modules.joinpath(*rel.parts[1:])
        if not target.parent.resolve().is_relative_to(modules):
            raise ValueError('Dependency parent escapes staging directory')
        candidates.append((name, target))
    for name, target in sorted(candidates):
        if target.is_symlink():
            target.unlink(); report['removedPackages'].append(name)
        elif target.exists():
            report['removedBytes'] += sum(f.stat().st_size for f in target.rglob('*') if f.is_file() and not f.is_symlink())
            shutil.rmtree(target); report['removedPackages'].append(name)
    for directory in [modules / '.bin', *modules.glob('*/node_modules/.bin'), *modules.glob('@*/*/node_modules/.bin')]:
        if directory.is_dir():
            for link in directory.iterdir():
                if link.is_symlink() and not link.exists():
                    link.unlink()
    return report
