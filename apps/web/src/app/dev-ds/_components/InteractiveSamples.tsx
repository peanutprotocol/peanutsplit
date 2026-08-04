'use client'

import { useState } from 'react'
import { BaseInput } from '@/components/ui/BaseInput'
import { Button } from '@/components/ui/Button'
import { CloseButton } from '@/components/ui/CloseButton'
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from '@/components/ui/Drawer'
import { DrawerActions, DrawerBody, drawerContentClass, drawerHeaderClass } from '@/components/ui/DrawerLayout'
import { SettingRow } from '@/components/ui/SettingRow'
import { SettingToggle } from '@/components/ui/SettingToggle'
import { SlideToConfirm } from '@/components/ui/SlideToConfirm'

export function ButtonSamples() {
    return (
        <div className="grid gap-3 sm:grid-cols-2">
            <Button shadowSize="4">Primary action</Button>
            <Button variant="dark">Dark action</Button>
            <Button variant="stroke">Secondary action</Button>
            <Button variant="transparent-dark">Quiet action</Button>
            <Button icon="plus" shadowSize="4">
                With icon
            </Button>
            <Button disabled>Unavailable</Button>
        </div>
    )
}

export function FieldSamples() {
    return (
        <div className="space-y-4">
            <label className="block">
                <span className="mb-2 block text-h8">Standard field · 64px</span>
                <BaseInput placeholder="Room name" aria-label="Standard field example" />
            </label>
            <label className="block">
                <span className="mb-2 block text-h8">Compact field · 48px</span>
                <BaseInput variant="sm" defaultValue="EUR" aria-label="Compact field example" />
            </label>
            <label className="block">
                <span className="mb-2 block text-h8">Hero field · 80px</span>
                <BaseInput variant="lg" inputMode="decimal" placeholder="0.00" aria-label="Hero field example" />
            </label>
        </div>
    )
}

export function SettingSamples() {
    const [sound, setSound] = useState(true)
    const [animations, setAnimations] = useState(false)
    return (
        <div className="space-y-3">
            <SettingRow label="Theme" value="Classic" onClick={() => {}} testId="ds-theme-row" />
            <SettingToggle label="Sound" checked={sound} onChange={setSound} testId="ds-sound-toggle" />
            <SettingToggle
                label="Animations"
                hint="Respect the room, the OS and this switch."
                checked={animations}
                onChange={setAnimations}
                testId="ds-animation-toggle"
            />
        </div>
    )
}

export function DrawerSample() {
    return (
        <Drawer>
            <DrawerTrigger asChild>
                <Button variant="stroke" icon="settings">
                    Open canonical sheet
                </Button>
            </DrawerTrigger>
            <DrawerContent className={drawerContentClass}>
                <DrawerHeader className={drawerHeaderClass}>
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <DrawerTitle>One scroll owner</DrawerTitle>
                            <DrawerDescription>Header, body and actions follow one shared geometry.</DrawerDescription>
                        </div>
                        <DrawerClose asChild>
                            <CloseButton label="Close design-system example" />
                        </DrawerClose>
                    </div>
                </DrawerHeader>
                <DrawerBody>
                    <div className="rounded-sm border border-n-1 bg-white p-4">
                        <p className="text-h7">Sheet section</p>
                        <p className="mt-1 text-sm text-grey-1">
                            Use a sheet for contextual editing. Keep destructive confirmation as its own deliberate
                            step.
                        </p>
                    </div>
                    <DrawerActions>
                        <DrawerClose asChild>
                            <Button>Done</Button>
                        </DrawerClose>
                        <DrawerClose asChild>
                            <Button variant="stroke">Cancel</Button>
                        </DrawerClose>
                    </DrawerActions>
                </DrawerBody>
            </DrawerContent>
        </Drawer>
    )
}

export function DestructiveSample() {
    return <SlideToConfirm label="Slide to remove" onConfirm={() => false} />
}
