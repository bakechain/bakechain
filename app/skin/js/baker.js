var startLevel = 0, bkint = false, injectedBlocks = [], lockbaker = false, head, pendingBlocks = [], badOps = [], endorsedBlocks = [], noncesToReveal = [], lastLevel = 0, bakedBlocks = [], logOutput = function(e){    
  if (typeof window.DEBUGMODE != 'undefined' && window.DEBUGMODE)
    console.log(e);
};
function runBaker(keys){
  console.log(keys);
  if (bkint) {
    clearInterval(bkint);
    bkint = false;
  }
  run(keys);
  bkint = setInterval(function() { run(keys); }, 1000)
  return bkint;
}
function stopBaker(){
  if (bkint) {
    clearInterval(bkint);
    bkint = false;
  }
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
          noncesToReveal.push({
            hash : hash,
            seed_nonce_hash : bb.seed_nonce_hash,
            seed : bb.seed,
            level : bb.level
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
          console.log(e[0].id, bb);
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
    if (lastLevel < head.header.level) {
      lastLevel = head.header.level;
      logOutput("-Current level " + head.header.level + " (" + getDateNow() + ")");
      if ((head.header.level-1) % window.CONSTANTS.cycle_length === 0) {
        logOutput(noncesToReveal.length + " nonces to reveal...");
        if (noncesToReveal.length > 0){
          //TODO: Lets reveal the nonce now
        }
      }
    }
    
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
            } else if (dateToTime(getDateNow()) >= (dateToTime(r[0].estimated_time)) && r[0].level == (h.header.level+1)){
              bakedBlocks.push((h.header.level+1));
              logOutput("-Trying to bake "+r[0].level+"/"+r[0].priority+"... ("+r[0].estimated_time+")");
              return bake(keys, h, r[0].priority, r[0].estimated_time).then(function(r){
                pendingBlocks.push(r);
                return "-Added potential bake for level " + (h.header.level+1);
              }).catch(function(e){
                //TODO: Add retry
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
    var seed = eztz.utility.hexNonce(32),
    seed_hash = eztz.library.sodium.crypto_generichash(32, eztz.utility.hex2buf(seed));
    nonce_hash = eztz.utility.b58cencode(seed_hash, eztz.prefix.nce);
    seed_hex = eztz.utility.buf2hex(seed_hash);
  }
  
  return eztz.node.query('/chains/'+head.chain_id+'/'+window.CONSTANTS.mempool).then(function(r){
    var addedOps = [], endorsements = [], transactions = [];
    for(var i = 0; i < r.applied.length; i++){
      if (addedOps.indexOf(r.applied[i].hash) <0) {
        if (r.applied[i].branch != head.hash) continue;
        if (badOps.indexOf(r.applied[i].hash) >= 0) continue;
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
        var forged = r.block, signed, sopbytes, start = new Date().getTime();;
        forged = forged.substring(0, forged.length - 22);
        powLoop(forged, priority, seed_hex, function(blockbytes, att){
          var secs = ((new Date().getTime() - start)/1000).toFixed(3);
          logOutput("+POW found in " + att + " attemps (" + secs + " seconds - "+(att/secs)/1000+"Kh/s)");
          if (keys.sk.substr(0,4) != 'edsk'){
            console.log("Bake", blockbytes);
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
function powLoop(forged, priority, seed_hex, cb){
  var pdd = createProtocolData(priority, '0000000000000000', seed_hex),
  blockbytes = forged + pdd,
  hashBuffer = eztz.utility.hex2buf(blockbytes + "00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"),
  forgedLength = forged.length/2,
  priorityLength = 2,
  protocolOffset = forgedLength + priorityLength,
  powLength = 8,
  syncBatchSize = 2000;
  (function powLoopHelper(att, syncAtt) {
    att++;
    syncAtt++;
    for (var i = 0; i < powLength; i++) {
      hashBuffer[protocolOffset+i] = Math.floor(Math.random()*256);
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
function createProtocolData(priority, pow, seed){
  if (typeof seed == "undefined") seed = "";
  if (typeof pow == "undefined") pow = "";
  return priority.toString(16).padStart(4,"0") + 
  pow.padEnd(16, "0") + 
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

function testHashRate(){
  return new Promise(function(resolve, reject){
    var start = new Date().getTime();
    powLoop("cf9a58b66cf42606e46f8d40acef361a3d1bef2bba46d40f852ea518df6c2e1a0000053346", 0, "", function(b, a1){
      powLoop("cf9a58b66cf42606e46f8d40acef361a3d1bef2bba46d40f852ea518df6c2e1a0000053346", 0, "", function(b, a2){
        powLoop("cf9a58b66cf42606e46f8d40acef361a3d1bef2bba46d40f852ea518df6c2e1a0000053346", 0, "", function(b, a3){
          powLoop("cf9a58b66cf42606e46f8d40acef361a3d1bef2bba46d40f852ea518df6c2e1a0000053346", 0, "", function(b, a4){
            powLoop("cf9a58b66cf42606e46f8d40acef361a3d1bef2bba46d40f852ea518df6c2e1a0000053346", 0, "", function(b, a5){
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