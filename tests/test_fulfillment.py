"""Tests for the fulfillment module."""

import os
import tempfile
import pytest

from jewelry_ops.fulfillment import (
    FulfillmentTracker,
    Order,
    LineItem,
    OrderStatus,
    PACKING_CHECKLIST,
    TIME_TO_SHIP_TARGET_HOURS,
)


def make_order(
    order_id="ORD-001",
    customer_name="Alice Smith",
    customer_email="alice@example.com",
    shipping_address="123 Main St, Springfield",
    line_items=None,
) -> Order:
    if line_items is None:
        line_items = [LineItem(sku="RG-001", quantity=1, unit_price=120.0)]
    return Order(
        order_id=order_id,
        customer_name=customer_name,
        customer_email=customer_email,
        shipping_address=shipping_address,
        line_items=line_items,
    )


class TestLineItem:
    def test_line_total(self):
        item = LineItem(sku="X", quantity=3, unit_price=25.0)
        assert item.line_total == pytest.approx(75.0)


class TestOrder:
    def test_order_total_single_item(self):
        order = make_order(line_items=[LineItem(sku="A", quantity=2, unit_price=50.0)])
        assert order.order_total == pytest.approx(100.0)

    def test_order_total_multiple_items(self):
        order = make_order(
            line_items=[
                LineItem(sku="A", quantity=1, unit_price=120.0),
                LineItem(sku="B", quantity=2, unit_price=30.0),
            ]
        )
        assert order.order_total == pytest.approx(180.0)

    def test_item_count(self):
        order = make_order(
            line_items=[
                LineItem(sku="A", quantity=2, unit_price=10.0),
                LineItem(sku="B", quantity=3, unit_price=5.0),
            ]
        )
        assert order.item_count == 5

    def test_default_status(self):
        order = make_order()
        assert order.status == OrderStatus.RECEIVED


class TestFulfillmentTracker:
    def test_add_and_get(self):
        tracker = FulfillmentTracker()
        order = make_order()
        tracker.add_order(order)
        assert tracker.get_order("ORD-001") is order

    def test_get_missing_returns_none(self):
        tracker = FulfillmentTracker()
        assert tracker.get_order("MISSING") is None

    def test_update_status(self):
        tracker = FulfillmentTracker()
        tracker.add_order(make_order())
        updated = tracker.update_status("ORD-001", OrderStatus.PACKED)
        assert updated.status == OrderStatus.PACKED

    def test_update_status_missing_raises(self):
        tracker = FulfillmentTracker()
        with pytest.raises(KeyError):
            tracker.update_status("NOORDER", OrderStatus.PACKED)

    def test_mark_shipped(self):
        tracker = FulfillmentTracker()
        tracker.add_order(make_order())
        order = tracker.mark_shipped("ORD-001", tracking_number="1Z999AA", carrier="UPS")
        assert order.status == OrderStatus.SHIPPED
        assert order.tracking_number == "1Z999AA"
        assert order.carrier == "UPS"
        assert order.shipped_at != ""

    def test_orders_by_status(self):
        tracker = FulfillmentTracker()
        tracker.add_order(make_order(order_id="A"))
        tracker.add_order(make_order(order_id="B"))
        tracker.update_status("A", OrderStatus.PACKED)
        packed = tracker.orders_by_status(OrderStatus.PACKED)
        received = tracker.orders_by_status(OrderStatus.RECEIVED)
        assert len(packed) == 1
        assert len(received) == 1

    def test_pending_orders(self):
        tracker = FulfillmentTracker()
        tracker.add_order(make_order(order_id="P"))  # pending (RECEIVED)
        tracker.add_order(make_order(order_id="S"))
        tracker.mark_shipped("S", tracking_number="TRK1", carrier="USPS")
        pending = tracker.pending_orders()
        assert len(pending) == 1
        assert pending[0].order_id == "P"

    def test_len(self):
        tracker = FulfillmentTracker()
        assert len(tracker) == 0
        tracker.add_order(make_order())
        assert len(tracker) == 1


class TestPackingChecklist:
    def test_checklist_not_empty(self):
        assert len(PACKING_CHECKLIST) > 0

    def test_time_to_ship_target(self):
        assert TIME_TO_SHIP_TARGET_HOURS > 0

    def test_generate_packing_checklist_contains_order_id(self):
        tracker = FulfillmentTracker()
        tracker.add_order(make_order(order_id="ORD-999"))
        checklist = tracker.generate_packing_checklist("ORD-999")
        assert "ORD-999" in checklist

    def test_generate_packing_checklist_contains_sku(self):
        tracker = FulfillmentTracker()
        tracker.add_order(make_order(line_items=[LineItem(sku="RG-SPECIAL", quantity=1, unit_price=99.0)]))
        checklist = tracker.generate_packing_checklist("ORD-001")
        assert "RG-SPECIAL" in checklist

    def test_generate_packing_checklist_contains_steps(self):
        tracker = FulfillmentTracker()
        tracker.add_order(make_order())
        checklist = tracker.generate_packing_checklist("ORD-001")
        for step in PACKING_CHECKLIST:
            assert step in checklist


class TestFulfillmentCSV:
    def test_save_csv(self):
        tracker = FulfillmentTracker()
        tracker.add_order(make_order(order_id="ORD-A"))
        tracker.add_order(make_order(order_id="ORD-B"))
        tracker.mark_shipped("ORD-B", tracking_number="TRK99", carrier="FedEx")

        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False, mode="w") as tmp:
            path = tmp.name
        try:
            tracker.save_csv(path)
            import csv
            with open(path, newline="") as fh:
                rows = list(csv.DictReader(fh))
            assert len(rows) == 2
            shipped = next(r for r in rows if r["order_id"] == "ORD-B")
            assert shipped["status"] == "SHIPPED"
            assert shipped["tracking_number"] == "TRK99"
        finally:
            os.unlink(path)
