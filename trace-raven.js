"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Raven = require("raven-js");
var http = require("http");
var platform = require("platform");
var trace = require("trace");
var app = require("application");
var utils = require("utils/utils");
var enums_1 = require("ui/enums");
var page_1 = require("ui/page");
var page = require("ui/page").Page;
var appversion = require("nativescript-appversion");
var orientation = require('nativescript-orientation');
require("nativescript-globalevents");
var TraceRaven = (function () {
    function TraceRaven(dsn, environment, enableAppBreadcrumbs) {
        if (environment === void 0) { environment = "debug"; }
        if (enableAppBreadcrumbs === void 0) { enableAppBreadcrumbs = true; }
        if (dsn === undefined || dsn === "") {
            throw new Error("Sentry DSN string required to configure Raven TraceWriter");
        }
        this.initRaven(dsn, environment, enableAppBreadcrumbs);
    }
    TraceRaven.prototype.write = function (message, category, type) {
        if (typeof (Raven) === "undefined")
            return;
        var ravenOptions = {};
        ravenOptions.level = "error";
        if (type === trace.messageType.log || type === trace.messageType.info) {
            ravenOptions.level = "info";
        }
        else if (type === trace.messageType.warn) {
            ravenOptions.level = "warning";
        }
        ravenOptions.tags = { trace_category: category };
        Raven.captureMessage(message, ravenOptions);
    };
    TraceRaven.prototype.initRaven = function (dsn, environment, enableAppBreadcrumbs) {
        var _this = this;
        Raven
            .config(dsn, {
            logger: 'nativescript',
            environment: environment,
            serverName: platform.device.uuid,
            tags: {
                device_type: platform.device.deviceType,
                device_lang: platform.device.language,
            },
            dataCallback: function (data) {
                data.contexts = {
                    device: {
                        family: platform.device.manufacturer,
                        model: platform.device.model,
                        orientation: enums_1.DeviceOrientation[orientation.getOrientation()],
                        battery_level: _this.batteryPercent
                    },
                    os: {
                        name: platform.device.os,
                        version: platform.device.osVersion
                    },
                    runtime: {
                        name: 'nativescript',
                        version: global.__runtimeVersion
                    }
                };
                return data;
            },
            transport: function (options) {
                var url = options.url + "?sentry_version=" + encodeURIComponent(options.auth.sentry_version) +
                    ("&sentry_client=" + encodeURIComponent(options.auth.sentry_client)) +
                    ("&sentry_key=" + encodeURIComponent(options.auth.sentry_key));
                http.request({
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Origin": "nativescript://"
                    },
                    url: url,
                    timeout: 2000,
                    content: JSON.stringify(options.data)
                })
                    .then(function (result) {
                    if (result.statusCode !== 200) {
                        throw new Error("Unexpcted HTTP status code (" + result.statusCode + ")");
                    }
                    options.onSuccess();
                })
                    .catch(function (err) {
                    var msg = "Raven Transport Error: " + err;
                    console.warn(msg);
                    options.onError(new Error(msg));
                });
            },
        })
            .install();
        if (enableAppBreadcrumbs) {
            this.initAutoCrumbs();
        }
        this.initAppVersion();
        this.initBatteryStatus();
    };
    TraceRaven.prototype.initAutoCrumbs = function () {
        page.on(page_1.Page.loadedEvent, function (args) {
            var p = args.object;
            Raven.captureBreadcrumb({
                message: "Page loaded",
                category: "debug",
                data: {
                    binding_context: p.bindingContext
                },
                level: "info"
            });
        });
        page.on(page_1.Page.navigatedToEvent, function (args) {
            var p = args.object;
            Raven.captureBreadcrumb({
                message: "App navigated to new page",
                category: "navigation",
                data: {
                    binding_context: p.bindingContext,
                    nav_context: p.navigationContext
                },
                level: "info"
            });
        });
        page.on(page_1.Page.shownModallyEvent, function (args) {
            var p = args.object;
            Raven.captureBreadcrumb({
                message: "Page shown modally",
                category: "navigation",
                data: {
                    binding_context: p.bindingContext,
                    nav_context: args.context
                },
                level: "info"
            });
        });
    };
    TraceRaven.prototype.initAppVersion = function () {
        appversion.getVersionName()
            .then(function (version) {
            Raven.setTagsContext({ app_version: version });
            Raven.setRelease(version);
        });
    };
    TraceRaven.prototype.initBatteryStatus = function () {
        var _this = this;
        if (platform.isAndroid) {
            app.android.registerBroadcastReceiver(android.content.Intent.ACTION_BATTERY_CHANGED, function (context, intent) {
                var level = intent.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1);
                var scale = intent.getIntExtra(android.os.BatteryManager.EXTRA_SCALE, -1);
                _this.batteryPercent = (level / scale) * 100.0;
            });
        }
        else {
            app.ios.addNotificationObserver(UIDeviceBatteryLevelDidChangeNotification, function (notification) {
                _this.batteryPercent = utils.ios.getter(UIDevice, UIDevice.currentDevice).batteryLevel * 100;
            });
        }
    };
    return TraceRaven;
}());
exports.TraceRaven = TraceRaven;
