import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  KPIDashboard,
  WeeklyMetrics,
  metricsForWeek,
  aov,
  conversionRate,
  returnRate,
  weekSummary,
} from "../src/kpiDashboard";

const MONDAY = "2026-03-09";

function tmpFile(): string {
  return path.join(os.tmpdir(), `kpi-test-${Date.now()}.csv`);
}

function makeMetrics(overrides: Partial<WeeklyMetrics> = {}): WeeklyMetrics {
  return {
    weekStart: MONDAY,
    weekEnd: "2026-03-15",
    totalOrders: 50,
    totalRevenue: 4500.0,
    totalReturns: 2,
    totalSessions: 1000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// aov / conversionRate / returnRate
// ---------------------------------------------------------------------------

describe("aov", () => {
  it("computes correctly", () => {
    expect(aov(makeMetrics({ totalOrders: 50, totalRevenue: 4500 }))).toBeCloseTo(90.0);
  });

  it("returns 0 when no orders", () => {
    expect(aov(makeMetrics({ totalOrders: 0, totalRevenue: 0 }))).toBe(0);
  });
});

describe("conversionRate", () => {
  it("computes correctly", () => {
    expect(conversionRate(makeMetrics({ totalOrders: 50, totalSessions: 1000 }))).toBeCloseTo(5.0);
  });

  it("returns 0 when sessions is 0", () => {
    expect(conversionRate(makeMetrics({ totalSessions: 0 }))).toBe(0);
  });
});

describe("returnRate", () => {
  it("computes correctly", () => {
    expect(returnRate(makeMetrics({ totalOrders: 50, totalReturns: 5 }))).toBeCloseTo(10.0);
  });

  it("returns 0 when no orders", () => {
    expect(returnRate(makeMetrics({ totalOrders: 0, totalReturns: 0 }))).toBe(0);
  });
});

describe("weekSummary", () => {
  it("contains key labels", () => {
    const summary = weekSummary(makeMetrics());
    expect(summary).toContain("Total Orders");
    expect(summary).toContain("AOV");
    expect(summary).toContain("Conversion Rate");
    expect(summary).toContain("Return Rate");
  });
});

// ---------------------------------------------------------------------------
// metricsForWeek
// ---------------------------------------------------------------------------

describe("metricsForWeek", () => {
  it("builds from an order list", () => {
    const m = metricsForWeek("2026-03-09", [100, 200, 150], 1, 500);
    expect(m.totalOrders).toBe(3);
    expect(m.totalRevenue).toBeCloseTo(450);
    expect(m.totalReturns).toBe(1);
    expect(m.totalSessions).toBe(500);
  });

  it("weekEnd is 6 days after weekStart", () => {
    const m = metricsForWeek("2026-03-09", [100]);
    expect(m.weekEnd).toBe("2026-03-15");
  });

  it("handles empty order list", () => {
    const m = metricsForWeek("2026-03-09", []);
    expect(m.totalOrders).toBe(0);
    expect(aov(m)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// KPIDashboard
// ---------------------------------------------------------------------------

describe("KPIDashboard", () => {
  it("addWeek / getWeek", () => {
    const dashboard = new KPIDashboard();
    const m = makeMetrics();
    dashboard.addWeek(m);
    expect(dashboard.getWeek(MONDAY)).toEqual(m);
  });

  it("getWeek returns undefined for missing key", () => {
    expect(new KPIDashboard().getWeek("2000-01-01")).toBeUndefined();
  });

  it("size reflects number of weeks", () => {
    const dashboard = new KPIDashboard();
    expect(dashboard.size).toBe(0);
    dashboard.addWeek(makeMetrics());
    expect(dashboard.size).toBe(1);
  });

  it("allWeeks returns chronological order", () => {
    const dashboard = new KPIDashboard();
    dashboard.addWeek(makeMetrics({ weekStart: "2026-03-09", weekEnd: "2026-03-15" }));
    dashboard.addWeek(makeMetrics({ weekStart: "2026-03-02", weekEnd: "2026-03-08" }));
    const weeks = dashboard.allWeeks();
    expect(weeks[0].weekStart).toBe("2026-03-02");
    expect(weeks[1].weekStart).toBe("2026-03-09");
  });

  it("latestWeek returns the most recent entry", () => {
    const dashboard = new KPIDashboard();
    dashboard.addWeek(makeMetrics({ weekStart: "2026-03-02", weekEnd: "2026-03-08" }));
    dashboard.addWeek(makeMetrics({ weekStart: "2026-03-09", weekEnd: "2026-03-15" }));
    expect(dashboard.latestWeek()!.weekStart).toBe("2026-03-09");
  });

  it("latestWeek returns undefined when empty", () => {
    expect(new KPIDashboard().latestWeek()).toBeUndefined();
  });

  it("trend returns last n aov values in ascending order", () => {
    const dashboard = new KPIDashboard();
    const base = new Date("2026-01-05");
    for (let i = 0; i < 4; i++) {
      const d = new Date(base);
      d.setUTCDate(d.getUTCDate() + i * 7);
      const ws = d.toISOString().slice(0, 10);
      const we = new Date(d);
      we.setUTCDate(we.getUTCDate() + 6);
      dashboard.addWeek({
        weekStart: ws,
        weekEnd: we.toISOString().slice(0, 10),
        totalOrders: 10,
        totalRevenue: 1000 * (i + 1),
        totalReturns: 0,
        totalSessions: 0,
      });
    }
    const trend = dashboard.trend("aov", 4);
    expect(trend).toHaveLength(4);
    // aov increases each week
    for (let i = 1; i < trend.length; i++) {
      expect(trend[i]).toBeGreaterThan(trend[i - 1]);
    }
  });
});

// ---------------------------------------------------------------------------
// KPIDashboard – CSV
// ---------------------------------------------------------------------------

describe("KPIDashboard CSV", () => {
  it("saveCSV / loadCSV round-trip", () => {
    const dashboard = new KPIDashboard();
    dashboard.addWeek(makeMetrics({ weekStart: "2026-03-02", weekEnd: "2026-03-08", totalOrders: 40, totalRevenue: 3600 }));
    dashboard.addWeek(makeMetrics({ weekStart: "2026-03-09", weekEnd: "2026-03-15", totalOrders: 55, totalRevenue: 5225 }));

    const p = tmpFile();
    try {
      dashboard.saveCSV(p);
      const loaded = KPIDashboard.loadCSV(p);
      expect(loaded.size).toBe(2);
      const week = loaded.getWeek("2026-03-09");
      expect(week).toBeDefined();
      expect(week!.totalOrders).toBe(55);
      expect(week!.totalRevenue).toBeCloseTo(5225);
      expect(aov(week!)).toBeCloseTo(95.0);
    } finally {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  });

  it("loadCSV returns empty dashboard for non-existent file", () => {
    expect(KPIDashboard.loadCSV("/tmp/no-such-file-xyz.csv").size).toBe(0);
  });

  it("writeTemplate creates a loadable file", () => {
    const p = tmpFile();
    try {
      KPIDashboard.writeTemplate(p);
      const loaded = KPIDashboard.loadCSV(p);
      expect(loaded.size).toBeGreaterThanOrEqual(1);
    } finally {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  });
});
