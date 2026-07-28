import { isDoodleName, type DoodleName } from '@/components/ui/doodles'
import { kebab } from '@/lib/slugify'

/**
 * What a room is called → what it looks like.
 *
 * Somebody types "Ski trip" and the room should already be a pair of skis before they think to
 * open a picker. Every room used to open with a randomly rolled emoji, which is a coin toss that
 * gets it right one time in sixteen.
 *
 * ORDER IS THE WHOLE ALGORITHM. First match wins, so the table runs specific → general: "ski
 * trip" has to find `ski` before it finds `trip`, and "birthday cake" has to find `cake` before
 * "birthday" sends it to the balloons. Reordering these rows changes behaviour, so add a new
 * keyword to the row it belongs to rather than appending a new row at the end.
 *
 * All three locales share one table rather than living in the message catalogs. This is not
 * translatable copy — nothing here is ever displayed — and a group in São Paulo naming a room
 * "Ski trip" in English is normal, so matching against all three languages at once is more right
 * than matching against the reader's current one.
 *
 * Matching is on the kebab of the name, which is `slugify`'s own function: it strips accents and
 * punctuation and joins words with hyphens, so `Café ☕` and `cafe` land on the same string and
 * a keyword only has to be written one way. Substring matching on that kebab is deliberate —
 * "pizzas" and "cumpleaños-de-ana" should both hit — and it is why the shortest keywords here
 * are still four characters. A two-letter keyword would match inside unrelated words.
 */
const KEYWORDS: ReadonlyArray<readonly [DoodleName | string, readonly string[]]> = [
    // ── specific enough to beat anything below them ──
    ['ski', ['ski', 'esqui', 'snowboard', 'piste', 'slope']],
    ['cake', ['cake', 'bolo', 'tarta', 'birthday', 'cumple', 'aniversario', 'anniversaire']],
    ['sushi', ['sushi', 'sashimi', 'izakaya', 'japanese', 'japones', 'nikkei']],
    ['pizza', ['pizza', 'pizzeria']],
    ['burger', ['burger', 'hamburgues', 'hamburgu', 'bbq', 'barbecue', 'churrasco', 'asado']],
    ['noodles', ['ramen', 'noodle', 'thai', 'pho-', 'fideos', 'macarr', 'wok']],
    ['coffee', ['coffee', 'cafe', 'brunch', 'breakfast', 'desayuno', 'cafezinho', 'padaria']],
    ['wine', ['wine', 'vino', 'vinho', 'winery', 'bodega', 'vineyard', 'tasting', 'enoteca']],
    ['beer', ['beer', 'cerveja', 'cerveza', 'birra', 'pub-', 'chopp', 'happy-hour', 'drinks', 'copas']],
    ['market', ['market', 'feria', 'feirinha', 'mercadillo', 'bazar']],
    ['cart', ['groceries', 'grocery', 'supermarket', 'supermercado', 'compras', 'mercado', 'shopping']],

    ['taxi', ['taxi', 'uber', 'cabify', 'didi', 'corrida', 'ride-']],
    ['train', ['train', 'tren-', 'trem-', 'rail', 'metro', 'subway', 'interrail', 'eurail']],
    ['car', ['gasolina', 'nafta', 'combustivel', 'petrol', 'fuel', 'parking', 'peaje', 'pedagio', 'toll', 'car-']],
    ['plane', ['flight', 'plane', 'airport', 'airfare', 'vuelo', 'aviao', 'avion', 'voo-', 'aeroporto']],
    ['boat', ['boat', 'sail', 'yacht', 'cruise', 'barco', 'velero', 'crucero', 'ferry', 'catamaran']],
    ['van', ['van-', 'campervan', 'roadtrip', 'road-trip', 'furgoneta', 'kombi', 'motorhome', 'combi']],
    ['tent', ['camp', 'glamping', 'acampa', 'festival', 'burning-man']],

    ['hotel', ['hotel', 'airbnb', 'hostel', 'pousada', 'resort', 'alojamiento', 'hospedagem', 'lodge']],
    [
        'house',
        ['flatmate', 'roommate', 'housemate', 'rent-', 'alquiler', 'aluguel', 'republica', 'house', 'casa', 'piso'],
    ],
    ['island', ['beach', 'island', 'playa', 'praia', 'isla-', 'ilha', 'surf', 'coast', 'costa', 'bali', 'ibiza']],
    [
        'mountain',
        ['mountain', 'montan', 'alps', 'alpes', 'chalet', 'cabin', 'hike', 'hiking', 'trek', 'trilha', 'nieve', 'neve'],
    ],
    ['sun', ['summer', 'holiday', 'vacation', 'vacacion', 'ferias', 'verano', 'verao']],

    ['gift', ['gift', 'regalo', 'presente', 'secret-santa', 'amigo-secreto', 'amigo-oculto']],
    ['guitar', ['concert', 'concierto', 'gig-', 'band-', 'banda', 'show-', 'festa-junina', 'karaoke']],
    [
        'party',
        [
            'party',
            'fiesta',
            'festa',
            'new-year',
            'nye-',
            'ano-nuevo',
            'reveillon',
            'despedida',
            'bachelor',
            'stag-',
            'hen-',
        ],
    ],
    ['cinema', ['cinema', 'movie', 'film', 'cine-', 'filme', 'netflix', 'teatro', 'theatre', 'theater']],
    ['dog', ['dog-', 'perro', 'cachorro', 'pet-', 'vet-', 'veterinar', 'gato-']],
    [
        'football',
        ['football', 'soccer', 'futbol', 'futebol', 'padel', 'tennis', 'tenis', 'partido', 'jogo-', 'match', 'gym-'],
    ],
    ['suitcase', ['trip', 'travel', 'viaje', 'viagem', 'tour-', 'escapada', 'weekend']],
]

/** Nothing matched. The peanut is the app's own mark, so an unrecognised room still looks like
 *  it belongs here rather than like a missing asset. */
export const FALLBACK_DOODLE: DoodleName = 'peanut'

/**
 * The drawing for a room name, or the peanut.
 *
 * `isDoodleName` guards every row because the table is hand-written and the drawing set is
 * generated: a renamed drawing would otherwise reach `DOODLE[name]` as undefined and render an
 * empty path — a blank square, which looks like a broken image and passes a typecheck.
 */
export function roomDoodleFor(name: string): DoodleName {
    const slug = `-${kebab(name)}-`
    for (const [doodle, keywords] of KEYWORDS) {
        if (!isDoodleName(doodle)) continue
        if (keywords.some((keyword) => slug.includes(keyword))) return doodle
    }
    return FALLBACK_DOODLE
}
