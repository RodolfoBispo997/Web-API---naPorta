# API naPorta

API NestJS para gerenciamento de pedidos, construída em etapas.

## Estado atual

- **Implementado:** NestJS 11, PostgreSQL local via Docker Compose, Prisma ORM 7, migration inicial, login com JWT Bearer, guard reutilizável, usuário local de demonstração e testes unitários/HTTP de autenticação.
- **Ainda não implementado:** endpoints e serviços de pedidos, autorização por papéis, refresh token, cadastro público, exclusão lógica aplicada às consultas e seed de pedidos.

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
npm run db:seed
npm run start:dev
```

`npm run build` também gera o Prisma Client antes de compilar. O client gerado fica em `src/generated/prisma/` e é ignorado pelo Git.

O Compose publica o PostgreSQL somente no loopback (`127.0.0.1`), por padrão na porta `5433`, e usa um volume nomeado. Se a porta já estiver ocupada, altere `POSTGRES_PORT` e a porta na `DATABASE_URL` do `.env` para o mesmo valor.

As credenciais de `.env.example` são valores de demonstração apenas para desenvolvimento local. Não as reutilize fora dessa finalidade. O arquivo `.env` não deve ser versionado.

Configure `DATABASE_URL`, `JWT_SECRET`, `DEMO_USER_EMAIL` e `DEMO_USER_PASSWORD` no `.env`. Se o arquivo já existir, acrescente as variáveis que estiverem faltando sem substituir seus valores. O segredo JWT deve ter pelo menos 32 bytes. Os valores do exemplo são exclusivamente demonstrativos; em ambientes reais use um segredo aleatório armazenado em configuração segura.

Os comandos Prisma exigem `DATABASE_URL` configurada. `prisma generate` e `prisma validate` não precisam de uma conexão ativa com o banco.

## Autenticação

`POST /auth/login` recebe e-mail e senha. O e-mail é removido de espaços nas extremidades e convertido para minúsculas. O login valida formato e limites de entrada, mas não impõe regras de complexidade à senha. A senha pode ter até 72 bytes UTF-8, que é o limite do bcrypt. Senhas maiores recebem `400 Bad Request` com a mensagem `Password must be no longer than 72 UTF-8 bytes.` A contagem considera os bytes UTF-8, inclusive para caracteres multibyte. Isso impede que um sufixo além do limite seja ignorado pelo bcrypt.

Requisição:

```json
{
  "email": "<DEMO_USER_EMAIL>",
  "password": "<DEMO_USER_PASSWORD>"
}
```

Resposta `200 OK`:

```json
{
  "accessToken": "<JWT>",
  "tokenType": "Bearer",
  "expiresIn": 900
}
```

Exemplo PowerShell para autenticar e preparar o cabeçalho Bearer:

```powershell
$body = @{ email = '<email>'; password = '<password>' } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post -Uri http://localhost:3000/auth/login `
  -ContentType 'application/json' -Body $body
$headers = @{ Authorization = "Bearer $($login.accessToken)" }
```

Use `$headers` ao chamar uma rota futura protegida pelo guard. Ainda não existe endpoint de pedidos.

O token usa HS256, inclui o identificador do usuário em `sub` e expira em 15 minutos. Envie-o como `Authorization: Bearer <JWT>` às rotas que forem protegidas por `JwtAuthGuard`. Um módulo de rotas importa `AuthModule` e registra `JwtAuthGuard` nos próprios `providers`; ainda não há rota protegida de pedidos na aplicação.

Usuário inexistente e senha incorreta retornam a mesma resposta genérica `401 Unauthorized`. Senha acima de 72 bytes UTF-8 retorna `400 Bad Request` antes da consulta ou comparação. O hash da senha nunca é retornado.

## Usuário de demonstração

`npm run db:seed` cria o usuário indicado por `DEMO_USER_EMAIL` e `DEMO_USER_PASSWORD`, usando bcrypt com custo 12. O e-mail é normalizado da mesma forma que no login. A senha deve ter entre 1 e 72 bytes UTF-8; não há regra de complexidade. Se o e-mail já existir, o seed informa isso e não altera senha nem qualquer outro dado. Em uma disputa concorrente pela criação, a conta vencedora também é preservada; outros erros do banco são reportados como falha.

Se o usuário já existia e a senha configurada não corresponde à senha armazenada, o seed não redefine a conta. Use a senha já conhecida dessa conta ou configure outro e-mail de demonstração para criar um usuário separado. A senha de demonstração não é fallback; as duas variáveis precisam estar configuradas explicitamente.

## Migrations e comandos

- `npm run prisma:generate`: gera o Prisma Client.
- `npm run db:migrate:deploy`: aplica migrations já versionadas.
- `npm run db:migrate`: comando de desenvolvimento para criar e aplicar migrations.
- `npm run db:seed`: cria o usuário local de demonstração somente se o e-mail ainda não existir.
- `npm run db:status`: consulta o estado das migrations.
- `npm run lint`: verifica o código TypeScript em `src/` e `test/`.
- `npm test` e `npm run test:e2e`: executam testes unitários e HTTP com módulo Nest e Prisma mockado; não usam o banco principal nem executam o seed.
- `npm run build`: gera o client e compila a aplicação.

Para parar o container, execute `docker compose down`. Isso mantém os dados no volume. Remover o volume, por exemplo com `docker compose down -v`, apaga os dados locais.
