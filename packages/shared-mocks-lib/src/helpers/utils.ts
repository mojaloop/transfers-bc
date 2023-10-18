/*****
 License
 --------------
 Copyright © 2017 Bill & Melinda Gates Foundation
 The Mojaloop files are made available by the Bill & Melinda Gates Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list (alphabetical ordering) of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Gates Foundation organization for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Gates Foundation
 - Name Surname <name.surname@gatesfoundation.com>

 * Arg Software
 - José Antunes <jose.antunes@arg.software>
 - Rui Rocha <rui.rocha@arg.software>

 --------------
 ******/

 "use strict";
 
const mocks = new Map();

export function mockProperty<T extends {}, K extends keyof any>(object: T, property: K, value: any) {
  const descriptor = Object.getOwnPropertyDescriptor(object, property);
  const mocksForThisObject = mocks.get(object) || {};
  mocksForThisObject[property] = descriptor;
  mocks.set(object, mocksForThisObject);
  Object.defineProperty(object, property, {
      get: value,
      configurable: true,
  });

}

export function undoMockProperty<T extends {}, K extends keyof T>(object: T, property: K) {
  Object.defineProperty(object, property, mocks.get(object)[property]);
}

const globalObj = typeof window === "undefined" ? global : window;

// Currently this fn only supports jest timers, but it could support other test runners in the future.
function runWithRealTimers(callback: () => any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const usingJestFakeTimers =
    // eslint-disable-next-line no-underscore-dangle
    (globalObj.setTimeout as any)._isMockFunction && // eslint-disable-line @typescript-eslint/no-explicit-any

    typeof jest !== "undefined";

  if (usingJestFakeTimers) {
    jest.useRealTimers();
  }

  const callbackReturnValue = callback();

  if (usingJestFakeTimers) {
    jest.useFakeTimers();
  }

  return callbackReturnValue;
}

export function getSetTimeoutFn() {
  return runWithRealTimers(() => globalObj.setTimeout);
}
const defaults = {
  timeout: 10000,
  interval: 50
};

/**
 * Waits for the expectation to pass and returns a Promise
 *
 * @param  expectation  Function  Expectation that has to complete without throwing
 * @param  timeout  Number  Maximum wait interval, 4500ms by default
 * @param  interval  Number  Wait-between-retries interval, 50ms by default
 * @return  Promise  Promise to return a callback result
 */
const waitForExpect = function waitForExpect(
  expectation: () => void | Promise<void>,
  timeout = defaults.timeout,
  interval = defaults.interval
) {
  const setTimeout = getSetTimeoutFn();

  // eslint-disable-next-line no-param-reassign
  if (interval < 1) interval = 1;
  const maxTries = Math.ceil(timeout / interval);
  let tries = 0;
  return new Promise<void>((resolve, reject) => {
    const rejectOrRerun = (error: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any

      if (tries > maxTries) {
        reject(error);
        return;
      }
      // eslint-disable-next-line no-use-before-define
      setTimeout(runExpectation, interval);
    };
    function runExpectation() {
      tries += 1;
      try {
        Promise.resolve(expectation())
          .then(() => resolve())
          .catch(rejectOrRerun);
      } catch (error) {
        rejectOrRerun(error);
      }
    }
    setTimeout(runExpectation, 0);
  });
};

waitForExpect.defaults = defaults;

export default waitForExpect;