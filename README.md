# jewelry-business-ops
Ops, content, ads, and feedback workflow for a jewelry business

---

## Overview

This repository is the **operations backbone** for a jewelry business. It
provides TypeScript modules and data templates that keep catalog, inventory, and
fulfillment in sync, plus a lightweight weekly KPI dashboard for business
health checks.

| Module | Issue | What it does |
|--------|-------|--------------|
| `catalog` | [#1](../../issues/1) | Single source of truth for products — SKU, materials, sizing, pricing & margin |
| `inventory` | [#2](../../issues/2) | Stock tracking with reorder thresholds and low-stock alerts |
| `fulfillment` | [#3](../../issues/3) | Order lifecycle, packing checklist, and shipping SOP |
| `kpiDashboard` | [#4](../../issues/4) | Weekly metrics: orders, AOV, conversion rate, return rate |

---

## Project Structure

```
src/
    catalog.ts          # Product catalog (CRUD, CSV, margin/markup calcs)
    inventory.ts        # Inventory items, stock movements, reorder alerts
    fulfillment.ts      # Order tracking, packing checklist generator
    kpiDashboard.ts     # Weekly KPI metrics and CSV dashboard
    index.ts            # Barrel export

data/
    catalog_template.csv        # Starter product catalog
    inventory_template.csv      # Starter inventory levels & thresholds
    kpi_dashboard_template.csv  # Historical KPI seed data

docs/
    packing_shipping_sop.md     # Packing & shipping SOP with time-to-ship target

tests/
    catalog.test.ts
    inventory.test.ts
    fulfillment.test.ts
    kpiDashboard.test.ts
```

---

## Quick Start

```bash
# Install (Node.js 18+)
npm install

# Run tests
npm test

# Build to dist/
npm run build
```

### Catalog

```typescript
import { Catalog, productMargin, productMarkup } from "./src/catalog";

const catalog = Catalog.loadCSV("data/catalog_template.csv");
for (const product of catalog.allProducts()) {
  console.log(`${product.sku}  margin=${productMargin(product)}%  markup=${productMarkup(product)}%`);
}

// Add a new product
catalog.addProduct({
  sku: "BR-010-YG-S",
  name: "Tennis Bracelet",
  category: "Bracelet",
  materials: "14k Yellow Gold, CZ",
  sizeOptions: "6.5in,7in,7.5in",
  costPrice: 90.0,
  salePrice: 260.0,
  weightGrams: 8.2,
  description: "",
  tags: "bracelet,gold,cz",
});
catalog.saveCSV("data/catalog_template.csv");
```

### Inventory

```typescript
import { Inventory, createMovement } from "./src/inventory";

const inv = Inventory.loadItemsCSV("data/inventory_template.csv");

// Record a sale (quantity is negative for outgoing stock)
inv.recordMovement(createMovement("RG-001-YG-6", "SALE", -1));

// Check for low-stock alerts
for (const alert of inv.lowStockAlerts()) {
  console.log(alert);
}

inv.saveItemsCSV("data/inventory_template.csv");
```

### Fulfillment

```typescript
import { FulfillmentTracker, createOrder } from "./src/fulfillment";

const tracker = new FulfillmentTracker();
const order = createOrder({
  orderId: "ORD-1001",
  customerName: "Jane Doe",
  customerEmail: "jane@example.com",
  shippingAddress: "42 Oak Ave, Portland OR 97201",
  lineItems: [{ sku: "RG-001-YG-6", quantity: 1, unitPrice: 120.0 }],
});
tracker.addOrder(order);

// Print packing checklist
console.log(tracker.generatePackingChecklist("ORD-1001"));

// Mark as shipped
tracker.markShipped("ORD-1001", "1Z999AA010123456784", "UPS");
tracker.saveCSV("data/orders.csv");
```

### KPI Dashboard

```typescript
import { KPIDashboard, metricsForWeek, weekSummary } from "./src/kpiDashboard";

const dashboard = KPIDashboard.loadCSV("data/kpi_dashboard_template.csv");

// Add this week's data
const thisWeek = metricsForWeek(
  "2026-03-16",
  [95.0, 120.0, 58.0, 175.0, 65.0], // one entry per order
  0,    // returns
  2100  // sessions
);
dashboard.addWeek(thisWeek);
console.log(weekSummary(dashboard.latestWeek()!));
dashboard.saveCSV("data/kpi_dashboard_template.csv");
```

---

## Packing & Shipping SOP

See [`docs/packing_shipping_sop.md`](docs/packing_shipping_sop.md) for the
full standard operating procedure, including:

- **Time-to-ship target**: 24 business hours from order receipt
- Step-by-step packing checklist (quality inspection → labelling → hand-off)
- Returns and damaged-items protocol
- KPI tie-in metrics
