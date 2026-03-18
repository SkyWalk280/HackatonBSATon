import { Address } from "@ton/core";

const addr = process.argv[2];
if (!addr) {
    console.error("Usage: npx tsx examples/address-formats.ts <address>");
    process.exit(1);
}

const parsed = Address.parse(addr);

console.log(`\nRaw:                    ${parsed.toRawString()}`);
console.log(`Bounceable (EQ):        ${parsed.toString({ bounceable: true, testOnly: false })}`);
console.log(`Non-bounceable (UQ):    ${parsed.toString({ bounceable: false, testOnly: false })}`);
console.log(`Bounceable testnet (kQ): ${parsed.toString({ bounceable: true, testOnly: true })}`);
console.log(`Non-bounceable testnet (0Q): ${parsed.toString({ bounceable: false, testOnly: true })}`);