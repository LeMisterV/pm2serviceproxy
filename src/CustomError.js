module.exports = CustomError;

function CustomError (errortype, data) {
  if (!errortype || !errortype.name || !errortype.message) {
    throw new CustomError(CustomError.INVALID_TYPE_DEFINITION);
  }

  Error.captureStackTrace(this, CustomError);

  this._type = errortype || CustomError.UNDEFINED_ERROR;
  this._data = data || {};
}

CustomError.prototype = assign(
  Object.create(Error.prototype),
  {
    get constructor () {
      return CustomError;
    },

    get type () {
      return this._type;
    },

    get data () {
      return this._data;
    },

    get name () {
      return this._type.name;
    },

    get message () {
      return this._type.message;
    },

    getErrors (map) {
      return getErrorsRecurcif(this, map);
    },

    is (type) {
      return this._type === type;
    }
  }
);

assign(CustomError,
  {
    UNDEFINED_ERROR: {
      name: 'UndefinedError',
      message: 'Undefined error'
    },

    INVALID_TYPE_DEFINITION: {
      name: 'Invalid error type definition',
      message: 'Error type definition should be an object defined with at least a name and a message'
    },

    match (error, errortype, data) {
      return (error instanceof CustomError) &&
        (!errortype || error.type === errortype) &&
        !Object.keys(data).some(valueConflict.bind(null, data, error.data));
    },

    wrapMulti (errors, errortype, data) {
      let error = new CustomError(errortype, data);
      error.data.originalErrors = errors;

      return error;
    },

    wrap (originalError, errortype, data) {
      data = data || {};

      if (CustomError.match(originalError, errortype, data)) {
        Object.assign(originalError.data, data);
        return originalError;
      }

      let error = new CustomError(errortype, data);
      error.data.originalError = originalError;

      return error;
    }
  }
);


function assign (to) {
  [].slice.call(arguments).slice(1).forEach((from) => {
    Object.keys(from).forEach((property) => {
      let descriptor = Object.getOwnPropertyDescriptor(from, property);

      if (descriptor && (!descriptor.writable || !descriptor.configurable || !descriptor.enumerable || descriptor.get || descriptor.set)) {
        Object.defineProperty(to, property, descriptor);
      }
      else {
        to[property] = from[property];
      }
    });
  });

  return to;
}

function getErrorsRecurcif (error, map) {
  if (map) {
    error = map(error);
  }

  if (!error) {
    return [];
  }

  let errors = [error];

  if (error.data) {
    if (error.data.originalError) {
      errors = getErrorsRecurcif(error.data.originalError, map).concat(errors);
    } else if (error.data.originalErrors) {
      error.data.originalErrors.reverse().forEach((error) => {
        errors = getErrorsRecurcif(error, map).concat(errors);
      });
    }
  }

  return errors;
}

// returns true if ref object differs from "this" on given key
// no conflict if the key is not defined on ref object
function valueConflict (obj1, obj2, key) {
  return (key in obj1) && (key in obj2) && (obj1[key] !== obj2[key]);
}
