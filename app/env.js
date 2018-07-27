var API_URL = 'http://45.56.84.80:8338/api',
EXPLORER_URL = 'http://tzscan.io/',
CONSTANTS = {
  cycle_length : 4096,
  commitment : 32,
  block_time : 60,
};

//Set node
eztz.node.setProvider('https://rpc.tezrpc.me');
eztz.node.setDebugMode(false);