"""Tests for the inventory tracking module."""

import os
import tempfile
import pytest

from jewelry_ops.inventory import Inventory, InventoryItem, StockMovement, MovementType


def make_item(
    sku="RG-001",
    quantity_on_hand=10,
    reorder_threshold=3,
    reorder_quantity=10,
) -> InventoryItem:
    return InventoryItem(
        sku=sku,
        quantity_on_hand=quantity_on_hand,
        reorder_threshold=reorder_threshold,
        reorder_quantity=reorder_quantity,
    )


class TestInventoryItem:
    def test_needs_reorder_false(self):
        item = make_item(quantity_on_hand=10, reorder_threshold=3)
        assert item.needs_reorder is False

    def test_needs_reorder_at_threshold(self):
        item = make_item(quantity_on_hand=3, reorder_threshold=3)
        assert item.needs_reorder is True

    def test_needs_reorder_below_threshold(self):
        item = make_item(quantity_on_hand=1, reorder_threshold=3)
        assert item.needs_reorder is True

    def test_reorder_alert_message(self):
        item = make_item(sku="ABC", quantity_on_hand=2, reorder_threshold=3, reorder_quantity=10)
        alert = item.reorder_alert
        assert alert is not None
        assert "ABC" in alert
        assert "2" in alert

    def test_no_alert_when_sufficient_stock(self):
        item = make_item(quantity_on_hand=10, reorder_threshold=3)
        assert item.reorder_alert is None


class TestStockMovement:
    def test_sale_must_be_negative(self):
        with pytest.raises(ValueError):
            StockMovement(sku="RG-001", movement_type=MovementType.SALE, quantity=5)

    def test_restock_must_be_positive(self):
        with pytest.raises(ValueError):
            StockMovement(sku="RG-001", movement_type=MovementType.RESTOCK, quantity=-5)

    def test_valid_sale(self):
        m = StockMovement(sku="RG-001", movement_type=MovementType.SALE, quantity=-2)
        assert m.quantity == -2

    def test_valid_restock(self):
        m = StockMovement(sku="RG-001", movement_type=MovementType.RESTOCK, quantity=10)
        assert m.quantity == 10

    def test_adjustment_any_sign(self):
        pos = StockMovement(sku="X", movement_type=MovementType.ADJUSTMENT, quantity=5)
        neg = StockMovement(sku="X", movement_type=MovementType.ADJUSTMENT, quantity=-3)
        assert pos.quantity == 5
        assert neg.quantity == -3


class TestInventoryCRUD:
    def test_add_and_get(self):
        inv = Inventory()
        item = make_item(sku="ABC")
        inv.add_item(item)
        assert inv.get_item("ABC") is item

    def test_get_missing_returns_none(self):
        inv = Inventory()
        assert inv.get_item("MISSING") is None

    def test_set_reorder_threshold(self):
        inv = Inventory()
        inv.add_item(make_item(sku="A"))
        inv.set_reorder_threshold("A", threshold=5, reorder_qty=15)
        assert inv.get_item("A").reorder_threshold == 5
        assert inv.get_item("A").reorder_quantity == 15

    def test_set_threshold_missing_raises(self):
        inv = Inventory()
        with pytest.raises(KeyError):
            inv.set_reorder_threshold("NOKEY", threshold=5, reorder_qty=10)

    def test_len(self):
        inv = Inventory()
        assert len(inv) == 0
        inv.add_item(make_item(sku="A"))
        assert len(inv) == 1

    def test_all_items_sorted(self):
        inv = Inventory()
        inv.add_item(make_item(sku="Z"))
        inv.add_item(make_item(sku="A"))
        skus = [i.sku for i in inv.all_items()]
        assert skus == sorted(skus)


class TestInventoryMovements:
    def test_sale_reduces_stock(self):
        inv = Inventory()
        inv.add_item(make_item(sku="A", quantity_on_hand=10))
        inv.record_movement(StockMovement(sku="A", movement_type=MovementType.SALE, quantity=-3))
        assert inv.get_item("A").quantity_on_hand == 7

    def test_restock_increases_stock(self):
        inv = Inventory()
        inv.add_item(make_item(sku="A", quantity_on_hand=5))
        inv.record_movement(StockMovement(sku="A", movement_type=MovementType.RESTOCK, quantity=10))
        assert inv.get_item("A").quantity_on_hand == 15

    def test_negative_stock_raises(self):
        inv = Inventory()
        inv.add_item(make_item(sku="A", quantity_on_hand=2))
        with pytest.raises(ValueError):
            inv.record_movement(
                StockMovement(sku="A", movement_type=MovementType.SALE, quantity=-5)
            )

    def test_missing_sku_raises(self):
        inv = Inventory()
        with pytest.raises(KeyError):
            inv.record_movement(
                StockMovement(sku="NOSKU", movement_type=MovementType.RESTOCK, quantity=5)
            )

    def test_movements_for_sku(self):
        inv = Inventory()
        inv.add_item(make_item(sku="A", quantity_on_hand=10))
        inv.add_item(make_item(sku="B", quantity_on_hand=5))
        inv.record_movement(StockMovement(sku="A", movement_type=MovementType.SALE, quantity=-2))
        inv.record_movement(StockMovement(sku="B", movement_type=MovementType.SALE, quantity=-1))
        assert len(inv.movements_for_sku("A")) == 1
        assert len(inv.movements_for_sku("B")) == 1

    def test_low_stock_alerts(self):
        inv = Inventory()
        inv.add_item(make_item(sku="LOW", quantity_on_hand=2, reorder_threshold=3))
        inv.add_item(make_item(sku="OK", quantity_on_hand=10, reorder_threshold=3))
        alerts = inv.low_stock_alerts()
        assert len(alerts) == 1
        assert "LOW" in alerts[0]


class TestInventoryCSV:
    def test_save_and_load_items(self):
        inv = Inventory()
        inv.add_item(make_item(sku="A", quantity_on_hand=10, reorder_threshold=3, reorder_quantity=10))
        inv.add_item(make_item(sku="B", quantity_on_hand=5, reorder_threshold=2, reorder_quantity=8))

        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as tmp:
            path = tmp.name
        try:
            inv.save_items_csv(path)
            loaded = Inventory.load_items_csv(path)
            assert len(loaded) == 2
            item = loaded.get_item("A")
            assert item.quantity_on_hand == 10
            assert item.reorder_threshold == 3
        finally:
            os.unlink(path)

    def test_load_nonexistent_returns_empty(self):
        inv = Inventory.load_items_csv("/tmp/no_such_file_xyz.csv")
        assert len(inv) == 0

    def test_write_template(self):
        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as tmp:
            path = tmp.name
        try:
            Inventory.write_template(path)
            loaded = Inventory.load_items_csv(path)
            assert len(loaded) >= 1
        finally:
            os.unlink(path)
