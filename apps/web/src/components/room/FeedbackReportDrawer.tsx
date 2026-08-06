'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { CloseButton } from '@/components/ui/CloseButton'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerActions, DrawerBody } from '@/components/ui/DrawerLayout'
import { SettingToggle } from '@/components/ui/SettingToggle'
import { api } from '@/lib/api'
import type { RoomState } from '@/lib/api-types'
import {
    captureFeedbackScreenshot,
    collectFeedbackDiagnostics,
    FeedbackImageTooLargeError,
    prepareFeedbackScreenshot,
    ScreenCaptureUnavailableError,
} from '@/lib/feedback-client'
import {
    MAX_FEEDBACK_MESSAGE_CHARS,
    MAX_FEEDBACK_SNAPSHOT_EXPENSES,
    MAX_FEEDBACK_SNAPSHOT_SETTLEMENTS,
    MIN_FEEDBACK_MESSAGE_CHARS,
    type FeedbackDiagnostics,
    type FeedbackReportInput,
    type FeedbackScreenshotInput,
} from '@/lib/feedback-contract'
import { useErrorMessage } from '@/lib/error-messages'
import { useFeedback } from '@/lib/use-settings'

interface FeedbackReportDrawerProps {
    open: boolean
    onClose: () => void
    state: RoomState
}

export function FeedbackReportDrawer({ open, onClose, state }: FeedbackReportDrawerProps) {
    const t = useTranslations('room.feedback')
    const locale = useLocale()
    const number = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }), [locale])
    const errorMessage = useErrorMessage()
    const feedback = useFeedback()
    const uploadRef = useRef<HTMLInputElement>(null)
    const [message, setMessage] = useState('')
    const [diagnostics, setDiagnostics] = useState<FeedbackDiagnostics | null>(null)
    const [includeDiagnostics, setIncludeDiagnostics] = useState(false)
    const [includeRoom, setIncludeRoom] = useState(false)
    const [screenshot, setScreenshot] = useState<FeedbackScreenshotInput | null>(null)
    const [confirmed, setConfirmed] = useState(false)
    const [captureSupported, setCaptureSupported] = useState(false)
    const [imageBusy, setImageBusy] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [failure, setFailure] = useState<string | null>(null)
    const [imageFailure, setImageFailure] = useState<string | null>(null)
    const [sent, setSent] = useState(false)

    useEffect(() => {
        if (!open) return
        setDiagnostics(collectFeedbackDiagnostics())
        setCaptureSupported(typeof navigator.mediaDevices?.getDisplayMedia === 'function')
    }, [open])

    const reset = () => {
        setMessage('')
        setIncludeDiagnostics(false)
        setIncludeRoom(false)
        setScreenshot(null)
        setConfirmed(false)
        setFailure(null)
        setImageFailure(null)
        setSent(false)
    }

    const close = () => {
        if (submitting) return
        onClose()
        reset()
    }

    const changeAttachment = (change: () => void) => {
        change()
        // Consent applies to the reviewed attachment set, not to a future one.
        setConfirmed(false)
        setFailure(null)
    }

    const attachFile = async (file: File) => {
        setImageBusy(true)
        setImageFailure(null)
        try {
            const prepared = await prepareFeedbackScreenshot(file)
            changeAttachment(() => setScreenshot(prepared))
            feedback('pop', { haptic: 'confirm' })
        } catch (error) {
            setImageFailure(error instanceof FeedbackImageTooLargeError ? t('imageTooLarge') : t('imageUnreadable'))
            feedback('error', { haptic: 'error' })
        } finally {
            setImageBusy(false)
        }
    }

    const capture = async () => {
        setImageBusy(true)
        setImageFailure(null)
        try {
            const prepared = await captureFeedbackScreenshot()
            changeAttachment(() => setScreenshot(prepared))
            feedback('pop', { haptic: 'confirm' })
        } catch (error) {
            setImageFailure(
                error instanceof ScreenCaptureUnavailableError ? t('captureUnavailable') : t('captureCancelled')
            )
        } finally {
            setImageBusy(false)
        }
    }

    const submit = async () => {
        const text = message.trim()
        if (
            submitting ||
            !confirmed ||
            text.length < MIN_FEEDBACK_MESSAGE_CHARS ||
            (includeDiagnostics && !diagnostics)
        )
            return

        const input: FeedbackReportInput = {
            message: text,
            consent: {
                confirmed: true,
                diagnostics: includeDiagnostics,
                roomSnapshot: includeRoom,
                screenshot: screenshot !== null,
            },
            ...(includeDiagnostics && diagnostics ? { diagnostics } : {}),
            ...(screenshot ? { screenshot } : {}),
        }

        setSubmitting(true)
        setFailure(null)
        try {
            await api.feedback.report(state.room.slug, input)
            setSent(true)
            feedback('pop', { haptic: 'success' })
        } catch (error) {
            setFailure(errorMessage(error, t('sendFailed')))
            feedback('error', { haptic: 'error' })
        } finally {
            setSubmitting(false)
        }
    }

    const descriptionId = 'feedback-report-description'
    const messageHintId = 'feedback-message-hint'
    const ready =
        message.trim().length >= MIN_FEEDBACK_MESSAGE_CHARS &&
        confirmed &&
        (!includeDiagnostics || diagnostics !== null) &&
        !imageBusy

    return (
        <Drawer open={open} onOpenChange={(next) => !next && close()}>
            <DrawerContent data-testid="feedback-report-drawer" aria-describedby={descriptionId}>
                <DrawerHeader className="flex flex-row items-end justify-between">
                    <div className="min-w-0">
                        <DrawerTitle className="text-h5">{sent ? t('successTitle') : t('title')}</DrawerTitle>
                        <p id={descriptionId} className="mt-1 text-sm text-grey-1">
                            {sent ? t('successBody') : t('intro')}
                        </p>
                    </div>
                    <CloseButton onClick={close} label={t('close')} disabled={submitting} />
                </DrawerHeader>

                <DrawerBody>
                    {sent ? (
                        <DrawerActions>
                            <Button onClick={close} className="justify-center" data-testid="feedback-done">
                                {t('done')}
                            </Button>
                        </DrawerActions>
                    ) : (
                        <>
                            <p className="rounded-sm border border-n-1 bg-white p-3 text-sm text-grey-1">
                                {t('scopeNote', { room: state.room.name })}
                            </p>
                            <section className="flex flex-col gap-2" aria-labelledby="feedback-message-label">
                                <div className="flex items-end justify-between gap-3">
                                    <label id="feedback-message-label" htmlFor="feedback-message" className="text-h7">
                                        {t('messageLabel')}
                                    </label>
                                    <span className="text-xs text-grey-1" aria-live="polite">
                                        {message.length}/{MAX_FEEDBACK_MESSAGE_CHARS}
                                    </span>
                                </div>
                                <textarea
                                    id="feedback-message"
                                    value={message}
                                    onChange={(event) => {
                                        setMessage(event.target.value)
                                        setConfirmed(false)
                                        setFailure(null)
                                    }}
                                    maxLength={MAX_FEEDBACK_MESSAGE_CHARS}
                                    rows={5}
                                    required
                                    autoFocus
                                    aria-describedby={messageHintId}
                                    placeholder={t('messagePlaceholder')}
                                    data-testid="feedback-message"
                                    className="input min-h-32 w-full resize-y px-4 py-3"
                                />
                                <p id={messageHintId} className="text-xs text-grey-1">
                                    {t('messageHint', { minimum: MIN_FEEDBACK_MESSAGE_CHARS })}
                                </p>
                            </section>

                            <section className="flex flex-col gap-3" aria-labelledby="feedback-attachments-title">
                                <div>
                                    <h3 id="feedback-attachments-title" className="text-h7">
                                        {t('attachmentsTitle')}
                                    </h3>
                                    <p className="mt-1 text-sm text-grey-1">{t('attachmentsIntro')}</p>
                                </div>

                                <SettingToggle
                                    label={t('deviceTitle')}
                                    hint={t('deviceHint')}
                                    checked={includeDiagnostics}
                                    onChange={(next) => changeAttachment(() => setIncludeDiagnostics(next))}
                                    disabled={!diagnostics}
                                    testId="feedback-device-toggle"
                                />
                                {includeDiagnostics && diagnostics && (
                                    <dl
                                        data-testid="feedback-device-preview"
                                        className="grid grid-cols-[auto,minmax(0,1fr)] gap-x-3 gap-y-1 rounded-sm border border-n-1 bg-white p-3 text-xs"
                                    >
                                        <dt className="font-bold">{t('browser')}</dt>
                                        <dd className="break-words text-grey-1">{diagnostics.browser.userAgent}</dd>
                                        <dt className="font-bold">{t('viewport')}</dt>
                                        <dd className="text-grey-1">
                                            {diagnostics.viewport.width} × {diagnostics.viewport.height} @{' '}
                                            {number.format(diagnostics.viewport.devicePixelRatio)}×
                                        </dd>
                                        <dt className="font-bold">{t('timeZone')}</dt>
                                        <dd className="break-words text-grey-1">
                                            {diagnostics.timeZone || t('unknown')}
                                        </dd>
                                        <dt className="font-bold">{t('appMode')}</dt>
                                        <dd className="text-grey-1">{diagnostics.pwa.displayMode}</dd>
                                        <dt className="font-bold">{t('network')}</dt>
                                        <dd className="text-grey-1">
                                            {diagnostics.network.online ? t('online') : t('offline')}
                                            {diagnostics.network.effectiveType
                                                ? ` · ${diagnostics.network.effectiveType}`
                                                : ''}
                                        </dd>
                                    </dl>
                                )}
                                {includeDiagnostics && diagnostics && (
                                    <details className="rounded-sm border border-n-1 bg-white p-3 text-xs">
                                        <summary className="min-h-11 cursor-pointer py-3 font-bold">
                                            {t('exactDeviceData')}
                                        </summary>
                                        <pre className="overflow-x-auto whitespace-pre-wrap break-words text-grey-1">
                                            {JSON.stringify(diagnostics, null, 2)}
                                        </pre>
                                    </details>
                                )}

                                <SettingToggle
                                    label={t('roomTitle')}
                                    hint={t('roomHint', {
                                        expenses: MAX_FEEDBACK_SNAPSHOT_EXPENSES,
                                        settlements: MAX_FEEDBACK_SNAPSHOT_SETTLEMENTS,
                                    })}
                                    checked={includeRoom}
                                    onChange={(next) => changeAttachment(() => setIncludeRoom(next))}
                                    testId="feedback-room-toggle"
                                />
                                {includeRoom && (
                                    <div
                                        data-testid="feedback-room-preview"
                                        className="rounded-sm border border-n-1 bg-white p-3 text-sm"
                                    >
                                        <p className="font-bold">{state.room.name}</p>
                                        <p className="mt-1 text-grey-1">
                                            {t('roomPreview', {
                                                currency: state.room.currency,
                                                members: state.members.length,
                                                expenses: state.expenses.length,
                                                settlements: state.settlements.length,
                                            })}
                                        </p>
                                        <p className="mt-2 text-xs text-grey-1">{t('roomExcludes')}</p>
                                    </div>
                                )}

                                <div className="rounded-sm border border-n-1 bg-white p-3">
                                    <h4 className="text-h8">{t('screenshotTitle')}</h4>
                                    <p className="mt-1 text-sm text-grey-1">{t('screenshotHint')}</p>
                                    {screenshot ? (
                                        <div className="mt-3" data-testid="feedback-screenshot-preview">
                                            {/* This data URL never leaves form state until Submit. */}
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={`data:${screenshot.mimeType};base64,${screenshot.imageBase64}`}
                                                alt={t('screenshotAlt')}
                                                className="max-h-52 w-full rounded-sm border border-n-1 object-contain"
                                            />
                                            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-grey-1">
                                                <span>
                                                    {screenshot.width} × {screenshot.height} ·{' '}
                                                    {number.format(screenshot.byteLength / 1024)} KB
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => changeAttachment(() => setScreenshot(null))}
                                                    className="min-h-11 px-2 font-bold text-n-1 underline"
                                                    data-testid="feedback-remove-screenshot"
                                                >
                                                    {t('removeScreenshot')}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                            {captureSupported && (
                                                <Button
                                                    variant="stroke"
                                                    size="large"
                                                    icon="camera"
                                                    loading={imageBusy}
                                                    onClick={() => void capture()}
                                                    className="justify-center"
                                                    data-testid="feedback-capture-screen"
                                                >
                                                    {t('captureScreen')}
                                                </Button>
                                            )}
                                            <Button
                                                variant="stroke"
                                                size="large"
                                                icon="share"
                                                disabled={imageBusy}
                                                onClick={() => uploadRef.current?.click()}
                                                className="justify-center"
                                                data-testid="feedback-upload-screenshot"
                                            >
                                                {t('uploadScreenshot')}
                                            </Button>
                                            <input
                                                ref={uploadRef}
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                data-testid="feedback-screenshot-input"
                                                onChange={(event) => {
                                                    const file = event.target.files?.[0]
                                                    event.target.value = ''
                                                    if (file) void attachFile(file)
                                                }}
                                            />
                                        </div>
                                    )}
                                    {imageFailure && (
                                        <p role="alert" className="mt-2 text-sm font-bold text-error">
                                            {imageFailure}
                                        </p>
                                    )}
                                </div>
                            </section>

                            <SettingToggle
                                label={t('consentTitle')}
                                hint={t('consentHint')}
                                checked={confirmed}
                                onChange={setConfirmed}
                                testId="feedback-consent-toggle"
                            />

                            {failure && (
                                <p role="alert" className="text-sm font-bold text-error" data-testid="feedback-error">
                                    {failure}
                                </p>
                            )}

                            <DrawerActions>
                                <Button
                                    onClick={() => void submit()}
                                    disabled={!ready}
                                    loading={submitting}
                                    className="justify-center"
                                    data-testid="feedback-submit"
                                >
                                    {t('send')}
                                </Button>
                                <Button
                                    variant="stroke"
                                    onClick={close}
                                    disabled={submitting}
                                    className="justify-center"
                                >
                                    {t('cancel')}
                                </Button>
                            </DrawerActions>
                        </>
                    )}
                </DrawerBody>
            </DrawerContent>
        </Drawer>
    )
}
