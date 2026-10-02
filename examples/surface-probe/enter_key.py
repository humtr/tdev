"""Interactive local secret entry. Never prints the key or changes a connection."""
import argparse
import os
from pathlib import Path
import sys
import termios


def main():
    print("[tdev probe] 키 입력 프로그램이 시작됐습니다.", flush=True)
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path,
                        default=Path.home() / ".config/tdev-surface-probe/admin.key")
    destination = parser.parse_args().output
    if not sys.stdin.isatty():
        print("오류: 입력이 터미널에 연결되어 있지 않습니다. Termux의 새 셸 세션에서 실행해 주세요.",
              flush=True)
        return 1
    if destination.exists() or destination.is_symlink():
        print("오류: 키 파일이 이미 있습니다. 기존 파일은 덮어쓰지 않았습니다.", flush=True)
        return 1
    fd = sys.stdin.fileno()
    previous = termios.tcgetattr(fd)
    hidden = previous.copy()
    hidden[3] &= ~termios.ECHO
    try:
        termios.tcsetattr(fd, termios.TCSANOW, hidden)
        print("OpenAI Admin Key를 붙여넣고 Enter를 누르세요 (입력 내용은 숨김): ", end="", flush=True)
        value = sys.stdin.readline(4097).strip()
    finally:
        termios.tcsetattr(fd, termios.TCSANOW, previous)
        print(flush=True)
    if not value:
        print("입력이 없어 취소했습니다.", flush=True)
        return 1
    if len(value) > 4096 or any(c.isspace() for c in value):
        print("오류: 키에 공백이 있거나 입력이 너무 깁니다. 저장하지 않았습니다.", flush=True)
        return 1
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    out = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(out, "w") as stream:
        stream.write(value + "\n")
    print("저장 완료. 채팅에 '저장 완료'라고 알려주세요.", flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\n입력을 취소했습니다.", flush=True)
        raise SystemExit(1)
    except (OSError, termios.error) as error:
        print("오류: " + str(error), flush=True)
        raise SystemExit(1)
