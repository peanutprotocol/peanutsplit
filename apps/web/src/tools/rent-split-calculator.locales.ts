import type { ToolWords } from './types'

/**
 * The rent calculator in Spanish and in Portuguese.
 *
 * Transcreated against the stylebook (§9.7) and the two rulebooks, not translated: the objection
 * §8.1 requires is re-asked in each language's own household — the bathroom and the lights in one,
 * the shower and the kitchen in the other — and the FAQ questions are the ones a person types.
 * What is held identical is the skeleton, the arithmetic and the claims (§7): the four `goodToKnow`
 * lines are the safe phrasings of the same four product truths in all three languages.
 *
 * Figures inside a sentence keep the punctuation the input boxes use, not the locale's. A note
 * reading "0,91" beside a box the reader has to fill with `0.91` is a page arguing with itself,
 * and `kind: 'number'` fields parse with `Number()`. Thousands are written in words for the same
 * reason — "10 mil millas", never a separator that could be read as a decimal point. The
 * derivation is not typed into anything, so it takes the locale's own marks — see `allocate.ts`.
 */

export const rentSplitEs419: ToolWords = {
    meta: {
        title: 'Dividir el alquiler por metros cuadrados',
        description:
            'Divide el alquiler entre roomies en proporción al tamaño de cada cuarto, con un control para quién está mejor. Las cifras cuadran hasta el último centavo.',
    },
    copy: {
        h1: 'Calculadora para dividir el alquiler por metros cuadrados',
        intro: [
            'Pon el alquiler y los metros cuadrados de cada cuarto privado. El alquiler sigue esa superficie, y las cifras se mueven mientras escribes.',
            'El control al lado de cada nombre es la otra mitad de la discusión. Déjalos todos donde están y no pasa nada; sube uno y esa persona paga más mientras el resto paga menos. Split tiene la misma aritmética en una página que todo el departamento puede abrir.',
        ],
        resultTitle: 'Lo que paga cada cuarto',
        resultHint: 'Pon el alquiler y cuántas personas están en él.',
        roundingNote:
            'El alquiler casi nunca se divide parejo, así que lo que sobra al final va a las fracciones más grandes, de a una unidad. La columna suma exactamente el alquiler.',
        copyLabel: 'Copiar el reparto',
        copyDone: 'Copiado',
        method: {
            title: 'Dónde se deja de medir',
            body: [
                'Alguien del departamento va a preguntar dónde termina esto: después la cocina, después el agua caliente, después quién está en casa lo suficiente para usar cualquiera de las dos. La línea aquí se traza en lo que se mide una sola vez. Un cuarto mide lo mismo en noviembre que en marzo, así que el alquiler que carga se resuelve en una conversación; el baño y las luces pedirían una nueva cada semana.',
                'El tamaño de la diferencia decide si conviene tener esa conversación. Si el cuarto más grande y el más chico terminan separados por muy poco, el departamento gana más dejando el alquiler quieto que reabriéndolo cada mes.',
            ],
        },
        concession: {
            title: 'Cuando una hoja de cálculo es la mejor herramienta',
            body: 'Un hogar que acordó esto hace un año y paga por transferencia automática no necesita una página para eso. Una hoja de cálculo sostiene bien un acuerdo cuando la discusión ya terminó. Esto es para la parte anterior, donde la cifra todavía se está decidiendo y alguien tiene que mostrar la cuenta.',
        },
        goodToKnow: {
            title: 'Bueno saberlo',
            body: [
                'El servicio oficial es de uso gratuito y no tiene plan pago.',
                'Conversión automática para 156 monedas al tipo de cambio indicativo del día.',
                'Una sala tiene hasta veinte personas.',
                'Split registra un pago, no lo hace. No consulta con ningún banco, y no puede.',
            ],
        },
        cta: {
            title: 'Pon las cifras donde todo el departamento las vea',
            body: 'Diez segundos. Sin correo, sin contraseña, sin descargas.',
            label: 'Crear un split',
        },
        faqTitle: 'Preguntas',
    },
    fields: {
        rent: { label: 'Alquiler del mes' },
        people: { label: 'Roomies', help: 'Hasta veinte.' },
        size: {
            label: 'Tamaño del cuarto',
            unit: 'm²',
            help: 'Solo espacio privado. Los espacios comunes quedan fuera de la cuenta.',
        },
        rich: {
            label: 'Cómo estás de dinero',
            notches: ['Sin margen', 'Justo', 'Cómodo', 'Holgado', 'Muy holgado'],
        },
    },
    rows: { nameLabel: 'Nombre', namePrefix: 'Roomie' },
    related: [
        { href: '/es-419/splitwise-alternative', label: 'Cómo se compara Split con Splitwise' },
        { href: '/es-419/mileage-split-calculator', label: 'La otra calculadora' },
    ],
    faqs: [
        {
            question: '¿Cómo se divide el alquiler por metros cuadrados?',
            answer: 'Mide los cuartos privados, suma la superficie y dale a cada persona la misma proporción del alquiler que su cuarto representa de ese total. Los espacios comunes quedan fuera de la cuenta, porque todos tienen el mismo derecho sobre ellos.',
        },
        {
            question: '¿Qué hace el control al lado de cada nombre?',
            answer: 'Son cinco niveles, y el nivel es el peso que le pone al cuarto: el nivel uno cuenta ese cuarto una vez, el nivel cinco lo cuenta cinco veces, y el cuarto ya contado de cada quien se vuelve a poner sobre el total para sacar las partes. Mientras todos los controles marquen lo mismo, el multiplicador se cancela y el alquiler sigue solo los metros cuadrados, así que un departamento que prefiere no tener esta conversación puede dejarlos parejos sin perder nada. Sube uno y esa persona paga más y el resto paga menos.',
        },
        {
            question: '¿Cómo se divide el alquiler cuando alguien gana más?',
            answer: 'Sube su control, o no. Su cuarto se cuenta más veces que el de los demás, así que su parte sube y la del resto baja: la cifra se mueve hacia lo que cada quien puede pagar sin perder de vista lo que cada quien recibe. Es un método, no un veredicto, y un hogar que prefiere dividir solo por metros cuadrados debería dejar los controles parejos.',
        },
        {
            question: '¿Por qué una persona paga una fracción más que las demás?',
            answer: 'El alquiler casi nunca se divide parejo. La página redondea cada parte hacia abajo primero y después reparte lo que sobra entre las fracciones más grandes, de a una unidad, para que la columna sume el alquiler y no un pelo menos.',
        },
    ],
    phrases: {
        noPeople: 'Di cuántas personas están en el alquiler.',
        negativeRent: 'El alquiler no puede ser menos que nada.',
        rentTooBig: 'Ese alquiler es más grande de lo que esta página divide.',
        rentLabel: 'Alquiler',
        floorAreaLabel: 'Superficie medida',
        areaValue: '{area} m²',
        slidersLabel: 'Dónde quedaron los controles',
        detailTilted: 'cuarto {room}, nivel {notch}, o sea {share} del alquiler',
        detailPlain: '{size} m², {share} del alquiler',
    },
}

export const rentSplitPtBr: ToolWords = {
    meta: {
        title: 'Dividir o aluguel por metro quadrado',
        description:
            'Divida o aluguel entre quem mora junto na proporção do tamanho de cada quarto, com um controle para quem está mais folgado. As contas fecham no centavo.',
    },
    copy: {
        h1: 'Calculadora para dividir o aluguel por metro quadrado',
        intro: [
            'Coloque o aluguel e o tamanho de cada quarto individual. O aluguel segue essa metragem, e os números se movem enquanto você digita.',
            'O controle ao lado de cada nome é a outra metade da discussão. Deixe todos onde estão e nada acontece; suba um e essa pessoa paga mais enquanto o resto paga menos. O Split tem a mesma conta numa página que o apê inteiro pode abrir.',
        ],
        resultTitle: 'O que cada quarto paga',
        resultHint: 'Coloque o aluguel e quantas pessoas estão nele.',
        roundingNote:
            'O aluguel quase nunca divide certinho, então o que sobra no fim vai para as maiores frações, uma unidade de cada vez. A coluna soma exatamente o aluguel.',
        copyLabel: 'Copiar o rateio',
        copyDone: 'Copiado',
        method: {
            title: 'Onde a medição para',
            body: [
                'Alguém do apê vai perguntar onde isso termina: depois a cozinha, depois o chuveiro, depois quem fica em casa tempo suficiente para usar os dois. A linha aqui fica no que se mede uma vez só. Um quarto tem o mesmo tamanho em novembro e em março, então o aluguel que ele carrega se resolve numa conversa; o banheiro e a luz pediriam uma conversa nova toda semana.',
                'O tamanho da diferença decide se vale ter essa conversa. Se o maior quarto e o menor terminam separados por muito pouco, o apê ganha mais deixando o aluguel quieto do que reabrindo ele todo mês.',
            ],
        },
        concession: {
            title: 'Quando uma planilha é a melhor ferramenta',
            body: 'Uma casa que combinou isso um ano atrás e paga por débito automático não precisa de uma página para isso. Uma planilha segura bem um acordo depois que a discussão acabou. Isto é para a parte antes disso, quando o número ainda está sendo decidido e alguém precisa mostrar a conta.',
        },
        goodToKnow: {
            title: 'Bom saber',
            body: [
                'O serviço oficial é de uso grátis e não tem plano pago.',
                'Conversão automática para 156 moedas pela taxa indicativa do dia.',
                'Uma sala comporta até vinte pessoas.',
                'O Split registra um pagamento, não faz o pagamento. Ele não confere com banco nenhum, e não tem como conferir.',
            ],
        },
        cta: {
            title: 'Coloque os números onde o apê inteiro vê',
            body: 'Dez segundos. Sem e-mail, sem senha, sem download.',
            label: 'Criar um split',
        },
        faqTitle: 'Perguntas',
    },
    fields: {
        rent: { label: 'Aluguel do mês' },
        people: { label: 'Pessoas no aluguel', help: 'Até vinte.' },
        size: {
            label: 'Tamanho do quarto',
            unit: 'm²',
            help: 'Só o espaço individual. Área comum fica fora da conta.',
        },
        rich: {
            label: 'Como você está de dinheiro',
            notches: ['No limite', 'Apertado', 'Tranquilo', 'Folgado', 'Muito folgado'],
        },
    },
    rows: { nameLabel: 'Nome', namePrefix: 'Pessoa' },
    related: [
        { href: '/pt-br/splitwise-alternative', label: 'Como o Split se compara ao Splitwise' },
        { href: '/pt-br/mileage-split-calculator', label: 'A outra calculadora' },
    ],
    faqs: [
        {
            question: 'Como dividir o aluguel por metro quadrado?',
            answer: 'Meça os quartos individuais, some a metragem e dê para cada pessoa a mesma proporção do aluguel que o quarto dela representa desse total. A área comum fica fora da conta, porque todo mundo tem o mesmo direito sobre ela.',
        },
        {
            question: 'O que o controle ao lado de cada nome faz?',
            answer: 'São cinco níveis, e o nível é o peso que ele coloca no quarto: o nível um conta aquele quarto uma vez, o nível cinco conta cinco vezes, e o quarto já contado de cada pessoa volta para cima do total para sair as cotas. Enquanto todos os controles estiverem no mesmo ponto, o multiplicador se cancela e o aluguel segue só a metragem, então um apê que prefere não ter essa conversa pode deixar tudo no mesmo nível sem perder nada. Suba um e essa pessoa paga mais e o resto do apê paga menos.',
        },
        {
            question: 'Como dividir o aluguel quando uma pessoa ganha mais?',
            answer: 'Suba o controle dela, ou não suba. O quarto dela passa a ser contado mais vezes que o das outras, então a cota dela sobe e a do resto desce: o número anda na direção do que cada pessoa consegue pagar, sem perder de vista o que cada pessoa recebe. É um método, não um veredito, e uma casa que prefere dividir só pela metragem deve deixar os controles no mesmo nível.',
        },
        {
            question: 'Por que uma pessoa paga uma fração a mais que as outras?',
            answer: 'O aluguel quase nunca divide certinho. A página arredonda cada cota para baixo primeiro e depois entrega o que sobrou para as maiores frações, uma unidade de cada vez, para a coluna somar o aluguel e não um fio a menos.',
        },
    ],
    phrases: {
        noPeople: 'Diga quantas pessoas estão no aluguel.',
        negativeRent: 'O aluguel não pode ser menos que nada.',
        rentTooBig: 'Esse aluguel é maior do que esta página divide.',
        rentLabel: 'Aluguel',
        floorAreaLabel: 'Metragem medida',
        areaValue: '{area} m²',
        slidersLabel: 'Onde os controles ficaram',
        detailTilted: 'quarto {room}, nível {notch}, ou seja {share} do aluguel',
        detailPlain: '{size} m², {share} do aluguel',
    },
}
