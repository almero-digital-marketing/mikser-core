export default async ({ options }) => ({
	plugins: [
		'documents',
		'front-matter',
		'yaml',
		'layouts',
		'assets',
		'render-hbs',
		'render-href',
		'render-resource',
		'render-markdown',
		'render-asset',
	],
})
