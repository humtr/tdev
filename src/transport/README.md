# Device-routing correlation core

`RequestRendezvous` implements bounded volatile request correlation only. It is not
a deployed Worker/DO, a WebSocket listener, a device authenticator or a work ledger.
The adapter may call attach/receive only after installation-scoped authentication.
Human identity assertions must be verified at ingress and again on the device.
Unknown device availability never authorizes source writes or skips validation.

One map lives only while HTTP observations are pending. Replacing/disconnecting a
socket rejects its pending observations as delivery-unknown; old socket callbacks
cannot settle new observations. Offline-before-send reports not-sent. No automatic
request retry, work creation, cancellation or provider effect occurs. Durable
same-request recovery belongs to the device ledger. A routing restart may discard
this map and lose responses; it must not advertise no-effect or terminal success.

HTTP/WebSocket adapters must enforce byte/time limits while collecting input,
without buffering arbitrary bodies first, and check closed domain output schemas.
These functions enforce a second decoded-body limit but do not replace streaming
limits, actual provider hibernation/restart tests, auth or socket backpressure.
Transport bounds are configuration, not an eight-worker identity space.

The standard failure encoder preserves delivery uncertainty and same-request retry.
It does not reinterpret a lost transport response as an integrity failure or a
terminal work outcome. These semantics are regression-tested through the actual
domain encoder, not only on the transport exception object.
