'use client'

import { useId, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { CloseButton } from '@/components/ui/CloseButton'
import { composerBareInputClassName, composerSurfaceClassName } from '@/components/ui/composer-style'
import { cn } from '@/lib/cn'
import { normalizePersonName } from '@/lib/person-name'
import type { useRoomPeopleDraft } from '@/lib/use-room-people-draft'

interface RoomPeopleFieldsProps {
    creatorName: string
    draft: ReturnType<typeof useRoomPeopleDraft>
    disabled?: boolean
    children?: ReactNode
}

export function RoomPeopleFields({ creatorName, draft, disabled, children }: RoomPeopleFieldsProps) {
    const t = useTranslations('room.create.people')
    const id = useId()
    const { memberNames, invalidMemberIndex, containerRef, changeMembers, addPerson, focusPerson } = draft
    const count = [creatorName, ...memberNames].filter((name) => normalizePersonName(name)).length

    const removePerson = (index: number) => {
        const remaining = memberNames.filter((_, position) => position !== index)
        changeMembers(remaining.length ? remaining : [''])
        focusPerson(Math.min(index, Math.max(remaining.length - 1, 0)))
    }

    return (
        <div ref={containerRef} className="flex flex-col gap-3" data-testid="room-people">
            <div className="flex items-baseline justify-between gap-3">
                <h2 id={`${id}-title`} className="text-h7">
                    {t('title')}
                </h2>
                <span className="text-xs text-grey-1" aria-live="polite" data-testid="room-people-count">
                    {t('count', { count })}
                </span>
            </div>
            <div className={composerSurfaceClassName()} role="group" aria-labelledby={`${id}-title`}>
                {children}
                {memberNames.map((name, index) => {
                    const invalid = invalidMemberIndex === index
                    const displayName = normalizePersonName(name)
                    const removable = !!displayName || memberNames.length > 1
                    return (
                        <div
                            key={index}
                            data-person-row
                            className={cn(
                                'scroll-mb-6 scroll-mt-6 px-2 py-1',
                                (!!children || index > 0) && 'border-t border-dashed border-grey-1'
                            )}
                        >
                            <div className="flex min-w-0 items-center gap-1">
                                <input
                                    value={name}
                                    onChange={(event) =>
                                        changeMembers(
                                            memberNames.map((value, position) =>
                                                position === index ? event.target.value : value
                                            )
                                        )
                                    }
                                    onKeyDown={(event) => {
                                        if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
                                        event.preventDefault()
                                        if (index < memberNames.length - 1) focusPerson(index + 1)
                                        else addPerson()
                                    }}
                                    placeholder={t('namePlaceholder')}
                                    aria-label={t('nameLabel', { number: index + 2 })}
                                    aria-invalid={invalid || undefined}
                                    aria-describedby={invalid ? `${id}-error-${index}` : undefined}
                                    maxLength={80}
                                    autoComplete="off"
                                    enterKeyHint="next"
                                    disabled={disabled}
                                    data-person-index={index}
                                    data-testid="room-person-name"
                                    className={composerBareInputClassName('h-12 flex-1 px-2 text-base font-bold')}
                                />
                                {removable && (
                                    <CloseButton
                                        label={
                                            displayName
                                                ? t('remove', { name: displayName })
                                                : t('removeEmpty', { number: index + 2 })
                                        }
                                        onClick={() => removePerson(index)}
                                        disabled={disabled}
                                        data-testid="remove-room-person"
                                    />
                                )}
                            </div>
                            {invalid && (
                                <p
                                    id={`${id}-error-${index}`}
                                    role="alert"
                                    className="break-words px-2 pb-2 text-sm font-bold text-error"
                                >
                                    {t('duplicate', { name: displayName })}
                                </p>
                            )}
                        </div>
                    )
                })}
            </div>
            <Button
                type="button"
                variant="stroke"
                icon="plus"
                onClick={addPerson}
                disabled={disabled}
                className="justify-center"
                data-testid="add-room-person"
            >
                {t('add')}
            </Button>
        </div>
    )
}
