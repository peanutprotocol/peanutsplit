import { twMerge } from 'tailwind-merge'

const Title = ({
    text,
    className,
    offset = true,
}: {
    text: string
    offset?: boolean
} & React.HTMLAttributes<HTMLParagraphElement>) => {
    return (
        <div className="relative inline-block">
            <p className={twMerge('relative font-knerd-filled text-white', offset && 'translate-x-[3px]', className)}>
                {text}
            </p>
            <p className={twMerge('absolute left-0 top-0 font-knerd-outline', className)}>{text}</p>
        </div>
    )
}

Title.displayName = 'Title'

export { Title }
export default Title
