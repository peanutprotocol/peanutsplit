import { splitGuideRoute, splitGuideRouteMetadata, splitGuideRouteStaticParams } from '@/lib/split-content/route'

export const dynamic = 'force-dynamic'
export const dynamicParams = false
export const generateStaticParams = splitGuideRouteStaticParams('en')
export const generateMetadata = splitGuideRouteMetadata('en')
export default splitGuideRoute('en')
