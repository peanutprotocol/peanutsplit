import { Doodle } from './Doodle'

type LoadingProps = {
    className?: string
}

const Loading = ({ className = 'h-4 w-4' }: LoadingProps) => (
    <span className="inline-flex items-center justify-center align-middle" role="status">
        <Doodle name="iconsparkles" className={`animate-spin ${className}`} weight={1.8} />
        <span className="sr-only">Loading...</span>
    </span>
)

export default Loading
