# Segurança da NestFund

A NestFund é uma app **pessoal e self-hosted**, sem contas de utilizador. Por defeito não pede palavra-passe: protege-a ao nível da rede (Cloudflare Access / VPN) ou com a autenticação básica integrada.

## Como a NestFund te protege

| Área | O que faz |
|---|---|
| **Chave da API do Trading 212** | Guardada cifrada (AES-256-GCM, IV aleatório, deteção de adulteração). A chave de cifra vem de `NESTFUND_SECRET` ou de `secret.key` (modo 0600) no volume. A UI só vê os últimos 4 caracteres. Nunca vai em exportações, backups JSON, logs nem respostas. |
| **Trading 212 só de leitura** | Lista fixa de 3 endpoints `GET`; qualquer outro caminho é bloqueado antes de haver rede. Redirecionamentos são tratados como falha, para a chave só chegar ao anfitrião da Trading 212. |
| **Falhas da API** | Uma falha só atualiza o estado da ligação; saldos, histórico e dados manuais não são tocados. Há bloqueio contra sincronizações em simultâneo e sem tentativas automáticas após chave inválida. |
| **Autenticação (opcional)** | `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD`. Comparação em tempo constante e bloqueio temporário (429) após 10 tentativas falhadas do mesmo endereço em 10 minutos. |
| **CSRF** | As Server Actions do Next.js recusam pedidos cujo `Origin` não corresponde ao anfitrião. Nenhum `GET` altera dados. |
| **XSS** | React escapa todo o conteúdo; não há `dangerouslySetInnerHTML`. CSP restritiva (`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`), `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. |
| **Injeção SQL** | Todas as consultas usam parâmetros; os poucos nomes de coluna dinâmicos vêm de listas fixas. |
| **Injeção em CSV/Excel** | Todas as células exportadas que começam por `= + - @` levam um apóstrofo. |
| **Validação** | Valores monetários (até 1 000 000 000 €, sem `Infinity`/NaN/expoentes), datas ISO, meses, IDs inteiros positivos, enumerações, categorias que existem, texto com limite de tamanho. |
| **Redirecionamentos** | Só caminhos locais (rejeita `//`, `\`, URLs absolutas e caracteres de controlo). |
| **Anexos** | Só imagens e PDF (tipo **e** extensão), máx. 10 MB, nome saneado; ao servir: lista de extensões, nome estrito e CSP `sandbox`. |
| **Limites de pedidos** | Exportações, descarga de backups, criar backup, importar, ligar Trading 212 e repor dados. |
| **Logs** | Só tipo de erro e mensagem truncada e com segredos mascarados; nunca stacks, corpos de pedidos ou cabeçalhos. |
| **Ações destrutivas** | Apagar transações, categorias, objetivos, linhas de orçamento, saldos, regras, desligar o Trading 212 e repor dados pedem confirmação. Antes de repor, importar ou aplicar uma regra a transações antigas é guardada uma cópia da base de dados. |
| **Backups** | Pasta `0700` e ficheiros `0600`. Só os `.json` (sem segredos) podem ser descarregados pela web; as cópias `.db` ficam no volume. |

## Limitações conhecidas

- **Sem palavra-passe por defeito.** Quem alcançar o endereço vê tudo. A página *Definições* avisa quando a autenticação básica não está ativa.
- A CSP precisa de `'unsafe-inline'` para scripts e estilos (exigência do Next.js sem nonces).
- Os limites de pedidos são em memória, por processo, e reiniciam com o servidor. Sem cabeçalhos de proxy (`CF-Connecting-IP`, `X-Forwarded-For`) todos os clientes contam como um só; um atacante pode então bloquear temporariamente o início de sessão, mas nunca ultrapassá-lo.
- `secret.key` e a base de dados estão no mesmo volume: protege contra fugas da base ou de um backup JSON, não contra quem tem o volume inteiro. Define `NESTFUND_SECRET` para separar a chave.
- `npm audit` assinala o PostCSS embutido no Next.js (processamento de CSS no *build*, não no servidor em execução). A correção obriga a Next 16 (alteração de versão maior) e fica para uma atualização planeada.

## Reportar um problema

Abre uma *issue* privada no repositório ou contacta o autor. Não incluas chaves de API nem dados pessoais.
