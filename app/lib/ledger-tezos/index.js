let Transport = require("@ledgerhq/hw-transport-node-hid").default;
let App = require("./lib/Tezos.js").default;
module.exports = {
	getAddress : async (path) => {
	  const transport = await Transport.create(60 * 1000);
	  const xtz = new App(transport);
	  const result = await xtz.getAddress(path, true);
	  return result;
	},
	authBakingAddress : async (path) => {
	  const transport = await Transport.create(60 * 1000);
	  const xtz = new App(transport);
	  const result = await xtz.getAddress(path, true, 0x00, 0x01);
	  return result;
	},
	sign : async (path, data) => {
	  const transport = await Transport.create(60 * 1000);
	  const xtz = new App(transport);
	  const result = await xtz.signOperation(path, data);
	  return result;
	}
};