'use strict';

var owsCommon = require('@owstack/ows-common');
var keyLib = require('@owstack/key-lib');
var Buffer = owsCommon.deps.Buffer;
var Base32 = owsCommon.encoding.Base32;
var Base58Check = owsCommon.encoding.Base58Check;
var BN = owsCommon.BN;
var convertBits = require('./util/convertBits');
var errors = owsCommon.errors;
var Hash = owsCommon.Hash;
var JSUtil = owsCommon.util.js;
var Networks = require('./networks');
var PublicKey = keyLib.PublicKey;
var lodash = owsCommon.deps.lodash;
var $ = owsCommon.util.preconditions;

/**
 * Instantiate an address from an address String or Buffer, a public key or script hash Buffer,
 * or an instance of {@link PublicKey} or {@link Script}.
 *
 * This is an immutable class, and if the first parameter provided to this constructor is an
 * `Address` instance, the same argument will be returned.
 *
 * An address has two key properties: `network` and `type`. The type is either
 * `Address.PayToPublicKeyHash` (value is the `'pubkeyhash'` string)
 * or `Address.PayToScriptHash` (the string `'scripthash'`). The network is an instance of {@link Network}.
 * You can quickly check whether an address is of a given kind by using the methods
 * `isPayToPublicKeyHash` and `isPayToScriptHash`
 *
 * @example
 * ```javascript
 * // validate that an input field is valid
 * var error = Address.getValidationError(input, 'testnet');
 * if (!error) {
 *   var address = Address(input, 'testnet');
 * } else {
 *   // invalid network or checksum (typo?)
 *   var message = error.messsage;
 * }
 *
 * // get an address from a public key
 * var address = Address(publicKey, 'testnet').toString();
 * ```
 *
 * @param {*} data - The encoded data in various formats
 * @param {Network|String|number=} network - One of the supported networks
 * @param {string=} type - The type of address: 'script' or 'pubkey'
 * @returns {Address} A new valid and frozen instance of an Address
 * @constructor
 */
function Address(data, network, type) {
  /* jshint maxcomplexity: 12 */
  /* jshint maxstatements: 20 */

  if (!(this instanceof Address)) {
    return new Address(data, network, type);
  }

  if (lodash.isArray(data) && lodash.isNumber(network)) {
    return Address.createMultisig(data, network, type);
  }

  if (data instanceof Address) {
    // Immutable instance
    return data;
  }

  $.checkArgument(data, 'First argument is required, please include address data.', 'guide/address.html');
  if (network && !Networks.get(network)) {
    throw new TypeError('Second argument must be a supported network.');
  }

  if (type && (type !== Address.PayToPublicKeyHash && type !== Address.PayToScriptHash)) {
    throw new TypeError('Third argument must be "pubkeyhash" or "scripthash".');
  }

  var info = this._classifyArguments(data, network, type);

  // set defaults if not set
  info.network = info.network || Networks.get(network) || Networks.defaultNetwork; 
  info.type = info.type || type || Address.PayToPublicKeyHash;

  JSUtil.defineImmutable(this, {
    hashBuffer: info.hashBuffer,
    network: info.network,
    type: info.type
  });

  return this;
}

/**
 * Internal function used to split different kinds of arguments of the constructor
 * @param {*} data - The encoded data in various formats
 * @param {Network|String|number=} network - One of the supported networks
 * @param {string=} type - The type of address: 'script' or 'pubkey'
 * @returns {Object} An "info" object with "type", "network", and "hashBuffer"
 */
Address.prototype._classifyArguments = function(data, network, type) {
  /* jshint maxcomplexity: 10 */
  // transform and validate input data
  if ((data instanceof Buffer || data instanceof Uint8Array) && data.length === 20) {
    return Address._transformHash(data);
  } else if ((data instanceof Buffer || data instanceof Uint8Array) && data.length === 21) {
    return Address._transformBuffer(data, network, type);
  } else if (data instanceof PublicKey) {
    return Address._transformPublicKey(data);
  } else if (data instanceof Script) {
    return Address._transformScript(data, network);
  } else if (typeof(data) === 'string') {
    return Address._transformString(data, network, type);
  } else if (lodash.isObject(data)) {
    return Address._transformObject(data);
  } else {
    throw new TypeError('First argument is an unrecognized data format.');
  }
};

/** @static */
Address.PayToPublicKeyHash = 'pubkeyhash';
/** @static */
Address.PayToScriptHash = 'scripthash';

/**
 * @param {Buffer} hash - An instance of a hash Buffer
 * @returns {Object} An object with keys: hashBuffer
 * @private
 */
Address._transformHash = function(hash) {
  var info = {};
  if (!(hash instanceof Buffer) && !(hash instanceof Uint8Array)) {
    throw new TypeError('Address supplied is not a buffer.');
  }
  if (hash.length !== 20) {
    throw new TypeError('Address hashbuffers must be exactly 20 bytes.');
  }
  info.hashBuffer = hash;
  return info;
};

/**
 * Deserializes an address serialized through `Address#toObject()`
 * @param {Object} data
 * @param {string} data.hash - the hash that this address encodes
 * @param {string} data.type - either 'pubkeyhash' or 'scripthash'
 * @param {Network=} data.network - the name of the network associated
 * @return {Address}
 */
Address._transformObject = function(data) {
  $.checkArgument(data.hash || data.hashBuffer, 'Must provide a `hash` or `hashBuffer` property');
  $.checkArgument(data.type, 'Must provide a `type` property');
  return {
    hashBuffer: data.hash ? new Buffer(data.hash, 'hex') : data.hashBuffer,
    network: Networks.get(data.network) || Networks.defaultNetwork,
    type: data.type
  };
};

/**
 * Internal function to discover the network and type based on the first data byte
 *
 * @param {Buffer} buffer - An instance of a hex encoded address Buffer
 * @returns {Object} An object with keys: network and type
 * @private
 */
Address._classifyFromVersion = function(buffer) {
  var version = {};

  var pubkeyhashNetwork = Networks.get(buffer[0], 'prefix.pubkeyhash');
  var scripthashNetwork = Networks.get(buffer[0], 'prefix.scripthash');

  if (pubkeyhashNetwork) {
    version.network = pubkeyhashNetwork;
    version.type = Address.PayToPublicKeyHash;
  } else if (scripthashNetwork) {
    version.network = scripthashNetwork;
    version.type = Address.PayToScriptHash;
  }

  return version;
};

/**
 * Internal function to transform a bitcoin cash address buffer
 *
 * @param {Buffer} buffer - An instance of a hex encoded address Buffer
 * @param {string=} network - One of the supported networks
 * @param {string=} type - The type: 'pubkeyhash' or 'scripthash'
 * @returns {Object} An object with keys: hashBuffer, network and type
 * @private
 */
Address._transformBuffer = function(buffer, network, type) {
  /* jshint maxcomplexity: 9 */
  var info = {};
  if (!(buffer instanceof Buffer) && !(buffer instanceof Uint8Array)) {
    throw new TypeError('Address supplied is not a buffer.');
  }
  if (buffer.length !== 1 + 20) {
    throw new TypeError('Address buffers must be exactly 21 bytes.');
  }

  var bufferVersion = Address._classifyFromVersion(buffer);

  // If no network is specified then a mismatch cannot be detected.
  if (network) {
    network = Networks.get(network);

    if (!network) {
      throw new TypeError('Unknown network');      
    }

    if (!bufferVersion.network || (network && network !== bufferVersion.network)) {
      throw new TypeError('Address has mismatched network type.');
    }
  }

  if (!bufferVersion.type || (type && type !== bufferVersion.type)) {
    throw new TypeError('Address has mismatched type.');
  }

  info.hashBuffer = buffer.slice(1);
  info.network = bufferVersion.network;
  info.type = bufferVersion.type;
  return info;
};

/**
 * Internal function to transform a {@link PublicKey}
 *
 * @param {PublicKey} pubkey - An instance of PublicKey
 * @returns {Object} An object with keys: hashBuffer, type
 * @private
 */
Address._transformPublicKey = function(pubkey) {
  var info = {};
  if (!(pubkey instanceof PublicKey)) {
    throw new TypeError('Address must be an instance of PublicKey.');
  }
  info.hashBuffer = Hash.sha256ripemd160(pubkey.toBuffer());
  info.type = Address.PayToPublicKeyHash;
  return info;
};

/**
 * Internal function to transform a {@link Script} into a `info` object.
 *
 * @param {Script} script - An instance of Script
 * @returns {Object} An object with keys: hashBuffer, type
 * @private
 */
Address._transformScript = function(script, network) {
  $.checkArgument(script instanceof Script, 'script must be a Script instance');
  var info = script.getAddressInfo(network);
  if (!info) {
    throw new errors.Script.CantDeriveAddress(script);
  }
  return info;
};

/**
 * Creates a P2SH address from a set of public keys and a threshold.
 *
 * The addresses will be sorted lexicographically, as that is the trend in bitcoin cash.
 * To create an address from unsorted public keys, use the {@link Script#buildMultisigOut}
 * interface.
 *
 * @param {Array} publicKeys - a set of public keys to create an address
 * @param {number} threshold - the number of signatures needed to release the funds
 * @param {String|Network} network - either a Network instance or string name
 * @return {Address}
 */
Address.createMultisig = function(publicKeys, threshold, network) {
  network = network || publicKeys[0].network || Networks.defaultNetwork;
  return Address.payingTo(Script.buildMultisigOut(publicKeys, threshold), network);
};

function protocolToArray(protocol) {
  var result = [];
  for (var i=0; i<protocol.length; i++) {
    result.push(protocol.charCodeAt(i) & 31);
  }
  return result;
};

function decodeCashAddress(address) {
  function hasSingleCase(string) {
    var lowerCase = string.toLowerCase();
    var upperCase = string.toUpperCase();
    var hasSingleCase  = string === lowerCase || string === upperCase;
    return hasSingleCase;
  };

  function validChecksum(protocol, payload) {
    var protocolData = protocolToArray(protocol).concat([0]);
    return polymod(protocolData.concat(payload)).eqn(0);
  };

  $.checkArgument(hasSingleCase(address), 'Mixed case');
  address = address.toLowerCase();

  var pieces = address.split(':');
  $.checkArgument(pieces.length <= 2, 'Invalid format:' + address);

  var protocol, encodedPayload;

  if (pieces.length === 2) {
    protocol = pieces[0];
    encodedPayload = pieces[1];
  } else {
    protocol = null;
    encodedPayload = pieces[0];
  }

  var payload = Base32.decode(encodedPayload.toLowerCase());

  if (protocol) {
    $.checkArgument(validChecksum(protocol, payload), 'Invalid checksum:' + address);
  } else {

    var netNames = ['livenet', 'testnet', 'regtest'];
    var i;

    while(!protocol && (i = netNames.shift())){
      var p  =  Networks.get(i).protocol;
      if(validChecksum(p, payload)) {
        protocol = p;
      }
    }
    $.checkArgument(protocol, 'Invalid checksum:'+ address);
  }

  var convertedBits = convertBits(payload.slice(0, -8), 5, 8, true);
  var versionByte = convertedBits.shift();
  var hash = convertedBits;

  $.checkArgument(getHashSize(versionByte) === hash.length * 8, 'Invalid hash size:' + address);

  function getType(versionByte) {
    switch (versionByte & 120) {
    case 0:
      return 'pubkeyhash';
    case 8:
      return 'scripthash';
    default:
      throw new Error('Invalid address type in version byte:' + versionByte);
    }
  }

  var type = getType(versionByte);
  var network = Networks.get(protocol);

  var info = {};
  info.hashBuffer = new Buffer(hash);
  info.network = network;
  info.type = type;
  return info;
};

/**
 * Internal function to transform a bitcoin cash address string
 *
 * @param {string} data
 * @param {String|Network=} network - either a Network instance or string name
 * @param {string=} type - The type: 'pubkeyhash' or 'scripthash'
 * @returns {Object} An object with keys: hashBuffer, network and type
 * @private
 */
Address._transformString = function(data, network, type) {
  if (typeof(data) !== 'string') {
    throw new TypeError('data parameter supplied is not a string.');
  }
  if (data.length < 34) {
    throw new Error('Invalid Address string provided');
  }
  data = data.trim();
  var networkObj = Networks.get(network);

  if (network && !networkObj) {
    throw new TypeError('Unknown network');
  }

  if (data.length > 35) {
    var info = decodeCashAddress(data);
    if (!info.network || (networkObj && networkObj.name !== info.network.name)) {
      throw new TypeError('Address has mismatched network type.');
    }
    if (!info.type || (type && type !== info.type)) {
      throw new TypeError('Address has mismatched type.');
    }
    return info;
  } else {
    // Not supporting legacy addresses.
    throw new Error('Invalid Address string provided');
    /*
    var addressBuffer = Base58Check.decode(data);
    // Legacy addr
    return Address._transformBuffer(addressBuffer, network, type);
    */
  }
};

/**
 * Will return an address for the private key
 *
 * @param {PrivateKey} data
 * @param {Network=} network - optional parameter specifying
 * the desired network for the address
 *
 * @returns {Address} An address generated from the private key
 */
Address.fromPrivateKey = function(data, network) {
  var pubkey = data.toPublicKey();
  network = network || Networks.defaultNetwork.code;
  return Address.fromPublicKey(pubkey, network);
};

/**
 * Instantiate an address from a PublicKey instance
 *
 * @param {PublicKey} data
 * @param {String|Network} network - either a Network instance or string name
 * @returns {Address} A new valid and frozen instance of an Address
 */
Address.fromPublicKey = function(data, network) {
  var info = Address._transformPublicKey(data);
  network = Networks.get(network) || Networks.defaultNetwork;
  return new Address(info.hashBuffer, network, info.type);
};

/**
 * Instantiate an address from a ripemd160 public key hash
 *
 * @param {Buffer} hash - An instance of buffer of the hash
 * @param {String|Network} network - either a Network instance or string name
 * @returns {Address} A new valid and frozen instance of an Address
 */
Address.fromPublicKeyHash = function(hash, network) {
  var info = Address._transformHash(hash);
  return new Address(info.hashBuffer, network, Address.PayToPublicKeyHash);
};

/**
 * Instantiate an address from a ripemd160 script hash
 *
 * @param {Buffer} hash - An instance of buffer of the hash
 * @param {String|Network} network - either a Network instance or string name
 * @returns {Address} A new valid and frozen instance of an Address
 */
Address.fromScriptHash = function(hash, network) {
  $.checkArgument(hash, 'hash parameter is required');
  var info = Address._transformHash(hash);
  return new Address(info.hashBuffer, network, Address.PayToScriptHash);
};

/**
 * Builds a p2sh address paying to script. This will hash the script and
 * use that to create the address.
 * If you want to extract an address associated with a script instead,
 * see {{Address#fromScript}}
 *
 * @param {Script} script - An instance of Script
 * @param {String|Network} network - either a Network instance or string name
 * @returns {Address} A new valid and frozen instance of an Address
 */
Address.payingTo = function(script, network) {
  $.checkArgument(script, 'script is required');
  $.checkArgument(script instanceof Script, 'script must be instance of Script');

  return Address.fromScriptHash(Hash.sha256ripemd160(script.toBuffer()), network);
};

/**
 * Extract address from a Script. The script must be of one
 * of the following types: p2pkh input, p2pkh output, p2sh input
 * or p2sh output.
 * This will analyze the script and extract address information from it.
 * If you want to transform any script to a p2sh Address paying
 * to that script's hash instead, use {{Address#payingTo}}
 *
 * @param {Script} script - An instance of Script
 * @param {String|Network} network - either a Network instance or string name
 * @returns {Address} A new valid and frozen instance of an Address
 */
Address.fromScript = function(script, network) {
  $.checkArgument(script instanceof Script, 'script must be a Script instance');
  var info = Address._transformScript(script, network);
  return new Address(info.hashBuffer, network, info.type);
};

/**
 * Instantiate an address from a buffer of the address
 *
 * @param {Buffer} buffer - An instance of buffer of the address
 * @param {String|Network=} network - either a Network instance or string name
 * @param {string=} type - The type of address: 'script' or 'pubkey'
 * @returns {Address} A new valid and frozen instance of an Address
 */
Address.fromBuffer = function(buffer, network, type) {
  var info = Address._transformBuffer(buffer, network, type);
  return new Address(info.hashBuffer, info.network, info.type);
};

/**
 * Instantiate an address from an address string
 *
 * @param {string} str - An string of the bitcoin cash address
 * @param {String|Network=} network - either a Network instance or string name
 * @param {string=} type - The type of address: 'script' or 'pubkey'
 * @returns {Address} A new valid and frozen instance of an Address
 */
Address.fromString = function(str, network, type) {
  var info = Address._transformString(str, network, type);
  return new Address(info.hashBuffer, info.network, info.type);
};

/**
 * Instantiate an address from a cashaddr string
 *
 * @param {string} str - A string of the bitcoin cashaddr
 * @returns {Address} A new valid and frozen instance of an Address
 */
Address.fromCashaddrString = function(str) {
  var legacyAddress = bchaddr.toLegacyAddress(str);
  var network = bchaddr.detectAddressNetwork(str);
  var type = 'scripthash';
  if (bchaddr.isP2PKHAddress(str)) {
      type = 'pubkeyhash';
  }
  return Address.fromString(legacyAddress, network, type);
};

/**
 * Instantiate an address from an Object
 *
 * @param {string} json - A JSON string or Object with keys: hash, network and type
 * @returns {Address} A new valid instance of an Address
 */
Address.fromObject = function fromObject(obj) {
  $.checkState(
    JSUtil.isHexa(obj.hash),
    'Unexpected hash property, "' + obj.hash + '", expected to be hex.'
  );
  var hashBuffer = new Buffer(obj.hash, 'hex');
  return new Address(hashBuffer, obj.network, obj.type);
};

/**
 * Will return a validation error if exists
 *
 * @example
 * ```javascript
 * // a network mismatch error
 * var error = Address.getValidationError('15vkcKf7gB23wLAnZLmbVuMiiVDc1Nm4a2', 'testnet');
 * ```
 *
 * @param {string} data - The encoded data
 * @param {String|Network} network - either a Network instance or string name
 * @param {string} type - The type of address: 'script' or 'pubkey'
 * @returns {null|Error} The corresponding error message
 */
Address.getValidationError = function(data, network, type) {
  var error;
  try {
    /* jshint nonew: false */
    new Address(data, network, type);
  } catch (e) {
    error = e;
  }
  return error;
};

/**
 * Will return a boolean if an address is valid
 *
 * @example
 * ```javascript
 * assert(Address.isValid('bitcoincash:qqmq4ua630cqumzt29ml2jmy8gesega95cjctx4j02', 'livenet'));
 * ```
 *
 * @param {string} data - The encoded data
 * @param {String|Network} network - either a Network instance or string name
 * @param {string} type - The type of address: 'script' or 'pubkey'
 * @returns {boolean} The corresponding error message
 */
Address.isValid = function(data, network, type) {
  return !Address.getValidationError(data, network, type);
};

/**
 * Returns true if an address is of pay to public key hash type
 * @return boolean
 */
Address.prototype.isPayToPublicKeyHash = function() {
  return this.type === Address.PayToPublicKeyHash;
};

/**
 * Returns true if an address is of pay to script hash type
 * @return boolean
 */
Address.prototype.isPayToScriptHash = function() {
  return this.type === Address.PayToScriptHash;
};

/**
 * Will return a buffer representation of the address
 *
 * @returns {Buffer} Bitcoin Cash address buffer
 */
Address.prototype.toBuffer = function() {
  var version = new Buffer([this.network.prefix[this.type]]);
  var buf = Buffer.concat([version, this.hashBuffer]);
  return buf;
};

/**
 * @returns {Object} A plain object with the address information
 */
Address.prototype.toObject = Address.prototype.toJSON = function toObject() {
  return {
    hash: this.hashBuffer.toString('hex'),
    type: this.type,
    network: this.network.toString()
  };
};

/**
 * Will return a the string representation of the address
 *
 * @returns {string} Bitcoin Cash address
 */
Address.prototype.toString = Address.prototype.toCashAddress;
/**
 * TODO: remove
 * Legacy
Address.prototype.toString = function() {
  return Base58Check.encode(this.toBuffer());
};
 */

/**
 * Will return a string formatted for the console
 *
 * @returns {string} Bitcoin Cash address
 */
Address.prototype.inspect = function() {
  return '<Address: ' + this.toString() + ', type: ' + this.type + ', network: ' + this.network.alias + '>';
};

/**
 * With some modification, the following functions are copied from https://github.com/bitcoincashjs/cashaddrjs.
 *
 * @license
 * https://github.com/bitcoincashjs/cashaddr
 * Copyright (c) 2017 Emilio Almansi
 * Distributed under the MIT software license, see the accompanying
 * file LICENSE or http://www.opensource.org/licenses/mit-license.php.
 */

/**
 * Will return a cashaddr representation of the address. Always return lower case
 * Can be converted by the caller to uppercase is needed (still valid).
 *
 * @returns {string} Bitcoin Cash address
 */
Address.prototype.toCashAddress = function(stripProtocol) {
  function getTypeBits(type) {
    switch (type) {
      case 'pubkeyhash':
        return 0;
      case 'scripthash':
        return 8;
      default:
        throw new Error('Invalid type:'+ type);
    }
  };

  function getHashSizeBits(hash) {
    switch (hash.length * 8) {
      case 160:
        return 0;
      case 192:
        return 1;
      case 224:
        return 2;
      case 256:
        return 3;
      case 320:
        return 4;
      case 384:
        return 5;
      case 448:
        return 6;
      case 512:
        return 7;
      default:
        throw new Error('Invalid hash size:'+ hash.length);
      }
  };

  var eight0 = [0,0,0,0, 0,0,0,0];
  var protocolData = protocolToArray(this.network.protocol).concat([0]);
  var versionByte = getTypeBits(this.type) + getHashSizeBits(this.hashBuffer);
  var arr =  Array.prototype.slice.call(this.hashBuffer, 0);
  var payloadData = convertBits([versionByte].concat(arr), 8, 5);
  var checksumData = protocolData.concat(payloadData).concat(eight0);
  var payload = payloadData.concat(checksumToArray(polymod(checksumData)));

  if(stripProtocol === true) {
    return Base32.encode(payload);
  } else {
    return this.network.protocol + ':' + Base32.encode(payload);
  }
};

/**
 * Will return a string representation of the address.
 *
 * @returns {string} address
 */
Address.prototype.toString = Address.prototype.toCashAddress;

/***
 * Retrieves the the length in bits of the encoded hash from its bit
 * representation within the version byte.
 *
 * @param {number} versionByte
 */
function getHashSize(versionByte) {
  switch (versionByte & 7) {
  case 0:
    return 160;
  case 1:
    return 192;
  case 2:
    return 224;
  case 3:
    return 256;
  case 4:
    return 320;
  case 5:
    return 384;
  case 6:
    return 448;
  case 7:
    return 512;
  }
};

/**
 * Returns an array representation of the given checksum to be encoded
 * within the address' payload.
 *
 * @param {BigInteger} checksum Computed checksum.
 */
function checksumToArray(checksum) {
  var result = [];
  var N31 = new BN(31);
  for (var i = 0; i < 8; ++i) {
    result.push(checksum.and(N31).toNumber());
    checksum = checksum.shrn(5);
  }
  return result.reverse();
};

/**
 * Computes a checksum from the given input data as specified for the CashAddr
 * format: https://github.com/Bitcoin-UAHF/spec/blob/master/cashaddr.md.
 *
 * @param {Array} data Array of 5-bit integers over which the checksum is to be computed.
 */
var GENERATOR = lodash.map(
  [0x98f2bc8e61, 0x79b76d99e2, 0xf33e5fb3c4, 0xae2eabe2a8, 0x1e4f43e470], function(x) {
    return new BN(x);
  }
);

function polymod(data) {
  var checksum = new BN(1);
  var C = new BN(0x07ffffffff);

  for (var j=0; j<data.length; j++) {
    var value = data[j];
    var topBits = checksum.shrn(35);

    checksum = checksum.and(C);
    checksum = checksum.shln(5).xor(new BN(value));

    for (var i = 0; i < GENERATOR.length; ++i) {
      var D = topBits.shrn(i).and(BN.One);
      if (D.eqn(1)) {
        checksum = checksum.xor(GENERATOR[i]);
      }
    }
  }
  return checksum.xor(BN.One);
};

/**
 * end license
 * Copyright (c) 2017 Emilio Almansi
 */

module.exports = Address;

var Script = require('./script');
