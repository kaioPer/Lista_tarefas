import type { Card, Dependency } from "./domino";
import { blockers } from "./domino";

type Label = { id: string; name: string; color: string };
export function BoardSummary({
  cards,
  deps,
  labels,
  tagged,
}: {
  cards: Card[];
  deps: Dependency[];
  labels: Label[];
  tagged: { card_id: string; label_id: string }[];
}) {
  const active = cards.filter((c) => !c.archived_at);
  const done = active.filter((c) => c.completed_at).length;
  const percent = active.length ? Math.round((done / active.length) * 100) : 0;
  const today = new Date().toLocaleDateString("en-CA");
  const counts = [
    {
      name: "Disponíveis",
      value: active.filter(
        (c) => !c.completed_at && !blockers(c.id, cards, deps).length,
      ).length,
      note: "Prontas para avançar",
      color: "#34d3bf",
    },
    {
      name: "Bloqueadas",
      value: active.filter(
        (c) => !c.completed_at && blockers(c.id, cards, deps).length,
      ).length,
      note: "Aguardando pré-requisitos",
      color: "#fbbf24",
    },
    {
      name: "Atrasadas",
      value: active.filter(
        (c) => !c.completed_at && c.due_date && c.due_date < today,
      ).length,
      note: "Prazo vencido",
      color: "#fb7185",
    },
  ];
  return (
    <section className="summary-grid" aria-label="Resumo das tarefas ativas">
      <div className="metric">
        <h2>Progresso geral</h2>
        <strong>{percent}%</strong>
        <progress
          aria-label="Progresso geral"
          max={active.length || 1}
          value={done}
        />
        <p>
          {done} de {active.length} tarefas concluídas
        </p>
      </div>
      {labels.length
        ? labels.map((label) => {
            const group = active.filter((c) =>
              tagged.some((t) => t.card_id === c.id && t.label_id === label.id),
            );
            const completed = group.filter((c) => c.completed_at).length;
            return (
              <div
                className="metric"
                key={label.id}
                style={{ "--metric-color": label.color } as React.CSSProperties}
              >
                <h2>{label.name}</h2>
                <strong>
                  {group.length
                    ? Math.round((completed / group.length) * 100)
                    : 0}
                  %
                </strong>
                <progress
                  aria-label={"Progresso de " + label.name}
                  max={group.length || 1}
                  value={completed}
                />
                <p>
                  {completed}/{group.length} concluídas
                </p>
              </div>
            );
          })
        : counts.map((item) => (
            <div
              className="metric"
              key={item.name}
              style={{ "--metric-color": item.color } as React.CSSProperties}
            >
              <h2>{item.name}</h2>
              <strong style={{ color: item.color }}>{item.value}</strong>
              <p>{item.note}</p>
            </div>
          ))}
    </section>
  );
}
