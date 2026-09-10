const BASE_URL = "http://localhost:3000";

async function runTests() {
  console.log("=== BẮT ĐẦU KIỂM THỬ HỆ THỐNG 3 GIAI ĐOẠN ===");

  // 1. Test Auth Admin
  console.log("\n1. Test Đăng nhập Admin...");
  const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  });
  const adminAuth = await adminLoginRes.json();
  console.log("Admin Auth Result:", adminAuth);
  const adminToken = adminAuth.token;

  // 2. Test Đăng ký User mới
  console.log("\n2. Test Đăng ký User mới...");
  const userRegisterRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: `agent_${Date.now().toString().slice(-4)}`,
      password: "password123",
      fullName: "Đại Lý Test Pro",
    }),
  });
  const userAuth = await userRegisterRes.json();
  console.log("User Register Result:", userAuth);
  const userToken = userAuth.token;
  const userId = userAuth.user.id;

  // 3. Test Kiểm tra số dư User (0$)
  console.log("\n3. Test Kiểm tra số dư User...");
  const balanceRes1 = await fetch(`${BASE_URL}/api/wallet/balance`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  console.log("User Initial Balance:", await balanceRes1.json());

  // 4. Test Admin nạp 20$ cho User
  console.log("\n4. Test Admin nạp 20$ cho User...");
  const topupRes = await fetch(`${BASE_URL}/api/admin/wallet/topup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      userId,
      amount: 20.0,
      note: "Nạp tiền chạy thử nghiệm hệ thống",
    }),
  });
  console.log("Admin Topup Result:", await topupRes.json());

  // 5. Test Lấy Task Queue
  console.log("\n5. Test Danh sách Task Queue...");
  const tasksRes = await fetch(`${BASE_URL}/api/tasks`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log("Current Tasks Count:", (await tasksRes.json()).count);

  // 6. Test VIP Web Cloner (Thử clone 1 web nhẹ)
  console.log("\n6. Test VIP Web Cloner...");
  const cloneRes = await fetch(`${BASE_URL}/api/tasks/clone-web`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      url: "https://example.com",
      templateName: "Mẫu Clone Demo Example",
    }),
  });
  const cloneJob = await cloneRes.json();
  console.log("Clone Web Job Response:", cloneJob);

  // 7. Test Check tên miền tenmienbet.top
  console.log("\n7. Test Kiểm tra khả dụng tên miền tenmienbet.top...");
  const checkRes = await fetch(`${BASE_URL}/api/check-domain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain: "tenmienbet.top" }),
  });
  const checkData = await checkRes.json();
  console.log("Availability of tenmienbet.top:", checkData);

  console.log("\n=== HOÀN TẤT KIỂM THỬ CÁC TÍNH NĂNG CHÍNH! ===");
}

runTests().catch((e) => console.error("Test Error:", e));
