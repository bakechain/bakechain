app.service('Storage', function() {
    var r = {};
    r.setStore = function(v){
        return window.keytar.setPassword("bakechain", "tbstore", JSON.stringify(v));
        //localStorage.setItem('tbstore', JSON.stringify(v));
    };
    r.loadStore = function(){
        return new Promise(function(resolve, reject){
          window.keytar.getPassword("bakechain", "tbstore").then(function(r){
            resolve(JSON.parse(r));
          });
        });
        //return JSON.parse(localStorage.getItem('tbstore'));
    };
    r.clearStore = function(){
        return window.keytar.deletePassword("bakechain", "tbstore");
        //localStorage.clear();
    };
    return r;
});
