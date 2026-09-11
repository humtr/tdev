#!/usr/bin/env python3
"""Validate Design metadata and generate its derived index; no product execution."""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

FIELDS = ('Design', 'Title', 'Status', 'Depends-On', 'Supersedes', 'Directive', 'Owns')
STATUSES = {'draft', 'accepted', 'verified', 'superseded'}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def ids(value: str, context: str) -> list[str]:
    require(value.startswith('[') and value.endswith(']'), context + ': expected bracketed IDs')
    result = [item.strip() for item in value[1:-1].split(',') if item.strip()]
    require(len(result) == len(set(result)), context + ': duplicate reference')
    require(all(re.fullmatch(r'D\d{4}', item) for item in result), context + ': invalid ID')
    return result


def load_designs(root: Path) -> dict[str, dict]:
    designs: dict[str, dict] = {}
    owners: dict[str, str] = {}
    for path in sorted((root / 'docs/design').glob('D[0-9][0-9][0-9][0-9]-*.md')):
        text = path.read_text(encoding='utf-8')
        meta: dict[str, str] = {}
        for key, value in re.findall(r'^- ([A-Za-z-]+): `([^`\n]*)`$', text, re.M):
            if key in FIELDS:
                require(key not in meta, f'{path.name}: duplicate {key}')
                meta[key] = value
        require(set(meta) == set(FIELDS), f'{path.name}: missing metadata')
        ident = meta['Design']
        require(re.fullmatch(r'D\d{4}', ident) is not None, f'{path.name}: bad Design ID')
        require(ident not in designs and path.name.startswith(ident + '-'), f'{path.name}: duplicate/mismatched ID')
        require(meta['Status'] in STATUSES, f'{ident}: invalid status')
        require(re.fullmatch(r'r[1-9][0-9]*', meta['Directive']) is not None, f'{ident}: invalid Directive revision')
        require(text.startswith(f'# {ident} - {meta["Title"]}\n'), f'{ident}: title mismatch')
        for section in ('Problem', 'Required outcome', 'Facts', 'Decision', 'Acceptance', 'Alternatives', 'Implementation consequences'):
            require(re.search(r'^## .*' + re.escape(section), text, re.M | re.I) is not None, f'{ident}: missing {section} section')
        require(not re.search(r'\b(TODO|TBD|FIXME)\b', text), f'{ident}: unresolved placeholder')
        meta['depends'] = ids(meta['Depends-On'], ident)
        meta['supersedes'] = ids(meta['Supersedes'], ident)
        own = [item.strip() for item in meta['Owns'].split(',')]
        require(len(own) == len(set(own)), f'{ident}: repeated ownership label')
        for label in own:
            require(re.fullmatch(r'[a-z][a-z0-9]*(?:-[a-z0-9]+)*', label) is not None, f'{ident}: bad ownership label')
            if meta['Status'] in {'accepted', 'verified'}:
                require(label not in owners, f'{ident}: ownership overlap {label} with {owners.get(label)}')
                owners[label] = ident
        meta['path'] = path
        designs[ident] = meta
    require(bool(designs), 'No Designs found')
    for ident, meta in designs.items():
        for relation in ('depends', 'supersedes'):
            require(all(dep in designs and dep != ident for dep in meta[relation]), f'{ident}: unknown/self {relation}')
        if meta['Status'] in {'accepted', 'verified'}:
            require(all(designs[dep]['Status'] in {'accepted', 'verified'} for dep in meta['depends']), f'{ident}: inactive prerequisite')
            require(all(designs[dep]['Status'] == 'superseded' for dep in meta['supersedes']), f'{ident}: supersession target still active')
    for relation in ('depends', 'supersedes'):
        visiting: set[str] = set()
        visited: set[str] = set()
        def visit(ident: str) -> None:
            require(ident not in visiting, f'{relation} cycle at {ident}')
            if ident in visited:
                return
            visiting.add(ident)
            for dep in designs[ident][relation]:
                visit(dep)
            visiting.remove(ident)
            visited.add(ident)
        for ident in designs:
            visit(ident)
    return designs


def index_text(designs: dict[str, dict]) -> str:
    lines = ['# dev-2 Design index', '',
             'Generated from Design metadata by `python docs/design/check.py --write-index`. Do not edit owned values here.',
             'This is navigation only. IDs are identities, not priority or execution sequence. WORKBOARD owns execution order.', '',
             '| ID | Title | Status | Depends-On | Supersedes |',
             '| --- | --- | --- | --- | --- |']
    for ident, m in sorted(designs.items()):
        lines.append(f'| [{ident}]({m["path"].name}) | {m["Title"]} | {m["Status"]} | {m["Depends-On"]} | {m["Supersedes"]} |')
    lines.extend(['', '## Semantic dependency graph', '',
                  'Arrow means prerequisite decision -> dependent decision, not a work schedule.', '', '```mermaid', 'flowchart LR'])
    for ident, m in sorted(designs.items()):
        lines.append(f'  {ident}["{ident}: {m["Title"]}"]')
    for ident, m in sorted(designs.items()):
        for dep in m['depends']:
            lines.append(f'  {dep} --> {ident}')
    lines.extend(['```', '', '## Ownership projection', '', '| Design | Bounded decisions |', '| --- | --- |'])
    for ident, m in sorted(designs.items()):
        lines.append(f'| {ident} | {m["Owns"]} |')
    return '\n'.join(lines) + '\n'


def check_repository(root: Path, designs: dict[str, dict], architecture_only: bool) -> None:
    for name in ('AGENTS.md', 'DIRECTIVE.md', 'RULE.md', 'WORKBOARD.md', 'docs/design/README.md', 'docs/design/TEMPLATE.md'):
        require((root / name).is_file(), 'Missing bootstrap document: ' + name)
    directive = (root / 'DIRECTIVE.md').read_text(encoding='utf-8')
    revisions = re.findall(r'^- Revision: (?:r)?([1-9][0-9]*)\s*$', directive, re.M)
    require(len(revisions) == 1, 'Directive must declare one numeric Revision')
    active_revision = 'r' + revisions[0]
    for ident, m in designs.items():
        if m['Status'] in {'accepted', 'verified'}:
            require(m['Directive'] == active_revision, f'{ident}: Directive reference does not match active revision')
    require((root / 'docs/design/INDEX.md').read_text(encoding='utf-8') == index_text(designs), 'Stale INDEX; regenerate metadata projection')
    for path in root.rglob('*.md'):
        if '.git' in path.relative_to(root).parts:
            continue
        for target in re.findall(r'\[[^\]\n]*\]\(([^)\n]+)\)', path.read_text(encoding='utf-8')):
            if re.match(r'[a-z]+:', target) or target.startswith('#'):
                continue
            dest = (path.parent / target.split('#')[0]).resolve()
            require(dest.is_relative_to(root.resolve()) and dest.exists(), f'{path.relative_to(root)}: broken/escaping link {target}')
    if architecture_only:
        for path in root.rglob('*'):
            rel = path.relative_to(root)
            if not path.is_file() or '.git' in rel.parts:
                continue
            require(path.suffix == '.md' or rel.as_posix() == 'docs/design/check.py', 'Unexpected non-document file: ' + rel.as_posix())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write-index', action='store_true', help='Generate INDEX from validated metadata; does not certify the repository')
    parser.add_argument('--architecture-only', action='store_true', help='Also reject product implementation files in this documentation snapshot')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    try:
        designs = load_designs(root)
        if args.write_index:
            (root / 'docs/design/INDEX.md').write_text(index_text(designs), encoding='utf-8')
            print(f'GENERATED INDEX from {len(designs)} Designs; full repository check not run')
        else:
            check_repository(root, designs, args.architecture_only)
            print(f'PASS: {len(designs)} Designs; metadata, ownership labels, acyclic relations, derived INDEX, links and bootstrap documents')
            if args.architecture_only:
                print('PASS: documentation-only tree; no product implementation')
        return 0
    except (OSError, ValueError) as exc:
        print('FAIL: ' + str(exc), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
