var VERSION = 'zero7.0.0',
API_URL = 'http://45.79.105.117:8338/api',
EXPLORER_URL = 'http://zeronet.tzscan.io/',
NODE_ADDRESS = 'https://zeronet.simplestaking.com:3000',
DEBUGMODE = true,
CONSTANTS = {
  mempool : 'mempool/pending_operations',
  cycle_length : 128,
  commitment : 32,
  block_time : 20,
  threshold : 70368744177663,
};

//Set node
//eztz.node.setDebugMode(true);
eztz.node.setProvider('https://zeronet.simplestaking.com:3000');