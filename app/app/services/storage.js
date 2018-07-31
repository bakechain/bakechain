app.service('Storage', function() {
    var r = {};
    
    r.keys = {};
    r.password = '';
    
    r.setStore = function(v, k, p){
      if (typeof k != 'undefined') r.keys = k;
      if (typeof p != 'undefined') r.password = p;
      return window.keytar.setPassword("bakechain", "tbstore", JSON.stringify(v));
        
    };
    r.loadStore = function(){
        return new Promise(function(resolve, reject){
          window.keytar.getPassword("bakechain", "tbstore").then(function(r){
            resolve(JSON.parse(r));
          });
        });
    };
    r.clearStore = function(){
      r.keys = {};
      return window.keytar.deletePassword("bakechain", "tbstore");
    };
    r.setSetting = function(v){
        localStorage.setItem('tbsetting', JSON.stringify(v));
    };
    r.loadSetting = function(){
        return JSON.parse(localStorage.getItem('tbsetting'));
    };
    return r;
});
