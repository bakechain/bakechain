//Constants
var CONSTANTS = {
  cycle_length : 4096,
  max_priority : 16,
};
//Setup
var head, endorsedBlocks = [], noncesToReveal = [], lastLevel = 0, bakedBlocks = [];
//--Functions
function runBaker(keys){
  run(keys);
  return setInterval(function() { run(keys); }, 10000);
}
function run(keys){
  logOutput = function(e){    
    //console.log;
  };
  
  eztz.rpc.getHead().then(function(r){
    head = r;
    if (lastLevel < head.header.level) {
      lastLevel = head.header.level;
      logOutput("-Current level " + head.header.level + " (" + getDateNow() + ")");
    }
    
    //Check for nonce revealations
    if ((head.header.level-1) % CONSTANTS.cycle_length === 0) {
      logOutput(noncesToReveal.length + " nonces to reveal...");
      if (noncesToReveal.length > 0){
        //Lets reveal the nonce now
      }
    }
    
    //Check for endorsements
    if (endorsedBlocks.indexOf(head.hash) < 0){
      eztz.node.query('/chains/'+head.chain_id+'/blocks/'+head.hash+'/helpers/endorsing_rights?level='+head.header.level+"&delegate="+keys.pkh).then(function(rights){
        if (rights.length > 0){
          endorse(keys, head, rights[0].slots).then(function(r){            
            endorsedBlocks.push(head.hash);
            logOutput("+Endorsed block #" + head.hash + " (" + r + ")");
          }).catch(function(e){
            logOutput("!Failed to endorse block #" + head.hash);
          });
        }
      });
    }

    //Check for blocks to bake
    return eztz.node.query('/chains/'+head.chain_id+'/blocks/'+head.hash+'/helpers/baking_rights?level='+(head.header.level+1)+"&delegate="+keys.pkh);
    
  }).then(function(r){
    if (r.length <= 0){
      return "Nothing to bake this level";
    } else {
      if (bakedBlocks.indexOf(r[0].level) < 0){
        if (r[0].level == (head.header.level+1) && dateToTime(getDateNow()) >= dateToTime(r[0].estimated_time)){
          logOutput("-Trying to bake "+r[0].level+"/"+r[0].priority+"... ("+r[0].estimated_time+")");
          return bake(keys, head, r[0].priority, r[0].estimated_time).then(function(r){
            bakedBlocks.push((head.header.level+1));
            if (r.seed){
              noncesToReveal.push(r);
              return "+Injected block #" + r.hash + " at level " + (head.header.level+1) + " with seed " + r.seed;
            } else {
              return "+Injected block #" + r.hash + " at level " + (head.header.level+1) + " with no seed";
            }
          }).catch(function(e){
            return "-Couldn't bake";
          });
        } else {
          if (r[0].priority == 0){              
            return "!Nothing to mine - next available block at " + r[0].level + "/" + r[0].priority + " ("+r[0].estimated_time+")...";
          } else {
            return "!Nothing to mine - next potential (not guaranteed) block at " + r[0].level + "/" + r[0].priority + " ("+r[0].estimated_time+")...";
          }
        }
      }
    }
  }).then(function(r){
    if (r) logOutput(r);
    return r;
  }).catch(function(e){
    logOutput("!Error", e);
  });
}
function forceBake(priority, keys){
  return eztz.rpc.getHead().then(function(r){
    return bake(keys, r, priority, new Date().toISOString().substr(0,19)+"Z");
  });
}
function bake(keys, head, priority, timestamp){
  var protoData, operations = [],
  seed_hex = '',
  nonce_hash = '',
  newLevel = head.header.level+1;
  
  //Check if this is a commitment level
  if ((newLevel-1) % 32 === 0){
    var seed = eztz.utility.hexNonce(32),
    seed_hash = eztz.library.sodium.crypto_generichash(32, eztz.utility.hex2buf(seed));
    nonce_hash = eztz.utility.b58cencode(seed_hash, eztz.prefix.nce);
    seed_hex = eztz.utility.buf2hex(seed_hash);
  }
  
  //Loan up operations from the mempool
  return eztz.node.query('/chains/'+head.chain_id+'/mempool').then(function(r){
    var addedOps = [];
    for(var i = 0; i < r.applied.length; i++){
      if (addedOps.indexOf(r.applied[i].hash) <0) {
        if (r.applied[i].branch != head.hash) continue;
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
    protoData = createProtocolData(priority);
    var header = {
        "protocol_data": {
          protocol : head.protocol,
          priority : priority,
          proof_of_work_nonce : "0000000000000000",
          signature : "edsigtXomBKi5CTRf5cjATJWSyaRvhfYNHqSUGrn4SdbYRcGwQrUGjzEfQDTuqHhuA8b2d8NarZjz8TRf65WkpQmo423BtomS8Q"
        },
        "operations": operations,
    };
    return eztz.node.query('/chains/'+head.chain_id+'/blocks/'+head.hash+'/helpers/preapply/block?sort=true&timestamp='+dateToTime(timestamp), header);
  }).then(function(r){
    logOutput("!Starting POW...");
    return powBake(keys, r.shell_header, priority, seed_hex, head, r.operations);
  }).then(function(r){
    return {
      hash : r,
      level : (head.header.level+1),
      seed : seed_hex
    };
  });
}
function powBake(keys, shell_header, priority, seed_hex, head, operations){
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
      var forged = r.block, blockbytes, signed, sopbytes, look = true, pdd;
      forged = forged.substring(0, forged.length - 22);
      while(look){
        
        pdd = createProtocolData(priority, eztz.utility.buf2hex(eztz.library.sodium.crypto_generichash(8, eztz.utility.hex2buf(eztz.utility.hexNonce(8)))), seed_hex);
        blockbytes = forged + pdd;
        if (checkHash(blockbytes + "00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000")) {
          look = false;
          signed = eztz.crypto.sign(blockbytes, keys.sk, eztz.utility.mergebuf(eztz.watermark.block, eztz.utility.b58cdecode(head.chain_id, eztz.prefix.Net)));
          sopbytes = signed.sbytes;
          var bh = eztz.utility.b58cencode(eztz.library.sodium.crypto_generichash(32, eztz.utility.hex2buf(sopbytes)), eztz.prefix.b);
          shell_header['protocol_data'] = pdd;
          
          
          eztz.node.query('/injection/block?force=true&chain='+head.chain_id, {
            "data": sopbytes,
            "operations": operations
          }).then(resolve);
        }
      }
    });
  });
}
function createProtocolData(priority, pow, seed){
  if (typeof seed == "undefined") seed = "";
  if (typeof pow == "undefined") pow = "";
  return priority.toString(16).padStart(4,"0") + 
  pow.padEnd(16, "0") + 
  (seed ? "01" + seed : "00");
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
function checkHash(hex){
	rr = eztz.library.sodium.crypto_generichash(32, eztz.utility.hex2buf(hex));
	return (rr[0] === 0 && rr[1] === 0 && rr[2] < 64);
}
function dateToTime(dd){return (new Date(dd).getTime()/1000)};
function getDateNow(){return new Date().toISOString().substr(0,19)+"Z"};
