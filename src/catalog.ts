/**
 * Product catalog management.
 *
 * Provides a single source of truth for products and variants, including SKU,
 * materials, sizing, pricing, and margin calculations.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

export interface Product {
  sku: string;
  name: string;
  /** e.g. "Ring", "Necklace", "Bracelet", "Earring" */
  category: string;
  /** Comma-separated, e.g. "14k Gold, Diamond" */
  materials: string;
  /** Comma-separated sizes or "One Size" */
  sizeOptions: string;
  /** Cost to produce / wholesale cost */
  costPrice: number;
  /** Retail selling price */
  salePrice: number;
  /** Item weight for shipping */
  weightGrams: number;
  description: string;
  /** Comma-separated search/collection tags */
  tags: string;
}

/** Gross margin as a percentage: (sale - cost) / sale * 100 */
export function productMargin(p: Product): number {
  if (p.salePrice <= 0) return 0;
  return Math.round(((p.salePrice - p.costPrice) / p.salePrice) * 10000) / 100;
}

/** Markup over cost as a percentage: (sale - cost) / cost * 100 */
export function productMarkup(p: Product): number {
  if (p.costPrice <= 0) return 0;
  return Math.round(((p.salePrice - p.costPrice) / p.costPrice) * 10000) / 100;
}

const FIELD_NAMES = [
  "sku", "name", "category", "materials", "size_options",
  "cost_price", "sale_price", "weight_grams", "description", "tags",
  "margin", "markup",
];

/** In-memory product catalog with CSV persistence. */
export class Catalog {
  private _products: Map<string, Product> = new Map();

  // ------------------------------------------------------------------
  // CRUD operations
  // ------------------------------------------------------------------

  /** Add or replace a product by SKU. */
  addProduct(product: Product): void {
    this._products.set(product.sku, product);
  }

  /** Return the product with the given SKU, or undefined if not found. */
  getProduct(sku: string): Product | undefined {
    return this._products.get(sku);
  }

  /**
   * Update fields on an existing product and return the updated object.
   * Throws if the SKU does not exist.
   */
  updateProduct(sku: string, updates: Partial<Omit<Product, "sku">>): Product {
    const existing = this._products.get(sku);
    if (!existing) throw new Error(`SKU not found: ${sku}`);
    const updated: Product = { ...existing, ...updates };
    this._products.set(sku, updated);
    return updated;
  }

  /** Remove a product by SKU. Throws if not found. */
  removeProduct(sku: string): void {
    if (!this._products.has(sku)) throw new Error(`SKU not found: ${sku}`);
    this._products.delete(sku);
  }

  /** Return all products sorted by SKU. */
  allProducts(): Product[] {
    return [...this._products.values()].sort((a, b) =>
      a.sku.localeCompare(b.sku)
    );
  }

  /** Case-insensitive search across SKU, name, materials, and tags. */
  search(query: string): Product[] {
    const q = query.toLowerCase();
    return [...this._products.values()].filter(
      (p) =>
        p.sku.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.materials.toLowerCase().includes(q) ||
        p.tags.toLowerCase().includes(q)
    );
  }

  get size(): number {
    return this._products.size;
  }

  // ------------------------------------------------------------------
  // CSV I/O
  // ------------------------------------------------------------------

  /**
   * Write the catalog to a CSV file.
   * Calculated fields (margin, markup) are included for readability but are
   * ignored on load — they are always recomputed from costPrice / salePrice.
   */
  saveCSV(path: string): void {
    const rows = this.allProducts().map((p) => ({
      sku: p.sku,
      name: p.name,
      category: p.category,
      materials: p.materials,
      size_options: p.sizeOptions,
      cost_price: p.costPrice,
      sale_price: p.salePrice,
      weight_grams: p.weightGrams,
      description: p.description,
      tags: p.tags,
      margin: productMargin(p),
      markup: productMarkup(p),
    }));
    const output = stringify(rows, { header: true, columns: FIELD_NAMES });
    writeFileSync(path, output, "utf-8");
  }

  /**
   * Load a catalog from a CSV file.
   * Calculated columns (margin, markup) are ignored if present.
   */
  static loadCSV(path: string): Catalog {
    const catalog = new Catalog();
    if (!existsSync(path)) return catalog;
    const content = readFileSync(path, "utf-8");
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
    }) as Record<string, string>[];
    for (const row of records) {
      catalog.addProduct({
        sku: row["sku"],
        name: row["name"],
        category: row["category"],
        materials: row["materials"],
        sizeOptions: row["size_options"],
        costPrice: parseFloat(row["cost_price"]),
        salePrice: parseFloat(row["sale_price"]),
        weightGrams: parseFloat(row["weight_grams"]),
        description: row["description"] ?? "",
        tags: row["tags"] ?? "",
      });
    }
    return catalog;
  }

  /** Write a CSV template with example rows to the given path. */
  static writeTemplate(path: string): void {
    const rows = [
      {
        sku: "RG-001-YG-6", name: "Classic Band Ring", category: "Ring",
        materials: "14k Yellow Gold", size_options: "5,6,7,8,9,10",
        cost_price: "45.00", sale_price: "120.00", weight_grams: "3.5",
        description: "Simple polished band in 14k yellow gold.",
        tags: "ring,gold,classic", margin: "", markup: "",
      },
      {
        sku: "NK-002-SS-OS", name: "Delicate Chain Necklace", category: "Necklace",
        materials: "Sterling Silver", size_options: "16in,18in,20in",
        cost_price: "18.00", sale_price: "58.00", weight_grams: "4.2",
        description: "Fine cable chain in sterling silver.",
        tags: "necklace,silver,chain", margin: "", markup: "",
      },
    ];
    const output = stringify(rows, { header: true, columns: FIELD_NAMES });
    writeFileSync(path, output, "utf-8");
  }
}
