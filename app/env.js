var VERSION = '3.0.0',
NODE_URL = 'https://mainnet.tezrpc.me',
API_URL = 'https://api4.tzscan.io/v1',
EXPLORER_URL = 'http://tzscan.io/',
DEBUGMODE = false,
BAKECHAIN_POWHEADER = '00bc0303',
CONSTANTS = {
  mempool : 'mempool/pending_operations',
  cycle_length : 4096,
  commitment : 32,
  block_time : 60,
  threshold : 70368744177663,
};
/*
var VERSION = 'zeronet.2.0.0',
NODE_URL = 'https://zeronet.tezrpc.me',
API_URL = 'https://api.zeronet.tzscan.io/v1',
EXPLORER_URL = 'https://zeronet.tzscan.io/',
DEBUGMODE = true,
BAKECHAIN_POWHEADER = '00bc0203',
CONSTANTS = {
  mempool : 'mempool/pending_operations',
  cycle_length : 128,
  commitment : 32,
  block_time : 20,
  threshold : 70368744177663,
};
eztz.node.setDebugMode(true)
eztz.node.setProvider(NODE_URL, true)
//*/
