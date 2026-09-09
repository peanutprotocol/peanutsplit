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
            'Calcula la parte de cada pasajero en un viaje en auto. Usa un valor por distancia de la lista o ingresa uno propio y elige si quien maneja también aporta.',
    },
    copy: {
        h1: 'Calculadora para dividir un viaje en auto',
        intro: [
            'Ingresa la distancia recorrida y la cantidad de pasajeros para calcular cuánto le debe cada persona a quien manejó. Elige un país para usar un valor de reembolso de la lista o ingresa uno propio.',
            'Un valor por distancia puede incluir otros costos además del combustible. Acuerden cuáles van a compartir antes de usar el resultado. La sección de abajo permite calcular el combustible y agregar un monto por desgaste y pérdida de valor.',
        ],
        resultTitle: 'Quién le debe qué a quien manejó',
        resultHint: 'Ingresa la cantidad de pasajeros, sin contar a quien maneja.',
        roundingNote:
            'Cada parte se redondea hacia abajo. El resto se distribuye entre las fracciones más grandes, de a una unidad mínima de la moneda, hasta completar el costo calculado del viaje.',
        copyLabel: 'Copiar la lista',
        copyDone: 'Copiado',
        method: {
            title: 'Gastos que se agregan por separado',
            body: [
                'El cálculo multiplica la distancia por el valor indicado. Agrega peajes, ferris, estacionamiento y otros gastos del viaje por separado en tu sala de Split.',
                'El cálculo no agrega un pago por el tiempo de quien maneja. Si el grupo quiere incluirlo, acuerden ese monto por separado.',
            ],
        },
        concession: {
            title: 'Compartir combustible o un auto alquilado',
            body: 'Si solo quieren compartir combustible, dividan el costo del combustible usado en el viaje. Para un auto alquilado, usen la factura del alquiler y el combustible en lugar de agregar un valor por distancia para los costos del propietario.',
        },
        goodToKnow: {
            title: 'Bueno saberlo',
            body: [
                'El servicio oficial es de uso gratuito y no tiene plan pago.',
                'Conversión automática para 156 monedas al tipo de cambio indicativo del día.',
                'Una sala tiene hasta veinte personas.',
                'Split registra los pagos. No envía dinero ni verifica los pagos con un banco.',
            ],
        },
        cta: {
            title: 'Registra los demás gastos del viaje',
            body: 'Crea una sala y comparte el enlace con el grupo. No necesitas cuenta ni descargas.',
            label: 'Crear un split',
        },
        faqTitle: 'Preguntas',
    },
    fields: {
        distance: {
            label: 'Distancia recorrida',
            help: 'Incluye el regreso si también lo comparten. Usa las millas o kilómetros indicados para el país elegido.',
        },
        rate: {
            label: 'Valor por milla o kilómetro',
            help: 'Al elegir un país se cambia la moneda y se completa el valor cuando hay uno en la lista. Puedes editarlo.',
        },
        passengers: { label: 'Pasajeros', help: 'Todos los del auto menos quien maneja.' },
        driverShares: {
            label: 'La persona que maneja también toma una parte',
            help: 'Apagado, los pasajeros cubren el viaje entre ellos.',
        },
        share: {
            label: 'Parte',
            help: 'Usa 1 para una parte completa o 0.5 para quien recorrió la mitad de la distancia.',
        },
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
        summary: 'Calcula un valor según el consumo',
        title: 'Calcula tu propio valor',
        intro: 'Ingresa el consumo y el precio por litro para calcular el combustible por milla o kilómetro. Agrega un monto acordado por desgaste y pérdida de valor si también quieren compartir esos costos.',
        fields: {
            fuelPer100: {
                label: 'Lo que consume cada 100',
                unit: 'litros',
                help: 'Por cada 100 en la unidad que tenga el selector de arriba, millas o kilómetros.',
            },
            fuelPrice: {
                label: 'Lo que cuesta un litro',
                help: 'Ingresa el precio pagado por litro en la moneda seleccionada.',
            },
            wear: {
                label: 'Desgaste y pérdida de valor encima',
                help: 'Monto adicional por milla o kilómetro para neumáticos, mantenimiento y pérdida de valor. Déjalo en cero para calcular solo combustible.',
            },
        },
        floorLabel: 'Solo combustible',
        totalLabel: 'Valor calculado',
        applyLabel: 'Usar este valor',
        appliedLabel: 'Valor aplicado',
    },
    related: [
        { href: '/es-419/blog/split-a-group-trip-across-countries', label: 'Dividir un viaje entre países' },
        { href: '/es-419/blog/split-expenses-across-currencies', label: 'Dividir gastos en varias monedas' },
        { href: '/es-419/rent-split-calculator', label: 'Calculadora para dividir el alquiler' },
    ],
    faqs: [
        {
            question: '¿Por qué usar un valor oficial por distancia para un viaje compartido?',
            answer: 'Un valor publicado sirve como referencia para costos además del combustible. Revisa la fuente y la fecha debajo del selector: el propósito y las condiciones cambian según el país. Puedes usar otro monto que el grupo acuerde. Esta calculadora divide gastos de viaje y no calcula deducciones fiscales.',
        },
        {
            question: '¿Y si el auto es alquilado y no de alguien del grupo?',
            answer: 'Usa la factura del alquiler, el combustible usado y los demás gastos del viaje. Agregar un valor por desgaste encima del alquiler puede contar el mismo costo dos veces. Registra los gastos reales en tu sala de Split.',
        },
        {
            question: '¿Qué debería incluir un valor por kilómetro además del combustible?',
            answer: 'Si quieren compartir más que el combustible, acuerden un monto por desgaste, mantenimiento y pérdida de valor. La calculadora de valor propio lo suma al combustible por milla o kilómetro. Deja el monto adicional en cero para calcular solo combustible.',
        },
        {
            question: '¿Debería quien maneja pagar también una parte del viaje?',
            answer: 'El grupo decide. Por defecto, los pasajeros cubren todo el costo calculado. Activa la opción de quien maneja para asignarle una parte también. Las partes de los pasajeros siguen siendo ajustables; quien recorrió la mitad de la distancia puede tener media parte.',
        },
    ],
    phrases: {
        noRiders: 'Ingresa la cantidad de pasajeros, sin contar a quien maneja.',
        negativeDistance: 'La distancia debe ser un número mayor o igual a cero.',
        negativeRate: 'El valor debe ser un número mayor o igual a cero.',
        noDistance: 'Ingresa la distancia recorrida.',
        noRate: 'Ingresa un valor por cada {unit}.',
        driveTooLong: 'El costo calculado supera el límite de esta calculadora.',
        noShares: 'Asigna un valor mayor a cero a por lo menos una parte.',
        unitMile: 'milla',
        unitKilometre: 'kilómetro',
        distanceLabel: 'Distancia',
        rateLabel: 'Valor por cada {unit}',
        costLabel: 'Lo que costó el viaje',
        shareDetail: '{share} de {total} partes',
        driverLabel: 'Al volante',
        driverDetail: 'costo cubierto por quien maneja',
    },
}

export const mileageSplitPtBr: ToolWords = {
    meta: {
        title: 'Dividir o custo de uma viagem de carro',
        description:
            'Calcule a parte de cada passageiro numa viagem de carro. Use uma taxa da lista ou informe a sua e escolha se quem dirige também paga uma cota.',
    },
    copy: {
        h1: 'Calculadora para dividir uma viagem de carro',
        intro: [
            'Informe a distância percorrida e o número de passageiros para calcular quanto cada pessoa deve a quem dirigiu. Escolha um país para usar uma taxa de reembolso da lista ou informe a sua.',
            'No Brasil não existe taxa federal por quilômetro. A regra federal prevê um limite diário, sem cálculo por distância. Ao selecionar Brasil, informe a taxa que o grupo combinou ou calcule uma abaixo a partir do consumo do carro.',
            'Uma taxa por distância pode incluir custos além do combustível. Combinem quais vão dividir antes de usar o resultado. A seção abaixo permite calcular o combustível e acrescentar um valor por desgaste e perda de valor do carro.',
        ],
        resultTitle: 'Quem deve o quê para quem dirigiu',
        resultHint: 'Informe o número de passageiros, sem contar quem dirige.',
        roundingNote:
            'Cada cota é arredondada para baixo. O restante é distribuído entre as maiores frações, uma unidade mínima da moeda por vez, até completar o custo calculado da viagem.',
        copyLabel: 'Copiar a lista',
        copyDone: 'Copiado',
        method: {
            title: 'Despesas para adicionar separadamente',
            body: [
                'O cálculo multiplica a distância pela taxa. Adicione pedágios, balsas, estacionamento e outras despesas da viagem separadamente na sua sala do Split.',
                'O cálculo não acrescenta um pagamento pelo tempo de quem dirige. Se o grupo quiser incluir esse valor, combinem isso separadamente.',
            ],
        },
        concession: {
            title: 'Dividir combustível ou um carro alugado',
            body: 'Se o grupo quiser dividir apenas combustível, use o custo do combustível consumido na viagem. Para um carro alugado, use a nota do aluguel e o combustível em vez de acrescentar uma taxa por distância para os custos do proprietário.',
        },
        goodToKnow: {
            title: 'Bom saber',
            body: [
                'O serviço oficial é de uso grátis e não tem plano pago.',
                'Conversão automática para 156 moedas pela taxa indicativa do dia.',
                'Uma sala comporta até vinte pessoas.',
                'O Split registra pagamentos. Ele não envia dinheiro nem verifica pagamentos com um banco.',
            ],
        },
        cta: {
            title: 'Registre as outras despesas da viagem',
            body: 'Crie uma sala e compartilhe o link com o grupo. Não é preciso criar conta nem baixar nada.',
            label: 'Criar um split',
        },
        faqTitle: 'Perguntas',
    },
    fields: {
        distance: {
            label: 'Distância rodada',
            help: 'Inclua a volta se ela também for compartilhada. Use as milhas ou quilômetros indicados para o país escolhido.',
        },
        rate: {
            label: 'Taxa por milha ou quilômetro',
            help: 'Escolher um país muda a moeda e preenche a taxa quando há uma na lista. Você pode editar o valor.',
        },
        passengers: { label: 'Passageiros', help: 'Todo mundo no carro menos quem dirige.' },
        driverShares: {
            label: 'Quem dirige também entra com uma cota',
            help: 'Desligado, os passageiros cobrem a viagem entre eles.',
        },
        share: { label: 'Cota', help: 'Use 1 para uma cota inteira ou 0.5 para quem percorreu metade da distância.' },
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
        summary: 'Calcule uma taxa pelo consumo',
        title: 'Calcule a sua própria taxa',
        intro: 'Informe o consumo e o preço por litro para calcular o combustível por milha ou quilômetro. Acrescente um valor combinado para desgaste e perda de valor do carro se quiserem dividir esses custos também.',
        fields: {
            fuelPer100: {
                label: 'O que ele gasta a cada 100',
                unit: 'litros',
                help: 'A cada 100 na unidade que o seletor acima está usando, milhas ou quilômetros.',
            },
            fuelPrice: {
                label: 'Quanto custa um litro',
                help: 'Informe o preço pago por litro na moeda selecionada.',
            },
            wear: {
                label: 'Desgaste e perda de valor em cima',
                help: 'Valor adicional por milha ou quilômetro para pneus, manutenção e perda de valor do carro. Deixe em zero para calcular apenas combustível.',
            },
        },
        floorLabel: 'Só o combustível',
        totalLabel: 'Taxa calculada',
        applyLabel: 'Usar esta taxa',
        appliedLabel: 'Taxa aplicada',
    },
    related: [
        { href: '/pt-br/blog/split-a-group-trip-across-countries', label: 'Dividir uma viagem entre países' },
        { href: '/pt-br/blog/split-expenses-across-currencies', label: 'Dividir despesas em várias moedas' },
        { href: '/pt-br/rent-split-calculator', label: 'Calculadora para dividir o aluguel' },
    ],
    faqs: [
        {
            question: 'O Brasil tem uma taxa oficial por quilômetro?',
            answer: 'Não. A regra federal prevê um limite diário, sem cálculo por distância. Ao selecionar Brasil, informe a taxa que o grupo combinou ou use a seção de consumo para calcular combustível e acrescentar desgaste. Taxas locais ou de categorias profissionais não são uma taxa nacional.',
        },
        {
            question: 'Por que usar uma taxa oficial por distância numa viagem compartilhada?',
            answer: 'Uma taxa publicada serve de referência para custos além do combustível. Confira a fonte e a data abaixo do seletor: a finalidade e as condições mudam conforme o país. Você pode usar outro valor combinado pelo grupo. Esta calculadora divide despesas de viagem e não calcula deduções fiscais.',
        },
        {
            question: 'E se o carro for alugado e não de alguém do grupo?',
            answer: 'Use a nota do aluguel, o combustível consumido e as outras despesas da viagem. Acrescentar uma taxa de desgaste ao aluguel pode contar o mesmo custo duas vezes. Registre as despesas reais na sua sala do Split.',
        },
        {
            question: 'O que uma taxa por quilômetro deve incluir além do combustível?',
            answer: 'Se quiserem dividir mais que combustível, combinem um valor para desgaste, manutenção e perda de valor do carro. A seção de taxa própria soma esse valor ao combustível por milha ou quilômetro. Deixe o valor adicional em zero para calcular apenas combustível.',
        },
        {
            question: 'Quem dirige também deve pagar uma cota da viagem?',
            answer: 'O grupo decide. Por padrão, os passageiros cobrem todo o custo calculado. Ative a opção de quem dirige para atribuir uma cota a essa pessoa também. As cotas dos passageiros continuam ajustáveis; quem percorreu metade da distância pode ficar com meia cota.',
        },
    ],
    phrases: {
        noRiders: 'Informe o número de passageiros, sem contar quem dirige.',
        negativeDistance: 'A distância deve ser um número maior ou igual a zero.',
        negativeRate: 'A taxa deve ser um número maior ou igual a zero.',
        noDistance: 'Informe a distância percorrida.',
        noRate: 'Informe uma taxa por {unit}.',
        driveTooLong: 'O custo calculado ultrapassa o limite desta calculadora.',
        noShares: 'Defina pelo menos uma cota acima de zero.',
        unitMile: 'milha',
        unitKilometre: 'quilômetro',
        distanceLabel: 'Distância',
        rateLabel: 'Taxa por {unit}',
        costLabel: 'O que a viagem custou',
        shareDetail: '{share} de {total} cotas',
        driverLabel: 'Quem dirigiu',
        driverDetail: 'custo coberto por quem dirige',
    },
}
