import { test, expect } from "@playwright/test";
test("cria quadro e cartão e confirma arquivamento sem prompt/confirm nativos", async ({
  page,
}) => {
  const user = "00000000-0000-4000-8000-000000000001";
  const tables: Record<string, any[]> = {
    boards: [],
    board_columns: [],
    board_members: [],
    cards: [],
    profiles: [{ id: user, display_name: "Teste" }],
  };
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    ({ user }) => {
      window.prompt = () => {
        throw Error("prompt nativo desativado");
      };
      window.confirm = () => {
        throw Error("confirm nativo desativado");
      };
      localStorage.setItem(
        "sb-domino-test-auth-token",
        JSON.stringify({
          access_token: "test-token",
          refresh_token: "test-refresh",
          token_type: "bearer",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          user: {
            id: user,
            email: "teste@example.com",
            aud: "authenticated",
            role: "authenticated",
            app_metadata: {},
            user_metadata: {},
          },
        }),
      );
    },
    { user },
  );
  await page.route("https://domino-test.supabase.co/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let response: unknown = tables[path.split("/").pop()!] ?? [];
    if (path.endsWith("/rpc/create_board")) {
      const p = route.request().postDataJSON();
      tables.boards = [
        {
          id: "board",
          name: p.p_name,
          owner_id: user,
          description: "",
          archived_at: null,
        },
      ];
      tables.board_members = [
        { board_id: "board", user_id: user, role: "admin" },
      ];
      tables.board_columns = [
        {
          id: "todo",
          board_id: "board",
          name: "A fazer",
          kind: "todo",
          position: 0,
        },
      ];
      response = "board";
    }
    if (path.endsWith("/rpc/board_action")) {
      const p = route.request().postDataJSON();
      if (p.p_action === "card.create")
        tables.cards = [
          {
            id: "card",
            board_id: "board",
            column_id: "todo",
            title: p.p_data.title,
            description: "",
            due_date: null,
            position: 0,
            completed_at: null,
            archived_at: null,
            created_at: "2026-01-01",
            version: 1,
          },
        ];
      if (p.p_action === "card.archive")
        tables.cards[0] = {
          ...tables.cards[0],
          archived_at: new Date().toISOString(),
          version: 2,
        };
      response = {};
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Criar meu quadro", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Criar meu quadro", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Nome do novo quadro:" })
    .fill("Teste de diálogos");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Teste de diálogos" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "＋ Adicionar tarefa" }).click();
  await page
    .getByRole("textbox", { name: "Título da tarefa:" })
    .fill("Teste do cartão");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page
    .getByRole("button", { name: "Teste do cartão", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Arquivar tarefa", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Teste do cartão", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});
