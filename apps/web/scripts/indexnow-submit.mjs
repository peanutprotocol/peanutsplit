// Submit published URLs to IndexNow (Bing, Naver, Seznam, Yandex — Google does not read it).
//
// Run this from a dev machine or CI after a publish batch. It can NOT run in the app or on
// deploy: the production containers have no egress, so the POST would never leave the box.
//
//   node scripts/indexnow-submit.mjs                                  # every URL in the live sitemap
//   node scripts/indexnow-submit.mjs https://peanutsplit.com/blog/x   # only the URLs you name
//
// The key is public by design — the protocol verifies ownership by fetching /<key>.txt from the
// host, so committing it here is fine. Deliberately not wired into deploy (SEO-ISSUES item 2):
// when to ping is a per-batch decision.

const HOST = 'peanutsplit.com'
const KEY = '19252153f4936f5ddf935132a19a8cd7'
const ENDPOINT = 'https://api.indexnow.org/indexnow'

async function urlsFromSitemap() {
    const res = await fetch(`https://${HOST}/sitemap.xml`)
    if (!res.ok) throw new Error(`sitemap fetch failed: ${res.status}`)
    const xml = await res.text()
    return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim())
}

const args = process.argv.slice(2)
const urlList = args.length > 0 ? args : await urlsFromSitemap()

const foreign = urlList.filter((url) => new URL(url).hostname !== HOST)
if (foreign.length > 0) throw new Error(`IndexNow accepts only ${HOST} URLs, got: ${foreign.join(' ')}`)
if (urlList.length === 0) throw new Error('no URLs to submit')

const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
        host: HOST,
        key: KEY,
        keyLocation: `https://${HOST}/${KEY}.txt`,
        urlList,
    }),
})

// 200 = accepted; 202 = accepted, key validation still pending. Both are success.
if (res.status !== 200 && res.status !== 202) {
    throw new Error(`IndexNow responded ${res.status}: ${await res.text()}`)
}
console.log(`submitted ${urlList.length} URLs (HTTP ${res.status})`)
