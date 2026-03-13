"""Tests for the product catalog module."""

import os
import tempfile
import pytest

from jewelry_ops.catalog import Catalog, Product


def make_product(
    sku="RG-001-YG-6",
    name="Classic Band Ring",
    category="Ring",
    materials="14k Yellow Gold",
    size_options="5,6,7,8",
    cost_price=45.0,
    sale_price=120.0,
    weight_grams=3.5,
) -> Product:
    return Product(
        sku=sku,
        name=name,
        category=category,
        materials=materials,
        size_options=size_options,
        cost_price=cost_price,
        sale_price=sale_price,
        weight_grams=weight_grams,
    )


class TestProduct:
    def test_margin_calculation(self):
        p = make_product(cost_price=45.0, sale_price=120.0)
        # (120 - 45) / 120 * 100 = 62.5
        assert p.margin == pytest.approx(62.5, rel=1e-3)

    def test_markup_calculation(self):
        p = make_product(cost_price=45.0, sale_price=120.0)
        # (120 - 45) / 45 * 100 = 166.67
        assert p.markup == pytest.approx(166.67, rel=1e-3)

    def test_margin_zero_sale_price(self):
        p = make_product(cost_price=10.0, sale_price=0.0)
        assert p.margin == 0.0

    def test_markup_zero_cost(self):
        p = make_product(cost_price=0.0, sale_price=50.0)
        assert p.markup == 0.0


class TestCatalogCRUD:
    def test_add_and_get(self):
        catalog = Catalog()
        p = make_product()
        catalog.add_product(p)
        assert catalog.get_product("RG-001-YG-6") is p

    def test_get_missing_returns_none(self):
        catalog = Catalog()
        assert catalog.get_product("DOES-NOT-EXIST") is None

    def test_update_product(self):
        catalog = Catalog()
        catalog.add_product(make_product(sale_price=120.0))
        updated = catalog.update_product("RG-001-YG-6", sale_price=150.0)
        assert updated.sale_price == 150.0

    def test_update_missing_raises(self):
        catalog = Catalog()
        with pytest.raises(KeyError):
            catalog.update_product("NO-SKU", sale_price=99.0)

    def test_remove_product(self):
        catalog = Catalog()
        catalog.add_product(make_product())
        catalog.remove_product("RG-001-YG-6")
        assert len(catalog) == 0

    def test_remove_missing_raises(self):
        catalog = Catalog()
        with pytest.raises(KeyError):
            catalog.remove_product("NO-SKU")

    def test_all_products_sorted(self):
        catalog = Catalog()
        catalog.add_product(make_product(sku="Z-SKU"))
        catalog.add_product(make_product(sku="A-SKU"))
        skus = [p.sku for p in catalog.all_products()]
        assert skus == sorted(skus)

    def test_len(self):
        catalog = Catalog()
        assert len(catalog) == 0
        catalog.add_product(make_product(sku="A"))
        catalog.add_product(make_product(sku="B"))
        assert len(catalog) == 2

    def test_iter(self):
        catalog = Catalog()
        catalog.add_product(make_product(sku="B"))
        catalog.add_product(make_product(sku="A"))
        assert list(catalog) == catalog.all_products()


class TestCatalogSearch:
    def test_search_by_sku(self):
        catalog = Catalog()
        catalog.add_product(make_product(sku="RG-001"))
        catalog.add_product(make_product(sku="NK-002"))
        assert len(catalog.search("RG")) == 1

    def test_search_case_insensitive(self):
        catalog = Catalog()
        catalog.add_product(make_product(name="Gold Ring"))
        assert len(catalog.search("gold")) == 1

    def test_search_by_materials(self):
        catalog = Catalog()
        catalog.add_product(make_product(materials="Sterling Silver"))
        assert len(catalog.search("silver")) == 1

    def test_search_no_match(self):
        catalog = Catalog()
        catalog.add_product(make_product())
        assert catalog.search("platinum") == []


class TestCatalogCSV:
    def test_save_and_load_roundtrip(self):
        catalog = Catalog()
        catalog.add_product(make_product(sku="RG-001", cost_price=45.0, sale_price=120.0))
        catalog.add_product(make_product(sku="NK-002", cost_price=18.0, sale_price=58.0))

        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as tmp:
            path = tmp.name

        try:
            catalog.save_csv(path)
            loaded = Catalog.load_csv(path)
            assert len(loaded) == 2
            p = loaded.get_product("RG-001")
            assert p is not None
            assert p.cost_price == pytest.approx(45.0)
            assert p.sale_price == pytest.approx(120.0)
            assert p.margin == pytest.approx(62.5, rel=1e-3)
        finally:
            os.unlink(path)

    def test_load_nonexistent_returns_empty(self):
        catalog = Catalog.load_csv("/tmp/does_not_exist_xyz.csv")
        assert len(catalog) == 0

    def test_write_template(self):
        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as tmp:
            path = tmp.name
        try:
            Catalog.write_template(path)
            loaded = Catalog.load_csv(path)
            assert len(loaded) >= 1
        finally:
            os.unlink(path)
