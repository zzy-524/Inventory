mod embedded;
mod http_server;
mod store;

use std::sync::Arc;
use store::Store;
use tauri::State;

type SharedStore = Arc<Store>;

#[derive(Debug, serde::Deserialize)]
struct AddOperatorArgs {
    name: String,
    username: String,
    password: String,
    department_id: Option<u64>,
}

#[derive(Debug, serde::Deserialize)]
struct AddProductArgs {
    name: String,
    category: Option<String>,
    spec: Option<String>,
    unit: Option<String>,
    cost_price: f64,
    department_id: Option<u64>,
}

#[derive(Debug, serde::Deserialize)]
struct AddStockRecordArgs {
    product_id: u64,
    #[serde(rename = "type")]
    record_type: String,
    quantity: f64,
    operator_id: Option<u64>,
    department_id: Option<u64>,
    remark: Option<String>,
    created_at: Option<String>,
}

#[tauri::command]
fn cmd_login(
    state: State<'_, SharedStore>,
    username: String,
    password: String,
) -> Result<serde_json::Value, String> {
    let (token, user) = state.login(&username, &password)?;
    Ok(serde_json::json!({ "token": token, "username": user }))
}

#[tauri::command]
fn cmd_register(
    state: State<'_, SharedStore>,
    username: String,
    password: String,
) -> Result<serde_json::Value, String> {
    state.register(&username, &password)?;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
fn cmd_verify(
    state: State<'_, SharedStore>,
    token: String,
) -> Result<serde_json::Value, String> {
    let username = state.verify_token(&token)?;
    Ok(serde_json::json!({ "valid": true, "username": username }))
}

#[tauri::command]
fn cmd_get_departments(
    state: State<'_, SharedStore>,
) -> Result<Vec<store::Department>, String> {
    Ok(state.get_departments())
}

#[tauri::command]
fn cmd_add_department(
    state: State<'_, SharedStore>,
    name: String,
    description: String,
    sort_order: Option<u64>,
) -> Result<serde_json::Value, String> {
    let id = state.add_department(&name, &description, sort_order.unwrap_or(0));
    Ok(serde_json::json!({ "id": id }))
}

#[tauri::command]
fn cmd_get_operators(
    state: State<'_, SharedStore>,
) -> Result<Vec<store::Operator>, String> {
    Ok(state.get_operators())
}

#[tauri::command]
fn cmd_add_operator(
    state: State<'_, SharedStore>,
    args: AddOperatorArgs,
) -> Result<serde_json::Value, String> {
    let id = state.add_operator(&args.name, &args.username, &args.password, args.department_id)?;
    Ok(serde_json::json!({ "id": id }))
}

#[tauri::command]
fn cmd_operator_login(
    state: State<'_, SharedStore>,
    username: String,
    password: String,
) -> Result<serde_json::Value, String> {
    let (token, name) = state.operator_login(&username, &password)?;
    Ok(serde_json::json!({ "token": token, "name": name }))
}

#[tauri::command]
fn cmd_get_products(state: State<'_, SharedStore>) -> Result<Vec<store::Product>, String> {
    Ok(state.get_products())
}

#[tauri::command]
fn cmd_add_product(
    state: State<'_, SharedStore>,
    args: AddProductArgs,
) -> Result<serde_json::Value, String> {
    let id = state.add_product(
        &args.name,
        args.category.as_deref().unwrap_or(""),
        args.spec.as_deref().unwrap_or(""),
        args.unit.as_deref().unwrap_or("件"),
        args.cost_price,
        args.department_id,
    );
    Ok(serde_json::json!({ "id": id }))
}

#[tauri::command]
fn cmd_delete_product(
    state: State<'_, SharedStore>,
    id: u64,
) -> Result<serde_json::Value, String> {
    state.delete_product(id)?;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
fn cmd_update_department(
    state: State<'_, SharedStore>,
    id: u64,
    name: String,
    description: String,
    sort_order: Option<u64>,
) -> Result<serde_json::Value, String> {
    state.update_department(id, &name, &description, sort_order.unwrap_or(0))?;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
fn cmd_delete_department(
    state: State<'_, SharedStore>,
    id: u64,
) -> Result<serde_json::Value, String> {
    state.delete_department(id)?;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
fn cmd_update_operator(
    state: State<'_, SharedStore>,
    id: u64,
    name: String,
    username: String,
    password: Option<String>,
    department_id: Option<u64>,
) -> Result<serde_json::Value, String> {
    state.update_operator(id, &name, &username, password.as_deref(), department_id)?;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
fn cmd_delete_operator(
    state: State<'_, SharedStore>,
    id: u64,
) -> Result<serde_json::Value, String> {
    state.delete_operator(id)?;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
fn cmd_get_inventory(
    state: State<'_, SharedStore>,
) -> Result<Vec<store::Inventory>, String> {
    Ok(state.get_inventory())
}

#[tauri::command]
fn cmd_update_inventory(
    state: State<'_, SharedStore>,
    items: Vec<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let count = state.update_inventory_batch(items)?;
    Ok(serde_json::json!({ "success": true, "count": count }))
}

#[tauri::command]
fn cmd_get_stock_records(
    state: State<'_, SharedStore>,
) -> Result<Vec<store::StockRecord>, String> {
    Ok(state.get_stock_records())
}

#[tauri::command]
fn cmd_add_stock_record(
    state: State<'_, SharedStore>,
    args: AddStockRecordArgs,
) -> Result<serde_json::Value, String> {
    let id = state.add_stock_record(
        args.product_id,
        &args.record_type,
        args.quantity,
        args.operator_id,
        args.department_id,
        args.remark.as_deref().unwrap_or(""),
        args.created_at.as_deref(),
    );
    Ok(serde_json::json!({ "id": id }))
}

// ====== Fixed Assets ======
#[derive(Debug, serde::Deserialize)]
struct FixedAssetArgs {
    name: String,
    model: Option<String>,
    unit: Option<String>,
    department_id: Option<u64>,
    quantity: Option<f64>,
    setup_date: Option<String>,
    asset_no: Option<String>,
    custodian: Option<String>,
    remark: Option<String>,
}

#[tauri::command]
fn cmd_get_fixed_assets(
    state: State<'_, SharedStore>,
) -> Result<Vec<store::FixedAsset>, String> {
    Ok(state.get_fixed_assets())
}

#[tauri::command]
fn cmd_add_fixed_asset(
    state: State<'_, SharedStore>,
    args: FixedAssetArgs,
) -> Result<serde_json::Value, String> {
    let id = state.add_fixed_asset(
        &args.name, args.model.as_deref().unwrap_or(""), args.unit.as_deref().unwrap_or("件"),
        args.department_id, args.quantity.unwrap_or(1.0),
        args.setup_date.as_deref().unwrap_or(""), args.asset_no.as_deref().unwrap_or(""),
        args.custodian.as_deref().unwrap_or(""), args.remark.as_deref().unwrap_or(""),
    );
    Ok(serde_json::json!({ "id": id }))
}

#[tauri::command]
fn cmd_update_fixed_asset(
    state: State<'_, SharedStore>,
    id: u64,
    args: FixedAssetArgs,
) -> Result<serde_json::Value, String> {
    state.update_fixed_asset(
        id, &args.name, args.model.as_deref().unwrap_or(""), args.unit.as_deref().unwrap_or("件"),
        args.department_id, args.quantity.unwrap_or(1.0),
        args.setup_date.as_deref().unwrap_or(""), args.asset_no.as_deref().unwrap_or(""),
        args.custodian.as_deref().unwrap_or(""), args.remark.as_deref().unwrap_or(""),
    )?;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
fn cmd_delete_fixed_asset(
    state: State<'_, SharedStore>,
    id: u64,
) -> Result<serde_json::Value, String> {
    state.delete_fixed_asset(id)?;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
fn cmd_export(
    state: State<'_, SharedStore>,
    export_type: String,
    format: String,
) -> Result<serde_json::Value, String> {
    let (data, filename) = state.export_data(&export_type, &format)?;
    Ok(serde_json::json!({ "data": data, "filename": filename }))
}

#[tauri::command]
fn cmd_import(
    state: State<'_, SharedStore>,
    import_type: String,
    data: Vec<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let count = state.import_data(&import_type, data)?;
    Ok(serde_json::json!({ "success": true, "count": count }))
}

#[tauri::command]
fn cmd_get_table_configs(
    state: State<'_, SharedStore>,
) -> Result<Vec<store::TableConfig>, String> {
    Ok(state.get_table_configs())
}

#[tauri::command]
fn cmd_get_table_config(
    state: State<'_, SharedStore>,
    page: String,
) -> Result<Option<store::TableConfig>, String> {
    Ok(state.get_table_config(&page))
}

#[tauri::command]
fn cmd_update_table_config(
    state: State<'_, SharedStore>,
    page: String,
    columns: serde_json::Value,
) -> Result<serde_json::Value, String> {
    state.update_table_config(&page, columns)?;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
fn cmd_clear_all(state: State<'_, SharedStore>) -> Result<serde_json::Value, String> {
    state.clear_all();
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
fn cmd_get_system_info(
    state: State<'_, SharedStore>,
) -> Result<serde_json::Value, String> {
    Ok(state.get_system_info())
}

#[tauri::command]
fn cmd_backup(
    state: State<'_, SharedStore>,
) -> Result<serde_json::Value, String> {
    Ok(state.backup())
}

#[tauri::command]
fn cmd_restore(
    state: State<'_, SharedStore>,
    data: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let count = state.restore(data)?;
    Ok(serde_json::json!({ "success": true, "count": count }))
}

#[tauri::command]
fn cmd_save_file(
    filepath: String,
    content: Vec<u8>,
) -> Result<serde_json::Value, String> {
    // ensure parent directory exists
    if let Some(parent) = std::path::Path::new(&filepath).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(&filepath, &content)
        .map_err(|e| format!("保存文件失败: {}", e))?;
    Ok(serde_json::json!({ "path": filepath }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let store = Arc::new(Store::new());

    // Start HTTP server for LAN/browser access
    let (local_url, lan_urls) = http_server::start(store.clone(), 8888);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(store)
        .manage(ServerInfo {
            local_url,
            lan_urls: Arc::new(lan_urls),
        })
        .invoke_handler(tauri::generate_handler![
            cmd_login,
            cmd_register,
            cmd_verify,
            cmd_get_departments,
            cmd_add_department,
            cmd_update_department,
            cmd_delete_department,
            cmd_get_operators,
            cmd_add_operator,
            cmd_update_operator,
            cmd_delete_operator,
            cmd_operator_login,
            cmd_get_products,
            cmd_add_product,
            cmd_delete_product,
            cmd_get_inventory,
            cmd_update_inventory,
            cmd_get_stock_records,
            cmd_add_stock_record,
            cmd_get_fixed_assets,
            cmd_add_fixed_asset,
            cmd_update_fixed_asset,
            cmd_delete_fixed_asset,
            cmd_export,
            cmd_import,
            cmd_get_table_configs,
            cmd_get_table_config,
            cmd_update_table_config,
            cmd_get_system_info,
            cmd_get_server_urls,
            cmd_backup,
            cmd_restore,
            cmd_clear_all,
            cmd_save_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

struct ServerInfo {
    local_url: String,
    lan_urls: Arc<Vec<String>>,
}

#[tauri::command]
fn cmd_get_server_urls(
    info: State<'_, ServerInfo>,
) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "localUrl": info.local_url,
        "lanUrls": *info.lan_urls,
    }))
}
