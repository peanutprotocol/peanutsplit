---
title: Dividir despesas em tempo real
description: Todo mundo vê o mesmo total no próprio celular, sem ninguém atualizar. O que uma lista de despesas ao vivo resolve na mesa, e o que ela ainda não faz.
date: 2026-07-28
type: guide
tags: [groups, live]
claims:
    - settle-is-a-record
    - link-is-the-key
    - live-room-stream
cast: []
faqs:
    - question: As outras pessoas precisam atualizar para ver minha despesa?
      answer: Não. Toda sala aberta mantém uma conexão contínua, e uma despesa que você lança aparece nos outros celulares um ou dois segundos depois. Ninguém precisa recarregar, e ninguém precisa ser avisado para fazer isso.
    - question: O que acontece se a conexão de alguém cair?
      answer: A sala continua checando sozinha, mais ou menos a cada oito segundos, e reconecta em segundo plano. Quando volta, a pessoa já está atualizada. Não existe um estado de "sala parada" para ficar preso.
    - question: Duas pessoas podem lançar uma despesa ao mesmo tempo?
      answer: Podem. As duas caem, as duas aparecem para todo mundo, e os saldos são recalculados a partir da lista inteira, em vez de só ajustados, então duas gravações simultâneas não conseguem deixar um total quase certo.
    - question: A atualização ao vivo gasta minha bateria?
      answer: Não deveria. Enquanto a conexão está aberta, a sala para de checar num intervalo curto e só verifica a cada 45 segundos como reforço, então uma sala aberta gasta menos que uma que fica martelando o servidor atrás de mudanças.
draft: true
---

<Hero
  eyebrow="ao vivo"
  title="Todo mundo olhando para o mesmo número"
  subtitle="Seis pessoas, uma noite, e quatro delas lançando coisas. Uma lista compartilhada que só atualiza quando você puxa a tela para baixo vira motivo de discussão."
  cta="Criar um split"
  ctaHint="Dez segundos. Sem e-mail, sem senha, sem download." />

Tem uma rodada específica de mensagens que rola em toda viagem, e não é sobre dinheiro. É sobre quem está vendo o quê.

"Você lançou o táxi?" "Lancei mais cedo." "Não tô vendo." "Tenta atualizar." "Continua sem aparecer." Alguém lança de novo. Agora está lá duas vezes, e quem percebe é quem vai ter que explicar.

Nada disso é problema de conta. São quatro pessoas olhando para quatro cópias um pouco diferentes da mesma lista.

## O que "ao vivo" significa numa sala

Toda sala aberta mantém uma conexão contínua com o servidor. Quando alguém lança uma despesa, edita uma, registra um pagamento, reage a algo ou muda as cores da sala, os outros celulares são avisados e buscam a sala de novo — um ou dois segundos, sem atualizar, sem tocar em nada.

<Steps title="O que isso muda na mesa">
<Step title="Ninguém pergunta se caiu">Quem lançou vê na lista; todo mundo também, ao mesmo tempo. A pergunta some porque a resposta está na tela.</Step>
<Step title="Nada entra duas vezes">Duplicata nasce da dúvida. Quando o táxi está ali à vista, ninguém lança o táxi de novo.</Step>
<Step title="Os totais estão certos enquanto vocês ainda estão juntos">Dá para acertar as contas ali na mesa, em vez de três dias depois, porque o número na frente de todo mundo é o atual.</Step>
</Steps>

## O que acontece quando a conexão está ruim

Essa é a parte que decide se "tempo real" é uma vantagem ou um problema. Uma sala que depende só da conexão contínua é uma sala que fica desatualizada sem avisar dentro de um elevador.

<Callout title="A conexão contínua nunca é o único caminho">
A checagem automática nunca para. Enquanto a conexão está realmente aberta, a sala estica o intervalo e checa a cada 45 segundos — a conexão está fazendo o trabalho, então esse intervalo é só um reforço. No momento em que a conexão cai, isso passa para cada oito segundos, e a reconexão é tentada em segundo plano com um atraso crescente e aleatório, para que um servidor que reinicia não traga todos os celulares de todas as salas de volta no mesmo milésimo de segundo.
</Callout>

O efeito é que não existe um estado travado para você ficar preso, nem nada para tocar e recuperar. Um celular que ficou dez minutos num túnel se atualiza sozinho.

## O que a atualização ao vivo não resolve

<Checklist title="Ainda é verdade, e vale dizer">
<ChecklistItem title="Uma sala não é um chat">Não existe conversa por mensagem, e isso é de propósito. Você tem reações nas despesas e esse é todo o espaço social. A conversa já está rolando no grupo do WhatsApp onde você colou o link.</ChecklistItem>
<ChecklistItem title="Ao vivo não é o mesmo que confirmado">Ver um pagamento aparecer significa que alguém registrou, não que um banco moveu alguma coisa. Nenhum app de divisão de contas está de olho na sua conta, e vale saber qual das duas coisas você está olhando.</ChecklistItem>
<ChecklistItem title="Alguém ainda precisa digitar">A conta não se lança sozinha. A atualização ao vivo faz todo mundo ver uma despesa rápido; ela não decide o que a despesa deve dizer.</ChecklistItem>
</Checklist>

<CTA
  title="Cole um link, acompanhe uma lista"
  body="Todo mundo abre a mesma sala e lança o que pagou. Sem contas, sem convidar um por um, nada para atualizar."
  text="Criar um split" />

<FAQ>
<FAQItem question="As outras pessoas precisam atualizar para ver minha despesa?">Não. Toda sala aberta mantém uma conexão contínua, e uma despesa que você lança aparece nos outros celulares um ou dois segundos depois.</FAQItem>
<FAQItem question="O que acontece se a conexão de alguém cair?">A sala continua checando sozinha, mais ou menos a cada oito segundos, e reconecta em segundo plano. Quando volta, a pessoa já está atualizada.</FAQItem>
<FAQItem question="Duas pessoas podem lançar uma despesa ao mesmo tempo?">Podem. As duas caem, as duas aparecem para todo mundo, e os saldos são recalculados a partir da lista inteira, em vez de só ajustados, então duas gravações simultâneas não conseguem deixar um total quase certo.</FAQItem>
<FAQItem question="A atualização ao vivo gasta minha bateria?">Não deveria. Enquanto a conexão está aberta, a sala para de checar num intervalo curto e só verifica a cada 45 segundos como reforço.</FAQItem>
</FAQ>

<RelatedPages>
<RelatedLink href="/pt-br/blog/split-expenses-offline">Lançar despesas onde não tem sinal</RelatedLink>
<RelatedLink href="/pt-br/blog/split-a-group-trip-across-countries">Dividir uma viagem em grupo entre países e moedas</RelatedLink>
<RelatedLink href="/pt-br/blog/split-bills-without-an-app">Dividir contas sem obrigar ninguém a se cadastrar</RelatedLink>
</RelatedPages>
