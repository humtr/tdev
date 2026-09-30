"""Public request envelope; semantic arguments retain durable admission identity.

The contract owns every field and alternative. This boundary neither retries nor
adds defaults, identities or lifecycle effects. Internal callers use semantic
arguments; MCP clients use the exact advertised envelope.
"""
from jsonschema import Draft202012Validator

from .common import require


class Surface:
    def __init__(self, schema):
        self.validators = {
            tool['name']: Draft202012Validator({
                '$defs': schema['$defs'], **tool['inputSchema']})
            for tool in schema['x-tools']
        }

    def decode(self, tool, arguments):
        validator = self.validators.get(tool)
        require(validator is not None and validator.is_valid(arguments),
                'SCHEMA', 'Input must match the advertised request envelope')
        return arguments['request']
