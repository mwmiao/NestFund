# NestFund

**🇵🇹 Português** · [🇺🇸 English](README.en-US.md)

Aplicação web self-hosted para gestão de finanças pessoais: planeamento do salário, despesas fixas, lazer, reserva de emergência, entrada para habitação e investimento em ETF — com registo manual de despesas para não depender das apps do banco.

> ⚠️ O NestFund mostra apenas simulações e registos. **Não constitui aconselhamento financeiro.**

## Funcionalidades

- **Painel mensal** — "ainda podes gastar", poupança do mês, valor para a entrada de casa, valor do ETF, saldos por conta, gastos por categoria, orçamento vs. real e alertas de orçamento negativo.
- **Contas com propósito** — cada transação pertence a uma conta, com saldos, movimentos e estatísticas separados:

  | Conta | Propósito |
  |---|---|
  | **Banco CTT** | Ordenado, despesas correntes, transferências |
  | **Revolut** | Lazer e compras pessoais (envelope de lazer) |
  | **Trading 212** | Só ETF de longo prazo — nunca conta como dinheiro para gastar |
  | **Trade Republic** | Poupança intocável: reserva de emergência + entrada de casa (TANB) |
  | **Cartão de refeição** | Só alimentação — aparece nas estatísticas, nunca no dinheiro disponível |
  | Dinheiro / Outro | Restantes casos |

- **Orçamento** editável por mês, com rubricas com data de início/fim (ex.: Muay Thai a partir de janeiro), comparação 1.750 € vs 1.800 €, planeado vs. real e perfil base.
- **Transações** — compra, despesa, pagamento, receita e **transferência** entre contas; categoria/subcategoria, método (cartão, MB Way, débito direto…), loja, notas, anexo (imagem/PDF), recorrência mensal/trimestral/anual; filtros, pesquisa, exportação e importação CSV.
- **Categorias** predefinidas (traduzidas) e personalizadas, com orçamento mensal.
- **Objetivos** com valor-alvo, contribuição mensal, data-alvo e progresso. Objetivos ligados a uma conta usam o saldo real — a Trade Republic preenche primeiro a reserva de emergência e o restante conta para a casa.
- **Simuladores** — entrada para casa (juros compostos mensais, TANB escalonada 3% até 50.000 € e 2,5% acima, **juros líquidos de 28% de IRS**, marcos a 3/5/7/10 anos) e ETF (projeção nominal, sem garantia de retorno).
- **Carteira** — Trading 212 (saldo, investido, ganho/perda não realizado, %), Trade Republic (saldo e juros líquidos estimados) e registo de saldos de todas as contas.
- **Histórico** — orçamentos mês a mês, poupança mensal e acumulada, evolução do ETF e da conta da casa, despesas por categoria.
- **pt-PT / en-US** com seletor no cabeçalho (pt-PT por defeito), **dark mode por defeito**, design responsivo com botão rápido "+" no telemóvel.

### Como os números são calculados

- **Disponível para atribuir** = rendimento − todas as rubricas planeadas.
- **Ainda podes gastar** (disponível real) = rendimento − fixas − ETF − poupança − despesas variáveis registadas.
- O **cartão de refeição** nunca entra no dinheiro disponível; as **transferências** nunca são despesa.
- Despesas fixas registadas como transações na categoria da rubrica fixa (ex.: ginásio) **não são contadas duas vezes**.
- Uma receita na categoria **Ordenado** substitui o salário previsto do mês pelo valor real recebido.
- **Saldo de uma conta** = último saldo registado (Carteira → Registar saldo) + movimentos posteriores.
- **Taxa de poupança** = (ETF + poupança planeados) ÷ rendimento.

## Correr localmente

Requisitos: Node.js 20+ (recomendado 22).

```bash
npm install
npm run dev        # http://localhost:777
```

Outros comandos:

```bash
npm test           # testes (juros compostos, taxa de poupança, objetivos, categorias, contas…)
npm run typecheck
npm run build && npm start
```

Os dados ficam em `./data/nestfund.db` (SQLite) e os anexos em `./data/uploads`. Na primeira execução são carregados dados de exemplo realistas (desativa com `SEED_SAMPLE_DATA=false`). Para recomeçar do zero, apaga a pasta `data/`.

## Deploy com Docker Compose (NAS)

1. Copia `docker-compose.yml` e `.env.example` (como `.env`) para uma pasta no NAS.
2. Ajusta `NESTFUND_IMAGE` para `<o-teu-utilizador-docker-hub>/nestfund:latest`.
3. Arranca:

```bash
docker compose up -d
```

A app fica em `http://<ip-do-nas>:777`. Os dados persistem no volume `nestfund-data` (montado em `/data`).

| Variável | Predefinição | Descrição |
|---|---|---|
| `NESTFUND_IMAGE` | `mwmiao/nestfund:latest` | Imagem Docker |
| `NESTFUND_PORT` | `777` | Porto no anfitrião |
| `TZ` | `Europe/Lisbon` | Fuso horário ("hoje", recorrências) |
| `SEED_SAMPLE_DATA` | `true` | Dados de exemplo na primeira execução |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` | vazio | Autenticação HTTP Basic opcional |

**Bind mount em vez de volume:** se preferires uma pasta do NAS (ex.: `/volume1/docker/nestfund:/data`), dá permissões ao utilizador do contentor (UID 1000): `sudo chown -R 1000:1000 /volume1/docker/nestfund`.

**Backup:** copia `nestfund.db` (e `uploads/`) com o contentor parado, ou usa `sqlite3 nestfund.db ".backup backup.db"`.

### Atualização automática com Watchtower

O serviço tem a label `com.centurylinklabs.watchtower.enable=true`. Com o Watchtower já a correr no NAS, cada nova imagem `:latest` publicada é descarregada e o contentor é recriado automaticamente — os dados ficam no volume. As alterações ao esquema da base de dados são aplicadas no arranque (`PRAGMA user_version`), sem passos manuais.

Se o teu Watchtower só atualiza contentores com label, arranca-o com `--label-enable`; caso contrário, a label é ignorada e todos os contentores são vigiados.

## Publicar via GitHub Actions

O workflow [`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml) corre os testes e faz build **multi-arch (linux/amd64 + linux/arm64)** e push para o Docker Hub com os secrets `DOCKERHUB_USERNAME` e `DOCKERHUB_TOKEN`.

| Evento | Tags publicadas |
|---|---|
| Push para `main` | `latest`, `sha-<commit>` |
| Tag `v1.0.0` | `1.0.0`, `1.0`, `sha-<commit>` |
| Pull request | Só build, sem push |

Para lançar uma versão:

```bash
git tag v1.0.0
```

```bash
git push origin v1.0.0
```

## Expor com Cloudflare Tunnel

Com o `cloudflared` já configurado, adiciona uma entrada de ingress a apontar para o NestFund:

```yaml
# config.yml do cloudflared
ingress:
  - hostname: nestfund.o-teu-dominio.pt
    service: http://<ip-do-nas>:777   # ou http://nestfund:777 se o cloudflared estiver na mesma rede Docker
  - service: http_status:404
```

Ou, no painel Zero Trust → Networks → Tunnels → *Public Hostname*: hostname `nestfund.o-teu-dominio.pt`, serviço `HTTP`, URL `<ip-do-nas>:777`.

**Protege o acesso.** A app não tem contas de utilizador. Recomendado: **Cloudflare Access** (Zero Trust → Access → Applications → Self-hosted) com uma política que só permite o teu e-mail. Em alternativa (ou em complemento), define `BASIC_AUTH_USER` e `BASIC_AUTH_PASSWORD`. O endpoint `/api/health` fica sempre aberto para o healthcheck.

Notas: mantém o cabeçalho `Host` original (não definas `httpHostHeader`), para as server actions do Next.js validarem a origem corretamente.

## Estrutura

```
src/
  app/            páginas (painel, orçamento, transações, objetivos, simuladores, carteira, histórico), API e server actions
  components/     componentes reutilizáveis (UI, gráficos, formulários, contas, layout)
  i18n/           sistema de tradução + locales/pt-PT.json e locales/en-US.json
  lib/            cálculos puros (calc.ts), base de dados, repositório, CSV, datas, formatação, seed
tests/            testes Vitest
```

## Licença

Uso pessoal.
