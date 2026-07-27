import { Icon } from '@/components/ui/Icon'
import { marketingCopy } from './copy'

const { honesty } = marketingCopy

/**
 * The promises, stated plainly. Free forever is a commitment, not a growth line — if it ever
 * stops being true, this section changes before anything else does.
 */
export function HonestyStrip() {
    return (
        <section className="mx-auto w-full max-w-xl px-5">
            <h2 className="text-h5">{honesty.title}</h2>
            <ul className="mt-4 flex flex-col gap-3">
                {honesty.items.map((item) => (
                    <li key={item.title} className="flex items-start gap-3 rounded-sm border border-n-1 bg-white p-4">
                        <span
                            aria-hidden="true"
                            className="flex size-6 shrink-0 items-center justify-center rounded-full border border-n-1 bg-green-1"
                        >
                            <Icon name="check" size={14} className="text-n-1" />
                        </span>
                        <span className="flex-1">
                            <span className="block text-h7">{item.title}</span>
                            <span className="mt-1 block text-sm leading-5 text-grey-1">{item.body}</span>
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    )
}

export default HonestyStrip
