import { type FC, type SVGProps } from 'react'
import { cn } from '@/lib/cn'
import { Doodle } from './Doodle'
import type { DoodleName } from './doodles'

/**
 * App semantics mapped to the generated drawing set.
 *
 * Callers name the action, not the artwork, so a clearer 14px drawing can be
 * swapped in here without teaching twenty-two components about asset names.
 */
const iconDoodles = {
    plus: 'iconplus',
    x: 'iconx',
    check: 'iconcheck',
    share: 'iconshare',
    copy: 'iconcopy',
    users: 'iconusers',
    'arrow-left': 'iconarrowleft',
    'arrow-right': 'iconarrowright',
    'chevron-down': 'iconchevrondown',
    'chevron-up': 'iconchevronup',
    'chevron-right': 'iconchevronright',
    trash: 'icontrash',
    pencil: 'iconpencil',
    receipt: 'iconreceipt',
    wallet: 'iconwallet',
    banknote: 'cash',
    'hand-coins': 'iconhandcoins',
    sparkles: 'iconsparkles',
    dice: 'icondice',
    camera: 'iconcamera',
    calendar: 'iconcalendar',
    link: 'link',
    undo: 'iconundo',
    settings: 'expense_settings',
} as const satisfies Record<string, DoodleName>

export type IconName = keyof typeof iconDoodles

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
    name: IconName
    size?: number
}

/**
 * The shared action-icon surface. Every icon is generated from the same
 * low-jitter pen line as the room emblems and currency signs.
 */
export const Icon: FC<IconProps> = ({ name, size = 24, width, height, className, ...props }) => (
    <Doodle
        name={iconDoodles[name]}
        size={size}
        width={width ?? size}
        height={height ?? size}
        weight={2}
        className={cn('custom-size', className)}
        {...props}
    />
)
