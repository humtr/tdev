// Code generated from canonical schema, target manifest, projection policy, and release profile by tools/generate. DO NOT EDIT.

export type CapabilityName =
  "list_operations"
  | "list_resources"
  | "submit_operation"
  | "get_case"
  | "get_task"
  | "control_case"
  | "finish_case"
  | "cancel_case"
  | "control_task"
  | "cancel_task"
  | "render_task"
  | "read_artifact"
;

export type CapabilityAnnotations = Readonly<{
  readOnlyHint: boolean;
  idempotentHint: boolean;
  destructiveHint: boolean;
  openWorldHint: boolean;
}>;

export type CapabilityDescriptor = Readonly<{
  name: CapabilityName;
  title: string;
  description: string;
  version: 1;
  inputRoot: string;
  resultRoot: string;
  mutation: boolean;
  owner: string;
  routing: string;
  retryClass: string;
  approvalClass: string;
  riskClass: string;
  resultBound: string;
  annotations: CapabilityAnnotations;
  inputSchema: Readonly<Record<string, unknown>>;
  outputSchema: Readonly<Record<string, unknown>>;
  inputSchemaDigest: string;
  resultSchemaDigest: string;
  maxResultBytes: number;
}>;

export const MCP_PROTOCOL_REVISION = "2026-07-28";
export const SEMANTIC_CAPABILITY_VERSION = 1 as const;
export const MCP_BASE_PROFILE = "tools-v1";
export const OPERATION_CATALOG_DIGEST = "c23e82d3b460006f914a57dd600ca98fe5d1e5dd1415c1bd7457a4a17ad09a51";
export const MCP_TOOL_SET_DIGEST = "92722b68e01e6086404b563ef66a76bb64bad26ffe934f6fc7d6c8b59d9031a7";
export const MCP_PROJECTION_DIGEST = "77c8aa18fb95141ced95ae1556cc71f580a433a7f58094845f791dc01043e6a3";

export const MCP_PROJECTION_MANIFEST = {
  "protocolRevision": "2026-07-28",
  "semanticCapabilityVersion": 1,
  "baseProfile": "tools-v1",
  "additiveFeatures": [],
  "releaseProfileDigest": "8a2f325b4ff2376a59f02ec0c42a25872f231260535eedeead932e6e35af113d",
  "catalogDigest": "c23e82d3b460006f914a57dd600ca98fe5d1e5dd1415c1bd7457a4a17ad09a51",
  "toolSetDigest": "92722b68e01e6086404b563ef66a76bb64bad26ffe934f6fc7d6c8b59d9031a7"
} as const;

export const CAPABILITY_DESCRIPTORS = [
  {
    "name": "list_operations",
    "title": "List Operations",
    "description": "List the release-pinned Native Operation catalog and current bounded availability.",
    "version": 1,
    "inputRoot": "ListOperationsInput",
    "resultRoot": "ListOperationsResult",
    "mutation": false,
    "owner": "release",
    "routing": "release",
    "retryClass": "read_only",
    "approvalClass": "none",
    "riskClass": "read",
    "resultBound": "page",
    "annotations": {
      "readOnlyHint": true,
      "idempotentHint": true,
      "destructiveHint": false,
      "openWorldHint": false
    },
    "inputSchema": {
      "$defs": {
        "ListOperationsInput": {
          "additionalProperties": false,
          "properties": {
            "page": {
              "$ref": "#/$defs/PageRequestV1"
            }
          },
          "type": "object"
        },
        "PageRequestV1": {
          "additionalProperties": false,
          "properties": {
            "cursor": {
              "maxLength": 8192,
              "minLength": 1,
              "type": "string"
            },
            "limit": {
              "maximum": 100,
              "minimum": 1,
              "type": "integer"
            }
          },
          "type": "object"
        }
      },
      "$ref": "#/$defs/ListOperationsInput",
      "$schema": "https://json-schema.org/draft/2020-12/schema"
    },
    "outputSchema": {
      "$defs": {
        "CapabilityName": {
          "enum": [
            "list_operations",
            "list_resources",
            "submit_operation",
            "get_case",
            "get_task",
            "control_case",
            "finish_case",
            "cancel_case",
            "control_task",
            "cancel_task",
            "render_task",
            "read_artifact"
          ]
        },
        "ListOperationsResult": {
          "additionalProperties": false,
          "properties": {
            "catalogDigest": {
              "$ref": "#/$defs/Sha256"
            },
            "operations": {
              "items": {
                "$ref": "#/$defs/OperationCatalogEntryV1"
              },
              "maxItems": 100,
              "type": "array"
            },
            "page": {
              "$ref": "#/$defs/PageResultV1"
            },
            "profileDigest": {
              "$ref": "#/$defs/Sha256"
            }
          },
          "required": [
            "operations",
            "catalogDigest",
            "profileDigest",
            "page"
          ],
          "type": "object"
        },
        "OperationCatalogEntryV1": {
          "additionalProperties": false,
          "properties": {
            "available": {
              "type": "boolean"
            },
            "inputSchemaDigest": {
              "$ref": "#/$defs/Sha256"
            },
            "mutating": {
              "type": "boolean"
            },
            "operationId": {
              "$ref": "#/$defs/CapabilityName"
            },
            "operationVersion": {
              "maximum": 1,
              "minimum": 1,
              "type": "integer"
            },
            "resultSchemaDigest": {
              "$ref": "#/$defs/Sha256"
            },
            "title": {
              "maxLength": 256,
              "minLength": 1,
              "type": "string"
            }
          },
          "required": [
            "operationId",
            "operationVersion",
            "title",
            "inputSchemaDigest",
            "resultSchemaDigest",
            "mutating",
            "available"
          ],
          "type": "object"
        },
        "PageResultV1": {
          "additionalProperties": false,
          "properties": {
            "nextCursor": {
              "maxLength": 8192,
              "minLength": 1,
              "type": "string"
            },
            "snapshot": {
              "$ref": "#/$defs/SnapshotV1"
            }
          },
          "required": [
            "snapshot"
          ],
          "type": "object"
        },
        "Sha256": {
          "pattern": "^[0-9a-f]{64}$",
          "type": "string"
        },
        "SnapshotV1": {
          "additionalProperties": false,
          "properties": {
            "caseRevision": {
              "maximum": 9007199254740991,
              "minimum": 1,
              "type": "integer"
            },
            "eventSequence": {
              "maximum": 9007199254740991,
              "minimum": 0,
              "type": "integer"
            },
            "taskRevision": {
              "maximum": 9007199254740991,
              "minimum": 1,
              "type": "integer"
            }
          },
          "required": [
            "eventSequence"
          ],
          "type": "object"
        }
      },
      "$ref": "#/$defs/ListOperationsResult",
      "$schema": "https://json-schema.org/draft/2020-12/schema"
    },
    "inputSchemaDigest": "d59718e5179c189b059fa1872066dd5de8099fe02dfb5e6fedc099fc2d1efdb4",
    "resultSchemaDigest": "a67236da084f6ed8ad80b2298a6a04422077dcad036a143c922a61be4de58b31",
    "maxResultBytes": 262144
  },
  {
    "name": "list_resources",
    "title": "List Resources",
    "description": "List bounded authorized Case resources from a stable snapshot.",
    "version": 1,
    "inputRoot": "ListResourcesInput",
    "resultRoot": "ListResourcesResult",
    "mutation": false,
    "owner": "case_do",
    "routing": "authorized_locator",
    "retryClass": "read_only",
    "approvalClass": "none",
    "riskClass": "read",
    "resultBound": "page",
    "annotations": {
      "readOnlyHint": true,
      "idempotentHint": true,
      "destructiveHint": false,
      "openWorldHint": false
    },
    "inputSchema": {
      "$defs": {
        "CaseId": {
          "pattern": "^case_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "ListResourcesInput": {
          "additionalProperties": false,
          "properties": {
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "kinds": {
              "items": {
                "$ref": "#/$defs/ResourceKindV1"
              },
              "maxItems": 7,
              "type": "array",
              "uniqueItems": true
            },
            "page": {
              "$ref": "#/$defs/PageRequestV1"
            },
            "taskId": {
              "$ref": "#/$defs/TaskId"
            }
          },
          "type": "object"
        },
        "PageRequestV1": {
          "additionalProperties": false,
          "properties": {
            "cursor": {
              "maxLength": 8192,
              "minLength": 1,
              "type": "string"
            },
            "limit": {
              "maximum": 100,
              "minimum": 1,
              "type": "integer"
            }
          },
          "type": "object"
        },
        "ResourceKindV1": {
          "enum": [
            "case",
            "task",
            "attempt",
            "event",
            "checkpoint",
            "evidence_set",
            "artifact"
          ]
        },
        "TaskId": {
          "pattern": "^task_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        }
      },
      "$ref": "#/$defs/ListResourcesInput",
      "$schema": "https://json-schema.org/draft/2020-12/schema"
    },
    "outputSchema": {
      "$defs": {
        "CaseId": {
          "pattern": "^case_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "ListResourcesResult": {
          "additionalProperties": false,
          "properties": {
            "page": {
              "$ref": "#/$defs/PageResultV1"
            },
            "resources": {
              "items": {
                "$ref": "#/$defs/ResourceSummaryV1"
              },
              "maxItems": 100,
              "type": "array"
            }
          },
          "required": [
            "resources",
            "page"
          ],
          "type": "object"
        },
        "PageResultV1": {
          "additionalProperties": false,
          "properties": {
            "nextCursor": {
              "maxLength": 8192,
              "minLength": 1,
              "type": "string"
            },
            "snapshot": {
              "$ref": "#/$defs/SnapshotV1"
            }
          },
          "required": [
            "snapshot"
          ],
          "type": "object"
        },
        "ResourceKindV1": {
          "enum": [
            "case",
            "task",
            "attempt",
            "event",
            "checkpoint",
            "evidence_set",
            "artifact"
          ]
        },
        "ResourceSummaryV1": {
          "additionalProperties": false,
          "properties": {
            "byteLength": {
              "maximum": 9007199254740991,
              "minimum": 0,
              "type": "integer"
            },
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "createdAt": {
              "$ref": "#/$defs/Timestamp"
            },
            "kind": {
              "$ref": "#/$defs/ResourceKindV1"
            },
            "mediaType": {
              "maxLength": 256,
              "minLength": 1,
              "type": "string"
            },
            "revision": {
              "maximum": 9007199254740991,
              "minimum": 1,
              "type": "integer"
            },
            "sha256": {
              "$ref": "#/$defs/Sha256"
            },
            "subjectId": {
              "maxLength": 256,
              "minLength": 1,
              "type": "string"
            },
            "taskId": {
              "$ref": "#/$defs/TaskId"
            },
            "uri": {
              "maxLength": 2048,
              "minLength": 1,
              "type": "string"
            }
          },
          "required": [
            "kind",
            "uri",
            "caseId",
            "subjectId"
          ],
          "type": "object"
        },
        "Sha256": {
          "pattern": "^[0-9a-f]{64}$",
          "type": "string"
        },
        "SnapshotV1": {
          "additionalProperties": false,
          "properties": {
            "caseRevision": {
              "maximum": 9007199254740991,
              "minimum": 1,
              "type": "integer"
            },
            "eventSequence": {
              "maximum": 9007199254740991,
              "minimum": 0,
              "type": "integer"
            },
            "taskRevision": {
              "maximum": 9007199254740991,
              "minimum": 1,
              "type": "integer"
            }
          },
          "required": [
            "eventSequence"
          ],
          "type": "object"
        },
        "TaskId": {
          "pattern": "^task_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "Timestamp": {
          "format": "date-time",
          "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,9})?Z$",
          "type": "string"
        }
      },
      "$ref": "#/$defs/ListResourcesResult",
      "$schema": "https://json-schema.org/draft/2020-12/schema"
    },
    "inputSchemaDigest": "b5d9da88e615c4667ab84d94bbfebb08b2050652d5415de8e3857bef9d73e4dc",
    "resultSchemaDigest": "a1d20d211f53356e91fdeab75521d73f41975c0008a44e137ab25bfa64e3c635",
    "maxResultBytes": 262144
  },
  {
    "name": "submit_operation",
    "title": "Submit Operation",
    "description": "Create or continue a Case and durably admit one typed Native Operation Task.",
    "version": 1,
    "inputRoot": "SubmitOperationInput",
    "resultRoot": "SubmitOperationResult",
    "mutation": true,
    "owner": "case_do",
    "routing": "new_or_explicit_case",
    "retryClass": "deduplicated",
    "approvalClass": "operation_policy",
    "riskClass": "external_effect",
    "resultBound": "mutation",
    "annotations": {
      "readOnlyHint": false,
      "idempotentHint": true,
      "destructiveHint": false,
      "openWorldHint": true
    },
    "inputSchema": {
      "$defs": {
        "AcceptanceCriterion": {
          "additionalProperties": false,
          "properties": {
            "criterionId": {
              "maxLength": 128,
              "minLength": 1,
              "type": "string"
            },
            "mandatory": {
              "type": "boolean"
            },
            "statement": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            }
          },
          "required": [
            "criterionId",
            "statement",
            "mandatory"
          ],
          "type": "object"
        },
        "AgentId": {
          "pattern": "^agent_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "BaseReference": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "git_commit"
                },
                "objectId": {
                  "$ref": "#/$defs/GitObjectId"
                }
              },
              "required": [
                "kind",
                "objectId"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "digest": {
                  "$ref": "#/$defs/Sha256"
                },
                "kind": {
                  "const": "observation"
                }
              },
              "required": [
                "kind",
                "digest"
              ],
              "type": "object"
            }
          ]
        },
        "CaseId": {
          "pattern": "^case_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "CheckpointId": {
          "pattern": "^checkpoint_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "ContractClause": {
          "additionalProperties": false,
          "properties": {
            "clauseId": {
              "maxLength": 128,
              "minLength": 1,
              "type": "string"
            },
            "statement": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            }
          },
          "required": [
            "clauseId",
            "statement"
          ],
          "type": "object"
        },
        "GitObjectId": {
          "pattern": "^[0-9a-f]{40,64}$",
          "type": "string"
        },
        "GrantId": {
          "pattern": "^grant_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "GrantedAgainst": {
          "additionalProperties": false,
          "properties": {
            "baseReference": {
              "$ref": "#/$defs/BaseReference"
            },
            "projectRevision": {
              "minimum": 1,
              "type": "integer"
            },
            "workspacePolicyDigest": {
              "$ref": "#/$defs/Sha256"
            },
            "workspaceRevision": {
              "minimum": 1,
              "type": "integer"
            }
          },
          "required": [
            "workspaceRevision",
            "workspacePolicyDigest"
          ],
          "type": "object"
        },
        "JsonValue": {
          "oneOf": [
            {
              "type": "null"
            },
            {
              "type": "boolean"
            },
            {
              "maximum": 9007199254740991,
              "minimum": -9007199254740991,
              "type": "integer"
            },
            {
              "type": "string"
            },
            {
              "items": {
                "$ref": "#/$defs/JsonValue"
              },
              "type": "array"
            },
            {
              "additionalProperties": {
                "$ref": "#/$defs/JsonValue"
              },
              "type": "object"
            }
          ]
        },
        "NewCaseContractInput": {
          "additionalProperties": false,
          "properties": {
            "acceptanceCriteria": {
              "items": {
                "$ref": "#/$defs/AcceptanceCriterion"
              },
              "minItems": 1,
              "type": "array"
            },
            "constraints": {
              "items": {
                "$ref": "#/$defs/ContractClause"
              },
              "type": "array"
            },
            "nonGoals": {
              "items": {
                "$ref": "#/$defs/ContractClause"
              },
              "type": "array"
            },
            "objective": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            },
            "policyRef": {
              "$ref": "#/$defs/PolicyRef"
            },
            "predecessor": {
              "$ref": "#/$defs/PredecessorRef"
            },
            "targetGrants": {
              "items": {
                "$ref": "#/$defs/NewCaseTargetGrant"
              },
              "minItems": 1,
              "type": "array"
            },
            "verificationRequirements": {
              "items": {
                "$ref": "#/$defs/VerificationRequirement"
              },
              "minItems": 1,
              "type": "array"
            }
          },
          "required": [
            "objective",
            "acceptanceCriteria",
            "verificationRequirements",
            "nonGoals",
            "constraints",
            "targetGrants",
            "policyRef"
          ],
          "type": "object"
        },
        "NewCaseTargetGrant": {
          "additionalProperties": false,
          "properties": {
            "agentId": {
              "$ref": "#/$defs/AgentId"
            },
            "allowedEffects": {
              "items": {
                "$ref": "#/$defs/TargetEffect"
              },
              "minItems": 1,
              "type": "array",
              "uniqueItems": true
            },
            "allowedSubpaths": {
              "items": {
                "$ref": "#/$defs/RelativePath"
              },
              "minItems": 1,
              "type": "array",
              "uniqueItems": true
            },
            "grantedAgainst": {
              "$ref": "#/$defs/GrantedAgainst"
            },
            "rootIdentityDigest": {
              "$ref": "#/$defs/Sha256"
            },
            "target": {
              "$ref": "#/$defs/Target"
            }
          },
          "required": [
            "agentId",
            "target",
            "rootIdentityDigest",
            "allowedSubpaths",
            "allowedEffects",
            "grantedAgainst"
          ],
          "type": "object"
        },
        "PolicyRef": {
          "additionalProperties": false,
          "properties": {
            "digest": {
              "$ref": "#/$defs/Sha256"
            },
            "version": {
              "minimum": 1,
              "type": "integer"
            }
          },
          "required": [
            "version",
            "digest"
          ],
          "type": "object"
        },
        "PredecessorRef": {
          "additionalProperties": false,
          "properties": {
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "checkpointDigest": {
              "$ref": "#/$defs/Sha256"
            },
            "checkpointId": {
              "$ref": "#/$defs/CheckpointId"
            },
            "reason": {
              "enum": [
                "objective_changed",
                "target_scope_changed",
                "authority_changed",
                "policy_changed"
              ]
            }
          },
          "required": [
            "caseId",
            "checkpointId",
            "checkpointDigest",
            "reason"
          ],
          "type": "object"
        },
        "ProjectId": {
          "pattern": "^project_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "RelativePath": {
          "maxLength": 4096,
          "minLength": 1,
          "pattern": "^([^./\\\\\u0000][^/\\\\\u0000]*|\\.[^./\\\\\u0000][^/\\\\\u0000]*|\\.\\.[^/\\\\\u0000][^/\\\\\u0000]*)(/([^./\\\\\u0000][^/\\\\\u0000]*|\\.[^./\\\\\u0000][^/\\\\\u0000]*|\\.\\.[^/\\\\\u0000][^/\\\\\u0000]*))*$",
          "type": "string"
        },
        "RequestId": {
          "pattern": "^request_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "Sha256": {
          "pattern": "^[0-9a-f]{64}$",
          "type": "string"
        },
        "SubmitOperationInput": {
          "additionalProperties": false,
          "properties": {
            "case": {
              "oneOf": [
                {
                  "additionalProperties": false,
                  "properties": {
                    "contract": {
                      "$ref": "#/$defs/NewCaseContractInput"
                    },
                    "kind": {
                      "const": "new"
                    }
                  },
                  "required": [
                    "kind",
                    "contract"
                  ],
                  "type": "object"
                },
                {
                  "additionalProperties": false,
                  "properties": {
                    "caseId": {
                      "$ref": "#/$defs/CaseId"
                    },
                    "expectedContractDigest": {
                      "$ref": "#/$defs/Sha256"
                    },
                    "kind": {
                      "const": "existing"
                    }
                  },
                  "required": [
                    "kind",
                    "caseId",
                    "expectedContractDigest"
                  ],
                  "type": "object"
                }
              ]
            },
            "operation": {
              "additionalProperties": false,
              "properties": {
                "arguments": {
                  "$ref": "#/$defs/JsonValue"
                },
                "expectedSchemaDigest": {
                  "$ref": "#/$defs/Sha256"
                },
                "id": {
                  "maxLength": 128,
                  "minLength": 1,
                  "type": "string"
                },
                "targets": {
                  "items": {
                    "$ref": "#/$defs/TargetBinding"
                  },
                  "type": "array"
                },
                "version": {
                  "minimum": 1,
                  "type": "integer"
                }
              },
              "required": [
                "id",
                "version",
                "expectedSchemaDigest",
                "targets",
                "arguments"
              ],
              "type": "object"
            },
            "requestId": {
              "$ref": "#/$defs/RequestId"
            },
            "wait": {
              "oneOf": [
                {
                  "additionalProperties": false,
                  "properties": {
                    "mode": {
                      "const": "none"
                    }
                  },
                  "required": [
                    "mode"
                  ],
                  "type": "object"
                },
                {
                  "additionalProperties": false,
                  "properties": {
                    "mode": {
                      "const": "bounded"
                    },
                    "timeoutMs": {
                      "maximum": 600000,
                      "minimum": 1,
                      "type": "integer"
                    }
                  },
                  "required": [
                    "mode",
                    "timeoutMs"
                  ],
                  "type": "object"
                }
              ]
            }
          },
          "required": [
            "requestId",
            "case",
            "operation",
            "wait"
          ],
          "type": "object"
        },
        "Target": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "workspace"
                },
                "workspaceId": {
                  "$ref": "#/$defs/WorkspaceId"
                }
              },
              "required": [
                "kind",
                "workspaceId"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "project"
                },
                "projectId": {
                  "$ref": "#/$defs/ProjectId"
                },
                "workspaceId": {
                  "$ref": "#/$defs/WorkspaceId"
                }
              },
              "required": [
                "kind",
                "workspaceId",
                "projectId"
              ],
              "type": "object"
            }
          ]
        },
        "TargetBinding": {
          "additionalProperties": false,
          "properties": {
            "grantId": {
              "$ref": "#/$defs/GrantId"
            },
            "resource": {
              "$ref": "#/$defs/Target"
            },
            "role": {
              "maxLength": 64,
              "minLength": 1,
              "type": "string"
            }
          },
          "required": [
            "role",
            "grantId",
            "resource"
          ],
          "type": "object"
        },
        "TargetEffect": {
          "enum": [
            "fs.read",
            "fs.write",
            "fs.delete",
            "git.read",
            "git.write",
            "remote.read",
            "remote.write",
            "validation.execute",
            "process.execute",
            "network.use",
            "package.manage",
            "service.manage",
            "runtime.manage"
          ]
        },
        "VerificationLayer": {
          "enum": [
            "source",
            "validation",
            "package",
            "installation",
            "runtime",
            "ingress",
            "public_mcp",
            "client",
            "rollback"
          ]
        },
        "VerificationRequirement": {
          "additionalProperties": false,
          "properties": {
            "criterionIds": {
              "items": {
                "maxLength": 128,
                "minLength": 1,
                "type": "string"
              },
              "minItems": 1,
              "type": "array",
              "uniqueItems": true
            },
            "layer": {
              "$ref": "#/$defs/VerificationLayer"
            },
            "requirementId": {
              "maxLength": 128,
              "minLength": 1,
              "type": "string"
            },
            "statement": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            }
          },
          "required": [
            "requirementId",
            "criterionIds",
            "layer",
            "statement"
          ],
          "type": "object"
        },
        "WorkspaceId": {
          "pattern": "^workspace_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        }
      },
      "$ref": "#/$defs/SubmitOperationInput",
      "$schema": "https://json-schema.org/draft/2020-12/schema"
    },
    "outputSchema": {
      "$defs": {
        "ActorRef": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "mcp_client"
                },
                "subjectId": {
                  "maxLength": 256,
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "kind",
                "subjectId"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "user"
                },
                "subjectId": {
                  "maxLength": 256,
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "kind",
                "subjectId"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "component": {
                  "enum": [
                    "worker",
                    "case_do",
                    "agent_do",
                    "agent"
                  ]
                },
                "kind": {
                  "const": "system"
                }
              },
              "required": [
                "kind",
                "component"
              ],
              "type": "object"
            }
          ]
        },
        "ApprovalDecisionId": {
          "pattern": "^approval_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "ApprovalRequestId": {
          "pattern": "^approval_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "ArtifactId": {
          "pattern": "^artifact_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "ArtifactRef": {
          "additionalProperties": false,
          "properties": {
            "artifactId": {
              "$ref": "#/$defs/ArtifactId"
            },
            "bytes": {
              "minimum": 0,
              "type": "integer"
            },
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "createdAt": {
              "$ref": "#/$defs/Timestamp"
            },
            "mediaType": {
              "maxLength": 256,
              "minLength": 1,
              "type": "string"
            },
            "sha256": {
              "$ref": "#/$defs/Sha256"
            },
            "taskId": {
              "$ref": "#/$defs/TaskId"
            }
          },
          "required": [
            "artifactId",
            "caseId",
            "taskId",
            "mediaType",
            "bytes",
            "sha256",
            "createdAt"
          ],
          "type": "object"
        },
        "AttemptId": {
          "pattern": "^attempt_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "CancellationId": {
          "pattern": "^cancel_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "CancellationSummary": {
          "additionalProperties": false,
          "properties": {
            "cancellationId": {
              "$ref": "#/$defs/CancellationId"
            },
            "effectsObserved": {
              "items": {
                "$ref": "#/$defs/TargetEffect"
              },
              "type": "array",
              "uniqueItems": true
            },
            "reason": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            }
          },
          "required": [
            "cancellationId",
            "reason",
            "effectsObserved"
          ],
          "type": "object"
        },
        "CaseId": {
          "pattern": "^case_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "CaseStatus": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "enteredAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "kind": {
                  "const": "active"
                }
              },
              "required": [
                "kind",
                "enteredAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "detail": {
                  "maxLength": 4096,
                  "minLength": 1,
                  "type": "string"
                },
                "kind": {
                  "const": "paused"
                },
                "pausedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "reason": {
                  "enum": [
                    "manual",
                    "authority_invalidated",
                    "external_blocker"
                  ]
                }
              },
              "required": [
                "kind",
                "reason",
                "pausedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "cancellationId": {
                  "$ref": "#/$defs/CancellationId"
                },
                "kind": {
                  "const": "cancelling"
                },
                "reason": {
                  "minLength": 1,
                  "type": "string"
                },
                "requestedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "requestedBy": {
                  "$ref": "#/$defs/ActorRef"
                }
              },
              "required": [
                "kind",
                "cancellationId",
                "requestedBy",
                "requestedAt",
                "reason"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "terminal"
                },
                "terminal": {
                  "$ref": "#/$defs/CaseTerminal"
                }
              },
              "required": [
                "kind",
                "terminal"
              ],
              "type": "object"
            }
          ]
        },
        "CaseTerminal": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "closedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "evidenceSetId": {
                  "$ref": "#/$defs/EvidenceSetId"
                },
                "outcome": {
                  "const": "completed"
                },
                "summary": {
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "outcome",
                "summary",
                "evidenceSetId",
                "closedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "closedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "failure": {
                  "$ref": "#/$defs/FailureRecord"
                },
                "outcome": {
                  "const": "failed"
                },
                "summary": {
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "outcome",
                "summary",
                "failure",
                "closedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "cancellation": {
                  "$ref": "#/$defs/CancellationSummary"
                },
                "closedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "cancelled"
                },
                "summary": {
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "outcome",
                "summary",
                "cancellation",
                "closedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "closedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "rolled_back"
                },
                "rollbackEvidenceSetId": {
                  "$ref": "#/$defs/EvidenceSetId"
                },
                "summary": {
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "outcome",
                "summary",
                "rollbackEvidenceSetId",
                "closedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "closedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "unverified"
                },
                "summary": {
                  "minLength": 1,
                  "type": "string"
                },
                "uncertainty": {
                  "$ref": "#/$defs/UncertaintyRecord"
                }
              },
              "required": [
                "outcome",
                "summary",
                "uncertainty",
                "closedAt"
              ],
              "type": "object"
            }
          ]
        },
        "EvidenceSetId": {
          "pattern": "^evidence_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "FailureRecord": {
          "additionalProperties": false,
          "properties": {
            "code": {
              "maxLength": 128,
              "minLength": 1,
              "type": "string"
            },
            "message": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            },
            "retryable": {
              "type": "boolean"
            }
          },
          "required": [
            "code",
            "message",
            "retryable"
          ],
          "type": "object"
        },
        "GrantId": {
          "pattern": "^grant_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "InputRequestId": {
          "pattern": "^input_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "JsonValue": {
          "oneOf": [
            {
              "type": "null"
            },
            {
              "type": "boolean"
            },
            {
              "maximum": 9007199254740991,
              "minimum": -9007199254740991,
              "type": "integer"
            },
            {
              "type": "string"
            },
            {
              "items": {
                "$ref": "#/$defs/JsonValue"
              },
              "type": "array"
            },
            {
              "additionalProperties": {
                "$ref": "#/$defs/JsonValue"
              },
              "type": "object"
            }
          ]
        },
        "OperationFailure": {
          "$ref": "#/$defs/FailureRecord"
        },
        "OperationInvocation": {
          "additionalProperties": false,
          "properties": {
            "arguments": {
              "$ref": "#/$defs/JsonValue"
            },
            "expectedSchemaDigest": {
              "$ref": "#/$defs/Sha256"
            },
            "id": {
              "maxLength": 128,
              "minLength": 1,
              "type": "string"
            },
            "inputDigest": {
              "$ref": "#/$defs/Sha256"
            },
            "targets": {
              "items": {
                "$ref": "#/$defs/TargetBinding"
              },
              "minItems": 1,
              "type": "array"
            },
            "version": {
              "minimum": 1,
              "type": "integer"
            }
          },
          "required": [
            "id",
            "version",
            "expectedSchemaDigest",
            "targets",
            "arguments",
            "inputDigest"
          ],
          "type": "object"
        },
        "OperationResult": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "inline"
                },
                "resultDigest": {
                  "$ref": "#/$defs/Sha256"
                },
                "value": {
                  "$ref": "#/$defs/JsonValue"
                }
              },
              "required": [
                "kind",
                "value",
                "resultDigest"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "artifacts": {
                  "items": {
                    "$ref": "#/$defs/ArtifactRef"
                  },
                  "minItems": 1,
                  "type": "array"
                },
                "kind": {
                  "const": "artifacts"
                },
                "resultDigest": {
                  "$ref": "#/$defs/Sha256"
                }
              },
              "required": [
                "kind",
                "artifacts",
                "resultDigest"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "artifacts": {
                  "items": {
                    "$ref": "#/$defs/ArtifactRef"
                  },
                  "minItems": 1,
                  "type": "array"
                },
                "kind": {
                  "const": "mixed"
                },
                "resultDigest": {
                  "$ref": "#/$defs/Sha256"
                },
                "value": {
                  "$ref": "#/$defs/JsonValue"
                }
              },
              "required": [
                "kind",
                "value",
                "artifacts",
                "resultDigest"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "none"
                },
                "resultDigest": {
                  "$ref": "#/$defs/Sha256"
                }
              },
              "required": [
                "kind",
                "resultDigest"
              ],
              "type": "object"
            }
          ]
        },
        "ProjectId": {
          "pattern": "^project_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "RequestId": {
          "pattern": "^request_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "RetryDecisionId": {
          "pattern": "^retry_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "Sha256": {
          "pattern": "^[0-9a-f]{64}$",
          "type": "string"
        },
        "SubmitOperationCaseSummaryV1": {
          "additionalProperties": false,
          "properties": {
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "caseRevision": {
              "maximum": 9007199254740991,
              "minimum": 1,
              "type": "integer"
            },
            "contractDigest": {
              "$ref": "#/$defs/Sha256"
            },
            "eventSequence": {
              "maximum": 9007199254740991,
              "minimum": 0,
              "type": "integer"
            },
            "status": {
              "$ref": "#/$defs/CaseStatus"
            }
          },
          "required": [
            "caseId",
            "contractDigest",
            "caseRevision",
            "eventSequence",
            "status"
          ],
          "type": "object"
        },
        "SubmitOperationResult": {
          "additionalProperties": false,
          "properties": {
            "accepted": {
              "const": true
            },
            "case": {
              "$ref": "#/$defs/SubmitOperationCaseSummaryV1"
            },
            "continuing": {
              "type": "boolean"
            },
            "deduplicated": {
              "type": "boolean"
            },
            "task": {
              "$ref": "#/$defs/TaskRecord"
            }
          },
          "required": [
            "accepted",
            "deduplicated",
            "case",
            "task",
            "continuing"
          ],
          "type": "object"
        },
        "Target": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "workspace"
                },
                "workspaceId": {
                  "$ref": "#/$defs/WorkspaceId"
                }
              },
              "required": [
                "kind",
                "workspaceId"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "project"
                },
                "projectId": {
                  "$ref": "#/$defs/ProjectId"
                },
                "workspaceId": {
                  "$ref": "#/$defs/WorkspaceId"
                }
              },
              "required": [
                "kind",
                "workspaceId",
                "projectId"
              ],
              "type": "object"
            }
          ]
        },
        "TargetBinding": {
          "additionalProperties": false,
          "properties": {
            "grantId": {
              "$ref": "#/$defs/GrantId"
            },
            "resource": {
              "$ref": "#/$defs/Target"
            },
            "role": {
              "maxLength": 64,
              "minLength": 1,
              "type": "string"
            }
          },
          "required": [
            "role",
            "grantId",
            "resource"
          ],
          "type": "object"
        },
        "TargetEffect": {
          "enum": [
            "fs.read",
            "fs.write",
            "fs.delete",
            "git.read",
            "git.write",
            "remote.read",
            "remote.write",
            "validation.execute",
            "process.execute",
            "network.use",
            "package.manage",
            "service.manage",
            "runtime.manage"
          ]
        },
        "TaskId": {
          "pattern": "^task_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "TaskRecord": {
          "additionalProperties": false,
          "properties": {
            "admission": {
              "additionalProperties": false,
              "properties": {
                "admittedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "contractDigest": {
                  "$ref": "#/$defs/Sha256"
                },
                "inputDigest": {
                  "$ref": "#/$defs/Sha256"
                },
                "operationSchemaDigest": {
                  "$ref": "#/$defs/Sha256"
                },
                "requestId": {
                  "$ref": "#/$defs/RequestId"
                }
              },
              "required": [
                "requestId",
                "admittedAt",
                "contractDigest",
                "operationSchemaDigest",
                "inputDigest"
              ],
              "type": "object"
            },
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "createdAt": {
              "$ref": "#/$defs/Timestamp"
            },
            "latestAttemptId": {
              "$ref": "#/$defs/AttemptId"
            },
            "operation": {
              "$ref": "#/$defs/OperationInvocation"
            },
            "schemaVersion": {
              "const": 1
            },
            "sequence": {
              "minimum": 1,
              "type": "integer"
            },
            "status": {
              "$ref": "#/$defs/TaskStatus"
            },
            "taskId": {
              "$ref": "#/$defs/TaskId"
            },
            "taskRevision": {
              "minimum": 1,
              "type": "integer"
            },
            "updatedAt": {
              "$ref": "#/$defs/Timestamp"
            }
          },
          "required": [
            "schemaVersion",
            "caseId",
            "taskId",
            "sequence",
            "operation",
            "admission",
            "taskRevision",
            "status",
            "createdAt",
            "updatedAt"
          ],
          "type": "object"
        },
        "TaskStatus": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "waiting"
                },
                "waiting": {
                  "$ref": "#/$defs/TaskWaiting"
                }
              },
              "required": [
                "kind",
                "waiting"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "ready"
                },
                "readyAt": {
                  "$ref": "#/$defs/Timestamp"
                }
              },
              "required": [
                "kind",
                "readyAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "attemptId": {
                  "$ref": "#/$defs/AttemptId"
                },
                "kind": {
                  "const": "active"
                }
              },
              "required": [
                "kind",
                "attemptId"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "attemptId": {
                  "$ref": "#/$defs/AttemptId"
                },
                "cancellationId": {
                  "$ref": "#/$defs/CancellationId"
                },
                "kind": {
                  "const": "cancelling"
                },
                "requestedAt": {
                  "$ref": "#/$defs/Timestamp"
                }
              },
              "required": [
                "kind",
                "cancellationId",
                "requestedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "terminal"
                },
                "terminal": {
                  "$ref": "#/$defs/TaskTerminal"
                }
              },
              "required": [
                "kind",
                "terminal"
              ],
              "type": "object"
            }
          ]
        },
        "TaskTerminal": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "succeeded"
                },
                "result": {
                  "$ref": "#/$defs/OperationResult"
                }
              },
              "required": [
                "outcome",
                "result",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "failure": {
                  "$ref": "#/$defs/OperationFailure"
                },
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "failed"
                }
              },
              "required": [
                "outcome",
                "failure",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "cancellation": {
                  "$ref": "#/$defs/CancellationSummary"
                },
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "cancelled"
                }
              },
              "required": [
                "outcome",
                "cancellation",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "approvalDecisionId": {
                  "$ref": "#/$defs/ApprovalDecisionId"
                },
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "denied"
                }
              },
              "required": [
                "outcome",
                "approvalDecisionId",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "unverified"
                },
                "uncertainty": {
                  "$ref": "#/$defs/UncertaintyRecord"
                }
              },
              "required": [
                "outcome",
                "uncertainty",
                "finishedAt"
              ],
              "type": "object"
            }
          ]
        },
        "TaskWaiting": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "approvalRequestId": {
                  "$ref": "#/$defs/ApprovalRequestId"
                },
                "reason": {
                  "const": "approval"
                }
              },
              "required": [
                "reason",
                "approvalRequestId"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "inputRequestId": {
                  "$ref": "#/$defs/InputRequestId"
                },
                "reason": {
                  "const": "input"
                }
              },
              "required": [
                "reason",
                "inputRequestId"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "reason": {
                  "const": "retry_decision"
                },
                "retryDecisionId": {
                  "$ref": "#/$defs/RetryDecisionId"
                }
              },
              "required": [
                "reason",
                "retryDecisionId"
              ],
              "type": "object"
            }
          ]
        },
        "Timestamp": {
          "format": "date-time",
          "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,9})?Z$",
          "type": "string"
        },
        "UncertaintyRecord": {
          "additionalProperties": false,
          "properties": {
            "code": {
              "maxLength": 128,
              "minLength": 1,
              "type": "string"
            },
            "message": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            },
            "possibleEffects": {
              "items": {
                "$ref": "#/$defs/TargetEffect"
              },
              "type": "array",
              "uniqueItems": true
            }
          },
          "required": [
            "code",
            "message",
            "possibleEffects"
          ],
          "type": "object"
        },
        "WorkspaceId": {
          "pattern": "^workspace_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        }
      },
      "$ref": "#/$defs/SubmitOperationResult",
      "$schema": "https://json-schema.org/draft/2020-12/schema"
    },
    "inputSchemaDigest": "60ab771045632d7cb4a29f99f43670c16ba76ca107eb54508c5ff92de2af59ce",
    "resultSchemaDigest": "3c1b7b94c9a0c75a47fc6caf75533c114d7df7e00cd5d1f1a4b5181526a75efb",
    "maxResultBytes": 262144
  },
  {
    "name": "get_case",
    "title": "Get Case",
    "description": "Read one authorized Case contract, state, count, checkpoint pointer, and snapshot.",
    "version": 1,
    "inputRoot": "GetCaseInput",
    "resultRoot": "GetCaseResult",
    "mutation": false,
    "owner": "case_do",
    "routing": "explicit_case",
    "retryClass": "read_only",
    "approvalClass": "none",
    "riskClass": "read",
    "resultBound": "page",
    "annotations": {
      "readOnlyHint": true,
      "idempotentHint": true,
      "destructiveHint": false,
      "openWorldHint": false
    },
    "inputSchema": {
      "$defs": {
        "CaseId": {
          "pattern": "^case_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "GetCaseInput": {
          "additionalProperties": false,
          "properties": {
            "caseId": {
              "$ref": "#/$defs/CaseId"
            }
          },
          "required": [
            "caseId"
          ],
          "type": "object"
        }
      },
      "$ref": "#/$defs/GetCaseInput",
      "$schema": "https://json-schema.org/draft/2020-12/schema"
    },
    "outputSchema": {
      "$defs": {
        "AcceptanceCriterion": {
          "additionalProperties": false,
          "properties": {
            "criterionId": {
              "maxLength": 128,
              "minLength": 1,
              "type": "string"
            },
            "mandatory": {
              "type": "boolean"
            },
            "statement": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            }
          },
          "required": [
            "criterionId",
            "statement",
            "mandatory"
          ],
          "type": "object"
        },
        "ActorRef": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "mcp_client"
                },
                "subjectId": {
                  "maxLength": 256,
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "kind",
                "subjectId"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "user"
                },
                "subjectId": {
                  "maxLength": 256,
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "kind",
                "subjectId"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "component": {
                  "enum": [
                    "worker",
                    "case_do",
                    "agent_do",
                    "agent"
                  ]
                },
                "kind": {
                  "const": "system"
                }
              },
              "required": [
                "kind",
                "component"
              ],
              "type": "object"
            }
          ]
        },
        "AgentId": {
          "pattern": "^agent_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "BaseReference": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "git_commit"
                },
                "objectId": {
                  "$ref": "#/$defs/GitObjectId"
                }
              },
              "required": [
                "kind",
                "objectId"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "digest": {
                  "$ref": "#/$defs/Sha256"
                },
                "kind": {
                  "const": "observation"
                }
              },
              "required": [
                "kind",
                "digest"
              ],
              "type": "object"
            }
          ]
        },
        "CancellationId": {
          "pattern": "^cancel_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "CancellationSummary": {
          "additionalProperties": false,
          "properties": {
            "cancellationId": {
              "$ref": "#/$defs/CancellationId"
            },
            "effectsObserved": {
              "items": {
                "$ref": "#/$defs/TargetEffect"
              },
              "type": "array",
              "uniqueItems": true
            },
            "reason": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            }
          },
          "required": [
            "cancellationId",
            "reason",
            "effectsObserved"
          ],
          "type": "object"
        },
        "CaseContract": {
          "additionalProperties": false,
          "properties": {
            "acceptanceCriteria": {
              "items": {
                "$ref": "#/$defs/AcceptanceCriterion"
              },
              "minItems": 1,
              "type": "array"
            },
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "constraints": {
              "items": {
                "$ref": "#/$defs/ContractClause"
              },
              "type": "array"
            },
            "contractDigest": {
              "$ref": "#/$defs/Sha256"
            },
            "createdAt": {
              "$ref": "#/$defs/Timestamp"
            },
            "createdBy": {
              "$ref": "#/$defs/ActorRef"
            },
            "nonGoals": {
              "items": {
                "$ref": "#/$defs/ContractClause"
              },
              "type": "array"
            },
            "objective": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            },
            "policyRef": {
              "$ref": "#/$defs/PolicyRef"
            },
            "predecessor": {
              "$ref": "#/$defs/PredecessorRef"
            },
            "schemaVersion": {
              "const": 1
            },
            "targetGrants": {
              "items": {
                "$ref": "#/$defs/CaseTargetGrant"
              },
              "minItems": 1,
              "type": "array"
            },
            "verificationRequirements": {
              "items": {
                "$ref": "#/$defs/VerificationRequirement"
              },
              "minItems": 1,
              "type": "array"
            }
          },
          "required": [
            "schemaVersion",
            "caseId",
            "objective",
            "acceptanceCriteria",
            "verificationRequirements",
            "nonGoals",
            "constraints",
            "targetGrants",
            "policyRef",
            "createdBy",
            "createdAt",
            "contractDigest"
          ],
          "type": "object"
        },
        "CaseId": {
          "pattern": "^case_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "CaseState": {
          "additionalProperties": false,
          "properties": {
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "caseRevision": {
              "minimum": 1,
              "type": "integer"
            },
            "eventSequence": {
              "minimum": 1,
              "type": "integer"
            },
            "schemaVersion": {
              "const": 1
            },
            "status": {
              "$ref": "#/$defs/CaseStatus"
            },
            "updatedAt": {
              "$ref": "#/$defs/Timestamp"
            }
          },
          "required": [
            "schemaVersion",
            "caseId",
            "caseRevision",
            "eventSequence",
            "status",
            "updatedAt"
          ],
          "type": "object"
        },
        "CaseStatus": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "enteredAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "kind": {
                  "const": "active"
                }
              },
              "required": [
                "kind",
                "enteredAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "detail": {
                  "maxLength": 4096,
                  "minLength": 1,
                  "type": "string"
                },
                "kind": {
                  "const": "paused"
                },
                "pausedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "reason": {
                  "enum": [
                    "manual",
                    "authority_invalidated",
                    "external_blocker"
                  ]
                }
              },
              "required": [
                "kind",
                "reason",
                "pausedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "cancellationId": {
                  "$ref": "#/$defs/CancellationId"
                },
                "kind": {
                  "const": "cancelling"
                },
                "reason": {
                  "minLength": 1,
                  "type": "string"
                },
                "requestedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "requestedBy": {
                  "$ref": "#/$defs/ActorRef"
                }
              },
              "required": [
                "kind",
                "cancellationId",
                "requestedBy",
                "requestedAt",
                "reason"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "terminal"
                },
                "terminal": {
                  "$ref": "#/$defs/CaseTerminal"
                }
              },
              "required": [
                "kind",
                "terminal"
              ],
              "type": "object"
            }
          ]
        },
        "CaseTargetGrant": {
          "additionalProperties": false,
          "properties": {
            "agentId": {
              "$ref": "#/$defs/AgentId"
            },
            "allowedEffects": {
              "items": {
                "$ref": "#/$defs/TargetEffect"
              },
              "minItems": 1,
              "type": "array",
              "uniqueItems": true
            },
            "allowedSubpaths": {
              "items": {
                "$ref": "#/$defs/RelativePath"
              },
              "minItems": 1,
              "type": "array",
              "uniqueItems": true
            },
            "grantDigest": {
              "$ref": "#/$defs/Sha256"
            },
            "grantId": {
              "$ref": "#/$defs/GrantId"
            },
            "grantedAgainst": {
              "$ref": "#/$defs/GrantedAgainst"
            },
            "rootIdentityDigest": {
              "$ref": "#/$defs/Sha256"
            },
            "schemaVersion": {
              "const": 1
            },
            "target": {
              "$ref": "#/$defs/Target"
            }
          },
          "required": [
            "schemaVersion",
            "grantId",
            "agentId",
            "target",
            "rootIdentityDigest",
            "allowedSubpaths",
            "allowedEffects",
            "grantedAgainst",
            "grantDigest"
          ],
          "type": "object"
        },
        "CaseTerminal": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "closedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "evidenceSetId": {
                  "$ref": "#/$defs/EvidenceSetId"
                },
                "outcome": {
                  "const": "completed"
                },
                "summary": {
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "outcome",
                "summary",
                "evidenceSetId",
                "closedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "closedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "failure": {
                  "$ref": "#/$defs/FailureRecord"
                },
                "outcome": {
                  "const": "failed"
                },
                "summary": {
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "outcome",
                "summary",
                "failure",
                "closedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "cancellation": {
                  "$ref": "#/$defs/CancellationSummary"
                },
                "closedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "cancelled"
                },
                "summary": {
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "outcome",
                "summary",
                "cancellation",
                "closedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "closedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "rolled_back"
                },
                "rollbackEvidenceSetId": {
                  "$ref": "#/$defs/EvidenceSetId"
                },
                "summary": {
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "outcome",
                "summary",
                "rollbackEvidenceSetId",
                "closedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "closedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "unverified"
                },
                "summary": {
                  "minLength": 1,
                  "type": "string"
                },
                "uncertainty": {
                  "$ref": "#/$defs/UncertaintyRecord"
                }
              },
              "required": [
                "outcome",
                "summary",
                "uncertainty",
                "closedAt"
              ],
              "type": "object"
            }
          ]
        },
        "CheckpointId": {
          "pattern": "^checkpoint_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "ContractClause": {
          "additionalProperties": false,
          "properties": {
            "clauseId": {
              "maxLength": 128,
              "minLength": 1,
              "type": "string"
            },
            "statement": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            }
          },
          "required": [
            "clauseId",
            "statement"
          ],
          "type": "object"
        },
        "EvidenceSetId": {
          "pattern": "^evidence_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "FailureRecord": {
          "additionalProperties": false,
          "properties": {
            "code": {
              "maxLength": 128,
              "minLength": 1,
              "type": "string"
            },
            "message": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            },
            "retryable": {
              "type": "boolean"
            }
          },
          "required": [
            "code",
            "message",
            "retryable"
          ],
          "type": "object"
        },
        "GetCaseResult": {
          "additionalProperties": false,
          "properties": {
            "contract": {
              "$ref": "#/$defs/CaseContract"
            },
            "latestCheckpointId": {
              "$ref": "#/$defs/CheckpointId"
            },
            "snapshot": {
              "$ref": "#/$defs/SnapshotV1"
            },
            "state": {
              "$ref": "#/$defs/CaseState"
            },
            "taskCount": {
              "maximum": 9007199254740991,
              "minimum": 0,
              "type": "integer"
            }
          },
          "required": [
            "contract",
            "state",
            "taskCount",
            "snapshot"
          ],
          "type": "object"
        },
        "GitObjectId": {
          "pattern": "^[0-9a-f]{40,64}$",
          "type": "string"
        },
        "GrantId": {
          "pattern": "^grant_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "GrantedAgainst": {
          "additionalProperties": false,
          "properties": {
            "baseReference": {
              "$ref": "#/$defs/BaseReference"
            },
            "projectRevision": {
              "minimum": 1,
              "type": "integer"
            },
            "workspacePolicyDigest": {
              "$ref": "#/$defs/Sha256"
            },
            "workspaceRevision": {
              "minimum": 1,
              "type": "integer"
            }
          },
          "required": [
            "workspaceRevision",
            "workspacePolicyDigest"
          ],
          "type": "object"
        },
        "PolicyRef": {
          "additionalProperties": false,
          "properties": {
            "digest": {
              "$ref": "#/$defs/Sha256"
            },
            "version": {
              "minimum": 1,
              "type": "integer"
            }
          },
          "required": [
            "version",
            "digest"
          ],
          "type": "object"
        },
        "PredecessorRef": {
          "additionalProperties": false,
          "properties": {
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "checkpointDigest": {
              "$ref": "#/$defs/Sha256"
            },
            "checkpointId": {
              "$ref": "#/$defs/CheckpointId"
            },
            "reason": {
              "enum": [
                "objective_changed",
                "target_scope_changed",
                "authority_changed",
                "policy_changed"
              ]
            }
          },
          "required": [
            "caseId",
            "checkpointId",
            "checkpointDigest",
            "reason"
          ],
          "type": "object"
        },
        "ProjectId": {
          "pattern": "^project_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "RelativePath": {
          "maxLength": 4096,
          "minLength": 1,
          "pattern": "^([^./\\\\\u0000][^/\\\\\u0000]*|\\.[^./\\\\\u0000][^/\\\\\u0000]*|\\.\\.[^/\\\\\u0000][^/\\\\\u0000]*)(/([^./\\\\\u0000][^/\\\\\u0000]*|\\.[^./\\\\\u0000][^/\\\\\u0000]*|\\.\\.[^/\\\\\u0000][^/\\\\\u0000]*))*$",
          "type": "string"
        },
        "Sha256": {
          "pattern": "^[0-9a-f]{64}$",
          "type": "string"
        },
        "SnapshotV1": {
          "additionalProperties": false,
          "properties": {
            "caseRevision": {
              "maximum": 9007199254740991,
              "minimum": 1,
              "type": "integer"
            },
            "eventSequence": {
              "maximum": 9007199254740991,
              "minimum": 0,
              "type": "integer"
            },
            "taskRevision": {
              "maximum": 9007199254740991,
              "minimum": 1,
              "type": "integer"
            }
          },
          "required": [
            "eventSequence"
          ],
          "type": "object"
        },
        "Target": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "workspace"
                },
                "workspaceId": {
                  "$ref": "#/$defs/WorkspaceId"
                }
              },
              "required": [
                "kind",
                "workspaceId"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "project"
                },
                "projectId": {
                  "$ref": "#/$defs/ProjectId"
                },
                "workspaceId": {
                  "$ref": "#/$defs/WorkspaceId"
                }
              },
              "required": [
                "kind",
                "workspaceId",
                "projectId"
              ],
              "type": "object"
            }
          ]
        },
        "TargetEffect": {
          "enum": [
            "fs.read",
            "fs.write",
            "fs.delete",
            "git.read",
            "git.write",
            "remote.read",
            "remote.write",
            "validation.execute",
            "process.execute",
            "network.use",
            "package.manage",
            "service.manage",
            "runtime.manage"
          ]
        },
        "Timestamp": {
          "format": "date-time",
          "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,9})?Z$",
          "type": "string"
        },
        "UncertaintyRecord": {
          "additionalProperties": false,
          "properties": {
            "code": {
              "maxLength": 128,
              "minLength": 1,
              "type": "string"
            },
            "message": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            },
            "possibleEffects": {
              "items": {
                "$ref": "#/$defs/TargetEffect"
              },
              "type": "array",
              "uniqueItems": true
            }
          },
          "required": [
            "code",
            "message",
            "possibleEffects"
          ],
          "type": "object"
        },
        "VerificationLayer": {
          "enum": [
            "source",
            "validation",
            "package",
            "installation",
            "runtime",
            "ingress",
            "public_mcp",
            "client",
            "rollback"
          ]
        },
        "VerificationRequirement": {
          "additionalProperties": false,
          "properties": {
            "criterionIds": {
              "items": {
                "maxLength": 128,
                "minLength": 1,
                "type": "string"
              },
              "minItems": 1,
              "type": "array",
              "uniqueItems": true
            },
            "layer": {
              "$ref": "#/$defs/VerificationLayer"
            },
            "requirementId": {
              "maxLength": 128,
              "minLength": 1,
              "type": "string"
            },
            "statement": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            }
          },
          "required": [
            "requirementId",
            "criterionIds",
            "layer",
            "statement"
          ],
          "type": "object"
        },
        "WorkspaceId": {
          "pattern": "^workspace_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        }
      },
      "$ref": "#/$defs/GetCaseResult",
      "$schema": "https://json-schema.org/draft/2020-12/schema"
    },
    "inputSchemaDigest": "bde19e51fa06464a6cb6b8f0732756afceb6d95e2af628bf2bd84f76981c83fc",
    "resultSchemaDigest": "a974e172bcc0cd64d2a758616c8bec21bcb6e8ba6da8ca176594dd270f763880",
    "maxResultBytes": 262144
  },
  {
    "name": "get_task",
    "title": "Get Task",
    "description": "Read one authorized Task, latest Attempt, outstanding request, and stable snapshot.",
    "version": 1,
    "inputRoot": "GetTaskInput",
    "resultRoot": "GetTaskResult",
    "mutation": false,
    "owner": "case_do",
    "routing": "explicit_case",
    "retryClass": "read_only",
    "approvalClass": "none",
    "riskClass": "read",
    "resultBound": "page",
    "annotations": {
      "readOnlyHint": true,
      "idempotentHint": true,
      "destructiveHint": false,
      "openWorldHint": false
    },
    "inputSchema": {
      "$defs": {
        "CaseId": {
          "pattern": "^case_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "GetTaskInput": {
          "additionalProperties": false,
          "properties": {
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "taskId": {
              "$ref": "#/$defs/TaskId"
            }
          },
          "required": [
            "caseId",
            "taskId"
          ],
          "type": "object"
        },
        "TaskId": {
          "pattern": "^task_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        }
      },
      "$ref": "#/$defs/GetTaskInput",
      "$schema": "https://json-schema.org/draft/2020-12/schema"
    },
    "outputSchema": {
      "$defs": {
        "AgentId": {
          "pattern": "^agent_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "ApprovalDecisionId": {
          "pattern": "^approval_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "ApprovalRequestId": {
          "pattern": "^approval_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "ArtifactId": {
          "pattern": "^artifact_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "ArtifactRef": {
          "additionalProperties": false,
          "properties": {
            "artifactId": {
              "$ref": "#/$defs/ArtifactId"
            },
            "bytes": {
              "minimum": 0,
              "type": "integer"
            },
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "createdAt": {
              "$ref": "#/$defs/Timestamp"
            },
            "mediaType": {
              "maxLength": 256,
              "minLength": 1,
              "type": "string"
            },
            "sha256": {
              "$ref": "#/$defs/Sha256"
            },
            "taskId": {
              "$ref": "#/$defs/TaskId"
            }
          },
          "required": [
            "artifactId",
            "caseId",
            "taskId",
            "mediaType",
            "bytes",
            "sha256",
            "createdAt"
          ],
          "type": "object"
        },
        "AttemptId": {
          "pattern": "^attempt_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "AttemptRecord": {
          "additionalProperties": false,
          "properties": {
            "agentId": {
              "$ref": "#/$defs/AgentId"
            },
            "attemptId": {
              "$ref": "#/$defs/AttemptId"
            },
            "attemptRevision": {
              "minimum": 1,
              "type": "integer"
            },
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "createdAt": {
              "$ref": "#/$defs/Timestamp"
            },
            "deadlineAt": {
              "$ref": "#/$defs/Timestamp"
            },
            "dispatchId": {
              "$ref": "#/$defs/DispatchId"
            },
            "expectedTaskRevision": {
              "minimum": 1,
              "type": "integer"
            },
            "operationInputDigest": {
              "$ref": "#/$defs/Sha256"
            },
            "ordinal": {
              "minimum": 1,
              "type": "integer"
            },
            "schemaVersion": {
              "const": 1
            },
            "status": {
              "$ref": "#/$defs/AttemptStatus"
            },
            "taskId": {
              "$ref": "#/$defs/TaskId"
            },
            "updatedAt": {
              "$ref": "#/$defs/Timestamp"
            }
          },
          "required": [
            "schemaVersion",
            "caseId",
            "taskId",
            "attemptId",
            "ordinal",
            "agentId",
            "dispatchId",
            "operationInputDigest",
            "expectedTaskRevision",
            "deadlineAt",
            "attemptRevision",
            "status",
            "createdAt",
            "updatedAt"
          ],
          "type": "object"
        },
        "AttemptStatus": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "dispatch_pending"
                }
              },
              "required": [
                "kind"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "agentEpoch": {
                  "minimum": 1,
                  "type": "integer"
                },
                "fencingToken": {
                  "maxLength": 256,
                  "minLength": 16,
                  "type": "string"
                },
                "kind": {
                  "const": "queued"
                },
                "queuedAt": {
                  "$ref": "#/$defs/Timestamp"
                }
              },
              "required": [
                "kind",
                "agentEpoch",
                "fencingToken",
                "queuedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "agentEpoch": {
                  "minimum": 1,
                  "type": "integer"
                },
                "fencingToken": {
                  "maxLength": 256,
                  "minLength": 16,
                  "type": "string"
                },
                "kind": {
                  "const": "running"
                },
                "startedAt": {
                  "$ref": "#/$defs/Timestamp"
                }
              },
              "required": [
                "kind",
                "agentEpoch",
                "fencingToken",
                "startedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "reconciling"
                },
                "reason": {
                  "enum": [
                    "dispatch_response_lost",
                    "agent_disconnected",
                    "result_response_lost",
                    "deadline_exceeded"
                  ]
                },
                "since": {
                  "$ref": "#/$defs/Timestamp"
                }
              },
              "required": [
                "kind",
                "reason",
                "since"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "cancel_requested"
                },
                "previous": {
                  "enum": [
                    "dispatch_pending",
                    "queued",
                    "running",
                    "reconciling"
                  ]
                },
                "requestedAt": {
                  "$ref": "#/$defs/Timestamp"
                }
              },
              "required": [
                "kind",
                "previous",
                "requestedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "terminal"
                },
                "terminal": {
                  "$ref": "#/$defs/AttemptTerminal"
                }
              },
              "required": [
                "kind",
                "terminal"
              ],
              "type": "object"
            }
          ]
        },
        "AttemptTerminal": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "succeeded"
                },
                "resultEnvelopeDigest": {
                  "$ref": "#/$defs/Sha256"
                }
              },
              "required": [
                "outcome",
                "resultEnvelopeDigest",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "failure": {
                  "$ref": "#/$defs/ExecutionFailure"
                },
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "failed"
                }
              },
              "required": [
                "outcome",
                "failure",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "cancellationReceiptId": {
                  "maxLength": 128,
                  "minLength": 1,
                  "type": "string"
                },
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "cancelled"
                }
              },
              "required": [
                "outcome",
                "cancellationReceiptId",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "interruption": {
                  "$ref": "#/$defs/InterruptionRecord"
                },
                "outcome": {
                  "const": "interrupted"
                },
                "retrySafety": {
                  "enum": [
                    "safe",
                    "unsafe",
                    "requires_reconciliation"
                  ]
                }
              },
              "required": [
                "outcome",
                "interruption",
                "retrySafety",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "rejected"
                },
                "rejection": {
                  "$ref": "#/$defs/ExecutionRejection"
                }
              },
              "required": [
                "outcome",
                "rejection",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "inputRequestId": {
                  "$ref": "#/$defs/InputRequestId"
                },
                "outcome": {
                  "const": "input_required"
                }
              },
              "required": [
                "outcome",
                "inputRequestId",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "unverified"
                },
                "uncertainty": {
                  "$ref": "#/$defs/UncertaintyRecord"
                }
              },
              "required": [
                "outcome",
                "uncertainty",
                "finishedAt"
              ],
              "type": "object"
            }
          ]
        },
        "CancellationId": {
          "pattern": "^cancel_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "CancellationSummary": {
          "additionalProperties": false,
          "properties": {
            "cancellationId": {
              "$ref": "#/$defs/CancellationId"
            },
            "effectsObserved": {
              "items": {
                "$ref": "#/$defs/TargetEffect"
              },
              "type": "array",
              "uniqueItems": true
            },
            "reason": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            }
          },
          "required": [
            "cancellationId",
            "reason",
            "effectsObserved"
          ],
          "type": "object"
        },
        "CaseId": {
          "pattern": "^case_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "DispatchId": {
          "pattern": "^dispatch_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "ExecutionFailure": {
          "$ref": "#/$defs/FailureRecord"
        },
        "ExecutionRejection": {
          "$ref": "#/$defs/FailureRecord"
        },
        "FailureRecord": {
          "additionalProperties": false,
          "properties": {
            "code": {
              "maxLength": 128,
              "minLength": 1,
              "type": "string"
            },
            "message": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            },
            "retryable": {
              "type": "boolean"
            }
          },
          "required": [
            "code",
            "message",
            "retryable"
          ],
          "type": "object"
        },
        "GetTaskResult": {
          "additionalProperties": false,
          "properties": {
            "attemptCount": {
              "maximum": 9007199254740991,
              "minimum": 0,
              "type": "integer"
            },
            "latestAttempt": {
              "$ref": "#/$defs/AttemptRecord"
            },
            "outstandingApprovalRequestId": {
              "$ref": "#/$defs/ApprovalRequestId"
            },
            "outstandingInputRequestId": {
              "$ref": "#/$defs/InputRequestId"
            },
            "outstandingRetryDecisionId": {
              "$ref": "#/$defs/RetryDecisionId"
            },
            "snapshot": {
              "$ref": "#/$defs/SnapshotV1"
            },
            "task": {
              "$ref": "#/$defs/TaskRecord"
            }
          },
          "required": [
            "task",
            "attemptCount",
            "snapshot"
          ],
          "type": "object"
        },
        "GrantId": {
          "pattern": "^grant_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "InputRequestId": {
          "pattern": "^input_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "InterruptionRecord": {
          "additionalProperties": false,
          "properties": {
            "code": {
              "maxLength": 128,
              "minLength": 1,
              "type": "string"
            },
            "message": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            }
          },
          "required": [
            "code",
            "message"
          ],
          "type": "object"
        },
        "JsonValue": {
          "oneOf": [
            {
              "type": "null"
            },
            {
              "type": "boolean"
            },
            {
              "maximum": 9007199254740991,
              "minimum": -9007199254740991,
              "type": "integer"
            },
            {
              "type": "string"
            },
            {
              "items": {
                "$ref": "#/$defs/JsonValue"
              },
              "type": "array"
            },
            {
              "additionalProperties": {
                "$ref": "#/$defs/JsonValue"
              },
              "type": "object"
            }
          ]
        },
        "OperationFailure": {
          "$ref": "#/$defs/FailureRecord"
        },
        "OperationInvocation": {
          "additionalProperties": false,
          "properties": {
            "arguments": {
              "$ref": "#/$defs/JsonValue"
            },
            "expectedSchemaDigest": {
              "$ref": "#/$defs/Sha256"
            },
            "id": {
              "maxLength": 128,
              "minLength": 1,
              "type": "string"
            },
            "inputDigest": {
              "$ref": "#/$defs/Sha256"
            },
            "targets": {
              "items": {
                "$ref": "#/$defs/TargetBinding"
              },
              "minItems": 1,
              "type": "array"
            },
            "version": {
              "minimum": 1,
              "type": "integer"
            }
          },
          "required": [
            "id",
            "version",
            "expectedSchemaDigest",
            "targets",
            "arguments",
            "inputDigest"
          ],
          "type": "object"
        },
        "OperationResult": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "inline"
                },
                "resultDigest": {
                  "$ref": "#/$defs/Sha256"
                },
                "value": {
                  "$ref": "#/$defs/JsonValue"
                }
              },
              "required": [
                "kind",
                "value",
                "resultDigest"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "artifacts": {
                  "items": {
                    "$ref": "#/$defs/ArtifactRef"
                  },
                  "minItems": 1,
                  "type": "array"
                },
                "kind": {
                  "const": "artifacts"
                },
                "resultDigest": {
                  "$ref": "#/$defs/Sha256"
                }
              },
              "required": [
                "kind",
                "artifacts",
                "resultDigest"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "artifacts": {
                  "items": {
                    "$ref": "#/$defs/ArtifactRef"
                  },
                  "minItems": 1,
                  "type": "array"
                },
                "kind": {
                  "const": "mixed"
                },
                "resultDigest": {
                  "$ref": "#/$defs/Sha256"
                },
                "value": {
                  "$ref": "#/$defs/JsonValue"
                }
              },
              "required": [
                "kind",
                "value",
                "artifacts",
                "resultDigest"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "none"
                },
                "resultDigest": {
                  "$ref": "#/$defs/Sha256"
                }
              },
              "required": [
                "kind",
                "resultDigest"
              ],
              "type": "object"
            }
          ]
        },
        "ProjectId": {
          "pattern": "^project_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "RequestId": {
          "pattern": "^request_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "RetryDecisionId": {
          "pattern": "^retry_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "Sha256": {
          "pattern": "^[0-9a-f]{64}$",
          "type": "string"
        },
        "SnapshotV1": {
          "additionalProperties": false,
          "properties": {
            "caseRevision": {
              "maximum": 9007199254740991,
              "minimum": 1,
              "type": "integer"
            },
            "eventSequence": {
              "maximum": 9007199254740991,
              "minimum": 0,
              "type": "integer"
            },
            "taskRevision": {
              "maximum": 9007199254740991,
              "minimum": 1,
              "type": "integer"
            }
          },
          "required": [
            "eventSequence"
          ],
          "type": "object"
        },
        "Target": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "workspace"
                },
                "workspaceId": {
                  "$ref": "#/$defs/WorkspaceId"
                }
              },
              "required": [
                "kind",
                "workspaceId"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "project"
                },
                "projectId": {
                  "$ref": "#/$defs/ProjectId"
                },
                "workspaceId": {
                  "$ref": "#/$defs/WorkspaceId"
                }
              },
              "required": [
                "kind",
                "workspaceId",
                "projectId"
              ],
              "type": "object"
            }
          ]
        },
        "TargetBinding": {
          "additionalProperties": false,
          "properties": {
            "grantId": {
              "$ref": "#/$defs/GrantId"
            },
            "resource": {
              "$ref": "#/$defs/Target"
            },
            "role": {
              "maxLength": 64,
              "minLength": 1,
              "type": "string"
            }
          },
          "required": [
            "role",
            "grantId",
            "resource"
          ],
          "type": "object"
        },
        "TargetEffect": {
          "enum": [
            "fs.read",
            "fs.write",
            "fs.delete",
            "git.read",
            "git.write",
            "remote.read",
            "remote.write",
            "validation.execute",
            "process.execute",
            "network.use",
            "package.manage",
            "service.manage",
            "runtime.manage"
          ]
        },
        "TaskId": {
          "pattern": "^task_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "TaskRecord": {
          "additionalProperties": false,
          "properties": {
            "admission": {
              "additionalProperties": false,
              "properties": {
                "admittedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "contractDigest": {
                  "$ref": "#/$defs/Sha256"
                },
                "inputDigest": {
                  "$ref": "#/$defs/Sha256"
                },
                "operationSchemaDigest": {
                  "$ref": "#/$defs/Sha256"
                },
                "requestId": {
                  "$ref": "#/$defs/RequestId"
                }
              },
              "required": [
                "requestId",
                "admittedAt",
                "contractDigest",
                "operationSchemaDigest",
                "inputDigest"
              ],
              "type": "object"
            },
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "createdAt": {
              "$ref": "#/$defs/Timestamp"
            },
            "latestAttemptId": {
              "$ref": "#/$defs/AttemptId"
            },
            "operation": {
              "$ref": "#/$defs/OperationInvocation"
            },
            "schemaVersion": {
              "const": 1
            },
            "sequence": {
              "minimum": 1,
              "type": "integer"
            },
            "status": {
              "$ref": "#/$defs/TaskStatus"
            },
            "taskId": {
              "$ref": "#/$defs/TaskId"
            },
            "taskRevision": {
              "minimum": 1,
              "type": "integer"
            },
            "updatedAt": {
              "$ref": "#/$defs/Timestamp"
            }
          },
          "required": [
            "schemaVersion",
            "caseId",
            "taskId",
            "sequence",
            "operation",
            "admission",
            "taskRevision",
            "status",
            "createdAt",
            "updatedAt"
          ],
          "type": "object"
        },
        "TaskStatus": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "waiting"
                },
                "waiting": {
                  "$ref": "#/$defs/TaskWaiting"
                }
              },
              "required": [
                "kind",
                "waiting"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "ready"
                },
                "readyAt": {
                  "$ref": "#/$defs/Timestamp"
                }
              },
              "required": [
                "kind",
                "readyAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "attemptId": {
                  "$ref": "#/$defs/AttemptId"
                },
                "kind": {
                  "const": "active"
                }
              },
              "required": [
                "kind",
                "attemptId"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "attemptId": {
                  "$ref": "#/$defs/AttemptId"
                },
                "cancellationId": {
                  "$ref": "#/$defs/CancellationId"
                },
                "kind": {
                  "const": "cancelling"
                },
                "requestedAt": {
                  "$ref": "#/$defs/Timestamp"
                }
              },
              "required": [
                "kind",
                "cancellationId",
                "requestedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "terminal"
                },
                "terminal": {
                  "$ref": "#/$defs/TaskTerminal"
                }
              },
              "required": [
                "kind",
                "terminal"
              ],
              "type": "object"
            }
          ]
        },
        "TaskTerminal": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "succeeded"
                },
                "result": {
                  "$ref": "#/$defs/OperationResult"
                }
              },
              "required": [
                "outcome",
                "result",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "failure": {
                  "$ref": "#/$defs/OperationFailure"
                },
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "failed"
                }
              },
              "required": [
                "outcome",
                "failure",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "cancellation": {
                  "$ref": "#/$defs/CancellationSummary"
                },
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "cancelled"
                }
              },
              "required": [
                "outcome",
                "cancellation",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "approvalDecisionId": {
                  "$ref": "#/$defs/ApprovalDecisionId"
                },
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "denied"
                }
              },
              "required": [
                "outcome",
                "approvalDecisionId",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "unverified"
                },
                "uncertainty": {
                  "$ref": "#/$defs/UncertaintyRecord"
                }
              },
              "required": [
                "outcome",
                "uncertainty",
                "finishedAt"
              ],
              "type": "object"
            }
          ]
        },
        "TaskWaiting": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "approvalRequestId": {
                  "$ref": "#/$defs/ApprovalRequestId"
                },
                "reason": {
                  "const": "approval"
                }
              },
              "required": [
                "reason",
                "approvalRequestId"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "inputRequestId": {
                  "$ref": "#/$defs/InputRequestId"
                },
                "reason": {
                  "const": "input"
                }
              },
              "required": [
                "reason",
                "inputRequestId"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "reason": {
                  "const": "retry_decision"
                },
                "retryDecisionId": {
                  "$ref": "#/$defs/RetryDecisionId"
                }
              },
              "required": [
                "reason",
                "retryDecisionId"
              ],
              "type": "object"
            }
          ]
        },
        "Timestamp": {
          "format": "date-time",
          "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,9})?Z$",
          "type": "string"
        },
        "UncertaintyRecord": {
          "additionalProperties": false,
          "properties": {
            "code": {
              "maxLength": 128,
              "minLength": 1,
              "type": "string"
            },
            "message": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            },
            "possibleEffects": {
              "items": {
                "$ref": "#/$defs/TargetEffect"
              },
              "type": "array",
              "uniqueItems": true
            }
          },
          "required": [
            "code",
            "message",
            "possibleEffects"
          ],
          "type": "object"
        },
        "WorkspaceId": {
          "pattern": "^workspace_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        }
      },
      "$ref": "#/$defs/GetTaskResult",
      "$schema": "https://json-schema.org/draft/2020-12/schema"
    },
    "inputSchemaDigest": "5dc391f6a89accafa62cf4aa787669edd14b350407c5027f4aef699466204631",
    "resultSchemaDigest": "e9b5c64934eca1d07e7bfb69066279947fb382893804e7920202ff753acf53b2",
    "maxResultBytes": 262144
  },
  {
    "name": "control_case",
    "title": "Control Case",
    "description": "Apply one revision-bound pause, resume, or checkpoint Case control mutation.",
    "version": 1,
    "inputRoot": "ControlCaseInput",
    "resultRoot": "ControlCaseResult",
    "mutation": true,
    "owner": "case_do",
    "routing": "explicit_case",
    "retryClass": "deduplicated",
    "approvalClass": "policy",
    "riskClass": "control",
    "resultBound": "mutation",
    "annotations": {
      "readOnlyHint": false,
      "idempotentHint": true,
      "destructiveHint": false,
      "openWorldHint": false
    },
    "inputSchema": {
      "$defs": {
        "ArtifactId": {
          "pattern": "^artifact_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "CaseId": {
          "pattern": "^case_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "ControlCaseInput": {
          "additionalProperties": false,
          "properties": {
            "action": {
              "oneOf": [
                {
                  "additionalProperties": false,
                  "properties": {
                    "detail": {
                      "maxLength": 4096,
                      "minLength": 1,
                      "type": "string"
                    },
                    "kind": {
                      "const": "pause"
                    },
                    "reason": {
                      "enum": [
                        "manual"
                      ]
                    }
                  },
                  "required": [
                    "kind",
                    "reason"
                  ],
                  "type": "object"
                },
                {
                  "additionalProperties": false,
                  "properties": {
                    "kind": {
                      "const": "resume"
                    }
                  },
                  "required": [
                    "kind"
                  ],
                  "type": "object"
                },
                {
                  "additionalProperties": false,
                  "properties": {
                    "completedTaskIds": {
                      "items": {
                        "$ref": "#/$defs/TaskId"
                      },
                      "type": "array"
                    },
                    "evidenceRefs": {
                      "items": {
                        "$ref": "#/$defs/EvidenceRef"
                      },
                      "type": "array"
                    },
                    "kind": {
                      "const": "checkpoint"
                    },
                    "pendingDecisionIds": {
                      "items": {
                        "maxLength": 128,
                        "minLength": 1,
                        "type": "string"
                      },
                      "type": "array"
                    },
                    "summary": {
                      "maxLength": 4096,
                      "minLength": 1,
                      "type": "string"
                    }
                  },
                  "required": [
                    "kind",
                    "summary",
                    "completedTaskIds",
                    "pendingDecisionIds",
                    "evidenceRefs"
                  ],
                  "type": "object"
                }
              ]
            },
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "expectedCaseRevision": {
              "minimum": 1,
              "type": "integer"
            },
            "requestId": {
              "$ref": "#/$defs/RequestId"
            }
          },
          "required": [
            "requestId",
            "caseId",
            "expectedCaseRevision",
            "action"
          ],
          "type": "object"
        },
        "EvidenceRef": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "task_result"
                },
                "resultDigest": {
                  "$ref": "#/$defs/Sha256"
                },
                "taskId": {
                  "$ref": "#/$defs/TaskId"
                }
              },
              "required": [
                "kind",
                "taskId",
                "resultDigest"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "artifactId": {
                  "$ref": "#/$defs/ArtifactId"
                },
                "kind": {
                  "const": "artifact"
                },
                "sha256": {
                  "$ref": "#/$defs/Sha256"
                }
              },
              "required": [
                "kind",
                "artifactId",
                "sha256"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "digest": {
                  "$ref": "#/$defs/Sha256"
                },
                "kind": {
                  "const": "observation"
                },
                "layer": {
                  "$ref": "#/$defs/VerificationLayer"
                }
              },
              "required": [
                "kind",
                "layer",
                "digest"
              ],
              "type": "object"
            }
          ]
        },
        "RequestId": {
          "pattern": "^request_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "Sha256": {
          "pattern": "^[0-9a-f]{64}$",
          "type": "string"
        },
        "TaskId": {
          "pattern": "^task_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "VerificationLayer": {
          "enum": [
            "source",
            "validation",
            "package",
            "installation",
            "runtime",
            "ingress",
            "public_mcp",
            "client",
            "rollback"
          ]
        }
      },
      "$ref": "#/$defs/ControlCaseInput",
      "$schema": "https://json-schema.org/draft/2020-12/schema"
    },
    "outputSchema": {
      "$defs": {
        "ActorRef": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "mcp_client"
                },
                "subjectId": {
                  "maxLength": 256,
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "kind",
                "subjectId"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "user"
                },
                "subjectId": {
                  "maxLength": 256,
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "kind",
                "subjectId"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "component": {
                  "enum": [
                    "worker",
                    "case_do",
                    "agent_do",
                    "agent"
                  ]
                },
                "kind": {
                  "const": "system"
                }
              },
              "required": [
                "kind",
                "component"
              ],
              "type": "object"
            }
          ]
        },
        "CancellationId": {
          "pattern": "^cancel_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "CancellationSummary": {
          "additionalProperties": false,
          "properties": {
            "cancellationId": {
              "$ref": "#/$defs/CancellationId"
            },
            "effectsObserved": {
              "items": {
                "$ref": "#/$defs/TargetEffect"
              },
              "type": "array",
              "uniqueItems": true
            },
            "reason": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            }
          },
          "required": [
            "cancellationId",
            "reason",
            "effectsObserved"
          ],
          "type": "object"
        },
        "CaseId": {
          "pattern": "^case_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "CaseMutationResultV1": {
          "additionalProperties": false,
          "properties": {
            "accepted": {
              "const": true
            },
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "committedCaseRevision": {
              "maximum": 9007199254740991,
              "minimum": 1,
              "type": "integer"
            },
            "committedEventSequence": {
              "maximum": 9007199254740991,
              "minimum": 0,
              "type": "integer"
            },
            "deduplicated": {
              "type": "boolean"
            },
            "requestId": {
              "$ref": "#/$defs/RequestId"
            },
            "value": {
              "$ref": "#/$defs/CaseState"
            }
          },
          "required": [
            "accepted",
            "deduplicated",
            "requestId",
            "caseId",
            "committedCaseRevision",
            "committedEventSequence",
            "value"
          ],
          "type": "object"
        },
        "CaseState": {
          "additionalProperties": false,
          "properties": {
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "caseRevision": {
              "minimum": 1,
              "type": "integer"
            },
            "eventSequence": {
              "minimum": 1,
              "type": "integer"
            },
            "schemaVersion": {
              "const": 1
            },
            "status": {
              "$ref": "#/$defs/CaseStatus"
            },
            "updatedAt": {
              "$ref": "#/$defs/Timestamp"
            }
          },
          "required": [
            "schemaVersion",
            "caseId",
            "caseRevision",
            "eventSequence",
            "status",
            "updatedAt"
          ],
          "type": "object"
        },
        "CaseStatus": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "enteredAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "kind": {
                  "const": "active"
                }
              },
              "required": [
                "kind",
                "enteredAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "detail": {
                  "maxLength": 4096,
                  "minLength": 1,
                  "type": "string"
                },
                "kind": {
                  "const": "paused"
                },
                "pausedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "reason": {
                  "enum": [
                    "manual",
                    "authority_invalidated",
                    "external_blocker"
                  ]
                }
              },
              "required": [
                "kind",
                "reason",
                "pausedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "cancellationId": {
                  "$ref": "#/$defs/CancellationId"
                },
                "kind": {
                  "const": "cancelling"
                },
                "reason": {
                  "minLength": 1,
                  "type": "string"
                },
                "requestedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "requestedBy": {
                  "$ref": "#/$defs/ActorRef"
                }
              },
              "required": [
                "kind",
                "cancellationId",
                "requestedBy",
                "requestedAt",
                "reason"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "terminal"
                },
                "terminal": {
                  "$ref": "#/$defs/CaseTerminal"
                }
              },
              "required": [
                "kind",
                "terminal"
              ],
              "type": "object"
            }
          ]
        },
        "CaseTerminal": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "closedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "evidenceSetId": {
                  "$ref": "#/$defs/EvidenceSetId"
                },
                "outcome": {
                  "const": "completed"
                },
                "summary": {
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "outcome",
                "summary",
                "evidenceSetId",
                "closedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "closedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "failure": {
                  "$ref": "#/$defs/FailureRecord"
                },
                "outcome": {
                  "const": "failed"
                },
                "summary": {
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "outcome",
                "summary",
                "failure",
                "closedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "cancellation": {
                  "$ref": "#/$defs/CancellationSummary"
                },
                "closedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "cancelled"
                },
                "summary": {
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "outcome",
                "summary",
                "cancellation",
                "closedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "closedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "rolled_back"
                },
                "rollbackEvidenceSetId": {
                  "$ref": "#/$defs/EvidenceSetId"
                },
                "summary": {
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "outcome",
                "summary",
                "rollbackEvidenceSetId",
                "closedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "closedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "unverified"
                },
                "summary": {
                  "minLength": 1,
                  "type": "string"
                },
                "uncertainty": {
                  "$ref": "#/$defs/UncertaintyRecord"
                }
              },
              "required": [
                "outcome",
                "summary",
                "uncertainty",
                "closedAt"
              ],
              "type": "object"
            }
          ]
        },
        "ControlCaseResult": {
          "$ref": "#/$defs/CaseMutationResultV1"
        },
        "EvidenceSetId": {
          "pattern": "^evidence_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "FailureRecord": {
          "additionalProperties": false,
          "properties": {
            "code": {
              "maxLength": 128,
              "minLength": 1,
              "type": "string"
            },
            "message": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            },
            "retryable": {
              "type": "boolean"
            }
          },
          "required": [
            "code",
            "message",
            "retryable"
          ],
          "type": "object"
        },
        "RequestId": {
          "pattern": "^request_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "TargetEffect": {
          "enum": [
            "fs.read",
            "fs.write",
            "fs.delete",
            "git.read",
            "git.write",
            "remote.read",
            "remote.write",
            "validation.execute",
            "process.execute",
            "network.use",
            "package.manage",
            "service.manage",
            "runtime.manage"
          ]
        },
        "Timestamp": {
          "format": "date-time",
          "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,9})?Z$",
          "type": "string"
        },
        "UncertaintyRecord": {
          "additionalProperties": false,
          "properties": {
            "code": {
              "maxLength": 128,
              "minLength": 1,
              "type": "string"
            },
            "message": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            },
            "possibleEffects": {
              "items": {
                "$ref": "#/$defs/TargetEffect"
              },
              "type": "array",
              "uniqueItems": true
            }
          },
          "required": [
            "code",
            "message",
            "possibleEffects"
          ],
          "type": "object"
        }
      },
      "$ref": "#/$defs/ControlCaseResult",
      "$schema": "https://json-schema.org/draft/2020-12/schema"
    },
    "inputSchemaDigest": "c9daac89b5a25938068028d9732f4ebeae91e4649ee843ae546406b54b1cac7f",
    "resultSchemaDigest": "f965e7fc04ed7a88ab07129a4d8678ef619d083ce47b0be5c69872f646854246",
    "maxResultBytes": 262144
  },
  {
    "name": "finish_case",
    "title": "Finish Case",
    "description": "Commit one evidence-gated terminal Case outcome.",
    "version": 1,
    "inputRoot": "FinishCaseInput",
    "resultRoot": "FinishCaseResult",
    "mutation": true,
    "owner": "case_do",
    "routing": "explicit_case",
    "retryClass": "deduplicated",
    "approvalClass": "policy",
    "riskClass": "destructive",
    "resultBound": "mutation",
    "annotations": {
      "readOnlyHint": false,
      "idempotentHint": true,
      "destructiveHint": true,
      "openWorldHint": false
    },
    "inputSchema": {
      "$defs": {
        "CaseId": {
          "pattern": "^case_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "EvidenceSetId": {
          "pattern": "^evidence_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "FailureRecord": {
          "additionalProperties": false,
          "properties": {
            "code": {
              "maxLength": 128,
              "minLength": 1,
              "type": "string"
            },
            "message": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            },
            "retryable": {
              "type": "boolean"
            }
          },
          "required": [
            "code",
            "message",
            "retryable"
          ],
          "type": "object"
        },
        "FinishCaseInput": {
          "additionalProperties": false,
          "properties": {
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "expectedCaseRevision": {
              "minimum": 1,
              "type": "integer"
            },
            "requestId": {
              "$ref": "#/$defs/RequestId"
            },
            "terminal": {
              "oneOf": [
                {
                  "additionalProperties": false,
                  "properties": {
                    "evidenceSetId": {
                      "$ref": "#/$defs/EvidenceSetId"
                    },
                    "outcome": {
                      "const": "completed"
                    },
                    "summary": {
                      "maxLength": 4096,
                      "minLength": 1,
                      "type": "string"
                    }
                  },
                  "required": [
                    "outcome",
                    "summary",
                    "evidenceSetId"
                  ],
                  "type": "object"
                },
                {
                  "additionalProperties": false,
                  "properties": {
                    "failure": {
                      "$ref": "#/$defs/FailureRecord"
                    },
                    "outcome": {
                      "const": "failed"
                    },
                    "summary": {
                      "maxLength": 4096,
                      "minLength": 1,
                      "type": "string"
                    }
                  },
                  "required": [
                    "outcome",
                    "summary",
                    "failure"
                  ],
                  "type": "object"
                },
                {
                  "additionalProperties": false,
                  "properties": {
                    "outcome": {
                      "const": "rolled_back"
                    },
                    "rollbackEvidenceSetId": {
                      "$ref": "#/$defs/EvidenceSetId"
                    },
                    "summary": {
                      "maxLength": 4096,
                      "minLength": 1,
                      "type": "string"
                    }
                  },
                  "required": [
                    "outcome",
                    "summary",
                    "rollbackEvidenceSetId"
                  ],
                  "type": "object"
                },
                {
                  "additionalProperties": false,
                  "properties": {
                    "outcome": {
                      "const": "unverified"
                    },
                    "summary": {
                      "maxLength": 4096,
                      "minLength": 1,
                      "type": "string"
                    },
                    "uncertainty": {
                      "$ref": "#/$defs/UncertaintyRecord"
                    }
                  },
                  "required": [
                    "outcome",
                    "summary",
                    "uncertainty"
                  ],
                  "type": "object"
                }
              ]
            }
          },
          "required": [
            "requestId",
            "caseId",
            "expectedCaseRevision",
            "terminal"
          ],
          "type": "object"
        },
        "RequestId": {
          "pattern": "^request_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "TargetEffect": {
          "enum": [
            "fs.read",
            "fs.write",
            "fs.delete",
            "git.read",
            "git.write",
            "remote.read",
            "remote.write",
            "validation.execute",
            "process.execute",
            "network.use",
            "package.manage",
            "service.manage",
            "runtime.manage"
          ]
        },
        "UncertaintyRecord": {
          "additionalProperties": false,
          "properties": {
            "code": {
              "maxLength": 128,
              "minLength": 1,
              "type": "string"
            },
            "message": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            },
            "possibleEffects": {
              "items": {
                "$ref": "#/$defs/TargetEffect"
              },
              "type": "array",
              "uniqueItems": true
            }
          },
          "required": [
            "code",
            "message",
            "possibleEffects"
          ],
          "type": "object"
        }
      },
      "$ref": "#/$defs/FinishCaseInput",
      "$schema": "https://json-schema.org/draft/2020-12/schema"
    },
    "outputSchema": {
      "$defs": {
        "ActorRef": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "mcp_client"
                },
                "subjectId": {
                  "maxLength": 256,
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "kind",
                "subjectId"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "user"
                },
                "subjectId": {
                  "maxLength": 256,
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "kind",
                "subjectId"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "component": {
                  "enum": [
                    "worker",
                    "case_do",
                    "agent_do",
                    "agent"
                  ]
                },
                "kind": {
                  "const": "system"
                }
              },
              "required": [
                "kind",
                "component"
              ],
              "type": "object"
            }
          ]
        },
        "CancellationId": {
          "pattern": "^cancel_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "CancellationSummary": {
          "additionalProperties": false,
          "properties": {
            "cancellationId": {
              "$ref": "#/$defs/CancellationId"
            },
            "effectsObserved": {
              "items": {
                "$ref": "#/$defs/TargetEffect"
              },
              "type": "array",
              "uniqueItems": true
            },
            "reason": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            }
          },
          "required": [
            "cancellationId",
            "reason",
            "effectsObserved"
          ],
          "type": "object"
        },
        "CaseId": {
          "pattern": "^case_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "CaseMutationResultV1": {
          "additionalProperties": false,
          "properties": {
            "accepted": {
              "const": true
            },
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "committedCaseRevision": {
              "maximum": 9007199254740991,
              "minimum": 1,
              "type": "integer"
            },
            "committedEventSequence": {
              "maximum": 9007199254740991,
              "minimum": 0,
              "type": "integer"
            },
            "deduplicated": {
              "type": "boolean"
            },
            "requestId": {
              "$ref": "#/$defs/RequestId"
            },
            "value": {
              "$ref": "#/$defs/CaseState"
            }
          },
          "required": [
            "accepted",
            "deduplicated",
            "requestId",
            "caseId",
            "committedCaseRevision",
            "committedEventSequence",
            "value"
          ],
          "type": "object"
        },
        "CaseState": {
          "additionalProperties": false,
          "properties": {
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "caseRevision": {
              "minimum": 1,
              "type": "integer"
            },
            "eventSequence": {
              "minimum": 1,
              "type": "integer"
            },
            "schemaVersion": {
              "const": 1
            },
            "status": {
              "$ref": "#/$defs/CaseStatus"
            },
            "updatedAt": {
              "$ref": "#/$defs/Timestamp"
            }
          },
          "required": [
            "schemaVersion",
            "caseId",
            "caseRevision",
            "eventSequence",
            "status",
            "updatedAt"
          ],
          "type": "object"
        },
        "CaseStatus": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "enteredAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "kind": {
                  "const": "active"
                }
              },
              "required": [
                "kind",
                "enteredAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "detail": {
                  "maxLength": 4096,
                  "minLength": 1,
                  "type": "string"
                },
                "kind": {
                  "const": "paused"
                },
                "pausedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "reason": {
                  "enum": [
                    "manual",
                    "authority_invalidated",
                    "external_blocker"
                  ]
                }
              },
              "required": [
                "kind",
                "reason",
                "pausedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "cancellationId": {
                  "$ref": "#/$defs/CancellationId"
                },
                "kind": {
                  "const": "cancelling"
                },
                "reason": {
                  "minLength": 1,
                  "type": "string"
                },
                "requestedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "requestedBy": {
                  "$ref": "#/$defs/ActorRef"
                }
              },
              "required": [
                "kind",
                "cancellationId",
                "requestedBy",
                "requestedAt",
                "reason"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "terminal"
                },
                "terminal": {
                  "$ref": "#/$defs/CaseTerminal"
                }
              },
              "required": [
                "kind",
                "terminal"
              ],
              "type": "object"
            }
          ]
        },
        "CaseTerminal": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "closedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "evidenceSetId": {
                  "$ref": "#/$defs/EvidenceSetId"
                },
                "outcome": {
                  "const": "completed"
                },
                "summary": {
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "outcome",
                "summary",
                "evidenceSetId",
                "closedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "closedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "failure": {
                  "$ref": "#/$defs/FailureRecord"
                },
                "outcome": {
                  "const": "failed"
                },
                "summary": {
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "outcome",
                "summary",
                "failure",
                "closedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "cancellation": {
                  "$ref": "#/$defs/CancellationSummary"
                },
                "closedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "cancelled"
                },
                "summary": {
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "outcome",
                "summary",
                "cancellation",
                "closedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "closedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "rolled_back"
                },
                "rollbackEvidenceSetId": {
                  "$ref": "#/$defs/EvidenceSetId"
                },
                "summary": {
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "outcome",
                "summary",
                "rollbackEvidenceSetId",
                "closedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "closedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "unverified"
                },
                "summary": {
                  "minLength": 1,
                  "type": "string"
                },
                "uncertainty": {
                  "$ref": "#/$defs/UncertaintyRecord"
                }
              },
              "required": [
                "outcome",
                "summary",
                "uncertainty",
                "closedAt"
              ],
              "type": "object"
            }
          ]
        },
        "EvidenceSetId": {
          "pattern": "^evidence_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "FailureRecord": {
          "additionalProperties": false,
          "properties": {
            "code": {
              "maxLength": 128,
              "minLength": 1,
              "type": "string"
            },
            "message": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            },
            "retryable": {
              "type": "boolean"
            }
          },
          "required": [
            "code",
            "message",
            "retryable"
          ],
          "type": "object"
        },
        "FinishCaseResult": {
          "$ref": "#/$defs/CaseMutationResultV1"
        },
        "RequestId": {
          "pattern": "^request_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "TargetEffect": {
          "enum": [
            "fs.read",
            "fs.write",
            "fs.delete",
            "git.read",
            "git.write",
            "remote.read",
            "remote.write",
            "validation.execute",
            "process.execute",
            "network.use",
            "package.manage",
            "service.manage",
            "runtime.manage"
          ]
        },
        "Timestamp": {
          "format": "date-time",
          "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,9})?Z$",
          "type": "string"
        },
        "UncertaintyRecord": {
          "additionalProperties": false,
          "properties": {
            "code": {
              "maxLength": 128,
              "minLength": 1,
              "type": "string"
            },
            "message": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            },
            "possibleEffects": {
              "items": {
                "$ref": "#/$defs/TargetEffect"
              },
              "type": "array",
              "uniqueItems": true
            }
          },
          "required": [
            "code",
            "message",
            "possibleEffects"
          ],
          "type": "object"
        }
      },
      "$ref": "#/$defs/FinishCaseResult",
      "$schema": "https://json-schema.org/draft/2020-12/schema"
    },
    "inputSchemaDigest": "b7efe3c45a85b46762ed86b3f53622378451bc87a03d0806b0435e0449f775da",
    "resultSchemaDigest": "56606fe0bf1ecbb99e37cf655ab8892c47d94ad22070522f690a8baf41538eed",
    "maxResultBytes": 262144
  },
  {
    "name": "cancel_case",
    "title": "Cancel Case",
    "description": "Record Case cancellation intent and revision-bound reconciliation state.",
    "version": 1,
    "inputRoot": "CancelCaseInput",
    "resultRoot": "CancelCaseResult",
    "mutation": true,
    "owner": "case_do",
    "routing": "explicit_case",
    "retryClass": "deduplicated",
    "approvalClass": "policy",
    "riskClass": "destructive",
    "resultBound": "mutation",
    "annotations": {
      "readOnlyHint": false,
      "idempotentHint": true,
      "destructiveHint": true,
      "openWorldHint": false
    },
    "inputSchema": {
      "$defs": {
        "CancelCaseInput": {
          "additionalProperties": false,
          "properties": {
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "expectedCaseRevision": {
              "minimum": 1,
              "type": "integer"
            },
            "reason": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            },
            "requestId": {
              "$ref": "#/$defs/RequestId"
            }
          },
          "required": [
            "requestId",
            "caseId",
            "expectedCaseRevision",
            "reason"
          ],
          "type": "object"
        },
        "CaseId": {
          "pattern": "^case_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "RequestId": {
          "pattern": "^request_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        }
      },
      "$ref": "#/$defs/CancelCaseInput",
      "$schema": "https://json-schema.org/draft/2020-12/schema"
    },
    "outputSchema": {
      "$defs": {
        "ActorRef": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "mcp_client"
                },
                "subjectId": {
                  "maxLength": 256,
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "kind",
                "subjectId"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "user"
                },
                "subjectId": {
                  "maxLength": 256,
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "kind",
                "subjectId"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "component": {
                  "enum": [
                    "worker",
                    "case_do",
                    "agent_do",
                    "agent"
                  ]
                },
                "kind": {
                  "const": "system"
                }
              },
              "required": [
                "kind",
                "component"
              ],
              "type": "object"
            }
          ]
        },
        "CancelCaseResult": {
          "$ref": "#/$defs/CaseMutationResultV1"
        },
        "CancellationId": {
          "pattern": "^cancel_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "CancellationSummary": {
          "additionalProperties": false,
          "properties": {
            "cancellationId": {
              "$ref": "#/$defs/CancellationId"
            },
            "effectsObserved": {
              "items": {
                "$ref": "#/$defs/TargetEffect"
              },
              "type": "array",
              "uniqueItems": true
            },
            "reason": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            }
          },
          "required": [
            "cancellationId",
            "reason",
            "effectsObserved"
          ],
          "type": "object"
        },
        "CaseId": {
          "pattern": "^case_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "CaseMutationResultV1": {
          "additionalProperties": false,
          "properties": {
            "accepted": {
              "const": true
            },
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "committedCaseRevision": {
              "maximum": 9007199254740991,
              "minimum": 1,
              "type": "integer"
            },
            "committedEventSequence": {
              "maximum": 9007199254740991,
              "minimum": 0,
              "type": "integer"
            },
            "deduplicated": {
              "type": "boolean"
            },
            "requestId": {
              "$ref": "#/$defs/RequestId"
            },
            "value": {
              "$ref": "#/$defs/CaseState"
            }
          },
          "required": [
            "accepted",
            "deduplicated",
            "requestId",
            "caseId",
            "committedCaseRevision",
            "committedEventSequence",
            "value"
          ],
          "type": "object"
        },
        "CaseState": {
          "additionalProperties": false,
          "properties": {
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "caseRevision": {
              "minimum": 1,
              "type": "integer"
            },
            "eventSequence": {
              "minimum": 1,
              "type": "integer"
            },
            "schemaVersion": {
              "const": 1
            },
            "status": {
              "$ref": "#/$defs/CaseStatus"
            },
            "updatedAt": {
              "$ref": "#/$defs/Timestamp"
            }
          },
          "required": [
            "schemaVersion",
            "caseId",
            "caseRevision",
            "eventSequence",
            "status",
            "updatedAt"
          ],
          "type": "object"
        },
        "CaseStatus": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "enteredAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "kind": {
                  "const": "active"
                }
              },
              "required": [
                "kind",
                "enteredAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "detail": {
                  "maxLength": 4096,
                  "minLength": 1,
                  "type": "string"
                },
                "kind": {
                  "const": "paused"
                },
                "pausedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "reason": {
                  "enum": [
                    "manual",
                    "authority_invalidated",
                    "external_blocker"
                  ]
                }
              },
              "required": [
                "kind",
                "reason",
                "pausedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "cancellationId": {
                  "$ref": "#/$defs/CancellationId"
                },
                "kind": {
                  "const": "cancelling"
                },
                "reason": {
                  "minLength": 1,
                  "type": "string"
                },
                "requestedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "requestedBy": {
                  "$ref": "#/$defs/ActorRef"
                }
              },
              "required": [
                "kind",
                "cancellationId",
                "requestedBy",
                "requestedAt",
                "reason"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "terminal"
                },
                "terminal": {
                  "$ref": "#/$defs/CaseTerminal"
                }
              },
              "required": [
                "kind",
                "terminal"
              ],
              "type": "object"
            }
          ]
        },
        "CaseTerminal": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "closedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "evidenceSetId": {
                  "$ref": "#/$defs/EvidenceSetId"
                },
                "outcome": {
                  "const": "completed"
                },
                "summary": {
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "outcome",
                "summary",
                "evidenceSetId",
                "closedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "closedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "failure": {
                  "$ref": "#/$defs/FailureRecord"
                },
                "outcome": {
                  "const": "failed"
                },
                "summary": {
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "outcome",
                "summary",
                "failure",
                "closedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "cancellation": {
                  "$ref": "#/$defs/CancellationSummary"
                },
                "closedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "cancelled"
                },
                "summary": {
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "outcome",
                "summary",
                "cancellation",
                "closedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "closedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "rolled_back"
                },
                "rollbackEvidenceSetId": {
                  "$ref": "#/$defs/EvidenceSetId"
                },
                "summary": {
                  "minLength": 1,
                  "type": "string"
                }
              },
              "required": [
                "outcome",
                "summary",
                "rollbackEvidenceSetId",
                "closedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "closedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "unverified"
                },
                "summary": {
                  "minLength": 1,
                  "type": "string"
                },
                "uncertainty": {
                  "$ref": "#/$defs/UncertaintyRecord"
                }
              },
              "required": [
                "outcome",
                "summary",
                "uncertainty",
                "closedAt"
              ],
              "type": "object"
            }
          ]
        },
        "EvidenceSetId": {
          "pattern": "^evidence_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "FailureRecord": {
          "additionalProperties": false,
          "properties": {
            "code": {
              "maxLength": 128,
              "minLength": 1,
              "type": "string"
            },
            "message": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            },
            "retryable": {
              "type": "boolean"
            }
          },
          "required": [
            "code",
            "message",
            "retryable"
          ],
          "type": "object"
        },
        "RequestId": {
          "pattern": "^request_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "TargetEffect": {
          "enum": [
            "fs.read",
            "fs.write",
            "fs.delete",
            "git.read",
            "git.write",
            "remote.read",
            "remote.write",
            "validation.execute",
            "process.execute",
            "network.use",
            "package.manage",
            "service.manage",
            "runtime.manage"
          ]
        },
        "Timestamp": {
          "format": "date-time",
          "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,9})?Z$",
          "type": "string"
        },
        "UncertaintyRecord": {
          "additionalProperties": false,
          "properties": {
            "code": {
              "maxLength": 128,
              "minLength": 1,
              "type": "string"
            },
            "message": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            },
            "possibleEffects": {
              "items": {
                "$ref": "#/$defs/TargetEffect"
              },
              "type": "array",
              "uniqueItems": true
            }
          },
          "required": [
            "code",
            "message",
            "possibleEffects"
          ],
          "type": "object"
        }
      },
      "$ref": "#/$defs/CancelCaseResult",
      "$schema": "https://json-schema.org/draft/2020-12/schema"
    },
    "inputSchemaDigest": "216da1cde58d2545cfa01430257887d01e56c51511fb58bf1dd17c9202f8cccb",
    "resultSchemaDigest": "be0a09257cedcce8fe54e47f07c87b8dd607952fddcecf365d64155f5bb1bfad",
    "maxResultBytes": 262144
  },
  {
    "name": "control_task",
    "title": "Control Task",
    "description": "Resolve one approval, input, or retry decision for an authorized Task.",
    "version": 1,
    "inputRoot": "ControlTaskInput",
    "resultRoot": "ControlTaskResult",
    "mutation": true,
    "owner": "case_do",
    "routing": "explicit_case",
    "retryClass": "deduplicated",
    "approvalClass": "policy",
    "riskClass": "control",
    "resultBound": "mutation",
    "annotations": {
      "readOnlyHint": false,
      "idempotentHint": true,
      "destructiveHint": false,
      "openWorldHint": false
    },
    "inputSchema": {
      "$defs": {
        "ApprovalRequestId": {
          "pattern": "^approval_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "CaseId": {
          "pattern": "^case_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "ControlTaskInput": {
          "additionalProperties": false,
          "properties": {
            "action": {
              "oneOf": [
                {
                  "additionalProperties": false,
                  "properties": {
                    "approvalRequestId": {
                      "$ref": "#/$defs/ApprovalRequestId"
                    },
                    "evidenceDigest": {
                      "$ref": "#/$defs/Sha256"
                    },
                    "kind": {
                      "const": "approve"
                    }
                  },
                  "required": [
                    "kind",
                    "approvalRequestId",
                    "evidenceDigest"
                  ],
                  "type": "object"
                },
                {
                  "additionalProperties": false,
                  "properties": {
                    "approvalRequestId": {
                      "$ref": "#/$defs/ApprovalRequestId"
                    },
                    "kind": {
                      "const": "deny"
                    },
                    "reason": {
                      "maxLength": 4096,
                      "minLength": 1,
                      "type": "string"
                    }
                  },
                  "required": [
                    "kind",
                    "approvalRequestId",
                    "reason"
                  ],
                  "type": "object"
                },
                {
                  "additionalProperties": false,
                  "properties": {
                    "inputRequestId": {
                      "$ref": "#/$defs/InputRequestId"
                    },
                    "kind": {
                      "const": "provide_input"
                    },
                    "value": {
                      "$ref": "#/$defs/JsonValue"
                    }
                  },
                  "required": [
                    "kind",
                    "inputRequestId",
                    "value"
                  ],
                  "type": "object"
                },
                {
                  "additionalProperties": false,
                  "properties": {
                    "kind": {
                      "const": "authorize_retry"
                    },
                    "retryDecisionId": {
                      "$ref": "#/$defs/RetryDecisionId"
                    }
                  },
                  "required": [
                    "kind",
                    "retryDecisionId"
                  ],
                  "type": "object"
                },
                {
                  "additionalProperties": false,
                  "properties": {
                    "kind": {
                      "const": "decline_retry"
                    },
                    "retryDecisionId": {
                      "$ref": "#/$defs/RetryDecisionId"
                    },
                    "terminal": {
                      "enum": [
                        "cancelled",
                        "unverified"
                      ]
                    }
                  },
                  "required": [
                    "kind",
                    "retryDecisionId",
                    "terminal"
                  ],
                  "type": "object"
                }
              ]
            },
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "expectedTaskRevision": {
              "minimum": 1,
              "type": "integer"
            },
            "requestId": {
              "$ref": "#/$defs/RequestId"
            },
            "taskId": {
              "$ref": "#/$defs/TaskId"
            }
          },
          "required": [
            "requestId",
            "caseId",
            "taskId",
            "expectedTaskRevision",
            "action"
          ],
          "type": "object"
        },
        "InputRequestId": {
          "pattern": "^input_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "JsonValue": {
          "oneOf": [
            {
              "type": "null"
            },
            {
              "type": "boolean"
            },
            {
              "maximum": 9007199254740991,
              "minimum": -9007199254740991,
              "type": "integer"
            },
            {
              "type": "string"
            },
            {
              "items": {
                "$ref": "#/$defs/JsonValue"
              },
              "type": "array"
            },
            {
              "additionalProperties": {
                "$ref": "#/$defs/JsonValue"
              },
              "type": "object"
            }
          ]
        },
        "RequestId": {
          "pattern": "^request_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "RetryDecisionId": {
          "pattern": "^retry_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "Sha256": {
          "pattern": "^[0-9a-f]{64}$",
          "type": "string"
        },
        "TaskId": {
          "pattern": "^task_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        }
      },
      "$ref": "#/$defs/ControlTaskInput",
      "$schema": "https://json-schema.org/draft/2020-12/schema"
    },
    "outputSchema": {
      "$defs": {
        "AgentId": {
          "pattern": "^agent_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "ApprovalDecisionId": {
          "pattern": "^approval_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "ApprovalRequestId": {
          "pattern": "^approval_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "ArtifactId": {
          "pattern": "^artifact_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "ArtifactRef": {
          "additionalProperties": false,
          "properties": {
            "artifactId": {
              "$ref": "#/$defs/ArtifactId"
            },
            "bytes": {
              "minimum": 0,
              "type": "integer"
            },
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "createdAt": {
              "$ref": "#/$defs/Timestamp"
            },
            "mediaType": {
              "maxLength": 256,
              "minLength": 1,
              "type": "string"
            },
            "sha256": {
              "$ref": "#/$defs/Sha256"
            },
            "taskId": {
              "$ref": "#/$defs/TaskId"
            }
          },
          "required": [
            "artifactId",
            "caseId",
            "taskId",
            "mediaType",
            "bytes",
            "sha256",
            "createdAt"
          ],
          "type": "object"
        },
        "AttemptId": {
          "pattern": "^attempt_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "AttemptRecord": {
          "additionalProperties": false,
          "properties": {
            "agentId": {
              "$ref": "#/$defs/AgentId"
            },
            "attemptId": {
              "$ref": "#/$defs/AttemptId"
            },
            "attemptRevision": {
              "minimum": 1,
              "type": "integer"
            },
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "createdAt": {
              "$ref": "#/$defs/Timestamp"
            },
            "deadlineAt": {
              "$ref": "#/$defs/Timestamp"
            },
            "dispatchId": {
              "$ref": "#/$defs/DispatchId"
            },
            "expectedTaskRevision": {
              "minimum": 1,
              "type": "integer"
            },
            "operationInputDigest": {
              "$ref": "#/$defs/Sha256"
            },
            "ordinal": {
              "minimum": 1,
              "type": "integer"
            },
            "schemaVersion": {
              "const": 1
            },
            "status": {
              "$ref": "#/$defs/AttemptStatus"
            },
            "taskId": {
              "$ref": "#/$defs/TaskId"
            },
            "updatedAt": {
              "$ref": "#/$defs/Timestamp"
            }
          },
          "required": [
            "schemaVersion",
            "caseId",
            "taskId",
            "attemptId",
            "ordinal",
            "agentId",
            "dispatchId",
            "operationInputDigest",
            "expectedTaskRevision",
            "deadlineAt",
            "attemptRevision",
            "status",
            "createdAt",
            "updatedAt"
          ],
          "type": "object"
        },
        "AttemptStatus": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "dispatch_pending"
                }
              },
              "required": [
                "kind"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "agentEpoch": {
                  "minimum": 1,
                  "type": "integer"
                },
                "fencingToken": {
                  "maxLength": 256,
                  "minLength": 16,
                  "type": "string"
                },
                "kind": {
                  "const": "queued"
                },
                "queuedAt": {
                  "$ref": "#/$defs/Timestamp"
                }
              },
              "required": [
                "kind",
                "agentEpoch",
                "fencingToken",
                "queuedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "agentEpoch": {
                  "minimum": 1,
                  "type": "integer"
                },
                "fencingToken": {
                  "maxLength": 256,
                  "minLength": 16,
                  "type": "string"
                },
                "kind": {
                  "const": "running"
                },
                "startedAt": {
                  "$ref": "#/$defs/Timestamp"
                }
              },
              "required": [
                "kind",
                "agentEpoch",
                "fencingToken",
                "startedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "reconciling"
                },
                "reason": {
                  "enum": [
                    "dispatch_response_lost",
                    "agent_disconnected",
                    "result_response_lost",
                    "deadline_exceeded"
                  ]
                },
                "since": {
                  "$ref": "#/$defs/Timestamp"
                }
              },
              "required": [
                "kind",
                "reason",
                "since"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "cancel_requested"
                },
                "previous": {
                  "enum": [
                    "dispatch_pending",
                    "queued",
                    "running",
                    "reconciling"
                  ]
                },
                "requestedAt": {
                  "$ref": "#/$defs/Timestamp"
                }
              },
              "required": [
                "kind",
                "previous",
                "requestedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "terminal"
                },
                "terminal": {
                  "$ref": "#/$defs/AttemptTerminal"
                }
              },
              "required": [
                "kind",
                "terminal"
              ],
              "type": "object"
            }
          ]
        },
        "AttemptTerminal": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "succeeded"
                },
                "resultEnvelopeDigest": {
                  "$ref": "#/$defs/Sha256"
                }
              },
              "required": [
                "outcome",
                "resultEnvelopeDigest",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "failure": {
                  "$ref": "#/$defs/ExecutionFailure"
                },
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "failed"
                }
              },
              "required": [
                "outcome",
                "failure",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "cancellationReceiptId": {
                  "maxLength": 128,
                  "minLength": 1,
                  "type": "string"
                },
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "cancelled"
                }
              },
              "required": [
                "outcome",
                "cancellationReceiptId",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "interruption": {
                  "$ref": "#/$defs/InterruptionRecord"
                },
                "outcome": {
                  "const": "interrupted"
                },
                "retrySafety": {
                  "enum": [
                    "safe",
                    "unsafe",
                    "requires_reconciliation"
                  ]
                }
              },
              "required": [
                "outcome",
                "interruption",
                "retrySafety",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "rejected"
                },
                "rejection": {
                  "$ref": "#/$defs/ExecutionRejection"
                }
              },
              "required": [
                "outcome",
                "rejection",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "inputRequestId": {
                  "$ref": "#/$defs/InputRequestId"
                },
                "outcome": {
                  "const": "input_required"
                }
              },
              "required": [
                "outcome",
                "inputRequestId",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "unverified"
                },
                "uncertainty": {
                  "$ref": "#/$defs/UncertaintyRecord"
                }
              },
              "required": [
                "outcome",
                "uncertainty",
                "finishedAt"
              ],
              "type": "object"
            }
          ]
        },
        "CancellationId": {
          "pattern": "^cancel_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "CancellationSummary": {
          "additionalProperties": false,
          "properties": {
            "cancellationId": {
              "$ref": "#/$defs/CancellationId"
            },
            "effectsObserved": {
              "items": {
                "$ref": "#/$defs/TargetEffect"
              },
              "type": "array",
              "uniqueItems": true
            },
            "reason": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            }
          },
          "required": [
            "cancellationId",
            "reason",
            "effectsObserved"
          ],
          "type": "object"
        },
        "CaseId": {
          "pattern": "^case_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "ControlTaskResult": {
          "$ref": "#/$defs/TaskMutationResultV1"
        },
        "DispatchId": {
          "pattern": "^dispatch_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "ExecutionFailure": {
          "$ref": "#/$defs/FailureRecord"
        },
        "ExecutionRejection": {
          "$ref": "#/$defs/FailureRecord"
        },
        "FailureRecord": {
          "additionalProperties": false,
          "properties": {
            "code": {
              "maxLength": 128,
              "minLength": 1,
              "type": "string"
            },
            "message": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            },
            "retryable": {
              "type": "boolean"
            }
          },
          "required": [
            "code",
            "message",
            "retryable"
          ],
          "type": "object"
        },
        "GrantId": {
          "pattern": "^grant_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "InputRequestId": {
          "pattern": "^input_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "InterruptionRecord": {
          "additionalProperties": false,
          "properties": {
            "code": {
              "maxLength": 128,
              "minLength": 1,
              "type": "string"
            },
            "message": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            }
          },
          "required": [
            "code",
            "message"
          ],
          "type": "object"
        },
        "JsonValue": {
          "oneOf": [
            {
              "type": "null"
            },
            {
              "type": "boolean"
            },
            {
              "maximum": 9007199254740991,
              "minimum": -9007199254740991,
              "type": "integer"
            },
            {
              "type": "string"
            },
            {
              "items": {
                "$ref": "#/$defs/JsonValue"
              },
              "type": "array"
            },
            {
              "additionalProperties": {
                "$ref": "#/$defs/JsonValue"
              },
              "type": "object"
            }
          ]
        },
        "OperationFailure": {
          "$ref": "#/$defs/FailureRecord"
        },
        "OperationInvocation": {
          "additionalProperties": false,
          "properties": {
            "arguments": {
              "$ref": "#/$defs/JsonValue"
            },
            "expectedSchemaDigest": {
              "$ref": "#/$defs/Sha256"
            },
            "id": {
              "maxLength": 128,
              "minLength": 1,
              "type": "string"
            },
            "inputDigest": {
              "$ref": "#/$defs/Sha256"
            },
            "targets": {
              "items": {
                "$ref": "#/$defs/TargetBinding"
              },
              "minItems": 1,
              "type": "array"
            },
            "version": {
              "minimum": 1,
              "type": "integer"
            }
          },
          "required": [
            "id",
            "version",
            "expectedSchemaDigest",
            "targets",
            "arguments",
            "inputDigest"
          ],
          "type": "object"
        },
        "OperationResult": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "inline"
                },
                "resultDigest": {
                  "$ref": "#/$defs/Sha256"
                },
                "value": {
                  "$ref": "#/$defs/JsonValue"
                }
              },
              "required": [
                "kind",
                "value",
                "resultDigest"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "artifacts": {
                  "items": {
                    "$ref": "#/$defs/ArtifactRef"
                  },
                  "minItems": 1,
                  "type": "array"
                },
                "kind": {
                  "const": "artifacts"
                },
                "resultDigest": {
                  "$ref": "#/$defs/Sha256"
                }
              },
              "required": [
                "kind",
                "artifacts",
                "resultDigest"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "artifacts": {
                  "items": {
                    "$ref": "#/$defs/ArtifactRef"
                  },
                  "minItems": 1,
                  "type": "array"
                },
                "kind": {
                  "const": "mixed"
                },
                "resultDigest": {
                  "$ref": "#/$defs/Sha256"
                },
                "value": {
                  "$ref": "#/$defs/JsonValue"
                }
              },
              "required": [
                "kind",
                "value",
                "artifacts",
                "resultDigest"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "none"
                },
                "resultDigest": {
                  "$ref": "#/$defs/Sha256"
                }
              },
              "required": [
                "kind",
                "resultDigest"
              ],
              "type": "object"
            }
          ]
        },
        "ProjectId": {
          "pattern": "^project_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "RequestId": {
          "pattern": "^request_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "RetryDecisionId": {
          "pattern": "^retry_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "Sha256": {
          "pattern": "^[0-9a-f]{64}$",
          "type": "string"
        },
        "Target": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "workspace"
                },
                "workspaceId": {
                  "$ref": "#/$defs/WorkspaceId"
                }
              },
              "required": [
                "kind",
                "workspaceId"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "project"
                },
                "projectId": {
                  "$ref": "#/$defs/ProjectId"
                },
                "workspaceId": {
                  "$ref": "#/$defs/WorkspaceId"
                }
              },
              "required": [
                "kind",
                "workspaceId",
                "projectId"
              ],
              "type": "object"
            }
          ]
        },
        "TargetBinding": {
          "additionalProperties": false,
          "properties": {
            "grantId": {
              "$ref": "#/$defs/GrantId"
            },
            "resource": {
              "$ref": "#/$defs/Target"
            },
            "role": {
              "maxLength": 64,
              "minLength": 1,
              "type": "string"
            }
          },
          "required": [
            "role",
            "grantId",
            "resource"
          ],
          "type": "object"
        },
        "TargetEffect": {
          "enum": [
            "fs.read",
            "fs.write",
            "fs.delete",
            "git.read",
            "git.write",
            "remote.read",
            "remote.write",
            "validation.execute",
            "process.execute",
            "network.use",
            "package.manage",
            "service.manage",
            "runtime.manage"
          ]
        },
        "TaskId": {
          "pattern": "^task_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "TaskMutationResultV1": {
          "additionalProperties": false,
          "properties": {
            "accepted": {
              "const": true
            },
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "committedCaseRevision": {
              "maximum": 9007199254740991,
              "minimum": 1,
              "type": "integer"
            },
            "committedEventSequence": {
              "maximum": 9007199254740991,
              "minimum": 0,
              "type": "integer"
            },
            "committedTaskRevision": {
              "maximum": 9007199254740991,
              "minimum": 1,
              "type": "integer"
            },
            "deduplicated": {
              "type": "boolean"
            },
            "requestId": {
              "$ref": "#/$defs/RequestId"
            },
            "taskId": {
              "$ref": "#/$defs/TaskId"
            },
            "value": {
              "$ref": "#/$defs/TaskMutationValueV1"
            }
          },
          "required": [
            "accepted",
            "deduplicated",
            "requestId",
            "caseId",
            "taskId",
            "committedCaseRevision",
            "committedTaskRevision",
            "committedEventSequence",
            "value"
          ],
          "type": "object"
        },
        "TaskMutationValueV1": {
          "additionalProperties": false,
          "properties": {
            "attempt": {
              "$ref": "#/$defs/AttemptRecord"
            },
            "task": {
              "$ref": "#/$defs/TaskRecord"
            }
          },
          "required": [
            "task"
          ],
          "type": "object"
        },
        "TaskRecord": {
          "additionalProperties": false,
          "properties": {
            "admission": {
              "additionalProperties": false,
              "properties": {
                "admittedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "contractDigest": {
                  "$ref": "#/$defs/Sha256"
                },
                "inputDigest": {
                  "$ref": "#/$defs/Sha256"
                },
                "operationSchemaDigest": {
                  "$ref": "#/$defs/Sha256"
                },
                "requestId": {
                  "$ref": "#/$defs/RequestId"
                }
              },
              "required": [
                "requestId",
                "admittedAt",
                "contractDigest",
                "operationSchemaDigest",
                "inputDigest"
              ],
              "type": "object"
            },
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "createdAt": {
              "$ref": "#/$defs/Timestamp"
            },
            "latestAttemptId": {
              "$ref": "#/$defs/AttemptId"
            },
            "operation": {
              "$ref": "#/$defs/OperationInvocation"
            },
            "schemaVersion": {
              "const": 1
            },
            "sequence": {
              "minimum": 1,
              "type": "integer"
            },
            "status": {
              "$ref": "#/$defs/TaskStatus"
            },
            "taskId": {
              "$ref": "#/$defs/TaskId"
            },
            "taskRevision": {
              "minimum": 1,
              "type": "integer"
            },
            "updatedAt": {
              "$ref": "#/$defs/Timestamp"
            }
          },
          "required": [
            "schemaVersion",
            "caseId",
            "taskId",
            "sequence",
            "operation",
            "admission",
            "taskRevision",
            "status",
            "createdAt",
            "updatedAt"
          ],
          "type": "object"
        },
        "TaskStatus": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "waiting"
                },
                "waiting": {
                  "$ref": "#/$defs/TaskWaiting"
                }
              },
              "required": [
                "kind",
                "waiting"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "ready"
                },
                "readyAt": {
                  "$ref": "#/$defs/Timestamp"
                }
              },
              "required": [
                "kind",
                "readyAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "attemptId": {
                  "$ref": "#/$defs/AttemptId"
                },
                "kind": {
                  "const": "active"
                }
              },
              "required": [
                "kind",
                "attemptId"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "attemptId": {
                  "$ref": "#/$defs/AttemptId"
                },
                "cancellationId": {
                  "$ref": "#/$defs/CancellationId"
                },
                "kind": {
                  "const": "cancelling"
                },
                "requestedAt": {
                  "$ref": "#/$defs/Timestamp"
                }
              },
              "required": [
                "kind",
                "cancellationId",
                "requestedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "terminal"
                },
                "terminal": {
                  "$ref": "#/$defs/TaskTerminal"
                }
              },
              "required": [
                "kind",
                "terminal"
              ],
              "type": "object"
            }
          ]
        },
        "TaskTerminal": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "succeeded"
                },
                "result": {
                  "$ref": "#/$defs/OperationResult"
                }
              },
              "required": [
                "outcome",
                "result",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "failure": {
                  "$ref": "#/$defs/OperationFailure"
                },
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "failed"
                }
              },
              "required": [
                "outcome",
                "failure",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "cancellation": {
                  "$ref": "#/$defs/CancellationSummary"
                },
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "cancelled"
                }
              },
              "required": [
                "outcome",
                "cancellation",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "approvalDecisionId": {
                  "$ref": "#/$defs/ApprovalDecisionId"
                },
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "denied"
                }
              },
              "required": [
                "outcome",
                "approvalDecisionId",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "unverified"
                },
                "uncertainty": {
                  "$ref": "#/$defs/UncertaintyRecord"
                }
              },
              "required": [
                "outcome",
                "uncertainty",
                "finishedAt"
              ],
              "type": "object"
            }
          ]
        },
        "TaskWaiting": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "approvalRequestId": {
                  "$ref": "#/$defs/ApprovalRequestId"
                },
                "reason": {
                  "const": "approval"
                }
              },
              "required": [
                "reason",
                "approvalRequestId"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "inputRequestId": {
                  "$ref": "#/$defs/InputRequestId"
                },
                "reason": {
                  "const": "input"
                }
              },
              "required": [
                "reason",
                "inputRequestId"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "reason": {
                  "const": "retry_decision"
                },
                "retryDecisionId": {
                  "$ref": "#/$defs/RetryDecisionId"
                }
              },
              "required": [
                "reason",
                "retryDecisionId"
              ],
              "type": "object"
            }
          ]
        },
        "Timestamp": {
          "format": "date-time",
          "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,9})?Z$",
          "type": "string"
        },
        "UncertaintyRecord": {
          "additionalProperties": false,
          "properties": {
            "code": {
              "maxLength": 128,
              "minLength": 1,
              "type": "string"
            },
            "message": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            },
            "possibleEffects": {
              "items": {
                "$ref": "#/$defs/TargetEffect"
              },
              "type": "array",
              "uniqueItems": true
            }
          },
          "required": [
            "code",
            "message",
            "possibleEffects"
          ],
          "type": "object"
        },
        "WorkspaceId": {
          "pattern": "^workspace_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        }
      },
      "$ref": "#/$defs/ControlTaskResult",
      "$schema": "https://json-schema.org/draft/2020-12/schema"
    },
    "inputSchemaDigest": "8c5be188263f889ff31fcca51192d46a4f3c2a657101f4cd28a20449776bf56d",
    "resultSchemaDigest": "7252b69181e791a26121178976e62333c43480c05c64ca6b02a7ea8a0c7cbec9",
    "maxResultBytes": 262144
  },
  {
    "name": "cancel_task",
    "title": "Cancel Task",
    "description": "Record Task cancellation intent without claiming that an external effect did not occur.",
    "version": 1,
    "inputRoot": "CancelTaskInput",
    "resultRoot": "CancelTaskResult",
    "mutation": true,
    "owner": "case_do",
    "routing": "explicit_case",
    "retryClass": "deduplicated",
    "approvalClass": "policy",
    "riskClass": "destructive",
    "resultBound": "mutation",
    "annotations": {
      "readOnlyHint": false,
      "idempotentHint": true,
      "destructiveHint": true,
      "openWorldHint": false
    },
    "inputSchema": {
      "$defs": {
        "CancelTaskInput": {
          "additionalProperties": false,
          "properties": {
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "expectedTaskRevision": {
              "minimum": 1,
              "type": "integer"
            },
            "reason": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            },
            "requestId": {
              "$ref": "#/$defs/RequestId"
            },
            "taskId": {
              "$ref": "#/$defs/TaskId"
            }
          },
          "required": [
            "requestId",
            "caseId",
            "taskId",
            "expectedTaskRevision",
            "reason"
          ],
          "type": "object"
        },
        "CaseId": {
          "pattern": "^case_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "RequestId": {
          "pattern": "^request_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "TaskId": {
          "pattern": "^task_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        }
      },
      "$ref": "#/$defs/CancelTaskInput",
      "$schema": "https://json-schema.org/draft/2020-12/schema"
    },
    "outputSchema": {
      "$defs": {
        "AgentId": {
          "pattern": "^agent_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "ApprovalDecisionId": {
          "pattern": "^approval_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "ApprovalRequestId": {
          "pattern": "^approval_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "ArtifactId": {
          "pattern": "^artifact_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "ArtifactRef": {
          "additionalProperties": false,
          "properties": {
            "artifactId": {
              "$ref": "#/$defs/ArtifactId"
            },
            "bytes": {
              "minimum": 0,
              "type": "integer"
            },
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "createdAt": {
              "$ref": "#/$defs/Timestamp"
            },
            "mediaType": {
              "maxLength": 256,
              "minLength": 1,
              "type": "string"
            },
            "sha256": {
              "$ref": "#/$defs/Sha256"
            },
            "taskId": {
              "$ref": "#/$defs/TaskId"
            }
          },
          "required": [
            "artifactId",
            "caseId",
            "taskId",
            "mediaType",
            "bytes",
            "sha256",
            "createdAt"
          ],
          "type": "object"
        },
        "AttemptId": {
          "pattern": "^attempt_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "AttemptRecord": {
          "additionalProperties": false,
          "properties": {
            "agentId": {
              "$ref": "#/$defs/AgentId"
            },
            "attemptId": {
              "$ref": "#/$defs/AttemptId"
            },
            "attemptRevision": {
              "minimum": 1,
              "type": "integer"
            },
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "createdAt": {
              "$ref": "#/$defs/Timestamp"
            },
            "deadlineAt": {
              "$ref": "#/$defs/Timestamp"
            },
            "dispatchId": {
              "$ref": "#/$defs/DispatchId"
            },
            "expectedTaskRevision": {
              "minimum": 1,
              "type": "integer"
            },
            "operationInputDigest": {
              "$ref": "#/$defs/Sha256"
            },
            "ordinal": {
              "minimum": 1,
              "type": "integer"
            },
            "schemaVersion": {
              "const": 1
            },
            "status": {
              "$ref": "#/$defs/AttemptStatus"
            },
            "taskId": {
              "$ref": "#/$defs/TaskId"
            },
            "updatedAt": {
              "$ref": "#/$defs/Timestamp"
            }
          },
          "required": [
            "schemaVersion",
            "caseId",
            "taskId",
            "attemptId",
            "ordinal",
            "agentId",
            "dispatchId",
            "operationInputDigest",
            "expectedTaskRevision",
            "deadlineAt",
            "attemptRevision",
            "status",
            "createdAt",
            "updatedAt"
          ],
          "type": "object"
        },
        "AttemptStatus": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "dispatch_pending"
                }
              },
              "required": [
                "kind"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "agentEpoch": {
                  "minimum": 1,
                  "type": "integer"
                },
                "fencingToken": {
                  "maxLength": 256,
                  "minLength": 16,
                  "type": "string"
                },
                "kind": {
                  "const": "queued"
                },
                "queuedAt": {
                  "$ref": "#/$defs/Timestamp"
                }
              },
              "required": [
                "kind",
                "agentEpoch",
                "fencingToken",
                "queuedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "agentEpoch": {
                  "minimum": 1,
                  "type": "integer"
                },
                "fencingToken": {
                  "maxLength": 256,
                  "minLength": 16,
                  "type": "string"
                },
                "kind": {
                  "const": "running"
                },
                "startedAt": {
                  "$ref": "#/$defs/Timestamp"
                }
              },
              "required": [
                "kind",
                "agentEpoch",
                "fencingToken",
                "startedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "reconciling"
                },
                "reason": {
                  "enum": [
                    "dispatch_response_lost",
                    "agent_disconnected",
                    "result_response_lost",
                    "deadline_exceeded"
                  ]
                },
                "since": {
                  "$ref": "#/$defs/Timestamp"
                }
              },
              "required": [
                "kind",
                "reason",
                "since"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "cancel_requested"
                },
                "previous": {
                  "enum": [
                    "dispatch_pending",
                    "queued",
                    "running",
                    "reconciling"
                  ]
                },
                "requestedAt": {
                  "$ref": "#/$defs/Timestamp"
                }
              },
              "required": [
                "kind",
                "previous",
                "requestedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "terminal"
                },
                "terminal": {
                  "$ref": "#/$defs/AttemptTerminal"
                }
              },
              "required": [
                "kind",
                "terminal"
              ],
              "type": "object"
            }
          ]
        },
        "AttemptTerminal": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "succeeded"
                },
                "resultEnvelopeDigest": {
                  "$ref": "#/$defs/Sha256"
                }
              },
              "required": [
                "outcome",
                "resultEnvelopeDigest",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "failure": {
                  "$ref": "#/$defs/ExecutionFailure"
                },
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "failed"
                }
              },
              "required": [
                "outcome",
                "failure",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "cancellationReceiptId": {
                  "maxLength": 128,
                  "minLength": 1,
                  "type": "string"
                },
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "cancelled"
                }
              },
              "required": [
                "outcome",
                "cancellationReceiptId",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "interruption": {
                  "$ref": "#/$defs/InterruptionRecord"
                },
                "outcome": {
                  "const": "interrupted"
                },
                "retrySafety": {
                  "enum": [
                    "safe",
                    "unsafe",
                    "requires_reconciliation"
                  ]
                }
              },
              "required": [
                "outcome",
                "interruption",
                "retrySafety",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "rejected"
                },
                "rejection": {
                  "$ref": "#/$defs/ExecutionRejection"
                }
              },
              "required": [
                "outcome",
                "rejection",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "inputRequestId": {
                  "$ref": "#/$defs/InputRequestId"
                },
                "outcome": {
                  "const": "input_required"
                }
              },
              "required": [
                "outcome",
                "inputRequestId",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "unverified"
                },
                "uncertainty": {
                  "$ref": "#/$defs/UncertaintyRecord"
                }
              },
              "required": [
                "outcome",
                "uncertainty",
                "finishedAt"
              ],
              "type": "object"
            }
          ]
        },
        "CancelTaskResult": {
          "$ref": "#/$defs/TaskMutationResultV1"
        },
        "CancellationId": {
          "pattern": "^cancel_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "CancellationSummary": {
          "additionalProperties": false,
          "properties": {
            "cancellationId": {
              "$ref": "#/$defs/CancellationId"
            },
            "effectsObserved": {
              "items": {
                "$ref": "#/$defs/TargetEffect"
              },
              "type": "array",
              "uniqueItems": true
            },
            "reason": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            }
          },
          "required": [
            "cancellationId",
            "reason",
            "effectsObserved"
          ],
          "type": "object"
        },
        "CaseId": {
          "pattern": "^case_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "DispatchId": {
          "pattern": "^dispatch_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "ExecutionFailure": {
          "$ref": "#/$defs/FailureRecord"
        },
        "ExecutionRejection": {
          "$ref": "#/$defs/FailureRecord"
        },
        "FailureRecord": {
          "additionalProperties": false,
          "properties": {
            "code": {
              "maxLength": 128,
              "minLength": 1,
              "type": "string"
            },
            "message": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            },
            "retryable": {
              "type": "boolean"
            }
          },
          "required": [
            "code",
            "message",
            "retryable"
          ],
          "type": "object"
        },
        "GrantId": {
          "pattern": "^grant_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "InputRequestId": {
          "pattern": "^input_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "InterruptionRecord": {
          "additionalProperties": false,
          "properties": {
            "code": {
              "maxLength": 128,
              "minLength": 1,
              "type": "string"
            },
            "message": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            }
          },
          "required": [
            "code",
            "message"
          ],
          "type": "object"
        },
        "JsonValue": {
          "oneOf": [
            {
              "type": "null"
            },
            {
              "type": "boolean"
            },
            {
              "maximum": 9007199254740991,
              "minimum": -9007199254740991,
              "type": "integer"
            },
            {
              "type": "string"
            },
            {
              "items": {
                "$ref": "#/$defs/JsonValue"
              },
              "type": "array"
            },
            {
              "additionalProperties": {
                "$ref": "#/$defs/JsonValue"
              },
              "type": "object"
            }
          ]
        },
        "OperationFailure": {
          "$ref": "#/$defs/FailureRecord"
        },
        "OperationInvocation": {
          "additionalProperties": false,
          "properties": {
            "arguments": {
              "$ref": "#/$defs/JsonValue"
            },
            "expectedSchemaDigest": {
              "$ref": "#/$defs/Sha256"
            },
            "id": {
              "maxLength": 128,
              "minLength": 1,
              "type": "string"
            },
            "inputDigest": {
              "$ref": "#/$defs/Sha256"
            },
            "targets": {
              "items": {
                "$ref": "#/$defs/TargetBinding"
              },
              "minItems": 1,
              "type": "array"
            },
            "version": {
              "minimum": 1,
              "type": "integer"
            }
          },
          "required": [
            "id",
            "version",
            "expectedSchemaDigest",
            "targets",
            "arguments",
            "inputDigest"
          ],
          "type": "object"
        },
        "OperationResult": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "inline"
                },
                "resultDigest": {
                  "$ref": "#/$defs/Sha256"
                },
                "value": {
                  "$ref": "#/$defs/JsonValue"
                }
              },
              "required": [
                "kind",
                "value",
                "resultDigest"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "artifacts": {
                  "items": {
                    "$ref": "#/$defs/ArtifactRef"
                  },
                  "minItems": 1,
                  "type": "array"
                },
                "kind": {
                  "const": "artifacts"
                },
                "resultDigest": {
                  "$ref": "#/$defs/Sha256"
                }
              },
              "required": [
                "kind",
                "artifacts",
                "resultDigest"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "artifacts": {
                  "items": {
                    "$ref": "#/$defs/ArtifactRef"
                  },
                  "minItems": 1,
                  "type": "array"
                },
                "kind": {
                  "const": "mixed"
                },
                "resultDigest": {
                  "$ref": "#/$defs/Sha256"
                },
                "value": {
                  "$ref": "#/$defs/JsonValue"
                }
              },
              "required": [
                "kind",
                "value",
                "artifacts",
                "resultDigest"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "none"
                },
                "resultDigest": {
                  "$ref": "#/$defs/Sha256"
                }
              },
              "required": [
                "kind",
                "resultDigest"
              ],
              "type": "object"
            }
          ]
        },
        "ProjectId": {
          "pattern": "^project_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "RequestId": {
          "pattern": "^request_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "RetryDecisionId": {
          "pattern": "^retry_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "Sha256": {
          "pattern": "^[0-9a-f]{64}$",
          "type": "string"
        },
        "Target": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "workspace"
                },
                "workspaceId": {
                  "$ref": "#/$defs/WorkspaceId"
                }
              },
              "required": [
                "kind",
                "workspaceId"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "project"
                },
                "projectId": {
                  "$ref": "#/$defs/ProjectId"
                },
                "workspaceId": {
                  "$ref": "#/$defs/WorkspaceId"
                }
              },
              "required": [
                "kind",
                "workspaceId",
                "projectId"
              ],
              "type": "object"
            }
          ]
        },
        "TargetBinding": {
          "additionalProperties": false,
          "properties": {
            "grantId": {
              "$ref": "#/$defs/GrantId"
            },
            "resource": {
              "$ref": "#/$defs/Target"
            },
            "role": {
              "maxLength": 64,
              "minLength": 1,
              "type": "string"
            }
          },
          "required": [
            "role",
            "grantId",
            "resource"
          ],
          "type": "object"
        },
        "TargetEffect": {
          "enum": [
            "fs.read",
            "fs.write",
            "fs.delete",
            "git.read",
            "git.write",
            "remote.read",
            "remote.write",
            "validation.execute",
            "process.execute",
            "network.use",
            "package.manage",
            "service.manage",
            "runtime.manage"
          ]
        },
        "TaskId": {
          "pattern": "^task_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "TaskMutationResultV1": {
          "additionalProperties": false,
          "properties": {
            "accepted": {
              "const": true
            },
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "committedCaseRevision": {
              "maximum": 9007199254740991,
              "minimum": 1,
              "type": "integer"
            },
            "committedEventSequence": {
              "maximum": 9007199254740991,
              "minimum": 0,
              "type": "integer"
            },
            "committedTaskRevision": {
              "maximum": 9007199254740991,
              "minimum": 1,
              "type": "integer"
            },
            "deduplicated": {
              "type": "boolean"
            },
            "requestId": {
              "$ref": "#/$defs/RequestId"
            },
            "taskId": {
              "$ref": "#/$defs/TaskId"
            },
            "value": {
              "$ref": "#/$defs/TaskMutationValueV1"
            }
          },
          "required": [
            "accepted",
            "deduplicated",
            "requestId",
            "caseId",
            "taskId",
            "committedCaseRevision",
            "committedTaskRevision",
            "committedEventSequence",
            "value"
          ],
          "type": "object"
        },
        "TaskMutationValueV1": {
          "additionalProperties": false,
          "properties": {
            "attempt": {
              "$ref": "#/$defs/AttemptRecord"
            },
            "task": {
              "$ref": "#/$defs/TaskRecord"
            }
          },
          "required": [
            "task"
          ],
          "type": "object"
        },
        "TaskRecord": {
          "additionalProperties": false,
          "properties": {
            "admission": {
              "additionalProperties": false,
              "properties": {
                "admittedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "contractDigest": {
                  "$ref": "#/$defs/Sha256"
                },
                "inputDigest": {
                  "$ref": "#/$defs/Sha256"
                },
                "operationSchemaDigest": {
                  "$ref": "#/$defs/Sha256"
                },
                "requestId": {
                  "$ref": "#/$defs/RequestId"
                }
              },
              "required": [
                "requestId",
                "admittedAt",
                "contractDigest",
                "operationSchemaDigest",
                "inputDigest"
              ],
              "type": "object"
            },
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "createdAt": {
              "$ref": "#/$defs/Timestamp"
            },
            "latestAttemptId": {
              "$ref": "#/$defs/AttemptId"
            },
            "operation": {
              "$ref": "#/$defs/OperationInvocation"
            },
            "schemaVersion": {
              "const": 1
            },
            "sequence": {
              "minimum": 1,
              "type": "integer"
            },
            "status": {
              "$ref": "#/$defs/TaskStatus"
            },
            "taskId": {
              "$ref": "#/$defs/TaskId"
            },
            "taskRevision": {
              "minimum": 1,
              "type": "integer"
            },
            "updatedAt": {
              "$ref": "#/$defs/Timestamp"
            }
          },
          "required": [
            "schemaVersion",
            "caseId",
            "taskId",
            "sequence",
            "operation",
            "admission",
            "taskRevision",
            "status",
            "createdAt",
            "updatedAt"
          ],
          "type": "object"
        },
        "TaskStatus": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "waiting"
                },
                "waiting": {
                  "$ref": "#/$defs/TaskWaiting"
                }
              },
              "required": [
                "kind",
                "waiting"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "ready"
                },
                "readyAt": {
                  "$ref": "#/$defs/Timestamp"
                }
              },
              "required": [
                "kind",
                "readyAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "attemptId": {
                  "$ref": "#/$defs/AttemptId"
                },
                "kind": {
                  "const": "active"
                }
              },
              "required": [
                "kind",
                "attemptId"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "attemptId": {
                  "$ref": "#/$defs/AttemptId"
                },
                "cancellationId": {
                  "$ref": "#/$defs/CancellationId"
                },
                "kind": {
                  "const": "cancelling"
                },
                "requestedAt": {
                  "$ref": "#/$defs/Timestamp"
                }
              },
              "required": [
                "kind",
                "cancellationId",
                "requestedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "kind": {
                  "const": "terminal"
                },
                "terminal": {
                  "$ref": "#/$defs/TaskTerminal"
                }
              },
              "required": [
                "kind",
                "terminal"
              ],
              "type": "object"
            }
          ]
        },
        "TaskTerminal": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "succeeded"
                },
                "result": {
                  "$ref": "#/$defs/OperationResult"
                }
              },
              "required": [
                "outcome",
                "result",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "failure": {
                  "$ref": "#/$defs/OperationFailure"
                },
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "failed"
                }
              },
              "required": [
                "outcome",
                "failure",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "cancellation": {
                  "$ref": "#/$defs/CancellationSummary"
                },
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "cancelled"
                }
              },
              "required": [
                "outcome",
                "cancellation",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "approvalDecisionId": {
                  "$ref": "#/$defs/ApprovalDecisionId"
                },
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "denied"
                }
              },
              "required": [
                "outcome",
                "approvalDecisionId",
                "finishedAt"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "finishedAt": {
                  "$ref": "#/$defs/Timestamp"
                },
                "outcome": {
                  "const": "unverified"
                },
                "uncertainty": {
                  "$ref": "#/$defs/UncertaintyRecord"
                }
              },
              "required": [
                "outcome",
                "uncertainty",
                "finishedAt"
              ],
              "type": "object"
            }
          ]
        },
        "TaskWaiting": {
          "oneOf": [
            {
              "additionalProperties": false,
              "properties": {
                "approvalRequestId": {
                  "$ref": "#/$defs/ApprovalRequestId"
                },
                "reason": {
                  "const": "approval"
                }
              },
              "required": [
                "reason",
                "approvalRequestId"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "inputRequestId": {
                  "$ref": "#/$defs/InputRequestId"
                },
                "reason": {
                  "const": "input"
                }
              },
              "required": [
                "reason",
                "inputRequestId"
              ],
              "type": "object"
            },
            {
              "additionalProperties": false,
              "properties": {
                "reason": {
                  "const": "retry_decision"
                },
                "retryDecisionId": {
                  "$ref": "#/$defs/RetryDecisionId"
                }
              },
              "required": [
                "reason",
                "retryDecisionId"
              ],
              "type": "object"
            }
          ]
        },
        "Timestamp": {
          "format": "date-time",
          "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,9})?Z$",
          "type": "string"
        },
        "UncertaintyRecord": {
          "additionalProperties": false,
          "properties": {
            "code": {
              "maxLength": 128,
              "minLength": 1,
              "type": "string"
            },
            "message": {
              "maxLength": 4096,
              "minLength": 1,
              "type": "string"
            },
            "possibleEffects": {
              "items": {
                "$ref": "#/$defs/TargetEffect"
              },
              "type": "array",
              "uniqueItems": true
            }
          },
          "required": [
            "code",
            "message",
            "possibleEffects"
          ],
          "type": "object"
        },
        "WorkspaceId": {
          "pattern": "^workspace_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        }
      },
      "$ref": "#/$defs/CancelTaskResult",
      "$schema": "https://json-schema.org/draft/2020-12/schema"
    },
    "inputSchemaDigest": "5f4fb447f069069e1dcb649683d8c8e20d1af86fe0235bfab23cb3a50e8c5849",
    "resultSchemaDigest": "97aa39d23bb7a8fed7b794313e4a9ffef0877d34e1b0fd1438764d8ecbba9a3b",
    "maxResultBytes": 262144
  },
  {
    "name": "render_task",
    "title": "Render Task",
    "description": "Render a bounded stable Task summary as text or Markdown.",
    "version": 1,
    "inputRoot": "RenderTaskInput",
    "resultRoot": "RenderTaskResult",
    "mutation": false,
    "owner": "case_do",
    "routing": "explicit_case",
    "retryClass": "read_only",
    "approvalClass": "none",
    "riskClass": "read",
    "resultBound": "render",
    "annotations": {
      "readOnlyHint": true,
      "idempotentHint": true,
      "destructiveHint": false,
      "openWorldHint": false
    },
    "inputSchema": {
      "$defs": {
        "CaseId": {
          "pattern": "^case_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "RenderTaskInput": {
          "additionalProperties": false,
          "properties": {
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "cursor": {
              "maxLength": 8192,
              "minLength": 1,
              "type": "string"
            },
            "format": {
              "enum": [
                "text",
                "markdown"
              ]
            },
            "maxBytes": {
              "maximum": 65536,
              "minimum": 1,
              "type": "integer"
            },
            "taskId": {
              "$ref": "#/$defs/TaskId"
            }
          },
          "required": [
            "caseId",
            "taskId"
          ],
          "type": "object"
        },
        "TaskId": {
          "pattern": "^task_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        }
      },
      "$ref": "#/$defs/RenderTaskInput",
      "$schema": "https://json-schema.org/draft/2020-12/schema"
    },
    "outputSchema": {
      "$defs": {
        "CaseId": {
          "pattern": "^case_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "RenderTaskResult": {
          "additionalProperties": false,
          "properties": {
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "eventSequence": {
              "maximum": 9007199254740991,
              "minimum": 0,
              "type": "integer"
            },
            "format": {
              "enum": [
                "text",
                "markdown"
              ]
            },
            "nextCursor": {
              "maxLength": 8192,
              "minLength": 1,
              "type": "string"
            },
            "renderDigest": {
              "$ref": "#/$defs/Sha256"
            },
            "taskId": {
              "$ref": "#/$defs/TaskId"
            },
            "taskRevision": {
              "maximum": 9007199254740991,
              "minimum": 1,
              "type": "integer"
            },
            "text": {
              "maxLength": 65536,
              "minLength": 0,
              "type": "string"
            },
            "truncated": {
              "type": "boolean"
            }
          },
          "required": [
            "caseId",
            "taskId",
            "taskRevision",
            "eventSequence",
            "format",
            "text",
            "truncated",
            "renderDigest"
          ],
          "type": "object"
        },
        "Sha256": {
          "pattern": "^[0-9a-f]{64}$",
          "type": "string"
        },
        "TaskId": {
          "pattern": "^task_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        }
      },
      "$ref": "#/$defs/RenderTaskResult",
      "$schema": "https://json-schema.org/draft/2020-12/schema"
    },
    "inputSchemaDigest": "1f5c2491dc3c657948b50ff8537a431ef89d39561f4d3dba43681d9e74fcf91b",
    "resultSchemaDigest": "48dbb0552b88d3b39085c79db56e810843be2ed57bfb46e6ba1de60074b5501f",
    "maxResultBytes": 65536
  },
  {
    "name": "read_artifact",
    "title": "Read Artifact",
    "description": "Read one bounded authorized immutable Artifact byte range.",
    "version": 1,
    "inputRoot": "ReadArtifactInput",
    "resultRoot": "ReadArtifactResult",
    "mutation": false,
    "owner": "artifact_store",
    "routing": "case_artifact",
    "retryClass": "read_only",
    "approvalClass": "none",
    "riskClass": "read",
    "resultBound": "artifact",
    "annotations": {
      "readOnlyHint": true,
      "idempotentHint": true,
      "destructiveHint": false,
      "openWorldHint": false
    },
    "inputSchema": {
      "$defs": {
        "ArtifactId": {
          "pattern": "^artifact_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "CaseId": {
          "pattern": "^case_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "ReadArtifactInput": {
          "additionalProperties": false,
          "properties": {
            "artifactId": {
              "$ref": "#/$defs/ArtifactId"
            },
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "length": {
              "maximum": 262144,
              "minimum": 1,
              "type": "integer"
            },
            "offset": {
              "maximum": 9007199254740991,
              "minimum": 0,
              "type": "integer"
            }
          },
          "required": [
            "caseId",
            "artifactId"
          ],
          "type": "object"
        }
      },
      "$ref": "#/$defs/ReadArtifactInput",
      "$schema": "https://json-schema.org/draft/2020-12/schema"
    },
    "outputSchema": {
      "$defs": {
        "ArtifactId": {
          "pattern": "^artifact_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "ArtifactRef": {
          "additionalProperties": false,
          "properties": {
            "artifactId": {
              "$ref": "#/$defs/ArtifactId"
            },
            "bytes": {
              "minimum": 0,
              "type": "integer"
            },
            "caseId": {
              "$ref": "#/$defs/CaseId"
            },
            "createdAt": {
              "$ref": "#/$defs/Timestamp"
            },
            "mediaType": {
              "maxLength": 256,
              "minLength": 1,
              "type": "string"
            },
            "sha256": {
              "$ref": "#/$defs/Sha256"
            },
            "taskId": {
              "$ref": "#/$defs/TaskId"
            }
          },
          "required": [
            "artifactId",
            "caseId",
            "taskId",
            "mediaType",
            "bytes",
            "sha256",
            "createdAt"
          ],
          "type": "object"
        },
        "CaseId": {
          "pattern": "^case_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "ReadArtifactResult": {
          "additionalProperties": false,
          "properties": {
            "artifact": {
              "$ref": "#/$defs/ArtifactRef"
            },
            "dataBase64": {
              "maxLength": 349528,
              "minLength": 0,
              "pattern": "^[A-Za-z0-9+/]*={0,2}$",
              "type": "string"
            },
            "eof": {
              "type": "boolean"
            },
            "offset": {
              "maximum": 9007199254740991,
              "minimum": 0,
              "type": "integer"
            },
            "rangeDigest": {
              "$ref": "#/$defs/Sha256"
            }
          },
          "required": [
            "artifact",
            "offset",
            "dataBase64",
            "eof",
            "rangeDigest"
          ],
          "type": "object"
        },
        "Sha256": {
          "pattern": "^[0-9a-f]{64}$",
          "type": "string"
        },
        "TaskId": {
          "pattern": "^task_[A-Za-z0-9_-]{8,120}$",
          "type": "string"
        },
        "Timestamp": {
          "format": "date-time",
          "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,9})?Z$",
          "type": "string"
        }
      },
      "$ref": "#/$defs/ReadArtifactResult",
      "$schema": "https://json-schema.org/draft/2020-12/schema"
    },
    "inputSchemaDigest": "7370db7dd6349eaba100d52c1ee2011057f0bac4c0c9790a8192caf6b7a84e6b",
    "resultSchemaDigest": "108485c641df1b328f53d4716dfb98d413f5ee136cc925cfa7aac911d187732a",
    "maxResultBytes": 262144
  }
] as const satisfies readonly CapabilityDescriptor[];

const CAPABILITY_BY_NAME = Object.freeze(Object.fromEntries(
  CAPABILITY_DESCRIPTORS.map((descriptor) => [descriptor.name, descriptor]),
) as Record<CapabilityName, CapabilityDescriptor>);

export function capabilityDescriptor(name: CapabilityName): CapabilityDescriptor {
  return CAPABILITY_BY_NAME[name];
}
