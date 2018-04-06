define(['parse'], function(Parse) {

    if (Parse.LiveQuery.__proto__.emit === undefined) {
        console.error('Could not find EventEmitter prototype on Parse.LiveQuery');
        return null;
    }

    var ColorParse = Object.create(Parse.LiveQuery.__proto__);
    // Default timeout for parse queries (in ms)
    ColorParse.timeout = 10000;

    // ------ Helper Methods ------

    var processPromise = function(promise, abortOnError) {
        var timeoutId = setTimeout(function() {
            ColorParse.emit('timeout');
        }, ColorParse.timeout);

        return promise.always(function(result) {
            clearTimeout(timeoutId);
            if (!(result instanceof Parse.Error)) {
                ColorParse.emit('query_success', result);
                return result;
            } else {
                result.abortOnError = abortOnError;
                ColorParse.emit('error', result);
                throw result;
            }
        });
    };

    var wrapPromiseMethod = function(name, proto, parentProto) {
        proto[name] = function() {
            return processPromise(
                parentProto[name].apply(this, arguments),
                this.abortOnError
            );
        };
    };

    var warpUserPromiseMethod = function(name, proto, parentProto) {
        var original = parentProto[name];
        proto[name] = function() {
            return processPromise(
                original.apply(this, arguments),
                this.abortOnError
            );
        };
    };

    // ------ Parse.Query Wrapper ------

    var Query = function() {
        Parse.Query.apply(this, arguments);
    };
    Query.prototype = Object.create(Parse.Query.prototype);
    Query.prototype.contstructor = Query;

    wrapPromiseMethod('count', Query.prototype, Parse.Query.prototype);
    wrapPromiseMethod('find', Query.prototype, Parse.Query.prototype);
    wrapPromiseMethod('first', Query.prototype, Parse.Query.prototype);
    wrapPromiseMethod('get', Query.prototype, Parse.Query.prototype);

    ColorParse.Query = Query;

    // ------ Parse.Object Wrapper ------
    // Note: You need to use Parse.Object.registerSubclass to register a
    // ColorParse.Object subclass for each Parse class you use.

    var Obj = function() {
        Parse.Object.apply(this, arguments);
    };
    Obj.prototype = Object.create(Parse.Object.prototype);
    Obj.prototype.contstructor = Obj;

    // This makes Parse.Object.extend use our prototype instead of its own
    // We can't use Parse.Object.extend to make this subclass as that would
    // break new ColorParse.Object('className').
    Obj.__super__ = Obj.prototype;

    Obj.extend = Parse.Object.extend;

    wrapPromiseMethod('destroy', Obj.prototype, Parse.Object.prototype);
    wrapPromiseMethod('fetch', Obj.prototype, Parse.Object.prototype);
    wrapPromiseMethod('save', Obj.prototype, Parse.Object.prototype);
    
    wrapPromiseMethod('destroyAll', Obj, Parse.Object);
    wrapPromiseMethod('fetchAll', Obj, Parse.Object);
    wrapPromiseMethod('fetchAllIfNeeded', Obj, Parse.Object);
    wrapPromiseMethod('saveAll', Obj, Parse.Object);

    ColorParse.Object = Obj;

    // ------ Parse.User Wrapper ------
    // Wrapping the user methods works differently, as the type is tightly
    // integrated with Parse. The Parse.User.extend modifies the type
    // in-place instead of actually extending it.

    var props = {};

    warpUserPromiseMethod('destroy', props, Parse.User.prototype);
    warpUserPromiseMethod('fetch', props, Parse.User.prototype);
    warpUserPromiseMethod('save', props, Parse.User.prototype);

    Parse.User.extend(props);
    ColorParse.User = Parse.User;

    // ------ Exports ------

    ColorParse.Promise = Parse.Promise;
    ColorParse.Cloud = Parse.Cloud;
    return ColorParse;
});