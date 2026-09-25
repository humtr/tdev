"""Bounded, independently launched local observer. Never imported by the server."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import signal
import socket
import time

from .common import atomic_write, canonical
from .diagnostics import snapshot


def elapsed():
    if hasattr(time, 'CLOCK_BOOTTIME'):
        return time.clock_gettime(time.CLOCK_BOOTTIME)
    return time.monotonic()


def observe(state, output, seconds=120, interval=5, max_bytes=8 * 1024 * 1024):
    if (not math.isfinite(seconds) or not 1 <= seconds <= 3600 or
            not math.isfinite(interval) or not .25 <= interval <= 60 or
            type(max_bytes) is not int or not 1024 <= max_bytes <= 64 * 1024 * 1024):
        raise ValueError('invalid observer duration, interval or byte limit')
    output = Path(output)
    output.mkdir(mode=0o700)  # Refuse overwrite/reuse, including symlinks.
    report = dict(schema=1, startedNs=time.time_ns(), samples=0, unavailable=0, bytes=0,
                  stopReason='duration', seconds=seconds, interval=interval, maxBytes=max_bytes,
                  meaning='local server observations; host receipt and visible progress remain separate')
    checksum = hashlib.sha256()
    start = elapsed()
    fd = os.open(output / 'samples.jsonl', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'wb') as stream:
            while elapsed() - start < seconds:
                sample = dict(observerTimeNs=time.time_ns(), observerElapsed=elapsed())
                try:
                    sample['snapshot'] = snapshot(Path(state) / 'diagnostics',
                                                 timeout=min(2, max(.05, seconds - (elapsed() - start))))
                except (OSError, ValueError) as error:
                    sample['unavailable'] = 'timeout' if isinstance(error, (TimeoutError, socket.timeout)) else 'socket_or_snapshot'
                data = canonical(sample) + b'\n'
                if report['bytes'] + len(data) > max_bytes:
                    report['stopReason'] = 'byte_limit'
                    break
                stream.write(data)
                stream.flush()
                checksum.update(data)
                report['bytes'] += len(data)
                report['samples'] += 1
                report['unavailable'] += 'unavailable' in sample
                if report['samples'] >= 3600:
                    report['stopReason'] = 'sample_limit'
                    break
                remaining = seconds - (elapsed() - start)
                if remaining > 0:
                    time.sleep(min(interval, remaining))
    except KeyboardInterrupt:
        report['stopReason'] = 'interrupted'
    finally:
        report.update(finishedNs=time.time_ns(), sha256=checksum.hexdigest())
        atomic_write(output / 'observation.json', canonical(report))
    return report


def main():
    parser = argparse.ArgumentParser(description='Bounded independent local diagnostic observer; no MCP calls or effects')
    parser.add_argument('--state', required=True)
    parser.add_argument('--output', required=True, help='new private directory; never reused')
    parser.add_argument('--seconds', type=float, default=120)
    parser.add_argument('--interval', type=float, default=5)
    parser.add_argument('--max-bytes', type=int, default=8 * 1024 * 1024)
    args = parser.parse_args()
    def stop(*_):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, stop)
    try:
        report = observe(args.state, args.output, args.seconds, args.interval, args.max_bytes)
    except (OSError, ValueError):
        parser.exit(1, 'Observer failed: check bounds, private storage and a new output directory.\n')
    print(json.dumps(report, sort_keys=True))


if __name__ == '__main__':
    main()
