import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const project = process.argv[2]
const knownProjects = ['mobile', 'desktop']

if (!knownProjects.includes(project)) {
    console.error(`Expected one browser shard project (${knownProjects.join(' or ')}), got ${project ?? 'nothing'}`)
    process.exit(1)
}

const root = resolve(import.meta.dirname, '..')
const result = spawnSync('pnpm', ['exec', 'playwright', 'test', '--list', `--project=${project}`], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, CI: 'true' },
})

const output = result.stdout ?? ''
const diagnostics = result.stderr ?? ''
const fail = (message) => {
    process.stdout.write(output)
    process.stderr.write(diagnostics)
    console.error(message)
    process.exit(1)
}

if (result.error) fail(`Could not list the ${project} browser shard: ${result.error.message}`)
if (result.status !== 0) fail(`Playwright could not list the ${project} browser shard`)

const listedProjects = [...output.matchAll(/^\s+\[([^\]]+)] › /gm)].map((match) => match[1])
const summary = output.match(/^Total: (\d+) tests in (\d+) files$/m)
const foreignProjects = [...new Set(listedProjects.filter((listed) => listed !== project))]

if (!summary || listedProjects.length === 0) fail(`The ${project} browser shard selected no tests`)
if (foreignProjects.length > 0) fail(`The ${project} browser shard also selected: ${foreignProjects.join(', ')}`)
if (Number(summary[1]) !== listedProjects.length)
    fail(`Playwright reported ${summary[1]} tests but listed ${listedProjects.length}`)

console.log(`Validated ${project} browser shard: ${summary[1]} tests in ${summary[2]} files`)
