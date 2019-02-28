'use strict';

var owsCommon = require('@owstack/ows-common');
var keyLib = require('@owstack/key-lib');
var networkLib = require('@owstack/network-lib');
var Unit = networkLib.Unit;
var inherits = require('inherits');
var lodash = owsCommon.deps.lodash;
var $ = owsCommon.util.preconditions;

/**
 * For object definition see https://github.com/owstack/key-lib/blob/master/lib/unit.js
 */

var UNITS = [{
    name: 'Bitcoin Cash',
    shortName: 'BCH',
    code: 'BCH',
    accessor: 'BCH',
    kind: 'standard',
    value: 100000000,
    precision: {
      full: {
        maxDecimals: 8,
        minDecimals: 8
      },
      short: {
        maxDecimals: 6,
        minDecimals: 2
      }
    }
  }, {
    name: 'mBCH (1,000 mBCH = 1BCH)',
    shortName: 'mBCH',
    code: 'mBCH',
    accessor: 'mBCH',
    kind: 'millis',
    value: 100000,
    precision: {
      full: {
        maxDecimals: 5,
        minDecimals: 5
      },
      short: {
        maxDecimals: 3,
        minDecimals: 2
      }
    }
  }, {
    name: 'uBCH (1,000,000 uBCH = 1BCH)',
    shortName: 'uBCH',
    code: 'uBCH',
    accessor: 'uBCH',
    kind: 'micros',
    value: 100,
    precision: {
      full: {
        maxDecimals: 4,
        minDecimals: 4
      },
      short: {
        maxDecimals: 2,
        minDecimals: 1
      }
    }
  }, {
    name: 'bits (1,000,000 bits = 1BCH)',
    shortName: 'bits',
    code: 'bit',
    accessor: 'bits',
    kind: 'bits',
    value: 100,
    precision: {
      full: {
        maxDecimals: 2,
        minDecimals: 2
      },
      short: {
        maxDecimals: 0,
        minDecimals: 0
      }
    }
  }, {
    name: 'satoshi (100,000,000 satoshi = 1BCH)',
    shortName: 'sats',
    code: 'satoshi',
    accessor: 'satoshis',
    kind: 'atomic',
    value: 1,
    precision: {
      full: {
        maxDecimals: 0,
        minDecimals: 0
      },
      short: {
        maxDecimals: 0,
        minDecimals: 0
      }
    }
  }];

/**
 * Utility for handling and converting currency units. The supported units are
 * BCH, mBCH, bits (also named uBCH) and satoshis. A unit instance can be created with an
 * amount and a unit code, or alternatively using static methods like {fromBCH}.
 * It also allows to be created from a fiat amount and the exchange rate, or
 * alternatively using the {fromFiat} static method.
 * You can consult for different representation of a unit instance using it's
 * {to} method, the fixed unit methods like {toSatoshis} or alternatively using
 * the unit accessors. It also can be converted to a fiat amount by providing the
 * corresponding BCH/fiat exchange rate.
 *
 * @example
 * ```javascript
 * var sats = Unit.fromBCH(1.3).toSatoshis();
 * var mili = Unit.fromBits(1.3).to(Unit.mBCH);
 * var bits = Unit.fromFiat(1.3, 350).bits;
 * var bch = new Unit(1.3, Unit.bits).BCH;
 * ```
 *
 * @param {Number} amount - The amount to be represented
 * @param {String|Number} code - The unit of the amount or the exchange rate
 * @returns {Unit} A new instance of an Unit
 * @constructor
 */
function BchUnit(amount, code) {
  if (!(this instanceof BchUnit)) {
    return new BchUnit(amount, code);
  }

  Unit.apply(this, [UNITS, amount, code]);
};
inherits(BchUnit, Unit);

// Copy all static methods in our object.
Object.keys(Unit).forEach(function(key) {
  BchUnit[key] = Unit[key];
});

/**
 * Create unit statics.
 * Example BchUnit.BCH
 */
var unitKeys = lodash.map(UNITS, function(u) {
  return u.accessor;
});

unitKeys.forEach(function(key) {
  BchUnit[key] = key;
});

/**
 * Constructors.
 * Returns a Unit instance created from the standard unit of measure.
 *
 * @param {Number} amount - The amount in standard units
 * @returns {Unit} A Unit instance
 */
BchUnit.fromStandardUnit =
BchUnit.fromBCH = function(amount) {
  return new BchUnit(amount, BchUnit.BCH);
};

BchUnit.fromMillis = function(amount) {
  return new BchUnit(amount, BchUnit.mBCH);
};

BchUnit.fromMicro = function(amount) {
  return new BchUnit(amount, BchUnit.uBCH);
};

BchUnit.fromBits = function(amount) {
  return new BchUnit(amount, BchUnit.bits);
};

BchUnit.fromAtomicUnit =
BchUnit.fromSatoshis = function(amount) {
  return new BchUnit(amount, BchUnit.satoshis);
};

/**
 * Converters.
 * Returns the corresponding value from this Unit.
 *
 * @param {Number} amount - The amount in atomic units
 * @returns {Unit} A Unit instance
 */
BchUnit.prototype.toBCH = function() {
  return this.to(BchUnit.BCH);
};

BchUnit.prototype.toMillis = function() {
  return this.to(BchUnit.mBCH);
};

BchUnit.prototype.toMicro = function() {
  return this.to(BchUnit.uBCH);
};

BchUnit.prototype.toBits = function() {
  return this.to(BchUnit.bits);
};

BchUnit.prototype.toSatoshis = function() {
  return this.to(BchUnit.satoshis);
};

/**
 * Static to returns units.
 *
 * @returns {Array} All units.
 */
BchUnit.getUnits = function() {
  return UNITS;
};

/**
 * Returns a Unit instance created from a fiat amount and exchange rate.
 *
 * @param {Number} amount - The amount in fiat
 * @param {Number} rate - The exchange rate; example BTC/USD
 * @returns {Unit} A Unit instance
 */
BchUnit.fromFiat = function(amount, rate) {
  return new BchUnit(amount, rate);
};

/**
 * Returns a Unit instance created from JSON string or object
 *
 * @param {String|Object} json - JSON with keys: amount and code
 * @returns {Unit} A Unit instance
 */
BchUnit.fromObject = function(data) {
  $.checkArgument(lodash.isObject(data), 'Argument is expected to be an object');
  return new BchUnit(data.amount, data.code);
};

module.exports = BchUnit;
