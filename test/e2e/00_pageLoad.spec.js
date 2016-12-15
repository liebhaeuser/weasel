const {registerTestServerHooks, getE2ETestBaseUrl, getBeacons} = require('../server/controls');
const {registerBaseHooks, getCapabilities} = require('./base');
const util = require('../util');

const cexpect = require('chai').expect;

describe('00_pageLoad', () => {
  registerTestServerHooks();
  registerBaseHooks();

  let start;

  beforeEach(() => {
    start = Date.now();
  });

  describe('00_pageLoad', () => {
    beforeEach(() => {
      browser.get(getE2ETestBaseUrl('00_pageLoad'));
    });

    it('must send pageLoad beacon', () => {
      return util.retry(() => {
        return getBeacons()
          .then(beacons => {
            cexpect(beacons).to.have.lengthOf(1);
          });
      });
    });

    it('must include basic page load information', () => {
      return util.retry(() => {
        return getBeacons()
          .then(([beacon]) => {
            cexpect(beacon.t).to.match(/[0-9a-f]{16}/i);

            // We cannot compare with start time due to saucelabs platforms not having
            // NTP properly configured…
            cexpect(beacon.r.length).to.be.at.least(String(start).length);
            cexpect(beacon.ts.length).to.be.below(6);
            cexpect(beacon.d.length).to.be.below(6);
            cexpect(beacon.k).to.equal(undefined);
            cexpect(beacon.bt).to.equal(undefined);
          });
      });
    });
  });

  describe('00_meta', () => {
    beforeEach(() => {
      browser.get(getE2ETestBaseUrl('00_meta'));
    });

    it('must send simple meta data information', () => {
      return util.retry(() => {
        return getBeacons()
          .then(([beacon]) => {

            cexpect(beacon['m_user']).to.equal('tom.mason@example.com');
          });
      });
    });
  });

  describe('00_multiComplicatedMeta', () => {
    beforeEach(() => {
      browser.get(getE2ETestBaseUrl('00_multiComplicatedMeta'));
    });

    it('must send complicated meta data information', () => {
      return util.retry(() => {
        return getBeacons()
          .then(([beacon]) => {
            cexpect(beacon['m_user']).to.equal('tom.mason@example.com');
            cexpect(beacon['m_No&way']).to.equal('Ifyou\nHaveTo&DoThis');
          });
      });
    });
  });

  describe('00_apiKey', () => {
    beforeEach(() => {
      browser.get(getE2ETestBaseUrl('00_apiKey'));
    });

    it('must send user provided API key', () => {
      return util.retry(() => {
        return getBeacons()
          .then(([beacon]) => cexpect(beacon.k).to.equal('myFancyApiKey'));
      });
    });
  });

  describe('00_backendTraceId', () => {
    beforeEach(() => {
      browser.get(getE2ETestBaseUrl('00_backendTraceId'));
    });

    it('must send user provided backend trace ID', () => {
      return util.retry(() => {
        return getBeacons()
          .then(([beacon]) => cexpect(beacon.bt).to.equal('someBackendTraceId'));
      });
    });
  });

  // TODO test navigation timings

  describe('00_resourceTimings', () => {
    beforeEach(() => {
      browser.get(getE2ETestBaseUrl('00_resourceTimings'));
    });

    it('must send resource timing data', () => {
      return getCapabilities().then(capabilities => {
        if (!hasResourceTimingSupport(capabilities)) {
          return true;
        }

        const hasLevel3Support = hasEnhancedResourceTimingLevel3Support(capabilities);

        return util.retry(() => {
          return getBeacons()
            .then(([beacon]) => {
              const timings = JSON.parse(beacon.res);
              replaceTimingValuesWithNumberOfValues(timings);
              cexpect(timings).to.deep.equal({
                http: {
                  's://': {
                    'maxcdn.bootstrapcdn.com/bootstrap/3.3.7/': {
                      'css/bootstrap': {
                        '.min.css': [3],
                        '-theme.min.css': [3]
                      },
                      'js/bootstrap.min.js': [3]
                    },
                    'cdnjs.cloudflare.com/ajax/libs/jquery/3.1.1/jquery.min.js': [3]
                  },
                  '://127.0.0.1:8000/': {
                    'e2e/initializer.js': [hasLevel3Support ? 5 : 3],
                    'target/weasel.min.js': [hasLevel3Support ? 5 : 3]
                  }
                }
              }, `Got the following timing: ${JSON.stringify(JSON.parse(beacon.res), 0, 2)}.`);
            });
        });
      });
    });

    function replaceTimingValuesWithNumberOfValues(node) {
      if (node instanceof Array) {
        node.forEach((entry, i) => node[i] = entry.split(',').length);
        return;
      }

      Object.keys(node).forEach(key => replaceTimingValuesWithNumberOfValues(node[key]));
    }

    function hasResourceTimingSupport(capabilities) {
      const version = Number(capabilities.version);
      return (capabilities.browserName !== 'internet explorer' && capabilities.browserName !== 'safari') ||
        (capabilities.browserName === 'internet explorer' && version >= 10);
    }

    function hasEnhancedResourceTimingLevel3Support(capabilities) {
      return hasResourceTimingSupport(capabilities) && capabilities.browserName !== 'internet explorer';

    }
  });
});
