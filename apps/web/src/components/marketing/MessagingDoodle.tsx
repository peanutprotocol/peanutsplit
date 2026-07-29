import { type SVGProps } from 'react'
import { cn } from '@/lib/cn'

export type MessagingDoodleName = 'whatsapp' | 'telegram' | 'messenger' | 'messages'

interface MessagingDoodleProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
    name: MessagingDoodleName
}

/**
 * Loose, one-line renditions of the places a room link actually travels.
 *
 * These deliberately are not imported brand assets. Perfect app-store marks would fight the
 * hand-drawn Split language and imply integrations that do not exist; the imperfect outlines
 * read as familiar destinations while remaining decorative context around the real link.
 */
export function MessagingDoodle({ name, className, ...props }: MessagingDoodleProps) {
    return (
        <svg
            viewBox="0 0 32 32"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={cn('overflow-visible', className)}
            {...props}
        >
            {name === 'whatsapp' && (
                <>
                    <path d="M16.2 4.8c-6.1-.1-10.9 4.6-11 10.5 0 2.1.6 4.1 1.7 5.7l-1.2 5.6 5.6-1.5c1.5.8 3.1 1.2 4.8 1.2 6.1.1 11-4.5 11.1-10.5.1-5.9-4.8-10.9-11-11Z" />
                    <path d="M12 10.7c.4-.5.8-.4 1.1.1l1.2 2.4c.2.4-.1.8-.7 1.3.8 1.8 2.3 3.3 4.2 4.1.6-.7 1-1.2 1.5-.9l2.3 1.2c.5.3.6.7.3 1.3-.5 1.1-1.5 1.8-2.8 1.8-2.7-.2-5.7-2-7.5-4.3-1.5-1.9-2.4-4-1.9-5.4.3-.7.9-1.3 1.3-1.6Z" />
                </>
            )}
            {name === 'telegram' && (
                <>
                    <path d="M4.3 14.9c4.2-1.9 8.5-3.7 12.8-5.5 3-1.3 6.1-2.6 9.1-3.7.8-.3 1.5.3 1.2 1.3l-3.3 18.2c-.2 1.1-1.1 1.4-2 .8l-6.4-4.7-3.1 3.1c-.5.5-1.1.3-1.2-.5l-.6-5.5-6.5-2.1c-.9-.3-.9-1 0-1.4Z" />
                    <path d="m11 18.2 12-8.3c.5-.4.9-.2.5.2l-9.6 9.5" />
                </>
            )}
            {name === 'messenger' && (
                <>
                    <path d="M16 4.8c-6.5 0-11.5 4.5-11.5 10.5 0 3.4 1.7 6.4 4.5 8.3l-.3 4 4-2.2c1.1.3 2.2.5 3.4.5 6.5 0 11.5-4.5 11.5-10.5S22.5 4.8 16 4.8Z" />
                    <path d="m9.7 18.7 4.3-4.6 3.2 2.6 4.9-4.9-4.3 6.3-3.2-2.5-4.9 3.1Z" />
                </>
            )}
            {name === 'messages' && (
                <>
                    <path d="M16 5.1c-6.7 0-11.7 4.3-11.7 10.1 0 3.1 1.5 5.8 4.1 7.6l-.8 4.4 4.6-2.1c1.2.3 2.5.5 3.8.5 6.7 0 11.7-4.3 11.7-10.2C27.7 9.5 22.7 5.1 16 5.1Z" />
                    <path d="M10.8 15.5h.1M16 15.5h.1M21.2 15.5h.1" strokeWidth="2.8" />
                </>
            )}
        </svg>
    )
}

export default MessagingDoodle
