var http = require('http');
var util = require('util');
var EventEmitter = require('events');

var httpProxy = require('http-proxy');

var CustomError = require('./CustomError');
var pm2ProcessLookup = require('./pm2ProcessLookup');

// var pkg = require('../package.json');

function extend (target, values) {
  Object.keys(values).forEach(function (key) {
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

util.inherits(Pm2HttpServiceProxy, EventEmitter);

extend(Pm2HttpServiceProxy.prototype, {
  _init: function _init () {
    this.server = http.createServer();

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

  _domainCache: {},

  _getTargetPort: function _getTargetPort (domain) {
    if (domain in this._domainCache) {
      return Promise.resolve(this._domainCache[domain]);
    }

    var willGetPort = pm2ProcessLookup.getPortForDomain(domain);

    willGetPort
      .then((port) => {
        this._domainCache[domain] = port;
        setTimeout(() => {
          delete this._domainCache[domain];
        }, 5000);
      });

    return willGetPort;
  },

  // _portGetterPattern: /^\/port\/(.+)$/,
  // _localAdresses: ['::ffff:127.0.0.1', '127.0.0.1'],

  _onRequest: function _onRequest (request, response) {
/*
    if (~this._localAdresses.indexOf(request.socket.remoteAddress) && request.url.substr(0, 6) === '/port/') {
      var match = this._portGetterPattern.exec(request.url);
      if (match) {
        pm2ProcessLookup.getPortForPm2Name('http--' + match[1], [8801, 8899], function (error, port) {
          if (error) {
            response.statusCode = 500;
            response.statusMessage = 'Unable to find requested port';
            response.end('Unable to find requested port');
            return;
          }

          response.end('' + port);
        });
        return;
      }
    }
*/
    this._getTargetPort(request.headers.host)
      .then((port) => {
        if (!port) {
          response.statusCode = 503;
          response.statusMessage = 'No such target service';
          response.end('No such target service');
          return;
        }

        this.proxy.web(request, response, {
          target: {
            host: '127.0.0.1',
            port: port
          }
        });
      });
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
    this.emit('proxy_error', error);
    response.writeHead(504, {
      'Content-Type': 'text/plain'
    });

    response.write(error.message);

    response.end('Something went wrong while transfering request to target');
  },

  listen: function listen (port, callback) {
    this.server.listen(port, callback);
  },

  close: function (callback) {
    this.server.close(callback);
  }
});
