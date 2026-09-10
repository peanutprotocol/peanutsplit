import type { ToolWords } from './types'

/**
 * The rent calculator in Spanish and in Portuguese.
 *
 * Authored in each language using the shared stylebook. Calculation assumptions and product
 * facts stay consistent across locales.
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
            'Calcula el alquiler de cada roomie según el tamaño de su cuarto. Ajusta los pesos de común acuerdo y obtén un reparto que suma el alquiler total.',
    },
    copy: {
        h1: 'Divide el alquiler por tamaño de cuarto',
        intro: ['Ingresa el alquiler mensual y el tamaño de cada cuarto privado para ver cuánto paga cada persona.'],
        inputTitle: '1. Alquiler mensual',
        rowsTitle: '2. Tamaño de los cuartos',
        rowsHelp: 'Ingresa la superficie de cada cuarto privado, sin áreas comunes. Los nombres son opcionales.',
        optionalTitle: 'Ajustar los aportes (opcional)',
        optionalHelp:
            'Con pesos iguales, el alquiler se divide solo por tamaño de cuarto. Acuerden cualquier cambio: un peso mayor aumenta lo que paga esa persona.',
        resultTitle: 'Alquiler mensual por persona',
        resultHint: 'Ingresa el alquiler mensual y la cantidad de personas que lo comparten.',
        roundingNote: 'El redondeo se ajusta para que las partes sumen el alquiler total.',
        copyLabel: 'Copiar el reparto',
        copyDone: 'Copiado',
        method: {
            title: 'Lo que el tamaño del cuarto no incluye',
            body: [
                'La calculadora reparte todo el alquiler según los cuartos privados. No incluye las áreas comunes, como la cocina o la sala, por lo que puede darle demasiado peso a las diferencias entre cuartos. Tampoco considera un baño privado o mejor iluminación.',
                'Para incluir las áreas comunes, pueden acordar una parte del alquiler que se divida por igual y repartir el resto por tamaño de cuarto. Una hoja de cálculo permite registrar esa cuenta. Si los cuartos son parecidos, dividir por igual puede ser suficiente.',
            ],
        },
        concession: {
            title: 'Acuerden el reparto antes de pagar',
            body: 'Usen el resultado como punto de partida para ponerse de acuerdo. Los pesos opcionales multiplican la superficie de cada cuarto. Guarden los montos que acuerden para cada mes.',
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
            title: 'Lleva un registro de los gastos de la casa',
            body: 'Crea una sala y comparte el enlace con tus roomies. No necesitas cuenta ni descargas.',
            label: 'Crear un split',
        },
        faqTitle: 'Preguntas',
    },
    fields: {
        rent: { label: 'Alquiler mensual total' },
        people: { label: 'Personas que comparten el alquiler' },
        size: {
            label: 'Tamaño del cuarto',
            unit: 'm²',
        },
        rich: {
            label: 'Peso del aporte',
            notches: ['1×', '2×', '3×', '4×', '5×'],
        },
    },
    rows: { nameLabel: 'Nombre', namePrefix: 'Roomie' },
    related: [
        { href: '/es-419/splitwise-alternative', label: 'Cómo se compara Split con Splitwise' },
        { href: '/es-419/mileage-split-calculator', label: 'Calculadora de gastos de viaje en auto' },
    ],
    faqs: [
        {
            question: '¿Cómo se divide el alquiler por metros cuadrados?',
            answer: 'Divide la superficie de cada cuarto privado entre la superficie privada total y multiplica por el alquiler. La calculadora usa este método de forma predeterminada. Las áreas comunes quedan fuera del cálculo; consideren si quieren asignarles una parte del alquiler para dividirla por igual.',
        },
        {
            question: '¿Cómo funcionan los pesos opcionales?',
            answer: 'Abre “Ajustar los aportes” para elegir un peso de 1× a 5× para cada persona. La calculadora multiplica la superficie de cada cuarto por su peso y reparte el alquiler en esas proporciones. Con pesos iguales, el alquiler depende solo del tamaño del cuarto. Si todas las superficies son cero, el cálculo parte de cuartos iguales.',
        },
        {
            question: '¿Cómo se divide el alquiler cuando alguien gana más?',
            answer: 'Si todos acuerdan que quien gana más aporte más, abre “Ajustar los aportes” y aumenta su peso. La calculadora multiplica la superficie de su cuarto por ese peso. No usa cifras de ingresos. Deja todos los pesos iguales para dividir solo por tamaño de cuarto.',
        },
        {
            question: '¿Por qué una persona paga una fracción más que las demás?',
            answer: 'El redondeo puede dejar un pequeño resto sin asignar. La calculadora redondea cada parte hacia abajo y distribuye el resto entre las fracciones más grandes, de a una unidad mínima de la moneda. Así, las partes suman el alquiler total.',
        },
    ],
    phrases: {
        noPeople: 'Ingresa la cantidad de roomies.',
        negativeRent: 'El alquiler no puede ser negativo.',
        rentTooBig: 'El alquiler supera el límite de esta calculadora.',
        rentLabel: 'Alquiler',
        floorAreaLabel: 'Superficie privada total',
        areaValue: '{area} m²',
        slidersLabel: 'Pesos de los aportes',
        detailTilted: '{room} de superficie · peso {notch}× · {share} del alquiler',
        detailPlain: '{size} m² · {share} del alquiler',
    },
}

export const rentSplitPtBr: ToolWords = {
    meta: {
        title: 'Dividir o aluguel por metro quadrado',
        description:
            'Calcule a parte de cada pessoa no aluguel pelo tamanho do quarto. Ajuste os pesos de comum acordo e veja valores que somam o aluguel total.',
    },
    copy: {
        h1: 'Divida o aluguel pelo tamanho do quarto',
        intro: ['Informe o aluguel mensal e o tamanho de cada quarto para ver quanto cada pessoa paga.'],
        inputTitle: '1. Aluguel mensal',
        rowsTitle: '2. Tamanho dos quartos',
        rowsHelp: 'Informe a área de cada quarto individual, sem as áreas comuns. Os nomes são opcionais.',
        optionalTitle: 'Ajustar as contribuições (opcional)',
        optionalHelp:
            'Com pesos iguais, o aluguel é dividido só pela metragem. Combinem qualquer mudança: um peso maior aumenta a parte daquela pessoa.',
        resultTitle: 'Aluguel mensal por pessoa',
        resultHint: 'Informe o aluguel mensal e o número de pessoas que o dividem.',
        roundingNote: 'O arredondamento é ajustado para que as partes somem o aluguel total.',
        copyLabel: 'Copiar o rateio',
        copyDone: 'Copiado',
        method: {
            title: 'O que a metragem do quarto não inclui',
            body: [
                'A calculadora divide todo o aluguel pela metragem dos quartos individuais. Ela deixa de fora as áreas comuns, como a cozinha e a sala, o que pode dar peso demais às diferenças entre quartos. Também não considera características como banheiro privativo ou melhor iluminação.',
                'Para considerar as áreas comuns, vocês podem combinar uma parte do aluguel para dividir igualmente e repartir o restante pela metragem dos quartos. Uma planilha permite registrar essa conta. Se os quartos forem parecidos, uma divisão igual pode ser suficiente.',
            ],
        },
        concession: {
            title: 'Combinem a divisão antes de pagar',
            body: 'Usem o resultado como ponto de partida para chegar a um acordo. Os pesos opcionais multiplicam a área de cada quarto. Guardem os valores que combinarem para cada mês.',
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
            title: 'Registre as despesas da casa',
            body: 'Crie uma sala e compartilhe o link com os outros moradores. Não é preciso criar conta nem baixar nada.',
            label: 'Criar um split',
        },
        faqTitle: 'Perguntas',
    },
    fields: {
        rent: { label: 'Aluguel mensal total' },
        people: { label: 'Pessoas dividindo o aluguel' },
        size: {
            label: 'Tamanho do quarto',
            unit: 'm²',
        },
        rich: {
            label: 'Peso da contribuição',
            notches: ['1×', '2×', '3×', '4×', '5×'],
        },
    },
    rows: { nameLabel: 'Nome', namePrefix: 'Pessoa' },
    related: [
        { href: '/pt-br/splitwise-alternative', label: 'Como o Split se compara ao Splitwise' },
        { href: '/pt-br/mileage-split-calculator', label: 'Calculadora de despesas de viagem de carro' },
    ],
    faqs: [
        {
            question: 'Como dividir o aluguel por metro quadrado?',
            answer: 'Divida a área de cada quarto individual pela área total dos quartos e multiplique pelo aluguel. A calculadora usa esse método por padrão. As áreas comuns ficam fora da conta; avaliem se querem reservar uma parte do aluguel para dividi-la igualmente.',
        },
        {
            question: 'Como funcionam os pesos opcionais?',
            answer: 'Abra “Ajustar as contribuições” para escolher um peso de 1× a 5× para cada pessoa. A calculadora multiplica a área de cada quarto pelo seu peso e divide o aluguel nessas proporções. Com pesos iguais, o aluguel depende só da metragem. Se todas as áreas forem zero, o cálculo parte de quartos iguais.',
        },
        {
            question: 'Como dividir o aluguel quando uma pessoa ganha mais?',
            answer: 'Se todos concordarem que quem ganha mais deve contribuir mais, abra “Ajustar as contribuições” e aumente o peso dessa pessoa. A calculadora multiplica a área do quarto por esse peso. Ela não usa valores de renda. Deixe todos os pesos iguais para dividir só pela metragem.',
        },
        {
            question: 'Por que uma pessoa paga uma fração a mais que as outras?',
            answer: 'O arredondamento pode deixar um pequeno valor sem destino. A calculadora arredonda cada cota para baixo e distribui o restante entre as maiores frações, uma unidade mínima da moeda por vez. Assim, as cotas somam o aluguel total.',
        },
    ],
    phrases: {
        noPeople: 'Informe o número de moradores.',
        negativeRent: 'O aluguel não pode ser negativo.',
        rentTooBig: 'O aluguel ultrapassa o limite desta calculadora.',
        rentLabel: 'Aluguel',
        floorAreaLabel: 'Área total dos quartos',
        areaValue: '{area} m²',
        slidersLabel: 'Pesos das contribuições',
        detailTilted: '{room} da área · peso {notch}× · {share} do aluguel',
        detailPlain: '{size} m² · {share} do aluguel',
    },
}
