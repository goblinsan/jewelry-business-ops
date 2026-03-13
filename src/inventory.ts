/**
 * Inventory tracking with reorder thresholds and low-stock alerts.
 *
 * Tracks quantity-on-hand per SKU, records stock movements (sales, restocks,
 * returns, adjustments), and surfaces alerts when stock falls at or below the
 * reorder threshold.
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

export type MovementType = "SALE" | "RESTOCK" | "RETURN" | "ADJUSTMENT";

export interface StockMovement {
  sku: string;
  movementType: MovementType;
  /** Positive = stock added, negative = stock removed */
  quantity: number;
  timestamp: string;
  note: string;
}

/**
 * Create a validated StockMovement.
 * SALE must have a negative quantity; RESTOCK must have a positive quantity.
 */
export function createMovement(
  sku: string,
  movementType: MovementType,
  quantity: number,
  note = "",
  timestamp = new Date().toISOString()
): StockMovement {
  if (movementType === "SALE" && quantity > 0) {
    throw new Error(
      "SALE movements must have a negative quantity (stock leaves inventory)."
    );
  }
  if (movementType === "RESTOCK" && quantity < 0) {
    throw new Error("RESTOCK movements must have a positive quantity.");
  }
  return { sku, movementType, quantity, timestamp, note };
}

export interface InventoryItem {
  sku: string;
  quantityOnHand: number;
  /** Alert when quantityOnHand <= this value */
  reorderThreshold: number;
  /** Suggested replenishment quantity */
  reorderQuantity: number;
}

/** True when current stock is at or below the reorder threshold. */
export function needsReorder(item: InventoryItem): boolean {
  return item.quantityOnHand <= item.reorderThreshold;
}

/** Return a human-readable alert string if stock is low, or null. */
export function reorderAlert(item: InventoryItem): string | null {
  if (!needsReorder(item)) return null;
  return (
    `LOW STOCK [${item.sku}]: ${item.quantityOnHand} unit(s) on hand ` +
    `(threshold: ${item.reorderThreshold}). ` +
    `Suggested reorder qty: ${item.reorderQuantity}.`
  );
}

const ITEM_FIELD_NAMES = [
  "sku", "quantity_on_hand", "reorder_threshold", "reorder_quantity",
];
const MOVEMENT_FIELD_NAMES = [
  "sku", "movement_type", "quantity", "timestamp", "note",
];

/** In-memory inventory ledger with CSV persistence. */
export class Inventory {
  private _items: Map<string, InventoryItem> = new Map();
  private _movements: StockMovement[] = [];

  // ------------------------------------------------------------------
  // Item management
  // ------------------------------------------------------------------

  /** Register a new SKU in the inventory. */
  addItem(item: InventoryItem): void {
    this._items.set(item.sku, item);
  }

  getItem(sku: string): InventoryItem | undefined {
    return this._items.get(sku);
  }

  /**
   * Update the reorder policy for an existing SKU.
   * Throws if the SKU is not tracked.
   */
  setReorderThreshold(sku: string, threshold: number, reorderQty: number): void {
    const item = this._items.get(sku);
    if (!item) throw new Error(`SKU not tracked: ${sku}`);
    item.reorderThreshold = threshold;
    item.reorderQuantity = reorderQty;
  }

  /** Return all items sorted by SKU. */
  allItems(): InventoryItem[] {
    return [...this._items.values()].sort((a, b) => a.sku.localeCompare(b.sku));
  }

  /** Return alert strings for every SKU that needs reordering. */
  lowStockAlerts(): string[] {
    return this.allItems()
      .map((item) => reorderAlert(item))
      .filter((a): a is string => a !== null);
  }

  get size(): number {
    return this._items.size;
  }

  // ------------------------------------------------------------------
  // Stock movements
  // ------------------------------------------------------------------

  /**
   * Apply a stock movement and return the updated InventoryItem.
   * Throws if the SKU is not tracked or if the movement would push stock below 0.
   */
  recordMovement(movement: StockMovement): InventoryItem {
    const item = this._items.get(movement.sku);
    if (!item) throw new Error(`SKU not tracked: ${movement.sku}`);
    const newQty = item.quantityOnHand + movement.quantity;
    if (newQty < 0) {
      throw new Error(
        `Movement would result in negative stock for SKU '${movement.sku}': ` +
        `current=${item.quantityOnHand}, delta=${movement.quantity}.`
      );
    }
    item.quantityOnHand = newQty;
    this._movements.push(movement);
    return item;
  }

  /** Return all recorded movements for a given SKU. */
  movementsForSku(sku: string): StockMovement[] {
    return this._movements.filter((m) => m.sku === sku);
  }

  // ------------------------------------------------------------------
  // CSV I/O — items
  // ------------------------------------------------------------------

  /** Write current stock levels and reorder thresholds to CSV. */
  saveItemsCSV(path: string): void {
    const rows = this.allItems().map((item) => ({
      sku: item.sku,
      quantity_on_hand: item.quantityOnHand,
      reorder_threshold: item.reorderThreshold,
      reorder_quantity: item.reorderQuantity,
    }));
    const output = stringify(rows, { header: true, columns: ITEM_FIELD_NAMES });
    writeFileSync(path, output, "utf-8");
  }

  /** Load inventory items from CSV. Movements start empty. */
  static loadItemsCSV(path: string): Inventory {
    const inventory = new Inventory();
    if (!existsSync(path)) return inventory;
    const content = readFileSync(path, "utf-8");
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
    }) as Record<string, string>[];
    for (const row of records) {
      inventory.addItem({
        sku: row["sku"],
        quantityOnHand: parseInt(row["quantity_on_hand"], 10),
        reorderThreshold: parseInt(row["reorder_threshold"], 10),
        reorderQuantity: parseInt(row["reorder_quantity"], 10),
      });
    }
    return inventory;
  }

  // ------------------------------------------------------------------
  // CSV I/O — movements
  // ------------------------------------------------------------------

  /** Append all in-memory movements to a CSV file. */
  saveMovementsCSV(path: string): void {
    const writeHeader = !existsSync(path);
    const rows = this._movements.map((m) => ({
      sku: m.sku,
      movement_type: m.movementType,
      quantity: m.quantity,
      timestamp: m.timestamp,
      note: m.note,
    }));
    const output = stringify(rows, {
      header: writeHeader,
      columns: MOVEMENT_FIELD_NAMES,
    });
    appendFileSync(path, output, "utf-8");
  }

  /** Load movement history from CSV (read-only; does not replay stock). */
  static loadMovementsCSV(path: string): StockMovement[] {
    if (!existsSync(path)) return [];
    const content = readFileSync(path, "utf-8");
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
    }) as Record<string, string>[];
    return records.map((row) => ({
      sku: row["sku"],
      movementType: row["movement_type"] as MovementType,
      quantity: parseInt(row["quantity"], 10),
      timestamp: row["timestamp"],
      note: row["note"] ?? "",
    }));
  }

  /** Write a sample inventory CSV template. */
  static writeTemplate(path: string): void {
    const rows = [
      { sku: "RG-001-YG-6", quantity_on_hand: 10, reorder_threshold: 3, reorder_quantity: 10 },
      { sku: "NK-002-SS-OS", quantity_on_hand: 5, reorder_threshold: 2, reorder_quantity: 8 },
    ];
    const output = stringify(rows, { header: true, columns: ITEM_FIELD_NAMES });
    writeFileSync(path, output, "utf-8");
  }
}
