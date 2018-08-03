var head, pendingBlocks = [], badOps = [], endorsedBlocks = [], noncesToReveal = [], lastLevel = 0, bakedBlocks = [], logOutput = function(e){    
  if (typeof window.DEBUGMODE != 'undefined' && window.DEBUGMODE)
    console.log(e);
};
function runBaker(keys){
  run(keys);
  return setInterval(function() { run(keys); }, 1000);
}
function run(keys){
  var nb = [];
  for(var i = 0; i < pendingBlocks.length; i++){
    var bb = pendingBlocks[i];
    if (bb.level <= head.header.level) continue; //prune
    if (dateToTime(getDateNow()) >= dateToTime(bb.timestamp)){
      eztz.node.query('/injection/block?force=true&chain='+bb.chain_id, bb.data).then(function(hash){
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
        bakedBlocks.splice(bakedBlocks.indexOf(bb.level), 1);
        logOutput("-Failed to bake with error");
        logOutput(e);
        console.error("Inject failed", e);
      });
    }
    else nb.push(bb);
  }
  pendingBlocks = nb;
  
  eztz.rpc.getHead().then(function(r){
    head = r;
    if (lastLevel < head.header.level) {
      lastLevel = head.header.level;
      logOutput("-Current level " + head.header.level + " (" + getDateNow() + ")");
    }
    
    if ((head.header.level-1) % window.CONSTANTS.cycle_length === 0) {
      logOutput(noncesToReveal.length + " nonces to reveal...");
      if (noncesToReveal.length > 0){
        //TODO: Lets reveal the nonce now
      }
    }
    
    if (endorsedBlocks.indexOf(head.header.level) < 0){
      eztz.node.query('/chains/'+head.chain_id+'/blocks/'+head.hash+'/helpers/endorsing_rights?level='+head.header.level+"&delegate="+keys.pkh).then(function(rights){
        if (rights.length > 0){
          endorsedBlocks.push(head.header.level);
          endorse(keys, head, rights[0].slots).then(function(r){            
            logOutput("+Endorsed block #" + head.hash + " (" + r + ")");
          }).catch(function(e){
            endorsedBlocks.splice(endorsedBlocks.indexOf(head.header.level), 1);
            logOutput("!Failed to endorse block #" + head.hash);
          });
        }
      });
    }

    //Check for blocks to bake
    if (bakedBlocks.indexOf(head.header.level+1) < 0){
      eztz.node.query('/chains/'+head.chain_id+'/blocks/'+head.hash+'/helpers/baking_rights?level='+(head.header.level+1)+"&delegate="+keys.pkh).then(function(r){
        if (r.length <= 0){
          bakedBlocks.push((head.header.level+1));
          return "Nothing to bake this level";
        } else if (dateToTime(getDateNow()) >= (dateToTime(r[0].estimated_time)-(window.CONSTANTS.block_time/2)) && r[0].level == (head.header.level+1)){
          bakedBlocks.push((head.header.level+1));
          logOutput("-Trying to bake "+r[0].level+"/"+r[0].priority+"... ("+r[0].estimated_time+")");
          return bake(keys, head, r[0].priority, r[0].estimated_time).then(function(r){
            pendingBlocks.push(r);
            return "-Added potential bake for level " + (head.header.level+1);
          }).catch(function(e){
            //TODO: Add retry
            //bakedBlocks.splice(bakedBlocks.indexOf(head.header.level+1), 1);
            return "-Couldn't bake " + (head.header.level+1);
          });
        } else {
          return false
        }
      }).then(function(r){
        if (r) logOutput(r);
        return r;
      }).catch(function(e){
        logOutput("!Error", e);
      });
    }
  })
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
    var signed = eztz.crypto.sign(opbytes, keys.sk, eztz.utility.mergebuf(eztz.watermark.endorsement, eztz.utility.b58cdecode(head.chain_id, eztz.prefix.Net)));
    sopbytes = signed.sbytes;
    var oh = eztz.utility.b58cencode(eztz.library.sodium.crypto_generichash(32, eztz.utility.hex2buf(sopbytes)), eztz.prefix.o);
    opOb.protocol = head.protocol;
    opOb.signature = signed.edsig;
    return eztz.node.query('/chains/'+head.chain_id+'/blocks/'+head.hash+'/helpers/preapply/operations',  [opOb]);
  })
  .then(function(f){
    return eztz.node.query('/injection/operation',sopbytes);
  })
  .then(function(f){
    return f
  }).catch(function(e){logOutput(e)});
}
function bake(keys, head, priority, timestamp){
  var operations = [],
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
  
  return eztz.node.query('/chains/'+head.chain_id+'/mempool').then(function(r){
    logOutput(r);
    var addedOps = [];
    for(var i = 0; i < r.applied.length; i++){
      if (addedOps.indexOf(r.applied[i].hash) <0) {
        if (r.applied[i].branch != head.hash) continue;
        if (badOps.indexOf(r.applied[i].hash) >= 0) continue;
        addedOps.push(r.applied[i].hash);
        operations.push({
          "protocol" : head.protocol,
          "branch" : r.applied[i].branch,
          "contents" : r.applied[i].contents,
          "signature" : r.applied[i].signature,
        });
      }
    }
    operations = [operations,[],[],[]];
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
        console.log(forged);
        powLoop(forged, priority, seed_hex, 0, function(blockbytes, pdd, att){
            var secs = ((new Date().getTime() - start)/1000).toFixed(3);
            logOutput("+POW found in " + att + " attemps (" + secs + " seconds - "+(att/secs)/1000+"Kh/s)");
            signed = eztz.crypto.sign(blockbytes, keys.sk, eztz.utility.mergebuf(eztz.watermark.block, eztz.utility.b58cdecode(head.chain_id, eztz.prefix.Net)));
            sopbytes = signed.sbytes;
            resolve({
              data : sopbytes,
              operations : operations,
            });
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
function powLoop(forged, priority, seed_hex, att, cb){
  var pdd = createProtocolData(priority, eztz.utility.hexNonce(16), seed_hex);
  var blockbytes = forged + pdd;
  att++;
  if (checkHash(blockbytes + "00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000")) {
    cb(blockbytes, pdd, att);
  } else {
    setImmediate(powLoop, forged, priority, seed_hex, att, cb);
  }
}
function createProtocolData(priority, pow, seed){
  if (typeof seed == "undefined") seed = "";
  if (typeof pow == "undefined") pow = "";
  return priority.toString(16).padStart(4,"0") + 
  pow.padEnd(16, "0") + 
  (seed ? "ff" + seed.padEnd(64, "0") : "00") +
  '';
}
function checkHash(hex){
	rr = eztz.library.sodium.crypto_generichash(32, eztz.utility.hex2buf(hex));
	return (stampcheck(rr) <= window.CONSTANTS.threshold);
}
function stampcheck(s){
  var byteArray = s.slice(0, 8).reverse(), value = 0;
  for ( var i = byteArray.length - 1; i >= 0; i--) {
      value = (value * 256) + byteArray[i];
  }
  return value;
}


function dateToTime(dd){return (new Date(dd).getTime()/1000)};
function getDateNow(){return new Date().toISOString().substr(0,19)+"Z"};
