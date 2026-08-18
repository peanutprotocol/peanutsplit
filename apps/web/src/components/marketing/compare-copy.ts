import type { Locale } from '@/i18n/locales'
import { marketingCopy } from './copy'

/**
 * Copy contract for the hand-built Splitwise comparison.
 *
 * Unlike the MDX tree, this page has an interactive table and builds FAQ structured data from the
 * same object it renders. Keeping every locale in this shape means a translated body cannot ship
 * under English metadata or English FAQPage JSON-LD.
 */
export interface ComparisonCopy {
    meta: { title: string; description: string }
    hero: { eyebrow: string; title: string; body: string; cta: string; ctaHint: string; importLink: string }
    why: {
        title: string
        intro: string
        items: readonly { title: string; quote: string; body: string }[]
    }
    migration: {
        title: string
        quote: string
        quoteNote: string
        body: readonly string[]
        importSentence: string
        moreHref: string
        moreLabel: string
    }
    table: {
        title: string
        splitLabel: string
        otherLabel: string
        rows: readonly { feature: string; split: string; other: string }[]
        footnote: string
    }
    honest: { title: string; body: string }
    features: { title: string; items: readonly { title: string; body: string }[] }
    faq: { title: string; items: readonly { q: string; a: string; v2Only?: boolean }[] }
    cta: { title: string; body: string; button: string }
}

const es419 = {
    meta: {
        title: 'Alternativa a Splitwise gratis: sin registro y sin tope diario',
        description:
            'Una alternativa a Splitwise gratis para siempre, sin cuenta y sin app: comparte un enlace, cada uno carga lo que pagó, y nada tiene tope ni queda detrás de un plan pago.',
    },
    hero: {
        eyebrow: 'alternativa a splitwise',
        title: 'Divide la cuenta sin que nadie tenga que registrarse',
        body: 'Splitwise funciona. También le pide a cada persona del grupo que se haga una cuenta antes de poder cargar un solo gasto, y ahí es donde la mayoría de los grupos abandona en silencio. Split by Peanut es un enlace. Lo mandas, la gente escribe un nombre, y cada uno carga lo que pagó.',
        cta: 'Crear un split',
        ctaHint: 'Diez segundos. Sin correo, sin contraseña, sin descargas.',
        importLink: '¿Ya usas Splitwise? Trae contigo el historial de tu grupo',
    },
    why: {
        title: 'Por qué la gente busca otra cosa',
        intro: 'Splitwise vende un plan Pro. Lo que promete Pro es la descripción más clara de lo que te hace la versión gratis:',
        items: [
            {
                title: 'El día que cargas muchos gastos es el día en que se corta',
                quote: 'Add as many expenses as you like each day, with no interruptions.',
                body: 'Un viaje es justo cuando cargas una docena en una tarde. Split no tiene tope ni contador.',
            },
            {
                title: 'Dividir entre monedas es una función paga',
                quote: 'Splitwise can convert all your bills to any currency you’d like, using today’s foreign exchange rates.',
                body: 'También es Pro. Si el grupo gastó en una moneda durante el viaje y se paga en otra al volver, ese es todo el trabajo. En Split viene incluido y es gratis para siempre.',
            },
            {
                title: 'La app gratis te muestra publicidad',
                quote: 'A totally ad-free experience.',
                body: 'Pro otra vez. Split no tiene publicidad ni un plan pago para venderte, porque no es así como Peanut gana dinero.',
            },
        ],
    },
    migration: {
        title: 'Si el contador ya te frenó hoy',
        quote: 'Add as many expenses as you need without hitting a limit (free users can add up to 4 expenses each day).',
        quoteNote: 'Del centro de ayuda de Splitwise, kb.splitwise.com, julio de 2026.',
        body: [
            'Eso es Splitwise describiendo su propio plan gratis. El contador se reinicia y mañana puedes volver a cargar, lo que no sirve de nada esta noche.',
            'Un grupo no tiene que mudar su historial para seguir. Abre una sala, pega el enlace en el chat del grupo y carga ahí lo que queda del día. No hay cuenta que hacer, así que nadie del grupo tiene que registrarse antes de que entre el próximo gasto. Lo que ya está en Splitwise se queda en Splitwise y sigue siendo correcto.',
            'Llevar dos registros para un mismo viaje vale la pena los días en que el contador estorba, y no mucho más. A un grupo que arranca una semana de viaje le conviene abrir la sala el primer día, y un grupo que prefiera pasar los saldos abiertos en vez de empezar desde hoy debería hacerlo de una sentada.',
        ],
        importSentence:
            'Si prefieres traer el historial, exporta el grupo de Splitwise como planilla y suelta el archivo en la página de importación.',
        moreHref: '/es-419/splitwise-daily-limit',
        moreLabel: 'Qué hace el tope diario, y cómo mudar un grupo en la mitad de un viaje',
    },
    table: {
        title: 'La diferencia, sin vueltas',
        splitLabel: 'Peanut Split',
        otherLabel: 'Splitwise',
        rows: [
            {
                feature: 'Para empezar',
                split: 'Abres el enlace y escribes un nombre.',
                other: 'Todos se hacen una cuenta primero.',
            },
            {
                feature: 'Sumar al grupo',
                split: 'Pegas un enlace en el chat del grupo.',
                other: 'Invitas de a uno, y cada uno se registra.',
            },
            {
                feature: 'Cargar gastos',
                split: 'Todos los que quieras, todos los días.',
                other: 'Los gastos sin límite se venden como función Pro.',
            },
            {
                feature: 'Otras monedas',
                split: 'Incluido y gratis para siempre.',
                other: 'La conversión de monedas se vende como función Pro.',
            },
            {
                feature: 'Precio',
                split: 'Gratis para siempre, sin plan pago al que subir.',
                other: 'Gratis con publicidad, o Splitwise Pro.',
            },
        ],
        footnote: 'Citas y funciones tomadas de splitwise.com/pro en julio de 2026.',
    },
    honest: {
        title: 'Cuándo Splitwise es la mejor herramienta',
        body: 'Splitwise escanea tickets, importa desde la tarjeta y dibuja gráficos, y tiene apps en las dos tiendas. Split no hace nada de eso, a propósito. Split es para el viaje, la cena, el fin de semana: un grupo, un enlace, cerrado y olvidado.',
    },
    features: {
        title: 'Lo que obtienes',
        items: [
            {
                title: 'Un enlace, sin cuentas',
                body: 'El enlace es la sala. Quien lo tenga está adentro, así que déjalo en el chat del grupo y no en un lugar público.',
            },
            {
                title: '156 monedas, convertidas',
                body: 'Elige en qué cuenta la sala. Carga un gasto en cualquiera de las 156 monedas con conversión automática y Split lo convierte al tipo de cambio indicativo del día, y después lo guarda: editar la línea más tarde no la vuelve a cotizar.',
            },
            {
                title: 'Cuentas que cierran',
                body: 'Los saldos suman cero, hasta el centavo, y al saldar te sugiere un plan de pagos corto que cierra la sala. Abre cualquier saldo y te muestra las cuentas.',
            },
            {
                title: 'Todos lo ven mientras pasa',
                body: 'Alguien carga el taxi camino a casa y ya está en la pantalla de los demás antes de que se bajen del auto.',
            },
            {
                title: 'Sigue funcionando sin señal',
                body: 'Los gastos que escribes en un sótano o en la montaña esperan en el celular y salen cuando vuelve la señal. Registrar un pago espera la conexión a propósito: un pago anotado dos veces es peor que uno anotado tarde.',
            },
            {
                title: 'Español, inglés y portugués',
                body: 'La sala habla el idioma en el que esté el celular que la abre, de esos tres. Nadie tiene que buscar una configuración.',
            },
            {
                title: 'Salden como quieran',
                body: 'Efectivo, transferencia, la app que el grupo ya use. Split lo registra igual.',
            },
        ],
    },
    faq: {
        title: 'Preguntas que la gente hace de verdad',
        items: [
            {
                q: '¿Necesito una cuenta?',
                a: 'No, y tampoco la necesita nadie a quien le mandes el enlace. No hay correo, ni contraseña, ni verificación de identidad en ninguna parte de Split.',
            },
            {
                q: '¿Es gratis para siempre?',
                a: 'Sí. Split es gratis para siempre y no hay nada a lo que subir. Peanut lo hace para que la gente conozca Peanut, y así es como se paga Split.',
            },
            {
                q: '¿Hay un límite de gastos que podemos cargar?',
                a: 'No. Carga cincuenta en una tarde si es esa clase de viaje.',
            },
            {
                q: '¿Tenemos que descargar una app?',
                a: 'No. Se abre en el navegador como cualquier otra página. Si quieres que se sienta como una app, agrégala a la pantalla de inicio: eso es una función del celular, no una instalación.',
            },
            {
                q: '¿Funciona sin señal?',
                a: 'Los gastos sí. Todo lo que escribes sin conexión queda guardado en el celular, hasta treinta, y sale en cuanto hay conexión. Registrar un pago espera la conexión a propósito, porque un pago anotado dos veces es peor que uno anotado tarde.',
            },
            {
                q: '¿Está en español o en portugués?',
                a: 'Sí: español, inglés y portugués de Brasil, según el idioma del celular que abre el enlace. Esta página está en español porque es el idioma en el que se busca.',
            },
            {
                q: '¿Puedo importar mi historial de Splitwise?',
                a: 'Sí. Exporta tu grupo de Splitwise como planilla y suelta el archivo en peanutsplit.com/import: los gastos, quién pagó y los saldos pasan todos, y te queda un enlace de sala para mandarle al grupo. El archivo se lee en tu navegador y nunca se sube.',
                v2Only: true,
            },
            {
                q: '¿Cómo volvemos a una sala?',
                a: 'Deja el enlace en el chat del grupo para que todos lo encuentren ahí. Split también guarda en este dispositivo las salas que abriste, y puedes pegar un enlace de sala en la portada para volver a agregarla.',
            },
            {
                q: '¿Funciona en mi celular?',
                a: 'Es un sitio web, así que funciona en cualquier lado. Puedes agregarlo a la pantalla de inicio y se abre como una app.',
            },
        ],
    },
    cta: {
        title: 'Empieza con la próxima cuenta',
        body: 'Un enlace, diez segundos, y nadie tiene que instalar nada.',
        button: 'Crear un split',
    },
} satisfies ComparisonCopy

const ptBr = {
    meta: {
        title: 'Alternativa ao Splitwise, grátis para sempre e sem limite',
        description:
            'Um link só: todo mundo lança o que pagou, sem conta e sem app. Alternativa ao Splitwise grátis para sempre, sem limite diário e sem plano pago para assinar.',
    },
    hero: {
        eyebrow: 'alternativa ao splitwise',
        title: 'Divida a conta sem fazer todo mundo criar cadastro',
        body: 'O Splitwise funciona. Ele também pede que cada pessoa do grupo crie uma conta antes de lançar uma única despesa, e é aí que a maioria dos grupos desiste em silêncio. O Split by Peanut é um link. Você manda, as pessoas digitam um nome, e cada uma lança o que pagou.',
        cta: 'Criar um split',
        ctaHint: 'Dez segundos. Sem e-mail, sem senha, sem download.',
        importLink: 'Já usa o Splitwise? Traga o histórico do grupo junto',
    },
    why: {
        title: 'Por que as pessoas procuram outra coisa',
        intro: 'O Splitwise vende um plano Pro. O que o Pro promete é a descrição mais clara do que a versão grátis faz com você:',
        items: [
            {
                title: 'O dia em que você lança muita despesa é o dia em que ele para',
                quote: 'Add as many expenses as you like each day, with no interruptions.',
                body: 'Uma viagem é exatamente quando você lança uma dúzia numa tarde. O Split não tem limite nem contador.',
            },
            {
                title: 'Dividir entre moedas é função paga',
                quote: 'Splitwise can convert all your bills to any currency you’d like, using today’s foreign exchange rates.',
                body: 'Também no Pro. Se o grupo está em Lisboa pagando em euro e acertando em real, isso é o trabalho inteiro. No Split já vem junto e é grátis para sempre.',
            },
            {
                title: 'O app grátis mostra anúncio para você',
                quote: 'A totally ad-free experience.',
                body: 'Pro de novo. O Split não tem anúncio nem plano pago para vender, porque não é assim que a Peanut ganha dinheiro.',
            },
        ],
    },
    migration: {
        title: 'Se o contador já parou você hoje',
        quote: 'Add as many expenses as you need without hitting a limit (free users can add up to 4 expenses each day).',
        quoteNote: 'Do centro de ajuda do Splitwise, kb.splitwise.com, julho de 2026.',
        body: [
            'É o Splitwise descrevendo o próprio plano grátis. O contador zera e você lança de novo amanhã, o que não ajuda hoje à noite.',
            'Um grupo não precisa mover o histórico para continuar. Crie uma sala, cole o link no grupo do WhatsApp e ponha o resto do dia ali. Não tem conta para criar, então ninguém do grupo precisa se cadastrar antes da próxima despesa entrar. O que já está no Splitwise fica no Splitwise e continua certo.',
            'Tocar dois registros para uma viagem só compensa nos dias em que o contador atrapalha, e não muito além disso. Um grupo no começo de uma semana fora sai melhor abrindo a sala no primeiro dia, e um grupo que prefere trazer os saldos abertos em vez de começar de hoje deve fazer isso de uma vez só.',
        ],
        importSentence:
            'Se você prefere trazer o histórico junto, exporte o grupo do Splitwise como planilha e solte o arquivo na página de importação.',
        moreHref: '/pt-br/splitwise-daily-limit',
        moreLabel: 'O que o limite diário faz, e como mudar um grupo no meio da viagem',
    },
    table: {
        title: 'A diferença, sem rodeio',
        splitLabel: 'Peanut Split',
        otherLabel: 'Splitwise',
        rows: [
            {
                feature: 'Para começar',
                split: 'Abra o link e digite um nome.',
                other: 'Todo mundo cria uma conta antes.',
            },
            {
                feature: 'Colocar o grupo dentro',
                split: 'Cole um link no grupo do WhatsApp.',
                other: 'Convide as pessoas uma a uma, e cada uma se cadastra.',
            },
            {
                feature: 'Lançar despesas',
                split: 'Quantas você quiser, todo dia.',
                other: 'Despesas sem limite são vendidas como função Pro.',
            },
            {
                feature: 'Outras moedas',
                split: 'Já vem junto e é grátis para sempre.',
                other: 'A conversão de moeda é vendida como função Pro.',
            },
            {
                feature: 'Preço',
                split: 'Grátis para sempre, sem plano pago para assinar.',
                other: 'Grátis com anúncio, ou Splitwise Pro.',
            },
        ],
        footnote: 'Citações e funções retiradas de splitwise.com/pro em julho de 2026.',
    },
    honest: {
        title: 'Quando o Splitwise é a ferramenta melhor',
        body: 'O Splitwise lê recibo, importa cartão e desenha gráficos, e tem app nas duas lojas. O Split não faz nada disso, de propósito. O Split é para a viagem, o jantar, o fim de semana: um grupo, um link, resolvido e esquecido.',
    },
    features: {
        title: 'O que você tem aqui',
        items: [
            {
                title: 'Um link, sem contas',
                body: 'O link é a sala. Quem tem o link está dentro, então deixe ele no grupo do WhatsApp e não num lugar público.',
            },
            {
                title: '156 moedas, convertidas',
                body: 'Escolha em que a sala conta. Lance uma despesa em qualquer uma das 156 moedas com conversão automática e o Split converte pela taxa indicativa do dia, que ele guarda: editar a linha depois não muda o preço dela.',
            },
            {
                title: 'Conta que fecha',
                body: 'Os saldos somam zero, até o centavo, e o acerto sugere um plano de pagamento curto que zera a sala. Abra qualquer saldo e ele mostra a conta.',
            },
            {
                title: 'Todo mundo vê na hora',
                body: 'Alguém lança o táxi no caminho de casa e aquilo já está na tela dos outros antes de eles saírem do carro.',
            },
            {
                title: 'Continua funcionando sem sinal',
                body: 'Despesas digitadas no subsolo ou no meio da serra esperam no seu celular e sobem quando o sinal volta. Registrar um acerto espera conexão de propósito: um pagamento anotado duas vezes é pior do que um pagamento anotado tarde.',
            },
            {
                title: 'Inglês, espanhol e português',
                body: 'A sala fala a língua do celular que abriu ela. Ninguém precisa achar uma configuração.',
            },
            {
                title: 'Acerte do jeito que vocês quiserem',
                body: 'Dinheiro, transferência, o app que o grupo já usa. O Split registra de qualquer jeito.',
            },
        ],
    },
    faq: {
        title: 'Perguntas que as pessoas realmente fazem',
        items: [
            {
                q: 'Preciso de conta?',
                a: 'Não, e nem quem receber o link. Não tem e-mail, não tem senha e não tem cadastro em lugar nenhum do Split.',
            },
            {
                q: 'É grátis para sempre?',
                a: 'É. O Split é grátis para sempre e não existe nada para assinar depois. A Peanut faz o Split para apresentar a Peanut às pessoas, e é daí que sai o dinheiro.',
            },
            {
                q: 'Tem limite de quantas despesas dá para lançar?',
                a: 'Não tem. Lance cinquenta numa tarde, se a viagem for desse tipo.',
            },
            {
                q: 'Precisamos baixar um app?',
                a: 'Não. Abre no navegador como qualquer página. Se você quer que pareça um app, adicione à tela de início: isso é função do celular, não instalação.',
            },
            {
                q: 'Funciona sem sinal?',
                a: 'As despesas funcionam. O que você digita sem conexão fica guardado no seu celular, até trinta delas, e sobe assim que houver conexão. Registrar um acerto espera conexão de propósito, porque um pagamento anotado duas vezes é pior do que um pagamento anotado tarde.',
            },
            {
                q: 'Tem em inglês ou em espanhol?',
                a: 'Tem. Inglês, espanhol e português do Brasil, escolhido pelo idioma do celular que abre o link. Esta página de comparação também existe nos três.',
            },
            {
                q: 'Dá para importar meu histórico do Splitwise?',
                a: 'Dá. Exporte o grupo do Splitwise como planilha e solte o arquivo em peanutsplit.com/import: as despesas, quem pagou e os saldos vêm todos, e você recebe um link de sala para mandar para o grupo. O arquivo é lido no seu navegador e nunca é enviado.',
                v2Only: true,
            },
            {
                q: 'Como voltamos para uma sala?',
                a: 'Deixe o link no grupo do WhatsApp para todo mundo achar lá. O Split também guarda as salas abertas neste aparelho, e você pode colar um link de sala na página inicial para trazer ela de volta.',
            },
            {
                q: 'Funciona no meu celular?',
                a: 'É um site, então funciona em qualquer lugar. Dá para adicionar à tela de início e ele abre como um app.',
            },
        ],
    },
    cta: {
        title: 'Teste no rateio de hoje',
        body: 'Um link, dez segundos, e ninguém precisa instalar nada.',
        button: 'Criar um split',
    },
} satisfies ComparisonCopy

// Catalog-only locales intentionally have no comparison page yet. Their absence is the content
// system's no-fallback contract: no translated source means no indexed URL.
export const comparisonCopy: Partial<Record<Locale, ComparisonCopy>> = {
    en: marketingCopy.compare,
    'es-419': es419,
    'pt-br': ptBr,
}
