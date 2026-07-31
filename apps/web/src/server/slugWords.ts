/**
 * The 1,024 words a room slug's tail is drawn from.
 *
 * THE ARITHMETIC THAT MAKES THIS FREE: the tail used to be six Crockford
 * base32 characters, and 32^6 === 1024^3 === 1,073,741,824. Three words from a
 * 1,024-word list is therefore an EXACT swap for that tail, not an
 * approximation — the slug is the room's only access control, so the tail may
 * get friendlier but it may never get shorter in bits. Two words would be a
 * 1,024x weakening; a 4,096-word two-word tail would still be 64x weaker. The
 * list length is a power of two on purpose: it makes both the identity above
 * and the unbiased masked draw in `slug.ts` true at the same time. Changing
 * the length breaks both, which is why `slug.test.ts` pins the count and a
 * hash of the contents.
 *
 * How the list was screened, in order:
 *
 * 1. Concrete and picturable — animals, food, places, materials, weather,
 *    colours, and plain cheerful adjectives. A slug should read like a place.
 * 2. Short. Every word is 3-7 ASCII letters, so the tail costs about twelve
 *    characters more than the old one — worst case 23 against 6. That shows up
 *    in the copyable link on the share screen, which wraps, and in whatever the
 *    chat client does with a pasted URL. The unfurl images never print the slug
 *    (it is the room's credential), so they do not grow.
 * 3. Lowercase a-z only. The words are joined with hyphens, so a word that
 *    contained one would make the tail ambiguous to split or read back.
 * 4. Unambiguous when spoken. This is the property the old base32 alphabet was
 *    protecting by dropping i, l, o and u. Homophones are the word-list version
 *    of that problem, so only one of each set survives (pear/pair, sun/son),
 *    and words whose homophone is the MORE common spelling were dropped
 *    outright (tern/turn, mane/main, thyme/time, kernel/colonel, cymbal/symbol,
 *    beech/beach, mussel/muscle). So were words with a live spelling variant
 *    (gray/grey, harbor/harbour, yogurt/yoghurt, omelet/omelette, cozy/cosy,
 *    disc/disk), words needing an accent or a hyphen to be written correctly
 *    (pinata, eclair, yo-yo, bow tie), and words nobody spells right first try
 *    (fuchsia, sequoia, plateau, brooch, sieve).
 * 5. Nothing rude, and nothing that becomes rude next to another entry. No
 *    profanity, slurs, human anatomy, violence, weapons, drugs or alcohol. Two
 *    of these draws land side by side at random, so the safety has to hold per
 *    word rather than per pair: there are no words for people (girl, boy, kid),
 *    no ethnicity or religion words, and no adjectives with a sexual or violent
 *    second reading (hot, wet, hard, thick, spicy, frisky). Innocent English
 *    words with a slur history in some places went too: cracker, spade, monkey,
 *    gypsy, moor, ebony, and black/white as colours.
 * 6. Screened against es-419 and pt-BR, because the product is trilingual and
 *    the link gets read aloud by people who do not speak English. Dropped for
 *    Spanish: cola, concha/conch, mona, mama, melon, chili/chile, pica, burro.
 *    Dropped for Brazilian Portuguese: pinto, paw (pau), banana, beach (bicha),
 *    cuckoo (cuca), roll (rola). Kept deliberately: boa, mesa, pan, pasta,
 *    salsa, mango and llama, which are the same word, or a positive one, in at
 *    least one of the two languages.
 * 7. A second pass dropped eight more words. Four read badly alone, and one
 *    word alone lands in about one slug in 340: bud and plug (drugs, and plug
 *    is also anatomy), root (Australian and New Zealand slang for sex) and
 *    helmet (British slang for anatomy). Four only turn bad next to another
 *    entry, which is rarer — about one slug in 500,000 — but the result is a
 *    racial slur or a pornography term, so the pair was broken rather than
 *    accepted: jungle (with bunny), cream (with pie), golden (with shower) and
 *    sock (with pink). Their replacements are sprig, parsley, roost, hedge,
 *    jersey, calico, gazebo and saucer.
 * 8. A third pass caught three pairs the second one missed, all of the same
 *    kind: cricket (with moon, a racial slur), waffle (with blue) and shower
 *    (with brown — golden went in pass 7, but the other half of that phrase
 *    stayed and pairs the same way). Replacements are grotto, igloo and
 *    tassel. Breaking a pair costs one word; a minted slug is permanent, so a
 *    later edit cannot recall the rooms already issued one.
 *
 * Content hash (sha256 of the words joined by a space):
 * 85f1d479695365860b2ae75419cd1ed69c0cb2f63ef2beb1213b820aa14101c9
 */
const WORDS = `
acorn agate agave alarm alder almond alpaca amber anchor anchovy
anklet ant anthem antler apple apricot apron arch arena ash
aspen atlas attic aurora avenue avocado azure badge badger bag
bagel bagpipe balcony ball ballad ballet balloon bamboo bangle banjo
barge bark barley barn barrel basil basket bat battery bay
beacon beagle beak bean beanie bear bed bee beetle beige
bell belt beluga bench beret berry bicycle binder birch biscuit
bison blanket blazer blender blimp bloom blouse blue boa board
boat bog bold bolt bonfire bonnet boot bottle bowl braid
branch brass brave bread breeze breezy brick bridge bright bronze
brook broom broth brown brownie brush bubble bubbly bucket buckle
buffalo bulb bumpy bunny bunting bus butter button cabbage cabin
cabinet cable cactus cake calico calm camel camp canal canary
candle canoe canvas canyon cap cape car caramel card cargo
carp carpet carrot cart cashew castle cave cavern cedar celery
cello ceramic chair chalk chart cheeky cheery cheese chess chilly
chime chimney chirpy chorus churro cicada cinema circle circus city
clasp clay clever cliff clip cloak clock clog cloud clove
clover coast coat cobalt cobra cod cog collar collie comb
comet comfy compass concert condor cone cookie copper coral corgi
corn cosmos cottage cotton couch cove coyote crab crafty crane
crate crater crayon creek crimson crisp crocus crow crown crystal
cub cube cuff cumin cup curly curry curtain curve cushion
custard cyan dahlia dainty daisy dandy dapper daring dashing dawn
deck delta denim desert desk diamond diary dice digger dill
dingo dish dock dolphin dome domino donkey door dot dove
drake drawer dreamy dress drizzle drum duck dune dusk duster
dusty duvet eager eagle early easel easy eclipse eel egret
elegant elk elm ember emerald emu encore eraser falcon falls
fan fancy farm fawn feather feisty felt fence fern ferret
ferry festive fiddle field fig finch firefly fizzy flame fleece
flint floor fluffy flute foam fog folder forest fork fox
frame fresh fridge frog frost frosty fudge funky fuse galaxy
gale gallery garage garden garlic gate gazebo gear gecko gelato
genial gentle gerbil giddy ginger glacier glad glass glasses gleeful
glider globe glossy glove glow glue goggles gold gong goose
gopher gorge grand granite granola grape grass gravel gravy green
grill grotto grouse grove guava guitar gull guppy gust hail
halibut hamlet hammock hamper hamster handy happy hardy harp hat
hawk haze hazel hazy hearth hearty heather hedge helix heron
herring hexagon hill hinge honest honey hoodie hoof hoop horizon
horn hornet horse hull humble husk husky ibis ice iceberg
icicle igloo iguana indigo ink iris iron island ivory ivy
jacket jade jaguar jam jar jasmine jasper jaunty jay jazz
jazzy jeans jeep jelly jersey jet jetty jigsaw jolly journal
jovial joyful jug jumpy juniper kayak keel keen kelp kestrel
ketchup kettle khaki kilt kind kite kitten kiwi koala lace
ladder ladle ladybug lagoon lake lamp lane lantern lark latch
lattice laurel leaf leafy leather lemon lemur lens lentil letter
lettuce lever library lilac lily lime line linen lion lively
lizard llama loafer lobster locket lodge lofty loop lotus lucky
lush lyric macaw magenta magnet magpie mambo manatee mango manta
mantis map maple maraca marble marker market marlin maroon marsh
mask mast mat meadow meerkat mellow melody merry mesa meteor
mighty milk mill millet mimosa minnow mint minty mirror mist
misty mitten mixer modest mole moon moose mop mosaic moss
mossy moth motif mouse muffin mug museum mustard navy neat
nebula nectar needle nest newt nickel nifty nimble noble noodle
noon nutmeg oak oasis oat oatmeal oboe octagon octave octopus
olive onion onyx opal opera orange orbit orca orchard orchid
oriole osprey ostrich otter oval oven owl oyster paddle paint
palace palm pan pancake panda paper parade parasol parcel park
parrot parsley parsnip pasta pastry path patio pattern peach peachy
peanut pearl pebble pecan pelican pen pencil pendant penguin peony
pepper peppy perch pesto petal piano pickle picnic pie pigeon
pillow pin pine pink pizza plane planet planter plastic plate
playful plaza plucky plum plush pocket polenta polite polka pollen
poncho pond pony poodle popcorn poplar poppy porch port poster
potato pouch prawn pretzel prism proud pudding puffin pulley puma
pumpkin puppy purple purse puzzle pyramid python quail quaint quartet
quartz quick quiet quilt rabbit raccoon radiant radio radish raft
rain rainbow rake ramen ranch rapid rapids rattle raven ravioli
ray ready record red reef refined resin rhythm ribbon rice
ridge ring ripple risotto river road robe robin rocket roof
roost rope rose rosy royal rubber ruby rudder rug ruler
rumba rusty saffron sage sail salad salmon salsa salt samba
sand sandal sandy sap sardine sash sassy satchel satin saucer
savvy scallop scarf scarlet scone scooter seal seaweed seed seesaw
sepia serene setter shade shadow shark sharp shed sheet shelf
shell shiny ship shirt shoe shore shorts shovel shrimp silk
silky silly silver simple sincere skate ski skillet skirt sky
slate sled sleek sleepy sleet slide slipper sloth smart smoke
smooth snail snappy sneaker snow snowy snug soap sofa soft
solid sorbet soup spaniel spark sparky sparrow speaker sphere spider
spiffy spinach spiral sponge spoon sprig springy sprout spruce square
squash squid stadium stag stamp staple star starry statue steady
steam stellar stem stew sticker stone stool stork storm stormy
stove stream street string stripe studio sturdy sugar summit sun
sunbeam sundial sunlit sunny sunrise sunset surf sushi swallow swamp
swan sweater sweet swift swing switch syrup table tango tangy
tape tassel taxi teak teal teapot tempo tender tent terrier
thistle thorn thread thunder tiara ticket tidy tie tiger timber
timer tin tiny toad toast toaster toasty toffee tofu token
tomato topaz torch tote toucan towel tower town tractor trail
train tram tray trellis trout trowel truck truffle trumpet trunk
trusty tuba tulip tuna tundra tunic tunnel turkey turnip turtle
tweed twig twine upbeat urchin valiant valley van vanilla vase
velvet vest vibrant village vine vinyl viola violet violin vivid
volcano voyage wagon wall wallet walnut walrus waltz warbler warm
wasp watch wave wavy wax weasel weave whale wharf wheat
whisk wicker wiggly willow wind window windy wing wire wise
witty wolf wombat wool yarn yellow zany zebra zesty zigzag
zinc zipper zippy zoo
`

export const SLUG_WORDS: readonly string[] = Object.freeze(WORDS.trim().split(/\s+/))
