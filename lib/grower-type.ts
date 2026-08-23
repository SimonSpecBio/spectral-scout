export type GrowerType = "home_single_tent" | "home_multi_tent" | "home_room" | "commercial";

export const GROWER_TYPE_LABEL: Record<GrowerType, string> = {
  home_single_tent: "Single tent",
  home_multi_tent: "Multiple tents",
  home_room: "Single room, no tents",
  commercial: "Commercial / multi-bay operation",
};

// Null (not yet set) is treated as commercial everywhere -- existing orgs
// and growers who skip the question see no behavior change.
export function isHomeGrower(growerType: GrowerType | null | undefined): boolean {
  return growerType === "home_single_tent" || growerType === "home_multi_tent" || growerType === "home_room";
}
