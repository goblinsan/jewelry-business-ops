# Packing & Shipping Standard Operating Procedure (SOP)

**Version:** 1.0 · **Effective:** 2026-03-13 · **Owner:** Operations

---

## Purpose

Ensure every order is packed consistently, shipped accurately, and reaches
the customer in perfect condition. Following this SOP reduces handling errors
and maintains brand standards.

---

## Time-to-Ship Target

| Metric | Target |
|--------|--------|
| Pack & scan **same business day** for orders received before 2 PM local time | ✅ |
| Pack & scan **next business day** for orders received after 2 PM | ✅ |
| **Maximum time from order receipt to carrier scan** | **24 business hours** |

---

## Supplies Required

- Branded jewelry box (small / medium, matched to item type)
- Branded tissue paper and crinkle fill
- Jewelry pouch (velvet or organza, size-appropriate)
- Branded thank-you card
- Clear packing tape + branded outer tape/sticker
- Bubble wrap (for fragile / heavy items)
- Poly mailer or corrugated shipping box
- Printed shipping label (4×6 thermal or laser)
- Scale accurate to 0.1 oz / 1 g

---

## Step-by-Step Packing Checklist

### 1. Verify Order
- [ ] Open the fulfillment tracker and locate the order ID.
- [ ] Confirm item SKU(s) match the order confirmation — cross-check every line item.
- [ ] Mark order status → **PICKING**.

### 2. Quality Inspection
- [ ] Retrieve each item from inventory storage.
- [ ] Inspect under good light for scratches, tarnish, loose stones, or clasps.
- [ ] If defect found: set item aside, flag in tracker with note, pick replacement. If no replacement: contact customer before shipping.

### 3. Inner Packaging
- [ ] Place item in the appropriately sized jewelry pouch.
- [ ] Nest pouch in a jewelry box lined with tissue paper and crinkle fill.
- [ ] For fragile pieces (e.g., chandelier earrings, thin chains): wrap pouch in one layer of bubble wrap before boxing.

### 4. Brand Inserts
- [ ] Insert printed thank-you card (personalise with customer's first name if time permits).
- [ ] Add any active promotional insert (check the current promotions list).

### 5. Outer Packaging
- [ ] Choose the correct outer mailer/box size — item(s) must not shift when box is lightly shaken.
- [ ] Seal box securely with branded tape; apply a branded sticker seal over the flap.

### 6. Labelling
- [ ] Print shipping label from the order management system — verify:
  - Recipient name matches the order.
  - Full street address including apartment/suite.
  - Correct postcode and country.
- [ ] Affix label flat and crinkle-free; ensure barcode is fully visible.
- [ ] **Do not cover any part of the barcode.**

### 7. Weigh & Record
- [ ] Place sealed parcel on the scale; record weight in the fulfillment tracker.
- [ ] Confirm weight is within the quoted shipping rate band; upgrade service if over.

### 8. Final Check & Hand-Off
- [ ] Mark order status → **PACKED**.
- [ ] Batch parcels in carrier pick-up area or take to post office/carrier drop-off.
- [ ] Once carrier scans the parcel: mark order status → **SHIPPED**, enter tracking number and carrier name.
- [ ] Log packed-by initials and pack timestamp in the tracker notes field.

---

## Returns / Damaged Items Protocol

1. Customer emails returns@[yourdomain] or opens a return request in the channel platform.
2. Issue a pre-paid return label within **1 business day**.
3. On receipt of return: inspect item, update inventory (RETURN movement), process refund/exchange within **2 business days**.
4. Log the return reason in the fulfillment tracker for trend analysis.

---

## KPI Tie-In

The following metrics are tracked in the Weekly KPI Dashboard and derived
from fulfillment data:

| Metric | Source |
|--------|--------|
| Orders shipped on time (≤ 24 h) | Fulfillment tracker `received_at` vs `shipped_at` |
| Return rate | Returns ÷ Total orders |
| Carrier scan rate | % of shipped orders with a tracking number |

---

*Last updated by: Operations team*
