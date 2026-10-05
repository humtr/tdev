"""Budget ownership, physical framing and no repeated delivery on uncertainty."""
import hashlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tdev import capacity
from tdev.common import Fault, canonical
from tdev.executor import (SOURCE_LIMIT, PACK_LIMIT, METADATA_LIMIT, SOURCE_FILES,
                           source_manifest, copy_source, stream_rpc, file_digest, save)
from tdev.git import Git
from tdev.remote import SSHExecutor
from support import Repository


class CapacityTest(unittest.TestCase):
    def test_remote_rejection_preserves_budget_values_in_fault_message(self):
        from types import SimpleNamespace
        executor = SSHExecutor.__new__(SSHExecutor)
        message = 'ValueError:budget=packBytes configured=1073741824 observed=1073741825'
        response = SimpleNamespace(returncode=0, stdout=canonical({'error': message, 'effect': 'unknown'}))
        with self.assertRaises(Fault) as caught:
            executor.response(response)
        self.assertEqual(caught.exception.value, {'code': 'EXECUTOR_LIMIT', 'message': message, 'effect': 'unknown'})

    def test_checkout_content_witness_and_object_use_the_same_read(self):
        import os
        from tdev.checkout import Checkout
        with tempfile.TemporaryDirectory() as temporary:
            repository = Repository(temporary)
            git = Git(Path(temporary) / 'private.git', repository.config['repositories']['test'])
            checkout = Checkout.__new__(Checkout)
            checkout.git = git
            original = repository.work / 'a.txt'
            observed = original.read_bytes()
            real_hash = git.hash_file
            def change_between_reads(stream):
                original.write_bytes(b'other\n')
                try:
                    return real_hash(stream)
                finally:
                    original.write_bytes(observed)
            root = os.open(repository.work, os.O_RDONLY | os.O_DIRECTORY)
            try:
                # Model equal metadata observations across an A -> B -> A race.
                # The content witness must still identify the stored object bytes.
                with patch.object(checkout, 'signature', return_value=(0,)), \
                        patch.object(git, 'hash_file', side_effect=change_between_reads):
                    entry, witness, size = checkout.file(root, 'a.txt', {}, True)
                self.assertEqual(git.blob(entry['blob']), observed)
                self.assertEqual(witness[-1], hashlib.sha256(observed).hexdigest())
                self.assertEqual(size, len(observed))
            finally:
                os.close(root)

    def test_working_scan_nodes_are_independent_of_file_count(self):
        from types import SimpleNamespace
        from tdev.native import disk_violation
        root = Path('/owned-fixture')
        rows = [(str(root), [], ['first']), (str(root / 'second'), [], ['next'] * 999999)]
        for dependency in (None, root):
            with patch('tdev.native.os.walk', return_value=iter(rows)), \
                    patch.object(Path, 'lstat', return_value=SimpleNamespace(st_size=0)):
                budget = 'dependencyScanNodes' if dependency else 'workingScanNodes'
                self.assertEqual(disk_violation(root, dependency),
                                 f'budget={budget} configured=1000000 observed=1000002')

    def test_contract_and_content_transport_owners_agree(self):
        contract = json.loads((Path(__file__).parents[1] / 'contracts/tools.schema.json').read_bytes())['x-semantics']['execution']
        self.assertEqual(contract['sourceLimitBytes'], capacity.SOURCE_BYTES)
        self.assertEqual(contract['sourceFileLimitBytes'], capacity.FILE_BYTES)
        self.assertEqual(contract['sourceFileLimitCount'], capacity.SOURCE_FILES)
        self.assertEqual(contract['transferLimitBytes'], capacity.PACK_BYTES)
        self.assertEqual(contract['metadataLimitBytes'], capacity.METADATA_BYTES)
        self.assertEqual((SOURCE_LIMIT, PACK_LIMIT, METADATA_LIMIT, SOURCE_FILES),
                         (capacity.SOURCE_BYTES, capacity.PACK_BYTES, capacity.METADATA_BYTES, capacity.SOURCE_FILES))
        for budget, configured in [('sourceBytes', capacity.SOURCE_BYTES), ('sourceFileBytes', capacity.FILE_BYTES),
                                   ('sourceFiles', capacity.SOURCE_FILES), ('packBytes', capacity.PACK_BYTES),
                                   ('sourceMetadataBytes', capacity.METADATA_BYTES)]:
            for observed in (configured - 1, configured):
                capacity.check(budget, configured, observed)
            with self.assertRaises(Fault) as caught:
                capacity.check(budget, configured, configured + 1)
            self.assertEqual(caught.exception.value['message'],
                             f'budget={budget} configured={configured} observed={configured + 1}')

    def test_manifest_file_byte_and_aggregate_edges_without_body_allocation(self):
        def entry(name, size):
            return {'path': name, 'mode': '100644', 'blob': 'a' * 40, 'size': size}
        for size in (SOURCE_LIMIT - 1, SOURCE_LIMIT):
            self.assertEqual(source_manifest([entry('file', size)], 'b' * 40)[0]['size'], size)
        with self.assertRaisesRegex(ValueError, f'budget=sourceFileBytes configured={SOURCE_LIMIT} observed={SOURCE_LIMIT + 1}'):
            source_manifest([entry('file', SOURCE_LIMIT + 1)], 'b' * 40)
        with self.assertRaisesRegex(ValueError, f'budget=sourceBytes configured={SOURCE_LIMIT} observed={SOURCE_LIMIT + 1}'):
            source_manifest([entry('one', SOURCE_LIMIT), entry('two', 1)], 'b' * 40)
        files = [entry(f'file-{i:06}', 0) for i in range(SOURCE_FILES + 1)]
        source_manifest(files[:-2], 'b' * 40)
        source_manifest(files[:-1], 'b' * 40)
        with self.assertRaisesRegex(ValueError, f'budget=sourceFiles configured={SOURCE_FILES} observed={SOURCE_FILES + 1}'):
            source_manifest(files, 'b' * 40)

    def test_binary_copy_checks_exact_size_digest_extra_bytes_and_no_follow(self):
        data = b'body\0\xff'
        descriptor = {'format': 'git-pack', 'size': len(data), 'digest': hashlib.sha256(data).hexdigest()}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            copy_source(io.BytesIO(data), root / 'valid', descriptor)
            self.assertEqual((root / 'valid').read_bytes(), data)
            for name, content, digest in [('short', data[:-1], descriptor['digest']),
                                         ('extra', data + b'x', descriptor['digest']),
                                         ('digest', data, '0' * 64)]:
                with self.assertRaises(ValueError):
                    copy_source(io.BytesIO(content), root / name, {**descriptor, 'digest': digest})
            (root / 'link').symlink_to(root / 'valid')
            with self.assertRaises(OSError):
                copy_source(io.BytesIO(data), root / 'link', descriptor)
            with self.assertRaisesRegex(ValueError, f'budget=packBytes configured={PACK_LIMIT} observed={PACK_LIMIT + 1}'):
                copy_source(io.BytesIO(), root / 'over', {**descriptor, 'size': PACK_LIMIT + 1})
            self.assertFalse((root / 'over').exists())

    def test_stream_dispatch_persists_binary_before_launch_and_replay_never_relaunches(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = b'private-binary'
            payload = {'id': 'a' * 32, 'gitPack': {'format': 'git-pack', 'size': len(data), 'digest': hashlib.sha256(data).hexdigest()}}
            metadata = canonical({'action': 'submit', 'payload': payload})
            def deliver():
                output = io.BytesIO()
                stream_rpc(str(root), 'fixture', io.BytesIO(len(metadata).to_bytes(4, 'big') + metadata + data), output)
                return json.loads(output.getvalue())
            with patch('tdev.executor.subprocess.Popen') as launch:
                self.assertTrue(deliver()['accepted'])
                self.assertEqual((root / payload['id'] / 'source.pack').read_bytes(), data)
                self.assertEqual(deliver(), {'accepted': True})
                self.assertEqual(launch.call_count, 1)
            interrupted = {**payload, 'id': 'b' * 32}
            metadata = canonical({'action': 'submit', 'payload': interrupted})
            with patch('tdev.executor.subprocess.Popen') as launch:
                with self.assertRaises(ValueError):
                    output = io.BytesIO()
                    stream_rpc(str(root), 'fixture', io.BytesIO(len(metadata).to_bytes(4, 'big') + metadata + data[:-1]), output)
                self.assertFalse(launch.called)
                self.assertEqual(deliver()['error'], 'RESERVATION_UNKNOWN')
                self.assertFalse(launch.called)

    def test_remote_binary_capture_requires_matching_stopped_receipt(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            ident, data = 'a' * 32, b'capture-body'
            job = root / ident
            job.mkdir(mode=0o700)
            body = job / 'capture.tar'
            body.write_bytes(data)
            body.chmod(0o600)
            descriptor = {'format': 'tar', 'size': len(data), 'digest': hashlib.sha256(data).hexdigest(), 'files': []}
            proof = {'stopped': True, 'terminal': True, 'capture': descriptor}
            save(job / 'result.json', proof)
            metadata = canonical({'action': 'capture', 'id': ident, 'descriptor': descriptor})
            output = io.BytesIO()
            stream_rpc(str(root), 'fixture', io.BytesIO(len(metadata).to_bytes(4, 'big') + metadata), output)
            response = output.getvalue()
            length = int.from_bytes(response[:4], 'big')
            self.assertEqual(json.loads(response[4:4 + length]), {'capture': descriptor})
            self.assertEqual(response[4 + length:], data)
            for changed in ({**proof, 'stopped': False}, {**proof, 'capture': {**descriptor, 'digest': '0' * 64}}):
                save(job / 'result.json', changed)
                with self.assertRaisesRegex(ValueError, 'CAPTURE_PROOF_REQUIRED'):
                    stream_rpc(str(root), 'fixture', io.BytesIO(len(metadata).to_bytes(4, 'big') + metadata), io.BytesIO())

    def test_streamed_replacement_matches_utf8_boundaries_and_stays_atomic(self):
        with tempfile.TemporaryDirectory() as temporary:
            repository = Repository(temporary)
            git = Git(Path(temporary) / 'private.git', repository.config['repositories']['test'])
            git.fetch('refs/heads/main', repository.head)
            content = ('a' * 65533 + '가🙂가' + 'b' * 65534 + '가🙂가').encode()
            checkpoint = git.edit(repository.head, [{'action': 'put', 'path': 'unicode', 'before': None,
                'content': content.decode()}], 'source')
            updated = git.edit(checkpoint, [{'action': 'replace', 'path': 'unicode', 'old': '가🙂가', 'text': '🦀', 'count': 2}], 'replace')
            self.assertEqual(git.blob(git.entries(updated)['unicode'][1]), content.decode().replace('가🙂가', '🦀').encode())
            with self.assertRaises(Fault):
                git.edit(checkpoint, [{'action': 'replace', 'path': 'unicode', 'old': '가🙂가', 'text': 'changed', 'count': 1}], 'wrong')
            self.assertEqual(git.blob(git.entries(checkpoint)['unicode'][1]), content)

    def test_metadata_frame_capacity_is_checked_before_reading_or_dispatch(self):
        class HeaderOnly:
            calls = 0
            def read(self, size):
                self.calls += 1
                if self.calls != 1:
                    raise AssertionError('over-limit metadata body was read')
                return (METADATA_LIMIT + 1).to_bytes(4, 'big')
        with self.assertRaisesRegex(ValueError, f'budget=sourceMetadataBytes configured={METADATA_LIMIT} observed={METADATA_LIMIT + 1}'):
            stream_rpc('/unused', 'fixture', HeaderOnly(), io.BytesIO())
        for size in (METADATA_LIMIT - 1, METADATA_LIMIT):
            metadata = canonical({'action': 'submit', 'payload': {'id': 'a' * 32}})
            with tempfile.TemporaryDirectory() as temporary, tempfile.TemporaryFile() as body:
                body.write(size.to_bytes(4, 'big') + metadata)
                remaining = size - len(metadata)
                while remaining:
                    chunk = b' ' * min(65536, remaining)
                    body.write(chunk)
                    remaining -= len(chunk)
                body.seek(0)
                with patch('tdev.executor.subprocess.Popen') as launch:
                    output = io.BytesIO()
                    stream_rpc(temporary, 'fixture', body, output)
                    self.assertTrue(json.loads(output.getvalue())['accepted'])
                    self.assertEqual(launch.call_count, 1)

    def test_binary_transfer_capacity_edges_are_streamed_as_physical_bytes(self):
        with tempfile.TemporaryDirectory() as temporary, tempfile.TemporaryFile() as source:
            root = Path(temporary)
            for size in (PACK_LIMIT - 1, PACK_LIMIT):
                source.truncate(size)
                descriptor = {'format': 'git-pack', 'size': size,
                              'digest': file_digest(source)}
                target = root / 'body'
                copy_source(source, target, descriptor)
                self.assertEqual(target.stat().st_size, size)
                with target.open('rb') as stored:
                    self.assertEqual(hashlib.file_digest(stored, 'sha256').hexdigest(), descriptor['digest'])
                target.unlink()
            with self.assertRaisesRegex(ValueError, f'budget=packBytes configured={PACK_LIMIT} observed={PACK_LIMIT + 1}'):
                copy_source(source, root / 'over', {**descriptor, 'size': PACK_LIMIT + 1})
            self.assertFalse((root / 'over').exists())
