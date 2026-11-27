import { describe, it, expect } from "vitest";
import { blockers, impact, recommend, type Card } from "../src/domino";
const card = (id: string, extra: Partial<Card> = {}): Card => ({
  id,
  board_id: "board",
  column_id: "todo",
  title: id,
  description: "",
  due_date: null,
  position: 0,
  completed_at: null,
  archived_at: null,
  created_at: "2026-01-01",
  version: 1,
  ...extra,
});
describe("Efeito Dominó", () => {
  it("não atribui impacto imediato a pré-requisito concluído, arquivado ou bloqueado", () => {
    const deps = [{ card_id: "B", depends_on_card_id: "A" }];
    expect(
      impact("A", [card("A", { completed_at: "2026-01-01" }), card("B")], deps),
    ).toEqual([]);
    expect(
      impact("A", [card("A", { archived_at: "2026-01-01" }), card("B")], deps),
    ).toEqual([]);
    expect(
      impact(
        "A",
        [card("A"), card("B"), card("C")],
        [...deps, { card_id: "A", depends_on_card_id: "C" }],
      ),
    ).toEqual([]);
  });
  it("conta somente tarefas realmente liberadas", () => {
    const cards = ["A", "B", "C", "D"].map((id) => card(id));
    const deps = [
      { card_id: "B", depends_on_card_id: "A" },
      { card_id: "C", depends_on_card_id: "A" },
      { card_id: "C", depends_on_card_id: "D" },
    ];
    expect(impact("A", cards, deps).map((c) => c.id)).toEqual(["B"]);
    expect(blockers("C", cards, deps)).toHaveLength(2);
    expect(recommend(cards, deps)?.card.id).toBe("A");
  });
  it("não confunde impacto imediato com cadeia transitiva", () => {
    const cards = ["A", "B", "C"].map((id) => card(id));
    const deps = [
      { card_id: "B", depends_on_card_id: "A" },
      { card_id: "C", depends_on_card_id: "B" },
    ];
    expect(impact("A", cards, deps).map((c) => c.id)).toEqual(["B"]);
    expect(recommend(cards, deps)?.card.id).toBe("A");
  });
  it("ignora concluídas e arquivadas e desempata por prazo", () => {
    const cards = [
      card("A", { due_date: "2026-12-10" }),
      card("D", { due_date: "2026-12-01" }),
      card("B"),
      card("E"),
      card("C", { archived_at: "2026-01-01" }),
    ];
    const deps = [
      { card_id: "B", depends_on_card_id: "A" },
      { card_id: "C", depends_on_card_id: "A" },
      { card_id: "E", depends_on_card_id: "D" },
    ];
    expect(recommend(cards, deps)?.card.id).toBe("D");
    expect(
      recommend(
        cards.map((c) => ({ ...c, completed_at: "2026-01-01" })),
        deps,
      ),
    ).toBeUndefined();
  });
  it("não recomenda quando o impacto é zero e usa data de criação e ID para desempate", () => {
    expect(recommend([card("A")], [])).toBeUndefined();
    const deps = [
      { card_id: "X", depends_on_card_id: "A" },
      { card_id: "Y", depends_on_card_id: "B" },
    ];
    expect(
      recommend(
        ["B", "A", "X", "Y"].map((id) => card(id)),
        deps,
      )?.card.id,
    ).toBe("A");
  });
});
