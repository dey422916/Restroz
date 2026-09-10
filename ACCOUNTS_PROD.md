# RestroZ — Production Environment Directory

This directory outlines production environment account structures.

---

### 👑 1. Platform Super Admin
- **Role**: `SUPER_ADMIN`
- **Email**: `ratnadeepdey13@gmail.com`
- **Full Name**: Ratnadeep Dey
- **Environment**: `PRODUCTION`
- **Access**: Global Platform Oversight, Tenant Management, Subscriptions

---

### 🔐 Security & Credential Management Policy
- Production credentials and individual tenant member logins are never stored in tracked code repositories.
- Password resets and new staff provisioning must always be executed through authenticated server-side administrative tools.
- Production environments enforce strict Row Level Security (RLS) and multi-tenant isolation.
