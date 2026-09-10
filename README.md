# Domain Deploy Tool

Tool tự động quy trình:

**Mua miền (Spaceship) → Trỏ NS (Cloudflare) → Add CF Pages → Cập nhật `domains.json` → Push GitHub**

## Chế độ vận hành hiện tại

- Single-account Cloudflare: chỉ dùng `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`
- Git-first: ưu tiên cập nhật và deploy qua Git
- `ALLOW_WRANGLER_DEPLOY=false` (mặc định) để tránh deploy nhầm từ folder local

---

## Cài đặt nhanh

```bash
cd web-tên-miền
copy .env.example .env    # Windows
# cp .env.example .env    # Mac/Linux

# Điền thông tin vào .env (xem hướng dẫn bên dưới)
node bin/cli.js setup
```

---

## Hướng dẫn lấy Spaceship API Key

### Bước 1: Đăng nhập Spaceship

Vào [spaceship.com](https://www.spaceship.com) → đăng nhập account.

### Bước 2: Vào API Manager

Mở trực tiếp: **[spaceship.com/application/api-manager](https://www.spaceship.com/application/api-manager/)**

Hoặc: Dashboard → **Account** / **Settings** → tìm mục **API Manager**.

### Bước 3: Tạo API Key mới

1. Bấm **New API key**
2. Đặt tên (vd: `domain-tool`)
3. Chọn quyền (scopes) — tick các mục sau:

| Scope | Dùng để |
|-------|---------|
| `domains:read` | Check miền, lấy contact ID |
| `domains:write` | Đổi nameservers |
| `domains:billing` | **Mua miền** (trừ tiền account) |
| `contacts:read` | Đọc contact |
| `asyncoperations:read` | Poll trạng thái mua miền |

4. Bấm **Create** / **Save**

### Bước 4: Copy Key + Secret

Sau khi tạo, Spaceship hiện:

- **API Key** → dán vào `.env` → `SPACESHIP_API_KEY`
- **API Secret** → dán vào `.env` → `SPACESHIP_API_SECRET`

> **Lưu ý:** Secret chỉ hiện **1 lần** lúc tạo. Mất thì phải tạo key mới.

### Bước 5: Lấy Contact ID

Spaceship cần contact khi mua miền qua API.

**Cách 1 — Tự động (nếu đã có miền trên Spaceship):**

```bash
node bin/cli.js contacts
```

Copy dòng `registrant: xxxxx` → dán vào `.env`:

```
SPACESHIP_CONTACT_ID=xxxxx
```

**Cách 2 — Mua 1 miền tay trên dashboard trước**, rồi chạy lệnh `contacts` ở trên.

### Bước 6: Test API

```bash
node bin/cli.js check g8us.top
```

Nếu ra trạng thái + giá → API key OK.

---

## Các biến `.env` còn lại (gửi sau cũng được)

| Biến | Lấy ở đâu |
|------|-----------|
| `CLOUDFLARE_API_TOKEN` | [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) → Create Token → template **Edit Cloudflare Workers** hoặc custom: Zone DNS Edit + Pages Edit |
| `CLOUDFLARE_ACCOUNT_ID` | CF Dashboard → bất kỳ trang nào → URL có dạng `/accounts/XXXXXXXX` |
| `CLOUDFLARE_PAGES_PROJECT` | Tên project CF Pages (vd: `web-domain`) |
| `GITHUB_TOKEN` | GitHub → Settings → Developer settings → Personal access tokens → repo scope |
| `GITHUB_OWNER` | Username hoặc org (vd: `freze-dev`) |
| `GITHUB_REPO` | Tên repo chứa `domains.json` (vd: `web-domain`) |

---

## Lệnh sử dụng

```bash
# Kiểm tra config
node bin/cli.js setup

# Check miền + giá (không mua)
node bin/cli.js check tenmien.top

# Xem contact ID
node bin/cli.js contacts

# Chạy thử — không mua, không đổi NS, không push
node bin/cli.js deploy tenmien.top https://link-hd.com --dry-run

# Full flow — MUA MIỀN THẬT, TRỪ TIỀN
node bin/cli.js deploy tenmien.top https://link-hd.com

# Miền đã mua rồi — chỉ setup CF + push code
node bin/cli.js deploy tenmien.top https://link-hd.com --skip-buy
```

---

## Flow khi chạy `deploy`

```
1. Check availability (Spaceship)
2. Mua miền nếu còn trống (trừ tiền Spaceship)
3. Tạo/lấy zone Cloudflare → lấy nameservers
4. PUT nameservers trên Spaceship → trỏ về CF
5. Chờ zone Active → add custom domain CF Pages + CNAME
6. Thêm domain + link vào domains.json → push GitHub
7. CF Pages auto deploy
```

---

## Checklist trước deploy thật

- [ ] Spaceship account có **số dư / thẻ** đủ mua miền
- [ ] `.env` đã điền đủ
- [ ] Chạy `--dry-run` trước
- [ ] Repo GitHub có file `domains.json` (format object `{ "domain": "link" }`)

---

## Gửi cho mình khi sẵn sàng

Không gửi secret trong chat công khai — chỉ điền vào file `.env` local.

Cần xác nhận:

1. Repo GitHub URL (hoặc owner/repo)
2. Tên CF Pages project
3. Format `domains.json` trong repo thật (nếu khác example)

Spaceship + CF + GitHub credentials → điền vào `.env` trên máy bạn.
