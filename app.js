import { setup } from "./index.js"

async function main() {
    const mikser = await setup()
    mikser.start()
}
main()