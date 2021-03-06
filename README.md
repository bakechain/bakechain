<img src="https://github.com/bakechain/bakechain.github.io/raw/master/assets/img/logo.png" width="600">

***Currently in beta-release stage - please report any bugs, issues and errors here***

Bakechain is a multi-platform, secure light "baker" for the [Tezos protocol](https://www.tezos.com/) and built using [Electron](https://electronjs.org/). Users can participate in the baking process without having to install and maintain a full Tezos-node. Bakechain relies on access to public tezos-nodes via the RPC API, however a user can choose to point the software at their own node if they wish.

Follow [@BakeChain](https://twitter.com/BakeChain) on Twitter to keep up to date with the latest announcements.

**Please note - Although we have taken many safety precautions, you use this software at your own risk.**

## Installing
**Note - currently only available for Windows and MacOS - we are currently working on a Linux build.**

You can check out our [latest releases](https://github.com/bakechain/bakechain/releases/latest) to download and get started.

Once downloaded, just run - you may be asked to confirm that you want to open and run this file.

## Documentation

<img src="https://github.com/bakechain/bakechain.github.io/raw/master/assets/img/appscreen1.jpg" width="400">

**1) Download and install Bakechain using the instructions above**

**2) After running the software, we recommend that you complete an initial hardware test. This will determine your hardware's ability to bake**

**3) Link your Ledger, generate a new baker, or restore your existing baker. If you are restoring a baker then here are some tips**

_To export the secret/private key from the tezos-client, you can run the following command:_
```no-highlight
./tezos-client show identity <identity> --show-secret
```

**_If you are restoring a Fundraiser/ICO wallet, please enter the following_**

* The seed words from the PDF file
* The email address from the PDF file
* The password used during the ICO/Fundraiser (not on the PDF file)
* The Public Key Hash/Address (tz1)

**_You can also enter the activation code from the KYC/AML process if your account hasn't already been activated_**

**_We recommend the use of a hardware device/Ledger Nano S_**

**4) Top up your baker**

If your baker has a low balance, please top it up. To register as a baker you can't have a 0 balance account, and to begin baking you need at least 10,000XTZ (1 roll) minimum

**5) Hit the "Start Baking" button to initiate the baker**

You will begin baking blocks on Tezos as soon as you gain rights (this could take up to 7 cycles/20 days). In future, you will be able to get listed on the Bakechain Marketplace and earn additional returns as a delegation service.

If you are a genesis baker, you can close the bakechain software and wait until the end of cycle 6 before starting it up again. By that time, we will most likely have an update so check back here.

## Interface Guide

<img src="https://github.com/bakechain/bakechain.github.io/raw/master/assets/img/appscreen.jpg" width="400">

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

___Note: due to how rights are calculated for baking, a fresh baking key will not begin to bake blocks for 6-7 cycle___

## Notes for the beta
We will be releasing update releases throughout the first 7 cycles so please check back before you begin to bake.

## Source Code
All code will be made open-source during the Beta.

## License
[MIT](https://github.com/bakechain/bakechain/blob/master/LICENSE.md)
