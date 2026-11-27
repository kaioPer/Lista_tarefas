import { test, expect } from "@playwright/test";
const user = "00000000-0000-4000-8000-000000000001",
  board = "board",
  col = "todo";
test("cadastro e recuperação apresentam os formulários corretos", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Bem-vindo de volta" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Criar uma conta" }).click();
  await expect(page.getByLabel("Seu nome")).toBeVisible();
  await page.getByRole("button", { name: "Esqueci minha senha" }).click();
  await expect(
    page.getByRole("heading", { name: "Recuperar acesso" }),
  ).toBeVisible();
  await expect(page.getByLabel("Senha", { exact: true })).toHaveCount(0);
});
test("quadro mostra impacto real e leitor não recebe controles de edição", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const base = {
    board_id: board,
    column_id: col,
    description: "",
    due_date: null,
    position: 0,
    completed_at: null,
    archived_at: null,
    created_at: "2026-01-01",
    version: 1,
  };
  const tables: Record<string, unknown[]> = {
    boards: [
      {
        id: board,
        name: "Projeto de apresentação",
        owner_id: "outro",
        description: "Nossa primeira entrega",
        archived_at: null,
      },
    ],
    board_columns: [
      { id: col, name: "A fazer", kind: "todo", position: 0 },
      { id: "doing", name: "Em andamento", kind: "in_progress", position: 1 },
      { id: "review", name: "Em revisão", kind: "in_progress", position: 2 },
      { id: "done", name: "Concluído", kind: "done", position: 3 },
    ],
    cards: [
      { ...base, id: "A", title: "Autenticação" },
      { ...base, id: "B", title: "Testar cadastro" },
      { ...base, id: "C", title: "Publicar" },
      { ...base, id: "D", title: "Revisar configuração", column_id: "review" },
    ],
    card_dependencies: [
      { board_id: board, card_id: "B", depends_on_card_id: "A" },
      { board_id: board, card_id: "C", depends_on_card_id: "A" },
      { board_id: board, card_id: "C", depends_on_card_id: "D" },
    ],
    board_members: [{ board_id: board, user_id: user, role: "reader" }],
    profiles: [{ id: user, display_name: "Pessoa de teste" }],
    labels: [
      { id: "slide", name: "Slide", color: "#a78bfa" },
      { id: "gravacao", name: "Gravação", color: "#fbbf24" },
      { id: "esp", name: "ESP32", color: "#2dd4bf" },
      { id: "dash", name: "Dashboard", color: "#60a5fa" },
    ],
    card_labels: [
      { board_id: board, card_id: "A", label_id: "esp" },
      { board_id: board, card_id: "B", label_id: "slide" },
      { board_id: board, card_id: "C", label_id: "dash" },
      { board_id: board, card_id: "D", label_id: "gravacao" },
    ],
  };
  await page.route("https://domino-test.supabase.co/**", async (route) => {
    const u = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(tables[u.pathname.split("/").pop()!] ?? []),
    });
  });
  await page.addInitScript(
    ({ id }) => {
      localStorage.setItem(
        "sb-domino-test-auth-token",
        JSON.stringify({
          access_token: "test-token",
          refresh_token: "test-refresh",
          token_type: "bearer",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          user: {
            id,
            email: "leitor@example.com",
            aud: "authenticated",
            role: "authenticated",
            app_metadata: {},
            user_metadata: {},
          },
        }),
      );
    },
    { id: user },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Projeto de apresentação" }).click();
  await expect(
    page.getByRole("heading", { name: "Projeto de apresentação" }),
  ).toBeVisible();
  await expect(page.getByText("1 tarefa", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await expect(
    page.getByRole("button", { name: "＋ Adicionar tarefa" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Ver próximo passo →" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Título", { exact: true })).toHaveValue(
    "Autenticação",
  );
  await expect(page.getByLabel("Título", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("textbox", { name: "Pesquisar tarefas" }).fill("Testar");
  await expect(page.locator("article.card")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Projeto de apresentação" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/kanban-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
