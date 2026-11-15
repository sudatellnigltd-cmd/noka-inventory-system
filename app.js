
/* =====================================================
   NOKA INVENTORY MANAGEMENT SYSTEM
   Developer: SUDATELL NIG LIMITED
   Backend: Supabase
   ===================================================== */

// SUPABASE CONFIGURATION
const SUPABASE_URL = "https://rqrmwylvthuxpheuorwv.supabase.co";
const SUPABASE_KEY = "sb_publishable_LiKJxswpoRMhpzBSblOKYA_bs_y3cjk";

let db = null;

if (
    window.supabase &&
    SUPABASE_KEY !== "PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY"
) {
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

// APPLICATION STATE
let currentUser = null;
let products = [];
let customers = [];
let suppliers = [];
let sales = [];
let stockMovements = [];
let currentPage = "dashboard";
let editingId = null;

const $ = id => document.getElementById(id);

// HELPERS
function money(value) {
    return "₦" + Number(value || 0).toLocaleString("en-NG", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function notify(message, type = "success") {
    const toast = $("toast");

    if (!toast) {
        alert(message);
        return;
    }

    toast.textContent = message;
    toast.className = "toast show " + type;

    setTimeout(() => {
        toast.className = "toast";
    }, 3500);
}

function formatDate(value) {
    if (!value) return "-";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "-";

    return date.toLocaleDateString("en-NG");
}

function emptyRow(columns) {
    return `<tr><td colspan="${columns}" class="empty-state">No records found</td></tr>`;
}

function requireDatabase() {
    if (!db) {
        notify(
            "Supabase is not configured. Check your Supabase configuration.",
            "error"
        );
        return false;
    }

    return true;
}

function setButtonLoading(button, loading, text = "Please wait...") {
    if (!button) return;

    if (loading) {
        if (!button.dataset.originalText) {
            button.dataset.originalText = button.textContent;
        }

        button.disabled = true;
        button.textContent = text;
    } else {
        button.disabled = false;
        button.textContent = button.dataset.originalText || "Save";
        delete button.dataset.originalText;
    }
}

// PASSWORD SECURITY
function strongPassword(password) {
    return password.length >= 8 &&
        /[A-Z]/.test(password) &&
        /[a-z]/.test(password) &&
        /[0-9]/.test(password) &&
        /[^A-Za-z0-9]/.test(password);
}

function setupPasswordVisibility() {
    document.querySelectorAll("[data-toggle-password]").forEach(button => {
        if (button.dataset.passwordReady === "true") return;

        button.dataset.passwordReady = "true";

        button.addEventListener("click", () => {
            const input = $(button.dataset.togglePassword);

            if (!input) return;

            const show = input.type === "password";

            input.type = show ? "text" : "password";
            button.textContent = show ? "🙈" : "👁️";

            button.setAttribute(
                "aria-label",
                show ? "Hide password" : "Show password"
            );
        });
    });
}

function setupPasswordStrength() {
    const password = $("registerPassword");
    const strength = $("passwordStrength");

    if (!password || !strength) return;

    password.addEventListener("input", () => {
        const value = password.value;
        let score = 0;

        if (value.length >= 8) score++;
        if (/[A-Z]/.test(value)) score++;
        if (/[a-z]/.test(value)) score++;
        if (/[0-9]/.test(value)) score++;
        if (/[^A-Za-z0-9]/.test(value)) score++;

        const labels = [
            "Very weak",
            "Weak",
            "Fair",
            "Good",
            "Strong",
            "Very strong"
        ];

        strength.textContent = labels[score];
        strength.dataset.strength = String(score);
    });
}

function getFormValue(form, names) {
    for (const name of names) {
        const field = form.elements.namedItem(name);

        if (field) {
            return String(field.value || "").trim();
        }
    }

    return "";
}

// MODAL
function closeModal() {
    $("modalOverlay")?.classList.add("hidden");
    editingId = null;
}

function openModal(title, content) {
    if (!$("modalOverlay")) return;

    $("modalTitle").textContent = title;
    $("modalBody").innerHTML = content;
    $("modalOverlay").classList.remove("hidden");

    setupPasswordVisibility();
}

// AUTHENTICATION
async function login(email, password) {
    if (!requireDatabase()) return;

    const message = $("loginMessage");
    const button = $("loginForm")?.querySelector('[type="submit"]');

    try {
        if (message) message.textContent = "Signing in...";

        setButtonLoading(button, true, "Signing in...");

        const { data, error } = await db.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        currentUser = data.user;

        await loadApplication();

        if (message) message.textContent = "";

    } catch (error) {
        if (message) {
            message.textContent = error.message;
        } else {
            notify(error.message, "error");
        }
    } finally {
        setButtonLoading(button, false);
    }
}

async function registerUser(event) {
    event.preventDefault();

    if (!requireDatabase()) return;

    const form = event.target;
    const button = form.querySelector('[type="submit"]');

    const name = getFormValue(form, [
        "name",
        "full_name",
        "fullName"
    ]);

    const company = getFormValue(form, [
        "company",
        "company_name"
    ]);

    const email = getFormValue(form, ["email"]).toLowerCase();

    const phone = getFormValue(form, ["phone"]);

    const password = getFormValue(form, [
        "password",
        "registerPassword"
    ]);

    const confirmPassword = getFormValue(form, [
        "confirmPassword",
        "confirm_password",
        "password_confirmation"
    ]);

    const terms = form.querySelector(
        '[name="terms"], #terms'
    );

    if (!name || !email || !password || !confirmPassword) {
        return notify("Please complete all required fields.", "error");
    }

    if (!strongPassword(password)) {
        return notify(
            "Password must contain at least 8 characters, uppercase, lowercase, number and symbol.",
            "error"
        );
    }

    if (password !== confirmPassword) {
        return notify("Passwords do not match.", "error");
    }

    if (terms && !terms.checked) {
        return notify("Please accept the terms and conditions.", "error");
    }

    try {
        setButtonLoading(button, true, "Creating account...");

        const { data, error } = await db.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: name,
                    company_name: company,
                    phone: phone
                }
            }
        });

        if (error) throw error;

        if (data.session && data.user) {
            currentUser = data.user;

            notify("Registration successful.");

            await loadApplication();
        } else {
            notify(
                "Registration successful. Please check your email to verify your account."
            );

            form.reset();

            $("registerPanel")?.classList.add("hidden");
            $("loginPanel")?.classList.remove("hidden");
        }

    } catch (error) {
        notify(error.message || "Registration failed.", "error");
    } finally {
        setButtonLoading(button, false);
    }
}

async function resetUserPassword(event) {
    event.preventDefault();

    if (!requireDatabase()) return;

    const form = event.target;
    const button = form.querySelector('[type="submit"]');

    const email = getFormValue(form, [
        "email",
        "resetEmail"
    ]);

    if (!email) {
        return notify("Enter your registered email address.", "error");
    }

    try {
        setButtonLoading(button, true, "Sending...");

        const { error } = await db.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin
        });

        if (error) throw error;

        notify("Password reset link sent. Check your email.");

        form.reset();

    } catch (error) {
        notify(error.message || "Unable to send reset email.", "error");
    } finally {
        setButtonLoading(button, false);
    }
}

async function logout() {
    if (!requireDatabase()) return;

    try {
        const { error } = await db.auth.signOut();

        if (error) throw error;

        currentUser = null;
        products = [];
        customers = [];
        suppliers = [];
        sales = [];
        stockMovements = [];

        $("appPage")?.classList.add("hidden");
        $("loginPage")?.classList.remove("hidden");

        notify("Signed out successfully.");

    } catch (error) {
        notify(error.message, "error");
    }
}

async function checkSession() {
    if (!requireDatabase()) return;

    try {
        const { data, error } = await db.auth.getSession();

        if (error) throw error;

        if (data.session) {
            currentUser = data.session.user;
            await loadApplication();
        } else {
            $("loginPage")?.classList.remove("hidden");
            $("appPage")?.classList.add("hidden");
        }

        db.auth.onAuthStateChange((event, session) => {
            if (event === "SIGNED_OUT" || !session) {
                currentUser = null;

                $("loginPage")?.classList.remove("hidden");
                $("appPage")?.classList.add("hidden");
            }

            if (event === "PASSWORD_RECOVERY") {
                showPasswordUpdateForm();
            }
        });

    } catch (error) {
        notify("Authentication error: " + error.message, "error");
    }
}

// UPDATE PASSWORD AFTER RESET
function showPasswordUpdateForm() {
    openModal("Create New Password", `
        <form id="updatePasswordForm" class="modal-form">

            <label>New Password</label>
            <div class="password-field">
                <input
                    id="newPassword"
                    name="password"
                    type="password"
                    minlength="8"
                    required
                >
                <button
                    type="button"
                    data-toggle-password="newPassword"
                >👁️</button>
            </div>

            <label>Confirm New Password</label>
            <div class="password-field">
                <input
                    id="confirmNewPassword"
                    name="confirmPassword"
                    type="password"
                    minlength="8"
                    required
                >
                <button
                    type="button"
                    data-toggle-password="confirmNewPassword"
                >👁️</button>
            </div>

            <button type="submit" class="primary-btn">
                Update Password
            </button>
        </form>
    `);

    $("updatePasswordForm")?.addEventListener("submit", async event => {
        event.preventDefault();

        const password = $("newPassword").value;
        const confirm = $("confirmNewPassword").value;

        if (!strongPassword(password)) {
            return notify(
                "Use at least 8 characters with uppercase, lowercase, number and symbol.",
                "error"
            );
        }

        if (password !== confirm) {
            return notify("Passwords do not match.", "error");
        }

        try {
            const { error } = await db.auth.updateUser({ password });

            if (error) throw error;

            closeModal();
            notify("Password updated successfully.");

        } catch (error) {
            notify(error.message, "error");
        }
    });
}

// LOAD APPLICATION
async function loadApplication() {
    if (!db || !currentUser) return;

    $("loginPage")?.classList.add("hidden");
    $("appPage")?.classList.remove("hidden");

    const userName = $("userName");

    if (userName) {
        userName.textContent =
            currentUser.user_metadata?.full_name ||
            currentUser.email ||
            "User";
    }

    try {
        await Promise.all([
            loadProducts(),
            loadCustomers(),
            loadSuppliers(),
            loadSales(),
            loadStockMovements()
        ]);

        updateDashboard();
        navigate("dashboard");

    } catch (error) {
        notify("Unable to load data: " + error.message, "error");
    }
}

// LOAD DATABASE RECORDS
async function loadProducts() {
    const { data, error } = await db
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) throw error;

    products = data || [];
    renderProducts();
}

async function loadCustomers() {
    const { data, error } = await db
        .from("customers")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) throw error;

    customers = data || [];
    renderCustomers();
}

async function loadSuppliers() {
    const { data, error } = await db
        .from("suppliers")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) throw error;

    suppliers = data || [];
    renderSuppliers();
}

async function loadSales() {
    const { data, error } = await db
        .from("sales")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) throw error;

    sales = data || [];
    renderSales();
}

async function loadStockMovements() {
    const { data, error } = await db
        .from("stock_movements")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) throw error;

    stockMovements = data || [];
    renderStock();
}

// NAVIGATION
function navigate(page) {
    const allowedPages = [
        "dashboard",
        "products",
        "stock",
        "sales",
        "customers",
        "suppliers",
        "reports",
        "settings",
        "about"
    ];

    if (!allowedPages.includes(page)) return;

    currentPage = page;

    document.querySelectorAll("[data-page]").forEach(item => {
        item.classList.toggle("active", item.dataset.page === page);
    });

    document.querySelectorAll(".page-content").forEach(section => {
        section.classList.add("hidden");
    });

    $("page-" + page)?.classList.remove("hidden");

    const titles = {
        dashboard: "Dashboard",
        products: "Products",
        stock: "Stock Management",
        sales: "Sales",
        customers: "Customers",
        suppliers: "Suppliers",
        reports: "Reports",
        settings: "Settings",
        about: "About SUDATELL"
    };

    if ($("pageTitle")) {
        $("pageTitle").textContent = titles[page] || page;
    }

    if (page === "dashboard") updateDashboard();
    if (page === "products") renderProducts();
    if (page === "stock") renderStock();
    if (page === "sales") renderSales();
    if (page === "customers") renderCustomers();
    if (page === "suppliers") renderSuppliers();
}

// DASHBOARD
function updateDashboard() {
    const totalStock = products.reduce(
        (sum, item) => sum + Number(item.quantity || 0),
        0
    );

    const totalSales = sales.reduce(
        (sum, item) => sum + Number(item.total_amount || 0),
        0
    );

    const lowStock = products.filter(item =>
        Number(item.quantity || 0) <= Number(item.min_stock ?? 5)
    ).length;

    if ($("totalProducts")) {
        $("totalProducts").textContent = products.length;
    }

    if ($("totalStock")) {
        $("totalStock").textContent = totalStock;
    }

    if ($("totalSales")) {
        $("totalSales").textContent = money(totalSales);
    }

    if ($("lowStock")) {
        $("lowStock").textContent = lowStock;
    }

    const recent = $("recentProducts");

    if (recent) {
        recent.innerHTML = products.slice(0, 5).map(item => `
            <tr>
                <td>${escapeHTML(item.name)}</td>
                <td>${escapeHTML(item.sku || "-")}</td>
                <td>${escapeHTML(item.category || "-")}</td>
                <td>${Number(item.quantity || 0)}</td>
            </tr>
        `).join("") || emptyRow(4);
    }
}

// PRODUCTS
function renderProducts(search = "") {
    const table = $("productsTable");
    if (!table) return;

    const filtered = products.filter(item =>
        `${item.name} ${item.sku || ""} ${item.category || ""}`
            .toLowerCase()
            .includes(search.toLowerCase())
    );

    table.innerHTML = filtered.map(item => `
        <tr>
            <td>${escapeHTML(item.name)}</td>
            <td>${escapeHTML(item.sku || "-")}</td>
            <td>${escapeHTML(item.category || "-")}</td>
            <td>${Number(item.quantity || 0)}</td>
            <td>${money(item.cost_price)}</td>
            <td>${money(item.selling_price)}</td>
            <td>
                <button type="button" class="secondary-btn"
                    data-action="edit-product"
                    data-id="${escapeHTML(item.id)}">Edit</button>

                <button type="button" class="primary-btn"
                    data-action="delete-product"
                    data-id="${escapeHTML(item.id)}">Delete</button>
            </td>
        </tr>
    `).join("") || emptyRow(7);
}

function productForm(item = {}) {
    editingId = item.id || null;

    openModal(editingId ? "Edit Product" : "Add New Product", `
        <form id="productForm" class="modal-form">

            <label>Product Name</label>
            <input name="name" required
                value="${escapeHTML(item.name || "")}">

            <label>SKU / Product Code</label>
            <input name="sku"
                value="${escapeHTML(item.sku || "")}">

            <label>Category</label>
            <input name="category"
                value="${escapeHTML(item.category || "")}">

            <label>Quantity</label>
            <input name="quantity" type="number" min="0" required
                value="${Number(item.quantity || 0)}">

            <label>Minimum Stock Alert</label>
            <input name="min_stock" type="number" min="0"
                value="${Number(item.min_stock ?? 5)}">

            <label>Cost Price (₦)</label>
            <input name="cost_price" type="number" min="0"
                step="0.01" required
                value="${Number(item.cost_price || 0)}">

            <label>Selling Price (₦)</label>
            <input name="selling_price" type="number" min="0"
                step="0.01" required
                value="${Number(item.selling_price || 0)}">

            <button type="submit" class="primary-btn">
                Save Product
            </button>
        </form>
    `);

    $("productForm").addEventListener("submit", saveProduct);
}

async function saveProduct(event) {
    event.preventDefault();

    if (!currentUser) return notify("Please sign in again.", "error");

    const form = new FormData(event.target);

    const record = {
        name: form.get("name").trim(),
        sku: form.get("sku").trim(),
        category: form.get("category").trim(),
        quantity: Number(form.get("quantity")),
        min_stock: Number(form.get("min_stock")),
        cost_price: Number(form.get("cost_price")),
        selling_price: Number(form.get("selling_price")),
        user_id: currentUser.id
    };

    try {
        const result = editingId
            ? await db.from("products").update(record).eq("id", editingId)
            : await db.from("products").insert(record);

        if (result.error) throw result.error;

        closeModal();
        await loadProducts();
        updateDashboard();

        notify("Product saved successfully.");

    } catch (error) {
        notify(error.message, "error");
    }
}

async function deleteProduct(id) {
    if (!confirm("Are you sure you want to delete this product?")) return;

    try {
        const { error } = await db
            .from("products")
            .delete()
            .eq("id", id);

        if (error) throw error;

        await loadProducts();
        updateDashboard();

        notify("Product deleted.");

    } catch (error) {
        notify(error.message, "error");
    }
}

// STOCK MANAGEMENT
function renderStock() {
    const table = $("stockTable");
    if (!table) return;

    table.innerHTML = stockMovements.map(item => `
        <tr>
            <td>${escapeHTML(item.product_name || "-")}</td>
            <td>${escapeHTML(item.movement_type || "-")}</td>
            <td>${Number(item.quantity || 0)}</td>
            <td>${escapeHTML(item.notes || "-")}</td>
            <td>${formatDate(item.created_at)}</td>
        </tr>
    `).join("") || emptyRow(5);
}

function stockForm() {
    if (!products.length) {
        return notify("Add a product before recording stock.", "error");
    }

    const options = products.map(item => `
        <option value="${escapeHTML(item.id)}">
            ${escapeHTML(item.name)} (Stock: ${Number(item.quantity)})
        </option>
    `).join("");

    openModal("Stock Movement", `
        <form id="stockForm" class="modal-form">

            <label>Select Product</label>
            <select name="product_id" required>${options}</select>

            <label>Movement Type</label>
            <select name="movement_type" required>
                <option value="in">Stock In</option>
                <option value="out">Stock Out</option>
            </select>

            <label>Quantity</label>
            <input name="quantity" type="number" min="1" required>

            <label>Notes</label>
            <input name="notes" placeholder="Optional notes">

            <button type="submit" class="primary-btn">
                Save Movement
            </button>
        </form>
    `);

    $("stockForm").addEventListener("submit", saveStockMovement);
}

async function saveStockMovement(event) {
    event.preventDefault();

    const form = new FormData(event.target);

    const product = products.find(item =>
        String(item.id) === String(form.get("product_id"))
    );

    if (!product) {
        return notify("Product not found.", "error");
    }

    const quantity = Number(form.get("quantity"));
    const type = form.get("movement_type");

    if (!Number.isInteger(quantity) || quantity <= 0) {
        return notify("Enter a valid quantity.", "error");
    }

    const newQuantity = type === "in"
        ? Number(product.quantity) + quantity
        : Number(product.quantity) - quantity;

    if (newQuantity < 0) {
        return notify("Not enough stock available.", "error");
    }

    try {
        const { error: updateError } = await db
            .from("products")
            .update({ quantity: newQuantity })
            .eq("id", product.id);

        if (updateError) throw updateError;

        const { error: movementError } = await db
            .from("stock_movements")
            .insert({
                product_id: product.id,
                product_name: product.name,
                movement_type: type,
                quantity,
                notes: form.get("notes"),
                user_id: currentUser.id
            });

        if (movementError) throw movementError;

        closeModal();

        await Promise.all([
            loadProducts(),
            loadStockMovements()
        ]);

        updateDashboard();
        notify("Stock movement saved.");

    } catch (error) {
        notify(error.message, "error");
    }
}

// CUSTOMERS
function renderCustomers() {
    const table = $("customersTable");
    if (!table) return;

    table.innerHTML = customers.map(item => `
        <tr>
            <td>${escapeHTML(item.name)}</td>
            <td>${escapeHTML(item.phone || "-")}</td>
            <td>${escapeHTML(item.email || "-")}</td>
            <td>${escapeHTML(item.address || "-")}</td>
            <td>
                <button type="button" class="primary-btn"
                    data-action="delete-customer"
                    data-id="${escapeHTML(item.id)}">Delete</button>
            </td>
        </tr>
    `).join("") || emptyRow(5);
}

function customerForm() {
    openModal("Add Customer", `
        <form id="customerForm" class="modal-form">

            <label>Customer Name</label>
            <input name="name" required>

            <label>Phone Number</label>
            <input name="phone" type="tel">

            <label>Email</label>
            <input name="email" type="email">

            <label>Address</label>
            <textarea name="address"></textarea>

            <button class="primary-btn" type="submit">
                Save Customer
            </button>
        </form>
    `);

    $("customerForm").addEventListener("submit", async event => {
        event.preventDefault();

        const form = new FormData(event.target);

        try {
            const { error } = await db.from("customers").insert({
                name: form.get("name").trim(),
                phone: form.get("phone"),
                email: form.get("email"),
                address: form.get("address"),
                user_id: currentUser.id
            });

            if (error) throw error;

            closeModal();
            await loadCustomers();

            notify("Customer saved.");

        } catch (error) {
            notify(error.message, "error");
        }
    });
}

async function deleteCustomer(id) {
    if (!confirm("Delete this customer?")) return;

    try {
        const { error } = await db
            .from("customers")
            .delete()
            .eq("id", id);

        if (error) throw error;

        await loadCustomers();
        notify("Customer deleted.");

    } catch (error) {
        notify(error.message, "error");
    }
}

// SUPPLIERS
function renderSuppliers() {
    const table = $("suppliersTable");
    if (!table) return;

    table.innerHTML = suppliers.map(item => `
        <tr>
            <td>${escapeHTML(item.name)}</td>
            <td>${escapeHTML(item.phone || "-")}</td>
            <td>${escapeHTML(item.email || "-")}</td>
            <td>${escapeHTML(item.address || "-")}</td>
            <td>
                <button type="button" class="primary-btn"
                    data-action="delete-supplier"
                    data-id="${escapeHTML(item.id)}">Delete</button>
            </td>
        </tr>
    `).join("") || emptyRow(5);
}

function supplierForm() {
    openModal("Add Supplier", `
        <form id="supplierForm" class="modal-form">

            <label>Supplier Name</label>
            <input name="name" required>

            <label>Phone Number</label>
            <input name="phone" type="tel">

            <label>Email</label>
            <input name="email" type="email">

            <label>Address</label>
            <textarea name="address"></textarea>

            <button class="primary-btn" type="submit">
                Save Supplier
            </button>
        </form>
    `);

    $("supplierForm").addEventListener("submit", async event => {
        event.preventDefault();

        const form = new FormData(event.target);

        try {
            const { error } = await db.from("suppliers").insert({
                name: form.get("name").trim(),
                phone: form.get("phone"),
                email: form.get("email"),
                address: form.get("address"),
                user_id: currentUser.id
            });

            if (error) throw error;

            closeModal();
            await loadSuppliers();

            notify("Supplier saved.");

        } catch (error) {
            notify(error.message, "error");
        }
    });
}

async function deleteSupplier(id) {
    if (!confirm("Delete this supplier?")) return;

    try {
        const { error } = await db
            .from("suppliers")
            .delete()
            .eq("id", id);

        if (error) throw error;

        await loadSuppliers();
        notify("Supplier deleted.");

    } catch (error) {
        notify(error.message, "error");
    }
}

// SALES
function renderSales() {
    const table = $("salesTable");
    if (!table) return;

    table.innerHTML = sales.map(item => `
        <tr>
            <td>${escapeHTML(item.invoice_number || "-")}</td>
            <td>${escapeHTML(item.customer_name || "Walk-in Customer")}</td>
            <td>${money(item.total_amount)}</td>
            <td>${escapeHTML(item.payment_method || "-")}</td>
            <td>${formatDate(item.created_at)}</td>
        </tr>
    `).join("") || emptyRow(5);
}

function saleForm() {
    if (!products.length) {
        return notify("Add products before recording a sale.", "error");
    }

    const productOptions = products.map(item => `
        <option value="${escapeHTML(item.id)}">
            ${escapeHTML(item.name)} — ${money(item.selling_price)}
            (Stock: ${Number(item.quantity)})
        </option>
    `).join("");

    const customerOptions = customers.map(item => `
        <option value="${escapeHTML(item.id)}">
            ${escapeHTML(item.name)}
        </option>
    `).join("");

    openModal("New Sale", `
        <form id="saleForm" class="modal-form">

            <label>Customer</label>
            <select name="customer_id">
                <option value="">Walk-in Customer</option>
                ${customerOptions}
            </select>

            <label>Product</label>
            <select name="product_id" required>
                ${productOptions}
            </select>

            <label>Quantity</label>
            <input name="quantity" type="number"
                min="1" value="1" required>

            <label>Payment Method</label>
            <select name="payment_method">
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="pos">POS</option>
                <option value="other">Other</option>
            </select>

            <button type="submit" class="primary-btn">
                Complete Sale
            </button>
        </form>
    `);

    $("saleForm").addEventListener("submit", saveSale);
}

async function saveSale(event) {
    event.preventDefault();

    const form = new FormData(event.target);

    const product = products.find(item =>
        String(item.id) === String(form.get("product_id"))
    );

    const quantity = Number(form.get("quantity"));

    if (!product || !Number.isInteger(quantity) || quantity <= 0) {
        return notify("Select a valid product and quantity.", "error");
    }

    if (Number(product.quantity) < quantity) {
        return notify("Insufficient stock.", "error");
    }

    const customer = customers.find(item =>
        String(item.id) === String(form.get("customer_id"))
    );

    const total = quantity * Number(product.selling_price);
    const invoice = "NOKA-" + Date.now();

    try {
        const { data: sale, error: saleError } = await db
            .from("sales")
            .insert({
                invoice_number: invoice,
                customer_id: customer?.id || null,
                customer_name: customer?.name || "Walk-in Customer",
                total_amount: total,
                payment_method: form.get("payment_method"),
                user_id: currentUser.id
            })
            .select()
            .single();

        if (saleError) throw saleError;

        const { error: itemError } = await db
            .from("sale_items")
            .insert({
                sale_id: sale.id,
                product_id: product.id,
                product_name: product.name,
                quantity,
                unit_price: Number(product.selling_price),
                subtotal: total,
                user_id: currentUser.id
            });

        if (itemError) throw itemError;

        const { error: stockError } = await db
            .from("products")
            .update({
                quantity: Number(product.quantity) - quantity
            })
            .eq("id", product.id);

        if (stockError) throw stockError;

        const { error: movementError } = await db
            .from("stock_movements")
            .insert({
                product_id: product.id,
                product_name: product.name,
                movement_type: "out",
                quantity,
                notes: "Sale: " + invoice,
                user_id: currentUser.id
            });

        if (movementError) throw movementError;

        closeModal();

        await Promise.all([
            loadProducts(),
            loadSales(),
            loadStockMovements()
        ]);

        updateDashboard();

        notify("Sale completed. Invoice: " + invoice);

    } catch (error) {
        notify(
            "Sale could not be fully completed: " + error.message,
            "error"
        );
    }
}

// CSV EXPORT
function downloadCSV(rows, filename) {
    const csv = rows.map(row =>
        row.map(value =>
            `"${String(value ?? "").replace(/"/g, '""')}"`
        ).join(",")
    ).join("\n");

    const blob = new Blob(["\uFEFF" + csv], {
        type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
}

function exportProducts() {
    if (!products.length) {
        return notify("No products to export.", "error");
    }

    const headers = [
        "Name",
        "SKU",
        "Category",
        "Quantity",
        "Cost Price",
        "Selling Price"
    ];

    const rows = products.map(item => [
        item.name,
        item.sku,
        item.category,
        item.quantity,
        item.cost_price,
        item.selling_price
    ]);

    downloadCSV([headers, ...rows], "noka-products.csv");
    notify("Products exported successfully.");
}

function exportSales() {
    if (!sales.length) {
        return notify("No sales to export.", "error");
    }

    const headers = [
        "Invoice",
        "Customer",
        "Total",
        "Payment Method",
        "Date"
    ];

    const rows = sales.map(item => [
        item.invoice_number,
        item.customer_name,
        item.total_amount,
        item.payment_method,
        item.created_at
    ]);

    downloadCSV([headers, ...rows], "noka-sales.csv");
    notify("Sales exported successfully.");
}

// REPORTS
function showProductReport() {
    const totalValue = products.reduce(
        (sum, item) =>
            sum + Number(item.quantity || 0) *
            Number(item.cost_price || 0),
        0
    );

    const low = products.filter(item =>
        Number(item.quantity || 0) <= Number(item.min_stock ?? 5)
    );

    openModal("Product Report", `
        <div class="report-content">
            <h3>Total Products: ${products.length}</h3>

            <h3>Total Stock: ${products.reduce(
                (sum, item) => sum + Number(item.quantity || 0), 0
            )}</h3>

            <h3>Stock Cost Value: ${money(totalValue)}</h3>

            <h3>Low Stock Products: ${low.length}</h3>

            <button class="primary-btn" type="button"
                onclick="exportProducts()">
                Export Product CSV
            </button>
        </div>
    `);
}

function showSalesReport() {
    const total = sales.reduce(
        (sum, item) => sum + Number(item.total_amount || 0),
        0
    );

    openModal("Sales Report", `
        <div class="report-content">
            <h3>Total Sales Records: ${sales.length}</h3>

            <h3>Total Recorded Sales: ${money(total)}</h3>

            <button class="primary-btn" type="button"
                onclick="exportSales()">
                Export Sales CSV
            </button>
        </div>
    `);
}

// EVENT LISTENERS
document.addEventListener("DOMContentLoaded", () => {

    // LOGIN
    $("loginForm")?.addEventListener("submit", event => {
        event.preventDefault();

        login(
            $("loginEmail").value.trim(),
            $("loginPassword").value
        );
    });

    // REGISTRATION
    $("registerForm")?.addEventListener("submit", registerUser);

    // FORGOT PASSWORD
    $("resetPasswordForm")?.addEventListener(
        "submit",
        resetUserPassword
    );

    // PASSWORD VISIBILITY AND STRENGTH
    setupPasswordVisibility();
    setupPasswordStrength();

    // LOGOUT
    $("logoutBtn")?.addEventListener("click", logout);

    // NAVIGATION
    document.querySelectorAll("[data-page]").forEach(item => {
        item.addEventListener("click", () => {
            navigate(item.dataset.page);
        });
    });

    // PRODUCTS
    $("addProductBtn")?.addEventListener("click", () => productForm());

    $("productSearch")?.addEventListener("input", event => {
        renderProducts(event.target.value);
    });

    $("exportProductsBtn")?.addEventListener("click", exportProducts);

    // STOCK
    $("stockMovementBtn")?.addEventListener("click", stockForm);

    // SALES
    $("newSaleBtn")?.addEventListener("click", saleForm);

    // CUSTOMERS
    $("addCustomerBtn")?.addEventListener("click", customerForm);

    // SUPPLIERS
    $("addSupplierBtn")?.addEventListener("click", supplierForm);

    // REPORTS
    $("productReportBtn")?.addEventListener("click", showProductReport);
    $("salesReportBtn")?.addEventListener("click", showSalesReport);

    // MODAL CLOSE
    $("closeModal")?.addEventListener("click", closeModal);

    $("modalOverlay")?.addEventListener("click", event => {
        if (event.target.id === "modalOverlay") {
            closeModal();
        }
    });

    // TABLE ACTIONS
    document.addEventListener("click", event => {
        const button = event.target.closest("[data-action]");

        if (!button) return;

        const id = button.dataset.id;

        switch (button.dataset.action) {

            case "edit-product": {
                const item = products.find(product =>
                    String(product.id) === String(id)
                );

                if (item) productForm(item);
                break;
            }

            case "delete-product":
                deleteProduct(id);
                break;

            case "delete-customer":
                deleteCustomer(id);
                break;

            case "delete-supplier":
                deleteSupplier(id);
                break;
        }
    });

    // START APPLICATION
    checkSession();
});
