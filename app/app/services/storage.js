var Store = require('electron-store');
window.store = new Store();
app.service('Storage', function() {
  var r = {};
  r.loaded = false;
  r.data = false;
  r.settings = {};
  
  r.keys = {};
  r.password = '';
  r.restored = false;
  r.ico = false;
  
  r.load = function(){
    if (!r.loaded){
      r.loadSetting();
      r.loadStore();
      r.loaded = true;
    }
  }
  r.loadStore = function(){
    r.data = window.store.get('bkstore', false);
    return r.data;
  };
  r.setStore = function(v, k, p){
    r.data = v;
    if (typeof k != 'undefined') r.keys = k;
    if (typeof p != 'undefined') r.password = p;
    window.store.set('bkstore', v);
  };
  r.clearStore = function(){
    r.keys = {};
    r.password = '';
    r.restored = false;
    r.ico = false;
    r.data = false;
    var s = r.settings;
    window.store.clear();
    r.setSetting(s);
  };
  r.setSetting = function(v){
    r.settings = v;
    window.store.set('tbsetting', v);
  };
  r.loadSetting = function(){
    r.settings = window.store.get('tbsetting', false);
    return r.settings;
  };
  r.load();
  return r;
});
