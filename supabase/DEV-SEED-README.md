# RestroZ DEV Testing Dataset — Panch Phoron Restaurant

**Environment**: `DEVELOPMENT` (`restroz-dev` project ONLY)
**Safety Status**: Zero production data / Zero production secrets / Rerun-safe & idempotent

---

## 1. Restaurant Overview

- **Restaurant Name**: Panch Phoron Restaurant
- **DEV Restaurant ID**: `4f875626-05ae-47dd-88d7-c1234f13f7e1`
- **Slug**: `panch-phoron`
- **Address**: Budbud Bypass, Burdwan, West Bengal 713403
- **Coordinates**: Latitude `23.4000000`, Longitude `87.5500000`
- **Operational Status**: `ACTIVE` & Open (09:00 AM – 11:00 PM)
- **Marketplace Discovery**: Enabled, Accepts Delivery (`15 km` radius, min order `₹149`), Accepts Takeaway, Dine-In & QR Enabled

---

## 2. DEV Test Accounts

| Role | Full Name | Email / Username | User UUID | Restaurant Assignment | Permissions Preset |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SUPER_ADMIN** | Ratnadeep Dey | `rdsa.new@yopmail.com` | `a0000000-0000-0000-0000-000000000001` | Global Platform Super Admin | All platform privileges |
| **ADMIN** | Panch Phoron Admin | `ppad.new@yopmail.com` | `7d41308b-77a4-4b68-bbc7-a31e321b2db4` | Panch Phoron Restaurant | Full Restaurant Management |
| **STAFF (Cashier)** | Panch Phoron Staff | `ppst.new@yopmail.com` | `a0000000-0000-0000-0000-000000000003` | Panch Phoron Restaurant | `CASHIER` (POS, Register, Orders) |
| **STAFF (Kitchen)** | Panch Phoron Kitchen | `ppkt.new@yopmail.com` | `a0000000-0000-0000-0000-000000000004` | Panch Phoron Restaurant | `KITCHEN` (KOT / Kitchen Display) |
| **CUSTOMER** | Panch Phoron Customer | `ppcu.new@yopmail.com` | `a0000000-0000-0000-0000-000000000005` | Customer Marketplace | Default Address & Favorites |

---

## 3. Human-Facing Business Identifiers

Where the underlying database column type is `TEXT`, concise, realistic human identifiers are used:

- **SKUs**: `PP001`, `PP002`, `PP003`, ..., `PP010`
- **Coupons**: `WELCOME10`, `SAVE50`, `DEV20`
- **Tables**: `Table 1`, `Table 2`, ..., `Table 10`
- **Order Numbers**: `DEV001`, `DEV002`, `DEV003`, `DEV004`, `DEV005`
- **KOT Numbers**: `KOT001`, `KOT002`
- **Invoice Prefix**: `PP`
