# PCAARB — Política de Privacidade (RASCUNHO — não publicado, não vinculante)

> **Isto NÃO é uma política de privacidade válida ainda.** É um rascunho de
> ponto de partida alinhado à LGPD (Lei 13.709/2018). Preencha os campos
> entre `[colchetes]` e leve a um advogado (idealmente com experiência em
> proteção de dados) para revisão antes de publicar. Alguns itens (prazo de
> retenção real, sub-processadores exatos, encarregado/DPO) dependem de
> decisões operacionais que só o Cliente final (dono do PCAARB) pode tomar.

**Última atualização:** [DATA]

## 1. Quem somos e papel no tratamento

**[RAZÃO SOCIAL]** (CNPJ **[CNPJ]**) opera o PCAARB. Nesta política,
distinguimos dois papéis (LGPD art. 5º, VI e VII):

- **PCAARB como controlador:** dados dos usuários da própria plataforma —
  dono da loja, administradores, operadores de caixa que fazem login no
  sistema (nome, e-mail, senha com hash, papel/permissão).
- **PCAARB como operador:** dados que o Cliente (a loja) cadastra sobre
  *seus próprios* clientes e fornecedores (nome, CPF/CNPJ, contato, histórico
  de compra/fidelidade) — aqui o Cliente é o controlador, e o PCAARB só
  trata esses dados a mando dele, para prestar o serviço contratado.

## 2. Encarregado de dados (DPO)

**[NOME DO ENCARREGADO]** — contato: **[E-MAIL DO DPO]**.
*(A LGPD exige um encarregado indicado publicamente — preencher antes de publicar.)*

## 3. Quais dados coletamos

| Categoria | Exemplos | Papel do PCAARB |
|---|---|---|
| Cadastro do usuário da plataforma | Nome, e-mail, senha (hash bcrypt), papel | Controlador |
| Dados da empresa cliente | Razão social, CPF/CNPJ, status de assinatura | Controlador |
| Dados de clientes/fornecedores do Cliente | Nome, CPF/CNPJ, contato, histórico de compra, saldo de pontos de fidelidade | Operador |
| Dados de uso/técnicos | IP, logs de acesso, ação realizada (auditoria), user-agent | Controlador |
| Dados de pagamento da assinatura | Processado pelo gateway de pagamento — **o PCAARB não armazena número de cartão** | Controlador (metadados da cobrança), gateway trata o dado sensível |

Não coletamos dados sensíveis (LGPD art. 5º, II) deliberadamente — se algum
módulo futuro vier a coletar (ex.: dados de saúde em um cadastro de cliente
de farmácia), esta política precisa ser revisada antes do lançamento.

## 4. Para que usamos os dados

- Prestar o serviço contratado (autenticação, PDV, estoque, financeiro,
  fidelidade, comissão, relatórios);
- Processar cobrança da assinatura;
- Enviar comunicações operacionais (confirmação de conta, convite de
  usuário, aviso de pagamento pendente);
- Cumprir obrigação legal/regulatória quando aplicável;
- Melhorar o produto (uso agregado/anonimizado, quando possível).

Não vendemos dados pessoais a terceiros. Não usamos os dados dos clientes
finais do Cliente (a loja) para fins próprios de marketing do PCAARB.

## 5. Base legal (LGPD art. 7º)

- **Execução de contrato:** dados necessários pra operar a conta e prestar
  o serviço assinado.
- **Legítimo interesse:** segurança, prevenção a fraude, logs de auditoria.
- **Consentimento:** comunicações de marketing opcionais (quando existirem),
  com opt-out sempre disponível.
- **Cumprimento de obrigação legal:** retenção fiscal quando exigida.

## 6. Com quem compartilhamos

- **Gateway de pagamento** ([Pagar.me]) — para processar cobrança de
  assinatura e pagamentos no PDV.
- **Provedor fiscal** ([Focus NFe/eNotas/PlugNotas]) — para emissão de
  NFC-e, quando aplicável.
- **Provedor de hospedagem/infraestrutura** ([Railway/Fly.io/Vercel]) —
  hospeda o banco de dados e a aplicação.
- **Provedor de e-mail transacional** ([Resend]) — envio de convites e
  notificações do sistema.

Todos tratados como sub-processadores, sob obrigação contratual de proteger
os dados na mesma medida desta política.

## 7. Por quanto tempo guardamos

- Dados da conta: enquanto a assinatura estiver ativa, mais **[prazo — ex.:
  90 dias]** após cancelamento, para eventual reativação.
- Dados fiscais (notas emitidas): pelo prazo exigido pela legislação fiscal
  brasileira (geralmente 5 anos).
- Logs de auditoria/segurança: **[prazo — ex.: 12 meses]**.

Após esses prazos, os dados são anonimizados ou eliminados, salvo obrigação
legal de retenção mais longa.

## 8. Seus direitos (LGPD art. 18)

Qualquer titular de dados pode solicitar, mediante contato com
**[E-MAIL DE CONTATO]**:

- Confirmação da existência de tratamento;
- Acesso aos dados;
- Correção de dados incompletos/desatualizados;
- Anonimização, bloqueio ou eliminação de dados desnecessários;
- Portabilidade a outro fornecedor;
- Eliminação dos dados tratados com consentimento;
- Informação sobre com quem os dados foram compartilhados;
- Revogação do consentimento, quando essa for a base legal.

Para dados tratados pelo PCAARB **como operador** (dados de clientes finais
de uma loja cliente), a solicitação deve ser direcionada à loja
(controladora) — o PCAARB auxilia a loja a atender.

## 9. Segurança

- Senhas armazenadas com hash (bcrypt), nunca em texto plano.
- Isolamento de dados entre empresas clientes por Row-Level Security no
  banco de dados, reforçado por controle de acesso na aplicação.
- Conexões criptografadas (HTTPS/TLS) [confirmar antes de publicar — depende
  do domínio/hospedagem de produção estarem configurados].
- Acesso à infraestrutura de produção restrito à equipe técnica.

Nenhum sistema é 100% livre de risco — em caso de incidente de segurança
relevante, notificaremos a ANPD e os titulares afetados conforme exigido
pela LGPD (art. 48).

## 10. Cookies

[Preencher conforme o que a aplicação realmente usa — hoje o acesso usa
token JWT em armazenamento local do navegador, não cookie de terceiros de
rastreamento. Revisar se ferramentas de analytics/marketing forem
adicionadas no futuro.]

## 11. Alterações desta política

Alterações materiais são avisadas por e-mail com antecedência mínima de
**[15] dias**.

## 12. Contato

Dúvidas sobre esta política ou solicitações de direitos de titular:
**[E-MAIL DE CONTATO]**.

---
Ver também: [04-termos-de-uso-RASCUNHO.md](04-termos-de-uso-RASCUNHO.md)
