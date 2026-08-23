/**
 * Records WHERE a farmer registration or purchase was made (see
 * docs/Database-Schema.md "Record location"). Two rules govern everything
 * in this file:
 *
 * 1. **It must never block or fail a save.** A GPS fix takes seconds
 *    outdoors and routinely never arrives indoors or under a metal roof -
 *    a buying centre is both. This whole app exists to keep working when
 *    conditions are bad, so a purchase must never be lost, delayed, or
 *    rejected because a satellite fix wasn't ready. Every failure path
 *    here degrades to `null`.
 *
 * 2. **Ask early, read late.** The fix is requested when the form OPENS,
 *    not when Save is tapped, so the receiver has the whole time the staff
 *    member spends filling the form to get a lock. Asking at submit time
 *    would either stall the save or almost always return nothing.
 */

let lastFix = null;
let watchId = null;
// 'idle' | 'searching' | 'found' | 'unavailable'. Tracked so the on-form
// indicator can say something honest: telling staff we are still "finding"
// their location when permission was denied is simply untrue, and would
// leave them waiting for something that is never going to arrive.
let status = 'idle';

const OPTIONS = {
  enableHighAccuracy: true,
  timeout: 8000,
  // A fix from the last minute is fine - staff don't move between opening
  // the form and saving it, and reusing one avoids a cold start.
  maximumAge: 60000,
};

function isSupported() {
  // Also false on an insecure origin, where the API exists but always errors.
  return typeof navigator !== 'undefined' && 'geolocation' in navigator && window.isSecureContext;
}

/**
 * Starts trying to get a position. Safe to call repeatedly (e.g. every time
 * a form renders) - an existing watch is left running rather than restarted.
 * Never throws and never rejects; callers deliberately don't await it.
 */
export function startLocationCapture() {
  if (!isSupported()) {
    status = 'unavailable';
    return;
  }
  if (watchId !== null) return;
  if (status !== 'found') status = 'searching';

  try {
    // watchPosition rather than getCurrentPosition: the first fix is often
    // a coarse network-derived one, and accuracy improves over the next few
    // seconds. Keeping the watch open means whatever we store at save time
    // is the best fix so far, not the first crude one.
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        lastFix = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyM: Math.round(position.coords.accuracy),
          capturedAt: new Date(position.timestamp).toISOString(),
        };
        status = 'found';
      },
      () => {
        // Permission denied, position unavailable, or timeout. No message is
        // shown - staff can do nothing useful about it, and an error here
        // must not imply their record failed to save. The status is recorded
        // only so the indicator stops claiming it is still searching.
        if (status !== 'found') status = 'unavailable';
      },
      OPTIONS
    );
  } catch {
    watchId = null;
    status = 'unavailable';
  }
}

/** Stops the watch and releases the receiver. Call when leaving a form. */
export function stopLocationCapture() {
  if (watchId === null) return;
  try {
    navigator.geolocation.clearWatch(watchId);
  } catch {
    // Nothing useful to do - the watch is being abandoned either way.
  }
  watchId = null;
}

/**
 * The best fix so far, or null if none arrived. Synchronous by design:
 * called at save time, where waiting is exactly what we must not do.
 */
export function getCapturedLocation() {
  return lastFix;
}

/** True once a usable fix exists. */
export function hasLocation() {
  return lastFix !== null;
}

/** 'idle' | 'searching' | 'found' | 'unavailable' - drives the indicator. */
export function locationStatus() {
  return status;
}

/** Test seam: clears state so one form's fix can't leak into a later test. */
export function resetLocationForTests() {
  lastFix = null;
  status = 'idle';
  watchId = null;
}
