#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..', '..')
const sourcePath = resolve(here, 'expense-subjects.tsv')
const catalogPath = resolve(repo, 'apps/web/src/lib/expense-category-catalog.json')

const categories = [
	{ id: 'food-drink', label: 'Food & drink' },
	{ id: 'transport', label: 'Transport' },
	{ id: 'travel-stays', label: 'Travel & stays' },
	{ id: 'home-bills', label: 'Home & bills' },
	{ id: 'shopping', label: 'Shopping' },
	{ id: 'entertainment-leisure', label: 'Fun & leisure' },
	{ id: 'health-wellness', label: 'Health & wellness' },
	{ id: 'family-education', label: 'Family & education' },
	{ id: 'work-services', label: 'Work & services' },
	{ id: 'tech-connectivity', label: 'Tech & connectivity' },
	{ id: 'money-admin', label: 'Money & admin' },
	{ id: 'gifts-giving', label: 'Gifts & giving' },
	{ id: 'other', label: 'Other' },
]

const legacyCategory = {
	pizza: 'food-drink',
	restaurants: 'food-drink',
	'asian-food': 'food-drink',
	sushi: 'food-drink',
	groceries: 'food-drink',
	'coffee-breakfast': 'food-drink',
	'desserts-snacks': 'food-drink',
	'drinks-nightlife': 'food-drink',
	fuel: 'transport',
	'taxi-rides': 'transport',
	'public-transit': 'transport',
	flights: 'transport',
	'parking-tolls': 'transport',
	'car-hire': 'transport',
	'boats-ferries': 'transport',
	accommodation: 'travel-stays',
	'rent-home': 'home-bills',
	'holidays-trips': 'travel-stays',
	'beach-water': 'travel-stays',
	'outdoors-camping': 'travel-stays',
	'snow-sports': 'travel-stays',
	shopping: 'shopping',
	gifts: 'gifts-giving',
	entertainment: 'entertainment-leisure',
	'music-events': 'entertainment-leisure',
	parties: 'entertainment-leisure',
	'sports-fitness': 'health-wellness',
	pets: 'health-wellness',
	'phone-internet': 'tech-connectivity',
	utilities: 'home-bills',
	health: 'health-wellness',
	pharmacy: 'health-wellness',
	education: 'family-education',
	childcare: 'family-education',
	cash: 'money-admin',
	'banking-fees': 'money-admin',
	'bills-receipts': 'money-admin',
	transfers: 'money-admin',
	charity: 'gifts-giving',
	other: 'other',
}

const normalize = (value) =>
	value
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()

const lines = readFileSync(sourcePath, 'utf8').trim().split('\n')
const header = lines.shift().split('\t')
if (header.join('|') !== 'category|id|label|icon|terms') throw new Error('Unexpected expense subject TSV header')

const expandedSubjects = lines.map((line, index) => {
	const [categoryId, id, label, icon, termsText] = line.split('\t')
	if (!categoryId || !id || !label || !icon || !termsText) throw new Error(`Invalid TSV row ${index + 2}`)
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(icon)) throw new Error(`Invalid icon name on row ${index + 2}: ${icon}`)
	return {
		id,
		label,
		categoryId,
		doodle: `expense_${icon.replaceAll('-', '_')}`,
		terms: termsText.split(';').map((term) => term.trim()),
	}
})

if (expandedSubjects.length !== 300) throw new Error(`Expected 300 expanded subjects, found ${expandedSubjects.length}`)
const expandedTermCount = expandedSubjects.reduce((total, subject) => total + subject.terms.length, 0)
if (expandedTermCount !== 1_000) throw new Error(`Expected 1,000 expanded terms, found ${expandedTermCount}`)

const previous = JSON.parse(readFileSync(catalogPath, 'utf8'))
const previousSubjects = Array.isArray(previous) ? previous : previous.subjects
const legacySubjects = previousSubjects
	.filter((subject) => !subject.doodle.startsWith('expense_'))
	.map(({ group: _group, categoryId: _categoryId, ...subject }) => ({
		...subject,
		categoryId: legacyCategory[subject.id],
	}))

if (legacySubjects.length !== 40 || legacySubjects.some((subject) => !subject.categoryId)) {
	throw new Error('Could not recover the 40 original expense subjects')
}

const subjects = [...legacySubjects, ...expandedSubjects]
const categoryIds = new Set(categories.map((category) => category.id))
const subjectIds = new Set()
const doodles = new Set()
const terms = new Map()
const termCollisions = []

for (const subject of subjects) {
	if (!categoryIds.has(subject.categoryId)) throw new Error(`Unknown category ${subject.categoryId} on ${subject.id}`)
	if (subjectIds.has(subject.id)) throw new Error(`Duplicate subject id: ${subject.id}`)
	if (doodles.has(subject.doodle)) throw new Error(`Duplicate subject doodle: ${subject.doodle}`)
	subjectIds.add(subject.id)
	doodles.add(subject.doodle)

	for (const term of subject.terms) {
		const normalized = normalize(term)
		const previousOwner = terms.get(normalized)
		if (!normalized) {
			termCollisions.push(`empty term on ${subject.id}`)
		} else if (previousOwner) {
			termCollisions.push(`“${term}” on ${subject.id}; already owned by ${previousOwner}`)
		} else {
			terms.set(normalized, subject.id)
		}
	}
}

if (termCollisions.length) {
	throw new Error(`Expense term collisions (${termCollisions.length}):\n${termCollisions.join('\n')}`)
}

if (subjects.length !== 340 || terms.size !== 2_000) {
	throw new Error(`Expected 340 subjects and 2,000 terms; found ${subjects.length} subjects and ${terms.size} terms`)
}

writeFileSync(catalogPath, `${JSON.stringify({ categories, subjects }, null, 4)}\n`)
console.log(
	`wrote ${catalogPath}: ${categories.length} categories, ${subjects.length} subjects, ${terms.size} unique terms`
)
