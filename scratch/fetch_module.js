async function main() {
  const packageId = '0x6b60d78757019056233b19345a29ecc9a0de4e02e5b51eb0ea7fb9009323fc5f';
  try {
    const res = await fetch('https://fullnode.devnet.sui.io:443', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'sui_getNormalizedMoveModule',
        params: [packageId, 'survey_vault'],
      }),
    });
    console.log('Status:', res.status);
    if (!res.ok) {
      console.log(await res.text());
      return;
    }
    const data = await res.json();
    if (data.error) {
      console.error('RPC Error:', data.error);
      return;
    }
    const claimFn = data.result.exposedFunctions.claim;
    console.log('Claim parameters:');
    console.log(JSON.stringify(claimFn.parameters, null, 2));
  } catch (err) {
    console.error('Fetch error:', err.message);
  }
}
main();
