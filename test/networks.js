'use strict';

var expect = require('chai').expect;
var should = require('chai').should();

var owsCommon = require('@owstack/ows-common');
var bchLib = require('..');
var Networks = bchLib.Networks;
var lodash = owsCommon.deps.lodash;

describe('Networks', function() {

  it('will get network based on string code value', function() {
    var network = Networks.get('bch');
    network.should.equal(Networks.livenet);
    network.should.equal(Networks.mainnet);
    network.should.equal(Networks.defaultNetwork);
    var network = Networks.get('bchreg');
    network.should.equal(Networks.regtest);
    var network = Networks.get('bchtest');
    network.should.equal(Networks.testnet);
  });

  it('should change the default network', function() {
    Networks.defaultNetwork.should.equal(Networks.livenet);
    Networks.defaultNetwork = Networks.testnet;
    Networks.defaultNetwork.should.equal(Networks.testnet);
    Networks.defaultNetwork = Networks.get('bch');
    Networks.defaultNetwork.should.equal(Networks.livenet);
  });

  var constants = [
    'currency',
    'description',
    'name',
    'coinIndex',
    'protocol',
    'prefix.pubkeyhash',
    'prefix.privatekey',
    'prefix.scripthash', 
    'version.xpubkey',
    'version.xprivkey',
    'networkMagic'];

  constants.forEach(function(key) {
    it('should have constant ' + key + ' for all networks', function() {
      lodash.has(Networks.get('bch'), key).should.equal(true);
      lodash.has(Networks.get('bchreg'), key).should.equal(true);
      lodash.has(Networks.get('bchtest'), key).should.equal(true);
    });
  });

  it('tests only for the specified key', function() {
    expect(Networks.get(0x00, 'prefix.pubkeyhash')).to.equal(Networks.get('bch'));
    // Testnet and Regtest have the same pubkeyhash value.
    expect(Networks.get(0x6f, 'prefix.pubkeyhash').alias).to.equal(Networks.get('bchtest').alias);
    expect(Networks.get(0x6f, 'prefix.pubkeyhash').alias).to.equal(Networks.testnet.alias);
    expect(Networks.get(0xa0, 'prefix.privatekey')).to.equal(undefined);
  });

  it('can test for multiple keys', function() {
    expect(Networks.get(0x00, ['prefix.pubkeyhash', 'prefix.scripthash'])).to.equal(Networks.get('bch'));
    // Testnet and Regtest have the same pubkeyhash value.
    expect(Networks.get(0x6f, ['prefix.pubkeyhash', 'prefix.scripthash']).alias).to.equal(Networks.get('bchtest').alias);
    expect(Networks.get(0xc4, ['prefix.pubkeyhash', 'prefix.scripthash']).alias).to.equal(Networks.get('bchtest').alias);
    expect(Networks.get(0xa0, ['prefix.privatekey', 'port'])).to.equal(undefined);
  });

  it('converts to string using the "name" property', function() {
    Networks.get('bch').toString().should.equal('bch');
  });

  it('network object should be immutable', function() {
    expect(Networks.get('bch').name).to.equal('bch')
    var fn = function() { Networks.get('bch').name = 'Something else' }
    expect(fn).to.throw(TypeError)
  });

});
