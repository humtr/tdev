import { DurableObject } from 'cloudflare:workers';
import { CaseAgentDriveRuntimeDOHost } from '../src/cloudflare-case-agent-drive-runtime.mjs';

// D0046's trial-only Durable Object. It exposes only the D0042 intent/cursor
// boundary; Case, Agent delivery and process truth remain in their owners.
export class CaseAgentDriveRuntimeDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.host = new CaseAgentDriveRuntimeDOHost(ctx, env);
  }

  initializeCaseAgentDrive(input) {
    return this.host.initializeCaseAgentDrive(input);
  }

  readCaseAgentDrive(input) {
    return this.host.readCaseAgentDrive(input);
  }

  quiesceCaseAgentDrive(input) {
    return this.host.quiesceCaseAgentDrive(input);
  }

  advanceCaseAgentDrive(input) {
    return this.host.advanceCaseAgentDrive(input);
  }

  snapshotCaseAgentDrive(input) {
    return this.host.snapshotCaseAgentDrive(input);
  }
}
