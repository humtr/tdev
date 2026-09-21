"""Atomic three-way source-delta integration, without touching a checkout or its index."""
import tempfile
from pathlib import Path

from .common import decode, path, require


def record(entry):
    return {'mode': entry[0], 'blob': entry[1]} if entry else None


def collisions(entries):
    result = set()
    for name in entries:
        parts = name.split('/')
        for i in range(1, len(parts)):
            parent = '/'.join(parts[:i])
            if parent in entries:
                result.update((parent, name))
    return result


def integrate(git, checkpoint, base, incoming, resolutions, marker):
    before, ours, theirs = git.entries(base), git.entries(checkpoint), git.entries(incoming)
    merged, conflicts = {}, {}

    def conflict(name, reason):
        conflicts[name] = {'path': name, 'reason': reason, 'base': record(before.get(name)),
                           'current': record(ours.get(name)), 'incoming': record(theirs.get(name))}

    for name in sorted(before.keys() | ours.keys() | theirs.keys()):
        b, o, t = before.get(name), ours.get(name), theirs.get(name)
        if o == t or t == b:
            selected = o
        elif o == b:
            selected = t
        else:
            selected = o
            if not all((b, o, t)):
                conflict(name, 'add-add' if b is None else 'delete-modify')
            elif any(entry[0] == '120000' for entry in (b, o, t)):
                conflict(name, 'type-or-link')
            else:
                mode = t[0] if o[0] == b[0] else o[0] if t[0] in (b[0], o[0]) else None
                data = [git.blob(entry[1]) for entry in (o, b, t)]
                if any(b'\0' in content for content in data):
                    conflict(name, 'binary')
                elif mode is None:
                    conflict(name, 'mode')
                else:
                    # No user attributes, drivers, filters or hooks are executed.
                    with tempfile.TemporaryDirectory(prefix='merge-', dir=git.root) as tmp:
                        files = [Path(tmp) / side for side in ('current', 'base', 'incoming')]
                        for filename, content in zip(files, data):
                            filename.write_bytes(content)
                        result = git.call('merge-file', '-p', '--diff3', *map(str, files), check=False)
                    require(0 <= result.returncode <= 127, 'MERGE_FAILED')
                    if result.returncode:
                        conflict(name, 'content')
                    else:
                        blob = git.call('hash-object', '-w', '--stdin', data=result.stdout).stdout.decode().strip()
                        selected = (mode, blob)
        if selected:
            merged[name] = selected
    for name in collisions(merged):
        conflict(name, 'path-collision')

    seen = set()
    for resolution in resolutions:
        name = path(resolution['path'])
        require(name not in seen, 'DUPLICATE_PATH')
        seen.add(name)
        require(name in conflicts, 'RESOLUTION_NOT_REQUIRED', 'Resolutions must name a conflict in these exact source versions')
        choice = resolution['choice']
        if choice == 'content':
            content = decode(resolution['content'], resolution.get('encoding', 'utf8'))
            require(len(content) <= 16 * 1024 * 1024, 'SOURCE_LIMIT')
            selected = (resolution.get('mode', '100644'),
                        git.call('hash-object', '-w', '--stdin', data=content).stdout.decode().strip())
        else:
            selected = {'current': ours, 'incoming': theirs, 'base': before, 'delete': {}}[choice].get(name)
        if selected:
            merged[name] = selected
        else:
            merged.pop(name, None)
        conflicts.pop(name)
    # Resolutions may still retain an incompatible file/directory pair.
    for name in collisions(merged):
        conflict(name, 'path-collision')
    if conflicts:
        ordered = [conflicts[name] for name in sorted(conflicts)]
        return {'checkpoint': checkpoint, 'applied': False, 'conflicts': ordered[:50],
                'conflictCount': len(ordered), 'conflictsTruncated': len(ordered) > 50}
    result = git.commit(git.write_tree(merged), checkpoint, 'integrate ' + marker)
    return {'checkpoint': result, 'applied': True, 'conflicts': [], 'conflictCount': 0, 'conflictsTruncated': False}
