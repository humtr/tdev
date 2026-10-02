"""Isolated, effect-free surface experiment. Never opens a resident or dispatches work.

Generate candidates from the canonical contract, measure schema rejection, or expose
one candidate through stdio MCP for an actual host rendering/call experiment.
This is deliberately not imported by the product server or controller.
"""
import argparse
import copy
import hashlib
import itertools
import json
from pathlib import Path
import sys

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "examples/surface-probe/evidence/baseline-contract.json"
CANDIDATES = ("root", "A", "B", "C", "D", "B2")


def positive(schema):
    """Experimental exact expansion of this contract's finite/presence constraints.

    Unknown constraint vocabulary fails closed. This is not a general JSON Schema
    compiler. Values/ranges/patterns/descriptions stay owned by the canonical fields.
    """
    if isinstance(schema, list):
        return [positive(item) for item in schema]
    if not isinstance(schema, dict):
        return schema
    keys = {"oneOf", "anyOf", "allOf", "not", "if", "then", "else"}
    if "properties" not in schema or not keys.intersection(schema):
        return {k: positive(v) for k, v in schema.items()}
    constraints = {k: schema[k] for k in keys if k in schema}
    fields, tested_values = set(), set()

    def collect(node):
        if isinstance(node, list):
            for item in node:
                collect(item)
            return
        if not isinstance(node, dict) or set(node) - keys - {"required", "properties"}:
            raise ValueError("Unsupported conditional vocabulary")
        fields.update(node.get("required", []))
        for field, condition in node.get("properties", {}).items():
            if set(condition) - {"const", "enum"}:
                raise ValueError("Unsupported value condition")
            fields.add(field); tested_values.add(field)
        for key in keys.intersection(node):
            collect(node[key])

    collect(constraints)
    props = schema["properties"]
    names = sorted(fields)
    domains = {}
    for field in names:
        prop = props[field]
        finite = prop.get("enum", [prop["const"]] if "const" in prop else
                          [False, True] if prop.get("type") == "boolean" else None)
        if field in tested_values and finite is None:
            raise ValueError("Cannot expand an infinite value condition")
        domains[field] = finite
    choices = [[(False, None)] + [(True, x) for x in
               (domains[n] if domains[n] is not None else [witness(props[n], n)])]
               for n in names]
    if __import__("math").prod(len(c) for c in choices) > 256:
        raise ValueError("Bounded probe expansion exceeded")
    check = Draft202012Validator({**constraints, "required": schema.get("required", [])})
    base = {k: positive(v) for k, v in schema.items() if k not in keys}
    cells = []
    for states in itertools.product(*choices):
        value = {n: witness(props[n], n) for n in schema.get("required", []) if n not in fields}
        value.update({n: v for n, (present, v) in zip(names, states) if present})
        if not check.is_valid(value):
            continue
        cell = copy.deepcopy(base)
        required = set(cell.get("required", []))
        for field, (present, value) in zip(names, states):
            if not present:
                cell["properties"].pop(field)
                required.discard(field)
            else:
                required.add(field)
                if domains[field] is not None:
                    cell["properties"][field]["enum"] = [value]
        cell["required"] = sorted(required)
        cells.append(cell)
    # Merge only rectangles with identical other fields/constraints. This preserves
    # disjointness while avoiding a cartesian explosion of optional-field branches.
    previous = None
    while previous != len(cells):
        previous = len(cells)
        for field in names:
            groups = {}
            for cell in cells:
                remainder = copy.deepcopy(cell)
                prop = remainder["properties"].pop(field, None)
                required = field in remainder["required"]
                remainder["required"] = [k for k in remainder["required"] if k != field]
                groups.setdefault(encoded(remainder), (remainder, []))[1].append((prop, required))
            merged = []
            for remainder, states in groups.values():
                present = [p for p, _ in states if p is not None]
                if present:
                    prop = positive(props[field])
                    if domains[field] is not None:
                        values = [v for v in domains[field]
                                  if any(v in p.get("enum", domains[field]) for p in present)]
                        if values != domains[field]:
                            prop["enum"] = values
                    remainder["properties"][field] = prop
                    if all(required for _, required in states):
                        remainder["required"] = sorted([*remainder["required"], field])
                merged.append(remainder)
            cells = merged
    if not cells:
        raise ValueError("No valid positive branches")
    return cells[0] if len(cells) == 1 else {"oneOf": cells}


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()


def expand(schema, value):
    if isinstance(value, list):
        return [expand(schema, item) for item in value]
    if isinstance(value, dict):
        if "$ref" in value:
            assert len(value) == 1, "Do not silently discard ref siblings"
            return expand(schema, schema["$defs"][value["$ref"].split("/")[-1]])
        return {key: expand(schema, item) for key, item in value.items()}
    return value


def branches(schema):
    """Separate dispatch arms, not constraint-only oneOf inside a typed arm."""
    result = []
    for arm in schema.get("oneOf", [schema]):
        if "properties" not in arm:
            if 'oneOf' in arm:
                result.extend(branches(arm))
                continue
            raise ValueError("Unsupported dispatch schema")
        action = arm["properties"].get("action", {})
        actions = action.get("enum", [action.get("const")])
        for value in actions:
            branch = copy.deepcopy(arm)
            if value is not None:
                branch["properties"]["action"] = {"const": value}
            result.append(branch)
    return result


def label(domain, branch):
    props = branch["properties"]
    action = props.get("action", {}).get("const", "call")
    if domain == "validate":
        return props.get("subject", {}).get("const", "source")
    if domain == "deploy" and action == "release":
        return "release_" + props.get("subject", {}).get("const", "source")
    return action


def group(domain, branch):
    action = branch["properties"].get("action", {}).get("const")
    if domain == "diagnostics":
        return "diagnostics"
    if action in ("list", "inspect", "targets", "status", "inspectRecipe", "usage", "export", "prunePreview"):
        return "observe"
    if domain in ("workspace", "project"):
        return "project"
    if domain in ("task", "read", "edit"):
        return "source"
    if domain in ("exec", "operation"):
        return "run"
    return "release"


def wrapper(schema):
    return {"type": "object", "properties": {"request": schema},
            "required": ["request"], "additionalProperties": False}


class Surface:
    def __init__(self, candidate, contract=None):
        self.candidate = candidate
        self.contract = contract or json.loads(CONTRACT.read_bytes())
        self.inputs = {}
        for arm in self.contract["oneOf"]:
            self.inputs[arm["properties"]["tool"]["const"]] = expand(
                self.contract, arm["properties"]["input"])
        self.tools, self.routes = {}, {}
        for original in expand(self.contract, self.contract["x-tools"]):
            name = original["name"]
            canonical = self.inputs[name]
            if candidate in ("root", "A", "B", "B2"):
                advertised = canonical if candidate == "root" else original["inputSchema"]
                if candidate == "B":
                    advertised = wrapper(canonical)
                elif candidate == "B2":
                    advertised = wrapper(positive(canonical))
                self.add(name, advertised, original["description"])
                self.routes[name] = (name, None)
                continue
            for branch in branches(canonical):
                domain = name.removeprefix("tdev_")
                action = label(domain, branch)
                if candidate == "C":
                    tool = name if action == "call" else name + "_" + action
                    # Keep action constants in these controls so constraints referring to
                    # action remain identical; measure their cost rather than hiding it.
                    self.add(tool, branch, f"{domain}: {action}. Schema probe; no effects.")
                    self.routes[tool] = (name, None)
                elif candidate == "D":
                    tool = "tdev_" + group(domain, branch)
                    selector = domain + "." + action
                    props = copy.deepcopy(branch)
                    # Discriminator is outside the canonical arm: no rewrite of its
                    # conditionals or accidental weakening of wire validation.
                    item = {"type": "object", "properties": {
                        "intent": {"const": selector}, "arguments": props},
                        "required": ["intent", "arguments"], "additionalProperties": False}
                    if tool not in self.tools:
                        self.add(tool, wrapper({"oneOf": []}),
                                 f"{tool[5:]} workflow requests. Schema probe; no effects.")
                    self.tools[tool]["inputSchema"]["properties"]["request"]["oneOf"].append(item)
                    self.routes[(tool, selector)] = (name, branch)
                else:
                    raise ValueError(candidate)
        self.validators = {name: Draft202012Validator(t["inputSchema"]) for name, t in self.tools.items()}
        self.canonical_validators = {name: Draft202012Validator(s) for name, s in self.inputs.items()}

    def add(self, name, schema, description):
        assert name not in self.tools
        # All these tools really ARE read-only: even simulated mutations only validate.
        self.tools[name] = {"name": name, "description": description,
                            "inputSchema": schema,
                            "annotations": {"readOnlyHint": True, "destructiveHint": False,
                                            "idempotentHint": True, "openWorldHint": False}}

    def encode(self, original, args):
        if self.candidate in ("root", "A", "B", "B2"):
            return original, {"request": args} if self.candidate in ("B", "B2") else args
        for branch in branches(self.inputs[original]):
            if Draft202012Validator(branch).is_valid(args):
                domain = original.removeprefix("tdev_")
                action = label(domain, branch)
                if self.candidate == "C":
                    return (original if action == "call" else original + "_" + action), args
                return "tdev_" + group(domain, branch), {"request": {
                    "intent": domain + "." + action, "arguments": args}}
        raise ValueError("A valid canonical example is required to select a branch")

    def decode(self, name, args):
        if self.candidate == "D":
            request = args["request"]
            return self.routes[(name, request["intent"])][0], request["arguments"]
        original = self.routes[name][0]
        return original, args["request"] if self.candidate in ("B", "B2") else args

    def call(self, name, args):
        if name not in self.validators or not self.validators[name].is_valid(args):
            return {"ok": False, "probeOnly": True, "effect": "none", "code": "DISCOVERY_REJECTED"}
        original, value = self.decode(name, args)
        valid = self.canonical_validators[original].is_valid(value)
        return {"ok": valid, "probeOnly": True, "effect": "none",
                "code": "CANONICAL_VALID" if valid else "CANONICAL_REJECTED",
                "canonicalTool": original,
                "inputDigest": hashlib.sha256(encoded(value)).hexdigest()}


class Comparison:
    """B2 plus named controls for one fresh-session structural comparison.

    This mixed catalog is NOT used to measure unbiased tool-selection accuracy.
    """
    candidate = "compare"

    def __init__(self):
        base = Surface("B2")
        self.tools = copy.deepcopy(base.tools)
        self.routes = {name: (base, name) for name in self.tools}
        for alias, candidate, original in (
            ("tdev_probe_root_task", "root", "tdev_task"),
            ("tdev_probe_flat_task", "A", "tdev_task"),
            ("tdev_probe_nested_task", "B", "tdev_task"),
            ("tdev_probe_action_start", "C", "tdev_task_start"),
            ("tdev_probe_workflow_source", "D", "tdev_source"),
        ):
            surface = Surface(candidate)
            tool = copy.deepcopy(surface.tools[original])
            tool["name"] = alias
            tool["description"] = f"Effect-free schema control {candidate}; validate only, no development effects."
            self.tools[alias] = tool
            self.routes[alias] = (surface, original)

    def call(self, name, args):
        if name not in self.routes:
            return {"ok": False, "probeOnly": True, "effect": "none", "code": "DISCOVERY_REJECTED"}
        surface, original = self.routes[name]
        return surface.call(original, args)


class Product(Surface):
    """Current source input/description/annotation probe, still without effects.

    Output schemas are omitted because probe receipts differ from product results.
    Historical A/B/C/D/B2 controls stay pinned to their baseline snapshot.
    """
    def __init__(self):
        self.candidate = 'product'
        self.contract = json.loads((ROOT / 'contracts/tools.schema.json').read_bytes())
        self.tools = {t['name']: {k: v for k, v in t.items() if k != 'outputSchema'}
                      for t in expand(self.contract, self.contract['x-tools'])}
        self.validators = {n: Draft202012Validator(t['inputSchema']) for n, t in self.tools.items()}
        self.inputs = {n: t['inputSchema']['properties']['request'] for n, t in self.tools.items()}
        self.canonical_validators = {n: Draft202012Validator(s) for n, s in self.inputs.items()}

    def encode(self, original, args):
        return original, {'request': args}

    def decode(self, name, args):
        return name, args['request']


def witness(schema, name=""):
    """Small deterministic corpus constructor, not a model or general schema solver."""
    if "const" in schema:
        return schema["const"]
    if "enum" in schema:
        return schema["enum"][0]
    if "properties" not in schema and "oneOf" in schema:
        return witness(schema["oneOf"][0], name)
    if "properties" not in schema and "anyOf" in schema:
        return witness(schema["anyOf"][0], name)
    typ = schema.get("type", "string")
    if isinstance(typ, list):
        typ = typ[0]
    if typ == "object":
        props = schema.get("properties", {})
        value = {k: witness(props[k], k) for k in schema.get("required", [])}
        if "anyOf" in schema:
            for k in schema["anyOf"][0].get("required", []):
                value[k] = witness(props[k], k)
        if "operationId" in props and value.get("action") == "status":
            value["operationId"] = "operation"
        return value
    if typ == "array":
        return [witness(schema["items"])] * schema.get("minItems", 0)
    if typ == "integer":
        return schema.get("minimum", 0)
    if typ == "boolean":
        return False
    if typ == "null":
        return None
    pattern = schema.get("pattern", "")
    if pattern.startswith("^/"):
        return "/health"
    if "40" in pattern and "64" in pattern:
        return "a" * 40
    if name == "ref" or "refs/heads" in pattern:
        return "refs/heads/main"
    if "[0-9a-f]" in pattern or "[a-f0-9]" in pattern:
        return "a" * (64 if "64" in pattern else 32 if "32" in pattern else 16)
    return "x" * max(schema.get("minLength", 1), 1)


def corpus(surface):
    values = []
    for tool, schema in surface.inputs.items():
        for branch in branches(schema):
            value = witness(branch)
            Draft202012Validator(schema).validate(value)
            values.append((tool, value))
    return values


def negatives(schema, value):
    result = []
    # Required omissions, cross-action fields and boundary/type corruption.
    for field in value:
        v = copy.deepcopy(value); del v[field]
        result.append(("omit:" + field, v))
    vocabulary = {key: prop for branch in branches(schema) for key, prop in branch["properties"].items()}
    for field, prop in vocabulary.items():
        if field not in value:
            v = copy.deepcopy(value); v[field] = witness(prop, field)
            result.append(("add:" + field, v))
    for field, prop in vocabulary.items():
        for bad in ([prop["maximum"] + 1] if "maximum" in prop else []):
            v = copy.deepcopy(value); v[field] = bad
            result.append(("range:" + field, v))
    v = copy.deepcopy(value); v["inventedField"] = True
    result.append(("invented", v))
    validator = Draft202012Validator(schema)
    return [(kind, v) for kind, v in result if not validator.is_valid(v)]


def generate(out):
    out.mkdir(parents=True, exist_ok=True)
    base = Surface("root")
    cases = corpus(base)
    report = {"method": "deterministic schema corpus; no model-generated calls or ChatGPT rendering",
              "contractSha256": hashlib.sha256(CONTRACT.read_bytes()).hexdigest(),
              "validCanonicalCases": len(cases), "modelSelectionAccuracy": None,
              "hostRendering": None, "candidates": {}}
    for candidate in CANDIDATES:
        surface = Surface(candidate)
        tools = list(surface.tools.values())
        for tool in tools:
            Draft202012Validator.check_schema(tool["inputSchema"])
        (out / (candidate + ".tools.json")).write_text(json.dumps({"tools": tools}, indent=2) + "\n")
        accepted, rejected, invalid, false_accept, breakdown = 0, 0, 0, 0, {}
        examples = []
        for tool, value in cases:
            name, args = surface.encode(tool, value)
            assert surface.call(name, args)["ok"]
            assert surface.decode(name, args) == (tool, value)
            accepted += 1
            examples.append({"name": name, "arguments": args})
            for kind, bad in negatives(base.inputs[tool], value):
                # Select using the valid predecessor, then perturb arguments. Otherwise
                # branch inference could mask a bad call before the measured validator.
                bad_args = ({"request": bad} if candidate in ("B", "B2") else
                            {"request": {**args["request"], "arguments": bad}} if candidate == "D" else bad)
                passed = surface.validators[name].is_valid(bad_args)
                invalid += 1; false_accept += int(passed); rejected += int(not passed)
                category = kind.split(":")[0]
                slot = breakdown.setdefault(category, {"total": 0, "discoveryAccepted": 0})
                slot["total"] += 1; slot["discoveryAccepted"] += int(passed)
                assert not surface.call(name, bad_args)["ok"]
        (out / (candidate + ".calls.json")).write_text(json.dumps(examples, indent=2) + "\n")
        sizes = [len(encoded(t["inputSchema"])) for t in tools]
        report["candidates"][candidate] = {
            "tools": len(tools), "inputBytes": sum(sizes), "meanInputBytes": round(sum(sizes) / len(sizes)),
            "maxInputBytes": max(sizes), "declarationBytes": len(encoded(tools)),
            "descriptionBytes": sum(len(t["description"].encode()) for t in tools),
            "validCasesAccepted": accepted, "invalidCases": invalid,
            "invalidDiscoveryAccepted": false_accept, "invalidRuntimeAccepted": 0,
            "invalidByCategory": breakdown}
    (out / "metrics.json").write_text(json.dumps(report, indent=2) + "\n")
    # Mechanical field inventory is exhaustive; decisions/disposition live in the review.
    inventory = []
    for tool, schema in base.inputs.items():
        for branch in branches(schema):
            inventory.append({"tool": tool, "branch": label(tool[5:], branch),
                              "required": branch.get("required", []), "fields": branch["properties"],
                              "constraints": {k: v for k, v in branch.items()
                                              if k not in ("properties", "required", "type", "additionalProperties")}})
    (out / "field-inventory.json").write_text(json.dumps(inventory, indent=2) + "\n")
    (out / "compare.tools.json").write_text(json.dumps(
        {"tools": list(Comparison().tools.values())}, indent=2) + "\n")
    return report


def stdio(surface):
    """No credential access, process execution, resident calls, or durable writes."""
    for line in sys.stdin:
        try:
            message = json.loads(line)
            if not isinstance(message, dict) or "id" not in message:
                continue
            ident, method = message["id"], message.get("method")
            params = message.get("params", {})
            if method == "initialize":
                result = {"protocolVersion": "2025-11-25", "capabilities": {"tools": {}},
                          "serverInfo": {"name": "tdev-surface-probe-" + surface.candidate, "version": "0.0.0"}}
            elif method == "ping":
                result = {}
            elif method == "tools/list":
                result = {"tools": list(surface.tools.values())}
            elif method == "tools/call":
                value = surface.call(params["name"], params.get("arguments", {}))
                result = {"isError": not value["ok"], "structuredContent": value,
                          "content": [{"type": "text", "text": json.dumps(value)}]}
            else:
                print(json.dumps({"jsonrpc": "2.0", "id": ident,
                                  "error": {"code": -32601, "message": "Method not found"}}), flush=True)
                continue
            print(json.dumps({"jsonrpc": "2.0", "id": ident, "result": result}), flush=True)
        except (ValueError, KeyError, TypeError):
            print(json.dumps({"jsonrpc": "2.0", "id": None,
                              "error": {"code": -32600, "message": "Invalid probe request"}}), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--generate", type=Path)
    parser.add_argument("--stdio", choices=(*CANDIDATES, "compare", "product"))
    args = parser.parse_args()
    if args.generate:
        print(json.dumps(generate(args.generate), indent=2))
    elif args.stdio:
        stdio(Product() if args.stdio == 'product' else Comparison() if args.stdio == "compare" else Surface(args.stdio))
    else:
        parser.error("Choose --generate DIR or --stdio CANDIDATE")


if __name__ == "__main__":
    main()
