//! Loopback MCP HTTP; no transport-owned feature decisions or SQL.
use crate::{admission::Context, application::Application, identity, wire};
use axum::{
    Router,
    body::{Body, Bytes, to_bytes},
    extract::{Request, State},
    http::{HeaderMap, StatusCode},
    response::Response,
};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::{Value, json};
use std::{
    pin::Pin,
    sync::Arc,
    task::{Context as TaskContext, Poll},
};
use tokio::sync::{Semaphore, mpsc};

#[derive(Clone)]
struct Server {
    app: Arc<Application>,
    port: u16,
    capacity: Arc<Semaphore>,
}
fn response(status: u16, value: &Value) -> Response {
    let bytes = wire::canonical(value).unwrap_or_else(|_| b"{}".to_vec());
    Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .header("cache-control", "no-store")
        .header("connection", "close")
        .body(Body::from(bytes))
        .unwrap()
}
fn rpc_error(id: &Value, status: u16, code: i64, message: &str, data: Option<Value>) -> Response {
    let mut error = json!({"code":code,"message":message});
    if let Some(data) = data {
        error["data"] = data;
    }
    response(status, &json!({"jsonrpc":"2.0","id":id,"error":error}))
}
fn one<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    let mut values = headers.get_all(name).iter();
    let value = values.next()?.to_str().ok()?;
    if values.next().is_some()
        || !value
            .bytes()
            .all(|b| b == b'\t' || (0x20..=0x7e).contains(&b))
    {
        return None;
    }
    Some(value)
}
fn decoded_header(value: &str) -> Option<String> {
    if let Some(encoded) = value.strip_prefix("=?base64?") {
        return String::from_utf8(STANDARD.decode(encoded.strip_suffix("?=")?).ok()?).ok();
    }
    Some(value.into())
}
fn result(app: &Application, id: &Value, mut result: Value) -> Value {
    result["_meta"] = json!({"io.modelcontextprotocol/serverInfo":{"name":"tdev","version":crate::VERSION},"io.modelcontextprotocol/resultType":"complete"});
    // Discovery may already carry metadata; the protocol-owned fields above are fixed.
    let _ = app;
    json!({"jsonrpc":"2.0","id":id,"result":result})
}
fn tool_result(app: &Application, id: &Value, value: Value) -> Value {
    let text = String::from_utf8(wire::canonical(&value).unwrap()).unwrap();
    result(
        app,
        id,
        json!({"content":[{"type":"text","text":text}],"structuredContent":value,"isError":value["ok"]!=true}),
    )
}
async fn handle(State(server): State<Server>, request: Request) -> Response {
    let headers = request.headers();
    let expected = format!("127.0.0.1:{}", server.port);
    let alternative = format!("localhost:{}", server.port);
    let Some(host) = one(headers, "host").filter(|h| *h == expected || *h == alternative) else {
        return response(403, &json!({"error":"HOST"}));
    };
    if headers.contains_key("origin")
        && one(headers, "origin") != Some(format!("http://{host}").as_str())
    {
        return response(403, &json!({"error":"ORIGIN"}));
    }
    let path = request.uri().path().to_owned();
    let method = request.method().clone();
    if path == "/healthz" && method == "GET" {
        return response(
            200,
            &json!({"status":"up","version":crate::VERSION,"pid":std::process::id(),"diagnostics":"off"}),
        );
    }
    if path.starts_with("/.well-known/") {
        return response(404, &json!({"error":"NOT_FOUND"}));
    }
    let permit = match server.capacity.clone().try_acquire_owned() {
        Ok(p) => p,
        Err(_) => return response(503, &json!({"error":"BUSY"})),
    };
    let Some(bearer) = one(headers, "authorization")
        .and_then(|h| h.strip_prefix("Bearer "))
        .filter(|b| !b.is_empty() && b.len() <= 4096)
    else {
        return response(401, &json!({"error":"AUTHENTICATION_REQUIRED"}));
    };
    let app = server.app.clone();
    let bearer = bearer.to_owned();
    let authority = tokio::task::spawn_blocking(move || {
        (Context::load(&app.config, &bearer, &app.contract), permit)
    })
    .await;
    let (context, permit) = match authority {
        Ok((Ok(c), p)) => (c, p),
        _ => return response(401, &json!({"error":"AUTHENTICATION_REQUIRED"})),
    };
    if method != "POST" {
        let mut reply = response(405, &json!({"error":"METHOD"}));
        reply.headers_mut().insert("allow", "POST".parse().unwrap());
        return reply;
    }
    if path != "/mcp" {
        return response(404, &json!({"error":"NOT_FOUND"}));
    }
    let headers = request.headers();
    if one(headers, "content-type").and_then(|h| h.split(';').next()) != Some("application/json") {
        return response(415, &json!({"error":"CONTENT_TYPE"}));
    }
    if !one(headers, "accept")
        .is_some_and(|h| h.contains("application/json") && h.contains("text/event-stream"))
    {
        return response(406, &json!({"error":"ACCEPT"}));
    }
    let length = one(headers, "content-length").and_then(|s| s.parse::<usize>().ok());
    if headers.contains_key("transfer-encoding")
        || !length.is_some_and(|n| n > 0 && n <= 2 * 1024 * 1024)
    {
        return response(413, &json!({"error":"BODY_LIMIT"}));
    }
    let headers = headers.clone();
    let bytes = match tokio::time::timeout(
        std::time::Duration::from_secs(10),
        to_bytes(request.into_body(), 2 * 1024 * 1024),
    )
    .await
    {
        Ok(Ok(b)) => b,
        _ => return response(400, &json!({"error":"BODY"})),
    };
    let decoded = match wire::Json::parse(&bytes) {
        Ok(v) => v,
        Err(_) => return rpc_error(&Value::Null, 400, -32700, "Parse error", None),
    };
    let body = &decoded.value;
    let id = body.get("id").cloned().unwrap_or(Value::Null);
    let valid_id = matches!(
        decoded.original_at(&["id"]),
        Ok(identity::Value::Integer(_) | identity::Value::String(_))
    );
    if body["jsonrpc"] != "2.0" || !valid_id || !body["method"].is_string() {
        return rpc_error(&Value::Null, 400, -32600, "Invalid request", None);
    }
    let method = body["method"].as_str().unwrap();
    let Some(params) = body.get("params").filter(|p| p.is_object()) else {
        return rpc_error(&id, 400, -32602, "Invalid params", None);
    };
    let meta = &params["_meta"];
    if !meta.is_object()
        || !meta["io.modelcontextprotocol/protocolVersion"].is_string()
        || !meta["io.modelcontextprotocol/clientCapabilities"].is_object()
    {
        return rpc_error(&id, 400, -32602, "Request metadata required", None);
    }
    let version = server.app.contract.schema()["x-mcp"]["protocolVersion"]
        .as_str()
        .unwrap();
    let header_version = one(&headers, "mcp-protocol-version");
    let header_method = one(&headers, "mcp-method").and_then(decoded_header);
    if header_version != meta["io.modelcontextprotocol/protocolVersion"].as_str()
        || header_method.as_deref() != Some(method)
    {
        return rpc_error(&id, 400, -32020, "Header metadata mismatch", None);
    }
    if header_version != Some(version) {
        return rpc_error(
            &id,
            400,
            -32022,
            "Unsupported protocol version",
            Some(json!({"supported":[version],"requested":header_version})),
        );
    }
    let progress = meta.get("progressToken").cloned().filter(|p| !p.is_null());
    if progress
        .as_ref()
        .is_some_and(|p| !p.is_string() && !p.is_number())
    {
        return rpc_error(&id, 400, -32602, "Invalid progress token", None);
    }
    match method {
        "server/discover" => response(
            200,
            &result(
                &server.app,
                &id,
                json!({"supportedVersions":[version],"capabilities":{"tools":{}},"ttlMs":0,"cacheScope":"private"}),
            ),
        ),
        "tools/list" => response(
            200,
            &result(
                &server.app,
                &id,
                json!({"tools":server.app.surface.tools,"ttlMs":0,"cacheScope":"private"}),
            ),
        ),
        "tools/call" => {
            let Some(name) = params["name"]
                .as_str()
                .filter(|n| server.app.surface.contains(n))
            else {
                return rpc_error(&id, 400, -32602, "Unknown tool", None);
            };
            if one(&headers, "mcp-name")
                .and_then(decoded_header)
                .as_deref()
                != Some(name)
            {
                return rpc_error(&id, 400, -32020, "Header metadata mismatch", None);
            }
            let Some(arguments) = params.get("arguments").filter(|a| a.is_object()) else {
                return rpc_error(&id, 400, -32602, "Invalid arguments", None);
            };
            let original = decoded
                .original_at(&["params", "arguments", "request"])
                .cloned()
                .unwrap_or(identity::Value::Null);
            let stream = name == "tdev_operation"
                && arguments["request"]["action"] == "status"
                && wire::bounded(&arguments["request"], "waitMs", 0, 30000).is_ok_and(|n| n > 0)
                && progress.is_some();
            let app = server.app.clone();
            let name = name.to_owned();
            let arguments = arguments.clone();
            let mut worker = tokio::task::spawn_blocking(move || {
                let _permit = permit;
                app.call(&context, &name, &arguments, &original)
            });
            if stream {
                let (sender, receiver) = mpsc::channel(2);
                let app = server.app.clone();
                tokio::spawn(async move {
                    let _ = sender
                        .send(Ok(Bytes::from_static(b":tdev-stream\n\n")))
                        .await;
                    let mut ticks = 0;
                    loop {
                        match tokio::time::timeout(std::time::Duration::from_secs(1), &mut worker)
                            .await
                        {
                            Ok(value) => {
                                let value=value.unwrap_or_else(|_|json!({"ok":false,"error":crate::model::Fault::new("INTERNAL")}));
                                let reply = tool_result(&app, &id, value);
                                let mut bytes = b"event: message\ndata: ".to_vec();
                                bytes.extend(wire::canonical(&reply).unwrap());
                                bytes.extend(b"\n\n");
                                let _ = sender.send(Ok(Bytes::from(bytes))).await;
                                break;
                            }
                            Err(_) => {
                                ticks += 1;
                                let notification = json!({"jsonrpc":"2.0","method":"notifications/progress","params":{"progressToken":progress,"progress":ticks}});
                                let mut bytes = b"event: message\ndata: ".to_vec();
                                bytes.extend(wire::canonical(&notification).unwrap());
                                bytes.extend(b"\n\n");
                                if sender.send(Ok(Bytes::from(bytes))).await.is_err() {
                                    break;
                                }
                            }
                        }
                    }
                });
                Response::builder()
                    .status(StatusCode::OK)
                    .header("content-type", "text/event-stream")
                    .header("cache-control", "no-store")
                    .header("connection", "close")
                    .header("x-accel-buffering", "no")
                    .body(Body::from_stream(SseStream(receiver)))
                    .unwrap()
            } else {
                match worker.await {
                    Ok(value) => response(200, &tool_result(&server.app, &id, value)),
                    Err(_) => rpc_error(&id, 500, -32603, "Internal error", None),
                }
            }
        }
        _ => rpc_error(&id, 404, -32601, "Method not found", None),
    }
}
struct SseStream(mpsc::Receiver<std::result::Result<Bytes, std::io::Error>>);
impl futures_core::Stream for SseStream {
    type Item = std::result::Result<Bytes, std::io::Error>;
    fn poll_next(mut self: Pin<&mut Self>, cx: &mut TaskContext<'_>) -> Poll<Option<Self::Item>> {
        self.0.poll_recv(cx)
    }
}
pub async fn serve(app: Arc<Application>, port: u16) -> std::io::Result<()> {
    let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port)).await?;
    let port = listener.local_addr()?.port();
    axum::serve(
        listener,
        Router::new().fallback(handle).with_state(Server {
            app,
            port,
            capacity: Arc::new(Semaphore::new(8)),
        }),
    )
    .await
}
