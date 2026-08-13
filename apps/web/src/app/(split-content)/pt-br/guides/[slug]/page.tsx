import { splitGuideRoute, splitGuideRouteMetadata, splitGuideRouteStaticParams } from '@/lib/split-content/route'

export const dynamic = 'force-dynamic'
export const dynamicParams = false
export const generateStaticParams = splitGuideRouteStaticParams('pt-br')
export const generateMetadata = splitGuideRouteMetadata('pt-br')
export default splitGuideRoute('pt-br')
