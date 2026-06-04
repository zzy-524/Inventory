use crate::embedded::Assets;
use crate::store::Store;
use std::sync::Arc;
use std::thread;
use tiny_http::{Header, Method, Response, Server};

/// 启动 HTTP 服务器，返回 localhost URL 和 LAN URLs
pub fn start(store: Arc<Store>, port: u16) -> (String, Vec<String>) {
    let local_url = format!("http://localhost:{}", port);

    let lan_ips = local_ip_address::list_afinet_netifas()
        .map(|ifs| {
            ifs.into_iter()
                .filter(|(_, ip)| {
                    let s = ip.to_string();
                    s.starts_with("192.") || s.starts_with("10.") || s.starts_with("172.")
                })
                .map(|(_, ip)| format!("http://{}:{}", ip, port))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let urls = lan_ips.clone();
    let store_clone = store.clone();

    thread::spawn(move || {
        let addr = format!("0.0.0.0:{}", port);
        let server = match Server::http(&addr) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("HTTP server error: {:?}", e);
                return;
            }
        };

        for mut request in server.incoming_requests() {
            let path = request.url().to_string();
            let method = request.method().clone();

            let response = if path.starts_with("/api/") {
                handle_api(&store_clone, &mut request, &method, &path)
            } else {
                serve_embedded(&path)
            };

            if let Some(resp) = response {
                let _ = request.respond(resp);
            }
        }
    });

    (local_url, urls)
}

fn serve_embedded(path: &str) -> Option<Response<std::io::Cursor<Vec<u8>>>> {
    let file_path = if path == "/" || path.is_empty() {
        "index.html"
    } else {
        path.trim_start_matches('/')
    };

    // Try exact match first, then SPA fallback to index.html
    let (data, content_type) = if let Some(file) = Assets::get(file_path) {
        (file.data.to_vec(), mime_for_path(file_path))
    } else {
        // SPA fallback: serve index.html for any non-file route
        match Assets::get("index.html") {
            Some(file) => (file.data.to_vec(), "text/html; charset=utf-8"),
            None => return Some(Response::from_string("Not Found").with_status_code(404)),
        }
    };

    let header = Header::from_bytes("Content-Type", content_type).unwrap();
    Some(Response::from_data(data).with_header(header))
}

fn mime_for_path(path: &str) -> &'static str {
    let ext = path.rfind('.').map(|i| &path[i + 1..]).unwrap_or("");
    match ext {
        "html" => "text/html; charset=utf-8",
        "js" => "application/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}

fn read_body(request: &mut tiny_http::Request) -> serde_json::Value {
    let mut body = String::new();
    let _ = request.as_reader().read_to_string(&mut body);
    serde_json::from_str(&body).unwrap_or(serde_json::Value::Null)
}

fn json_response(data: serde_json::Value) -> Response<std::io::Cursor<Vec<u8>>> {
    let json = data.to_string();
    let header = Header::from_bytes("Content-Type", "application/json; charset=utf-8").unwrap();
    let cors = Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap();
    Response::from_string(json)
        .with_header(header)
        .with_header(cors)
}

fn status_json(data: serde_json::Value, code: u16) -> Response<std::io::Cursor<Vec<u8>>> {
    json_response(data).with_status_code(code)
}

fn handle_api(
    store: &Arc<Store>,
    request: &mut tiny_http::Request,
    method: &Method,
    path: &str,
) -> Option<Response<std::io::Cursor<Vec<u8>>>> {
    // CORS preflight
    if *method == Method::Options {
        return Some(
            Response::from_string("")
                .with_status_code(204)
                .with_header(Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap())
                .with_header(Header::from_bytes("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS").unwrap())
                .with_header(Header::from_bytes("Access-Control-Allow-Headers", "Content-Type, Authorization").unwrap()),
        );
    }

    // API routes — call store methods directly (store has internal locking)
    let resp = match (method, path) {
        // Auth
        (m, "/api/auth/login") if *m == Method::Post => {
            let body = read_body(request);
            let u = body["username"].as_str().unwrap_or("");
            let p = body["password"].as_str().unwrap_or("");
            match store.login(u, p) {
                Ok((token, user)) => json_response(serde_json::json!({ "token": token, "username": user })),
                Err(e) => status_json(serde_json::json!({ "error": e }), 401),
            }
        }
        (m, "/api/auth/register") if *m == Method::Post => {
            let body = read_body(request);
            let u = body["username"].as_str().unwrap_or("");
            let p = body["password"].as_str().unwrap_or("");
            match store.register(u, p) {
                Ok(()) => json_response(serde_json::json!({ "success": true })),
                Err(e) => status_json(serde_json::json!({ "error": e }), 400),
            }
        }
        (m, "/api/auth/verify") if *m == Method::Get => {
            let token = request
                .headers()
                .iter()
                .find(|h| h.field.equiv("authorization"))
                .and_then(|h| h.value.as_str().strip_prefix("Bearer "))
                .unwrap_or("");
            match store.verify_token(token) {
                Ok(username) => json_response(serde_json::json!({ "valid": true, "username": username })),
                Err(e) => status_json(serde_json::json!({ "error": e }), 401),
            }
        }

        // Departments
        (m, "/api/departments") if *m == Method::Get => {
            json_response(serde_json::json!(store.get_departments()))
        }
        (m, "/api/departments") if *m == Method::Post => {
            let body = read_body(request);
            let name = body["name"].as_str().unwrap_or("");
            let desc = body["description"].as_str().unwrap_or("");
            let id = store.add_department(name, desc, body["sort_order"].as_u64().unwrap_or(0));
            json_response(serde_json::json!({ "id": id }))
        }

        // PUT /api/departments
        (m, p) if *m == Method::Put && p.starts_with("/api/departments/") => {
            let id: u64 = p.trim_start_matches("/api/departments/").parse().unwrap_or(0);
            let body = read_body(request);
            match store.update_department(
                id,
                body["name"].as_str().unwrap_or(""),
                body["description"].as_str().unwrap_or(""),
                body["sort_order"].as_u64().unwrap_or(0),
            ) {
                Ok(()) => json_response(serde_json::json!({ "success": true })),
                Err(e) => status_json(serde_json::json!({ "error": e }), 400),
            }
        }

        // Operators
        (m, "/api/operators") if *m == Method::Get => {
            json_response(serde_json::json!(store.get_operators()))
        }
        (m, "/api/operators") if *m == Method::Post => {
            let body = read_body(request);
            let name = body["name"].as_str().unwrap_or("");
            let username = body["username"].as_str().unwrap_or("");
            let password = body["password"].as_str().unwrap_or("");
            match store.add_operator(name, username, password, body["department_id"].as_u64()) {
                Ok(id) => json_response(serde_json::json!({ "id": id })),
                Err(e) => status_json(serde_json::json!({ "error": e }), 400),
            }
        }
        (m, "/api/operator-login") if *m == Method::Post => {
            let body = read_body(request);
            let username = body["username"].as_str().unwrap_or("");
            let password = body["password"].as_str().unwrap_or("");
            match store.operator_login(username, password) {
                Ok((token, name)) => json_response(serde_json::json!({ "token": token, "name": name })),
                Err(e) => status_json(serde_json::json!({ "error": e }), 401),
            }
        }

        // Products
        (m, "/api/products") if *m == Method::Get => {
            json_response(serde_json::json!(store.get_products()))
        }
        (m, "/api/products") if *m == Method::Post => {
            let body = read_body(request);
            let id = store.add_product(
                body["name"].as_str().unwrap_or(""),
                body["category"].as_str().unwrap_or(""),
                body["spec"].as_str().unwrap_or(""),
                body["unit"].as_str().unwrap_or("件"),
                body["cost_price"].as_f64().unwrap_or(0.0),
                body["department_id"].as_u64(),
            );
            json_response(serde_json::json!({ "id": id }))
        }

        // Inventory
        (m, "/api/inventory") if *m == Method::Get => {
            json_response(serde_json::json!(store.get_inventory()))
        }
        (m, "/api/inventory") if *m == Method::Put => {
            let body = read_body(request);
            let items: Vec<serde_json::Value> = serde_json::from_value(body).unwrap_or_default();
            match store.update_inventory_batch(items) {
                Ok(count) => json_response(serde_json::json!({ "success": true, "count": count })),
                Err(e) => status_json(serde_json::json!({ "error": e }), 400),
            }
        }

        // Stock records
        (m, "/api/stock-records") if *m == Method::Get => {
            json_response(serde_json::json!(store.get_stock_records()))
        }
        (m, "/api/stock-records") if *m == Method::Post => {
            let body = read_body(request);
            let created_at = body["created_at"].as_str();
            let id = store.add_stock_record(
                body["product_id"].as_u64().unwrap_or(0),
                body["type"].as_str().unwrap_or(""),
                body["quantity"].as_f64().unwrap_or(0.0),
                body["operator_id"].as_u64(),
                body["department_id"].as_u64(),
                body["remark"].as_str().unwrap_or(""),
                created_at,
            );
            json_response(serde_json::json!({ "id": id }))
        }

        // Export
        (m, p) if *m == Method::Post && p.starts_with("/api/export/") => {
            let export_type = &p["/api/export/".len()..];
            let body = read_body(request);
            let format = body["format"].as_str().unwrap_or("json");
            match store.export_data(export_type, format) {
                Ok((content, filename)) => {
                    let ct = if format == "csv" { "text/csv; charset=utf-8" } else { "application/json; charset=utf-8" };
                    let disp = format!("attachment; filename={}", filename);
                    let resp = Response::from_string(content)
                        .with_header(Header::from_bytes("Content-Type", ct).unwrap())
                        .with_header(Header::from_bytes("Content-Disposition", disp.as_bytes()).unwrap())
                        .with_header(Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap());
                    return Some(resp);
                }
                Err(e) => status_json(serde_json::json!({ "error": e }), 400),
            }
        }

        // Import
        (m, p) if *m == Method::Post && p.starts_with("/api/import/") => {
            let import_type = &p["/api/import/".len()..];
            let body = read_body(request);
            let rows = body["data"].as_array().cloned().unwrap_or_default();
            match store.import_data(import_type, rows) {
                Ok(count) => json_response(serde_json::json!({ "success": true, "count": count })),
                Err(e) => status_json(serde_json::json!({ "error": e }), 400),
            }
        }

        // Table configs
        (m, "/api/table-configs") if *m == Method::Get => {
            json_response(serde_json::json!(store.get_table_configs()))
        }
        (m, p) if *m == Method::Get && p.starts_with("/api/table-configs/") => {
            let page = &p["/api/table-configs/".len()..];
            json_response(serde_json::json!(store.get_table_config(page)))
        }
        (m, p) if *m == Method::Put && p.starts_with("/api/table-configs/") => {
            let page = &p["/api/table-configs/".len()..];
            let body = read_body(request);
            let columns = body["columns"].clone();
            match store.update_table_config(page, columns) {
                Ok(()) => json_response(serde_json::json!({ "success": true })),
                Err(e) => status_json(serde_json::json!({ "error": e }), 400),
            }
        }

        // System info
        (m, "/api/system/info") if *m == Method::Get => {
            json_response(store.get_system_info())
        }

        // Backup / Restore
        (m, "/api/backup") if *m == Method::Get => {
            json_response(store.backup())
        }
        (m, "/api/restore") if *m == Method::Post => {
            let body = read_body(request);
            match store.restore(body) {
                Ok(count) => json_response(serde_json::json!({ "success": true, "count": count })),
                Err(e) => status_json(serde_json::json!({ "error": e }), 400),
            }
        }
        (m, "/api/clear") if *m == Method::Post => {
            store.clear_all();
            json_response(serde_json::json!({ "success": true }))
        }

        _ => {
            return Some(status_json(serde_json::json!({ "error": "Not found" }), 404));
        }
    };

    Some(resp)
}
