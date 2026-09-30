"""Reproduce final source metrics and schema corpus without dispatching effects."""
import hashlib
import json
from pathlib import Path

from probe_surface import CONTRACT, ROOT, Product, corpus, encoded, expand, negatives


def measure(tools):
    return {'tools': len(tools),
            'inputBytes': sum(len(encoded(t['inputSchema'])) for t in tools),
            'toolDescriptionBytes': sum(len(t['description'].encode()) for t in tools),
            'outputBytes': sum(len(encoded(t['outputSchema'])) for t in tools),
            'allBytes': len(encoded(tools))}


def main():
    out = ROOT / 'examples/surface-probe/evidence'
    product = Product()
    source = product.contract
    tools = expand(source, source['x-tools'])
    baseline = json.loads(CONTRACT.read_bytes())
    cases, invalid, false_accept = corpus(product), 0, 0
    for name, value in cases:
        assert product.call(name, {'request': value})['ok']
        for _, bad in negatives(product.inputs[name], value):
            invalid += 1
            false_accept += product.call(name, {'request': bad})['ok']
    report = {'sourceContractSha256': hashlib.sha256((ROOT / 'contracts/tools.schema.json').read_bytes()).hexdigest(),
              'baseline': measure(expand(baseline, baseline['x-tools'])), 'product': measure(tools),
              'measures': 'compact UTF-8 JSON bytes, not model tokens or selection accuracy',
              'validPositiveCases': len(cases), 'invalidCases': invalid,
              'invalidAccepted': false_accept, 'modelSelectionAccuracy': None}
    (out / 'product-metrics.json').write_text(json.dumps(report, indent=2) + '\n')
    (out / 'product-source-tools.json').write_text(json.dumps({'tools': tools}, indent=2) + '\n')
    (out / 'product-probe-tools.json').write_text(json.dumps({'tools': list(product.tools.values())}, indent=2) + '\n')
    (out / 'product-calls.json').write_text(json.dumps([
        {'tool': name, 'arguments': {'request': value}} for name, value in cases], indent=2) + '\n')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
