import { createMikser } from "./src/index.js"

async function main() {
    const mikser = await createMikser()
    await mikser.start()
}
main()