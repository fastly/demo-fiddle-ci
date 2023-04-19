const fetch = require('node-fetch');

const base = "https://fiddle.fastly.dev";

/**
 * Get a fiddle
 *
 * @param {string} fiddleID The ID of the fiddle to load
 * @return {object} A fiddle-shaped object structure
 */
exports.get = async (fiddleID) => {
	const url = base + '/fiddle/' + fiddleID;
  const respData = await fetchJSON(url, {
		method: 'GET',
		headers: { 'Accept': 'application/json' }
	});
	console.log(url, respData);
	return respData.fiddle;
};

/**
 * Publish a fiddle
 *
 * Creates a new fiddle if no ID is provided, otherwise
 * overwrites the fiddle with the ID specified in the
 * fiddle data.
 *
 * @param {object} fiddle Fiddle-shaped object
 * @return {object} Normalised fiddle object (with defaults added)
 */
exports.publish = async (fiddle) => {

	// Create the fiddle and get an identifier for it
	const url = fiddle.id ? base + '/fiddle/' + fiddle.id  : base + '/fiddle';
	const method = fiddle.id ? 'PUT' : 'POST';
	console.log('- Publishing VCL to fiddle', url, method);
	const respData = await fetchJSON(url, {
		method,
		headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
		body: JSON.stringify(fiddle)
	});
	console.log(url, respData);
	return respData.fiddle;
};

/**
 * Clone a fiddle to a new ID
 *
 * @param {string} fiddleID ID of fiddle to clone
 * @return {object} Normalised fiddle object for new fiddle
 */
exports.clone = async (fiddleID) => {
  const fiddleDef = await exports.get(fiddleID);
  fiddleDef.id = null;
  return await exports.publish(fiddleDef);
};

/**
 * Execute a fiddle
 *
 * Fiddles execute asyncronously and collect an unbounded amount
 * of data, so the promised result object will be resolved when
 * the result conditions are met or the time out occurs.
 *
 * @param {object | string} fiddleOrID Fiddle-shaped object or Fiddle ID
 * @param {object} options
 * @param {function} options.resultCondition Custom result condition function, takes a resultData and must return a boolean.  Will be called each time the result data changes, and should return true when the data is sufficient to consider the execution complete.
 * @param {integer} options.cacheID Identifier for cache ID to use for the request. To access the same cache across multiple executions, the cache ID must remain the same.
 * @param {array} options.waitFor List of tags of predefined result conditions to require in addition to `resultCondition`.  The only tag currently available is 'tests', which is satisfied when the resultData contains test results.
 * @param {number} options.minWait Minimum amount of time to wait for results before considering resolving the execution promise.
 * @param {number} options.maxWait Maximum amount of time to wait for results before resolving the execution promise.
 * @return {object} Normalised fiddle object (with defaults added)
 */

exports.execute = async (fiddleOrID, options) => {

	// If the param is a full fiddle, publish it first
	const fiddleID = (typeof fiddleOrID === 'object') ? (await exports.publish(fiddleOrID)).id : fiddleOrID;

	// Get the full normalised fiddle
	const fiddle = await exports.get(fiddleID);

	options = {
		resultCondition: null,
		cacheID: Math.round(Math.random() * 100000),
		waitFor: [],
    maxWait: 25000,
    minWait: 2000,
		...(options || {})
	};

	const resultConditions = [];
	if (options.resultCondition) resultConditions.push(options.resultCondition);
	if (options.waitFor.includes('tests')) {
		resultConditions.push(rData => (
			rData.clientFetches &&
			Object.values(rData.clientFetches).filter(fetch => Boolean(fetch.tests)).length === fiddle.requests.filter(req => Boolean(req.tests)).length
		));
	}

	// Execute it - this returns an execution session ID
	console.log('- Executing the fiddle ' + fiddleID);
	const execSession = await fetchJSON(base + '/fiddle/' + fiddleID + '/execute?cacheID=' + options.cacheID, {
		method: 'POST',
		headers: { 'Accept': 'application/json' }
	});

	// Subscribe to the execution session and await the response
	const streamUrl = base + '/results/' + execSession.sessionID + '/stream';
	console.log('- Subscribing to result stream ' + streamUrl);
	const sessionResp = await fetch(streamUrl, { headers: { accept: 'text/event-stream' } });

	const resultReport = await new Promise(resolve => {
    const startTime = Date.now();
		let dataBuffer = Buffer.from('');
		let latestResult = null;
    let maxTimer, minTimer;

		function finalise() {
      const elapsed = Date.now() - startTime;
      if (elapsed > options.minWait && latestResult && (resultConditions.every(fn => fn(latestResult)) || elapsed > options.maxWait)) {
        sessionResp.body.removeAllListeners('data');
        clearTimeout(minTimer);
        clearTimeout(maxTimer);
        resolve(latestResult);
      }
		}
    minTimer = setTimeout(finalise, options.minWait);
    maxTimer = setTimeout(finalise, options.maxWait);

		sessionResp.body.on('data', chunk => {
			dataBuffer = Buffer.concat([dataBuffer, chunk]);
			let eventDelimPos = -1;
			do {
				eventDelimPos = dataBuffer.indexOf('\n\n', 0, 'utf-8');
				if (eventDelimPos !== -1) {
					const event = dataBuffer
						.slice(0, eventDelimPos)
						.toString('utf-8')
						.split(/\n+/)
						.reduce((out, line) => {
							const m = line.match(/^([^:]+):\s*(.+?)$/);
							return m ? Object.assign({}, out, {[m[1]]: m[2]}) : out;
						}, {})
					;
					dataBuffer = dataBuffer.slice(eventDelimPos+2);
					if (event.event === 'waitingForSync') {
						console.log('- Syncing config to edge...');
					} else if (event.event === 'updateResult') {
						console.log('- Result update...');
						latestResult = JSON.parse(event.data);
            finalise();
					}
				}
			} while (eventDelimPos !== -1);
		});
	});
	return resultReport;
};

const fetchJSON = async (url, opts) => {
  try {
    const resp = await fetch(url, opts);
    if (resp.headers.has("content-type") && resp.headers.get("content-type").startsWith("application/json")) {
      return resp.json();
    } else {
      return null;
    }
  } catch (e) {
    console.log(e);
  }
};
