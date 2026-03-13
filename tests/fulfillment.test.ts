import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  FulfillmentTracker,
  Order,
  LineItem,
  createOrder,
  lineTotal,
  orderTotal,
  itemCount,
  PACKING_CHECKLIST,
  TIME_TO_SHIP_TARGET_HOURS,
} from "../src/fulfillment";

function tmpFile(): string {
  return path.join(os.tmpdir(), `fulfillment-test-${Date.now()}.csv`);
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    orderId: "ORD-001",
    customerName: "Alice Smith",
    customerEmail: "alice@example.com",
    shippingAddress: "123 Main St, Springfield",
    lineItems: [{ sku: "RG-001", quantity: 1, unitPrice: 120.0 }],
    status: "RECEIVED",
    receivedAt: new Date().toISOString(),
    shippedAt: "",
    trackingNumber: "",
    carrier: "",
    notes: "",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// lineTotal
// ---------------------------------------------------------------------------

describe("lineTotal", () => {
  it("multiplies quantity × unitPrice", () => {
    const item: LineItem = { sku: "X", quantity: 3, unitPrice: 25.0 };
    expect(lineTotal(item)).toBeCloseTo(75.0);
  });
});

// ---------------------------------------------------------------------------
// Order helpers
// ---------------------------------------------------------------------------

describe("orderTotal", () => {
  it("sums a single line item", () => {
    const order = makeOrder({
      lineItems: [{ sku: "A", quantity: 2, unitPrice: 50.0 }],
    });
    expect(orderTotal(order)).toBeCloseTo(100.0);
  });

  it("sums multiple line items", () => {
    const order = makeOrder({
      lineItems: [
        { sku: "A", quantity: 1, unitPrice: 120.0 },
        { sku: "B", quantity: 2, unitPrice: 30.0 },
      ],
    });
    expect(orderTotal(order)).toBeCloseTo(180.0);
  });
});

describe("itemCount", () => {
  it("sums quantities across line items", () => {
    const order = makeOrder({
      lineItems: [
        { sku: "A", quantity: 2, unitPrice: 10.0 },
        { sku: "B", quantity: 3, unitPrice: 5.0 },
      ],
    });
    expect(itemCount(order)).toBe(5);
  });
});

describe("createOrder", () => {
  it("sets default status to RECEIVED", () => {
    const order = createOrder({
      orderId: "X",
      customerName: "Bob",
      customerEmail: "b@b.com",
      shippingAddress: "1 Main St",
    });
    expect(order.status).toBe("RECEIVED");
  });

  it("defaults lineItems to empty array", () => {
    const order = createOrder({
      orderId: "X", customerName: "Bob",
      customerEmail: "b@b.com", shippingAddress: "1 Main St",
    });
    expect(order.lineItems).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// FulfillmentTracker
// ---------------------------------------------------------------------------

describe("FulfillmentTracker – management", () => {
  it("addOrder / getOrder", () => {
    const tracker = new FulfillmentTracker();
    const order = makeOrder();
    tracker.addOrder(order);
    expect(tracker.getOrder("ORD-001")).toBe(order);
  });

  it("getOrder returns undefined for missing id", () => {
    expect(new FulfillmentTracker().getOrder("MISSING")).toBeUndefined();
  });

  it("updateStatus changes the order status", () => {
    const tracker = new FulfillmentTracker();
    tracker.addOrder(makeOrder());
    const updated = tracker.updateStatus("ORD-001", "PACKED");
    expect(updated.status).toBe("PACKED");
  });

  it("updateStatus throws for unknown orderId", () => {
    expect(() =>
      new FulfillmentTracker().updateStatus("NO-ORDER", "PACKED")
    ).toThrow();
  });

  it("markShipped records tracking info and sets status", () => {
    const tracker = new FulfillmentTracker();
    tracker.addOrder(makeOrder());
    const order = tracker.markShipped("ORD-001", "1Z999AA", "UPS");
    expect(order.status).toBe("SHIPPED");
    expect(order.trackingNumber).toBe("1Z999AA");
    expect(order.carrier).toBe("UPS");
    expect(order.shippedAt).not.toBe("");
  });

  it("ordersByStatus filters correctly", () => {
    const tracker = new FulfillmentTracker();
    tracker.addOrder(makeOrder({ orderId: "A" }));
    tracker.addOrder(makeOrder({ orderId: "B" }));
    tracker.updateStatus("A", "PACKED");
    expect(tracker.ordersByStatus("PACKED")).toHaveLength(1);
    expect(tracker.ordersByStatus("RECEIVED")).toHaveLength(1);
  });

  it("pendingOrders excludes shipped/delivered/cancelled", () => {
    const tracker = new FulfillmentTracker();
    tracker.addOrder(makeOrder({ orderId: "P" }));
    tracker.addOrder(makeOrder({ orderId: "S" }));
    tracker.markShipped("S", "TRK1", "USPS");
    const pending = tracker.pendingOrders();
    expect(pending).toHaveLength(1);
    expect(pending[0].orderId).toBe("P");
  });

  it("size reflects number of orders", () => {
    const tracker = new FulfillmentTracker();
    expect(tracker.size).toBe(0);
    tracker.addOrder(makeOrder());
    expect(tracker.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Packing checklist
// ---------------------------------------------------------------------------

describe("PACKING_CHECKLIST", () => {
  it("has at least one step", () => {
    expect(PACKING_CHECKLIST.length).toBeGreaterThan(0);
  });
});

describe("TIME_TO_SHIP_TARGET_HOURS", () => {
  it("is positive", () => {
    expect(TIME_TO_SHIP_TARGET_HOURS).toBeGreaterThan(0);
  });
});

describe("generatePackingChecklist", () => {
  it("contains the order id", () => {
    const tracker = new FulfillmentTracker();
    tracker.addOrder(makeOrder({ orderId: "ORD-999" }));
    expect(tracker.generatePackingChecklist("ORD-999")).toContain("ORD-999");
  });

  it("contains the SKU of each line item", () => {
    const tracker = new FulfillmentTracker();
    tracker.addOrder(
      makeOrder({ lineItems: [{ sku: "RG-SPECIAL", quantity: 1, unitPrice: 99 }] })
    );
    expect(tracker.generatePackingChecklist("ORD-001")).toContain("RG-SPECIAL");
  });

  it("contains every checklist step", () => {
    const tracker = new FulfillmentTracker();
    tracker.addOrder(makeOrder());
    const checklist = tracker.generatePackingChecklist("ORD-001");
    for (const step of PACKING_CHECKLIST) {
      expect(checklist).toContain(step);
    }
  });

  it("throws for unknown orderId", () => {
    expect(() =>
      new FulfillmentTracker().generatePackingChecklist("NONE")
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

describe("FulfillmentTracker CSV", () => {
  it("saveCSV writes correct rows", () => {
    const tracker = new FulfillmentTracker();
    tracker.addOrder(makeOrder({ orderId: "ORD-A" }));
    tracker.addOrder(makeOrder({ orderId: "ORD-B" }));
    tracker.markShipped("ORD-B", "TRK99", "FedEx");

    const p = tmpFile();
    try {
      tracker.saveCSV(p);
      const content = fs.readFileSync(p, "utf-8");
      expect(content).toContain("ORD-A");
      expect(content).toContain("ORD-B");
      expect(content).toContain("SHIPPED");
      expect(content).toContain("TRK99");
    } finally {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  });
});
