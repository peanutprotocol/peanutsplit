type LoadingProps = {
	className?: string
}

const Loading = ({ className = 'h-4 w-4' }: LoadingProps) => (
	<div
		className={`text-surface inline-block aspect-square animate-spin rounded-full border-2 border-solid border-current border-e-transparent align-middle ${className}`}
		role="status"
	>
		<span className="sr-only">Loading...</span>
	</div>
)

export default Loading
