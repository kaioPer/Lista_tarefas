import { beforeAll, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
let db: PGlite;
const owner = "00000000-0000-4000-8000-000000000001",
  reader = "00000000-0000-4000-8000-000000000002",
  stranger = "00000000-0000-4000-8000-000000000003";
let board: string, todo: string, doing: string, done: string;
async function user(id: string) {
  await db.exec(
    `reset role; select set_config('request.jwt.claim.sub','${id}',false);set role authenticated;`,
  );
}
async function rpc(
  action: string,
  data: Record<string, unknown> = {},
  b = board,
) {
  return db.query("select public.board_action($1,$2,$3::jsonb) as result", [
    b,
    action,
    JSON.stringify(data),
  ]);
}
async function cards() {
  return (
    await db.query<any>("select * from public.cards where board_id=$1", [board])
  ).rows;
}
async function task(title: string) {
  await rpc("card.create", { title, column_id: todo });
  return (await cards()).find((c) => c.title === title);
}
async function action(
  title: string,
  op: string,
  extra: Record<string, unknown> = {},
) {
  const c = (await cards()).find((c) => c.title === title);
  return rpc(op, { card_id: c.id, version: c.version, ...extra });
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  await db.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/202611260001_initial.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    `insert into auth.users values('${owner}','owner@example.com',now(),'{}'),('${reader}','reader@example.com',now(),'{}'),('${stranger}','stranger@example.com',now(),'{}');`,
  );
  await user(owner);
  board = (await db.query<any>("select public.create_board('Projeto') id"))
    .rows[0].id;
  const cols = (await db.query<any>("select * from public.board_columns")).rows;
  todo = cols.find((c) => c.kind === "todo").id;
  doing = cols.find((c) => c.kind === "in_progress").id;
  done = cols.find((c) => c.kind === "done").id;
}, 30000);
afterAll(async () => {
  await db?.close();
});
it("executa a migração e cria quadro com três colunas e proprietário", async () => {
  expect(
    (await db.query("select * from public.board_columns")).rows,
  ).toHaveLength(3);
  expect(
    (await db.query<any>("select role from public.board_members")).rows[0].role,
  ).toBe("admin");
});
it("rejeita escrita direta e dados de outros quadros", async () => {
  await expect(
    db.query("update public.cards set title='Bypass'"),
  ).rejects.toThrow();
  const b2 = (await db.query<any>("select public.create_board('Outro') id"))
    .rows[0].id;
  await expect(
    rpc("card.create", { title: "Cross", column_id: todo }, b2),
  ).rejects.toThrow("Coluna inválida");
});
it("impede ciclos, bloqueio de execução e libera somente após todos os pré-requisitos", async () => {
  const a = await task("A"),
    b = await task("B"),
    c = await task("C");
  await action("B", "dependency.add", { depends_on_card_id: a.id });
  await action("C", "dependency.add", { depends_on_card_id: a.id });
  await action("C", "dependency.add", { depends_on_card_id: b.id });
  await expect(
    action("A", "dependency.add", { depends_on_card_id: c.id }),
  ).rejects.toThrow("ciclo");
  await expect(
    action("A", "dependency.add", { depends_on_card_id: a.id }),
  ).rejects.toThrow("si mesma");
  await expect(action("C", "card.move", { column_id: doing })).rejects.toThrow(
    "pré-requisitos",
  );
  await action("A", "card.move", { column_id: done });
  const ev = (
    await db.query<any>(
      "select payload from public.activity_events where event_type='card.move' order by created_at desc limit 1",
    )
  ).rows[0];
  expect(ev.payload.unlocked).toEqual([b.id]);
  await expect(action("C", "card.move", { column_id: done })).rejects.toThrow(
    "pré-requisitos",
  );
  await action("B", "card.move", { column_id: done });
  await action("C", "card.move", { column_id: done });
  await expect(action("A", "card.move", { column_id: todo })).rejects.toThrow(
    "Reabra primeiro",
  );
  await action("C", "card.move", { column_id: todo });
  await action("B", "card.move", { column_id: todo });
  await action("A", "card.move", { column_id: todo });
});
it("detecta versão obsoleta e protege arquivamento", async () => {
  const c = (await cards()).find((c) => c.title === "A");
  await action("A", "card.update", { title: "A", description: "Atualizada" });
  await expect(
    rpc("card.update", { card_id: c.id, version: c.version, title: "Perdida" }),
  ).rejects.toThrow("mudou");
  await expect(action("A", "card.archive")).rejects.toThrow("bloqueia");
  await action("A", "card.move", { column_id: done });
  await action("A", "card.archive");
  expect((await cards()).find((c) => c.title === "A").archived_at).toBeTruthy();
  await action("A", "card.restore");
});
it("não permite dependência pendente em tarefa iniciada, duplicatas ou colunas ocupadas", async () => {
  const x = await task("X"),
    y = await task("Y");
  await action("X", "card.move", { column_id: doing });
  await expect(
    action("X", "dependency.add", { depends_on_card_id: y.id }),
  ).rejects.toThrow("A fazer");
  await expect(rpc("column.delete", { column_id: doing })).rejects.toThrow(
    "Transfira",
  );
  await action("X", "card.move", { column_id: todo });
  await action("X", "dependency.add", { depends_on_card_id: y.id });
  await expect(
    action("X", "dependency.add", { depends_on_card_id: y.id }),
  ).rejects.toThrow();
});
it("valida e-mail do convite, uso único, leitor e isolamento RLS", async () => {
  const invite = (
    await rpc("invite.create", { email: "reader@example.com", role: "reader" })
  ).rows as any[];
  const token = invite[0].result.token;
  await user(stranger);
  expect((await db.query("select * from public.boards")).rows).toHaveLength(0);
  expect((await db.query("select * from public.cards")).rows).toHaveLength(0);
  await expect(rpc("board.update", { name: "Invadido" })).rejects.toThrow(
    "Sem acesso",
  );
  await expect(
    db.query("select public.accept_invitation($1)", [token]),
  ).rejects.toThrow("e-mail confirmado");
  await user(reader);
  await db.query("select public.accept_invitation($1)", [token]);
  expect(
    (await db.query("select * from public.cards")).rows.length,
  ).toBeGreaterThan(0);
  await expect(
    rpc("card.create", { title: "Proibido", column_id: todo }),
  ).rejects.toThrow("Permissão");
  await expect(
    db.query("select public.accept_invitation($1)", [token]),
  ).rejects.toThrow("inválido");
  await user(owner);
  await expect(rpc("member.remove", { user_id: owner })).rejects.toThrow(
    "propriedade",
  );
  await rpc("member.remove", { user_id: reader });
  await user(reader);
  expect((await db.query("select * from public.cards")).rows).toHaveLength(0);
  await user(owner);
});
it("restaura pré-requisitos antes dos dependentes e mantém conclusão ao arquivar", async () => {
  await action("X", "card.archive");
  await action("Y", "card.archive");
  await expect(action("X", "card.restore")).rejects.toThrow(
    "Restaure primeiro",
  );
  await action("Y", "card.restore");
  await action("X", "card.restore");
  expect((await cards()).find((c) => c.title === "X").column_id).toBe(todo);
  await expect(action("X", "card.move", { column_id: doing })).rejects.toThrow(
    "pré-requisitos",
  );
  await action("Y", "card.move", { column_id: done });
  await action("Y", "card.archive");
  await action("X", "card.move", { column_id: doing });
});
it("editores podem trabalhar, mas não administrar nem usar dependências de outro quadro", async () => {
  const invitation = (
    await rpc("invite.create", { email: "reader@example.com", role: "editor" })
  ).rows as any[];
  await user(reader);
  await db.query("select public.accept_invitation($1)", [
    invitation[0].result.token,
  ]);
  await rpc("comment.add", {
    card_id: (await cards())[0].id,
    body: "Trabalhando em equipe",
  });
  await expect(
    rpc("invite.create", { email: "third@example.com", role: "admin" }),
  ).rejects.toThrow("administrador");
  await expect(
    rpc("member.role", { user_id: reader, role: "admin" }),
  ).rejects.toThrow("administrador");
  await expect(
    rpc("column.create", { name: "Nova", kind: "todo" }),
  ).rejects.toThrow("administrador");
  await user(owner);
  const b2 = (await db.query<any>("select public.create_board('Isolado') id"))
    .rows[0].id;
  const col2 = (
    await db.query<any>(
      "select id from public.board_columns where board_id=$1 limit 1",
      [b2],
    )
  ).rows[0].id;
  await rpc("card.create", { title: "Outro quadro", column_id: col2 }, b2);
  const c2 = (
    await db.query<any>("select id from public.cards where board_id=$1", [b2])
  ).rows[0].id;
  await expect(
    action("B", "dependency.add", { depends_on_card_id: c2 }),
  ).rejects.toThrow("inválido");
  await expect(
    rpc("member.role", { user_id: owner, role: "reader" }),
  ).rejects.toThrow("propriedade");
});
