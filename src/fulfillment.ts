/**
 * Order fulfillment workflow.
 *
 * Models orders and line items, validates packing checklists, and tracks
 * shipment status through to delivery confirmation.
 */

import { writeFileSync } from "fs";
import { stringify } from "csv-stringify/sync";

export type OrderStatus =
  | "RECEIVED"
  | "PICKING"
  | "PACKED"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED";

// ---------------------------------------------------------------------------
// Packing checklist — applied to every outgoing order
// ---------------------------------------------------------------------------

export const PACKING_CHECKLIST: string[] = [
  "Verify SKU(s) match the order confirmation",
  "Inspect item(s) for quality defects",
  "Add branded tissue paper and jewelry pouch",
  "Insert printed thank-you card",
  "Add any promotional inserts (if applicable)",
  "Seal box with branded tape",
  "Attach printed shipping label — confirm address matches order",
  "Weigh parcel and record weight",
  "Log packed timestamp in fulfillment tracker",
];

/** Target: all orders packed and scanned within this many business hours of receipt */
export const TIME_TO_SHIP_TARGET_HOURS = 24;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

export interface LineItem {
  sku: string;
  quantity: number;
  unitPrice: number;
}

/** line total = quantity × unitPrice, rounded to 2 dp */
export function lineTotal(item: LineItem): number {
  return Math.round(item.quantity * item.unitPrice * 100) / 100;
}

export interface Order {
  orderId: string;
  customerName: string;
  customerEmail: string;
  shippingAddress: string;
  lineItems: LineItem[];
  status: OrderStatus;
  receivedAt: string;
  shippedAt: string;
  trackingNumber: string;
  carrier: string;
  notes: string;
}

/** Create an Order with required fields and sensible defaults. */
export function createOrder(fields: {
  orderId: string;
  customerName: string;
  customerEmail: string;
  shippingAddress: string;
  lineItems?: LineItem[];
  notes?: string;
}): Order {
  return {
    orderId: fields.orderId,
    customerName: fields.customerName,
    customerEmail: fields.customerEmail,
    shippingAddress: fields.shippingAddress,
    lineItems: fields.lineItems ?? [],
    status: "RECEIVED",
    receivedAt: new Date().toISOString(),
    shippedAt: "",
    trackingNumber: "",
    carrier: "",
    notes: fields.notes ?? "",
  };
}

export function orderTotal(order: Order): number {
  return Math.round(order.lineItems.reduce((sum, item) => sum + lineTotal(item), 0) * 100) / 100;
}

export function itemCount(order: Order): number {
  return order.lineItems.reduce((sum, item) => sum + item.quantity, 0);
}

const ORDER_FIELD_NAMES = [
  "order_id", "customer_name", "customer_email", "shipping_address",
  "status", "received_at", "shipped_at", "tracking_number", "carrier",
  "order_total", "item_count", "notes",
];

// ---------------------------------------------------------------------------
// FulfillmentTracker
// ---------------------------------------------------------------------------

/** Tracks open and historical orders through the fulfillment pipeline. */
export class FulfillmentTracker {
  private _orders: Map<string, Order> = new Map();

  // ------------------------------------------------------------------
  // Order management
  // ------------------------------------------------------------------

  /** Register a new order. */
  addOrder(order: Order): void {
    this._orders.set(order.orderId, order);
  }

  getOrder(orderId: string): Order | undefined {
    return this._orders.get(orderId);
  }

  /**
   * Transition an order to a new status.
   * Throws if the orderId does not exist.
   */
  updateStatus(orderId: string, status: OrderStatus): Order {
    const order = this._orders.get(orderId);
    if (!order) throw new Error(`Order not found: ${orderId}`);
    order.status = status;
    if (status === "SHIPPED" && !order.shippedAt) {
      order.shippedAt = new Date().toISOString();
    }
    return order;
  }

  /** Mark an order as shipped and record tracking details. */
  markShipped(orderId: string, trackingNumber: string, carrier: string): Order {
    const order = this._orders.get(orderId);
    if (!order) throw new Error(`Order not found: ${orderId}`);
    order.trackingNumber = trackingNumber;
    order.carrier = carrier;
    return this.updateStatus(orderId, "SHIPPED");
  }

  /** Return all orders matching the given status, sorted by receivedAt. */
  ordersByStatus(status: OrderStatus): Order[] {
    return [...this._orders.values()]
      .filter((o) => o.status === status)
      .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  }

  /** Return orders that have not yet shipped (not SHIPPED, DELIVERED, or CANCELLED). */
  pendingOrders(): Order[] {
    const terminal: OrderStatus[] = ["SHIPPED", "DELIVERED", "CANCELLED"];
    return [...this._orders.values()].filter((o) => !terminal.includes(o.status));
  }

  /** Return a formatted packing checklist for the given order. */
  generatePackingChecklist(orderId: string): string {
    const order = this._orders.get(orderId);
    if (!order) throw new Error(`Order not found: ${orderId}`);
    const lines: string[] = [
      `PACKING CHECKLIST — Order ${order.orderId}`,
      `Customer : ${order.customerName} <${order.customerEmail}>`,
      `Ship to  : ${order.shippingAddress}`,
      `Items    : ${itemCount(order)}  |  Total: $${orderTotal(order).toFixed(2)}`,
      `Target ship within ${TIME_TO_SHIP_TARGET_HOURS}h of order receipt.`,
      "",
      "Items to pack:",
    ];
    for (const item of order.lineItems) {
      lines.push(`  [ ] ${item.sku}  x${item.quantity}  @ $${item.unitPrice.toFixed(2)}`);
    }
    lines.push("");
    lines.push("Checklist:");
    PACKING_CHECKLIST.forEach((step, i) => {
      lines.push(`  ${String(i + 1).padStart(2)}. [ ] ${step}`);
    });
    lines.push("");
    lines.push("Packed by: ________________  Date/Time: ________________");
    return lines.join("\n");
  }

  allOrders(): Order[] {
    return [...this._orders.values()].sort((a, b) =>
      a.receivedAt.localeCompare(b.receivedAt)
    );
  }

  get size(): number {
    return this._orders.size;
  }

  // ------------------------------------------------------------------
  // CSV I/O
  // ------------------------------------------------------------------

  /** Persist order summary rows to CSV (line items are not serialised here). */
  saveCSV(path: string): void {
    const rows = this.allOrders().map((order) => ({
      order_id: order.orderId,
      customer_name: order.customerName,
      customer_email: order.customerEmail,
      shipping_address: order.shippingAddress,
      status: order.status,
      received_at: order.receivedAt,
      shipped_at: order.shippedAt,
      tracking_number: order.trackingNumber,
      carrier: order.carrier,
      order_total: orderTotal(order),
      item_count: itemCount(order),
      notes: order.notes,
    }));
    const output = stringify(rows, { header: true, columns: ORDER_FIELD_NAMES });
    writeFileSync(path, output, "utf-8");
  }
}
