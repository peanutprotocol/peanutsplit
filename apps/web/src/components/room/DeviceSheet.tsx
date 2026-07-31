'use client'

import { useTranslations } from 'next-intl'
import { InstallRow } from '@/components/pwa/InstallRow'
import { CloseButton } from '@/components/ui/CloseButton'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerBody, drawerContentClass, drawerHeaderClass } from '@/components/ui/DrawerLayout'
import { LocaleSwitcher } from '@/components/ui/LocaleSwitcher'
import { SettingToggle } from '@/components/ui/SettingToggle'
import { cn } from '@/lib/cn'
import { triggerHaptic, useSettings } from '@/lib/use-settings'

/**
 * The four preferences that really are per-device: sound, haptics, animations,
 * language. Installing joins them at the top, for the same reason: an app is on
 * this phone or it is not.
 *
 * The row that opens this used to be called "This device" while notifications
 * and identity — both per room — sat under it. Those moved into the room card,
 * so the label is now true. Keep it that way.
 *
 * No hint lines. Every toggle demonstrates itself on the flip: sound plays the
 * tick, haptics pulses, animations springs, and the language switch reloads the
 * page you are reading.
 */
export function DeviceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
    const t = useTranslations('room.header')
    const tSettings = useTranslations('settings')
    const tLocale = useTranslations('locale')
    const { settings, setSoundEnabled, setHapticsEnabled, setAnimationsEnabled } = useSettings()

    return (
        <Drawer open={open} onOpenChange={(next) => !next && onClose()}>
            <DrawerContent className={drawerContentClass} data-testid="device-sheet">
                <DrawerHeader className={cn(drawerHeaderClass, 'flex flex-row items-end justify-between')}>
                    <DrawerTitle className="text-h5">{t('device')}</DrawerTitle>
                    <CloseButton onClick={onClose} label={t('closeSheet')} data-testid="close-device-sheet" />
                </DrawerHeader>
                <DrawerBody>
                    {/* Installing is per device by construction, so the sheet's label stays true. */}
                    <InstallRow />
                    <div className="flex flex-col gap-2">
                        <SettingToggle
                            label={t('sound')}
                            testId="setting-sound"
                            checked={settings.soundEnabled}
                            onChange={setSoundEnabled}
                        />
                        <SettingToggle
                            label={t('haptics')}
                            testId="setting-haptics"
                            checked={settings.hapticsEnabled}
                            onChange={(next) => {
                                setHapticsEnabled(next)
                                if (next) triggerHaptic(16)
                            }}
                        />
                        <SettingToggle
                            label={tSettings('animations.title')}
                            testId="setting-animations"
                            checked={settings.animationsEnabled}
                            onChange={setAnimationsEnabled}
                        />
                    </div>
                    <LocaleSwitcher label={tLocale('label')} />
                </DrawerBody>
            </DrawerContent>
        </Drawer>
    )
}
