# Testes de integração com PostgreSQL isolado

Instale as dependências com `npm ci` antes de executar os exemplos. A geração
do Prisma Client abaixo exige `DATABASE_URL`, mas não uma conexão ativa. Use um terminal
separado, Docker Compose v2 e uma porta livre. A suíte exige um banco chamado
`naporta_orders_test_<sufixo>` e confirma o nome da base conectada. Não use o
banco principal nem credenciais reais; a senha abaixo é gerada para o teste.

## PowerShell

```powershell
$testId = [guid]::NewGuid().ToString('N').Substring(0, 12)
$testProject = "naporta-it-$testId"
$env:POSTGRES_USER = 'naporta_test'
$env:POSTGRES_PASSWORD = [guid]::NewGuid().ToString('N')
$env:POSTGRES_DB = "naporta_orders_test_$testId"
$env:POSTGRES_PORT = '55433'
$env:DATABASE_URL = "postgresql://$($env:POSTGRES_USER):$($env:POSTGRES_PASSWORD)@127.0.0.1:$($env:POSTGRES_PORT)/$($env:POSTGRES_DB)?schema=public"
$env:TEST_DATABASE_URL = $env:DATABASE_URL
npm run prisma:generate
docker compose -p $testProject up -d --wait postgres
npm run db:migrate:deploy
npm run test:integration
docker compose -p $testProject down
```

## Bash

Requer `openssl`:

```bash
test_id="$(openssl rand -hex 6)"
test_project="naporta-it-$test_id"
export POSTGRES_USER=naporta_test
export POSTGRES_PASSWORD="$(openssl rand -hex 16)"
export POSTGRES_DB="naporta_orders_test_$test_id"
export POSTGRES_PORT=55433
export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT}/${POSTGRES_DB}?schema=public"
export TEST_DATABASE_URL="$DATABASE_URL"
npm run prisma:generate
docker compose -p "$test_project" up -d --wait postgres
npm run db:migrate:deploy
npm run test:integration
docker compose -p "$test_project" down
```

Escolha outra porta livre se `55433` estiver ocupada. A suíte remove os
registros que criou. Execute o `down` mesmo após uma falha: ele remove o
container e a rede do projeto de testes, mas **preserva o volume e os dados**.
Identifique o volume pelo nome exclusivo do projeto antes de decidir removê-lo;
não toque em recursos preexistentes. Feche o terminal separado para descartar
as variáveis de teste. Não imprima nem compartilhe credenciais ou tokens.
