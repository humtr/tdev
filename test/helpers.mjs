import { definePlan } from '../src/engine.mjs';

export function planWithWork(tasks, baseTree = {}) {
  return definePlan({
    revisionId: 'plan-v1',
    baseTree,
    tasks: [
      ...tasks.map((task) => ({
        kind: 'work',
        dependencies: [],
        claims: [],
        input: {},
        ...task,
      })),
      {
        id: 'promote',
        kind: 'promotion',
        dependencies: tasks.map((task) => task.id),
        claims: [{ mode: 'write', resource: 'canonical:tree' }],
        input: {},
      },
    ],
  });
}

export function resultFor(baseDigest, task, content = task.id) {
  return {
    kind: 'changeset',
    baseDigest,
    writes: [{ path: `${task.id}.txt`, content }],
  };
}
