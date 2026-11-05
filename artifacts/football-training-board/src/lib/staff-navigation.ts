import {
  LayoutDashboard,
  UsersRound,
  Users,
  CalendarDays,
  BookOpen,
  Trophy,
  BarChart3,
  CalendarCheck,
  Layers,
} from "lucide-react";

/** Navigation mirrors existing role capabilities; selections never grant a capability. */
export function staffNavigation(role: string) {
  const technical = [
    "admin",
    "director",
    "technical_director",
    "coach",
    "fitness_coach",
    "athletic_director",
  ].includes(role);
  const items = [
    { label: "Cruscotto", url: "/dashboard", icon: LayoutDashboard },
  ];
  if (role !== "secretary")
    items.push({ label: "Squadre", url: "/teams", icon: UsersRound });
  items.push({ label: "Giocatori", url: "/players", icon: Users });
  if (technical)
    items.push({
      label:
        role === "technical_director"
          ? "Sedute del mister"
          : "Sedute Allenamento",
      url: "/training",
      icon: CalendarDays,
    });
  if (role === "technical_director")
    items.push({
      label: "Linee guida sedute",
      url: "/training?view=guidelines",
      icon: BookOpen,
    });
  if (technical || role === "presidente")
    items.push({
      label: "Convocazioni",
      url: "/training/convocazioni",
      icon: UsersRound,
    });
  if (technical)
    items.push({ label: "Stazioni", url: "/exercises", icon: BookOpen });
  items.push({
    label: role === "secretary" ? "Programmazione gare" : "Partite",
    url: role === "secretary" ? "/programmazione-gare" : "/partite",
    icon: Trophy,
  });
  if (role !== "secretary") {
    items.push({
      label: "Campionati e classifiche",
      url: "/campionati",
      icon: BarChart3,
    });
    items.push({ label: "Presenze", url: "/attendance", icon: CalendarCheck });
  }
  if (
    [
      "admin",
      "presidente",
      "director",
      "secretary",
      "sporting_director",
      "technical_director",
    ].includes(role)
  )
    items.push({ label: "Stagioni", url: "/seasons", icon: Layers });
  return items;
}
