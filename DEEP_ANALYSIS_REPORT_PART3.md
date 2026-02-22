# DEEP Analysis Report — Part 3
# URL/Routing (G), Threat Model (H), Test Plan (I), Roadmap (J)

---

# G) Web Index URL & Routing Model

## สถานะปัจจุบัน

| Path | หน้าที่ | ปัญหา |
|------|--------|-------|
| `http://143.14.200.117/` | User Login (Mobile) | ใช้ IP ตรง, ไม่มี HTTPS |
| `http://143.14.200.117/map` | User Map Dashboard | ไม่มี auth guard ฝั่ง server |
| `http://143.14.200.117/ctrl-x7k9` | Admin Dashboard | Security by obscurity |
| `http://143.14.200.117/admin` | 404 → redirect `/` | Decoy/redirect |
| `http://143.14.200.117/api/*` | REST API | ไม่มี versioning |

## รูปแบบ URL ที่แนะนำ

```
https://tracker.example.com/                     → Landing/Login
https://tracker.example.com/app                   → User Dashboard
https://tracker.example.com/app/map               → Live Map
https://tracker.example.com/app/history           → History
https://tracker.example.com/app/settings          → Settings

https://tracker.example.com/admin                 → Admin Login
https://tracker.example.com/admin/dashboard       → Admin Dashboard
https://tracker.example.com/admin/devices         → Device Management
https://tracker.example.com/admin/users           → Admin Management

https://tracker.example.com/api/v1/track          → Device Data Ingestion
https://tracker.example.com/api/v1/devices        → Device CRUD
https://tracker.example.com/api/v1/auth/login     → Authentication
https://tracker.example.com/api/v1/user/vehicles  → User Vehicles
```

## Security Headers ที่ต้องเพิ่มใน Nginx

```nginx
# ใน nginx_gps.conf
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.googleapis.com https://*.gstatic.com; connect-src 'self' wss: ws: https://maps.googleapis.com;" always;
add_header Permissions-Policy "geolocation=(self), camera=(), microphone=()" always;
```

## Versioning Policy
- API ต้องมี version prefix (`/api/v1/`, `/api/v2/`)
- เมื่อเปลี่ยน API → เปิด v2 ควบคู่ → deprecate v1 ใน 90 วัน
- Maintenance page: redirect ไปยัง `/maintenance.html` เมื่อ server ปิดปรับปรุง

---

# H) Threat Model + Risk Register

## Risk Register (20+ รายการ)

| # | Risk | Attack Path | Impact | Likelihood | Current Control | Gap | Recommendation | Priority |
|---|------|------------|--------|------------|----------------|-----|---------------|----------|
| 1 | **GPS Data Interception** | Man-in-the-Middle บน HTTP | 🔴 Critical | 🟠 High | ❌ ไม่มี | ไม่มี TLS | ติดตั้ง HTTPS + TLS 1.3 | P0 |
| 2 | **Admin Password Leak** | DB file leak → plain text passwords | 🔴 Critical | 🟠 High | ❌ Plain text | No hashing | bcrypt/argon2 hash | P0 |
| 3 | **Unauthorized Admin API** | เรียก API โดยไม่ login | 🔴 Critical | 🔴 Very High | ❌ No middleware | No auth check | Auth middleware ทุกเส้น | P0 |
| 4 | **GPS Data Spoofing** | ส่ง fake POST /api/track | 🔴 Critical | 🟠 High | ❌ ไม่มี | No device auth | HMAC + device cert | P1 |
| 5 | **User Impersonation** | รู้เบอร์โทร → เข้าดูรถคนอื่น | 🔴 Critical | 🟠 High | ❌ Phone=Token | No OTP/password | OTP verification | P1 |
| 6 | **SQLite Corruption** | Concurrent writes, power loss | 🟠 High | 🟡 Medium | WAL mode ไม่แน่ใจ | Single file DB | Migrate to PostgreSQL | P1 |
| 7 | **Google Maps API Abuse** | ขโมย API key จาก source | 🟠 High | 🟠 High | ❌ No restriction | Key exposed | API key restriction | P1 |
| 8 | **Credential Brute Force** | ลอง 100K combinations | 🟠 High | 🟡 Medium | ❌ No rate limit | 6-digit numeric | Rate limit + alphanumeric | P1 |
| 9 | **Session Hijacking** | Steal cookie over HTTP | 🟠 High | 🟠 High | httpOnly cookie | No Secure flag (no HTTPS) | HTTPS + Secure flag | P1 |
| 10 | **XSS Attack** | Inject script via device_id | 🟠 High | 🟡 Medium | ❌ No CSP | No input sanitization | CSP + sanitize | P2 |
| 11 | **No Audit Trail** | Admin ทำอะไรก็ได้ ไม่มีบันทึก | 🟠 High | 🟡 Medium | ❌ ไม่มี | No logging | Audit log table | P2 |
| 12 | **Device Firmware Tamper** | Flash firmware ใหม่ | 🟠 High | 🟡 Low | ❌ No secure boot | Physical access | Secure boot + flash encryption | P2 |
| 13 | **BLE Key Clone** | Clone BLE MAC address | 🟠 High | 🟡 Medium | MAC-based auth | No challenge-response | BLE pairing / encryption | P2 |
| 14 | **Data Loss (No Backup)** | Server crash → SQLite ไฟล์หาย | 🔴 Critical | 🟡 Medium | ❌ No backup | Single point of failure | Automated daily backup | P1 |
| 15 | **DoS on /api/track** | Flood POST requests | 🟠 High | 🟡 Medium | ❌ No rate limit | Open endpoint | Rate limit per IP/device | P2 |
| 16 | **Socket.IO Hijack** | Connect to WS without auth | 🟠 High | 🟡 Medium | CORS origin * | No auth on socket | Socket authentication | P2 |
| 17 | **Firebase Credentials Leak** | `.env.local` มี Firebase keys | 🟡 Medium | 🟡 Medium | gitignore | Still on server | Remove unused Firebase | P3 |
| 18 | **No Data Retention Policy** | Logs grow unbounded | 🟡 Medium | 🟠 High | ❌ ไม่มี | No cleanup | Auto-purge > 90 วัน | P3 |
| 19 | **Clock Manipulation** | Fake timestamp in payload | 🟡 Medium | 🟡 Low | GPS time | No server-side validation | Server timestamp validation | P3 |
| 20 | **Geofence Data Loss** | localStorage clear → หาย | 🟡 Medium | 🟠 High | localStorage | Client-only storage | Store in server DB | P2 |
| 21 | **CORS Wildcard** | `origin: "*"` ใน Socket.IO | 🟡 Medium | 🟡 Medium | ❌ Wildcard | Any origin can connect | Restrict to domain | P2 |
| 22 | **Hardcoded IP** | เปลี่ยน server ต้อง re-flash ESP32 | 🟡 Medium | 🟡 Low | ❌ Hardcoded | No config endpoint | DNS + config API | P3 |

---

# I) Test Plan

## 1. Functional Tests (End-to-End)

| # | Test Case | Method | Expected Result |
|---|-----------|--------|----------------|
| F1 | ESP32 boot → ส่งข้อมูล → ปรากฏบน Admin | Simulator (`simulate_esp32_full.js`) | Device ปรากฏใน Admin table |
| F2 | Status 1 (STOLEN) → Alert popup + sound | Simulator ส่ง type 1 | Frontend แสดง popup + เสียง |
| F3 | Status 2 (CRASH) → Alert popup | Simulator ส่ง type 2 | Frontend แสดง crash alert |
| F4 | Status 3 (NORMAL) → ปิด alert | Simulator ส่ง type 3 | Alert ปิดอัตโนมัติ |
| F5 | User login → register → view map | Manual (Browser) | ลงทะเบียนสำเร็จ, เห็นรถบนแผนที่ |
| F6 | Admin login (TOTP) → view devices | Manual (Browser) | Login สำเร็จ, เห็นรายการอุปกรณ์ |
| F7 | Generate credential → user register | Manual (Browser) | Credential ถูก mark ว่าใช้แล้ว |
| F8 | Socket.IO real-time update | 2 browser tabs | Tab 2 เห็นการเปลี่ยนแปลงทันที |
| F9 | Geofence enter/exit | Simulator + geofence setup | Toast notification ปรากฏ |
| F10 | Add car (existing user) | Manual (Browser) | เห็นรถเพิ่มใน carousel |

## 2. Security Tests

| # | Test Case | Tool/Method | Expected |
|---|-----------|------------|----------|
| S1 | เรียก `/api/admin/users` โดยไม่ login | curl | ⛔ ปัจจุบัน: 200 OK (ต้อง fix เป็น 401) |
| S2 | Brute force credential code | Script loop 000000-999999 | ⛔ ไม่มี rate limit (ต้อง fix) |
| S3 | SQL Injection บน device_id | `' OR 1=1 --` | ✅ ใช้ parameterized queries |
| S4 | XSS via device name | `<script>alert(1)</script>` | ⚠️ React auto-escapes แต่ไม่มี CSP |
| S5 | HTTP traffic sniffing | Wireshark on network | ⛔ ทุกอย่างเป็น plain text |
| S6 | Cookie theft over HTTP | Intercept cookie | ⛔ No Secure flag |
| S7 | Fake GPS data | curl POST /api/track | ⛔ ไม่มี device auth |
| S8 | Socket.IO without auth | socket.io-client connect | ⛔ ใครก็เชื่อมได้ |

## 3. Performance / Load

| # | Test | Target | Tool |
|---|------|--------|------|
| P1 | Concurrent GPS events/sec | ≥ 100 req/s | Artillery / k6 |
| P2 | SQLite write throughput | ≥ 50 writes/s | Custom script |
| P3 | Socket.IO broadcast latency | < 200ms (100 clients) | Socket.IO benchmark |
| P4 | DB size at 1M logs | ประมาณ size + query time | SQLite EXPLAIN |

## 4. Reliability Tests

| # | Test | Method | Expected |
|---|------|--------|----------|
| R1 | Network drop (4G) | Disconnect SIM | ESP32 retry → reconnect |
| R2 | Server restart (PM2) | `pm2 restart` | Session หาย, clients reconnect |
| R3 | Power cycle ESP32 | Pull power → reconnect | Boot → GPS fix → ส่งข้อมูลต่อ |
| R4 | SQLite file corruption | Kill -9 node during write | ⚠️ อาจ corrupt → ต้อง test |

## 5. Observability

| Component | สถานะ | ต้องเพิ่ม |
|-----------|-------|----------|
| Application Logs | ✅ `console.log` | Structured logging (winston/pino) |
| Error Tracking | ❌ ไม่มี | Sentry / error handler middleware |
| Metrics | ❌ ไม่มี | Prometheus + Grafana |
| Alerting | ❌ ไม่มี | Uptime monitor (UptimeRobot/Better Stack) |
| DB Monitoring | ❌ ไม่มี | SQLite size / query time monitoring |

---

# J) Recommendations Roadmap

## Quick Wins (1-2 สัปดาห์)

| # | Action | Owner | Measurable Result | Effort |
|---|--------|-------|-------------------|--------|
| Q1 | ติดตั้ง SSL/TLS (Let's Encrypt) + Certbot auto-renew | DevOps | HTTPS ทำงาน, HTTP redirect 301 | 2 ชม. |
| Q2 | Hash passwords ด้วย bcrypt | Backend | `password_hash` ไม่ใช่ plain text | 1 ชม. |
| Q3 | เพิ่ม Auth Middleware บน Admin API ทุกเส้น | Backend | API return 401 เมื่อไม่ login | 2 ชม. |
| Q4 | เพิ่ม Security Headers ใน Nginx | DevOps | SecurityHeaders.com ได้ A+ | 30 นาที |
| Q5 | Restrict Google Maps API Key (HTTP Referrer) | Frontend | Key ใช้ได้เฉพาะ domain ตัวเอง | 30 นาที |
| Q6 | เพิ่ม Rate Limit บน `/api/track` และ `/api/user/login` | Backend | express-rate-limit: 100 req/min/IP | 1 ชม. |
| Q7 | ตั้ง Automated Backup (SQLite → S3/GDrive) | DevOps | Daily backup + 30-day retention | 2 ชม. |
| Q8 | ลบ Firebase credentials จาก `.env.local` (ไม่ได้ใช้แล้ว) | Backend | ไม่มี unused secrets | 15 นาที |

## Mid-term (30-60 วัน)

| # | Action | Owner | Measurable Result | Effort |
|---|--------|-------|-------------------|--------|
| M1 | Migrate SQLite → PostgreSQL | Backend/DevOps | Concurrent writes OK, replication ready | 1 สัปดาห์ |
| M2 | เพิ่ม User OTP Login (SMS/LINE) | Backend/Frontend | ยืนยัน identity ก่อนเข้าถึงข้อมูล | 1 สัปดาห์ |
| M3 | ย้าย Geofence จาก localStorage → Server DB | Backend/Frontend | Geofence ไม่หายเมื่อเปลี่ยนเครื่อง | 3 วัน |
| M4 | เพิ่ม HMAC signature บน ESP32 payload | Firmware/Backend | Reject spoofed data | 3 วัน |
| M5 | Implement Store-and-Forward บน ESP32 | Firmware | ข้อมูลไม่หายเมื่อ offline | 1 สัปดาห์ |
| M6 | เพิ่ม Push Notification ด้วย FCM | Backend/Mobile | แจ้งเตือนเมื่อปิดแอป | 3 วัน |
| M7 | เพิ่ม Audit Log table + admin action logging | Backend | ทุก action ถูกบันทึก | 2 วัน |
| M8 | Socket.IO Authentication | Backend | เฉพาะ authenticated clients | 1 วัน |
| M9 | ใช้ Domain + DNS แทน IP ตรง | DevOps | เปลี่ยน server ไม่ต้อง re-flash | 1 วัน |
| M10 | Data Retention Policy (auto-purge logs > 90 วัน) | Backend | DB ไม่โตไม่จำกัด | 1 วัน |

## Long-term (90+ วัน)

| # | Action | Owner | Measurable Result | Effort |
|---|--------|-------|-------------------|--------|
| L1 | ESP32 OTA Firmware Update | Firmware/Backend | Update firmware ผ่าน 4G ไม่ต้องถอดอุปกรณ์ | 2 สัปดาห์ |
| L2 | ESP32 Secure Boot + Flash Encryption | Firmware | ป้องกัน firmware tamper | 1 สัปดาห์ |
| L3 | Implement API Versioning (`/api/v1/`) | Backend | Backward compatible upgrades | 3 วัน |
| L4 | Add Monitoring Stack (Prometheus + Grafana) | DevOps | Dashboards + alerting | 1 สัปดาห์ |
| L5 | BLE Security (Pairing + LESC) | Firmware | ป้องกัน key cloning | 1 สัปดาห์ |
| L6 | AI Agent Integration (anomaly detection) | Backend/AI | Auto-detect suspicious patterns | 2 สัปดาห์ |
| L7 | Kalman Filter สำหรับ GPS smoothing | Firmware | ลด GPS jitter/jumping | 3 วัน |
| L8 | Multi-region / HA setup | DevOps | 99.9% uptime | 2 สัปดาห์ |
| L9 | PDPA Compliance review | Legal/IT | Data processing agreement, consent | 1 เดือน |
| L10 | Penetration Testing (External) | Security | Professional pen-test report | 1 สัปดาห์ |

---

# สรุป (Overall Assessment)

## ระดับความพร้อม

| ด้าน | คะแนน (1-10) | หมายเหตุ |
|------|:-----------:|---------|
| Functionality | 7/10 | ฟีเจอร์หลักทำงานได้ (track, alert, admin, user) |
| Security | **2/10** | วิกฤต — ไม่มี HTTPS, plain text password, no auth middleware |
| Reliability | 4/10 | SQLite single file, no backup, no store-and-forward |
| Scalability | 3/10 | SQLite + single PM2 instance ไม่รองรับ growth |
| Observability | 2/10 | console.log เท่านั้น, ไม่มี monitoring/alerting |
| UX/UI | 7/10 | ออกแบบดี, responsive, dark mode admin |
| Documentation | 3/10 | มี README แต่ไม่ละเอียด |

## Priority Matrix

```
        ┌──────────────────────────────────────────┐
        │        HIGH IMPACT                        │
        │                                          │
  HIGH  │  🔴 P0: HTTPS, Password Hash,           │
  LIKE  │       Auth Middleware, Backup            │
  LI-   │                                          │
  HOOD  │  🟠 P1: PostgreSQL, User OTP,           │
        │       API Key Restrict, HMAC,            │
        │       Store-and-Forward                   │
        ├──────────────────────────────────────────┤
        │        MEDIUM IMPACT                      │
  LOW   │                                          │
  LIKE  │  🟡 P2: Audit Logs, Geofence Server,    │
  LI-   │       Socket Auth, CSP, FCM             │
  HOOD  │                                          │
        │  🟢 P3: OTA, AI, Monitoring,             │
        │       PDPA, Pen-test                     │
        └──────────────────────────────────────────┘
```

> **สรุปสั้น:** ระบบทำงานได้ในเชิงฟังก์ชัน แต่มี **ช่องโหว่ความปลอดภัยระดับวิกฤต** ที่ต้องแก้ไข **ภายใน 7 วัน** (HTTPS + Password Hash + Auth Middleware) ก่อนที่จะนำไปใช้งานจริงในเชิงพาณิชย์

---

*— จบรายงาน —*
