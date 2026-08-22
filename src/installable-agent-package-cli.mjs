#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, strictJsonParse } from './canonical.mjs';
import { InstallableAgentPackageManager, verifyInstallableAgentRelease } from './installable-agent-package.mjs';
import { TermuxInstallableAgentServiceController } from './installable-agent-termux-service.mjs';

const MAX_REQUEST_BYTES = 1024 * 1024;
const MANAGEMENT_COMMANDS = new Set(['register', 'start', 'stop', 'update', 'uninstall']);

function usageError(message) {
  const error = new Error(message);
  error.code = 'installable_agent_cli_usage';
  return error;
}

function parseArgs(argv) {
  if (!Array.isArray(argv) || argv.length === 0) throw usageError('command is required');
  const command = argv[0];
  if (!['verify', 'install', 'register', 'start', 'status', 'stop', 'update', 'uninstall'].includes(command)) {
    throw usageError(`unsupported command: ${command}`);
  }
  const options = {};
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!['--package-root', '--state-directory', '--request-file'].includes(flag)) throw usageError(`unsupported option: ${flag}`);
    if (index + 1 >= argv.length) throw usageError(`missing value for ${flag}`);
    const key = flag.slice(2).replaceAll('-', '_');
    if (options[key] !== undefined) throw usageError(`duplicate option: ${flag}`);
    options[key] = argv[index + 1];
    index += 1;
  }
  return { command, options };
}

async function readRequest(requestFile) {
  if (typeof requestFile !== 'string' || requestFile.length === 0) throw usageError('--request-file is required for management mutation');
  const bytes = await readFile(path.resolve(requestFile));
  if (bytes.byteLength > MAX_REQUEST_BYTES) throw usageError('management request file exceeds package bound');
  return strictJsonParse(bytes.toString('utf8'), { maxBytes: MAX_REQUEST_BYTES });
}

function defaultPackageRoot() {
  return path.dirname(path.dirname(fileURLToPath(import.meta.url)));
}

function defaultManagerFactory({ packageRoot, stateDirectory }) {
  return new InstallableAgentPackageManager({
    packageRoot,
    stateDirectory,
    serviceController: new TermuxInstallableAgentServiceController(),
  });
}

export async function runInstallableAgentPackageCli(argv, {
  managerFactory = defaultManagerFactory,
  stdout = (line) => process.stdout.write(`${line}\n`),
} = {}) {
  const { command, options } = parseArgs(argv);
  const packageRoot = path.resolve(options.package_root ?? defaultPackageRoot());
  if (command === 'verify') {
    const verified = await verifyInstallableAgentRelease({ packageRoot });
    const result = {
      command,
      classification: 'verified',
      manifestDigest: verified.manifestDigest,
      sourceRevision: verified.manifest.sourceRevision,
      target: verified.manifest.target,
      verifiedFiles: verified.verifiedFiles,
    };
    stdout(canonicalJson(result));
    return result;
  }
  if (typeof options.state_directory !== 'string' || options.state_directory.length === 0) throw usageError('--state-directory is required');
  const manager = await managerFactory({ packageRoot, stateDirectory: path.resolve(options.state_directory) });
  if (!manager || typeof manager[command] !== 'function') throw usageError(`manager does not implement ${command}`);
  let result;
  if (MANAGEMENT_COMMANDS.has(command)) result = await manager[command](await readRequest(options.request_file));
  else result = await manager[command]();
  stdout(canonicalJson({ command, result }));
  return result;
}

const isDirect = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  try {
    await runInstallableAgentPackageCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${canonicalJson({
      error: error?.code ?? 'installable_agent_cli_failed',
      message: error?.message ?? 'Installable Agent command failed',
    })}\n`);
    process.exitCode = 1;
  }
}
