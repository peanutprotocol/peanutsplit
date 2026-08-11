import { splitGuideRoute, splitGuideRouteMetadata, splitGuideRouteStaticParams } from '@/lib/split-content/route'

export const dynamic = 'force-dynamic'
export const dynamicParams = false
export const generateStaticParams = splitGuideRouteStaticParams('es-419')
export const generateMetadata = splitGuideRouteMetadata('es-419')
export default splitGuideRoute('es-419')
