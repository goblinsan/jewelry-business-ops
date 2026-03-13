"""Tests for the KPI dashboard module."""

import os
import tempfile
from datetime import date
import pytest

from jewelry_ops.kpi_dashboard import KPIDashboard, WeeklyMetrics, metrics_for_week


MONDAY = date(2026, 3, 9)


def make_metrics(
    week_start=MONDAY,
    total_orders=50,
    total_revenue=4500.0,
    total_returns=2,
    total_sessions=1000,
) -> WeeklyMetrics:
    from datetime import timedelta
    return WeeklyMetrics(
        week_start=week_start,
        week_end=week_start + timedelta(days=6),
        total_orders=total_orders,
        total_revenue=total_revenue,
        total_returns=total_returns,
        total_sessions=total_sessions,
    )


class TestWeeklyMetrics:
    def test_aov(self):
        m = make_metrics(total_orders=50, total_revenue=4500.0)
        assert m.aov == pytest.approx(90.0)

    def test_aov_zero_orders(self):
        m = make_metrics(total_orders=0, total_revenue=0.0)
        assert m.aov == 0.0

    def test_conversion_rate(self):
        m = make_metrics(total_orders=50, total_sessions=1000)
        assert m.conversion_rate == pytest.approx(5.0)

    def test_conversion_rate_zero_sessions(self):
        m = make_metrics(total_orders=50, total_sessions=0)
        assert m.conversion_rate == 0.0

    def test_return_rate(self):
        m = make_metrics(total_orders=50, total_returns=5)
        assert m.return_rate == pytest.approx(10.0)

    def test_return_rate_zero_orders(self):
        m = make_metrics(total_orders=0, total_returns=0)
        assert m.return_rate == 0.0

    def test_summary_contains_key_fields(self):
        m = make_metrics()
        summary = m.summary()
        assert "Total Orders" in summary
        assert "AOV" in summary
        assert "Conversion Rate" in summary
        assert "Return Rate" in summary


class TestMetricsForWeek:
    def test_builds_from_order_list(self):
        orders = [100.0, 200.0, 150.0]
        m = metrics_for_week(MONDAY, orders, returns=1, sessions=500)
        assert m.total_orders == 3
        assert m.total_revenue == pytest.approx(450.0)
        assert m.total_returns == 1
        assert m.total_sessions == 500

    def test_week_end_is_sunday(self):
        from datetime import timedelta
        monday = date(2026, 3, 9)
        m = metrics_for_week(monday, [100.0])
        assert m.week_end == monday + timedelta(days=6)

    def test_empty_orders(self):
        m = metrics_for_week(MONDAY, [])
        assert m.total_orders == 0
        assert m.aov == 0.0


class TestKPIDashboard:
    def test_add_and_get_week(self):
        dashboard = KPIDashboard()
        m = make_metrics()
        dashboard.add_week(m)
        assert dashboard.get_week(MONDAY) is m

    def test_get_missing_returns_none(self):
        dashboard = KPIDashboard()
        assert dashboard.get_week(date(2000, 1, 1)) is None

    def test_len(self):
        dashboard = KPIDashboard()
        assert len(dashboard) == 0
        dashboard.add_week(make_metrics())
        assert len(dashboard) == 1

    def test_all_weeks_sorted(self):
        from datetime import timedelta
        dashboard = KPIDashboard()
        w1 = date(2026, 3, 2)
        w2 = date(2026, 3, 9)
        dashboard.add_week(make_metrics(week_start=w2))
        dashboard.add_week(make_metrics(week_start=w1))
        weeks = dashboard.all_weeks()
        assert weeks[0].week_start == w1
        assert weeks[1].week_start == w2

    def test_latest_week(self):
        from datetime import timedelta
        dashboard = KPIDashboard()
        w1 = date(2026, 3, 2)
        w2 = date(2026, 3, 9)
        dashboard.add_week(make_metrics(week_start=w1))
        dashboard.add_week(make_metrics(week_start=w2))
        assert dashboard.latest_week().week_start == w2

    def test_latest_week_empty_returns_none(self):
        dashboard = KPIDashboard()
        assert dashboard.latest_week() is None

    def test_trend_aov(self):
        from datetime import timedelta
        dashboard = KPIDashboard()
        base = date(2026, 1, 5)
        for i in range(4):
            dashboard.add_week(
                make_metrics(
                    week_start=base + timedelta(weeks=i),
                    total_orders=10,
                    total_revenue=1000.0 * (i + 1),
                )
            )
        trend = dashboard.trend("aov", n=4)
        assert len(trend) == 4
        # AOV values should be increasing
        assert trend == sorted(trend)


class TestKPIDashboardCSV:
    def test_save_and_load_roundtrip(self):
        from datetime import timedelta
        dashboard = KPIDashboard()
        w1 = date(2026, 3, 2)
        w2 = date(2026, 3, 9)
        dashboard.add_week(make_metrics(week_start=w1, total_orders=40, total_revenue=3600.0))
        dashboard.add_week(make_metrics(week_start=w2, total_orders=55, total_revenue=5225.0))

        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as tmp:
            path = tmp.name
        try:
            dashboard.save_csv(path)
            loaded = KPIDashboard.load_csv(path)
            assert len(loaded) == 2
            week = loaded.get_week(w2)
            assert week is not None
            assert week.total_orders == 55
            assert week.total_revenue == pytest.approx(5225.0)
            assert week.aov == pytest.approx(95.0)
        finally:
            os.unlink(path)

    def test_load_nonexistent_returns_empty(self):
        dashboard = KPIDashboard.load_csv("/tmp/no_such_file_abc.csv")
        assert len(dashboard) == 0

    def test_write_template(self):
        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as tmp:
            path = tmp.name
        try:
            KPIDashboard.write_template(path)
            loaded = KPIDashboard.load_csv(path)
            assert len(loaded) >= 1
        finally:
            os.unlink(path)
