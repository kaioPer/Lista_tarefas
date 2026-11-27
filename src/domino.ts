export type Card = {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  description: string;
  due_date: string | null;
  position: number;
  completed_at: string | null;
  archived_at: string | null;
  created_at: string;
  version: number;
};
export type Dependency = { card_id: string; depends_on_card_id: string };
export function blockers(id: string, cards: Card[], deps: Dependency[]) {
  return deps
    .filter((d) => d.card_id === id)
    .map((d) => cards.find((c) => c.id === d.depends_on_card_id))
    .filter((c): c is Card => !!c && !c.completed_at);
}
export function impact(id: string, cards: Card[], deps: Dependency[]) {
  return cards.filter(
    (c) =>
      !c.archived_at &&
      !c.completed_at &&
      deps.some((d) => d.card_id === c.id && d.depends_on_card_id === id) &&
      blockers(c.id, cards, deps).every((b) => b.id === id),
  );
}
export function recommend(cards: Card[], deps: Dependency[]) {
  return cards
    .filter(
      (c) =>
        !c.archived_at &&
        !c.completed_at &&
        !blockers(c.id, cards, deps).length,
    )
    .map((card) => ({ card, releases: impact(card.id, cards, deps) }))
    .filter((x) => x.releases.length)
    .sort(
      (a, b) =>
        b.releases.length - a.releases.length ||
        (a.card.due_date ?? "9999").localeCompare(b.card.due_date ?? "9999") ||
        a.card.created_at.localeCompare(b.card.created_at) ||
        a.card.id.localeCompare(b.card.id),
    )[0];
}
