import { twMerge } from 'tailwind-merge'

type DividerProps = {
    text?: string
    dividerClassname?: HTMLElement['className']
    textClassname?: HTMLElement['className']
} & React.HTMLAttributes<HTMLDivElement>

const Divider = ({ text, className, dividerClassname, textClassname, ...props }: DividerProps) => {
    return (
        <div className={twMerge('flex w-full items-center justify-center py-2', className)} {...props}>
            <span className={twMerge('h-0.25 w-full bg-n-1', dividerClassname)}></span>
            {text && <span className={twMerge('mx-4 text-sm font-medium', textClassname)}>{text}</span>}
            <span className={twMerge('h-0.25 w-full bg-n-1', dividerClassname)}></span>
        </div>
    )
}

Divider.displayName = 'Divider'

export { Divider }
export default Divider
