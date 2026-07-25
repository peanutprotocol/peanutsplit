import { type FC, type SVGProps } from 'react'
import { cn as twMerge } from '@/lib/cn'
import type { LucideIcon } from 'lucide-react'
import {
    ArrowLeft,
    ArrowRight,
    Banknote,
    Calendar,
    Camera,
    Check,
    ChevronDown,
    ChevronRight,
    ChevronUp,
    Copy,
    HandCoins,
    Link as LinkIcon,
    Pencil,
    Plus,
    Receipt,
    Settings,
    Share,
    Sparkles,
    Trash2,
    Undo,
    Users,
    Wallet,
    X,
} from 'lucide-react'

const iconComponents = {
    plus: Plus,
    x: X,
    check: Check,
    share: Share,
    copy: Copy,
    users: Users,
    'arrow-left': ArrowLeft,
    'arrow-right': ArrowRight,
    'chevron-down': ChevronDown,
    'chevron-up': ChevronUp,
    'chevron-right': ChevronRight,
    trash: Trash2,
    pencil: Pencil,
    receipt: Receipt,
    wallet: Wallet,
    banknote: Banknote,
    'hand-coins': HandCoins,
    sparkles: Sparkles,
    camera: Camera,
    calendar: Calendar,
    link: LinkIcon,
    undo: Undo,
    settings: Settings,
} satisfies Record<string, LucideIcon>

export type IconName = keyof typeof iconComponents

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
    name: IconName
    size?: number
}

/**
 * Single icon surface for the app. Icons carry `custom-size` so they opt out of the
 * global `.btn svg:not(.custom-size) { @apply icon-18 }` rule in tailwind.config.js —
 * size is local to the call site via the `size` prop, never Tailwind `h-X w-X`.
 */
export const Icon: FC<IconProps> = ({ name, size = 24, width, height, className, ...props }) => {
    const IconComponent = iconComponents[name]
    return (
        <IconComponent
            width={width ?? size}
            height={height ?? size}
            className={twMerge('custom-size', className)}
            {...props}
        />
    )
}
