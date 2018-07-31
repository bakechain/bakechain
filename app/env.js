//DEV ENV

var API_URL = 'http://45.79.105.117:8338/api',
EXPLORER_URL = 'http://zeronet.tzscan.io/',
DEBUGMODE = true,
CONSTANTS = {
  cycle_length : 128,
  commitment : 32,
  block_time : 20,
  threshold : 70368744177663,
};

//Set node
//eztz.node.setDebugMode(true);
eztz.node.setProvider('http://45.56.90.73:3000');