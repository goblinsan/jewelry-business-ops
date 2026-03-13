"""Inventory tracking with reorder thresholds and low-stock alerts.

Tracks quantity-on-hand per SKU, records stock movements (sales, restocks,
returns, adjustments), and surfaces alerts when stock falls at or below the
reorder threshold.
"""

from __future__ import annotations

import csv
import os
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from typing import Iterator


class MovementType(str, Enum):
    """Classifies a stock movement event."""

    SALE = "SALE"
    RESTOCK = "RESTOCK"
    RETURN = "RETURN"
    ADJUSTMENT = "ADJUSTMENT"  # manual correction or write-off


@dataclass
class StockMovement:
    """Records a single change in stock for a SKU."""

    sku: str
    movement_type: MovementType
    quantity: int          # positive = stock added, negative = stock removed
    timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    note: str = ""

    def __post_init__(self) -> None:
        if self.movement_type in (MovementType.SALE,):
            if self.quantity > 0:
                raise ValueError(
                    "SALE movements must have a negative quantity (stock leaves inventory)."
                )
        if self.movement_type == MovementType.RESTOCK:
            if self.quantity < 0:
                raise ValueError(
                    "RESTOCK movements must have a positive quantity."
                )


@dataclass
class InventoryItem:
    """Tracks stock level and reorder policy for a single SKU."""

    sku: str
    quantity_on_hand: int
    reorder_threshold: int   # alert when quantity_on_hand <= this value
    reorder_quantity: int    # suggested replenishment quantity

    @property
    def needs_reorder(self) -> bool:
        """True when current stock is at or below the reorder threshold."""
        return self.quantity_on_hand <= self.reorder_threshold

    @property
    def reorder_alert(self) -> str | None:
        """Return a human-readable alert string if stock is low, else None."""
        if self.needs_reorder:
            return (
                f"LOW STOCK [{self.sku}]: {self.quantity_on_hand} unit(s) on hand "
                f"(threshold: {self.reorder_threshold}). "
                f"Suggested reorder qty: {self.reorder_quantity}."
            )
        return None


_ITEM_FIELDNAMES = ["sku", "quantity_on_hand", "reorder_threshold", "reorder_quantity"]
_MOVEMENT_FIELDNAMES = ["sku", "movement_type", "quantity", "timestamp", "note"]


class Inventory:
    """In-memory inventory ledger with CSV persistence."""

    def __init__(self) -> None:
        self._items: dict[str, InventoryItem] = {}
        self._movements: list[StockMovement] = []

    # ------------------------------------------------------------------
    # Item management
    # ------------------------------------------------------------------

    def add_item(self, item: InventoryItem) -> None:
        """Register a new SKU in the inventory."""
        self._items[item.sku] = item

    def get_item(self, sku: str) -> InventoryItem | None:
        return self._items.get(sku)

    def set_reorder_threshold(self, sku: str, threshold: int, reorder_qty: int) -> None:
        """Update the reorder policy for an existing SKU.

        Raises KeyError if the SKU is not tracked.
        """
        item = self._items[sku]
        item.reorder_threshold = threshold
        item.reorder_quantity = reorder_qty

    def all_items(self) -> list[InventoryItem]:
        return sorted(self._items.values(), key=lambda i: i.sku)

    def low_stock_alerts(self) -> list[str]:
        """Return alert strings for every SKU that needs reordering."""
        return [
            alert
            for item in self.all_items()
            if (alert := item.reorder_alert) is not None
        ]

    # ------------------------------------------------------------------
    # Stock movements
    # ------------------------------------------------------------------

    def record_movement(self, movement: StockMovement) -> InventoryItem:
        """Apply a stock movement and return the updated InventoryItem.

        Raises KeyError if the SKU is not tracked.
        Raises ValueError if the movement would push stock below 0.
        """
        item = self._items[movement.sku]
        new_qty = item.quantity_on_hand + movement.quantity
        if new_qty < 0:
            raise ValueError(
                f"Movement would result in negative stock for SKU '{movement.sku}': "
                f"current={item.quantity_on_hand}, delta={movement.quantity}."
            )
        item.quantity_on_hand = new_qty
        self._movements.append(movement)
        return item

    def movements_for_sku(self, sku: str) -> list[StockMovement]:
        """Return all recorded movements for a given SKU."""
        return [m for m in self._movements if m.sku == sku]

    def __iter__(self) -> Iterator[InventoryItem]:
        return iter(self.all_items())

    def __len__(self) -> int:
        return len(self._items)

    # ------------------------------------------------------------------
    # CSV I/O — items
    # ------------------------------------------------------------------

    def save_items_csv(self, path: str) -> None:
        """Write current stock levels and reorder thresholds to CSV."""
        with open(path, "w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=_ITEM_FIELDNAMES)
            writer.writeheader()
            for item in self.all_items():
                writer.writerow(asdict(item))

    @classmethod
    def load_items_csv(cls, path: str) -> "Inventory":
        """Load inventory items from CSV. Movements start empty."""
        inventory = cls()
        if not os.path.exists(path):
            return inventory
        with open(path, newline="", encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                inventory.add_item(
                    InventoryItem(
                        sku=row["sku"],
                        quantity_on_hand=int(row["quantity_on_hand"]),
                        reorder_threshold=int(row["reorder_threshold"]),
                        reorder_quantity=int(row["reorder_quantity"]),
                    )
                )
        return inventory

    # ------------------------------------------------------------------
    # CSV I/O — movements
    # ------------------------------------------------------------------

    def save_movements_csv(self, path: str) -> None:
        """Append all in-memory movements to a CSV file."""
        write_header = not os.path.exists(path)
        with open(path, "a", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=_MOVEMENT_FIELDNAMES)
            if write_header:
                writer.writeheader()
            for movement in self._movements:
                row = asdict(movement)
                row["movement_type"] = movement.movement_type.value
                writer.writerow(row)

    @classmethod
    def load_movements_csv(cls, path: str) -> list[StockMovement]:
        """Load movement history from CSV (read-only; does not replay stock)."""
        movements: list[StockMovement] = []
        if not os.path.exists(path):
            return movements
        with open(path, newline="", encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                movements.append(
                    StockMovement(
                        sku=row["sku"],
                        movement_type=MovementType(row["movement_type"]),
                        quantity=int(row["quantity"]),
                        timestamp=row["timestamp"],
                        note=row.get("note", ""),
                    )
                )
        return movements

    @staticmethod
    def write_template(path: str) -> None:
        """Write a sample inventory CSV template."""
        rows = [
            {
                "sku": "RG-001-YG-6",
                "quantity_on_hand": 10,
                "reorder_threshold": 3,
                "reorder_quantity": 10,
            },
            {
                "sku": "NK-002-SS-OS",
                "quantity_on_hand": 5,
                "reorder_threshold": 2,
                "reorder_quantity": 8,
            },
        ]
        with open(path, "w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=_ITEM_FIELDNAMES)
            writer.writeheader()
            writer.writerows(rows)
