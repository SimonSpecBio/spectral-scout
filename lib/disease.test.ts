import { describe, expect, it } from "vitest";
import {
  aggregateDiseaseGrid,
  cycleDiseaseClass,
  diseaseCellLabel,
  emptyDiseaseGrid,
  severityFromDiseaseAggregate,
  type DiseaseLeaves,
} from "./disease";

describe("cycleDiseaseClass", () => {
  it("cycles unassessed -> Absent -> Low -> Medium -> High -> unassessed", () => {
    let cell = cycleDiseaseClass(null);
    expect(cell).toBe(0);
    cell = cycleDiseaseClass(cell);
    expect(cell).toBe(1);
    cell = cycleDiseaseClass(cell);
    expect(cell).toBe(2);
    cell = cycleDiseaseClass(cell);
    expect(cell).toBe(3);
    cell = cycleDiseaseClass(cell);
    expect(cell).toBeNull();
  });
});

describe("diseaseCellLabel", () => {
  it("shows literal 'Absent' for class 0, and the class's percentage for a real severity", () => {
    expect(diseaseCellLabel(0)).toBe("Absent");
    expect(diseaseCellLabel(1)).toBe("12.5%");
    expect(diseaseCellLabel(2)).toBe("37.5%");
    expect(diseaseCellLabel(3)).toBe("75%");
  });
});

describe("aggregateDiseaseGrid", () => {
  it("treats an all-unassessed grid as zero assessed, not zero infected out of zero looking clean", () => {
    const agg = aggregateDiseaseGrid(emptyDiseaseGrid());
    expect(agg).toEqual({ leavesAssessed: 0, leavesInfected: 0, incidencePct: 0, meanSeverityPct: 0 });
  });

  it("counts Absent (0) as assessed but not infected", () => {
    const grid: DiseaseLeaves[] = emptyDiseaseGrid();
    grid[0] = [0, 0, 0];
    const agg = aggregateDiseaseGrid(grid);
    expect(agg.leavesAssessed).toBe(3);
    expect(agg.leavesInfected).toBe(0);
    expect(agg.incidencePct).toBe(0);
  });

  it("computes incidence and mean severity from a mixed grid", () => {
    const grid: DiseaseLeaves[] = emptyDiseaseGrid();
    grid[0] = [0, 1, null]; // Absent, Low, unassessed
    grid[1] = [3, null, null]; // High
    const agg = aggregateDiseaseGrid(grid);
    // 3 assessed (0, 1, 3), 2 infected (1, 3), incidence = 2/3 = 67%
    expect(agg.leavesAssessed).toBe(3);
    expect(agg.leavesInfected).toBe(2);
    expect(agg.incidencePct).toBe(67);
    // mean of midpoints 0, 12.5, 75 = 29.166... -> rounds to 29
    expect(agg.meanSeverityPct).toBe(29);
  });
});

describe("severityFromDiseaseAggregate", () => {
  it("maps into the shared low/moderate/high/severe scale by whichever dimension is worse", () => {
    expect(severityFromDiseaseAggregate({ leavesAssessed: 10, leavesInfected: 0, incidencePct: 0, meanSeverityPct: 0 })).toBe("low");
    // Severity crosses (>=50%) while incidence is modest -- still severe.
    expect(severityFromDiseaseAggregate({ leavesAssessed: 10, leavesInfected: 2, incidencePct: 20, meanSeverityPct: 50 })).toBe("severe");
    // Incidence crosses (>=75%) while severity is low -- still severe.
    expect(severityFromDiseaseAggregate({ leavesAssessed: 10, leavesInfected: 8, incidencePct: 80, meanSeverityPct: 5 })).toBe("severe");
  });
});
