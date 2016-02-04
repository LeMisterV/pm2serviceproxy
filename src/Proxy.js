var http = require('http');
var URL = require('url');
var path = require('path');
var util = require('util');
var EventEmitter = require('events');

var chokidar = require('chokidar');
var httpProxy = require('http-proxy');
var jf = require('jsonfile');

var CustomError = require('./CustomError');

var pkg = require('../package.json');

function extend(target, values) {
    Object.keys(values).forEach(function(key) {
        target[key] = values[key];
    });
}

module.exports = Proxy;

function Proxy() {
    EventEmitter.call(this);
    this._init.apply(this, arguments);
}

Proxy.createServer = function(config) {
    return new Proxy(config);
};

util.inherits(Proxy, EventEmitter);

extend(Proxy.prototype, {
    _init: function _init(config) {
        this.serverConfig = config || {};
        this._targets = [];

        if (!this.serverConfig.routesDefinition) {
            throw new CustomError('Missing path for proxy config file');
        }

        if (!this.serverConfig.domain) {
            throw new CustomError('Missing domain name handled by proxy');
        }

        if (!this.serverConfig.range) {
            throw new CustomError('Missing target ports range definition');
        }

        this._portRange = this.serverConfig.range.split(',');

        this.serverConfig.routesDefinition = path.resolve(this.serverConfig.routesDefinition);

        this.server = http.createServer();

        this._initConfig();


        this.server.on('request', this._onRequest.bind(this));
        this.server.on('error', this._onServerError.bind(this));
        // this.server.on('clientError', this._onClientError.bind(this));
        this.server.on('listening', this._onServerListening.bind(this));
        // this.server.on('connection', this._onConnection.bind(this));
        // this.server.on('close', this._onClose.bind(this));
        // this.server.on('checkContinue', ...);
        // this.server.on('connect', ...);
        // this.server.on('upgrade', ...);

        this.proxy = httpProxy.createProxyServer();

        // this.proxy.on('proxyReq', this._onProxyRequest.bind(this));
        // this.proxy.on('proxyRes', ...);
        // this.proxy.on('open', ...);
        // this.proxy.on('close', ...);
        this.proxy.on('error', this._onProxyError.bind(this));
    },

    _initConfig: function _initConfig() {
        this._readConfig();
        this._watchConfig();
    },

    _readConfig: function _readConfig() {
        jf.readFile(this.serverConfig.routesDefinition, this._onConfigRead.bind(this));
    },

    _onConfigRead: function _onConfigRead(error, config) {
        if (error) {
            this.emit('targets_error', CustomError.wrap(error, 'Unable to read config file', {
                file: this.serverConfig.routesDefinition
            }));
            return;
        }

        this._targets = config;

        this.emit('targets_updated', this._targets);
    },

    _watchConfig: function _watchConfig() {
        chokidar.watch(this.serverConfig.routesDefinition, {
            persistent: false
        })
            .on('change', this._onConfigWatchEvent.bind(this))
            .on('error', this._onConfigWatchError.bind(this));
    },

    _onConfigWatchEvent: function _onConfigWatchEvent(event, filename) {
        this.emit('targets_changed', event, filename);
        this._readConfig();
    },

    _onConfigWatchError: function _onConfigWatchError(error) {
        this.emit('error', CustomError.wrap(error, 'Error while watching at proxy config file'));
    },

    _onServerError: function _onServerError(error) {
        if (error.code === 'EADDRINUSE') {
            this.emit('error', CustomError.wrap(error, 'Port already in use'));
        }

        else if (error.code === 'EACCES') {
            this.emit('error', CustomError.wrap(error, 'Access restricted on requested port'));
        }

        else {
            this.emit('error', CustomError.wrap(error));
        }
    },

    _onServerListening: function _onServerListening() {
        this.emit('listening', this.server.address().port);
    },

    _getTargetPort: function _getTargetPort(request) {
        var subdomainlen = request.headers.host.length - this.serverConfig.domain.length;
        if (subdomainlen <= 0 && request.headers.host.indexOf(this.serverConfig.domain) !== subdomainlen) {
            return;
        }

        var requested = request.headers.host.substr(0, subdomainlen - 1);

        var targetPort = this._targets[requested];

        if (targetPort < this._portRange[0] || targetPort > this._portRange[1]) {
            this.emit('proxy_error', new CustomError('configured port out of range', {
                port: targetPort
            }));
            return;
        }

        return targetPort;
    },

    _onRequest: function _onRequest(request, response) {
        var targetPort = this._getTargetPort(request);

        if (targetPort) {
            this.proxy.web(request, response, {
                target: {
                    host: '127.0.0.1',
                    port: targetPort
                }
            });
            return;
        }

        response.statusCode = 503;
        response.statusMessage = 'No such target service';
        response.end();
    },

    // _onConnection: function _onConnection(socket) {
    //     console.log('\nnew TCP connection');
    //     console.log('  on ' + socket.localAddress + ' port: ' + socket.localPort);
    //     console.log('  from ' + socket.remoteAddress + ' port: ' + socket.remotePort);

    //     socket.on('close', function() {
    //         console.log('\nTCP connection closed');
    //     });
    // },

    // _onClose: function _onClose() {
    //     console.log('server shutdown');
    // },
/*
    _onProxyRequest: function _onProxyRequest(proxyRequest, clientRequest, response, options) {
        proxyRequest.setHeader('X-Proxy-version', pkg.version);
        proxyRequest.setHeader('X-Proxy-original-localAddress', clientRequest.socket.localAddress);
        proxyRequest.setHeader('X-Proxy-original-localPort', clientRequest.socket.localPort);
        proxyRequest.setHeader('X-Proxy-original-remoteAddress', clientRequest.socket.remoteAddress);
        proxyRequest.setHeader('X-Proxy-original-remotePort', clientRequest.socket.remotePort);
    },
*/
/*
    onProxyResponse: function onProxyResponse(proxyResponse, clientRequest, response) {},

    onProxyOpen: function onProxyOpen(proxySocket) {
        console.log('proxyOpen');
    },

    onProxyClose: function onProxyClose(request, proxySocket, headers) {
        console.log('proxyClose');
    },
*/
    _onProxyError: function _onProxyError(error, request, response) {
        this.emit('proxy_error', error);
        response.writeHead(504, {
            'Content-Type': 'text/plain'
        });
        response.end('Something went wrong while transfering request to target');
    },

    listen: function listen(port, callback) {
        this.server.listen(port, callback);
    },

    close: function (callback) {
        this.server.close(callback);
    }
});

