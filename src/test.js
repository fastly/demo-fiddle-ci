const testService = require('./fiddle-mocha');

testService('Service: example.com', {
	spec: {
		origins: ["https://httpbin.org"],
		vcl: {
			recv: `set req.url = querystring.sort(req.url);\nif (req.url.path == "/robots.txt") {\nerror 601;\n}`,
			error: `if (obj.status == 601) {\nset obj.status = 200;\nset obj.response = "OK";synthetic "User-agent: BadBot" LF "Disallow: /";\nreturn(deliver);\n}`
		}
	},
	scenarios: [
		{
			name: 'Request normalisation',
			requests: [
				{
					path: "/?bbb=test&eee=e2&eee=e1&&&ddd=test&aaa=test&ccc=test",
					tests: [
						'clientFetch.status is 200',
						'events.where(fnName=recv).count() is 1',
						'events.where(fnName=recv)[0].url is "/?aaa=test&bbb=test&ccc=test&ddd=test&eee=e1&eee=e2"',
						//'clientFetch.bodyPreview is "hello"'
					]
				}
			]
		}, {
			name: "Robots.txt synthetic",
			requests: [
				{
					path: "/robots.txt",
					tests: [
						'clientFetch.status is 200',
						'clientFetch.resp includes "content-length: 30"',
						'clientFetch.bodyPreview includes "BadBot"',
						'originFetches.count() is 0'
					]
				}, {
					path: "/ROBOTS.txt",
					tests: [
						'clientFetch.status is 404'
					]
				}
			]
		}, {
			name: "Caching",
			requests: [
				{
					path: "/html",
					tests: [
						'originFetches.count() is 1',
						'events.where(fnName=fetch)[0].ttl isAtLeast 3600',
						'clientFetch.status is 200'
					]
				}, {
					path: "/html",
					tests: [
						'originFetches.count() is 0',
						'events.where(fnName=hit).count() is 1',
						'clientFetch.status is 200'
					]
				}
			]
		}
	]
});


