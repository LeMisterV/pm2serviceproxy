module.exports = CustomError;

function CustomError (code, message, data) {
  Error.captureStackTrace(this, CustomError);

  var args = parseSignature(arguments);

  this.name = 'CustomError';
  this.code = args.code;
  this.message = args.message;
  this.data = args.data || {};
}

CustomError.prototype = Object.create(Error.prototype);
CustomError.prototype.constructor = CustomError;

CustomError.prototype.getErrors = function getErrors (map) {
  var data = this.data;
  var errors = [];
  while (data && data.originalError) {
    errors.push(data.originalError);
    data = data.originalError.data;
  }

  if (map) {
    errors = errors
      .map(map)
      .filter(function (error) {
        return !!error;
      });
  }

  return errors;
};

CustomError.wrapMulti = function wrapMultipleErrors (errors, code, message, data) {
  var args = parseSignature([].slice.call(arguments, 1));

  args.data = args.data || {};

  args.data.originalErrors = errors;

  return new CustomError(args.code, args.message, args.data);
};

CustomError.wrap = function wrapError (error, code, message, data) {
  var args = parseSignature([].slice.call(arguments, 1));

  args.data = args.data || {};

  if (error instanceof CustomError && !hasConflicts(error, args.code, args.message, args.data)) {
    Object.keys(args.data).forEach(function (key) {
      error.data[key] = args.data[key];
    });

    return error;
  }

  args.data.originalError = error;

  if (args.code === undefined && error.code) {
    args.code = error.code;
  }

  return new CustomError(args.code, args.message || error.message, args.data);
};

function parseSignature (args) {
  var result = {};

  if (!args.forEach) {
    args = [].slice.call(args);
  }

  args.forEach(function (arg) {
    switch (typeof arg) {
      case 'string':
        result.message = arg;
        break;
      case 'number':
        result.code = arg;
        break;
      case 'object':
        result.data = arg;
        break;
    }
  });

  return result;
}

// returns true if ref object differs from "this" on given key
// no conflict if the key is not defined on ref object
function valueConflict (ref, key) {
  return (key in ref) && (ref[key] !== this[key]);
}

function hasConflicts (ref, code, message, data) {
  return !!(
    // checks code conflicts
    (code !== undefined) && (code !== ref.code)) ||
    // than message conflicts
    (message && message !== ref.message) ||
    // than data conflicts
    Object.keys(data).some(valueConflict.bind(data, ref.data)
  );
}
