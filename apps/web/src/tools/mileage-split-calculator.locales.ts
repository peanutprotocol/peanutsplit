import type { ToolWords } from './types'

/**
 * The mileage calculator in Spanish and in Portuguese.
 *
 * Transcreated, not translated (stylebook §9.7). The country notes keep every figure, currency
 * code and source link exactly as the government published them — those are the evidence — and
 * only the sentence around them is re-authored. A note quotes the figure the picker types into the
 * rate box, so it keeps that box's punctuation rather than the locale's: `rate` is a
 * `kind: 'number'` field parsed with `Number()`, so `0,91` in the box is `NaN` and no result at
 * all. Thousands are written in words for the same reason. The derivation is the other way round —
 * it is read, never typed, so `allocate.ts` writes it in the locale's own marks (§5).
 *
 * **Brazil is a verified negative and the Portuguese page says so out loud.** `mileage-rates.ts`
 * records that the federal instrument pays a daily maximum with no distance term in it, so a
 * Brazilian reader is told plainly, in the intro and in an FAQ of its own, that there is no
 * national per-kilometre rate and that the number in the box is theirs to type.
 */

export const mileageSplitEs419: ToolWords = {
    meta: {
        title: 'Dividir el costo de un viaje en auto',
        description:
            'Calcula lo que costó un viaje al valor oficial por kilómetro, que cubre el auto entero y no solo el combustible, y divídelo entre todos los que iban adentro.',
    },
    copy: {
        h1: 'Calculadora para dividir un viaje en auto',
        intro: [
            'Di cuánto anduvo el auto y cuántas personas iban adentro. El viaje se calcula al valor oficial de reembolso del país que elijas, y abajo está lo que cada pasajero le debe a quien manejó.',
            'Un valor justo por kilómetro nunca es solo el combustible. Cubre los neumáticos, el mantenimiento que se adelanta y el valor que el auto va perdiendo mientras lo disfrutas, y por eso una cifra oficial queda bastante arriba de lo que sugeriría el ticket del combustible. Cámbialo si conoces el auto mejor que el estado, o arma el tuyo con lo que consume. Deja que Split by Peanut se encargue de pedir después, para que quien manejó no tenga que sacar el tema en el chat del grupo.',
        ],
        resultTitle: 'Quién le debe qué a quien manejó',
        resultHint: 'Di cuántas personas iban con quien manejó.',
        roundingNote:
            'El costo de un viaje casi nunca se divide parejo, así que lo que sobra al final va a las fracciones más grandes, de a una unidad. La columna suma exactamente lo que costó el viaje.',
        copyLabel: 'Copiar la lista',
        copyDone: 'Copiado',
        method: {
            title: 'Lo que el valor deja para los tickets',
            body: [
                'Calcula distancia y nada más. Peajes, ferris, estacionamiento y el café de la parada quedan afuera, y tienen tickets propios. Esos van en la sala con el resto del viaje.',
                'Tampoco le paga a nadie por manejar. Cuatro horas al volante es algo real y ninguna cifra por kilómetro lo cotiza. Los grupos suelen arreglarlo con el asiento de adelante y la elección de la música, y los que intentan arreglarlo con dinero rara vez disfrutan esa conversación.',
            ],
        },
        concession: {
            title: 'Cuando el ticket del combustible es la mejor herramienta',
            body: 'Un tanque, un ticket, un viaje: divide lo que cobró el surtidor y para ahí. Un valor por kilómetro se gana su lugar en un auto que alguien tiene, donde el costo está repartido en años de servicios cuyos papeles nadie guardó. En un auto alquilado la factura más el combustible es la cifra más honesta, y ya está escrita.',
        },
        goodToKnow: {
            title: 'Bueno saberlo',
            body: [
                'Split es gratis para siempre y no hay nada a lo que subir.',
                'Conversión automática para 156 monedas al tipo de cambio indicativo del día.',
                'Una sala tiene hasta veinte personas.',
                'Split registra un pago, no lo hace. No consulta con ningún banco, y no puede.',
            ],
        },
        cta: {
            title: 'El combustible no fue lo único que alguien pagó',
            body: 'Diez segundos. Sin correo, sin contraseña, sin descargas.',
            label: 'Crear un split',
        },
        faqTitle: 'Preguntas',
    },
    fields: {
        distance: {
            label: 'Distancia recorrida',
            help: 'El viaje entero, ida y vuelta si todos volvieron a casa. En la unidad que nombra el selector.',
        },
        rate: {
            label: 'Valor por milla o kilómetro',
            help: 'Elegir un país llena esto y cambia la moneda con él. Cámbialo por lo que de verdad cuesta mantener el auto.',
        },
        passengers: { label: 'Pasajeros', help: 'Todos los del auto menos quien maneja.' },
        driverShares: {
            label: 'La persona que maneja también toma una parte',
            help: 'Apagado, los pasajeros cubren el viaje entre ellos.',
        },
        share: { label: 'Parte', help: 'Uno es una parte pareja. Media para alguien que solo fue de ida.' },
    },
    rows: { nameLabel: 'Nombre', namePrefix: 'Pasajero' },
    choices: {
        country: {
            label: 'País',
            help: 'Fija el valor de abajo. Cada valor se leyó de la página oficial de ese gobierno en julio de 2026, con el enlace debajo del selector.',
            options: {
                AU: {
                    label: 'Australia (kilómetros)',
                    note: '0.91 AUD por kilómetro, para el año fiscal que arranca el 1 de julio de 2026. El año anterior era 0.88.',
                },
                BE: {
                    label: 'Bélgica (kilómetros)',
                    note: '0.4440 EUR por kilómetro, del 1 de julio al 30 de septiembre de 2026. Bélgica lo revisa cada trimestre y últimamente lo ha revisado mes a mes, así que mira la fecha antes de apoyarte en el número.',
                },
                BR: {
                    label: 'Brasil (kilómetros)',
                    note: 'Brasil no tiene un valor federal por kilómetro. La regla federal paga un máximo diario sin distancia adentro, así que aquí no hay nada por lo que dividir un viaje. Pon lo que cuesta mantener el auto en la calle.',
                },
                CA: {
                    label: 'Canadá (kilómetros)',
                    note: '0.72 CAD por kilómetro para los primeros 5 mil kilómetros del año, y 0.66 después. Un viaje solo se queda dentro del primer tramo, así que esta página calcula todo a 0.72.',
                },
                FR: {
                    label: 'Francia (kilómetros)',
                    note: 'Francia publica una escala, no un valor. Está atada a los caballos fiscales del auto, y su tramo del medio suma una cifra fija encima de un valor por kilómetro, así que de ahí no sale un número solo. Pon lo que cuesta mantener el auto en la calle.',
                },
                DE: {
                    label: 'Alemania (kilómetros)',
                    note: '0.20 EUR por kilómetro, el valor de viaje para un auto según el § 5(1) de la ley federal de gastos de viaje, con tope de 130 EUR por trayecto. El valor de 0.30 es el § 5(2), y solo aplica cuando se dejó por escrito antes del viaje un interés oficial sustancial en llevar auto. La deducción de 0.38 entre casa y trabajo es un tercer régimen, contado en un solo sentido, y no es este.',
                },
                IE: {
                    label: 'Irlanda (kilómetros)',
                    note: 'Los valores de Irlanda se mueven en tramos que dependen de cuánto anduvo ya el auto este año, y suben antes de bajar. Un viaje solo no tiene valor propio. Pon lo que cuesta mantener el auto en la calle.',
                },
                NL: {
                    label: 'Países Bajos (kilómetros)',
                    note: '0.25 EUR por kilómetro para 2026, arriba de 0.23 del año anterior y con efecto retroactivo al 1 de enero.',
                },
                PL: {
                    label: 'Polonia (kilómetros)',
                    note: 'El máximo publicado de Polonia es 1.15 PLN por kilómetro para un motor de más de 900 cm³, y 0.89 PLN por debajo. El motor decide cuál aplica, así que la casilla del valor queda vacía para que elijas; la calculadora se queda en złoty.',
                },
                ES: {
                    label: 'España (kilómetros)',
                    note: '0.26 EUR por kilómetro, vigente desde julio de 2023. Peajes y estacionamiento quedan afuera y son tickets propios.',
                },
                GB: {
                    label: 'Reino Unido (millas)',
                    note: '0.55 GBP por milla, desde el 6 de abril de 2026. Es el valor aprobado para las primeras 10 mil millas del año fiscal y 0.25 después, y un viaje solo no llega a esa línea.',
                },
                US: {
                    label: 'Estados Unidos (millas)',
                    note: '0.76 USD por milla, para viajes desde el 1 de julio de 2026. El valor se revisó a mitad de año, así que la primera mitad de 2026 es 0.725 y la fecha del viaje decide cuál aplica.',
                },
                other: {
                    label: 'Otro lugar',
                    note: 'Aquí no hay una cifra oficial para ese caso. Pon lo que la distancia le cuesta a quien maneja, o arma una abajo con lo que consume el auto.',
                },
            },
        },
    },
    builder: {
        summary: 'Arranca de lo que consume el auto',
        title: 'Arma tu propio valor',
        intro: 'Dos números del tablero dan el combustible. El combustible es el piso y no la respuesta: el auto también se gasta, entra a servicio y vale menos al final del año que al principio.',
        fields: {
            fuelPer100: {
                label: 'Lo que consume cada 100',
                unit: 'litros',
                help: 'Por cada 100 en la unidad que tenga el selector de arriba, millas o kilómetros.',
            },
            fuelPrice: {
                label: 'Lo que cuesta un litro',
                help: 'En la moneda de arriba. El precio del cartel, no el de la tarjeta de puntos.',
            },
            wear: {
                label: 'Desgaste y pérdida de valor encima',
                help: 'Por cada milla o kilómetro. La parte que ningún ticket de combustible muestra: neumáticos, el servicio que llega antes, el auto valiendo menos que antes. En cero, esto calcula el combustible y ya.',
            },
        },
        floorLabel: 'Solo combustible',
        totalLabel: 'El valor que esto escribe',
        applyLabel: 'Usar este valor',
        appliedLabel: 'En la casilla de arriba',
    },
    related: [
        { href: '/es-419/blog/split-a-group-trip-across-countries', label: 'Dividir un viaje entre países' },
        { href: '/es-419/blog/split-expenses-across-currencies', label: 'Dividir gastos en varias monedas' },
        { href: '/es-419/rent-split-calculator', label: 'La otra calculadora' },
    ],
    faqs: [
        {
            question: '¿Por qué dividir el combustible al valor oficial de un gobierno?',
            answer: 'Porque es el único número del auto que nadie del auto eligió. Cada uno de estos es la estimación de trabajo de un gobierno sobre lo que una distancia en un auto particular le cuesta a quien lo tiene, y está publicado, fechado y abierto a que lo leas. Dividir solo el ticket del surtidor le cobra de menos a quien es dueño, y hacer las cuentas de la depreciación durante un fin de semana afuera es así como un favor termina en resentimiento.',
        },
        {
            question: '¿Y si el auto es alquilado y no de alguien del grupo?',
            answer: 'Entonces el valor no tiene nada que agregar. Una empresa de alquiler ya metió el desgaste en la tarifa diaria, así que la cifra honesta es la factura del alquiler más lo que se cargó al tanque, y las dos son tickets que puedes poner en una sala como gastos normales. Los valores por kilómetro existen para el auto que no tiene factura, porque es de una de ustedes.',
        },
        {
            question: '¿Qué debería incluir un valor por kilómetro además del combustible?',
            answer: 'Todo lo que la distancia gasta, no todo lo que cuesta el día. El combustible es la parte con ticket, y es la parte chica: los neumáticos se gastan, el servicio llega antes y un auto con más kilómetros vale menos que el mismo auto sin ellos. Por eso el armador de aquí muestra el combustible en su propia línea y después pregunta qué va encima. Un valor que se queda en el piso del combustible le cobra a quien maneja la gasolina y le deja el resto.',
        },
        {
            question: '¿Debería quien maneja pagar también una parte del viaje?',
            answer: 'Los dos arreglos son normales, y el interruptor hace el que le digas. Como está, los pasajeros cubren el viaje entre ellos, que es la lectura habitual de que alguien te lleve: una persona pone el auto y las otras ponen el dinero. Encendido, quien maneja toma una parte pareja junto a todos los demás, que se lee más justo cuando el auto está haciendo un trabajo para todo el grupo y no un favor a los pasajeros.',
        },
    ],
    phrases: {
        noRiders: 'Di cuántas personas van con quien maneja.',
        negativeDistance: 'Una distancia no puede ser menos que nada.',
        negativeRate: 'Un valor no puede ser menos que nada.',
        noDistance: 'Pon cuánto anduvo el auto.',
        noRate: 'Pon un valor por cada {unit}.',
        driveTooLong: 'Ese viaje es más largo de lo que esta página divide.',
        noShares: 'Todas las partes están en cero, así que no hay nada que dividir.',
        unitMile: 'milla',
        unitKilometre: 'kilómetro',
        distanceLabel: 'Distancia',
        rateLabel: 'Valor por cada {unit}',
        costLabel: 'Lo que costó el viaje',
        shareDetail: '{share} de {total} partes',
        driverLabel: 'Al volante',
        driverDetail: 'su propia parte, que nadie entrega',
    },
}

export const mileageSplitPtBr: ToolWords = {
    meta: {
        title: 'Dividir o custo de uma viagem de carro',
        description:
            'Calcule quanto a viagem custou pela taxa oficial por quilômetro, que cobre o carro inteiro e não só o combustível, e divida entre todo mundo que estava dentro.',
    },
    copy: {
        h1: 'Calculadora para dividir uma viagem de carro',
        intro: [
            'Diga quanto o carro andou e quantas pessoas estavam dentro. A viagem é calculada pela taxa oficial de reembolso do país que você escolher, e embaixo está o que cada passageiro deve para quem dirigiu.',
            'No Brasil não existe taxa federal por quilômetro. A regra federal paga um teto por dia, sem nenhuma distância dentro dela, então aqui você digita a sua própria taxa, e o bloco no fim monta uma a partir do que o carro consome.',
            'Uma taxa justa por quilômetro nunca é só o combustível. Ela está no lugar dos pneus, da revisão que chega antes da hora e do valor que o carro perde enquanto você aproveita, e por isso um número oficial fica bem acima do que o comprovante do posto sugere. Escreva por cima se você conhece o carro melhor que o estado. Deixe o Split by Peanut cobrar depois, para quem dirigiu não precisar levantar o assunto no grupo.',
        ],
        resultTitle: 'Quem deve o quê para quem dirigiu',
        resultHint: 'Diga quantas pessoas foram com quem dirigiu.',
        roundingNote:
            'O custo de uma viagem quase nunca divide certinho, então o que sobra no fim vai para as maiores frações, uma unidade de cada vez. A coluna soma exatamente o que a viagem custou.',
        copyLabel: 'Copiar a lista',
        copyDone: 'Copiado',
        method: {
            title: 'O que a taxa deixa para os comprovantes',
            body: [
                'Ela cobra distância e mais nada. Pedágio, balsa, estacionamento e o café do posto ficam fora, e têm comprovante próprio. Esses vão para a sala junto com o resto da viagem.',
                'Ela também não paga ninguém por dirigir. Quatro horas no volante é uma coisa real de se ter feito, e nenhum número por quilômetro cobra por isso. Os grupos costumam resolver isso com o banco da frente e a escolha da música, e quem tenta resolver com dinheiro raramente gosta da conversa.',
            ],
        },
        concession: {
            title: 'Quando o comprovante do posto é a melhor ferramenta',
            body: 'Um tanque, um comprovante, uma viagem: divida o que o posto cobrou e pare por aí. Uma taxa por quilômetro vale a pena num carro que é de alguém, onde o custo está espalhado por anos de revisão que ninguém guardou o papel. Num carro alugado a nota mais o combustível é o número mais honesto, e ele já está escrito.',
        },
        goodToKnow: {
            title: 'Bom saber',
            body: [
                'O Split é grátis para sempre e não existe nada para assinar depois.',
                'Conversão automática para 156 moedas pela taxa indicativa do dia.',
                'Uma sala comporta até vinte pessoas.',
                'O Split registra um pagamento, não faz o pagamento. Ele não confere com banco nenhum, e não tem como conferir.',
            ],
        },
        cta: {
            title: 'O combustível não foi a única coisa que alguém pagou',
            body: 'Dez segundos. Sem e-mail, sem senha, sem download.',
            label: 'Criar um split',
        },
        faqTitle: 'Perguntas',
    },
    fields: {
        distance: {
            label: 'Distância rodada',
            help: 'A viagem inteira, ida e volta se todo mundo voltou. Na unidade que o seletor está usando.',
        },
        rate: {
            label: 'Taxa por milha ou quilômetro',
            help: 'Escolher um país preenche isto e troca a moeda junto. Escreva por cima com o que o carro custa de verdade para rodar.',
        },
        passengers: { label: 'Passageiros', help: 'Todo mundo no carro menos quem dirige.' },
        driverShares: {
            label: 'Quem dirige também entra com uma cota',
            help: 'Desligado, os passageiros cobrem a viagem entre eles.',
        },
        share: { label: 'Cota', help: 'Um é uma cota igual. Meia para quem foi só na ida.' },
    },
    rows: { nameLabel: 'Nome', namePrefix: 'Passageiro' },
    choices: {
        country: {
            label: 'País',
            help: 'Define a taxa abaixo. Cada taxa foi lida na página do próprio governo em julho de 2026, com o link embaixo do seletor.',
            options: {
                AU: {
                    label: 'Austrália (quilômetros)',
                    note: '0.91 AUD por quilômetro, para o ano fiscal que começa em 1 de julho de 2026. No ano anterior era 0.88.',
                },
                BE: {
                    label: 'Bélgica (quilômetros)',
                    note: '0.4440 EUR por quilômetro, de 1 de julho a 30 de setembro de 2026. A Bélgica revisa isso a cada trimestre e ultimamente tem revisado mês a mês, então olhe a data antes de confiar no número.',
                },
                BR: {
                    label: 'Brasil (quilômetros)',
                    note: 'O Brasil não tem taxa federal por quilômetro. A regra federal paga um teto por dia, sem nenhuma distância dentro dela, então não existe número nacional para dividir uma viagem. Digite aqui o que o carro custa para rodar.',
                },
                CA: {
                    label: 'Canadá (quilômetros)',
                    note: '0.72 CAD por quilômetro nos primeiros 5 mil quilômetros do ano, e 0.66 depois disso. Uma viagem sozinha fica dentro da primeira faixa, então esta página calcula tudo a 0.72.',
                },
                FR: {
                    label: 'França (quilômetros)',
                    note: 'A França publica uma tabela, não uma taxa. Ela é ligada à potência fiscal do carro, e a faixa do meio soma um valor fixo em cima de um número por quilômetro, então nenhum número único sai dela. Digite o que o carro custa para rodar.',
                },
                DE: {
                    label: 'Alemanha (quilômetros)',
                    note: '0.20 EUR por quilômetro, a taxa de viagem para carro no § 5(1) da lei federal de despesas de viagem, com teto de 130 EUR por trajeto. A taxa de 0.30 é o § 5(2), e só vale quando um interesse oficial relevante em levar o carro foi registrado por escrito antes da viagem. A dedução de 0.38 entre casa e trabalho é um terceiro regime, contado só na ida, e não é este.',
                },
                IE: {
                    label: 'Irlanda (quilômetros)',
                    note: 'As taxas da Irlanda andam em faixas que dependem de quanto o carro já rodou no ano, e elas sobem antes de cair. Uma viagem sozinha não tem taxa própria. Digite o que o carro custa para rodar.',
                },
                NL: {
                    label: 'Países Baixos (quilômetros)',
                    note: '0.25 EUR por quilômetro em 2026, acima dos 0.23 do ano anterior e valendo desde 1 de janeiro.',
                },
                PL: {
                    label: 'Polônia (quilômetros)',
                    note: 'O máximo publicado na Polônia é 1.15 PLN por quilômetro para motor acima de 900 cm³, e 0.89 PLN abaixo disso. O motor decide qual vale, então a caixa da taxa fica vazia para você escolher; a calculadora continua em złoty.',
                },
                ES: {
                    label: 'Espanha (quilômetros)',
                    note: '0.26 EUR por quilômetro, em vigor desde julho de 2023. Pedágio e estacionamento ficam fora e têm comprovante próprio.',
                },
                GB: {
                    label: 'Reino Unido (milhas)',
                    note: '0.55 GBP por milha, desde 6 de abril de 2026. É a taxa aprovada para as primeiras 10 mil milhas do ano fiscal e 0.25 depois disso, e uma viagem sozinha não chega nessa linha.',
                },
                US: {
                    label: 'Estados Unidos (milhas)',
                    note: '0.76 USD por milha, para viagens a partir de 1 de julho de 2026. A taxa mudou no meio do ano, então a primeira metade de 2026 é 0.725 e a data da viagem decide qual vale.',
                },
                other: {
                    label: 'Outro lugar',
                    note: 'Não tem número oficial aqui para esse caso. Digite o que a distância custa para quem dirige, ou monte um abaixo a partir do que o carro consome.',
                },
            },
        },
    },
    builder: {
        summary: 'Comece pelo que o carro consome',
        title: 'Monte a sua própria taxa',
        intro: 'Dois números do painel dão o combustível. O combustível é o piso e não a resposta: o carro também se desgasta, vai para a revisão e vale menos no fim do ano do que valia no começo.',
        fields: {
            fuelPer100: {
                label: 'O que ele gasta a cada 100',
                unit: 'litros',
                help: 'A cada 100 na unidade que o seletor acima está usando, milhas ou quilômetros.',
            },
            fuelPrice: {
                label: 'Quanto custa um litro',
                help: 'Na moeda acima. O preço da bomba, não o do clube de desconto.',
            },
            wear: {
                label: 'Desgaste e perda de valor em cima',
                help: 'Por milha ou quilômetro. A parte que nenhum comprovante de combustível mostra: pneus, a revisão que chega antes, o carro valendo menos do que valia. Em zero, isto cobra o combustível e para por aí.',
            },
        },
        floorLabel: 'Só o combustível',
        totalLabel: 'A taxa que isto escreve',
        applyLabel: 'Usar esta taxa',
        appliedLabel: 'Na caixa acima',
    },
    related: [
        { href: '/pt-br/blog/split-a-group-trip-across-countries', label: 'Dividir uma viagem entre países' },
        { href: '/pt-br/blog/split-expenses-across-currencies', label: 'Dividir despesas em várias moedas' },
        { href: '/pt-br/rent-split-calculator', label: 'A outra calculadora' },
    ],
    faqs: [
        {
            question: 'O Brasil tem uma taxa oficial por quilômetro?',
            answer: 'Não tem. A regra federal paga um teto por dia, sem nenhum termo de distância dentro dela, então não existe um número nacional por quilômetro para dividir uma viagem. No Brasil a taxa da caixa é sua: comece pelo que o carro consome, no bloco de montar, e some o desgaste em cima. Os números locais e de categoria que existem por aí não substituem uma taxa nacional.',
        },
        {
            question: 'Por que dividir o combustível pela taxa oficial de um governo?',
            answer: 'Porque é o único número do carro que ninguém dentro do carro escolheu. Cada um deles é a estimativa de trabalho de um governo sobre o que uma distância num carro particular custa para quem é dono dele, e está publicado, datado e aberto para você ler. Dividir só o comprovante do posto cobra de menos de quem é dono, e fazer a conta da depreciação num fim de semana fora é como uma carona vira mágoa.',
        },
        {
            question: 'E se o carro for alugado e não de alguém do grupo?',
            answer: 'Aí a taxa não tem nada a acrescentar. A locadora já colocou o desgaste na diária, então o número honesto é a nota do aluguel mais o que foi para o tanque, e os dois são comprovantes que vocês colocam numa sala como despesas normais. Taxa por quilômetro existe para o carro que não tem nota, porque ele é de alguém do grupo.',
        },
        {
            question: 'O que uma taxa por quilômetro deve incluir além do combustível?',
            answer: 'Tudo o que a distância gasta, não tudo o que o dia custa. O combustível é a parte com comprovante, e é a parte menor: os pneus se gastam, a revisão chega antes e um carro com mais quilômetros vale menos que o mesmo carro sem eles. Por isso o bloco de montar mostra o combustível numa linha só dele e depois pergunta o que vai em cima. Uma taxa parada no piso do combustível cobra a gasolina de quem dirige e deixa o resto para quem dirige.',
        },
        {
            question: 'Quem dirige também deve pagar uma cota da viagem?',
            answer: 'Os dois arranjos são comuns, e o interruptor faz o que você mandar. Do jeito que está, os passageiros cobrem a viagem entre eles, que é a leitura comum de uma carona: uma pessoa entra com o carro e as outras entram com o dinheiro. Ligado, quem dirige fica com uma cota igual às demais, o que soa mais justo quando o carro está fazendo um trabalho para o grupo inteiro e não um favor para os passageiros.',
        },
    ],
    phrases: {
        noRiders: 'Diga quantas pessoas foram com quem dirige.',
        negativeDistance: 'Uma distância não pode ser menos que nada.',
        negativeRate: 'Uma taxa não pode ser menos que nada.',
        noDistance: 'Coloque quanto o carro andou.',
        noRate: 'Coloque uma taxa por {unit}.',
        driveTooLong: 'Essa viagem é mais longa do que esta página divide.',
        noShares: 'Todas as cotas estão em zero, então não tem nada para dividir.',
        unitMile: 'milha',
        unitKilometre: 'quilômetro',
        distanceLabel: 'Distância',
        rateLabel: 'Taxa por {unit}',
        costLabel: 'O que a viagem custou',
        shareDetail: '{share} de {total} cotas',
        driverLabel: 'Quem dirigiu',
        driverDetail: 'a própria cota, que ninguém entrega',
    },
}
