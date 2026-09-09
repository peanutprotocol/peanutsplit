---
draft: true
title: 'Escanear recibo e dividir a conta'
description: 'Fotografe o recibo, confira os valores e atribua os itens a quem dividiu cada um. Veja o limite de leituras e o que acontece com a foto.'
date: 2026-07-28
type: guide
v2Only: true
tags: [recibos, jantares]
claims:
    - no-app
    - hosted-price
    - link-is-the-key
    - receipt-scan-30-a-day
    - receipt-photo-handling
cast: []
faqs:
    - question: 'Preciso de uma conta para escanear o recibo?'
      answer: 'Você pode escanear um recibo no Split sem criar uma conta. Entre na sala pelo link e use o botão de escanear, se estiver disponível.'
    - question: 'E se a leitura deixar uma linha de fora?'
      answer: 'Acrescente o item na tela de revisão antes de atribuir as partes. Você também pode corrigir valores e excluir linhas incorretas.'
    - question: 'Posso dividir um item entre várias pessoas?'
      answer: 'Sim. Selecione quem compartilhou aquela linha e o valor será dividido igualmente entre essas pessoas.'
---

<Hero
  eyebrow="guia"
  title="Escaneie um recibo e divida a conta por item"
  subtitle="Confira as linhas do recibo e escolha quem divide cada item."
  cta="Criar um split"
  ctaHint="Sem e-mail, sem senha, sem download." />

Para dividir uma conta por item no Peanut Split, fotografe o recibo, confira a leitura e selecione quem consumiu cada item. A despesa é salva depois da sua aprovação.

A divisão por item ajuda quando cada pessoa pediu algo diferente ou só algumas dividiram as bebidas. Se todos vão pagar a mesma parte, lance o total como uma despesa dividida por igual.

<Steps title="Escaneie e confira a conta">
<Step title="Tire uma foto legível">Inclua o recibo inteiro e use boa iluminação. Alise as dobras e evite um ângulo que dificulte a leitura.</Step>
<Step title="Revise as linhas">Corrija descrições e valores, exclua linhas incorretas e acrescente o que faltou. O Split compara a soma com o total impresso e mostra a diferença se não baterem.</Step>
<Step title="Escolha quem divide cada item">Selecione as pessoas que consumiram aquela linha. Se houver mais de uma, o valor é dividido igualmente entre elas. Confira os valores por pessoa antes de salvar.</Step>
</Steps>

## Quando vale lançar manualmente

Para um recibo curto, digitar o total e definir valores exatos pode dar menos trabalho do que conferir uma leitura. Isso também serve quando a impressão está apagada demais.

Se a sua sala não tem o botão de escanear recibo, a função não está disponível naquela instalação. Você ainda pode lançar uma despesa comum e definir a parte exata de cada pessoa.

## O que acontece com a foto

O Split envia a foto ao Gemini para leitura, pelo OpenRouter ou diretamente. O servidor do Split não salva a imagem, o nome do estabelecimento nem as linhas extraídas. Ele salva a despesa que você aprova.

As solicitações pelo OpenRouter exigem provedores que neguem coleta de dados e usem retenção zero. A conexão direta com o Gemini só é habilitada para um projeto pago. Os termos do Google permitem registros temporários de solicitações e respostas para monitoramento de abuso.

Se você compartilhar uma foto pelo Android depois de adicionar o site à tela inicial, o navegador mantém uma cópia temporária no aparelho enquanto você escolhe a sala. Ela pode ser usada uma vez e é recusada depois de dez minutos. Uma cópia vencida é removida na próxima vez que o Split abrir.

## Limite de leituras

Escanear recibos é gratuito. Uma sala pode ler até 30 contas por dia. O limite se recompõe aos poucos e não é reiniciado à meia-noite. Não existe uma opção paga para aumentá-lo.

<CTA
  title="Teste com um recibo"
  body="Abra uma sala e confira os itens antes de salvar a despesa."
  text="Criar um split" />

<FAQ title="Perguntas">
<FAQItem question="Preciso de uma conta para escanear o recibo?">Você pode escanear um recibo no Split sem criar uma conta. Entre na sala pelo link e use o botão de escanear, se estiver disponível.</FAQItem>
<FAQItem question="E se a leitura deixar uma linha de fora?">Acrescente o item na tela de revisão antes de atribuir as partes. Você também pode corrigir valores e excluir linhas incorretas.</FAQItem>
<FAQItem question="Posso dividir um item entre várias pessoas?">Sim. Selecione quem compartilhou aquela linha e o valor será dividido igualmente entre essas pessoas.</FAQItem>
</FAQ>

<RelatedPages>
<RelatedLink href="/pt-br/blog/split-expenses-in-real-time">Como as despesas compartilhadas se atualizam</RelatedLink>
<RelatedLink href="/pt-br/blog/split-bills-without-an-app">Dividir despesas sem baixar um app</RelatedLink>
<RelatedLink href="/pt-br/splitwise-alternative">Como o Split se compara ao Splitwise</RelatedLink>
</RelatedPages>
