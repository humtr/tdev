#define _GNU_SOURCE
#include <errno.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <sys/syscall.h>
#include <unistd.h>
#include <node_api.h>

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

enum addon_status {
  ADDON_SUCCESS = 0,
  ADDON_CONFLICT = 1,
  ADDON_UNSUPPORTED = 2,
  ADDON_DENIED = 3,
  ADDON_ERROR = 4,
  ADDON_INVALID = 5
};

static enum addon_status classify_errno(int err) {
  if (err == EEXIST) return ADDON_CONFLICT;
  if (err == ENOSYS || err == EINVAL || err == EOPNOTSUPP) return ADDON_UNSUPPORTED;
  if (err == EACCES || err == EPERM) return ADDON_DENIED;
  return ADDON_ERROR;
}

static const char *status_name(enum addon_status status) {
  switch (status) {
    case ADDON_SUCCESS: return "success";
    case ADDON_CONFLICT: return "conflict";
    case ADDON_UNSUPPORTED: return "unsupported";
    case ADDON_DENIED: return "denied";
    case ADDON_INVALID: return "invalid";
    default: return "error";
  }
}

static int valid_component(const char *name) {
  if (name == NULL || name[0] == '\0') return 0;
  if (strcmp(name, ".") == 0 || strcmp(name, "..") == 0) return 0;
  return strchr(name, '/') == NULL;
}

static napi_value make_result(napi_env env, enum addon_status status, int err) {
  napi_value object;
  napi_value status_value;
  napi_value errno_value;
  napi_create_object(env, &object);
  napi_create_string_utf8(env, status_name(status), NAPI_AUTO_LENGTH, &status_value);
  napi_create_int32(env, err, &errno_value);
  napi_set_named_property(env, object, "status", status_value);
  napi_set_named_property(env, object, "errno", errno_value);
  return object;
}

static int read_args(napi_env env, napi_callback_info info, int *dirfd, char *source, size_t source_size, char *destination, size_t destination_size) {
  size_t argc = 3;
  napi_value argv[3];
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc != 3) return -1;
  int32_t fd_value = -1;
  if (napi_get_value_int32(env, argv[0], &fd_value) != napi_ok || fd_value < 0) return -1;
  size_t source_length = 0;
  size_t destination_length = 0;
  if (napi_get_value_string_utf8(env, argv[1], source, source_size, &source_length) != napi_ok) return -1;
  if (napi_get_value_string_utf8(env, argv[2], destination, destination_size, &destination_length) != napi_ok) return -1;
  if (source_length == 0 || source_length >= source_size || destination_length == 0 || destination_length >= destination_size) return -1;
  if (!valid_component(source) || !valid_component(destination)) return -1;
  *dirfd = fd_value;
  return 0;
}

static napi_value rename_no_replace(napi_env env, napi_callback_info info) {
  int dirfd = -1;
  char source[256];
  char destination[256];
  if (read_args(env, info, &dirfd, source, sizeof(source), destination, sizeof(destination)) != 0) {
    return make_result(env, ADDON_INVALID, EINVAL);
  }
  errno = 0;
  long rc = syscall(SYS_renameat2, dirfd, source, dirfd, destination, RENAME_NOREPLACE);
  int saved_errno = rc == 0 ? 0 : errno;
  return make_result(env, rc == 0 ? ADDON_SUCCESS : classify_errno(saved_errno), saved_errno);
}

static napi_value rename_no_replace_then_abort(napi_env env, napi_callback_info info) {
  int dirfd = -1;
  char source[256];
  char destination[256];
  if (read_args(env, info, &dirfd, source, sizeof(source), destination, sizeof(destination)) != 0) {
    return make_result(env, ADDON_INVALID, EINVAL);
  }
  errno = 0;
  (void)syscall(SYS_renameat2, dirfd, source, dirfd, destination, RENAME_NOREPLACE);
  abort();
}

static napi_value init(napi_env env, napi_value exports) {
  napi_value normal;
  napi_value aborting;
  napi_create_function(env, "renameNoReplace", NAPI_AUTO_LENGTH, rename_no_replace, NULL, &normal);
  napi_create_function(env, "renameNoReplaceThenAbort", NAPI_AUTO_LENGTH, rename_no_replace_then_abort, NULL, &aborting);
  napi_set_named_property(env, exports, "renameNoReplace", normal);
  napi_set_named_property(env, exports, "renameNoReplaceThenAbort", aborting);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
