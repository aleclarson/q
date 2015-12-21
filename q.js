/**
 * @providesModule q
 *
 * TODO: Add 'promise.debug' so we can selectively debug promises,
 *       rather than every promise made in the program (which has severe
 *       performance impacts in large applications).
 */

require("lotus-require");

var parseErrorStack = require("parseErrorStack");
var isNodeEnv = require("is-node-env");
var noop = require("no-op");
var log = require("temp-log");

// Use the fastest possible means to execute a task in a future turn
// of the event loop.
var nextTick =(function () {
  // linked list of tasks (single, with head node)
  var head = {task: void 0, next: null};
  var tail = head;
  var flushing = false;
  var requestTick = void 0;
  var isNodeJS = false;
  // queue for late tasks, used by unhandled rejection tracking
  var laterQueue = [];

  function flush() {
    /* jshint loopfunc: true */
    var task, domain;

    while (head.next) {
      head = head.next;
      task = head.task;
      head.task = void 0;
      domain = head.domain;

      if (domain) {
        head.domain = void 0;
        domain.enter();
      }
      runSingle(task, domain);

    }
    while (laterQueue.length) {
      task = laterQueue.pop();
      runSingle(task);
    }
    flushing = false;
  }
  // runs a single function in the async queue
  function runSingle(task, domain) {
    try {
      task();

    } catch (error) {
      if (isNodeJS) {
        // In node, uncaught exceptions are considered fatal errors.
        // Re-throw them synchronously to interrupt flushing!

        // Ensure continuation if the uncaught exception is suppressed
        // listening "uncaughtException" events (as domains does).
        // Continue in next event to avoid tick recursion.
        if (domain) {
          domain.exit();
        }
        setTimeout(flush, 0);
        if (domain) {
          domain.enter();
        }

        throw error;

      } else {
        // In browsers, uncaught exceptions are not fatal.
        // Re-throw them asynchronously to avoid slow-downs.
        setTimeout(function () {
          throw error;
        }, 0);
      }
    }

    if (domain) {
      domain.exit();
    }
  }

  nextTick = function (task) {
    tail = tail.next = {
      task: task,
      domain: isNodeJS && process.domain,
      next: null
    };

    if (!flushing) {
      flushing = true;
      requestTick();
    }
  };

  if (typeof process === "object" &&
    process.toString() === "[object process]" && process.nextTick) {
    // Ensure Q is in a real Node environment, with a `process.nextTick`.
    // To see through fake Node environments:
    // * Mocha test runner - exposes a `process` global without a `nextTick`
    // * Browserify - exposes a `process.nexTick` function that uses
    //   `setTimeout`. In this case `setImmediate` is preferred because
    //    it is faster. Browserify's `process.toString()` yields
    //   "[object Object]", while in a real Node environment
    //   `process.nextTick()` yields "[object process]".
    isNodeJS = true;

    requestTick = function () {
      process.nextTick(flush);
    };

  } else if (typeof setImmediate === "function") {
    // In IE10, Node.js 0.9+, or https://github.com/NobleJS/setImmediate
    if (typeof window !== "undefined") {
      requestTick = setImmediate.bind(window, flush);
    } else {
      requestTick = function () {
        setImmediate(flush);
      };
    }

  } else if (typeof MessageChannel !== "undefined") {
    // modern browsers
    // http://www.nonblocking.io/2011/06/windownexttick.html
    var channel = new MessageChannel();
    // At least Safari Version 6.0.5 (8536.30.1) intermittently cannot create
    // working message ports the first time a page loads.
    channel.port1.onmessage = function () {
      requestTick = requestPortTick;
      channel.port1.onmessage = flush;
      flush();
    };
    var requestPortTick = function () {
      // Opera requires us to provide a message payload, regardless of
      // whether we use it.
      channel.port2.postMessage(0);
    };
    requestTick = function () {
      setTimeout(flush, 0);
      requestPortTick();
    };

  } else {
    // old browsers
    requestTick = function () {
      setTimeout(flush, 0);
    };
  }
  // runs a task after all other tasks have been run
  // this is useful for unhandled rejection tracking that needs to happen
  // after all `then`d tasks have been run.
  nextTick.runAfter = function (task) {
    laterQueue.push(task);
    if (!flushing) {
      flushing = true;
      requestTick();
    }
  };
  return nextTick;
})();

// Attempt to make generics safe in the face of downstream
// modifications.
// There is no situation where this is necessary.
// If you need a security guarantee, these primordials need to be
// deeply frozen anyway, and if you don’t need a security guarantee,
// this is just plain paranoid.
// However, this **might** have the nice side-effect of reducing the size of
// the minified code by reducing x.call() to merely x()
// See Mark Miller’s explanation of what this does.
// http://wiki.ecmascript.org/doku.php?id=conventions:safe_meta_programming
var call = Function.call;
function uncurryThis(f) {
  return function () {
    return call.apply(f, arguments);
  };
}
// This is equivalent, but slower:
// uncurryThis = Function_bind.bind(Function_bind.call);
// http://jsperf.com/uncurrythis

var array_slice = uncurryThis(Array.prototype.slice);

var array_reduce = uncurryThis(
  Array.prototype.reduce || function (callback, basis) {
    var index = 0,
      length = this.length;
    // concerning the initial value, if one is not provided
    if (arguments.length === 1) {
      // seek to the first value in the array, accounting
      // for the possibility that is is a sparse array
      do {
        if (index in this) {
          basis = this[index++];
          break;
        }
        if (++index >= length) {
          throw TypeError();
        }
      } while (1);
    }
    // reduce
    for (; index < length; index++) {
      // account for the possibility that the array is sparse
      if (index in this) {
        basis = callback(basis, this[index], index);
      }
    }
    return basis;
  }
);

var array_indexOf = uncurryThis(
  Array.prototype.indexOf || function (value) {
    // not a very good shim, but good enough for our one use of it
    for (var i = 0; i < this.length; i++) {
      if (this[i] === value) {
        return i;
      }
    }
    return -1;
  }
);

var array_map = uncurryThis(
  Array.prototype.map || function (callback, thisp) {
    var self = this;
    var collect = [];
    array_reduce(self, function (undefined, value, index) {
      collect.push(callback.call(thisp, value, index, self));
    }, void 0);
    return collect;
  }
);

var object_create = Object.create || function (prototype) {
  function Type() { }
  Type.prototype = prototype;
  return new Type();
};

var object_hasOwnProperty = uncurryThis(Object.prototype.hasOwnProperty);

var object_keys = Object.keys || function (object) {
  var keys = [];
  for (var key in object) {
    if (object_hasOwnProperty(object, key)) {
      keys.push(key);
    }
  }
  return keys;
};

// beginning of real work

/**
 * Constructs a promise for an immediate reference, passes promises through, or
 * coerces promises from different systems.
 * @param value immediate reference or promise
 */
Q.resolve = Q;
function Q(value) {
  // If the object is already a Promise, return it directly.  This enables
  // the resolve function to both be used to created references from objects,
  // but to tolerably coerce non-promises to promises.
  if (value instanceof Promise) {
    return value;
  }

  var promise;

  // assimilate thenables
  if (isPromiseAlike(value)) {
    promise = coerce(value);
  } else {
    promise = fulfill(value);
  }

  return promise._createdWith("Q.resolve");
}

Q._resolve = _Q;
function _Q(value, createdBy) {
  var promise = Q(value);
  if (!isPromise(value)) { promise._createdBy(createdBy); }
  return promise;
}

function _activate(promise, callback) {

  if (!Q.debug) {
    return callback();
  }

  if (Q.activePromise != null) {
    Q.activePromises.push(Q.activePromise);
  }

  Q.activePromise = promise;

  var result = callback();

  Q.activePromise = Q.activePromises.pop();

  return result;
}

function _init(promise, createdWith) {

  if (!Q.debug) { return; }

  promise.id = Q.id++;

  Object.defineProperty(promise, "state", {
    enumerable: true,
    get: function () {
      return this.inspect().state;
    }
  });

  promise.createdWith = createdWith;

  promise.createdBy = undefined;

  promise.createdIn = Q.activePromise;

  promise.previous = undefined;

  promise.result = undefined;

  promise.error = undefined;

  promise.stack = parseErrorStack(Error());

  if (Q.cache != null) {
    Q.cache[promise.id] = promise;
  }
}

function _reject(error, promise) {

  if (!Q.debug) {
    if (!error.promise) {
      error.promise = promise;
    }
    return;
  }

  if (Q.verbose) {
    log.moat(1);
    log(promise.id + " caught a rejection!");
    log.moat(1);
  }

  // Find the rejected Promise that was created internally.
  while (promise.previous != null && promise.previous.isRejected()) {
    promise = promise.previous;
  }

  // Find the rejected Promise that was created by the user.
  while (promise.createdBy != null && promise.createdIn != null) {
    promise = promise.createdIn;
  }

  if (promise.isRejected()) {

    error.promise = promise;

    if (typeof Q.onRejection === "function") {
      Q.onRejection(promise, error);
    }
  }
}

function _onUnhandledError(error) {
  // forward to a future turn so that `when`
  // does not catch it and turn it into a rejection.
  Q.nextTick(function () {
    if (Q.onError) {
      Q.onError(error);
    } else {
      throw error;
    }
  });
}

// Follows `promise.result` and returns the last value found. If no result exists, `promise` is returned.
function _findResult(promise) {

  var result = promise;

  while (result.result != null) {
    result = result.result;
  }

  return result;
}

Q.id = 1;

if (typeof process !== "undefined") {
  var parseBool = require("parse-bool");
  Q.debug = parseBool(process.env.Q_DEBUG);
  Q.verbose = parseBool(process.env.Q_VERBOSE);
} else {
  Q.debug = false;
  Q.verbose = false;
}

// An ordered array of nested Promises that are currently active.
Q.activePromises = [];

// The promise whose handler we are inside of.
Q.activePromise = undefined;

/**
 * Performs a task in a future turn of the event loop.
 * @param {Function} task
 */
Q.nextTick = nextTick;

/**
 * Constructs a {promise, resolve, reject} object.
 *
 * `resolve` is a callback to invoke with a more resolved value for the
 * promise. To fulfill the promise, invoke `resolve` with any value that is
 * not a thenable. To reject the promise, invoke `resolve` with a rejected
 * thenable, or invoke `reject` with the reason directly. To resolve the
 * promise to another thenable, thus putting it in the same state, invoke
 * `resolve` with that other thenable.
 */
Q.defer = defer;
function defer() {
  // if "messages" is an "Array", that indicates that the promise has not yet
  // been resolved.  If it is "undefined", it has been resolved.  Each
  // element of the messages array is itself an array of complete arguments to
  // forward to the resolved promise.  We coerce the resolution value to a
  // promise using the `resolve` function because it handles both fully
  // non-thenable values and other thenables gracefully.
  var messages = [], progressListeners = [], resolvedPromise;

  var deferred = object_create(defer.prototype);
  var promise = object_create(Promise.prototype);

  _init(promise, "Q.defer");

  promise.stack = parseErrorStack(Error());

  promise.promiseDispatch = function (resolve, op, operands) {
    var args = array_slice(arguments);
    if (messages) {
      messages.push(args);
      if (op === "when" && operands[1]) { // progress operand
        progressListeners.push(operands[1]);
      }
    } else {
      Q.nextTick(function () {
        resolvedPromise.promiseDispatch.apply(resolvedPromise, args);
      });
    }
  };

  // XXX deprecated
  promise.valueOf = function () {

    if (messages) {
      return promise;
    }

    var nearerValue = nearer(resolvedPromise);

    if (isPromise(nearerValue)) {

      resolvedPromise = nearerValue; // shorten chain

      if (Q.debug) {
        promise.result = resolvedPromise;
      }
    }

    return nearerValue;
  };

  promise.inspect = function () {
    if (!resolvedPromise) {
      return { state: "pending" };
    }
    return resolvedPromise.inspect();
  };

  // NOTE: we do the checks for `resolvedPromise` in each method, instead of
  // consolidating them into `become`, since otherwise we'd create new
  // promises with the lines `become(whatever(value))`. See e.g. GH-252.

  function become(newPromise) {

    resolvedPromise = newPromise;

    if (Q.debug) {

      if (Q.verbose) {
        log.moat(1);
        log(promise.id + ".result = " + newPromise.id);
        log.moat(1);
      }

      promise.result = newPromise;

      if (Q.onBecome) {
        Q.onBecome(newPromise, promise);
      }
    }

    array_reduce(messages, function (undefined, message) {
      Q.nextTick(function () {
        newPromise.promiseDispatch.apply(newPromise, message);
      });
    }, void 0);

    messages = void 0;
    progressListeners = void 0;
  }

  deferred.promise = promise;

  deferred.resolve = function (value) {
    if (resolvedPromise) { return; }
    var newPromise = Q(value);
    if (!isPromise(value)) { newPromise._createdBy("deferred.resolve"); }
    become(newPromise);
  };

  deferred.fulfill = function (value) {
    if (resolvedPromise) { return; }
    var newPromise = fulfill(value)._createdBy("deferred.fulfill");
    become(newPromise);
  };

  deferred.reject = function (error) {
    if (resolvedPromise) { return; }
    error.promise = promise;
    var newPromise = reject(error)._createdBy("deferred.reject");
    become(newPromise);
  };

  deferred.notify = function (progress) {
    if (resolvedPromise) { return; }
    array_reduce(progressListeners, function (undefined, progressListener) {
      Q.nextTick(function () {
        progressListener(progress);
      });
    }, void 0);
  };

  return deferred;
}

/**
 * Creates a Node-style callback that will resolve or reject the deferred
 * promise.
 * @returns a nodeback
 */
defer.prototype.makeNodeResolver = function () {
  var self = this;
  return function (error, value) {
    if (error) {
      self.reject(error);
    } else if (arguments.length > 2) {
      self.resolve(array_slice(arguments, 1));
    } else {
      self.resolve(value);
    }
  };
};

/**
 * @param resolver {Function} a function that returns nothing and accepts
 * the resolve, reject, and notify functions for a deferred.
 * @returns a promise that may be resolved with the given resolve and reject
 * functions, or rejected by a thrown error in resolver
 */
Q.promise = promise;
function promise(resolver) {
  if (typeof resolver !== "function") {
    throw TypeError("resolver must be a function.");
  }
  var deferred = defer();
  try {
    resolver(deferred.resolve, deferred.reject, deferred.notify);
  } catch (reason) {
    deferred.reject(reason);
  }
  return deferred.promise;
}

promise.race = race; // ES6
promise.all = all; // ES6
promise.reject = reject; // ES6
promise.resolve = Q; // ES6

// XXX experimental.  This method is a way to denote that a local value is
// serializable and should be immediately dispatched to a remote upon request,
// instead of passing a reference.
Q.passByCopy = function (object) {
  //freeze(object);
  //passByCopies.set(object, true);
  return object;
};

Promise.prototype.passByCopy = function () {
  //freeze(object);
  //passByCopies.set(object, true);
  return this;
};

/**
 * If two promises eventually fulfill to the same value, promises that value,
 * but otherwise rejects.
 * @param x {Any*}
 * @param y {Any*}
 * @returns {Any*} a promise for x and y if they are the same, but a rejection
 * otherwise.
 *
 */
Q.join = function (x, y) {
  return _Q(x, "Q.join").join(y)._createdWith("Q.join");
};

Promise.prototype.join = function (that) {
  var spread = function (x, y) {
    if (x === y) {
      // TODO: "===" should be Object.is or equiv
      return x;
    } else {
      throw Error("Can't join: not the same: " + x + " " + y);
    }
  };
  return _Q([this, that], "promise.join").spread(spread)._createdWith("promise.join");
};

/**
 * Returns a promise for the first of an array of promises to become settled.
 * @param answers {Array[Any*]} promises to race
 * @returns {Any*} the first promise to be settled
 */
Q.race = race;
function race(answerPs) {
  return promise(function (resolve, reject) {
    // Switch to this once we can assume at least ES5
    // answerPs.forEach(function (answerP) {
    //     Q(answerP).then(resolve, reject);
    // });
    // Use this in the meantime
    for (var i = 0, len = answerPs.length; i < len; i++) {
      Q(answerPs[i]).then(resolve, reject);
    }
  });
}

Promise.prototype.race = function () {
  return this.then(Q.race);
};

/**
 * Constructs a Promise with a promise descriptor object and optional fallback
 * function.  The descriptor contains methods like when(rejected), get(name),
 * set(name, value), post(name, args), and delete(name), which all
 * return either a value, a promise for a value, or a rejection.  The fallback
 * accepts the operation name, a resolver, and any further arguments that would
 * have been forwarded to the appropriate method above had a method been
 * provided with the proper name.  The API makes no guarantees about the nature
 * of the returned object, apart from that it is usable whereever promises are
 * bought and sold.
 */
Q.Promise =
Q.makePromise = Promise;
function Promise(descriptor, fallback, inspect) {

  if (fallback == null) {
    fallback = function (op) {
      var error = Error("Promise does not support operation: " + op);
      return reject(error);
    };
  }

  if (inspect == null) {
    inspect = function () {
      return {state: "unknown"};
    };
  }

  var promise = object_create(Promise.prototype);

  _init(promise, "Q.makePromise");

  promise.promiseDispatch = function (resolve, op, args) {
    var result;
    try {
      if (descriptor[op]) {
        result = descriptor[op].apply(promise, args);
      } else {
        result = fallback.call(promise, op, args);
      }
    } catch (error) {

      if (Q.debug && Q.verbose) {
        log.moat(1);
        log('promiseDispatch failed!');
        log.moat(1);
      }

      if (resolve) {
        resolve(error);
      }

      return;
    }

    if (resolve) {
      resolve(null, result);
    }
  };

  promise.inspect = inspect;

  return promise;
}

Promise.prototype.toString = function () {
  return "[object Promise]";
};

Promise.prototype.then = function (fulfilled, rejected, progressed) {

  var deferred;

  if (fulfilled instanceof defer) {
    deferred = fulfilled;
    fulfilled = deferred.resolve;
    rejected = deferred.reject;
    progressed = deferred.notify;
  }

  deferred = defer();

  var promise = deferred.promise._createdWith("promise.then");

  promise.stack = parseErrorStack(Error());

  if (typeof this.abort === 'function') {
    promise.abort = this.abort;
  }

  var previous = this;

  // If any of the Promise's handlers is called, prevent all other calls after.
  var done = false;

  // Starts the next Promise(s).
  var resolve = function (error, result) {

    if (Q.debug) {
      promise.previous = _findResult(previous);
    }

    if (error instanceof Error) {
      deferred.reject(error);
    } else {
      deferred.resolve(result);
    }

    // Ensure 'result.previous' is never the same as 'result.createdIn'.
    if (Q.debug && isPromise(result) && result.previous != null && result.previous === result.createdIn) {
      result.previous = undefined;
    }
  };

  // Called when the previous Promise is fulfilled.
  var onFulfill = function (error, result) {
    if (done) { return; }
    done = true;

    // Mark this Promise as active.
    _activate(promise, function () {

      if (error instanceof Error) {
        return resolve(error);
      }

      // Was a fulfillment handler passed?
      if (fulfilled) {
        try {
          if (Q.debug && Q.verbose) {
            log.moat(1);
            log(promise.id + " is starting...");
            log.moat(1);
          }

          result = fulfilled(result);
        }

        catch (error) {

          if (Q.debug && Q.verbose) {
            log.moat(1);
            log('Fulfillment handler failed!');
            log.moat(1);
          }

          resolve(error);

          _reject(error, promise);
        }
      }

      resolve(null, result);
    });
  };

  // Called when any previous Promise is rejected and has not yet been handled.
  var onReject = function (error) {
    if (done) { return; }
    done = true;

    // Mark this Promise as active.
    _activate(promise, function () {

      // Was an error handler passed?
      if (rejected) {

        try {

          if (Q.debug && Q.verbose) {
            log.moat(1);
            log(promise.id + " caught an error!");
            log.moat(1);
          }

          // Attempt to handle the error.
          resolve(null, rejected(error));
        }

        catch (error) {

          if (Q.debug && Q.verbose) {
            log.moat(1);
            log('Rejection handler failed!');
            log.moat(1);
          }

          // Pass the new `error` to the next Promise in the chain.
          resolve(error);

          _reject(error, promise);
        }
      }

      else {
        // Pass the `error` to the next Promise in the chain.
        resolve(error);
      }
    });
  };

  // Called when the previous Promise progresses.
  var onProgress = function (value) {

    var newValue;

    var threw = false;

    try {
      newValue = typeof progressed === "function" ? progressed(value) : value;
    }

    catch (error) {

      threw = true;

      resolve(error);

      _reject(error, promise);

      if (Q.onError) {
        Q.onError(error);
      }

      else {
        throw error;
      }
    }

    if (!threw) {
      deferred.notify(newValue);
    }
  };

  var self = this;

  Q.nextTick(function () {
    self.promiseDispatch(onFulfill, "when", [onReject]);
  });

  // Progress propagator need to be attached in the current tick.
  self.promiseDispatch(void 0, "when", [void 0, onProgress]);

  return promise;
};

Q.tap = function (promise, callback) {
  return Q(promise).tap(callback)._createdWith("Q.tap");
};

/**
 * Works almost like "finally", but not called for rejections.
 * Original resolution value is passed through callback unaffected.
 * Callback may return a promise that will be awaited for.
 * @param {Function} callback
 * @returns {Q.Promise}
 * @example
 * doSomething()
 *   .then(...)
 *   .tap(console.log)
 *   .then(...);
 */
Promise.prototype.tap = function (callback) {

  callback = Q(callback);

  var didFulfill = function (value) {
    return callback.fcall(value).thenResolve(value);
  };

  return this.then(didFulfill)._createdWith("promise.tap");
};

/**
 * Registers an observer on a promise.
 *
 * Guarantees:
 *
 * 1. that fulfilled and rejected will be called only once.
 * 2. that either the fulfilled callback or the rejected callback will be
 *    called, but not both.
 * 3. that fulfilled and rejected will not be called in this turn.
 *
 * @param value      promise or immediate reference to observe
 * @param fulfilled  function to be called with the fulfilled value
 * @param rejected   function to be called with the rejection error
 * @param progressed function to be called on any progress notifications
 * @return promise for the return value from the invoked callback
 */
Q.when = when;
function when(value, fulfilled, rejected, progressed) {
  return _Q(value, "Q.when").then(fulfilled, rejected, progressed)._createdWith("Q.when");
}

Promise.prototype.thenResolve = function (value) {
  return this.then(function () { return value; })._createdWith("promise.thenResolve");
};

Q.thenResolve = function (promise, value) {
  return _Q(promise, "Q.thenResolve").thenResolve(value)._createdWith("Q.thenResolve");
};

Promise.prototype.thenReject = function (reason) {
  return this.then(function () { throw reason; })._createdWith("promise.thenReject");
};

Q.thenReject = function (promise, reason) {
  return _Q(promise, "Q.thenReject").thenReject(reason)._createdWith("Q.thenReject");
};

/**
 * If an object is not a promise, it is as "near" as possible.
 * If a promise is rejected, it is as "near" as possible too.
 * If it’s a fulfilled promise, the fulfillment value is nearer.
 * If it’s a deferred promise and the deferred has been resolved, the
 * resolution is "nearer".
 * @param object
 * @returns most resolved (nearest) form of the object
 */

// XXX should we re-do this?
Q.nearer = nearer;
function nearer(value) {
  if (isPromise(value) && value.state === "fulfilled") {
    return inspected.value;
  }
  return value;
}

/**
 * @returns whether the given object is a promise.
 * Otherwise it is a fulfilled value.
 */
Q.isPromise = isPromise;
function isPromise(object) {
  return object instanceof Promise;
}

Q.isPromiseAlike = isPromiseAlike;
function isPromiseAlike(object) {
  return object === Object(object) && typeof object.then === "function";
}

/**
 * @returns whether the given object is a pending promise, meaning not
 * fulfilled or rejected.
 */
Q.isPending = isPending;
function isPending(object) {
  return isPromise(object) && object.state === "pending";
}

Promise.prototype.isPending = function () {
  return this.state === "pending";
};

/**
 * @returns whether the given object is a value or fulfilled
 * promise.
 */
Q.isFulfilled = isFulfilled;
function isFulfilled(object) {
  return !isPromise(object) || object.state === "fulfilled";
}

Promise.prototype.isFulfilled = function () {
  return this.state === "fulfilled";
};

/**
 * @returns whether the given object is a rejected promise.
 */
Q.isRejected = isRejected;
function isRejected(object) {
  return isPromise(object) && object.state === "rejected";
}

Promise.prototype.isRejected = function () {
  return this.state === "rejected";
};

//// BEGIN UNHANDLED REJECTION TRACKING

// This promise library consumes errors thrown in handlers so they can be
// handled by a subsequent promise.  The errors get added to this array when
// they are created, and removed when they are handled.  Note that in ES6 or
// shimmed environments, this would naturally be a `Set`.
var unhandledReasons = [];
var unhandledRejections = [];
var reportedUnhandledRejections = [];
var trackUnhandledRejections = true;

function resetUnhandledRejections() {
  unhandledReasons.length = 0;
  unhandledRejections.length = 0;

  if (!trackUnhandledRejections) {
    trackUnhandledRejections = true;
  }
}

function trackRejection(promise, reason) {
  if (!trackUnhandledRejections) {
    return;
  }
  if (typeof process === "object" && typeof process.emit === "function") {
    Q.nextTick.runAfter(function () {
      if (array_indexOf(unhandledRejections, promise) !== -1) {
        process.emit("unhandledRejection", reason, promise);
        reportedUnhandledRejections.push(promise);
      }
    });
  }

  unhandledRejections.push(promise);
  if (reason && typeof reason.stack !== "undefined") {
    unhandledReasons.push(reason.stack);
  } else {
    unhandledReasons.push("(no stack) " + reason);
  }
}

function untrackRejection(promise) {
  if (!trackUnhandledRejections) {
    return;
  }

  var at = array_indexOf(unhandledRejections, promise);
  if (at !== -1) {
    if (typeof process === "object" && typeof process.emit === "function") {
      Q.nextTick.runAfter(function () {
        var atReport = array_indexOf(reportedUnhandledRejections, promise);
        if (atReport !== -1) {
          process.emit("rejectionHandled", unhandledReasons[at], promise);
          reportedUnhandledRejections.splice(atReport, 1);
        }
      });
    }
    unhandledRejections.splice(at, 1);
    unhandledReasons.splice(at, 1);
  }
}

Q.resetUnhandledRejections = resetUnhandledRejections;

Q.getUnhandledReasons = function () {
  // Make a copy so that consumers can't interfere with our internal state.
  return unhandledReasons.slice();
};

Q.stopUnhandledRejectionTracking = function () {
  resetUnhandledRejections();
  trackUnhandledRejections = false;
};

resetUnhandledRejections();

//// END UNHANDLED REJECTION TRACKING

/**
 * Constructs a rejected promise.
 * @param error value describing the failure
 */
Q.reject = reject;
function reject(error) {

  var inspect = function () {
    return { state: "rejected", reason: error };
  };

  var fallback = function () {
    return this;
  };

  var descriptor = {
    "when": function (rejected) {
      // note that the error has been handled
      if (rejected) {
        untrackRejection(this);
      }
      return rejected ? rejected(error) : this;
    }
  };

  var promise = Promise(descriptor, fallback, inspect);

  trackRejection(promise, error); // Note that the error has not been handled.

  return promise._createdWith("Q.reject");
}

/**
 * Constructs a fulfilled promise for an immediate reference.
 * @param value immediate reference
 */
Q.fulfill = fulfill;
function fulfill(value) {

  var inspect = function () {
    return { state: "fulfilled", value: value };
  };

  var descriptor = {
    "when": function () {
      return value;
    },
    "get": function (name) {
      return value[name];
    },
    "set": function (name, rhs) {
      value[name] = rhs;
    },
    "delete": function (name) {
      delete value[name];
    },
    "post": function (name, args) {
      // Mark Miller proposes that post with no name should apply a
      // promised function.
      if (name == null) {
        return value.apply(void 0, args);
      } else {
        return value[name].apply(value, args);
      }
    },
    "apply": function (thisp, args) {
      return value.apply(thisp, args);
    },
    "keys": function () {
      return object_keys(value);
    }
  };

  return Promise(descriptor, void 0, inspect)._createdWith("Q.fulfill");
}

/**
 * Converts thenables to Q promises.
 * @param promise thenable promise
 * @returns a Q promise
 */
function coerce(promise) {
  var deferred = defer();
  Q.nextTick(function () {
    try {
      promise.then(deferred);
    } catch (error) {
      deferred.reject(error);
    }
  });
  return deferred.promise;
}

/**
 * Annotates an object such that it will never be
 * transferred away from this process over any promise
 * communication channel.
 * @param object
 * @returns promise a wrapping of that object that
 * additionally responds to the "isDef" message
 * without a rejection.
 */
Q.master = master;
function master(object) {
  return Promise({
    "isDef": function () {}
  }, function fallback(op, args) {
    return dispatch(object, op, args);
  }, function () {
    return Q(object).inspect();
  });
}

/**
 * Spreads the values of a promised array of arguments into the
 * fulfillment callback.
 * @param fulfilled callback that receives variadic arguments from the
 * promised array
 * @param rejected callback that receives the error if the promise
 * is rejected.
 * @returns a promise for the return value or thrown error of
 * either callback.
 */
Q.spread = spread;
function spread(value, fulfilled, rejected) {
  return _Q(value, "Q.spread").spread(fulfilled, rejected)._createdWith("Q.spread");
}

Promise.prototype.spread = function (fulfilled, rejected) {
  var didFulfill = function (array) { return fulfilled.apply(void 0, array); };
  return this.all().then(didFulfill, rejected)._createdWith("promise.spread");
};

/**
 * The promised function decorator ensures that any promise arguments
 * are settled and passed as values (`this` is also settled and passed
 * as a value).  It will also ensure that the result of a function is
 * always a promise.
 *
 * @example
 * var add = Q.promised(function (a, b) {
 *     return a + b;
 * });
 * add(Q(a), Q(B));
 *
 * @param {function} callback The function to decorate
 * @returns {function} a function that has been decorated.
 */
Q.promised = promised;
function promised(callback) {
  return function () {
    return spread([this, all(arguments)], function (self, args) {
      return callback.apply(self, args);
    });
  };
}

/**
 * sends a message to a value in a future turn
 * @param object* the recipient
 * @param op the name of the message operation, e.g., "when",
 * @param args further arguments to be forwarded to the operation
 * @returns result {Promise} a promise for the result of the operation
 */
Q.dispatch = dispatch;
function dispatch(object, op, args) {
  return _Q(object, "Q.dispatch").dispatch(op, args)._createdWith("Q.dispatch");
}

Promise.prototype.dispatch = function (op, args) {
  var self = this;
  var deferred = defer();

  function resolve(error, result) {
    if (error instanceof Error) {
      deferred.reject(error);
      _reject(error, deferred.promise);
    } else {
      deferred.resolve(result);
    }
  }

  Q.nextTick(function () {
    self.promiseDispatch(resolve, op, args);
  });

  return global.lastDispatched = deferred.promise._createdWith("promise.dispatch");
};

/**
 * Gets the value of a property in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of property to get
 * @return promise for the property value
 */
Q.get = function (object, key) {
  return Q(object).dispatch("get", [key]);
};

Promise.prototype.get = function (key) {
  return this.dispatch("get", [key]);
};

/**
 * Sets the value of a property in a future turn.
 * @param object    promise or immediate reference for object object
 * @param name      name of property to set
 * @param value     new value of property
 * @return promise for the return value
 */
Q.set = function (object, key, value) {
  return Q(object).dispatch("set", [key, value]);
};

Promise.prototype.set = function (key, value) {
  return this.dispatch("set", [key, value]);
};

/**
 * Deletes a property in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of property to delete
 * @return promise for the return value
 */
Q.del = // XXX legacy
Q["delete"] = function (object, key) {
  return Q(object).dispatch("delete", [key]);
};

Promise.prototype.del = // XXX legacy
Promise.prototype["delete"] = function (key) {
  return this.dispatch("delete", [key]);
};

/**
 * Invokes a method in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of method to invoke
 * @param value     a value to post, typically an array of
 *                  invocation arguments for promises that
 *                  are ultimately backed with `resolve` values,
 *                  as opposed to those backed with URLs
 *                  wherein the posted value can be any
 *                  JSON serializable object.
 * @return promise for the return value
 */
// bound locally because it is used by other methods
Q.mapply = // XXX As proposed by "Redsandro"
Q.post = function (object, name, args) {
  return Q(object).dispatch("post", [name, args]);
};

Promise.prototype.mapply = // XXX As proposed by "Redsandro"
Promise.prototype.post = function (name, args) {
  return this.dispatch("post", [name, args]);
};

/**
 * Invokes a method in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of method to invoke
 * @param ...args   array of invocation arguments
 * @return promise for the return value
 */
Q.send = // XXX Mark Miller's proposed parlance
Q.mcall = // XXX As proposed by "Redsandro"
Q.invoke = function (object, name /*...args*/) {
  return Q(object).dispatch("post", [name, array_slice(arguments, 2)]);
};

Promise.prototype.send = // XXX Mark Miller's proposed parlance
Promise.prototype.mcall = // XXX As proposed by "Redsandro"
Promise.prototype.invoke = function (name /*...args*/) {
  return this.dispatch("post", [name, array_slice(arguments, 1)]);
};

/**
 * Applies the promised function in a future turn.
 * @param object    promise or immediate reference for target function
 * @param args      array of application arguments
 */
Q.fapply = function (object, args) {
  return _Q(object, "Q.fapply").dispatch("apply", [void 0, args])._createdWith("Q.fapply");
};

Promise.prototype.fapply = function (args) {
  return this.dispatch("apply", [void 0, args])._createdWith("promise.fapply");
};

/**
 * Calls the promised function in a future turn.
 * @param object    promise or immediate reference for target function
 * @param ...args   array of application arguments
 */
Q["try"] =
Q.fcall = function (object /* ...args*/) {
  return _Q(object, "Q.try").dispatch("apply", [void 0, array_slice(arguments, 1)])._createdWith("Q.try");
};

Promise.prototype.fcall = function (/*...args*/) {
  return this.dispatch("apply", [void 0, array_slice(arguments)])._createdWith("promise.fcall");
};

/**
 * Binds the promised function, transforming return values into a fulfilled
 * promise and thrown errors into a rejected one.
 * @param object    promise or immediate reference for target function
 * @param ...args   array of application arguments
 */
Q.fbind = function (object /*...args*/) {
  var promise = Q(object);
  var args = array_slice(arguments, 1);
  return function fbound() {
    return promise.dispatch("apply", [
      this,
      args.concat(array_slice(arguments))
    ]);
  };
};
Promise.prototype.fbind = function (/*...args*/) {
  var promise = this;
  var args = array_slice(arguments);
  return function fbound() {
    return promise.dispatch("apply", [
      this,
      args.concat(array_slice(arguments))
    ]);
  };
};

/**
 * Requests the names of the owned properties of a promised
 * object in a future turn.
 * @param object    promise or immediate reference for target object
 * @return promise for the keys of the eventually settled object
 */
Q.keys = function (object) {
  return _Q(object, "Q.keys").dispatch("keys", [])._createdWith("Q.keys");
};

Promise.prototype.keys = function () {
  return this.dispatch("keys", [])._createdWith("promise.keys");
};

/**
 * Turns an array of promises into a promise for an array.  If any of
 * the promises gets rejected, the whole array is rejected immediately.
 * @param {Array*} an array (or promise for an array) of values (or
 * promises for values)
 * @returns a promise for an array of the corresponding values
 */
// By Mark Miller
// http://wiki.ecmascript.org/doku.php?id=strawman:concurrency&rev=1308776521#allfulfilled
Q.all = all;
function all(promises) {

  var deferred = defer();

  var pendingCount = 0;

  var reduce = function (undefined, promise, index) {

    if (isPromise(promise) && promise.state === "fulfilled") {
      promises[index] = promise.value;
      return;
    }

    ++pendingCount;

    var fulfill = function (value) {
      promises[index] = value;
      if (--pendingCount === 0) {
        deferred.resolve(promises);
      }
    };

    var notify = function (progress) {
      deferred.notify({ index: index, value: progress });
    };

    when(promise, fulfill, deferred.reject, notify)._createdBy("Q.all");
  };

  array_reduce(promises, reduce, void 0);

  if (pendingCount === 0) {
    deferred.resolve(promises);
  }

  return deferred.promise._createdWith("Q.all");
}

Promise.prototype.all = function () {
  return all(this)._createdWith("promise.all");
};

/**
 * Returns the first resolved promise of an array. Prior rejected promises are
 * ignored.  Rejects only if all promises are rejected.
 * @param {Array*} an array containing values or promises for values
 * @returns a promise fulfilled with the value of the first resolved promise,
 * or a rejected promise if all promises are rejected.
 */
Q.any = any;

function any(promises) {

  var promise;

  if (promises.length === 0) {
    return Q.resolve()._createdWith("Q.any");
  }

  var deferred = Q.defer();

  var pendingCount = 0;

  array_reduce(promises, function (prev, current, index) {

    var promise = promises[index];

    var didFulfill = function (result) {
      deferred.resolve(result);
    };

    var didReject = function () {
      pendingCount--;
      if (pendingCount === 0) {
        deferred.reject(Error(
          "Can't get fulfillment value from any promise, all " +
          "promises were rejected."
        ));
      }
    };

    var didProgress = function (progress) {
      deferred.notify({
        index: index,
        value: progress
      });
    };

    pendingCount++;

    when(promise, didFulfill, didReject, didProgress);

  }, void 0);

  return promise;
}

Promise.prototype.any = function () {
  return any(this)._createdWith("promise.any");
};

/**
 * @see Promise#allSettled
 */
Q.allSettled = allSettled;
function allSettled(promises) {
  return Q(promises).allSettled();
}

/**
 * Turns an array of promises into a promise for an array of their states (as
 * returned by `inspect`) when they have all settled.
 * @param {Array[Any*]} values an array (or promise for an array) of values (or
 * promises for values)
 * @returns {Array[State]} an array of states for the respective values.
 */
Promise.prototype.allSettled = function () {
  return this.then(function (promises) {
    return all(array_map(promises, function (promise) {
      promise = Q(promise);
      function regardless() {
        return promise.inspect();
      }
      return promise.then(regardless, regardless);
    }));
  });
};

/**
 * Captures the failure of a promise, giving an oportunity to recover
 * with a callback.  If the given promise is fulfilled, the returned
 * promise is fulfilled.
 * @param {Any*} promise for something
 * @param {Function} callback to fulfill the returned promise if the
 * given promise is rejected
 * @returns a promise for the return value of the callback
 */
Q["catch"] =
Q.fail = function (object, rejected) {
  return _Q(object, "Q.fail").then(void 0, rejected)._createdWith("Q.fail");
};

Promise.prototype["catch"] =
Promise.prototype.fail = function (rejected) {
  return this.then(void 0, rejected)._createdWith("promise.fail");
};

/**
 * Attaches a listener that can respond to progress notifications from a
 * promise's originating deferred. This listener receives the exact arguments
 * passed to ``deferred.notify``.
 * @param {Any*} promise for something
 * @param {Function} callback to receive any progress notifications
 * @returns the given promise, unchanged
 */
Q.progress = progress;
function progress(object, progressed) {
  return _Q(object, "Q.progress").then(void 0, void 0, progressed)._createdWith("Q.progress");
}

Promise.prototype.progress = function (progressed) {
  return this.then(void 0, void 0, progressed)._createdWith("promise.progress");
};

/**
 * Provides an opportunity to observe the settling of a promise,
 * regardless of whether the promise is fulfilled or rejected.  Forwards
 * the resolution to the returned promise when the callback is done.
 * The callback can return a promise to defer completion.
 * @param {Any*} promise
 * @param {Function} callback to observe the resolution of the given
 * promise, takes no arguments.
 * @returns a promise for the resolution of the given promise when
 * ``always`` is done.
 */
Q.always = function (object, callback) {
  return _Q(object, "Q.always")["always"](callback)._createdWith("Q.always");
};

Promise.prototype.always = function (callback) {

  callback = Q(callback);

  var didFulfill = function (value) {
    return callback.fcall().then(function () {
      return value;
    });
  };

  var didReject = function (error) {
    // TODO attempt to recycle the rejection with "this".
    return callback.fcall().then(function () {
      throw error;
    });
  };

  return this.then(didFulfill, didReject)._createdWith("promise.always");
};

/**
 * Terminates a chain of promises, forcing rejections to be
 * thrown as errors.
 * @param {Any*} promise at the end of a chain of promises
 * @returns nothing
 */
Q.done = function (promise, fulfilled, rejected, progressed, createdWith) {

  promise = _Q(promise, "Q.done");

  var newPromise;

  // Avoid unnecessary `nextTick`ing via an unnecessary `when`.
  if (fulfilled || rejected || progress) {
    promise = promise.then(fulfilled, rejected, progress)._createdBy(createdWith);
  }

  var onUnhandledError = function (error) {
    if (Q.debug) { newPromise.previous = _findResult(promise); }
    _onUnhandledError(error);
  };

  newPromise = promise.then(void 0, onUnhandledError)._createdWith(createdWith);
};

Promise.prototype.done = function (fulfilled, rejected, progressed) {
  Q.done(this, fulfilled, rejected, progressed, "promise.done");
};

Promise.prototype.finish = function (callback) {
  this.then(function (result) {
    callback(null, result);
  }, function (error) {
    callback(error);
  }).done();
};

/**
 * Causes a promise to be rejected if it does not get fulfilled before
 * some milliseconds time out.
 * @param {Any*} promise
 * @param {Number} milliseconds timeout
 * @param {Any*} custom error message or Error object (optional)
 * @returns a promise for the resolution of the given promise if it is
 * fulfilled before the timeout, otherwise rejected.
 */
Q.timeout = function (object, ms, error) {
  return _Q(object, "Q.timeout").timeout(ms, error)._createdWith("Q.timeout");
};

Promise.prototype.timeout = function (ms, error) {

  var deferred = defer();

  var timeoutId = setTimeout(function () {
    if (!error || "string" === typeof error) {
      error = Error(error || "Timed out after " + ms + " ms");
      error.code = "ETIMEDOUT";
    }
    deferred.reject(error);
  }, ms);

  this.then(function (value) {
    clearTimeout(timeoutId);
    deferred.resolve(value);
  }, function (error) {
    clearTimeout(timeoutId);
    deferred.reject(error);
  }, deferred.notify);

  return deferred.promise._createdWith("promise.timeout");
};

/**
 * Returns a promise for the given value (or promised value), some
 * milliseconds after it resolved. Passes rejections immediately.
 * @param {Any*} promise
 * @param {Number} milliseconds
 * @returns a promise for the resolution of the given promise after milliseconds
 * time has elapsed since the resolution of the given promise.
 * If the given promise rejects, that is passed immediately.
 */
Q.delay = function (object, delay) {
  if (delay == null) {
    delay = object;
    object = void 0;
  }
  return _Q(object, "Q.delay").delay(delay)._createdWith("Q.delay");
};

Promise.prototype.delay = function (delay) {
  var promise;
  return promise = this.then(function (value) {

    var deferred = defer();

    setTimeout(deferred.resolve.bind(null, value), delay);

    return deferred.promise._createdBy("promise.delay");

  })._createdWith("promise.delay");
};

/**
 * Passes a continuation to a Node function, which is called with the given
 * arguments provided as an array, and returns a promise.
 *
 *      Q.nfapply(FS.readFile, [__filename])
 *      .then(function (content) {
 *      })
 *
 */
Q.nfapply = function (callback, args) {
  return Q(callback).nfapply(args)._createdWith("Q.nfapply");
};

Promise.prototype.nfapply = function (args) {
  var deferred = defer();
  var nodeArgs = array_slice(args);
  nodeArgs.push(deferred.makeNodeResolver());
  var promise = this.fapply(nodeArgs)._createdBy("promise.nfapply");
  promise.fail(deferred.reject)._createdBy("promise.nfapply");
  return deferred.promise._createdWith("promise.nfapply");
};

/**
 * Passes a continuation to a Node function, which is called with the given
 * arguments provided individually, and returns a promise.
 * @example
 * Q.nfcall(FS.readFile, __filename)
 * .then(function (content) {
 * })
 *
 */
Q.nfcall = function (callback /*...args*/) {
  var args = array_slice(arguments, 1);
  return Q(callback).nfapply(args)._createdWith("Q.nfcall");
};

Promise.prototype.nfcall = function (/*...args*/) {
  var deferred = defer();
  var nodeArgs = array_slice(arguments);
  nodeArgs.push(deferred.makeNodeResolver());
  this.fapply(nodeArgs).fail(deferred.reject);
  return deferred.promise._createdWith("promise.nfcall");
};

/**
 * Wraps a NodeJS continuation passing function and returns an equivalent
 * version that returns a promise.
 * @example
 * Q.nfbind(FS.readFile, __filename)("utf-8")
 * .then(console.log)
 * .done()
 */
Q.nfbind =
Q.denodeify = function (callback /*...args*/) {
  var baseArgs = array_slice(arguments, 1);
  return function () {
    var nodeArgs = baseArgs.concat(array_slice(arguments));
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    Q(callback).fapply(nodeArgs).fail(deferred.reject);
    return deferred.promise._createdWith("Q.nfbind");
  };
};

Promise.prototype.nfbind =
Promise.prototype.denodeify = function (/*...args*/) {
  var args = array_slice(arguments);
  args.unshift(this);
  return Q.denodeify.apply(void 0, args)._createdWith("promise.nfbind");
};

Q.nbind = function (callback, thisp /*...args*/) {
  var baseArgs = array_slice(arguments, 2);
  return function () {
    var nodeArgs = baseArgs.concat(array_slice(arguments));
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    function bound() {
      return callback.apply(thisp, arguments);
    }
    Q(bound).fapply(nodeArgs).fail(deferred.reject);
    return deferred.promise._createdWith("Q.nbind");
  };
};

Promise.prototype.nbind = function (/*thisp, ...args*/) {
  var args = array_slice(arguments, 0);
  args.unshift(this);
  return Q.nbind.apply(void 0, args)._createdWith("promise.nbind");
};

/**
 * Calls a method of a Node-style object that accepts a Node-style
 * callback with a given array of arguments, plus a provided callback.
 * @param object an object that has the named method
 * @param {String} name name of the method of object
 * @param {Array} args arguments to pass to the method; the callback
 * will be provided by Q and appended to these arguments.
 * @returns a promise for the value or error
 */
Q.nmapply = // XXX As proposed by "Redsandro"
Q.npost = function (object, name, args) {
  return Q(object).npost(name, args)._createdWith("Q.npost");
};

Promise.prototype.nmapply = // XXX As proposed by "Redsandro"
Promise.prototype.npost = function (name, args) {
  var deferred = defer();
  var nodeArgs = array_slice(args || []);
  nodeArgs.push(deferred.makeNodeResolver());
  this.dispatch("post", [name, nodeArgs]).fail(deferred.reject);
  return deferred.promise._createdWith("promise.npost");
};

/**
 * Calls a method of a Node-style object that accepts a Node-style
 * callback, forwarding the given variadic arguments, plus a provided
 * callback argument.
 * @param object an object that has the named method
 * @param {String} name name of the method of object
 * @param ...args arguments to pass to the method; the callback will
 * be provided by Q and appended to these arguments.
 * @returns a promise for the value or error
 */
Q.nsend = // XXX Based on Mark Miller's proposed "send"
Q.nmcall = // XXX Based on "Redsandro's" proposal
Q.ninvoke = function (object, name /*...args*/) {
  var nodeArgs = array_slice(arguments, 2);
  var deferred = defer();
  nodeArgs.push(deferred.makeNodeResolver());
  Q(object).dispatch("post", [name, nodeArgs]).fail(deferred.reject);
  return deferred.promise._createdWith("Q.ninvoke");
};

Promise.prototype.nsend = // XXX Based on Mark Miller's proposed "send"
Promise.prototype.nmcall = // XXX Based on "Redsandro's" proposal
Promise.prototype.ninvoke = function (name /*...args*/) {
  var deferred = defer();
  var nodeArgs = array_slice(arguments, 1);
  nodeArgs.push(deferred.makeNodeResolver());
  this.dispatch("post", [name, nodeArgs]).fail(deferred.reject);
  return deferred.promise._createdWith("promise.ninvoke");
};

/**
 * If a function would like to support both Node continuation-passing-style and
 * promise-returning-style, it can end its internal promise chain with
 * `nodeify(nodeback)`, forwarding the optional nodeback argument.  If the user
 * elects to use a nodeback, the result will be sent there.  If they do not
 * pass a nodeback, they will receive the result promise.
 * @param object a result (or a promise for a result)
 * @param {Function} nodeback a Node.js-style callback
 * @returns either the promise or nothing
 */
Q.nodeify = nodeify;
function nodeify(value, nodeback) {
  return _Q(value, "Q.nodeify").nodeify(nodeback)._createdWith("Q.nodeify");
}

Promise.prototype.nodeify = function (nodeback) {

  if (nodeback) {

    var didFulfill = function (value) {
      Q.nextTick(function () {
        nodeback(null, value);
      });
    };

    var didReject = function (error) {
      Q.nextTick(function () {
        nodeback(error);
      });
    };

    return this.then(didFulfill, didReject)._createdWith("promise.nodeify");
  }

  return this;
};

Object.defineProperties(Promise.prototype, {

  "_createdWith": {
    value: function (createdWith) {
      if (Q.debug && this.createdBy != createdWith) { this.createdWith = createdWith; }
      return this;
    }
  },

  "_createdBy": {
    value: function (createdBy) {
      if (Q.debug && this.createdWith != createdBy) { this.createdBy = createdBy; }
      return this;
    }
  }
});

module.exports = Q;
