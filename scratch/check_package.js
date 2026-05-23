const { SuiClient } = require('@mysten/sui/client');

const client = new SuiClient({ url: 'https://fullnode.devnet.sui.io:443' });

async function check(packageId) {
  try {
    const mod = await client.getNormalizedMoveModule({
      package: packageId,
      module: 'survey_vault',
    });
    console.log(`Package ${packageId} - claim parameters:`);
    console.log(JSON.stringify(mod.exposedFunctions.claim.parameters, null, 2));
  } catch (err) {
    console.error(`Error checking ${packageId}:`, err.message);
  }
}

async function main() {
  await check('0x6b60d78757019056233b19345a29ecc9a0de4e02e5b51eb0ea7fb9009323fc5f');
  await check('0x2931cbfe58b831cddb8dae11090c71027e73470ebec7f7dac827958f3ed692a7');
}

main();
