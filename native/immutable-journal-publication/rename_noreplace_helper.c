#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/syscall.h>
#include <unistd.h>

#ifndef RENAME_NOREPLACE
#define RENAME_NOREPLACE (1U << 0)
#endif

#ifndef SYS_renameat2
#ifdef __NR_renameat2
#define SYS_renameat2 __NR_renameat2
#endif
#endif

#ifndef SYS_renameat2
#error "renameat2 syscall number unavailable"
#endif

enum helper_status {
  HELPER_SUCCESS = 0,
  HELPER_CONFLICT = 1,
  HELPER_UNSUPPORTED = 2,
  HELPER_DENIED = 3,
  HELPER_ERROR = 4,
  HELPER_INVALID = 5
};

static int write_all(int fd, const unsigned char *bytes, size_t size) {
  size_t offset = 0;
  while (offset < size) {
    ssize_t written = write(fd, bytes + offset, size - offset);
    if (written < 0) {
      if (errno == EINTR) continue;
      return -1;
    }
    offset += (size_t)written;
  }
  return 0;
}

static int write_result(enum helper_status status, int err) {
  unsigned char frame[6];
  uint32_t value = (uint32_t)err;
  frame[0] = 'R';
  frame[1] = (unsigned char)status;
  frame[2] = (unsigned char)(value & 0xffU);
  frame[3] = (unsigned char)((value >> 8) & 0xffU);
  frame[4] = (unsigned char)((value >> 16) & 0xffU);
  frame[5] = (unsigned char)((value >> 24) & 0xffU);
  return write_all(4, frame, sizeof(frame));
}

static int valid_component(const char *name) {
  if (name == NULL || name[0] == '\0') return 0;
  if (strcmp(name, ".") == 0 || strcmp(name, "..") == 0) return 0;
  return strchr(name, '/') == NULL;
}

static int fd_is_open(int fd) {
  errno = 0;
  if (fcntl(fd, F_GETFD) != -1) return 1;
  return errno != EBADF;
}

static int debug_barrier(unsigned char phase) {
  unsigned char command = 0;
  if (!fd_is_open(5) || !fd_is_open(6)) return 0;
  if (write_all(6, &phase, 1) != 0) return -1;
  for (;;) {
    ssize_t count = read(5, &command, 1);
    if (count < 0 && errno == EINTR) continue;
    if (count != 1) return -1;
    break;
  }
  if (command == 'X') _exit(91);
  if (command == 'A') abort();
  return command == 'G' ? 0 : -1;
}

static enum helper_status classify_errno(int err) {
  if (err == EEXIST) return HELPER_CONFLICT;
  if (err == ENOSYS || err == EINVAL || err == EOPNOTSUPP) return HELPER_UNSUPPORTED;
  if (err == EACCES || err == EPERM) return HELPER_DENIED;
  return HELPER_ERROR;
}

int main(int argc, char **argv) {
  if (argc != 3 || !valid_component(argv[1]) || !valid_component(argv[2])) {
    (void)write_result(HELPER_INVALID, EINVAL);
    return 0;
  }

  if (debug_barrier('P') != 0) return 92;

  const unsigned char begin = 'B';
  if (write_all(4, &begin, 1) != 0) return 93;

  errno = 0;
  long rc = syscall(SYS_renameat2, 3, argv[1], 3, argv[2], RENAME_NOREPLACE);
  int saved_errno = rc == 0 ? 0 : errno;

  if (debug_barrier('A') != 0) return 94;

  enum helper_status status = rc == 0 ? HELPER_SUCCESS : classify_errno(saved_errno);
  if (write_result(status, saved_errno) != 0) return 95;
  return 0;
}
