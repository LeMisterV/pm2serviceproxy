var http = require('http');
var util = require('util');
var EventEmitter = require('events');

var httpProxy = require('http-proxy');

var CustomError = require('./CustomError');
var pm2ProcessLookup = require('./pm2ProcessLookup');

// var pkg = require('../package.json');

function extend (target, values) {
  Object.keys(values).forEach((key) => {
    target[key] = values[key];
  });
}

module.exports = Pm2HttpServiceProxy;

function Pm2HttpServiceProxy () {
  EventEmitter.call(this);
  this._init.apply(this, arguments);
}

Pm2HttpServiceProxy.createServer = function createServer () {
  return new Pm2HttpServiceProxy();
};

// Emits events:
//  - listening
//  - info
//  - error
//  - request_error
//  - proxy_error

util.inherits(Pm2HttpServiceProxy, EventEmitter);

extend(Pm2HttpServiceProxy.prototype, {
  _domainCache: {},
  _domainCacheTimeout: 5000,

  _portGetterPattern: /^\/port\/([^\/]+)$/,
  _localAdresses: ['::ffff:127.0.0.1', '127.0.0.1'],

  _init: function _init (range) {
    this.range = range || pm2ProcessLookup.defaultRange;

    this.server = http.createServer();

    // net.Server events
    this.server.on('listening', this._onServerListening.bind(this));
    this.server.on('error', this._onServerError.bind(this));
    // this.server.on('connection', this._onConnection.bind(this));
    // this.server.on('close', this._onClose.bind(this));

    // http.Server events
    this.server.on('request', this._onRequest.bind(this));
    this.server.on('upgrade', this._onRequestUpgrade.bind(this));
    this.server.on('clientError', this._onClientError.bind(this));
    // this.server.on('checkContinue', ...);
    //
    // TODO: needed to handle CONNECT method... We should probably add support on this because this is a proxy server.
    // this.server.on('connect', ...);

    this.proxy = httpProxy.createProxyServer();

    // this.proxy.on('proxyReq', this._onProxyRequest.bind(this));
    // this.proxy.on('proxyReqWs', this._onProxyRequestWebsocket.bind(this));
    // this.proxy.on('proxyRes', ...);
    // this.proxy.on('open', ...);
    // this.proxy.on('close', ...);
    this.proxy.on('error', this._onProxyError.bind(this));
  },

  _onServerError: function _onServerError (error) {
    if (error.code === 'EADDRINUSE') {
      this.emit('error', CustomError.wrap(error, 'Port already in use'));
    } else if (error.code === 'EACCES') {
      this.emit('error', CustomError.wrap(error, 'Access restricted on requested port'));
    } else {
      this.emit('error', CustomError.wrap(error));
    }
  },

  _onServerListening: function _onServerListening () {
    this.emit('listening', this.server.address().port);
  },

  _onClientError: function _onClientError (error) {
    this.emit('request_error', CustomError.wrap(error, 'Error on request\'s socket'));
  },

  _onSearchPortRequest: function _onSearchPortRequest (request, response) {
    var match = this._portGetterPattern.exec(request.url);
    if (!match) {
      response.statusCode = 400;
      response.statusMessage = 'Unable to answer your request';
      response.end('Unable to answer your request');
      this.emit('request_error', new CustomError('port request not matching expected pattern', {
        request
      }));
      return;
    }

    var domain = match[1];

    pm2ProcessLookup.getPortForDomain(domain, this.range)
      .then((port) => {
        response.end('' + port);
        this.emit('info', 'port search finished with success', {
          domain,
          range: this.range,
          port
        });
      }, (error) => {
        response.statusCode = 500;
        response.statusMessage = 'Unable to find requested port';
        response.end('Unable to find requested port');
        this.emit('request_error', CustomError.wrap(error, 'unable to find a port for this domain', {
          domain,
          range: this.range
        }));
      });
  },

  _onRequest: function _onRequest (request, response) {
    if (request.url.substr(0, 6) === '/port/' && this._localAdresses.indexOf(request.socket.remoteAddress) !== -1) {
      return this._onSearchPortRequest(request, response);
    }

    this._getTargetPort(request.headers.host)
      .then((port) => {
        this.emit('info', 'request redirected', {
          domain: request.headers.host,
          port,
          request,
          response
        });

        this.proxy.web(request, response, {
          target: {
            host: '127.0.0.1',
            port
          }
        });
      }, () => {
        response.statusCode = 503;
        response.statusMessage = 'No such target service';
        response.end('No such target service');
      });
  },

  _onRequestUpgrade: function _onRequestUpgrade (request, socket, head) {
    this._getTargetPort(request.headers.host)
      .then((port) => {
        this.emit('info', 'websocket redirected', {
          domain: request.headers.host,
          port,
          request,
          socket,
          head
        });

        this.proxy.ws(request, socket, head, {
          target: {
            host: '127.0.0.1',
            port
          }
        });
      }, () => {
        socket.end('No such target service');
      });
  },

  _getTargetPort: function _getTargetPort (domain) {
    if (domain in this._domainCache) {
      var port = this._domainCache[domain];

      this.emit('info', 'domain\'s port resolved from cache', {
        domain,
        port
      });

      return Promise.resolve(port);
    }

    var willGetPort = pm2ProcessLookup.getPortForDomain(domain)
      .then(
        null,
        (error) => {
          error = CustomError.wrap(error, 'unable to find service process for this domain', { domain });
          this.emit('request_error', error);

          return Promise.reject(error);
        }
      );

    willGetPort
      .then((port) => {
        this.emit('info', 'domain\'s port resolved from pm2', {
          domain,
          port
        });

        this._domainCache[domain] = port;
        setTimeout(() => {
          delete this._domainCache[domain];
        }, this._domainCacheTimeout);
      });

    return willGetPort;
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
          proxyRequest.setHeader('X-Pm2HttpServiceProxy-version', pkg.version);
          proxyRequest.setHeader('X-Pm2HttpServiceProxy-original-localAddress', clientRequest.socket.localAddress);
          proxyRequest.setHeader('X-Pm2HttpServiceProxy-original-localPort', clientRequest.socket.localPort);
          proxyRequest.setHeader('X-Pm2HttpServiceProxy-original-remoteAddress', clientRequest.socket.remoteAddress);
          proxyRequest.setHeader('X-Pm2HttpServiceProxy-original-remotePort', clientRequest.socket.remotePort);
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
  _onProxyError: function _onProxyError (error, request, response) {
    error = CustomError.wrap(error, {
      request,
      response
    });

    this.emit('proxy_error', error);

    response.writeHead(504, {
      'Content-Type': 'text/plain'
    });

    response.write('Something went wrong while transfering request to target');
    response.write(error.message);

    response.end();
  },

  listen: function listen (port, callback) {
    this.server.listen(port, callback);
  },

  close: function (callback) {
    var count = 0;
    var finalError;

    function muxCallbacks (error) {
      count += 1;

      if (error) {
        error = CustomError.wrap(error);

        this.emit('error', error);

        if (!finalError) {
          finalError = error;
        } else {
          finalError = CustomError.wrapMulti([finalError, error], 'Errors while closing servers');
        }
      }

      if (count === 2) {
        return callback(finalError);
      }
    }

    this.emit('info', 'Closing pm2 proxy server');

    this.server.close(muxCallbacks);
    this.proxy.close(muxCallbacks);
  }
});
