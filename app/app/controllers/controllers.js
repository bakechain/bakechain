app.controller('CreateController', ['$scope', '$location', 'Storage', function($scope, $location, Storage) {
    $scope.newMnemonic = function(){
      $scope.mnemonic = window.eztz.crypto.generateMnemonic();
    }
    $scope.newMnemonic();
    $scope.cancel = function(){
        $location.path('/new');
    };
    $scope.showSeed = function(m){
      var mm = m.split(" ");
      return $sce.trustAsHtml("<span>"+mm.join("</span><span>")+"</span>");
    }
    $scope.create = function(){
        var keys = window.eztz.crypto.generateKeys($scope.mnemonic, $scope.passphrase), 
        identity = {
          raw : keys.sk,
          pkh : keys.pkh,
        }
        Storage.setStore(identity).then(function(){  
          $scope.$apply(function(){
            $location.path('/validate');
          });
        });
    };
}])
app.controller('ValidateController', ['$scope', '$location', 'Storage', '$sce', function($scope, $location, Storage, $sce) {
    var identity = {};
    Storage.loadStore().then(function(ii){
      $scope.$apply(function(){
        identity = ii;
        if (!identity || (!identity.encrypted && !identity.raw)){
           $location.path('/new');
        } else if (!identity.raw){
           $location.path('/unlock');
        }
      });
    });
    $scope.passphrase = '';
    $scope.mnemonic = '';
    $scope.back = function(){
        Storage.clearStore();
        $location.path('/new');
    };
    $scope.validate = function(){
      var keys = window.eztz.crypto.generateKeys($scope.mnemonic, $scope.passphrase);
      if (keys.pkh != identity.pkh) {
        alert("Sorry, those details do not match - please try again, or go back and create a new account again");
      } else {        
        $location.path("/encrypt");
      }
    };
}])
.controller('PasswordController', ['$scope', '$location', 'Storage', function($scope, $location, Storage) {
    var identity = {};
    Storage.loadStore().then(function(ii){
      $scope.$apply(function(){
        identity = ii;
        if (!identity || (!identity.encrypted && !identity.raw)){
           $location.path('/new');
        } else if (!identity.raw){
           $location.path('/unlock');
        }
      });
    });
    $scope.password = '';
    $scope.password2 = '';
    $scope.cancel = function(){
      if (confirm("This will remove your private keys permanently from this devices - are you sure you want to continue?")){
        Storage.clearStore();
        $location.path('/new');
      }
    }
    $scope.save = function(){
        if (!$scope.password || !$scope.password2){
            alert("Please enter your password");
            return;
        }
        if ($scope.password.length < 8){
            alert("Your password is too short");
            return;
        }
        if ($scope.password != $scope.password2){
            alert("Passwords do not match");
            return;
        }
        window.showLoader();
        setTimeout(function(){
          $scope.$apply(function(){
            identity = {
                raw : identity.raw,
                pkh : identity.pkh,
                encrypted : sjcl.encrypt(window.eztz.library.pbkdf2.pbkdf2Sync($scope.password, identity.pkh, 30000, 512, 'sha512').toString(), identity.raw),
            };
            Storage.setStore(identity);
            window.hideLoader();
            $location.path('/main');
          });
        }, 100);
    };
}])
.controller('MainController', ['$scope', '$location', '$http', 'Storage', function($scope, $location, $http, Storage) {
    var identity = {};
    var keys;
    var activated = false;
    var rfi = false;
    var bakerCt = false;
    $scope.pkh = '';
    $scope.pkhex = '';
    Storage.loadStore().then(function(ii){
      $scope.$apply(function(){
        identity = ii;
        if (!identity || (!identity.encrypted && !identity.raw)){
           $location.path('/new');
        } else if (!identity.encrypted && identity.raw){
           $location.path('/password');
        } else if (!identity.raw){
           $location.path('/unlock');
        }
        rfi = setInterval(function(){$scope.refreshBaker(true)}, 30000);
        keys = eztz.crypto.extractKeys(identity.raw);
        $scope.pkh = keys.pkh;
        $scope.pkhex = eztz.utility.b58cdecode(keys.pkh, eztz.prefix.tz1);
        $scope.refreshBaker();
      });
    });
    $scope.explorerUrl = 'http://tzscan.io/';
    $scope.status = 0;
    $scope.statuses = ['loading...', 'low balance', 'ready', 'baking'];
    $scope.isEmpty = false;
    $scope.formatPercent = function(p){
      return (isNaN(p) ? "N/A" : (p*100).toFixed(1)+"%");
    }
    $scope.formatTez = function(n, c, d, t){
      n /= 1000000;
      var c = isNaN(c = Math.abs(c)) ? 3 : c, 
      d = d == undefined ? "." : d, 
      t = t == undefined ? "," : t, 
      s = n < 0 ? "-" : "", 
      i = String(parseInt(n = Math.abs(Number(n) || 0).toFixed(c))), 
      j = (j = i.length) > 3 ? j % 3 : 0;
      return s + (j ? i.substr(0, j) + t : "") + i.substr(j).replace(/(\d{3})(?=\d)/g, "$1" + t) + (c ? d + Math.abs(n - i).toFixed(c).slice(2) : "")+"ꜩ";
    };
    $scope.baker = {
      balance: 0,
      actual: 0,
      frozen: 0,
      delegated: 0,
      staking: 0,
      stakers: 0,
      rolls: 0,
      excess: 0,
      
      bakes: 0,
      misses: 0,
      steals: 0,
      endorsements: 0,
      
      nextReward: 0,
      nextLevel: 0,
      nextBake: 0,
      nextEndorse: 0,
      cycle : 0,
      level : 0,
      
      current : [],
      currentEds : [],
      payouts : [],
    }
    
    $scope.refreshBaker = function(hide){
      if (!hide) window.showLoader();
      var pkh = $scope.pkh;
      var ps = [];
      eztz.rpc.getBalance(pkh).then(function(r){
          $scope.$apply(function(){
          $scope.baker.balance = r;
        });
      }).catch(function(e){
        $scope.$apply(function(){
          $scope.baker.balance = 0;
          $scope.status = 1;
        });
      });
      if (!activated) {
        window.eztz.rpc.registerDelegate(keys, 0).then(function(){
          $scope.isEmpty = false;
        }).catch(
          function(e){
            $scope.$apply(function(e){
            if (e[0].id == 'proto.alpha.implicit.empty_implicit_contract') $scope.isEmpty = true;
          });
        });
      }
      eztz.rpc.call('/chains/main/blocks/head/context/delegates/'+pkh).then(function(r){
        if (r.deactivated) {
          window.eztz.rpc.registerDelegate(keys, 0).then().catch();
        } else {
          activated = true;
        }
        $scope.baker.actual = r.balance;
        $scope.baker.delegated = r.delegated_balance;
        $scope.baker.rewards = r.balance - r.staking_balance + $scope.baker.delegated;
        $scope.baker.frozen = r.frozen_balance - $scope.baker.rewards;
        $scope.baker.staking = r.staking_balance;
        $scope.baker.stakers = r.delegated_contracts.length;
        if ($scope.baker.staking < 10000000000) {
          $scope.status = 1;
          $scope.stopBaker();
        } else if ($scope.status < 2) {
          $scope.status = 2;
        }
        $scope.baker.rolls = Math.floor($scope.baker.staking/10000000000);
        $scope.baker.excess = $scope.baker.staking-($scope.baker.rolls*10000000000);
        if (r.frozen_balance_by_cycle.length > 0){
          $scope.baker.nextReward = r.frozen_balance_by_cycle[0].rewards;
          $scope.baker.nextLevel = ((r.frozen_balance_by_cycle[0].cycle + 6)*4096)+2;          
        } else {
          $scope.baker.nextReward = 0;
          $scope.baker.nextLevel = "N/A";    
        }
      }).catch(function(e){
        if ($scope.status !== 1)
          $scope.status = 0;
      });


      ps.push(eztz.rpc.call('/chains/main/blocks/head/header'))
      ps.push($http.get("http://45.56.84.80:8338/api/stats?baker="+pkh))
      ps.push(eztz.rpc.call('/chains/main/blocks/head/helpers/baking_rights?delegate='+pkh))
      ps.push(eztz.rpc.call('/chains/main/blocks/head/helpers/endorsing_rights?delegate='+pkh))
      ps.push(eztz.rpc.call('/chains/main/blocks/head/helpers/endorsing_rights?delegate='+pkh))
      Promise.all(ps).then(function(values) {
        $scope.$apply(function(){
          $scope.baker.cycle = Math.floor((values[0].level-2)/4096);
          $scope.baker.level = values[0].level;
           
          if (values[1].status == 200){
            $scope.baker.bakes = values[1].data.bakes;
            $scope.baker.misses = values[1].data.misses;
            $scope.baker.steals = values[1].data.steals;
            $scope.baker.endorsements = values[1].data.endorsements;
            
            
            $scope.baker.current = values[1].data.current;
            $scope.baker.currentEds = values[1].data.currentEds;
            $scope.baker.payouts = values[1].data.payouts;
            
            
          }
          
          if (values[2].length > 0){
            $scope.baker.nextBake = values[2][0].level + "/" +values[2][0].priority;
          } else {
            $scope.baker.nextBake = "N/A";
          }
          if (values[3].length > 0){
            $scope.baker.nextEndorse = values[3][0].level;
          } else {
            $scope.baker.nextEndorse = "N/A";
          }
          window.hideLoader();
        });
      }).catch(function(e){
        window.hideLoader();
      });
    };
    
   
    $scope.showPer = function(a,b){
      return (b == 0 ? $scope.formatPercent(0) : $scope.formatPercent(a/b));
    }
    $scope.settings = function(){
        $location.path('/settings');
    }
    $scope.lock = function(){
        clearInterval(rfi);
        rfi = false;
        $scope.stopBaker();
        delete identity.raw;
        keys = false;
        Storage.setStore(identity);
        $location.path('/unlock');
    }
    $scope.copy = function(){
        copyToClipboard($scope.pkh);
        alert("The address has been copied");
    };
    
    $scope.startBaker = function(){
      $scope.status = 3;
      bakerCt = window.runBaker(keys);
    }
    
    $scope.stopBaker = function(){
      if (bakerCt){
        clearInterval(bakerCt);
        bakerCt = false;
      }
      if ($scope.status > 2) {
        $scope.status = 2;
      }
    }
    
    copyToClipboard = function(text) {
      if (window.clipboardData && window.clipboardData.setData) {
          return clipboardData.setData("Text", text); 
      } else if (document.queryCommandSupported && document.queryCommandSupported("copy")) {
          var textarea = document.createElement("textarea");
          textarea.textContent = text;
          textarea.style.position = "fixed";
          document.body.appendChild(textarea);
          textarea.select();
          try {
              return document.execCommand("copy");
          } catch (ex) {
              return false;
          } finally {
              document.body.removeChild(textarea);
          }
      }
    }
}])
.controller('NewController', ['$scope', '$location', 'Storage', function($scope, $location, Storage) {
    var identity = {};
    Storage.loadStore().then(function(ii){
      $scope.$apply(function(){
        identity = ii;
        if (identity && !identity.encrypted && identity.raw){
           $location.path('/validate');
        } else if (identity && identity.encrypted && !identity.raw){
           $location.path('/unlock');
        } else if (identity && identity.encrypted && identity.raw){
           $location.path('/main');
        }
      });
    });
    $scope.restore = function(){
        $location.path('/restore');
    };
    $scope.create = function(){
        $location.path('/create');
    };
}])
.controller('UnlockController', ['$scope', '$location', 'Storage', function($scope, $location, Storage) {
    var identity = {};
    Storage.loadStore().then(function(ii){
      $scope.$apply(function(){
        identity = ii;
        if (!identity || (!identity.encrypted && !identity.raw)){
           $location.path('/new');
        } else if (!identity.encrypted && identity.raw){
           $location.path('/validate');
        } else if (identity.raw){
           $location.path('/main');
        }
      });
    });
    
    
    $scope.clear = function(){
      if (confirm("This will remove your private keys permanently from this devices - are you sure you want to continue?")){
        Storage.clearStore();
        $location.path('/new');
      }
    }
    $scope.unlock = function(){
        if (!$scope.password){
            alert("Please enter your password");
            return;
        }
        if ($scope.password.length < 8){
            alert("Your password is too short");
            return;
        }
        try {
          var raw = sjcl.decrypt(window.eztz.library.pbkdf2.pbkdf2Sync($scope.password, identity.pkh, 30000, 512, 'sha512').toString(), identity.encrypted);
        } catch(err){
          alert("Incorrect password");
          return;
        }
        identity = {
            raw : raw,
            pkh : identity.pkh,
            encrypted : identity.encrypted,
        };
        Storage.setStore(identity);
        $location.path('/main');
    };
}])
.controller('RestoreController', ['$scope', '$location', 'Storage', function($scope, $location, Storage) {
    var identity = {};
    Storage.loadStore().then(function(ii){
      $scope.$apply(function(){
        identity = ii;
        if (identity && !identity.encrypted && identity.raw){
           $location.path('/validate');
        } else if (identity && identity.encrypted && !identity.raw){
           $location.path('/unlock');
        } else if (identity && identity.encrypted && identity.raw){
           $location.path('/main');
        }
      });
    });
    
    $scope.type = 0;
    $scope.seed = "";
    $scope.passphrase = "";
    $scope.privatekey = "";
    $scope.code = "";
    $scope.email = "";
    $scope.password = "";
    $scope.tz1 = "";
    
    $scope.cancel = function(){
        $location.path('/new');
    };
    $scope.restore = function(){
      if ($scope.type === 0){
        if (!$scope.seed) return alert("Please enter your seed words");
        
        try{
          var keys = window.eztz.crypto.generateKeys($scope.seed, $scope.passphrase);
        } catch(e){
          return alert("Please verify your details and try again");
        }
        identity = {
          raw : keys.sk,
          pkh : keys.pkh,
        };
        Storage.setStore(identity);
        $location.path('/password');
        
      } else if ($scope.type === 1){
        if (!$scope.privatekey) return alert("Please enter your private key");
        try{
          var keys = window.eztz.crypto.extractKeys($scope.privatekey);
        }catch(e){
          return alert("Please verify your private key and try again");
        }
        if (keys.sk == $scope.privatekey){
          identity = {
          raw : keys.sk,
          pkh : keys.pkh,
          }
          Storage.setStore(identity);
          $location.path('/password');
        } else {
          return alert("Please verify your private key and try again");
        }
      } else if ($scope.type === 2){
        if (!$scope.seed) return alert("Please enter your seed words");
        if (!$scope.email) return alert("Please enter your fundraiser email");
        if (!$scope.password) return alert("Please enter your fundraiser password");
        
        try{
          var keys = window.eztz.crypto.generateKeys($scope.seed, $scope.email+$scope.password);
        } catch(e){
          return alert("Please verify your details and try again");
        }
        identity = {
          raw : keys.sk,
          pkh : keys.pkh,
        };
        if ($scope.type == 2){
          if ($scope.tz1 != keys.pkh){
            return alert("Your ICO details do not match the address listed - please verify: "+$scope.tz1);
          }
        }
        if ($scope.type == 2 && $scope.code){
          window.showLoader();    
          window.eztz.rpc.activate(keys, $scope.code).then(function(){
            $scope.$apply(function(){
              window.hideLoader();    
              Storage.setStore(identity);          
              $location.path("/password");
            });
          }).catch(function(e){
            $scope.$apply(function(){
              window.hideLoader();    
              alert("Invalid activation for address " + keys.pkh + ". You may want to verify that this address is correct and that you entered the correct information.");
            });
          });
        } else {
          Storage.setStore(identity);          
          $location.path("/password");
        }
      }
    };
}])
;
