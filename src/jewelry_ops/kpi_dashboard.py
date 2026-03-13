"""Weekly KPI dashboard for business health monitoring.

Computes and reports on the core weekly metrics:
  - Total orders
  - Average Order Value (AOV)
  - Conversion rate (requires sessions data)
  - Return rate
"""

from __future__ import annotations

import csv
import os
from dataclasses import dataclass, asdict
from datetime import date, timedelta
from typing import Sequence


@dataclass
class WeeklyMetrics:
    """Aggregated KPI metrics for a single calendar week."""

    week_start: date          # Monday of the week (ISO 8601)
    week_end: date            # Sunday of the week
    total_orders: int
    total_revenue: float
    total_returns: int
    total_sessions: int       # website / channel sessions; 0 if unknown

    @property
    def aov(self) -> float:
        """Average Order Value = total revenue / total orders."""
        if self.total_orders == 0:
            return 0.0
        return round(self.total_revenue / self.total_orders, 2)

    @property
    def conversion_rate(self) -> float:
        """Conversion rate = orders / sessions * 100 (%). 0 if sessions unknown."""
        if self.total_sessions == 0:
            return 0.0
        return round(self.total_orders / self.total_sessions * 100, 2)

    @property
    def return_rate(self) -> float:
        """Return rate = returns / orders * 100 (%)."""
        if self.total_orders == 0:
            return 0.0
        return round(self.total_returns / self.total_orders * 100, 2)

    def summary(self) -> str:
        """One-page text summary suitable for a weekly review."""
        lines = [
            "=" * 60,
            f"  WEEKLY KPI DASHBOARD  |  {self.week_start} → {self.week_end}",
            "=" * 60,
            f"  Total Orders     : {self.total_orders:>8}",
            f"  Total Revenue    : ${self.total_revenue:>10.2f}",
            f"  AOV              : ${self.aov:>10.2f}",
            f"  Sessions         : {self.total_sessions:>8}",
            f"  Conversion Rate  : {self.conversion_rate:>7.2f}%",
            f"  Returns          : {self.total_returns:>8}",
            f"  Return Rate      : {self.return_rate:>7.2f}%",
            "=" * 60,
        ]
        return "\n".join(lines)


_FIELDNAMES = [
    "week_start",
    "week_end",
    "total_orders",
    "total_revenue",
    "total_returns",
    "total_sessions",
    "aov",
    "conversion_rate",
    "return_rate",
]


def metrics_for_week(
    week_start: date,
    orders: Sequence[float],
    returns: int = 0,
    sessions: int = 0,
) -> WeeklyMetrics:
    """Convenience factory: build WeeklyMetrics from a list of order totals.

    Args:
        week_start: The Monday of the reporting week.
        orders:     Sequence of per-order revenue amounts for that week.
        returns:    Number of returned orders in the week.
        sessions:   Total channel sessions (for conversion rate). Pass 0 if unknown.
    """
    week_end = week_start + timedelta(days=6)
    return WeeklyMetrics(
        week_start=week_start,
        week_end=week_end,
        total_orders=len(orders),
        total_revenue=round(sum(orders), 2),
        total_returns=returns,
        total_sessions=sessions,
    )


class KPIDashboard:
    """Stores weekly metrics history and supports CSV persistence."""

    def __init__(self) -> None:
        self._weeks: dict[date, WeeklyMetrics] = {}

    def add_week(self, metrics: WeeklyMetrics) -> None:
        """Add or replace a week's metrics."""
        self._weeks[metrics.week_start] = metrics

    def get_week(self, week_start: date) -> WeeklyMetrics | None:
        return self._weeks.get(week_start)

    def all_weeks(self) -> list[WeeklyMetrics]:
        """Return all weeks sorted chronologically."""
        return sorted(self._weeks.values(), key=lambda m: m.week_start)

    def latest_week(self) -> WeeklyMetrics | None:
        """Return the most recently added week, or None if empty."""
        if not self._weeks:
            return None
        return self._weeks[max(self._weeks)]

    def trend(self, metric: str, n: int = 4) -> list[float]:
        """Return the last *n* weekly values for the named metric property.

        ``metric`` must be the name of a numeric property on WeeklyMetrics
        (e.g. ``"aov"``, ``"conversion_rate"``, ``"return_rate"``).
        """
        weeks = self.all_weeks()[-n:]
        return [getattr(w, metric) for w in weeks]

    def __len__(self) -> int:
        return len(self._weeks)

    # ------------------------------------------------------------------
    # CSV I/O
    # ------------------------------------------------------------------

    def save_csv(self, path: str) -> None:
        """Write all weekly metrics rows to CSV (computed cols included)."""
        with open(path, "w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=_FIELDNAMES)
            writer.writeheader()
            for week in self.all_weeks():
                writer.writerow(
                    {
                        "week_start": week.week_start.isoformat(),
                        "week_end": week.week_end.isoformat(),
                        "total_orders": week.total_orders,
                        "total_revenue": week.total_revenue,
                        "total_returns": week.total_returns,
                        "total_sessions": week.total_sessions,
                        "aov": week.aov,
                        "conversion_rate": week.conversion_rate,
                        "return_rate": week.return_rate,
                    }
                )

    @classmethod
    def load_csv(cls, path: str) -> "KPIDashboard":
        """Load historical weekly metrics from CSV."""
        dashboard = cls()
        if not os.path.exists(path):
            return dashboard
        with open(path, newline="", encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                metrics = WeeklyMetrics(
                    week_start=date.fromisoformat(row["week_start"]),
                    week_end=date.fromisoformat(row["week_end"]),
                    total_orders=int(row["total_orders"]),
                    total_revenue=float(row["total_revenue"]),
                    total_returns=int(row["total_returns"]),
                    total_sessions=int(row["total_sessions"]),
                )
                dashboard.add_week(metrics)
        return dashboard

    @staticmethod
    def write_template(path: str) -> None:
        """Write a blank KPI CSV template with example rows."""
        rows = [
            {
                "week_start": "2026-03-02",
                "week_end": "2026-03-08",
                "total_orders": 42,
                "total_revenue": 3780.00,
                "total_returns": 2,
                "total_sessions": 1400,
                "aov": "",
                "conversion_rate": "",
                "return_rate": "",
            },
            {
                "week_start": "2026-03-09",
                "week_end": "2026-03-15",
                "total_orders": 55,
                "total_revenue": 5225.00,
                "total_returns": 1,
                "total_sessions": 1800,
                "aov": "",
                "conversion_rate": "",
                "return_rate": "",
            },
        ]
        with open(path, "w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=_FIELDNAMES)
            writer.writeheader()
            writer.writerows(rows)
