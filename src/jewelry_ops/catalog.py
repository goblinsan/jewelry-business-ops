"""Product catalog management.

Provides a single source of truth for products and variants, including SKU,
materials, sizing, pricing, and margin calculations.
"""

from __future__ import annotations

import csv
import os
from dataclasses import dataclass, field, fields, asdict
from typing import Iterator


@dataclass
class Product:
    """Represents a single jewelry product or variant in the catalog."""

    sku: str
    name: str
    category: str          # e.g. "Ring", "Necklace", "Bracelet", "Earring"
    materials: str         # comma-separated, e.g. "14k Gold, Diamond"
    size_options: str      # comma-separated sizes or "One Size"
    cost_price: float      # cost to produce / wholesale cost
    sale_price: float      # retail selling price
    weight_grams: float    # item weight for shipping
    description: str = ""
    tags: str = ""         # comma-separated search/collection tags

    @property
    def margin(self) -> float:
        """Gross margin as a percentage: (sale - cost) / sale * 100."""
        if self.sale_price <= 0:
            return 0.0
        return round((self.sale_price - self.cost_price) / self.sale_price * 100, 2)

    @property
    def markup(self) -> float:
        """Markup over cost as a percentage: (sale - cost) / cost * 100."""
        if self.cost_price <= 0:
            return 0.0
        return round((self.sale_price - self.cost_price) / self.cost_price * 100, 2)


# CSV column order follows the dataclass field order plus the two calculated props
_FIELDNAMES = [f.name for f in fields(Product)] + ["margin", "markup"]


class Catalog:
    """In-memory product catalog with CSV persistence."""

    def __init__(self) -> None:
        self._products: dict[str, Product] = {}

    # ------------------------------------------------------------------
    # CRUD operations
    # ------------------------------------------------------------------

    def add_product(self, product: Product) -> None:
        """Add or replace a product by SKU."""
        self._products[product.sku] = product

    def get_product(self, sku: str) -> Product | None:
        """Return the product with the given SKU, or None if not found."""
        return self._products.get(sku)

    def update_product(self, sku: str, **kwargs) -> Product:
        """Update fields on an existing product and return the updated object.

        Raises KeyError if the SKU does not exist.
        """
        product = self._products[sku]
        updated = {f.name: getattr(product, f.name) for f in fields(product)}
        updated.update(kwargs)
        self._products[sku] = Product(**updated)
        return self._products[sku]

    def remove_product(self, sku: str) -> None:
        """Remove a product by SKU. Raises KeyError if not found."""
        del self._products[sku]

    def all_products(self) -> list[Product]:
        """Return all products sorted by SKU."""
        return sorted(self._products.values(), key=lambda p: p.sku)

    def search(self, query: str) -> list[Product]:
        """Case-insensitive search across SKU, name, materials, and tags."""
        q = query.lower()
        return [
            p for p in self._products.values()
            if q in p.sku.lower()
            or q in p.name.lower()
            or q in p.materials.lower()
            or q in p.tags.lower()
        ]

    def __len__(self) -> int:
        return len(self._products)

    def __iter__(self) -> Iterator[Product]:
        return iter(self.all_products())

    # ------------------------------------------------------------------
    # CSV I/O
    # ------------------------------------------------------------------

    def save_csv(self, path: str) -> None:
        """Write the catalog to a CSV file.

        The file is written with a header row followed by one row per product.
        Calculated fields (margin, markup) are included for readability but are
        ignored on load — they are always recomputed from cost_price / sale_price.
        """
        with open(path, "w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=_FIELDNAMES)
            writer.writeheader()
            for product in self.all_products():
                row = asdict(product)
                row["margin"] = product.margin
                row["markup"] = product.markup
                writer.writerow(row)

    @classmethod
    def load_csv(cls, path: str) -> "Catalog":
        """Load a catalog from a CSV file.

        Calculated columns (margin, markup) are ignored if present.
        """
        catalog = cls()
        if not os.path.exists(path):
            return catalog
        with open(path, newline="", encoding="utf-8") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                product = Product(
                    sku=row["sku"],
                    name=row["name"],
                    category=row["category"],
                    materials=row["materials"],
                    size_options=row["size_options"],
                    cost_price=float(row["cost_price"]),
                    sale_price=float(row["sale_price"]),
                    weight_grams=float(row["weight_grams"]),
                    description=row.get("description", ""),
                    tags=row.get("tags", ""),
                )
                catalog.add_product(product)
        return catalog

    @staticmethod
    def write_template(path: str) -> None:
        """Write a blank CSV template with example rows to the given path."""
        template_rows = [
            {
                "sku": "RG-001-YG-6",
                "name": "Classic Band Ring",
                "category": "Ring",
                "materials": "14k Yellow Gold",
                "size_options": "5,6,7,8,9,10",
                "cost_price": "45.00",
                "sale_price": "120.00",
                "weight_grams": "3.5",
                "description": "Simple polished band in 14k yellow gold.",
                "tags": "ring,gold,classic",
                "margin": "",
                "markup": "",
            },
            {
                "sku": "NK-002-SS-OS",
                "name": "Delicate Chain Necklace",
                "category": "Necklace",
                "materials": "Sterling Silver",
                "size_options": "16in,18in,20in",
                "cost_price": "18.00",
                "sale_price": "58.00",
                "weight_grams": "4.2",
                "description": "Fine cable chain in sterling silver.",
                "tags": "necklace,silver,chain",
                "margin": "",
                "markup": "",
            },
        ]
        with open(path, "w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=_FIELDNAMES)
            writer.writeheader()
            writer.writerows(template_rows)
