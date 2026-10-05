"""Atomic three-way source-delta integration, without touching a checkout or its index."""
import tempfile
from pathlib import Path

from .common import decode, path, require
from .capacity import FILE_BYTES, check


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
                # Each source goes straight to a private file; merge output is streamed too.
                with tempfile.TemporaryDirectory(prefix='merge-', dir=git.root) as tmp:
                    files = [Path(tmp) / side for side in ('current', 'base', 'incoming')]
                    binary = False
                    for filename, entry in zip(files, (o, b, t)):
                        with filename.open('wb') as stream:
                            git.blob_to(entry[1], stream)
                        with filename.open('rb') as stream:
                            while chunk := stream.read(65536):
                                if b'\0' in chunk:
                                    binary = True
                                    break
                        if binary:
                            break
                    if binary:
                        conflict(name, 'binary')
                    elif mode is None:
                        conflict(name, 'mode')
                    else:
                        with (Path(tmp) / 'merged').open('w+b') as merged_file:
                            result = git.call('merge-file', '-p', '--diff3', *map(str, files),
                                              check=False, output=merged_file, limit=FILE_BYTES,
                                              timeout=120, budget='sourceFileBytes')
                            require(0 <= result.returncode <= 127, 'MERGE_FAILED')
                            if result.returncode:
                                conflict(name, 'content')
                            else:
                                selected = (mode, git.hash_file(merged_file))
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
            check('sourceFileBytes', FILE_BYTES, len(content))
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
