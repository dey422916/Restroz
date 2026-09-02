# Changelog

All notable changes to the **RestroZ POS & Marketplace** application will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-09-02 (versionCode: 1)

### Initial Production Testing Release (APK & Web)

#### Core Features
- **Multi-Tenant POS Engine**:
  - Offline-first & cloud-synchronized point of sale for single and multi-chain restaurants.
  - Multi-order workflows: Dine-In with live table maps, Takeaway, Delivery, and Room Service.
  - Kitchen Order Ticket (KOT) generation and live order dispatch.
  - GST-compliant invoice generation, thermal print, receipt sharing, and digital settlement.
- **Customer Online Marketplace**:
  - Full-width landscape hero ambiance carousel with auto-sliding transitions, swipe support, and verified badges.
  - Exclusive Deals & Coupon promotion carousel (`FLAT` and `%` discount offers).
  - Modern image-first food item cards with veg/non-veg indicators, pastel category filters, and search.
  - Customer cart checkout with real-time atomic coupon validation and order placement.
- **Admin & Management Hub**:
  - Multi-banner showcase management with direct device upload and image URL support.
  - Comprehensive Coupon Management engine (Super Admin & Restaurant Admin access).
  - Multi-tenant role management (Super Admin, Restaurant Admin, Staff, Customer).
  - Menu catalog, categories, inventory, and restaurant operational settings.
- **Enterprise Security & Reliability**:
  - PostgreSQL Row Level Security (RLS) enforcing strict tenant isolation across all tables.
  - Supabase Edge Functions for secure administrative provisioning and credential resets.
  - Zero client-side exposure of database secret keys (`SUPABASE_SERVICE_ROLE_KEY`).
  - Production URL configuration via `EXPO_PUBLIC_APP_URL`.
