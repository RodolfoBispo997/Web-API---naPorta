# API naPorta

API NestJS para gerenciamento de pedidos, construída em etapas.

## Estado atual

- **Implementado:** NestJS 11, PostgreSQL local via Docker Compose, Prisma ORM 7, migration inicial, login com JWT Bearer, guard reutilizável, seed de usuário e pedidos demonstrativos e criação, consulta, listagem, edição e exclusão lógica de pedidos, com testes unitários/HTTP/de integração.
- **Ainda não implementado:** autorização por papéis, refresh token e cadastro público.

O campo `deletedAt` registra a exclusão lógica. Pedidos excluídos continuam no banco com seus itens, mas não aparecem na consulta individual nem na listagem.

## Modelagem inicial

- Os três modelos usam UUIDs. `User.email` e `Order.orderNumber` têm unicidade no banco; o número do pedido continua único mesmo quando `deletedAt` for preenchido.
- O pedido guarda uma cópia do nome, documento e endereço de entrega. O endereço fica em campos simples no próprio pedido, sem tabelas de cliente ou endereço.
- `expectedDeliveryDate` é `DATE`, pois representa um dia de calendário. Datas de criação, atualização e exclusão usam `TIMESTAMPTZ(3)`.
- `OrderItem.price` usa `DECIMAL(12,2)`, com precisão fixa para valores monetários. Não há quantidade, frete nem total nesta etapa.
- A chave estrangeira de `OrderItem.orderId` tem índice para buscar os itens de um pedido. O status pode ser filtrado, mas não recebe índice adicional sem evidência de volume e perfil de consulta; índices únicos de e-mail e número do pedido decorrem das próprias restrições de unicidade.
- Exclusão física de um pedido apaga seus itens por `ON DELETE CASCADE`. A API usa exclusão lógica: preencher `deletedAt` não apaga o pedido nem seus itens.

## Pré-requisitos

- Node.js `^20.19.0 || ^22.12.0 || >=24.0.0`; validado nesta etapa em Node 20.20.0. Outras versões não foram testadas.
- No Node 20.20.0, a instalação emite um aviso de engine para a dependência transitiva `@prisma/streams-local`, que declara Node `>=22`. A instalação e as verificações descritas foram executadas com sucesso em Node 20.20.0 apesar do aviso.
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

A API escuta em `127.0.0.1` por padrão, inclusive quando `HOST` estiver ausente ou vazio. Defina `HOST=0.0.0.0` quando precisar aceitar conexões externas, por exemplo dentro de um container. Essa configuração expõe a aplicação às interfaces de rede disponíveis; use credenciais e segredo adequados ao ambiente, pois os valores demonstrativos não são apropriados para produção.

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

Use `$headers` nas rotas protegidas de pedidos descritas abaixo.

O token usa HS256, inclui o identificador do usuário em `sub` e expira em 15 minutos. Envie-o como `Authorization: Bearer <JWT>` às rotas que forem protegidas por `JwtAuthGuard`. Todas as rotas de pedidos abaixo exigem esse token válido.

Usuário inexistente e senha incorreta retornam a mesma resposta genérica `401 Unauthorized`. Senha acima de 72 bytes UTF-8 retorna `400 Bad Request` antes da consulta ou comparação. O hash da senha nunca é retornado.

## Pedidos

As rotas disponíveis são `POST /orders`, `GET /orders/:id`, `GET /orders`, `PATCH /orders/:id` e `DELETE /orders/:id`. Todas exigem `Authorization: Bearer <JWT>`.

### Criar pedido

Exemplo de `POST /orders`:

```json
{
  "orderNumber": "ORD-2026-001",
  "expectedDeliveryDate": "2026-12-31",
  "customer": {
    "name": "Ada Lovelace",
    "document": "DOC-123"
  },
  "deliveryAddress": {
    "street": "Rua das Flores",
    "number": "42",
    "neighborhood": "Centro",
    "city": "Campinas",
    "state": "SP",
    "postalCode": "13000-000",
    "country": "BR",
    "complement": "Sala 2"
  },
  "items": [
    { "description": "Caixa pequena", "price": "19.90" },
    { "description": "Envelope", "price": "0" }
  ]
}
```

Resposta `201 Created` (IDs e horários são ilustrativos):

```json
{
  "id": "c0290cbd-33d9-44bb-9bad-6d194e0c2f86",
  "orderNumber": "ORD-2026-001",
  "status": "PENDING",
  "expectedDeliveryDate": "2026-12-31",
  "customer": { "name": "Ada Lovelace", "document": "DOC-123" },
  "deliveryAddress": {
    "street": "Rua das Flores",
    "number": "42",
    "complement": "Sala 2",
    "neighborhood": "Centro",
    "city": "Campinas",
    "state": "SP",
    "postalCode": "13000-000",
    "country": "BR"
  },
  "items": [
    { "id": "c0290cbd-33d9-44bb-9bad-6d194e0c2f87", "description": "Caixa pequena", "price": "19.90" },
    { "id": "c0290cbd-33d9-44bb-9bad-6d194e0c2f88", "description": "Envelope", "price": "0.00" }
  ],
  "createdAt": "2026-10-31T14:00:00.000Z",
  "updatedAt": "2026-10-31T14:00:00.000Z"
}
```

`expectedDeliveryDate` deve ser uma data real no formato `YYYY-MM-DD`; é armazenada como `DATE`, sem conversão por fuso horário, e não precisa estar no futuro. `price` deve ser texto decimal não negativo, com até 10 dígitos inteiros e até 2 casas decimais, compatível com `DECIMAL(12,2)`. A resposta sempre usa uma string com exatamente duas casas decimais, por exemplo `"0.00"` e `"19.90"`. Os preços são enviados ao Prisma como texto e não passam por ponto flutuante.

Textos são aparados nas extremidades e não podem ficar vazios. Os limites de comprimento seguem o schema Prisma; campos desconhecidos, inclusive nos objetos aninhados, são rejeitados. O status inicial é sempre `PENDING`; o cliente não pode definir status, identificadores ou timestamps.

A criação usa uma escrita aninhada do Prisma para inserir o pedido e todos os itens na mesma operação transacional. Se a gravação de um item falhar, o pedido também é revertido. O índice único PostgreSQL de `order_number` resolve disputas concorrentes; somente a violação dessa restrição é convertida em `409 Conflict`.

### Consultar pedido

Exemplo de requisição: `GET /orders/c0290cbd-33d9-44bb-9bad-6d194e0c2f86`, com o cabeçalho Bearer mostrado na seção de autenticação. Exemplo de resposta `200 OK` (valores ilustrativos):

```json
{
  "id": "c0290cbd-33d9-44bb-9bad-6d194e0c2f86",
  "orderNumber": "ORD-2026-001",
  "status": "PENDING",
  "expectedDeliveryDate": "2026-12-31",
  "customer": { "name": "Ada Lovelace", "document": "DOC-123" },
  "deliveryAddress": {
    "street": "Rua das Flores",
    "number": "42",
    "complement": "Sala 2",
    "neighborhood": "Centro",
    "city": "Campinas",
    "state": "SP",
    "postalCode": "13000-000",
    "country": "BR"
  },
  "items": [
    { "id": "c0290cbd-33d9-44bb-9bad-6d194e0c2f87", "description": "Caixa pequena", "price": "19.90" },
    { "id": "c0290cbd-33d9-44bb-9bad-6d194e0c2f88", "description": "Envelope", "price": "0.00" }
  ],
  "createdAt": "2026-10-31T14:00:00.000Z",
  "updatedAt": "2026-10-31T14:00:00.000Z"
}
```

UUID inválido retorna `400 Bad Request`; pedido inexistente ou com `deletedAt` preenchido retorna `404 Not Found`.

### Listar pedidos

`GET /orders` retorna somente pedidos com `deletedAt: null`, incluindo os itens no mesmo formato de `GET /orders/:id`. Todos os filtros informados são combinados com AND:

| Parâmetro | Tipo e regra | Padrão |
| --- | --- | --- |
| `orderNumber` | Texto, correspondência exata; espaços externos são removidos | sem filtro |
| `status` | `PENDING`, `PROCESSING`, `DELIVERED` ou `CANCELLED` | sem filtro |
| `startDate` | Data real `YYYY-MM-DD`, inclusiva | sem limite inicial |
| `endDate` | Data real `YYYY-MM-DD`, inclusiva | sem limite final |
| `page` | Inteiro entre 1 e 10.000 | `1` |
| `limit` | Inteiro entre 1 e 100 | `20` |

O intervalo considera `createdAt` em UTC: `startDate` começa à meia-noite inclusiva e `endDate` termina antes da meia-noite do dia seguinte, portanto inclui o dia final completo. É permitido informar só uma das datas. Quando ambas forem informadas, `startDate` precisa ser anterior ou igual a `endDate`. Parâmetros desconhecidos, vazios, repetidos (que resultem em arrays), inválidos ou paginação fora dos limites retornam `400 Bad Request`.

Exemplos (todos com o cabeçalho Bearer):

```text
GET /orders?orderNumber=%20ORD-2026-001%20
GET /orders?status=PROCESSING
GET /orders?startDate=2026-01-01
GET /orders?endDate=2026-01-31
GET /orders?startDate=2026-01-01&endDate=2026-01-31&page=2&limit=10&status=PROCESSING
```

Resposta `200 OK`:

```json
{
  "data": [
    {
      "id": "c0290cbd-33d9-44bb-9bad-6d194e0c2f86",
      "orderNumber": "ORD-2026-001",
      "status": "PROCESSING",
      "expectedDeliveryDate": "2026-12-31",
      "customer": { "name": "Ada Lovelace", "document": "DOC-123" },
      "deliveryAddress": {
        "street": "Rua das Flores", "number": "42", "complement": null,
        "neighborhood": "Centro", "city": "Campinas", "state": "SP",
        "postalCode": "13000-000", "country": "BR"
      },
      "items": [
        { "id": "c0290cbd-33d9-44bb-9bad-6d194e0c2f87", "description": "Caixa pequena", "price": "19.90" }
      ],
      "createdAt": "2026-01-15T14:00:00.000Z",
      "updatedAt": "2026-01-15T14:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

Os resultados são ordenados por `createdAt` decrescente e, em caso de empate, por `id` decrescente. Uma página além da última retorna `data: []`, mantendo `total` e `totalPages`; sem resultados, `totalPages` é `0`. A busca e a contagem usam o mesmo filtro, mas são consultas separadas e não prometem um snapshot transacional comum.

### Atualizar pedido

`PATCH /orders/:id` aceita atualização parcial dos campos `orderNumber`, `status`, `expectedDeliveryDate`, `customer`, `deliveryAddress` e `items`. Exemplo:

```json
{
  "status": "PROCESSING",
  "customer": { "name": "Ada Lovelace atualizada" },
  "deliveryAddress": { "complement": null },
  "items": [{ "description": "Item substituto", "price": "12.30" }]
}
```

Envie ao menos um campo. Os campos enviados em `customer` e `deliveryAddress` são atualizados individualmente; os omitidos permanecem como estavam. Objetos aninhados vazios e campos desconhecidos são rejeitados. `deliveryAddress.complement` aceita `null` para remover o complemento; os outros campos não anuláveis rejeitam `null`. As mesmas regras de data, status, texto e preço da criação são aplicadas.

Se `items` for omitido, os itens atuais são preservados. Se for enviado, deve conter ao menos um item válido e substitui a lista inteira. Os itens novos recebem novos IDs; os IDs anteriores não são preservados. A atualização dos campos do pedido e a substituição dos itens ocorrem na mesma transação, portanto a falha ao criar um novo item reverte também a exclusão dos itens anteriores e as demais alterações.

A escrita do PATCH é condicional a `deletedAt: null` e ocorre dentro da transação que atualiza os itens. O teste de integração controla o caso em que uma exclusão mantém primeiro o bloqueio da linha: o PATCH aguarda, a condição é reavaliada após a exclusão confirmar e o PATCH retorna `404` sem alterar o pedido. Isso comprova esse cenário de serialização no PostgreSQL; a ordem inversa e outras regras de concorrência ou transição de status não foram testadas nem são definidas aqui.

Resposta `200 OK`: o pedido atualizado no mesmo formato de `GET /orders/:id`. UUID inválido retorna `400`; pedido inexistente ou já excluído retorna `404`; `orderNumber` em conflito retorna `409`.

### Excluir pedido

`DELETE /orders/:id` preenche `deletedAt` sem remover fisicamente o pedido ou seus itens. A primeira exclusão retorna `204 No Content`, sem corpo; pedido inexistente ou já excluído retorna `404`. Pedidos excluídos deixam de aparecer em `GET /orders` e `GET /orders/:id` e não podem ser atualizados. O número continua reservado pela restrição única, mesmo após a exclusão lógica.

### Erros das rotas

- `400 Bad Request`: corpo ou filtro inválido, data impossível, período invertido, preço inválido, parâmetros/campos desconhecidos ou UUID malformado.
- `401 Unauthorized`: token ausente, inválido ou expirado.
- `404 Not Found`: pedido inexistente ou marcado como excluído logicamente.
- `409 Conflict`: `orderNumber` já utilizado.

## Seed de demonstração

`npm run db:seed` prepara o usuário local e pedidos fictícios. Antes, inicie o PostgreSQL, configure `DATABASE_URL`, `DEMO_USER_EMAIL` e `DEMO_USER_PASSWORD` no `.env` e aplique as migrations versionadas com `npm run db:migrate:deploy`. O seed é destinado somente à demonstração local; os clientes, documentos e endereços abaixo são dados inventados.

O usuário é criado com bcrypt de custo 12. O e-mail é normalizado como no login e a senha deve ter entre 1 e 72 bytes UTF-8, sem regra de complexidade. Se o e-mail já existir, o seed preserva os dados e a senha. Se a senha configurada não corresponder à conta existente, use a senha conhecida ou configure outro e-mail de demonstração; o seed não redefine a conta.

Os pedidos usam números fixos e status distintos para facilitar a avaliação:

| Número | Status | `createdAt` UTC | Previsão de entrega |
| --- | --- | --- | --- |
| `DEMO-001` | `PENDING` | `2026-01-05T10:00:00.000Z` | `2026-01-15` |
| `DEMO-002` | `PROCESSING` | `2026-02-10T14:30:00.000Z` | `2026-02-20` |
| `DEMO-003` | `DELIVERED` | `2026-03-15T09:15:00.000Z` | `2026-03-17` |
| `DEMO-004` | `CANCELLED` | `2026-04-20T16:45:00.000Z` | `2026-04-30` |

Cada pedido tem itens demonstrativos com preços decimais em texto. Para consultar o pedido em processamento por status e dia de criação, use `GET /orders?status=PROCESSING&startDate=2026-02-10&endDate=2026-02-10` com o token Bearer obtido no login.

O seed pode ser repetido: se um número já existir, não modifica nem apaga o pedido ou seus itens, mesmo quando o pedido foi editado ou está excluído logicamente. A unicidade do número continua reservada. O terminal informa quantos pedidos foram criados e quantos já existiam; não imprime senha ou hash.

Cada pedido e seus itens são criados em uma escrita aninhada atômica. A lista inteira e o usuário não formam uma única transação: se ocorrer falha após alguns pedidos, os pedidos concluídos permanecem; uma execução posterior os conta como existentes e tenta criar os números que faltarem. Outros erros de banco são propagados e fazem o comando terminar com código diferente de zero; uma disputa concorrente é tratada como existência somente quando o erro identifica a restrição única de `order_number` e a linha conflitante é encontrada.

## Migrations e comandos

- `npm run prisma:generate`: gera o Prisma Client.
- `npm run db:migrate:deploy`: aplica migrations já versionadas.
- `npm run db:migrate`: comando de desenvolvimento para criar e aplicar migrations.
- `npm run db:seed`: cria o usuário demonstrativo se ausente e insere os pedidos fictícios `DEMO-001` a `DEMO-004` sem alterar registros existentes.
- `npm run db:status`: consulta o estado das migrations.
- `npm run lint`: verifica o código TypeScript em `src/` e `test/`.
- `npm test` e `npm run test:e2e`: executam testes unitários e HTTP com módulo Nest e Prisma mockado; não usam o banco principal nem executam o seed. Incluem os testes das rotas de criação, consulta, listagem, atualização e exclusão lógica.
- `npm run test:integration`: executa testes HTTP contra PostgreSQL real, incluindo atomicidade da substituição de itens, exclusão lógica persistente e concorrência controlada entre PATCH e exclusão. Exige `TEST_DATABASE_URL` apontando para uma base isolada chamada `naporta_orders_test_<sufixo>`; a suíte valida o nome e confirma a base conectada. Antes, configure `DATABASE_URL` com a mesma URL e aplique `npm run db:migrate:deploy`. A suíte limpa os registros de teste que criou; não remove banco, volume ou container.
- `npm run build`: gera o client e compila a aplicação.

### Banco isolado para testes de integração

Execute em um terminal separado, na raiz do projeto, depois de instalar as dependências e gerar o Prisma Client. Os comandos abaixo criam outro projeto Compose e outro banco, com nomes exclusivos. Escolha uma porta livre se `55433` estiver ocupada. A senha gerada é apenas para o banco temporário de testes; não copie essa configuração para produção.

PowerShell:

```powershell
$testId = [guid]::NewGuid().ToString('N').Substring(0, 12)
$testProject = "naporta-it-$testId"
$env:POSTGRES_USER = 'naporta_test'
$env:POSTGRES_PASSWORD = [guid]::NewGuid().ToString('N')
$env:POSTGRES_DB = "naporta_orders_test_$testId"
$env:POSTGRES_PORT = '55433'
$env:DATABASE_URL = "postgresql://$($env:POSTGRES_USER):$($env:POSTGRES_PASSWORD)@127.0.0.1:$($env:POSTGRES_PORT)/$($env:POSTGRES_DB)?schema=public"
$env:TEST_DATABASE_URL = $env:DATABASE_URL
docker compose -p $testProject up -d --wait
npm run db:migrate:deploy
npm run test:integration
docker compose -p $testProject down
```

Alternativa Bash (requer `openssl`):

```bash
test_id="$(openssl rand -hex 6)"
test_project="naporta-it-$test_id"
export POSTGRES_USER=naporta_test
export POSTGRES_PASSWORD="$(openssl rand -hex 16)"
export POSTGRES_DB="naporta_orders_test_$test_id"
export POSTGRES_PORT=55433
export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT}/${POSTGRES_DB}?schema=public"
export TEST_DATABASE_URL="$DATABASE_URL"
docker compose -p "$test_project" up -d --wait
npm run db:migrate:deploy
npm run test:integration
docker compose -p "$test_project" down
```

A suíte remove os registros que criou. Execute o `down` do projeto de testes mesmo se algum comando anterior falhar: ele interrompe e remove o container e a rede desse projeto, mas preserva seu volume e o banco de testes. O volume temporário permanece após os testes; identifique-o pelo nome do projeto antes de decidir removê-lo, sem tocar em volumes preexistentes. Feche o terminal separado para descartar as variáveis de ambiente de teste. Para interromper a aplicação de desenvolvimento, use `Ctrl+C`; para parar o PostgreSQL local principal, `docker compose down` também mantém seu volume.
