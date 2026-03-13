/**
 * Weekly KPI dashboard for business health monitoring.
 *
 * Computes and reports on the core weekly metrics:
 *   - Total orders
 *   - Average Order Value (AOV)
 *   - Conversion rate (requires sessions data)
 *   - Return rate
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

export interface WeeklyMetrics {
  /** Monday of the week (ISO 8601 date string) */
  weekStart: string;
  /** Sunday of the week (ISO 8601 date string) */
  weekEnd: string;
  totalOrders: number;
  totalRevenue: number;
  totalReturns: number;
  /** Website / channel sessions; 0 if unknown */
  totalSessions: number;
}

/** Average Order Value = totalRevenue / totalOrders */
export function aov(m: WeeklyMetrics): number {
  if (m.totalOrders === 0) return 0;
  return Math.round((m.totalRevenue / m.totalOrders) * 100) / 100;
}

/** Conversion rate = orders / sessions * 100 (%). 0 if sessions unknown. */
export function conversionRate(m: WeeklyMetrics): number {
  if (m.totalSessions === 0) return 0;
  return Math.round((m.totalOrders / m.totalSessions) * 10000) / 100;
}

/** Return rate = returns / orders * 100 (%). */
export function returnRate(m: WeeklyMetrics): number {
  if (m.totalOrders === 0) return 0;
  return Math.round((m.totalReturns / m.totalOrders) * 10000) / 100;
}

/** One-page text summary suitable for a weekly review. */
export function weekSummary(m: WeeklyMetrics): string {
  const sep = "=".repeat(60);
  return [
    sep,
    `  WEEKLY KPI DASHBOARD  |  ${m.weekStart} → ${m.weekEnd}`,
    sep,
    `  Total Orders     : ${String(m.totalOrders).padStart(8)}`,
    `  Total Revenue    : $${m.totalRevenue.toFixed(2).padStart(10)}`,
    `  AOV              : $${aov(m).toFixed(2).padStart(10)}`,
    `  Sessions         : ${String(m.totalSessions).padStart(8)}`,
    `  Conversion Rate  : ${conversionRate(m).toFixed(2).padStart(7)}%`,
    `  Returns          : ${String(m.totalReturns).padStart(8)}`,
    `  Return Rate      : ${returnRate(m).toFixed(2).padStart(7)}%`,
    sep,
  ].join("\n");
}

const FIELD_NAMES = [
  "week_start", "week_end", "total_orders", "total_revenue",
  "total_returns", "total_sessions", "aov", "conversion_rate", "return_rate",
];

/** Add 6 days to an ISO date string to get the Sunday of that week. */
function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Convenience factory: build WeeklyMetrics from a list of order totals.
 *
 * @param weekStart  The Monday of the reporting week (YYYY-MM-DD).
 * @param orders     Per-order revenue amounts for that week.
 * @param returns    Number of returned orders in the week.
 * @param sessions   Total channel sessions (for conversion rate). 0 if unknown.
 */
export function metricsForWeek(
  weekStart: string,
  orders: number[],
  returns = 0,
  sessions = 0
): WeeklyMetrics {
  return {
    weekStart,
    weekEnd: addDays(weekStart, 6),
    totalOrders: orders.length,
    totalRevenue: Math.round(orders.reduce((s, v) => s + v, 0) * 100) / 100,
    totalReturns: returns,
    totalSessions: sessions,
  };
}

/** Stores weekly metrics history and supports CSV persistence. */
export class KPIDashboard {
  private _weeks: Map<string, WeeklyMetrics> = new Map();

  /** Add or replace a week's metrics (keyed by weekStart). */
  addWeek(metrics: WeeklyMetrics): void {
    this._weeks.set(metrics.weekStart, metrics);
  }

  getWeek(weekStart: string): WeeklyMetrics | undefined {
    return this._weeks.get(weekStart);
  }

  /** Return all weeks sorted chronologically. */
  allWeeks(): WeeklyMetrics[] {
    return [...this._weeks.values()].sort((a, b) =>
      a.weekStart.localeCompare(b.weekStart)
    );
  }

  /** Return the most recently added week, or undefined if empty. */
  latestWeek(): WeeklyMetrics | undefined {
    const weeks = this.allWeeks();
    return weeks.length > 0 ? weeks[weeks.length - 1] : undefined;
  }

  /**
   * Return the last n weekly values for the named computed metric.
   * metric: "aov" | "conversionRate" | "returnRate"
   */
  trend(metric: "aov" | "conversionRate" | "returnRate", n = 4): number[] {
    const fn = metric === "aov" ? aov : metric === "conversionRate" ? conversionRate : returnRate;
    return this.allWeeks().slice(-n).map(fn);
  }

  get size(): number {
    return this._weeks.size;
  }

  // ------------------------------------------------------------------
  // CSV I/O
  // ------------------------------------------------------------------

  /** Write all weekly metrics rows to CSV (computed cols included). */
  saveCSV(path: string): void {
    const rows = this.allWeeks().map((w) => ({
      week_start: w.weekStart,
      week_end: w.weekEnd,
      total_orders: w.totalOrders,
      total_revenue: w.totalRevenue,
      total_returns: w.totalReturns,
      total_sessions: w.totalSessions,
      aov: aov(w),
      conversion_rate: conversionRate(w),
      return_rate: returnRate(w),
    }));
    const output = stringify(rows, { header: true, columns: FIELD_NAMES });
    writeFileSync(path, output, "utf-8");
  }

  /** Load historical weekly metrics from CSV. */
  static loadCSV(path: string): KPIDashboard {
    const dashboard = new KPIDashboard();
    if (!existsSync(path)) return dashboard;
    const content = readFileSync(path, "utf-8");
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
    }) as Record<string, string>[];
    for (const row of records) {
      dashboard.addWeek({
        weekStart: row["week_start"],
        weekEnd: row["week_end"],
        totalOrders: parseInt(row["total_orders"], 10),
        totalRevenue: parseFloat(row["total_revenue"]),
        totalReturns: parseInt(row["total_returns"], 10),
        totalSessions: parseInt(row["total_sessions"], 10),
      });
    }
    return dashboard;
  }

  /** Write a blank KPI CSV template with example rows. */
  static writeTemplate(path: string): void {
    const rows = [
      {
        week_start: "2026-03-02", week_end: "2026-03-08",
        total_orders: 42, total_revenue: 3780.00, total_returns: 2,
        total_sessions: 1400, aov: "", conversion_rate: "", return_rate: "",
      },
      {
        week_start: "2026-03-09", week_end: "2026-03-15",
        total_orders: 55, total_revenue: 5225.00, total_returns: 1,
        total_sessions: 1800, aov: "", conversion_rate: "", return_rate: "",
      },
    ];
    const output = stringify(rows, { header: true, columns: FIELD_NAMES });
    writeFileSync(path, output, "utf-8");
  }
}
