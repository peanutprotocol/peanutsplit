---
title: 'Despesas de viagem em grupo sem planilha'
description: 'Registre os gastos da viagem em uma sala compartilhada. Cada pessoa adiciona o que pagou, e o Split calcula os saldos e os pagamentos pendentes.'
date: 2026-07-30
type: capture
headTerm: 'despesas de viagem em grupo'
intent: modelo de planilha de despesas de viagem em grupo
tags: [viagens, planilhas]
claims:
    - link-is-the-key
    - room-size-20
    - automatic-currency-conversion
    - netting-is-bounded-exact
    - settle-is-a-record
    - offline-creates-only
    - hosted-price
cast:
    - mo
faqs:
    - question: 'Existe um modelo de planilha para despesas de viagem em grupo?'
      answer: 'Uma planilha de despesas de viagem precisa de colunas para data, descrição, valor, moeda, quem pagou e a parte de cada pessoa. O Split é uma alternativa para todos registrarem despesas por um link compartilhado.'
    - question: 'Como saber quem deve a quem no fim da viagem?'
      answer: 'Subtraia a parte de cada pessoa do total que ela pagou. O Split calcula esses saldos e sugere os pagamentos para acertar as contas.'
    - question: 'Como dividir a gasolina numa viagem de carro?'
      answer: 'Registre cada abastecimento em nome de quem pagou e selecione os passageiros que dividiram o custo. Despesas adicionadas sem conexão ficam no dispositivo até o sinal voltar.'
draft: true
---

# Despesas de viagem em grupo sem planilha

Para controlar os gastos de uma viagem, registre o valor, quem pagou e quem participou de cada despesa. No Peanut Split, todos podem adicionar esses dados pelo mesmo link. A sala atualiza os saldos e sugere quem paga a quem.

<Steps title="Organize os gastos da viagem">
<Step title="Crie uma sala">Dê a ela o nome da viagem e escolha a moeda dos saldos.</Step>
<Step title="Compartilhe o link">Cada pessoa digita o nome para entrar. Fixe o link no grupo para abrir a sala novamente.</Step>
<Step title="Adicione as despesas compartilhadas">Registre hospedagem, comida e transporte em nome de quem pagou. Selecione quem participou de cada despesa. <Cast name="mo" size="sm" /></Step>
</Steps>

## Se você prefere uma planilha

Use colunas para data, descrição, valor, moeda, quem pagou e a parte de cada pessoa. O saldo de cada um é o que pagou menos a parte que lhe cabe.

Uma planilha permite adaptar fórmulas e adicionar colunas. Funciona bem quando alguém cuida de atualizá-la. O Split é útil quando várias pessoas querem registrar as próprias despesas pelo celular.

## Bom saber

O Split é grátis e não tem plano pago.

O Split converte automaticamente 156 moedas pela taxa de câmbio indicativa do dia. Seu banco pode usar outra taxa.

Você pode adicionar despesas sem conexão. Elas ficam no dispositivo e são enviadas quando a conexão volta. Editar despesas e registrar pagamentos exige conexão.

Paguem em dinheiro, por transferência ou pelo meio que combinarem e registrem o pagamento no Split. O Split não movimenta dinheiro nem verifica o pagamento com o banco.

<CTA
  title="Crie uma sala para sua viagem"
  body="Compartilhe o link para que todos possam adicionar despesas. Não é preciso criar uma conta nem baixar nada."
  text="Criar um split" />

<FAQ>
<FAQItem question="Existe um modelo de planilha para despesas de viagem em grupo?">Uma planilha de despesas de viagem precisa de colunas para data, descrição, valor, moeda, quem pagou e a parte de cada pessoa. O Split é uma alternativa para todos registrarem despesas por um link compartilhado.</FAQItem>
<FAQItem question="Como saber quem deve a quem no fim da viagem?">Subtraia a parte de cada pessoa do total que ela pagou. O Split calcula esses saldos e sugere os pagamentos para acertar as contas.</FAQItem>
<FAQItem question="Como dividir a gasolina numa viagem de carro?">Registre cada abastecimento em nome de quem pagou e selecione os passageiros que dividiram o custo. Despesas adicionadas sem conexão ficam no dispositivo até o sinal voltar.</FAQItem>
</FAQ>

<RelatedPages>
<RelatedLink href="/pt-br/blog/fronting-a-group-trip">Adiantar o pagamento de uma viagem em grupo</RelatedLink>
<RelatedLink href="/pt-br/blog/split-expenses-across-currencies">Dividir despesas em moedas diferentes</RelatedLink>
<RelatedLink href="/pt-br/splitwise-alternative">Como o Split se compara ao Splitwise</RelatedLink>
</RelatedPages>
