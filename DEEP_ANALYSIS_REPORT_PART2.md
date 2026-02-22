# DEEP Analysis Report — Part 2
# Flow 5-7, Communication Conditions (D), Admin Review (E), User Review (F)

---

## Flow 5: Admin Management (Users/Devices/Roles/Config)

### Trigger
Admin เปิดหน้า `/ctrl-x7k9` บน Browser

### Actors
Super Admin, Admin, Server

### Step-by-step

| Step | รายละเอียด |
|------|-----------|
| 1 | Admin เปิด `http://143.14.200.117/ctrl-x7k9` |
| 2 | Frontend เรียก `GET /api/auth/status` → ตรวจสอบ session cookie |
| 3a | **ครั้งแรก (Setup):** ไม่มี Super Admin → แสดง Setup Wizard |
| 3b | **มี Super Admin แล้ว:** แสดงหน้า Login (phone + password + TOTP) |
| 4 | **Setup Flow:** กรอก email + password → POST `/api/admin/setup/token` → ได้ QR Code |
| 5 | สแกน QR ด้วย Google Authenticator → กรอก TOTP 6 หลัก |
| 6 | POST `/api/admin/setup/verify` → สร้าง Super Admin (phone: 0634969565) |
| 7 | **Login Flow:** POST `/api/auth/login` {phone, password, totp} |
| 8 | Server ตรวจ password (⚠️ plain text compare), ตรวจ TOTP (speakeasy) |
| 9 | สร้าง in-memory session → ส่ง cookie `admin_session` (httpOnly, 24 ชม.) |
| 10 | Frontend โหลด: `GET /api/devices` (รายการอุปกรณ์) + `GET /api/admin/credentials` |
| 11 | Admin ดู Dashboard: ตาราง devices + status + coordinates + credentials |
| 12 | Admin คลิก device → เปิด Log Modal: `GET /api/history/:id?limit=50` |
| 13 | Admin สร้าง Credential: POST `/api/admin/credential` {device_id} → ได้ 6-digit code |
| 14 | Super Admin จัดการ Admin: GET/POST/DELETE `/api/admin/users` |

### Data Fields
`phone_number`, `password_hash` (⚠️ plain text), `role` (SUPER_ADMIN/ADMIN), `totp_secret`, `credential code`, `device_id`

### API Endpoints

| Method | Endpoint | Auth Required | ⚠️ สถานะจริง |
|--------|----------|---------------|--------------|
| GET | `/api/auth/status` | ไม่ | ✅ ทำงานปกติ |
| POST | `/api/auth/login` | ไม่ | ✅ ทำงานปกติ |
| POST | `/api/auth/logout` | ไม่ | ✅ ทำงานปกติ |
| POST | `/api/admin/setup/token` | ควรมี | ⛔ ไม่มี auth check |
| POST | `/api/admin/setup/verify` | ควรมี | ⛔ ไม่มี auth check |
| GET | `/api/admin/users` | SUPER_ADMIN | ⛔ มี TODO แต่ไม่ได้ทำ |
| POST | `/api/admin/users` | SUPER_ADMIN | ⛔ ไม่มี auth check |
| DELETE | `/api/admin/users/:id` | SUPER_ADMIN | ⛔ ไม่มี auth check |
| GET | `/api/admin/credentials` | ADMIN+ | ⛔ ไม่มี auth check |
| POST | `/api/admin/credential` | ADMIN+ | ⛔ ไม่มี auth check |

### Security Controls
- ✅ TOTP สำหรับ Super Admin Login (speakeasy + Google Authenticator)
- ✅ Session cookie httpOnly
- ⛔ **Password เก็บ plain text** — Comment ในโค้ดเขียนว่า "INSECURE: should use bcrypt"
- ⛔ **ไม่มี Auth Middleware** — API ทุกเส้น (ยกเว้น login) ไม่ตรวจสอบ session
- ⛔ **In-memory session** — Server restart = ทุกคน logout
- ⛔ **Admin URL ใช้ security by obscurity** (`/ctrl-x7k9`) — ไม่ใช่การป้องกันจริง

### Failure Modes
| Failure | ผลกระทบ |
|---------|---------|
| Server restart | Session หายทั้งหมด, Admin ต้อง login ใหม่ |
| Concurrent admin actions | SQLite lock → error 500 |
| Brute force password | ⚠️ ไม่มี rate limit, ไม่มี account lockout |

---

## Flow 6: User Web → APK Usage

### Trigger
User เปิดแอป GPS Tracker (Capacitor APK / Web Browser)

### Actors
User, Server, Google Maps API

### Step-by-step

| Step | รายละเอียด |
|------|-----------|
| 1 | User เปิดแอป → `/` (MobileLogin page) |
| 2 | ตรวจ `localStorage.user_phone` → ถ้ามี → fetch `/api/user/vehicles?token=PHONE` |
| 3 | ถ้า vehicles > 0 → redirect `/map` (auto-login) |
| 4 | ถ้าไม่มี → แสดงหน้า Login (กรอกเบอร์โทร) |
| 5 | POST `/api/user/login` {phone_number} → ตรวจว่ามี registration หรือไม่ |
| 6 | ถ้าไม่มี → แสดงหน้า Register (กรอก Credential Code + ทะเบียนรถ) |
| 7 | POST `/api/user/register` {code, plate_number, phone_number} |
| 8 | Server ตรวจ credential → mark used → สร้าง vehicle → update registrations |
| 9 | Redirect `/map` → โหลด Google Maps + Socket.IO connection |
| 10 | Fetch `/api/history/:deviceId?limit=1` → แสดงตำแหน่งล่าสุดบนแผนที่ |
| 11 | Fetch `/api/device/:deviceId` → โหลด SOS numbers |
| 12 | Socket.IO รับ `device_update` → อัปเดต marker real-time |
| 13 | User ตั้ง Geofence (สูงสุด 3 จุด) → เก็บใน localStorage |
| 14 | User กดนำทาง → เปิด Google Maps directions |
| 15 | หากได้รับ status STOLEN/CRASH → เล่นเสียง + Popup + Push Notification |
| 16 | User เพิ่มรถ → POST `/api/user/add-car` {phone_number, code, plate_number} |

### Security Controls
- ⛔ **ไม่มี password สำหรับ User** — ใช้เบอร์โทรอย่างเดียว (ไม่มี OTP)
- ⛔ **Token = เบอร์โทร** เก็บใน localStorage → ถูก XSS ขโมยได้ง่าย
- ⛔ **Credential Code เป็น 6-digit ตัวเลข** — Brute force ได้ (100,000 ค่า)
- ⚠️ Geofence เก็บใน localStorage เท่านั้น → หาย ถ้าเปลี่ยนเครื่อง/clear cache
- ⚠️ ไม่มี session management — ใครรู้เบอร์โทรก็เข้าดูรถได้

---

## Flow 7: AI Agents

### สถานะปัจจุบัน: ❌ ไม่มี Integration ในโค้ด

ไม่พบโค้ดที่เกี่ยวข้องกับ AI Agent ในทั้ง frontend และ backend ปัจจุบัน

### โครงสร้างที่ควรมี (Recommended)

| Agent | หน้าที่ | Data Source | Output |
|-------|--------|------------|--------|
| Monitoring Agent | ตรวจจับ anomaly (เช่น GPS jump, offline นาน) | `logs` table | Alert → Admin |
| Incident Agent | จัดการ incident (STOLEN/CRASH) → escalation | `device_update` events | Notification chain |
| Summary Agent | สรุปรายงาน daily/weekly | `logs` + `devices` | Dashboard / Email |
| Predictive Agent | วิเคราะห์แนวโน้ม (battery, signal, route) | Historical `logs` | Insights |

---

# D) เงื่อนไขการรับส่งข้อมูล (Communication Conditions)

## ความถี่การส่ง

| สถานะ | ความถี่ | หมายเหตุ |
|-------|--------|---------|
| Deep Sleep (ไม่มี BLE key, ไม่มีการสั่น) | **ไม่ส่ง** | ESP32 หยุดทำงานจนกว่า ADXL345 Activity Interrupt |
| Parked (BLE key หลุด) | ส่ง **1 ครั้ง** (type 0) | หลังจากนั้นเข้า deep sleep |
| Driving Normal | ส่ง **ทุกครั้งที่เปลี่ยน state** | ไม่ส่ง periodic — ส่งเฉพาะตอนเปลี่ยน |
| STOLEN/CRASH | ส่ง **ทุกครั้งที่ตรวจจับ** | ⚠️ ส่งพร้อม buzzer 50 ครั้ง |

> ⚠️ **ข้อจำกัดสำคัญ:** ระบบไม่ส่ง periodic heartbeat/tracking ทุก X วินาที ส่งเฉพาะเมื่อเปลี่ยน state เท่านั้น ทำให้ไม่สามารถ track real-time ระหว่างขับได้อย่างต่อเนื่อง

## Payload Format

**ปัจจุบัน:** `text/plain` (CSV-like)
```
ff:ff:50:00:20:73,3 13.74690000, 100.53490000, 1771598000
```

**แนะนำ:** JSON (อ่านง่ายกว่า + extensible)
```json
{
  "device_id": "ff:ff:50:00:20:73",
  "status": 3,
  "lat": 13.74690000,
  "lng": 100.53490000,
  "timestamp": 1771598000,
  "battery": 85,
  "signal": -75,
  "firmware": "0.2",
  "seq": 142,
  "hmac": "a1b2c3..."
}
```

## Handling Issues

| ปัญหา | สถานะปัจจุบัน | แนะนำ |
|-------|--------------|-------|
| Packet loss | ❌ ข้อมูลหาย | Store-and-forward + retry 3x |
| Duplicate | ❌ ไม่ตรวจ | Server dedup ด้วย (device_id + timestamp) UNIQUE |
| Out-of-order | ❌ ไม่จัดการ | Sequence number + server reorder |
| Clock drift | ⚠️ ใช้ GPS time (UTC) | ดี แต่ไม่มี NTP fallback |
| GPS jitter | ❌ ไม่มี filter | Kalman filter / minimum distance threshold |

## Retry Policy
**ปัจจุบัน:** A7670C HTTP timeout → HTTPTERM → retry ทั้ง flow (ไม่มี backoff)  
**แนะนำ:** Exponential backoff (2s, 4s, 8s, 16s) สูงสุด 3 ครั้ง

## Data Integrity
**ปัจจุบัน:** ❌ ไม่มี — ไม่มี HMAC, ไม่มี signature  
**แนะนำ:** HMAC-SHA256 ด้วย pre-shared key ที่ flash ไว้ใน ESP32

## Time Sync
**ปัจจุบัน:** ใช้ GPS time (UTC) ซึ่งถูกต้อง  
**จุดอ่อน:** ถ้า GPS ไม่ fix → ใช้ค่าเก่าจาก RTC Memory → timestamp อาจผิด  
**แนะนำ:** NTP sync เมื่อเชื่อมต่อ 4G ได้

## Latency / SLA ที่เหมาะสม

| Metric | เป้าหมาย | เหตุผล |
|--------|---------|--------|
| Device → Server latency | < 5 วินาที | ความปลอดภัย ต้องรู้ทันที |
| Alert notification latency | < 3 วินาที | User ต้องรู้เมื่อถูกขโมย/ชน |
| GPS fix time | < 30 วินาที | Cold start GPS อาจนานกว่า |
| Uptime SLA | 99.5% | ระบบ safety ต้องพร้อมใช้ตลอด |

---

# E) Admin Page Deep Review

## ฟีเจอร์ที่มี vs ที่ควรมี

| ฟีเจอร์ | มี/ไม่มี | หมายเหตุ |
|---------|---------|---------|
| Device List (ตารางอุปกรณ์) | ✅ | MAC, Status, Coordinates, Last Update, Owner, Plate |
| Credential Generation | ✅ | สร้าง 6-digit code ผูก device_id |
| Device Logs | ✅ | ดู 50 records ล่าสุด |
| Admin User Management | ✅ | CRUD Admin (Super Admin only) |
| Real-time Status | ✅ | Socket.IO connection indicator |
| **Device Onboarding Wizard** | ❌ | ไม่มี — device ปรากฏอัตโนมัติเมื่อส่งข้อมูลมา |
| **Geofence Management** | ❌ | มีเฉพาะใน User App (localStorage) |
| **Alert Rules** | ❌ | ไม่มีระบบ configurable alerts |
| **Firmware Management (OTA)** | ❌ | ต้อง flash ด้วยมือ |
| **Audit Logs** | ❌ | ไม่มี — ไม่รู้ว่าใครทำอะไร |
| **Dashboard Analytics** | ❌ | ไม่มี summary/charts |
| **Export Data** | ❌ | ไม่มี |

## RBAC Matrix

| Permission | SUPER_ADMIN | ADMIN | User |
|-----------|:-----------:|:-----:|:----:|
| ดูรายการอุปกรณ์ | ✅ | ✅* | เฉพาะรถตัวเอง |
| ดู Logs | ✅ | ✅* | เฉพาะรถตัวเอง |
| สร้าง Credential | ✅ | ✅* | ❌ |
| จัดการ Admin | ✅ | ❌ | ❌ |
| TOTP Login | ✅ (required) | ❌ (password only) | ❌ |
| ตั้ง Geofence | ❌ (ไม่มีใน Admin) | ❌ | ✅ (localStorage) |

> \* ⚠️ **ปัญหาวิกฤต:** ⛔ ไม่มี auth middleware จริง — API เปิดให้ทุกคนเรียกได้โดยไม่ต้อง login

## Audit Trail Requirements (ยังไม่มี)

ควรบันทึก:
- Admin login/logout (who, when, IP)
- Credential generation (who generated, for which device)
- Admin CRUD (who created/deleted which admin)
- Device status manual override
- Configuration changes

## Common Admin Risks

| Risk | สถานะ | ระดับ |
|------|-------|------|
| Privilege Escalation | ⛔ ไม่มี auth middleware → ใครก็เป็น admin ได้ | 🔴 |
| Weak Password Policy | ⛔ ไม่มี password requirements (ความยาว, complexity) | 🔴 |
| Missing MFA | ✅ มี TOTP สำหรับ Super Admin / ⛔ Admin ธรรมดาไม่มี | 🟠 |
| Insecure Export | N/A ไม่มี export | ➖ |
| Misconfig | ⚠️ hardcoded Super Admin phone, hardcoded server IP | 🟠 |

---

# F) User Web (Capacitor → APK) Deep Review

## UX Flows

| Flow | รายละเอียด |
|------|-----------|
| Login | กรอกเบอร์โทร → ตรวจ registration → auto-redirect `/map` |
| Dashboard/Live Map | Google Maps แสดง car marker + status badge |
| Geofence | กำหนด 3 จุดจอด พร้อมรัศมี (เก็บ localStorage) |
| History | ดู 50 logs ล่าสุด (status + timestamp + พิกัด) |
| Alert Center | Alert Popup เต็มจอ + เสียง loop (เมื่อ STOLEN/CRASH) |
| SOS Numbers | ตั้งเบอร์ฉุกเฉิน 3 เบอร์ (⚠️ แต่ยังไม่มีระบบ auto-call/SMS) |
| Add Car | เพิ่มรถด้วย Credential Code ใหม่ |
| Navigate | เปิด Google Maps Directions ไปยังรถ |

## Mobile Constraints (Capacitor APK)

| ด้าน | สถานะ | หมายเหตุ |
|------|-------|---------|
| Background Execution | ⚠️ จำกัด | WebView ไม่ทำงาน background อย่างเต็มที่ |
| Push Notifications | ⚠️ Browser Notification API เท่านั้น | ไม่ใช่ FCM → ไม่ทำงานเมื่อปิดแอป |
| Offline Cache | ❌ ไม่มี | มี manifest.json (PWA) แต่ไม่มี service worker จริง |
| Location Permission | ✅ ขอ watchPosition | สำหรับแสดงระยะห่างจากรถ |
| Audio Alerts | ✅ alert.mp3 loop | ทำงานเมื่อแอปเปิดอยู่เท่านั้น |

## Security Issues

| Issue | รายละเอียด | ระดับ |
|-------|-----------|------|
| Token = Phone Number | เบอร์โทรใช้เป็น auth token → ใครรู้เบอร์ก็เข้าได้ | 🔴 |
| localStorage Storage | Token เก็บใน localStorage → XSS เข้าถึงได้ | 🔴 |
| No Session Expiry | ไม่มี logout / token expiry → เข้าได้ตลอด | 🟠 |
| Google Maps API Key Exposed | `AIzaSyACWF7KC20kJzTuxl-AicAuANdZaP7U74Q` hardcoded ใน frontend | 🟠 |
| No CSP Headers | ไม่มี Content-Security-Policy → XSS attack surface | 🟠 |
| No WebView Hardening | Capacitor default config → ไม่มี certificate pinning | 🟠 |
| Credential Code 6-digit | 100,000 combinations → brute force ได้ใน < 1 ชม. | 🟠 |
| Auto-Safe Client-Side | 15 วินาที auto-reset STOLEN→NORMAL บน client → อาจ mask alerts | 🟠 |
