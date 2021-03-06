// @flow

import {addCommonBeaconProperties} from '../commonBeaconProperties';
import type {UnhandledErrorBeacon} from '../types';
import {now, generateUniqueId} from '../util';
import {isErrorMessageIgnored} from '../ignoreRules';
import {sendBeacon} from '../transmission';
import {getActiveTraceId} from '../fsm';
import {win} from '../browser';

type TrackedError = {
  message: string,
  stack: string,
  location: string,
  parentId: ?string,
  seenCount: number,
  transmittedCount: number
}

const maxErrorsToReport = 100;
const maxStackSize = 30;

let reportedErrors = 0;
const maxSeenErrorsTracked = 20;
let numberOfDifferentErrorsSeen = 0;
let seenErrors: {[key: string]: TrackedError} = {};
let scheduledTransmissionTimeoutHandle;

// We are wrapping global listeners. In these, we are catching and rethrowing errors.
// In older browsers, rethrowing errors actually manipulates the error objects. As a
// result, it is not possible to just mark an error as reported. The simplest way to
// avoid double reporting is to temporarily disable the global onError handler…
let ignoreNextOnError = false;

export function ignoreNextOnErrorEvent() {
  ignoreNextOnError = true;
}

export function hookIntoGlobalErrorEvent() {
  let globalOnError = win.onerror;

  win.onerror = function(message, fileName, lineNumber, columnNumber, error) {
    if (ignoreNextOnError) {
      ignoreNextOnError = false;
      if (typeof globalOnError === 'function') {
        return globalOnError.apply(this, arguments);
      }
      return;
    }

    let stack = error && error.stack;
    if (!stack) {
      stack = 'at ' + fileName + ' ' + lineNumber;
      if (columnNumber != null) {
        stack += ':' + columnNumber;
      }
    }
    onUnhandledError(message, stack);

    if (typeof globalOnError === 'function') {
      return globalOnError.apply(this, arguments);
    }
  };
}

export function reportError(error: ErrorLike) {
  onUnhandledError(error.message, error.stack);
}

function onUnhandledError(message, stack) {
  if (!message || reportedErrors > maxErrorsToReport) {
    return;
  }

  if (isErrorMessageIgnored(message)) {
    return;
  }

  if (numberOfDifferentErrorsSeen >= maxSeenErrorsTracked) {
    seenErrors = {};
    numberOfDifferentErrorsSeen = 0;
  }

  message = String(message).substring(0, 300);
  stack = String(stack || '').split('\n').slice(0, maxStackSize).join('\n');
  const location = win.location.href;
  const parentId: ?string = getActiveTraceId();
  const key = message + stack + location + parentId;

  let trackedError = seenErrors[key];
  if (trackedError) {
    trackedError.seenCount++;
  } else {
    trackedError = seenErrors[key] = {
      message,
      stack,
      location,
      parentId,
      seenCount: 1,
      transmittedCount: 0
    };
    numberOfDifferentErrorsSeen++;
  }

  scheduleTransmission();
}


function scheduleTransmission() {
  if (scheduledTransmissionTimeoutHandle) {
    return;
  }

  scheduledTransmissionTimeoutHandle = setTimeout(send, 1000);
}


function send() {
  clearTimeout(scheduledTransmissionTimeoutHandle);
  scheduledTransmissionTimeoutHandle = null;

  for (let key in seenErrors) {
    if (seenErrors.hasOwnProperty(key)) {
      const seenError = seenErrors[key];
      if (seenError.seenCount > seenError.transmittedCount) {
        sendBeaconForError(seenError);
        reportedErrors++;
      }
    }
  }

  seenErrors = {};
  numberOfDifferentErrorsSeen = 0;
}


function sendBeaconForError(error) {
  const spanId = generateUniqueId();
  const traceId = error.parentId || spanId;
  // $FlowFixMe
  const beacon: UnhandledErrorBeacon = {
    's': spanId,
    't': traceId,
    'ts': now(),

    // error beacon specific data
    'ty': 'err',
    'l': error.location,
    'e': error.message,
    'st': error.stack,
    'c': error.seenCount - error.transmittedCount
  };
  addCommonBeaconProperties(beacon);
  sendBeacon(beacon);
}
