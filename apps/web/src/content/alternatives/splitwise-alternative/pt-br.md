---
title: 'Alternativa ao Splitwise grátis e sem conta'
description: 'Use o Peanut Split sem cadastro nem limite diário de despesas. Compare a conversão de moedas e compartilhe uma sala com o grupo.'
publicSourceTitle: Alternativa ao Splitwise de código aberto
publicSourceDescription: 'Consulte o código AGPL ou hospede sua cópia. A Squirrel Labs mantém o Peanut Split, e o serviço oficial é grátis.'
date: 2026-07-25
updated: 2026-08-24
type: comparison
releaseGate: public-source
headTerm: alternativa splitwise
tags: [alternativas]
claims:
    - room-size-20
    - hosted-price
    - squirrel-labs-stewardship
    - public-source-and-self-hosting
    - link-is-the-key
    - no-app
    - automatic-currency-conversion
    - netting-is-bounded-exact
    - offline-creates-only
    - settle-is-a-record
    - offline-queue-30
competitorClaims:
    - splitwise-pro-expenses
    - splitwise-pro-currency
    - splitwise-pro-ad-free
    - splitwise-free-daily-cap
publicSourceFaqs:
    - question: 'O Split é FOSS ou só é de uso grátis?'
      answer: 'O Split é grátis, e seu código publicado usa a licença AGPL-3.0-or-later. A licença permite consultar, executar, modificar, compartilhar e hospedar o software conforme suas condições.'
    - question: 'Posso auto-hospedar o Split?'
      answer: 'Sim. O repositório público inclui instruções de implantação, migrações e documentação da API. Você cuida da hospedagem, dos backups, das atualizações e das integrações.'
    - question: 'Quem mantém o Split?'
      answer: 'A Squirrel Labs mantém o Split e paga seus custos, incluindo as horas de trabalho.'
faqs:
    - question: 'Preciso de conta?'
      answer: 'Todos podem entrar em uma sala do Split pelo link e digitar o nome. Não é preciso e-mail, senha ou verificação de identidade.'
    - question: 'Tem limite de quantas despesas dá para lançar?'
      answer: 'Não há limite diário de despesas. Uma sala guarda 500 registros; ao importar um histórico maior, algumas entradas podem ser agrupadas em saldos iniciais.'
---

{/* Citações conferidas contra as fontes indicadas em 2026-08-21. Keep quoted text unchanged.
Sources and claim IDs are recorded in ../_system/competitor-claims.md. */}

<Hero
  eyebrow="Comparativo"
  title="Alternativa ao Splitwise grátis e sem conta"
  subtitle="O Peanut Split é grátis. Compartilhe o link de uma sala, digite seu nome e adicione despesas sem limite diário."
  cta="Criar um split"
  ctaHint="Sem cadastro nem download." />

## Despesas, moedas e preço

O Splitwise inclui estes recursos no Pro:

<Quote source="splitwise.com/pro">
Add as many expenses as you like each day, with no interruptions.
</Quote>

<Quote source="splitwise.com/pro">
Splitwise can convert all your bills to any currency you’d like, using today’s foreign exchange rates.
</Quote>

<Quote source="splitwise.com/pro">
A totally ad-free experience
</Quote>

A central de ajuda descreve o limite diário gratuito:

<Quote source="kb.splitwise.com/pro">
Add as many expenses as you need without hitting a limit (free users can add up to 4 expenses each day).
</Quote>

| Recurso             | Peanut Split                           | Splitwise                                          |
| ------------------- | -------------------------------------- | -------------------------------------------------- |
| Adicionar despesas  | Sem limite diário                      | Contas gratuitas têm limite diário; o Pro o remove |
| Conversão de moedas | 156 moedas pela taxa indicativa do dia | Recurso do Pro                                     |
| Preço               | Grátis, sem plano pago                 | Versão gratuita e assinatura Pro                   |
| Acesso ao grupo     | Link e nome, sem cadastro              | O Splitwise usa contas para acessar o grupo        |

Citações consultadas na [página do Pro](https://www.splitwise.com/pro) e na [central de ajuda](https://kb.splitwise.com/pro/what-is-splitwise-pro-and-who-can-use-it) em 21 de agosto de 2026.

## Usar o Split

Guarde o link no grupo de conversa. Qualquer pessoa com ele pode acessar a sala. Se você perder o link, não há uma conta para recuperar o acesso.

As despesas que você adiciona sem sinal ficam no dispositivo e são enviadas quando a conexão volta. Editar despesas e registrar pagamentos exige conexão.

O Split sugere os pagamentos para acertar as contas. Paguem em dinheiro, por transferência ou por outro meio combinado e registrem o pagamento. O Split não movimenta dinheiro nem verifica pagamentos com o banco.

## Quando vale continuar no Splitwise

Se o grupo já usa o Splitwise e os limites não atrapalham, continuar nele evita uma migração. Confira os recursos que vocês usam antes de mudar, especialmente se dependem de um plano pago.

<PublicSourceOnly>

## Código-fonte e hospedagem própria

O código publicado do Split usa a licença AGPL-3.0-or-later. Você pode consultar, executar, modificar, compartilhar e hospedar o software conforme a licença.

O repositório inclui instruções de implantação, o esquema do banco e as migrações. Se você hospedar, cuida do banco de dados, backups, domínio, TLS, atualizações e integrações.

A Squirrel Labs mantém o Split e paga seus custos, incluindo as horas de trabalho.

O serviço oficial continuará grátis. Se não for possível bancá-lo, ele será encerrado em vez de começar a cobrar.

[Código-fonte, licença e hospedagem](/source)

</PublicSourceOnly>

<CTA
  title="Crie uma sala para seu grupo"
  body="Compartilhe o link para que todos possam adicionar despesas. Não é preciso criar uma conta nem baixar nada."
  text="Criar um split" />

<FAQ>
<PublicSourceOnly>
<FAQItem question="O Split é FOSS ou só é de uso grátis?">O Split é grátis, e seu código publicado usa a licença AGPL-3.0-or-later. A licença permite consultar, executar, modificar, compartilhar e hospedar o software conforme suas condições.</FAQItem>
<FAQItem question="Posso auto-hospedar o Split?">Sim. O repositório público inclui instruções de implantação, migrações e documentação da API. Você cuida da hospedagem, dos backups, das atualizações e das integrações.</FAQItem>
<FAQItem question="Quem mantém o Split?">A Squirrel Labs mantém o Split e paga seus custos, incluindo as horas de trabalho.</FAQItem>
</PublicSourceOnly>
<FAQItem question="Preciso de conta?">Todos podem entrar em uma sala do Split pelo link e digitar o nome. Não é preciso e-mail, senha ou verificação de identidade.</FAQItem>
<FAQItem question="Tem limite de quantas despesas dá para lançar?">Não há limite diário de despesas. Uma sala guarda 500 registros; ao importar um histórico maior, algumas entradas podem ser agrupadas em saldos iniciais.</FAQItem>
</FAQ>

<RelatedPages title="Continue lendo">
<RelatedLink href="/pt-br/settle-up-alternative">Se o grupo está vindo do Settle Up</RelatedLink>
<RelatedLink href="/pt-br/tricount-alternative">Como o Split se compara ao Tricount</RelatedLink>
<RelatedLink href="/pt-br/blog/split-expenses-across-currencies">Dividir despesas em moedas diferentes</RelatedLink>
</RelatedPages>
