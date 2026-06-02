use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;

struct ServerProcess(Mutex<Option<Child>>);

impl Drop for ServerProcess {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.0.lock() {
            if let Some(ref mut child) = *guard {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

/// 查找 node 可执行文件路径（Finder 启动时 PATH 可能不全）
fn find_node() -> Option<PathBuf> {
    if Command::new("node").arg("--version").stdout(Stdio::null()).stderr(Stdio::null()).status().is_ok() {
        return Some(PathBuf::from("node"));
    }
    let common_paths = [
        "/usr/local/bin/node", "/opt/homebrew/bin/node", "/usr/bin/node", "/opt/local/bin/node",
    ];
    for p in &common_paths {
        let path = PathBuf::from(p);
        if path.exists() { return Some(path); }
    }
    if let Ok(output) = Command::new("sh").args(["-c", "which node 2>/dev/null || command -v node 2>/dev/null"]).output() {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !path.is_empty() { let pb = PathBuf::from(&path); if pb.exists() { return Some(pb); } }
    }
    None
}

fn start_server() -> Option<Child> {
    let node_path = find_node()?;
    eprintln!("Node found: {:?}", node_path);

    let mut search_dirs: Vec<PathBuf> = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        search_dirs.push(cwd.clone());
        search_dirs.push(cwd.join("..").join("Inventory"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(resources) = exe.parent().and_then(|p| p.parent()).map(|p| p.join("Resources")) {
            search_dirs.push(resources.clone());
            search_dirs.push(resources.join("_up_"));
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        search_dirs.push(PathBuf::from(&home).join(".inventory-app"));
    }

    for dir in &search_dirs {
        if dir.join("server.cjs").exists() {
            if let Ok(child) = Command::new(&node_path).arg("server.cjs").current_dir(dir).stdout(Stdio::null()).stderr(Stdio::null()).spawn() {
                println!("Server started in: {:?}", dir);
                return Some(child);
            }
        }
    }
    eprintln!("server.cjs not found, searched: {:?}", search_dirs);
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let child = start_server();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(ServerProcess(Mutex::new(child)))
        .setup(|app| {
            // 等待服务器就绪后，导航到 Express 服务的前端页面
            let window = app.get_webview_window("main").unwrap();
            let window_clone = window.clone();
            std::thread::spawn(move || {
                // 轮询等待服务器启动
                for _ in 0..30 {
                    if std::net::TcpStream::connect("127.0.0.1:8888").is_ok() {
                        break;
                    }
                    std::thread::sleep(Duration::from_secs(1));
                }
                // 导航到 Express 服务器（绕过 Tauri 内部协议）
                let _ = window_clone.navigate("http://localhost:8888".parse().unwrap());
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
