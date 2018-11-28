function initBCBaker(){
  function loadNonces(){
    noncesToReveal = window.store2.get('bknonces', []);
  }
  function addNonce(n){
    noncesToReveal.push(n);
    window.store2.set('bknonces', noncesToReveal);
  }
  function revealNonces(keys, head){
    var newNonces = [];
    for (var i = 0; i < noncesToReveal.length; i++) {
      var startReveal = cycleToLevelStart(levelToCycle(noncesToReveal[i].level)+1);
      var endReveal = cycleToLevelEnd(levelToCycle(noncesToReveal[i].level)+1);
      if (head.header.level > endReveal) {
        logOutput("!Abandon nonce " + noncesToReveal[i].seed + " for level " + noncesToReveal[i].level);
        continue;
      } else if (head.header.level >= startReveal && noncesToReveal[i].revealed == false) {
        logOutput("!Revealing nonce " + noncesToReveal[i].seed + " for level " + noncesToReveal[i].level);
        reveal(keys, head, noncesToReveal[i]);
        continue;
      } else
      newNonces.push(noncesToReveal[i]);
    }
    if (newNonces.length != noncesToReveal.length){
      noncesToReveal = newNonces;
      window.store2.set('bknonces', noncesToReveal);
    }
  }
  function levelToCycle(l){
    return Math.floor((l-1)/window.CONSTANTS.cycle_length);
  }
  function cycleToLevelStart(c){
    return (c * window.CONSTANTS.cycle_length)+1;
  }
  function cycleToLevelEnd(c){
    return cycleToLevelStart(c) + window.CONSTANTS.cycle_length - 1;
  }
  //Run baker
  function run(keys){
    //Inject pending blocks
    var nb = [];
    for(var i = 0; i < pendingBlocks.length; i++){
      var bb = pendingBlocks[i];
      if (bb.level <= head.header.level) continue; //prune
      if (injectedBlocks.indexOf(bb.level) >= 0) continue; //prune
      if (dateToTime(getDateNow()) >= dateToTime(bb.timestamp)){
        injectedBlocks.push(bb.level);
        eztz.node.query('/injection/block?chain='+bb.chain_id, bb.data).then(function(hash){
          if (bb.seed){
            addNonce({
              hash : hash,
              seed_nonce_hash : bb.seed_nonce_hash,
              seed : bb.seed,
              level : bb.level,
              revealed : false
            });
            logOutput("+Injected block #" + hash + " at level " + bb.level + " with seed " + bb.seed);
          } else {
            logOutput("+Injected block #" + hash + " at level " + bb.level + " with no seed");
          }
        }).catch(function(e){
          e = JSON.parse(e);
          if (Array.isArray(e) && e.length && typeof e[0].operation != 'undefined'){
            badOps.push(e[0].operation);
          }
          if (Array.isArray(e) && e.length && typeof e[0].id != 'undefined'){
            logOutput(e[0].id, bb);
          }
          logOutput("-Failed to bake with error");
          console.error("Inject failed", e);
        });
      }
      else nb.push(bb);
    }
    pendingBlocks = nb;
    
    if (lockbaker) return;
    lockbaker = true;
    eztz.rpc.getHead().then(function(r){
      lockbaker = false;
      head = r;
      
      //Run revealer
      revealNonces(keys, head);
      
      //TODO: Run accuser
      
      //Standown for 1 block
      if (startLevel == 0){
        startLevel = head.header.level+1;
        logOutput("Initiate stand-down - starting at level " + startLevel);
      }
      if (startLevel > head.header.level) return;
      
      //Run endorser
      if (endorsedBlocks.indexOf(head.header.level) < 0){
        (function(h){
          eztz.node.query('/chains/'+h.chain_id+'/blocks/'+h.hash+'/helpers/endorsing_rights?level='+h.header.level+"&delegate="+keys.pkh).then(function(rights){
            if (h.header.level != head.header.level) {
              logOutput("Head changed!");
              return;
            }
            if (rights.length > 0){
              if (endorsedBlocks.indexOf(h.header.level) < 0) {  
                endorsedBlocks.push(h.header.level);
                endorse(keys, h, rights[0].slots).then(function(r){            
                  logOutput("+Endorsed block #" + h.hash + " (" + r + ")");
                }).catch(function(e){
                  logOutput("!Failed to endorse block #" + h.hash);
                });
              }
            }
          });
        }(head));
      }

      //Run baker
      if (bakedBlocks.indexOf(head.header.level+1) < 0){
        (function(h){
          eztz.node.query('/chains/'+h.chain_id+'/blocks/'+h.hash+'/helpers/baking_rights?level='+(h.header.level+1)+"&delegate="+keys.pkh).then(function(r){
            if (h.header.level != head.header.level) {
              logOutput("Head changed!");
              return;
            }
            if (bakedBlocks.indexOf(h.header.level+1) < 0){
              if (r.length <= 0){
                bakedBlocks.push((h.header.level+1));
                return "Nothing to bake this level";
              } else if (dateToTime(getDateNow()) >= (dateToTime(r[0].estimated_time) + 5) && r[0].level == (h.header.level+1)){
                bakedBlocks.push((h.header.level+1));
                logOutput("-Trying to bake "+r[0].level+"/"+r[0].priority+"... ("+r[0].estimated_time+")");
                return bake(keys, h, r[0].priority, r[0].estimated_time).then(function(r){
                  pendingBlocks.push(r);
                  return "-Added potential block for level " + (h.header.level+1);
                }).catch(function(e){
                  return "-Couldn't bake " + (h.header.level+1);
                });
              } else {
                return false
              }
            }
          }).then(function(r){
            if (r) logOutput(r);
            return r;
          }).catch(function(e){
            logOutput("!Error", e);
          });
        }(head));
      }
    
    }).catch(function(){
      lockbaker = false;
    });
  }
  //Baker functions
  function reveal(keys, head, nonce){
    var sopbytes;
    var opOb = {
        "branch": head.hash,
        "contents" : [
          {          
            "kind" : "seed_nonce_revelation",
            "level" : nonce.level,
            "nonce" : nonce.seed,
          }
      ]};
    return eztz.node.query('/chains/'+head.chain_id+'/blocks/'+head.hash+'/helpers/forge/operations', opOb)
    .then(function(f){ 
      var opbytes = f;
      opOb.protocol = head.protocol;
      if (keys.sk.substr(0,4) != 'edsk'){
        return window.tezledger.sign(keys.sk, "02"+eztz.utility.buf2hex(eztz.utility.b58cdecode(head.chain_id, eztz.prefix.Net))+opbytes).then(function(rr){
          sopbytes = opbytes + rr.signature
          opOb.signature = window.eztz.utility.b58cencode(window.eztz.utility.hex2buf(rr.signature), window.eztz.prefix.edsig);
          return eztz.node.query('/chains/'+head.chain_id+'/blocks/'+head.hash+'/helpers/preapply/operations',  [opOb]);
        });
      } else {      
        var signed = eztz.crypto.sign(opbytes, keys.sk, eztz.utility.mergebuf(eztz.watermark.endorsement, eztz.utility.b58cdecode(head.chain_id, eztz.prefix.Net)));
        sopbytes = signed.sbytes;
        var oh = eztz.utility.b58cencode(eztz.library.sodium.crypto_generichash(32, eztz.utility.hex2buf(sopbytes)), eztz.prefix.o);
        opOb.signature = signed.edsig;
        return eztz.node.query('/chains/'+head.chain_id+'/blocks/'+head.hash+'/helpers/preapply/operations',  [opOb]);
      }
    })
    .then(function(f){
      return eztz.node.query('/injection/operation',sopbytes);
    })
    .then(function(f){
      logOutput("!Nonce has been revealed for level " + nonce.level);
      nonce.revealed = true;
      //addNonce(nonce);
      return f
    }).catch(function(e){
      logOutput("!Couldn't reveal nonce for " + nonce.level);
      logOutput(e)
      addNonce(nonce);
    });
  }
  function endorse(keys, head, slots){
    var sopbytes;
    var opOb = {
        "branch": head.hash,
        "contents" : [
          {          
            "kind" : "endorsement",
            "level" : head.header.level,
          }
      ]};
    return eztz.node.query('/chains/'+head.chain_id+'/blocks/'+head.hash+'/helpers/forge/operations', opOb)
    .then(function(f){ 
      var opbytes = f;
      opOb.protocol = head.protocol;
      if (keys.sk.substr(0,4) != 'edsk'){
        return window.tezledger.sign(keys.sk, "02"+eztz.utility.buf2hex(eztz.utility.b58cdecode(head.chain_id, eztz.prefix.Net))+opbytes).then(function(rr){
          sopbytes = opbytes + rr.signature
          opOb.signature = window.eztz.utility.b58cencode(window.eztz.utility.hex2buf(rr.signature), window.eztz.prefix.edsig);
          return eztz.node.query('/chains/'+head.chain_id+'/blocks/'+head.hash+'/helpers/preapply/operations',  [opOb]);
        });
      } else {      
        var signed = eztz.crypto.sign(opbytes, keys.sk, eztz.utility.mergebuf(eztz.watermark.endorsement, eztz.utility.b58cdecode(head.chain_id, eztz.prefix.Net)));
        sopbytes = signed.sbytes;
        var oh = eztz.utility.b58cencode(eztz.library.sodium.crypto_generichash(32, eztz.utility.hex2buf(sopbytes)), eztz.prefix.o);
        opOb.signature = signed.edsig;
        return eztz.node.query('/chains/'+head.chain_id+'/blocks/'+head.hash+'/helpers/preapply/operations',  [opOb]);
      }
    })
    .then(function(f){
      return eztz.node.query('/injection/operation',sopbytes);
    })
    .then(function(f){
      return f
    }).catch(function(e){logOutput(e)});
  }
  function bake(keys, head, priority, timestamp){
    var operations = [[],[],[],[]],
    seed = '',
    seed_hex = '',
    nonce_hash = '',
    newLevel = head.header.level+1;
    
    if ((newLevel) % (window.CONSTANTS.commitment) === 0){
      var seed = eztz.utility.hexNonce(64),
      seed_hash = eztz.library.sodium.crypto_generichash(32, eztz.utility.hex2buf(seed));
      nonce_hash = eztz.utility.b58cencode(seed_hash, eztz.prefix.nce);
      seed_hex = eztz.utility.buf2hex(seed_hash);
      logOutput("Nonce required for level " + newLevel);
    }
    
    return eztz.node.query('/chains/'+head.chain_id+'/'+window.CONSTANTS.mempool).then(function(r){
      var addedOps = [], endorsements = [], transactions = [];
      for(var i = 0; i < r.applied.length; i++){
        if (addedOps.indexOf(r.applied[i].hash) <0) {
          if (r.applied[i].branch != head.hash) continue;
          if (badOps.indexOf(r.applied[i].hash) >= 0) continue;
          if (operationPass(r.applied[i]) == 3) continue;//todo fee filter
          addedOps.push(r.applied[i].hash);
          operations[operationPass(r.applied[i])].push({
            "protocol" : head.protocol,
            "branch" : r.applied[i].branch,
            "contents" : r.applied[i].contents,
            "signature" : r.applied[i].signature,
          });
        }
      }
      var header = {
          "protocol_data": {
            protocol : head.protocol,
            priority : priority,
            proof_of_work_nonce : "0000000000000000",
            signature : "edsigtXomBKi5CTRf5cjATJWSyaRvhfYNHqSUGrn4SdbYRcGwQrUGjzEfQDTuqHhuA8b2d8NarZjz8TRf65WkpQmo423BtomS8Q"
          },
          "operations": operations,
      };
      if (nonce_hash != "") header.protocol_data.seed_nonce_hash = nonce_hash;
      return eztz.node.query('/chains/'+head.chain_id+'/blocks/'+head.hash+'/helpers/preapply/block?sort=true&timestamp='+Math.max(dateToTime(getDateNow()), dateToTime(timestamp)), header).then(function(r){
        return r;
      }).catch(function(e){
        console.error("Preapply failed", e);
        logOutput("!Couldn't bake - send 0 op bake instead");
        header.operations = [[],[],[],[]];
        return eztz.node.query('/chains/'+head.chain_id+'/blocks/'+head.hash+'/helpers/preapply/block?sort=true&timestamp='+Math.max(dateToTime(getDateNow()), dateToTime(timestamp)), header);
      });
    }).then(function(r){
      logOutput("!Starting POW...");
      var shell_header = r.shell_header, operations = r.operations;
      return new Promise(function(resolve, reject) {
        shell_header['protocol_data'] = createProtocolData(priority);
        ops = [];
        for(var i = 0; i < operations.length; i++){
          var oo = [];
          for(var ii = 0; ii < operations[i].applied.length; ii++){
            oo.push(
            {
              branch : operations[i].applied[ii].branch,
              data : operations[i].applied[ii].data,
            });
          }
          ops.push(oo);
        }
        operations = ops;
        eztz.node.query('/chains/'+head.chain_id+'/blocks/'+head.hash+'/helpers/forge_block_header', shell_header).then(function(r){
          var forged = r.block, signed, sopbytes;
          forged = forged.substring(0, forged.length - 22);
          var start = new Date().getTime();
          powLoop(forged, priority, seed_hex, function(blockbytes, att){
            var secs = ((new Date().getTime() - start)/1000).toFixed(3);
            logOutput("+POW found in " + att + " attemps (" + secs + " seconds - "+(att/secs)/1000+"Kh/s)");
            if (keys.sk.substr(0,4) != 'edsk'){
              window.tezledger.sign(keys.sk, "01"+eztz.utility.buf2hex(eztz.utility.b58cdecode(head.chain_id, eztz.prefix.Net))+blockbytes).then(function(rr){
                sopbytes = blockbytes + rr.signature
                resolve({
                  data : sopbytes,
                  operations : operations,
                });
              });
            } else {
              signed = eztz.crypto.sign(blockbytes, keys.sk, eztz.utility.mergebuf(eztz.watermark.block, eztz.utility.b58cdecode(head.chain_id, eztz.prefix.Net)));
              sopbytes = signed.sbytes;
              resolve({
                data : sopbytes,
                operations : operations,
              });
            }
          });
        });
      });
    }).then(function(r){
      return {
        timestamp : timestamp,
        data : r,
        seed_nonce_hash : seed_hex,
        seed : seed,
        level : newLevel,
        chain_id : head.chain_id
      };
    });
  }
  
  //Utility
  function powLoop(forged, priority, seed_hex, cb){
    var pdd = createProtocolData(priority, window.BAKECHAIN_POWHEADER, '00000000', seed_hex),
    blockbytes = forged + pdd,
    hashBuffer = eztz.utility.hex2buf(blockbytes + "00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"),
    forgedLength = forged.length/2,
    priorityLength = 2,
    powHeaderLength = 4,
    protocolOffset = forgedLength + priorityLength + powHeaderLength,
    powLength = 4,
    syncBatchSize = 2000;
    (function powLoopHelper(att, syncAtt) {
      att++;
      syncAtt++;
      for (var i = powLength-1; i >= 0; i--) {
        if (hashBuffer[protocolOffset+i] == 255) hashBuffer[protocolOffset+i] = 0;
        else {
          hashBuffer[protocolOffset+i]++;
          break;
        }
      }
      if (checkHash(hashBuffer)) {
        var hex = eztz.utility.buf2hex(hashBuffer);
        hex = hex.substr(0, hex.length-128);
        cb(hex, att);
      } else {
        if (syncAtt < syncBatchSize) {
          powLoopHelper(att, syncAtt);
        } else {
          setImmediate(powLoopHelper, att, 0);
        }
      }
    })(0, 0);
  }
  function createProtocolData(priority, powHeader, pow, seed){
    if (typeof seed == "undefined") seed = "";
    if (typeof pow == "undefined") pow = "";
    if (typeof powHeader == "undefined") powHeader = "";
    return priority.toString(16).padStart(4,"0") + 
    powHeader.padEnd(8, "0") + 
    pow.padEnd(8, "0") + 
    (seed ? "ff" + seed.padEnd(64, "0") : "00") +
    '';
  }
  function checkHash(buf){
    rr = eztz.library.sodium.crypto_generichash(32, buf);
    return (stampcheck(rr) <= window.CONSTANTS.threshold);
  }
  function stampcheck(s){
    var value = 0;
    for (var i = 0; i < 8; i++) {
        value = (value * 256) + s[i];
    }
    return value;
  }
  //Utility Functions
  function dateToTime(dd){return (new Date(dd).getTime()/1000)};
  function getDateNow(){return new Date().toISOString().substr(0,19)+"Z"};
  function operationPass(applied) {
    if (applied.contents.length == 1) {
      switch (applied.contents[0].kind) {
      case 'endorsement':
        return 0;
        break;
      case 'proposals':
      case 'ballot':
        return 1;
        break;
      case 'seed_nonce_revelation':
      case 'double_endorsement_evidence':
      case 'double_baking_evidence':
      case 'activate_account':
        return 2;
        break;
      default:
        return 3;
      }
    } else {
      return 3;
    }
  }
  var startLevel = 0, bkint = false, injectedBlocks = [], lockbaker = false, head, pendingBlocks = [], badOps = [], endorsedBlocks = [], noncesToReveal = [], lastLevel = 0, bakedBlocks = [], logOutput = function(e){    
    if (typeof window.DEBUGMODE != 'undefined' && window.DEBUGMODE)
      console.log(e);
  };
  var Store = require('electron-store');
  window.store2 = new Store();
  loadNonces();
  return {
    start : function(keys){
      logOutput("Starting baker...");
      if (bkint) {
        clearInterval(bkint);
        bkint = false;
      }
      run(keys);
      bkint = setInterval(function() { run(keys); }, 1000)
      return bkint;
    },
    stop : function(){
      logOutput("Stopping baker...");
      if (bkint) {
        clearInterval(bkint);
        bkint = false;
      }
    },
    test : function(){
      logOutput("Testing baker...");
      var tests = [];
      for (i = 0; i < 5; i++){
        tests[i] = [];
        for (ii = 0; ii < 131; ii++){
          tests[i].push(Math.floor(Math.random()*256));
        }
      }
      return new Promise(function(resolve, reject){
        var start = new Date().getTime();
        powLoop(eztz.utility.buf2hex(tests[0]), 0, "4e07e55960daee56883d231b3c41f223733f58be90b5a1ee2147df8de5b8ac86", function(b, a1){
          powLoop(eztz.utility.buf2hex(tests[1]), 0, "4e07e55960daee56883d231b3c41f223733f58be90b5a1ee2147df8de5b8ac86", function(b, a2){
            powLoop(eztz.utility.buf2hex(tests[2]), 0, "4e07e55960daee56883d231b3c41f223733f58be90b5a1ee2147df8de5b8ac86", function(b, a3){
              powLoop(eztz.utility.buf2hex(tests[3]), 0, "4e07e55960daee56883d231b3c41f223733f58be90b5a1ee2147df8de5b8ac86", function(b, a4){
                powLoop(eztz.utility.buf2hex(tests[4]), 0, "4e07e55960daee56883d231b3c41f223733f58be90b5a1ee2147df8de5b8ac86", function(b, a5){
                  var a = a1 + a2 + a3 + a4 + a5;
                  var secs = ((new Date().getTime() - start)/1000).toFixed(3);
                  var hash = (a/secs)/1000;
                  resolve(hash);
                });
              });
            });
          });
        });
      });
    }
  }
}
BCBaker = initBCBaker();