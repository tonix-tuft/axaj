/*
 * Copyright (c) 2019 Anton Bagdatyev (Tonix-Tuft)
 *
 * Permission is hereby granted, free of charge, to any person
 * obtaining a copy of this software and associated documentation
 * files (the "Software"), to deal in the Software without
 * restriction, including without limitation the rights to use,
 * copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following
 * conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
 * OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 * OTHER DEALINGS IN THE SOFTWARE.
 */

/**
 * axaj AJAX library.
 */

import ImmutableLinkedOrderedMap, {
  ImmutableLinkedOrderedMapMode
} from "immutable-linked-ordered-map";
import { checkNetwork, buildQueryString, formData } from "js-utl";
import IntervalJitter from "interval-jitter";

/**
 * @type {string}
 */
let CSRFTokenName = void 0;

/**
 * @type {string|Function}
 */
let CSRFTokenValue = void 0;

/**
 * @type {number}
 */
let checkNetworkInterval = 3000;

/**
 * @type {number}
 */
let noNetworkHandlerId = 0;

/**
 * @type {number}
 */
let networkRestoredHandlerId = 0;

/**
 * @type {number}
 */
let stillNoNetworkHandlerId = 0;

/**
 * Configuration with useful setters.
 *
 * @type {Object}
 */
export const config = {
  setCSRFTokenName: name => {
    CSRFTokenName = name;
  },
  setCSRFTokenValue: value => {
    CSRFTokenValue = value;
  },
  setCheckNetworkInterval: interval => {
    checkNetworkInterval = interval;
  }
};

/**
 * @type {Object}
 */
const defaultOptions = {
  credentials: "same-origin"
};

/**
 * @type {ImmutableLinkedOrderedMap}
 */
let onNoNetworkHandlers = new ImmutableLinkedOrderedMap({
  mode: ImmutableLinkedOrderedMapMode.LIGHTWEIGHT
});

/**
 * @type {ImmutableLinkedOrderedMap}
 */
let onNetworkRestoredHandlers = new ImmutableLinkedOrderedMap({
  mode: ImmutableLinkedOrderedMapMode.LIGHTWEIGHT
});

/**
 * @type {ImmutableLinkedOrderedMap}
 */
let onStillNoNetworkHandlers = new ImmutableLinkedOrderedMap({
  mode: ImmutableLinkedOrderedMapMode.LIGHTWEIGHT
});

/**
 * Adds a handler to be executed as soon as an AJAX call is made and there is no network.
 *
 * @param {Function} handler The handler to execute.
 * @return {number} The handler's ID.
 */
export function addOnNoNetworkHandler(handler) {
  noNetworkHandlerId++;
  onNoNetworkHandlers = onNoNetworkHandlers.set({
    [noNetworkHandlerId]: handler
  });
  return noNetworkHandlerId;
}

/**
 * Removes a no network handler.
 *
 * @param {number} handlerId The ID of the handler previously returned with "addOnNoNetworkHandler".
 * @return {undefined}
 */
export function removeOnNoNetworkHandler(handlerId) {
  onNoNetworkHandlers = onNoNetworkHandlers.unset(handlerId);
}

/**
 * Adds a handler to be executed as soon as an AJAX call was made and there was no network
 * and now the network connection has been restored.
 *
 * @param {Function} handler The handler to execute.
 * @return {number} The handler's ID.
 */
export function addOnNetworkRestoredHandler(handler) {
  networkRestoredHandlerId++;
  onNetworkRestoredHandlers = onNetworkRestoredHandlers.set({
    [networkRestoredHandlerId]: handler
  });
  return networkRestoredHandlerId;
}

/**
 * Removes a network restored handler.
 *
 * @param {number} handlerId The ID of the handler previously returned with "addOnNetworkRestoredHandler".
 * @return {undefined}
 */
export function removeOnNetworkRestoredHandler(handlerId) {
  onNetworkRestoredHandlers = onNetworkRestoredHandlers.unset(handlerId);
}

/**
 * Adds a handler to be executed as soon as an AJAX call was made and there was no network
 * (no network handlers were executed) and now the network connection is still not available.
 *
 * @param {Function} handler The handler to execute.
 * @return {number} The handler's ID.
 */
export function addOnStillNoNetworkHandler(handler) {
  stillNoNetworkHandlerId++;
  onStillNoNetworkHandlers = onStillNoNetworkHandlers.set({
    [stillNoNetworkHandlerId]: handler
  });
  return stillNoNetworkHandlerId;
}

/**
 * Removes a still no network handler.
 *
 * @param {number} handlerId The ID of the handler previously returned with "addOnStillNoNetworkHandler".
 * @return {undefined}
 */
export function removeOnStillNoNetworkHandler(handlerId) {
  onStillNoNetworkHandlers = onStillNoNetworkHandlers.unset(handlerId);
}

/**
 * @type {IntervalJitter}
 */
const noNetworkJitter = new IntervalJitter(() => {
  checkNetwork().then(isNetworkReachable => {
    if (isNetworkReachable) {
      noNetworkJitter.stop();
      onNetworkRestoredHandlers.forEach(handler => handler());
    } else {
      onStillNoNetworkHandlers.forEach(handler => handler());
    }
  });
});

/**
 * Wraps a fetch promise checking that the fetch was successful.
 * Throws an error if the promise was not successful, i.e. the response was not OK
 * (a network error is encountered or CORS is misconfigured on the server side,
 * i.e. there's a network failure or something prevented the request from completing).
 *
 * The given Promise "fetchPromise" (returned from fetch()) won't reject on HTTP error status
 * even if the response is an HTTP 404 or 500.
 * Instead, it will resolve normally (with ok status set to false),
 * and it will only reject on network failure or if anything prevented the request from completing.
 *
 * This async function checks this and its implicitly returned promise will resolve with the response object
 * if and only if the response was successful (status in the range 200-299).
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch#Checking_that_the_fetch_was_successful
 *
 * @param {Promise} fetchPromise A fetch promise.
 * @return {Promise} Another promise.
 */
async function AJAX(fetchPromise) {
  try {
    const response = await fetchPromise;
    if (response.ok) {
      return response;
    }
    throw response;
  } catch (reason) {
    // eslint-disable-next-line no-console
    console.error(reason);
    checkNetwork().then(isNetworkReachable => {
      if (!isNetworkReachable) {
        onNoNetworkHandlers.forEach(handler => handler());

        noNetworkJitter.setMinInterval(checkNetworkInterval);
        noNetworkJitter.setMaxInterval(checkNetworkInterval);
        noNetworkJitter.run();
      }
    });
    throw reason;
  }
}

/**
 * Obtains the CSRF token value.
 *
 * @param {string|Function} CSRFTokenValue A string representing the token or a function to call which should return the token value.
 * @return {string} The token value.
 */
function crossSiteRequestForgeryTokenValue(CSRFTokenValue) {
  return typeof CSRFTokenValue === "function"
    ? CSRFTokenValue()
    : CSRFTokenValue;
}

/**
 * Decorates an object with the CSRF token, if set.
 *
 * @param {Object} data The data to decorate.
 * @return {Object} The decorated object.
 */
function decorateObjectWithCSRFTokenIfSet(data) {
  return {
    ...data,
    ...((CSRFTokenName &&
      CSRFTokenValue && {
        [CSRFTokenName]: crossSiteRequestForgeryTokenValue(CSRFTokenValue)
      }) ||
      {})
  };
}

/**
 * AJAX GET request.
 *
 * @param {string} URI The URI.
 * @param {Object} [init] Optional init options.
 * @return {Promise} A promise.
 */
export function GET(URI, init) {
  return AJAX(
    fetch(URI, {
      ...defaultOptions,
      ...(init || {}),
      method: "GET"
    })
  );
}

/**
 * Generic AJAX POST request.
 *
 * NOTE: When using this function directly (instead of the other "POST*" functions),
 *       the CSRF token will not be added to "data", and therefore must be set manually
 *       by the caller, if needed.
 *       Otherwise, "POSTJSON", "POSTFormURLEncoded", "POSTUploadFiles" or "POSTFormData"
 *       (which is by the way called by "POSTUploadFiles") SHOULD be used.
 *
 * @param {string} URI The URI.
 * @param {*} data Data to send.
 * @param {Object} [init] Optional init options.
 * @return {Promise} A promise.
 */
export function POST(URI, data, init) {
  const options = init || {};
  return AJAX(
    fetch(URI, {
      ...defaultOptions,
      ...options,
      method: "POST",
      body: data || {}
    })
  );
}

/**
 * AJAX POST request with JSON payload.
 *
 * @param {string} URI The URI.
 * @param {Object} data Data to encode into JSON.
 * @param {Object} [init] Optional init options.
 * @return {Promise} A promise.
 */
export function POSTJSON(URI, data, init) {
  const options = init || {};
  return POST(URI, JSON.stringify(decorateObjectWithCSRFTokenIfSet(data)), {
    ...options,
    headers: {
      ...(options.headers || {}),
      "Content-Type": "application/json"
    }
  });
}

/**
 * AJAX POST request with form data.
 *
 * @param {string} URI The URI.
 * @param {Object} data Form data to encode.
 * @param {Object} [init] Optional init options.
 * @return {Promise} A promise.
 */
export function POSTFormURLEncoded(URI, data, init) {
  const options = init || {};
  return POST(URI, buildQueryString(decorateObjectWithCSRFTokenIfSet(data)), {
    ...options,
    headers: {
      ...(options.headers || {}),
      "Content-Type": "application/x-www-form-urlencoded"
    }
  });
}

/**
 * AJAX POST to send a "FormData" instance.
 *
 * @param {string} URI The URI.
 * @param {FormData} formData The form data to send.
 * @param {Object} [options] Optional init options.
 * @return {Promise} A promise.
 */
export function POSTFormData(URI, formData, options = {}) {
  if (CSRFTokenName && CSRFTokenValue) {
    formData.append(
      CSRFTokenName,
      crossSiteRequestForgeryTokenValue(CSRFTokenValue)
    );
  }
  return POST(URI, formData, options);
}

/**
 * AJAX POST to send multiple files.
 *
 * @param {string} URI The URI.
 * @param {string} filesFormKey Form key to use for files (e.g. "files[]", note the square brackets).
 * @param {File[]} files Array of files to upload.
 * @param {Object} [data] An optional additional object with form data to send beside the given files.
 * @param {Object} [init] Optional init options.
 * @return {Promise} A promise.
 */
export function POSTUploadFiles(
  URI,
  filesFormKey,
  files,
  data = {},
  init = {}
) {
  const options = init || {};
  const form = formData(data);

  for (let i = 0; i < files.length; i++) {
    form.append(filesFormKey, files[i], files[i].name);
  }

  return POSTFormData(URI, form, options);
}

/**
 * Fetches the JSON from an AJAX promise.
 *
 * @param {Promise} AJAXPromise AJAX promise.
 * @return {Promise} A promise which fulfills with the parsed JSON data of the response.
 */
export async function fetchJSON(AJAXPromise) {
  const response = await AJAXPromise;
  const parsedJSON = await response.json();
  return parsedJSON;
}
