# jewelry-business-ops
Ops, content, ads, and feedback workflow for a jewelry business

---

## Overview

This repository is the **operations backbone** for a jewelry business. It
provides Python modules and data templates that keep catalog, inventory, and
fulfillment in sync, plus a lightweight weekly KPI dashboard for business
health checks.

| Module | Issue | What it does |
|--------|-------|--------------|
| `catalog` | [#1](../../issues/1) | Single source of truth for products — SKU, materials, sizing, pricing & margin |
| `inventory` | [#2](../../issues/2) | Stock tracking with reorder thresholds and low-stock alerts |
| `fulfillment` | [#3](../../issues/3) | Order lifecycle, packing checklist, and shipping SOP |
| `kpi_dashboard` | [#4](../../issues/4) | Weekly metrics: orders, AOV, conversion rate, return rate |

---

## Project Structure

```
src/jewelry_ops/
    catalog.py          # Product catalog (CRUD, CSV, margin/markup calcs)
    inventory.py        # Inventory items, stock movements, reorder alerts
    fulfillment.py      # Order tracking, packing checklist generator
    kpi_dashboard.py    # Weekly KPI metrics and CSV dashboard

data/
    catalog_template.csv        # Starter product catalog
    inventory_template.csv      # Starter inventory levels & thresholds
    kpi_dashboard_template.csv  # Historical KPI seed data

docs/
    packing_shipping_sop.md     # Packing & shipping SOP with time-to-ship target

tests/
    test_catalog.py
    test_inventory.py
    test_fulfillment.py
    test_kpi_dashboard.py
```

---

## Quick Start

```bash
# Install (Python 3.10+)
pip install -e ".[dev]"

# Run tests
python -m pytest
```

### Catalog

```python
from jewelry_ops.catalog import Catalog, Product

catalog = Catalog.load_csv("data/catalog_template.csv")
for product in catalog:
    print(f"{product.sku}  margin={product.margin}%  markup={product.markup}%")

# Add a new product
catalog.add_product(Product(
    sku="BR-010-YG-S",
    name="Tennis Bracelet",
    category="Bracelet",
    materials="14k Yellow Gold, CZ",
    size_options="6.5in,7in,7.5in",
    cost_price=90.0,
    sale_price=260.0,
    weight_grams=8.2,
))
catalog.save_csv("data/catalog_template.csv")
```

### Inventory

```python
from jewelry_ops.inventory import Inventory, StockMovement, MovementType

inv = Inventory.load_items_csv("data/inventory_template.csv")

# Record a sale (quantity is negative for outgoing stock)
inv.record_movement(StockMovement(
    sku="RG-001-YG-6",
    movement_type=MovementType.SALE,
    quantity=-1,
))

# Check for low-stock alerts
for alert in inv.low_stock_alerts():
    print(alert)

inv.save_items_csv("data/inventory_template.csv")
```

### Fulfillment

```python
from jewelry_ops.fulfillment import FulfillmentTracker, Order, LineItem

tracker = FulfillmentTracker()
order = Order(
    order_id="ORD-1001",
    customer_name="Jane Doe",
    customer_email="jane@example.com",
    shipping_address="42 Oak Ave, Portland OR 97201",
    line_items=[LineItem(sku="RG-001-YG-6", quantity=1, unit_price=120.0)],
)
tracker.add_order(order)

# Print packing checklist
print(tracker.generate_packing_checklist("ORD-1001"))

# Mark as shipped
tracker.mark_shipped("ORD-1001", tracking_number="1Z999AA010123456784", carrier="UPS")
tracker.save_csv("data/orders.csv")
```

### KPI Dashboard

```python
from jewelry_ops.kpi_dashboard import KPIDashboard, metrics_for_week
from datetime import date

dashboard = KPIDashboard.load_csv("data/kpi_dashboard_template.csv")

# Add this week's data
this_week = metrics_for_week(
    week_start=date(2026, 3, 16),
    orders=[95.0, 120.0, 58.0, 175.0, 65.0],  # one entry per order
    returns=0,
    sessions=2100,
)
dashboard.add_week(this_week)
print(dashboard.latest_week().summary())
dashboard.save_csv("data/kpi_dashboard_template.csv")
```

---

## Packing & Shipping SOP

See [`docs/packing_shipping_sop.md`](docs/packing_shipping_sop.md) for the
full standard operating procedure, including:

- **Time-to-ship target**: 24 business hours from order receipt
- Step-by-step packing checklist (quality inspection → labelling → hand-off)
- Returns and damaged-items protocol
- KPI tie-in metrics
