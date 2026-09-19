<div align="center">

# ✦ Minha Lista

### Pequenos passos, grandes resultados.

Uma lista de tarefas minimalista, responsiva e persistida diretamente no navegador.

<p>
  <img src="https://img.shields.io/badge/status-demo-6856e8?style=for-the-badge" alt="Status: demo">
  <img src="https://img.shields.io/badge/HTML5-vanilla-e34f26?style=for-the-badge&logo=html5&logoColor=white" alt="HTML5">
  <img src="https://img.shields.io/badge/JavaScript-vanilla-f7df1e?style=for-the-badge&logo=javascript&logoColor=111827" alt="JavaScript">
  <img src="https://img.shields.io/badge/licença-a%20definir-7b83a3?style=for-the-badge" alt="Licença a definir">
</p>

</div>

<br>

## ✨ Visão geral

O **Minha Lista** ajuda a organizar o dia com uma experiência direta: adicione uma tarefa, acompanhe o que está pendente e marque o que já foi concluído. O estado fica salvo no dispositivo, então a lista continua disponível ao atualizar a página.

> ⚠️ **Atenção:** esta é uma demonstração com IA externa. Utilize apenas dados fictícios.

## 🎯 Recursos

| Recurso | Descrição |
| --- | --- |
| ➕ Adicionar tarefas | Crie tarefas com até 160 caracteres. |
| ✅ Concluir tarefas | Marque e desmarque tarefas com um clique. |
| 🔎 Filtros | Alterne entre todas, pendentes e concluídas. |
| ✏️ Editar e excluir | Atualize ou remova tarefas existentes. |
| 🧹 Limpeza rápida | Remova todas as tarefas concluídas de uma vez. |
| 💾 Persistência local | Dados armazenados no `localStorage` do navegador. |
| 📱 Layout responsivo | Interface adaptada para desktop e mobile. |
| 🤖 Assistente | Painel de assistência carregado via Page Agent. |

## 🖥️ Interface

<div align="center">

```text
┌──────────────────────────────────────────────┐
│ ORGANIZE SEU DIA              sábado, 19/09  │
│ Minha lista                                  │
│ Pequenos passos, grandes resultados.         │
│                                              │
│  O que precisa ser feito?        [Adicionar] │
│  [Todas] [Pendentes] [Concluídas]            │
│  ○ Planejar a semana                  ✎  ×    │
│  ● Revisar o projeto                 ✎  ×    │
│  1 tarefa pendente        Salvo neste dispositivo │
└──────────────────────────────────────────────┘
```

</div>

## 🚀 Como executar

Não há dependências ou etapa de build.

### Opção 1 — abrir diretamente

Abra o arquivo [`index.html`](./index.html) no navegador.

### Opção 2 — servidor local

```bash
git clone <URL_DO_SEU_REPOSITORIO>
cd Lista_Tarefas
python -m http.server 5500
```

Depois, acesse [`http://localhost:5500`](http://localhost:5500).

## 🧩 Estrutura

```text
.
├── favicon.svg   # Ícone da aplicação
├── index.html    # Estrutura, estilos e lógica da lista
└── README.md     # Documentação do projeto
```

## 🛠️ Tecnologias

- HTML semântico
- CSS puro, com layout responsivo e efeitos visuais
- JavaScript puro, sem framework
- `localStorage` para persistência no navegador
- [Page Agent](https://github.com/nicepkg/page-agent) via CDN para o assistente

## 🔐 Privacidade e limitações

- As tarefas são armazenadas apenas no `localStorage` deste navegador.
- Limpar os dados do site pode apagar a lista.
- O assistente externo é carregado de uma CDN; avalie essa integração antes de usar dados reais.
- O projeto ainda não possui suíte de testes automatizados nem pipeline de deploy configurado.

## 📌 Próximos passos

- [ ] Adicionar modo escuro
- [ ] Incluir categorias, prioridades e datas de vencimento
- [ ] Criar exportação e importação das tarefas
- [ ] Definir licença do projeto
- [ ] Adicionar testes de comportamento

<div align="center">

Feito com foco, simplicidade e um toque de roxo. 💜

</div>
