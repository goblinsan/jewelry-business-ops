import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  Inventory,
  InventoryItem,
  StockMovement,
  createMovement,
  needsReorder,
  reorderAlert,
} from "../src/inventory";

function tmpFile(): string {
  return path.join(os.tmpdir(), `inventory-test-${Date.now()}.csv`);
}

function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    sku: "RG-001",
    quantityOnHand: 10,
    reorderThreshold: 3,
    reorderQuantity: 10,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// needsReorder / reorderAlert helpers
// ---------------------------------------------------------------------------

describe("needsReorder", () => {
  it("returns false when stock is above threshold", () => {
    expect(needsReorder(makeItem({ quantityOnHand: 10, reorderThreshold: 3 }))).toBe(false);
  });

  it("returns true at the threshold", () => {
    expect(needsReorder(makeItem({ quantityOnHand: 3, reorderThreshold: 3 }))).toBe(true);
  });

  it("returns true below the threshold", () => {
    expect(needsReorder(makeItem({ quantityOnHand: 1, reorderThreshold: 3 }))).toBe(true);
  });
});

describe("reorderAlert", () => {
  it("returns an alert string when stock is low", () => {
    const alert = reorderAlert(makeItem({ sku: "ABC", quantityOnHand: 2, reorderThreshold: 3 }));
    expect(alert).not.toBeNull();
    expect(alert).toContain("ABC");
    expect(alert).toContain("2");
  });

  it("returns null when stock is sufficient", () => {
    expect(reorderAlert(makeItem({ quantityOnHand: 10, reorderThreshold: 3 }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createMovement validation
// ---------------------------------------------------------------------------

describe("createMovement", () => {
  it("throws when SALE has positive quantity", () => {
    expect(() => createMovement("RG-001", "SALE", 5)).toThrow();
  });

  it("throws when RESTOCK has negative quantity", () => {
    expect(() => createMovement("RG-001", "RESTOCK", -5)).toThrow();
  });

  it("allows valid SALE", () => {
    const m = createMovement("RG-001", "SALE", -2);
    expect(m.quantity).toBe(-2);
  });

  it("allows valid RESTOCK", () => {
    const m = createMovement("RG-001", "RESTOCK", 10);
    expect(m.quantity).toBe(10);
  });

  it("allows ADJUSTMENT with any sign", () => {
    expect(createMovement("X", "ADJUSTMENT", 5).quantity).toBe(5);
    expect(createMovement("X", "ADJUSTMENT", -3).quantity).toBe(-3);
  });
});

// ---------------------------------------------------------------------------
// Inventory – item CRUD
// ---------------------------------------------------------------------------

describe("Inventory CRUD", () => {
  it("addItem / getItem", () => {
    const inv = new Inventory();
    const item = makeItem({ sku: "ABC" });
    inv.addItem(item);
    expect(inv.getItem("ABC")).toBe(item);
  });

  it("getItem returns undefined for unknown SKU", () => {
    expect(new Inventory().getItem("MISSING")).toBeUndefined();
  });

  it("setReorderThreshold updates item", () => {
    const inv = new Inventory();
    inv.addItem(makeItem({ sku: "A" }));
    inv.setReorderThreshold("A", 5, 15);
    expect(inv.getItem("A")!.reorderThreshold).toBe(5);
    expect(inv.getItem("A")!.reorderQuantity).toBe(15);
  });

  it("setReorderThreshold throws for unknown SKU", () => {
    expect(() => new Inventory().setReorderThreshold("NOKEY", 5, 10)).toThrow();
  });

  it("allItems returns sorted list", () => {
    const inv = new Inventory();
    inv.addItem(makeItem({ sku: "Z" }));
    inv.addItem(makeItem({ sku: "A" }));
    const skus = inv.allItems().map((i) => i.sku);
    expect(skus).toEqual([...skus].sort());
  });

  it("size reflects number of items", () => {
    const inv = new Inventory();
    expect(inv.size).toBe(0);
    inv.addItem(makeItem({ sku: "A" }));
    expect(inv.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Inventory – stock movements
// ---------------------------------------------------------------------------

describe("Inventory movements", () => {
  it("SALE reduces stock", () => {
    const inv = new Inventory();
    inv.addItem(makeItem({ sku: "A", quantityOnHand: 10 }));
    inv.recordMovement(createMovement("A", "SALE", -3));
    expect(inv.getItem("A")!.quantityOnHand).toBe(7);
  });

  it("RESTOCK increases stock", () => {
    const inv = new Inventory();
    inv.addItem(makeItem({ sku: "A", quantityOnHand: 5 }));
    inv.recordMovement(createMovement("A", "RESTOCK", 10));
    expect(inv.getItem("A")!.quantityOnHand).toBe(15);
  });

  it("throws when movement would cause negative stock", () => {
    const inv = new Inventory();
    inv.addItem(makeItem({ sku: "A", quantityOnHand: 2 }));
    expect(() =>
      inv.recordMovement(createMovement("A", "SALE", -5))
    ).toThrow();
  });

  it("throws for unknown SKU", () => {
    const inv = new Inventory();
    expect(() =>
      inv.recordMovement(createMovement("NOSKU", "RESTOCK", 5))
    ).toThrow();
  });

  it("movementsForSku returns only matching movements", () => {
    const inv = new Inventory();
    inv.addItem(makeItem({ sku: "A", quantityOnHand: 10 }));
    inv.addItem(makeItem({ sku: "B", quantityOnHand: 5 }));
    inv.recordMovement(createMovement("A", "SALE", -2));
    inv.recordMovement(createMovement("B", "SALE", -1));
    expect(inv.movementsForSku("A")).toHaveLength(1);
    expect(inv.movementsForSku("B")).toHaveLength(1);
  });

  it("lowStockAlerts returns alerts only for low-stock items", () => {
    const inv = new Inventory();
    inv.addItem(makeItem({ sku: "LOW", quantityOnHand: 2, reorderThreshold: 3 }));
    inv.addItem(makeItem({ sku: "OK", quantityOnHand: 10, reorderThreshold: 3 }));
    const alerts = inv.lowStockAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain("LOW");
  });
});

// ---------------------------------------------------------------------------
// Inventory – CSV
// ---------------------------------------------------------------------------

describe("Inventory CSV", () => {
  it("saveItemsCSV / loadItemsCSV round-trip", () => {
    const inv = new Inventory();
    inv.addItem(makeItem({ sku: "A", quantityOnHand: 10, reorderThreshold: 3, reorderQuantity: 10 }));
    inv.addItem(makeItem({ sku: "B", quantityOnHand: 5, reorderThreshold: 2, reorderQuantity: 8 }));

    const p = tmpFile();
    try {
      inv.saveItemsCSV(p);
      const loaded = Inventory.loadItemsCSV(p);
      expect(loaded.size).toBe(2);
      const item = loaded.getItem("A");
      expect(item!.quantityOnHand).toBe(10);
      expect(item!.reorderThreshold).toBe(3);
    } finally {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  });

  it("loadItemsCSV returns empty inventory for non-existent file", () => {
    expect(Inventory.loadItemsCSV("/tmp/no-such-file-xyz.csv").size).toBe(0);
  });

  it("writeTemplate creates a loadable file", () => {
    const p = tmpFile();
    try {
      Inventory.writeTemplate(p);
      const loaded = Inventory.loadItemsCSV(p);
      expect(loaded.size).toBeGreaterThanOrEqual(1);
    } finally {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  });
});
