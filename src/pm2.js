'use strict';

const EventEmitter = require('events');

const pm2core = require('pm2');
const emitter = new EventEmitter();

const pm2 = {
  emitter: emitter,

  _releaseAccess () {
    pm2._releaseTimeout = setTimeout(() => {
      emitter.emit('message', 'disconnect from pm2 daemon');
      delete pm2._releaseTimeout;
      delete pm2._willGetAccess;
      pm2core.disconnect();
    }, 100);
  },

  _getAccess () {
    if (pm2._releaseTimeout) {
      clearTimeout(pm2._releaseTimeout);
      delete pm2._releaseTimeout;
    }

    if (pm2._willGetAccess) {
      return pm2._willGetAccess;
    }

    pm2._willGetAccess = new Promise((resolve, reject) => {
      emitter.emit('message', 'connecting to pm2 daemon');

      pm2core.connect((err) => {
        if (err) {
          delete pm2._willGetAccess;
          return reject(err);
        }

        resolve();
      });
    });

    return pm2._willGetAccess;
  },

  _getList () {
    if (pm2._willGetList) {
      return pm2._willGetList;
    }

    pm2._willGetList = new Promise((resolve, reject) => {
      emitter.emit('message', 'getting pm2 process list');

      pm2core.list((err, list) => {
        delete pm2._willGetList;
        if (err) {
          return reject(err);
        }

        resolve(list);
      });
    });

    return pm2._willGetList;
  },

  getProcessList () {
    let willGetList = pm2._getAccess()
      .then(pm2._getList);

    willGetList.then(pm2._releaseAccess);

    return willGetList;
  }
};

module.exports = pm2;
