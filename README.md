# API naPorta

API REST para gerenciamento de pedidos, desenvolvida para o desafio backend da
naPorta. Permite autenticação, criação, consulta, listagem com filtros,
atualização e exclusão lógica de pedidos.

**Tecnologias:** Node.js e TypeScript, NestJS, PostgreSQL, Prisma, JWT Bearer,
Docker Compose, Swagger/OpenAPI e Vitest.

## Início rápido com Docker

Requer Docker Desktop com Compose v2 em execução e portas `3000` e `5433`
disponíveis. Na raiz do projeto, crie `.env` a partir de `.env.example` se
ainda não existir:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

No Bash: `test -f .env || cp .env.example .env`.

Se já houver `.env`, preserve-o e confira as variáveis necessárias. Os valores
de exemplo são **apenas para demonstração local**, não para produção.
`DOCKER_DATABASE_URL` deve apontar para `postgres:5432` e usar o mesmo usuário,
senha e banco de `POSTGRES_USER`, `POSTGRES_PASSWORD` e `POSTGRES_DB`.
Codifique caracteres reservados nas credenciais da URL. Configure também
`JWT_SECRET`, `DEMO_USER_EMAIL` e `DEMO_USER_PASSWORD`.

Execute em ordem:

```bash
docker compose up -d --wait postgres
docker compose build api
docker compose run --rm api npm run db:migrate:deploy
docker compose run --rm api npm run db:seed
docker compose --profile api up -d api
```

O primeiro comando aguarda o banco ficar saudável. A migration aplica apenas
arquivos versionados; o seed é explícito. A API estará em
`http://127.0.0.1:3000` e o PostgreSQL em `127.0.0.1:5433`. Altere `API_PORT`
ou `POSTGRES_PORT` se necessário. Para interromper e remover containers e rede,
preservando o volume e os dados do banco:

```bash
docker compose --profile api down
```

## Swagger e autenticação

Abra [http://127.0.0.1:3000/docs](http://127.0.0.1:3000/docs). Execute
`POST /auth/login` com `DEMO_USER_EMAIL` e `DEMO_USER_PASSWORD` do `.env`,
copie o `accessToken` e informe-o em **Authorize**. Em outras ferramentas, use
`Authorization: Bearer <token>`. O token expira em 15 minutos. O documento
OpenAPI também está em `/docs-json`.

## Rotas e filtros

Todas as rotas de pedidos exigem Bearer token. O Swagger contém os schemas,
exemplos e respostas completos.

| Método | Rota | Operação |
| --- | --- | --- |
| `POST` | `/auth/login` | Autenticar e obter token. |
| `POST` | `/orders` | Criar pedido e itens. |
| `GET` | `/orders` | Listar pedidos com filtros e paginação. |
| `GET` | `/orders/:id` | Consultar pedido ativo. |
| `PATCH` | `/orders/:id` | Atualizar parcialmente. |
| `DELETE` | `/orders/:id` | Excluir logicamente; retorna `204`. |

Os parâmetros de `GET /orders` são opcionais e combináveis:

| Parâmetro | Formato ou limite |
| --- | --- |
| `orderNumber` | Correspondência exata, sem espaços externos. |
| `status` | `PENDING`, `PROCESSING`, `DELIVERED` ou `CANCELLED`. |
| `startDate`, `endDate` | `YYYY-MM-DD`, limites inclusivos de `createdAt` em UTC. |
| `page` | Inteiro de 1 a 10000; padrão 1. |
| `limit` | Inteiro de 1 a 100; padrão 20. |

Exemplo com dados do seed:
`GET /orders?status=PROCESSING&startDate=2026-02-10&endDate=2026-02-10`.
A resposta contém `data` e `meta` (`page`, `limit`, `total`, `totalPages`).
Uma página além da última retorna `data: []` mantendo os totais; sem resultados,
`totalPages` é zero. A ordem é `createdAt` e depois `id`, ambos decrescentes.

## Testes e execução local

Para execução local, use **Node.js 24.22.1** (`.nvmrc`), npm 10 ou superior e
um `.env` configurado. A versão de Node 24.22.1 e npm 11.19.1 foi validada
localmente; o projeto declara `^24.22.1` em `engines`.

```bash
npm ci
docker compose up -d --wait postgres
npm run prisma:generate
npm run db:migrate:deploy
npm run db:seed
npm run start:dev
```

Neste fluxo, `DATABASE_URL` usa o endereço do host, por padrão
`localhost:5433`. A API escuta em `127.0.0.1` por padrão. Se o PostgreSQL usar
outra porta, ajuste `POSTGRES_PORT` e `DATABASE_URL` no `.env`.

```bash
npm test                # unitários
npm run test:e2e        # HTTP com Prisma mockado
npm run lint
npm run build
```

Os testes de integração usam PostgreSQL real e exigem um banco isolado com
migrations aplicadas: consulte [testes de integração](docs/testes-integracao.md)
para criar, configurar e encerrar o ambiente com segurança. O workflow
[CI](.github/workflows/ci.yml) executa as verificações em pushes e pull requests;
não realiza deploy.

## Regras e limitações

- Preços são strings decimais na API e `DECIMAL(12,2)` no banco.
  `expectedDeliveryDate` é uma data de calendário `YYYY-MM-DD`.
- No PATCH, campos omitidos são preservados. Se `items` for enviado, substitui
  integralmente os itens em uma transação; `deliveryAddress.complement` aceita
  `null`. A exclusão lógica preserva pedido e itens, oculta o pedido das
  consultas e mantém o número reservado.
- O seed cria o usuário e quatro pedidos fictícios `DEMO-001` a `DEMO-004`.
  Ao repetir, não altera usuários ou pedidos existentes nem restaura excluídos.
  Uma execução após falha parcial tenta criar os pedidos faltantes. Se a senha
  configurada não corresponder à conta existente, use a senha conhecida ou
  configure outro e-mail; o seed não redefine senhas.
- O login aceita senhas de até 72 bytes UTF-8. O limite é de 5 requisições em
  60 segundos por IPv4 ou sub-rede IPv6 /64, incluindo entradas inválidas e
  logins bem-sucedidos. Ao exceder, retorna `429` e bloqueia por 60 segundos;
  `Retry-After` informa o tempo restante. IPv4 mapeado em IPv6 compartilha o
  contador com o IPv4 correspondente.
- O contador fica em memória, é independente por instância e se perde ao
  reiniciar. Usuários na mesma rede podem compartilhar o limite. O servidor
  não confia em `X-Forwarded-For` por padrão; atrás de um proxy, clientes podem
  compartilhar seu endereço até que um proxy confiável seja configurado.
- A contagem e os dados da listagem são consultas separadas e não garantem um
  snapshot comum. A imagem Docker inclui dependências de desenvolvimento para
  executar Prisma e seed; a configuração fornecida é demonstrativa.
