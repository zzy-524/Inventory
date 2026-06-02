use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

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
    // 1. 直接尝试 PATH 查找
    if Command::new("node")
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok()
    {
        return Some(PathBuf::from("node"));
    }

    // 2. 常见安装路径
    let common_paths = [
        "/usr/local/bin/node",
        "/opt/homebrew/bin/node",
        "/usr/bin/node",
        "/usr/local/bin/node",
        "/opt/local/bin/node",
    ];
    for p in &common_paths {
        let path = PathBuf::from(p);
        if path.exists() {
            return Some(path);
        }
    }

    // 3. 通过 which 命令查找
    if let Ok(output) = Command::new("sh")
        .args(["-c", "which node 2>/dev/null || command -v node 2>/dev/null"])
        .output()
    {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !path.is_empty() {
            let pb = PathBuf::from(&path);
            if pb.exists() {
                return Some(pb);
            }
        }
    }

    None
}

fn start_server() -> Option<Child> {
    let node_path = find_node()?;
    eprintln!("Node found: {:?}", node_path);

    // 按优先级搜索 server.cjs
    let mut search_dirs: Vec<PathBuf> = Vec::new();

    // 1. 当前工作目录
    if let Ok(cwd) = std::env::current_dir() {
        search_dirs.push(cwd.clone());
        search_dirs.push(cwd.join("..").join("Inventory"));
    }

    // 2. 应用包 Resources 目录
    if let Ok(exe) = std::env::current_exe() {
        if let Some(resources) = exe
            .parent()
            .and_then(|p| p.parent())
            .map(|p| p.join("Resources"))
        {
            search_dirs.push(resources.clone());
            // Tauri v2 将上级目录资源放在 _up_ 子目录
            search_dirs.push(resources.join("_up_"));
        }
    }

    // 3. ~/.inventory-app/
    if let Ok(home) = std::env::var("HOME") {
        search_dirs.push(PathBuf::from(&home).join(".inventory-app"));
    }

    for dir in &search_dirs {
        if dir.join("server.cjs").exists() {
            if let Ok(child) = Command::new(&node_path)
                .arg("server.cjs")
                .current_dir(dir)
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
            {
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
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
