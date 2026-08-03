-- Store the reviewed background/ink pair independently from the character.
-- Existing members get one concrete key so every device renders the same look.
ALTER TABLE "split"."Member" ADD COLUMN "avatarPalette" TEXT;

UPDATE "split"."Member"
SET "avatarPalette" = (
    ARRAY[
        'lagoon-grape', 'bubble-navy', 'acid-violet', 'tomato-navy',
        'sun-berry', 'lilac-forest', 'coral-teal', 'sky-cherry',
        'orange-cobalt', 'mint-rust', 'banana-cobalt', 'powder-brown',
        'rose-forest', 'lime-burgundy', 'peach-navy', 'aqua-maroon',
        'lavender-teal', 'guava-slate', 'cerulean-brown', 'leaf-violet',
        'candy-cobalt', 'gold-forest', 'periwinkle-plum', 'watermelon-green'
    ]
)[1 + floor(random() * 24)::integer]
WHERE "avatarPalette" IS NULL;
