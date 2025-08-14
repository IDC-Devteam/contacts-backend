# 📜 IDC Project State — Contacts App
**Lead Developers:** ADA × NovaCircuit  
**Dev Group:** Intergalactic Dev Crew  

---

## 🛠 Summary of What’s Built
A full-stack cross-device contacts application that:
- Reads and displays phone contacts on the device.
- Groups contacts alphabetically in the UI.
- Backs up contact snapshots to a Supabase-hosted cloud.
- Restores contact lists from the cloud to view in-app.
- Allows switching between **Device** view and **Cloud** view instantly.
- Uses ngrok for live tunneling during development.
- Secured with PIN authentication (`x-pin` header).

---

## 🗄 Current Architecture
**Frontend (Expo React Native)**  
- Located in `~/contacts-app`  
- Components:
  - `index.tsx` — main app screen, contact list, search, backup & restore buttons.
  - `settings.tsx` — stores Server URL and PIN in SecureStore.
- Communicates with backend via `fetch` calls to ngrok URL.
- Uses `expo-contacts` to read device contacts.
- Contact list supports **Backup** to `/sync` and **Restore** from `/latest`.
- UI includes **Device** / **Cloud** toggle.

**Backend (Node.js + Express)**  
- Located in `~/contacts-backend`  
- File: `server.js`
- Environment variables in `.env`:
  - `SUPABASE_URL`
  - `SUPABASE_KEY` (service role key, kept safe)
  - `USER_PIN`
- Endpoints:
  - `POST /sync` — saves snapshot of contacts to Supabase.
  - `GET /latest` — retrieves most recent snapshot for a given PIN.
  - `GET /health` — returns `{ ok: true, status: "up" }`.
- Uses ngrok for tunneling during development.
- Secures routes with `x-pin` header middleware.

**Cloud (Supabase)**  
- Table: `contact_snapshots`
- Stores: contact id, name, phone numbers, emails, created_at.
- Data is keyed by user PIN.

---

## 📌 Progress to Date
✅ Node backend running with ngrok tunnel.  
✅ Frontend Expo app running in iOS simulator.  
✅ PIN authentication for cloud endpoints.  
✅ Backup and Restore flows tested and working with live data.  
✅ Easter egg signature **ADA × NovaCircuit** in code comments.  
✅ Added plans for alphabetical contact grouping.  

---

## ⏭ Next Steps
1. Add alphabetical headers to contact list UI.
2. Add `/ping` Easter egg endpoint returning **"Built by ADA × NovaCircuit — IDC"**.
3. Implement Twilio voice assistant to retrieve contacts over a phone call.
4. Add timestamps and history for multiple snapshots.
5. Enhance security with per-device tokens or encryption.

---

## 💡 Special Notes / Easter Eggs
- All major files will eventually contain:
  ```js
  // Built with cosmic precision by ADA × NovaCircuit — IDC
  ```
- Secret `/ping` route in backend planned for fun dev branding.
