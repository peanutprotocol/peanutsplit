import { GoogleAdsTag } from '@/components/analytics/GoogleAdsTag'

/**
 * The marketing surface: the landing page, the blog, the alternative and country pages, the
 * tools and the template links. Every page an ad can send someone to lives under here, which is
 * why the Google Ads tag is mounted at this boundary and not at the app root — the room the
 * click eventually creates is private, and its URL is a credential.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            {children}
            <GoogleAdsTag />
        </>
    )
}
