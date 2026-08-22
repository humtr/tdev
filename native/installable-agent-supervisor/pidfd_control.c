#define _GNU_SOURCE
#include <errno.h>
#include <node_api.h>
#include <poll.h>
#include <signal.h>
#include <stdint.h>
#include <sys/syscall.h>
#include <unistd.h>

#ifndef SYS_pidfd_open
#ifdef __NR_pidfd_open
#define SYS_pidfd_open __NR_pidfd_open
#endif
#endif

#ifndef SYS_pidfd_send_signal
#ifdef __NR_pidfd_send_signal
#define SYS_pidfd_send_signal __NR_pidfd_send_signal
#endif
#endif

#if !defined(SYS_pidfd_open) || !defined(SYS_pidfd_send_signal)
#error "pidfd syscalls are unavailable for this target"
#endif

static napi_value throw_errno(napi_env env, const char *code, const char *message, int err) {
  napi_value msg;
  napi_value error;
  napi_value code_value;
  napi_value errno_value;
  napi_create_string_utf8(env, message, NAPI_AUTO_LENGTH, &msg);
  napi_create_error(env, NULL, msg, &error);
  napi_create_string_utf8(env, code, NAPI_AUTO_LENGTH, &code_value);
  napi_set_named_property(env, error, "code", code_value);
  napi_create_int32(env, err, &errno_value);
  napi_set_named_property(env, error, "errno", errno_value);
  napi_throw(env, error);
  return NULL;
}

static int32_t arg_int32(napi_env env, napi_value value, const char *name) {
  int32_t result = 0;
  if (napi_get_value_int32(env, value, &result) != napi_ok) {
    napi_value msg;
    napi_create_string_utf8(env, name, NAPI_AUTO_LENGTH, &msg);
    napi_throw_type_error(env, NULL, name);
    return INT32_MIN;
  }
  return result;
}

static napi_value pidfd_open_fn(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  if (argc != 1) return throw_errno(env, "pidfd_invalid_argument", "pidfdOpen requires one pid", EINVAL);
  int32_t pid = arg_int32(env, argv[0], "pid must be an int32");
  if (pid <= 0) return throw_errno(env, "pidfd_invalid_argument", "pid must be positive", EINVAL);
  errno = 0;
  long fd = syscall(SYS_pidfd_open, (pid_t)pid, 0U);
  if (fd < 0) return throw_errno(env, "pidfd_open_failed", "pidfd_open failed", errno);
  napi_value result;
  napi_create_int32(env, (int32_t)fd, &result);
  return result;
}

static napi_value pidfd_send_signal_fn(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  if (argc != 2) return throw_errno(env, "pidfd_invalid_argument", "pidfdSendSignal requires fd and signal", EINVAL);
  int32_t fd = arg_int32(env, argv[0], "fd must be an int32");
  int32_t sig = arg_int32(env, argv[1], "signal must be an int32");
  if (fd < 0 || sig < 0) return throw_errno(env, "pidfd_invalid_argument", "fd/signal are invalid", EINVAL);
  errno = 0;
  long rc = syscall(SYS_pidfd_send_signal, fd, sig, NULL, 0U);
  if (rc != 0) return throw_errno(env, "pidfd_send_signal_failed", "pidfd_send_signal failed", errno);
  napi_value result;
  napi_get_boolean(env, true, &result);
  return result;
}

static napi_value pidfd_exited_fn(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  if (argc != 1) return throw_errno(env, "pidfd_invalid_argument", "pidfdExited requires one fd", EINVAL);
  int32_t fd = arg_int32(env, argv[0], "fd must be an int32");
  if (fd < 0) return throw_errno(env, "pidfd_invalid_argument", "fd is invalid", EINVAL);
  struct pollfd pfd = { .fd = fd, .events = POLLIN, .revents = 0 };
  errno = 0;
  int rc = poll(&pfd, 1, 0);
  if (rc < 0) return throw_errno(env, "pidfd_poll_failed", "pidfd poll failed", errno);
  napi_value result;
  napi_get_boolean(env, rc > 0 && (pfd.revents & (POLLIN | POLLHUP | POLLERR)) != 0, &result);
  return result;
}

static napi_value close_pidfd_fn(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  if (argc != 1) return throw_errno(env, "pidfd_invalid_argument", "closePidfd requires one fd", EINVAL);
  int32_t fd = arg_int32(env, argv[0], "fd must be an int32");
  if (fd < 0) return throw_errno(env, "pidfd_invalid_argument", "fd is invalid", EINVAL);
  errno = 0;
  if (close(fd) != 0) return throw_errno(env, "pidfd_close_failed", "pidfd close failed", errno);
  napi_value result;
  napi_get_boolean(env, true, &result);
  return result;
}

static napi_value probe_fn(napi_env env, napi_callback_info info) {
  (void)info;
  errno = 0;
  long fd = syscall(SYS_pidfd_open, getpid(), 0U);
  if (fd < 0) return throw_errno(env, "pidfd_probe_failed", "pidfd_open probe failed", errno);
  errno = 0;
  long rc = syscall(SYS_pidfd_send_signal, (int)fd, 0, NULL, 0U);
  int saved_errno = rc == 0 ? 0 : errno;
  close((int)fd);
  if (rc != 0) return throw_errno(env, "pidfd_probe_failed", "pidfd_send_signal probe failed", saved_errno);
  napi_value result;
  napi_create_object(env, &result);
  napi_value supported;
  napi_get_boolean(env, true, &supported);
  napi_set_named_property(env, result, "supported", supported);
  return result;
}

static napi_value init(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
    { "pidfdOpen", NULL, pidfd_open_fn, NULL, NULL, NULL, napi_default, NULL },
    { "pidfdSendSignal", NULL, pidfd_send_signal_fn, NULL, NULL, NULL, napi_default, NULL },
    { "pidfdExited", NULL, pidfd_exited_fn, NULL, NULL, NULL, napi_default, NULL },
    { "closePidfd", NULL, close_pidfd_fn, NULL, NULL, NULL, napi_default, NULL },
    { "probePidfd", NULL, probe_fn, NULL, NULL, NULL, napi_default, NULL },
  };
  napi_define_properties(env, exports, sizeof(properties) / sizeof(properties[0]), properties);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
