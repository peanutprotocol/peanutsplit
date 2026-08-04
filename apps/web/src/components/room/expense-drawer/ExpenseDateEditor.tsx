'use client'

import { Doodle } from '@/components/ui/Doodle'
import { Icon } from '@/components/ui/Icon'
import { cn } from '@/lib/cn'

interface ExpenseDateEditorProps {
    summary: string
    value: string
    today: string
    yesterday: string
    labels: {
        date: string
        whenWasIt: string
        today: string
        yesterday: string
        collapse: string
    }
    onChooseRelative: (daysAgo: number) => void
    onChange: (value: string) => void
    onClose: () => void
}

/** The date section is a view over the drawer's ISO-date state. */
export function ExpenseDateEditor({
    summary,
    value,
    today,
    yesterday,
    labels,
    onChooseRelative,
    onChange,
    onClose,
}: ExpenseDateEditorProps) {
    return (
        <section
            data-testid="date-editor"
            aria-label={labels.date}
            className="shadow-4 overflow-hidden rounded-lg border-2 border-n-1 bg-white"
        >
            <div className="flex items-center justify-between gap-3 border-b border-dashed border-grey-1 px-3 py-2">
                <div>
                    <h3 className="text-h8">{labels.whenWasIt}</h3>
                    <p className="mt-1 text-xs text-grey-1">{summary}</p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={labels.collapse}
                    data-testid="collapse-date-editor"
                    className="flex size-11 shrink-0 items-center justify-center bg-transparent transition-transform hover:-translate-y-0.5 active:translate-y-[1px]"
                >
                    <Icon name="chevron-up" size={24} />
                </button>
            </div>
            <div className="flex flex-col gap-2 p-3">
                <div className="grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={() => onChooseRelative(0)}
                        aria-pressed={value === today}
                        className={cn(
                            'min-h-11 rounded-md border border-n-1 text-h8',
                            value === today ? 'shadow-2 bg-primary-3' : 'bg-white'
                        )}
                    >
                        {labels.today}
                    </button>
                    <button
                        type="button"
                        onClick={() => onChooseRelative(1)}
                        aria-pressed={value === yesterday}
                        className={cn(
                            'min-h-11 rounded-md border border-n-1 text-h8',
                            value === yesterday ? 'shadow-2 bg-primary-3' : 'bg-white'
                        )}
                    >
                        {labels.yesterday}
                    </button>
                </div>
                <label className="relative">
                    <span className="sr-only">{labels.date}</span>
                    <input
                        type="date"
                        value={value}
                        onChange={(event) => onChange(event.target.value)}
                        aria-label={labels.date}
                        data-testid="expense-date"
                        data-doodle-date
                        className="input h-14 appearance-none px-4 pr-12"
                    />
                    <Doodle
                        name="iconcalendar"
                        size={21}
                        weight={1.7}
                        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2"
                    />
                </label>
            </div>
        </section>
    )
}
