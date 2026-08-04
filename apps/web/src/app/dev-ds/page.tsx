import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { Doodle } from '@/components/ui/Doodle'
import { Icon, type IconName } from '@/components/ui/Icon'
import { MemberAvatar } from '@/components/room/MemberAvatar'
import { Money } from '@/components/room/Money'
import { AVATAR_PALETTES } from '@/lib/avatar-palettes'
import { ROOM_THEMES } from '@/lib/themes'
import { Code, DocChrome, Rule, RuleList, Section, Specimen } from './_components/DocChrome'
import {
    ButtonSamples,
    DestructiveSample,
    DrawerSample,
    FieldSamples,
    SettingSamples,
} from './_components/InteractiveSamples'

const coreColors = [
    { name: 'Ink', token: 'n-1 / black', value: '#211C17', role: 'Text, borders, hard shadows and dark actions' },
    { name: 'Split yellow', token: 'primary-1', value: '#FFC900', role: 'Primary action, brand field and selection' },
    { name: 'Canvas', token: 'background', value: '#FAF4F0', role: 'App background and warm negative space' },
    { name: 'Paper', token: 'white', value: '#FFFFFF', role: 'Controls, cards, sheets and foreground surfaces' },
    { name: 'Muted ink', token: 'grey-1 / n-3', value: '#5F646D', role: 'Secondary copy and non-critical metadata' },
    { name: 'Quiet line', token: 'n-4 / grey-2', value: '#E7E8E9', role: 'Disabled fills and quiet separation' },
    {
        name: 'Peanut pink',
        token: 'secondary-1',
        value: '#FF90E8',
        role: 'Peanut attribution and rare delight; never primary',
    },
    { name: 'Error ink', token: 'error', value: '#B3261E', role: 'Destructive/error semantics only' },
] as const

const directionColors = [
    { name: 'Outgoing wash', token: 'balance-outgoing', value: '#FFF2EE' },
    { name: 'Outgoing ink', token: 'balance-outgoing-accent', value: '#94483E' },
    { name: 'Incoming wash', token: 'balance-incoming', value: '#EFFAF2' },
    { name: 'Incoming ink', token: 'balance-incoming-accent', value: '#246C3D' },
] as const

const typeScale = [
    { token: 'text-h1', size: '48 / 56', sample: 'Hero heading' },
    { token: 'text-h2', size: '36 / 46', sample: 'Page heading' },
    { token: 'text-h3', size: '30 / 38', sample: 'Section heading' },
    { token: 'text-h4', size: '24 / 32', sample: 'Card heading' },
    { token: 'text-h5', size: '20 / 28', sample: 'Drawer heading' },
    { token: 'text-h6', size: '18 / 24', sample: 'Strong subheading' },
    { token: 'text-h7', size: '16 / 20', sample: 'Row title' },
    { token: 'text-h8', size: '14 / 16', sample: 'Compact title' },
    { token: 'text-h9', size: '12 / 14', sample: 'Micro label' },
    { token: 'text-h10', size: '10 / 12', sample: 'Tone label' },
] as const

const iconNames: IconName[] = [
    'plus',
    'x',
    'check',
    'share',
    'copy',
    'users',
    'arrow-left',
    'arrow-right',
    'chevron-down',
    'chevron-up',
    'chevron-right',
    'trash',
    'pencil',
    'receipt',
    'wallet',
    'banknote',
    'hand-coins',
    'sparkles',
    'dice',
    'camera',
    'calendar',
    'link',
    'undo',
    'settings',
]

const componentContracts = [
    ['Button', 'All ordinary commands', 'variant + optional shadow; default is the tallest primary control'],
    ['BaseInput', 'Text, amount and date fields', 'sm 48px · md 64px · lg 80px; visible label outside'],
    ['Card', 'Bounded groups of related information', 'White paper, ink border, optional hard shadow'],
    ['Drawer', 'Contextual create/edit/detail flows', 'Modal, focus-managed, max 90dvh; pair with DrawerLayout'],
    ['DrawerBody', 'Sheet sections', 'The only vertical scroll owner; consistent safe-area inset'],
    ['DrawerActions', 'Sheet commands', 'Primary first, stroke secondary below, 12px gap'],
    ['CloseButton', 'Dismissal or leave-form navigation', 'One borderless 44px target; always labelled'],
    ['SettingRow', 'Open a settings sub-flow', 'Label + current value + chevron; stable test id'],
    ['SettingToggle', 'Binary preference', 'role=switch, 44px row, yellow checked square'],
    ['StateRow', 'Non-actionable status', 'Keeps a subject label with its explanation'],
    ['SlideToConfirm', 'Irreversible terminal action', 'Pointer slide plus full keyboard/AT parity'],
    ['Divider', 'Separate peer groups', 'Optional text; never a substitute for heading hierarchy'],
    ['PageContainer', 'Centered product-page content', 'Mobile-first; content caps at xl without a desktop rail'],
    ['Doodle', 'Brand illustration', 'Stroke-only, currentColor, decorative unless explicitly labelled'],
    ['Icon', 'Command semantics', 'Callers ask for an action, never a concrete artwork asset'],
    ['MemberAvatar', 'Anonymous room identity', 'Allowlisted character + allowlisted high-contrast palette'],
    ['Money', 'Any amount shown to a person', 'Minor-unit string, locale-aware, tabular; never hand-format'],
    ['Loading', 'Inline pending status', 'Doodle spinner plus a screen-reader status label'],
] as const

const nav = [
    ['principles', 'Principles'],
    ['colour', 'Colour'],
    ['type', 'Typography'],
    ['geometry', 'Geometry'],
    ['components', 'Components'],
    ['identity', 'Identity'],
    ['motion', 'Motion'],
    ['accessibility', 'Accessibility'],
    ['voice', 'Voice'],
    ['governance', 'Governance'],
] as const

export default function DesignSystemPage() {
    return (
        <DocChrome page="system">
            <div className="border-b border-n-1 bg-primary-1">
                <div className="mx-auto grid max-w-[90rem] gap-8 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1fr)_24rem] lg:px-8">
                    <div className="max-w-4xl">
                        <p className="shadow-2 mb-4 inline-flex rounded-full border border-n-1 bg-white px-3 py-1 text-h9 uppercase tracking-[0.16em]">
                            Implementation-backed · v1.0
                        </p>
                        <h1 className="max-w-4xl font-display text-5xl font-extrabold leading-[0.95] tracking-[-0.045em] sm:text-7xl">
                            Friendly bookkeeping, drawn with a firm hand.
                        </h1>
                        <p className="mt-6 max-w-2xl text-lg leading-7 sm:text-xl sm:leading-8">
                            This is the visual and interaction contract already shipping in Peanut Split. It names the
                            rules, shows the real components, and marks the seams that still need consolidation.
                        </p>
                        <div className="mt-8 flex flex-wrap gap-3">
                            <Link
                                href="#components"
                                className="btn btn-dark shadow-4 w-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                            >
                                Browse components
                            </Link>
                            <Link
                                href="/dev-ds/audit"
                                className="btn btn-stroke w-auto bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                            >
                                Read the audit
                                <Icon name="arrow-right" size={18} />
                            </Link>
                        </div>
                    </div>
                    <div className="relative hidden min-h-72 lg:block" aria-hidden="true">
                        <div className="shadow-primary-8 absolute right-4 top-0 grid size-64 rotate-3 place-items-center rounded-full border-2 border-n-1 bg-secondary-1">
                            <Doodle name="peanut" size={174} weight={1.15} />
                        </div>
                        <div className="shadow-4 absolute bottom-0 left-1 rounded-sm border border-n-1 bg-white p-4">
                            <p className="font-display text-2xl font-extrabold">Link. Room. Sorted.</p>
                            <p className="mt-1 text-sm text-grey-1">No ornamental ambiguity.</p>
                        </div>
                    </div>
                </div>
            </div>

            <nav aria-label="On this page" className="border-b border-n-1 bg-white">
                <ul className="mx-auto flex max-w-[90rem] gap-1 overflow-x-auto px-4 py-2 scrollbar-thin sm:px-6 lg:px-8">
                    {nav.map(([id, label]) => (
                        <li key={id}>
                            <a
                                href={`#${id}`}
                                className="flex min-h-11 items-center whitespace-nowrap rounded-sm px-3 text-sm font-bold hover:bg-primary-3 focus-visible:outline focus-visible:outline-2"
                            >
                                {label}
                            </a>
                        </li>
                    ))}
                </ul>
            </nav>

            <div className="mx-auto max-w-[90rem] px-4 sm:px-6 lg:px-8">
                <Section
                    id="principles"
                    eyebrow="01 · foundations"
                    title="Six rules before a single class name"
                    intro="The product is a trust-based shared ledger. Its system should make amounts calm, actions obvious, and the social situation lighter without making money feel frivolous."
                >
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {[
                            [
                                'Plain before playful',
                                'The ledger, amount, direction and next action win every hierarchy decision. Delight stays around the fact, never over it.',
                            ],
                            [
                                'One firm silhouette',
                                'Ink borders, warm paper, modest radii and offset shadows make controls read as physical, tappable objects.',
                            ],
                            [
                                'Yellow means do or choose',
                                'Split yellow is the primary action and selection cue. It is not body copy, warning copy or ambient decoration.',
                            ],
                            [
                                'Direction is ordinary',
                                'Owing and being owed are ledger states, not errors and successes. Use the dedicated calm washes and explicit words.',
                            ],
                            [
                                'Mobile is the real canvas',
                                '390×844 is the design target. Desktop adds breathing room, not a different information architecture.',
                            ],
                            [
                                'Accessibility is a system property',
                                '44px targets, real labels, inert modal backgrounds, locale-aware money and reduced motion are defaults, not call-site options.',
                            ],
                        ].map(([title, body], index) => (
                            <article key={title} className="shadow-2 rounded-sm border border-n-1 bg-white p-5">
                                <p className="mb-4 font-display text-5xl font-extrabold text-primary-2">0{index + 1}</p>
                                <h3 className="text-h6">{title}</h3>
                                <p className="mt-2 text-sm leading-6 text-grey-1">{body}</p>
                            </article>
                        ))}
                    </div>
                </Section>

                <Section
                    id="colour"
                    eyebrow="02 · foundations"
                    title="Colour carries role, not decoration"
                    intro="The base palette is deliberately small. Room themes tint the social field; semantic direction and error colours do not change with the room."
                >
                    <div className="grid gap-8">
                        <div>
                            <h3 className="mb-4 text-h6">Core palette</h3>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                {coreColors.map((color) => (
                                    <article
                                        key={color.token}
                                        className="overflow-hidden rounded-sm border border-n-1 bg-white"
                                    >
                                        <div
                                            className="h-24 border-b border-n-1"
                                            style={{ backgroundColor: color.value }}
                                        />
                                        <div className="p-4">
                                            <div className="flex items-baseline justify-between gap-2">
                                                <h4 className="text-h8">{color.name}</h4>
                                                <code className="text-xs text-grey-1">{color.value}</code>
                                            </div>
                                            <p className="mt-1 text-xs font-bold text-grey-1">{color.token}</p>
                                            <p className="mt-3 text-sm leading-5 text-grey-1">{color.role}</p>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        </div>

                        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.7fr)]">
                            <Specimen
                                title="Room themes"
                                note="A room stores a key, never arbitrary colour. Black ink remains invariant."
                            >
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                    {ROOM_THEMES.map((theme) => (
                                        <div
                                            key={theme.key}
                                            className="rounded-sm border border-n-1 bg-white p-2 text-center"
                                        >
                                            <div
                                                className="mx-auto grid size-16 place-items-center rounded-full border border-n-1"
                                                style={{ backgroundColor: theme.field }}
                                            >
                                                <Doodle name={theme.motif} size={34} weight={1.7} />
                                            </div>
                                            <p className="mt-2 text-xs font-bold capitalize">{theme.key}</p>
                                            <p className="text-[0.68rem] text-grey-1">{theme.field}</p>
                                        </div>
                                    ))}
                                </div>
                            </Specimen>
                            <Specimen
                                title="Balance direction"
                                note="Words and arrows carry meaning; colour supports them."
                            >
                                <div className="grid grid-cols-2 gap-3">
                                    {directionColors.map((color) => (
                                        <div
                                            key={color.token}
                                            className="rounded-sm border border-n-1 p-3"
                                            style={{ backgroundColor: color.value }}
                                        >
                                            <p className="text-xs font-bold">{color.name}</p>
                                            <code className="text-[0.68rem]">{color.value}</code>
                                        </div>
                                    ))}
                                </div>
                                <RuleList>
                                    <Rule>
                                        Never reuse incoming green as generic success or outgoing coral as generic
                                        error.
                                    </Rule>
                                    <Rule>
                                        Do not put ordinary-sized text on yellow or pink unless it uses ink and passes
                                        contrast.
                                    </Rule>
                                    <Rule>
                                        Use theme tints only on neutral room surfaces; alerts retain semantic colours.
                                    </Rule>
                                </RuleList>
                            </Specimen>
                        </div>
                    </div>
                </Section>

                <Section
                    id="type"
                    eyebrow="03 · foundations"
                    title="Roboto for facts. Sniglet for warmth. Knerd for the mark."
                    intro="Typography separates bookkeeping from personality. Amounts and interface copy stay exceptionally legible; display faces are reserved for moments that can tolerate character."
                >
                    <div className="grid gap-6 lg:grid-cols-3">
                        <Specimen
                            title="Sans · Roboto Flex"
                            note="Default interface, body, fields, metadata and all money."
                        >
                            <p className="text-4xl font-bold tracking-tight">Nobody has to chase.</p>
                            <p className="mt-3 text-sm leading-6 text-grey-1">
                                Variable width, tabular numerals where values move, bold labels rather than decorative
                                weights.
                            </p>
                        </Specimen>
                        <Specimen
                            title="Display · Sniglet"
                            note="Marketing headlines and warm, non-transactional emphasis."
                        >
                            <p className="font-display text-4xl font-extrabold leading-none">Pass the link.</p>
                            <p className="mt-3 text-sm leading-6 text-grey-1">
                                Never use for dense rows, balances, form instructions or errors.
                            </p>
                        </Specimen>
                        <Specimen
                            title="Wordmark · Knerd"
                            note="Outlined/filled paired artwork, not a general heading face."
                        >
                            <div className="rounded-sm bg-n-1 p-4">
                                <div className="relative inline-block text-4xl">
                                    <p className="relative translate-x-[3px] font-knerd-filled text-white">PEANUT</p>
                                    <p className="absolute left-0 top-0 font-knerd-outline text-primary-1">PEANUT</p>
                                </div>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-grey-1">
                                Use the shared Title component so both layers remain registered.
                            </p>
                        </Specimen>
                    </div>

                    <div className="mt-8 overflow-hidden rounded-sm border border-n-1 bg-white">
                        <div className="grid grid-cols-[6rem_5rem_1fr] gap-3 border-b border-n-1 bg-primary-3 px-4 py-3 text-h9 uppercase tracking-wider">
                            <span>Token</span>
                            <span>Px / line</span>
                            <span>Intended tier</span>
                        </div>
                        {typeScale.map((type) => (
                            <div
                                key={type.token}
                                className="grid grid-cols-[6rem_5rem_1fr] items-baseline gap-3 border-b border-n-1 px-4 py-3 last:border-0"
                            >
                                <code className="text-xs font-bold">{type.token}</code>
                                <span className="text-xs text-grey-1">{type.size}</span>
                                <span className={`${type.token} min-w-0 truncate`}>{type.sample}</span>
                            </div>
                        ))}
                    </div>

                    <div className="mt-6 grid gap-4 md:grid-cols-3">
                        <div className="rounded-sm border border-n-1 bg-white p-4">
                            <p className="text-h8">Body</p>
                            <p className="mt-2 text-sm leading-[1.5] text-grey-1">
                                14–16px, at least 1.5 line height for explanatory copy.
                            </p>
                        </div>
                        <div className="rounded-sm border border-n-1 bg-white p-4">
                            <p className="text-h8">Labels</p>
                            <p className="mt-2 text-sm leading-[1.5] text-grey-1">
                                Bold, sentence case. Uppercase only for compact tone labels.
                            </p>
                        </div>
                        <div className="rounded-sm border border-n-1 bg-white p-4">
                            <p className="text-h8">Money</p>
                            <p className="mt-2 text-sm leading-[1.5] text-grey-1">
                                <Code>Money</Code> + <Code>tabular-nums</Code>; API minor units stay strings.
                            </p>
                        </div>
                    </div>
                </Section>

                <Section
                    id="geometry"
                    eyebrow="04 · foundations"
                    title="A compact rhythm with hard-edged depth"
                    intro="Spacing follows Tailwind’s 4px base rhythm plus a small, named extension set. Shape and elevation remain deliberately narrow so the room does not become a pile of unrelated cards."
                >
                    <div className="grid gap-6 lg:grid-cols-2">
                        <Specimen
                            title="Spacing rhythm"
                            note="Prefer named utilities. Reach for an arbitrary value only when geometry is derived or genuinely one-off."
                        >
                            <div className="space-y-3">
                                {[4, 8, 12, 16, 20, 24, 32, 40, 52, 64].map((value) => (
                                    <div key={value} className="flex items-center gap-3">
                                        <span className="w-10 text-right text-xs tabular-nums text-grey-1">
                                            {value}px
                                        </span>
                                        <div
                                            className="h-4 rounded-sm border border-n-1 bg-primary-1"
                                            style={{ width: `${value * 2}px` }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </Specimen>
                        <Specimen
                            title="Shape + elevation"
                            note="1.5px default border. Shadow always uses ink and never blurs."
                        >
                            <div className="grid grid-cols-2 gap-5 p-2 sm:grid-cols-3">
                                {[
                                    ['12px', 'rounded-sm shadow-2'],
                                    ['16px', 'rounded-lg shadow-4'],
                                    ['24px', 'rounded-2xl shadow-primary-6'],
                                ].map(([label, classes]) => (
                                    <div
                                        key={label}
                                        className={`grid aspect-square place-items-center border border-n-1 bg-white ${classes}`}
                                    >
                                        <span className="text-xs font-bold">{label}</span>
                                    </div>
                                ))}
                            </div>
                            <RuleList>
                                <Rule>
                                    <Code>rounded-sm</Code> (12px) is the default for controls and ordinary cards.
                                </Rule>
                                <Rule>
                                    <Code>rounded-2xl</Code> belongs to large containers and the top of modal sheets.
                                </Rule>
                                <Rule>
                                    Use 2/4/6/8px offset depth to express layering; do not introduce soft shadows.
                                </Rule>
                            </RuleList>
                        </Specimen>
                    </div>
                    <div className="mt-6 rounded-sm border border-n-1 bg-primary-3 p-5">
                        <h3 className="text-h7">Layout contract</h3>
                        <div className="mt-3 grid gap-3 text-sm leading-6 text-grey-1 md:grid-cols-3">
                            <p>
                                <strong className="text-n-1">Product:</strong> full-width mobile canvas, readable
                                content capped at <Code>max-w-xl</Code>.
                            </p>
                            <p>
                                <strong className="text-n-1">Documentation/marketing:</strong> larger editorial max
                                width, but the same tokens and component silhouette.
                            </p>
                            <p>
                                <strong className="text-n-1">Safe areas:</strong> bottom actions and sheet bodies
                                include <Code>env(safe-area-inset-bottom)</Code>.
                            </p>
                        </div>
                    </div>
                </Section>

                <Section
                    id="components"
                    eyebrow="05 · components"
                    title="Use the primitive before writing the recipe again"
                    intro="These specimens render the shipping components. Props define meaningful variation; call-site classes should position a component, not silently redesign it."
                >
                    <div className="grid gap-6 lg:grid-cols-2">
                        <Specimen
                            title="Buttons"
                            note="One command per button. Shadow denotes a lifted primary moment, not a new variant."
                        >
                            <ButtonSamples />
                            <RuleList>
                                <Rule>
                                    Default/primary is the principal action. Use stroke for a safe alternative and dark
                                    for strong neutral action.
                                </Rule>
                                <Rule>Icon-only actions must keep a 44px hit target and an accessible name.</Rule>
                                <Rule>
                                    Do not use the currently undersized named sizes until the audit remediation lands.
                                </Rule>
                            </RuleList>
                        </Specimen>
                        <Specimen
                            title="Fields"
                            note="A visible label, one size tier, and one source of truth for height/padding."
                        >
                            <FieldSamples />
                            <RuleList>
                                <Rule>
                                    Use input mode and autocomplete semantics; placeholder text is an example, not a
                                    label.
                                </Rule>
                                <Rule>
                                    Error copy follows the field and is announced; it does not rely on a red border
                                    alone.
                                </Rule>
                            </RuleList>
                        </Specimen>
                        <Specimen
                            title="Cards + amount"
                            note="Group related content. Avoid wrapping every sentence in a surface."
                        >
                            <Card shadowSize="4">
                                <Card.Header>
                                    <Card.Title>Lisbon weekend</Card.Title>
                                    <Card.Description>Room-currency amount, formatted once.</Card.Description>
                                </Card.Header>
                                <Card.Content className="flex items-baseline justify-between gap-4">
                                    <span className="text-sm font-bold text-grey-1">You are owed</span>
                                    <Money minor="12480" currency="EUR" className="text-2xl font-extrabold" />
                                </Card.Content>
                            </Card>
                            <RuleList>
                                <Rule>
                                    Use <Code>Money</Code>; do not concatenate a symbol or turn minor units into a float
                                    for display.
                                </Rule>
                                <Rule>
                                    Card shadow direction is structural. Primary shadows fall right; secondary shadows
                                    fall left.
                                </Rule>
                            </RuleList>
                        </Specimen>
                        <Specimen
                            title="Settings rows"
                            note="A compact common grammar for values, toggles and non-actionable state."
                        >
                            <SettingSamples />
                        </Specimen>
                        <Specimen
                            title="Bottom sheet"
                            note="Contextual editing without leaving the room. The live example exercises focus and dismissal."
                        >
                            <DrawerSample />
                            <RuleList>
                                <Rule>
                                    Use <Code>DrawerBody</Code> as the sole scroll owner and keep the header outside it.
                                </Rule>
                                <Rule>
                                    Closing restores focus to the opener. The background is inert while the sheet is
                                    open.
                                </Rule>
                            </RuleList>
                        </Specimen>
                        <Specimen
                            title="Destructive confirmation"
                            note="Drag is deliberate, but keyboard and assistive technology receive equivalent controls."
                        >
                            <DestructiveSample />
                            <p className="mt-4 text-sm leading-6 text-grey-1">
                                Reserve this for irreversible terminal actions. Ordinary deletes with a safe undo path
                                use an ordinary action plus undo.
                            </p>
                        </Specimen>
                    </div>

                    <div className="mt-10">
                        <h3 className="mb-4 text-h5">Common-component contract</h3>
                        <div className="overflow-x-auto rounded-sm border border-n-1 bg-white">
                            <table className="w-full min-w-[50rem] border-collapse text-left text-sm">
                                <thead className="bg-primary-3">
                                    <tr>
                                        <th className="border-b border-n-1 p-3 text-h8">Primitive</th>
                                        <th className="border-b border-n-1 p-3 text-h8">Use it for</th>
                                        <th className="border-b border-n-1 p-3 text-h8">Non-negotiable contract</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {componentContracts.map(([name, use, contract]) => (
                                        <tr key={name} className="align-top">
                                            <th className="border-b border-n-1 p-3 font-mono text-xs">{name}</th>
                                            <td className="border-b border-n-1 p-3 text-grey-1">{use}</td>
                                            <td className="border-b border-n-1 p-3 text-grey-1">{contract}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </Section>

                <Section
                    id="identity"
                    eyebrow="06 · identity"
                    title="Doodles name actions and give anonymous people a character"
                    intro="Every drawn mark comes from the generated stroke catalog. The shared Icon map gives action semantics; rooms and members store allowlisted keys so art can improve without a data migration."
                >
                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.72fr)]">
                        <Specimen
                            title="Semantic action icons"
                            note="24 meanings map to the doodle catalog. Default sizes: 16, 18, 20, 22, 24 and 28px."
                        >
                            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                                {iconNames.map((name) => (
                                    <div
                                        key={name}
                                        className="flex min-w-0 flex-col items-center gap-2 rounded-sm border border-n-1 p-3"
                                    >
                                        <Icon name={name} size={22} />
                                        <span className="max-w-full truncate text-[0.65rem] text-grey-1">{name}</span>
                                    </div>
                                ))}
                            </div>
                        </Specimen>
                        <Specimen
                            title="Member identity"
                            note="Character choice is a lovable group role, never an inferred human likeness."
                        >
                            <div className="grid grid-cols-3 gap-4">
                                {[
                                    ['Ana', 'wizard-frog', AVATAR_PALETTES[0].key],
                                    ['Bo', 'spreadsheet-owl', AVATAR_PALETTES[4].key],
                                    ['Cai', 'party-bee', AVATAR_PALETTES[8].key],
                                    ['Diya', 'cozy-ghost', AVATAR_PALETTES[12].key],
                                    ['Eli', 'detective-raccoon', AVATAR_PALETTES[16].key],
                                    ['Fia', 'pancake-bear', AVATAR_PALETTES[20].key],
                                ].map(([name, avatar, palette]) => (
                                    <div key={name} className="text-center">
                                        <MemberAvatar name={name} avatar={avatar} palette={palette} size={56} />
                                        <p className="mt-2 text-xs font-bold">{name}</p>
                                    </div>
                                ))}
                            </div>
                            <RuleList>
                                <Rule>
                                    Use <Code>Icon</Code> for actions and <Code>Doodle</Code> for illustration; never
                                    paste a third-party SVG into UI source.
                                </Rule>
                                <Rule>
                                    Decorative doodles stay silent. Only a drawing that adds information receives a
                                    label.
                                </Rule>
                                <Rule>
                                    Stroke is <Code>currentColor</Code>; change context colour, not the path data.
                                </Rule>
                            </RuleList>
                        </Specimen>
                    </div>
                </Section>

                <Section
                    id="motion"
                    eyebrow="07 · behavior"
                    title="Motion explains cause, then gets out of the way"
                    intro="The system has one global policy across CSS and motion/react. Product settings and the operating-system preference can turn every nonessential transition off before hydration."
                >
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {[
                            ['Tap', '100ms', 'A small press translation; immediate haptic only when enabled.'],
                            ['Settle / pop', '100–120ms', 'Short scale cue after a committed choice.'],
                            ['Drawer content', '250ms', '6px rise with opacity on a decelerating curve.'],
                            ['Money count', '720ms', 'Readable digit travel for a balance change; never written back.'],
                        ].map(([name, duration, description]) => (
                            <article key={name} className="rounded-sm border border-n-1 bg-white p-5">
                                <p className="text-h8">{name}</p>
                                <p className="mt-3 font-display text-3xl font-extrabold text-primary-2">{duration}</p>
                                <p className="mt-2 text-sm leading-6 text-grey-1">{description}</p>
                            </article>
                        ))}
                    </div>
                    <div className="mt-6 grid gap-6 lg:grid-cols-2">
                        <Specimen title="Motion rules">
                            <RuleList>
                                <Rule>
                                    Animate transform and opacity. Layout animation needs a specific, measured reason.
                                </Rule>
                                <Rule>
                                    No core interaction depends on movement to explain state; text and structure land
                                    immediately.
                                </Rule>
                                <Rule>
                                    Decorative particles disappear under reduced motion instead of freezing mid-flight.
                                </Rule>
                                <Rule>
                                    Use <Code>useMotionAllowed()</Code> for component decisions; global{' '}
                                    <Code>MotionConfig</Code> remains the backstop.
                                </Rule>
                            </RuleList>
                        </Specimen>
                        <Specimen title="Feedback rules">
                            <RuleList>
                                <Rule>Button taps, sound and haptics all respect the single settings store.</Rule>
                                <Rule>Never add feedback to passive navigation or render-time state.</Rule>
                                <Rule>
                                    Loading, success and failure need visible and announced state; feedback is additive.
                                </Rule>
                                <Rule>
                                    Toasts are for cross-surface outcomes. Keep form validation next to the field.
                                </Rule>
                            </RuleList>
                        </Specimen>
                    </div>
                </Section>

                <Section
                    id="accessibility"
                    eyebrow="08 · behavior"
                    title="The baseline is touch, keyboard, assistive technology and a moving train"
                    intro="Peanut Split is used in group chats, on phones, in bright rooms and with unreliable connections. The robust path is the normal path."
                >
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {[
                            [
                                'Targets',
                                'Interactive targets are at least 44×44px. Visual glyphs may be smaller; the target may not.',
                            ],
                            [
                                'Focus',
                                'Every action has a visible focus state. Modal focus enters the surface and returns to the opener.',
                            ],
                            [
                                'Names',
                                'Icon-only controls have translated accessible names. Test ids are stable and never derived from labels.',
                            ],
                            [
                                'Money',
                                'Locale-aware formatting, currency identification and tabular numerals. Direction is always written in words.',
                            ],
                            [
                                'Motion',
                                'OS preference wins; the in-product quiet-mode choice also applies before the first rendered frame.',
                            ],
                            [
                                'Offline',
                                'Pending state is explicit. Room-state responses never come from a service-worker cache.',
                            ],
                        ].map(([title, body]) => (
                            <article key={title} className="shadow-2 rounded-sm border border-n-1 bg-white p-5">
                                <h3 className="text-h7">{title}</h3>
                                <p className="mt-2 text-sm leading-6 text-grey-1">{body}</p>
                            </article>
                        ))}
                    </div>
                    <div className="mt-6 rounded-sm border border-n-1 bg-n-1 p-5 text-white">
                        <h3 className="text-h6">Release check</h3>
                        <p className="mt-2 max-w-4xl text-sm leading-6 text-grey-2">
                            Verify at 320px and 390px widths, 200% browser zoom, keyboard-only, reduced motion, denied
                            storage, offline/reconnect, long translated strings, empty data, 20 members,
                            negative/zero/large amounts and safe-area insets.
                        </p>
                    </div>
                </Section>

                <Section
                    id="voice"
                    eyebrow="09 · content"
                    title="Warmth comes from concrete detail, not cheerleading"
                    intro="The full content rulebook lives in src/content/_system/stylebook.md. Product UI and errors switch most of the house voice off: a person handling money needs the fact and the next action."
                >
                    <div className="grid gap-6 lg:grid-cols-2">
                        <Specimen
                            title="House voice"
                            note="Friendly, easy, honest, quietly quirky and socially neutral."
                        >
                            <RuleList>
                                <Rule>Aim at the awkwardness of asking, not the arithmetic.</Rule>
                                <Rule>
                                    Write to the organiser in second-person singular; never blame a person who owes.
                                </Rule>
                                <Rule>
                                    Plain is the win condition. Warmth comes from a price, place, time or physical
                                    object.
                                </Rule>
                                <Rule>
                                    State limits in Peanut Split’s own words before anyone has to discover them.
                                </Rule>
                                <Rule>
                                    Humour is scarce and never sits next to a balance, promise, error or instruction.
                                </Rule>
                            </RuleList>
                        </Specimen>
                        <Specimen
                            title="Product microcopy"
                            note="The voice turns flat around promises, legal, controls and errors."
                        >
                            <div className="space-y-4 text-sm">
                                <div className="grid grid-cols-[4rem_1fr] gap-3">
                                    <span className="font-bold text-balance-incoming-accent">Do</span>
                                    <p>“Couldn’t add the expense. Your draft is still here.”</p>
                                </div>
                                <div className="grid grid-cols-[4rem_1fr] gap-3">
                                    <span className="font-bold text-error">Avoid</span>
                                    <p className="text-grey-1">“Oops! Something went wrong. Try again!”</p>
                                </div>
                                <div className="grid grid-cols-[4rem_1fr] gap-3">
                                    <span className="font-bold text-balance-incoming-accent">Do</span>
                                    <p>“You owe Ana €12.40.”</p>
                                </div>
                                <div className="grid grid-cols-[4rem_1fr] gap-3">
                                    <span className="font-bold text-error">Avoid</span>
                                    <p className="text-grey-1">“Ana is waiting for you to pay.”</p>
                                </div>
                            </div>
                            <RuleList>
                                <Rule>
                                    English, Latin-American Spanish and Brazilian Portuguese are first-class catalogs.
                                </Rule>
                                <Rule>Transcreate tone. Preserve the product fact, not English sentence shape.</Rule>
                                <Rule>
                                    Visible and accessible labels are translated; stable ids and analytics keys are not.
                                </Rule>
                            </RuleList>
                        </Specimen>
                    </div>
                </Section>

                <Section
                    id="governance"
                    eyebrow="10 · operating model"
                    title="Know which file owns the decision"
                    intro="The system currently spans configuration, global CSS, primitives and domain catalogs. Until the consolidation work in the audit is complete, this ownership map prevents a new source of truth."
                >
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {[
                            [
                                'Tokens',
                                'tailwind.config.js',
                                'Core colour, type, spacing extension, radius, border and shadow utilities.',
                            ],
                            [
                                'Global behavior',
                                'styles/globals.css',
                                'Motion policy and truly cross-route browser behavior only.',
                            ],
                            [
                                'Primitives',
                                'components/ui/*',
                                'Interactive geometry, accessibility, variants and shared composition.',
                            ],
                            [
                                'Domain catalogs',
                                'lib/themes.ts + avatar-*',
                                'Stored keys, reviewed palette values and rollback-safe fallback behavior.',
                            ],
                        ].map(([title, path, body]) => (
                            <article key={title} className="rounded-sm border border-n-1 bg-white p-5">
                                <h3 className="text-h7">{title}</h3>
                                <code className="mt-2 block break-all text-xs font-bold text-primary-2">{path}</code>
                                <p className="mt-3 text-sm leading-6 text-grey-1">{body}</p>
                            </article>
                        ))}
                    </div>
                    <div className="shadow-2 mt-8 rounded-sm border border-n-1 bg-primary-3 p-6">
                        <h3 className="text-h6">Change checklist</h3>
                        <ol className="mt-4 grid gap-3 text-sm leading-6 text-grey-1 md:grid-cols-2">
                            <li>
                                <strong className="text-n-1">1.</strong> Search for an existing token or primitive
                                before adding one.
                            </li>
                            <li>
                                <strong className="text-n-1">2.</strong> Name a variant by role, not the route that
                                first needs it.
                            </li>
                            <li>
                                <strong className="text-n-1">3.</strong> Demonstrate every state here, including
                                disabled, loading, error and long copy.
                            </li>
                            <li>
                                <strong className="text-n-1">4.</strong> Test keyboard, reduced motion, 320px, 200% zoom
                                and all locales.
                            </li>
                            <li>
                                <strong className="text-n-1">5.</strong> Add automated coverage when the contract
                                contains logic or money.
                            </li>
                            <li>
                                <strong className="text-n-1">6.</strong> Remove the displaced recipe in the same change;
                                do not leave two paths.
                            </li>
                        </ol>
                    </div>
                    <div className="mt-8 flex flex-col items-start justify-between gap-5 rounded-sm border border-n-1 bg-n-1 p-6 text-white sm:flex-row sm:items-center">
                        <div>
                            <p className="text-h5">The system is extracted. The audit names the debt.</p>
                            <p className="mt-2 text-sm text-grey-2">
                                Findings are evidence-backed, ranked and sequenced for remediation.
                            </p>
                        </div>
                        <Link href="/dev-ds/audit" className="btn btn-primary shadow-primary-4 w-auto shrink-0">
                            Open audit report
                            <Icon name="arrow-right" size={18} />
                        </Link>
                    </div>
                </Section>
            </div>
        </DocChrome>
    )
}
