-- Existing members get one random alter ego, persisted so every phone agrees.
-- The application also writes a concrete key for every new member.
UPDATE "split"."Member"
SET "avatar" = (
    ARRAY[
        'vampire-penguin', 'pirate-parrot', 'ninja-pear', 'lucky-alien', 'trickster-fox', 'punk-pineapple',
        'cozy-ghost', 'garden-snail', 'sleepy-cloud', 'explorer-bear', 'baker-moon', 'yoga-yeti',
        'wizard-frog', 'detective-raccoon', 'bookworm-bat', 'scientist-owl', 'mechanic-robot', 'gamer-cat',
        'disco-octopus', 'rockstar-strawberry', 'party-bee', 'dj-dinosaur', 'painter-panda', 'karaoke-kiwi',
        'astronaut-avocado', 'surfer-shark', 'skater-cactus', 'chef-dragon', 'sailor-banana', 'cosmic-llama'
    ]
)[1 + floor(random() * 30)::integer]
WHERE "avatar" IS NULL;
