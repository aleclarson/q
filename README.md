
# q v1.0.0

This is a customized fork of the renowned [kriskowal/q](https://github.com/kriskowal/q) repo.

It's compatible with both NodeJS and React Native.

Every change I've made aims to do at least one of these things:

&nbsp;&nbsp;&nbsp;&nbsp;
**A.** provide new functionality

&nbsp;&nbsp;&nbsp;&nbsp;
**B.** reduce boilerplate

&nbsp;&nbsp;&nbsp;&nbsp;
**C.** provide valuable debugging information.

&nbsp;

## install

```sh
npm install aleclarson/q#1.0.0
```

&nbsp;

## changelog

This is a list of every addition/modification provided by this fork.

&nbsp;

#### promise.id

A unique `Number` representing the order of when each `Promise` was made.

This will only be defined if this `Promise` was created while `Q.debug` was `true`.

&nbsp;

#### promise.state

An immutable `String` that represents the state of the `Promise`.

Possible values include `"pending"`, `"rejected"`, and `"fulfilled"`.

This will only be defined if this `Promise` was created while `Q.debug` was `true`.

&nbsp;

#### promise.stack

An `Array` of `StackFrame` objects from [aleclarson/stack](https://github.com/aleclarson/stack).

This will only be defined if this `Promise` was created while `Q.debug` was `true`.

&nbsp;

#### promise.createdWith

A mutable `String` that represents the method used to create this `Promise`.

```CoffeeScript
{ promise } = Q.defer()

promise.createdWith         # "Q.defer"

promise.then().createdWith  # "promise.then"
```

This will only be defined if this `Promise` was created while `Q.debug` was `true`.

&nbsp;

#### promise.createdBy

A mutable `String` that represents the method that made this `Promise` for internal use.

If this property equals `undefined`, this `Promise` was created outside of the `Q` library.

This property will only be defined if:

- `Q.debug` was `true` when this `Promise` was created

- A method in the `Q` library created it for internal use.

```CoffeeScript
{ promise } = Q.delay 100

promise.createdBy           # undefined

promise.previous.createdBy  # "Q.delay"
```

&nbsp;

#### promise.createdIn

The `Promise` that this `Promise` was created inside of.

This will equal `undefined` when this `Promise` was not created inside another `Promise`.

This will only be defined if this `Promise` was created while `Q.debug` was `true`.

&nbsp;

#### promise.previous

The `Promise` that comes before this `Promise`.

For example, if this `Promise` handles rejections and `promise.previous` throws an error, this `Promise` will be the one that handles the thrown error.

This will equal `undefined` when this `Promise` is created with `Q.defer()` or `Q.makePromise()`.

```CoffeeScript
deferred = Q.defer()

p1 = deferred.promise

p2 = p1.then()

p2.previous is p1        # true

p1.previous is undefined # true
```

This will only be defined if this `Promise` was created while `Q.debug` was `true`.

&nbsp;

#### promise.result

The `Promise` resolved from the result of this `Promise`'s handlers.

This equals `undefined` if an `Error` is thrown.

```CoffeeScript
deferred = Q.defer()

p1 = deferred.promise

p2 = p1.then()

p2.previous is p1        # true

p1.previous is undefined # true
```

This will only be defined if this `Promise` was created while `Q.debug` was `true`.

&nbsp;

#### promise.then(deferred)

```CoffeeScript
# What once was...
promise.then deferred.resolve, deferred.reject

# Now as easy as...
promise.then deferred
```

&nbsp;

#### promise.always(callback)

This replaces (and is identical to) `promise.fin()` and `promise.finally()`.

&nbsp;

#### error.promise

The first `Promise` inside which this `Error` was thrown.

Obviously, this will equal `undefined` if the `Error` was never thrown within a `Promise`'s handlers.

```CoffeeScript
deferred = Q.defer()

promise = deferred.promise.then ->
  throw Error()

promise.fail (error) ->
  error.promise is promise # true
```

&nbsp;

#### Q.debug

While this is `true`, new `Promise` instances will expose valuable debugging information.

Defaults to `false`.

&nbsp;

#### Q.verbose

While this is `true` and `Q.debug` is `true`, more debugging messages will be printed.

Defaults to `false`.

&nbsp;

#### Q.cache

While `Q.debug === true` and `Q.cache` has a value, all `Promise`s created will be stored using `promise.id` as the key.

**NOTE:** You may face memory problems if you leave `Q.cache` set for the whole duration of the program (especially long-running ones).

&nbsp;

#### Q.activePromise

The last `Promise` in `Q.activePromises`.

This will only be defined if `Q.debug` is `true`.

&nbsp;

#### Q.activePromises

An array of `Promise` instances that are currently active.

This will only be defined if `Q.debug` is `true`.

&nbsp;

#### Q.onRejection

You can set this to a `Function` if you want to know when a `Promise` is rejected.

Unlike `Q.onError`, setting `Q.onRejection` does **not** disable any built-in handling.

This is only called when `Q.debug` is `true`.

```CoffeeScript
Q.onRejection = (promise, error) ->
  # Do some debugging...
```

The `promise` argument is the `Promise` that was rejected.

The `error` argument is the `Error` that was thrown.

&nbsp;

#### Q.onBecome

You can set this to a `Function` if you want to be notified every time a scheduled `Promise` is starting.

This is only called when `Q.debug` is `true`.

```CoffeeScript
Q.onBecome = (promise, previous) ->
  # Do some debugging...
```

The `promise` argument is the `Promise` that is about to start.

The `previous` argument is the `Promise` that needed to resolve before `promise` could start.

&nbsp;

#### Q.onError

This is a simple rename from `Q.onerror` to `Q.onError`.

You can set this to a `Function` if you want to override the built-in error handling.

Currently, the built-in error handling automatically forwards thrown `Error` instances to the next `Promise` down the chain that can handle rejections.

```CoffeeScript
Q.onError = (error) ->
  # Do some debugging...
```

&nbsp;

## Deprecations

- Removed `promise.catch()`. Use `promise.fail()` exclusively.

- Removed `promise.allResolved()`. Use `promise.allSettled()` exclusively.

&nbsp;
