"""Content, transfer and caller-response budgets have separate owners."""
from .common import Fault

SOURCE_BYTES = 512 * 1024 * 1024
FILE_BYTES = SOURCE_BYTES
SOURCE_FILES = 100000
PACK_BYTES = 1024 * 1024 * 1024
METADATA_BYTES = 48 * 1024 * 1024
CHUNK_BYTES = 65536


def check(budget, configured, observed, code='SOURCE_LIMIT'):
    if observed > configured:
        raise Fault(code, f'budget={budget} configured={configured} observed={observed}')
