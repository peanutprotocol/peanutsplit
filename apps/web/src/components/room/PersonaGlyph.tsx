import type { PersonaArt, PersonaCostume, PersonaCreature } from '@/lib/avatars'

function Face({ y = 16, mouth = true }: { y?: number; mouth?: boolean }) {
    return (
        <>
            <circle cx="13" cy={y} r="0.9" fill="currentColor" stroke="none" />
            <circle cx="19" cy={y} r="0.9" fill="currentColor" stroke="none" />
            {mouth && <path d={`M13.8 ${y + 3.4}C15.1 ${y + 4.4} 16.9 ${y + 4.4} 18.2 ${y + 3.4}`} />}
        </>
    )
}

function Creature({ creature, primary, secondary }: { creature: PersonaCreature; primary: string; secondary: string }) {
    switch (creature) {
        case 'penguin':
            return (
                <>
                    <path
                        d="M8.5 17C8.5 10.3 11.2 6.5 16 6.5S23.5 10.3 23.5 17c0 6-2.8 9.2-7.5 9.2S8.5 23 8.5 17Z"
                        fill={primary}
                    />
                    <ellipse cx="16" cy="18.3" rx="4.8" ry="6.2" fill="#FFFDF8" />
                    <path d="m14.5 16 1.5 1.2 1.5-1.2-1.5-1Z" fill="#F4A340" />
                    <Face y={12.4} mouth={false} />
                </>
            )
        case 'parrot':
            return (
                <>
                    <path
                        d="M9 17.5C9 10.5 11.8 7 17 7c4.3 0 6.7 3.2 6.7 8.2 0 6.7-3.5 10.5-9.2 10.5C10.9 25.7 9 22.8 9 17.5Z"
                        fill={primary}
                    />
                    <path d="M20 14.5c3.7-.8 6 .1 6.6 1.3-1.2 2.4-3.5 3.1-6.2 2.4Z" fill={secondary} />
                    <path d="M11.2 18.2c1.7-2 4.2-2.7 6.3-1.4-1 3.5-3.1 5.2-6 5Z" fill="#3B9360" />
                    <Face y={12.8} mouth={false} />
                </>
            )
        case 'octopus':
            return (
                <>
                    <path
                        d="M8.2 17.7C8.2 10.8 11 7.1 16 7.1s7.8 3.7 7.8 10.6v4.7c-1.2 2.2-3.1 2-4 .1-1 2.6-3 2.6-3.9.2-1 2.4-3 2.4-3.9-.2-1 2-2.8 2-3.8-.1Z"
                        fill={primary}
                    />
                    <Face y={15.6} />
                    <path d="M10.2 11.1 7.8 9.3m14 1.8 2.4-1.8" stroke={secondary} />
                </>
            )
        case 'frog':
            return (
                <>
                    <circle cx="11.2" cy="10.2" r="3.1" fill={primary} />
                    <circle cx="20.8" cy="10.2" r="3.1" fill={primary} />
                    <path
                        d="M8.4 16.8c0-5.4 2.6-7.7 7.6-7.7s7.6 2.3 7.6 7.7c0 5.8-2.8 8.8-7.6 8.8s-7.6-3-7.6-8.8Z"
                        fill={primary}
                    />
                    <circle cx="11.2" cy="10.2" r="0.8" fill="currentColor" stroke="none" />
                    <circle cx="20.8" cy="10.2" r="0.8" fill="currentColor" stroke="none" />
                    <path d="M12 18.5c2.6 1.5 5.4 1.5 8 0" />
                </>
            )
        case 'avocado':
            return (
                <>
                    <path
                        d="M16 5.4c-2.6 0-3.7 4.1-5.7 7.8-2.4 4.4-3 7.2-1 9.8 1.5 2 3.9 3.1 6.7 3.1s5.2-1.1 6.7-3.1c2-2.6 1.4-5.4-1-9.8-2-3.7-3.1-7.8-5.7-7.8Z"
                        fill={primary}
                    />
                    <path
                        d="M16 8c-1.8 0-2.8 3.4-4.6 6.8-2 3.7-2 6.1-.4 7.8 1.2 1.2 2.9 1.9 5 1.9s3.8-.7 5-1.9c1.6-1.7 1.6-4.1-.4-7.8C18.8 11.4 17.8 8 16 8Z"
                        fill="#DDF0A6"
                    />
                    <circle cx="16" cy="19.5" r="3.2" fill={secondary} />
                    <Face y={13.6} />
                </>
            )
        case 'raccoon':
            return (
                <>
                    <path d="m9.5 10-2.2-3.4 4.3 1.1M22.5 10l2.2-3.4-4.3 1.1" fill={primary} />
                    <path
                        d="M8.2 16.4c0-5.7 2.8-8.8 7.8-8.8s7.8 3.1 7.8 8.8c0 5.9-3 9.1-7.8 9.1s-7.8-3.2-7.8-9.1Z"
                        fill={primary}
                    />
                    <path
                        d="M9.6 14c2.5-2.4 5-2.7 6.4-.8 1.5-1.9 4-1.6 6.4.8-1 3.2-3.2 4.2-6.4 2.6-3.2 1.6-5.4.6-6.4-2.6Z"
                        fill={secondary}
                    />
                    <Face y={14.4} mouth={false} />
                    <path d="m14.6 18.2 1.4 1 1.4-1" />
                </>
            )
        case 'strawberry':
            return (
                <>
                    <path d="M8.2 12.2C9 20.1 11.5 25.7 16 27c4.5-1.3 7-6.9 7.8-14.8Z" fill={primary} />
                    <path d="m9.2 11.7 3.2-4.2 3.6 3.1 3.6-3.1 3.2 4.2Z" fill={secondary} />
                    <path d="m11.6 16 .5.3m7.8-.3.5.3m-6.8 5 .5.3m4.1-1.4.5.3" />
                    <Face y={16.4} />
                </>
            )
        case 'ghost':
            return (
                <>
                    <path
                        d="M8.2 24.8V14.9C8.2 9.6 11.1 6.6 16 6.6s7.8 3 7.8 8.3v9.9l-2.6-2-2.6 2-2.6-2-2.6 2-2.6-2Z"
                        fill={primary}
                    />
                    <Face y={14.4} />
                </>
            )
        case 'cactus':
            return (
                <>
                    <path
                        d="M12.4 26.4V10.2c0-2.7 1.4-4.3 3.6-4.3s3.6 1.6 3.6 4.3v16.2Zm0-10.7H9.1c-2 0-3-1.2-3-3.2V10h2.8v2.1c0 .6.3.9.9.9h2.6m7.2 5.3h3.1c2 0 3-1.2 3-3.2v-2.4h-2.8v2c0 .6-.3.9-.9.9h-2.4"
                        fill={primary}
                    />
                    <Face y={13.4} />
                </>
            )
        case 'bat':
            return (
                <>
                    <path d="M10.6 11.5 8.3 6.7l5 2m8.1 2.8 2.3-4.8-5 2" fill={primary} />
                    <path
                        d="M10.1 13c-3.7-2.3-6.5-1.7-7.5.2 2.4.5 2.8 2 1.8 4 2.3-.4 3.8.6 4.6 3.1l3.3-2.3m9.6-5c3.7-2.3 6.5-1.7 7.5.2-2.4.5-2.8 2-1.8 4-2.3-.4-3.8.6-4.6 3.1L19.7 18"
                        fill={primary}
                    />
                    <path
                        d="M9.5 15.2c0-4.7 2.3-7.1 6.5-7.1s6.5 2.4 6.5 7.1c0 5-2.5 7.7-6.5 7.7s-6.5-2.7-6.5-7.7Z"
                        fill={primary}
                    />
                    <Face y={14.2} />
                </>
            )
        case 'shark':
            return (
                <>
                    <path
                        d="M5.3 18.5c3.3-6.2 8.1-9 14.5-8.4l2.3-3.4 1 5c2.2 1.1 3.7 2.7 4.6 4.8l-4.3.4c-1.2 5-5.3 7.8-11.4 7.3L8.4 27l.7-4.2Z"
                        fill={primary}
                    />
                    <circle cx="21.2" cy="14.1" r="0.9" fill="currentColor" stroke="none" />
                    <path d="M21.2 18.4c1.7.4 3 .1 4-1" />
                </>
            )
        case 'pear':
            return (
                <>
                    <path
                        d="M17 8.8c.1-2 1-3.3 2.8-4M15.7 8.7c-3.2 1.5-3.8 4.2-5.3 6.8-2.7 4.6-.4 10.1 5.6 10.1s8.3-5.5 5.6-10.1c-1.5-2.6-2.1-5.3-5.9-6.8Z"
                        fill={primary}
                    />
                    <path d="M17 7.2c2.1-1.7 4.2-1.6 5.3-.2-1.5 1.6-3.3 1.8-5.3.2Z" fill={secondary} />
                    <Face y={16.2} />
                </>
            )
        case 'snail':
            return (
                <>
                    <circle cx="13" cy="17.5" r="6.4" fill={secondary} />
                    <path d="M13 14.2c3.2 0 3.5 5.4-.2 5.4-2.8 0-3.4-3.6-1.1-5.1" />
                    <path d="M8.4 22.1h15.2c2.2 0 3.7-1.3 3.7-3.2 0-2-1.4-3.2-3.5-3.2h-3.2v4.6" fill={primary} />
                    <path d="m22 15.8-.9-3m4.2 3-.2-3.2" />
                    <circle cx="21.1" cy="12.7" r="0.6" fill="currentColor" stroke="none" />
                    <circle cx="25.1" cy="12.6" r="0.6" fill="currentColor" stroke="none" />
                </>
            )
        case 'bee':
            return (
                <>
                    <ellipse cx="10" cy="14" rx="4.6" ry="6" fill="#FFFDF8" />
                    <ellipse cx="22" cy="14" rx="4.6" ry="6" fill="#FFFDF8" />
                    <ellipse cx="16" cy="17" rx="6.9" ry="8.6" fill={primary} />
                    <path d="M10 14h12M9.4 18h13.2" stroke={secondary} strokeWidth="2.5" />
                    <path d="m13 8-1.6-2.5m7.6 2.5 1.6-2.5" />
                    <Face y={11.8} />
                </>
            )
        case 'cloud':
            return (
                <>
                    <path
                        d="M8 24.5c-3 0-5-2-5-4.7 0-2.5 1.8-4.4 4.3-4.7-.1-.5-.2-1-.2-1.5 0-3.2 2.4-5.5 5.6-5.5 1.7 0 3.2.7 4.2 1.9 1-1.3 2.5-2.1 4.3-2.1 3 0 5.3 2.2 5.3 5.2v.8c1.7.7 2.8 2.4 2.8 4.4 0 3.4-2.5 6.2-6.1 6.2Z"
                        fill={primary}
                    />
                    <Face y={17} />
                </>
            )
        case 'peanut':
            return (
                <>
                    <path
                        d="M12 5.8c-3 1.1-4.1 4.2-2.6 7.4-2.7 2.8-2.7 6.5-.2 9.5 1.8 2.2 4.3 3.5 6.8 3.5s5-1.3 6.8-3.5c2.5-3 2.5-6.7-.2-9.5 1.5-3.2.4-6.3-2.6-7.4-2.8-1-5.2.3-4 3.3-1.2-3-3.6-4.3-4-3.3Z"
                        fill={primary}
                    />
                    <path d="m11.3 11.3 9.4 9.4m-10.2-4.2 6.9 6.9m-3-13.6 7.1 7.1" opacity=".35" />
                    <Face y={15.6} />
                </>
            )
        case 'fox':
            return (
                <>
                    <path d="m8.2 13-1-7.4 6.1 3.1m10.5 4.3 1-7.4-6.1 3.1" fill={primary} />
                    <path
                        d="M8.3 15c0-5.2 2.7-7.8 7.7-7.8s7.7 2.6 7.7 7.8c0 6.2-3.1 10-7.7 10S8.3 21.2 8.3 15Z"
                        fill={primary}
                    />
                    <path
                        d="M9.8 17.2c1.4-2.6 3.5-3.3 6.2-1.8 2.7-1.5 4.8-.8 6.2 1.8-1.2 4.1-3.3 6.2-6.2 6.2s-5-2.1-6.2-6.2Z"
                        fill={secondary}
                    />
                    <Face y={13.5} mouth={false} />
                    <path d="m14.5 18.1 1.5 1 1.5-1" />
                </>
            )
        case 'mushroom':
            return (
                <>
                    <path d="M11.7 14.3h8.6l1.2 11.2h-11Z" fill={secondary} />
                    <path d="M4.5 14.7C5.5 8.8 9.6 5.8 16 5.8s10.5 3 11.5 8.9Z" fill={primary} />
                    <circle cx="11" cy="10.6" r="1.4" fill="#FFFDF8" stroke="none" />
                    <circle cx="20.5" cy="9.5" r="1.1" fill="#FFFDF8" stroke="none" />
                    <Face y={18.3} />
                </>
            )
        case 'cat':
            return (
                <>
                    <path d="m8.6 12 .7-6.1 5 3.1m9.1 3-.7-6.1-5 3.1" fill={primary} />
                    <path
                        d="M8.4 15.5c0-5.4 2.7-8 7.6-8s7.6 2.6 7.6 8c0 6.1-2.9 9.6-7.6 9.6s-7.6-3.5-7.6-9.6Z"
                        fill={primary}
                    />
                    <Face y={14.2} mouth={false} />
                    <path d="m14.5 17.3 1.5 1 1.5-1m-5.1.3-5-1m5 3-5 .7m12.2-2.7 5-1m-5 3 5 .7" />
                </>
            )
        case 'bear':
            return (
                <>
                    <circle cx="10" cy="9.7" r="3.5" fill={primary} />
                    <circle cx="22" cy="9.7" r="3.5" fill={primary} />
                    <path
                        d="M8.3 15.8c0-5.3 2.8-8.2 7.7-8.2s7.7 2.9 7.7 8.2c0 6.1-3 9.5-7.7 9.5s-7.7-3.4-7.7-9.5Z"
                        fill={primary}
                    />
                    <ellipse cx="16" cy="18" rx="3.4" ry="2.8" fill={secondary} />
                    <Face y={14.2} mouth={false} />
                    <path d="m14.8 17.2 1.2.8 1.2-.8" />
                </>
            )
        case 'robot':
            return (
                <>
                    <path d="M16 7V4m-2 0h4" />
                    <rect x="7.5" y="7" width="17" height="17.5" rx="3" fill={primary} />
                    <rect x="10.5" y="11" width="11" height="7" rx="2" fill={secondary} />
                    <circle cx="13.5" cy="14.4" r="1" fill="currentColor" stroke="none" />
                    <circle cx="18.5" cy="14.4" r="1" fill="currentColor" stroke="none" />
                    <path d="M12.5 21h7" />
                </>
            )
        case 'alien':
            return (
                <>
                    <path
                        d="M7.8 14.2c0-5.4 3.1-8.7 8.2-8.7s8.2 3.3 8.2 8.7c0 6.4-3.4 11.5-8.2 11.5S7.8 20.6 7.8 14.2Z"
                        fill={primary}
                    />
                    <path
                        d="M10.6 12.2c2.5-.8 4.2 0 4.6 2.6-2.5.8-4.1 0-4.6-2.6Zm10.8 0c-2.5-.8-4.2 0-4.6 2.6 2.5.8 4.1 0 4.6-2.6Z"
                        fill={secondary}
                    />
                    <path d="M13.4 20.4c1.6.9 3.6.9 5.2 0" />
                </>
            )
        case 'banana':
            return (
                <>
                    <path
                        d="M9.3 6.2c1.2 8.6 4.6 13.1 10.3 13.1 3.5 0 5.9-1.5 7-4.2.9 6.4-2.5 10.6-8.8 10.6-7.1 0-11.6-5.9-11.7-15.2Z"
                        fill={primary}
                    />
                    <path d="m8.8 6.5-1.3-2m12.1 14.8 1.1 2.2" />
                    <Face y={15.1} />
                </>
            )
        case 'panda':
            return (
                <>
                    <circle cx="10" cy="9.8" r="3.8" fill={secondary} />
                    <circle cx="22" cy="9.8" r="3.8" fill={secondary} />
                    <path
                        d="M8.2 15.8c0-5.5 2.8-8.4 7.8-8.4s7.8 2.9 7.8 8.4c0 6-3 9.4-7.8 9.4s-7.8-3.4-7.8-9.4Z"
                        fill={primary}
                    />
                    <ellipse cx="12.5" cy="14.5" rx="2.2" ry="2.8" fill={secondary} transform="rotate(25 12.5 14.5)" />
                    <ellipse cx="19.5" cy="14.5" rx="2.2" ry="2.8" fill={secondary} transform="rotate(-25 19.5 14.5)" />
                    <Face y={14.4} mouth={false} />
                    <path d="m14.8 18 1.2.8 1.2-.8" />
                </>
            )
        case 'dinosaur':
            return (
                <>
                    <path d="m11.2 9.4 1.2-4.1 2.7 3.4 2.2-4 1.7 4.4" fill={secondary} />
                    <path
                        d="M8.5 16c0-5.3 2.8-8.3 7.8-8.3 5.5 0 8 3.3 7.1 9.4 2.3 1.2 3.4 3.3 2.8 5.8-2.7-.1-4.7-.8-6-2.1-1.2 3-3.6 4.5-7 4.5-3 0-4.7-3.1-4.7-9.3Z"
                        fill={primary}
                    />
                    <Face y={14.1} />
                    <path d="m22.6 17.4 3.6-1.4" />
                </>
            )
        case 'owl':
            return (
                <>
                    <path d="m9.2 11.4.2-5 4.1 2.6m9.3 2.4-.2-5-4.1 2.6" fill={primary} />
                    <path
                        d="M8.2 16c0-5.7 2.8-8.6 7.8-8.6s7.8 2.9 7.8 8.6c0 6-3 9.6-7.8 9.6S8.2 22 8.2 16Z"
                        fill={primary}
                    />
                    <circle cx="12.7" cy="14.5" r="3" fill="#FFFDF8" />
                    <circle cx="19.3" cy="14.5" r="3" fill="#FFFDF8" />
                    <circle cx="12.7" cy="14.5" r="1" fill="currentColor" stroke="none" />
                    <circle cx="19.3" cy="14.5" r="1" fill="currentColor" stroke="none" />
                    <path d="m14.5 18 1.5 1.2 1.5-1.2-1.5-1Z" fill={secondary} />
                </>
            )
        case 'moon':
            return (
                <>
                    <path
                        d="M21.4 5.6c-5.3 1.2-8.7 5-8.7 9.9 0 4.7 3.3 8.3 8.1 9.6-1.5.8-3.1 1.2-4.8 1.2-5.9 0-10.3-4.3-10.3-10.3S10.1 5.7 16 5.7c1.9 0 3.7.5 5.4 1.4Z"
                        fill={primary}
                    />
                    <circle cx="12.1" cy="14" r="0.9" fill="currentColor" stroke="none" />
                    <path d="M11.8 18.2c1.1.7 2.4.7 3.4 0" />
                </>
            )
        case 'kiwi':
            return (
                <>
                    <ellipse cx="16" cy="16.5" rx="8.7" ry="10" fill={secondary} />
                    <ellipse cx="16" cy="16.5" rx="6.7" ry="8" fill={primary} />
                    <path d="m16 9 .2 2m-4.6-.8 1.1 1.8m7.8-1.8-1.1 1.8M10 14l2 .7m8-1 2-.7m-10.4 8 1.5-1.4m7.3 1.4-1.5-1.4" />
                    <Face y={15.5} />
                </>
            )
        case 'llama':
            return (
                <>
                    <path d="m11.5 9-1.1-4.8 3.5 3.5m6.6 1.3 1.1-4.8-3.5 3.5" fill={primary} />
                    <path
                        d="M10.5 18.7V11c0-3 2.1-5 5.5-5s5.5 2 5.5 5v7.7c0 4.5-2 7-5.5 7s-5.5-2.5-5.5-7Z"
                        fill={primary}
                    />
                    <path d="M12.5 18c2.3-1.2 4.7-1.2 7 0v4.3h-7Z" fill={secondary} />
                    <Face y={13.4} mouth={false} />
                    <path d="m14.7 19 1.3.8 1.3-.8" />
                </>
            )
        case 'pineapple':
            return (
                <>
                    <path
                        d="m16 9-3.5-5.1 3.5 2.6 3.5-2.6Zm-2 1L8.6 6.7l2.3 5.4m7.1-2.1 5.4-3.3-2.3 5.4"
                        fill={secondary}
                    />
                    <path
                        d="M9.1 17.4c0-5.4 2.6-8.2 6.9-8.2s6.9 2.8 6.9 8.2c0 5.8-2.7 8.9-6.9 8.9s-6.9-3.1-6.9-8.9Z"
                        fill={primary}
                    />
                    <path d="m10.5 14 11 7m-11-1 10.8-6.6" opacity=".38" />
                    <Face y={15.2} />
                </>
            )
        case 'yeti':
            return (
                <>
                    <path d="m9 11.4-.5-4.2 3.8 2m10.7 2.2.5-4.2-3.8 2" fill={secondary} />
                    <path
                        d="M7.8 17c0-6.1 3-9.4 8.2-9.4s8.2 3.3 8.2 9.4c0 5.8-1.6 9.3-4.5 9.3L18 24.2l-2 2.1-2-2.1-1.7 2.1c-2.9 0-4.5-3.5-4.5-9.3Z"
                        fill={primary}
                    />
                    <path d="M10.5 13.6c3.6-2.1 7.4-2.1 11 0v6.3c-3.6 2.5-7.4 2.5-11 0Z" fill="#FFFDF8" />
                    <Face y={16} />
                </>
            )
    }
}

function Costume({ costume, accent }: { costume: PersonaCostume; accent: string }) {
    switch (costume) {
        case 'vampire':
            return (
                <>
                    <path d="m8.6 19.5-3.1-4.2 5.3 1.1m12.6 3.1 3.1-4.2-5.3 1.1" fill={accent} />
                    <path d="m13.7 20.1 1 2 1.2-1.7 1.3 1.7 1-2" fill="#FFFDF8" />
                </>
            )
        case 'pirate':
            return (
                <>
                    <path d="M8 9.8c2.2-4 4.8-5.8 8-5.8s5.8 1.8 8 5.8Z" fill="#24242C" />
                    <path d="M7 10h18" />
                    <path d="m18.5 12.7 5.7 4.8m-3-2.5h-4" stroke="#24242C" strokeWidth="2.2" />
                </>
            )
        case 'disco':
            return (
                <>
                    <path d="M9.4 14.2h5.1l1.5 1.5 1.5-1.5h5.1v3.6h-5.1L16 16.3l-1.5 1.5H9.4Z" fill={accent} />
                    <path d="m5 8 1.3-2m19.7 2-1.3-2M16 4V1.8" />
                </>
            )
        case 'wizard':
            return (
                <>
                    <path d="m8 10.7 8-9 8 9Z" fill={accent} />
                    <path d="M6.3 10.7h19.4" />
                    <path d="m16 4.5.5 1 1.1.2-.8.8.2 1.1-1-.5-1 .5.2-1.1-.8-.8 1.1-.2Z" fill="#FFC900" stroke="none" />
                </>
            )
        case 'astronaut':
            return (
                <>
                    <circle cx="16" cy="15.8" r="12.2" stroke={accent} strokeWidth="2.2" />
                    <path d="M7.2 24.5h17.6" stroke={accent} strokeWidth="2.2" />
                    <circle cx="24.4" cy="8.4" r="1.2" fill="#FFC900" />
                </>
            )
        case 'detective':
            return (
                <>
                    <path d="M9 9.5c1.8-3.2 4.1-4.8 7-4.8s5.2 1.6 7 4.8Zm-2.2.2h18.4" fill={accent} />
                    <circle cx="23.3" cy="21.2" r="3.7" fill="none" strokeWidth="1.8" />
                    <path d="m26 24 2.4 2.4" strokeWidth="1.8" />
                </>
            )
        case 'rockstar':
            return (
                <>
                    <path
                        d="m10.5 12.3 1.1 2.1 2.4.4-1.8 1.7.4 2.4-2.1-1.1-2.1 1.1.4-2.4L7 14.8l2.4-.4Zm11 0 1.1 2.1 2.4.4-1.8 1.7.4 2.4-2.1-1.1-2.1 1.1.4-2.4-1.8-1.7 2.4-.4Z"
                        fill="#24242C"
                    />
                    <path d="m25 21 2.4 2.3-2.1.5 1.4 2.1" stroke={accent} strokeWidth="2" />
                </>
            )
        case 'cozy':
            return (
                <>
                    <path d="M8.6 20.5c4.9 2.3 9.9 2.3 14.8 0l.5 3.8c-5.2 2.5-10.6 2.5-15.8 0Z" fill={accent} />
                    <path d="m21.2 23.7 2.2 4.1" stroke={accent} strokeWidth="2.5" />
                </>
            )
        case 'skater':
            return (
                <>
                    <path
                        d="M5.5 25c5.9 1.4 14.8 1.4 21 0-.8 2.1-2.6 3.1-5 3.1h-11c-2.4 0-4.2-1-5-3.1Z"
                        fill={accent}
                    />
                    <circle cx="10" cy="28.3" r="1" fill="#24242C" />
                    <circle cx="22" cy="28.3" r="1" fill="#24242C" />
                    <path d="M10 8c2-2.2 4-3.2 6-3.2s4 1 6 3.2" fill={accent} />
                </>
            )
        case 'bookworm':
            return (
                <>
                    <path
                        d="M4.8 20c4.2-1 7.9 0 11.2 3 3.3-3 7-4 11.2-3v6.8c-4.2-1-7.9 0-11.2 3-3.3-3-7-4-11.2-3Z"
                        fill="#FFFDF8"
                    />
                    <path d="M16 23v7" />
                </>
            )
        case 'surfer':
            return (
                <>
                    <path d="M4.2 25.5c5.8-2.1 17.8-2.1 23.6 0-4.7 3.9-18.9 3.9-23.6 0Z" fill={accent} />
                    <path d="M7 22c1.7-2.4 3.8-3.4 6.3-3-1.5 1-2.4 2.4-2.6 4.1" stroke="#FFFDF8" />
                </>
            )
        case 'ninja':
            return (
                <>
                    <path d="M7.8 12.4h16.4v5.8H7.8Z" fill="#24242C" />
                    <path d="M11.8 15.2h2m4.4 0h2" stroke="#FFFDF8" strokeWidth="1.8" />
                    <path d="m23.8 13.5 4.2-2m-4 4.1 4 1" />
                </>
            )
        case 'gardener':
            return (
                <>
                    <path
                        d="M16 9.2c0-3.5 2.4-5.6 6.1-5.3-.1 3.6-2.2 5.5-6.1 5.3Zm0 0c-.4-2.9-2.3-4.3-5.4-4.1.1 3 1.9 4.4 5.4 4.1Z"
                        fill={accent}
                    />
                    <path d="M16 9.2v4.2" />
                </>
            )
        case 'party':
            return (
                <>
                    <path d="m10 10.8 6-8.4 6 8.4Z" fill={accent} />
                    <circle cx="15.8" cy="2.3" r="1.2" fill="#F0648D" />
                    <path d="m6.2 7-2-1.5m23.6 1.5 2-1.5m-4.6 6.7 2.8.4M6.8 12.2l-2.8.4" />
                </>
            )
        case 'sleepy':
            return (
                <>
                    <path d="M9.2 10.5c1.3-5.7 5.5-8 11-6.1l3.4 6.1Z" fill={accent} />
                    <circle cx="20.4" cy="4.2" r="1.8" fill="#FFFDF8" />
                    <path d="m24 15 3-3h-3m1 6 3-3h-3" />
                </>
            )
        case 'royal':
            return (
                <>
                    <path d="m8.2 10.4 1.2-6 4.3 3.6L16 3l2.3 5 4.3-3.6 1.2 6Z" fill={accent} />
                    <path d="M8.2 10.4h15.6" />
                </>
            )
        case 'scientist':
            return (
                <>
                    <circle cx="12.2" cy="14" r="3.1" fill="#BDECF5" />
                    <circle cx="19.8" cy="14" r="3.1" fill="#BDECF5" />
                    <path d="M15.3 14h1.4m-7.6 0H6.5m16.4 0h2.6" />
                    <path d="m24.5 21-2.2 5.7h5.2L25.3 21v-2.2" fill={accent} />
                </>
            )
        case 'cowboy':
            return (
                <>
                    <path d="M10 9.5c1-4.3 3-6.4 6-6.4s5 2.1 6 6.4Z" fill={accent} />
                    <path d="M5.5 9.5h21c-1.5 2.1-4.1 2.8-7.8 2.1h-5.4c-3.7.7-6.3 0-7.8-2.1Z" fill={accent} />
                </>
            )
        case 'gamer':
            return (
                <>
                    <path
                        d="M8.2 12c-2.8 1.5-3.3 5-1.7 9.7l3.2-2.8h12.6l3.2 2.8c1.6-4.7 1.1-8.2-1.7-9.7"
                        fill={accent}
                    />
                    <path d="M9.5 15.5v4m-2-2h4m9-1.5h.1m2.4 3h.1" />
                    <path d="M9 10.5c1.1-4 3.4-6 7-6s5.9 2 7 6" />
                </>
            )
        case 'explorer':
            return (
                <>
                    <path d="M8.5 9.7c1.3-4.3 3.8-6.4 7.5-6.4s6.2 2.1 7.5 6.4Z" fill={accent} />
                    <path d="M5.7 9.7h20.6" />
                    <circle cx="12.3" cy="20.5" r="3.1" fill="#BDECF5" />
                    <circle cx="19.7" cy="20.5" r="3.1" fill="#BDECF5" />
                    <path d="M15.4 20.5h1.2" />
                </>
            )
        case 'mechanic':
            return (
                <>
                    <path
                        d="M22.6 18.5a4 4 0 0 0 4.7-5.8l-2.4 2.4-2-2 2.4-2.4a4 4 0 0 0-5.8 4.7L11 23.9l-2.9-.7-.7 2.9 2 2Z"
                        fill={accent}
                    />
                </>
            )
        case 'lucky':
            return (
                <>
                    <path
                        d="M23.8 8.4c0-2.8-3.8-3.8-5.3-1.3C17.8 4 13.6 4 13 7.1c-2.5-1.5-5.1.8-3.7 3.2 1.1 2 3.9 2.5 7.3 1.3-.1 2.9.8 5.6 2.8 7.8"
                        fill={accent}
                    />
                </>
            )
        case 'sailor':
            return (
                <>
                    <path d="M9 9.8h14l-2.2-5.2h-9.6Z" fill="#FFFDF8" />
                    <path d="M7.5 10h17" stroke={accent} strokeWidth="2" />
                    <path d="m16 5.7-1-1.2 1-1.2 1 1.2Z" fill={accent} />
                </>
            )
        case 'painter':
            return (
                <>
                    <path d="M8.4 9.6c1.4-4.4 4.1-6.6 8.1-6.6 2.5 0 4.6 1 6.2 3-3.5.2-5.7 1.4-6.7 3.6Z" fill={accent} />
                    <path d="m24 20 3.8-8m-4.6 6.3 2.6 1.2-1 3-2.7-1.2Z" fill="#E39B63" />
                </>
            )
        case 'dj':
            return (
                <>
                    <path d="M7.5 15v-2.5C7.5 7 10.6 4 16 4s8.5 3 8.5 8.5V15" />
                    <rect x="5.7" y="13" width="4.2" height="7" rx="1.5" fill={accent} />
                    <rect x="22.1" y="13" width="4.2" height="7" rx="1.5" fill={accent} />
                    <path d="m13 23 3 2 3-2" />
                </>
            )
        case 'baker':
            return (
                <>
                    <path
                        d="M8.4 10.6c-1.6-1-1.9-3.2-.7-4.6 1.1-1.3 3.1-1.5 4.4-.3.4-2 2-3.3 3.9-3.3s3.5 1.3 3.9 3.3c1.3-1.2 3.3-1 4.4.3 1.2 1.4.9 3.6-.7 4.6Z"
                        fill="#FFFDF8"
                    />
                    <path d="M9 10.6h14v3H9Z" fill={accent} />
                </>
            )
        case 'karaoke':
            return (
                <>
                    <circle cx="24.6" cy="18" r="3" fill={accent} />
                    <path d="m22.6 20.2-5.2 6m7.2-11.2c-1-2.4-2.7-3.1-4.8-2" />
                    <path d="m6.5 8 2.2-1.2m-1.1 5.1 2.4-.4" />
                </>
            )
        case 'cosmic':
            return (
                <>
                    <ellipse
                        cx="16"
                        cy="16"
                        rx="13"
                        ry="5.2"
                        transform="rotate(-22 16 16)"
                        fill="none"
                        stroke={accent}
                    />
                    <path d="m25.5 7 .7 1.5 1.7.3-1.2 1.2.3 1.7-1.5-.8-1.5.8.3-1.7-1.2-1.2 1.7-.3Z" fill="#FFC900" />
                    <circle cx="6.3" cy="23.7" r="1.1" fill="#F0648D" />
                </>
            )
        case 'punk':
            return (
                <>
                    <path d="m10.5 10 1.2-6 3 4 2-5 2.1 5 3-4 1.1 6Z" fill={accent} />
                    <path d="M9 15.3h5.3l1.7 1.4 1.7-1.4H23v3.5h-5.3L16 17.4l-1.7 1.4H9Z" fill="#24242C" />
                </>
            )
        case 'yoga':
            return (
                <>
                    <path d="M8.3 10.4c5.1-1.5 10.3-1.5 15.4 0" stroke={accent} strokeWidth="2.2" />
                    <path d="M6 27h20" stroke={accent} strokeWidth="2.5" />
                    <path d="m5 21 3-2m19 2-3-2" />
                </>
            )
    }
}

/**
 * One deliberately non-human alter ego. Creature and costume are separate so
 * the catalog can make odd combinations without thirty unrelated illustration
 * systems; that shared grammar is what lets "Vampire Penguin" and "Yoga Yeti"
 * still look like the same product at 16px.
 */
export function PersonaGlyph({ art, size }: { art: PersonaArt; size: number }) {
    return (
        <svg
            viewBox="0 0 32 32"
            width={size}
            height={size}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <Creature creature={art.creature} primary={art.primary} secondary={art.secondary} />
            <Costume costume={art.costume} accent={art.secondary} />
        </svg>
    )
}
