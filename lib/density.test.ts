import { describe, expect, it } from "vitest";
import { aggregateLeafGrid, emptyLeafGrid, estDensityFromPct, type PlantLeaves } from "./density";

describe("estDensityFromPct", () => {
  it("bands None/Light/Medium/Heavy at the documented boundaries", () => {
    expect(estDensityFromPct(0)).toBe("None");
    expect(estDensityFromPct(1)).toBe("Light");
    expect(estDensityFromPct(32)).toBe("Light");
    expect(estDensityFromPct(33)).toBe("Medium");
    expect(estDensityFromPct(49)).toBe("Medium");
    expect(estDensityFromPct(50)).toBe("Heavy");
  });
});

describe("aggregateLeafGrid", () => {
  it("an all-unchecked grid has zero checked, not zero infested out of zero looking clean", () => {
    const agg = aggregateLeafGrid(emptyLeafGrid());
    expect(agg.leavesChecked).toBe(0);
    expect(agg.infestedPct).toBe(0);
    expect(agg.estDensity).toBe("None");
  });

  it("counts 'absent' as checked but not infested", () => {
    const grid: PlantLeaves[] = emptyLeafGrid();
    grid[0] = ["absent", "absent", "absent"];
    const agg = aggregateLeafGrid(grid);
    expect(agg.leavesChecked).toBe(3);
    expect(agg.leavesInfested).toBe(0);
  });

  it("splits infested leaves by severity and computes infestedPct only over checked leaves", () => {
    const grid: PlantLeaves[] = emptyLeafGrid();
    grid[0] = ["low", "medium", "high"];
    grid[1] = ["unchecked", "unchecked", "absent"];
    const agg = aggregateLeafGrid(grid);
    expect(agg.leavesChecked).toBe(4); // 3 + 1 absent, 2 unchecked excluded
    expect(agg.leavesInfested).toBe(3);
    expect(agg.sevLow).toBe(1);
    expect(agg.sevMedium).toBe(1);
    expect(agg.sevHigh).toBe(1);
    expect(agg.infestedPct).toBe(75); // 3/4
    expect(agg.estDensity).toBe("Heavy");
  });
});
