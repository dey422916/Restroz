# RestroZ — DEV Environment Accounts

This directory lists active test and development accounts provisioned for the Development environment (`restroz-dev`).

---

### 👑 1. Super Admin
- **Role**: `SUPER_ADMIN`
- **Email**: `rdsa.new@yopmail.com`
- **Full Name**: Ratnadeep Dey
- **User UUID**: `a0000000-0000-0000-0000-000000000001`
- **Access**: Global Platform Management, Multi-Tenant Dashboard, Subscriptions
- **Environment**: `DEVELOPMENT`

---

### 🏪 2. Primary Restaurant — Panch Phoron Restaurant
- **Restaurant Name**: Panch Phoron Restaurant
- **Restaurant UUID**: `4f875626-05ae-47dd-88d7-c1234f13f7e1`
- **Slug**: `panch-phoron`
- **Operational Status**: `ACTIVE`
- **Environment**: `DEVELOPMENT`

#### Accounts:
- **Admin**:
  - **Role**: `ADMIN`
  - **Email**: `ppad.new@yopmail.com`
  - **Full Name**: Panch Phoron Admin
  - **User UUID**: `7d41308b-77a4-4b68-bbc7-a31e321b2db4`
  - **Permissions**: Full Restaurant Management (POS, Menu, GST, Settings, Staff)

- **Staff (Cashier)**:
  - **Role**: `STAFF`
  - **Email**: `ppst.new@yopmail.com`
  - **Full Name**: Panch Phoron Staff
  - **User UUID**: `a0000000-0000-0000-0000-000000000003`
  - **Permissions**: POS Terminal, Orders Feed, Day Register

- **Staff (Kitchen)**:
  - **Role**: `STAFF`
  - **Email**: `ppkt.new@yopmail.com`
  - **Full Name**: Panch Phoron Kitchen
  - **User UUID**: `a0000000-0000-0000-0000-000000000004`
  - **Permissions**: KOT Display, Kitchen Ticket Management

- **Customer (Marketplace & QR)**:
  - **Role**: `CUSTOMER`
  - **Email**: `ppcu.new@yopmail.com`
  - **Full Name**: Panch Phoron Customer
  - **User UUID**: `a0000000-0000-0000-0000-000000000005`
  - **Access**: Customer Marketplace, Online Delivery, Digital QR Menu Ordering

---

### 🏪 3. Secondary Test Tenants

#### Kalputra Restaurant
- **Restaurant Name**: Kalputra Restaurant
- **Restaurant UUID**: `dba33a4a-f2fd-4b74-b7e4-d04c713c6863`
- **Slug**: `kalputra`
- **Admin Email**: `kalputra@yopmail.com`
- **Role**: `ADMIN`
- **Environment**: `DEVELOPMENT`

#### Kullad Chai
- **Restaurant Name**: Kullad Chai
- **Restaurant UUID**: `a0000000-0000-0000-0000-000000000001`
- **Slug**: `kullad-chai`
- **Admin Email**: `bipin@yopmail.com`
- **Role**: `ADMIN`
- **Staff Email**: `souvik@yopmail.com`
- **Role**: `STAFF`
- **Environment**: `DEVELOPMENT`

---

### 🛒 4. Marketplace Test Customers
- **Customer 1**: `raj@yopmail.com` (`CUSTOMER`)
- **Customer 2**: `customer_kalputra_test@yopmail.com` (`CUSTOMER`)
