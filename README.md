# Novum
Setup (UI):

npm run compile && npm run ui:copy-abi

npx hardhat node → npx hardhat run --network localhost deploy/00_deploy.ts

cp addresses to ui-admin/.env.local

cd ui-admin && npm run dev

Security Note: UI uses MetaMask; no private keys in repo.

Artifacts flow: Hardhat ABI → abi/ → copy to ui-admin/src/abi.