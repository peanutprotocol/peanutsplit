import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const project = process.argv[2]
const shard = process.argv[3]
const knownProjects = ['mobile', 'desktop']
const knownShards = ['1/2', '2/2']

if (!knownProjects.includes(project)) {
    console.error(`Expected one browser shard project (${knownProjects.join(' or ')}), got ${project ?? 'nothing'}`)
    process.exit(1)
}
if (!knownShards.includes(shard)) {
    console.error(`Expected one browser shard (${knownShards.join(' or ')}), got ${shard ?? 'nothing'}`)
    process.exit(1)
}

const root = resolve(import.meta.dirname, '..')
const fail = (message, result) => {
    process.stdout.write(result?.stdout ?? '')
    process.stderr.write(result?.stderr ?? '')
    console.error(message)
    process.exit(1)
}

const list = (selectedShard) => {
    const args = ['exec', 'playwright', 'test', '--list', `--project=${project}`]
    if (selectedShard) args.push(`--shard=${selectedShard}`)
    const result = spawnSync('pnpm', args, {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, CI: 'true' },
    })

    if (result.error) fail(`Could not list ${project} ${selectedShard ?? 'unsharded'}: ${result.error.message}`, result)
    if (result.status !== 0) fail(`Playwright could not list ${project} ${selectedShard ?? 'unsharded'}`, result)

    const tests = [...result.stdout.matchAll(/^\s+\[([^\]]+)] › (.+)$/gm)].map((match) => ({
        project: match[1],
        identity: match[2],
    }))
    const summary = result.stdout.match(/^Total: (\d+) tests in (\d+) files$/m)
    const foreignProjects = [...new Set(tests.filter((test) => test.project !== project).map((test) => test.project))]

    if (!summary || tests.length === 0) fail(`${project} ${selectedShard ?? 'unsharded'} selected no tests`, result)
    if (foreignProjects.length > 0)
        fail(`${project} ${selectedShard ?? 'unsharded'} also selected: ${foreignProjects.join(', ')}`, result)
    if (Number(summary[1]) !== tests.length)
        fail(`Playwright reported ${summary[1]} tests but listed ${tests.length}`, result)

    return { tests: new Set(tests.map((test) => test.identity)), count: tests.length, files: Number(summary[2]) }
}

const full = list()
const halves = knownShards.map(list)
const overlap = [...halves[0].tests].filter((test) => halves[1].tests.has(test))
const combined = new Set(halves.flatMap((half) => [...half.tests]))
const missing = [...full.tests].filter((test) => !combined.has(test))
const extra = [...combined].filter((test) => !full.tests.has(test))

if (overlap.length > 0) fail(`${project} shards overlap on ${overlap.length} tests`)
if (missing.length > 0) fail(`${project} shards omit ${missing.length} tests`)
if (extra.length > 0) fail(`${project} shards add ${extra.length} tests`)

const selected = halves[knownShards.indexOf(shard)]
console.log(
    `Validated ${project} ${shard}: ${selected.count} tests in ${selected.files} files; ` +
        `both shards partition all ${full.count} tests`
)
