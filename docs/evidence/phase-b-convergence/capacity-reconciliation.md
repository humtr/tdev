# Live capacity falsifier: retained idle provider observations

Actual runtime11:14:44Z: owner7, installeddevicef0d1dbff, capacity8,
executingActions1, reservedAttempts1, managed activeSessions8. Native still projects
ready sessions with deadlines from04:23/04:33/04:47/07:27/10:50/10:52Z, while no
current work polls those resource IDs. This is not evidence that any particular
provider job has stopped: expiry/native absence cannot prove it. It does show the
physical-slot admission path needs bounded authenticated provider reconciliation.

This repair does not reopen the closed generation8 cancellation/retirement fix.
It leaves replaceUnassigned, cancel authority, immutable attempts/dispatch/history,
source/result binding and provider terminal CAS unchanged. It adds only coalesced
read-only observation of aged/cancelling/old-owner sent sessions at full capacity.
Fresh usable warm sessions are not cancelled or relaunched. Current authenticated
provider terminal evidence closes the original resource through existing methods;
unknown/still-running sessions remain occupied. Individual observation failure
cannot stop other independent observations. No global work result is synthesized.

Deterministic tests exercise real ledger ownership, exact retained session/run IDs,
concurrent bounded reads, unknown resource isolation, restart and configuration32.
They are not actual eight-way acceptance. Source must pass required managed tests
and canonical publication; the installed runtime then requires actual same-path
capacity readback and eight independent overlapping works before that claim.
