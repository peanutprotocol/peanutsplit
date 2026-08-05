'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CloseButton } from '@/components/ui/CloseButton'
import { Icon } from '@/components/ui/Icon'
import { cn } from '@/lib/cn'
import { useFeedback } from '@/lib/use-settings'

type CameraStatus = 'starting' | 'ready' | 'blocked' | 'unavailable' | 'failed'

interface ScanCameraProps {
    onCancel: () => void
    onFile: (file: File) => void
}

/**
 * Live camera capture with a gallery escape hatch.
 *
 * The stream exists only while this screen is mounted. A captured frame becomes
 * an ordinary in-memory File and then follows the exact same resize/upload path
 * as a gallery image; neither path writes the original image anywhere.
 */
export function ScanCamera({ onCancel, onFile }: ScanCameraProps) {
    const t = useTranslations('room.scan')
    const feedback = useFeedback()
    const videoRef = useRef<HTMLVideoElement>(null)
    const uploadRef = useRef<HTMLInputElement>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const stoppedStreamsRef = useRef(new WeakSet<MediaStream>())
    const requestRef = useRef<Promise<MediaStream> | null>(null)
    const liveRef = useRef(false)
    const pageActiveRef = useRef(true)
    const requestGenerationRef = useRef(0)
    const [status, setStatus] = useState<CameraStatus>('starting')
    const [capturing, setCapturing] = useState(false)
    const [captureError, setCaptureError] = useState(false)

    useEffect(() => {
        liveRef.current = true

        const stop = (stream: MediaStream) => {
            // Strict Mode can leave two continuations awaiting the same
            // permission promise. MediaStreamTrack.stop() is idempotent, but
            // owning that idempotence here avoids duplicate lifecycle work.
            if (stoppedStreamsRef.current.has(stream)) return
            stoppedStreamsRef.current.add(stream)
            for (const track of stream.getTracks()) track.stop()
        }

        const stopStream = () => {
            const stream = streamRef.current
            streamRef.current = null
            if (stream) stop(stream)
            if (videoRef.current) videoRef.current.srcObject = null
        }

        const start = async () => {
            const generation = requestGenerationRef.current
            setStatus('starting')
            if (!navigator.mediaDevices?.getUserMedia) {
                setStatus('unavailable')
                return
            }

            try {
                requestRef.current ??= navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: { facingMode: { ideal: 'environment' } },
                })
                const stream = await requestRef.current
                if (!liveRef.current || !pageActiveRef.current || generation !== requestGenerationRef.current) {
                    stop(stream)
                    return
                }
                // Strict Mode's second effect run awaits the same permission
                // request. The first live continuation owns the attachment.
                if (streamRef.current === stream) return

                streamRef.current = stream
                const video = videoRef.current
                if (!video) {
                    stop(stream)
                    streamRef.current = null
                    setStatus('failed')
                    return
                }

                video.srcObject = stream
                const playing = await video.play().then(
                    () => true,
                    () => false
                )
                if (!playing) {
                    if (
                        liveRef.current &&
                        pageActiveRef.current &&
                        generation === requestGenerationRef.current &&
                        streamRef.current === stream
                    ) {
                        stopStream()
                        setStatus('failed')
                    }
                    return
                }
                if (
                    liveRef.current &&
                    pageActiveRef.current &&
                    generation === requestGenerationRef.current &&
                    streamRef.current === stream &&
                    video.videoWidth > 0
                )
                    setStatus('ready')
            } catch (error) {
                if (!liveRef.current || !pageActiveRef.current || generation !== requestGenerationRef.current) return
                const name = error instanceof DOMException ? error.name : ''
                setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'blocked' : 'failed')
            }
        }

        const suspend = () => {
            pageActiveRef.current = false
            requestGenerationRef.current++
            requestRef.current = null
            stopStream()
            setStatus('starting')
        }
        const resume = () => {
            if (pageActiveRef.current) return
            pageActiveRef.current = true
            void start()
        }

        pageActiveRef.current = true
        window.addEventListener('pagehide', suspend)
        window.addEventListener('pageshow', resume)
        void start()
        return () => {
            liveRef.current = false
            window.removeEventListener('pagehide', suspend)
            window.removeEventListener('pageshow', resume)
            // React Strict Mode cleans up and immediately re-runs this effect
            // without removing the video. Stop only when the screen genuinely
            // left the DOM; the second run keeps the one in-flight request.
            queueMicrotask(() => {
                if (videoRef.current?.isConnected) return
                pageActiveRef.current = false
                requestGenerationRef.current++
                requestRef.current = null
                stopStream()
            })
        }
    }, [])

    const capture = async () => {
        const video = videoRef.current
        if (!video || status !== 'ready' || capturing || video.videoWidth < 1 || video.videoHeight < 1) return

        setCapturing(true)
        setCaptureError(false)
        try {
            const canvas = document.createElement('canvas')
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            const context = canvas.getContext('2d')
            if (!context) throw new Error('camera frame has no canvas context')
            context.drawImage(video, 0, 0, canvas.width, canvas.height)
            const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
            if (!blob) throw new Error('camera frame could not be encoded')

            feedback('pop', { haptic: 'confirm' })
            onFile(new File([blob], `receipt-${Date.now()}.jpg`, { type: 'image/jpeg' }))
        } catch {
            setCaptureError(true)
            feedback('error', { haptic: 'error' })
        } finally {
            setCapturing(false)
        }
    }

    const statusCopy =
        status === 'starting'
            ? t('cameraStarting')
            : status === 'ready'
              ? t('cameraReady')
              : status === 'blocked'
                ? t('cameraBlocked')
                : status === 'unavailable'
                  ? t('cameraUnavailable')
                  : t('cameraFailed')

    return (
        <div
            data-testid="scan-camera"
            className="relative mx-auto h-dvh w-full max-w-xl overflow-hidden bg-n-1 text-white [--scan-sheet:clamp(11.5rem,29dvh,14rem)] [@media(max-height:30rem)]:[--scan-sheet:6.5rem]"
        >
            <video
                ref={videoRef}
                muted
                playsInline
                autoPlay
                aria-hidden="true"
                onCanPlay={() => {
                    if (pageActiveRef.current && streamRef.current && videoRef.current?.srcObject === streamRef.current)
                        setStatus('ready')
                }}
                className={cn(
                    'absolute inset-0 size-full object-cover transition-opacity duration-200',
                    status === 'ready' ? 'opacity-100' : 'opacity-0'
                )}
            />
            <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-b from-n-1/80 via-transparent to-n-1/70"
            />

            <header
                data-focus-surface="dark"
                className="absolute inset-x-0 top-0 z-2 flex items-start gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))]"
            >
                <CloseButton
                    onClick={onCancel}
                    label={t('cancel')}
                    data-testid="scan-close"
                    className="rounded-sm border border-white/70 bg-n-1/50 text-white backdrop-blur"
                />
                <div className="min-w-0 pt-1">
                    <h2 className="text-h6">{t('cameraTitle')}</h2>
                    <p role="status" aria-live="polite" className="text-xs text-white/80">
                        {statusCopy}
                    </p>
                </div>
            </header>

            <div
                aria-hidden="true"
                data-testid="scan-frame"
                className="pointer-events-none absolute inset-x-10 bottom-[calc(var(--scan-sheet)+4.5rem)] top-28 rounded-lg border border-white/70 [@media(max-height:30rem)]:bottom-[calc(var(--scan-sheet)+1rem)] [@media(max-height:30rem)]:top-20"
            />

            {(status === 'blocked' || status === 'unavailable' || status === 'failed') && (
                <p className="absolute inset-x-8 top-1/2 -translate-y-1/2 text-center text-sm font-bold text-white">
                    {statusCopy}
                </p>
            )}

            <div className="absolute inset-x-6 bottom-[calc(var(--scan-sheet)+1rem)] text-center">
                <p className="text-xs font-bold text-white">{t('framingHint')}</p>
                {captureError && (
                    <p role="alert" className="mt-1 text-xs font-bold text-error-2">
                        {t('captureFailed')}
                    </p>
                )}
            </div>

            <section
                aria-label={t('cameraControls')}
                data-testid="scan-camera-sheet"
                className="absolute inset-x-0 bottom-0 mx-auto flex h-[var(--scan-sheet)] w-full max-w-xl flex-col items-center rounded-t-2xl border border-n-1 bg-background px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-n-1"
            >
                <div
                    aria-hidden="true"
                    className="mb-2 mt-2 h-1.5 w-10 shrink-0 rounded-full bg-n-1 [@media(max-height:30rem)]:hidden"
                />
                <div className="flex flex-col items-center gap-2 [@media(max-height:30rem)]:mt-1 [@media(max-height:30rem)]:flex-row [@media(max-height:30rem)]:gap-3">
                    <button
                        type="button"
                        onClick={capture}
                        disabled={status !== 'ready' || capturing}
                        aria-label={t('takePhoto')}
                        aria-describedby="scan-provider-terms"
                        data-testid="scan-shutter"
                        className="flex size-16 shrink-0 items-center justify-center rounded-full border-2 border-n-1 bg-white transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 [@media(max-height:30rem)]:size-12"
                    >
                        <span
                            aria-hidden="true"
                            className="size-12 rounded-full bg-primary-1 [@media(max-height:30rem)]:size-9"
                        />
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            feedback('blip')
                            uploadRef.current?.click()
                        }}
                        data-testid="scan-upload"
                        aria-describedby="scan-provider-terms"
                        className="flex min-h-11 w-[9.375rem] items-center justify-center gap-2 rounded-sm border border-n-1 bg-white px-4 py-2 text-h8 transition-transform active:translate-x-[2px] active:translate-y-[2px]"
                    >
                        <Icon name="share" size={16} />
                        {t('upload')}
                    </button>
                </div>
                <input
                    ref={uploadRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    data-testid="scan-upload-input"
                    onChange={(event) => {
                        const file = event.target.files?.[0]
                        event.target.value = ''
                        if (file) onFile(file)
                    }}
                />

                <p
                    id="scan-provider-terms"
                    className="mt-auto max-w-xs text-center text-[0.6875rem] leading-4 text-grey-1"
                >
                    {t('termsNote')}
                </p>
            </section>
        </div>
    )
}
