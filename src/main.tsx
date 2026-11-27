import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Session } from "@supabase/supabase-js";
import { supabase as sb } from "./supabase";
import {
  blockers,
  impact,
  recommend,
  type Card,
  type Dependency,
} from "./domino";
import "./style.css";
import { askText, askConfirm } from "./dialogs";
import { BoardSummary } from "./BoardSummary";

type Board = {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  archived_at: string | null;
};
type Column = { id: string; name: string; kind: string; position: number };
type Member = { user_id: string; role: string };
type Profile = { id: string; display_name: string };
type Label = { id: string; name: string; color: string };
type Comment = {
  id: string;
  card_id: string;
  author_id: string;
  body: string;
  created_at: string;
};
type Activity = {
  id: string;
  actor_id: string;
  event_type: string;
  created_at: string;
  payload: { title?: string; unlocked?: string[] };
};
type Invitation = {
  id: string;
  email: string;
  role: string;
  accepted_at: string | null;
  revoked_at: string | null;
  expires_at: string;
};
type Snapshot = {
  columns: Column[];
  cards: Card[];
  deps: Dependency[];
  members: Member[];
  profiles: Profile[];
  labels: Label[];
  assigned: { card_id: string; user_id: string }[];
  tagged: { card_id: string; label_id: string }[];
  comments: Comment[];
  events: Activity[];
  invitations: Invitation[];
};
const empty: Snapshot = {
  columns: [],
  cards: [],
  deps: [],
  members: [],
  profiles: [],
  labels: [],
  assigned: [],
  tagged: [],
  comments: [],
  events: [],
  invitations: [],
};
const roles = { admin: "Administrador", editor: "Editor", reader: "Leitor" };
const events: Record<string, string> = {
  "card.create": "criou uma tarefa",
  "card.update": "editou uma tarefa",
  "card.move": "moveu uma tarefa",
  "card.archive": "arquivou uma tarefa",
  "card.restore": "restaurou uma tarefa",
  "dependency.add": "adicionou uma dependência",
  "dependency.remove": "removeu uma dependência",
  "comment.add": "comentou",
  "assignee.toggle": "alterou responsáveis",
  "label.toggle": "alterou etiquetas",
  "label.create": "criou uma etiqueta",
  "member.join": "entrou no quadro",
  "board.update": "editou o quadro",
  "board.archive": "arquivou o quadro",
  "board.restore": "restaurou o quadro",
  "board.transfer": "transferiu o quadro",
  "member.role": "alterou uma permissão",
  "member.remove": "removeu um participante",
  "invite.create": "criou um convite",
  "invite.revoke": "revogou um convite",
  "column.create": "criou uma coluna",
  "column.update": "editou uma coluna",
  "column.delete": "excluiu uma coluna",
};
const fmt = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
    new Date(date.length === 10 ? date + "T12:00:00" : date),
  );
function message(e: unknown) {
  return e instanceof Error
    ? e.message
    : typeof e === "object" && e && "message" in e
      ? String(e.message)
      : "Não foi possível concluir a operação.";
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const dialog = ref.current;
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      aria-label={title}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button type="button" onClick={close} aria-label="Fechar">
          ✕
        </button>
      </div>
      {children}
    </dialog>
  );
}
function App() {
  const [session, setSession] = useState<Session | null>(null),
    [authReady, setAuthReady] = useState(false),
    [recovery, setRecovery] = useState(false);
  const [boards, setBoards] = useState<Board[]>([]),
    [boardId, setBoardId] = useState(""),
    [data, setData] = useState<Snapshot>(empty);
  const [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [sync, setSync] = useState("Conectando…");
  const [panel, setPanel] = useState(""),
    [selected, setSelected] = useState(""),
    [query, setQuery] = useState(""),
    [person, setPerson] = useState(""),
    [tag, setTag] = useState(""),
    [due, setDue] = useState(""),
    [archive, setArchive] = useState(false),
    [inviteLink, setInviteLink] = useState("");
  const generation = useRef(0),
    mutation = useRef(false);
  useEffect(() => {
    const token = new URLSearchParams(location.search).get("invite");
    if (token) {
      sessionStorage.setItem("pending-invite", token);
      history.replaceState(null, "", location.pathname + location.hash);
    }
    if (!sb) return;
    if (new URLSearchParams(location.hash.slice(1)).get("type") === "recovery")
      setRecovery(true);
    sb.auth.getSession().then(({ data, error }) => {
      if (error) setError(error.message);
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: subscription } = sb.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setAuthReady(true);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT") {
        setBoards([]);
        setBoardId("");
        setData(empty);
        setSelected("");
        setPanel("");
      }
    });
    return () => subscription.subscription.unsubscribe();
  }, []);
  async function loadBoards() {
    if (!sb) return;
    const { data, error } = await sb
      .from("boards")
      .select("*")
      .order("created_at");
    if (error) throw error;
    setBoards(data ?? []);
  }
  async function loadBoard(id: string) {
    if (!sb || !id) return;
    const ticket = ++generation.current;
    const tables = [
      "board_columns",
      "cards",
      "card_dependencies",
      "board_members",
      "labels",
      "card_assignees",
      "card_labels",
      "comments",
      "activity_events",
      "board_invitations",
    ];
    // Fetch every page: Supabase caps each REST response; truncation would
    // otherwise hide prerequisites and produce an incorrect recommendation.
    const results = await Promise.all(
      tables.map(async (t) => {
        if (t === "activity_events")
          return sb!
            .from(t)
            .select("*")
            .eq("board_id", id)
            .order("created_at", { ascending: false })
            .limit(100);
        const ordering: Record<string, string[]> = {
          board_members: ["user_id"],
          card_dependencies: ["card_id", "depends_on_card_id"],
          card_assignees: ["card_id", "user_id"],
          card_labels: ["card_id", "label_id"],
        };
        const rows: Record<string, unknown>[] = [];
        for (let offset = 0; ; offset += 500) {
          let query = sb!.from(t).select("*").eq("board_id", id);
          for (const key of ordering[t] ?? ["id"]) query = query.order(key);
          const page = await query.range(offset, offset + 499);
          if (page.error) throw page.error;
          rows.push(...page.data);
          if (page.data.length < 500) break;
        }
        return { data: rows, error: null };
      }),
    );
    for (const result of results) if (result.error) throw result.error;
    const members = results[3].data as Member[];
    const profiles = await sb
      .from("profiles")
      .select("id,display_name")
      .in(
        "id",
        members.map((m) => m.user_id),
      );
    if (profiles.error) throw profiles.error;
    if (ticket !== generation.current) return;
    setData({
      columns: (results[0].data as Column[]).sort(
        (a, b) => a.position - b.position || a.id.localeCompare(b.id),
      ),
      cards: results[1].data as Card[],
      deps: results[2].data as Dependency[],
      members,
      profiles: profiles.data,
      labels: results[4].data as Label[],
      assigned: results[5].data as Snapshot["assigned"],
      tagged: results[6].data as Snapshot["tagged"],
      comments: (results[7].data as Comment[]).sort((a, b) =>
        a.created_at.localeCompare(b.created_at),
      ),
      events: results[8].data as Activity[],
      invitations: results[9].data as Invitation[],
    });
  }
  useEffect(() => {
    if (!session) return;
    loadBoards().catch((e) => setError(message(e)));
  }, [session?.user.id]);
  useEffect(() => {
    if (!boardId || !session || !sb) return;
    setLoading(true);
    setData(empty);
    setSelected("");
    setPanel("");
    setInviteLink("");
    let active = true,
      timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      if (!active) return;
      Promise.all([loadBoard(boardId), loadBoards()])
        .catch((e) => {
          if (active) setError(message(e));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    };
    refresh();
    const channel = sb
      .channel("board:" + boardId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "activity_events",
          filter: "board_id=eq." + boardId,
        },
        () => {
          clearTimeout(timer);
          timer = setTimeout(refresh, 150);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "board_members",
          filter: "board_id=eq." + boardId,
        },
        refresh,
      )
      .subscribe((status) => {
        if (active)
          setSync(
            status === "SUBSCRIBED"
              ? "Ao vivo"
              : status === "CHANNEL_ERROR" || status === "TIMED_OUT"
                ? "Reconectando · atualização a cada 20 s"
                : "Conectando…",
          );
        if (status === "SUBSCRIBED") refresh();
      });
    const interval = setInterval(refresh, 20000);
    const focus = () => refresh();
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    return () => {
      active = false;
      generation.current++;
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", focus);
      void sb!.removeChannel(channel);
    };
  }, [boardId, session?.user.id]);
  async function run(
    task: () => Promise<unknown>,
    success = "Alteração salva.",
  ) {
    if (mutation.current) return false;
    mutation.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
      setNotice(success);
      return true;
    } catch (e) {
      setError(message(e));
      return false;
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }
  async function act(action: string, values: Record<string, unknown> = {}) {
    if (!sb) throw Error("Configure o Supabase.");
    const { data: result, error } = await sb.rpc("board_action", {
      p_board: boardId,
      p_action: action,
      p_data: values,
    });
    if (error) throw error;
    await Promise.all([loadBoard(boardId), loadBoards()]);
    return result;
  }
  const board = boards.find((b) => b.id === boardId),
    role = data.members.find((m) => m.user_id === session?.user.id)?.role;
  const canEdit = !!role && role !== "reader" && !board?.archived_at,
    admin = role === "admin",
    card = data.cards.find((c) => c.id === selected);
  const name = (id: string) =>
    data.profiles.find((p) => p.id === id)?.display_name ?? "Participante";
  const rec = recommend(data.cards, data.deps);
  async function newBoard() {
    const value = await askText("Nome do novo quadro:", 100);
    if (!value?.trim()) return;
    await run(async () => {
      const { data, error } = await sb!.rpc("create_board", { p_name: value });
      if (error) throw error;
      await loadBoards();
      setBoardId(data);
    });
  }
  async function move(c: Card, column: string, position?: number) {
    await run(() =>
      act("card.move", {
        card_id: c.id,
        version: c.version,
        column_id: column,
        position,
      }),
    );
  }
  async function accept() {
    await run(async () => {
      const token = sessionStorage.getItem("pending-invite");
      const { data, error } = await sb!.rpc("accept_invitation", {
        p_token: token,
      });
      if (error) throw error;
      sessionStorage.removeItem("pending-invite");
      await loadBoards();
      setBoardId(data);
    }, "Convite aceito.");
  }
  if (!sb)
    return (
      <main className="setup">
        <div className="brand">▰ Minha Lista</div>
        <h1>Seu próximo passo começa aqui.</h1>
        <p>
          Configure a URL e a chave pública do Supabase para conectar seu espaço
          de trabalho.
        </p>
        <p>
          Consulte o guia de configuração no README do repositório. Depois de
          preencher as variáveis do Render, faça um novo deploy.
        </p>
      </main>
    );
  if (!authReady) return <main className="setup">Carregando sessão…</main>;
  return (
    <>
      <header className="topbar">
        <a className="brand" href="/">
          ▰ Minha Lista <small>Efeito Dominó</small>
        </a>
        {session && (
          <div className="row">
            <span>{session.user.email}</span>
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const { error } = await sb!.auth.signOut();
                  if (error) throw error;
                })
              }
            >
              Sair
            </button>
          </div>
        )}
      </header>
      <div className="messages" aria-live="polite">
        {error && (
          <p className="error" role="alert">
            {error} <button onClick={() => setError("")}>Fechar</button>
          </p>
        )}
        {notice && <p className="notice">{notice}</p>}
        {busy && <p>Salvando…</p>}
      </div>
      {!session || recovery ? (
        <Auth
          recovery={recovery}
          done={() => {
            setRecovery(false);
            history.replaceState(null, "", location.pathname);
          }}
          run={run}
        />
      ) : (
        <div className="workspace">
          <aside className="sidebar">
            <div className="row spread">
              <h2>Seus quadros</h2>
              <button
                aria-label="Criar quadro"
                onClick={newBoard}
                disabled={busy}
              >
                ＋
              </button>
            </div>
            {boards.map((b) => (
              <button
                className={"board-link " + (b.id === boardId ? "selected" : "")}
                key={b.id}
                onClick={() => setBoardId(b.id)}
              >
                {b.archived_at ? "▤" : "▦"} {b.name}
                {b.archived_at && <small>Arquivado</small>}
              </button>
            ))}
            {!boards.length && <p>Crie um quadro e convide sua equipe.</p>}
            <div className="sidebar-note">
              Pequenos passos.
              <br />
              Grandes resultados.
            </div>
          </aside>
          <main className="main">
            {sessionStorage.getItem("pending-invite") && (
              <div className="invite-banner">
                Você tem um convite pendente.{" "}
                <button disabled={busy} onClick={accept}>
                  Aceitar convite
                </button>
                <button
                  onClick={() => {
                    sessionStorage.removeItem("pending-invite");
                    setNotice("Convite dispensado.");
                  }}
                >
                  Dispensar
                </button>
              </div>
            )}
            {!board ? (
              <section className="welcome">
                <span className="eyebrow">SEU TRABALHO EM MOVIMENTO</span>
                <h1>
                  Menos bloqueios.
                  <br />
                  Mais entregas.
                </h1>
                <p>
                  Organize tarefas em equipe e descubra o próximo passo que
                  destrava seu projeto.
                </p>
                <button className="primary" onClick={newBoard} disabled={busy}>
                  Criar meu quadro
                </button>
              </section>
            ) : (
              <>
                <div className="board-heading">
                  <div>
                    <span className="eyebrow">
                      ESPAÇO COMPARTILHADO ·{" "}
                      {roles[role as keyof typeof roles] ?? "Carregando"}
                    </span>
                    <h1>{board.name}</h1>
                    <p>
                      {board.description ||
                        "Conecte as tarefas. Destrave o que vem a seguir."}
                    </p>
                  </div>
                  <div className="row">
                    <button onClick={() => setPanel("history")}>
                      Atividade
                    </button>
                    <button onClick={() => setPanel("members")}>
                      Participantes · {data.members.length}
                    </button>
                    {admin && (
                      <button onClick={() => setPanel("settings")}>
                        Configurações
                      </button>
                    )}
                  </div>
                </div>
                {board.archived_at && (
                  <p className="invite-banner">
                    Quadro arquivado.{" "}
                    {admin && (
                      <button
                        disabled={busy}
                        onClick={() => run(() => act("board.restore"))}
                      >
                        Restaurar quadro
                      </button>
                    )}
                  </p>
                )}
                {!loading && (
                  <BoardSummary
                    cards={data.cards}
                    deps={data.deps}
                    labels={data.labels}
                    tagged={data.tagged}
                  />
                )}
                <section className="domino-banner">
                  <div className="domino-icon">
                    ▰<br /> ▰
                  </div>
                  <div>
                    <span className="eyebrow">EFEITO DOMINÓ</span>
                    {rec ? (
                      <>
                        <h2>{rec.card.title}</h2>
                        <p>
                          Concluir esta tarefa libera{" "}
                          <strong>
                            {rec.releases.length}{" "}
                            {rec.releases.length === 1 ? "tarefa" : "tarefas"}
                          </strong>{" "}
                          imediatamente.
                        </p>
                      </>
                    ) : (
                      <>
                        <h2>Cada passo conta.</h2>
                        <p>
                          Nenhuma tarefa destrava outras neste momento. Conecte
                          os pré-requisitos para descobrir o próximo passo.
                        </p>
                      </>
                    )}
                  </div>
                  {rec && (
                    <button onClick={() => setSelected(rec.card.id)}>
                      Ver próximo passo →
                    </button>
                  )}
                </section>
                <nav
                  className="category-tabs"
                  aria-label="Filtrar por categoria"
                >
                  <button
                    type="button"
                    className={!tag ? "active" : ""}
                    aria-pressed={!tag}
                    onClick={() => setTag("")}
                  >
                    Todas
                  </button>
                  {data.labels.map((label) => (
                    <button
                      key={label.id}
                      type="button"
                      className={tag === label.id ? "active" : ""}
                      aria-pressed={tag === label.id}
                      onClick={() => setTag(label.id)}
                    >
                      {label.name}
                    </button>
                  ))}
                  <span>
                    Resumo das tarefas ativas · filtros aplicados aos cartões
                  </span>
                </nav>
                <div className="filters">
                  <input
                    aria-label="Pesquisar tarefas"
                    placeholder="⌕  Buscar tarefas…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <select
                    aria-label="Filtrar responsável"
                    value={person}
                    onChange={(e) => setPerson(e.target.value)}
                  >
                    <option value="">Todos os responsáveis</option>
                    {data.members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {name(m.user_id)}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filtrar etiqueta"
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                  >
                    <option value="">Todas as etiquetas</option>
                    {data.labels.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filtrar prazo"
                    value={due}
                    onChange={(e) => setDue(e.target.value)}
                  >
                    <option value="">Todos os prazos</option>
                    <option value="late">Atrasadas</option>
                    <option value="dated">Com prazo</option>
                    <option value="none">Sem prazo</option>
                  </select>
                  <label className="row">
                    <input
                      type="checkbox"
                      checked={archive}
                      onChange={(e) => setArchive(e.target.checked)}
                    />
                    Arquivadas
                  </label>
                  <span className="sync">● {sync}</span>
                </div>
                {loading ? (
                  <p>Carregando quadro…</p>
                ) : (
                  <div className="kanban">
                    {data.columns.map((col) => {
                      const cards = data.cards
                        .filter(
                          (c) =>
                            c.column_id === col.id &&
                            !!c.archived_at === archive &&
                            (!query ||
                              (c.title + " " + c.description)
                                .toLocaleLowerCase()
                                .includes(query.toLocaleLowerCase())) &&
                            (!person ||
                              data.assigned.some(
                                (a) =>
                                  a.card_id === c.id && a.user_id === person,
                              )) &&
                            (!tag ||
                              data.tagged.some(
                                (a) => a.card_id === c.id && a.label_id === tag,
                              )) &&
                            (!due ||
                              (due === "none"
                                ? !c.due_date
                                : due === "dated"
                                  ? !!c.due_date
                                  : !!c.due_date &&
                                    !c.completed_at &&
                                    c.due_date <
                                      new Date().toLocaleDateString("en-CA"))),
                        )
                        .sort(
                          (a, b) =>
                            a.position - b.position || a.id.localeCompare(b.id),
                        );
                      return (
                        <section
                          className="column"
                          key={col.id}
                          onDragOver={(e) => {
                            if (canEdit) e.preventDefault();
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            const c = data.cards.find(
                              (c) =>
                                c.id === e.dataTransfer.getData("text/plain"),
                            );
                            if (c && canEdit && !busy) void move(c, col.id);
                          }}
                        >
                          <div className="row spread column-head">
                            <h2>
                              <i className={col.kind} />
                              {col.name} <small>{cards.length}</small>
                            </h2>
                            {admin && !board.archived_at && (
                              <button
                                aria-label={"Editar coluna " + col.name}
                                onClick={() => setPanel("column:" + col.id)}
                              >
                                ⋯
                              </button>
                            )}
                          </div>
                          {cards.map((c) => {
                            const blocked = blockers(
                                c.id,
                                data.cards,
                                data.deps,
                              ),
                              releases = impact(c.id, data.cards, data.deps);
                            return (
                              <article
                                key={c.id}
                                style={
                                  {
                                    "--card-accent":
                                      data.labels.find((label) =>
                                        data.tagged.some(
                                          (t) =>
                                            t.card_id === c.id &&
                                            t.label_id === label.id,
                                        ),
                                      )?.color ??
                                      (c.completed_at
                                        ? "#4ade80"
                                        : blocked.length
                                          ? "#fbbf24"
                                          : "#60a5fa"),
                                  } as React.CSSProperties
                                }
                                className={
                                  "card " +
                                  (blocked.length && !c.completed_at
                                    ? "blocked"
                                    : "")
                                }
                                draggable={canEdit && !archive && !busy}
                                onDragStart={(e) =>
                                  e.dataTransfer.setData("text/plain", c.id)
                                }
                              >
                                <div className="tags">
                                  {data.tagged
                                    .filter((t) => t.card_id === c.id)
                                    .map((t) => {
                                      const l = data.labels.find(
                                        (l) => l.id === t.label_id,
                                      );
                                      return (
                                        l && (
                                          <span
                                            key={l.id}
                                            style={{
                                              borderColor: l.color,
                                              color: l.color,
                                            }}
                                          >
                                            {l.name}
                                          </span>
                                        )
                                      );
                                    })}
                                </div>
                                <button
                                  className="card-title"
                                  onClick={() => setSelected(c.id)}
                                >
                                  {c.title}
                                </button>
                                {c.description && (
                                  <p className="card-description">
                                    {c.description}
                                  </p>
                                )}
                                {!c.completed_at && (
                                  <small
                                    className={
                                      blocked.length
                                        ? "blocked-text"
                                        : "impact-text"
                                    }
                                  >
                                    {blocked.length
                                      ? `⊘ Bloqueada por ${blocked.length}`
                                      : releases.length
                                        ? `↗ Libera ${releases.length} ${releases.length === 1 ? "tarefa" : "tarefas"}`
                                        : "○ Disponível"}
                                  </small>
                                )}
                                {c.completed_at && (
                                  <small className="impact-text">
                                    ✓ Concluída
                                  </small>
                                )}
                                <div className="card-meta">
                                  {c.due_date && (
                                    <span>◷ {fmt(c.due_date)}</span>
                                  )}
                                  <span>
                                    {data.assigned
                                      .filter((a) => a.card_id === c.id)
                                      .map((a) => name(a.user_id))
                                      .join(", ")}
                                  </span>
                                </div>
                                {canEdit && !archive && (
                                  <select
                                    aria-label={"Mover " + c.title}
                                    value={c.column_id}
                                    disabled={busy}
                                    onChange={(e) => move(c, e.target.value)}
                                  >
                                    {data.columns.map((x) => (
                                      <option key={x.id} value={x.id}>
                                        {x.name}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </article>
                            );
                          })}
                          {!cards.length && (
                            <p className="empty-column">
                              {archive
                                ? "Nenhuma tarefa arquivada"
                                : "Espaço para o próximo passo"}
                            </p>
                          )}
                          {canEdit && !archive && (
                            <button
                              className="add-card"
                              disabled={busy}
                              onClick={async () => {
                                const title =
                                  await askText("Título da tarefa:");
                                if (title?.trim())
                                  void run(() =>
                                    act("card.create", {
                                      column_id: col.id,
                                      title,
                                    }),
                                  );
                              }}
                            >
                              ＋ Adicionar tarefa
                            </button>
                          )}
                        </section>
                      );
                    })}
                    {admin && !board.archived_at && (
                      <button
                        className="add-column"
                        onClick={() => setPanel("column:new")}
                      >
                        ＋ Nova coluna
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      )}
      {session && card && board && (
        <CardModal
          key={card.id}
          card={card}
          data={data}
          canEdit={canEdit}
          busy={busy}
          close={() => setSelected("")}
          run={run}
          act={act}
          name={name}
          select={setSelected}
        />
      )}
      {session && panel === "history" && (
        <Modal title="Atividade do quadro" close={() => setPanel("")}>
          <div className="activity">
            {data.events.map((e) => (
              <p key={e.id}>
                <strong>{name(e.actor_id)}</strong>{" "}
                {events[e.event_type] ?? e.event_type}
                {e.payload.title && <>: {e.payload.title}</>}
                {!!e.payload.unlocked?.length && (
                  <span className="impact-text">
                    {" "}
                    · liberou {e.payload.unlocked.length} tarefa(s)
                  </span>
                )}
                <small>{new Date(e.created_at).toLocaleString("pt-BR")}</small>
              </p>
            ))}
            {!data.events.length && <p>Nenhuma atividade ainda.</p>}
          </div>
        </Modal>
      )}
      {session && panel === "members" && board && (
        <Modal title="Participantes e convites" close={() => setPanel("")}>
          <fieldset disabled={busy}>
            <div className="member-list">
              {data.members.map((m) => (
                <div className="row spread" key={m.user_id}>
                  <span>
                    {name(m.user_id)}{" "}
                    {m.user_id === board.owner_id && "· Proprietário"}
                  </span>
                  {admin && m.user_id !== board.owner_id ? (
                    <div className="row">
                      <select
                        aria-label={"Permissão de " + name(m.user_id)}
                        value={m.role}
                        onChange={(e) =>
                          run(() =>
                            act("member.role", {
                              user_id: m.user_id,
                              role: e.target.value,
                            }),
                          )
                        }
                      >
                        {Object.entries(roles).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={async () => {
                          if (await askConfirm("Remover participante?"))
                            void run(() =>
                              act("member.remove", { user_id: m.user_id }),
                            );
                        }}
                      >
                        Remover
                      </button>
                      {board.owner_id === session.user.id && (
                        <button
                          onClick={async () => {
                            if (
                              await askConfirm(
                                "Transferir a propriedade para esta pessoa?",
                              )
                            )
                              void run(() =>
                                act("board.transfer", { user_id: m.user_id }),
                              );
                          }}
                        >
                          Transferir
                        </button>
                      )}
                    </div>
                  ) : (
                    <small>{roles[m.role as keyof typeof roles]}</small>
                  )}
                </div>
              ))}
            </div>
            {admin && !board.archived_at && (
              <>
                <h3>Convidar por e-mail</h3>
                <p>
                  Gere um link e envie à pessoa. Ela deverá entrar com o mesmo
                  e-mail confirmado.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void run(async () => {
                      const r = await act(
                        "invite.create",
                        Object.fromEntries(f),
                      );
                      setInviteLink(location.origin + "/?invite=" + r.token);
                    }, "Convite criado. Copie o link abaixo.");
                  }}
                >
                  <label>
                    E-mail
                    <input required type="email" name="email" />
                  </label>
                  <label>
                    Permissão
                    <select name="role" defaultValue="editor">
                      {Object.entries(roles).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="primary">Gerar convite</button>
                </form>
                {inviteLink && (
                  <label>
                    Link de convite
                    <input
                      readOnly
                      value={inviteLink}
                      onFocus={(e) => e.target.select()}
                    />
                  </label>
                )}
                <h3>Convites</h3>
                {data.invitations
                  .filter(
                    (i) =>
                      !i.accepted_at &&
                      !i.revoked_at &&
                      new Date(i.expires_at) > new Date(),
                  )
                  .map((i) => (
                    <p key={i.id}>
                      {i.email} · {roles[i.role as keyof typeof roles]}{" "}
                      <button
                        onClick={() =>
                          run(() =>
                            act("invite.revoke", { invitation_id: i.id }),
                          )
                        }
                      >
                        Revogar
                      </button>
                    </p>
                  ))}
              </>
            )}
          </fieldset>
        </Modal>
      )}
      {session && panel === "settings" && board && (
        <Modal title="Configurações do quadro" close={() => setPanel("")}>
          <fieldset disabled={busy || !!board.archived_at}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(() =>
                  act(
                    "board.update",
                    Object.fromEntries(new FormData(e.currentTarget)),
                  ),
                );
              }}
            >
              <label>
                Nome
                <input
                  name="name"
                  defaultValue={board.name}
                  required
                  maxLength={100}
                />
              </label>
              <label>
                Descrição
                <textarea name="description" defaultValue={board.description} />
              </label>
              <button className="primary">Salvar quadro</button>
            </form>
            <button
              className="danger"
              onClick={async () => {
                if (
                  await askConfirm(
                    "Arquivar o quadro para todos os participantes?",
                  )
                )
                  void run(() => act("board.archive"));
              }}
            >
              Arquivar quadro
            </button>
          </fieldset>
        </Modal>
      )}
      {session && panel.startsWith("column:") && (
        <ColumnModal
          column={data.columns.find((c) => c.id === panel.slice(7))}
          close={() => setPanel("")}
          busy={busy}
          run={run}
          act={act}
        />
      )}
    </>
  );
}

type Run = (task: () => Promise<unknown>, success?: string) => Promise<boolean>;
type Act = (action: string, values?: Record<string, unknown>) => Promise<any>;
function Auth({
  recovery,
  done,
  run,
}: {
  recovery: boolean;
  done: () => void;
  run: Run;
}) {
  const [mode, setMode] = useState("login"),
    [pending, setPending] = useState(false);
  return (
    <main className="auth-layout">
      <section>
        <span className="eyebrow">TRABALHE EM EQUIPE</span>
        <h1>
          Uma tarefa concluída.
          <br />
          Novos caminhos abertos.
        </h1>
        <p>Seu quadro colaborativo com o Efeito Dominó.</p>
        <div className="sample-domino">
          <span>Autenticação ✓</span>
          <b>→</b>
          <span>Testes liberados ↗</span>
        </div>
      </section>
      <section className="auth-card">
        <h2>
          {recovery
            ? "Definir nova senha"
            : mode === "signup"
              ? "Criar sua conta"
              : mode === "reset"
                ? "Recuperar acesso"
                : "Bem-vindo de volta"}
        </h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            const f = new FormData(e.currentTarget);
            await run(
              async () => {
                const email = String(f.get("email") ?? ""),
                  password = String(f.get("password") ?? "");
                const result = recovery
                  ? await sb!.auth.updateUser({ password })
                  : mode === "signup"
                    ? await sb!.auth.signUp({
                        email,
                        password,
                        options: {
                          data: { display_name: f.get("name") },
                          emailRedirectTo: location.origin + "/",
                        },
                      })
                    : mode === "reset"
                      ? await sb!.auth.resetPasswordForEmail(email, {
                          redirectTo: location.origin + "/",
                        })
                      : await sb!.auth.signInWithPassword({ email, password });
                if (result.error) throw result.error;
                if (recovery) done();
              },
              recovery
                ? "Senha atualizada."
                : mode === "signup"
                  ? "Confira seu e-mail para confirmar o cadastro."
                  : mode === "reset"
                    ? "Se houver uma conta, você receberá as instruções por e-mail."
                    : "Você entrou.",
            );
            setPending(false);
          }}
        >
          <fieldset disabled={pending}>
            {mode === "signup" && !recovery && (
              <label>
                Seu nome
                <input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={80}
                />
              </label>
            )}
            {!recovery && (
              <label>
                E-mail
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </label>
            )}
            {(mode !== "reset" || recovery) && (
              <label>
                Senha
                <input
                  name="password"
                  type="password"
                  autoComplete={
                    mode === "login" && !recovery
                      ? "current-password"
                      : "new-password"
                  }
                  minLength={8}
                  required
                />
              </label>
            )}
            <button className="primary">
              {pending
                ? "Aguarde…"
                : recovery
                  ? "Salvar nova senha"
                  : mode === "signup"
                    ? "Criar conta"
                    : mode === "reset"
                      ? "Enviar instruções"
                      : "Entrar"}
            </button>
          </fieldset>
        </form>
        {!recovery && (
          <div className="auth-links">
            <button
              onClick={() => setMode(mode === "signup" ? "login" : "signup")}
            >
              {mode === "signup" ? "Já tenho conta" : "Criar uma conta"}
            </button>
            <button
              onClick={() => setMode(mode === "reset" ? "login" : "reset")}
            >
              {mode === "reset" ? "Voltar para entrar" : "Esqueci minha senha"}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

function CardModal({
  card: c,
  data,
  canEdit,
  busy,
  close,
  run,
  act,
  name,
  select,
}: {
  card: Card;
  data: Snapshot;
  canEdit: boolean;
  busy: boolean;
  close: () => void;
  run: Run;
  act: Act;
  name: (id: string) => string;
  select: (id: string) => void;
}) {
  const [draft, setDraft] = useState({
    title: c.title,
    description: c.description,
    due_date: c.due_date ?? "",
    version: c.version,
  });
  const blocked = blockers(c.id, data.cards, data.deps),
    releases = impact(c.id, data.cards, data.deps),
    deps = data.deps.filter((d) => d.card_id === c.id);
  const op = (action: string, values: Record<string, unknown> = {}) =>
    run(() => act(action, { card_id: c.id, version: c.version, ...values }));
  return (
    <Modal title="Detalhes da tarefa" close={close}>
      <fieldset disabled={busy}>
        <div className="detail-status">
          {c.completed_at
            ? "✓ Concluída"
            : blocked.length
              ? `⊘ Bloqueada por ${blocked.length} tarefa(s)`
              : "○ Disponível"}{" "}
          · Libera {releases.length} tarefa(s)
        </div>
        {draft.version !== c.version && (
          <p className="invite-banner">
            Este cartão foi atualizado.{" "}
            <button
              onClick={() =>
                setDraft({
                  title: c.title,
                  description: c.description,
                  due_date: c.due_date ?? "",
                  version: c.version,
                })
              }
            >
              Carregar versão atual
            </button>
          </p>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await run(() => act("card.update", { card_id: c.id, ...draft }))
            )
              close();
          }}
        >
          <fieldset disabled={!canEdit || !!c.archived_at}>
            <label>
              Título
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                required
                maxLength={160}
              />
            </label>
            <label>
              Descrição
              <textarea
                rows={4}
                maxLength={10000}
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </label>
            <label>
              Prazo
              <input
                type="date"
                value={draft.due_date}
                onChange={(e) =>
                  setDraft({ ...draft, due_date: e.target.value })
                }
              />
            </label>
            <button className="primary">Salvar detalhes</button>
          </fieldset>
        </form>
        {canEdit && !c.archived_at && (
          <div className="row wrap">
            <label>
              Mover para
              <select
                value={c.column_id}
                onChange={(e) => op("card.move", { column_id: e.target.value })}
              >
                {data.columns.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() =>
                op("card.move", {
                  column_id: c.column_id,
                  position:
                    Math.min(
                      ...data.cards
                        .filter((x) => x.column_id === c.column_id)
                        .map((x) => x.position),
                    ) - 1,
                })
              }
            >
              Mover para o topo
            </button>
            <button
              onClick={() =>
                op("card.move", {
                  column_id: c.column_id,
                  position:
                    Math.max(
                      ...data.cards
                        .filter((x) => x.column_id === c.column_id)
                        .map((x) => x.position),
                    ) + 1,
                })
              }
            >
              Mover para o fim
            </button>
          </div>
        )}
        <h3>Depende de</h3>
        {!deps.length && <p>Nenhum pré-requisito.</p>}
        {deps.map((d) => {
          const p = data.cards.find((x) => x.id === d.depends_on_card_id);
          return (
            <div key={d.depends_on_card_id} className="row spread">
              <button onClick={() => select(d.depends_on_card_id)}>
                {p?.completed_at ? "✓" : "⊘"} {p?.title ?? "Tarefa"}
              </button>
              {canEdit && !c.archived_at && (
                <button
                  onClick={() =>
                    op("dependency.remove", {
                      depends_on_card_id: d.depends_on_card_id,
                    })
                  }
                >
                  Remover vínculo
                </button>
              )}
            </div>
          );
        })}
        {canEdit && !c.archived_at && (
          <select
            aria-label="Adicionar pré-requisito"
            value=""
            onChange={(e) => {
              if (e.target.value)
                void op("dependency.add", {
                  depends_on_card_id: e.target.value,
                });
            }}
          >
            <option value="">＋ Adicionar pré-requisito</option>
            {data.cards
              .filter(
                (x) =>
                  x.id !== c.id &&
                  !x.archived_at &&
                  !deps.some((d) => d.depends_on_card_id === x.id),
              )
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title}
                </option>
              ))}
          </select>
        )}
        <h3>Desbloqueia</h3>
        {data.deps
          .filter((d) => d.depends_on_card_id === c.id)
          .map((d) => {
            const p = data.cards.find((x) => x.id === d.card_id);
            return (
              <p key={d.card_id}>
                <button onClick={() => select(d.card_id)}>{p?.title}</button>
                {releases.some((x) => x.id === d.card_id)
                  ? " · Liberação imediata"
                  : " · Depende também do estado dos outros pré-requisitos"}
              </p>
            );
          })}
        <h3>Responsáveis</h3>
        <div className="row wrap">
          {data.members.map((m) => (
            <label className="row" key={m.user_id}>
              <input
                type="checkbox"
                disabled={!canEdit || !!c.archived_at}
                checked={data.assigned.some(
                  (a) => a.card_id === c.id && a.user_id === m.user_id,
                )}
                onChange={() => op("assignee.toggle", { user_id: m.user_id })}
              />
              {name(m.user_id)}
            </label>
          ))}
        </div>
        <h3>Etiquetas</h3>
        <div className="row wrap">
          {data.labels.map((l) => (
            <label className="row" key={l.id} style={{ color: l.color }}>
              <input
                type="checkbox"
                disabled={!canEdit || !!c.archived_at}
                checked={data.tagged.some(
                  (t) => t.card_id === c.id && t.label_id === l.id,
                )}
                onChange={() => op("label.toggle", { label_id: l.id })}
              />
              {l.name}
            </label>
          ))}
          {canEdit && !c.archived_at && (
            <button
              onClick={async () => {
                const name = await askText("Nome da etiqueta:", 40);
                if (name?.trim())
                  void run(() =>
                    act("label.create", { name, color: "#6355dc" }),
                  );
              }}
            >
              ＋ Criar etiqueta
            </button>
          )}
        </div>
        <h3>Comentários</h3>
        {data.comments
          .filter((x) => x.card_id === c.id)
          .map((x) => (
            <div className="comment" key={x.id}>
              <strong>{name(x.author_id)}</strong>
              <small> · {fmt(x.created_at)}</small>
              <p>{x.body}</p>
            </div>
          ))}
        {canEdit && !c.archived_at && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const body = new FormData(form).get("body");
              if (await op("comment.add", { body })) form.reset();
            }}
          >
            <label>
              Novo comentário
              <textarea name="body" required maxLength={5000} />
            </label>
            <button>Comentar</button>
          </form>
        )}
        {canEdit && (
          <button
            className="danger"
            onClick={async () => {
              if (c.archived_at) {
                if (await op("card.restore")) close();
              } else if (
                await askConfirm(
                  "Arquivar esta tarefa? Você poderá restaurá-la depois.",
                )
              ) {
                if (await op("card.archive")) close();
              }
            }}
          >
            {c.archived_at ? "Restaurar tarefa" : "Arquivar tarefa"}
          </button>
        )}
      </fieldset>
    </Modal>
  );
}
function ColumnModal({
  column,
  close,
  busy,
  run,
  act,
}: {
  column?: Column;
  close: () => void;
  busy: boolean;
  run: Run;
  act: Act;
}) {
  return (
    <Modal title={column ? "Editar coluna" : "Nova coluna"} close={close}>
      <fieldset disabled={busy}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await run(() =>
                act(column ? "column.update" : "column.create", {
                  ...Object.fromEntries(new FormData(e.currentTarget)),
                  column_id: column?.id,
                }),
              )
            )
              close();
          }}
        >
          <label>
            Nome
            <input
              name="name"
              defaultValue={column?.name}
              maxLength={80}
              required
            />
          </label>
          <label>
            Tipo
            <select name="kind" defaultValue={column?.kind ?? "todo"}>
              <option value="todo">A fazer</option>
              <option value="in_progress">Em andamento</option>
              <option value="done">Concluído</option>
            </select>
          </label>
          <label>
            Posição
            <input
              type="number"
              step="any"
              name="position"
              defaultValue={column?.position ?? 0}
              required
            />
          </label>
          <p>
            O tipo define a conclusão e as regras de bloqueio, independentemente
            do nome.
          </p>
          <button className="primary">Salvar coluna</button>
        </form>
        {column && (
          <button
            className="danger"
            onClick={async () => {
              if (
                (await askConfirm("Excluir esta coluna vazia?")) &&
                (await run(() =>
                  act("column.delete", { column_id: column.id }),
                ))
              )
                close();
            }}
          >
            Excluir coluna
          </button>
        )}
      </fieldset>
    </Modal>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
