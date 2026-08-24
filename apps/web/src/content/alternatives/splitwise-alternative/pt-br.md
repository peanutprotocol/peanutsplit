---
title: Alternativa ao Splitwise, grátis e sem limite
description: Uma alternativa ao Splitwise de uso grátis hoje, sem conta nem app. Compartilhe um link, lance despesas sem limite diário e use todos os recursos sem plano pago.
publicSourceTitle: Alternativa ao Splitwise de código aberto
publicSourceDescription: O serviço oficial do Peanut Split é de uso grátis e não tem plano pago. O código AGPL pode ser auto-hospedado, com esquema e limites documentados.
date: 2026-07-25
updated: 2026-08-24
type: comparison
releaseGate: public-source
headTerm: alternativa splitwise
tags: [alternativas]
claims:
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
    - question: O Split é FOSS ou só é de uso grátis?
      answer: As duas coisas, mas são afirmações diferentes. O serviço oficial é de uso grátis e não tem plano pago. O software publicado usa AGPL-3.0-or-later, que permite inspecionar, executar, modificar, compartilhar e auto-hospedar essa versão.
    - question: Posso auto-hospedar o Split?
      answer: Sim. O repositório público inclui Compose, as migrações do PostgreSQL e a documentação do esquema e da API. Você opera o domínio e TLS, o banco de dados, os backups, os segredos, as atualizações, o monitoramento e qualquer integração opcional.
    - question: Quem mantém o Split e por que outro produto pode aparecer?
      answer: A Squirrel Labs é hoje a única mantenedora e paga todos os custos do projeto, incluindo as horas de trabalho e a operação do peanutsplit.com. O serviço oficial pode ter poucas referências discretas e contextuais de pagamento; elas nunca exigem clique, insistem nem bloqueiam recursos, e os forks não precisam mantê-las.
faqs:
    - question: Preciso de conta?
      answer: Não, e nem quem receber o link. Não tem e-mail, não tem senha e não tem cadastro em lugar nenhum do Split.
    - question: Tem limite de quantas despesas dá para lançar?
      answer: Não tem. Lance cinquenta numa tarde, se a viagem for desse tipo.
---

{/* Toda afirmação sobre o Splitwise nesta página é uma citação textual de uma página do Splitwise,
cada uma reaberta e conferida contra o texto dela em 2026-08-21:

- https://www.splitwise.com/pro — as três citações do Pro em "Por que as pessoas procuram outra coisa"
- https://kb.splitwise.com/pro/what-is-splitwise-pro-and-who-can-use-it — a citação do limite diário

As citações ficam em inglês de propósito: são a prova. A linha sobre anúncio é citada do jeito que o
Splitwise escreve, como título e sem ponto final; a versão anterior desta página acrescentava um, e
ponto final é pontuação que não é nossa. O Splitwise não publica preço nenhum no próprio site, então
esta página diz o que eles dizem sobre a divisão entre grátis e pago, e nenhum número. A página de
importação ainda é só em inglês, então esta versão não aponta para ela. Não acrescente uma
afirmação sem ter aberto a página, e não acrescente uma que estraga quando eles mudam um preço. */}

<Hero
  eyebrow="alternativa ao splitwise"
  title="Uma alternativa ao Splitwise grátis e sem conta"
  subtitle="O Splitwise funciona. Ele também pede que cada pessoa do grupo crie uma conta antes de lançar uma única despesa, e é aí que a maioria dos grupos desiste em silêncio. O Split é um link. Você manda, as pessoas digitam um nome, e cada uma lança o que pagou."
  cta="Criar um split"
  ctaHint="Dez segundos. Sem e-mail, sem senha, sem download." />

<PublicSourceOnly>

## Grátis e de código aberto são promessas diferentes

O serviço oficial é de uso grátis e não tem plano pago. Isso descreve o preço do peanutsplit.com
hoje; não promete que um servidor vai existir nem continuar custando zero para sempre.

O software publicado usa a licença AGPL-3.0-or-later. Código aberto descreve o que você pode fazer
com essa versão: inspecionar, executar, modificar, compartilhar e hospedar por conta própria sob a
licença. Não significa “sem custo” nem promete como todas as versões futuras serão licenciadas.

[Veja o código, a licença e os dados de manutenção](/source)

## O que você pode auto-hospedar

O código público inclui o aplicativo Next.js, o esquema e as migrações do PostgreSQL, uma implantação
de referência com Compose e documentação gerada do modelo de dados e da API HTTP. O guia também
registra os limites atuais: uma réplica do aplicativo, avisos e limites de uso locais ao processo,
taxas de câmbio estáticas sem um provedor configurado e nenhum TLS, backup ou monitoramento de
produção incluído.

Ao hospedar, você vira o operador. O domínio e TLS, banco de dados, backups, segredos, atualizações,
logs, avisos de privacidade e cada integração opcional ficam sob sua responsabilidade.

## Mantido pela Squirrel Labs

A Squirrel Labs mantém o Peanut Split. Hoje ela é a única mantenedora e paga todos os custos do
projeto, incluindo as horas de trabalho e a operação do peanutsplit.com. O acordo justo é que o
serviço oficial pode mostrar as poucas referências discretas e contextuais descritas na
[página de código e manutenção](/source). Elas nunca exigem clique, insistem, ficam
pré-selecionadas nem bloqueiam um recurso. Fazem parte do serviço oficial,
não são uma condição da licença AGPL. Forks e quem hospeda sua própria cópia não precisam manter
essas referências nem promover nenhuma das duas empresas.

</PublicSourceOnly>

## Por que as pessoas procuram outra coisa

O Splitwise vende um plano Pro. O que o Pro promete é a descrição mais clara do que a versão grátis faz com você:

### O dia em que você lança muita despesa é o dia em que ele para

<Quote source="splitwise.com/pro">
Add as many expenses as you like each day, with no interruptions.
</Quote>

Uma viagem é exatamente quando você lança uma dúzia numa tarde. O Split não tem limite nem contador.

### Dividir entre moedas é função paga

<Quote source="splitwise.com/pro">
Splitwise can convert all your bills to any currency you’d like, using today’s foreign exchange rates.
</Quote>

Também no Pro. Se o grupo está em Lisboa pagando em euro e acertando em real, isso é o trabalho inteiro. No Split já vem junto e é de uso grátis.

### O app grátis mostra anúncio para você

<Quote source="splitwise.com/pro">
A totally ad-free experience
</Quote>

Pro de novo. O Split não tem plano pago.

## Se o contador já parou você hoje

<Quote source="kb.splitwise.com/pro">
Add as many expenses as you need without hitting a limit (free users can add up to 4 expenses each day).
</Quote>

Do centro de ajuda do Splitwise, kb.splitwise.com, lido em 2026-08-21.

É o Splitwise descrevendo o próprio plano grátis. O contador zera e você lança de novo amanhã, o que não ajuda hoje à noite.

Um grupo não precisa mover o histórico para continuar. Crie uma sala, cole o link no grupo do WhatsApp e ponha o resto do dia ali. Não tem conta para criar, então ninguém do grupo precisa se cadastrar antes da próxima despesa entrar. O que já está no Splitwise fica no Splitwise e continua certo.

Tocar dois registros para uma viagem só compensa nos dias em que o contador atrapalha, e não muito além disso. Um grupo no começo de uma semana fora sai melhor abrindo a sala no primeiro dia, e um grupo que prefere trazer os saldos abertos em vez de começar de hoje deve fazer isso de uma vez só.

[O que o limite diário faz, e como mudar um grupo no meio da viagem](/pt-br/splitwise-daily-limit)

## A alternativa ao Splitwise, sem rodeio

|                        | Split                              | Splitwise                                             |
| ---------------------- | ---------------------------------- | ----------------------------------------------------- |
| Para começar           | Abra o link e digite um nome.      | Todo mundo cria uma conta antes.                      |
| Colocar o grupo dentro | Cole um link no grupo do WhatsApp. | Convide as pessoas uma a uma, e cada uma se cadastra. |
| Lançar despesas        | Quantas você quiser, todo dia.     | Despesas sem limite são vendidas como função Pro.     |
| Outras moedas          | Já vem junto e é de uso grátis.    | A conversão de moeda é vendida como função Pro.       |
| Preço                  | De uso grátis; sem plano pago.     | Grátis com anúncio, ou Splitwise Pro.                 |

Citações e funções retiradas de splitwise.com/pro e kb.splitwise.com, conferidas contra as páginas do Splitwise em 2026-08-21.

<Callout title="Quando o Splitwise é a ferramenta melhor">
O Splitwise lê recibo, importa cartão e desenha gráficos, e tem app nas duas lojas. O Split não faz nada disso, de propósito. O Split é para a viagem, o jantar, o fim de semana: um grupo, um link, resolvido e esquecido.
</Callout>

<Checklist title="O que você tem aqui">
<ChecklistItem title="Um link, sem contas">O link é a sala. Quem tem o link está dentro, então deixe ele no grupo do WhatsApp e não num lugar público.</ChecklistItem>
<ChecklistItem title="156 moedas, convertidas">Escolha em que a sala conta. Lance uma despesa em qualquer uma das 156 moedas com conversão automática e o Split converte pela taxa indicativa do dia, que ele guarda: editar a linha depois não muda o preço dela.</ChecklistItem>
<ChecklistItem title="Conta que fecha">Os saldos somam zero, até o centavo, e o acerto sugere um plano de pagamento curto que zera a sala. Abra qualquer saldo e ele mostra a conta.</ChecklistItem>
<ChecklistItem title="Todo mundo vê na hora">Alguém lança o táxi no caminho de casa e aquilo já está na tela dos outros antes de eles saírem do carro.</ChecklistItem>
<ChecklistItem title="Continua funcionando sem sinal">Despesas digitadas no subsolo ou no meio da serra esperam no seu celular e sobem quando o sinal volta. Registrar um acerto espera conexão de propósito: um pagamento anotado duas vezes é pior do que um pagamento anotado tarde.</ChecklistItem>
<ChecklistItem title="Inglês, espanhol e português">A sala fala a língua do celular que abriu ela. Ninguém precisa achar uma configuração.</ChecklistItem>
<ChecklistItem title="Acerte do jeito que vocês quiserem">Dinheiro, transferência, o app que o grupo já usa. O Split registra de qualquer jeito.</ChecklistItem>
</Checklist>

<CTA
  title="Teste no rateio de hoje"
  body="Um link, dez segundos, e ninguém precisa instalar nada."
  text="Criar um split" />

<FAQ title="Perguntas que as pessoas realmente fazem">
<PublicSourceOnly>
<FAQItem question="O Split é FOSS ou só é de uso grátis?">As duas coisas, mas são afirmações diferentes. O serviço oficial é de uso grátis e não tem plano pago. O software publicado usa AGPL-3.0-or-later, que permite inspecionar, executar, modificar, compartilhar e auto-hospedar essa versão.</FAQItem>
<FAQItem question="Posso auto-hospedar o Split?">Sim. O repositório público inclui Compose, as migrações do PostgreSQL e a documentação do esquema e da API. Você opera o domínio e TLS, o banco de dados, os backups, os segredos, as atualizações, o monitoramento e qualquer integração opcional.</FAQItem>
<FAQItem question="Quem mantém o Split e por que outro produto pode aparecer?">A Squirrel Labs é hoje a única mantenedora e paga todos os custos do projeto, incluindo as horas de trabalho e a operação do peanutsplit.com. O serviço oficial pode ter poucas referências discretas e contextuais de pagamento; elas nunca exigem clique, insistem nem bloqueiam recursos, e os forks não precisam mantê-las.</FAQItem>
</PublicSourceOnly>
<FAQItem question="Preciso de conta?">Não, e nem quem receber o link. Não tem e-mail, não tem senha e não tem cadastro em lugar nenhum do Split.</FAQItem>
<FAQItem question="Tem limite de quantas despesas dá para lançar?">Não tem. Lance cinquenta numa tarde, se a viagem for desse tipo.</FAQItem>
</FAQ>

<RelatedPages title="Continue lendo">
<RelatedLink href="/pt-br/settle-up-alternative">Se o grupo está vindo do Settle Up</RelatedLink>
<RelatedLink href="/pt-br/tricount-alternative">Como o Split se compara ao Tricount</RelatedLink>
<RelatedLink href="/pt-br/blog/split-expenses-across-currencies">Quando você pagou numa moeda e deve em outra</RelatedLink>
</RelatedPages>
