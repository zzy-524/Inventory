use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

// ====== Data Types ======
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Department {
    pub id: u64,
    pub name: String,
    pub description: String,
    pub sort_order: u64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Operator {
    pub id: u64,
    pub name: String,
    pub username: String,
    #[serde(skip_serializing)]
    pub password: String,
    #[serde(skip_serializing)]
    pub salt: String,
    pub department_id: Option<u64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Product {
    pub id: u64,
    pub name: String,
    pub category: String,
    pub spec: String,
    pub unit: String,
    pub cost_price: f64,
    pub department_id: Option<u64>,
    pub deleted: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FixedAsset {
    pub id: u64,
    pub name: String,
    pub model: String,
    pub unit: String,
    pub department_id: Option<u64>,
    pub quantity: f64,
    pub setup_date: String,
    pub asset_no: String,
    pub custodian: String,
    pub remark: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Inventory {
    pub id: u64,
    pub product_id: u64,
    pub quantity: f64,
    pub min_quantity: f64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockRecord {
    pub id: u64,
    pub product_id: u64,
    #[serde(rename = "type")]
    pub record_type: String,
    pub quantity: f64,
    pub operator_id: Option<u64>,
    pub department_id: Option<u64>,
    pub remark: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableConfig {
    pub id: u64,
    pub page_key: String,
    pub columns: serde_json::Value,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: u64,
    pub username: String,
    pub password: String,
    pub salt: String,
    pub role: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub username: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoreData {
    departments: Vec<Department>,
    operators: Vec<Operator>,
    products: Vec<Product>,
    inventory: Vec<Inventory>,
    #[serde(rename = "stockRecords")]
    stock_records: Vec<StockRecord>,
    #[serde(rename = "fixedAssets")]
    fixed_assets: Vec<FixedAsset>,
    #[serde(rename = "tableConfigs")]
    table_configs: Vec<TableConfig>,
    users: Vec<User>,
    #[serde(rename = "nextId")]
    next_id: u64,
}

// ====== Store Implementation ======
pub struct Store {
    data: Mutex<StoreData>,
    sessions: Mutex<HashMap<String, SessionInfo>>,
    data_path: PathBuf,
}

impl StoreData {
    fn default_data() -> Self {
        StoreData {
            departments: vec![],
            operators: vec![],
            products: vec![],
            inventory: vec![],
            stock_records: vec![],
            fixed_assets: vec![],
            table_configs: vec![],
            users: vec![],
            next_id: 1,
        }
    }
}

impl Store {
    pub fn new() -> Self {
        let data_dir = Self::data_dir();
        let _ = fs::create_dir_all(&data_dir);
        let data_path = data_dir.join("data.json");

        let data = Self::load(&data_path);
        Self {
            data: Mutex::new(data),
            sessions: Mutex::new(HashMap::new()),
            data_path,
        }
    }

    fn data_dir() -> PathBuf {
        if let Ok(home) = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")) {
            PathBuf::from(&home).join(".inventory-app")
        } else {
            PathBuf::from(".").join(".inventory-app")
        }
    }

    fn load(path: &PathBuf) -> StoreData {
        match fs::read_to_string(path) {
            Ok(content) => {
                let mut data: StoreData =
                    serde_json::from_str(&content).unwrap_or_else(|_| StoreData::default_data());
                // Initialize users if empty
                if data.users.is_empty() {
                    Self::create_default_admin(&mut data);
                }
                Self::ensure_admin_operator(&mut data);
                let _ = Self::save_internal(path, &data);
                data
            }
            Err(_) => {
                let mut data = StoreData::default_data();
                Self::create_default_admin(&mut data);
                Self::ensure_admin_operator(&mut data);
                let _ = Self::save_internal(path, &data);
                data
            }
        }
    }

    fn ensure_admin_operator(data: &mut StoreData) {
        if !data.operators.iter().any(|o| o.username == "admin") {
            let id = data.next_id;
            data.next_id += 1;
            // Generate a random password hash for the admin operator
            use sha2::{Digest, Sha256};
            use rand::Rng;
            let salt: String = rand::thread_rng()
                .sample_iter(&rand::distributions::Alphanumeric)
                .take(32)
                .map(char::from)
                .collect();
            let mut hasher = Sha256::new();
            hasher.update(b"admin");
            hasher.update(salt.as_bytes());
            let password = format!("{:x}", hasher.finalize());
            data.operators.push(Operator {
                id,
                name: "管理员".to_string(),
                username: "admin".to_string(),
                password,
                salt,
                department_id: None,
                created_at: now_str(),
                updated_at: now_str(),
            });
        }
    }

    fn create_default_admin(data: &mut StoreData) {
        use sha2::{Digest, Sha256};
        use rand::Rng;

        let salt: String = rand::thread_rng()
            .sample_iter(&rand::distributions::Alphanumeric)
            .take(32)
            .map(char::from)
            .collect();

        let mut hasher = Sha256::new();
        hasher.update(b"admin");
        hasher.update(salt.as_bytes());
        let password = format!("{:x}", hasher.finalize());

        data.users.push(User {
            id: 1,
            username: "admin".to_string(),
            password,
            salt,
            role: "admin".to_string(),
            created_at: now_str(),
        });
    }

    fn persist(&self) {
        let data = self.data.lock().unwrap();
        let _ = Self::save_internal(&self.data_path, &data);
    }

    fn save_internal(path: &PathBuf, data: &StoreData) -> Result<(), String> {
        let json = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
        fs::write(path, json).map_err(|e| e.to_string())
    }

    fn gen_id(&self) -> u64 {
        let mut data = self.data.lock().unwrap();
        let id = data.next_id;
        data.next_id += 1;
        id
    }

    // ====== Auth ======
    pub fn login(&self, username: &str, password: &str) -> Result<(String, String), String> {
        use sha2::{Digest, Sha256};

        let data = self.data.lock().unwrap();
        let user = data
            .users
            .iter()
            .find(|u| u.username == username)
            .ok_or("用户名或密码错误")?;

        let mut hasher = Sha256::new();
        hasher.update(password.as_bytes());
        hasher.update(user.salt.as_bytes());
        let hash = format!("{:x}", hasher.finalize());

        if hash != user.password {
            return Err("用户名或密码错误".into());
        }

        let token = uuid::Uuid::new_v4().to_string();
        let mut sessions = self.sessions.lock().unwrap();
        sessions.insert(
            token.clone(),
            SessionInfo {
                username: username.to_string(),
                created_at: now_str(),
            },
        );

        Ok((token, username.to_string()))
    }

    pub fn register(&self, username: &str, password: &str) -> Result<(), String> {
        use sha2::{Digest, Sha256};
        use rand::Rng;

        if username.len() < 2 {
            return Err("用户名至少2个字符".into());
        }
        if password.len() < 4 {
            return Err("密码至少4个字符".into());
        }

        let mut data = self.data.lock().unwrap();
        if data.users.iter().any(|u| u.username == username) {
            return Err("用户名已存在".into());
        }

        let salt: String = rand::thread_rng()
            .sample_iter(&rand::distributions::Alphanumeric)
            .take(32)
            .map(char::from)
            .collect();

        let mut hasher = Sha256::new();
        hasher.update(password.as_bytes());
        hasher.update(salt.as_bytes());
        let password_hash = format!("{:x}", hasher.finalize());

        data.users.push(User {
            id: self.gen_id(),
            username: username.to_string(),
            password: password_hash,
            salt,
            role: "user".to_string(),
            created_at: now_str(),
        });

        drop(data);
        self.persist();
        Ok(())
    }

    pub fn verify_token(&self, token: &str) -> Result<String, String> {
        let sessions = self.sessions.lock().unwrap();
        sessions
            .get(token)
            .map(|s| s.username.clone())
            .ok_or("未登录".into())
    }

    // ====== Departments ======
    pub fn get_departments(&self) -> Vec<Department> {
        let mut depts = self.data.lock().unwrap().departments.clone();
        depts.sort_by_key(|d| d.sort_order);
        depts
    }

    pub fn add_department(&self, name: &str, description: &str, sort_order: u64) -> u64 {
        let id = self.gen_id();
        let mut data = self.data.lock().unwrap();
        data.departments.push(Department {
            id,
            name: name.to_string(),
            description: description.to_string(),
            sort_order,
            created_at: now_str(),
            updated_at: now_str(),
        });
        drop(data);
        self.persist();
        id
    }

    pub fn update_department(&self, id: u64, name: &str, description: &str, sort_order: u64) -> Result<(), String> {
        let mut data = self.data.lock().unwrap();
        let dept = data.departments.iter_mut().find(|d| d.id == id).ok_or("部门不存在")?;
        dept.name = name.to_string();
        dept.description = description.to_string();
        dept.sort_order = sort_order;
        dept.updated_at = now_str();
        drop(data);
        self.persist();
        Ok(())
    }

    pub fn delete_department(&self, id: u64) -> Result<(), String> {
        let mut data = self.data.lock().unwrap();
        data.departments.retain(|d| d.id != id);
        drop(data);
        self.persist();
        Ok(())
    }

    // ====== Operators ======
    pub fn get_operators(&self) -> Vec<Operator> {
        self.data.lock().unwrap().operators.clone()
    }

    pub fn add_operator(
        &self,
        name: &str,
        username: &str,
        password: &str,
        department_id: Option<u64>,
    ) -> Result<u64, String> {
        use sha2::{Digest, Sha256};
        use rand::Rng;

        // 校验用户名和密码
        if username.len() < 2 {
            return Err("账号至少2个字符".into());
        }
        if password.len() < 4 {
            return Err("密码至少4个字符".into());
        }

        let data = self.data.lock().unwrap();
        if data.operators.iter().any(|o| o.username == username) {
            return Err("账号已存在".into());
        }
        drop(data);

        let salt: String = rand::thread_rng()
            .sample_iter(&rand::distributions::Alphanumeric)
            .take(32)
            .map(char::from)
            .collect();

        let mut hasher = Sha256::new();
        hasher.update(password.as_bytes());
        hasher.update(salt.as_bytes());
        let password_hash = format!("{:x}", hasher.finalize());

        let id = self.gen_id();
        let mut data = self.data.lock().unwrap();
        data.operators.push(Operator {
            id,
            name: name.to_string(),
            username: username.to_string(),
            password: password_hash,
            salt,
            department_id,
            created_at: now_str(),
            updated_at: now_str(),
        });
        drop(data);
        self.persist();
        Ok(id)
    }

    pub fn update_operator(
        &self,
        id: u64,
        name: &str,
        username: &str,
        password: Option<&str>,
        department_id: Option<u64>,
    ) -> Result<(), String> {
        use sha2::{Digest, Sha256};
        use rand::Rng;

        let mut data = self.data.lock().unwrap();
        if data.operators.iter().any(|o| o.username == username && o.id != id) {
            return Err("账号已存在".into());
        }
        let op = data.operators.iter_mut().find(|o| o.id == id).ok_or("操作人不存在")?;
        op.name = name.to_string();
        op.username = username.to_string();
        if let Some(pw) = password {
            if pw.len() < 4 {
                return Err("密码至少4个字符".into());
            }
            let salt: String = rand::thread_rng()
                .sample_iter(&rand::distributions::Alphanumeric)
                .take(32)
                .map(char::from)
                .collect();
            let mut hasher = Sha256::new();
            hasher.update(pw.as_bytes());
            hasher.update(salt.as_bytes());
            op.password = format!("{:x}", hasher.finalize());
            op.salt = salt;
        }
        op.department_id = department_id;
        op.updated_at = now_str();
        drop(data);
        self.persist();
        Ok(())
    }

    pub fn delete_operator(&self, id: u64) -> Result<(), String> {
        let mut data = self.data.lock().unwrap();
        data.operators.retain(|o| o.id != id);
        drop(data);
        self.persist();
        Ok(())
    }

    pub fn operator_login(&self, username: &str, password: &str) -> Result<(String, String), String> {
        use sha2::{Digest, Sha256};

        let data = self.data.lock().unwrap();
        let operator = data
            .operators
            .iter()
            .find(|o| o.username == username)
            .ok_or("账号或密码错误")?;

        let mut hasher = Sha256::new();
        hasher.update(password.as_bytes());
        hasher.update(operator.salt.as_bytes());
        let hash = format!("{:x}", hasher.finalize());

        if hash != operator.password {
            return Err("账号或密码错误".into());
        }

        let operator_name = operator.name.clone();
        let token = uuid::Uuid::new_v4().to_string();
        drop(data);
        let mut sessions = self.sessions.lock().unwrap();
        sessions.insert(
            token.clone(),
            SessionInfo {
                username: operator_name.clone(),
                created_at: now_str(),
            },
        );

        Ok((token, operator_name))
    }

    // ====== Products ======
    pub fn get_products(&self) -> Vec<Product> {
        self.data.lock().unwrap().products.clone()
    }

    pub fn add_product(
        &self,
        name: &str,
        category: &str,
        spec: &str,
        unit: &str,
        cost_price: f64,
        department_id: Option<u64>,
    ) -> u64 {
        let product_id = self.gen_id();
        let inventory_id = self.gen_id();
        let mut data = self.data.lock().unwrap();
        data.products.push(Product {
            id: product_id,
            name: name.to_string(),
            category: category.to_string(),
            spec: spec.to_string(),
            unit: unit.to_string(),
            cost_price,
            department_id,
            deleted: false,
            created_at: now_str(),
            updated_at: now_str(),
        });
        data.inventory.push(Inventory {
            id: inventory_id,
            product_id,
            quantity: 0.0,
            min_quantity: 10.0,
            updated_at: now_str(),
        });
        drop(data);
        self.persist();
        product_id
    }

    // ====== Inventory ======
    pub fn get_inventory(&self) -> Vec<Inventory> {
        self.data.lock().unwrap().inventory.clone()
    }

    pub fn delete_product(&self, id: u64) -> Result<(), String> {
        let mut data = self.data.lock().unwrap();
        let product = data
            .products
            .iter_mut()
            .find(|p| p.id == id)
            .ok_or("商品不存在")?;
        product.deleted = true;
        product.updated_at = now_str();
        drop(data);
        self.persist();
        Ok(())
    }

    pub fn update_inventory_batch(&self, items: Vec<serde_json::Value>) -> Result<u64, String> {
        let mut data = self.data.lock().unwrap();
        let mut count: u64 = 0;
        for item in &items {
            let product_id = item.get("product_id").and_then(|v| v.as_u64()).unwrap_or(0);
            if let Some(inv) = data.inventory.iter_mut().find(|i| i.product_id == product_id) {
                if let Some(q) = item.get("quantity").and_then(|v| v.as_f64()) {
                    inv.quantity = q;
                }
                if let Some(mq) = item.get("min_quantity").and_then(|v| v.as_f64()) {
                    inv.min_quantity = mq;
                }
                inv.updated_at = now_str();
                count += 1;
            }
        }
        drop(data);
        self.persist();
        Ok(count)
    }

    // ====== Stock Records ======
    pub fn get_stock_records(&self) -> Vec<StockRecord> {
        let data = self.data.lock().unwrap();
        let mut records = data.stock_records.clone();
        records.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        records
    }

    pub fn add_stock_record(
        &self,
        product_id: u64,
        record_type: &str,
        quantity: f64,
        operator_id: Option<u64>,
        department_id: Option<u64>,
        remark: &str,
        created_at: Option<&str>,
    ) -> u64 {
        let id = self.gen_id();
        let mut data = self.data.lock().unwrap();
        data.stock_records.push(StockRecord {
            id,
            product_id,
            record_type: record_type.to_string(),
            quantity,
            operator_id,
            department_id,
            remark: remark.to_string(),
            created_at: created_at.unwrap_or(&now_str()).to_string(),
        });

        // Update inventory
        let delta = if record_type == "in" { quantity } else { -quantity };
        if let Some(inv) = data.inventory.iter_mut().find(|i| i.product_id == product_id) {
            inv.quantity += delta;
            inv.updated_at = now_str();
        }

        drop(data);
        self.persist();
        id
    }

    // ====== Fixed Assets ======
    pub fn get_fixed_assets(&self) -> Vec<FixedAsset> {
        self.data.lock().unwrap().fixed_assets.clone()
    }

    pub fn add_fixed_asset(
        &self, name: &str, model: &str, unit: &str,
        department_id: Option<u64>, quantity: f64,
        setup_date: &str, asset_no: &str, custodian: &str, remark: &str,
    ) -> u64 {
        let id = self.gen_id();
        let mut data = self.data.lock().unwrap();
        data.fixed_assets.push(FixedAsset {
            id, name: name.to_string(), model: model.to_string(), unit: unit.to_string(),
            department_id, quantity, setup_date: setup_date.to_string(),
            asset_no: asset_no.to_string(), custodian: custodian.to_string(),
            remark: remark.to_string(), created_at: now_str(), updated_at: now_str(),
        });
        drop(data);
        self.persist();
        id
    }

    pub fn update_fixed_asset(
        &self, id: u64, name: &str, model: &str, unit: &str,
        department_id: Option<u64>, quantity: f64,
        setup_date: &str, asset_no: &str, custodian: &str, remark: &str,
    ) -> Result<(), String> {
        let mut data = self.data.lock().unwrap();
        let fa = data.fixed_assets.iter_mut().find(|a| a.id == id).ok_or("固定资产不存在")?;
        fa.name = name.to_string(); fa.model = model.to_string(); fa.unit = unit.to_string();
        fa.department_id = department_id; fa.quantity = quantity;
        fa.setup_date = setup_date.to_string(); fa.asset_no = asset_no.to_string();
        fa.custodian = custodian.to_string(); fa.remark = remark.to_string();
        fa.updated_at = now_str();
        drop(data);
        self.persist();
        Ok(())
    }

    pub fn delete_fixed_asset(&self, id: u64) -> Result<(), String> {
        let mut data = self.data.lock().unwrap();
        data.fixed_assets.retain(|a| a.id != id);
        drop(data);
        self.persist();
        Ok(())
    }

    // ====== Export ======
    pub fn export_data(&self, export_type: &str, format: &str) -> Result<(String, String), String> {
        let data = self.data.lock().unwrap();

        match format {
            "csv" => {
                let (headers, rows): (Vec<String>, Vec<Vec<String>>) = match export_type {
                    "departments" => {
                        let h = vec!["id", "name", "description", "created_at", "updated_at"];
                        let r: Vec<Vec<String>> = data
                            .departments
                            .iter()
                            .map(|d| {
                                vec![
                                    d.id.to_string(),
                                    d.name.clone(),
                                    d.description.clone(),
                                    d.created_at.clone(),
                                    d.updated_at.clone(),
                                ]
                            })
                            .collect();
                        (h.iter().map(|s| s.to_string()).collect(), r)
                    }
                    "operators" => {
                        let h = vec!["id", "name", "username", "department_id", "created_at", "updated_at"];
                        let r: Vec<Vec<String>> = data
                            .operators
                            .iter()
                            .map(|o| {
                                vec![
                                    o.id.to_string(),
                                    o.name.clone(),
                                    o.username.clone(),
                                    o.department_id
                                        .map(|v| v.to_string())
                                        .unwrap_or_default(),
                                    o.created_at.clone(),
                                    o.updated_at.clone(),
                                ]
                            })
                            .collect();
                        (h.iter().map(|s| s.to_string()).collect(), r)
                    }
                    "products" => {
                        let h = vec![
                            "id", "name", "category", "spec", "unit", "cost_price",
                            "department_id", "created_at", "updated_at",
                        ];
                        let r: Vec<Vec<String>> = data
                            .products
                            .iter()
                            .map(|p| {
                                vec![
                                    p.id.to_string(),
                                    p.name.clone(),
                                    p.category.clone(),
                                    p.spec.clone(),
                                    p.unit.clone(),
                                    p.cost_price.to_string(),
                                    p.department_id
                                        .map(|v| v.to_string())
                                        .unwrap_or_default(),
                                    p.created_at.clone(),
                                    p.updated_at.clone(),
                                ]
                            })
                            .collect();
                        (h.iter().map(|s| s.to_string()).collect(), r)
                    }
                    "inventory" => {
                        let h = vec![
                            "id", "product_id", "product_name", "product_spec",
                            "product_unit", "quantity", "min_quantity", "updated_at",
                        ];
                        let r: Vec<Vec<String>> = data
                            .inventory
                            .iter()
                            .map(|iv| {
                                let p = data.products.iter().find(|pr| pr.id == iv.product_id);
                                vec![
                                    iv.id.to_string(),
                                    iv.product_id.to_string(),
                                    p.map(|p| p.name.clone()).unwrap_or_default(),
                                    p.map(|p| p.spec.clone()).unwrap_or_default(),
                                    p.map(|p| p.unit.clone()).unwrap_or_default(),
                                    iv.quantity.to_string(),
                                    iv.min_quantity.to_string(),
                                    iv.updated_at.clone(),
                                ]
                            })
                            .collect();
                        (h.iter().map(|s| s.to_string()).collect(), r)
                    }
                    "stock-records" => {
                        let h = vec![
                            "id", "product_id", "type", "quantity", "operator_id",
                            "department_id", "remark", "created_at",
                        ];
                        let mut records = data.stock_records.clone();
                        records.sort_by(|a, b| b.created_at.cmp(&a.created_at));
                        let r: Vec<Vec<String>> = records
                            .iter()
                            .map(|sr| {
                                vec![
                                    sr.id.to_string(),
                                    sr.product_id.to_string(),
                                    sr.record_type.clone(),
                                    sr.quantity.to_string(),
                                    sr.operator_id
                                        .map(|v| v.to_string())
                                        .unwrap_or_default(),
                                    sr.department_id
                                        .map(|v| v.to_string())
                                        .unwrap_or_default(),
                                    sr.remark.clone(),
                                    sr.created_at.clone(),
                                ]
                            })
                            .collect();
                        (h.iter().map(|s| s.to_string()).collect(), r)
                    }
                    _ => return Err("无效的数据类型".into()),
                };

                let csv_line = |vals: &[String]| -> String {
                    vals.iter()
                        .map(|v| {
                            if v.contains(',') || v.contains('"') || v.contains('\n') {
                                format!("\"{}\"", v.replace('"', "\"\""))
                            } else {
                                v.clone()
                            }
                        })
                        .collect::<Vec<_>>()
                        .join(",")
                };

                let content = format!(
                    "\u{feff}{}\n{}",
                    csv_line(&headers),
                    rows.iter()
                        .map(|r| csv_line(r))
                        .collect::<Vec<_>>()
                        .join("\n")
                );
                Ok((content, format!("{}.csv", export_type)))
            }
            _ => {
                // JSON
                let json = match export_type {
                    "departments" => serde_json::to_string(&data.departments),
                    "operators" => serde_json::to_string(&data.operators),
                    "products" => serde_json::to_string(&data.products),
                    "inventory" => {
                        let enriched: Vec<serde_json::Value> = data
                            .inventory
                            .iter()
                            .map(|iv| {
                                let p = data.products.iter().find(|pr| pr.id == iv.product_id);
                                serde_json::json!({
                                    "id": iv.id,
                                    "product_id": iv.product_id,
                                    "product_name": p.map(|p| p.name.as_str()).unwrap_or(""),
                                    "product_spec": p.map(|p| p.spec.as_str()).unwrap_or(""),
                                    "product_unit": p.map(|p| p.unit.as_str()).unwrap_or(""),
                                    "quantity": iv.quantity,
                                    "min_quantity": iv.min_quantity,
                                    "updated_at": iv.updated_at,
                                })
                            })
                            .collect();
                        serde_json::to_string(&enriched)
                    }
                    "stock-records" => {
                        let mut records = data.stock_records.clone();
                        records.sort_by(|a, b| b.created_at.cmp(&a.created_at));
                        serde_json::to_string(&records)
                    }
                    "fixed-assets" => {
                        serde_json::to_string(&data.fixed_assets)
                    }
                    _ => return Err("无效的数据类型".into()),
                }
                .map_err(|e| e.to_string())?;
                Ok((json, format!("{}.json", export_type)))
            }
        }
    }

    // ====== Import ======
    pub fn import_data(
        &self,
        import_type: &str,
        rows: Vec<serde_json::Value>,
    ) -> Result<u64, String> {
        let mut data = self.data.lock().unwrap();
        let mut count = 0u64;

        for row in &rows {
            match import_type {
                "departments" => {
                    if let Some(name) = row.get("name").and_then(|v| v.as_str()) {
                        let id = data.next_id;
                        data.next_id += 1;
                        data.departments.push(Department {
                            id,
                            name: name.to_string(),
                            description: row.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                            sort_order: row.get("sort_order").and_then(|v| v.as_u64()).unwrap_or(0),
                            created_at: now_str(),
                            updated_at: now_str(),
                        });
                        count += 1;
                    }
                }
                "operators" => {
                    if let Some(name) = row.get("name").and_then(|v| v.as_str()) {
                        let username = row
                            .get("username")
                            .and_then(|v| v.as_str())
                            .unwrap_or(name);
                        let password = row
                            .get("password")
                            .and_then(|v| v.as_str())
                            .unwrap_or("123456");

                        use sha2::{Digest, Sha256};
                        use rand::Rng;
                        let salt: String = rand::thread_rng()
                            .sample_iter(&rand::distributions::Alphanumeric)
                            .take(32)
                            .map(char::from)
                            .collect();
                        let mut hasher = Sha256::new();
                        hasher.update(password.as_bytes());
                        hasher.update(salt.as_bytes());
                        let password_hash = format!("{:x}", hasher.finalize());

                        let id = data.next_id;
                        data.next_id += 1;
                        data.operators.push(Operator {
                            id,
                            name: name.to_string(),
                            username: username.to_string(),
                            password: password_hash,
                            salt,
                            department_id: row.get("department_id").and_then(|v| v.as_u64()),
                            created_at: now_str(),
                            updated_at: now_str(),
                        });
                        count += 1;
                    }
                }
                "products" => {
                    if let Some(name) = row.get("name").and_then(|v| v.as_str()) {
                        let product_id = data.next_id;
                        data.next_id += 1;
                        data.products.push(Product {
                            id: product_id,
                            name: name.to_string(),
                            category: row
                                .get("category")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            spec: row.get("spec").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                            unit: row
                                .get("unit")
                                .and_then(|v| v.as_str())
                                .unwrap_or("件")
                                .to_string(),
                            cost_price: row.get("cost_price").and_then(|v| v.as_f64()).unwrap_or(0.0),
                            department_id: row.get("department_id").and_then(|v| v.as_u64()),
                            deleted: false,
                            created_at: now_str(),
                            updated_at: now_str(),
                        });
                        let inv_id = data.next_id;
                        data.next_id += 1;
                        data.inventory.push(Inventory {
                            id: inv_id,
                            product_id,
                            quantity: 0.0,
                            min_quantity: 10.0,
                            updated_at: now_str(),
                        });
                        count += 1;
                    }
                }
                "stock-records" => {
                    if let (Some(product_id), Some(record_type), Some(quantity)) = (
                        row.get("product_id").and_then(|v| v.as_u64()),
                        row.get("type").and_then(|v| v.as_str()),
                        row.get("quantity").and_then(|v| v.as_f64()),
                    ) {
                        let id = data.next_id;
                        data.next_id += 1;
                        data.stock_records.push(StockRecord {
                            id,
                            product_id,
                            record_type: record_type.to_string(),
                            quantity,
                            operator_id: row.get("operator_id").and_then(|v| v.as_u64()),
                            department_id: row.get("department_id").and_then(|v| v.as_u64()),
                            remark: row
                                .get("remark")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            created_at: row
                                .get("created_at")
                                .and_then(|v| v.as_str())
                                .unwrap_or(&now_str())
                                .to_string(),
                        });

                        let delta = if record_type == "in" {
                            quantity
                        } else {
                            -quantity
                        };
                        if let Some(inv) =
                            data.inventory.iter_mut().find(|i| i.product_id == product_id)
                        {
                            inv.quantity += delta;
                            inv.updated_at = now_str();
                        }
                        count += 1;
                    }
                }
                _ => return Err("不支持的类型".into()),
            }
        }

        drop(data);
        self.persist();
        Ok(count)
    }

    // ====== Table Configs ======
    pub fn get_table_configs(&self) -> Vec<TableConfig> {
        self.data
            .lock()
            .unwrap()
            .table_configs
            .iter()
            .map(|c| TableConfig {
                id: c.id,
                page_key: c.page_key.clone(),
                columns: c.columns.clone(),
                updated_at: c.updated_at.clone(),
            })
            .collect()
    }

    pub fn get_table_config(&self, page: &str) -> Option<TableConfig> {
        self.data
            .lock()
            .unwrap()
            .table_configs
            .iter()
            .find(|c| c.page_key == page)
            .map(|c| TableConfig {
                id: c.id,
                page_key: c.page_key.clone(),
                columns: c.columns.clone(),
                updated_at: c.updated_at.clone(),
            })
    }

    pub fn update_table_config(
        &self,
        page: &str,
        columns: serde_json::Value,
    ) -> Result<(), String> {
        let mut data = self.data.lock().unwrap();
        if let Some(existing) = data
            .table_configs
            .iter_mut()
            .find(|c| c.page_key == page)
        {
            existing.columns = columns;
            existing.updated_at = now_str();
        } else {
            data.table_configs.push(TableConfig {
                id: self.gen_id(),
                page_key: page.to_string(),
                columns,
                updated_at: now_str(),
            });
        }
        drop(data);
        self.persist();
        Ok(())
    }

    // ====== Backup / Restore ======
    pub fn backup(&self) -> serde_json::Value {
        let data = self.data.lock().unwrap();
        serde_json::json!({
            "departments": data.departments,
            "operators": data.operators,
            "products": data.products,
            "inventory": data.inventory,
            "stockRecords": data.stock_records,
            "fixedAssets": data.fixed_assets,
            "tableConfigs": data.table_configs,
        })
    }

    pub fn restore(&self, backup: serde_json::Value) -> Result<u64, String> {
        let mut data = self.data.lock().unwrap();
        let mut count = 0u64;
        let mut max_id = data.next_id;

        if let Some(items) = backup.get("departments").and_then(|v| v.as_array()) {
            data.departments = items.iter().map(|item| {
                let id = item.get("id").and_then(|v| v.as_u64()).unwrap_or(0);
                if id >= max_id { max_id = id + 1; }
                count += 1;
                Department {
                    id,
                    name: item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    description: item.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    sort_order: item.get("sort_order").and_then(|v| v.as_u64()).unwrap_or(0),
                    created_at: item.get("created_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    updated_at: item.get("updated_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                }
            }).collect();
        }

        if let Some(items) = backup.get("operators").and_then(|v| v.as_array()) {
            data.operators = items.iter().map(|item| {
                let id = item.get("id").and_then(|v| v.as_u64()).unwrap_or(0);
                if id >= max_id { max_id = id + 1; }
                count += 1;
                Operator {
                    id,
                    name: item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    username: item.get("username").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    password: item.get("password").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    salt: item.get("salt").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    department_id: item.get("department_id").and_then(|v| v.as_u64()),
                    created_at: item.get("created_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    updated_at: item.get("updated_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                }
            }).collect();
        }

        if let Some(items) = backup.get("products").and_then(|v| v.as_array()) {
            data.products = items.iter().map(|item| {
                let id = item.get("id").and_then(|v| v.as_u64()).unwrap_or(0);
                if id >= max_id { max_id = id + 1; }
                count += 1;
                Product {
                    id,
                    name: item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    category: item.get("category").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    spec: item.get("spec").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    unit: item.get("unit").and_then(|v| v.as_str()).unwrap_or("件").to_string(),
                    cost_price: item.get("cost_price").and_then(|v| v.as_f64()).unwrap_or(0.0),
                    department_id: item.get("department_id").and_then(|v| v.as_u64()),
                    deleted: item.get("deleted").and_then(|v| v.as_bool()).unwrap_or(false),
                    created_at: item.get("created_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    updated_at: item.get("updated_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                }
            }).collect();
        }

        if let Some(items) = backup.get("inventory").and_then(|v| v.as_array()) {
            data.inventory = items.iter().map(|item| {
                let id = item.get("id").and_then(|v| v.as_u64()).unwrap_or(0);
                if id >= max_id { max_id = id + 1; }
                count += 1;
                Inventory {
                    id,
                    product_id: item.get("product_id").and_then(|v| v.as_u64()).unwrap_or(0),
                    quantity: item.get("quantity").and_then(|v| v.as_f64()).unwrap_or(0.0),
                    min_quantity: item.get("min_quantity").and_then(|v| v.as_f64()).unwrap_or(10.0),
                    updated_at: item.get("updated_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                }
            }).collect();
        }

        if let Some(items) = backup.get("stockRecords").and_then(|v| v.as_array()) {
            data.stock_records = items.iter().map(|item| {
                let id = item.get("id").and_then(|v| v.as_u64()).unwrap_or(0);
                if id >= max_id { max_id = id + 1; }
                count += 1;
                StockRecord {
                    id,
                    product_id: item.get("product_id").and_then(|v| v.as_u64()).unwrap_or(0),
                    record_type: item.get("type").and_then(|v| v.as_str()).unwrap_or("in").to_string(),
                    quantity: item.get("quantity").and_then(|v| v.as_f64()).unwrap_or(0.0),
                    operator_id: item.get("operator_id").and_then(|v| v.as_u64()),
                    department_id: item.get("department_id").and_then(|v| v.as_u64()),
                    remark: item.get("remark").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    created_at: item.get("created_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                }
            }).collect();
        }

        if let Some(items) = backup.get("tableConfigs").and_then(|v| v.as_array()) {
            data.table_configs = items.iter().map(|item| {
                let id = item.get("id").and_then(|v| v.as_u64()).unwrap_or(0);
                if id >= max_id { max_id = id + 1; }
                count += 1;
                TableConfig {
                    id,
                    page_key: item.get("page_key").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    columns: item.get("columns").cloned().unwrap_or(serde_json::json!([])),
                    updated_at: item.get("updated_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                }
            }).collect();
        }

        data.next_id = max_id;
        drop(data);
        self.persist();
        Ok(count)
    }

    // ====== System Info ======
    pub fn get_system_info(&self) -> serde_json::Value {
        let lan_ips = local_ip_address::list_afinet_netifas()
            .map(|ifs| {
                ifs.into_iter()
                    .filter(|(_, ip)| {
                        let s = ip.to_string();
                        s.starts_with("192.") || s.starts_with("10.") || s.starts_with("172.")
                    })
                    .map(|(name, address)| {
                        serde_json::json!({ "name": name, "address": address.to_string() })
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        serde_json::json!({
            "hostname": hostname::get().map(|h| h.to_string_lossy().to_string()).unwrap_or_default(),
            "platform": std::env::consts::OS,
            "isHost": true,
            "networkInterfaces": lan_ips,
        })
    }
    pub fn clear_all(&self) {
        let mut data = self.data.lock().unwrap();
        data.departments.clear();
        data.operators.clear();
        data.products.clear();
        data.inventory.clear();
        data.stock_records.clear();
        data.fixed_assets.clear();
        data.table_configs.clear();
        data.next_id = 1;
        drop(data);
        self.persist();
    }
}

fn now_str() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}
