# PCAARB — Termos de Uso (RASCUNHO — não publicado, não vinculante)

> **Isto NÃO é um termo de uso válido ainda.** É um rascunho de ponto de partida.
> Preencha os campos entre `[colchetes]` com os dados reais da empresa e leve
> a um advogado para revisão antes de publicar como página do site ou linkar
> no fluxo de cadastro. Só depois dessa revisão isto vira exigível de verdade.

**Última atualização:** [DATA]

## 1. Quem oferece o serviço

O PCAARB é um serviço de software (SaaS) de gestão e ponto de venda para
varejo, oferecido por **[RAZÃO SOCIAL]**, inscrita no CNPJ sob o nº
**[CNPJ]**, com sede em **[ENDEREÇO]** ("PCAARB", "nós").

Estes Termos regem o uso da plataforma por qualquer pessoa física ou jurídica
que crie uma conta ("Cliente", "você").

## 2. O que é o serviço

O PCAARB oferece, por assinatura mensal, um sistema de PDV (ponto de venda),
controle de estoque, financeiro, compras, cadastros de clientes/fornecedores,
relatórios, permissões de usuário, programa de fidelidade e comissão de
vendedores, acessado via navegador.

Emissão de documento fiscal (NFC-e) e processamento de pagamento (cartão/Pix)
no PDV são executados por parceiros terceiros integrados à plataforma —
ver Seção 6.

## 3. Cadastro e conta

- Você deve fornecer informações verdadeiras no cadastro (nome da empresa,
  CPF/CNPJ, e-mail) e mantê-las atualizadas.
- Você é responsável por manter a senha da conta em sigilo e por toda
  atividade realizada com suas credenciais.
- É proibido compartilhar uma conta entre empresas diferentes ou usar
  documento (CPF/CNPJ) de terceiros sem autorização.

## 4. Período de teste, assinatura e cobrança

- Novas contas recebem **14 dias de teste gratuito**, sem necessidade de
  cartão de crédito.
- Ao final do teste, o acesso é bloqueado até a escolha e confirmação de um
  plano pago.
- Planos, preços e o que cada um inclui estão descritos em
  **[LINK PARA PÁGINA DE PREÇOS]** e podem mudar mediante aviso prévio de
  **[30] dias** para assinantes ativos — a mudança de preço nunca é aplicada
  retroativamente ao período já pago.
- A cobrança é mensal, recorrente, processada pelo parceiro de pagamento
  (ver Seção 6). Falha no pagamento gera um período de carência de
  **5 dias** antes do bloqueio do acesso; o histórico de cobrança fica
  disponível na própria plataforma.
- **Cancelamento é livre, a qualquer momento, sem multa.** O cancelamento
  tem efeito imediato — não há reembolso proporcional do período já cobrado
  (modelo simplificado; revisar se um período de carência ou reembolso
  proporcional faz sentido para o negócio).

## 5. Uso permitido

Você concorda em não:

- Usar o serviço para fins ilícitos ou para armazenar/processar dados que
  não tem direito de tratar;
- Tentar acessar dados de outro tenant (outra empresa cliente) ou burlar o
  isolamento de dados da plataforma;
- Fazer engenharia reversa, copiar ou revender o software;
- Sobrecarregar a infraestrutura de propósito (varredura automatizada,
  scraping em massa, etc.).

## 6. Parceiros terceiros (fiscal e pagamento)

O PCAARB integra, mas não presta diretamente, os seguintes serviços:

- **Emissão fiscal (NFC-e):** via [FORNECEDOR — Focus NFe/eNotas/PlugNotas].
  A responsabilidade pela exatidão fiscal dos dados informados (produtos,
  alíquotas, dados da empresa) é do Cliente.
- **Processamento de pagamento (cartão/Pix):** via [FORNECEDOR — Pagar.me].
  O PCAARB não armazena dados de cartão — isso é feito pelo gateway,
  certificado PCI-DSS.

Indisponibilidade desses parceiros pode afetar temporariamente emissão fiscal
ou pagamento — o PCAARB não garante SLA de terceiros além do que esses
parceiros oferecem publicamente.

## 7. Seus dados

Tratamento de dados pessoais é regido pela nossa
**[Política de Privacidade](./05-politica-de-privacidade-RASCUNHO.md)**,
parte integrante destes Termos.

Você é o **controlador** dos dados de seus próprios clientes/fornecedores
cadastrados na plataforma (LGPD); o PCAARB atua como **operador** desses
dados, processando-os apenas para prestar o serviço.

## 8. Disponibilidade e limitação de responsabilidade

- O PCAARB busca alta disponibilidade, mas não garante operação
  ininterrupta — manutenções programadas são avisadas com antecedência
  razoável quando possível.
- Backups do banco de dados são realizados [FREQUÊNCIA — ex.: diariamente],
  mas o Cliente é responsável por exportar seus próprios relatórios
  periodicamente.
- Na máxima extensão permitida por lei, a responsabilidade do PCAARB por
  danos limita-se ao valor pago pelo Cliente nos últimos **[3] meses**.
  Isto exclui lucros cessantes e danos indiretos.

## 9. Rescisão

O PCAARB pode suspender ou encerrar uma conta em caso de violação destes
Termos, fraude, ou não pagamento além do período de carência — com aviso
prévio sempre que possível.

## 10. Alterações destes Termos

Alterações materiais são avisadas por e-mail com antecedência mínima de
**[15] dias**. O uso continuado após a alteração implica aceite.

## 11. Foro e legislação aplicável

Estes Termos são regidos pelas leis brasileiras. Fica eleito o foro da
comarca de **[CIDADE/UF]** para dirimir controvérsias, com renúncia a
qualquer outro, por mais privilegiado que seja.

## 12. Contato

Dúvidas sobre estes Termos: **[E-MAIL DE CONTATO]**.

---
Ver também: [05-politica-de-privacidade-RASCUNHO.md](05-politica-de-privacidade-RASCUNHO.md)
