"""Order fulfillment workflow.

Models orders and line items, validates packing checklists, and tracks
shipment status through to delivery confirmation.
"""

from __future__ import annotations

import csv
import os
from dataclasses import dataclass, field, asdict
from datetime import date, datetime, timezone
from enum import Enum
from typing import Iterator


class OrderStatus(str, Enum):
    """Lifecycle states for a fulfillment order."""

    RECEIVED = "RECEIVED"
    PICKING = "PICKING"
    PACKED = "PACKED"
    SHIPPED = "SHIPPED"
    DELIVERED = "DELIVERED"
    CANCELLED = "CANCELLED"


# ---------------------------------------------------------------------------
# Packing checklist — applied to every outgoing order
# ---------------------------------------------------------------------------

PACKING_CHECKLIST: list[str] = [
    "Verify SKU(s) match the order confirmation",
    "Inspect item(s) for quality defects",
    "Add branded tissue paper and jewelry pouch",
    "Insert printed thank-you card",
    "Add any promotional inserts (if applicable)",
    "Seal box with branded tape",
    "Attach printed shipping label — confirm address matches order",
    "Weigh parcel and record weight",
    "Log packed timestamp in fulfillment tracker",
]

# Target: all orders packed and scanned within this many business hours of receipt
TIME_TO_SHIP_TARGET_HOURS: int = 24


@dataclass
class LineItem:
    """A single SKU / quantity pairing within an order."""

    sku: str
    quantity: int
    unit_price: float

    @property
    def line_total(self) -> float:
        return round(self.quantity * self.unit_price, 2)


@dataclass
class Order:
    """Represents a customer order to be fulfilled."""

    order_id: str
    customer_name: str
    customer_email: str
    shipping_address: str
    line_items: list[LineItem] = field(default_factory=list)
    status: OrderStatus = OrderStatus.RECEIVED
    received_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    shipped_at: str = ""
    tracking_number: str = ""
    carrier: str = ""
    notes: str = ""

    @property
    def order_total(self) -> float:
        return round(sum(item.line_total for item in self.line_items), 2)

    @property
    def item_count(self) -> int:
        return sum(item.quantity for item in self.line_items)


_ORDER_FIELDNAMES = [
    "order_id",
    "customer_name",
    "customer_email",
    "shipping_address",
    "status",
    "received_at",
    "shipped_at",
    "tracking_number",
    "carrier",
    "order_total",
    "item_count",
    "notes",
]


class FulfillmentTracker:
    """Tracks open and historical orders through the fulfillment pipeline."""

    def __init__(self) -> None:
        self._orders: dict[str, Order] = {}

    # ------------------------------------------------------------------
    # Order management
    # ------------------------------------------------------------------

    def add_order(self, order: Order) -> None:
        """Register a new order."""
        self._orders[order.order_id] = order

    def get_order(self, order_id: str) -> Order | None:
        return self._orders.get(order_id)

    def update_status(self, order_id: str, status: OrderStatus) -> Order:
        """Transition an order to a new status.

        Raises KeyError if the order_id does not exist.
        """
        order = self._orders[order_id]
        order.status = status
        if status == OrderStatus.SHIPPED and not order.shipped_at:
            order.shipped_at = datetime.now(timezone.utc).isoformat()
        return order

    def mark_shipped(
        self,
        order_id: str,
        tracking_number: str,
        carrier: str,
    ) -> Order:
        """Mark an order as shipped and record tracking details."""
        order = self._orders[order_id]
        order.tracking_number = tracking_number
        order.carrier = carrier
        return self.update_status(order_id, OrderStatus.SHIPPED)

    def orders_by_status(self, status: OrderStatus) -> list[Order]:
        """Return all orders matching the given status, sorted by received_at."""
        return sorted(
            [o for o in self._orders.values() if o.status == status],
            key=lambda o: o.received_at,
        )

    def pending_orders(self) -> list[Order]:
        """Return orders that have not yet shipped (not SHIPPED, DELIVERED, or CANCELLED)."""
        terminal = {OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.CANCELLED}
        return [o for o in self._orders.values() if o.status not in terminal]

    def generate_packing_checklist(self, order_id: str) -> str:
        """Return a formatted packing checklist for the given order."""
        order = self._orders[order_id]
        lines = [
            f"PACKING CHECKLIST — Order {order.order_id}",
            f"Customer : {order.customer_name} <{order.customer_email}>",
            f"Ship to  : {order.shipping_address}",
            f"Items    : {order.item_count}  |  Total: ${order.order_total:.2f}",
            f"Target ship within {TIME_TO_SHIP_TARGET_HOURS}h of order receipt.",
            "",
            "Items to pack:",
        ]
        for item in order.line_items:
            lines.append(f"  [ ] {item.sku}  x{item.quantity}  @ ${item.unit_price:.2f}")
        lines.append("")
        lines.append("Checklist:")
        for i, step in enumerate(PACKING_CHECKLIST, 1):
            lines.append(f"  {i:2d}. [ ] {step}")
        lines.append("")
        lines.append("Packed by: ________________  Date/Time: ________________")
        return "\n".join(lines)

    def __iter__(self) -> Iterator[Order]:
        return iter(sorted(self._orders.values(), key=lambda o: o.received_at))

    def __len__(self) -> int:
        return len(self._orders)

    # ------------------------------------------------------------------
    # CSV I/O
    # ------------------------------------------------------------------

    def save_csv(self, path: str) -> None:
        """Persist order summary rows to CSV (line items are not serialised here)."""
        with open(path, "w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=_ORDER_FIELDNAMES)
            writer.writeheader()
            for order in self:
                writer.writerow(
                    {
                        "order_id": order.order_id,
                        "customer_name": order.customer_name,
                        "customer_email": order.customer_email,
                        "shipping_address": order.shipping_address,
                        "status": order.status.value,
                        "received_at": order.received_at,
                        "shipped_at": order.shipped_at,
                        "tracking_number": order.tracking_number,
                        "carrier": order.carrier,
                        "order_total": order.order_total,
                        "item_count": order.item_count,
                        "notes": order.notes,
                    }
                )
