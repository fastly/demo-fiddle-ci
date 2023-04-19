const testService = require('./fiddle-mocha');

testService('Service: <http://elastic-dev.co|elastic-dev.co>', {
  spec: {
    type: "vcl",
    origins: ["https://elastic-dev.co"],
    src: {},
    srcVersion: 1,
    requests: [
      {
        "enableCluster": true,
        "enableShield": false,
        "enableWAF": false,
        "method": "GET",
        "path": "/",
        "headers": "authorization: Basic ZWxhc3RpYzpkMTQzMThiYTY5YTI5NTI2",
        "useFreshCache": false,
        "followRedirects": false,
        "tests": "",
        "delay": 0
      }
    ]
  },
  scenarios: [
    {
      name: 'Basic request',
      requests: [
        {
          path: "/",
          headers: "authorization: Basic ZWxhc3RpYzpkMTQzMThiYTY5YTI5NTI2",
          tests: [
            'clientFetch.status is 200'
          ]
        }
      ]
    }
  ]
})
