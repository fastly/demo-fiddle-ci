/* global describe, before, it */

const FiddleClient = require('./fiddle-client');
const Mocha = require('mocha');
const AssertionError = require('assertion-error');

module.exports = function (name, data) {

	// Create a testing scope for each Fastly service under test
	describe(name, function () {

		this.timeout(60000);

		let fiddle;

		// Push the VCL for this service and get a fiddle ID
		// This will sync the VCL to the edge network, which takes 10-20 seconds
		before(async () => {
			fiddle = await FiddleClient.publish(data.spec);
			await FiddleClient.execute(fiddle); // Make sure the VCL is pushed to the edge
		});

		// Distinct features of the service logic will likely be tested with different
		// sets of requests, and corresponding tests.  A describe() block creates a
		// scope in which we can execute the fiddle with a specific set of requests and
		// assert against the result data
		for (const s of data.scenarios) {
			describe(s.name, function() {

				// Mocha needs to discover at least one test synchronously otherwise the
				// before() function won't run
				it('has some tests', () => true);

				// Execute the fiddle and wait for the test results to be available
				before(async () => {
          this.tests = []; // Remove the sacrificial test from the outer suite
					const result = await FiddleClient.execute({ ...fiddle, requests: s.requests}, { waitFor: 'tests' });

					// Within the results, create a test case in mocha for each test case
					// that has been executed remotely, so we can report the result
					for (const req of Object.values(result.clientFetches)) {
						if (!req.tests) throw new Error('No test results provided');

						// Organise each request into a suite (use the request line as the suite name)
						const suite = new Mocha.Suite(req.req.split('\n')[0]);
						for (const t of req.tests) {

							// Create an individual test for each test that applies to this request
							suite.addTest(new Mocha.Test(t.testExpr, function() {
								if (!t.pass) {
									const e = new AssertionError(t.detail , { actual: t.actual, expected: t.expected, showDiff: true });
									throw e;
								}
							}));
						}
						this.addSuite(suite);
					}
				});
			});
		}
	});
};
