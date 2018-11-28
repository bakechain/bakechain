app
.controller('NewController', ['$scope', '$location', 'Storage', 'SweetAlert', 'Lang', function($scope, $location, Storage, SweetAlert, Lang) {
  $scope.setting = Storage.settings;
  if (!$scope.setting) {
    $scope.setting = {
      rpc : "https://rpc.tezrpc.me",
    };
    Storage.setSetting($scope.setting);
  }
  window.eztz.node.setProvider($scope.setting.rpc);
  $scope.testHash = function(){
    SweetAlert.swal({
      title: "Test your device",
      text: "Before using BakeChain, we recommend that you run a quick test to see if your hardware is good enough to bake with. This will help reduce misses and increase your bake rate - this test can take a few seconds to run and may force your CPU to run a little harder",
      type : "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, run it!",
      closeOnConfirm: true
    },
    function(isConfirm){
      if (isConfirm){
        window.showLoader();
        window.BCBaker.test().then(function(r){
          var rates = [
            ["This is not enough to run BakeChain efficiently.", "error"],
            ["This is a relatively low hash rate, and you are at risk of missing blocks.", "warning"],
            ["This is an OK hash rate, but you may still miss some blocks.", "warning"],
            ["This is a Good hash rate with minimal block misses.", "success"],
            ["This is an Excellent hash rate with minimal block misses.", "success"],
          ];
          var rr = 0;
          if (r < 10) rr = 0;
          else if (r < 30) rr = 1;
          else if (r < 50) rr = 2;
          else if (r < 65) rr = 3;
          else rr = 4;
          SweetAlert.swal({
            title: "Your results",
            text: "Your hardware is computing at a hash rate of " + r.toFixed(3) + "Kh/s. " + rates[rr][0],
            type : rates[rr][1],
          })
          window.hideLoader();
        });
      }
    });
  }
  if (Storage.loaded && typeof Storage.keys.sk != 'undefined'){
    return $location.path('/main');
  } else if (Storage.loaded && typeof Storage.data.ensk != 'undefined'){
    return $location.path('/unlock');
  } else {
    $scope.testHash();
  }
  $scope.restore = function(){
    return $location.path('/restore');
  };
  $scope.link = function(){
    return $location.path('/link');
  };
  $scope.create = function(){
    return $location.path('/create');
  };
}])
.controller('CreateController', ['$scope', '$location', 'Storage', '$sce', function($scope, $location, Storage, $sce) {
  $scope.passphrase = '';
  $scope.mnemonic = '';
  
  $scope.cancel = function(){
    return $location.path('/new');
  };
  $scope.newMnemonic = function(){
    $scope.mnemonic = window.eztz.crypto.generateMnemonic();
  }
  $scope.showSeed = function(m){
    var mm = m.split(" ");
    return $sce.trustAsHtml("<span>"+mm.join("</span><span>")+"</span>");
  }
  $scope.create = function(){
    var keys = window.eztz.crypto.generateKeys($scope.mnemonic, $scope.passphrase);
    var keys = {sk : keys.sk, pk : keys.pk, pkh : keys.pkh, type : "encrypted"};
    var identity = {
      pkh : keys.pkh,
      pk : keys.pk
    };
    Storage.setStore(identity, keys);
    return $location.path("/validate");
  };
  $scope.newMnemonic();
}])
.controller('ValidateController', ['$scope', '$location', 'Storage', 'SweetAlert', 'Lang', function($scope, $location, Storage, Lang) {
  var ss = Storage.data;
  if (Storage.data.ensk && typeof Storage.keys.sk != 'undefined'){
    return $location.path('/main');
  }  else if (Storage.data.ensk){
    return $location.path('/unlock');
  }

  $scope.passphrase = '';
  $scope.mnemonic = '';
  
  $scope.cancel = function(){
    Storage.clearStore();
    return $location.path('/new');
  };  
  $scope.validate = function(){
    var keys = window.eztz.crypto.generateKeys($scope.mnemonic, $scope.passphrase);
    if (keys.pkh != ss.pkh) {
      SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('details_dont_match'), 'error');
    } else {        
      return $location.path("/encrypt");
    }
  };
}])
.controller('MainController', ['$scope', '$location', '$http', 'Storage', 'SweetAlert', 'Lang', function($scope, $location, $http, Storage, SweetAlert, Lang) {
  var identity = Storage.data;
  if (!identity || !identity.ensk || typeof Storage.keys.sk == 'undefined'){
     return $location.path('/new');
  }
  $scope.type = Storage.keys.type;
  var keys = {
    sk : Storage.keys.sk,
    pk : Storage.keys.pk,
    pkh : Storage.keys.pkh,
  };
  //if ($scope.type != "encrypted") keys.sk = false;
  var rfi = false;
  var bakerCt = false;
  
  $scope.pkh = '';
  $scope.pkhex = '';
  $scope.cycleLength = window.CONSTANTS.cycle_length;
  $scope.pkh = keys.pkh;
  $scope.pkhex = eztz.utility.b58cdecode(keys.pkh, eztz.prefix.tz1);
  $scope.explorerUrl = window.EXPLORER_URL;
  $scope.status = 0;
  var authorisedDelegate = false;
  var stakingBalanceEnough = false;
  var registeredDelegate = false;
  var startBaking = true;
  $scope.statuses = ['loading...', 'low balance', 'ready', 'baking'];
  $scope.isEmpty = false;
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
  
  $scope.cycleToLevel = function(l){
    return window.CONSTANTS.cycle_length * l;
  }
  $scope.formatPercent = function(p){
    return (isNaN(p) ? "N/A" : (p*100).toFixed(1)+"%");
  }
  $scope.formatTez = function(n, c, d, t){
    n = window.eztz.utility.totez(n);
    var suf = "ꜩ";
    if (n > 10000000) {
      n /= 1000000;
      suf = "M"+suf;
    } else if (n > 100000) {
      n /= 1000;
      suf = "K"+suf;
    }
    var c = isNaN(c = Math.abs(c)) ? 3 : c, 
    d = d == undefined ? "." : d, 
    t = t == undefined ? "," : t, 
    s = n < 0 ? "-" : "", 
    i = String(parseInt(n = Math.abs(Number(n) || 0).toFixed(c))), 
    j = (j = i.length) > 3 ? j % 3 : 0;
    return s + (j ? i.substr(0, j) + t : "") + i.substr(j).replace(/(\d{3})(?=\d)/g, "$1" + t) + (c ? d + Math.abs(n - i).toFixed(c).slice(2) : "")+" "+suf;
  };
  $scope.bakeStatus = function(i){
    if (i.baker_hash.tz != $scope.pkh) return "burnt";
    if (!i.baked) return "burnt";
    if (i.distance_level < 0) return "burnt";
    if (i.priority > 0) return "steal";
    return "baked";
  }
  var ledgerSign = function(r){
    if ($scope.type == 'encrypted') return;
    var cancelled = false;
    SweetAlert.swal({
      title: '',
      imageUrl: "skin/images/ledger-logo.svg",
      text: "Please confirm that you want to register your delegate to bake",
      showCancelButton: true,
      showConfirmButton: false,
    }, function(c){
      if (!c) {
        window.hideLoader();
        cancelled = true;
        registeredDelegate = false;
      }
    });
    window.tezledger.sign(Storage.keys.sk, "03"+r.opbytes).then(function(rr){
      r.opOb.signature = window.eztz.utility.b58cencode(window.eztz.utility.hex2buf(rr.signature), window.eztz.prefix.edsig);
      return window.eztz.rpc.inject(r.opOb, r.opbytes + rr.signature).then(function(r){
        SweetAlert.swal(Lang.translate('awesome'), "You have been registered to bake", "success");
        window.hideLoader();
      });
    }).catch(function(e){
      window.hideLoader();
      registeredDelegate = false;
      if (!cancelled)
        SweetAlert.swal(Lang.translate('uh_oh'), "There seems to be an error registering as a delegate - try again later", 'error');
    });
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
      });
    });
    eztz.rpc.call('/chains/main/blocks/head/context/delegates/'+pkh).then(function(r){
      if (r.deactivated) {
        window.eztz.rpc.registerDelegate({pk : keys.pk, pkh : keys.pkh, sk : ($scope.type == 'encrypted' ? keys.sk : false)}, 10000).then(ledgerSign);
      } else {
        registeredDelegate = true;
      }
      
      $scope.baker.actual = parseInt(r.balance);
      $scope.baker.delegated = parseInt(r.delegated_balance);
      $scope.baker.rewards = parseInt(r.balance) + parseInt(r.delegated_balance) - parseInt(r.staking_balance);
      $scope.baker.frozen = parseInt(r.frozen_balance) - (parseInt(r.balance) + parseInt(r.delegated_balance) - parseInt(r.staking_balance));
      $scope.baker.staking = parseInt(r.staking_balance);
      $scope.baker.stakers = parseInt(r.delegated_contracts.length);
      if ($scope.baker.staking < 10000000000) {
        stakingBalanceEnough = false;
      } else {
        stakingBalanceEnough = true;
      }
      
      //Status
      if (stakingBalanceEnough && registeredDelegate && startBaking) {
        $scope.status = 3;
        if (!bakerCt) $scope.startBaker();
      } else if (stakingBalanceEnough && registeredDelegate){
        $scope.status = 2;
      } else if (registeredDelegate) {
        $scope.status = 1;
      } else {
        $scope.status = 0;
      }
      
      $scope.baker.rolls = Math.floor($scope.baker.staking/10000000000);
      $scope.baker.excess = $scope.baker.staking-($scope.baker.rolls*10000000000);
      if (r.frozen_balance_by_cycle.length > 0){
        $scope.baker.nextReward = r.frozen_balance_by_cycle[0].rewards;
        $scope.baker.nextLevel = ((r.frozen_balance_by_cycle[0].cycle + 6)*window.CONSTANTS.cycle_length);          
      } else {
        $scope.baker.nextReward = 0;
        $scope.baker.nextLevel = "N/A";    
      }
    }).catch(function(e){
      if (!registeredDelegate){
        window.eztz.rpc.registerDelegate({pk : keys.pk, pkh : keys.pkh, sk : ($scope.type == 'encrypted' ? keys.sk : false)}, 10000).then(function(r){
          registeredDelegate = true;
          ledgerSign(r);
          $scope.isEmpty = false;
        }).catch(
          function(e){
            //Show alert, low balance
            $scope.$apply(function(e){
            if (Array.isArray(e) && e.length && typeof e[0].id != 'undefined' && e[0].id == 'proto.alpha.implicit.empty_implicit_contract') $scope.isEmpty = true;
          });
        });
      }
    });
    
    eztz.rpc.call('/chains/main/blocks/head/header').then(function(r){
      $scope.$apply(function(){
        $scope.baker.cycle = Math.floor((r.level-2)/window.CONSTANTS.cycle_length);
        $scope.baker.level = r.level;
      });
    });
    
    eztz.rpc.call('/chains/main/blocks/head/helpers/baking_rights?delegate='+pkh).then(function(r){
      $scope.$apply(function(){
        if (r.length)
          $scope.baker.nextBake = r[0].level + "/" +r[0].priority;
        else
          $scope.baker.nextBake = "N/A";
      });
    });
    eztz.rpc.call('/chains/main/blocks/head/helpers/endorsing_rights?delegate='+pkh).then(function(r){
      $scope.$apply(function(){
        if (r.length)
          $scope.baker.nextEndorse = r[0].level;
        else
          $scope.baker.nextEndorse = "N/A";
      });
    });
    
    $http.get(window.API_URL+"/total_bakings/"+pkh).then(function(r){
        if (r.status == 200 && r.data.length){
          $scope.baker.bakes = r.data[0].count.count_all;
          $scope.baker.misses = r.data[0].count.count_miss;
          $scope.baker.steals = r.data[0].count.count_steal;
        }
    });
    $http.get(window.API_URL+"/bakings/"+pkh).then(function(r){
        if (r.status == 200 && r.data.length){
          $scope.baker.current = r.data;
        }
    });
    $http.get(window.API_URL+"/total_endorsements/"+pkh).then(function(r){
        if (r.status == 200 && r.data.length){
          $scope.baker.endorsements = r.data[0].slots.count_all;
        }
    });
    $http.get(window.API_URL+"/bakings_endorsement/"+pkh).then(function(r){
        if (r.status == 200 && r.data.length){
          $scope.baker.currentEds = r.data;
        }
    });
    $http.get(window.API_URL+"/rewards_split_cycles/"+pkh).then(function(r){
        if (r.status == 200 && r.data.length){
          $scope.baker.payouts = r.data.slice(5);
        }
    });
    window.hideLoader();
  };
  $scope.showPer = function(a,b){
    return (b == 0 ? $scope.formatPercent(0) : $scope.formatPercent(a/b));
  }
  $scope.settings = function(){
    clearInterval(rfi);
    return $location.path('/setting');
  }
  $scope.lock = function(){
    clearInterval(rfi);
    Storage.keys = {};
    $scope.stopBaker();
    return $location.path('/unlock');
  }
  $scope.copy = function(){
    copyToClipboard($scope.pkh);
    alert("The address has been copied");
  };
  $scope.startBaker = function(){
    startBaking = true;
    $scope.status = 3;
    bakerCt = window.BCBaker.start(keys);
  }
  $scope.stopBaker = function(){
    $scope.status = 2;
    if (bakerCt){
      clearInterval(bakerCt);
      bakerCt = false;
    }
    startBaking = false;
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

  $scope.refreshBaker();
  rfi = setInterval(function(){$scope.refreshBaker(true)}, 30000);
}])
.controller('SettingController', ['$scope', '$location', 'Storage', 'SweetAlert', 'Lang', function($scope, $location, Storage, SweetAlert, Lang) {
    $scope.setting = Storage.settings;
    $scope.type = Storage.keys.type;
    $scope.version = window.VERSION;
    $scope.privateKey = '';
    $scope.password = '';
    
    $scope.save = function(){
      Storage.setSetting($scope.setting);
      window.eztz.node.setProvider($scope.setting.rpc);
      return $location.path('/main');
    }
    
    $scope.show = function(){
      if (!$scope.password) return alert("Please enter your password");
      if ($scope.password == Storage.password) {
        $scope.privateKey = Storage.keys.sk;
      } else {
        alert("Incorrect password");
      }
      $scope.password = '';
    }
}])
.controller('UnlockController', ['$scope', '$location', 'Storage', 'SweetAlert', 'Lang', function($scope, $location, Storage, SweetAlert, Lang) {
  var ss = Storage.data;
  $scope.password = '';
  $scope.clear = function(){
    SweetAlert.swal({
      title: Lang.translate('are_you_sure'),
      text: Lang.translate('clear_tezbox_warning'),
      type : "warning",
      showCancelButton: true,
      confirmButtonText: Lang.translate('yes_clear_it'),
      closeOnConfirm: true
    },
    function(isConfirm){
      if (isConfirm){
        Storage.clearStore();
        return $location.path('/new');
      }
    });
  }
  $scope.unlock = function(){
    if (!$scope.password) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('please_enter_password'), 'error');
    window.showLoader();
    setTimeout(function(){
      $scope.$apply(function(){
        try {
          var sk = sjcl.decrypt(window.eztz.library.pbkdf2.pbkdf2Sync($scope.password, ss.pkh, 30000, 512, 'sha512').toString(), ss.ensk);
          var type = sk.substr(0,4);
					if (type == "edsk") { 
						var c = window.eztz.crypto.extractKeys(sk);			
						c.type = "encrypted";		
          } else {
						var c = {
							pk : ss.pk,
							pkh : ss.pkh,
							sk : sk.substr(4),
						};
						if (type == "ledg"){
							c.type = "ledger";
						} else if (type == "trez"){
							c.type = "trezor";
						} else if (type == "offl"){
							c.type = "offline";
						} else {
							//Legacy
							c.type = "ledger";
							c.sk = sk;
						}
          }
        } catch(err){
          window.hideLoader();
          SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('incorrect_password'), 'error');
          return;
        }
        Storage.keys = c;
        Storage.password = $scope.password;
        return $location.path('/main');
      });
    }, 100);
  };
}])
.controller('EncryptController', ['$scope', '$location', 'Storage', 'SweetAlert', 'Lang', function($scope, $location, Storage, SweetAlert, Lang) {
  var identity =  Storage.data;
  if (typeof Storage.keys.sk == 'undefined') return $location.path('/new');
  $scope.password = '';
  $scope.password2 = '';
  $scope.cancel = function(){
    if (confirm("This will remove your private keys permanently from this devices - are you sure you want to continue?")){
      Storage.clearStore();
      return $location.path('/new');
    }
  }
  $scope.save = function(){
    if (!$scope.password || !$scope.password2) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_enter_password'), 'error');
    if ($scope.password.length < 8) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_password_short'), 'error');
    if ($scope.password != $scope.password2) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_password_dont_match'), 'error');
    var spaces = $scope.password.match(/\s+/g),
    numbers = $scope.password.match(/\d+/g),
    uppers  = $scope.password.match(/[A-Z]/),
    lowers  = $scope.password.match(/[a-z]/),
    special = $scope.password.match(/[!@#$%\^&*\+]/);

    if (spaces !== null) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_password_spaces'), 'error');
    if (uppers === null || lowers === null) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_password_upper_lower'), 'error');
    if (special === null && numbers === null) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_password_special'), 'error');
    window.showLoader();
    setTimeout(function(){
      $scope.$apply(function(){
        identity = {
            pkh : identity.pkh,
            pk : identity.pk,
            ensk : sjcl.encrypt(window.eztz.library.pbkdf2.pbkdf2Sync($scope.password, identity.pkh, 30000, 512, 'sha512').toString(), (Storage.keys.type == "encrypted" ? Storage.keys.sk : Storage.keys.type.substr(0,4) + Storage.keys.sk)),
        };
        Storage.setStore(identity);
        Storage.password = $scope.password;
        window.hideLoader();
        return $location.path('/main');
      });
    }, 100);
  };
}])
.controller('LinkController', ['$scope', '$location', 'Storage', 'SweetAlert', 'Lang', 'SweetAlert', 'Lang', function($scope, $location, Storage, SweetAlert, Lang) {
  $scope.type = 'ledger'; //ledger/trezor/offline
  $scope.address = '';
  $scope.data = "44'/1729'/0'/0'";
  
  $scope.cancel = function(){
      return $location.path('/new');
  };
  $scope.link = function(){

    if ($scope.type == 'ledger' && !$scope.data) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_path_ledger'), 'error');
    if ($scope.type == 'trezor' && !$scope.data) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_path_trezor'), 'error');
    if ($scope.type == 'offline' && !$scope.address) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_offline_address'), 'error');
        
    $scope.text = Lang.translate('linking');
    var cancelled = false;
    if ($scope.type == 'ledger'){
      SweetAlert.swal({
        title: '',
        imageUrl: "skin/images/ledger-logo.svg",
        text: Lang.translate('ledger_verify_address'),
        showCancelButton: true,
        showConfirmButton: false,
      }, function(c){
        if (!c){
          cancelled = true;
          window.hideLoader();              
        }
      });
      window.showLoader();
      var pp = window.tezledger.authBakingAddress($scope.data).then(function(r){
        return window.eztz.utility.b58cencode(window.eztz.utility.hex2buf(r.publicKey.substr(2)), window.eztz.prefix.edpk)
      })
    }
    pp.then(function(pk){
      $scope.$apply(function(){
        address = window.eztz.utility.b58cencode(window.eztz.library.sodium.crypto_generichash(20, window.eztz.utility.b58cdecode(pk, window.eztz.prefix.edpk)), window.eztz.prefix.tz1)
        SweetAlert.swal(Lang.translate('awesome'), Lang.translate('ledger_retreived_address') + ": "+address+"!", "success");
        var identity = {
            pkh : address,
            pk : pk
        };
        Storage.setStore(identity, {
          pk : pk,
          pkh : address,
          sk : $scope.data,
          type : $scope.type
        });   
        window.hideLoader();
        return $location.path("/encrypt");
      });
    }).catch(function(e){
      if (cancelled) return;
      window.hideLoader();
      SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('ledger_error_connect'), 'error');
    });    
  };
}])
.controller('RestoreController', ['$scope', '$location', 'Storage', 'SweetAlert', 'Lang', function($scope, $location, Storage, SweetAlert, Lang) {
  $scope.type = 'ico';
  $scope.seed = '';
  $scope.passphrase = '';
  $scope.private_key = '';
  $scope.encryption_password = '';
  $scope.email = '';
  $scope.ico_password = '';
  $scope.activation_code = '';
  
  $scope.cancel = function(){
      return $location.path('/new');
  };
  $scope.isEdesk = function(){
    return ($scope.private_key.substring(0, 5) == "edesk");
  };
  var restoreEnd = function(keys){
    var keys = {sk : keys.sk, pk : keys.pk, pkh : keys.pkh, type : "encrypted"};
    var identity = {
      pkh : keys.pkh,
      pk : keys.pk
    };
    if ($scope.type == 'ico' && $scope.activation_code){
      window.showLoader(); 
      window.eztz.rpc.activate(keys.pkh, $scope.activation_code).then(function(){
        $scope.$apply(function(){
          window.hideLoader();    
          Storage.setStore(identity, keys);          
          SweetAlert.swal(Lang.translate('awesome'), Lang.translate('activation_successful'), "success");
          Storage.ico = true;
          Storage.restored = true;
          return $location.path("/encrypt");
        });
      }).catch(function(e){
        $scope.$apply(function(){
          window.hideLoader();    
          return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('activation_unsuccessful'), 'error');
        });
      });
    } else {
      Storage.setStore(identity, keys);   
      Storage.restored = true;
      return $location.path("/encrypt");
    }
  }
  $scope.restore = function(){
    if (['seed', 'ico'].indexOf($scope.type) >= 0 && !$scope.seed) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_please_enter_your_seed_words'), 'error');
    if (['seed', 'ico'].indexOf($scope.type) >= 0 && !window.eztz.library.bip39.validateMnemonic($scope.seed)) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_seed_words_not_valid'), 'error');

    if ($scope.type == 'ico' && !$scope.ico_password) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_enter_passphrase'), 'error');
    if ($scope.type == 'ico' && !$scope.email) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_enter_email'), 'error');
    if ($scope.type == 'ico' && !$scope.address) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_enter_address'), 'error');
    if ($scope.type == 'private' && !$scope.private_key) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_enter_private_key'), 'error');
    if ($scope.type == 'private' && $scope.isEdesk() && !$scope.encryption_password) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_enter_encryption_password'), 'error');
    $scope.text = Lang.translate('restoring');
    if ($scope.type == 'seed'){
      var keys = window.eztz.crypto.generateKeys($scope.seed, $scope.passphrase);          
    } else if ($scope.type == 'ico'){
      var keys = window.eztz.crypto.generateKeys($scope.seed, $scope.email + $scope.ico_password);       
      if ($scope.address != keys.pkh) return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_fundraiser_details_dont_mach'), 'error');
    } else if ($scope.type == 'private'){
      if ($scope.isEdesk()){
        return window.eztz.crypto.extractEncryptedKeys($scope.private_key, $scope.encryption_password).then(function(k){
          $scope.$apply(function(){
            restoreEnd(k);
          });
        }).catch(function(e){
          return SweetAlert.swal(Lang.translate('uh_oh'), Lang.translate('error_import_encrypted'), 'error');
        });
      } else {        
        var keys = window.eztz.crypto.extractKeys($scope.private_key);       
      }
    }
    restoreEnd(keys);
  };
}])
;
