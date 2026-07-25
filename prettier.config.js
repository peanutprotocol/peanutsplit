module.exports = {
	trailingComma: 'es5',
	useTabs: true,
	tabWidth: 4,
	semi: false,
	singleQuote: true,
	printWidth: 120,
	overrides: [{ files: ['*.json', '*.yaml', '*.yml', '*.md'], options: { useTabs: false, tabWidth: 2 } }],
}
