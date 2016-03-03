'use strict';

angular.module('swaggerUiMaterial',
    [
        'swaggerUi',
        'ngMaterial',
        'ngSanitize',
        'toolbarSearch',
        'toolbarEdit',
        'truncate'
    ])
    // Derived from original swaggerUi directive
    .directive('swaggerUiMaterial', function ($location, $q, $log, $anchorScroll, $timeout, $window,
                                              loader, swaggerClient, swaggerModules,
                                              theme, style, httpInfoUtils) {
        return {
            restrict: 'A',
            templateUrl: 'views/main.html',
            scope: {
                url: '=',
                parser: '@?',
                loading: '=?',
                permalinks: '=?',
                apiExplorer: '=?',
                errorHandler: '=?',
                trustedSources: '=?',
                validatorUrl: '@?',
                theme: '=?'
            },
            link: function (scope) {
                if (angular.isUndefined(scope.validatorUrl)) {
                    scope.validatorUrl = 'http://online.swagger.io/validator';
                }

                scope.theme = theme.$configure(scope.theme);
                scope.style = style;
                scope.httpInfoUtils = httpInfoUtils;

                var swagger;

                // WARNING authentication is not implemented, please use 'api-explorer-transform' directive's param to customize API calls

                /**
                 * Load Swagger descriptor
                 */
                function loadSwagger (url, callback, onError) {
                    scope.loading = true;
                    loader.load(url, callback, onError);
                }

                /**
                 * Swagger descriptor has been loaded, launch parsing
                 */
                function swaggerLoaded (swaggerUrl, swaggerType) {
                    scope.loading = false;
                    var parseResult = {};
                    // execute modules
                    scope.parser = scope.parser || 'auto';
                    swaggerModules
                        .execute(swaggerModules.PARSE, scope.parser, swaggerUrl, swaggerType, swagger, scope.trustedSources, parseResult)
                        .then(function (executed) {
                            if (executed) {
                                swaggerParsed(parseResult);
                            } else {
                                onError({
                                    code: 415,
                                    message: 'no parser found for Swagger descriptor of type ' + swaggerType + ' and version ' + swagger.swagger
                                });
                            }
                        })
                        .catch(onError);
                }

                /**
                 * Swagger descriptor has parsed, launch display
                 */
                function swaggerParsed (parseResult) {
                    // execute modules
                    swaggerModules
                        .execute(swaggerModules.BEFORE_DISPLAY, parseResult)
                        .then(function () {
                            // display swagger UI
                            scope.infos = parseResult.infos;
                            scope.form = parseResult.form;
                            scope.resources = parseResult.resources;
                            if (scope.permalinks) {
                                $timeout(function () {
                                    $anchorScroll();
                                }, 100);
                            }
                        })
                        .catch(onError);
                }

                function onError (error) {
                    scope.loading = false;
                    if (angular.isFunction(scope.errorHandler)) {
                        scope.errorHandler(error.message, error.code);
                    } else {
                        $log.error(error.code, 'AngularSwaggerUI: ' + error.message);
                    }
                }

                scope.$watch('url', function (url) {
                    // reset
                    scope.infos = {};
                    scope.resources = [];
                    scope.form = {};
                    if (url && url !== '') {
                        if (scope.loading) {
                            // TODO cancel current loading swagger
                        }
                        // load Swagger descriptor
                        loadSwagger(url, function (data, status, headers) {
                            swagger = data;
                            // execute modules
                            swaggerModules
                                .execute(swaggerModules.BEFORE_PARSE, url, swagger)
                                .then(function () {
                                    var contentType = headers()['content-type'] || 'application/json';
                                    var swaggerType = contentType.split(';')[0];

                                    swaggerLoaded(url, swaggerType);
                                })
                                .catch(onError);
                        }, onError);
                    }
                });

                /**
                 * show all resource's operations as list or as expanded list
                 */
                scope.expand = function (resource, expandOperations) {
                    resource.open = true;
                    for (var i = 0, op = resource.operations, l = op.length; i < l; i++) {
                        op[i].open = expandOperations;
                    }
                };

                scope.permalink = function (name) {
                    if (scope.permalinks) {
                        $location.hash(name);
                        $timeout(function () {
                            $anchorScroll();
                        }, 50);
                    }
                };

                /**
                 * sends a sample API request
                 */
                scope.submitExplorer = function (operation) {
                    operation.loading = true;
                    swaggerClient
                        .send(swagger, operation, scope.form[operation.id])
                        .then(function (result) {
                            operation.loading = false;
                            operation.explorerResult = result;
                        });
                };

                // "Swagger UI Material" === "sum" namespace
                var sum = scope.sum = {};

                // Selected Operation === "sop"
                sum.sop = null;

                sum.selectOperation = function (op, $event) {
                    $event.stopPropagation();

                    var opening = !sum.sidenavOpen;
                    sum.sidenavOpen = true;
                    op.tab = op.tab || 0;

                    // fixes tab content width flickering (might be angular-material issue)
                    // and triggers .sum-fade animation
                    sum.omg = !opening;

                    $timeout(function () {
                        sum.sop = op;

                        $timeout(function () {
                            sum.omg = false;
                        }, 15);
                    }, 15);

                    // TODO: this is fixing not selected single "text/html" in produces,
                    // TODO: angular-swagger-ui probably setting this to "application/json" not present in op.produces
                    if ((op.produces.indexOf(scope.form[op.id].responseType)) === -1 && (op.produces.length === 1)) {
                        scope.form[op.id].responseType = op.produces[0];
                    }

                    op.responseArray = [];

                    if (op.responseClass && op.responseClass.status) {
                        op.responseArray.push({
                            code: op.responseClass.status,
                            description: op.responseClass.description
                        });
                    }

                    angular.forEach(op.responses, function (r, c) {
                        op.responseArray.push({
                            code: c,
                            description: r.description
                        });
                    });

                    op.responseArray.sort(function (a, b) {
                        a.code.toString().localeCompare(b.code.toString());
                    });
                };

                // Toggle
                sum.descriptions = false;

                // Expand/Collapse
                sum.open = function (open) {
                    angular.forEach(scope.resources, function (api) {
                        api.open = open;
                    });
                };

                sum.toggleApi = function (api, $event) {
                    $event.preventDefault();
                    $event.stopPropagation();

                    // Space bar does not stop propagation :-(
                    if (($event.keyCode || $event.which) === 32) {
                        return;
                    }

                    api.open = !api.open;
                };

                sum.sidenavOpen = false;
                sum.sidenavLockedOpen = false;

                sum.toggleSidenav = function () {
                    sum.sidenavLockedOpen = !sum.sidenavLockedOpen;
                };

                sum.explorerForm = {};

                sum.submit = function (operation) {
                    if (sum.explorerForm.$valid) {
                        // Commented for tab UI: operation.explorerResult = false;
                        operation.loading = true;

                        // TODO: this is replacing original scope.submitExplorer call,
                        // we need the send promise and the var swagger is inaccessible

                        var swagger = {
                            schemes: [scope.infos.scheme],
                            host: scope.infos.host,
                            basePath: scope.infos.basePath
                        };

                        swaggerClient
                            .send(swagger, operation, scope.form[operation.id])
                            .then(function (result) {
                                operation.loading = false;
                                operation.explorerResult = result;

                                if (result.response && result.response.status) {
                                    result.response.statusString = result.response.status.toString();
                                }

                                result.response.headerArray = [];

                                // TODO: result.response.headers is String object
                                if (result.response && result.response.headers) {
                                    result.response.headers = angular.fromJson(result.response.headers);

                                    for (var k in result.response.headers) {
                                        result.response.headerArray.push({
                                            name: k,
                                            value: result.response.headers[k]
                                        });
                                    }

                                    result.response.headerArray.sort(function (a, b) {
                                        a.name.localeCompare(b.name);
                                    });
                                }

                                // TODO: model with no content should be null or undefined
                                if (sum.sop.explorerResult.response.body === 'no content') {
                                    sum.sop.explorerResult.response.body = null;
                                }

                                var knownStatus = sum.sop.responseArray.find(
                                        function (i) {
                                            return i.code === sum.sop.explorerResult.response.status.toString();
                                        }
                                    ) || {};

                                sum.sop.explorerResult.response.statusArray = [{
                                    code: sum.sop.explorerResult.response.status.toString(),
                                    description: knownStatus.description || sum.getCodeInfo(sum.sop.explorerResult.response.status)[0]
                                }];

                                $timeout(function () {
                                    operation.tab = 1;
                                }, 50);
                            });
                    }
                };

                sum.openFile = function ($event) {
                    var text = sum.sop.explorerResult.response.body;
                    var type = sum.sop.explorerResult.response.headers['content-type'] || 'text/plain';
                    var out = new $window.Blob([text], {type: type});

                    $event.target.href = $window.URL.createObjectURL(out);
                };

                sum.grouped = true;
                sum.searchOpened = false;
                sum.searchFilter = '';
                sum.searchObject = {httpMethod: '', path: ''};
                sum.editUrl = scope.url;
                sum.editOpen = false;

                scope.$watch('sum.searchFilter', function () {
                    if (!sum.searchFilter) {
                        sum.searchObject = {httpMethod: '', path: ''};
                    } else {
                        var t = sum.searchFilter.toLowerCase().trim();
                        var s = t.split(' ');
                        var isMethod = (s.length) === 1 && scope.theme[s[0]];
                        var method = (s.length > 1) ? s[0] : (isMethod ? s[0] : '');
                        var path = (s.length > 1) ? s[1] : (isMethod ? '' : s[0]);

                        sum.searchObject = {httpMethod: method, path: path};
                    }
                });

                scope.$watch('sum.editOpen', function () {
                    if (!sum.editOpen) {
                        scope.url = sum.editUrl;
                    }
                });

                scope.$watch('infos', function () {
                    if (!scope.infos || !Object.keys(scope.infos).length) {
                        scope.metas = [];

                        return;
                    }

                    var i = scope.infos;
                    i.contact = i.contact || {};
                    i.license = i.license || {};

                    scope.metas = [
                        ['Contact', 'person', (i.contact.name && !i.contact.email) ? i.contact.name : null, null],
                        ['Email', 'email', i.contact.email ? (i.contact.name || i.contact.email) : null, 'mailto:' + i.contact.email + '?subject=' + i.title],
                        ['License', 'vpn_key', i.license.name || i.license.url, i.license.url],
                        ['Terms of service', 'work', i.termsOfService, i.termsOfService],
                        ['Host', 'home', i.scheme + '://' + i.host, i.scheme + '://' + i.host],
                        ['Base URL', 'link', i.basePath, (i.sheme ? (i.sheme + '://') : '') + i.host + i.basePath],
                        ['API version', 'developer_board', i.version, null],
                        ['Download', 'file_download', 'swagger.json', scope.url],
                        [null, 'code', ((scope.validatorUrl !== 'false') && scope.url) ? (scope.validatorUrl + '/debug?url=' + scope.url) : null, scope.validatorUrl + '?url=' + scope.url]
                    ];
                });
            }
        };
    });
