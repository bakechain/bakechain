![BakeChain](https://github.com/bakechain/bakechain.github.io/raw/master/assets/img/logo.png)

***Currently in alpha-release stage - please report any bugs, issues and errors here***

Bakechain is a multi-platform, secure light "baker" for the [Tezos protocol](https://www.tezos.com/) and built using [Electron](https://electronjs.org/). Users can participate in the baking process without having to install and maintain a full Tezos-node. Bakechain relies on access to public tezos-nodes via the RPC API, however a user can choose to point the software at their own node if they wish.

Follow [@BakeChain](https://twitter.com/BakeChain) on Twitter to keep up to date with the latest announcements.

**Please note - BakeChain is currently in alpha. We strongly recommend that you do not use your contribution details, or any private keys that you wish to use when the mainnet launches. Please ensure you're using fresh keys with the intention to discard them when Tezos launches.**

## Installing
**Note - currently only available for Windows 7 and above - we are currently working on a macOS and Linux build.**

To install, please select from the options below:

## Documentation

**1) Download and install Bakechain using one of the links above**

**2) Generate a new baker, or restore your existing baker from the CLI tool**

_To export the secret/private key from the tezos-client, you can run the following command:_
```no-highlight
./tezos-client show identity <identity> --show-secret
```
  
**3) If your baker has a low balance, please top it up using the [eztz faucet](https://stephenandrews.github.io/eztz/faucet.html)**

**4) Hit the "Start Baking" button to initiate the baker - you are baking blocks on Tezos!**

### Interface Guide

**Actual Balance**

A bakers actual balance is calculated by taking the current balance, and adding any locked bonds (endorsements and bakes).

**Staking Power**

Your staking power, which determines how frequent you will be baking and endorsing blocks (similar to hash power in POW chains) is made up of the following:
* Your current balance within your baker
* Any bonds currently being held, for both baking and endorsing (**Bake/Endorse Bonds**)
* The stake delegated to you (**Delegated Stake**)

The bakechain software displays all of this information for you, so you can exactly how much staking power you have.

**Capacity**

Based on the constants used for the [Tezos DPoS consensus model](http://doc.tzalpha.net/whitedoc/proof_of_stake.html), approx. 8.25% of all stake should be held in bonds. This means that a baker must have available approx. 8.25% of total staking power for payment of bonds (so within the bakers balance).

For example a baker with 10,000ꜩ can only accept about 110,000ꜩ in Delegated Stake. The capacity figure shows how close a baker is to this maximum.

**Lifetime Stats**

We list all the blocks baked, burnt (missed), steals (blocks that you have baked that weren't priority 1, i.e. blocks you stole from another baker), and endorsements.

We also calculate a "Bake Rate", which shows your relative uptime and availability to bake.

**Rewards**

The last section of the stats shown is for Rewards - you can see current rewards pending, when the next reward payout should occur (if you are owed any), as well as the current level and cycle we are at.

**Bakes**
A list of the past 50 bakes are available in the first tab of the main section. You can view the block online for more details about it.

**Endorsements**
Similar to bakes, this shows all the blocks you have endorsed.

**Rewards**
We list the past 50 rewards that have been paid to your baker from the protocol.

Any other queries or questions? Please reach out to us on Twitter, or add an issue to the github repo.

___Note: due to how rights are calculated for baking, a fresh baking key will not begin to bake blocks for 6-7 cycles (approx. between 15-18 hours, although it could be more depending on the current speed of the network)___

## Source Code
All code will be made open-source during the Beta.

## License
[MIT](https://github.com/bakechain/bakechain/blob/master/LICENSE.md)
