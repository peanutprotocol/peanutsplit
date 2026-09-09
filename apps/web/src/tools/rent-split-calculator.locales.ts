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
        h1: 'Calculadora para dividir el alquiler por metros cuadrados',
        intro: [
            'Ingresa el alquiler mensual y el tamaño del cuarto privado de cada persona para calcular su parte. Los resultados se actualizan mientras escribes.',
            'Deja todos los controles al mismo nivel para dividir solo por tamaño de cuarto. Si quieren considerar cuánto puede pagar cada persona, acuerden niveles distintos. Un nivel más alto le da más peso a ese cuarto.',
        ],
        resultTitle: 'Lo que paga cada cuarto',
        resultHint: 'Ingresa el alquiler mensual y la cantidad de roomies.',
        roundingNote:
            'Cada parte se redondea hacia abajo. El resto se distribuye entre las fracciones más grandes, de a una unidad mínima de la moneda, hasta completar el alquiler total.',
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
            body: 'Usen el resultado como punto de partida para ponerse de acuerdo. Los controles son pesos relativos y no calculan proporciones de ingresos. Guarden los montos acordados para que todos tengan el mismo registro cada mes.',
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
        { href: '/es-419/mileage-split-calculator', label: 'Calculadora de gastos de viaje en auto' },
    ],
    faqs: [
        {
            question: '¿Cómo se divide el alquiler por metros cuadrados?',
            answer: 'Divide la superficie de cada cuarto privado entre la superficie privada total y multiplica por el alquiler. Mantén los controles al mismo nivel. Las áreas comunes quedan fuera del cálculo; consideren si quieren asignarles una parte del alquiler para dividirla por igual.',
        },
        {
            question: '¿Qué hace el control al lado de cada nombre?',
            answer: 'El control multiplica la superficie del cuarto por un peso de uno a cinco. Cada superficie ponderada se divide entre el total para calcular la parte del alquiler. Si todos los niveles coinciden, el alquiler depende solo del tamaño del cuarto. Si todas las superficies son cero, el cálculo parte de cuartos iguales.',
        },
        {
            question: '¿Cómo se divide el alquiler cuando alguien gana más?',
            answer: 'Si todos acuerdan que quien gana más aporte más, sube su control para darle más peso a su cuarto. El control no calcula una proporción de ingresos ni decide qué es justo. Déjalos al mismo nivel si quieren que el ingreso no influya.',
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
        floorAreaLabel: 'Superficie medida',
        areaValue: '{area} m²',
        slidersLabel: 'Niveles de los controles',
        detailTilted: 'cuarto {room}, nivel {notch}, o sea {share} del alquiler',
        detailPlain: '{size} m², {share} del alquiler',
    },
}

export const rentSplitPtBr: ToolWords = {
    meta: {
        title: 'Dividir o aluguel por metro quadrado',
        description:
            'Calcule a parte de cada pessoa no aluguel pelo tamanho do quarto. Ajuste os pesos de comum acordo e veja valores que somam o aluguel total.',
    },
    copy: {
        h1: 'Calculadora para dividir o aluguel por metro quadrado',
        intro: [
            'Informe o aluguel mensal e o tamanho do quarto individual de cada pessoa para calcular sua parte. Os resultados mudam enquanto você digita.',
            'Deixe todos os controles no mesmo nível para dividir apenas pela metragem. Se quiserem considerar quanto cada pessoa pode pagar, combinem níveis diferentes. Um nível mais alto dá mais peso àquele quarto.',
        ],
        resultTitle: 'O que cada quarto paga',
        resultHint: 'Informe o aluguel mensal e o número de moradores.',
        roundingNote:
            'Cada cota é arredondada para baixo. O restante é distribuído entre as maiores frações, uma unidade mínima da moeda por vez, até completar o aluguel total.',
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
            body: 'Usem o resultado como ponto de partida para chegar a um acordo. Os controles são pesos relativos e não calculam proporções de renda. Guardem os valores combinados para todos terem o mesmo registro a cada mês.',
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
        { href: '/pt-br/mileage-split-calculator', label: 'Calculadora de despesas de viagem de carro' },
    ],
    faqs: [
        {
            question: 'Como dividir o aluguel por metro quadrado?',
            answer: 'Divida a área de cada quarto individual pela área total dos quartos e multiplique pelo aluguel. Mantenha os controles no mesmo nível. As áreas comuns ficam fora da conta; avaliem se querem reservar uma parte do aluguel para dividi-la igualmente.',
        },
        {
            question: 'O que o controle ao lado de cada nome faz?',
            answer: 'O controle multiplica a área do quarto por um peso de um a cinco. Cada área ponderada é dividida pelo total para calcular a cota do aluguel. Se todos os níveis forem iguais, o aluguel depende apenas da metragem. Se todas as áreas forem zero, o cálculo parte de quartos iguais.',
        },
        {
            question: 'Como dividir o aluguel quando uma pessoa ganha mais?',
            answer: 'Se todos concordarem que quem ganha mais deve contribuir mais, suba o controle dessa pessoa para dar mais peso ao quarto dela. O controle não calcula uma proporção de renda nem decide o que é justo. Deixe os níveis iguais se quiserem que a renda não influencie o resultado.',
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
        floorAreaLabel: 'Metragem medida',
        areaValue: '{area} m²',
        slidersLabel: 'Níveis dos controles',
        detailTilted: 'quarto {room}, nível {notch}, ou seja {share} do aluguel',
        detailPlain: '{size} m², {share} do aluguel',
    },
}
