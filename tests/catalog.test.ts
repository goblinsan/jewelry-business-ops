import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  Catalog,
  Product,
  productMargin,
  productMarkup,
} from "../src/catalog";

function tmpFile(): string {
  return path.join(os.tmpdir(), `catalog-test-${Date.now()}.csv`);
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    sku: "RG-001-YG-6",
    name: "Classic Band Ring",
    category: "Ring",
    materials: "14k Yellow Gold",
    sizeOptions: "5,6,7,8",
    costPrice: 45.0,
    salePrice: 120.0,
    weightGrams: 3.5,
    description: "",
    tags: "",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// productMargin / productMarkup
// ---------------------------------------------------------------------------

describe("productMargin", () => {
  it("computes gross margin correctly", () => {
    // (120 - 45) / 120 * 100 = 62.5
    expect(productMargin(makeProduct())).toBeCloseTo(62.5, 2);
  });

  it("returns 0 when salePrice is 0", () => {
    expect(productMargin(makeProduct({ salePrice: 0 }))).toBe(0);
  });
});

describe("productMarkup", () => {
  it("computes markup correctly", () => {
    // (120 - 45) / 45 * 100 = 166.67
    expect(productMarkup(makeProduct())).toBeCloseTo(166.67, 1);
  });

  it("returns 0 when costPrice is 0", () => {
    expect(productMarkup(makeProduct({ costPrice: 0 }))).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Catalog – CRUD
// ---------------------------------------------------------------------------

describe("Catalog CRUD", () => {
  it("addProduct / getProduct", () => {
    const catalog = new Catalog();
    const p = makeProduct();
    catalog.addProduct(p);
    expect(catalog.getProduct("RG-001-YG-6")).toEqual(p);
  });

  it("getProduct returns undefined for missing SKU", () => {
    expect(new Catalog().getProduct("MISSING")).toBeUndefined();
  });

  it("updateProduct changes a field", () => {
    const catalog = new Catalog();
    catalog.addProduct(makeProduct());
    const updated = catalog.updateProduct("RG-001-YG-6", { salePrice: 150 });
    expect(updated.salePrice).toBe(150);
  });

  it("updateProduct throws for unknown SKU", () => {
    expect(() => new Catalog().updateProduct("NO-SKU", { salePrice: 99 })).toThrow();
  });

  it("removeProduct deletes the entry", () => {
    const catalog = new Catalog();
    catalog.addProduct(makeProduct());
    catalog.removeProduct("RG-001-YG-6");
    expect(catalog.size).toBe(0);
  });

  it("removeProduct throws for unknown SKU", () => {
    expect(() => new Catalog().removeProduct("NO-SKU")).toThrow();
  });

  it("allProducts returns sorted by SKU", () => {
    const catalog = new Catalog();
    catalog.addProduct(makeProduct({ sku: "Z-SKU" }));
    catalog.addProduct(makeProduct({ sku: "A-SKU" }));
    const skus = catalog.allProducts().map((p) => p.sku);
    expect(skus).toEqual([...skus].sort());
  });

  it("size reflects number of products", () => {
    const catalog = new Catalog();
    expect(catalog.size).toBe(0);
    catalog.addProduct(makeProduct({ sku: "A" }));
    catalog.addProduct(makeProduct({ sku: "B" }));
    expect(catalog.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Catalog – search
// ---------------------------------------------------------------------------

describe("Catalog search", () => {
  it("finds by SKU (case-insensitive)", () => {
    const catalog = new Catalog();
    catalog.addProduct(makeProduct({ sku: "RG-001" }));
    catalog.addProduct(makeProduct({ sku: "NK-002" }));
    expect(catalog.search("rg")).toHaveLength(1);
  });

  it("finds by name", () => {
    const catalog = new Catalog();
    catalog.addProduct(makeProduct({ name: "Gold Ring" }));
    expect(catalog.search("gold")).toHaveLength(1);
  });

  it("finds by materials", () => {
    const catalog = new Catalog();
    catalog.addProduct(makeProduct({ materials: "Sterling Silver" }));
    expect(catalog.search("silver")).toHaveLength(1);
  });

  it("returns empty array for no match", () => {
    const catalog = new Catalog();
    catalog.addProduct(makeProduct());
    expect(catalog.search("platinum")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Catalog – CSV
// ---------------------------------------------------------------------------

describe("Catalog CSV", () => {
  it("saveCSV / loadCSV round-trip", () => {
    const catalog = new Catalog();
    catalog.addProduct(makeProduct({ sku: "RG-001", costPrice: 45, salePrice: 120 }));
    catalog.addProduct(makeProduct({ sku: "NK-002", costPrice: 18, salePrice: 58 }));

    const p = tmpFile();
    try {
      catalog.saveCSV(p);
      const loaded = Catalog.loadCSV(p);
      expect(loaded.size).toBe(2);
      const product = loaded.getProduct("RG-001");
      expect(product).toBeDefined();
      expect(product!.costPrice).toBeCloseTo(45);
      expect(product!.salePrice).toBeCloseTo(120);
      expect(productMargin(product!)).toBeCloseTo(62.5, 1);
    } finally {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  });

  it("loadCSV returns empty catalog for non-existent file", () => {
    const catalog = Catalog.loadCSV("/tmp/no-such-file-xyz.csv");
    expect(catalog.size).toBe(0);
  });

  it("writeTemplate creates a loadable file", () => {
    const p = tmpFile();
    try {
      Catalog.writeTemplate(p);
      const loaded = Catalog.loadCSV(p);
      expect(loaded.size).toBeGreaterThanOrEqual(1);
    } finally {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  });
});
