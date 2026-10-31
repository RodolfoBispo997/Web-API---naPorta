# API naPorta

API NestJS para gerenciamento de pedidos, construída em etapas.

## Estado atual

- **Implementado:** NestJS 11, PostgreSQL local via Docker Compose, Prisma ORM 7, migration inicial e integração do Prisma Client com o ciclo de vida do NestJS.
- **Ainda não implementado:** autenticação JWT, endpoints e serviços de pedidos, exclusão lógica aplicada às consultas, seed de pedidos e testes automatizados.

O campo `deletedAt` existe no modelo, mas nenhuma operação aplica soft delete ainda.

## Modelagem inicial

- Os três modelos usam UUIDs. `User.email` e `Order.orderNumber` têm unicidade no banco; o número do pedido continua único mesmo quando `deletedAt` for preenchido.
- O pedido guarda uma cópia do nome, documento e endereço de entrega. O endereço fica em campos simples no próprio pedido, sem tabelas de cliente ou endereço.
- `expectedDeliveryDate` é `DATE`, pois representa um dia de calendário. Datas de criação, atualização e exclusão usam `TIMESTAMPTZ(3)`.
- `OrderItem.price` usa `DECIMAL(12,2)`, com precisão fixa para valores monetários. Não há quantidade, frete nem total nesta etapa.
- A chave estrangeira de `OrderItem.orderId` tem índice para buscar os itens de um pedido. O status pode ser filtrado, mas não recebe índice adicional sem evidência de volume e perfil de consulta; índices únicos de e-mail e número do pedido decorrem das próprias restrições de unicidade.
- Exclusão física de um pedido apaga seus itens por `ON DELETE CASCADE`. Isso não implementa soft delete: preencher `deletedAt` futuramente não apaga nem oculta dados por si só.

## Pré-requisitos

- Node.js `^20.19.0 || ^22.12.0 || >=24.0.0`; validado nesta etapa em Node 20.20.0. Outras versões não foram testadas.
- npm 10 ou superior
- Docker Desktop com Docker Compose v2 em execução

## Configuração local

No PowerShell, na raiz do projeto:

```powershell
npm install
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose up -d --wait
npm run prisma:generate
npm run db:migrate:deploy
npm run start:dev
```

`npm run build` também gera o Prisma Client antes de compilar. O client gerado fica em `src/generated/prisma/` e é ignorado pelo Git.

O Compose publica o PostgreSQL somente no loopback (`127.0.0.1`), por padrão na porta `5433`, e usa um volume nomeado. Se a porta já estiver ocupada, altere `POSTGRES_PORT` e a porta na `DATABASE_URL` do `.env` para o mesmo valor.

As credenciais de `.env.example` são valores de demonstração apenas para desenvolvimento local. Não as reutilize fora dessa finalidade. O arquivo `.env` não deve ser versionado.

Configure `DATABASE_URL` no `.env` antes de executar comandos Prisma. `prisma generate` e `prisma validate` exigem a variável configurada, mas não precisam de uma conexão ativa com o banco.

## Migrations e comandos

- `npm run prisma:generate`: gera o Prisma Client.
- `npm run db:migrate:deploy`: aplica migrations já versionadas.
- `npm run db:migrate`: comando de desenvolvimento para criar e aplicar migrations.
- `npm run db:status`: consulta o estado das migrations.
- `npm run lint`: verifica o código TypeScript em `src/` e `test/`.
- `npm test` e `npm run test:e2e`: executam as suítes unitária e E2E.
- `npm run build`: gera o client e compila a aplicação.

Para parar o container, execute `docker compose down`. Isso mantém os dados no volume. Remover o volume, por exemplo com `docker compose down -v`, apaga os dados locais.

Ainda não há testes reais. Os comandos Vitest retornam sucesso quando não encontram arquivos, o que não representa cobertura de testes.
