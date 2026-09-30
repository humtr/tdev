"""Bounded, effect-free discovery of retained work by human locators.

No latest-task policy, executor/provider observation, migration or new memory store.
Labels come from retained creation intents; receipts remain the source of truth.
"""
import json

from .common import Fault


class Continuation:
    def __init__(self, controller):
        self.c = controller

    @staticmethod
    def receipt(row):
        args = json.loads(row['intent']).get('input', {})
        value = {'operationId': row['id'], 'requestId': row['request'],
                 'kind': row['kind'], 'status': row['status'], 'effect': row['effect']}
        if 'expected' in args:
            value['sourceCheckpoint'] = args['expected']
        return value

    def frontier(self, principal, task):
        rows = self.c.store.all(
            'SELECT * FROM operation WHERE owner=? AND task=? ORDER BY rowid DESC LIMIT 9',
            (principal, task['id']))
        outstanding = self.c.store.all(
            "SELECT * FROM operation WHERE owner=? AND task=? AND status IN ('running','unknown') "
            'ORDER BY rowid LIMIT 41', (principal, task['id']))
        def allowed(rows):
            result = []
            for row in rows:
                try:
                    self.c.operation(principal, row['id'])
                except Fault:
                    continue
                result.append(self.receipt(row))
            return result
        return {'taskId': task['id'], 'project': task['repo'],
                'workspaceId': task['workspace'], 'closed': bool(task['closed']),
                'checkpoint': task['checkpoint'], 'busyOperationId': task['busy'],
                'publishedCheckpoint': task['published_oid'],
                'refState': task['ref_state'],
                'recent': allowed(rows[:8]), 'recentComplete': len(rows) <= 8,
                'outstanding': allowed(outstanding[:40]),
                'outstandingComplete': len(outstanding) <= 40}

    def find(self, principal, args):
        # All projections below are local SQLite reads. Keep their frontier coherent
        # with controller writers; external process/provider state is not claimed.
        with self.c.store.mutex:
            return self._find(principal, args)

    def _find(self, principal, args):
        c = self.c
        limit, after = args.get('limit', 20), args.get('after', 0)
        query = args.get('project', '').casefold()
        label = args.get('label', '').casefold()
        # A duplicate display name must remain ambiguous, including across projects.
        projects = [p for p in c.projects.list(principal)['projects']
                    if not query or query in (p['repo'].casefold(), p['name'].casefold())]
        project_ids = {p['repo'] for p in projects}
        matches, pending, unavailable = [], [], 0
        state = args.get('state', 'all')
        # One admission-ledger cursor covers both created tasks and effects that
        # have not produced a project/task yet. No unpageable second pending list.
        rows = c.store.all(
            'SELECT rowid AS cursor,* FROM operation WHERE owner=? AND rowid>? AND ('
            "(kind='task' AND json_extract(intent,'$.input.action') IN ('start','open','compose') "
            "AND (task IS NOT NULL OR status IN ('running','unknown'))) OR "
            "(kind='project' AND status IN ('running','unknown'))) ORDER BY rowid LIMIT 201",
            (principal, after))
        scanned, more = after, len(rows) > 200
        for row in rows[:200]:
            original = json.loads(row['intent']).get('input', {})
            title, task, project_name = original.get('label'), None, None
            eligible = row['repo'] in project_ids and (not label or label in (title or '').casefold())
            if row['kind'] == 'project':
                policy = c.config.get('projectPolicies', {}).get(original.get('policy'), {})
                name = original.get('name', '')
                project_name = policy.get('owner', '').rstrip('/') + '/' + name if policy.get('owner') else name
                eligible = not label and (not query or query in (name.casefold(), project_name.casefold()))
            if eligible:
                try:
                    c.operation(principal, row['id'])
                    task = c.task(principal, row['task']) if row['task'] else None
                except Fault:
                    unavailable += 1
                    eligible = False
                if task and state != 'all' and bool(task['closed']) != (state == 'closed'):
                    eligible = False
            if eligible:
                if len(matches) + len(pending) == limit:
                    more = True
                    break
                if task:
                    value = self.frontier(principal, task)
                    value['label'] = title
                    matches.append(value)
                else:
                    value = {**self.receipt(row), 'project': row['repo'], 'label': title}
                    if project_name is not None:
                        value['projectName'] = project_name
                    pending.append(value)
            scanned = row['cursor']
        pending_complete = not more and after == 0
        complete = pending_complete and len(projects) <= limit
        count = len(matches) + len(pending)
        resolution = ('incomplete' if not complete else 'unavailable' if unavailable
                      else 'ambiguous' if count > 1 or (count == 0 and len(projects) > 1)
                      else 'none' if count == 0 else 'unique')
        result = {'resolution': resolution,
                  'projects': [{'project': p['repo'], 'name': p['name']} for p in projects[:limit]],
                  'matches': matches, 'pending': pending,
                  'nextAfter': scanned if more else None, 'pendingComplete': pending_complete,
                  'unavailableMatches': unavailable}
        result['observation'] = c.observation(result, args.get('since'), ['retained SQLite state; no executor or provider reconciliation'])
        return result
