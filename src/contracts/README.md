# Shared contract boundary

These checked JSDoc ports implement the accepted D0001-D0006 identities. They are
internal interfaces, not a public arbitrary-operation registry. Lanes import them
instead of copying them. Shared changes have one integration owner.

PreparedResult is action-independent. Validation identity is never success.
ValidationPort.verify is the trusted eligibility boundary; local CLI JSON is not
an authenticated sandbox receipt. LedgerPort.transaction rejects thenables and
never keeps a transaction open across I/O. Revisions are uint64 decimal strings,
never lossy JavaScript numbers or SQLite signed INTEGER values.

No digest, repository file, log or tool annotation supplies authorization.
